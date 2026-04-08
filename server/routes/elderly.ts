import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../lib/requireAuth";

import { db } from "../db";
import { locations, profileSettings, medConfirmations } from "@shared/schema";
import { eq, and, gte } from "drizzle-orm";
import { broadcastToFamily } from "../wsServer";

export function registerElderlyRoutes(app: Express): void {
  app.get("/api/elderly/vitals/:profileId", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const type = req.query.type as string | undefined;
      const limit = parseInt(req.query.limit as string) || 50;
      res.json(await storage.getVitalSigns(req.params.profileId, type, limit));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/vitals", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { profileId, type, value, value2, unit, notes, measuredAt } = req.body;
      if (!profileId || !type || value === undefined || !unit) return res.status(400).json({ message: "profileId, type, value, unit obbligatori" });
      const vital = await storage.createVitalSign({
        familyId: a.familyId, profileId, type, value: parseFloat(value), value2: value2 ? parseFloat(value2) : null, unit, notes: notes || null,
        measuredAt: measuredAt ? new Date(measuredAt) : new Date(),
      });
      const alert = checkVitalThreshold(type, parseFloat(value), value2 ? parseFloat(value2) : null);
      if (alert) {
        await storage.createElderlyAlert({ familyId: a.familyId, profileId, type: "vital_alert", severity: alert.severity, title: alert.title, description: alert.description });
        broadcastToFamily(a.familyId, { type: "elderly_alert", alertType: "vital_alert", profileId, title: alert.title });
      }
      res.json(vital);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/elderly/vitals/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteVitalSign(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  function checkVitalThreshold(type: string, value: number, value2: number | null): { severity: string; title: string; description: string } | null {
    switch (type) {
      case "blood_pressure":
        if (value >= 180 || (value2 && value2 >= 120)) return { severity: "critical", title: "Pressione molto alta", description: `Pressione ${value}/${value2 || "?"} mmHg — consultare medico urgentemente` };
        if (value >= 140 || (value2 && value2 >= 90)) return { severity: "warning", title: "Pressione alta", description: `Pressione ${value}/${value2 || "?"} mmHg — fuori range normale` };
        if (value < 90 || (value2 && value2 < 60)) return { severity: "warning", title: "Pressione bassa", description: `Pressione ${value}/${value2 || "?"} mmHg — fuori range normale` };
        break;
      case "blood_sugar":
        if (value > 250) return { severity: "critical", title: "Glicemia molto alta", description: `Glicemia ${value} mg/dl — consultare medico` };
        if (value > 180) return { severity: "warning", title: "Glicemia alta", description: `Glicemia ${value} mg/dl` };
        if (value < 70) return { severity: "warning", title: "Glicemia bassa", description: `Glicemia ${value} mg/dl — ipoglicemia` };
        break;
      case "heart_rate":
        if (value > 120) return { severity: "warning", title: "Battito cardiaco alto", description: `FC ${value} bpm a riposo` };
        if (value < 50) return { severity: "warning", title: "Battito cardiaco basso", description: `FC ${value} bpm — bradicardia` };
        break;
      case "temperature":
        if (value >= 39) return { severity: "critical", title: "Febbre alta", description: `Temperatura ${value}°C` };
        if (value >= 37.5) return { severity: "warning", title: "Febbre", description: `Temperatura ${value}°C` };
        break;
      case "oxygen":
        if (value < 90) return { severity: "critical", title: "Saturazione critica", description: `SpO2 ${value}% — cercare assistenza medica` };
        if (value < 95) return { severity: "warning", title: "Saturazione bassa", description: `SpO2 ${value}%` };
        break;
    }
    return null;
  }

  app.get("/api/elderly/checkin/today", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getTodayCheckin(a.profileId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/checkin", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { status, mood, note } = req.body;
      if (!status) return res.status(400).json({ message: "status obbligatorio (ok | help)" });
      const checkin = await storage.upsertDailyCheckin({ familyId: a.familyId, profileId: a.profileId, status, mood: mood || null, note: note || null });
      if (status === "help") {
        await storage.createElderlyAlert({ familyId: a.familyId, profileId: a.profileId, type: "sos", severity: "critical", title: "Richiesta aiuto dal check-in", description: note || "L'utente ha segnalato di aver bisogno di aiuto" });
        broadcastToFamily(a.familyId, { type: "elderly_alert", alertType: "sos", profileId: a.profileId, title: "Richiesta aiuto!" });
      } else {
        broadcastToFamily(a.familyId, { type: "checkin_ok", profileId: a.profileId });
      }
      res.json(checkin);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/checkin/history/:profileId", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getDailyCheckins(req.params.profileId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/emergency-card/:profileId", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getEmergencyCard(req.params.profileId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/emergency-cards", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getEmergencyCardsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/emergency-card", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { profileId, fullName, dateOfBirth, bloodType, allergies, conditions, currentMedications, doctorName, doctorPhone,
        emergencyContact1Name, emergencyContact1Phone, emergencyContact1Relation,
        emergencyContact2Name, emergencyContact2Phone, emergencyContact2Relation, insuranceInfo, notes } = req.body;
      if (!profileId || !fullName) return res.status(400).json({ message: "profileId e fullName obbligatori" });
      const card = await storage.upsertEmergencyCard({
        profileId, familyId: a.familyId, fullName, dateOfBirth, bloodType,
        allergies: allergies || [], conditions: conditions || [], currentMedications: currentMedications || [],
        doctorName, doctorPhone, emergencyContact1Name, emergencyContact1Phone, emergencyContact1Relation,
        emergencyContact2Name, emergencyContact2Phone, emergencyContact2Relation, insuranceInfo, notes,
      });
      res.json(card);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/alerts", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getElderlyAlerts(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/alerts/unacknowledged", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getUnacknowledgedAlerts(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/alerts/:id/acknowledge", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.acknowledgeAlert(req.params.id, a.familyId, a.profileId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/meds/today/:profileId", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const today = new Date().toISOString().split("T")[0];
      res.json(await storage.getMedConfirmations(req.params.profileId, today));
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/meds/confirm", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { medicationId, scheduledTime, status } = req.body;
      if (!medicationId || !scheduledTime) return res.status(400).json({ message: "medicationId e scheduledTime obbligatori" });
      const today = new Date().toISOString().split("T")[0];
      const conf = await storage.upsertMedConfirmation({ medicationId, profileId: a.profileId, familyId: a.familyId, scheduledDate: today, scheduledTime, status: status || "taken" });
      res.json(conf);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/dashboard/:profileId", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const pid = req.params.profileId;
      const profile = await storage.getProfileById(pid);
      if (!profile || profile.familyId !== a.familyId) return res.status(404).json({ message: "Profilo non trovato" });
      const today = new Date().toISOString().split("T")[0];
      const [todayCheckin, recentCheckins, recentAlerts, unackAlerts, todayMeds, recentVitals, emergencyCard, location, settings] = await Promise.all([
        storage.getTodayCheckin(pid),
        storage.getDailyCheckins(pid, 7),
        storage.getElderlyAlerts(a.familyId, 20).then(all => all.filter((al: any) => al.profileId === pid)),
        storage.getUnacknowledgedAlerts(a.familyId).then(all => all.filter((al: any) => al.profileId === pid)),
        storage.getMedConfirmations(pid, today),
        storage.getVitalSigns(pid, undefined, 20),
        storage.getEmergencyCard(pid),
        db.select().from(locations).where(eq(locations.userId, pid)).then(r => r[0] || null),
        db.select().from(profileSettings).where(eq(profileSettings.profileId, pid)).then(r => r[0] || null),
      ]);
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      const weekMeds = await db.select().from(medConfirmations).where(and(eq(medConfirmations.profileId, pid), gte(medConfirmations.scheduledDate, weekAgo)));
      const medsTaken = weekMeds.filter((m: any) => m.status === "taken").length;
      const medsTotal = weekMeds.length;
      const statuses: Record<string, "green" | "yellow" | "red"> = {};
      statuses.checkin = (todayCheckin as any)?.status === "ok" ? "green" : (todayCheckin as any)?.status === "help" ? "red" : "yellow";
      statuses.alerts = unackAlerts.length === 0 ? "green" : unackAlerts.some((al: any) => al.severity === "critical") ? "red" : "yellow";
      statuses.medications = medsTotal === 0 ? "green" : medsTaken / medsTotal > 0.8 ? "green" : medsTaken / medsTotal > 0.5 ? "yellow" : "red";
      statuses.location = location ? "green" : "yellow";
      const latestVitals: Record<string, any> = {};
      for (const v of recentVitals) { if (!latestVitals[v.type]) latestVitals[v.type] = v; }
      res.json({ profile: { id: profile.id, name: profile.name, role: profile.role, colorHex: profile.colorHex }, statuses, todayCheckin, recentCheckins, recentAlerts, unackAlerts, todayMeds, latestVitals, medicationAdherence: medsTotal > 0 ? Math.round((medsTaken / medsTotal) * 100) : null, emergencyCard, location: location ? { lat: location.lat, lng: location.lng, timestamp: location.timestamp, batteryPct: location.batteryPct } : null, settings });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/elderly/members", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getElderlyProfiles(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/fall-detected", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { lat, lng, impactG } = req.body;
      const profile = await storage.getProfileById(a.profileId);
      const alert = await storage.createElderlyAlert({
        familyId: a.familyId, profileId: a.profileId, type: "fall", severity: "critical",
        title: `Possibile caduta rilevata — ${profile?.name || "Utente"}`,
        description: `Impatto ${impactG?.toFixed(1) || "?"} G. Nessuna risposta dopo il countdown.`,
        lat: lat || null, lng: lng || null,
      });
      broadcastToFamily(a.familyId, { type: "elderly_alert", alertType: "fall", profileId: a.profileId, title: `Caduta rilevata! ${profile?.name || ""}`, lat, lng });
      await storage.createMessage({ familyId: a.familyId, senderId: a.profileId, body: `🆘 CADUTA RILEVATA! ${profile?.name} potrebbe essere caduto/a. Posizione condivisa. Impatto: ${impactG?.toFixed(1) || "?"} G`, readBy: [] });
      res.json({ ok: true, alertId: alert.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/elderly/inactivity-alert", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { minutes } = req.body;
      const profile = await storage.getProfileById(a.profileId);
      const alert = await storage.createElderlyAlert({
        familyId: a.familyId, profileId: a.profileId, type: "inactivity", severity: "warning",
        title: `Nessun movimento da ${Math.round(minutes || 0)} minuti — ${profile?.name || "Utente"}`,
        description: "Il telefono non ha registrato movimento significativo.",
      });
      broadcastToFamily(a.familyId, { type: "elderly_alert", alertType: "inactivity", profileId: a.profileId, title: alert.title }, a.profileId);
      res.json({ ok: true, alertId: alert.id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
