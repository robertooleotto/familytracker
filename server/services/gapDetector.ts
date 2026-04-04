import { db } from "../db";
import { profiles, events } from "@shared/schema";
import { eq, and, gte, lte } from "drizzle-orm";
import type { Profile, Event } from "@shared/schema";
import { needsDriver, calcDepartureTime, estimateTravelMin, calcReturnTime, calcAge } from "./autonomyEngine";
import { format, addDays } from "date-fns";
import { it } from "date-fns/locale";

// ── Tipi ────────────────────────────────────────────────────────────────────
export interface Gap {
  id: string;
  type: "driver_missing" | "pickup_missing" | "both_missing";
  event: Event;
  child: Profile;
  available: Profile[];
  allBusy: boolean;
  pickupAlso: boolean;
  urgency: "high" | "medium" | "low";
  question: { text: string; context: string; urgent?: boolean };
  quickActions: Array<{ label: string; type: string; payload: Record<string, string> }>;
}

// ── Formattatori italiani ────────────────────────────────────────────────────
function formatDateIT(d: Date): string {
  return format(d, "EEEE d MMMM", { locale: it });
}
function formatTimeIT(d: Date): string {
  return format(d, "HH:mm");
}

function calcUrgency(startAt: Date): "high" | "medium" | "low" {
  const hours = (startAt.getTime() - Date.now()) / 3_600_000;
  if (hours < 24) return "high";
  if (hours < 72) return "medium";
  return "low";
}

function hasConflict(allEvents: Event[], memberId: string, start: Date, end: Date): boolean {
  return allEvents.some(ev => {
    const pts: any[] = (ev.participants as any) || [];
    const assigned: string[] = (ev.assignedTo as any) || [];
    const inEvent = pts.some(p => p.member_id === memberId) || assigned.includes(memberId);
    if (!inEvent) return false;
    const es = new Date(ev.startAt);
    const ee = ev.endAt ? new Date(ev.endAt) : new Date(es.getTime() + 3_600_000);
    return es < end && ee > start;
  });
}

// ── buildQuestion ────────────────────────────────────────────────────────────
function buildQuestion(event: Event, child: Profile, available: Profile[], pickupAlso: boolean): { text: string; context: string; urgent?: boolean } {
  const dateStr = formatDateIT(new Date(event.startAt));
  const timeStr = formatTimeIT(new Date(event.startAt));
  const derived: any = event.derived || {};
  const depart = derived.departure_time;
  const returnT = derived.return_time;
  const pickupStr = pickupAlso && returnT ? ` e riprendilo alle ${returnT}` : "";

  if (available.length === 1) {
    const p = available[0];
    return {
      text: `${p.name}, puoi portare ${child.name} a ${event.title} ${dateStr}?` + (depart ? ` Partenza alle ${depart}${pickupStr}.` : ""),
      context: `${child.name} deve essere a ${event.locationName || "destinazione"} alle ${timeStr}.`,
    };
  }
  if (available.length >= 2) {
    const names = available.map(p => p.name).join(" o ");
    return {
      text: `Chi porta ${child.name} a ${event.title} ${dateStr}? ${names}?`,
      context: depart ? `Partenza necessaria alle ${depart}${pickupStr}.` : `Orario: ${timeStr}`,
    };
  }
  return {
    text: `${child.name} ha ${event.title} ${dateStr} alle ${timeStr} ma siete tutti impegnati.`,
    context: "Come vi organizzate? Avete qualcuno di fidato che può accompagnarlo?",
    urgent: true,
  };
}

// ── buildQuickActions ────────────────────────────────────────────────────────
function buildQuickActions(event: Event, child: Profile, available: Profile[], busFeasible: boolean): Array<{ label: string; type: string; payload: Record<string, string> }> {
  const actions: any[] = [];
  available.forEach(p => {
    actions.push({
      label: `Vado io (${p.name.split(" ")[0]})`,
      type: "assign_driver",
      payload: { event_id: event.id, driver_id: p.id, child_id: child.id },
    });
  });
  actions.push({
    label: "Chiedo a qualcun altro",
    type: "ask_external",
    payload: { event_id: event.id, child_id: child.id },
  });
  if (busFeasible) {
    actions.push({
      label: `${child.name.split(" ")[0]} va in bus`,
      type: "mark_autonomous",
      payload: { event_id: event.id, member_id: child.id, mode: "bus" },
    });
  }
  return actions;
}

// ── DETECTALLGAPS (famiglia) ─────────────────────────────────────────────────
export async function detectAllGaps(familyId: string): Promise<Gap[]> {
  const gaps: Gap[] = [];

  const allMembers = await db.select().from(profiles).where(eq(profiles.familyId, familyId));
  const children = allMembers.filter(m => m.role === "child" || (m.birthDate && calcAge(m.birthDate as string) < 18));
  const parents = allMembers.filter(m => !children.some(c => c.id === m.id));

  const now = new Date();
  const inSevenDays = addDays(now, 7);
  const upcoming = await db.select().from(events)
    .where(and(eq(events.familyId, familyId), gte(events.startAt, now), lte(events.startAt, inSevenDays)));

  for (const ev of upcoming) {
    const pts: any[] = (ev.participants as any) || [];
    const assigned: string[] = (ev.assignedTo as any) || [];
    const hasDriver = pts.some(p => p.role === "driver");
    if (hasDriver) continue;

    const childParticipants = [...new Set([
      ...pts.filter(p => p.role === "participant").map(p => p.member_id),
      ...assigned,
    ])].map(id => children.find(c => c.id === id)).filter(Boolean) as Profile[];

    for (const child of childParticipants) {
      const result = await needsDriver(ev as Event, child);
      if (!result.needed) continue;

      const evStart = new Date(ev.startAt);
      const evEnd = ev.endAt ? new Date(ev.endAt) : new Date(evStart.getTime() + 3_600_000);
      const travelMin = estimateTravelMin(ev.locationName || "");
      const departureTime = calcDepartureTime(evStart, travelMin);
      const returnTime = calcReturnTime(evEnd, travelMin);

      const available = parents.filter(p =>
        !hasConflict(upcoming as Event[], p.id, evStart, evEnd)
      );

      const busFeasible = result.reason === "bus_feasible";
      const pickupAlso = !pts.some(p => p.role === "pickup");

      const q = buildQuestion(
        { ...ev, derived: { ...((ev.derived as any) || {}), departure_time: departureTime, return_time: returnTime ?? undefined } } as Event,
        child,
        available,
        pickupAlso,
      );
      const actions = buildQuickActions(ev as Event, child, available, busFeasible);

      gaps.push({
        id: `gap_${ev.id}_${child.id}`,
        type: pickupAlso ? "both_missing" : "driver_missing",
        event: ev as Event,
        child,
        available,
        allBusy: available.length === 0,
        pickupAlso,
        urgency: calcUrgency(evStart),
        question: q,
        quickActions: actions,
      });
    }
  }

  return gaps.sort((a, b) => {
    const order = { high: 3, medium: 2, low: 1 };
    return order[b.urgency] - order[a.urgency];
  });
}
