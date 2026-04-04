import { db } from "../db";
import { families, aiCache } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { generateEveningSummary } from "./features/eveningSummary";
import { detectAnomalies } from "./features/anomalyDetector";

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function getAllFamilyIds(): Promise<string[]> {
  const rows = await db.select({ id: families.id }).from(families);
  return rows.map(r => r.id);
}

// Fix #27: DB-backed lock to prevent duplicate runs across instances
async function tryAcquireLock(jobName: string, minIntervalHours: number): Promise<boolean> {
  const lockFeature = `_scheduler_lock_${jobName}`;
  const [existing] = await db.select().from(aiCache)
    .where(and(eq(aiCache.familyId, "__system__"), eq(aiCache.feature, lockFeature)));
  const now = Date.now();
  if (existing) {
    const lastRun = new Date(existing.generatedAt).getTime();
    if (now - lastRun < minIntervalHours * 3_600_000) return false;
    await db.update(aiCache).set({ generatedAt: new Date(), resultJson: JSON.stringify({ ranAt: new Date().toISOString() }) })
      .where(eq(aiCache.id, existing.id));
  } else {
    try {
      await db.insert(aiCache).values({ familyId: "__system__", feature: lockFeature, resultJson: JSON.stringify({ ranAt: new Date().toISOString() }) });
    } catch { return false; }
  }
  return true;
}

function scheduleCron(cronExpr: string, label: string, minIntervalHours: number, fn: () => Promise<void>) {
  const [minuteExpr, hourExpr] = cronExpr.split(" ");
  function checkAndRun() {
    const now = new Date();
    const h = now.getHours(), m = now.getMinutes();
    const hourMatch = hourExpr === "*" || parseInt(hourExpr) === h;
    const minuteMatch = minuteExpr === "*" || (minuteExpr.startsWith("*/") && m % parseInt(minuteExpr.slice(2)) === 0) || parseInt(minuteExpr) === m;
    if (hourMatch && minuteMatch) {
      tryAcquireLock(label, minIntervalHours).then(acquired => {
        if (!acquired) return;
        console.log(`[Scheduler] Running ${label}...`);
        fn().catch(err => console.error(`[Scheduler] ${label} failed:`, err.message));
      });
    }
  }
  setInterval(checkAndRun, 60_000);
  console.log(`[Scheduler] ✓ ${label} registered`);
}

export function startScheduler() {
  scheduleCron("0 21", "Evening Summary", 20, async () => {
    const ids = await getAllFamilyIds();
    for (const id of ids) {
      try { await generateEveningSummary(id); await sleep(2000); }
      catch (err: any) { console.error(`[Scheduler] Evening summary failed for ${id}:`, err.message); }
    }
  });
  scheduleCron("0 8", "Anomaly Detection", 20, async () => {
    const ids = await getAllFamilyIds();
    for (const id of ids) {
      try { await detectAnomalies(id); await sleep(500); }
      catch (err: any) { console.error(`[Scheduler] Anomaly detection failed for ${id}:`, err.message); }
    }
  });

  // ── ELDERLY SAFETY: Create daily check-ins every morning ──────────────────
  scheduleCron("0 9", "Elderly Daily Checkin", 20, async () => {
    try {
      const { profiles: profilesTbl, profileSettings: psTbl, dailyCheckins: dcTbl } = await import("@shared/schema");
      const today = new Date().toISOString().split("T")[0];
      // Find all profiles with daily check-in enabled
      const settings = await db.select().from(psTbl).where(eq(psTbl.dailyCheckinEnabled, true));
      for (const s of settings) {
        // Check if already created today
        const [existing] = await db.select().from(dcTbl).where(and(eq(dcTbl.profileId, s.profileId), eq(dcTbl.date, today)));
        if (!existing) {
          const [profile] = await db.select().from(profilesTbl).where(eq(profilesTbl.id, s.profileId));
          if (profile) {
            await db.insert(dcTbl).values({ familyId: profile.familyId, profileId: s.profileId, date: today, status: "pending" });
            console.log(`[Scheduler] Created daily check-in for ${profile.name}`);
          }
        }
      }
    } catch (err: any) { console.error("[Scheduler] Daily checkin creation failed:", err.message); }
  });

  // ── ELDERLY SAFETY: Escalate missed check-ins (hourly) ────────────────────
  scheduleCron("*/30 *", "Elderly Checkin Escalation", 0.4, async () => {
    try {
      const { dailyCheckins: dcTbl, profileSettings: psTbl, profiles: profilesTbl, elderlyAlerts: alertTbl } = await import("@shared/schema");
      const today = new Date().toISOString().split("T")[0];
      const pending = await db.select().from(dcTbl).where(and(eq(dcTbl.date, today), eq(dcTbl.status, "pending")));
      for (const checkin of pending) {
        if (checkin.escalatedAt) continue;
        const [settings] = await db.select().from(psTbl).where(eq(psTbl.profileId, checkin.profileId));
        if (!settings?.dailyCheckinEnabled) continue;
        const graceMins = settings.dailyCheckinGraceMins || 60;
        const checkinTime = settings.dailyCheckinTime || "09:00";
        const [h, m] = checkinTime.split(":").map(Number);
        const deadline = new Date(); deadline.setHours(h, m + graceMins, 0, 0);
        if (new Date() > deadline) {
          // Escalate: mark as missed and create alert
          await db.update(dcTbl).set({ status: "missed", escalatedAt: new Date() }).where(eq(dcTbl.id, checkin.id));
          const [profile] = await db.select().from(profilesTbl).where(eq(profilesTbl.id, checkin.profileId));
          await db.insert(alertTbl).values({
            familyId: checkin.familyId, profileId: checkin.profileId,
            type: "missed_checkin", severity: "warning",
            title: `${profile?.name || "Utente"} non ha risposto al check-in`,
            description: `Nessuna risposta al check-in delle ${checkinTime}. Contattare per verificare.`,
          });
          console.log(`[Scheduler] Escalated missed check-in for ${profile?.name}`);
        }
      }
    } catch (err: any) { console.error("[Scheduler] Checkin escalation failed:", err.message); }
  });

  // ── ELDERLY SAFETY: Missed medication alerts (every 30 min) ───────────────
  scheduleCron("*/30 *", "Elderly Med Alerts", 0.4, async () => {
    try {
      const { medications: medTbl, medConfirmations: mcTbl, profiles: profilesTbl, profileSettings: psTbl, elderlyAlerts: alertTbl } = await import("@shared/schema");
      const today = new Date().toISOString().split("T")[0];
      const nowH = new Date().getHours();
      const nowM = new Date().getMinutes();
      const nowMins = nowH * 60 + nowM;

      // Find elderly profiles with medication tracking
      const elderlySettings = await db.select().from(psTbl).where(eq(psTbl.elderlyTrackingEnabled, true));
      for (const s of elderlySettings) {
        const meds = await db.select().from(medTbl).where(and(eq(medTbl.profileId, s.profileId), eq(medTbl.active, true)));
        for (const med of meds) {
          const times = med.scheduleTimes || [];
          for (const t of times) {
            const [th, tm] = t.split(":").map(Number);
            const schedMins = th * 60 + tm;
            // If 30+ minutes past scheduled time, check if confirmed
            if (nowMins > schedMins + 30 && nowMins < schedMins + 120) {
              const [existing] = await db.select().from(mcTbl).where(and(
                eq(mcTbl.medicationId, med.id), eq(mcTbl.scheduledDate, today), eq(mcTbl.scheduledTime, t)
              ));
              if (!existing || existing.status === "pending") {
                // Create pending confirmation if not exists
                if (!existing) {
                  await db.insert(mcTbl).values({ medicationId: med.id, profileId: s.profileId, familyId: med.familyId, scheduledDate: today, scheduledTime: t, status: "pending" }).catch(() => {});
                }
                // Create alert if not already alerted
                if (!existing?.notifiedCaregiverAt) {
                  const [profile] = await db.select().from(profilesTbl).where(eq(profilesTbl.id, s.profileId));
                  await db.insert(alertTbl).values({
                    familyId: med.familyId, profileId: s.profileId,
                    type: "missed_medication", severity: "warning",
                    title: `${profile?.name || "Utente"} non ha preso ${med.name}`,
                    description: `Medicina "${med.name}" (${med.dosage || ""}) prevista alle ${t} non confermata.`,
                  });
                  if (existing) {
                    await db.update(mcTbl).set({ notifiedCaregiverAt: new Date() }).where(eq(mcTbl.id, existing.id));
                  }
                  console.log(`[Scheduler] Missed med alert: ${profile?.name} - ${med.name} at ${t}`);
                }
              }
            }
          }
        }
      }
    } catch (err: any) { console.error("[Scheduler] Med alerts failed:", err.message); }
  });

  console.log("[Scheduler] ✓ AI Scheduler active (with DB lock + elderly safety)");
}
