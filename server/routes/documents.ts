import type { Express, Request, Response } from "express";
import { auth } from "../lib/routeHelpers";
import { storage } from "../storage";

export function registerDocumentsRoutes(app: Express): void {
  app.post("/api/documents/upload-url", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { name, size, contentType } = req.body;
      const uploadURL = await storage.getObjectEntityUploadURL();
      const objectPath = storage.normalizeObjectEntityPath(uploadURL);
      res.json({ uploadURL, objectPath, metadata: { name, size, contentType } });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/documents", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { res.json(await storage.getDocumentsByFamily(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.get("/api/documents/:id/file", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const doc = await storage.getDocumentById(req.params.id, a.familyId);
      if (!doc || !doc.objectPath) return res.status(404).json({ message: "File non trovato" });
      const file = await storage.getObjectEntityFile(doc.objectPath);
      await storage.downloadObject(file, res);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/documents", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, category, objectPath, notes } = req.body;
      if (!title || !objectPath) return res.status(400).json({ message: "title e objectPath obbligatori" });
      const doc = await storage.createDocument({
        familyId: a.familyId,
        title,
        category: category || "other",
        objectPath,
        uploadedBy: a.profileId,
        notes: notes || null,
      });
      res.json(doc);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/documents/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try {
      const { title, category, notes } = req.body;
      const u: Record<string, any> = {};
      if (title !== undefined) u.title = title;
      if (category !== undefined) u.category = category;
      if (notes !== undefined) u.notes = notes;
      await storage.updateDocument(req.params.id, a.familyId, u);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/documents/:id", async (req, res) => {
    const a = await auth(req, res); if (!a) return;
    try { await storage.deleteDocument(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
