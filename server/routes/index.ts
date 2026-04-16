import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import { authLimiter, strictAuthLimiter, apiLimiter, aiLimiter } from "../lib/routeHelpers";
import { registerAuthRoutes } from "./auth";
import { registerOnboardingRoutes } from "./onboarding";
import { registerFamilyRoutes } from "./family";
import { registerGeofencesRoutes } from "./geofences";
import { registerCalendarRoutes } from "./calendar";
import { registerMessagesRoutes } from "./messages";
import { registerShoppingRoutes } from "./shopping";
import { registerMedicationsRoutes } from "./medications";
import { registerHomeRoutes } from "./home";
import { registerTasksRoutes } from "./tasks";
import { registerBudgetRoutes } from "./budget";
import { registerLifestyleRoutes } from "./lifestyle";
import { registerBankingRoutes } from "./banking";
import { registerElderlyRoutes } from "./elderly";
import { registerAIRoutes } from "./ai";
import { registerSchoolRoutes } from "./school";
import { registerKitchenRoutes } from "./kitchen";
import { registerDocumentsRoutes } from "./documents";
import { registerMiscRoutes } from "./misc";
import { registerGdprRoutes } from "./gdpr";

/**
 * Main route registration orchestrator.
 * Sets up CORS, rate limiting, and delegates to domain-specific route modules.
 */
export async function registerRoutes(
  httpServer: Server,
  app: Express,
): Promise<Server> {
  // ─── CORS + RATE LIMITING ──────────────────────────────────────────────────
  // Only allow origins explicitly listed in ALLOWED_ORIGINS (comma-separated).
  // Falls back to localhost in development; crashes in production if unset.
  const rawOrigins = process.env.ALLOWED_ORIGINS;
  const allowedOrigins: string[] = rawOrigins
    ? rawOrigins
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean)
    : process.env.NODE_ENV === "production"
      ? (() => {
          throw new Error(
            "[config] FATAL: ALLOWED_ORIGINS must be set in production.",
          );
        })()
      : ["http://localhost:5000", "http://localhost:3000"];

  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile native)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        callback(new Error(`CORS: origin '${origin}' is not allowed`));
      },
      credentials: true,
    }),
  );
  // trust proxy is already set in server/index.ts; left here as a safety net.
  app.set("trust proxy", 1);

  // Strict limiter on the highest-risk auth endpoints (5 req/min/IP).
  // Mounted BEFORE the generic authLimiter so both apply: 5/min AND 20/15min.
  app.use("/api/auth/login", strictAuthLimiter);
  app.use("/api/auth/register", strictAuthLimiter);
  app.use("/api/auth/reset-password", strictAuthLimiter);
  app.use("/api/auth/forgot-password", strictAuthLimiter);

  app.use("/api/auth", authLimiter);
  app.use("/api/ai", aiLimiter);
  app.use("/api", apiLimiter);

  // ─── REGISTER ALL DOMAIN-SPECIFIC ROUTES ──────────────────────────────────
  registerAuthRoutes(app);

  // ─── SUPABASE AUTH v2 (FEATURE-FLAGGED) ───────────────────────────────────
  // Mounted only when SUPABASE_AUTH_ENABLED=true and the supabase env vars
  // are present. Loaded via dynamic import so the app boots even if
  // @supabase/supabase-js isn't installed yet (e.g. on a fresh CI clone
  // before npm install runs).
  if (
    process.env.SUPABASE_AUTH_ENABLED === "true" &&
    process.env.SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY
  ) {
    try {
      const { registerSupabaseAuthRoutes } = await import("./auth-supabase");
      registerSupabaseAuthRoutes(app);
      console.log("[routes] Supabase Auth v2 routes mounted at /api/auth/v2/*");
    } catch (err) {
      console.error("[routes] Failed to load Supabase Auth v2 routes:", err);
    }
  }

  registerOnboardingRoutes(app);
  registerFamilyRoutes(app);
  registerGeofencesRoutes(app);
  registerCalendarRoutes(app);
  registerMessagesRoutes(app);
  registerShoppingRoutes(app);
  registerMedicationsRoutes(app);
  registerHomeRoutes(app);
  registerTasksRoutes(app);
  registerBudgetRoutes(app);
  registerLifestyleRoutes(app);
  registerBankingRoutes(app);
  registerElderlyRoutes(app);
  registerAIRoutes(app);
  registerSchoolRoutes(app);
  registerKitchenRoutes(app);
  registerDocumentsRoutes(app);
  registerMiscRoutes(app);
  registerGdprRoutes(app);

  return httpServer;
}
