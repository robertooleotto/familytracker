/**
 * Event Reactor — Proactive Intelligence Engine
 * Runs periodically to detect situations that need attention
 * and generates smart notifications.
 */

import { db } from "../db";
import {
  events, profiles, locations, familyPlaces, visitLog,
  smartNotifications, families, shoppingItems, medications,
} from "@shared/schema";
import { eq, and, gte, lte, desc, isNull, sql } from "drizzle-orm";
import { getForecast, isBadWeather, getWeatherDescription, isOutdoorEvent } from "./weatherService";
import { distanceMeters } from "./geocoding";

/**
 * Check weather vs calendar for all families.
 * If tomorrow has bad weather and an outdoor event is scheduled, warn.
 */
export async function checkWeatherCalendarCollisions(familyId: string): Promise<void> {
  // Get family's approximate location from most recent GPS data
  const [latestLoc] = await db.select({ lat: locations.lat, lng: locations.lng })
    .from(locations)
    .where(eq(locations.familyId, familyId))
    .orderBy(desc(locations.timestamp))
    .limit(1);

  if (!latestLoc) return;

  // Get 3-day forecast
  const forecast = await getForecast(latestLoc.lat, latestLoc.lng, 3);
  if (forecast.length === 0) return;

  // Get events for next 3 days
  const now = new Date();
  const threeDays = new Date(now.getTime() + 3 * 86400000);

  const upcomingEvents = await db.select({
    id: events.id, title: events.title, startAt: events.startAt,
    category: events.category, locationName: events.locationName,
    assignedTo: events.assignedTo,
  })
    .from(events)
    .where(and(eq(events.familyId, familyId), gte(events.startAt, now), lte(events.startAt, threeDays)))
    .orderBy(events.startAt);

  for (const event of upcomingEvents) {
    if (!isOutdoorEvent(event.title, event.category, event.locationName)) continue;

    const eventDate = new Date(event.startAt).toISOString().split("T")[0];
    const dayForecast = forecast.find(f => f.date === eventDate);
    if (!dayForecast || !isBadWeather(dayForecast.weatherCode)) continue;

    // Check if we already sent a notification for this event
    const [existing] = await db.select({ id: smartNotifications.id })
      .from(smartNotifications)
      .where(and(
        eq(smartNotifications.familyId, familyId),
        eq(smartNotifications.type, "weather_alert"),
        sql`${smartNotifications.actionPayload}->>'eventId' = ${event.id}`,
      ))
      .limit(1);

    if (existing) continue;

    const dayLabel = eventDate === new Date(now.getTime() + 86400000).toISOString().split("T")[0]
      ? "Domani" : new Date(eventDate).toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "short" });

    await db.insert(smartNotifications).values({
      familyId,
      profileId: null, // notify whole family
      type: "weather_alert",
      title: `⛈️ ${dayLabel}: ${dayForecast.description}`,
      message: `L'evento "${event.title}" potrebbe essere compromesso dal maltempo (${dayForecast.description}, ${dayForecast.tempMax}°C, probabilità precipitazioni ${dayForecast.precipitationProbability}%). Vuoi riprogrammarlo?`,
      actionType: "reschedule_event",
      actionPayload: {
        eventId: event.id,
        eventTitle: event.title,
        eventDate: eventDate,
        weatherCode: dayForecast.weatherCode,
        weatherDesc: dayForecast.description,
        tempMax: dayForecast.tempMax,
        precipProb: dayForecast.precipitationProbability,
      },
      priority: dayForecast.precipitationProbability > 70 ? "high" : "normal",
      expiresAt: new Date(event.startAt),
    });
  }
}

/**
 * Check for recurring visit reminders.
 * If a place is visited every ~N days and it's been N-3 days, suggest scheduling.
 */
export async function checkRecurringVisitReminders(familyId: string): Promise<void> {
  const places = await db.select().from(familyPlaces)
    .where(and(
      eq(familyPlaces.familyId, familyId),
      gte(familyPlaces.visitCount, 3), // at least 3 visits to detect pattern
    ));

  const now = Date.now();

  for (const place of places) {
    const meta = place.metadata as any || {};
    const avgInterval = meta.avgIntervalDays;
    if (!avgInterval || avgInterval < 5 || avgInterval > 90) continue; // ignore very frequent or very infrequent

    const lastVisit = place.lastVisitAt ? new Date(place.lastVisitAt).getTime() : 0;
    if (!lastVisit) continue;

    const daysSinceLastVisit = (now - lastVisit) / 86400000;
    const reminderThreshold = avgInterval - 3; // remind 3 days before expected visit

    if (daysSinceLastVisit < reminderThreshold) continue;
    if (daysSinceLastVisit > avgInterval * 2) continue; // too old, pattern may be broken

    // Check if we already sent a reminder for this place recently
    const [existing] = await db.select({ id: smartNotifications.id })
      .from(smartNotifications)
      .where(and(
        eq(smartNotifications.familyId, familyId),
        eq(smartNotifications.type, "recurring_reminder"),
        gte(smartNotifications.createdAt, new Date(now - avgInterval * 0.5 * 86400000)),
        sql`${smartNotifications.actionPayload}->>'placeId' = ${place.id}`,
      ))
      .limit(1);

    if (existing) continue;

    const expectedDate = new Date(lastVisit + avgInterval * 86400000);
    const dateLabel = expectedDate.toLocaleDateString("it-IT", { weekday: "long", day: "numeric", month: "short" });

    const categoryLabels: Record<string, string> = {
      barber: "dal barbiere", doctor: "dal dottore", dentist: "dal dentista",
      gym: "in palestra", pharmacy: "in farmacia", supermarket: "al supermercato",
    };
    const placeLabel = categoryLabels[place.category || ""] || `da ${place.name}`;

    await db.insert(smartNotifications).values({
      familyId,
      profileId: null,
      type: "recurring_reminder",
      title: `📅 È quasi ora di tornare ${placeLabel}`,
      message: `Di solito vai da ${place.name} ogni ${avgInterval} giorni. L'ultima visita è stata ${Math.round(daysSinceLastVisit)} giorni fa. Vuoi prenotare per ${dateLabel}?`,
      actionType: "call_contact",
      actionPayload: { placeId: place.id, placeName: place.name, expectedDate: expectedDate.toISOString(), avgIntervalDays: avgInterval },
      priority: "normal",
      expiresAt: new Date(now + 5 * 86400000),
    });
  }
}

/**
 * Detect medication reminders.
 * If an active medication hasn't been checked in today, remind.
 */
export async function checkMedicationReminders(familyId: string): Promise<void> {
  const activeMeds = await db.select({
    id: medications.id, name: medications.name,
    dosage: medications.dosage, profileId: medications.profileId,
  })
    .from(medications)
    .where(and(eq(medications.familyId, familyId), eq(medications.active, true)));

  if (activeMeds.length === 0) return;

  const memberNames = await db.select({ id: profiles.id, name: profiles.name })
    .from(profiles).where(eq(profiles.familyId, familyId));
  const nameMap = Object.fromEntries(memberNames.map(m => [m.id, m.name]));

  for (const med of activeMeds) {
    const memberName = nameMap[med.profileId] || "un familiare";

    // Check if we already reminded today
    const today = new Date().toISOString().split("T")[0];
    const [existing] = await db.select({ id: smartNotifications.id })
      .from(smartNotifications)
      .where(and(
        eq(smartNotifications.familyId, familyId),
        eq(smartNotifications.type, "recurring_reminder"),
        gte(smartNotifications.createdAt, new Date(today + "T00:00:00")),
        sql`${smartNotifications.actionPayload}->>'medicationId' = ${med.id}`,
      ))
      .limit(1);

    if (existing) continue;

    await db.insert(smartNotifications).values({
      familyId,
      profileId: med.profileId,
      type: "recurring_reminder",
      title: `💊 Farmaco: ${med.name}`,
      message: `Ricorda che ${memberName} deve prendere ${med.name}${med.dosage ? ` (${med.dosage})` : ""}.`,
      actionType: "dismiss",
      actionPayload: { medicationId: med.id, medicationName: med.name },
      priority: "high",
      expiresAt: new Date(Date.now() + 12 * 3600000),
    });
  }
}

/**
 * Detect routine anomalies.
 * If someone hasn't been seen moving at their usual time, alert.
 */
export async function checkRoutineAnomalies(familyId: string): Promise<void> {
  const now = new Date();
  const hour = now.getHours();

  // Only check during active hours (8-22)
  if (hour < 8 || hour > 22) return;

  // Get family members who are children or elderly (the ones we monitor)
  const monitored = await db.select({ id: profiles.id, name: profiles.name, role: profiles.role })
    .from(profiles)
    .where(and(
      eq(profiles.familyId, familyId),
      sql`${profiles.role} IN ('child', 'elderly')`,
    ));

  for (const member of monitored) {
    // Check last location update
    const [lastLoc] = await db.select({ timestamp: locations.timestamp })
      .from(locations)
      .where(eq(locations.userId, member.id))
      .orderBy(desc(locations.timestamp))
      .limit(1);

    if (!lastLoc) continue;

    const hoursSinceUpdate = (now.getTime() - new Date(lastLoc.timestamp).getTime()) / 3600000;

    // Alert if no GPS update in 3+ hours during daytime (for elderly/children)
    if (hoursSinceUpdate > 3) {
      const [existing] = await db.select({ id: smartNotifications.id })
        .from(smartNotifications)
        .where(and(
          eq(smartNotifications.familyId, familyId),
          eq(smartNotifications.type, "routine_anomaly"),
          gte(smartNotifications.createdAt, new Date(now.getTime() - 6 * 3600000)),
          sql`${smartNotifications.actionPayload}->>'profileId' = ${member.id}`,
        ))
        .limit(1);

      if (existing) continue;

      await db.insert(smartNotifications).values({
        familyId,
        profileId: null, // notify parents
        type: "routine_anomaly",
        title: `📍 Nessun aggiornamento da ${member.name}`,
        message: `Non riceviamo aggiornamenti GPS da ${member.name} da ${Math.round(hoursSinceUpdate)} ore. Potrebbe avere il telefono scarico o la posizione disattivata.`,
        actionType: "dismiss",
        actionPayload: { profileId: member.id, memberName: member.name, hoursSinceUpdate: Math.round(hoursSinceUpdate) },
        priority: member.role === "elderly" ? "high" : "normal",
        expiresAt: new Date(now.getTime() + 6 * 3600000),
      });
    }
  }
}
