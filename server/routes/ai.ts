import type { Express, Request, Response } from "express";
import { auth } from "../lib/routeHelpers";
import { db } from "../db";
import { aiInsights, profiles } from "@shared/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { getCached } from "../ai/aiEngine";
import { generateEveningSummary } from "../ai/features/eveningSummary";
import { generateSpendingForecast } from "../ai/features/spendingForecast";
import { detectAnomalies } from "../ai/features/anomalyDetector";
import { calculateHealthScore } from "../ai/features/healthScore";
import { generateStudyPlan } from "../ai/features/studyPlanner";
import { suggestShoppingItems } from "../ai/features/shoppingAI";
import { generateMemberNarrative } from "../ai/features/memberNarrative";
import { storage } from "../storage";

export function registerAIRoutes(app: Express): void {
  app.get("/api/ai/status", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      res.json({ available: !!process.env.CLAUDE_API_KEY });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/summary", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const cached = await getCached(payload.familyId, "evening_summary", 12);
      if (cached) return res.json(cached);
      const fresh = await generateEveningSummary(payload.familyId);
      res.json(fresh ? { text: fresh } : { text: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/forecast", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await generateSpendingForecast(payload.familyId);
      res.json(result ?? { error: "insufficient_data" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/anomalies", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await detectAnomalies(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/score", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await calculateHealthScore(payload.familyId);
      res.json(result ?? { score: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/study/:childId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await generateStudyPlan(payload.familyId, req.params.childId);
      res.json(result ?? { study_sessions: [] });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/shopping", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await suggestShoppingItems(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/insights", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const rows = await db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.familyId, payload.familyId))
        .orderBy(desc(aiInsights.createdAt))
        .limit(20);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/insights/:id/read", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      await db
        .update(aiInsights)
        .set({ readAt: new Date() })
        .where(eq(aiInsights.id, req.params.id) as any);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/ai/narrative/:memberId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const narrative = await generateMemberNarrative(payload.familyId, req.params.memberId);
      res.json({ narrative: narrative || "Nessun dato disponibile per generare la narrativa." });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/briefing/chat", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { message } = req.body;
      if (!message) return res.status(400).json({ message: "Message required" });
      // Placeholder - full implementation would call Claude for conversational briefing
      res.json({ response: "Feature in development", role: "assistant" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
