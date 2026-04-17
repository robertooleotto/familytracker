import { useState, useEffect, useRef } from "react";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Check, Mic, Plus, Sun, Sunrise, Sunset, Moon,
  Send, Cloud, CloudRain, CloudSnow, CloudLightning, CloudSun,
  ArrowRight, Clock, MoreVertical,
} from "lucide-react";
import type { Profile, Event, ShoppingItem, Task, Medication } from "@shared/schema";
import { format, isToday, isTomorrow, addDays } from "date-fns";
import { it } from "date-fns/locale";

interface MemberLocation {
  profile: Profile;
  location: { lat: number; lng: number; timestamp: string; isMoving?: boolean; batteryPct?: number | null } | null;
  locationPaused?: boolean;
}
interface BriefingPageProps { onNavigate: (tab: string) => void; }

// Raggruppa i membri per co-localizzazione (soglia ~300 m)
const CO_LOC_THRESHOLD = 0.003; // gradi ≈ 300 m
function groupByLocation(members: MemberLocation[]): MemberLocation[][] {
  const used = new Set<string>();
  const groups: MemberLocation[][] = [];
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    if (used.has(m.profile.id)) continue;
    const loc = m.location;
    if (!loc || m.locationPaused) { used.add(m.profile.id); groups.push([m]); continue; }
    const group: MemberLocation[] = [m];
    used.add(m.profile.id);
    for (let j = i + 1; j < members.length; j++) {
      const n = members[j];
      if (used.has(n.profile.id)) continue;
      const nloc = n.location;
      if (!nloc || n.locationPaused) continue;
      const dLat = Math.abs(loc.lat - nloc.lat);
      const dLng = Math.abs(loc.lng - nloc.lng);
      if (dLat < CO_LOC_THRESHOLD && dLng < CO_LOC_THRESHOLD) {
        group.push(n);
        used.add(n.profile.id);
      }
    }
    groups.push(group);
  }
  return groups;
}
type TimeSlot = "morning" | "afternoon" | "evening" | "night";

// ── Weather types ────────────────────────────────────────────────────────────
interface WeatherDay {
  date: Date;
  maxTemp: number;
  minTemp: number;
  iconType: "sun" | "cloud" | "rain" | "storm" | "snow";
  description: string;
}
interface WeatherData {
  temp: number; feelsLike: number; city: string;
  wind: number; humidity: number; description: string;
  iconType: "sun" | "cloud" | "rain" | "storm" | "snow";
  forecast: WeatherDay[];
}
function weatherCodeToMeta(code: number): { description: string; iconType: WeatherData["iconType"] } {
  if (code === 0)  return { description: "Soleggiato",            iconType: "sun" };
  if (code <= 3)   return { description: "Parz. nuvoloso",        iconType: "cloud" };
  if (code <= 49)  return { description: "Nuvoloso",              iconType: "cloud" };
  if (code <= 67)  return { description: "Pioggia",               iconType: "rain" };
  if (code <= 79)  return { description: "Neve",                  iconType: "snow" };
  if (code <= 99)  return { description: "Temporale",             iconType: "storm" };
  return { description: "Variabile", iconType: "cloud" };
}
function useWeather(): { weather: WeatherData | null; loading: boolean } {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords;
        const [a, b] = await Promise.allSettled([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code,relative_humidity_2m&daily=weather_code,temperature_2m_max,temperature_2m_min&forecast_days=4&timezone=auto`),
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`),
        ]);
        const meteo = a.status === "fulfilled" ? await a.value.json() : {};
        const geo   = b.status === "fulfilled" ? await b.value.json() : {};
        const meta  = weatherCodeToMeta(meteo.current?.weather_code ?? 0);
        const daily = meteo.daily;
        const forecast: WeatherDay[] = [];
        if (daily?.time) {
          for (let i = 1; i <= 3; i++) {
            if (!daily.time[i]) continue;
            const m = weatherCodeToMeta(daily.weather_code?.[i] ?? 0);
            forecast.push({
              date: new Date(daily.time[i]),
              maxTemp: Math.round(daily.temperature_2m_max?.[i] ?? 0),
              minTemp: Math.round(daily.temperature_2m_min?.[i] ?? 0),
              ...m,
            });
          }
        }
        setWeather({
          temp: Math.round(meteo.current?.temperature_2m ?? 0),
          feelsLike: Math.round(meteo.current?.apparent_temperature ?? 0),
          wind: Math.round(meteo.current?.wind_speed_10m ?? 0),
          humidity: Math.round(meteo.current?.relative_humidity_2m ?? 0),
          city: geo.address?.city || geo.address?.town || geo.address?.village || "",
          forecast,
          ...meta,
        });
      } catch (err) {
        console.error("[weather] Failed to fetch weather data:", err);
        toast({ title: "Meteo non disponibile", description: "Impossibile recuperare i dati meteo al momento", variant: "destructive" });
      } finally { setLoading(false); }
    }, () => setLoading(false), { timeout: 8000 });
  }, [toast]);
  return { weather, loading };
}
const WEATHER_ICON_MAP: Record<WeatherData["iconType"], typeof CloudSun> = {
  sun: CloudSun, cloud: Cloud, rain: CloudRain, storm: CloudLightning, snow: CloudSnow,
};
const WEATHER_BG: Record<WeatherData["iconType"], string> = {
  sun:   "from-sky-400 to-blue-500",
  cloud: "from-slate-400 to-slate-500",
  rain:  "from-slate-500 to-blue-700",
  storm: "from-slate-700 to-gray-800",
  snow:  "from-sky-200 to-blue-400",
};

// ── Helpers ──────────────────────────────────────────────────────────────────
function getTimeSlot(h: number): TimeSlot {
  if (h >= 5 && h < 12) return "morning";
  if (h >= 12 && h < 18) return "afternoon";
  if (h >= 18 && h < 22) return "evening";
  return "night";
}
function useLiveTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  return now;
}
function formatEventLabel(startAt: string | Date) {
  const d = new Date(startAt);
  if (isToday(d)) {
    const mins = Math.round((d.getTime() - Date.now()) / 60000);
    if (mins > 0 && mins <= 120) return `fra ${mins < 60 ? `${mins} min` : `${Math.round(mins / 60)}h`}`;
    return `oggi ${format(d, "H:mm")}`;
  }
  if (isTomorrow(d)) return `domani ${format(d, "H:mm")}`;
  return format(d, "EEE d MMM · H:mm", { locale: it });
}
function isOnline(m: MemberLocation): boolean {
  if (!m.location || m.locationPaused) return false;
  return Date.now() - new Date(m.location.timestamp).getTime() < 600000;
}

const DAY_NAMES = ["dom","lun","mar","mer","gio","ven","sab"];
const MON_NAMES = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];
const TIME_SLOT_META: Record<TimeSlot, { label: string; Icon: typeof Sun; greeting: string }> = {
  morning:   { label: "Mattina",    Icon: Sunrise,  greeting: "Buongiorno" },
  afternoon: { label: "Pomeriggio", Icon: Sun,      greeting: "Buon pomeriggio" },
  evening:   { label: "Sera",       Icon: Sunset,   greeting: "Buonasera" },
  night:     { label: "Notte",      Icon: Moon,     greeting: "Buonanotte" },
};
const SLOTS: TimeSlot[] = ["morning", "afternoon", "evening", "night"];
const SLOT_HOURS: Record<TimeSlot, [number, number]> = {
  morning: [5, 12], afternoon: [12, 18], evening: [18, 22], night: [22, 30],
};
const DINNER_SUGGESTIONS = [
  "Pasta al pomodoro","Risotto con verdure","Minestra di legumi",
  "Pollo arrosto","Pizza fatta in casa","Zuppa di verdure",
];
function getTodayDinner(items: ShoppingItem[] | undefined) {
  return {
    dish: DINNER_SUGGESTIONS[new Date().getDate() % DINNER_SUGGESTIONS.length],
    ingredientCount: (items ?? []).filter(i => !i.checked).length,
  };
}

// ── MiniMap component ────────────────────────────────────────────────────────
interface MiniMapProps {
  members: MemberLocation[];
  onClick: () => void;
}
function MiniMap({ members, onClick }: MiniMapProps) {
  const mapRef   = useRef<HTMLDivElement>(null);
  const lRef     = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (!mapRef.current || lRef.current) return;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapRef.current) return;
      lRef.current = L.map(mapRef.current, {
        center: [41.9028, 12.4964],
        zoom: 12,
        zoomControl: false,
        attributionControl: false,
        dragging: false,
        touchZoom: false,
        scrollWheelZoom: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
      });
      const mbToken = import.meta.env.VITE_MAPBOX_TOKEN || "";
      L.tileLayer("https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/256/{z}/{x}/{y}@2x?access_token=" + mbToken, {
        maxZoom: 20,
      }).addTo(lRef.current);
    })();
    return () => {
      cancelled = true;
      if (lRef.current) { lRef.current.remove(); lRef.current = null; }
      markersRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!lRef.current) return;
    let t = setTimeout(async () => {
      const L = (await import("leaflet")).default;
      if (!lRef.current) return;
      const valid = members.filter(m => m.location && !m.locationPaused);
      const bounds: [number, number][] = [];

      markersRef.current.forEach((mk, id) => {
        if (!valid.find(m => m.profile.id === id)) { mk.remove(); markersRef.current.delete(id); }
      });

      valid.forEach(m => {
        const loc = m.location!;
        const color = m.profile.colorHex || "#3B82F6";
        bounds.push([loc.lat, loc.lng]);
        const html = `<div style="width:28px;height:28px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 1px 6px rgba(0,0,0,0.2);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:white;font-family:system-ui;">${m.profile.name.charAt(0)}</div>`;
        const icon = L.divIcon({ html, className: "", iconSize: [28, 28], iconAnchor: [14, 14] });
        const existing = markersRef.current.get(m.profile.id);
        if (existing) { existing.setLatLng([loc.lat, loc.lng]); existing.setIcon(icon); }
        else { const mk = L.marker([loc.lat, loc.lng], { icon }).addTo(lRef.current!); markersRef.current.set(m.profile.id, mk); }
      });

      if (bounds.length === 1) lRef.current.setView(bounds[0], 14, { animate: false });
      else if (bounds.length > 1) lRef.current.fitBounds(bounds, { padding: [20, 20], animate: false });
    }, 200);
    return () => clearTimeout(t);
  }, [members]);

  const onlineCnt = members.filter(isOnline).length;

  return (
    <div
      className="rounded-3xl overflow-hidden border border-slate-200 shadow-sm cursor-pointer relative"
      style={{ height: 140 }}
      onClick={onClick}
      data-testid="minimap-home"
    >
      <div ref={mapRef} className="w-full h-full" />
      <div className="absolute inset-0 pointer-events-none" />
      <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-white/90 backdrop-blur px-2.5 py-1.5 rounded-full text-xs font-medium text-slate-700 shadow-sm">
        <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
        {onlineCnt > 0 ? `${onlineCnt} visibil${onlineCnt === 1 ? "e" : "i"}` : "Nessuno online"}
      </div>
      <div className="absolute bottom-2 right-2 flex items-center gap-1 bg-white/90 backdrop-blur px-2 py-1 rounded-full text-xs text-slate-500 shadow-sm">
        Mappa <ArrowRight size={11} />
      </div>
    </div>
  );
}

// ── Component ────────────────────────────────────────────────────────────────
export default function BriefingPage({ onNavigate }: BriefingPageProps) {
  const { profile } = useAuth();
  const now = useLiveTime();
  const { weather, loading: weatherLoading } = useWeather();
  const [activeSlot, setActiveSlot] = useState<TimeSlot>(getTimeSlot(now.getHours()));
  const [aiInput, setAiInput] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [markedMeds, setMarkedMeds] = useState<Set<string>>(new Set());
  const [dinnerConfirmed, setDinnerConfirmed] = useState(false);
  const [weatherExpanded, setWeatherExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: members } = useQuery<MemberLocation[]>({ queryKey: ["/api/family/locations"], refetchInterval: 30000 });
  const { data: aiSummaryData, isLoading: aiSummaryLoading } = useQuery<{ text: string }>({
    queryKey: ["/api/ai/summary"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const { data: events }        = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: shoppingItems } = useQuery<ShoppingItem[]>({ queryKey: ["/api/shopping"] });
  const { data: tasks }         = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: meds }          = useQuery<(Medication & { profile: Profile })[]>({ queryKey: ["/api/medications"] });

  const aiMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/briefing/chat", { message }),
    onSuccess: async (res) => { const d = await res.json(); setAiReply(d.reply); },
    onError: (error: Error) => {
      console.error("AI briefing error:", error);
      toast({ title: "Errore", description: "Non riesco a generare il briefing. Riprova più tardi.", variant: "destructive" });
    },
  });

  const pickupMutation = useMutation({
    mutationFn: (eventId: string) => apiRequest("PATCH", `/api/events/${eventId}/pickup`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/events"] }); },
  });

  const sendMessage = () => {
    const msg = aiInput.trim();
    if (!msg || aiMutation.isPending) return;
    setAiReply(null); aiMutation.mutate(msg); setAiInput("");
  };

  const upcomingEvents = (events ?? []).filter(e => new Date(e.startAt) > new Date()).sort((a,b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  const nextEvent = upcomingEvents[0];
  const msUntil   = nextEvent ? new Date(nextEvent.startAt).getTime() - Date.now() : Infinity;
  const isUrgent  = msUntil < 2 * 3600000;

  const [slotStart, slotEnd] = SLOT_HOURS[activeSlot];
  const slotMeds = (meds ?? []).filter(m => {
    if (!m.active) return false;
    return ((m.scheduleTimes as string[]) ?? []).some(t => { const h = parseInt(t.split(":")[0]); return h >= slotStart && h < slotEnd; });
  });

  const pendingItems = (shoppingItems ?? []).filter(i => !i.checked).length;
  const pendingTasks = (tasks ?? []).filter(t => !t.completedAt).length;
  const { dish, ingredientCount } = getTodayDinner(shoppingItems);

  const timeLabel = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
  const dateLabel = `${DAY_NAMES[now.getDay()]} ${now.getDate()} ${MON_NAMES[now.getMonth()]}`;
  const greeting  = TIME_SLOT_META[activeSlot].greeting;
  const firstName = profile?.name?.split(" ")[0] ?? "ciao";
  const adults    = (members ?? []).filter(m => m.profile.role === "parent");
  const dinnerCook = adults[0]?.profile ?? null;
  const WeatherIcon = weather ? WEATHER_ICON_MAP[weather.iconType] : CloudSun;

  // ── Pickup alerts: eventi con bambini che finiscono entro 2h ──
  const pickupAlerts = (() => {
    const allMembers = members ?? [];
    const childIds = new Set(allMembers.filter(m => m.profile.role === "child").map(m => m.profile.id));
    if (childIds.size === 0) return [];
    const now = Date.now();
    const window2h = 2 * 3600000;
    return (events ?? []).filter(ev => {
      const triggerTime = ev.endAt ? new Date(ev.endAt).getTime() : new Date(ev.startAt).getTime();
      const diff = triggerTime - now;
      return diff > -5 * 60000 && diff < window2h && (ev.assignedTo ?? []).some((id: string) => childIds.has(id));
    }).map(ev => {
      const childProfiles = (ev.assignedTo ?? []).map((id: string) => allMembers.find(m => m.profile.id === id)?.profile).filter(Boolean);
      const confirmerProfile = ev.pickupConfirmedBy ? allMembers.find(m => m.profile.id === ev.pickupConfirmedBy)?.profile : null;
      return { ev, childProfiles, confirmerProfile };
    });
  })();

  const contextSummary = (() => {
    const parts: string[] = [];
    if (nextEvent && isUrgent) parts.push(`"${nextEvent.title}" tra ${Math.round(msUntil / 60000)} min.`);
    else if (nextEvent)        parts.push(`Prossimo: "${nextEvent.title}" ${formatEventLabel(nextEvent.startAt)}.`);
    if (slotMeds.length > 0)   parts.push(`${slotMeds.length} farmaci.`);
    if (pendingTasks > 0)      parts.push(`${pendingTasks} compiti.`);
    if (pendingItems > 0)      parts.push(`${pendingItems} prodotti.`);
    return parts.length > 0 ? parts.join(" ") : "Tutto in ordine.";
  })();

  const forecastDayLabel = (d: Date) => {
    if (isToday(d)) return "Oggi";
    if (isTomorrow(d)) return "Dom";
    return DAY_NAMES[d.getDay()].charAt(0).toUpperCase() + DAY_NAMES[d.getDay()].slice(1);
  };

  // quick location summary for status bar
  const onlineCount = (members ?? []).filter(m => isOnline(m)).length;
  const totalCount  = (members ?? []).length;
  const statusLabel = onlineCount === totalCount && totalCount > 0
    ? `Tutti a casa · ${timeLabel}`
    : `${onlineCount}/${totalCount} in posizione · ${timeLabel}`;

  return (
    <div className="niva-bg flex flex-col h-full">
      <style>{`
        @keyframes waveHand {
          0%{transform:rotate(0deg)} 10%{transform:rotate(14deg)} 20%{transform:rotate(-8deg)}
          30%{transform:rotate(14deg)} 40%{transform:rotate(-4deg)} 50%{transform:rotate(10deg)}
          60%{transform:rotate(0deg)} 100%{transform:rotate(0deg)}
        }
        .wave { animation: waveHand 2.5s infinite; display:inline-block; transform-origin:bottom right; }
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.35s ease forwards; }
      `}</style>

      <div className="flex-1 overflow-y-auto no-scrollbar pb-4">

        {/* ── HEADER ROW (Kinly Niva) ── */}
        <div className="px-5 pt-6 pb-4 flex items-center justify-between">
          <button onClick={() => onNavigate("map")} className="p-1.5 rounded-full transition-colors active:scale-90" style={{ color: "rgba(80,50,30,.5)" }} data-testid="button-clock">
            <Clock size={18} />
          </button>
          <h1 className="text-[17px] font-bold" style={{ color: "var(--niva-text-warm)" }}>
            Famiglia {profile?.name?.split(" ").slice(-1)[0] ?? ""}
          </h1>
          <button onClick={() => onNavigate("settings")} className="p-1.5 rounded-full transition-colors active:scale-90" style={{ color: "rgba(80,50,30,.5)" }} data-testid="button-settings">
            <MoreVertical size={18} />
          </button>
        </div>

        {/* ── FAMILY MEMBER AVATARS ROW ── */}
        {(members ?? []).length > 0 && (
          <div className="flex gap-2 px-4 pb-4 justify-center overflow-x-auto no-scrollbar items-center flex-wrap">
            {(members ?? []).map(m => {
              const online = isOnline(m);
              return (
                <button
                  key={m.profile.id}
                  onClick={() => onNavigate("map")}
                  className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
                  data-testid={`member-avatar-${m.profile.id}`}
                >
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center text-white text-sm font-bold"
                    style={{
                      backgroundColor: m.profile.colorHex || "var(--niva-indigo)",
                      border: "2.5px solid rgba(255,255,255,.35)",
                      opacity: online ? 1 : 0.6,
                    }}
                  >
                    {m.profile.name.charAt(0)}
                  </div>
                  <span className="text-[10px]" style={{ color: "var(--niva-text-warm-sec)" }}>
                    {m.profile.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
            {/* Add button */}
            <button
              onClick={() => onNavigate("members")}
              className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
              data-testid="button-add-member"
            >
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-white text-lg"
                style={{
                  border: "2.5px dashed rgba(255,255,255,.35)",
                  background: "transparent",
                }}
              >
                <Plus size={18} />
              </div>
              <span className="text-[10px]" style={{ color: "var(--niva-text-warm-sec)" }}>
                Aggiungi
              </span>
            </button>
          </div>
        )}

        {/* ── AI CARD (MAIN) ── */}
        <div className="px-4 pb-4">
          <div className="glass-primary rounded-[28px] p-6 min-h-[320px] flex flex-col">
            {/* AI Card Content */}
            {aiSummaryLoading ? (
              <div className="space-y-3">
                <div className="h-4 w-32 rounded animate-pulse" style={{ background: "rgba(255,255,255,.2)" }} />
                <div className="h-8 w-full rounded animate-pulse" style={{ background: "rgba(255,255,255,.15)" }} />
                <div className="h-6 w-3/4 rounded animate-pulse" style={{ background: "rgba(255,255,255,.15)" }} />
              </div>
            ) : (
              <>
                <p className="text-[12px] uppercase tracking-[2px] mb-2" style={{ color: "rgba(255,255,255,.5)" }}>
                  CIAO {firstName?.toUpperCase()}!
                </p>
                {aiSummaryData?.text || aiReply ? (
                  <p className="text-[16px] font-normal text-white leading-relaxed flex-1" style={{ textShadow: "0 2px 8px rgba(0,0,0,.1)" }}>
                    {aiSummaryData?.text || aiReply}
                  </p>
                ) : (
                  <>
                    <h2 className="text-[26px] font-[800] text-white mb-4 leading-tight" style={{ letterSpacing: "-.5px", textShadow: "0 2px 8px rgba(0,0,0,.1)" }}>
                      Come posso aiutarti oggi?
                    </h2>
                    <div className="flex gap-2 mb-auto flex-wrap">
                      <button
                        onClick={() => { setAiInput("Aggiungi attività"); }}
                        className="glass-tertiary px-4 py-2 rounded-[20px] text-[13px] text-white font-medium active:scale-95 transition-transform"
                        data-testid="button-ai-add-task"
                      >
                        Aggiungi attività
                      </button>
                      <button
                        onClick={() => { setAiInput("Organizza calendario"); }}
                        className="glass-tertiary px-4 py-2 rounded-[20px] text-[13px] text-white font-medium active:scale-95 transition-transform"
                        data-testid="button-ai-organize-cal"
                      >
                        Organizza calendario
                      </button>
                      <button
                        onClick={() => { setAiInput("Delega attività"); }}
                        className="glass-tertiary px-4 py-2 rounded-[20px] text-[13px] text-white font-medium active:scale-95 transition-transform"
                        data-testid="button-ai-delegate"
                      >
                        Delega attività
                      </button>
                    </div>
                  </>
                )}
              </>
            )}

            {/* AI Input Bar */}
            <div className="relative mt-auto pt-4">
              <input
                ref={inputRef}
                type="text"
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && sendMessage()}
                placeholder="Chiedi qualcosa..."
                disabled={aiMutation.isPending}
                className="glass-secondary w-full rounded-[28px] py-3 pl-5 pr-14 text-[13px] text-white placeholder-white/40 disabled:opacity-60 transition-all focus:outline-none"
                data-testid="input-ai-briefing"
              />
              <button
                onClick={sendMessage}
                disabled={aiMutation.isPending || !aiInput.trim()}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full flex items-center justify-center transition-all disabled:opacity-50 active:scale-90"
                style={{ background: "rgba(255,255,255,.1)" }}
                data-testid="button-ai-send-briefing"
              >
                <Send size={14} className="text-white" />
              </button>
              <button
                onClick={() => {}}
                className="absolute right-14 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full flex items-center justify-center transition-all active:scale-90"
                style={{ background: "#4C5FD5", color: "white" }}
                data-testid="button-ai-mic"
              >
                <Mic size={14} />
              </button>
            </div>
          </div>
        </div>

        {/* ── I TUOI IMPEGNI (UPCOMING EVENTS) ── */}
        {upcomingEvents.length > 0 && (
          <div className="px-4 pb-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[17px] font-bold text-white">I tuoi impegni</h3>
              <button onClick={() => onNavigate("calendar")} className="text-[13px] text-white/60 hover:text-white transition-colors" data-testid="button-see-all-events">
                Vedi tutti
              </button>
            </div>
            {/* Filter Pills (horizontal scroll) */}
            <div className="flex gap-2 mb-3 overflow-x-auto no-scrollbar">
              {["TUTTI", "FIGLI", "GENITORI", "CASA"].map(filter => (
                <button
                  key={filter}
                  className="glass-secondary px-4 py-2 rounded-[20px] text-[12px] text-white font-medium flex-shrink-0 active:scale-95 transition-transform"
                  data-testid={`filter-${filter}`}
                >
                  {filter}
                </button>
              ))}
            </div>
            {/* Activity Cards (horizontal scroll) */}
            <div className="flex gap-3 overflow-x-auto no-scrollbar" style={{ scrollSnapType: "x mandatory" }}>
              {upcomingEvents.slice(0, 6).map(event => {
                const eventTime = format(new Date(event.startAt), "H:mm", { locale: it });
                const assignedMember = (members ?? []).find(m => (event.assignedTo ?? []).includes(m.profile.id));
                const tagColor = event.category === "health" ? "var(--niva-magenta)" : event.category === "school" ? "var(--niva-blue)" : event.category === "sport" ? "var(--niva-green)" : "var(--niva-coral)";
                return (
                  <button
                    key={event.id}
                    onClick={() => onNavigate("calendar")}
                    className="glass-secondary rounded-[20px] p-4 flex-shrink-0 w-[240px] flex flex-col active:scale-95 transition-transform"
                    style={{ scrollSnapAlign: "start" }}
                    data-testid={`activity-card-${event.id}`}
                  >
                    {/* Tag badge */}
                    <div
                      className="text-[10px] font-bold text-white px-2 py-1 rounded-full w-fit mb-2"
                      style={{ background: tagColor }}
                    >
                      {event.category?.toUpperCase() ?? "EVENT"}
                    </div>
                    {/* Time */}
                    <p className="text-[12px] text-white/60 mb-1">{eventTime}</p>
                    {/* Title */}
                    <p className="text-[15px] font-bold text-white mb-1 line-clamp-2">{event.title}</p>
                    {/* Location */}
                    {event.location && (
                      <p className="text-[12px] text-white/35 mb-2 line-clamp-1">{event.location}</p>
                    )}
                    {/* Member avatar + name */}
                    {assignedMember && (
                      <div className="flex items-center gap-2 mt-auto pt-2">
                        <div
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{ backgroundColor: assignedMember.profile.colorHex || "var(--niva-indigo)" }}
                        >
                          {assignedMember.profile.name.charAt(0)}
                        </div>
                        <span className="text-[11px] text-white/70">{assignedMember.profile.name.split(" ")[0]}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── DA FARE (TASKS) ── */}
        {(tasks ?? []).filter(t => !t.completedAt).length > 0 && (
          <div className="px-4 pb-4">
            <h3 className="text-[17px] font-bold text-white mb-3">Da fare</h3>
            <div className="flex gap-3 overflow-x-auto no-scrollbar" style={{ scrollSnapType: "x mandatory" }}>
              {(tasks ?? []).filter(t => !t.completedAt).slice(0, 6).map(task => (
                <button
                  key={task.id}
                  onClick={() => onNavigate("tasks")}
                  className="glass-secondary rounded-[18px] p-3 flex-shrink-0 w-[200px] flex flex-col active:scale-95 transition-transform"
                  style={{ scrollSnapAlign: "start" }}
                  data-testid={`task-card-${task.id}`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Check size={14} className={task.completedAt ? "text-emerald-400" : "text-white/40"} />
                  </div>
                  <p className="text-[13px] font-bold text-white line-clamp-2">{task.title}</p>
                  {task.description && (
                    <p className="text-[11px] text-white/50 mt-1 line-clamp-1">{task.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="h-2" />
      </div>
    </div>
  );
}
