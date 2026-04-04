import { db } from "../db";
import { families, aiCache } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { generateEveningSummary } from "./features/eveningSummary";
import { detectAnomalies } from "./features/anomalyDetector";
import { checkMilestones } from "../services/milestoneChecker";
import { learnAutonomyPatterns } from "../services/patternLearner";

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
  scheduleCron("1 0", "Milestone Checker", 22, async () => {
    const ids = await getAllFamilyIds();
    for (const id of ids) {
      try { await checkMilestones(id); await sleep(200); }
      catch (err: any) { console.error(`[Scheduler] Milestone check failed for ${id}:`, err.message); }
    }
  });
  scheduleCron("0 20", "Pattern Learner", 160, async () => {
    const ids = await getAllFamilyIds();
    for (const id of ids) {
      try { await learnAutonomyPatterns(id); await sleep(500); }
      catch (err: any) { console.error(`[Scheduler] Pattern learner failed for ${id}:`, err.message); }
    }
  });
  console.log("[Scheduler] ✓ AI Scheduler active (with DB lock)");
}
