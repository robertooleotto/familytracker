import type { Express, Request, Response } from "express";
import { randomBytes, createHash, createCipheriv, createDecipheriv } from "crypto";
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { JWT_SECRET_VALUE, ENCRYPTION_KEY_BUF } from "../config";

/**
 * Encrypt a sensitive field using AES-256-GCM.
 * Returns a string in format: enc:iv:encrypted:tag (all hex-encoded)
 */
export function encryptField(plain: string): string {
  try {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", ENCRYPTION_KEY_BUF, iv);
    const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `enc:${iv.toString("hex")}:${encrypted.toString("hex")}:${tag.toString("hex")}`;
  } catch (err) {
    console.error("[encryptField] Encryption failed:", (err as Error).message);
    throw new Error("Failed to encrypt sensitive field");
  }
}

/**
 * Decrypt a field encrypted with encryptField.
 * If value doesn't start with "enc:", returns it unchanged (unencrypted).
 */
export function decryptField(value: string): string {
  if (!value.startsWith("enc:")) return value;
  try {
    const [, ivHex, encHex, tagHex] = value.split(":");
    const iv = Buffer.from(ivHex, "hex");
    const encrypted = Buffer.from(encHex, "hex");
    const tag = Buffer.from(tagHex, "hex");
    const decipher = createDecipheriv("aes-256-gcm", ENCRYPTION_KEY_BUF, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
  } catch (err) {
    console.error("[decryptField] Decryption failed — possible key mismatch or data corruption:", (err as Error).message);
    throw new Error("Failed to decrypt sensitive field");
  }
}

/**
 * Remove HTML tags and trim whitespace.
 */
export function sanitize(text: string): string {
  return text.replace(/<[^>]*>/g, "").trim();
}

/**
 * Generate a random uppercase invite code (8 hex characters).
 */
export function generateInviteCode(): string {
  return randomBytes(4).toString("hex").toUpperCase();
}

/**
 * Hash a password using bcrypt with salt rounds 12.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verify a password against its stored hash.
 * Supports legacy SHA-256 hashes and auto-upgrades them to bcrypt on successful login.
 * Returns { ok: true/false, upgradedHash: new bcrypt hash or null }
 */
export async function verifyPassword(
  password: string,
  hash: string,
): Promise<{ ok: boolean; upgradedHash: string | null }> {
  // Fast path: modern bcrypt hash (starts with $2)
  if (hash.startsWith("$2")) {
    const ok = await bcrypt.compare(password, hash);
    return { ok, upgradedHash: null };
  }
  // Legacy path: SHA-256(password + JWT_SECRET_VALUE) — upgrade on success
  const legacyHash = createHash("sha256").update(password + JWT_SECRET_VALUE).digest("hex");
  if (hash === legacyHash) {
    const upgradedHash = await bcrypt.hash(password, 12);
    return { ok: true, upgradedHash };
  }
  return { ok: false, upgradedHash: null };
}

/**
 * Generate a JWT token for a profile.
 * Token expires in 30 days.
 */
export function generateToken(profileId: string, familyId: string): string {
  return jwt.sign({ profileId, familyId }, JWT_SECRET_VALUE, { expiresIn: "30d" });
}

/**
 * Verify and extract payload from a JWT token.
 * Returns { profileId, familyId } or null if invalid/expired.
 */
export function verifyToken(token: string): { profileId: string; familyId: string } | null {
  try {
    return jwt.verify(token, JWT_SECRET_VALUE) as { profileId: string; familyId: string };
  } catch {
    return null;
  }
}

/**
 * Extract and verify bearer token from Authorization header.
 * Returns { profileId, familyId } on success, or null with 401 response sent.
 */
export async function auth(req: Request, res: Response): Promise<{ profileId: string; familyId: string } | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) {
    res.status(401).json({ message: "Unauthorized" });
    return null;
  }
  const payload = verifyToken(h.slice(7));
  if (!payload) {
    res.status(401).json({ message: "Invalid token" });
    return null;
  }
  return payload;
}

/**
 * Sanitize a profile object by removing the passwordHash field.
 * Used to prevent exposing password hashes in API responses.
 */
export function safe(p: any) {
  const { passwordHash, ...rest } = p;
  return rest;
}

/**
 * Rate limiter for auth endpoints: 20 requests per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for AI endpoints: 10 requests per minute.
 */
export const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Rate limiter for general API endpoints: 120 requests per minute.
 */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});
