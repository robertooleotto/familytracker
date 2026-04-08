/**
 * Salt Edge adapter — wraps `server/saltedge.ts`.
 *
 * Salt Edge's model is different from the OAuth-based providers: instead of
 * tokens, you create a *customer*, then a *connection*, and you reference both
 * by id forever after. We store the customer id in `providerMetadata.customerId`
 * and the connection id in `externalConnectionId`.
 */

import * as se from "../../../saltedge";
import type {
  BankingProvider,
  BankingInstitution,
  ConnectionContext,
  ConnectionCredentials,
  FinalizeConnectionParams,
  NormalizedAccount,
  NormalizedTransaction,
  StartConnectionParams,
  StartConnectionResult,
} from "../types";

export const saltedgeProvider: BankingProvider = {
  id: "saltedge",

  isConfigured() {
    return se.isConfigured();
  },

  async getInstitutions(country = "IT"): Promise<BankingInstitution[]> {
    const providers = await se.getProviders(country);
    return providers.map((p) => ({
      id: p.code,
      name: p.name,
      countryCode: p.country_code,
      logoUrl: p.logo_url ?? null,
    }));
  },

  async startConnection(params: StartConnectionParams): Promise<StartConnectionResult> {
    const customerId = await se.getOrCreateCustomer(`family-${params.familyId}`);
    const session = await se.createConnectSession(
      customerId,
      params.redirectUri,
      params.institutionId,
      params.countryCode || "IT",
    );
    return {
      authUrl: session.connect_url,
      credentials: {
        providerMetadata: { customerId, sessionExpiresAt: session.expires_at },
      },
    };
  },

  async finalizeConnection(ctx, _params: FinalizeConnectionParams): Promise<ConnectionCredentials> {
    // Salt Edge does not give us anything in the redirect — instead we have to
    // ask Salt Edge for the connections that belong to our customer and pick
    // the freshest one. The customer id was stored on startConnection.
    const customerId = ctx.providerMetadata?.customerId as string | undefined;
    if (!customerId) throw new Error("Salt Edge: customerId mancante sulla connessione");
    const connections = await se.getConnections(customerId);
    if (connections.length === 0) throw new Error("Salt Edge: nessuna connessione trovata per questo cliente");
    // Most-recently-active connection wins.
    connections.sort((a, b) => (b.last_success_at ?? "").localeCompare(a.last_success_at ?? ""));
    const conn = connections[0];
    return {
      externalConnectionId: conn.id,
      providerMetadata: { customerId, providerCode: conn.provider_code, providerName: conn.provider_name },
    };
  },

  async refresh(_ctx: ConnectionContext): Promise<ConnectionCredentials | null> {
    // Salt Edge keeps connections alive on its side; nothing to do here.
    return null;
  },

  async listAccounts(ctx: ConnectionContext): Promise<NormalizedAccount[]> {
    if (!ctx.externalConnectionId) return [];
    const accounts = await se.getAccounts(ctx.externalConnectionId);
    return accounts.map((a) => ({
      externalAccountId: a.id,
      name: a.name || "Conto",
      type: a.nature ?? null,
      iban: a.iban || a.extra?.iban || null,
      currency: a.currency_code || "EUR",
      balance: Number(a.balance ?? 0),
      available: Number(a.balance ?? 0),
    }));
  },

  async listTransactions(ctx: ConnectionContext, externalAccountId: string, options): Promise<NormalizedTransaction[]> {
    if (!ctx.externalConnectionId) return [];
    const from = options?.since ? options.since.toISOString().slice(0, 10) : undefined;
    const txs = await se.getTransactions(ctx.externalConnectionId, externalAccountId, from);
    return txs.map((t) => ({
      externalTransactionId: t.id,
      bookedAt: new Date(t.made_on),
      valueAt: null,
      amount: Number(t.amount),
      currency: t.currency_code || "EUR",
      description: t.description ?? null,
      counterparty: t.extra?.merchant_id ?? null,
      category: t.category ?? null,
      rawPayload: t as unknown as Record<string, unknown>,
    }));
  },

  async revoke(ctx: ConnectionContext): Promise<void> {
    if (!ctx.externalConnectionId) return;
    try {
      await se.deleteConnection(ctx.externalConnectionId);
    } catch (e) {
      console.warn("[saltedge] revoke failed", e);
    }
  },
};
