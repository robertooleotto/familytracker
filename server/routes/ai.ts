import type { Express, Request, Response } from "express";
import { requireAuth } from "../lib/requireAuth";

import { db } from "../db";
import { aiInsights, profiles, aiFeedback, familyPlaces, smartNotifications } from "@shared/schema";
import { eq, desc, inArray, and, isNull, gte } from "drizzle-orm";
import { confirmPlace } from "../services/placeDetector";
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
  handleFamilyChatStream,
  handleFamilyChatWithTools,
  closeConversation,
  listConversations,
  loadConversationHistory,
} from "../ai/features/familyChat";
import { scanReceipt } from "../ai/features/receiptScanner";
import { storage } from "../storage";

export function registerAIRoutes(app: Express): void {
  // ─── Status ─────────────────────────────────────────────────────────────────
  app.get("/api/ai/status", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      res.json({ available: !!process.env.CLAUDE_API_KEY });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Evening Summary ────────────────────────────────────────────────────────
  app.get("/api/ai/summary", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const cached = await getCached(payload.familyId, "evening_summary", 12);
      if (cached) return res.json(cached);
      const fresh = await generateEveningSummary(payload.familyId);
      res.json(fresh ? { text: fresh } : { text: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Spending Forecast ──────────────────────────────────────────────────────
  app.get("/api/ai/forecast", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const result = await generateSpendingForecast(payload.familyId);
      res.json(result ?? { error: "insufficient_data" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Anomaly Detection ──────────────────────────────────────────────────────
  app.get("/api/ai/anomalies", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const result = await detectAnomalies(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Health Score ───────────────────────────────────────────────────────────
  app.get("/api/ai/score", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const result = await calculateHealthScore(payload.familyId);
      res.json(result ?? { score: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Study Planner ──────────────────────────────────────────────────────────
  app.get("/api/ai/study/:childId", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const result = await generateStudyPlan(payload.familyId, req.params.childId);
      res.json(result ?? { study_sessions: [] });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Shopping AI ────────────────────────────────────────────────────────────
  app.get("/api/ai/shopping", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const result = await suggestShoppingItems(payload.familyId);
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Insights ───────────────────────────────────────────────────────────────
  app.get("/api/ai/insights", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const rows = await db
        .select()
        .from(aiInsights)
        .where(eq(aiInsights.familyId, payload.familyId))
        .orderBy(desc(aiInsights.createdAt))
        .limit(20);
      res.json(rows);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/insights/:id/read", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      await db
        .update(aiInsights)
        .set({ readAt: new Date() })
        .where(eq(aiInsights.id, req.params.id) as any);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Member Narrative ───────────────────────────────────────────────────────
  app.get("/api/ai/narrative/:memberId", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const narrative = await generateMemberNarrative(payload.familyId, req.params.memberId);
      res.json({ narrative: narrative || "Nessun dato disponibile per generare la narrativa." });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Receipt Scanner ─────────────────────────────────────────────────────────
  app.post("/api/ai/scan-receipt", requireAuth, async (req, res) => {
    try {
      const { image, mediaType } = req.body;
      if (!image || typeof image !== "string") {
        return res.status(400).json({ message: "Immagine base64 obbligatoria" });
      }
      const result = await scanReceipt(image, mediaType || "image/jpeg");
      res.json(result ?? { store: null, items: [], total: 0, category_suggestion: null });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── AI Feedback ─────────────────────────────────────────────────────────────
  app.post("/api/ai/feedback", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const { targetType, targetId, rating, comment, context } = req.body;
      if (!targetType || ![-1, 1].includes(rating)) {
        return res.status(400).json({ message: "targetType e rating (-1 o 1) obbligatori" });
      }
      await db.insert(aiFeedback).values({
        familyId: payload.familyId,
        profileId: payload.profileId,
        targetType,
        targetId: targetId || null,
        rating,
        comment: comment || null,
        context: context || {},
      });
      res.json({ ok: true });
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
  app.post("/api/ai/chat", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
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
   * POST /api/ai/chat/stream
   * Tool-use family chat endpoint using Server-Sent Events.
   * The AI can execute actions (add events, expenses, etc.) via tools.
   * Body: { message: string, conversationId?: string }
   * Streams events: meta, delta, tool, done, error
   */
  app.post("/api/ai/chat/stream", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const { message, conversationId } = req.body;

      if (!message || typeof message !== "string" || message.trim().length === 0) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Il messaggio è obbligatorio." }));
        return;
      }

      if (message.length > 2000) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ message: "Messaggio troppo lungo (max 2000 caratteri)." }));
        return;
      }

      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });

      const sendEvent = (event: string, data: string) => {
        res.write(`event: ${event}\ndata: ${data}\n\n`);
      };

      await handleFamilyChatWithTools(
        payload.familyId,
        payload.profileId,
        message.trim(),
        conversationId,
        sendEvent,
      );

      res.end();
    } catch (e: any) {
      if (!res.headersSent) {
        res.writeHead(500, { "Content-Type": "text/event-stream" });
      }
      res.write(`event: error\ndata: ${JSON.stringify(e.message)}\n\n`);
      res.end();
    }
  });

  /**
   * GET /api/ai/chat/conversations
   * List user's chat conversations.
   */
  app.get("/api/ai/chat/conversations", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
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
  app.get("/api/ai/chat/conversations/:id/messages", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const messages = await loadConversationHistory(req.params.id, 50);
      res.json(messages);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  /**
   * POST /api/ai/chat/conversations/:id/close
   * Close/archive a conversation.
   */
  app.post("/api/ai/chat/conversations/:id/close", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      await closeConversation(req.params.id);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // Keep legacy endpoint working (redirect to new chat)
  app.post("/api/briefing/chat", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const { message } = req.body;
      if (!message) return res.status(400).json({ message: "Message required" });

      const result = await handleFamilyChat(payload.familyId, payload.profileId, message);
      if (!result) {
        return res.status(503).json({ response: "Servizio temporaneamente non disponibile.", role: "assistant" });
      }
      res.json({ response: result.response, conversationId: result.conversationId, role: "assistant" });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Smart Notifications ──────────────────────────────────────────────────
  app.get("/api/ai/notifications", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const rows = await db.select().from(smartNotifications)
        .where(and(
          eq(smartNotifications.familyId, payload.familyId),
          isNull(smartNotifications.dismissedAt),
        ))
        .orderBy(desc(smartNotifications.createdAt))
        .limit(20);

      // Filter out expired
      const now = new Date();
      const active = rows.filter(r => !r.expiresAt || new Date(r.expiresAt) > now);
      res.json(active);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/notifications/:id/dismiss", requireAuth, async (req, res) => {
    try {
      await db.update(smartNotifications)
        .set({ dismissedAt: new Date() })
        .where(eq(smartNotifications.id, req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/notifications/:id/act", requireAuth, async (req, res) => {
    try {
      await db.update(smartNotifications)
        .set({ actedAt: new Date() })
        .where(eq(smartNotifications.id, req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── Places ──────────────────────────────────────────────────────────────
  app.get("/api/ai/places", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const places = await db.select().from(familyPlaces)
        .where(eq(familyPlaces.familyId, payload.familyId))
        .orderBy(desc(familyPlaces.lastVisitAt));
      res.json(places);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/ai/places/confirm", requireAuth, async (req, res) => {
    try {
      const payload = req.auth!;
      const { lat, lng, name, category } = req.body;
      if (!lat || !lng || !name) return res.status(400).json({ message: "lat, lng, name obbligatori" });
      const id = await confirmPlace(payload.familyId, payload.profileId, lat, lng, name, category || "other");
      res.json({ id });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/ai/places/:id", requireAuth, async (req, res) => {
    try {
      await db.delete(familyPlaces).where(eq(familyPlaces.id, req.params.id));
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

}
