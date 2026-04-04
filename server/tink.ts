/**
 * Tink Open Banking Integration (Visa)
 * https://console.tink.com — Free developer signup
 * Covers 3,400+ banks across 18 European markets including Italy
 * 
 * Flow:
 * 1. Create Tink Link URL (hosted bank auth UI)
 * 2. User authenticates with their bank via Tink Link
 * 3. Tink redirects back with authorization code
 * 4. Exchange code for access token
 * 5. Use token to fetch accounts, balances, transactions
 */

const TINK_API = "https://api.tink.com";

// Public client ID for the "Family Tracker" Tink sandbox app
// (visible in console.tink.com → App settings → API client)
const TINK_CLIENT_ID = "8072b08f230f470b8c8f2b4f0743e687";

export function isConfigured(): boolean {
  return !!process.env.TINK_CLIENT_SECRET;
}

interface TinkTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}

// Get client credentials token (for API calls not on behalf of a user)
async function getClientToken(scope = "authorization:grant"): Promise<string> {
  const res = await fetch(`${TINK_API}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TINK_CLIENT_ID,
      client_secret: process.env.TINK_CLIENT_SECRET!,
      grant_type: "client_credentials",
      scope,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errorMessage || data.error_description || "Tink client auth failed");
  return data.access_token;
}

// Create a Tink Link URL for the user to connect their bank.
// Tink requires an Authorization Grant token created server-side, then the
// redirect URI must be registered in console.tink.com → App → Redirect URIs.
export async function createTinkLinkUrl(
  redirectUri: string,
  market: string = "IT",
  locale: string = "it_IT",
  state?: string
): Promise<{ url: string }> {
  // Step 1: Get client credentials token with authorization:grant scope
  const clientToken = await getClientToken("authorization:grant");

  // Step 2: Create an authorization grant (user-delegated token)
  const grantRes = await fetch(`${TINK_API}/api/v1/oauth/authorization-grant/delegate`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Bearer ${clientToken}` },
    body: new URLSearchParams({
      user_hint: `family-${Math.random().toString(36).slice(2, 8)}`,
      scope: "accounts:read,balances:read,transactions:read",
      id_hint: state || "user",
    }),
  });
  const grantData = await grantRes.json();

  let authCode: string | undefined;
  if (grantRes.ok && grantData.code) {
    authCode = grantData.code;
  }
  // If grant creation fails, fall back to direct Tink Link (shows bank picker + login)
  const params = new URLSearchParams({
    client_id: TINK_CLIENT_ID,
    redirect_uri: redirectUri,
    market,
    locale,
    scope: "accounts:read,balances:read,transactions:read",
    response_type: "code",
  });
  if (state) params.set("state", state);
  if (authCode) params.set("authorization_code", authCode);

  const url = `https://link.tink.com/1.0/transactions/connect-accounts?${params}`;
  return { url };
}

// Exchange authorization code for user access token
export async function exchangeCode(code: string): Promise<TinkTokens> {
  const res = await fetch(`${TINK_API}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TINK_CLIENT_ID,
      client_secret: process.env.TINK_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errorMessage || data.error_description || "Tink code exchange failed");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || "",
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    scope: data.scope || "",
  };
}

// Refresh an expired access token
export async function refreshAccessToken(refreshToken: string): Promise<TinkTokens> {
  const res = await fetch(`${TINK_API}/api/v1/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: TINK_CLIENT_ID,
      client_secret: process.env.TINK_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.errorMessage || data.error_description || "Tink refresh failed");
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + (data.expires_in || 3600) * 1000),
    scope: data.scope || "",
  };
}

async function tinkFetch(path: string, accessToken: string): Promise<any> {
  const res = await fetch(`${TINK_API}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export interface TinkAccount {
  id: string;
  name: string;
  type: string;
  iban?: string;
  balances: {
    booked?: { amount: { value: { unscaledValue: string; scale: string }; currencyCode: string } };
    available?: { amount: { value: { unscaledValue: string; scale: string }; currencyCode: string } };
  };
  identifiers?: { iban?: { iban: string }; financialInstitution?: { name: string; logo?: string } };
  financialInstitutionId?: string;
}

export async function getAccounts(accessToken: string): Promise<TinkAccount[]> {
  const data = await tinkFetch("/data/v2/accounts", accessToken);
  return data.accounts || [];
}

function parseAmount(val: { unscaledValue: string; scale: string }): number {
  const unscaled = parseInt(val.unscaledValue);
  const scale = parseInt(val.scale);
  return unscaled / Math.pow(10, scale);
}

export function getAccountBalance(account: TinkAccount): { amount: number; currency: string } | null {
  const bal = account.balances?.available || account.balances?.booked;
  if (!bal?.amount) return null;
  return {
    amount: parseAmount(bal.amount.value),
    currency: bal.amount.currencyCode,
  };
}

export interface TinkTransaction {
  id: string;
  amount: { value: { unscaledValue: string; scale: string }; currencyCode: string };
  descriptions: { original?: string; display?: string };
  dates: { booked?: string; value?: string };
  types: { type?: string };
  merchantInformation?: { merchantName?: string; merchantCategoryCode?: string };
  status?: string;
}

export async function getTransactions(accessToken: string, accountId: string, pageToken?: string): Promise<{ transactions: TinkTransaction[]; nextPageToken?: string }> {
  let path = `/data/v2/transactions?accountIdIn=${accountId}&pageSize=100`;
  if (pageToken) path += `&pageToken=${pageToken}`;
  const data = await tinkFetch(path, accessToken);
  return {
    transactions: data.transactions || [],
    nextPageToken: data.nextPageToken || undefined,
  };
}

// Get provider/institution info
export async function getProviders(market: string = "IT"): Promise<any[]> {
  try {
    const clientToken = await getClientToken("providers:read");
    const data = await tinkFetch(`/api/v1/providers/${market}`, clientToken);
    return data.providers || [];
  } catch {
    return [];
  }
}
