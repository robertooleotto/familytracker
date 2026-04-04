import type { Express, Request, Response } from "express";
import { auth } from "../lib/routeHelpers";
import { db } from "../db";
import { schoolConnections, schoolGrades, schoolAbsences, schoolHomework, schoolNotices } from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { classevivaLogin, classevivaGrades, classevivaAbsences, classevivaHomework, classevivaNotices } from "../school/classeviva";
import { argoLogin, argoGrades, argoAbsences, argoHomework, argoNotices } from "../school/argo";

export function registerSchoolRoutes(app: Express): void {
  app.get("/api/school/connections", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolConnections).where(eq(schoolConnections.familyId, payload.familyId)).orderBy(desc(schoolConnections.createdAt));
      const safe = rows.map(r => ({ ...r, password: "***" }));
      res.json(safe);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/school/connect", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { platform, username, password, schoolCode, studentName } = req.body;
      if (!platform || !username || !password || !studentName) return res.status(400).json({ message: "Campi obbligatori mancanti" });

      let studentId = "";
      let resolvedName = studentName;
      try {
        if (platform === "classeviva") {
          const session = await classevivaLogin(username, password);
          studentId = session.studentId;
          if (session.firstName || session.lastName) resolvedName = `${session.firstName} ${session.lastName}`.trim();
        } else if (platform === "argo") {
          if (!schoolCode) return res.status(400).json({ message: "Codice scuola obbligatorio per Argo" });
          const session = await argoLogin(schoolCode, username, password);
          studentId = session.studentId;
          if (session.firstName || session.lastName) resolvedName = `${session.firstName} ${session.lastName}`.trim();
        } else {
          return res.status(400).json({ message: "Piattaforma non supportata" });
        }
      } catch (e: any) {
        return res.status(401).json({ message: `Credenziali non valide: ${e.message}` });
      }

      const [conn] = await db.insert(schoolConnections).values({
        familyId: payload.familyId,
        userId: payload.profileId,
        platform,
        studentName: resolvedName,
        schoolCode: schoolCode || null,
        username,
        password,
        studentId,
      }).returning();

      res.json({ ...conn, password: "***" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/school/connections/:id", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const conn = await db.select().from(schoolConnections).where(and(eq(schoolConnections.id, req.params.id), eq(schoolConnections.familyId, payload.familyId)));
      if (!conn.length) return res.status(404).json({ message: "Connessione non trovata" });
      await db.delete(schoolGrades).where(eq(schoolGrades.connectionId, req.params.id));
      await db.delete(schoolAbsences).where(eq(schoolAbsences.connectionId, req.params.id));
      await db.delete(schoolHomework).where(eq(schoolHomework.connectionId, req.params.id));
      await db.delete(schoolNotices).where(eq(schoolNotices.connectionId, req.params.id));
      await db.delete(schoolConnections).where(eq(schoolConnections.id, req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/school/sync/:id", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const [conn] = await db.select().from(schoolConnections).where(and(eq(schoolConnections.id, req.params.id), eq(schoolConnections.familyId, payload.familyId)));
      if (!conn) return res.status(404).json({ message: "Connessione non trovata" });

      let grades: any[] = [], absences: any[] = [], homework: any[] = [], notices: any[] = [];

      if (conn.platform === "classeviva") {
        let session;
        try { session = await classevivaLogin(conn.username, conn.password); }
        catch (e: any) {
          await db.update(schoolConnections).set({ syncError: e.message } as any).where(eq(schoolConnections.id, conn.id));
          return res.status(401).json({ message: `Login fallito: ${e.message}` });
        }
        [grades, absences, homework, notices] = await Promise.all([
          classevivaGrades(session),
          classevivaAbsences(session),
          classevivaHomework(session),
          classevivaNotices(session),
        ]);
      } else if (conn.platform === "argo") {
        let session;
        try { session = await argoLogin(conn.schoolCode!, conn.username, conn.password); }
        catch (e: any) {
          await db.update(schoolConnections).set({ syncError: e.message } as any).where(eq(schoolConnections.id, conn.id));
          return res.status(401).json({ message: `Login fallito: ${e.message}` });
        }
        [grades, absences, homework, notices] = await Promise.all([
          argoGrades(session),
          argoAbsences(session),
          argoHomework(session),
          argoNotices(session),
        ]);
      }

      await db.delete(schoolGrades).where(eq(schoolGrades.connectionId, conn.id));
      await db.delete(schoolAbsences).where(eq(schoolAbsences.connectionId, conn.id));
      await db.delete(schoolHomework).where(eq(schoolHomework.connectionId, conn.id));
      await db.delete(schoolNotices).where(eq(schoolNotices.connectionId, conn.id));

      if (grades.length) await db.insert(schoolGrades).values(grades.map((g: any) => ({ ...g, connectionId: conn.id, familyId: conn.familyId })));
      if (absences.length) await db.insert(schoolAbsences).values(absences.map((a: any) => ({ ...a, connectionId: conn.id, familyId: conn.familyId })));
      if (homework.length) await db.insert(schoolHomework).values(homework.map((h: any) => ({ ...h, connectionId: conn.id, familyId: conn.familyId })));
      if (notices.length) await db.insert(schoolNotices).values(notices.map((n: any) => ({ ...n, connectionId: conn.id, familyId: conn.familyId })));

      await db.update(schoolConnections).set({ lastSync: new Date(), syncError: null } as any).where(eq(schoolConnections.id, conn.id));
      res.json({ grades: grades.length, absences: absences.length, homework: homework.length, notices: notices.length });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/school/grades/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolGrades).where(and(eq(schoolGrades.connectionId, req.params.connectionId), eq(schoolGrades.familyId, payload.familyId))).orderBy(desc(schoolGrades.date));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/school/absences/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolAbsences).where(and(eq(schoolAbsences.connectionId, req.params.connectionId), eq(schoolAbsences.familyId, payload.familyId))).orderBy(desc(schoolAbsences.date));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/school/homework/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolHomework).where(and(eq(schoolHomework.connectionId, req.params.connectionId), eq(schoolHomework.familyId, payload.familyId))).orderBy(desc(schoolHomework.givenAt));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/school/notices/:connectionId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db.select().from(schoolNotices).where(and(eq(schoolNotices.connectionId, req.params.connectionId), eq(schoolNotices.familyId, payload.familyId))).orderBy(desc(schoolNotices.date));
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/school/homework/:id/done", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { done } = req.body;
      await db.update(schoolHomework).set({ done: !!done }).where(and(eq(schoolHomework.id, req.params.id), eq(schoolHomework.familyId, payload.familyId)));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
