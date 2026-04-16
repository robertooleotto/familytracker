/**
 * Lightweight security headers middleware. This is a hand-rolled subset of
 * `helmet` so we don't need an extra dependency yet, and so the policy is
 * fully visible in source instead of buried in defaults.
 *
 * When we add helmet in Phase 4, this file becomes the single place to
 * compare against helmet's defaults and decide what to override.
 *
 * Mount this BEFORE any route in `server/index.ts`:
 *
 *   import { securityHeaders } from "./lib/securityHeaders";
 *   app.use(securityHeaders());
 */
import type { Request, Response, NextFunction } from "express";

export interface SecurityHeadersOptions {
  /**
   * If true, sets a strict Content-Security-Policy. Off by default because
   * the Vite dev server needs `unsafe-eval` and inline scripts. Enable in
   * production builds only, and tighten the directives as the frontend grows.
   */
  enableCSP?: boolean;
  /**
   * Extra origins allowed in the CSP `connect-src` directive. Useful for
   * Sentry, Supabase, FCM, analytics.
   */
  cspConnectSrc?: string[];
  /**
   * Override the default Permissions-Policy. The default disables
   * everything except geolocation (which the app actively uses).
   */
  permissionsPolicy?: string;
}

const DEFAULT_PERMISSIONS_POLICY = [
  "accelerometer=()",
  "ambient-light-sensor=()",
  "autoplay=()",
  "battery=()",
  "camera=(self)",
  "display-capture=()",
  "document-domain=()",
  "encrypted-media=()",
  "fullscreen=(self)",
  "geolocation=(self)",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "midi=()",
  "payment=()",
  "picture-in-picture=()",
  "publickey-credentials-get=()",
  "screen-wake-lock=()",
  "sync-xhr=()",
  "usb=()",
  "xr-spatial-tracking=()",
].join(", ");

export function securityHeaders(options: SecurityHeadersOptions = {}) {
  const isProd = process.env.NODE_ENV === "production";
  const enableCSP = options.enableCSP ?? isProd;

  const connectSrc = ["'self'", ...(options.cspConnectSrc ?? [])];
  // Sensible defaults for FamilyTracker.
  if (process.env.SUPABASE_URL) connectSrc.push(process.env.SUPABASE_URL);
  if (process.env.SENTRY_DSN) {
    try {
      const u = new URL(process.env.SENTRY_DSN);
      connectSrc.push(`https://${u.host}`);
    } catch {
      /* ignore malformed DSN */
    }
  }
  // Allow WebSocket connections back to ourselves (for the wsServer).
  connectSrc.push("ws:", "wss:");

  const csp = [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https:",
    "style-src 'self' 'unsafe-inline'", // Tailwind generates inline styles.
    "script-src 'self'",
    `connect-src ${connectSrc.join(" ")}`,
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; ");

  const permissionsPolicy = options.permissionsPolicy ?? DEFAULT_PERMISSIONS_POLICY;

  return function securityHeadersMiddleware(_req: Request, res: Response, next: NextFunction) {
    // Always-on headers, cheap to set.
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Permissions-Policy", permissionsPolicy);

    if (isProd) {
      // 1 year, include subdomains, allow preload list submission.
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains; preload");
    }

    if (enableCSP) {
      res.setHeader("Content-Security-Policy", csp);
    }

    next();
  };
}
