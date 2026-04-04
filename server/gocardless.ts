const BASE = "https://bankaccountdata.gocardless.com/api/v2";

type TokenCache = { access: string; expiresAt: number };
let tokenCache: TokenCache | null = null;

export function isConfigured(): boolean {
  return !!(process.env.GOCARDLESS_SECRET_ID && process.env.GOCARDLESS_SECRET_KEY);
}

async function getAccessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) {
    return tokenCache.access;
  }
  const res = await fetch(`${BASE}/token/new/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret_id: process.env.GOCARDLESS_SECRET_ID,
      secret_key: process.env.GOCARDLESS_SECRET_KEY,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.detail || "GoCardless auth failed");
  tokenCache = { access: data.access, expiresAt: Date.now() + data.access_expires * 1000 };
  return data.access;
}

async function gcFetch(path: string, options: RequestInit = {}): Promise<any> {
  const token = await getAccessToken();
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...options.headers,
    },
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export interface Institution {
  id: string;
  name: string;
  bic: string;
  transaction_total_days: string;
  logo: string;
  countries: string[];
}

export async function getInstitutions(country = "IT"): Promise<Institution[]> {
  return gcFetch(`/institutions/?country=${country}`);
}

export interface RequisitionResponse {
  id: string;
  link: string;
  status: string;
  accounts: string[];
}

export async function createRequisition(
  institutionId: string,
  redirectUrl: string,
  reference: string
): Promise<RequisitionResponse> {
  return gcFetch("/requisitions/", {
    method: "POST",
    body: JSON.stringify({
      redirect: redirectUrl,
      institution_id: institutionId,
      reference,
      account_selection: false,
      redirect_immediate: false,
    }),
  });
}

export async function getRequisition(requisitionId: string): Promise<RequisitionResponse> {
  return gcFetch(`/requisitions/${requisitionId}/`);
}

export async function deleteRequisition(requisitionId: string): Promise<void> {
  await gcFetch(`/requisitions/${requisitionId}/`, { method: "DELETE" });
}

export interface AccountDetails {
  id: string;
  iban: string;
  currency: string;
  name: string;
  ownerName: string;
}

export async function getAccountDetails(accountId: string): Promise<AccountDetails> {
  const data = await gcFetch(`/accounts/${accountId}/details/`);
  return data.account;
}

export interface Balance {
  balanceAmount: { amount: string; currency: string };
  balanceType: string;
}

export async function getAccountBalances(accountId: string): Promise<Balance[]> {
  const data = await gcFetch(`/accounts/${accountId}/balances/`);
  return data.balances;
}

export interface Transaction {
  transactionId?: string;
  internalTransactionId?: string;
  transactionAmount: { amount: string; currency: string };
  creditorName?: string;
  debtorName?: string;
  remittanceInformationUnstructured?: string;
  remittanceInformationStructured?: string;
  bookingDate: string;
  valueDate?: string;
  merchantCategoryCode?: string;
}

export interface TransactionsResult {
  booked: Transaction[];
  pending: Transaction[];
}

export async function getAccountTransactions(
  accountId: string,
  dateFrom?: string,
  dateTo?: string
): Promise<TransactionsResult> {
  const params = new URLSearchParams();
  if (dateFrom) params.set("date_from", dateFrom);
  if (dateTo) params.set("date_to", dateTo);
  const qs = params.toString() ? `?${params}` : "";
  const data = await gcFetch(`/accounts/${accountId}/transactions/${qs}`);
  return data.transactions;
}
