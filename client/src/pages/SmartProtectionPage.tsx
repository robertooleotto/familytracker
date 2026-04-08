import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  HandHeart, Brain, Battery, HeartHandshake, GraduationCap,
  Flame, MapPin, Star, RefreshCw, CheckCircle, Clock,
  Moon, Phone, Shield, Zap, ZapOff, Target, ChevronRight,
  AlertTriangle, Car, PersonStanding, Mic, MicOff, X, Siren,
  Info, Volume2, Activity,
} from "lucide-react";
import {
  useCrashDetection, useFallDetection, useSoundDetection,
  type DetectionEvent,
} from "@/hooks/useSensorDetection";

interface ProfileSettings {
  id: string;
  profileId: string;
  schoolModeEnabled: boolean;
  schoolModeFrom: string;
  schoolModeTo: string;
  schoolModeDays: string[];
  elderlyTrackingEnabled: boolean;
  nightAlertEnabled: boolean;
  nightAlertFrom: string;
  nightAlertTo: string;
  safeZonesOnly: boolean;
  caregiverPhone: string | null;
  caregiverName: string | null;
  checkInStreak: number;
  checkInTotal: number;
  batteryMode: string;
}

interface CheckinData {
  checkins: Array<{ id: string; placeName: string; note: string | null; createdAt: string }>;
  streak: number;
  total: number;
  points: number;
}

interface FamilyMemberSettings {
  profile: { id: string; name: string; role: string; colorHex: string };
  settings: ProfileSettings | null;
}

function fmtTimeAgo(d: string): string {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins}m fa`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h fa`;
  return `${Math.floor(mins / 1440)}g fa`;
}

type Tab = "checkin" | "narrative" | "battery" | "elderly" | "school" | "sensors";

const TABS: { id: Tab; label: string; icon: any; color: string }[] = [
  { id: "checkin", label: "Check-in", icon: HandHeart, color: "#10B981" },
  { id: "narrative", label: "Narrativa", icon: Brain, color: "#8B5CF6" },
  { id: "battery", label: "Batteria", icon: Battery, color: "#F59E0B" },
  { id: "elderly", label: "Anziani", icon: HeartHandshake, color: "#EF4444" },
  { id: "school", label: "In classe", icon: GraduationCap, color: "#3B82F6" },
  { id: "sensors", label: "Sensori", icon: Activity, color: "#EF4444" },
];

// ─── EMERGENCY COUNTDOWN OVERLAY ──────────────────────────────────────────────
const COUNTDOWN_SECS = 30;

function EmergencyCountdown({
  event, onCancel, onConfirm,
}: {
  event: DetectionEvent;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [secs, setSecs] = useState(COUNTDOWN_SECS);

  useEffect(() => {
    if (secs <= 0) { onConfirm(); return; }
    const t = setTimeout(() => setSecs(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [secs, onConfirm]);

  const icon = event.type === "crash" ? Car : event.type === "fall" ? PersonStanding : Mic;
  const IconComp = icon;
  const titles: Record<string, string> = {
    crash: "Incidente rilevato 🚗",
    fall: "Possibile caduta 🧓",
    sound: "Suono di pericolo 🔊",
  };
  const descs: Record<string, string> = {
    crash: `Impatto ${event.type === "crash" ? event.impactG.toFixed(1) : ""}G rilevato. Stai bene?`,
    fall: `Caduta con impatto ${event.type === "fall" ? event.impactG.toFixed(1) : ""}G. Stai bene?`,
    sound: `${event.type === "sound" ? event.label : ""} rilevato. Stai bene?`,
  };

  const pct = (secs / COUNTDOWN_SECS) * 100;
  const r = 40; const circ = 2 * Math.PI * r;

  return (
    <div className="fixed inset-0 z-[9999] bg-red-600/95 flex flex-col items-center justify-center p-6 text-white" data-testid="emergency-countdown">
      <div className="w-full max-w-sm text-center space-y-6">
        <div className="relative flex items-center justify-center">
          <svg width="100" height="100" viewBox="0 0 100 100" className="-rotate-90">
            <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="6" />
            <circle cx="50" cy="50" r={r} fill="none" stroke="white" strokeWidth="6"
              strokeDasharray={circ} strokeDashoffset={circ - (pct / 100) * circ}
              strokeLinecap="round" style={{ transition: "stroke-dashoffset 1s linear" }} />
          </svg>
          <div className="absolute text-4xl font-black">{secs}</div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-center gap-2">
            <IconComp className="w-6 h-6" />
            <h2 className="text-xl font-bold">{titles[event.type]}</h2>
          </div>
          <p className="text-white/80 text-sm">{descs[event.type]}</p>
          <p className="text-white/60 text-xs">SOS automatico tra {secs} secondi se non rispondi</p>
        </div>

        <div className="space-y-3">
          <Button
            onClick={onCancel}
            className="w-full bg-white text-red-600 hover:bg-red-50 font-bold text-base h-14 rounded-2xl"
            data-testid="button-cancel-emergency"
          >
            ✅ Sto bene — Annulla SOS
          </Button>
          <Button
            onClick={onConfirm}
            variant="ghost"
            className="w-full text-white border-white/50 border font-semibold h-12 rounded-2xl"
            data-testid="button-confirm-sos"
          >
            <Siren className="w-4 h-4 mr-2" /> Manda SOS ora
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── SENSORS TAB ──────────────────────────────────────────────────────────────
function SensorsTab() {
  const { toast } = useToast();
  const [crashEnabled, setCrashEnabled] = useState(false);
  const [fallEnabled, setFallEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [pendingEvent, setPendingEvent] = useState<DetectionEvent | null>(null);
  const [logs, setLogs] = useState<Array<{ event: DetectionEvent; ts: number; cancelled: boolean }>>([]);
  const hasMotion = typeof DeviceMotionEvent !== "undefined";
  const hasMic = typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;

  const addLog = (event: DetectionEvent, cancelled: boolean) => {
    setLogs(prev => [{ event, ts: Date.now(), cancelled }, ...prev].slice(0, 10));
  };

  const onDetected = useCallback((e: DetectionEvent) => {
    setPendingEvent(e);
  }, []);

  useCrashDetection(crashEnabled, onDetected);
  useFallDetection(fallEnabled, onDetected);
  const { micPermission, requestMic, stopMic } = useSoundDetection(soundEnabled, onDetected);

  const handleCancel = () => {
    if (pendingEvent) addLog(pendingEvent, true);
    setPendingEvent(null);
    toast({ title: "SOS annullato ✅", description: "Falso allarme registrato" });
  };

  const handleConfirmSOS = () => {
    if (!pendingEvent) return;
    addLog(pendingEvent, false);
    setPendingEvent(null);
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        pos => {
          apiRequest("POST", "/api/sos", {
            lat: pos.coords.latitude, lng: pos.coords.longitude,
            trigger: pendingEvent?.type ?? "manual",
          }).catch(() => {});
        },
        () => apiRequest("POST", "/api/sos", { trigger: pendingEvent?.type ?? "manual" }).catch(() => {})
      );
    }
    toast({ title: "🆘 SOS inviato!", description: "Familiari avvisati con posizione", variant: "destructive" });
  };

  const toggleSound = async () => {
    if (!soundEnabled) {
      if (micPermission !== "granted") {
        const ok = await requestMic();
        if (!ok) { toast({ title: "Microfono negato", description: "Abilita il microfono nelle impostazioni del browser", variant: "destructive" }); return; }
      }
      setSoundEnabled(true);
    } else {
      setSoundEnabled(false); stopMic();
    }
  };

  const requestMotionPermission = async () => {
    if (typeof (DeviceMotionEvent as any).requestPermission === "function") {
      try {
        const res = await (DeviceMotionEvent as any).requestPermission();
        return res === "granted";
      } catch { return false; }
    }
    return true;
  };

  const toggleCrash = async () => {
    if (!crashEnabled) { const ok = await requestMotionPermission(); if (!ok) return; }
    setCrashEnabled(v => !v);
  };

  const toggleFall = async () => {
    if (!fallEnabled) { const ok = await requestMotionPermission(); if (!ok) return; }
    setFallEnabled(v => !v);
  };

  const typeLabels: Record<string, string> = { crash: "Incidente", fall: "Caduta", sound: "Suono" };
  const typeIcons: Record<string, any> = { crash: Car, fall: PersonStanding, sound: Volume2 };

  return (
    <>
      {pendingEvent && (
        <EmergencyCountdown event={pendingEvent} onCancel={handleCancel} onConfirm={handleConfirmSOS} />
      )}

      <div className="space-y-4">
        <div className="bg-amber-50 dark:bg-amber-950 rounded-xl p-3 flex gap-2">
          <Info className="w-4 h-4 text-amber-600 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-amber-800 dark:text-amber-200">
            I sensori usano accelerometro e microfono del dispositivo. Funzionano meglio con il telefono in tasca.
            Ogni rilevamento avvia un <strong>countdown di 30 secondi</strong> — puoi annullare prima del SOS.
          </p>
        </div>

        <div className="space-y-3">
          {/* Crash Detection */}
          <div className={`rounded-2xl border-2 p-4 transition-all ${crashEnabled ? "border-orange-400 bg-orange-50 dark:bg-orange-950" : "border-border bg-card"}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${crashEnabled ? "bg-orange-500" : "bg-muted"}`}>
                  <Car className={`w-5 h-5 ${crashEnabled ? "text-white" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Incidente stradale</p>
                  <p className="text-[11px] text-muted-foreground">Impatto {">"}4g + calo velocità 20 km/h</p>
                </div>
              </div>
              <button
                onClick={toggleCrash}
                disabled={!hasMotion}
                data-testid="toggle-crash-detection"
                className={`w-12 h-6 rounded-full transition-all relative ${crashEnabled ? "bg-orange-500" : "bg-muted"} ${!hasMotion ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-all absolute top-0.5 ${crashEnabled ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {crashEnabled && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse" />
                <span className="text-[11px] text-orange-600 dark:text-orange-400 font-medium">Monitoraggio attivo — GPS + accelerometro</span>
              </div>
            )}
            {!hasMotion && <p className="text-[10px] text-muted-foreground mt-1">DeviceMotion non disponibile su questo dispositivo</p>}
          </div>

          {/* Fall Detection */}
          <div className={`rounded-2xl border-2 p-4 transition-all ${fallEnabled ? "border-purple-400 bg-purple-50 dark:bg-purple-950" : "border-border bg-card"}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${fallEnabled ? "bg-purple-500" : "bg-muted"}`}>
                  <PersonStanding className={`w-5 h-5 ${fallEnabled ? "text-white" : "text-muted-foreground"}`} />
                </div>
                <div>
                  <p className="font-semibold text-sm">Caduta accidentale</p>
                  <p className="text-[11px] text-muted-foreground">Caduta libera → impatto → immobilità 2.5s</p>
                </div>
              </div>
              <button
                onClick={toggleFall}
                disabled={!hasMotion}
                data-testid="toggle-fall-detection"
                className={`w-12 h-6 rounded-full transition-all relative ${fallEnabled ? "bg-purple-500" : "bg-muted"} ${!hasMotion ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-all absolute top-0.5 ${fallEnabled ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {fallEnabled && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-pulse" />
                <span className="text-[11px] text-purple-600 dark:text-purple-400 font-medium">Monitoraggio attivo — algoritmo SMV a 3 fasi</span>
              </div>
            )}
            {!hasMotion && <p className="text-[10px] text-muted-foreground mt-1">DeviceMotion non disponibile su questo dispositivo</p>}
          </div>

          {/* Sound Detection */}
          <div className={`rounded-2xl border-2 p-4 transition-all ${soundEnabled ? "border-red-400 bg-red-50 dark:bg-red-950" : "border-border bg-card"}`}>
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${soundEnabled ? "bg-red-500" : "bg-muted"}`}>
                  {soundEnabled ? <Mic className="w-5 h-5 text-white" /> : <MicOff className="w-5 h-5 text-muted-foreground" />}
                </div>
                <div>
                  <p className="font-semibold text-sm">Urla / Violenza</p>
                  <p className="text-[11px] text-muted-foreground">Solo analisi locale — zero audio al server</p>
                </div>
              </div>
              <button
                onClick={toggleSound}
                disabled={!hasMic}
                data-testid="toggle-sound-detection"
                className={`w-12 h-6 rounded-full transition-all relative ${soundEnabled ? "bg-red-500" : "bg-muted"} ${!hasMic ? "opacity-40 cursor-not-allowed" : ""}`}
              >
                <div className={`w-5 h-5 rounded-full bg-white shadow transition-all absolute top-0.5 ${soundEnabled ? "right-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {soundEnabled && micPermission === "granted" && (
              <div className="flex items-center gap-1.5 mt-1">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                <span className="text-[11px] text-red-600 dark:text-red-400 font-medium">Microfono attivo — ascolto on-device</span>
              </div>
            )}
            {micPermission === "denied" && (
              <p className="text-[10px] text-red-500 mt-1">Permesso microfono negato. Abilitalo dalle impostazioni del browser.</p>
            )}
            <div className="mt-2 flex items-center gap-1.5 p-2 bg-amber-50 dark:bg-amber-900/30 rounded-lg">
              <Shield className="w-3 h-3 text-amber-600 flex-shrink-0" />
              <p className="text-[10px] text-amber-700 dark:text-amber-300">Opt-in esplicito. Nessun audio viene registrato o inviato.</p>
            </div>
          </div>
        </div>

        {/* Simulated test */}
        <div className="rounded-xl border border-dashed border-border p-3">
          <p className="text-xs font-semibold text-muted-foreground mb-2 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> Test sensori (simulazione)
          </p>
          <div className="grid grid-cols-3 gap-2">
            {([
              { type: "crash" as const, label: "Incidente", e: { type: "crash" as const, impactG: 5.2, speedDrop: 35 } },
              { type: "fall" as const, label: "Caduta", e: { type: "fall" as const, impactG: 3.8 } },
              { type: "sound" as const, label: "Urlo", e: { type: "sound" as const, rms: 0.6, label: "urlo intenso" } },
            ]).map(({ label, e }) => (
              <Button key={label} size="sm" variant="outline" data-testid={`sim-${e.type}`}
                onClick={() => setPendingEvent(e)}
                className="text-xs h-8">{label}</Button>
            ))}
          </div>
        </div>

        {/* Log */}
        {logs.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Cronologia rilevamenti</p>
            {logs.map((l, i) => {
              const Icon = typeIcons[l.event.type] ?? Activity;
              return (
                <div key={i} className="flex items-center gap-3 p-2.5 rounded-xl bg-muted/50 text-sm">
                  <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{typeLabels[l.event.type]}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(l.ts).toLocaleTimeString("it-IT")}</p>
                  </div>
                  <Badge variant={l.cancelled ? "secondary" : "destructive"} className="text-[10px] shrink-0">
                    {l.cancelled ? "Annullato" : "SOS inviato"}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}

// ─── CHECK-IN TAB ─────────────────────────────────────────────────────────────
function CheckinTab() {
  const { toast } = useToast();
  const [place, setPlace] = useState("");
  const [note, setNote] = useState("");
  const [showForm, setShowForm] = useState(false);

  const { data, isLoading, refetch } = useQuery<CheckinData>({ queryKey: ["/api/checkins/mine"] });
  const { data: familyCheckins = [] } = useQuery<any[]>({ queryKey: ["/api/checkins/family"] });

  const checkin = useMutation({
    mutationFn: () => {
      if (navigator.geolocation) {
        return new Promise<any>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            pos => apiRequest("POST", "/api/checkins", { placeName: place, lat: pos.coords.latitude, lng: pos.coords.longitude, note: note || undefined }).then(resolve).catch(reject),
            () => apiRequest("POST", "/api/checkins", { placeName: place, note: note || undefined }).then(resolve).catch(reject),
            { timeout: 5000 }
          );
        });
      }
      return apiRequest("POST", "/api/checkins", { placeName: place, note: note || undefined });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/mine"] });
      queryClient.invalidateQueries({ queryKey: ["/api/checkins/family"] });
      toast({
        title: `Check-in effettuato! +${data.pointsEarned} punti ⭐`,
        description: data.streak > 1 ? `Serie: ${data.streak} giorni di fila! 🔥` : "Bravissimo/a, continua così!",
      });
      setPlace(""); setNote(""); setShowForm(false);
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const streak = data?.streak || 0;
  const total = data?.total || 0;
  const points = data?.points || 0;

  const PLACES = ["🏠 Casa", "🏫 Scuola", "⚽ Allenamento", "🏥 Medico", "🛍️ Supermercato", "🏋️ Palestra", "👴 Nonni", "📚 Biblioteca"];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-green-50 dark:bg-green-950 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Flame className="w-4 h-4 text-orange-500" />
            <span className="text-xl font-black text-green-700 dark:text-green-300">{streak}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Serie giorni</p>
        </div>
        <div className="bg-blue-50 dark:bg-blue-950 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <CheckCircle className="w-4 h-4 text-blue-500" />
            <span className="text-xl font-black text-blue-700 dark:text-blue-300">{total}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Check-in totali</p>
        </div>
        <div className="bg-yellow-50 dark:bg-yellow-950 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 mb-1">
            <Star className="w-4 h-4 text-yellow-500" />
            <span className="text-xl font-black text-yellow-700 dark:text-yellow-300">{points}</span>
          </div>
          <p className="text-[10px] text-muted-foreground">Punti guadagnati</p>
        </div>
      </div>

      {streak >= 3 && (
        <div className="bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 rounded-xl p-3 flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500 flex-shrink-0" />
          <p className="text-xs text-orange-800 dark:text-orange-200 font-medium">
            {streak >= 7 ? `🏆 ${streak} giorni di fila! Sei un campione del check-in!` : `🔥 ${streak} giorni consecutivi! Ogni check-in vale +15 punti!`}
          </p>
        </div>
      )}

      {!showForm ? (
        <Button data-testid="button-new-checkin" className="w-full gap-2" onClick={() => setShowForm(true)}>
          <MapPin className="w-4 h-4" /> Faccio check-in adesso
        </Button>
      ) : (
        <div className="border border-border rounded-xl p-4 space-y-3">
          <p className="text-sm font-semibold">Dove sei adesso?</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PLACES.map(p => (
              <button key={p} data-testid={`checkin-place-${p}`} onClick={() => setPlace(p)} className={`text-xs py-2 px-3 rounded-lg border transition-colors text-left ${place === p ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-accent"}`}>{p}</button>
            ))}
          </div>
          <Input data-testid="input-checkin-place" placeholder="Oppure scrivi dove sei…" value={place} onChange={e => setPlace(e.target.value)} />
          <Input data-testid="input-checkin-note" placeholder="Nota opzionale (es. 'arrivato in anticipo!')" value={note} onChange={e => setNote(e.target.value)} />
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setShowForm(false)}>Annulla</Button>
            <Button data-testid="button-submit-checkin" className="flex-1" onClick={() => checkin.mutate()} disabled={!place || checkin.isPending}>
              {checkin.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Check-in!"}
            </Button>
          </div>
        </div>
      )}

      {familyCheckins.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ultimi check-in famiglia</p>
          <div className="space-y-1.5">
            {familyCheckins.slice(0, 8).map((c: any) => (
              <div key={c.id} data-testid={`checkin-item-${c.id}`} className="flex items-center gap-2 p-2 rounded-lg bg-muted/30">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ backgroundColor: c.memberColor || "#3B82F6" }}>
                  {c.memberName?.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{c.memberName} · {c.placeName}</p>
                  {c.note && <p className="text-[10px] text-muted-foreground truncate">{c.note}</p>}
                </div>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtTimeAgo(c.createdAt)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-muted/20 rounded-xl p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground mb-1">Come funziona</p>
        <p>Il check-in è <strong>volontario</strong>: sei tu a segnalare dove ti trovi quando vuoi. Ogni check-in guadagna punti (+10 base, +15 dopo 3 giorni di fila, +20 dopo 7). Costruisce fiducia, non sorveglianza.</p>
      </div>
    </div>
  );
}

// ─── NARRATIVA AI TAB ─────────────────────────────────────────────────────────
function NarrativeTab() {
  const { toast } = useToast();
  const [selectedMember, setSelectedMember] = useState<string | null>(null);
  const [narrative, setNarrative] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { data: familySettings = [] } = useQuery<FamilyMemberSettings[]>({ queryKey: ["/api/profile/family-settings"] });

  const generateNarrative = async (memberId: string) => {
    setSelectedMember(memberId);
    setLoading(true);
    setNarrative(null);
    try {
      const res = await fetch(`/api/ai/narrative/${memberId}`, { headers: getAuthHeaders() });
      const data = await res.json();
      setNarrative(data.narrative);
    } catch {
      toast({ title: "Errore generazione narrativa", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-purple-50 dark:bg-purple-950 rounded-xl p-3">
        <p className="text-xs font-semibold text-purple-700 dark:text-purple-300 mb-1">🧠 Narrativa con tono affettuoso</p>
        <p className="text-[11px] text-purple-600 dark:text-purple-400">Claude racconta la giornata di ogni membro con linguaggio naturale e caldo, come farebbe un familiare attento.</p>
      </div>

      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Scegli un membro</p>
        <div className="space-y-1.5">
          {familySettings.map(({ profile }) => (
            <button
              key={profile.id}
              data-testid={`narrative-member-${profile.id}`}
              onClick={() => generateNarrative(profile.id)}
              className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-colors text-left ${selectedMember === profile.id ? "border-primary bg-primary/5" : "border-border hover:bg-accent/50"}`}
            >
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ backgroundColor: profile.colorHex }}>
                {profile.name.charAt(0)}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{profile.name}</p>
                <p className="text-[11px] text-muted-foreground capitalize">{profile.role}</p>
              </div>
              {selectedMember === profile.id && loading
                ? <RefreshCw className="w-4 h-4 animate-spin text-primary" />
                : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>

      {loading && (
        <div className="bg-muted/20 rounded-xl p-4 text-center">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-purple-500" />
          <p className="text-xs text-muted-foreground">Claude sta scrivendo la narrativa…</p>
        </div>
      )}

      {narrative && !loading && (
        <div className="bg-gradient-to-br from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 border border-purple-200 dark:border-purple-800 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-4 h-4 text-purple-500" />
            <p className="text-xs font-semibold text-purple-700 dark:text-purple-300">Narrativa di oggi</p>
          </div>
          <p className="text-sm text-foreground leading-relaxed italic">"{narrative}"</p>
          <button data-testid="button-rigenera-narrative" onClick={() => selectedMember && generateNarrative(selectedMember)} className="mt-2 text-[10px] text-purple-600 dark:text-purple-400 hover:underline flex items-center gap-1">
            <RefreshCw className="w-3 h-3" /> Rigenera
          </button>
        </div>
      )}
    </div>
  );
}

// ─── BATTERIA TAB ─────────────────────────────────────────────────────────────
function BatteryTab() {
  const { toast } = useToast();
  const { data: settings, isLoading } = useQuery<ProfileSettings>({ queryKey: ["/api/profile/settings"] });

  const update = useMutation({
    mutationFn: (body: Partial<ProfileSettings>) => apiRequest("PATCH", "/api/profile/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/settings"] });
      toast({ title: "Modalità batteria aggiornata" });
    },
  });

  const mode = settings?.batteryMode || "auto";

  const MODES = [
    { id: "save", label: "Risparmio energetico", desc: "Aggiornamento ogni 5 minuti. Consigliato quando sei fermo.", icon: ZapOff, color: "text-green-600", bg: "bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800" },
    { id: "auto", label: "Adattivo (consigliato)", desc: "30s quando ti muovi, 5 minuti quando sei fermo. Bilanciato.", icon: Battery, color: "text-blue-600", bg: "bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800" },
    { id: "precise", label: "Alta precisione", desc: "Aggiornamento ogni 30 secondi sempre. Usa più batteria.", icon: Zap, color: "text-orange-600", bg: "bg-orange-50 dark:bg-orange-950 border-orange-200 dark:border-orange-800" },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-yellow-50 dark:bg-yellow-950 rounded-xl p-3">
        <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-300 mb-1">🔋 Ottimizzazione batteria intelligente</p>
        <p className="text-[11px] text-yellow-600 dark:text-yellow-400">La modalità adattiva rileva automaticamente il tuo movimento e riduce la frequenza GPS quando sei fermo — risparmiando fino al 60% di batteria rispetto al tracciamento continuo.</p>
      </div>

      <div className="space-y-2">
        {MODES.map(m => (
          <button
            key={m.id}
            data-testid={`battery-mode-${m.id}`}
            onClick={() => update.mutate({ batteryMode: m.id })}
            disabled={update.isPending}
            className={`w-full flex items-center gap-3 p-3.5 rounded-xl border-2 transition-all text-left ${mode === m.id ? m.bg + " border-current " + m.color : "border-border hover:bg-accent/50"}`}
          >
            <m.icon className={`w-5 h-5 flex-shrink-0 ${mode === m.id ? m.color : "text-muted-foreground"}`} />
            <div className="flex-1">
              <p className={`text-sm font-semibold ${mode === m.id ? m.color : ""}`}>{m.label}</p>
              <p className="text-[11px] text-muted-foreground">{m.desc}</p>
            </div>
            {mode === m.id && <CheckCircle className={`w-4 h-4 flex-shrink-0 ${m.color}`} />}
          </button>
        ))}
      </div>

      <div className="bg-muted/20 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Come funziona la modalità adattiva</p>
        <p>• Velocità &gt; 0.5 m/s o spostamento &gt; 20m → aggiornamento ogni <strong>30 secondi</strong></p>
        <p>• Fermo da più di 2 minuti → aggiornamento ogni <strong>5 minuti</strong></p>
        <p>• La frequenza si adatta automaticamente, senza configurazione</p>
      </div>
    </div>
  );
}

// ─── ANZIANI TAB ─────────────────────────────────────────────────────────────
function ElderlyTab() {
  const { toast } = useToast();
  const { data: familySettings = [] } = useQuery<FamilyMemberSettings[]>({ queryKey: ["/api/profile/family-settings"] });
  const { data: mySettings } = useQuery<ProfileSettings>({ queryKey: ["/api/profile/settings"] });
  const [editingMemberId, setEditingMemberId] = useState<string | null>(null);
  const [caregiverName, setCaregiverName] = useState("");
  const [caregiverPhone, setCaregiverPhone] = useState("");
  const [nightFrom, setNightFrom] = useState("22:00");
  const [nightTo, setNightTo] = useState("06:00");

  const update = useMutation({
    mutationFn: (body: Partial<ProfileSettings>) => apiRequest("PATCH", "/api/profile/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/settings"] });
      queryClient.invalidateQueries({ queryKey: ["/api/profile/family-settings"] });
      toast({ title: "Impostazioni anziani aggiornate" });
      setEditingMemberId(null);
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const elderlyMembers = familySettings.filter(m => m.profile.role === "elderly" || m.settings?.elderlyTrackingEnabled);

  return (
    <div className="space-y-4">
      <div className="bg-red-50 dark:bg-red-950 rounded-xl p-3">
        <p className="text-xs font-semibold text-red-700 dark:text-red-300 mb-1">👴 Protezione anziani e persone fragili</p>
        <p className="text-[11px] text-red-600 dark:text-red-400">Monitoraggio delicato per genitori anziani o con demenza. Alert notturni, zone sicure, avvisi uscite insolite.</p>
      </div>

      {familySettings.map(({ profile, settings }) => (
        <div key={profile.id} className="border border-border rounded-xl overflow-hidden">
          <div className="flex items-center gap-3 px-3 py-2.5 bg-muted/20">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: profile.colorHex }}>
              {profile.name.charAt(0)}
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">{profile.name}</p>
              <p className="text-[11px] text-muted-foreground capitalize">{profile.role}</p>
            </div>
            <button
              data-testid={`toggle-elderly-${profile.id}`}
              onClick={() => {
                if (!settings?.elderlyTrackingEnabled) {
                  setEditingMemberId(profile.id);
                  setCaregiverName(settings?.caregiverName || "");
                  setCaregiverPhone(settings?.caregiverPhone || "");
                  setNightFrom(settings?.nightAlertFrom || "22:00");
                  setNightTo(settings?.nightAlertTo || "06:00");
                } else {
                  update.mutate({ elderlyTrackingEnabled: false });
                }
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${settings?.elderlyTrackingEnabled ? "bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300" : "bg-muted text-muted-foreground hover:bg-accent"}`}
            >
              {settings?.elderlyTrackingEnabled ? "Attivo" : "Attiva"}
            </button>
          </div>

          {settings?.elderlyTrackingEnabled && (
            <div className="px-3 pb-3 pt-2 space-y-2">
              <div className="flex items-center gap-2">
                <Moon className="w-3.5 h-3.5 text-indigo-500" />
                <span className="text-xs">Alert uscita notturna: <strong>{settings.nightAlertFrom} – {settings.nightAlertTo}</strong></span>
                {settings.nightAlertEnabled && <Badge className="text-[10px] bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300">Attivo</Badge>}
              </div>
              {settings.caregiverName && (
                <div className="flex items-center gap-2">
                  <Phone className="w-3.5 h-3.5 text-green-500" />
                  <span className="text-xs">{settings.caregiverName}: <strong>{settings.caregiverPhone}</strong></span>
                </div>
              )}
              {settings.safeZonesOnly && (
                <div className="flex items-center gap-2">
                  <Shield className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-xs">Alert se esce dalle zone sicure</span>
                </div>
              )}
            </div>
          )}
        </div>
      ))}

      {editingMemberId && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={() => setEditingMemberId(null)}>
          <div className="bg-background w-full max-w-md rounded-t-2xl p-5 pb-8 space-y-3" onClick={e => e.stopPropagation()}>
            <p className="font-semibold">Configura protezione anziani</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Orario inizio notte</Label>
                <Input type="time" value={nightFrom} onChange={e => setNightFrom(e.target.value)} className="mt-1" data-testid="input-night-from" />
              </div>
              <div>
                <Label className="text-xs">Orario fine notte</Label>
                <Input type="time" value={nightTo} onChange={e => setNightTo(e.target.value)} className="mt-1" data-testid="input-night-to" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Nome caregiver (badante, figlio, ecc.)</Label>
              <Input value={caregiverName} onChange={e => setCaregiverName(e.target.value)} placeholder="Es. Marco" className="mt-1" data-testid="input-caregiver-name" />
            </div>
            <div>
              <Label className="text-xs">Telefono caregiver</Label>
              <Input value={caregiverPhone} onChange={e => setCaregiverPhone(e.target.value)} placeholder="+39 333 000 0000" className="mt-1" data-testid="input-caregiver-phone" />
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditingMemberId(null)}>Annulla</Button>
              <Button data-testid="button-save-elderly" className="flex-1" onClick={() => update.mutate({ elderlyTrackingEnabled: true, nightAlertEnabled: true, nightAlertFrom: nightFrom, nightAlertTo: nightTo, caregiverName, caregiverPhone, safeZonesOnly: true })} disabled={update.isPending}>
                {update.isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Salva"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MODALITÀ CLASSE TAB ──────────────────────────────────────────────────────
function SchoolModeTab() {
  const { toast } = useToast();
  const { data: settings } = useQuery<ProfileSettings>({ queryKey: ["/api/profile/settings"] });

  const update = useMutation({
    mutationFn: (body: Partial<ProfileSettings>) => apiRequest("PATCH", "/api/profile/settings", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/profile/settings"] });
      toast({ title: "Modalità classe aggiornata" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const enabled = settings?.schoolModeEnabled || false;
  const from = settings?.schoolModeFrom || "08:00";
  const to = settings?.schoolModeTo || "13:30";

  const days = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"];
  const activeDays: string[] = settings?.schoolModeDays || ["Lun", "Mar", "Mer", "Gio", "Ven"];

  const now = new Date();
  const hour = now.getHours();
  const min = now.getMinutes();
  const currentTime = hour * 60 + min;
  const [fH, fM] = from.split(":").map(Number);
  const [tH, tM] = to.split(":").map(Number);
  const isSchoolHours = enabled && currentTime >= fH * 60 + fM && currentTime <= tH * 60 + tM;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 dark:bg-blue-950 rounded-xl p-3">
        <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-1">📵 Modalità "sono in classe"</p>
        <p className="text-[11px] text-blue-600 dark:text-blue-400">Durante le ore scolastiche le notifiche di posizione ai genitori vengono sospese automaticamente. Riducono l'ansia inutile e rispettano l'autonomia dello studente.</p>
      </div>

      {isSchoolHours && (
        <div className="flex items-center gap-2 bg-blue-500 text-white rounded-xl p-3">
          <GraduationCap className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold">Sono in classe adesso</p>
            <p className="text-xs opacity-90">Le notifiche posizione sono sospese fino alle {to}</p>
          </div>
        </div>
      )}

      <div className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-colors ${enabled ? "border-blue-500 bg-blue-50 dark:bg-blue-950" : "border-border"}`}>
        <div>
          <p className="text-sm font-semibold">Attiva modalità classe</p>
          <p className="text-xs text-muted-foreground">Sospende le notifiche GPS durante la scuola</p>
        </div>
        <button
          data-testid="toggle-school-mode"
          onClick={() => update.mutate({ schoolModeEnabled: !enabled })}
          disabled={update.isPending}
          className={`w-11 h-6 rounded-full transition-colors flex-shrink-0 ${enabled ? "bg-blue-500" : "bg-muted"}`}
        >
          <div className={`w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${enabled ? "translate-x-5" : "translate-x-0"}`} />
        </button>
      </div>

      {enabled && (
        <div className="space-y-3 border border-border rounded-xl p-3">
          <p className="text-xs font-semibold">Orario scolastico</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs">Inizio</Label>
              <Input type="time" defaultValue={from} onBlur={e => update.mutate({ schoolModeFrom: e.target.value })} className="mt-1" data-testid="input-school-from" />
            </div>
            <div>
              <Label className="text-xs">Fine</Label>
              <Input type="time" defaultValue={to} onBlur={e => update.mutate({ schoolModeTo: e.target.value })} className="mt-1" data-testid="input-school-to" />
            </div>
          </div>

          <div>
            <p className="text-xs font-medium mb-2">Giorni scolastici</p>
            <div className="flex gap-1.5 flex-wrap">
              {days.map(d => {
                const active = activeDays.includes(d);
                return (
                  <button
                    key={d}
                    data-testid={`day-toggle-${d}`}
                    onClick={() => {
                      const newDays = active ? activeDays.filter(x => x !== d) : [...activeDays, d];
                      update.mutate({ schoolModeDays: newDays });
                    }}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${active ? "bg-blue-500 text-white" : "bg-muted text-muted-foreground"}`}
                  >{d}</button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className="bg-muted/20 rounded-xl p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Cosa viene sospeso</p>
        <p>• Notifiche push di posizione ai genitori</p>
        <p>• Alert "è arrivato" / "è partito" da zone sicure</p>
        <p>• La posizione rimane visibile sulla mappa ma senza notifiche attive</p>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function SmartProtectionPage() {
  const [activeTab, setActiveTab] = useState<Tab>("checkin");

  return (
    <div className="flex-1 overflow-hidden flex flex-col">
      <div className="flex border-b border-border overflow-x-auto flex-shrink-0">
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            data-testid={`smart-tab-${t.id}`}
            className={`flex flex-col items-center gap-0.5 px-3 py-2.5 min-w-[64px] transition-colors relative ${activeTab === t.id ? "text-foreground border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            <t.icon className="w-4 h-4" style={{ color: activeTab === t.id ? t.color : undefined }} />
            <span className="text-[9px] font-medium whitespace-nowrap">{t.label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === "checkin" && <CheckinTab />}
        {activeTab === "narrative" && <NarrativeTab />}
        {activeTab === "battery" && <BatteryTab />}
        {activeTab === "elderly" && <ElderlyTab />}
        {activeTab === "school" && <SchoolModeTab />}
        {activeTab === "sensors" && <SensorsTab />}
      </div>
    </div>
  );
}
