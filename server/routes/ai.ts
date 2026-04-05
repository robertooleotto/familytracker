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
import {
  handleFamilyChat,
  closeConversation,
  listConversations,
  loadConversationHistory,
} from "../ai/features/familyChat";
import {
  handleTutorChat,
  endTutorSession,
  generateTutorReport,
  listTutorSessions,
} from "../ai/features/aiTutor";
import { storage } from "../storage";

export function registerAIRoutes(app: Express): void {
  // ─── Status ─────────────────────────────────────────────────────────────────
  app.get("/api/ai/status", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      res.json({ available: !!process.env.CLAUDE_API_KEY });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Evening Summary ────────────────────────────────────────────────────────
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

  // ─── Spending Forecast ──────────────────────────────────────────────────────
  app.get("/api/ai/forecast", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await generateSpendingForecast(payload.familyId);
      res.json(result ?? { error: "insufficient_data" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Anomaly Detection ──────────────────────────────────────────────────────
  app.get("/api/ai/anomalies", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await detectAnomalies(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Health Score ───────────────────────────────────────────────────────────
  app.get("/api/ai/score", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await calculateHealthScore(payload.familyId);
      res.json(result ?? { score: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Study Planner ──────────────────────────────────────────────────────────
  app.get("/api/ai/study/:childId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await generateStudyPlan(payload.familyId, req.params.childId);
      res.json(result ?? { study_sessions: [] });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Shopping AI ────────────────────────────────────────────────────────────
  app.get("/api/ai/shopping", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const result = await suggestShoppingItems(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Insights ───────────────────────────────────────────────────────────────
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

  // ─── Member Narrative ───────────────────────────────────────────────────────
  app.get("/api/ai/narrative/:memberId", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const narrative = await generateMemberNarrative(payload.familyId, req.params.memberId);
      res.json({ narrative: narrative || "Nessun dato disponibile per generare la narrativa." });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: FAMILY CHAT AI
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/ai/chat
   * Send a message to the family chat assistant.
   * Body: { message: string, conversationId?: string }
   * Returns: { response: string, conversationId: string }
   */
  app.post("/api/ai/chat", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { message, conversationId } = req.body;
      if (!message || typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Il messaggio è obbligatorio." });
      }
      if (message.length > 2000) {
        return res.status(400).json({ message: "Messaggio troppo lungo (max 2000 caratteri)." });
      }

      const result = await handleFamilyChat(
        payload.familyId,
        payload.profileId,
        message.trim(),
        conversationId
      );

      if (!result) {
        return res.status(503).json({
          message: "L'assistente non è disponibile al momento. Riprova tra poco.",
        });
      }

      res.json({ response: result.response, conversationId: result.conversationId, role: "assistant" });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /**
   * GET /api/ai/chat/conversations
   * List user's chat conversations.
   */
  app.get("/api/ai/chat/conversations", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const includeArchived = req.query.archived === "true";
      const conversations = await listConversations(
        payload.familyId,
        payload.profileId,
        "family_chat",
        includeArchived
      );
      res.json(conversations);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  /**
   * GET /api/ai/chat/conversations/:id/messages
   * Load messages for a conversation.
   */
  app.get("/api/ai/chat/conversations/:id/messages", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const messages = await loadConversationHistory(req.params.id, 50);
      res.json(messages);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  /**
   * POST /api/ai/chat/conversations/:id/close
   * Close/archive a conversation.
   */
  app.post("/api/ai/chat/conversations/:id/close", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      await closeConversation(req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Keep legacy endpoint working (redirect to new chat)
  app.post("/api/briefing/chat", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { message } = req.body;
      if (!message) return res.status(400).json({ message: "Message required" });

      const result = await handleFamilyChat(payload.familyId, payload.profileId, message);
      if (!result) {
        return res.status(503).json({ response: "Servizio temporaneamente non disponibile.", role: "assistant" });
      }
      res.json({ response: result.response, conversationId: result.conversationId, role: "assistant" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // PHASE 1: AI TUTOR
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /api/ai/tutor/chat
   * Send a message to the AI tutor.
   * Body: { childId: string, subject: string, message: string, conversationId?: string, topic?: string, difficulty?: string }
   */
  app.post("/api/ai/tutor/chat", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const { childId, subject, message, conversationId, topic, difficulty } = req.body;

      if (!childId || !subject || !message) {
        return res.status(400).json({ message: "childId, subject e message sono obbligatori." });
      }
      if (typeof message !== "string" || message.trim().length === 0) {
        return res.status(400).json({ message: "Il messaggio non può essere vuoto." });
      }
      if (message.length > 3000) {
        return res.status(400).json({ message: "Messaggio troppo lungo (max 3000 caratteri)." });
      }

      const result = await handleTutorChat(
        payload.familyId,
        payload.profileId,
        childId,
        subject,
        message.trim(),
        conversationId,
        topic,
        difficulty
      );

      if (!result) {
        return res.status(503).json({
          message: "Il tutor non è disponibile al momento. Riprova tra poco.",
        });
      }

      res.json({
        response: result.response,
        conversationId: result.conversationId,
        sessionId: result.sessionId,
        role: "assistant",
      });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /**
   * POST /api/ai/tutor/sessions/:id/end
   * End a tutor session and optionally generate a parent report.
   * Body: { generateReport?: boolean }
   */
  app.post("/api/ai/tutor/sessions/:id/end", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const doReport = req.body.generateReport !== false;
      const result = await endTutorSession(req.params.id, doReport);
      if (!result) {
        return res.status(404).json({ message: "Sessione non trovata." });
      }
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  /**
   * GET /api/ai/tutor/sessions/:id/report
   * Get/generate the parent report for a tutor session.
   */
  app.get("/api/ai/tutor/sessions/:id/report", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const report = await generateTutorReport(req.params.id);
      if (!report) {
        return res.status(404).json({ message: "Report non disponibile. La sessione potrebbe essere troppo breve." });
      }
      res.json(report);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  /**
   * GET /api/ai/tutor/sessions?childId=xxx
   * List tutor sessions for a child.
   */
  app.get("/api/ai/tutor/sessions", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const childId = req.query.childId as string;
      if (!childId) {
        return res.status(400).json({ message: "childId è obbligatorio." });
      }
      const sessions = await listTutorSessions(payload.familyId, childId);
      res.json(sessions);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  /**
   * GET /api/ai/tutor/conversations
   * List tutor conversations for the current user.
   */
  app.get("/api/ai/tutor/conversations", async (req, res) => {
    try {
      const payload = await auth(req, res);
      if (!payload) return;
      const includeArchived = req.query.archived === "true";
      const conversations = await listConversations(
        payload.familyId,
        payload.profileId,
        "tutor",
        includeArchived
      );
      res.json(conversations);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
