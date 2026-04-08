/**
 * Sentry integration — lazy and opt-in.
 *
 * If SENTRY_DSN is not set, this module is a no-op. That way dev machines,
 * CI, and self-hosters who don't want Sentry keep working without surprises.
 *
 * Call `initSentry()` as the FIRST thing in server/index.ts (before any
 * other imports that might throw), then mount `sentryRequestHandler()` as
 * the first middleware and `sentryErrorHandler()` as one of the last.
 *
 * We only capture errors + request metadata. We explicitly disable:
 *   - Request bodies (could contain passwords, medical info, child data)
 *   - Cookies (session tokens)
 *   - IP addresses (GDPR)
 * Everything in those buckets is PII under our privacy model.
 */
import type { Request, Response, NextFunction } from "express";

let sentryModule: typeof import("@sentry/node") | null = null;
let initialized = false;

/**
 * Initialise Sentry if SENTRY_DSN is set. Safe to call multiple times;
 * subsequent calls are no-ops.
 */
export async function initSentry(): Promise<void> {
  if (initialized) return;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) {
    console.log("[sentry] SENTRY_DSN not set — error reporting disabled");
    initialized = true;
    return;
  }

  try {
    sentryModule = await import("@sentry/node");
    sentryModule.init({
      dsn,
      environment: process.env.NODE_ENV || "development",
      release:
        process.env.APP_VERSION ||
        process.env.RAILWAY_GIT_COMMIT_SHA ||
        undefined,

      // Sampling
      tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 0,
      // We don't use profiling yet; keep it off.
      profilesSampleRate: 0,

      // Privacy: strip everything that could contain user data.
      sendDefaultPii: false,
      beforeSend(event) {
        if (event.request) {
          delete event.request.data;
          delete event.request.cookies;
          delete (event.request as any).headers?.authorization;
          delete (event.request as any).headers?.cookie;
        }
        // Scrub user.ip_address which Sentry adds by default.
        if (event.user) {
          delete event.user.ip_address;
        }
        return event;
      },
    });
    initialized = true;
    console.log("[sentry] initialised");
  } catch (err) {
    console.error("[sentry] failed to initialise:", err);
    initialized = true; // don't retry on every call
  }
}

/**
 * Report an exception manually. Safe to call even if Sentry isn't
 * initialised — falls back to console.error.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  if (sentryModule) {
    sentryModule.captureException(err, context ? { extra: context } : undefined);
  } else {
    console.error("[error]", err, context ?? "");
  }
}

/**
 * Express middleware: tag each request with a scope so errors get a
 * request_id, route, and profileId (if authenticated) attached.
 *
 * This is intentionally hand-rolled instead of `Sentry.Handlers.requestHandler`
 * because the v8 API changed and we want full control over what's attached.
 */
export function sentryRequestHandler() {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!sentryModule) return next();
    sentryModule.withScope((scope) => {
      scope.setTag("route", `${req.method} ${req.path}`);
      const rid = req.headers["x-request-id"];
      if (rid) scope.setTag("request_id", String(rid));
      // req.user or req.auth may be populated later by auth middleware;
      // we add a lazy getter so late-bound info still lands on errors.
      scope.addEventProcessor((event) => {
        const auth = (req as any).auth || (req as any).user;
        if (auth?.profileId) {
          event.user = { id: auth.profileId };
        }
        return event;
      });
      next();
    });
  };
}

/**
 * Express error handler: must be mounted AFTER all routes. Forwards the
 * error to Sentry (if configured) and then calls next so the existing
 * error handler still renders the response.
 */
export function sentryErrorHandler() {
  return (err: any, _req: Request, _res: Response, next: NextFunction) => {
    if (sentryModule && err) {
      sentryModule.captureException(err);
    }
    next(err);
  };
}
