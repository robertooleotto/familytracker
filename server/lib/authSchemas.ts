/**
 * Centralised Zod schemas for the auth surface.
 *
 * Used by both the legacy /api/auth/* routes and the new /api/auth/v2/*
 * routes so the validation rules stay in lockstep. If you change a rule
 * here, both flows pick it up.
 */
import { z } from "zod";

// Used everywhere a free-form name is expected. Strict enough to reject
// obvious garbage (control chars, leading/trailing whitespace) without
// being so strict that real-world names with apostrophes or accents fail.
const nameField = z
  .string()
  .trim()
  .min(1, "Required")
  .max(80, "Too long")
  .regex(/^[^\u0000-\u001F\u007F]+$/, "Invalid characters");

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .max(254, "Email too long");

// Minimum 8 chars, must contain at least one letter and one digit. Avoid
// requiring symbols (slows down children's onboarding) but reject anything
// trivially guessable. Length cap stops absurd 100k char DoS attempts.
const passwordField = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(200, "Password too long")
  .refine((s) => /[A-Za-z]/.test(s), "Password must contain a letter")
  .refine((s) => /\d/.test(s), "Password must contain a digit");

const colorField = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/, "Color must be a #RRGGBB hex string")
  .optional();

const roleField = z.enum(["parent", "child", "guardian", "elderly"]).optional();

// 6-character invite code, alphanumeric, case-insensitive on input.
const inviteCodeField = z
  .string()
  .trim()
  .min(4, "Invite code too short")
  .max(12, "Invite code too long")
  .regex(/^[A-Za-z0-9]+$/, "Invite code must be alphanumeric");

export const registerSchema = z.object({
  firstName: nameField,
  lastName: nameField,
  email: emailField,
  password: passwordField,
  familyName: z.string().trim().min(1).max(100),
  role: roleField,
  colorHex: colorField,
});

export const loginSchema = z.object({
  // Login accepts either email or username, so we don't enforce email format.
  email: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(200),
});

export const joinSchema = z.object({
  firstName: nameField,
  lastName: nameField,
  // Email is optional for children joining a family without their own address.
  email: emailField.optional().or(z.literal("").transform(() => undefined)),
  password: passwordField,
  inviteCode: inviteCodeField,
  role: roleField,
  colorHex: colorField,
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type JoinInput = z.infer<typeof joinSchema>;
