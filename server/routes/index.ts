import type { Express } from "express";
import { createServer, type Server } from "http";
import cors from "cors";
import { authLimiter, apiLimiter, aiLimiter } from "../lib/routeHelpers";
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
  app.set("trust proxy", 1);
  app.use("/api/auth", authLimiter);
  app.use("/api/ai", aiLimiter);
  app.use("/api", apiLimiter);

  // ─── REGISTER ALL DOMAIN-SPECIFIC ROUTES ──────────────────────────────────
  registerAuthRoutes(app);
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

  return httpServer;
}
