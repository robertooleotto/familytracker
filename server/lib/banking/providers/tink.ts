/**
 * Tink (Visa) adapter — wraps `server/tink.ts`.
 *
 * Tink uses a hosted "Tink Link" widget. We list institutions per market for
 * the UI, but the link URL is self-contained — passing a specific
 * `institutionId` simply pre-selects the bank in the picker.
 */

import * as tink from "../../../tink";
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

function parseTinkAmount(val: { unscaledValue: string; scale: string }): number {
  const unscaled = parseInt(val.unscaledValue, 10);
  const scale = parseInt(val.scale, 10);
  return unscaled / Math.pow(10, scale);
}

export const tinkProvider: BankingProvider = {
  id: "tink",

  isConfigured() {
    return tink.isConfigured();
  },

  async getInstitutions(country = "IT"): Promise<BankingInstitution[]> {
    const providers = await tink.getProviders(country);
    return providers.map((p: any) => ({
      id: p.name || p.id,
      name: p.displayName || p.name,
      countryCode: (p.market || country).toUpperCase(),
      logoUrl: p.images?.icon ?? null,
    }));
  },

  async startConnection(params: StartConnectionParams): Promise<StartConnectionResult> {
    const { url } = await tink.createTinkLinkUrl(
      params.redirectUri,
      params.countryCode || "IT",
      `${(params.countryCode || "it").toLowerCase()}_${(params.countryCode || "IT").toUpperCase()}`,
      params.state,
    );
    return {
      authUrl: url,
      credentials: { providerMetadata: { institutionHint: params.institutionId } },
    };
  },

  async finalizeConnection(_ctx, params: FinalizeConnectionParams): Promise<ConnectionCredentials> {
    const code = params.callback.code;
    if (!code) throw new Error("Tink: callback senza code");
    const tokens = await tink.exchangeCode(code);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken || null,
      tokenExpiresAt: tokens.expiresAt,
    };
  },

  async refresh(ctx: ConnectionContext): Promise<ConnectionCredentials | null> {
    if (!ctx.refreshToken) return null;
    const tokens = await tink.refreshAccessToken(ctx.refreshToken);
    return {
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      tokenExpiresAt: tokens.expiresAt,
    };
  },

  async listAccounts(ctx: ConnectionContext): Promise<NormalizedAccount[]> {
    if (!ctx.accessToken) return [];
    const accounts = await tink.getAccounts(ctx.accessToken);
    return accounts.map((a) => {
      const bal = tink.getAccountBalance(a);
      return {
        externalAccountId: a.id,
        name: a.name || "Conto",
        type: a.type ?? null,
        iban: a.iban || a.identifiers?.iban?.iban || null,
        currency: bal?.currency || "EUR",
        balance: bal?.amount ?? null,
        available: bal?.amount ?? null,
      };
    });
  },

  async listTransactions(ctx: ConnectionContext, externalAccountId: string, options): Promise<NormalizedTransaction[]> {
    if (!ctx.accessToken) return [];
    const out: NormalizedTransaction[] = [];
    let pageToken: string | undefined;
    let safety = 10;
    while (safety-- > 0) {
      const { transactions, nextPageToken } = await tink.getTransactions(
        ctx.accessToken,
        externalAccountId,
        pageToken,
      );
      for (const t of transactions) {
        const bookedStr = t.dates?.booked || t.dates?.value;
        if (!bookedStr) continue;
        const bookedAt = new Date(bookedStr);
        if (options?.since && bookedAt < options.since) continue;
        out.push({
          externalTransactionId: t.id,
          bookedAt,
          valueAt: t.dates?.value ? new Date(t.dates.value) : null,
          amount: parseTinkAmount(t.amount.value),
          currency: t.amount.currencyCode || "EUR",
          description: t.descriptions?.display || t.descriptions?.original || null,
          counterparty: t.merchantInformation?.merchantName ?? null,
          category: t.merchantInformation?.merchantCategoryCode ?? null,
          rawPayload: t as unknown as Record<string, unknown>,
        });
      }
      if (!nextPageToken) break;
      pageToken = nextPageToken;
    }
    return out;
  },

  async revoke(_ctx: ConnectionContext): Promise<void> {
    // Tink doesn't expose a simple revoke endpoint on the legacy wrapper.
    // The connection becomes inactive when the token expires. No-op.
  },
};
