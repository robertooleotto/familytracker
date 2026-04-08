/**
 * GDPR endpoints — data subject access and right to erasure.
 *
 * Every EU data protection regulator expects two capabilities:
 *   1. "Give me a copy of all my data." → export
 *   2. "Delete everything you have about me." → erasure
 *
 * FamilyTracker stores data in family-shaped silos. A profile is only
 * meaningful inside its family, so the semantics differ slightly:
 *   - EXPORT returns the requesting profile's own rows AND a copy of the
 *     family-level rows the profile can see (events, expenses, etc.) so
 *     the user can understand the full context in which their data lives.
 *   - DELETE removes the profile and all rows that belong *exclusively* to
 *     it. If the profile is the only member of the family, the whole family
 *     is deleted (cascades handle the rest). If other members remain, the
 *     profile is anonymised: name → "Ex membro", email → NULL,
 *     password_hash → disabled, auth_user_id → NULL. Family-level rows
 *     remain so the other members don't lose their history.
 *
 * Both endpoints:
 *   - Require a valid JWT (legacy auth() helper)
 *   - Return 401 on missing/invalid token
 *   - Log the action to the console (and Sentry via the normal error path)
 *   - Are rate-limited by the main authLimiter in routes/index.ts
 *
 * Export returns a JSON blob. For very large families this may be several
 * MB; we stream JSON via res.write() to avoid buffering it all in memory.
 */
import type { Express, Request, Response } from "express";
import { db } from "../db";
import { requireAuth } from "../lib/requireAuth";
import {
  profiles,
  families,
  events,
  expenses,
  tasks,
  messages,
  locations,
  locationHistory,
  shoppingItems,
  documents,
  medications,
  medConfirmations,
  vitalSigns,
  bankConnections,
  subscriptions,
  budgetCategories,
  vehicles,
  vehicleLogs,
  schoolConnections,
  schoolGrades,
  schoolHomework,
  schoolAbsences,
  schoolNotices,
  pets,
  petEvents,
  geofences,
  geofenceEvents,
  anniversaries,
  homeContacts,
  homeDeadlines,
  emergencyCards,
  dinnerRotation,
  foodPreferences,
  elderlyAlerts,
  dailyCheckins,
  checkins,
  rewards,
  trips,
  aiConversations,
  aiMessages,
  aiInsights,
  moodPhotos,
} from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * All the family-scoped tables we export. Listed explicitly so a new table
 * is a deliberate decision — if you add a table with user data, add it here
 * OR justify in a code comment why it's excluded.
 */
const FAMILY_SCOPED_TABLES: Array<{ key: string; table: any }> = [
  { key: "events", table: events },
  { key: "expenses", table: expenses },
  { key: "tasks", table: tasks },
  { key: "messages", table: messages },
  { key: "locations", table: locations },
  { key: "location_history", table: locationHistory },
  { key: "shopping_items", table: shoppingItems },
  { key: "documents", table: documents },
  { key: "medications", table: medications },
  { key: "med_confirmations", table: medConfirmations },
  { key: "vital_signs", table: vitalSigns },
  { key: "bank_connections", table: bankConnections },
  { key: "subscriptions", table: subscriptions },
  { key: "budget_categories", table: budgetCategories },
  { key: "vehicles", table: vehicles },
  { key: "vehicle_logs", table: vehicleLogs },
  { key: "school_connections", table: schoolConnections },
  { key: "school_grades", table: schoolGrades },
  { key: "school_homework", table: schoolHomework },
  { key: "school_absences", table: schoolAbsences },
  { key: "school_notices", table: schoolNotices },
  { key: "pets", table: pets },
  { key: "pet_events", table: petEvents },
  { key: "geofences", table: geofences },
  { key: "geofence_events", table: geofenceEvents },
  { key: "anniversaries", table: anniversaries },
  { key: "home_contacts", table: homeContacts },
  { key: "home_deadlines", table: homeDeadlines },
  { key: "emergency_cards", table: emergencyCards },
  { key: "dinner_rotation", table: dinnerRotation },
  { key: "food_preferences", table: foodPreferences },
  { key: "elderly_alerts", table: elderlyAlerts },
  { key: "daily_checkins", table: dailyCheckins },
  { key: "checkins", table: checkins },
  { key: "rewards", table: rewards },
  { key: "trips", table: trips },
  { key: "ai_conversations", table: aiConversations },
  { key: "ai_insights", table: aiInsights },
];

export function registerGdprRoutes(app: Express): void {
  /**
   * GET /api/gdpr/export
   *
   * Returns a JSON object with every row the authenticated user has
   * access to, keyed by table name. The `profile` field is the
   * requesting user's own row (sanitised).
   */
  app.get("/api/gdpr/export", requireAuth, async (req: Request, res: Response) => {
    const session = req.auth!;

    try {
      const [me] = await db.select().from(profiles).where(eq(profiles.id, session.profileId));
      if (!me) {
        return res.status(404).json({ message: "Profile not found" });
      }
      const [family] = await db.select().from(families).where(eq(families.id, session.familyId));

      // Strip the password hash and any auth-related secrets from the
      // profile before exporting.
      const { passwordHash: _omit, ...safeMe } = me as any;

      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="familytracker-export-${me.id}-${new Date().toISOString().slice(0, 10)}.json"`,
      );
      res.write(`{\n`);
      res.write(`  "exported_at": ${JSON.stringify(new Date().toISOString())},\n`);
      res.write(`  "profile": ${JSON.stringify(safeMe, null, 2)},\n`);
      res.write(`  "family": ${JSON.stringify(family ?? null, null, 2)},\n`);
      res.write(`  "data": {\n`);

      for (let i = 0; i < FAMILY_SCOPED_TABLES.length; i++) {
        const { key, table } = FAMILY_SCOPED_TABLES[i];
        try {
          const rows = await db.select().from(table).where(eq((table as any).familyId, session.familyId));
          res.write(`    ${JSON.stringify(key)}: ${JSON.stringify(rows, null, 2)}`);
        } catch (err) {
          // A single table failure shouldn't kill the whole export.
          res.write(`    ${JSON.stringify(key)}: []`);
          console.error(`[gdpr/export] failed to read ${key}:`, err);
        }
        res.write(i < FAMILY_SCOPED_TABLES.length - 1 ? ",\n" : "\n");
      }

      // ai_messages live under ai_conversations (no family_id column).
      try {
        const convs = await db
          .select()
          .from(aiConversations)
          .where(eq(aiConversations.familyId, session.familyId));
        const allMessages: any[] = [];
        for (const c of convs) {
          const msgs = await db
            .select()
            .from(aiMessages)
            .where(eq(aiMessages.conversationId, c.id));
          allMessages.push(...msgs);
        }
        res.write(`    ,"ai_messages": ${JSON.stringify(allMessages, null, 2)}`);
      } catch (err) {
        res.write(`    ,"ai_messages": []`);
      }

      // mood_photos are profile-scoped (the requesting profile only).
      try {
        const photos = await db
          .select()
          .from(moodPhotos)
          .where(eq(moodPhotos.profileId, session.profileId));
        res.write(`,\n    "mood_photos": ${JSON.stringify(photos, null, 2)}\n`);
      } catch {
        res.write(`,\n    "mood_photos": []\n`);
      }

      res.write(`  }\n}\n`);
      res.end();
      console.log(`[gdpr/export] profile=${session.profileId} family=${session.familyId} ok`);
    } catch (err: any) {
      console.error("[gdpr/export] error:", err);
      if (!res.headersSent) {
        res.status(500).json({ message: err.message || "Export failed" });
      } else {
        res.end();
      }
    }
  });

  /**
   * POST /api/gdpr/delete
   *
   * Body: { confirm: "DELETE" }
   *
   * Deletes or anonymises the requesting profile. If the profile is the
   * last member of the family, the family is deleted and the cascade
   * cleans up everything. Otherwise the profile is anonymised in place.
   */
  app.post("/api/gdpr/delete", requireAuth, async (req: Request, res: Response) => {
    const session = req.auth!;

    if (req.body?.confirm !== "DELETE") {
      return res.status(400).json({
        message: 'Missing confirmation. Send {"confirm":"DELETE"} to proceed.',
      });
    }

    try {
      const members = await db
        .select()
        .from(profiles)
        .where(eq(profiles.familyId, session.familyId));

      const isLastMember = members.length <= 1;

      if (isLastMember) {
        // Cascading FK (ON DELETE CASCADE) on every child table means
        // a single DELETE on families wipes the entire family history.
        await db.delete(families).where(eq(families.id, session.familyId));
        console.log(
          `[gdpr/delete] full family delete: family=${session.familyId} profile=${session.profileId}`,
        );
        return res.json({ mode: "family_deleted", familyId: session.familyId });
      }

      // Anonymise in place. We overwrite PII but keep the id so historical
      // references (e.g. expense.added_by) still resolve to *someone*.
      const anonName = "Ex membro";
      await db
        .update(profiles)
        .set({
          name: anonName,
          lastName: null,
          email: null,
          username: `deleted-${session.profileId.slice(0, 8)}`,
          passwordHash: "$2b$12$account_deleted_no_login_allowed_0000000000000000000",
          avatarUrl: null,
          fcmToken: null,
          authUserId: null,
          currentMood: null,
        } as any)
        .where(eq(profiles.id, session.profileId));

      console.log(
        `[gdpr/delete] anonymised: profile=${session.profileId} family=${session.familyId}`,
      );
      return res.json({ mode: "anonymised", profileId: session.profileId });
    } catch (err: any) {
      console.error("[gdpr/delete] error:", err);
      return res.status(500).json({ message: err.message || "Delete failed" });
    }
  });
}
