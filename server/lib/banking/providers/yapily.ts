/**
 * Yapily adapter — wraps `server/yapily.ts`.
 *
 * Yapily uses a per-bank "account auth request": you create one, get a
 * `authorisationUrl`, and on callback you receive a `consent` query param that
 * you exchange (via the auth-request id) for a long-lived consent token. We
 * store the consent token in `accessToken` and the auth request id in
 * `externalConnectionId`.
 */

import * as yap from "../../../yapily";
import { randomUUID } from "node:crypto";
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

export const yapilyProvider: BankingProvider = {
  id: "yapily",

  isConfigured() {
    return yap.isConfigured();
  },

  async getInstitutions(country = "IT"): Promise<BankingInstitution[]> {
    const institutions = await yap.getInstitutions(country);
    return institutions.map((i) => ({
      id: i.id,
      name: i.name,
      countryCode: i.countries?.[0]?.countryCode2 || country,
      logoUrl: i.media?.find((m) => m.type === "icon")?.source || i.media?.[0]?.source || null,
    }));
  },

  async startConnection(params: StartConnectionParams): Promise<StartConnectionResult> {
    const userUuid = `family-${params.familyId}-${randomUUID().slice(0, 8)}`;
    const auth = await yap.createAuthorization(params.institutionId, params.redirectUri, userUuid);
    return {
      authUrl: auth.authorisationUrl,
      credentials: {
        externalConnectionId: auth.id,
        providerMetadata: { applicationUserId: userUuid },
      },
    };
  },

  async finalizeConnection(ctx, _params: FinalizeConnectionParams): Promise<ConnectionCredentials> {
    if (!ctx.externalConnectionId) throw new Error("Yapily: auth request id mancante");
    const consent = await yap.getConsentByAuth(ctx.externalConnectionId);
    if (!consent) throw new Error("Yapily: consenso non ancora autorizzato");
    return {
      accessToken: consent.consentToken,
      providerMetadata: { ...(ctx.providerMetadata ?? {}), consentId: consent.id, institutionId: consent.institutionId },
      // Yapily consents typically last 90 days
      consentExpiresAt: new Date(Date.now() + 90 * 86400000),
    };
  },

  async refresh(_ctx: ConnectionContext): Promise<ConnectionCredentials | null> {
    // Yapily consents are not refreshable — they require user reauthorisation
    // when they expire. Nothing to do here.
    return null;
  },

  async listAccounts(ctx: ConnectionContext): Promise<NormalizedAccount[]> {
    if (!ctx.accessToken) return [];
    const accounts = await yap.getAccounts(ctx.accessToken);
    return accounts.map((a) => {
      const iban = a.accountIdentifications?.find((id) => id.type === "IBAN")?.identification ?? null;
      const closing = a.accountBalances?.find((b) => b.type === "CLOSING_BOOKED" || b.type === "EXPECTED");
      const balanceAmount = closing?.balanceAmount?.amount ?? a.balance;
      return {
        externalAccountId: a.id,
        name: a.accountNames?.[0]?.name || a.description || "Conto",
        type: a.accountType ?? a.type ?? null,
        iban,
        currency: closing?.balanceAmount?.currency || a.currency || "EUR",
        balance: balanceAmount != null ? Number(balanceAmount) : null,
        available: balanceAmount != null ? Number(balanceAmount) : null,
      };
    });
  },

  async listTransactions(ctx: ConnectionContext, externalAccountId: string, options): Promise<NormalizedTransaction[]> {
    if (!ctx.accessToken) return [];
    const from = options?.since ? options.since.toISOString() : undefined;
    const txs = await yap.getTransactions(ctx.accessToken, externalAccountId, from);
    return txs.map((t) => {
      const dateStr = t.bookingDateTime || t.date;
      return {
        externalTransactionId: t.id || `${dateStr}-${t.amount}-${t.reference ?? ""}`,
        bookedAt: new Date(dateStr),
        valueAt: null,
        amount: Number(t.amount),
        currency: t.currency || "EUR",
        description: t.description || t.transactionInformation || null,
        counterparty: t.merchantName ?? null,
        category: t.merchantCategoryCode ?? null,
        rawPayload: t as unknown as Record<string, unknown>,
      };
    });
  },

  async revoke(ctx: ConnectionContext): Promise<void> {
    const consentId = ctx.providerMetadata?.consentId as string | undefined;
    if (!consentId) return;
    try {
      await yap.deleteConsent(consentId);
    } catch (e) {
      console.warn("[yapily] revoke failed", e);
    }
  },
};
