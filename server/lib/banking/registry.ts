/**
 * Banking provider registry.
 *
 * Single place where every adapter is wired up. Routes and the sync job ask
 * the registry for a provider by id and never import adapters directly — that
 * keeps it easy to add or remove a provider in one spot.
 */

import type { BankingProvider, BankingProviderId } from "./types";
import { truelayerProvider } from "./providers/truelayer";
import { tinkProvider } from "./providers/tink";
import { saltedgeProvider } from "./providers/saltedge";
import { yapilyProvider } from "./providers/yapily";

const PROVIDERS: Record<BankingProviderId, BankingProvider> = {
  truelayer: truelayerProvider,
  tink: tinkProvider,
  saltedge: saltedgeProvider,
  yapily: yapilyProvider,
};

export function getProvider(id: string): BankingProvider {
  const p = PROVIDERS[id as BankingProviderId];
  if (!p) throw new Error(`Provider banking sconosciuto: ${id}`);
  return p;
}

export function listAvailableProviders(): Array<{ id: BankingProviderId; configured: boolean }> {
  return (Object.keys(PROVIDERS) as BankingProviderId[]).map((id) => ({
    id,
    configured: PROVIDERS[id].isConfigured(),
  }));
}

export function listConfiguredProviders(): BankingProvider[] {
  return Object.values(PROVIDERS).filter((p) => p.isConfigured());
}
