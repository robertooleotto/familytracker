import { db } from "../db";
import { profiles } from "@shared/schema";
import { eq } from "drizzle-orm";
import type { Profile, Event } from "@shared/schema";

// ── Tipi ────────────────────────────────────────────────────────────────────
export interface AutonomyResult {
  needed: boolean;
  reason: "can_drive" | "no_travel" | "adult" | "walkable" | "trusted_route" | "bus_feasible" | "bike_route" | "no_autonomous_option";
  distance_km?: number;
  route_label?: string;
  suggestion?: string;
  alternatives_checked?: string[];
}

// ── Calcolo età ──────────────────────────────────────────────────────────────
export function calcAge(birthDate: string | null | undefined): number {
  if (!birthDate) return 99;
  const birth = new Date(birthDate);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ── Distanza Haversine semplificata (km) ─────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Chiave percorso trusted (nome destinazione normalizzato) ─────────────────
export function buildRouteKey(locationName: string): string {
  return locationName.toLowerCase().trim().replace(/\s+/g, "_");
}

// ── MOTORE CENTRALE: needsDriver() ──────────────────────────────────────────
export async function needsDriver(event: Event, member: Profile): Promise<AutonomyResult> {
  const autonomy = (member.autonomy as any) || {};
  const transport = (member.transport as any) || {};

  // CASO 1: ha la patente → guida da solo
  if (transport.has_driving_license) {
    return { needed: false, reason: "can_drive" };
  }

  // CASO 2: adulto (>= 18, nessun profilo bambino) → non serve driver
  const age = calcAge(member.birthDate as string | null);
  if (age >= 18 && member.role !== "child") {
    return { needed: false, reason: "adult" };
  }

  // CASO 3: nessuna location → non c'è spostamento
  if (!event.locationName || event.locationName.toLowerCase().includes("casa")) {
    return { needed: false, reason: "no_travel" };
  }

  // CASO 4: percorso fidato (trusted_routes per nome)
  const routeKey = buildRouteKey(event.locationName);
  const trustedRoutes: string[] = autonomy.trusted_routes || [];
  const trustedLabels: Record<string, string> = autonomy.trusted_route_labels || {};
  if (trustedRoutes.includes(routeKey)) {
    return {
      needed: false,
      reason: "trusted_route",
      route_label: trustedLabels[routeKey] || event.locationName,
    };
  }

  // CASO 5: distanza camminabile (usiamo distanza simbolica: max_walk_distance_km)
  const maxWalk = autonomy.max_walk_distance_km || 0;
  // Senza geocoding reale usiamo una stima: se max_walk > 0 e il nome non include "stadio/arena/palazzetto"
  const farKeywords = /stadio|arena|palazzetto|centro\s+sport|piscina\s+olimp/i;
  if (maxWalk > 0 && !farKeywords.test(event.locationName)) {
    return { needed: false, reason: "walkable" };
  }

  // CASO 6: può usare i mezzi pubblici (>= 12 anni)
  if (transport.can_use_bus && age >= 12) {
    return {
      needed: false,
      reason: "bus_feasible",
      suggestion: `${member.name} può prendere il bus`,
    };
  }

  // CASO 7: bicicletta e percorso consentito
  if (transport.has_bike) {
    const bikeRoutes: string[] = transport.bike_allowed_routes || [];
    if (bikeRoutes.includes(routeKey)) {
      return { needed: false, reason: "bike_route" };
    }
  }

  // Nessuna alternativa
  return {
    needed: true,
    reason: "no_autonomous_option",
    alternatives_checked: ["walk", "trusted_route", "bus", "bike"],
  };
}

// ── Calcolo orario partenza (hh:mm) ─────────────────────────────────────────
export function calcDepartureTime(startAt: Date, travelMinutes: number): string {
  const d = new Date(startAt.getTime() - (travelMinutes + 10) * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Stima tempo viaggio (minuti) per nome luogo ──────────────────────────────
export function estimateTravelMin(locationName: string): number {
  const name = locationName.toLowerCase();
  if (/stadio|arena/i.test(name)) return 25;
  if (/piscina|palestra|palazzetto/i.test(name)) return 15;
  if (/centro|piazza|parco/i.test(name)) return 10;
  return 12;
}

// ── Calcola orario ritorno stimato ───────────────────────────────────────────
export function calcReturnTime(endAt: Date | null, travelMinutes: number): string | null {
  if (!endAt) return null;
  const d = new Date(endAt.getTime() + travelMinutes * 60 * 1000);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
