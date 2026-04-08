/**
 * Banking sync — refresh tokens and pull new accounts/transactions for a
 * single connection (or every connection in a family).
 *
 * The job is intentionally idempotent: re-running it on the same connection is
 * safe thanks to the `onConflictDo*` upserts in `storage.ts`.
 */

import { getProvider } from "./registry";
import {
  applyCredentials,
  listAccountsByConnection,
  listConnections,
  markConnectionStatus,
  rowToContext,
  upsertAccount,
  upsertTransactions,
  type BankConnectionRow,
} from "./storage";

const TX_LOOKBACK_DAYS = 90;

export interface SyncResult {
  connectionId: string;
  status: "ok" | "needs_reauth" | "error";
  accounts: number;
  transactions: number;
  error?: string;
}

export async function syncConnection(row: BankConnectionRow): Promise<SyncResult> {
  const provider = getProvider(row.provider);
  let ctx = rowToContext(row);

  try {
    // 1. Refresh tokens if the provider supports it.
    if (ctx.tokenExpiresAt && ctx.tokenExpiresAt.getTime() < Date.now() + 60_000) {
      const refreshed = await provider.refresh(ctx);
      if (refreshed) {
        await applyCredentials(row.id, row.familyId, refreshed);
        ctx = { ...ctx, ...refreshed };
      }
    }

    // 2. Pull accounts and upsert them.
    const accounts = await provider.listAccounts(ctx);
    let totalTx = 0;
    const since = new Date(Date.now() - TX_LOOKBACK_DAYS * 86400000);

    for (const account of accounts) {
      const stored = await upsertAccount(row.id, row.familyId, account);
      // 3. Pull transactions per account.
      const txs = await provider.listTransactions(ctx, account.externalAccountId, { since });
      totalTx += await upsertTransactions(stored.id, row.familyId, txs);
    }

    await markConnectionStatus(row.id, "active", null);
    return { connectionId: row.id, status: "ok", accounts: accounts.length, transactions: totalTx };
  } catch (e: any) {
    const message = e?.message ?? String(e);
    const needsReauth = /unauthor|expired|consent|revoked|forbidden/i.test(message);
    await markConnectionStatus(row.id, needsReauth ? "needs_reauth" : "error", message);
    return {
      connectionId: row.id,
      status: needsReauth ? "needs_reauth" : "error",
      accounts: 0,
      transactions: 0,
      error: message,
    };
  }
}

export async function syncFamily(familyId: string): Promise<SyncResult[]> {
  const connections = await listConnections(familyId);
  const out: SyncResult[] = [];
  for (const c of connections) {
    if (c.status === "pending" || c.status === "revoked") continue;
    out.push(await syncConnection(c));
  }
  return out;
}

/**
 * Cheap helper for the route layer: hydrate a connection and run sync once.
 * Used after `finalizeConnection` to immediately pull the freshly-authorised
 * accounts so the user sees them in the UI without waiting for a cron tick.
 */
export async function syncOne(row: BankConnectionRow): Promise<SyncResult> {
  return syncConnection(row);
}

export { listAccountsByConnection };
