import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Landmark, Trash2, RefreshCw, TrendingDown, TrendingUp,
  CreditCard, CheckCircle2, PlusCircle, Download, Euro,
  Search, X, ArrowRight, Shield, ChevronDown, ChevronUp,
} from "lucide-react";
import { format, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import type { BankConnection } from "@shared/schema";

type SafeConn = Omit<BankConnection, "accessToken" | "refreshToken">;

interface BankStatus { configured: boolean; providers: string[]; environment: string; redirectUri: string | null; needsManualPaste: boolean; }
interface BankResult { id: string; name: string; logo: string | null; country: string; provider: string; providerBankId: string; }
interface AccountBalance { accountId: string; connectionId: string; provider?: string; institutionName: string; institutionLogo: string | null; iban: string | null; name: string | null; amount: number | null; currency: string; }
interface BankTransaction { id: string; accountId: string; connectionId: string; provider?: string; institutionName: string; institutionLogo: string | null; amount: number; currency: string; description: string; counterparty: string | null; date: string; }

function maskIban(iban: string | null) { if (!iban || iban.length < 8) return iban; return iban.slice(0, 4) + " ···· " + iban.slice(-4); }
const PLABEL: Record<string, string> = { tink: "Tink", saltedge: "Salt Edge", yapily: "Yapily", gocardless: "GoCardless", truelayer: "TrueLayer", none: "non configurato" };

export default function BankingPage() {
  const { toast } = useToast();
  const callbackCalledRef = useRef(false);
  const prevLinkedCount = useRef(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [showAllTx, setShowAllTx] = useState(false);
  const [awaitingOAuth, setAwaitingOAuth] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval>>();

  // ── Queries ──────────────────────────────────────────────
  const { data: status } = useQuery<BankStatus>({ queryKey: ["/api/banking/status"] });
  const { data: connections, isLoading: loadingConns } = useQuery<SafeConn[]>({ queryKey: ["/api/banking/connections"], enabled: !!status?.configured });
  const linked = connections?.filter(c => c.status === "linked") ?? [];
  const pending = connections?.filter(c => c.status === "pending") ?? [];
  const hasLinked = linked.length > 0;
  const { data: balances, isLoading: loadingBal, refetch: refetchBal } = useQuery<AccountBalance[]>({ queryKey: ["/api/banking/all/balances"], enabled: hasLinked });
  const { data: transactions, isLoading: loadingTx, refetch: refetchTx } = useQuery<BankTransaction[]>({ queryKey: ["/api/banking/all/transactions"], enabled: hasLinked });

  // Bank search (debounced)
  const { data: searchResults, isLoading: searching } = useQuery<BankResult[]>({
    queryKey: ["/api/banking/banks", debouncedQ],
    queryFn: () => apiRequest("GET", `/api/banking/banks?q=${encodeURIComponent(debouncedQ)}&country=IT`).then(r => r.json()),
    enabled: showSearch && debouncedQ.length >= 1, staleTime: 60000,
  });

  useEffect(() => { if (debounceRef.current) clearTimeout(debounceRef.current); debounceRef.current = setTimeout(() => setDebouncedQ(searchQuery), 300); return () => { if (debounceRef.current) clearTimeout(debounceRef.current); }; }, [searchQuery]);
  useEffect(() => { if (showSearch) setTimeout(() => searchRef.current?.focus(), 100); }, [showSearch]);

  // ── Auto-detect callback from bank redirect ──────────────
  function cleanUrl() { const u = new URL(window.location.href); ["code","state","scope","error","error_description"].forEach(p => u.searchParams.delete(p)); window.history.replaceState({}, "", u.toString()); }

  async function handleCallback(provider: string, code: string, state: string, connId?: string) {
    try {
      // Verify state against saved value to prevent CSRF
      const savedState = sessionStorage.getItem("oauth_state");
      if (!state || state !== savedState) {
        throw new Error("OAuth state mismatch — possible CSRF attack");
      }

      let ep: string, body: any;
      switch (provider) {
        case "tink": ep = "/api/banking/tink/callback"; body = { code, connectionId: connId }; break;
        case "saltedge": ep = "/api/banking/se/callback"; body = { connectionId: connId }; break;
        case "yapily": ep = "/api/banking/yap/callback"; body = { connectionId: connId }; break;
        case "gocardless": ep = "/api/banking/gc/callback"; body = { connectionId: connId }; break;
        default: ep = "/api/banking/callback"; body = { code, state }; break;
      }
      const res = await apiRequest("POST", ep, body).then(r => r.json());
      if (res.ok) {
        toast({ title: "✓ Banca collegata!", description: `${res.institutionName || "Banca"} — ${res.accountCount || 0} conto/i` });
        queryClient.invalidateQueries({ queryKey: ["/api/banking/connections"] });
        queryClient.invalidateQueries({ queryKey: ["/api/banking/all/balances"] });
        queryClient.invalidateQueries({ queryKey: ["/api/banking/all/transactions"] });
        // If we're in a popup/new tab, close it after a short delay
        setTimeout(() => { try { window.close(); } catch {} }, 1500);
      } else { toast({ title: "Collegamento in attesa", description: res.message || "Riprova tra qualche secondo." }); }
    } catch (e: any) { toast({ title: "Errore", description: e.message, variant: "destructive" }); }
    cleanUrl();
    sessionStorage.removeItem("oauth_state");
  }

  useEffect(() => {
    if (callbackCalledRef.current || !connections) return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("error")) { toast({ title: "Errore collegamento", description: p.get("error_description") || p.get("error")!, variant: "destructive" }); cleanUrl(); return; }
    const code = p.get("code"), state = p.get("state");
    if (code && state) {
      callbackCalledRef.current = true;
      const pend = connections.find(c => c.status === "pending");
      handleCallback((pend as any)?.provider || "truelayer", code, state, pend?.id);
    }
  }, [connections]);

  useEffect(() => {
    const c = linked.length;
    if (connections !== undefined && c > prevLinkedCount.current && prevLinkedCount.current > 0) {
      toast({ title: "✓ Banca collegata!", description: "I tuoi conti sono ora sincronizzati." });
      setAwaitingOAuth(false);
      if (pollRef.current) clearInterval(pollRef.current);
    }
    prevLinkedCount.current = c;
  }, [linked.length, connections]);

  // Polling when waiting for OAuth completion in external tab
  useEffect(() => {
    if (awaitingOAuth) {
      pollRef.current = setInterval(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/banking/connections"] });
      }, 3000);
    } else {
      if (pollRef.current) clearInterval(pollRef.current);
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [awaitingOAuth]);

  // ── Mutations ────────────────────────────────────────────
  const connectMut = useMutation({
    mutationFn: (bankId: string) => apiRequest("POST", "/api/banking/unified/connect", { bankId }).then(r => r.json()),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/banking/connections"] });
      if (data?.authUrl) {
        // Save OAuth state for CSRF protection before opening the window
        const state = data.state || Math.random().toString(36).substring(2, 15);
        sessionStorage.setItem("oauth_state", state);

        // Open in new top-level tab to avoid EMBED_NOT_ALLOWED errors from Tink/Salt Edge
        window.open(data.authUrl, "_blank", "noopener");
        setAwaitingOAuth(true);
        const description = data?.note === "saltedge_fallback"
          ? "Verrai collegato tramite Tink (la funzione Salt Edge richiede piano Partner). Completa nella nuova scheda."
          : "Completa il collegamento nella nuova scheda, poi torna qui.";
        toast({ title: "Finestra aperta", description });
      }
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  function handleBankSelect(bank: BankResult) {
    setShowSearch(false);
    setSearchQuery("");
    // Block only if truly no provider is available at all
    if (bank.provider === "none" && !status?.configured) {
      toast({ title: "Provider non configurato", description: "Aggiungi le credenziali di Tink, Salt Edge, TrueLayer o un altro provider per collegare questa banca.", variant: "destructive" });
      return;
    }
    connectMut.mutate(bank.id);
  }
  const disconnectMut = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/banking/connections/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/banking/connections"] }); queryClient.invalidateQueries({ queryKey: ["/api/banking/all/balances"] }); queryClient.invalidateQueries({ queryKey: ["/api/banking/all/transactions"] }); toast({ title: "Banca scollegata" }); },
  });
  const importMut = useMutation({
    mutationFn: (tx: BankTransaction) => apiRequest("POST", "/api/budget/expenses", { title: tx.description, amount: Math.abs(tx.amount), date: tx.date, notes: tx.counterparty ? `Da: ${tx.counterparty}` : undefined }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/budget/expenses"] }); toast({ title: "Importato nel Budget" }); },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const totalBal = balances?.reduce((s, b) => s + (b.amount ?? 0), 0) ?? 0;
  const visTx = showAllTx ? transactions?.slice(0, 100) : transactions?.slice(0, 20);

  // ── Loading ──────────────────────────────────────────────
  if (!status) return <div className="flex-1 overflow-y-auto p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>;

  // ── Main ─────────────────────────────────────────────────
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">

        {/* ── OAUTH WAITING BANNER ── */}
        {awaitingOAuth && (
          <div className="rounded-2xl border-2 border-blue-500/40 bg-blue-50 dark:bg-blue-950/30 p-4 flex items-center gap-3">
            <RefreshCw className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Collegamento in corso…</p>
              <p className="text-xs text-blue-600 dark:text-blue-400">Completa l'autenticazione nella nuova scheda, poi torna qui.</p>
            </div>
            <button onClick={() => setAwaitingOAuth(false)} className="p-1 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-900 flex-shrink-0">
              <X className="w-4 h-4 text-blue-500" />
            </button>
          </div>
        )}

        {/* ── BANK SEARCH ── */}
        {showSearch && (
          <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              <input ref={searchRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Cerca la tua banca… es. Intesa, UniCredit, Poste" className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} className="p-1 rounded-lg hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
            </div>
            <div className="max-h-80 overflow-y-auto space-y-1">
              {searching && <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground"><RefreshCw className="w-4 h-4 animate-spin" /><span className="text-sm">Ricerca…</span></div>}
              {!searching && searchResults && searchResults.length > 0 && <>
                <p className="text-xs text-muted-foreground px-1">{searchResults.length} risultat{searchResults.length === 1 ? "o" : "i"}</p>
                {searchResults.map(bank => (
                  <button key={bank.id} onClick={() => handleBankSelect(bank)} disabled={connectMut.isPending} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/60 active:bg-muted transition-colors text-left">
                    {bank.logo ? <img src={bank.logo} alt="" className="w-10 h-10 rounded-lg object-contain bg-white border border-border p-1 flex-shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} /> : <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0"><Landmark className="w-5 h-5 text-primary" /></div>}
                    <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{bank.name}</p><p className="text-xs text-muted-foreground">{bank.provider === "none" ? "provider non configurato" : `via ${PLABEL[bank.provider] || bank.provider}`}</p></div>
                    {bank.provider === "none" ? <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" /> : <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}
                  </button>
                ))}
              </>}

              {/* Direct provider widgets — always visible when search has no results */}
              {!searching && (debouncedQ.length === 0 || searchResults?.length === 0) && status?.providers && status.providers.length > 0 && (
                <div className="pt-2 space-y-2">
                  {debouncedQ.length >= 1 && searchResults?.length === 0 && (
                    <p className="text-sm text-center text-muted-foreground pb-1">Nessuna banca trovata per "{debouncedQ}"</p>
                  )}
                  <p className="text-xs font-semibold text-muted-foreground px-1 uppercase tracking-wide">
                    {debouncedQ.length === 0 ? "Oppure collegati direttamente tramite:" : "Prova a cercare direttamente su:"}
                  </p>
                  {status.providers.includes("saltedge") && (
                    <button onClick={() => { setShowSearch(false); setSearchQuery(""); connectMut.mutate("saltedge:_auto_"); }} disabled={connectMut.isPending} className="w-full flex items-center gap-3 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors text-left">
                      <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/50 flex items-center justify-center flex-shrink-0"><Landmark className="w-5 h-5 text-emerald-600" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Salt Edge — tutte le banche</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400">Apre il selettore completo · include Cassa Rurale e banche regionali</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    </button>
                  )}
                  {status.providers.includes("tink") && (
                    <button onClick={() => { setShowSearch(false); setSearchQuery(""); connectMut.mutate("tink:_auto_"); }} disabled={connectMut.isPending} className="w-full flex items-center gap-3 p-3 rounded-xl bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors text-left">
                      <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center flex-shrink-0"><Landmark className="w-5 h-5 text-blue-600" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-blue-800 dark:text-blue-200">Tink — tutte le banche</p>
                        <p className="text-xs text-blue-600 dark:text-blue-400">Apre Tink Link · 3.400+ banche in Europa</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-blue-600 flex-shrink-0" />
                    </button>
                  )}
                  {status.providers.includes("truelayer") && !status.providers.includes("tink") && !status.providers.includes("saltedge") && (
                    <button onClick={() => { setShowSearch(false); setSearchQuery(""); connectMut.mutate("truelayer:_auto_"); }} disabled={connectMut.isPending} className="w-full flex items-center gap-3 p-3 rounded-xl bg-violet-50 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-800 hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors text-left">
                      <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-900/50 flex items-center justify-center flex-shrink-0"><Landmark className="w-5 h-5 text-violet-600" /></div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-violet-800 dark:text-violet-200">TrueLayer — tutte le banche</p>
                        <p className="text-xs text-violet-600 dark:text-violet-400">Apre il selettore banche TrueLayer</p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-violet-600 flex-shrink-0" />
                    </button>
                  )}
                  {debouncedQ.length === 0 && <p className="text-xs text-muted-foreground px-1 pt-1">oppure digita il nome della tua banca qui sopra</p>}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── NO PROVIDER BANNER (non-blocking) ── */}
        {!status.configured && !showSearch && (
          <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center flex-shrink-0 mt-0.5"><Landmark className="w-4 h-4 text-amber-600" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">Nessun provider configurato</p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">Puoi sfogliare le banche, ma per collegarle serve un provider Open Banking.</p>
              </div>
            </div>
            <div className="bg-white/60 dark:bg-black/20 rounded-xl p-3 space-y-1.5">
              <p className="text-xs font-semibold text-amber-800 dark:text-amber-200">Consigliato: Tink (gratuito)</p>
              <p className="text-xs text-amber-700 dark:text-amber-300">1. Registrati su <strong>console.tink.com</strong></p>
              <p className="text-xs text-amber-700 dark:text-amber-300">2. Crea un'app → aggiungi <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">TINK_CLIENT_ID</code> e <code className="bg-amber-100 dark:bg-amber-900/50 px-1 rounded">TINK_CLIENT_SECRET</code></p>
            </div>
          </div>
        )}

        {/* ── CONNECTING SPINNER ── */}
        {connectMut.isPending && <div className="rounded-2xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-4 flex items-center gap-3"><RefreshCw className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" /><div><p className="text-sm text-blue-700 dark:text-blue-300 font-medium">Collegamento in corso…</p><p className="text-xs text-blue-600/70 dark:text-blue-400/70">Stai per essere reindirizzato alla tua banca</p></div></div>}

        {/* ── TOTAL BALANCE ── */}
        {hasLinked && <div className="rounded-2xl bg-gradient-to-br from-primary to-primary/80 text-white p-5 space-y-1"><p className="text-xs font-medium opacity-70 uppercase tracking-wide">Saldo totale</p>{loadingBal ? <Skeleton className="h-9 w-40 bg-white/20" /> : <p className="text-3xl font-bold">{totalBal >= 0 ? "" : "−"} € {Math.abs(totalBal).toLocaleString("it-IT", { minimumFractionDigits: 2 })}</p>}<p className="text-xs opacity-60">{linked.length} banca/e · {balances?.length ?? 0} conto/i{status.environment === "sandbox" && " · SANDBOX"}</p></div>}

        {/* ── ACCOUNTS ── */}
        {balances && balances.length > 0 && <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Conti</p>
          {balances.map(b => <div key={b.accountId} className="rounded-2xl border border-border bg-card p-4"><div className="flex items-center justify-between"><div className="flex items-center gap-3">{b.institutionLogo ? <img src={b.institutionLogo} alt={b.institutionName} className="w-10 h-10 rounded-lg object-contain bg-white border border-border p-1" /> : <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center"><CreditCard className="w-5 h-5 text-muted-foreground" /></div>}<div><p className="font-semibold text-sm">{b.name || b.institutionName}</p>{b.iban && <p className="text-xs text-muted-foreground font-mono">{maskIban(b.iban)}</p>}</div></div><div className="text-right"><p className="font-bold text-base">{b.amount != null ? `€ ${b.amount.toLocaleString("it-IT", { minimumFractionDigits: 2 })}` : "—"}</p><p className="text-xs text-muted-foreground">{b.currency}</p></div></div></div>)}
        </div>}

        {/* ── TRANSACTIONS ── */}
        {hasLinked && <div className="space-y-2">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Movimenti recenti</p><Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={() => { refetchBal(); refetchTx(); }}><RefreshCw className="w-3 h-3" /> Aggiorna</Button></div>
          {loadingTx ? <div className="space-y-2">{[1,2,3,4].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
          : !transactions?.length ? <div className="text-center py-8 text-muted-foreground"><Euro className="w-8 h-8 mx-auto mb-2 opacity-30" /><p className="text-sm">Nessun movimento disponibile</p></div>
          : <><div className="space-y-1.5">
            {visTx?.map(tx => <div key={tx.id} className="rounded-xl border border-border bg-card p-3 flex items-center gap-3">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${tx.amount < 0 ? "bg-red-100 dark:bg-red-950/40" : "bg-green-100 dark:bg-green-950/40"}`}>{tx.amount < 0 ? <TrendingDown className="w-4 h-4 text-red-600 dark:text-red-400" /> : <TrendingUp className="w-4 h-4 text-green-600 dark:text-green-400" />}</div>
              <div className="flex-1 min-w-0"><p className="text-sm font-medium truncate">{tx.description}</p><p className="text-xs text-muted-foreground">{format(parseISO(tx.date), "d MMM yyyy", { locale: it })}{tx.counterparty && ` · ${tx.counterparty}`}</p></div>
              <div className="flex items-center gap-2 flex-shrink-0"><span className={`text-sm font-bold tabular-nums ${tx.amount < 0 ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>{tx.amount < 0 ? "−" : "+"}€ {Math.abs(tx.amount).toFixed(2).replace(".", ",")}</span>{tx.amount < 0 && <button onClick={() => importMut.mutate(tx)} disabled={importMut.isPending} className="p-1.5 rounded-lg hover:bg-accent transition-colors" title="Importa nel Budget"><Download className="w-3.5 h-3.5 text-muted-foreground" /></button>}</div>
            </div>)}
          </div>
          {transactions.length > 20 && <Button size="sm" variant="ghost" className="w-full text-xs gap-1" onClick={() => setShowAllTx(!showAllTx)}>{showAllTx ? <><ChevronUp className="w-3 h-3" /> Mostra meno</> : <><ChevronDown className="w-3 h-3" /> Mostra tutti ({transactions.length})</>}</Button>}
          </>}
        </div>}

        {/* ── EMPTY STATE ── */}
        {!loadingConns && !hasLinked && !pending.length && !connectMut.isPending && !showSearch && <div className="text-center py-12 space-y-4"><div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto"><Landmark className="w-8 h-8 text-primary" /></div><div><p className="font-semibold">Nessun conto collegato</p><p className="text-sm text-muted-foreground mt-1">Cerca la tua banca e collegala in pochi secondi</p></div></div>}

        {/* ── CONNECTED BANKS ── */}
        {hasLinked && <div className="space-y-2"><p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Banche collegate</p>
          {linked.map(c => <div key={c.id} className="rounded-xl border border-border bg-card p-3 flex items-center justify-between">
            <div className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-green-500" /><div><span className="text-sm font-medium">{c.institutionName}</span>{c.lastSyncAt && <span className="text-xs text-muted-foreground ml-1">· {format(new Date(c.lastSyncAt), "d MMM", { locale: it })}</span>}</div></div>
            <button onClick={() => disconnectMut.mutate(c.id)} disabled={disconnectMut.isPending} className="p-1.5 rounded-lg hover:bg-destructive/10 transition-colors"><Trash2 className="w-4 h-4 text-destructive" /></button>
          </div>)}
        </div>}

        {/* ── CONNECT BUTTON ── */}
        {!showSearch && <Button className="w-full gap-2" onClick={() => setShowSearch(true)} disabled={connectMut.isPending}>{connectMut.isPending ? <><RefreshCw className="w-4 h-4 animate-spin" /> Preparazione…</> : <><PlusCircle className="w-4 h-4" /> {hasLinked ? "Collega altra banca" : "Cerca e collega la tua banca"}</>}</Button>}

        <p className="text-center text-xs text-muted-foreground pb-2 flex items-center justify-center gap-1"><Shield className="w-3 h-3" /> Sola lettura · Open Banking PSD2{status.providers.length > 0 && ` · ${status.providers.map(p => PLABEL[p] || p).join(", ")}`}</p>
      </div>
    </div>
  );
}
