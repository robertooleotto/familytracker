/**
 * Salt Edge Open Banking Integration
 * https://www.saltedge.com — 5,000+ banks globally, PSD2 licensed
 * 
 * Flow:
 * 1. Create "connect session" — returns a connect_url
 * 2. User authenticates via Salt Edge Connect widget (hosted)
 * 3. Salt Edge calls your callback or user returns to redirect_url
 * 4. Fetch connection details, accounts, balances, transactions
 * 
 * Env vars: SALTEDGE_APP_ID, SALTEDGE_SECRET
 * Docs: https://docs.saltedge.com/general/v6/
 */

const SE_BASE = "https://www.saltedge.com/api/v6";

export function isConfigured(): boolean {
  return !!(process.env.SALTEDGE_APP_ID && process.env.SALTEDGE_SECRET);
}

function seHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "App-id": process.env.SALTEDGE_APP_ID!,
    "Secret": process.env.SALTEDGE_SECRET!,
  };
}

function seExtractError(body: any, status: number): string {
  // Handle {"status":N,"error":"..."} format
  if (body?.error && typeof body.error === "string") return `${body.error} (HTTP ${status})`;
  // Handle {"error":{"class":"...","message":"..."}} format
  if (body?.error?.message) return body.error.message;
  // Other common formats
  if (body?.error_message) return body.error_message;
  if (body?.message) return body.message;
  return JSON.stringify(body);
}

async function seFetchRaw(path: string, options: RequestInit = {}): Promise<{ ok: boolean; status: number; body: any }> {
  const res = await fetch(`${SE_BASE}${path}`, {
    ...options,
    headers: { ...seHeaders(), ...(options.headers || {}) },
  });
  const text = await res.text();
  let body: any = null;
  try { body = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, body };
}

async function seFetch(path: string, options: RequestInit = {}): Promise<any> {
  const { ok, status, body } = await seFetchRaw(path, options);
  if (!ok) {
    if (body === null) throw new Error(`Salt Edge: risposta non JSON (HTTP ${status}) — piano API insufficiente per questo endpoint`);
    throw new Error(`Salt Edge: ${seExtractError(body, status)}`);
  }
  return body?.data ?? body;
}

async function seFetchFull(path: string, options: RequestInit = {}): Promise<{ data: any; meta?: any }> {
  const { ok, status, body } = await seFetchRaw(path, options);
  if (!ok) {
    if (body === null) throw new Error(`Salt Edge: risposta non JSON (HTTP ${status}) — piano API insufficiente per questo endpoint`);
    throw new Error(`Salt Edge: ${seExtractError(body, status)}`);
  }
  return { data: body?.data ?? body, meta: body?.meta };
}

// ─── Customers ─────────────────────────────────────────────────────────────

export async function createCustomer(identifier: string): Promise<string> {
  const result = await seFetch("/customers", {
    method: "POST",
    body: JSON.stringify({ data: { identifier } }),
  });
  // Salt Edge v6 returns customer_id (not id)
  return result.customer_id ?? result.id;
}

export async function getOrCreateCustomer(identifier: string): Promise<string> {
  try {
    const list = await seFetch(`/customers?identifier=${encodeURIComponent(identifier)}`);
    if (Array.isArray(list) && list.length > 0) {
      return list[0].customer_id ?? list[0].id;
    }
  } catch {}
  return createCustomer(identifier);
}

// ─── Providers (banks) ─────────────────────────────────────────────────────

export interface SeProvider {
  code: string;
  name: string;
  country_code: string;
  logo_url: string;
  status: string;
  regulated: boolean;
}

export async function getProviders(countryCode = "IT"): Promise<SeProvider[]> {
  const all: SeProvider[] = [];
  let fromId: string | undefined;
  let safetyLimit = 20; // max 20 pages = 2000 banks

  while (safetyLimit-- > 0) {
    const url = `/providers?country_code=${countryCode}&include_fake_providers=false${fromId ? `&from_id=${fromId}` : ""}`;
    try {
      const { data, meta } = await seFetchFull(url);
      const page: SeProvider[] = Array.isArray(data) ? data : [];
      all.push(...page);
      const nextId = meta?.next_id;
      if (!nextId || page.length === 0) break;
      fromId = nextId;
    } catch {
      break;
    }
  }

  return all;
}

// ─── Connect Sessions ──────────────────────────────────────────────────────

export interface SeConnectSession {
  connect_url: string;
  expires_at: string;
}

export async function createConnectSession(
  customerId: string,
  redirectUrl: string,
  providerCode?: string,
  countryCode = "IT"
): Promise<SeConnectSession> {
  const attempt: any = {
    return_to: redirectUrl,
  };
  if (providerCode && providerCode !== "_auto_") {
    attempt.provider_code = providerCode;
  } else {
    attempt.country_code = countryCode;
    attempt.allowed_countries = [countryCode];
  }

  const result = await seFetch("/connect_sessions/create", {
    method: "POST",
    body: JSON.stringify({
      data: {
        customer_id: customerId,
        consent: {
          scopes: ["account_details", "transactions_details"],
          from_date: new Date(Date.now() - 180 * 86400000).toISOString().split("T")[0],
          period_days: 90,
        },
        attempt,
      },
    }),
  });
  return { connect_url: result.connect_url, expires_at: result.expires_at };
}

// ─── Connections ───────────────────────────────────────────────────────────

export interface SeConnection {
  id: string;
  provider_code: string;
  provider_name: string;
  country_code: string;
  status: string;
  last_success_at: string | null;
}

export async function getConnections(customerId: string): Promise<SeConnection[]> {
  const result = await seFetch(`/connections?customer_id=${customerId}`);
  return Array.isArray(result) ? result : [];
}

export async function getConnection(connectionId: string): Promise<SeConnection> {
  return seFetch(`/connections/${connectionId}`);
}

export async function deleteConnection(connectionId: string): Promise<void> {
  await seFetch(`/connections/${connectionId}`, { method: "DELETE" });
}

// ─── Accounts ──────────────────────────────────────────────────────────────

export interface SeAccount {
  id: string;
  connection_id: string;
  name: string;
  nature: string;
  currency_code: string;
  balance: number;
  iban: string | null;
  extra: { iban?: string; client_name?: string; [key: string]: any };
}

export async function getAccounts(connectionId: string): Promise<SeAccount[]> {
  const result = await seFetch(`/accounts?connection_id=${connectionId}`);
  return Array.isArray(result) ? result : [];
}

// ─── Transactions ──────────────────────────────────────────────────────────

export interface SeTransaction {
  id: string;
  account_id: string;
  made_on: string;
  amount: number;
  currency_code: string;
  description: string;
  category: string;
  mode: string;
  status: string;
  extra: { merchant_id?: string; original_amount?: number; [key: string]: any };
}

export async function getTransactions(
  connectionId: string,
  accountId: string,
  fromDate?: string,
  toDate?: string
): Promise<SeTransaction[]> {
  let path = `/transactions?connection_id=${connectionId}&account_id=${accountId}`;
  if (fromDate) path += `&from_date=${fromDate}`;
  if (toDate) path += `&to_date=${toDate}`;
  const result = await seFetch(path);
  return Array.isArray(result) ? result : [];
}
