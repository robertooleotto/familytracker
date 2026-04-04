/**
 * Yapily Open Banking Integration
 * https://www.yapily.com — 2,000+ banks, 19 EU countries, 90-99% IT coverage
 * 
 * Flow:
 * 1. List institutions → user selects bank
 * 2. Create authorization → get redirect URL
 * 3. User authenticates with their bank
 * 4. User returns → exchange consent for account access
 * 5. Fetch accounts, balances, transactions
 * 
 * Env vars: YAPILY_APP_ID, YAPILY_SECRET
 * Docs: https://docs.yapily.com/
 */

const YAP_BASE = "https://api.yapily.com";

export function isConfigured(): boolean {
  return !!(process.env.YAPILY_APP_ID && process.env.YAPILY_SECRET);
}

function yapAuth(): string {
  return "Basic " + Buffer.from(`${process.env.YAPILY_APP_ID}:${process.env.YAPILY_SECRET}`).toString("base64");
}

async function yapFetch(path: string, options: RequestInit = {}): Promise<any> {
  const res = await fetch(`${YAP_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "Authorization": yapAuth(),
      ...(options.headers || {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || JSON.stringify(data);
    throw new Error(`Yapily: ${msg}`);
  }
  return data;
}

// Yapily needs a consent token in header for account/transaction calls
async function yapFetchWithConsent(path: string, consentToken: string, options: RequestInit = {}): Promise<any> {
  return yapFetch(path, {
    ...options,
    headers: { "Consent": consentToken, ...(options.headers || {}) },
  });
}

// ─── Institutions (banks) ──────────────────────────────────────────────────

export interface YapInstitution {
  id: string;
  name: string;
  countries: { countryCode2: string }[];
  media: { source: string; type: string }[];
  features: string[];
}

export async function getInstitutions(countryCode = "IT"): Promise<YapInstitution[]> {
  const data = await yapFetch(`/institutions?country=${countryCode.toUpperCase()}`);
  return data.data || data || [];
}

// ─── Authorization (connect bank) ──────────────────────────────────────────

export interface YapAuthResponse {
  id: string;
  authorisationUrl: string;
  qrCodeUrl?: string;
  status: string;
}

export async function createAuthorization(
  institutionId: string,
  callbackUrl: string,
  userUuid: string
): Promise<YapAuthResponse> {
  const data = await yapFetch("/account-auth-requests", {
    method: "POST",
    body: JSON.stringify({
      applicationUserId: userUuid,
      institutionId,
      callback: callbackUrl,
      accountRequest: {
        transactionFrom: new Date(Date.now() - 180 * 86400000).toISOString(),
        featureScope: ["ACCOUNTS", "ACCOUNT", "TRANSACTIONS"],
      },
    }),
  });
  return data.data || data;
}

// ─── Consent exchange ──────────────────────────────────────────────────────

export interface YapConsent {
  id: string;
  consentToken: string;
  status: string;
  institutionId: string;
}

export async function exchangeConsent(consentId: string): Promise<YapConsent> {
  const data = await yapFetch(`/consents/${consentId}`);
  return data.data || data;
}

export async function getConsentByAuth(authId: string): Promise<YapConsent | null> {
  try {
    const data = await yapFetch(`/account-auth-requests/${authId}`);
    const authData = data.data || data;
    if (authData.authorizedAt && authData.consentToken) {
      return {
        id: authData.id,
        consentToken: authData.consentToken,
        status: "AUTHORIZED",
        institutionId: authData.institutionId,
      };
    }
    return null;
  } catch { return null; }
}

// ─── Accounts ──────────────────────────────────────────────────────────────

export interface YapAccount {
  id: string;
  type: string;
  description?: string;
  balance: number;
  currency: string;
  usageType?: string;
  accountType?: string;
  accountNames?: { name: string }[];
  accountIdentifications?: { type: string; identification: string }[];
  accountBalances?: { type: string; balanceAmount: { amount: number; currency: string } }[];
}

export async function getAccounts(consentToken: string): Promise<YapAccount[]> {
  const data = await yapFetchWithConsent("/accounts", consentToken);
  return data.data || data || [];
}

// ─── Transactions ──────────────────────────────────────────────────────────

export interface YapTransaction {
  id?: string;
  date: string;
  bookingDateTime?: string;
  amount: number;
  currency: string;
  description?: string;
  reference?: string;
  merchantName?: string;
  merchantCategoryCode?: string;
  status: string;
  transactionInformation?: string;
}

export async function getTransactions(
  consentToken: string,
  accountId: string,
  fromDate?: string
): Promise<YapTransaction[]> {
  let path = `/accounts/${accountId}/transactions`;
  if (fromDate) path += `?from=${fromDate}`;
  const data = await yapFetchWithConsent(path, consentToken);
  return data.data || data || [];
}

// ─── Delete consent ────────────────────────────────────────────────────────

export async function deleteConsent(consentId: string): Promise<void> {
  try { await yapFetch(`/consents/${consentId}`, { method: "DELETE" }); } catch {}
}
