const AUTH_BASE = process.env.TRUELAYER_ENVIRONMENT === "sandbox"
  ? "https://auth.truelayer-sandbox.com"
  : "https://auth.truelayer.com";

const API_BASE = process.env.TRUELAYER_ENVIRONMENT === "sandbox"
  ? "https://api.truelayer-sandbox.com/data/v1"
  : "https://api.truelayer.com/data/v1";

export function isConfigured(): boolean {
  return !!(process.env.TRUELAYER_CLIENT_ID && process.env.TRUELAYER_CLIENT_SECRET);
}

export function buildAuthUrl(redirectUri: string, state: string, providerCode?: string): string {
  const isSandbox = process.env.TRUELAYER_ENVIRONMENT === "sandbox";
  const defaultProviders = isSandbox
    ? "mock it-ob-all it-oauth-all"
    : "it-ob-all it-oauth-all uk-ob-all uk-oauth-all eu-ob-all";
  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.TRUELAYER_CLIENT_ID!,
    scope: "accounts balance transactions offline_access",
    redirect_uri: redirectUri,
    // If a specific bank code is provided, use it to pre-select the bank
    providers: (providerCode && !isSandbox) ? providerCode : defaultProviders,
    state,
  });
  return `${AUTH_BASE}/?${params}`;
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

export async function exchangeCode(code: string, redirectUri: string): Promise<TokenSet> {
  const res = await fetch(`${AUTH_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: process.env.TRUELAYER_CLIENT_ID!,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
      code,
      redirect_uri: redirectUri,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "TrueLayer token exchange failed");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
  };
}

export async function refreshAccessToken(token: string): Promise<TokenSet> {
  const res = await fetch(`${AUTH_BASE}/connect/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: process.env.TRUELAYER_CLIENT_ID!,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
      refresh_token: token,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.error || "TrueLayer token refresh failed");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || token,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
  };
}

async function tlFetch(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data.results ?? data;
}

export interface TlAccount {
  account_id: string;
  account_type: string;
  display_name: string;
  currency: string;
  account_number: { iban?: string; number?: string; sort_code?: string; swift_bic?: string };
  provider: { display_name: string; logo_uri?: string; provider_id: string };
  update_timestamp: string;
}

export async function getAccounts(accessToken: string): Promise<TlAccount[]> {
  return tlFetch("/accounts", accessToken);
}

export interface TlBalance {
  currency: string;
  available: number;
  current: number;
  overdraft?: number;
  update_timestamp: string;
}

export async function getAccountBalance(accountId: string, accessToken: string): Promise<TlBalance | null> {
  try {
    const results = await tlFetch(`/accounts/${accountId}/balance`, accessToken);
    return Array.isArray(results) ? (results[0] ?? null) : results ?? null;
  } catch {
    return null;
  }
}

export interface TlTransaction {
  transaction_id: string;
  timestamp: string;
  description: string;
  transaction_type: string;
  transaction_category: string;
  amount: number;
  currency: string;
  merchant_name?: string;
  running_balance?: { amount: number; currency: string };
}

export async function getAccountTransactions(
  accountId: string,
  accessToken: string,
  from?: string,
  to?: string
): Promise<TlTransaction[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", `${from}T00:00:00Z`);
  if (to) params.set("to", `${to}T23:59:59Z`);
  const qs = params.toString() ? `?${params}` : "";
  try {
    return await tlFetch(`/accounts/${accountId}/transactions${qs}`, accessToken);
  } catch {
    return [];
  }
}

export async function deleteConnection(accessToken: string): Promise<void> {
  try {
    await fetch(`${AUTH_BASE}/api/delete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
    });
  } catch {}
}
