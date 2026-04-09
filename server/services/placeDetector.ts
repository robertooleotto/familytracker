/**
 * Place Detection Engine
 * Detects when a family member is stationary at a location,
 * matches it against known places, or learns new ones.
 */

import { db } from "../db";
import { familyPlaces, visitLog, locations, smartNotifications, shoppingItems } from "@shared/schema";
import { eq, and, gte, desc, isNull, sql } from "drizzle-orm";
import { reverseGeocodeNominatim, searchNearbyPOIs, distanceMeters } from "./geocoding";

const STATIONARY_THRESHOLD_M = 80;  // consider stationary if within 80m of previous
const MIN_STAY_MINUTES = 5;          // minimum time to register a visit
const PLACE_MATCH_RADIUS_M = 100;    // radius to match against known places

/**
 * Find a known family place near these coordinates.
 */
export async function findNearbyPlace(familyId: string, lat: number, lng: number): Promise<typeof familyPlaces.$inferSelect | null> {
  const places = await db.select().from(familyPlaces)
    .where(eq(familyPlaces.familyId, familyId));

  for (const place of places) {
    const dist = distanceMeters(lat, lng, place.lat, place.lng);
    if (dist <= (place.radiusM || PLACE_MATCH_RADIUS_M)) {
      return place;
    }
  }
  return null;
}

/**
 * Record a visit to a place.
 */
export async function recordVisit(
  familyId: string, profileId: string,
  lat: number, lng: number,
  arrivedAt: Date,
  placeId?: string, placeName?: string, placeCategory?: string
): Promise<string> {
  const [visit] = await db.insert(visitLog).values({
    familyId, profileId, lat, lng, arrivedAt,
    placeId: placeId || null,
    placeName: placeName || null,
    placeCategory: placeCategory || null,
  }).returning({ id: visitLog.id });

  // Update place stats if we know the place
  if (placeId) {
    await db.update(familyPlaces).set({
      visitCount: sql`${familyPlaces.visitCount} + 1`,
      lastVisitAt: new Date(),
    }).where(eq(familyPlaces.id, placeId));
  }

  return visit.id;
}

/**
 * Complete a visit (user left the place).
 */
export async function completeVisit(visitId: string, departedAt: Date): Promise<void> {
  const [visit] = await db.select().from(visitLog).where(eq(visitLog.id, visitId)).limit(1);
  if (!visit) return;

  const durationMin = Math.round((departedAt.getTime() - new Date(visit.arrivedAt).getTime()) / 60000);
  await db.update(visitLog).set({ departedAt, durationMin }).where(eq(visitLog.id, visitId));

  // Update avg duration on the place
  if (visit.placeId && durationMin > 0) {
    const place = await db.select().from(familyPlaces).where(eq(familyPlaces.id, visit.placeId)).limit(1);
    if (place[0]) {
      const prevAvg = place[0].avgDurationMin || durationMin;
      const count = place[0].visitCount || 1;
      const newAvg = Math.round((prevAvg * (count - 1) + durationMin) / count);
      await db.update(familyPlaces).set({ avgDurationMin: newAvg }).where(eq(familyPlaces.id, place[0].id));
    }
  }
}

/**
 * Main detection: called when a new GPS location arrives.
 * Determines if user is at a known place, new place, or in transit.
 */
export async function processLocationUpdate(
  familyId: string, profileId: string,
  lat: number, lng: number, isMoving: boolean
): Promise<void> {
  // If user is moving, check if they left a place (complete open visit)
  if (isMoving) {
    const [openVisit] = await db.select().from(visitLog)
      .where(and(
        eq(visitLog.profileId, profileId),
        isNull(visitLog.departedAt),
      ))
      .orderBy(desc(visitLog.arrivedAt))
      .limit(1);

    if (openVisit) {
      await completeVisit(openVisit.id, new Date());
    }
    return;
  }

  // User is stationary — check if already in an open visit
  const [openVisit] = await db.select().from(visitLog)
    .where(and(
      eq(visitLog.profileId, profileId),
      isNull(visitLog.departedAt),
    ))
    .orderBy(desc(visitLog.arrivedAt))
    .limit(1);

  if (openVisit) {
    // Already tracking a visit, check if still at same place
    const dist = distanceMeters(lat, lng, openVisit.lat, openVisit.lng);
    if (dist < STATIONARY_THRESHOLD_M) return; // still there, do nothing

    // Moved to a different stationary spot — close old visit, start new detection
    await completeVisit(openVisit.id, new Date());
  }

  // New stationary position — try to identify the place
  const knownPlace = await findNearbyPlace(familyId, lat, lng);

  if (knownPlace) {
    // Known place — record visit and trigger smart actions
    await recordVisit(familyId, profileId, lat, lng, new Date(), knownPlace.id, knownPlace.name, knownPlace.category || undefined);
    await triggerPlaceActions(familyId, profileId, knownPlace);
  } else {
    // Unknown place — reverse geocode and create notification asking to confirm
    const geocoded = await reverseGeocodeNominatim(lat, lng);
    const nearbyPOIs = await searchNearbyPOIs(lat, lng, 80);

    const bestMatch = nearbyPOIs.length > 0 ? nearbyPOIs[0] : geocoded;
    const placeName = bestMatch?.name || "Luogo sconosciuto";
    const placeCategory = bestMatch?.category || "other";

    // Record visit with provisional place info
    await recordVisit(familyId, profileId, lat, lng, new Date(), undefined, placeName, placeCategory);

    // Only ask to confirm if we found a real POI (not just an address)
    if (nearbyPOIs.length > 0 || (geocoded && geocoded.category !== "other")) {
      // Check we haven't already asked about this location recently
      const recentNotif = await db.select().from(smartNotifications)
        .where(and(
          eq(smartNotifications.profileId, profileId),
          eq(smartNotifications.type, "place_visit"),
          gte(smartNotifications.createdAt, new Date(Date.now() - 24 * 3600000)),
        ))
        .limit(5);

      // Simple dedup: don't ask about the same approximate location twice in a day
      const alreadyAsked = recentNotif.some(n => {
        const payload = n.actionPayload as any;
        if (!payload?.lat || !payload?.lng) return false;
        return distanceMeters(lat, lng, payload.lat, payload.lng) < 200;
      });

      if (!alreadyAsked) {
        const suggestions = nearbyPOIs.slice(0, 3).map(p => ({ name: p.name, category: p.category }));

        await db.insert(smartNotifications).values({
          familyId,
          profileId,
          type: "place_visit",
          title: `Sei stato da ${placeName}?`,
          message: nearbyPOIs.length > 1
            ? `Sembra che tu sia vicino a ${nearbyPOIs.map(p => p.name).join(", ")}. Vuoi salvare questo luogo?`
            : `Ti trovi vicino a ${placeName}. Vuoi salvarlo nei tuoi luoghi?`,
          actionType: "confirm_place",
          actionPayload: { lat, lng, suggestions, geocodedName: placeName, geocodedCategory: placeCategory },
          priority: "normal",
          expiresAt: new Date(Date.now() + 4 * 3600000), // expires in 4 hours
        });
      }
    }
  }
}

/**
 * Trigger smart actions when arriving at a known place.
 */
async function triggerPlaceActions(
  familyId: string, profileId: string,
  place: typeof familyPlaces.$inferSelect
): Promise<void> {
  const category = place.category;

  // Supermarket → show shopping list
  if (category === "supermarket" || category === "pharmacy") {
    const unchecked = await db.select({ name: shoppingItems.name, qty: shoppingItems.qty })
      .from(shoppingItems)
      .where(and(eq(shoppingItems.familyId, familyId), eq(shoppingItems.checked, false)))
      .limit(15);

    if (unchecked.length > 0) {
      const items = unchecked.map(i => `${i.name}${i.qty > 1 ? ` x${i.qty}` : ""}`).join(", ");
      await db.insert(smartNotifications).values({
        familyId,
        profileId,
        type: "proximity",
        title: `🛒 Sei ${category === "pharmacy" ? "in farmacia" : "al supermercato"}!`,
        message: `Hai ${unchecked.length} cose nella lista: ${items}`,
        actionType: "show_shopping",
        actionPayload: { placeId: place.id, itemCount: unchecked.length },
        priority: "high",
        expiresAt: new Date(Date.now() + 2 * 3600000),
      });
    }
  }

  // Any place → check for recurring pattern and suggest next visit
  if (place.visitCount && place.visitCount >= 3) {
    // Check visit frequency
    const recentVisits = await db.select({ arrivedAt: visitLog.arrivedAt })
      .from(visitLog)
      .where(and(eq(visitLog.placeId, place.id), eq(visitLog.profileId, profileId)))
      .orderBy(desc(visitLog.arrivedAt))
      .limit(10);

    if (recentVisits.length >= 3) {
      const intervals = [];
      for (let i = 0; i < recentVisits.length - 1; i++) {
        const diff = new Date(recentVisits[i].arrivedAt).getTime() - new Date(recentVisits[i+1].arrivedAt).getTime();
        intervals.push(diff / 86400000); // days
      }
      const avgIntervalDays = Math.round(intervals.reduce((s, v) => s + v, 0) / intervals.length);

      // Store the pattern in place metadata for future predictions
      await db.update(familyPlaces).set({
        metadata: { ...(place.metadata as any || {}), avgIntervalDays, lastIntervals: intervals.slice(0, 5) },
      }).where(eq(familyPlaces.id, place.id));
    }
  }
}

/**
 * Confirm a place from a smart notification.
 * Creates/updates the family place entry.
 */
export async function confirmPlace(
  familyId: string, profileId: string,
  lat: number, lng: number,
  name: string, category: string
): Promise<string> {
  // Check if a place already exists nearby
  const existing = await findNearbyPlace(familyId, lat, lng);
  if (existing) {
    // Update existing
    await db.update(familyPlaces).set({ name, category, confirmedBy: profileId })
      .where(eq(familyPlaces.id, existing.id));
    return existing.id;
  }

  // Create new place
  const [place] = await db.insert(familyPlaces).values({
    familyId, name, category, lat, lng,
    source: "manual",
    confirmedBy: profileId,
    visitCount: 1,
    lastVisitAt: new Date(),
  }).returning({ id: familyPlaces.id });

  // Link any unlinked visits near this location
  const unlinked = await db.select().from(visitLog)
    .where(and(eq(visitLog.familyId, familyId), isNull(visitLog.placeId)))
    .limit(50);

  for (const v of unlinked) {
    if (distanceMeters(v.lat, v.lng, lat, lng) < PLACE_MATCH_RADIUS_M) {
      await db.update(visitLog).set({ placeId: place.id, placeName: name, placeCategory: category })
        .where(eq(visitLog.id, v.id));
    }
  }

  return place.id;
}
