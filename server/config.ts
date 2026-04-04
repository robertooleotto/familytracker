/**
 * Central security configuration.
 * All secrets come from environment variables — no hardcoded fallbacks survive restarts.
 * Import JWT_SECRET_VALUE and ENCRYPTION_KEY_BUF from here instead of re-reading
 * process.env in every file.
 */

import { randomBytes, scryptSync } from "crypto";

// ── JWT Secret ──────────────────────────────────────────────────────────────

/**
 * Signing secret for JWT tokens.
 * In production, SESSION_SECRET MUST be set or the process will crash on startup.
 * In development, a random per-process value is used so forged tokens from other
 * dev sessions are automatically rejected (and tokens are invalidated on restart).
 */
export const JWT_SECRET_VALUE: string = (() => {
  const val = process.env.SESSION_SECRET;
  if (val) return val;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[config] FATAL: SESSION_SECRET must be set in production. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"",
    );
  }

  const devSecret = randomBytes(48).toString("hex");
  console.warn(
    "[config] WARNING: SESSION_SECRET is not set — using a random per-process secret.\n" +
      "[config]          Tokens will be invalidated on every restart. Set SESSION_SECRET to avoid this.",
  );
  return devSecret;
})();

// ── Encryption Key ──────────────────────────────────────────────────────────

/**
 * 32-byte AES-256-GCM key for encrypting sensitive fields (school passwords, bank tokens).
 * Derived via scrypt from ENCRYPTION_KEY env var so even short passphrases produce a
 * full-entropy 32-byte key.
 *
 * In production, ENCRYPTION_KEY MUST be set or the process will crash on startup.
 * In development, a random per-process key is used (encrypted data won't survive restarts).
 */
export const ENCRYPTION_KEY_BUF: Buffer = (() => {
  const raw = process.env.ENCRYPTION_KEY;
  if (raw) {
    // scrypt: proper key derivation — short passphrases become full-entropy 32-byte keys
    return scryptSync(raw, "familytracker-enc-v1", 32);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[config] FATAL: ENCRYPTION_KEY must be set in production. " +
        "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
    );
  }

  console.warn(
    "[config] WARNING: ENCRYPTION_KEY is not set — using a random per-process key.\n" +
      "[config]          Encrypted fields will be unreadable after restart. Set ENCRYPTION_KEY to avoid this.",
  );
  return randomBytes(32);
})();
