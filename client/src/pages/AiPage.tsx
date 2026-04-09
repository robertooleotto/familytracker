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
  Lightbulb, RefreshCw, CheckCircle, Moon, ThumbsUp, ThumbsDown,
  Bell, MapPin, CloudRain, Scissors, School, Briefcase, Dumbbell, Stethoscope,
  UtensilsCrossed, Pill, Trees, X, Check, Trash2, Clock
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

interface SmartNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  actionType: string | null;
  actionPayload: Record<string, unknown>;
  priority: string;
  createdAt: string;
  readAt: string | null;
  actedAt: string | null;
}

interface FamilyPlace {
  id: string;
  name: string;
  category: string | null;
  lat: number;
  lng: number;
  visitCount: number;
  avgDurationMin: number | null;
  lastVisitAt: string | null;
  source: string;
}

const CATEGORY_ICONS: Record<string, typeof MapPin> = {
  supermarket: ShoppingCart, barber: Scissors, school: School,
  work: Briefcase, gym: Dumbbell, doctor: Stethoscope,
  restaurant: UtensilsCrossed, pharmacy: Pill, park: Trees,
};

const CATEGORY_LABELS: Record<string, string> = {
  supermarket: "Supermercato", barber: "Barbiere", school: "Scuola",
  work: "Lavoro", gym: "Palestra", doctor: "Dottore",
  restaurant: "Ristorante", pharmacy: "Farmacia", park: "Parco",
  home: "Casa", other: "Altro",
};

const NOTIF_TYPE_COLORS: Record<string, string> = {
  weather_alert: "bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800",
  place_visit: "bg-violet-50 dark:bg-violet-950/30 border-violet-200 dark:border-violet-800",
  routine_anomaly: "bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800",
  recurring_reminder: "bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800",
  medication_reminder: "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800",
};

const NOTIF_TYPE_ICONS: Record<string, typeof Bell> = {
  weather_alert: CloudRain,
  place_visit: MapPin,
  routine_anomaly: AlertTriangle,
  recurring_reminder: Clock,
  medication_reminder: Pill,
};

const TREND_LABELS: Record<string, { label: string; color: string }> = {
  above_average: { label: "Sopra la media", color: "text-red-500" },
  below_average: { label: "Sotto la media", color: "text-green-500" },
  on_track: { label: "In linea", color: "text-blue-500" },
};

export default function AiPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"notifications" | "summary" | "forecast" | "score" | "shopping" | "places" | "insights">("notifications");
  const [ratedInsights, setRatedInsights] = useState<Record<string, number>>({});

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

  const feedbackMutation = useMutation({
    mutationFn: async ({ targetId, rating }: { targetId: string; rating: number }) => {
      await apiRequest("POST", "/api/ai/feedback", {
        targetType: "insight",
        targetId,
        rating,
      });
    },
  });

  const { data: notifications, isLoading: loadingNotifs, refetch: refetchNotifs } =
    useQuery<SmartNotification[]>({ queryKey: ["/api/ai/notifications"], enabled: aiAvailable });

  const { data: places, isLoading: loadingPlaces, refetch: refetchPlaces } =
    useQuery<FamilyPlace[]>({ queryKey: ["/api/ai/places"], enabled: aiAvailable && activeTab === "places" });

  const dismissNotifMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/ai/notifications/${id}/dismiss`, {}); },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/ai/notifications"] }),
  });

  const actNotifMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/ai/notifications/${id}/act`, {}); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/notifications"] });
      toast({ title: "Azione completata!" });
    },
  });

  const deletePlaceMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/ai/places/${id}`); },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/ai/places"] });
      toast({ title: "Luogo rimosso" });
    },
  });

  const unreadNotifCount = notifications?.filter(n => !n.readAt && !n.actedAt).length ?? 0;

  const tabs = [
    { key: "notifications", label: "Notifiche", icon: Bell },
    { key: "summary", label: "Riepilogo", icon: Moon },
    { key: "forecast", label: "Previsione", icon: TrendingUp },
    { key: "score", label: "Salute", icon: Heart },
    { key: "shopping", label: "Spesa AI", icon: ShoppingCart },
    { key: "places", label: "Luoghi", icon: MapPin },
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
                "Notifiche proattive intelligenti",
                "Riconoscimento automatico luoghi (GPS)",
                "Avvisi meteo per eventi all'aperto",
                "Riepilogo serale della giornata",
                "Previsione spese mensili",
                "Score salute finanziaria (0-100)",
                "Suggerimenti lista spesa automatici",
                "Promemoria visite ricorrenti",
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
                {tab.key === "notifications" && unreadNotifCount > 0 && (
                  <span className={`ml-0.5 w-4 h-4 rounded-full text-[10px] font-bold flex items-center justify-center ${
                    activeTab === "notifications" ? "bg-white text-violet-600" : "bg-red-500 text-white"
                  }`}>{unreadNotifCount > 9 ? "9+" : unreadNotifCount}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* ── NOTIFICHE SMART ── */}
        {activeTab === "notifications" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Bell className="w-4 h-4 text-violet-500" /> Notifiche intelligenti
              </h3>
              <button onClick={() => refetchNotifs()} className="p-1 rounded hover:bg-accent transition-colors">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {loadingNotifs ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
              </div>
            ) : notifications && notifications.length > 0 ? (
              <div className="space-y-2">
                {notifications.map(notif => {
                  const NIcon = NOTIF_TYPE_ICONS[notif.type] || Bell;
                  const colorClass = NOTIF_TYPE_COLORS[notif.type] || "bg-card border-border";
                  const isActed = !!notif.actedAt;
                  return (
                    <div key={notif.id} className={`relative p-3 rounded-xl border transition-all ${colorClass} ${isActed ? "opacity-50" : ""}`}>
                      <div className="flex items-start gap-2.5">
                        <NIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-current opacity-70" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-sm">{notif.title}</p>
                            {notif.priority === "high" || notif.priority === "urgent" ? (
                              <span className="text-[10px] font-bold bg-red-500 text-white px-1.5 py-0.5 rounded">
                                {notif.priority === "urgent" ? "URGENTE" : "ALTA"}
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{notif.message}</p>
                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-[10px] text-muted-foreground">
                              {new Date(notif.createdAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                            {!isActed && notif.actionType && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-6 text-[11px] px-2"
                                onClick={() => actNotifMutation.mutate(notif.id)}
                                disabled={actNotifMutation.isPending}
                              >
                                <Check className="w-3 h-3 mr-1" />
                                {notif.actionType === "confirm_place" ? "Conferma luogo" :
                                 notif.actionType === "reschedule_event" ? "Riprogramma" :
                                 notif.actionType === "show_shopping" ? "Lista spesa" :
                                 notif.actionType === "call_contact" ? "Chiama" :
                                 "OK"}
                              </Button>
                            )}
                            {!isActed && (
                              <button
                                onClick={() => dismissNotifMutation.mutate(notif.id)}
                                className="p-0.5 rounded hover:bg-background/50 transition-colors"
                                title="Ignora"
                              >
                                <X className="w-3 h-3 text-muted-foreground" />
                              </button>
                            )}
                            {isActed && (
                              <span className="text-[10px] text-green-600 font-medium flex items-center gap-0.5">
                                <CheckCircle className="w-3 h-3" /> Completato
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <Bell className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Nessuna notifica</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Le notifiche proattive appariranno qui: meteo, promemoria visite, anomalie di routine
                </p>
              </div>
            )}
          </div>
        )}

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

        {/* ── LUOGHI SMART ── */}
        {activeTab === "places" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-emerald-500" /> Luoghi della famiglia
              </h3>
              <button onClick={() => refetchPlaces()} className="p-1 rounded hover:bg-accent transition-colors">
                <RefreshCw className="w-3.5 h-3.5 text-muted-foreground" />
              </button>
            </div>
            {loadingPlaces ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}
              </div>
            ) : places && places.length > 0 ? (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">
                  Luoghi riconosciuti automaticamente dal GPS. L'AI impara dove vai e può proporti azioni utili.
                </p>
                {places.map(place => {
                  const PIcon = CATEGORY_ICONS[place.category || "other"] || MapPin;
                  return (
                    <div key={place.id} className="flex items-center gap-3 p-3 bg-card border border-border rounded-xl">
                      <div className="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center flex-shrink-0">
                        <PIcon className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{place.name}</p>
                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                          <span>{CATEGORY_LABELS[place.category || "other"] || place.category}</span>
                          {place.visitCount > 0 && <span>• {place.visitCount} {place.visitCount === 1 ? "visita" : "visite"}</span>}
                          {place.avgDurationMin && <span>• ~{place.avgDurationMin} min</span>}
                          <span className={`px-1 rounded ${place.source === "manual" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
                            {place.source === "manual" ? "confermato" : "auto"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => deletePlaceMutation.mutate(place.id)}
                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                        title="Rimuovi luogo"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-red-500" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-6 text-center">
                <MapPin className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-40" />
                <p className="text-sm text-muted-foreground">Nessun luogo riconosciuto</p>
                <p className="text-xs text-muted-foreground mt-1">
                  I luoghi vengono riconosciuti automaticamente dal GPS quando ti fermi in un posto
                </p>
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
                        <div className="flex items-center gap-1 mt-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); feedbackMutation.mutate({ targetId: ins.id, rating: 1 }); setRatedInsights(prev => ({...prev, [ins.id]: 1})); }}
                            disabled={!!ratedInsights[ins.id]}
                            className={`p-0.5 rounded transition-colors ${ratedInsights[ins.id] === 1 ? 'text-green-500' : 'text-muted-foreground/30 hover:text-green-500'}`}
                          >
                            <ThumbsUp className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); feedbackMutation.mutate({ targetId: ins.id, rating: -1 }); setRatedInsights(prev => ({...prev, [ins.id]: -1})); }}
                            disabled={!!ratedInsights[ins.id]}
                            className={`p-0.5 rounded transition-colors ${ratedInsights[ins.id] === -1 ? 'text-red-500' : 'text-muted-foreground/30 hover:text-red-500'}`}
                          >
                            <ThumbsDown className="w-3 h-3" />
                          </button>
                        </div>
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
