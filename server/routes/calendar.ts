import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { safe } from "../lib/routeHelpers";
import { db } from "../db";
import { events, profiles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { broadcastToFamily } from "../wsServer";
import { detectAllGaps } from "../services/gapDetector";
import { needsDriver, buildRouteKey, calcDepartureTime, estimateTravelMin, calcReturnTime } from "../services/autonomyEngine";
import { checkMilestones, respondMilestone } from "../services/milestoneChecker";
import { learnAutonomyPatterns } from "../services/patternLearner";
import { format } from "date-fns";
import { callClaude } from "../ai/aiEngine";
import { saveInsight } from "../ai/aiEngine";
import { requireAuth } from "../lib/requireAuth";

export function registerCalendarRoutes(app: Express): void {
  app.get("/api/events", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getEventsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/events", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { title, description, startAt, endAt, color, reminderMin, assignedTo, category, allDay, locationName, aiSuggested, departureTime } = req.body;
      if (!title || !startAt) return res.status(400).json({ message: "Missing required fields" });
      const e = await storage.createEvent({
        familyId: a.familyId, title,
        description: description || null,
        startAt: new Date(startAt),
        endAt: endAt ? new Date(endAt) : null,
        color: color || "#3B82F6",
        reminderMin: reminderMin ?? 30,
        assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
        category: category || "family",
        allDay: allDay ?? false,
        locationName: locationName || null,
        aiSuggested: aiSuggested ?? false,
        departureTime: departureTime || null,
        createdBy: a.profileId
      });
      res.json(e);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/events/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteEvent(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/events/:id/pickup", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const e = await storage.confirmPickup(req.params.id, a.familyId, a.profileId);
      res.json(e);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── CALENDAR AI ──────────────────────────────────────────────────────────
  app.post("/api/calendar/analyze", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { event } = req.body;
      if (!event) return res.status(400).json({ message: "Missing event" });
      const existing = await storage.getEventsByFamily(a.familyId);
      const members = await storage.getFamilyMembers(a.familyId);
      const isInterrogazione = /interrogazione|verifica|compito in classe/i.test(event.title || "");

      // ── 1. needsDriver() per ogni partecipante (logica deterministica) ──
      const autonomyWarnings: any[] = [];
      const assigned: string[] = event.assignedTo || [];
      for (const memberId of assigned) {
        const member = members.find((m: any) => m.id === memberId);
        if (!member) continue;
        const result = await needsDriver(event, member as any);
        if (result.needed) {
          const travelMin = estimateTravelMin(event.locationName || "");
          const departureTime = calcDepartureTime(new Date(event.startAt), travelMin);
          autonomyWarnings.push({
            member_id: memberId,
            member_name: member.name,
            driver_needed: true,
            departure_time: departureTime,
            reason: result.reason,
          });
        }
      }

      // ── 2. Claude: conflitti + studio slots ──
      const prompt = `Sei l'assistente calendario Kinly. Analizza questo nuovo evento e rispondi SOLO in JSON valido.
NUOVO EVENTO: ${JSON.stringify(event)}
EVENTI ESISTENTI (prossime 2 settimane): ${JSON.stringify(existing.slice(0, 15))}
MEMBRI: ${JSON.stringify(members.map((m: any) => ({ id: m.id, name: m.name })))}
È UN'INTERROGAZIONE: ${isInterrogazione}
Rispondi con questo JSON:
{"conflicts":[{"event_id":"","description":"","severity":"low|medium|high"}],"suggestions":[{"type":"","message":"","action":""}],"departure_time":"HH:MM o null","study_slots":[{"date":"YYYY-MM-DD","time":"HH:MM","duration_min":45,"reason":""}],"weather_alert":null,"load_warning":null}`;
      const raw = await callClaude(prompt, 600);
      let result: any = {};
      try { result = JSON.parse((raw ?? "").trim()); } catch { result = {}; }

      // ── 3. Crea slot di studio per interrogazioni ──
      if (isInterrogazione && Array.isArray(result?.study_slots) && result.study_slots.length > 0) {
        for (const slot of result.study_slots.slice(0, 3)) {
          try {
            await storage.createEvent({
              familyId: a.familyId,
              title: `📚 Studio: ${event.title}`,
              category: "school", color: "#1565C0",
              startAt: new Date(`${slot.date}T${slot.time}:00`),
              endAt: new Date(`${slot.date}T${slot.time}:00`),
              assignedTo: event.assignedTo || [],
              reminderMin: 30, allDay: false,
              aiSuggested: true,
              description: slot.reason || "",
              createdBy: a.profileId,
            });
          } catch {}
        }
      }

      // ── 4. Aggiorna participants + gaps sull'evento se ha un ID ──
      if (event.id && autonomyWarnings.length > 0) {
        const [dbEvent] = await db.select().from(events).where(and(eq(events.id, event.id), eq(events.familyId, a.familyId)));
        if (dbEvent) {
          const travelMin = estimateTravelMin(event.locationName || "");
          const departureTime = calcDepartureTime(new Date(event.startAt), travelMin);
          const returnTime = calcReturnTime(event.endAt ? new Date(event.endAt) : null, travelMin);
          const currentPts: any[] = (dbEvent.participants as any) || [];
          const newPts = assigned.map(mid => ({
            member_id: mid,
            role: "participant" as const,
          }));
          await db.update(events).set({
            participants: [...currentPts.filter(p => !assigned.includes(p.member_id)), ...newPts],
            gaps: ["driver_missing"],
            derived: { departure_time: departureTime, return_time: returnTime ?? undefined, travel_time_min: travelMin },
          }).where(eq(events.id, event.id));
        }
      }

      res.json({ ...result, autonomy_warnings: autonomyWarnings });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/calendar/parse", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { text } = req.body;
      if (!text?.trim()) return res.status(400).json({ message: "Missing text" });
      const members = await storage.getFamilyMembers(a.familyId);
      const today = new Date().toISOString().slice(0, 10);
      const prompt = `Sei l'assistente calendario Kinly. Converti questo testo italiano in un evento strutturato. Rispondi SOLO in JSON valido.
TESTO: "${text}"
MEMBRI FAMIGLIA: ${JSON.stringify(members.map((m: any) => ({ id: m.id, name: m.name })))}
DATA OGGI: ${today}
CATEGORIE DISPONIBILI: school, sport, work, health, family, personal
Rispondi con:
{"title":"","category":"family","date":"YYYY-MM-DD","time":"HH:MM","duration_min":60,"assigned_to":[],"reminder_min":30,"location_name":null,"confidence":0.85,"ai_will_add_study_slots":false}
Se non riesci a estrarre la data, usa domani. Se non sai l'ora, usa 09:00.`;
      const raw = await callClaude(prompt, 400);
      let result: any = {};
      try { result = JSON.parse((raw ?? "").trim()); } catch { result = { title: text, category: "family", date: today, time: "09:00", duration_min: 60, assigned_to: [], confidence: 0.5 }; }
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── GAPS (driver/pickup mancanti) ───────────────────────────────────────
  app.get("/api/gaps", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const gaps = await detectAllGaps(a.familyId);
      res.json(gaps);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/gaps/resolve", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { action_type, payload } = req.body;
      if (!action_type || !payload) return res.status(400).json({ message: "Missing action_type or payload" });

      if (action_type === "assign_driver") {
        const { event_id, driver_id, child_id } = payload;
        if (!event_id || !driver_id) return res.status(400).json({ message: "Missing event_id or driver_id" });

        const [ev] = await db.select().from(events).where(and(eq(events.id, event_id), eq(events.familyId, a.familyId)));
        if (!ev) return res.status(404).json({ message: "Evento non trovato" });

        const currentPts: any[] = (ev.participants as any) || [];
        const travelMin = estimateTravelMin(ev.locationName || "");
        const departureTime = calcDepartureTime(new Date(ev.startAt), travelMin);
        const returnTime = calcReturnTime(ev.endAt ? new Date(ev.endAt) : null, travelMin);
        const currentDerived: any = (ev.derived as any) || {};

        await db.update(events).set({
          participants: [
            ...currentPts.filter(p => p.member_id !== driver_id),
            { member_id: driver_id, role: "driver" },
          ],
          gaps: ((ev.gaps as string[]) || []).filter(g => g !== "driver_missing"),
          derived: {
            ...currentDerived,
            departure_time: currentDerived.departure_time || departureTime,
            return_time: currentDerived.return_time || returnTime,
            travel_time_min: travelMin,
          },
          departureTime: currentDerived.departure_time || departureTime,
        }).where(eq(events.id, event_id));

        const [driver] = await db.select().from(profiles).where(eq(profiles.id, driver_id));
        const [child] = await db.select().from(profiles).where(eq(profiles.id, child_id || ""));
        const childName = child?.name || "il bambino";
        const dept = currentDerived.departure_time || departureTime;

        broadcastToFamily(a.familyId, { type: "gap_resolved", event_id, driver_id, child_id }, undefined);
        return res.json({
          success: true,
          message: `Perfetto! Ho aggiunto il ritiro di ${childName} alle ${format(new Date(ev.startAt), "HH:mm")} al tuo calendario. Parti alle ${dept}.`,
          calendar_updated: true,
        });
      }

      if (action_type === "mark_autonomous") {
        const { event_id, member_id, mode } = payload;
        const [ev] = await db.select().from(events).where(and(eq(events.id, event_id), eq(events.familyId, a.familyId)));
        if (!ev) return res.status(404).json({ message: "Evento non trovato" });

        const currentPts: any[] = (ev.participants as any) || [];
        await db.update(events).set({
          participants: [
            ...currentPts.filter(p => p.member_id !== member_id),
            { member_id, role: "participant", autonomous: true, mode: mode || "walk" },
          ],
          gaps: [],
        }).where(eq(events.id, event_id));

        // Suggerisci di aggiungere percorso trusted
        if (ev.locationName) {
          const [member] = await db.select().from(profiles).where(eq(profiles.id, member_id));
          if (member) {
            await saveInsight(
              a.familyId,
              "autonomy_suggestion",
              `Vuoi aggiungere '${ev.locationName}' ai percorsi autonomi di ${member.name}?`,
              "info",
              { member_id, location: ev.locationName, type: "add_trusted_route" },
            );
          }
        }
        return res.json({ success: true });
      }

      return res.status(400).json({ message: "Tipo di azione non riconosciuto" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── AUTONOMIA PROFILO ────────────────────────────────────────────────────
  app.patch("/api/profiles/:id/autonomy", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { autonomy, transport, birthDate } = req.body;
      const [member] = await db.select().from(profiles).where(and(eq(profiles.id, req.params.id), eq(profiles.familyId, a.familyId)));
      if (!member) return res.status(404).json({ message: "Membro non trovato" });

      const updates: any = {};
      if (autonomy) {
        const curr: any = member.autonomy || {};
        updates.autonomy = { ...curr, ...autonomy };
        // Aggiorna anche trusted_routes
        if (autonomy.new_trusted_route) {
          const key = buildRouteKey(autonomy.new_trusted_route);
          const routes = curr.trusted_routes || [];
          const labels = curr.trusted_route_labels || {};
          if (!routes.includes(key)) {
            updates.autonomy.trusted_routes = [...routes, key];
            updates.autonomy.trusted_route_labels = { ...labels, [key]: autonomy.new_trusted_route };
          }
          delete updates.autonomy.new_trusted_route;
        }
      }
      if (transport) {
        const curr: any = member.transport || {};
        updates.transport = { ...curr, ...transport };
      }
      if (birthDate) updates.birthDate = birthDate;

      const updated = await storage.updateProfile(req.params.id, updates);
      res.json(updated);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── MILESTONE ────────────────────────────────────────────────────────────
  app.get("/api/milestones", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const pending = await checkMilestones(a.familyId);
      res.json(pending);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/milestones/respond", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { member_id, milestone_key, accepted, update_if_yes, update_field } = req.body;
      await respondMilestone(member_id, milestone_key, accepted, update_if_yes || {}, update_field || "autonomy");
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── PATTERN LEARNER (manuale / cron) ────────────────────────────────────
  app.get("/api/autonomy/patterns", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const suggestions = await learnAutonomyPatterns(a.familyId);
      res.json(suggestions);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
