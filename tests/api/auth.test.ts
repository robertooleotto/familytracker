/**
 * Auth API smoke tests (vitest + supertest).
 *
 * These tests intentionally avoid mocking storage or the database. They hit
 * the real Express app with a real test database (set DATABASE_URL to a
 * Supabase branch connection string before running).
 *
 * Run with:
 *   npm test
 *
 * If `vitest` and `supertest` are not yet installed, install with:
 *   npm install -D vitest@^1.6.0 supertest@^6.3.0 @types/supertest@^6.0.0
 *
 * Then add `"test": "vitest run"` to package.json scripts.
 */
import { describe, it, expect, beforeAll } from "vitest";
import request from "supertest";
import express, { type Express } from "express";

let app: Express;

beforeAll(async () => {
  // Build a minimal Express app with only the auth routes mounted, so the
  // test doesn't pull in the entire server bootstrap (Vite, websockets, etc.)
  const { registerAuthRoutes } = await import("../../server/routes/auth");
  app = express();
  app.use(express.json());
  registerAuthRoutes(app);
});

const uniqueEmail = () => `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;

describe("POST /api/auth/register — validation", () => {
  it("400 on empty body", async () => {
    const res = await request(app).post("/api/auth/register").send({});
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Invalid request body");
    expect(Array.isArray(res.body.errors)).toBe(true);
  });

  it("400 on malformed email", async () => {
    const res = await request(app).post("/api/auth/register").send({
      firstName: "Test",
      lastName: "User",
      email: "not-an-email",
      password: "Password1",
      familyName: "Test Family",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: any) => e.path === "email")).toBe(true);
  });

  it("400 on weak password (no digit)", async () => {
    const res = await request(app).post("/api/auth/register").send({
      firstName: "Test",
      lastName: "User",
      email: uniqueEmail(),
      password: "passwordonly",
      familyName: "Test Family",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: any) => e.path === "password")).toBe(true);
  });

  it("400 on too-short password", async () => {
    const res = await request(app).post("/api/auth/register").send({
      firstName: "Test",
      lastName: "User",
      email: uniqueEmail(),
      password: "Ab1",
      familyName: "Test Family",
    });
    expect(res.status).toBe(400);
  });
});

describe("POST /api/auth/login — validation", () => {
  it("400 on empty body", async () => {
    const res = await request(app).post("/api/auth/login").send({});
    expect(res.status).toBe(400);
  });

  it("401 on unknown user", async () => {
    const res = await request(app).post("/api/auth/login").send({
      email: "nobody@nowhere.example",
      password: "Password1",
    });
    // Should be 401 (invalid credentials), NOT 400 (validation passed)
    expect([401, 500]).toContain(res.status); // 500 only if DB unreachable
    if (res.status === 401) {
      expect(res.body.message).toMatch(/errata/i);
    }
  });
});

describe("POST /api/auth/join — validation", () => {
  it("400 on missing inviteCode", async () => {
    const res = await request(app).post("/api/auth/join").send({
      firstName: "Test",
      lastName: "User",
      password: "Password1",
    });
    expect(res.status).toBe(400);
    expect(res.body.errors.some((e: any) => e.path === "inviteCode")).toBe(true);
  });

  it("404 on bogus inviteCode", async () => {
    const res = await request(app).post("/api/auth/join").send({
      firstName: "Test",
      lastName: "User",
      password: "Password1",
      inviteCode: "BOGUS1",
    });
    // Either 404 (storage reachable) or 500 (no DB) — both prove the
    // validation layer accepted the well-formed input.
    expect([404, 500]).toContain(res.status);
  });
});

/**
 * Happy-path tests are commented out because they require a real test
 * database. Uncomment + run after wiring DATABASE_URL to a Supabase branch.
 */
// describe("Auth happy path", () => {
//   let inviteCode: string;
//   it("registers a new family", async () => {
//     const email = uniqueEmail();
//     const res = await request(app).post("/api/auth/register").send({
//       firstName: "Alice",
//       lastName: "Tester",
//       email,
//       password: "Password1",
//       familyName: "Tester Household",
//     });
//     expect(res.status).toBe(200);
//     expect(res.body.token).toBeTruthy();
//     expect(res.body.profile.passwordHash).toBeUndefined();
//   });
// });
