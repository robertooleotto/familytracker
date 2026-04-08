import type { Express } from "express";
import { storage } from "../storage";
import { sanitize } from "../lib/routeHelpers";
import { broadcastToFamily } from "../wsServer";
import { requireAuth } from "../lib/requireAuth";

export function registerMessagesRoutes(app: Express): void {
  app.get("/api/messages", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      res.json(await storage.getMessagesByFamily(a.familyId));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/messages", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { body } = req.body;
      if (!body?.trim()) return res.status(400).json({ message: "Empty message" });
      const sanitizedBody = sanitize(body.trim());
      if (!sanitizedBody) return res.status(400).json({ message: "Empty message" });
      const m = await storage.createMessage({
        familyId: a.familyId,
        senderId: a.profileId,
        body: sanitizedBody,
        readBy: [a.profileId],
      });
      broadcastToFamily(a.familyId, { type: "new_message", message: m }, a.profileId);
      res.json(m);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/messages/:id/read", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      await storage.markMessageRead(req.params.id, a.profileId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
