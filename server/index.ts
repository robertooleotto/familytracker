import "dotenv/config"; // carica .env PRIMA di tutto il resto
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { securityHeaders } from "./lib/securityHeaders";
import {
  initSentry,
  sentryRequestHandler,
  sentryErrorHandler,
} from "./lib/sentry";
import { createServer } from "http";

// Initialise Sentry BEFORE the app is built so early import-time errors
// are captured. No-op if SENTRY_DSN isn't set.
void initSentry();

const app = express();
const httpServer = createServer(app);

// Trust the first proxy hop. Required for express-rate-limit and HTTPS
// detection when running behind Railway's edge.
app.set("trust proxy", 1);

// Security headers go FIRST, so they cover every response including errors.
app.use(securityHeaders());

// Sentry scope tagger — attaches route, request_id, and (once auth runs)
// profileId to every error without capturing bodies or cookies.
app.use(sentryRequestHandler());

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    limit: "15mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// ──────────────────────────────────────────────────────────────────────────────
// Health endpoints
// Registered BEFORE the async init block so they always respond, even while
// the database seed / scheduler / websocket setup are still running.
// ──────────────────────────────────────────────────────────────────────────────
const BOOT_TIME = Date.now();
const APP_VERSION = process.env.APP_VERSION || process.env.RAILWAY_GIT_COMMIT_SHA || "unknown";

app.get("/healthz", (_req, res) => {
  res.status(200).json({
    status: "ok",
    uptimeSeconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
    version: APP_VERSION,
    timestamp: new Date().toISOString(),
  });
});

// Deeper readiness check that also pings the database. Use this for serious
// monitors (Better Stack, UptimeRobot) that need to know if the app can
// actually serve user traffic, not just whether the process is alive.
app.get("/readyz", async (_req, res) => {
  try {
    const [{ db }, { sql }] = await Promise.all([
      import("./db"),
      import("drizzle-orm"),
    ]);
    // A trivial SELECT 1 confirms the DB connection pool is healthy.
    await db.execute(sql`select 1`);
    res.status(200).json({ status: "ready", db: "ok" });
  } catch (err) {
    res.status(503).json({
      status: "not_ready",
      db: "error",
      error: err instanceof Error ? err.message : String(err),
    });
  }
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

/** Fields that must never appear in logs, even partially. */
const SENSITIVE_KEYS = new Set([
  "token", "password", "passwordHash", "accessToken", "refreshToken",
  "inviteCode", "fcmToken", "credential", "secret", "apiKey",
  "email", "phone", "locationLatitude", "locationLongitude", "address",
]);

/**
 * Recursively redact sensitive keys from a JSON-serialisable object so that
 * access tokens, passwords, and invite codes never appear in server logs.
 */
function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => redactSensitive(v, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? "[redacted]" : redactSensitive(v, depth + 1);
  }
  return out;
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson as Record<string, unknown>;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(redactSensitive(capturedJsonResponse))}`;
      }
      log(logLine);

      // Slow-request warning. 1s is the point at which a user feels the
      // app is broken. Reporting to Sentry (when configured) gives us a
      // breadcrumb trail of which routes are slow in production.
      const SLOW_MS = Number(process.env.SLOW_REQUEST_MS || "1000");
      if (duration >= SLOW_MS) {
        log(`[slow] ${req.method} ${path} took ${duration}ms (threshold ${SLOW_MS}ms)`);
        // Fire-and-forget Sentry breadcrumb. Lazy import to avoid pulling
        // the SDK into the hot path when it's disabled.
        import("./lib/sentry")
          .then(({ captureException }) => {
            // Not a real exception — just use captureException with a
            // synthetic Error so Sentry groups slow routes together.
            if (duration >= SLOW_MS * 3) {
              captureException(
                new Error(`slow_request ${req.method} ${path} ${duration}ms`),
                { duration, status: res.statusCode },
              );
            }
          })
          .catch(() => {});
      }
    }
  });

  next();
});

(async () => {
  const { seedDatabase } = await import("./seed");
  await seedDatabase();

  const { startScheduler } = await import("./ai/scheduler");
  startScheduler();

  const { setupWebSocket } = await import("./wsServer");
  setupWebSocket(httpServer);

  await registerRoutes(httpServer, app);

  // Sentry error handler must come AFTER routes, BEFORE the final error
  // responder. It forwards the error to Sentry (if configured) then calls
  // next(err) so the existing handler still renders the response.
  app.use(sentryErrorHandler());

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    console.error("Internal Server Error:", err);

    if (res.headersSent) {
      return next(err);
    }

    return res.status(status).json({ message });
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);
  httpServer.listen(port, "0.0.0.0", () => {
    log(`serving on port ${port}`);
  });
})();
