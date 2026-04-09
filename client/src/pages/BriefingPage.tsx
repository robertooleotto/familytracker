import { useState, useEffect, useRef } from "react";
import { GapCards } from "@/components/GapCards";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  Check, MapPin, Mic, MessageCircle, Calendar, ShoppingCart, Plus, BookOpen,
  Pill, ChefHat, ChevronRight, ChevronDown, ChevronUp, Sun, Sunrise, Sunset, Moon,
  CheckCircle2, Sparkles, Send, Loader2, Star, Wind, Droplets, Thermometer,
  Cloud, CloudRain, CloudSnow, CloudLightning, CloudSun, ArrowRight,
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
      } catch { } finally { setLoading(false); }
    }, () => setLoading(false), { timeout: 8000 });
  }, []);
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
      L.tileLayer("https://api.mapbox.com/styles/v1/mapbox/light-v11/tiles/{z}/{x}/{y}?access_token=" + mbToken, {
        maxZoom: 20,
        tileSize: 512,
        zoomOffset: -1,
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
    <div className="flex flex-col h-full bg-background">
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

        {/* ── NAVY HERO HEADER ── */}
        <div style={{ background: "var(--color-surface)" }}>
          {/* Greeting row */}
          <div className="px-5 pt-8 pb-0 flex items-center justify-between">
            <div>
              <p className="text-[13px] font-normal mb-1" style={{ color: "rgba(255,255,255,.5)" }}>{greeting}</p>
              <h1 className="text-[26px] font-bold tracking-tight leading-tight text-white">
                Famiglia {profile?.name?.split(" ").slice(-1)[0] ?? ""}
              </h1>
            </div>
            {/* Meteo compatto */}
            {weather && !weatherLoading && (
              <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                <div className="flex items-center gap-1.5">
                  <WeatherIcon size={20} className="text-white opacity-90" />
                  <span className="text-[22px] font-light text-white leading-none">{weather.temp}°</span>
                </div>
                <span className="text-[11px] font-normal" style={{ color: "rgba(255,255,255,.55)" }}>
                  {weather.description}{weather.city ? ` · ${weather.city}` : ""}
                </span>
              </div>
            )}
          </div>

          {/* Member pills — con raggruppamento co-localizzazione */}
          {(members ?? []).length > 0 && (
            <div className="flex gap-4 px-5 pt-5 pb-5 overflow-x-auto no-scrollbar items-start">
              {groupByLocation(members ?? []).map((group, gi) => {
                if (group.length === 1) {
                  // ── Membro singolo — stile originale ──────────────────────
                  const m = group[0];
                  const online = isOnline(m);
                  const battery = m.location?.batteryPct;
                  const batteryLow = battery != null && battery < 20;
                  return (
                    <button
                      key={m.profile.id}
                      onClick={() => onNavigate("map")}
                      className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
                      data-testid={`member-strip-${m.profile.id}`}
                    >
                      <div
                        className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-bold"
                        style={{ backgroundColor: m.profile.colorHex || "var(--color-primary)", border: "3px solid rgba(255,255,255,.18)", opacity: online ? 1 : 0.5 }}
                      >
                        {m.profile.name.charAt(0)}
                      </div>
                      <span className="text-[11px] font-medium" style={{ color: "rgba(255,255,255,.7)" }}>
                        {m.profile.name.split(" ")[0]}
                      </span>
                      {battery != null ? (
                        <span className="text-[10px] font-medium leading-none" style={{ color: batteryLow ? "#FF6B6B" : "rgba(255,255,255,.45)" }}>
                          🔋 {battery}%
                        </span>
                      ) : (
                        <span className="text-[10px] leading-none" style={{ color: "rgba(255,255,255,.2)" }}>—</span>
                      )}
                    </button>
                  );
                }

                // ── Gruppo co-localizzato — avatar sovrapposti ─────────────
                // Mostra max 3 avatar, poi "+N"
                const visible = group.slice(0, 3);
                const extra = group.length - 3;
                const OVERLAP = 18; // px di sovrapposizione per avatar
                const totalW = 52 + (visible.length - 1) * (52 - OVERLAP) + (extra > 0 ? 24 : 0);
                const names = group.map(m => m.profile.name.split(" ")[0]);
                const label = names.length <= 2 ? names.join(" + ") : `${names[0]} + altri ${names.length - 1}`;
                const NAVY = "#1A2535";

                return (
                  <button
                    key={`group-${gi}`}
                    onClick={() => onNavigate("map")}
                    className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
                    data-testid={`member-group-${gi}`}
                  >
                    {/* Cluster di avatar sovrapposti */}
                    <div className="relative flex items-center" style={{ width: totalW, height: 52 }}>
                      {visible.map((m, idx) => (
                        <div
                          key={m.profile.id}
                          className="absolute w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-bold"
                          style={{
                            backgroundColor: m.profile.colorHex || "var(--color-primary)",
                            border: `3px solid ${NAVY}`,
                            left: idx * (52 - OVERLAP),
                            zIndex: visible.length - idx,
                            opacity: isOnline(m) ? 1 : 0.6,
                          }}
                        >
                          {m.profile.name.charAt(0)}
                        </div>
                      ))}
                      {extra > 0 && (
                        <div
                          className="absolute w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                          style={{
                            backgroundColor: "rgba(255,255,255,.25)",
                            border: `2px solid ${NAVY}`,
                            left: visible.length * (52 - OVERLAP) + 52 - 24,
                            bottom: 0,
                            zIndex: 0,
                          }}
                        >
                          +{extra}
                        </div>
                      )}
                    </div>

                    {/* Nomi */}
                    <span
                      className="text-[10px] font-medium text-center leading-tight max-w-[90px]"
                      style={{ color: "rgba(255,255,255,.7)" }}
                    >
                      {label}
                    </span>

                    {/* Badge "Insieme" corallo */}
                    <div
                      className="flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-semibold leading-none"
                      style={{ background: "rgba(232,83,58,.30)", color: "#E8533A" }}
                    >
                      📍 Insieme
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* ── CORAL STATUS BAR ── */}
        <div className="flex items-center px-4 py-2.5" style={{ background: "var(--color-primary)" }}>
          <span className="text-[13px] font-medium text-white flex-1">✓ {statusLabel}</span>
          <button
            onClick={() => onNavigate("map")}
            className="text-[12px] font-medium text-white px-3 py-1 rounded-full"
            style={{ background: "rgba(255,255,255,.2)" }}
            data-testid="button-view-map"
          >
            Vedi mappa
          </button>
        </div>

        {/* ── Gap Cards (da organizzare) ── */}
        <GapCards />

        {/* ── Cards ── */}
        <div className="px-4 pt-3 space-y-3">

          {/* AI SUMMARY — navy gradient card */}
          <div
            className="rounded-[18px] p-4"
            style={{ background: "linear-gradient(135deg, var(--color-surface) 0%, var(--color-surface-mid) 100%)" }}
          >
            <div className="flex gap-3 items-start">
              <div
                className="w-8 h-8 rounded-[10px] flex items-center justify-center flex-shrink-0 text-base"
                style={{ background: "var(--color-primary)" }}
              >✦</div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: "rgba(255,255,255,.45)" }}>
                  Riepilogo · Kinly AI
                </p>
                {aiSummaryLoading ? (
                  <div className="space-y-1.5">
                    <div className="h-3 w-full rounded animate-pulse" style={{ background: "rgba(255,255,255,.12)" }} />
                    <div className="h-3 w-3/4 rounded animate-pulse" style={{ background: "rgba(255,255,255,.12)" }} />
                  </div>
                ) : (
                  <p className="text-[14px] leading-relaxed font-normal text-white">
                    {aiSummaryData?.text || contextSummary}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* WEATHER — collassabile */}
          <div
            className={`rounded-3xl bg-gradient-to-br ${weather ? WEATHER_BG[weather.iconType] : "from-sky-400 to-blue-500"} overflow-hidden shadow-md cursor-pointer`}
            onClick={() => weather && !weatherLoading && setWeatherExpanded(p => !p)}
            data-testid="card-weather"
          >
            {weatherLoading ? (
              <div className="p-4 flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-white/20" />
                <div className="space-y-2 flex-1">
                  <div className="h-6 w-14 bg-white/20 rounded" />
                  <div className="h-3 w-24 bg-white/20 rounded" />
                </div>
              </div>
            ) : weather ? (
              <>
                {/* Riga sempre visibile (compatta) */}
                <div className="px-4 pt-3 pb-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <WeatherIcon size={28} className="opacity-90 text-white flex-shrink-0" />
                    <div>
                      <div className="flex items-baseline gap-2">
                        <p className="text-3xl font-light text-white leading-none">{weather.temp}°</p>
                        {!weatherExpanded && weather.forecast.length > 0 && (
                          <span className="text-xs text-white/60">
                            {weather.forecast[0].maxTemp}° / {weather.forecast[0].minTemp}°
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/75 mt-0.5">{weather.description}{weather.city ? ` · ${weather.city}` : ""}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {!weatherExpanded && (
                      <div className="flex flex-col items-end gap-0.5 text-[10px] text-white/60">
                        <span className="flex items-center gap-1"><Wind size={10} />{weather.wind} km/h</span>
                        <span className="flex items-center gap-1"><Droplets size={10} />{weather.humidity}%</span>
                      </div>
                    )}
                    <div className="text-white/50">
                      {weatherExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </div>
                  </div>
                </div>

                {/* Dettagli espansi */}
                {weatherExpanded && (
                  <>
                    <div className="px-4 pb-3 flex items-center gap-4 text-[11px] text-white/70 border-b border-white/15">
                      <span className="flex items-center gap-1"><Wind size={11} />{weather.wind} km/h</span>
                      <span className="flex items-center gap-1"><Droplets size={11} />{weather.humidity}%</span>
                      <span className="flex items-center gap-1"><Thermometer size={11} />Perc. {weather.feelsLike}°</span>
                    </div>
                    {/* 3-day forecast */}
                    {weather.forecast.length > 0 && (
                      <div className="flex">
                        {weather.forecast.slice(0, 3).map((day, i) => {
                          const DIcon = WEATHER_ICON_MAP[day.iconType];
                          return (
                            <div key={i} className={`flex-1 flex flex-col items-center py-2.5 gap-0.5 ${i < 2 ? "border-r border-white/15" : ""}`}>
                              <span className="text-[11px] text-white/70 font-medium">{forecastDayLabel(day.date)}</span>
                              <DIcon size={16} className="text-white/80" />
                              <span className="text-xs text-white font-semibold">{day.maxTemp}°</span>
                              <span className="text-[10px] text-white/55">{day.minTemp}°</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
              </>
            ) : (
              <div className="p-4 flex items-center gap-3">
                <CloudSun size={28} className="opacity-60 text-white" />
                <span className="text-sm text-white/70">Meteo non disponibile</span>
              </div>
            )}
          </div>

          {/* PICKUP ALERTS */}
          {pickupAlerts.map(({ ev, childProfiles, confirmerProfile }) => {
            const childNames = childProfiles.map((p: any) => p.name.split(" ")[0]).join(" e ");
            const eventTitle = ev.title;
            const triggerTime = ev.endAt ? new Date(ev.endAt) : new Date(ev.startAt);
            const minsLeft = Math.round((triggerTime.getTime() - Date.now()) / 60000);
            const timeLabel = minsLeft > 0 ? `tra ${minsLeft} min` : "adesso";

            return confirmerProfile ? (
              /* Stato confermato — nota informativa */
              <div key={ev.id} className="rounded-3xl bg-emerald-50 border border-emerald-100 px-4 py-3 flex items-center gap-3" data-testid={`pickup-confirmed-${ev.id}`}>
                <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                  <Check size={16} className="text-emerald-600" />
                </div>
                <p className="text-sm text-emerald-800 leading-snug">
                  <span className="font-semibold">{confirmerProfile.name.split(" ")[0]}</span> va a prendere <span className="font-semibold">{childNames}</span> — {eventTitle}
                </p>
              </div>
            ) : (
              /* Stato aperto — avviso con azione */
              <div key={ev.id} className="rounded-3xl bg-amber-50 border border-amber-200 px-4 py-4 shadow-sm" data-testid={`pickup-alert-${ev.id}`}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <MapPin size={17} className="text-amber-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-amber-900">Chi va a prendere {childNames}?</p>
                    <p className="text-xs text-amber-600 mt-0.5">{eventTitle} · {timeLabel}</p>
                  </div>
                </div>
                <button
                  onClick={() => pickupMutation.mutate(ev.id)}
                  disabled={pickupMutation.isPending}
                  className="w-full rounded-2xl bg-amber-500 hover:bg-amber-600 active:scale-95 transition-all text-white text-sm font-semibold py-2.5 flex items-center justify-center gap-2 shadow-sm"
                  data-testid={`pickup-confirm-${ev.id}`}
                >
                  {pickupMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                  Ci vado io
                </button>
              </div>
            );
          })}

          {/* OGGI — events card */}
          <div className="bg-card rounded-[18px] overflow-hidden" style={{ border: ".5px solid var(--color-border)" }}>
            <div className="px-4 pt-3 pb-1 flex items-center justify-between">
              <span className="text-[16px] font-bold" style={{ color: "var(--color-text-primary)" }}>Oggi</span>
              <button onClick={() => onNavigate("calendar")} className="text-[13px] font-medium" style={{ color: "var(--color-primary)" }}>+ Aggiungi</button>
            </div>
            {nextEvent ? (
              <div>
                {/* strip-style event row */}
                <div className="flex items-center gap-3 px-4 py-3" style={{ borderTop: ".5px solid var(--color-border)" }}>
                  <div className="w-1 h-11 rounded-full flex-shrink-0" style={{ backgroundColor: isUrgent ? "var(--color-warning)" : "var(--color-primary)" }} />
                  <div className="min-w-[52px]">
                    <p className="text-[13px] font-medium" style={{ color: "var(--color-text-tertiary)" }}>{formatEventLabel(nextEvent.startAt)}</p>
                    {isUrgent && <p className="text-[11px]" style={{ color: "var(--color-warning)" }}>● urgente</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{nextEvent.title}</p>
                    {nextEvent.description && <p className="text-[12px] truncate mt-0.5" style={{ color: "var(--color-text-tertiary)" }}>{nextEvent.description}</p>}
                  </div>
                  <button onClick={() => onNavigate("calendar")} className="text-[18px]" style={{ color: "var(--color-text-tertiary)" }}>›</button>
                </div>
                <div className="px-4 pb-3 flex gap-2">
                  <button onClick={() => onNavigate("calendar")} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white transition-colors active:scale-95" style={{ background: "var(--color-primary)" }} data-testid="card-event-primary">
                    Vedi agenda
                  </button>
                  <button onClick={() => onNavigate("chat")} className="flex-1 py-2 rounded-xl text-sm font-semibold transition-colors active:scale-95" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }} data-testid="card-event-chat">
                    Chat
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 px-4 py-4" style={{ borderTop: ".5px solid var(--color-border)" }}>
                <CheckCircle2 size={22} style={{ color: "var(--color-success)", flexShrink: 0 }} />
                <div className="flex-1">
                  <p className="text-sm font-medium" style={{ color: "var(--color-text-primary)" }}>Nessun evento imminente</p>
                  <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>Agenda libera</p>
                </div>
                <button onClick={() => onNavigate("calendar")} className="text-xs font-medium flex items-center gap-0.5" style={{ color: "var(--color-primary)" }}>
                  Aggiungi <ChevronRight size={12} />
                </button>
              </div>
            )}
          </div>

          {/* MEDICATIONS */}
          {slotMeds.length > 0 && (
            <div className="rounded-3xl bg-white shadow-sm border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 uppercase tracking-wider mb-3">
                <Pill size={13} />
                Farmaci · {TIME_SLOT_META[activeSlot].label}
              </div>
              <div className="space-y-2.5">
                {slotMeds.slice(0, 3).map(med => {
                  const done = markedMeds.has(med.id);
                  const slotTime = ((med.scheduleTimes as string[]) ?? []).find(t => { const h = parseInt(t.split(":")[0]); return h >= slotStart && h < slotEnd; });
                  return (
                    <div key={med.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="h-9 w-9 rounded-2xl bg-emerald-50 flex items-center justify-center text-emerald-500 flex-shrink-0">
                          <Pill size={16} />
                        </div>
                        <div>
                          <p className={`text-sm font-medium ${done ? "text-slate-300 line-through" : "text-slate-800"}`}>{med.name}</p>
                          <p className="text-xs text-slate-400">{med.profile?.name}{med.dosage ? ` · ${med.dosage}` : ""}{slotTime ? ` · ${slotTime}` : ""}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setMarkedMeds(prev => { const n = new Set(prev); n.has(med.id) ? n.delete(med.id) : n.add(med.id); return n; })}
                        className={`h-7 w-7 rounded-full border-2 flex items-center justify-center transition-all ${done ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-200 text-slate-200 hover:border-emerald-400"}`}
                        data-testid={`med-check-${med.id}`}
                      >
                        <Check size={13} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {slotMeds.length > 3 && (
                <button onClick={() => onNavigate("meds")} className="mt-2.5 text-xs text-emerald-500 font-medium">+{slotMeds.length - 3} altri →</button>
              )}
            </div>
          )}

          {/* DINNER */}
          <div className="rounded-3xl bg-white shadow-sm border border-slate-100 p-4">
            <div className="flex items-center gap-2 text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">
              <ChefHat size={13} />
              Cena di stasera
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900 text-sm">{dish}</p>
                <div className="flex items-center gap-2 mt-1">
                  {dinnerCook && (
                    <div className="flex items-center gap-1.5">
                      <div className="h-5 w-5 rounded-full flex items-center justify-center text-white text-[10px] font-bold" style={{ backgroundColor: dinnerCook.colorHex || "#8B5CF6" }}>
                        {dinnerCook.name.charAt(0)}
                      </div>
                      <span className="text-xs text-slate-500">{dinnerCook.name.split(" ")[0]} cucina</span>
                    </div>
                  )}
                  {ingredientCount > 0 && <span className="text-xs text-slate-400">· {ingredientCount} in lista</span>}
                </div>
              </div>
              <button
                onClick={() => setDinnerConfirmed(p => !p)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${dinnerConfirmed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                data-testid="button-dinner-confirm"
              >
                {dinnerConfirmed ? "✓ Ok" : "Conferma"}
              </button>
            </div>
          </div>

          {/* TASKS + SHOPPING */}
          {(pendingTasks > 0 || pendingItems > 0) && (
            <div className="rounded-3xl bg-white shadow-sm border border-slate-100 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-500 uppercase tracking-wider mb-3">
                <Star size={13} />
                Da fare
              </div>
              <div className="flex gap-3">
                {pendingTasks > 0 && (
                  <button onClick={() => onNavigate("tasks")} className="flex-1 bg-violet-50 rounded-2xl p-3 text-center hover:bg-violet-100 transition-colors">
                    <div className="text-2xl font-bold text-violet-700">{pendingTasks}</div>
                    <div className="text-xs text-violet-500 mt-0.5">Compiti</div>
                  </button>
                )}
                {pendingItems > 0 && (
                  <button onClick={() => onNavigate("shopping")} className="flex-1 bg-emerald-50 rounded-2xl p-3 text-center hover:bg-emerald-100 transition-colors">
                    <div className="text-2xl font-bold text-emerald-700">{pendingItems}</div>
                    <div className="text-xs text-emerald-500 mt-0.5">Prodotti</div>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* AI REPLY */}
          {(aiMutation.isPending || aiReply) && (
            <div className="rounded-3xl bg-white shadow-sm border border-violet-100 p-4 fade-up">
              <div className="flex items-center gap-2 text-xs font-semibold text-violet-500 uppercase tracking-wider mb-2">
                <Sparkles size={13} />
                Assistente AI
              </div>
              {aiMutation.isPending ? (
                <div className="flex items-center gap-2 text-slate-400 text-sm">
                  <Loader2 size={15} className="animate-spin" />
                  Sto pensando…
                </div>
              ) : (
                <p className="text-sm text-slate-700 leading-relaxed">{aiReply}</p>
              )}
            </div>
          )}

          <div className="h-2" />
        </div>
      </div>

      {/* ── Bottom bar ── */}
      <div className="flex-shrink-0 bg-card border-t" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex justify-center gap-2 px-5 pt-3 pb-2">
          <button onClick={() => onNavigate("giornale")} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium active:scale-95 transition-all" style={{ background: "var(--color-primary)", color: "#fff" }} data-testid="quick-open-giornale">
            <BookOpen size={13} />Giornale
          </button>
          <button onClick={() => onNavigate("calendar")} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium active:scale-95 transition-all" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)", border: ".5px solid var(--color-border)" }} data-testid="quick-add-event">
            <Plus size={13} />Impegno
          </button>
          <button onClick={() => onNavigate("shopping")} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium active:scale-95 transition-all" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)", border: ".5px solid var(--color-border)" }} data-testid="quick-add-shopping">
            <ShoppingCart size={13} />Lista
          </button>
          <button onClick={() => onNavigate("chat")} className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium active:scale-95 transition-all" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)", border: ".5px solid var(--color-border)" }} data-testid="quick-open-chat">
            <MessageCircle size={13} />Chat
          </button>
        </div>

        <div className="relative px-4 pb-4">
          <input
            ref={inputRef}
            type="text"
            value={aiInput}
            onChange={e => setAiInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendMessage()}
            placeholder="Chiedi qualcosa all'assistente…"
            disabled={aiMutation.isPending}
            className="w-full rounded-full py-3.5 pl-5 pr-14 text-sm disabled:opacity-60 transition-all focus:outline-none"
            style={{ background: "var(--color-bg-grouped)", border: ".5px solid var(--color-border)", color: "var(--color-text-primary)" }}
            data-testid="input-ai-chat"
          />
          <button
            onClick={aiInput.trim() ? sendMessage : undefined}
            disabled={aiMutation.isPending}
            className="absolute right-6 top-1/2 -translate-y-1/2 h-9 w-9 rounded-full text-white flex items-center justify-center transition-all disabled:opacity-50 active:scale-90"
            style={{ background: "var(--color-primary)", boxShadow: "var(--shadow-primary)" }}
            data-testid="button-ai-send"
          >
            {aiMutation.isPending ? <Loader2 size={16} className="animate-spin" /> : aiInput.trim() ? <Send size={14} /> : <Mic size={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
