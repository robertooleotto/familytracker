import { db } from "../db";
import { profiles, events } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { buildRouteKey, calcAge } from "./autonomyEngine";
import { subDays } from "date-fns";

// ── Conta frequenza array ────────────────────────────────────────────────────
function countFreq(arr: string[]): Record<string, number> {
  return arr.reduce((acc, v) => ({ ...acc, [v]: (acc[v] || 0) + 1 }), {} as Record<string, number>);
}

export interface AutonomySuggestion {
  type: "add_trusted_route" | "recurring_driver";
  member_id: string;
  text: string;
  payload: Record<string, any>;
}

// ── PATTERN LEARNER ─────────────────────────────────────────────────────────
export async function learnAutonomyPatterns(familyId: string): Promise<AutonomySuggestion[]> {
  const suggestions: AutonomySuggestion[] = [];
  const allMembers = await db.select().from(profiles).where(eq(profiles.familyId, familyId));
  const children = allMembers.filter(m => m.role === "child" || calcAge((m.birthDate as string | null)) < 18);

  const thirtyDaysAgo = subDays(new Date(), 30);
  const pastEvents = await db.select().from(events)
    .where(and(eq(events.familyId, familyId), gte(events.startAt, thirtyDaysAgo)));

  for (const child of children) {
    const autonomy: any = child.autonomy || {};
    const trustedRoutes: string[] = autonomy.trusted_routes || [];

    // PATTERN 1: stesso percorso fatto senza driver ≥ 4 volte
    const locationsNoDriver = pastEvents
      .filter(ev => {
        const pts: any[] = (ev.participants as any) || [];
        const assigned: string[] = (ev.assignedTo as any) || [];
        const isChild = pts.some(p => p.member_id === child.id && p.role === "participant") || assigned.includes(child.id);
        const noDriver = !pts.some(p => p.role === "driver");
        const noGaps = ((ev.gaps as string[]) || []).length === 0;
        return isChild && noDriver && noGaps && ev.locationName;
      })
      .map(ev => ev.locationName!);

    const freq = countFreq(locationsNoDriver);
    for (const [location, count] of Object.entries(freq)) {
      const routeKey = buildRouteKey(location);
      if (count >= 4 && !trustedRoutes.includes(routeKey)) {
        suggestions.push({
          type: "add_trusted_route",
          member_id: child.id,
          text: `Ho notato che ${child.name} va a ${location} da solo da ${count} settimane. Aggiungo questo percorso ai suoi percorsi autonomi?`,
          payload: { location, member_id: child.id, route_key: routeKey },
        });
      }
    }

    // PATTERN 2: stesso genitore porta sempre il bambino in posto specifico (≥ 3 volte)
    const driverPatterns = pastEvents
      .filter(ev => {
        const pts: any[] = (ev.participants as any) || [];
        const assigned: string[] = (ev.assignedTo as any) || [];
        return (pts.some(p => p.member_id === child.id && p.role === "participant") || assigned.includes(child.id)) && ev.locationName;
      })
      .map(ev => {
        const pts: any[] = (ev.participants as any) || [];
        const driverId = pts.find(p => p.role === "driver")?.member_id;
        return { location: ev.locationName!, driver_id: driverId };
      })
      .filter(d => d.driver_id);

    const patternFreq = countFreq(driverPatterns.map(d => `${d.driver_id}::${d.location}`));
    for (const [key, count] of Object.entries(patternFreq)) {
      if (count >= 3) {
        const [driverId, location] = key.split("::");
        const driver = allMembers.find(m => m.id === driverId);
        if (!driver) continue;
        const total = driverPatterns.filter(d => d.location === location).length;
        const consistency = count / total;
        if (consistency >= 0.8) {
          suggestions.push({
            type: "recurring_driver",
            member_id: child.id,
            text: `${driver.name} porta sempre ${child.name} a ${location}. Vuoi renderlo automatico?`,
            payload: { driver_id: driverId, member_id: child.id, location },
          });
        }
      }
    }
  }

  return suggestions;
}
