import type { Express } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/requireAuth";

import { validateBody } from "../lib/validate";
import { storage } from "../storage";
import {
  createUploadUrl,
  createDownloadUrl,
  deleteObject,
  pathBelongsToFamily,
} from "../lib/documentStorage";

// ─── Schemas ──────────────────────────────────────────────────────────────────
const uploadUrlSchema = z.object({
  fileName: z.string().trim().min(1).max(200),
  contentType: z
    .string()
    .trim()
    .regex(/^(image\/(jpeg|png|webp|heic|heif)|application\/pdf)$/, {
      message: "Tipo file non supportato. Usa JPG, PNG, WEBP, HEIC o PDF.",
    }),
  fileSize: z.number().int().positive().max(20 * 1024 * 1024).optional(),
});

const createDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200),
  category: z.string().trim().min(1).max(50),
  section: z.enum(["personal", "house"]).default("personal"),
  objectPath: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(200).optional(),
  mimeType: z.string().trim().min(1).max(100).optional(),
  fileSize: z.number().int().positive().optional(),
  notes: z.string().trim().max(2000).optional(),
  isPrivate: z.boolean().optional(),
  expiresAt: z
    .string()
    .datetime({ offset: true })
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

const updateDocumentSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  category: z.string().trim().min(1).max(50).optional(),
  section: z.enum(["personal", "house"]).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  isPrivate: z.boolean().optional(),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
});

// ─── Routes ───────────────────────────────────────────────────────────────────
export function registerDocumentsRoutes(app: Express): void {
  /** Step 1 of upload: ask for a signed PUT URL. */
  app.post(
    "/api/documents/upload-url",
    requireAuth,
    validateBody(uploadUrlSchema),
    async (req, res) => {
      const a = req.auth!;
      try {
        const { fileName, contentType, fileSize } = req.body as z.infer<typeof uploadUrlSchema>;
        const result = await createUploadUrl({
          familyId: a.familyId,
          fileName,
          contentType,
        });
        res.json({ ...result, fileName, contentType, fileSize: fileSize ?? null });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );

  /** Step 2 of upload: persist the metadata row after the file is uploaded. */
  app.post(
    "/api/documents",
    requireAuth,
    validateBody(createDocumentSchema),
    async (req, res) => {
      const a = req.auth!;
      try {
        const body = req.body as z.infer<typeof createDocumentSchema>;
        if (!pathBelongsToFamily(body.objectPath, a.familyId)) {
          return res.status(403).json({ message: "objectPath non appartiene alla tua famiglia" });
        }
        const doc = await storage.createDocument({
          familyId: a.familyId,
          profileId: a.profileId,
          title: body.title,
          category: body.category,
          section: body.section,
          objectPath: body.objectPath,
          fileName: body.fileName ?? null,
          mimeType: body.mimeType ?? null,
          fileSize: body.fileSize ?? null,
          notes: body.notes ?? null,
          isPrivate: body.isPrivate ?? false,
          expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
        });
        res.status(201).json(doc);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );

  /** List all documents the caller is allowed to see (RLS handles privacy). */
  app.get("/api/documents", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const section = typeof req.query.section === "string" ? req.query.section : undefined;
      res.json(await storage.getDocuments(a.familyId, a.profileId, section));
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /** Get a single document's metadata + a fresh signed download URL. */
  app.get("/api/documents/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const doc = await storage.getDocumentById(req.params.id, a.familyId);
      if (!doc) return res.status(404).json({ message: "Documento non trovato" });
      let downloadUrl: string | null = null;
      if (doc.objectPath) {
        downloadUrl = await createDownloadUrl(doc.objectPath);
      }
      res.json({ ...doc, downloadUrl });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /**
   * Convenience: redirect straight to the signed download URL. Browsers can
   * use this as a plain `<a href>` without doing two roundtrips.
   */
  app.get("/api/documents/:id/file", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const doc = await storage.getDocumentById(req.params.id, a.familyId);
      if (!doc) return res.status(404).json({ message: "Documento non trovato" });
      if (!doc.objectPath) return res.status(410).json({ message: "Questo documento non ha un file" });
      const url = await createDownloadUrl(doc.objectPath);
      res.redirect(302, url);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.patch(
    "/api/documents/:id",
    requireAuth,
    validateBody(updateDocumentSchema),
    async (req, res) => {
      const a = req.auth!;
      try {
        const body = req.body as z.infer<typeof updateDocumentSchema>;
        const id = String(req.params.id);
        const updated = await storage.updateDocument(id, a.familyId, {
          ...body,
          expiresAt: body.expiresAt === undefined ? undefined : body.expiresAt ? new Date(body.expiresAt) : null,
        });
        if (!updated) return res.status(404).json({ message: "Documento non trovato" });
        res.json(updated);
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );

  app.delete("/api/documents/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const doc = await storage.getDocumentById(req.params.id, a.familyId);
      if (!doc) return res.status(404).json({ message: "Documento non trovato" });
      if (doc.objectPath) {
        // Best-effort: log but don't fail the row delete if storage delete errors.
        try {
          await deleteObject(doc.objectPath);
        } catch (err) {
          console.error("[documents] storage delete failed", err);
        }
      }
      await storage.deleteDocument(req.params.id, a.familyId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
