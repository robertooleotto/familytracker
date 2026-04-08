/**
 * One-shot backfill: create a Supabase auth user for every legacy profile
 * and link them via profiles.auth_user_id.
 *
 * Usage:
 *   tsx script/migrate-users-to-supabase-auth.ts          # dry run, prints plan
 *   tsx script/migrate-users-to-supabase-auth.ts --apply  # actually do it
 *   tsx script/migrate-users-to-supabase-auth.ts --apply --send-reset
 *                                                         # also email reset links
 *
 * Idempotent: profiles that already have auth_user_id set are skipped.
 *
 * Strategy
 * --------
 * For each profile:
 *   - If profile.email is set and not already in supabase: create user with
 *     a random temporary password, mark email as confirmed, send a password
 *     reset link so the user can set their own password.
 *   - If profile.email is null (children): create a user with a synthetic
 *     email child-{shortId}@invite.familytracker.local and a random password.
 *     These users continue to log in via the legacy v1 flow until we ship
 *     the child PIN flow.
 *   - If a supabase user already exists with that email (collision because
 *     someone half-migrated earlier), look it up and just link.
 *
 * Safety
 * ------
 *   - Runs in batches of 25 with a 200ms pause between batches.
 *   - Logs every action to ./backfill-supabase-auth.log
 *   - On any error, the offending profile is recorded but the run continues.
 *   - Final summary at the end: { ok, skipped, errors }.
 *
 * Pre-flight checklist
 * --------------------
 *   1. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in the environment
 *      this script runs in.
 *   2. Migration 0003_supabase_auth_link.sql has been applied.
 *   3. Take a fresh database backup before running with --apply.
 */

import "dotenv/config";
import { randomBytes } from "crypto";
import { writeFileSync, appendFileSync } from "fs";
import { db } from "../server/db";
import { profiles } from "../shared/schema";
import { eq, isNull } from "drizzle-orm";
import { getSupabaseAdmin } from "../server/auth/supabase";

const APPLY = process.argv.includes("--apply");
const SEND_RESET = process.argv.includes("--send-reset");
const LOG_FILE = "./backfill-supabase-auth.log";
const BATCH_SIZE = 25;
const BATCH_PAUSE_MS = 200;

const SYNTHETIC_DOMAIN = "invite.familytracker.local";
const TEMP_PASSWORD_BYTES = 18;

function log(line: string) {
  const stamped = `[${new Date().toISOString()}] ${line}`;
  console.log(stamped);
  appendFileSync(LOG_FILE, stamped + "\n");
}

function tempPassword(): string {
  // 36 hex chars — well above any reasonable strength threshold.
  return randomBytes(TEMP_PASSWORD_BYTES).toString("hex");
}

function syntheticEmailFor(profileId: string): string {
  // Use a short hash of the profile id so reruns are deterministic.
  return `child-${profileId.replace(/-/g, "").slice(0, 12)}@${SYNTHETIC_DOMAIN}`;
}

async function main() {
  writeFileSync(LOG_FILE, "");
  log(`Backfill starting. APPLY=${APPLY} SEND_RESET=${SEND_RESET}`);

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    log("FATAL: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.");
    process.exit(1);
  }

  const admin = await getSupabaseAdmin();

  // Pull every profile that doesn't yet have a supabase link.
  const todo = await db
    .select()
    .from(profiles)
    .where(isNull(profiles.authUserId));

  log(`Found ${todo.length} profiles without auth_user_id`);

  let ok = 0;
  let skipped = 0;
  const errors: Array<{ profileId: string; reason: string }> = [];

  for (let i = 0; i < todo.length; i += BATCH_SIZE) {
    const batch = todo.slice(i, i + BATCH_SIZE);
    log(`Processing batch ${i / BATCH_SIZE + 1} (${batch.length} profiles)`);

    for (const profile of batch) {
      try {
        const realEmail = profile.email;
        const targetEmail = realEmail || syntheticEmailFor(profile.id);
        const isSynthetic = !realEmail;

        if (!APPLY) {
          log(`  DRY: would create supabase user for ${profile.id} (${targetEmail}) synthetic=${isSynthetic}`);
          ok++;
          continue;
        }

        // Try to find an existing supabase user with this email first.
        // (admin.auth.admin.listUsers is paginated; for the backfill scale
        // we just call createUser and treat "already exists" as a hint to
        // look it up.)
        const password = tempPassword();
        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: targetEmail,
          password,
          email_confirm: true,
          user_metadata: {
            backfilled_at: new Date().toISOString(),
            profile_id: profile.id,
            synthetic: isSynthetic,
          },
        });

        let authUserId: string | null = null;

        if (createErr) {
          // The supabase admin SDK returns "User already registered" /
          // "email_exists" when the user exists. In that case, look it up.
          const msg = createErr.message?.toLowerCase() || "";
          if (msg.includes("already") || msg.includes("exists") || msg.includes("registered")) {
            log(`  ${profile.id}: supabase user already exists, looking up...`);
            // Walk pages until we find them. With <10k users this is fine.
            let page = 1;
            while (true) {
              const { data: list, error: listErr } = await admin.auth.admin.listUsers({
                page,
                perPage: 1000,
              });
              if (listErr || !list?.users?.length) break;
              const match = list.users.find((u) => u.email === targetEmail);
              if (match) {
                authUserId = match.id;
                break;
              }
              if (list.users.length < 1000) break;
              page++;
            }
            if (!authUserId) {
              throw new Error(`createUser said exists but listUsers couldn't find ${targetEmail}`);
            }
          } else {
            throw createErr;
          }
        } else if (created?.user) {
          authUserId = created.user.id;
        } else {
          throw new Error("createUser returned no user and no error");
        }

        // Link the local profile.
        await db.update(profiles).set({ authUserId }).where(eq(profiles.id, profile.id));
        log(`  ${profile.id}: linked to supabase user ${authUserId}`);

        // Optionally send password reset link so the real human can pick a
        // password they actually know. Synthetic-email children are skipped.
        if (SEND_RESET && realEmail && !isSynthetic) {
          const { error: resetErr } = await admin.auth.admin.generateLink({
            type: "recovery",
            email: realEmail,
          });
          if (resetErr) {
            log(`  ${profile.id}: WARN reset link failed: ${resetErr.message}`);
          }
        }

        ok++;
      } catch (err: any) {
        const reason = err?.message || String(err);
        log(`  ${profile.id}: ERROR ${reason}`);
        errors.push({ profileId: profile.id, reason });
      }
    }

    if (i + BATCH_SIZE < todo.length) {
      await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS));
    }
  }

  log("───────────────────────────────────────────────");
  log(`DONE. ok=${ok} skipped=${skipped} errors=${errors.length}`);
  if (errors.length) {
    log("First 20 errors:");
    for (const e of errors.slice(0, 20)) log(`  ${e.profileId}: ${e.reason}`);
  }
  log(`Full log: ${LOG_FILE}`);
  process.exit(errors.length > 0 ? 2 : 0);
}

main().catch((err) => {
  log(`FATAL: ${err?.stack || err}`);
  process.exit(1);
});
