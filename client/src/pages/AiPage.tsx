import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sparkles, TrendingUp, AlertTriangle, Heart, ShoppingCart,
  Lightbulb, RefreshCw, CheckCircle, BookOpen, Moon
} from "lucide-react";

interface AiInsight {
  id: string;
  type: string;
  message: string;
  severity: string;
  createdAt: string;
  readAt: string | null;
}

interface SpendingForecast {
  forecast_total: number;
  forecast_by_category: Record<string, number>;
  trend: "above_average" | "below_average" | "on_track";
  advice: string;
  confidence: number;
}

interface HealthScore {
  score: number;
  items: { label: string; status: "ok" | "warning" | "error" }[];
  summary: string;
}

interface ShoppingSuggestion {
  name: string;
  reason: string;
  confidence: number;
}

interface EveningSummary {
  text: string | null;
  date?: string;
}

const TREND_LABELS: Record<string, { label: string; color: string }> = {
  above_average: { label: "Sopra la media", color: "text-red-500" },
  below_average: { label: "Sotto la media", color: "text-green-500" },
  on_track: { label: "In linea", color: "text-blue-500" },
};

export default function AiPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"summary" | "forecast" | "score" | "shopping" | "insights">("summary");

  const { data: status } = useQuery<{ available: boolean }>({ queryKey: ["/api/ai/status"] });
  const aiAvailable = status?.available ?? false;

  const { data: summary, isLoading: loadingSummary, refetch: refetchSummary } =
    useQuery<EveningSummary>({ queryKey: ["/api/ai/summary"], enabled: aiAvailable && activeTab === "summary" });

  const { data: forecast, isLoading: loadingForecast, refetch: refetchForecast } =
    useQuery<SpendingForecast | { error: string }>({ queryKey: ["/api/ai/forecast"], enabled: aiAvailable && activeTab === "forecast" });

  const { data: score, isLoading: loadingScore, refetch: refetchScore } =
    useQuery<HealthScore | { score: null }>({ queryKey: ["/api/ai/score"], enabled: aiAvailable && activeTab === "score" });

  const { data: shopping, isLoading: loadingShopping, refetch: refetchShopping } =
    useQuery<ShoppingSuggestion[]>({ queryKey: ["/api/ai/shopping"], enabled: aiAvailable && activeTab === "shopping" });

  const { data: insights, isLoading: loadingInsights } =
    useQuery<AiInsight[]>({ queryKey: ["/api/ai/insights"], enabled: aiAvailable && activeTab === "insights" });

  const readMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/ai/insights/${id}/read`, {}); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ai/insights"] }),
  });

  const addShoppingMutation = useMutation({
    mutationFn: async (name: string) => {
      await apiRequest("POST", "/api/shopping", { name, qty: 1, familyId: profile?.familyId });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping"] });
      toast({ title: "Aggiunto alla lista!" });
    },
  });

  const tabs = [
    { key: "summary", label: "Riepilogo", icon: Moon },
    { key: "forecast", label: "Previsione", icon: TrendingUp },
    { key: "score", label: "Salute", icon: Heart },
    { key: "shopping", label: "Spesa AI", icon: ShoppingCart },
    { key: "insights", label: "Storico", icon: Lightbulb },
  ] as const;

  const scoreColor = (s: number) =>
    s >= 70 ? "text-green-500" : s >= 40 ? "text-amber-500" : "text-red-500";
  const scoreBg = (s: number) =>
    s >= 70 ? "bg-green-50 dark:bg-green-950/30" : s >= 40 ? "bg-amber-50 dark:bg-amber-950/30" : "bg-red-50 dark:bg-red-950/30";

  if (!aiAvailable) {
    return (
      <div className="flex flex-col h-full overflow-y-auto">
        <div className="p-4 space-y-4">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" /> Intelligenza Artificiale
            </h2>
            <p className="text-xs text-muted-foreground">Analisi predittiva della famiglia</p>
          </div>
          <div className="rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-800 p-8 text-center space-y-3">
            <Sparkles className="w-12 h-12 mx-auto text-violet-300" />
            <h3 className="font-semibold text-sm">Modulo AI non attivo</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Per attivare l'intelligenza artificiale aggiungi la chiave{" "}
              <code className="bg-muted px-1 rounded text-xs">CLAUDE_API_KEY</code>{" "}
              nei Secret di Replit. La chiave si ottiene da{" "}
              <strong>console.anthropic.com → API Keys</strong>.
            </p>
            <div className="mt-4 space-y-2 text-left bg-muted/50 rounded-xl p-3">
              <p className="text-xs font-semibold text-muted-foreground">Funzioni disponibili dopo attivazione:</p>
              {[
                "Riepilogo serale della giornata",
                "Previsione spese mensili",
                "Rilevamento anomalie di spesa",
                "Score salute finanziaria (0-100)",
                "Suggerimenti lista spesa automatici",
              ].map(f => (
                <div key={f} className="flex items-center gap-2 text-xs">
                  <CheckCircle className="w-3 h-3 text-violet-400 flex-shrink-0" />
                  <span>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-violet-500" /> Intelligenza Artificiale
            </h2>
            <p className="text-xs text-muted-foreground">Analisi predittiva della famiglia</p>
          </div>
          <Badge variant="secondary" className="bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-xs">
            ✦ Attivo
          </Badge>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 overflow-x-auto pb-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.key
                    ? "bg-violet-600 text-white"
                    : "bg-muted text-muted-foreground hover:bg-accent"
                }`}
                data-testid={`tab-ai-${tab.key}`}
              >
                <Icon className="w-3 h-3" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* ── RIEPILOGO SERALE ── */}
        {activeTab === "summary" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Moon className="w-4 h-4 text-indigo-500" /> Riepilogo della giornata
              </h3>
              <button onClick={() => refetchSummary()} className="p-1 rounded hover:bg-accent transition-colors" data-testid="refresh-summary">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {loadingSummary ? (
              <Skeleton className="h-28 rounded-xl" />
            ) : summary?.text ? (
              <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-800 rounded-xl p-4">
                <p className="text-sm leading-relaxed">{summary.text}</p>
                {summary.date && (
                  <p className="text-xs text-muted-foreground mt-2">{summary.date}</p>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <Moon className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Il riepilogo viene generato ogni sera alle 21:00</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => refetchSummary()} data-testid="generate-summary">
                  <Sparkles className="w-3 h-3 mr-1" /> Genera ora
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── PREVISIONE SPESE ── */}
        {activeTab === "forecast" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-500" /> Previsione spese mensili
              </h3>
              <button onClick={() => refetchForecast()} className="p-1 rounded hover:bg-accent transition-colors" data-testid="refresh-forecast">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {loadingForecast ? (
              <div className="space-y-2">
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-32 rounded-xl" />
              </div>
            ) : forecast && !("error" in forecast) ? (
              <div className="space-y-3">
                <div className="bg-blue-50 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold">Previsione fine mese</span>
                    <span className={`text-xs font-medium ${TREND_LABELS[forecast.trend]?.color}`}>
                      {TREND_LABELS[forecast.trend]?.label}
                    </span>
                  </div>
                  <p className="text-2xl font-bold">€{forecast.forecast_total.toFixed(2)}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Confidenza: {Math.round(forecast.confidence * 100)}%
                  </p>
                </div>
                {forecast.advice && (
                  <div className="flex items-start gap-2 bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-800 rounded-xl p-3">
                    <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm">{forecast.advice}</p>
                  </div>
                )}
                {Object.keys(forecast.forecast_by_category).length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                    <p className="text-xs font-semibold text-muted-foreground">Per categoria</p>
                    {Object.entries(forecast.forecast_by_category)
                      .sort((a, b) => b[1] - a[1])
                      .map(([cat, amt]) => (
                        <div key={cat} className="flex items-center justify-between">
                          <span className="text-sm">{cat}</span>
                          <span className="text-sm font-medium">€{amt.toFixed(2)}</span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <TrendingUp className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Dati insufficienti per la previsione</p>
                <p className="text-xs text-muted-foreground mt-1">Aggiungi almeno 30 giorni di spese</p>
              </div>
            )}
          </div>
        )}

        {/* ── HEALTH SCORE ── */}
        {activeTab === "score" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Heart className="w-4 h-4 text-red-500" /> Salute finanziaria
              </h3>
              <button onClick={() => refetchScore()} className="p-1 rounded hover:bg-accent transition-colors" data-testid="refresh-score">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {loadingScore ? (
              <div className="space-y-2">
                <Skeleton className="h-32 rounded-xl" />
                <Skeleton className="h-24 rounded-xl" />
              </div>
            ) : score && "score" in score && score.score !== null ? (
              <div className="space-y-3">
                <div className={`rounded-xl border p-6 text-center ${scoreBg(score.score)}`}>
                  <p className={`text-5xl font-black ${scoreColor(score.score)}`}>{score.score}</p>
                  <p className="text-xs text-muted-foreground mt-1">su 100</p>
                  {score.summary && <p className="text-sm mt-3">{score.summary}</p>}
                </div>
                {score.items && score.items.length > 0 && (
                  <div className="bg-card border border-border rounded-xl p-3 space-y-2">
                    {score.items.map((item, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          item.status === "ok" ? "bg-green-500" :
                          item.status === "warning" ? "bg-amber-500" : "bg-red-500"
                        }`} />
                        <span className="text-sm">{item.label}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <Heart className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Score non ancora disponibile</p>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => refetchScore()} data-testid="generate-score">
                  <Sparkles className="w-3 h-3 mr-1" /> Calcola ora
                </Button>
              </div>
            )}
          </div>
        )}

        {/* ── SHOPPING AI ── */}
        {activeTab === "shopping" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-green-500" /> Suggerimenti spesa
              </h3>
              <button onClick={() => refetchShopping()} className="p-1 rounded hover:bg-accent transition-colors" data-testid="refresh-shopping">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {loadingShopping ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : shopping && shopping.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">Basati sulla tua storia di acquisti:</p>
                {shopping.map((s, i) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-card border border-border rounded-xl gap-3" data-testid={`suggestion-${i}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{s.name}</p>
                      <p className="text-xs text-muted-foreground truncate">{s.reason}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-muted-foreground">{Math.round(s.confidence * 100)}%</span>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => addShoppingMutation.mutate(s.name)}
                        disabled={addShoppingMutation.isPending}
                        data-testid={`add-suggestion-${i}`}
                      >
                        + Aggiungi
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <ShoppingCart className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Nessun suggerimento disponibile</p>
                <p className="text-xs text-muted-foreground mt-1">Usa la lista spesa per almeno 30 giorni</p>
              </div>
            )}
          </div>
        )}

        {/* ── INSIGHTS STORICI ── */}
        {activeTab === "insights" && (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" /> Insight recenti
            </h3>
            {loadingInsights ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : insights && insights.length > 0 ? (
              <div className="space-y-2">
                {insights.map(ins => (
                  <div
                    key={ins.id}
                    onClick={() => !ins.readAt && readMutation.mutate(ins.id)}
                    className={`p-3 rounded-xl border transition-colors cursor-pointer ${
                      ins.readAt ? "bg-muted/30 border-border opacity-60" :
                      ins.severity === "warning" ? "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800" :
                      ins.severity === "error" ? "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800" :
                      "bg-blue-50 dark:bg-blue-950/30 border-blue-100 dark:border-blue-800"
                    }`}
                    data-testid={`insight-${ins.id}`}
                  >
                    <div className="flex items-start gap-2">
                      {ins.severity === "warning" || ins.severity === "error" ? (
                        <AlertTriangle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${ins.severity === "error" ? "text-red-500" : "text-amber-500"}`} />
                      ) : (
                        <Lightbulb className="w-4 h-4 flex-shrink-0 mt-0.5 text-blue-500" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm leading-relaxed">{ins.message}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(ins.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                          {!ins.readAt && <span className="ml-2 text-blue-500">• Non letto</span>}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <Lightbulb className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Nessun insight ancora generato</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
