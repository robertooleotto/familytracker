# FamilyTracker — Pre-Launch Roadmap

> Last updated: 2026-04-07
>
> Goal: take FamilyTracker from "works on my machine" to "ready for thousands
> of real families" without rewriting the codebase. Each phase is small,
> self-contained, and ordered so that finishing it leaves the project in a
> better state than before, even if the next phase slips.

---

## North star principles

1. **No big bang.** Every change is a small, reversible step. We never have a
   week-long branch that touches everything.
2. **Default to safety.** When in doubt about user data, choose the option
   that exposes less.
3. **Automate the boring guards.** Humans forget things. CI doesn't.
4. **Ship the riskiest thing first.** Auth and security cannot be afterthoughts.
5. **Measure before tuning.** Sentry and metrics go in before the perf work.

---

## Phase 0 — What is already done ✅

All items completed on 2026-04-07 during the initial QA pass and the
follow-up cleanup.

### Database
- ✅ Drizzle schema (`shared/schema.ts`) realigned with the production
  database for `ai_conversations` and `ai_messages`. Bloccante critico
  rimosso (insert AI chat senza `status` non crasha più).
- ✅ Migration `0002_align_ai_conversations_with_drizzle.sql` **applied
  to production**.
- ✅ Migration `0003_supabase_auth_link.sql` **applied to production**:
  added nullable `profiles.auth_user_id` column with FK to `auth.users`,
  unique partial index, and the helper functions `current_family_id()` and
  `is_in_family(varchar)`. Inert until backend starts using Supabase Auth
  in Phase 2 — zero behaviour change today.
- ⏳ Migration `0004_rls_policies.sql` written but **not yet applied** —
  it waits for Phase 2 (Supabase Auth migration), otherwise `auth.uid()`
  would be NULL and policies would block everything for non-superuser
  connections.

### Backend code
- ✅ `/healthz` and `/readyz` endpoints in `server/index.ts`, mounted
  before the heavy init block so they respond during boot.
- ✅ `securityHeaders()` middleware (`server/lib/securityHeaders.ts`)
  mounted as the first thing in the request pipeline. Sets X-Content-Type-
  Options, X-Frame-Options, Referrer-Policy, COOP/CORP, Permissions-Policy
  (camera/geolocation only), HSTS in production, and a strict CSP in
  production with allowlisted Supabase + Sentry connect-src.
- ✅ `validate.ts` middleware (`server/lib/validate.ts`) for Zod-based
  body/params/query validation. Provides `validateBody`, `validateParams`,
  `validateQuery`, and a combined `validate({ body, params, query })`.
  Drop-in for any new route. Existing routes will be migrated in Phase 4.1.
- ✅ `strictAuthLimiter` (5 req/min/IP) added in `routeHelpers.ts` and
  mounted on `/api/auth/login`, `/api/auth/register`,
  `/api/auth/reset-password`, `/api/auth/forgot-password`. The generic
  `authLimiter` (20/15min) still applies on top — defence in depth.
- ✅ `app.set("trust proxy", 1)` set in `server/index.ts` (in addition to
  the existing one in `routes/index.ts`) so rate limiting and HTTPS
  detection work correctly behind Railway's edge.

### Repository hygiene
- ✅ GitHub Actions CI workflow at `.github/workflows/ci.yml` (typecheck +
  Drizzle drift check + production build, with E2E job scaffolded).
- ✅ `.github/PULL_REQUEST_TEMPLATE.md` and issue templates
  (bug_report.md, feature_request.md).
- ✅ `CONTRIBUTING.md` with the golden rules.
- ✅ `.env.example` documenting every env var the app reads.
- ✅ Hardened `.gitignore` (covers all `.env` variants, `secrets.json`,
  `*.pem`, `service-account*.json`, `push-to-github.*`, Cowork worktrees,
  test artifacts, local DB dumps).
- ✅ Deleted the `server/Completo tutti/` folder (~5000 lines of dead
  duplicate code, including a stale `schema.ts` that was causing drift).
- ✅ Deleted the stale `DATABASE_URL.env` (pointed at an abandoned Neon
  database) and `push-to-github.ps1`. **Action required from you**:
  the `.ps1` script contained a hardcoded GitHub Personal Access Token
  (`ghp_QHez6...`) — even though the file was gitignored, **revoke that
  token immediately** at <https://github.com/settings/tokens>.

### Documentation
- ✅ `QA_FIX_REPORT_2026-04-07.md` describing the original schema fix.
- ✅ This `ROADMAP.md`.

---

## Phase 1 — Repository hygiene & CI activation (Week 1)

The goal of this phase is "the project never silently rots again". It is
mostly mechanical work and gives the highest return per minute spent.

### 1.1 Activate the CI on GitHub
- [ ] Push the new files to GitHub.
- [ ] In GitHub repo settings, create a secret `DATABASE_URL_CI` pointing at a
      **non-production** Supabase branch (or a free Neon DB) — never the
      production URL.
- [ ] Open Settings → Branches → add a branch protection rule for `main`:
      require PR, require status check `Typecheck · Schema · Build`, require
      branches to be up to date, disallow force pushes.
- [ ] Open a dummy PR to verify the workflow runs green.

### 1.2 Clean up worktrees and duplicate schemas
- [ ] On the local machine: `git worktree list`.
- [ ] For each worktree under `.claude/worktrees/`, diff against `main`:
      `git -C .claude/worktrees/<name> diff main -- shared/ migrations/ server/`.
      Cherry-pick anything useful into a normal branch.
- [ ] Remove the worktrees: `git worktree remove .claude/worktrees/<name>`.
- [ ] Delete `server/Completo tutti/schema.ts` if it is dead code (it appears
      to be a leftover copy).
- [ ] After cleanup, only `shared/schema.ts` should remain as the single
      source of truth.

### 1.3 Secret hygiene
- [ ] Remove `DATABASE_URL.env` from the repo. Add it to `.gitignore`.
- [ ] Rotate the database password since the file lived in version control.
- [ ] Verify no other secrets are committed: `git log -p | grep -iE
      "(api_key|secret|password|token)"` and audit suspicious matches.
- [ ] Add a pre-commit hook (or use `gitleaks`) so this cannot happen again.

### 1.4 Observability foundation
- [ ] Sign up for Sentry (free plan). Add `@sentry/node` to the backend and
      `@sentry/react` to the client. Initialise both with the DSN from
      `SENTRY_DSN` env var.
- [ ] Wire Sentry into the Express error middleware in `server/index.ts`.
- [ ] Sign up for Better Stack (or UptimeRobot). Add an HTTP monitor
      pointing at `https://<your-domain>/healthz` every 60s and another
      pointing at `/readyz` every 5 minutes.
- [ ] Test the alerting: take the app down on staging, confirm you get the
      email/Slack ping within 2 minutes.

**Exit criteria for Phase 1**: a broken commit cannot reach production. You
get paged when production goes down. The repo has one source of truth per
file.

---

## Phase 2 — Migrate to Supabase Auth (Weeks 2–3)

> **Status:** Backend infrastructure complete (2026-04-07). Cutover deferred
> to Phase 8 after end-to-end smoke tests on a real account.

This is the single biggest architectural change before launch and the only
"riscrittura" worth doing. Everything in Phase 3 depends on it.

### 2.0 What was shipped on 2026-04-07
- ✅ `@supabase/supabase-js` added to `package.json` (run `npm install` to pick up).
- ✅ `server/auth/supabase.ts` — lazy admin client wrapper with
      `getSupabaseAdmin()` and `verifySupabaseAccessToken()`. Both fail
      gracefully if env vars are missing so boot is never blocked.
- ✅ `server/auth/middleware.ts` — `requireSupabaseAuth` Express middleware
      that verifies the Supabase JWT and attaches `{profileId, familyId,
      authUserId, profile}` to `req.auth`.
- ✅ `server/routes/auth-supabase.ts` — v2 endpoints:
      `POST /api/auth/v2/register`, `/v2/join`, `/v2/sync`, `GET /v2/me`.
      Mounted only when `SUPABASE_AUTH_ENABLED=true` AND the two Supabase
      env vars are present. Loaded via dynamic import in `server/routes/index.ts`
      so the app boots even on a fresh clone before `npm install`.
- ✅ `shared/schema.ts` updated with `profiles.authUserId` (nullable varchar).
- ✅ `server/storage.ts` gained `getProfileByAuthUserId(id)`.
- ✅ `script/migrate-users-to-supabase-auth.ts` — idempotent backfill script
      with dry-run mode, batched 25-at-a-time, full audit log to
      `backfill-supabase-auth.log`.
- ✅ `FRONTEND_AUTH_MIGRATION.md` — full client-side migration guide
      (install, login, register, join, logout, auth listener, rollback).
- ✅ `.env.example` updated with `SUPABASE_AUTH_ENABLED`, `VITE_SUPABASE_URL`,
      `VITE_SUPABASE_ANON_KEY`.

### 2.0.1 What's left before flipping the flag
- [ ] `npm install` in CI and on the deploy environment.
- [ ] Frontend implementation of `FRONTEND_AUTH_MIGRATION.md`.
- [ ] Manual smoke test: register → logout → login → /api/auth/v2/me
      against a non-prod Supabase project.
- [ ] Run backfill against a DB *snapshot*, verify counts, then run against
      production with `--apply --send-reset`.
- [ ] Monitor `/api/auth/v2/me` 401 rate for a week.


### 2.1 Why
The current auth (`username` + `password_hash` + passport-local + JWT) works
but is a dead end:
- `auth.uid()` is always NULL → real RLS is impossible.
- Password reset, magic links, OAuth, MFA — all DIY.
- GDPR data-subject-access requests are harder because identity lives in two
  places.
- The `service_role` key is the only thing standing between an attacker and
  the entire database.

### 2.2 Database changes
- [ ] Apply `migrations/0003_supabase_auth_link.sql` to a Supabase **branch**
      (not production yet). It adds `profiles.auth_user_id` and the helper
      functions `current_family_id()` and `is_in_family()`.
- [ ] Verify with `\d profiles` that the column exists and is nullable.

### 2.3 Backend changes
- [ ] Add `@supabase/supabase-js` to dependencies.
- [ ] Create `server/auth/supabase.ts` exporting a server-side admin client
      built with `SUPABASE_SERVICE_ROLE_KEY`.
- [ ] Add a new signup route `POST /api/auth/signup` that:
      1. Calls `supabaseAdmin.auth.admin.createUser({ email, password })`.
      2. Inserts a `profiles` row with `auth_user_id` set to the new user id.
      3. Returns a Supabase access token (JWT) the frontend stores.
- [ ] Add a new login route `POST /api/auth/login` that calls
      `supabase.auth.signInWithPassword()` and returns the session.
- [ ] Replace the existing JWT middleware with a new one that validates the
      Supabase JWT (`supabase.auth.getUser(token)`) and attaches the
      corresponding profile to `req.user`.
- [ ] Keep the OLD passport-local routes alive in parallel for now, behind
      a feature flag. This is the "dual-mode" period.

### 2.4 Frontend changes
- [ ] Create a `useAuth()` hook backed by Supabase JS client.
- [ ] Replace login/signup forms to use the new endpoints.
- [ ] Store the session via `supabase.auth.setSession()`; the JS SDK handles
      refresh tokens automatically.
- [ ] Add password reset flow using `supabase.auth.resetPasswordForEmail()`.

### 2.5 Backfill existing users
- [ ] Write a one-shot script `script/migrate-users-to-supabase-auth.ts` that:
      1. Reads every profile from the DB.
      2. For each, calls `supabaseAdmin.auth.admin.createUser({ email,
         email_confirm: true, user_metadata: { migrated: true } })`.
      3. Updates `profiles.auth_user_id` with the new id.
      4. Sends a password-reset email (`generateLink({ type: 'recovery' })`).
- [ ] Test on a copy of production data first. Verify zero collisions.
- [ ] Run on production. Monitor Sentry.

### 2.6 Remove the old system
- [ ] After 30 days of dual-mode with zero issues, remove the
      passport-local routes.
- [ ] Drop `password_hash` from `profiles` in a new migration `0005`.
- [ ] Mark `username` as deprecated (or drop it if email is now mandatory).

**Exit criteria for Phase 2**: every login goes through Supabase Auth.
`auth.uid()` returns the right UUID inside any SQL query made with a user
JWT. The old `password_hash` column is gone.

---

## Phase 3 — Real Row Level Security (Week 4)

> **Status:** Migration applied 2026-04-07. **Inert** until Supabase Auth is
> the actual auth path used by clients (because the backend uses postgres
> role which bypasses RLS).
>
> - ✅ `migrations/0004_rls_policies.sql` applied to production. 46 policies
>   created (45 tables × 1 + `profiles` × 2). Verified via
>   `pg_policies` count and `get_advisors security` returning zero lints.
> - ✅ Smoke test confirms backend reads still work (102 families /
>   367 profiles / 1982 expenses / 1066 events all readable as before —
>   postgres role bypasses RLS as designed).
> - 🟡 Real enforcement only kicks in when a client connects via the
>   Supabase JS SDK with an authenticated user JWT, which won't happen
>   until Phase 8 cutover.


### 3.1 Apply the RLS policies
- [ ] Apply `migrations/0004_rls_policies.sql` to a Supabase branch first.
- [ ] Sanity-check with this query (should return rows from one family only,
      not all):
      ```sql
      -- After signing in as a test user
      SELECT family_id, COUNT(*) FROM expenses GROUP BY family_id;
      ```
- [ ] Test from the frontend that the same user only sees their own data.
- [ ] Test that an authenticated request with a forged `family_id` query
      param cannot read other families' data — the database itself should
      reject it.
- [ ] Apply to production. Re-run the Supabase advisors. The
      `rls_enabled_no_policy` warnings should be gone.

### 3.2 Role-based restrictions
- [ ] For sensitive tables (`bank_connections`, `medications`, `vital_signs`,
      `documents`, `school_grades`), add an extra check in the policy that
      restricts write access to `parent` and `guardian` roles.
- [ ] Decide whether children should see `expenses` at all. Document the
      decision.

### 3.3 Audit trail
- [ ] Enable Supabase database webhooks or `pgAudit` on the most sensitive
      tables. At a minimum log who-read-what for `bank_connections` and
      `medications`.

**Exit criteria for Phase 3**: even if a backend bug lets an unauthorized
SQL query through, the database refuses to return data from another family.

---

## Phase 4 — Validation & error hygiene (Week 4, in parallel)

> **Status:** Auth surface complete 2026-04-07. Other routes pending.
>
> - ✅ `server/lib/authSchemas.ts` — central Zod schemas (registerSchema,
>   loginSchema, joinSchema) with strict but realistic rules: trimmed
>   names, lowercased emails, password ≥8 chars with letter+digit, hex
>   colors, alphanumeric invite codes.
> - ✅ Applied to legacy `/api/auth/{register,login,join}` and v2
>   `/api/auth/v2/{register,join}` via `validateBody()`. Hand-rolled
>   `if (!email)` checks removed.
> - 🟡 Remaining: apply `validateBody/validateParams/validateQuery` to
>   the rest of `server/routes/*.ts` (expenses, events, tasks, family
>   admin). One PR per route file to keep diffs reviewable.


### 4.1 Zod everywhere
- [ ] Audit every route under `server/routes/`. Each one must validate its
      `req.body`, `req.params` and `req.query` with a Zod schema.
- [ ] Centralise the validation middleware in `server/lib/validate.ts` so it
      is one line per route.
- [ ] Convert Zod errors into 400 responses with a clear message — never
      leak internal stack traces.

### 4.2 Rate limiting
- [ ] Tighten `express-rate-limit` on auth endpoints: 5 requests per minute
      per IP for `/api/auth/login`, `/api/auth/signup`,
      `/api/auth/reset-password`.
- [ ] Add a slower global limiter (e.g. 300/min/IP) to prevent scraping.

### 4.3 Security headers
- [ ] Add `helmet` middleware with a strict CSP.
- [ ] Set `Strict-Transport-Security`, `X-Frame-Options: DENY`,
      `Referrer-Policy: strict-origin-when-cross-origin`.
- [ ] Configure CORS to only the production domain (no `*`).

### 4.4 Logging
- [ ] Replace `console.log` calls in `server/` with a structured logger
      (`pino` is the standard choice). Output JSON in production.
- [ ] Make sure the existing `redactSensitive` logic is reused by the logger
      so passwords and tokens never end up in logs.

---

## Phase 5 — Automated tests (Weeks 5–6)

> **Status:** Scaffold landed 2026-04-07. Vitest+supertest still need
> `npm install -D` to actually run.
>
> - ✅ `tests/api/auth.test.ts` — vitest + supertest validation suite for
>   register/login/join (empty body, malformed email, weak password,
>   bogus invite code). Happy-path tests scaffolded but commented out
>   pending a test database.
> - ✅ `tests/README.md` — explains layout, env vars, what to cover next.
> - ✅ CI workflow gained an "API tests" step that runs vitest if it's
>   installed and no-ops otherwise. Adding the dev dependencies is the
>   only thing needed to flip it on.
> - 🟡 Pending: `npm install -D vitest supertest @types/supertest`,
>   wire `"test": "vitest run"` script, then expand coverage to
>   expenses/events/tasks routes and a real-DB happy-path file.


### 5.1 End-to-end tests with Playwright
- [ ] `npm install -D @playwright/test`. `npx playwright install chromium`.
- [ ] Write a `playwright.config.ts` that boots the dev server against a
      throwaway database.
- [ ] Cover at minimum:
      - Family signup → invite second member → second member joins.
      - Login / logout / wrong password / password reset.
      - Create expense → see it in list → edit it → delete it.
      - Create calendar event → see it on the dashboard.
      - Add medication → confirm dose → see history.
      - Create geofence → simulate enter event → see notification.
      - AI chat: send a message, get a reply.
      - Permissions: a user from family A cannot access an expense from
        family B (this test must call the API directly with a forged ID).
- [ ] Add the `e2e` job to `.github/workflows/ci.yml` (it is already
      scaffolded as a comment).

### 5.2 Smoke tests in production
- [ ] After every deploy, run a tiny health-check Playwright suite against
      the live URL: hit `/healthz`, `/readyz`, then a public marketing page.
      Page on failure.

---

## Phase 6 — Performance & scale prep (Week 7)

> **Status:** Sentry, FK indexes, and slow-request reporting complete
> 2026-04-07.
>
> - ✅ `@sentry/node` added. `server/lib/sentry.ts` exposes lazy
>   `initSentry()`, `sentryRequestHandler()`, `sentryErrorHandler()`,
>   `captureException()`. No-op when `SENTRY_DSN` unset. Strips request
>   bodies, cookies, and IP addresses before sending (our privacy policy
>   forbids leaking any of them).
> - ✅ Mounted in `server/index.ts`: init before app build, request
>   handler first in the chain, error handler after routes.
> - ✅ `migrations/0005_fk_covering_indexes.sql` applied: 74 foreign
>   keys went from 0 covering indexes to 74/74. The database linter
>   `unindexed_foreign_keys` count dropped from 74 INFO advisories to 0.
>   Verified via the pg_constraint ⟗ pg_index join.
> - ✅ Slow-request logger: any `/api/*` request over `SLOW_REQUEST_MS`
>   (default 1000ms) emits `[slow]` log. Requests over 3× threshold are
>   reported to Sentry as synthetic `slow_request` exceptions so similar
>   routes group together.
> - 🟡 Remaining: real load testing (k6), connection pool tuning on
>   Railway, CDN in front of Vite assets. Deferred to post-launch.


### 6.1 Database indexes
- [ ] Run `EXPLAIN ANALYZE` on the slowest 20 queries reported by Supabase
      Performance Advisor.
- [ ] Add indexes for any sequential scan on `family_id` (almost every
      table will need this).
- [ ] Consider partial indexes on common filters (e.g. `WHERE
      status = 'active'`).

### 6.2 Connection pooling
- [ ] Make sure Railway uses the Supabase **transaction pooler** (port
      6543), not the direct connection. Verify with a load test.
- [ ] Set `pg` pool max ~10–20 per Railway instance.

### 6.3 Caching
- [ ] Identify the AI chat token-spend hotspot. Cache the system prompt and
      embeddings in `ai_cache` (the table already exists).
- [ ] Add a 60s edge cache on read-only public endpoints if any.

### 6.4 Background jobs
- [ ] Move the `startScheduler()` work out of the web process into a
      separate Railway service so a web restart does not skip a tick.
- [ ] Use a real queue (`bullmq` + Redis, or Supabase queues) for retryable
      work like sending emails and pushing FCM notifications.

---

## Phase 7 — Privacy, compliance & GDPR (Week 7, in parallel)

> **Status:** Export + deletion endpoints shipped 2026-04-07. Legal copy
> (privacy policy, ToS) still pending.
>
> - ✅ `GET /api/gdpr/export` — authenticated, streams a JSON attachment
>   with the profile, family, and every family-scoped row across the 38
>   family tables plus ai_messages and mood_photos. `passwordHash`
>   redacted. Failures on any single table are logged but don't abort
>   the export (best-effort semantics).
> - ✅ `POST /api/gdpr/delete` — requires `{"confirm":"DELETE"}` in the
>   body. Two modes:
>   - last member of family → `DELETE families` which cascades to every
>     child table (38 of them) via ON DELETE CASCADE.
>   - family has other members → anonymise in place: name="Ex membro",
>     email=NULL, passwordHash=disabled sentinel, authUserId=NULL.
>     Historical foreign keys (expense.added_by, task.assigned_to, ...)
>     remain intact so other members don't lose their history.
> - ✅ Both routes mounted in `server/routes/index.ts`.
> - 🟡 Remaining: privacy policy, data retention schedule, DPO contact,
>   cookie banner (if any cookies set by the frontend), and an email
>   pipeline that acknowledges export/deletion requests within 30 days
>   as GDPR requires.


The app handles **medical, financial, location and minors' data**. In Italy
this triggers GDPR + the Codice Privacy + parental consent rules. Treat this
phase as non-optional.

- [ ] Write a Privacy Policy page in Italian. Mention every data category
      and its retention period.
- [ ] Write Terms of Service.
- [ ] Add a cookie banner that complies with the Garante guidelines (only
      strictly necessary cookies pre-consent).
- [ ] Implement data export: a button "scarica i miei dati" that returns a
      ZIP with all of the user's tables in JSON.
- [ ] Implement data deletion: a real delete, not a soft-delete, with a
      30-day grace period during which the account can be restored.
- [ ] Document parental consent flow: under-14 accounts must be created by
      a parent profile, not directly.
- [ ] Sign a DPA (Data Processing Agreement) with Supabase and any
      third-party (Sentry, Railway, OpenAI/Anthropic for the AI features).
- [ ] If you store data of EU users, ensure all sub-processors are in the
      EU or under SCCs.
- [ ] Appoint a DPO if processing exceeds the GDPR threshold (likely yes,
      because of health data).

---

## Phase 8 — Soft launch (Week 8)

- [ ] Recruit 10–20 friendly families willing to use the app for 2 weeks.
- [ ] Give each one a real account; sit on Sentry and the analytics dash.
- [ ] Daily standup with yourself: what broke today, what got fixed.
- [ ] Fix everything that comes out of the soft launch before opening up.
- [ ] Only after a full week of zero P0/P1 issues, open public registrations.

---

## Phase 9 — Public launch (Week 9+)

- [ ] Create a status page (`status.familytracker.app`) backed by Better Stack.
- [ ] Set up an on-call rotation (even if it's just you with phone alerts).
- [ ] Document the runbook: "what do I do if X breaks?" for the top 10 X's.
- [ ] Set up daily database backups in Supabase (Pro plan) and **practise a
      restore once before launch**. A backup you have never restored is not
      a backup.
- [ ] Decide on a feature flag system (`unleash`, `posthog`, or even a
      simple `feature_flags` table) so you can dark-launch risky changes.
- [ ] Launch.

---

## Decision log

Decisions made on 2026-04-07 that shape this roadmap:

| # | Decision | Rationale |
|---|---|---|
| 1 | Do not rewrite the app | The codebase is structurally fine. The bug found (drift in ai_conversations) was fixed in 3 lines. Rewrites lose accumulated knowledge. |
| 2 | Migrate to Supabase Auth before launch | Without it, RLS is a fiction and the service_role key is the only line of defence. Cannot ship medical/financial data this way. |
| 3 | RLS via `is_in_family()` helper | Cleaner than inlining the SELECT in every policy, and PostgREST inlines the function call. |
| 4 | Use Drizzle as the SoT | The team already uses it. Adding a second migration tool would create more drift, not less. |
| 5 | CI on GitHub Actions, not Railway | GitHub Actions is free for public repos and well-integrated with PRs and branch protection. Railway runs the deploys, not the checks. |
| 6 | Sentry over self-hosted error tracking | Free tier is enough. Self-hosting is a distraction this early. |
| 7 | No big rewrite of the frontend | wouter + TanStack Query + Radix is a solid stack. Replacing it with Next.js would burn months for no user benefit. |

---

## What is explicitly NOT in this roadmap (and why)

- **Mobile apps**. Web first. Capacitor or React Native can come later, after
  the web app is stable.
- **Internationalisation beyond Italian and English**. Adds complexity, no
  near-term ROI.
- **Multi-region deployment**. Single-region on Railway + Supabase EU is
  enough for the first 50k users.
- **Switching framework**. No Next.js, no Remix, no SvelteKit. The current
  Vite + Express setup is fine.
- **Microservices**. The codebase is a comfortable monolith. Splitting it
  would multiply problems before any user notices a benefit.

---

## How to use this document

Treat each phase as a milestone in your project tracker (Linear, GitHub
Projects, even a Trello board). Tick the checkboxes as you go. When a phase
is complete, write a short retrospective at the bottom of this file under
"Retrospectives" so future you (or future collaborators) understand why
choices were made.

## Retrospectives

_None yet._
