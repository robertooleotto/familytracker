# Contributing to FamilyTracker

This document is the rule book for working on the codebase. It exists to keep
the project orderly, predictable, and safe to ship to thousands of families.

If you are reading this for the first time: **read the whole file**. It is
short on purpose.

## Golden rules

1. **`shared/schema.ts` is the single source of truth for the database.**
   Never run a manual `ALTER TABLE` against production. Every schema change
   goes through a Drizzle migration committed under `migrations/`.
2. **`main` is always deployable.** If a build is red on `main`, drop
   everything and fix it before merging anything else.
3. **No direct pushes to `main`.** All changes go through a Pull Request with
   at least one passing CI run. Branch protection is configured to enforce
   this — do not disable it.
4. **No secrets in the repo, ever.** Use environment variables. The file
   `DATABASE_URL.env` was an early mistake; do not repeat it.
5. **Treat user data as if it were your own family's.** This app stores
   medical, financial, location and child data. Default to the most
   restrictive option whenever you have a choice.

## Local setup

```bash
git clone <repo>
cd Family
npm install
cp .env.example .env   # then fill in DATABASE_URL and friends
npm run dev
```

You need Node 20+. Use `nvm use 20` if you have nvm.

## Daily workflow

1. Pull `main`: `git pull --ff-only origin main`
2. Branch: `git checkout -b feat/<short-name>` or `fix/<short-name>`
3. Code. Run `npm run check` often.
4. Commit in small, meaningful chunks. Conventional commit prefixes
   (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`) are encouraged but not
   enforced.
5. Push and open a PR using the template.
6. Wait for green CI. Self-review your own PR before requesting review.
7. Squash-merge when approved. Delete the branch.

## Database changes

Schema migrations are the most error-prone part of the project. Follow the
ritual exactly.

1. Edit `shared/schema.ts` with the new column / table.
2. Generate the migration:
   ```bash
   npx drizzle-kit generate
   ```
   This produces a new file under `migrations/NNNN_<name>.sql`. **Read it
   carefully.**
3. If the auto-generated SQL is wrong (it sometimes is for column renames or
   complex defaults), edit the SQL by hand. Drizzle will not regenerate it.
4. Apply locally:
   ```bash
   npx drizzle-kit push
   ```
5. Test the change in dev.
6. Commit `shared/schema.ts`, the new migration file, and any updated
   snapshot in `migrations/meta/`.
7. CI runs `drizzle-kit check`, which fails if the schema and migration
   folder disagree. If CI is red here, **do not bypass it** — regenerate.
8. After merge, the migration is applied to production by the deploy
   pipeline (or, in the interim, by an operator running
   `npx drizzle-kit push` against the production `DATABASE_URL`).

### Never do this

- `drizzle-kit push` directly against production from your laptop.
- ALTER TABLE in the Supabase dashboard.
- Editing an already-merged migration file.
- Adding a NOT NULL column without a default to a table that already has rows.

## TypeScript discipline

- `any` is a code smell. If you need it, comment **why**.
- Prefer `unknown` + a type guard over `any`.
- Run `npm run check` before pushing. CI will fail otherwise.
- Zod schemas live next to the route that uses them. Validate every input.

## Authentication & authorisation

- The current auth system is custom (passport-local + bcrypt + JWT). We are
  migrating to Supabase Auth — see `ROADMAP.md`.
- **Every API route that touches user data must check**: (a) the requester
  is logged in, and (b) the requested `family_id` matches the requester's.
  There is no shortcut for this. Add it to every new route.
- New tables that store family data must include `family_id varchar` and
  matching RLS policies once the auth migration is complete.

## Frontend

- Components live in `client/src/components/`. One component per file.
- State management: TanStack Query for server state, React state for local UI.
- Forms: React Hook Form + Zod resolver. No manual validation.
- Tailwind for styling. No inline styles unless you have a real reason.
- Accessibility: every interactive element keyboard-reachable, every image
  with alt text, every form input with a label.

## Working with worktrees

Git worktrees in `.claude/worktrees/` are sandboxes for AI agents. They are
**not** authoritative. If a fix lives only in a worktree, it is lost.

- Periodically prune them: `git worktree list` then `git worktree remove <path>`.
- Before pruning, diff against `main` to rescue anything useful:
  `git -C .claude/worktrees/<name> diff main -- shared/ migrations/ server/`.

## Reporting bugs and asking for features

Open a GitHub issue using the templates in `.github/ISSUE_TEMPLATE/`.
For security issues, **do not open a public issue** — email the maintainer.

## Code review checklist

When reviewing a PR, ask yourself:

- Does this change work? Did the author actually test it?
- Are there missing edge cases (empty input, null, network failure, race)?
- Are user inputs validated with Zod?
- Are errors logged with enough context to debug?
- Are secrets handled correctly?
- Does the DB migration match the schema?
- Will this scale to 10× the current load?
- Is the change reversible if it goes wrong in production?

If any answer is "no" or "I don't know", ask questions in the PR.
