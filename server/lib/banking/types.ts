/**
 * Unified Open Banking provider interface.
 *
 * The app supports several aggregators (TrueLayer, Tink, Salt Edge, Yapily).
 * Each one has its own quirks (OAuth vs hosted widget, different identifiers,
 * different transaction shapes), so we hide them behind a single
 * `BankingProvider` interface and let the registry pick the right adapter at
 * runtime based on the `provider` column on `bank_connections`.
 *
 * The flow is the same for every provider:
 *
 *   1. `getInstitutions(country)` — list banks the user can pick from.
 *   2. `startConnection(...)`     — return a hosted URL the user is sent to.
 *   3. `finalizeConnection(...)`  — exchange whatever the bank sent back
 *                                   (auth code, consent id, …) for tokens we
 *                                   can store on the connection row.
 *   4. `listAccounts(connection)` — fetch the accounts the user has consented
 *                                   to share, normalised.
 *   5. `listTransactions(...)`    — fetch transactions for one account.
 *   6. `refresh(connection)`      — refresh tokens / consent if needed,
 *                                   returning the new credentials to persist.
 *   7. `revoke(connection)`       — best-effort delete on the upstream side.
 *
 * Adapters never read or write the database directly — that's the route /
 * sync-job layer's job. They only translate between our normalised types and
 * each provider's wire format.
 */

export type BankingProviderId = "truelayer" | "tink" | "saltedge" | "yapily";

export interface BankingInstitution {
  id: string;
  name: string;
  countryCode: string;
  logoUrl?: string | null;
}

export interface NormalizedAccount {
  externalAccountId: string;
  name: string;
  type?: string | null;
  iban?: string | null;
  currency: string;
  balance?: number | null;
  available?: number | null;
}

export interface NormalizedTransaction {
  externalTransactionId: string;
  bookedAt: Date;
  valueAt?: Date | null;
  amount: number; // signed: negative = debit, positive = credit
  currency: string;
  description?: string | null;
  counterparty?: string | null;
  category?: string | null;
  rawPayload?: Record<string, unknown>;
}

/** Persistable credentials returned by start/finalize/refresh. */
export interface ConnectionCredentials {
  externalConnectionId?: string | null;
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  consentExpiresAt?: Date | null;
  providerMetadata?: Record<string, unknown> | null;
}

/** Snapshot of a connection row that adapters need to talk to the provider. */
export interface ConnectionContext {
  id: string;
  familyId: string;
  profileId: string;
  externalConnectionId?: string | null;
  institutionId: string;
  /** Decrypted access token, if present. */
  accessToken?: string | null;
  /** Decrypted refresh token, if present. */
  refreshToken?: string | null;
  tokenExpiresAt?: Date | null;
  consentExpiresAt?: Date | null;
  providerMetadata?: Record<string, unknown> | null;
}

export interface StartConnectionParams {
  familyId: string;
  profileId: string;
  institutionId: string;
  countryCode?: string;
  /** URL the bank should redirect to after the user finishes the consent. */
  redirectUri: string;
  /** Opaque state token we can verify on callback. */
  state: string;
}

export interface StartConnectionResult {
  /** URL to send the user to. */
  authUrl: string;
  /** Anything we need to persist on the row before the user comes back. */
  credentials: ConnectionCredentials;
}

export interface FinalizeConnectionParams {
  /** Raw query params the provider redirected back with. */
  callback: Record<string, string | undefined>;
  redirectUri: string;
}

export interface BankingProvider {
  readonly id: BankingProviderId;
  /** Whether the env vars needed to talk to this provider are present. */
  isConfigured(): boolean;

  getInstitutions(countryCode?: string): Promise<BankingInstitution[]>;

  startConnection(params: StartConnectionParams): Promise<StartConnectionResult>;

  /**
   * Exchange whatever the provider sent back for the tokens / ids we will
   * persist on the connection row.
   */
  finalizeConnection(
    ctx: ConnectionContext,
    params: FinalizeConnectionParams,
  ): Promise<ConnectionCredentials>;

  /** Refresh tokens / consent. Returns updated credentials, or null if nothing changed. */
  refresh(ctx: ConnectionContext): Promise<ConnectionCredentials | null>;

  listAccounts(ctx: ConnectionContext): Promise<NormalizedAccount[]>;

  listTransactions(
    ctx: ConnectionContext,
    externalAccountId: string,
    options?: { since?: Date },
  ): Promise<NormalizedTransaction[]>;

  /** Best-effort revoke. Failures should be logged but not thrown. */
  revoke(ctx: ConnectionContext): Promise<void>;
}
