/**
 * Banking storage helpers — thin DB layer used by the routes and the sync job.
 *
 * Lives next to the providers (rather than in `server/storage.ts`) because the
 * banking flow has to encrypt/decrypt tokens at the boundary, and these helpers
 * make that automatic. Routes never see ciphertext, providers never see
 * plaintext-on-disk.
 */

import { and, desc, eq } from "drizzle-orm";
import { db } from "../../db";
import {
  bankAccounts,
  bankConnections,
  bankTransactions,
} from "@shared/schema";
import { decryptField, encryptField } from "../routeHelpers";
import type {
  ConnectionContext,
  ConnectionCredentials,
  NormalizedAccount,
  NormalizedTransaction,
} from "./types";

export type BankConnectionRow = typeof bankConnections.$inferSelect;
export type BankAccountRow = typeof bankAccounts.$inferSelect;
export type BankTransactionRow = typeof bankTransactions.$inferSelect;

function safeDecrypt(v: string | null | undefined): string | null {
  if (!v) return null;
  try {
    return decryptField(v);
  } catch (e) {
    console.error("[banking] failed to decrypt token", e);
    return null;
  }
}

/** Build a ConnectionContext (decrypted credentials) from a DB row. */
export function rowToContext(row: BankConnectionRow): ConnectionContext {
  return {
    id: row.id,
    familyId: row.familyId,
    profileId: row.profileId,
    externalConnectionId: row.externalConnectionId ?? null,
    institutionId: row.institutionId,
    accessToken: safeDecrypt(row.accessToken),
    refreshToken: safeDecrypt(row.refreshToken),
    tokenExpiresAt: row.tokenExpiresAt ?? null,
    consentExpiresAt: row.consentExpiresAt ?? null,
    providerMetadata: (row.providerMetadata as Record<string, unknown> | null) ?? null,
  };
}

/** Encrypt the secret bits of a credentials object before persisting. */
function encryptCreds(creds: ConnectionCredentials): Partial<BankConnectionRow> {
  const patch: Partial<BankConnectionRow> = {};
  if (creds.externalConnectionId !== undefined) patch.externalConnectionId = creds.externalConnectionId;
  if (creds.accessToken !== undefined)
    patch.accessToken = creds.accessToken ? encryptField(creds.accessToken) : null;
  if (creds.refreshToken !== undefined)
    patch.refreshToken = creds.refreshToken ? encryptField(creds.refreshToken) : null;
  if (creds.tokenExpiresAt !== undefined) patch.tokenExpiresAt = creds.tokenExpiresAt;
  if (creds.consentExpiresAt !== undefined) patch.consentExpiresAt = creds.consentExpiresAt;
  if (creds.providerMetadata !== undefined)
    patch.providerMetadata = creds.providerMetadata as Record<string, unknown> | null;
  return patch;
}

export async function listConnections(familyId: string): Promise<BankConnectionRow[]> {
  return db
    .select()
    .from(bankConnections)
    .where(eq(bankConnections.familyId, familyId))
    .orderBy(desc(bankConnections.createdAt));
}

export async function getConnection(id: string, familyId: string): Promise<BankConnectionRow | undefined> {
  const [row] = await db
    .select()
    .from(bankConnections)
    .where(and(eq(bankConnections.id, id), eq(bankConnections.familyId, familyId)));
  return row;
}

export async function createPendingConnection(input: {
  familyId: string;
  profileId: string;
  provider: string;
  institutionId: string;
  institutionName: string;
  institutionLogo?: string | null;
  countryCode?: string | null;
  credentials?: ConnectionCredentials;
}): Promise<BankConnectionRow> {
  const [row] = await db
    .insert(bankConnections)
    .values({
      familyId: input.familyId,
      profileId: input.profileId,
      provider: input.provider,
      institutionId: input.institutionId,
      institutionName: input.institutionName,
      institutionLogo: input.institutionLogo ?? null,
      countryCode: input.countryCode ?? null,
      status: "pending",
      ...(input.credentials ? encryptCreds(input.credentials) : {}),
    })
    .returning();
  return row;
}

export async function applyCredentials(
  id: string,
  familyId: string,
  credentials: ConnectionCredentials,
  patch: Partial<BankConnectionRow> = {},
): Promise<void> {
  await db
    .update(bankConnections)
    .set({ ...encryptCreds(credentials), ...patch })
    .where(and(eq(bankConnections.id, id), eq(bankConnections.familyId, familyId)));
}

export async function markConnectionStatus(
  id: string,
  status: string,
  errorMessage?: string | null,
): Promise<void> {
  await db
    .update(bankConnections)
    .set({ status, errorMessage: errorMessage ?? null, lastSyncAt: new Date() })
    .where(eq(bankConnections.id, id));
}

export async function deleteConnection(id: string, familyId: string): Promise<void> {
  // Cascades wipe accounts + transactions automatically.
  await db
    .delete(bankConnections)
    .where(and(eq(bankConnections.id, id), eq(bankConnections.familyId, familyId)));
}

// ─── Accounts ───────────────────────────────────────────────────────────────

export async function listAccountsByConnection(connectionId: string): Promise<BankAccountRow[]> {
  return db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.connectionId, connectionId));
}

export async function listAccountsByFamily(familyId: string): Promise<BankAccountRow[]> {
  return db
    .select()
    .from(bankAccounts)
    .where(eq(bankAccounts.familyId, familyId));
}

/**
 * Upsert (insert or update) a normalised account on a connection. Uses the
 * `(connection_id, external_account_id)` unique index added by the migration.
 */
export async function upsertAccount(
  connectionId: string,
  familyId: string,
  account: NormalizedAccount,
): Promise<BankAccountRow> {
  const [row] = await db
    .insert(bankAccounts)
    .values({
      familyId,
      connectionId,
      externalAccountId: account.externalAccountId,
      name: account.name,
      type: account.type ?? null,
      iban: account.iban ?? null,
      currency: account.currency,
      balance: account.balance != null ? String(account.balance) : null,
      available: account.available != null ? String(account.available) : null,
      lastSyncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [bankAccounts.connectionId, bankAccounts.externalAccountId],
      set: {
        name: account.name,
        type: account.type ?? null,
        iban: account.iban ?? null,
        currency: account.currency,
        balance: account.balance != null ? String(account.balance) : null,
        available: account.available != null ? String(account.available) : null,
        lastSyncedAt: new Date(),
      },
    })
    .returning();
  return row;
}

// ─── Transactions ───────────────────────────────────────────────────────────

export async function upsertTransactions(
  accountId: string,
  familyId: string,
  txs: NormalizedTransaction[],
): Promise<number> {
  if (txs.length === 0) return 0;
  const rows = txs.map((t) => ({
    familyId,
    accountId,
    externalTransactionId: t.externalTransactionId,
    bookedAt: t.bookedAt,
    valueAt: t.valueAt ?? null,
    amount: String(t.amount),
    currency: t.currency,
    description: t.description ?? null,
    counterparty: t.counterparty ?? null,
    category: t.category ?? null,
    rawPayload: (t.rawPayload ?? null) as Record<string, unknown> | null,
  }));
  await db
    .insert(bankTransactions)
    .values(rows)
    .onConflictDoNothing({
      target: [bankTransactions.accountId, bankTransactions.externalTransactionId],
    });
  return rows.length;
}

export async function listTransactionsByAccount(
  accountId: string,
  familyId: string,
  limit = 100,
): Promise<BankTransactionRow[]> {
  return db
    .select()
    .from(bankTransactions)
    .where(and(eq(bankTransactions.accountId, accountId), eq(bankTransactions.familyId, familyId)))
    .orderBy(desc(bankTransactions.bookedAt))
    .limit(limit);
}
