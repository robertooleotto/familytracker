/**
 * Banking routes — unified Open Banking aggregator API.
 *
 * Backed by `server/lib/banking/`: a strategy registry that delegates to one
 * of the four supported providers (TrueLayer, Tink, Salt Edge, Yapily). The
 * route layer is intentionally provider-agnostic — it just resolves the right
 * adapter from the row's `provider` column and calls into it.
 *
 * Flow:
 *   GET    /api/banking/providers           — list configured aggregators
 *   GET    /api/banking/institutions        — list banks for a country (?provider, ?country)
 *   POST   /api/banking/connections         — start a connect flow → returns auth URL
 *   GET    /api/banking/connections         — list family connections
 *   POST   /api/banking/connections/:id/finalize — exchange callback for tokens
 *   POST   /api/banking/connections/:id/sync     — manual refresh
 *   DELETE /api/banking/connections/:id     — revoke + delete
 *   GET    /api/banking/accounts            — list accounts the family has stored
 *   GET    /api/banking/accounts/:id/transactions — paginated transactions
 */

import type { Express } from "express";
import { z } from "zod";
import { requireAuth } from "../lib/requireAuth";

import { validateBody } from "../lib/validate";
import { getProvider, listAvailableProviders } from "../lib/banking/registry";
import {
  applyCredentials,
  createPendingConnection,
  deleteConnection,
  getConnection,
  listAccountsByConnection,
  listAccountsByFamily,
  listConnections,
  listTransactionsByAccount,
  rowToContext,
} from "../lib/banking/storage";
import { syncOne } from "../lib/banking/syncJob";

const startSchema = z.object({
  provider: z.enum(["truelayer", "tink", "saltedge", "yapily"]),
  institutionId: z.string().trim().min(1),
  institutionName: z.string().trim().min(1).max(120),
  institutionLogo: z.string().trim().url().optional(),
  countryCode: z.string().trim().length(2).optional(),
  redirectUri: z.string().trim().url(),
});

const finalizeSchema = z.object({
  callback: z.record(z.string().optional()),
  redirectUri: z.string().trim().url(),
});

export function registerBankingRoutes(app: Express): void {
  /** List all aggregators known to the registry, with their configured-status. */
  app.get("/api/banking/providers", requireAuth, async (req, res) => {
    const a = req.auth!;
    res.json({ providers: listAvailableProviders() });
  });

  /** List the banks (institutions) a given provider supports for a country. */
  app.get("/api/banking/institutions", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const providerId = String(req.query.provider ?? "");
      const country = typeof req.query.country === "string" ? req.query.country : "IT";
      const provider = getProvider(providerId);
      if (!provider.isConfigured()) {
        return res.status(503).json({ message: `Provider ${providerId} non configurato` });
      }
      const institutions = await provider.getInstitutions(country);
      res.json({ provider: providerId, institutions });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /** Step 1: create a pending connection row + ask the provider for an auth URL. */
  app.post(
    "/api/banking/connections",
    requireAuth,
    validateBody(startSchema),
    async (req, res) => {
      const a = req.auth!;
      try {
        const body = req.body as z.infer<typeof startSchema>;
        const provider = getProvider(body.provider);
        if (!provider.isConfigured()) {
          return res.status(503).json({ message: `Provider ${body.provider} non configurato` });
        }

        const row = await createPendingConnection({
          familyId: a.familyId,
          profileId: a.profileId,
          provider: body.provider,
          institutionId: body.institutionId,
          institutionName: body.institutionName,
          institutionLogo: body.institutionLogo,
          countryCode: body.countryCode,
        });

        const result = await provider.startConnection({
          familyId: a.familyId,
          profileId: a.profileId,
          institutionId: body.institutionId,
          countryCode: body.countryCode,
          redirectUri: body.redirectUri,
          state: row.id,
        });

        if (result.credentials && Object.keys(result.credentials).length > 0) {
          await applyCredentials(row.id, a.familyId, result.credentials);
        }

        res.status(201).json({ connectionId: row.id, authUrl: result.authUrl });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );

  app.get("/api/banking/connections", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const rows = await listConnections(a.familyId);
      // Strip secrets before returning to the client.
      const clean = rows.map((r) => ({
        id: r.id,
        provider: r.provider,
        institutionId: r.institutionId,
        institutionName: r.institutionName,
        institutionLogo: r.institutionLogo,
        countryCode: r.countryCode,
        status: r.status,
        errorMessage: r.errorMessage,
        consentExpiresAt: r.consentExpiresAt,
        lastSyncAt: r.lastSyncAt,
        createdAt: r.createdAt,
      }));
      res.json(clean);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  /** Step 2: exchange the provider callback for tokens, then run an initial sync. */
  app.post(
    "/api/banking/connections/:id/finalize",
    requireAuth,
    validateBody(finalizeSchema),
    async (req, res) => {
      const a = req.auth!;
      try {
        const id = String(req.params.id);
        const row = await getConnection(id, a.familyId);
        if (!row) return res.status(404).json({ message: "Connessione non trovata" });

        const provider = getProvider(row.provider);
        const ctx = rowToContext(row);
        const body = req.body as z.infer<typeof finalizeSchema>;

        const credentials = await provider.finalizeConnection(ctx, {
          callback: body.callback,
          redirectUri: body.redirectUri,
        });
        await applyCredentials(id, a.familyId, credentials, { status: "active" });

        // Hydrate accounts/transactions immediately so the UI is never empty.
        const refreshed = await getConnection(id, a.familyId);
        if (refreshed) {
          const result = await syncOne(refreshed);
          return res.json({ connectionId: id, sync: result });
        }
        res.json({ connectionId: id });
      } catch (e: any) {
        res.status(500).json({ message: e.message });
      }
    },
  );

  app.post("/api/banking/connections/:id/sync", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const id = String(req.params.id);
      const row = await getConnection(id, a.familyId);
      if (!row) return res.status(404).json({ message: "Connessione non trovata" });
      const result = await syncOne(row);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.delete("/api/banking/connections/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const id = String(req.params.id);
      const row = await getConnection(id, a.familyId);
      if (!row) return res.status(404).json({ message: "Connessione non trovata" });
      try {
        const provider = getProvider(row.provider);
        await provider.revoke(rowToContext(row));
      } catch (e) {
        console.warn("[banking] revoke failed (continuing with delete)", e);
      }
      await deleteConnection(id, a.familyId);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/banking/accounts", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const connectionId = typeof req.query.connectionId === "string" ? req.query.connectionId : null;
      const rows = connectionId
        ? await listAccountsByConnection(connectionId)
        : await listAccountsByFamily(a.familyId);
      // Filter to caller's family (defence in depth — listAccountsByConnection
      // does not enforce family scoping by itself).
      const filtered = rows.filter((r) => r.familyId === a.familyId);
      res.json(filtered);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });

  app.get("/api/banking/accounts/:id/transactions", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const id = String(req.params.id);
      const limit = Math.min(Number(req.query.limit) || 100, 500);
      const rows = await listTransactionsByAccount(id, a.familyId, limit);
      res.json(rows);
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
