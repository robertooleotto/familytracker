import type { Express } from "express";
import { storage } from "../storage";
import { auth, sanitize } from "../lib/routeHelpers";
import { broadcastToFamily } from "../wsServer";

export function registerMessagesRoutes(app: Express): void {
  app.get("/api/messages", async (req, res) => {
    const a = await auth(req, res);
    if (!a) return;
    try {
      res.json(await storage.getMessagesByFamily(a.familyId));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.post("/api/messages", async (req, res) => {
    const a = await auth(req, res);
    if (!a) return;
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

  app.post("/api/messages/:id/read", async (req, res) => {
    const a = await auth(req, res);
    if (!a) return;
    try {
      await storage.markMessageRead(req.params.id, a.profileId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
