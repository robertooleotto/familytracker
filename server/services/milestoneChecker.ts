import { db } from "../db";
import { profiles, families } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { calcAge } from "./autonomyEngine";

// ── Milestone definizioni ────────────────────────────────────────────────────
const AGE_MILESTONES: Array<{
  age: number;
  key: string;
  question: (name: string) => string;
  updateIfYes: Record<string, any>;
  updateField: "autonomy" | "transport";
}> = [
  {
    age: 10,
    key: "walk_alone",
    question: (n) => `${n} compie 10 anni. Può camminare da solo fino a 1km?`,
    updateIfYes: { max_walk_distance_km: 1.0 },
    updateField: "autonomy",
  },
  {
    age: 12,
    key: "bus_alone",
    question: (n) => `${n} compie 12 anni. Sa usare i mezzi pubblici da solo?`,
    updateIfYes: { can_use_bus: true },
    updateField: "transport",
  },
  {
    age: 14,
    key: "travel_further",
    question: (n) => `${n} compie 14 anni. Può spostarsi in autonomia anche più lontano?`,
    updateIfYes: { can_travel_alone: true, max_walk_distance_km: 2.5 },
    updateField: "autonomy",
  },
  {
    age: 16,
    key: "bike_extended",
    question: (n) => `${n} ha 16 anni. Può usare la bici per percorsi più lunghi?`,
    updateIfYes: { has_bike: true },
    updateField: "transport",
  },
  {
    age: 18,
    key: "driving_age",
    question: (n) => `${n} è maggiorenne. Ha la patente di guida?`,
    updateIfYes: { has_driving_license: true },
    updateField: "transport",
  },
];

export interface MilestoneQuestion {
  member_id: string;
  member_name: string;
  milestone_key: string;
  age: number;
  question: string;
  updateIfYes: Record<string, any>;
  updateField: "autonomy" | "transport";
}

// ── Controlla milestone per una famiglia ─────────────────────────────────────
export async function checkMilestones(familyId: string): Promise<MilestoneQuestion[]> {
  const children = await db.select().from(profiles)
    .where(and(eq(profiles.familyId, familyId), eq(profiles.role, "child")));

  const pending: MilestoneQuestion[] = [];

  for (const child of children) {
    if (!child.birthDate) continue;
    const age = calcAge(child.birthDate as string);
    const notified: string[] = (child.ageMilestonesNotified as string[]) || [];

    for (const milestone of AGE_MILESTONES) {
      if (age < milestone.age) continue;
      if (notified.includes(milestone.key)) continue;

      pending.push({
        member_id: child.id,
        member_name: child.name,
        milestone_key: milestone.key,
        age: milestone.age,
        question: milestone.question(child.name),
        updateIfYes: milestone.updateIfYes,
        updateField: milestone.updateField,
      });

      // Segna come notificato
      await db.update(profiles)
        .set({ ageMilestonesNotified: [...notified, milestone.key] })
        .where(eq(profiles.id, child.id));
    }
  }

  return pending;
}

// ── Risponde a un milestone ──────────────────────────────────────────────────
export async function respondMilestone(
  memberId: string,
  milestoneKey: string,
  accepted: boolean,
  updateIfYes: Record<string, any>,
  updateField: "autonomy" | "transport",
): Promise<void> {
  if (!accepted) return;

  const [member] = await db.select().from(profiles).where(eq(profiles.id, memberId));
  if (!member) return;

  if (updateField === "autonomy") {
    const current = (member.autonomy as any) || {};
    await db.update(profiles)
      .set({ autonomy: { ...current, ...updateIfYes } })
      .where(eq(profiles.id, memberId));
  } else {
    const current = (member.transport as any) || {};
    await db.update(profiles)
      .set({ transport: { ...current, ...updateIfYes } })
      .where(eq(profiles.id, memberId));
  }
}
