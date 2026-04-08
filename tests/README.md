# Tests

This folder contains the API and end-to-end tests for FamilyTracker.

## Layout

- `tests/api/` — fast HTTP-level tests using **vitest** + **supertest**.
  They mount the Express app in-process and hit `/api/*` directly. No
  browser, no Vite, no real HTTP server. These run on every PR.
- `tests/e2e/` (planned) — full browser tests via Playwright. Run nightly
  and before each release. Skipped on PRs to keep the loop fast.

## Setup (one-time, on the dev machine and in CI)

```bash
npm install -D vitest@^1.6.0 supertest@^6.3.0 @types/supertest@^6.0.0
```

Add to `package.json`:

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest"
}
```

Then `npm test` runs everything in `tests/api/`.

## Required environment

The API tests need a **separate** Postgres database — never the production
one. The recommended setup is a Supabase **branch** with the same schema.
Set `DATABASE_URL` to the branch connection string in your shell or CI
secrets before running.

For tests that exercise Supabase Auth v2, also set:

```
SUPABASE_AUTH_ENABLED=true
SUPABASE_URL=https://<branch>.supabase.co
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Tests should isolate themselves: each one creates its own family + profile,
runs its assertions, and either rolls back or relies on cascading deletes.
The shared `tests/api/setup.ts` helper exposes `createTestFamily()` and
`cleanupTestFamily()`.

## What to cover first

In priority order:

1. **Auth happy path** — register → login → /me returns the profile.
2. **Auth validation** — empty body, weak password, malformed email all 400.
3. **Rate limiting** — 6 logins from the same IP returns 429.
4. **Family isolation** — family A cannot read family B's expenses (regression
   test for the RLS work in Phase 3, even though RLS is bypassed by the
   backend role; we test the application-level family scoping).
5. **Invite flow** — register → get invite code → join from a second client.
6. **Token refresh** — Supabase v2 session refresh roundtrip.

The first three are stubbed in `tests/api/auth.test.ts`.
