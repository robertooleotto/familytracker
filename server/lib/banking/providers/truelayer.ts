/**
 * TrueLayer adapter — wraps the legacy `server/truelayer.ts` low-level client
 * with the unified BankingProvider interface.
 *
 * TrueLayer has no separate "list institutions" endpoint we use here; the
 * provider list is encoded in the auth URL itself, so getInstitutions() returns
 * an empty list and the UI is expected to fall back to the hosted picker.
 */

import * as tl from "../../../truelayer";
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

export const truelayerProvider: BankingProvider = {
  id: "truelayer",

  isConfigured() {
    return tl.isConfigured();
  },

  async getInstitutions(_country?: string): Promise<BankingInstitution[]> {
    // TrueLayer's hosted bank picker handles selection — no list needed here.
    return [];
  },

  async startConnection(params: StartConnectionParams): Promise<StartConnectionResult> {
    const authUrl = tl.buildAuthUrl(params.redirectUri, params.state, params.institutionId || undefined);
    return { authUrl, credentials: {} };
  },

  async finalizeConnection(_ctx, params: FinalizeConnectionParams): Promise<ConnectionCredentials> {
    const code = params.callback.code;
    if (!code) throw new Error("TrueLayer: callback senza authorization code");
    const token = await tl.exchangeCode(code, params.redirectUri);
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
    };
  },

  async refresh(ctx: ConnectionContext): Promise<ConnectionCredentials | null> {
    if (!ctx.refreshToken) return null;
    const token = await tl.refreshAccessToken(ctx.refreshToken);
    return {
      accessToken: token.accessToken,
      refreshToken: token.refreshToken,
      tokenExpiresAt: token.expiresAt,
    };
  },

  async listAccounts(ctx: ConnectionContext): Promise<NormalizedAccount[]> {
    if (!ctx.accessToken) return [];
    const accounts = await tl.getAccounts(ctx.accessToken);
    const out: NormalizedAccount[] = [];
    for (const a of accounts) {
      const balance = await tl.getAccountBalance(a.account_id, ctx.accessToken);
      out.push({
        externalAccountId: a.account_id,
        name: a.display_name || a.provider?.display_name || "Conto",
        type: a.account_type ?? null,
        iban: a.account_number?.iban ?? null,
        currency: a.currency || "EUR",
        balance: balance?.current ?? null,
        available: balance?.available ?? null,
      });
    }
    return out;
  },

  async listTransactions(ctx: ConnectionContext, externalAccountId: string, options): Promise<NormalizedTransaction[]> {
    if (!ctx.accessToken) return [];
    const from = options?.since ? options.since.toISOString().slice(0, 10) : undefined;
    const txs = await tl.getAccountTransactions(externalAccountId, ctx.accessToken, from);
    return txs.map((t) => ({
      externalTransactionId: t.transaction_id,
      bookedAt: new Date(t.timestamp),
      valueAt: null,
      amount: Number(t.amount),
      currency: t.currency || "EUR",
      description: t.description ?? null,
      counterparty: t.merchant_name ?? null,
      category: t.transaction_category ?? null,
      rawPayload: t as unknown as Record<string, unknown>,
    }));
  },

  async revoke(ctx: ConnectionContext): Promise<void> {
    if (!ctx.accessToken) return;
    try {
      await tl.deleteConnection(ctx.accessToken);
    } catch (e) {
      console.warn("[truelayer] revoke failed", e);
    }
  },
};
