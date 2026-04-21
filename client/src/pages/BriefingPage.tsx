import { useState, useEffect, useRef } from "react";

import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Mic, Sun, Sunrise, Sunset, Moon, MapPin, Settings,
  Cloud, CloudRain, CloudSnow, CloudLightning, CloudSun,
  ArrowRight, Clock, Sparkles, Grid3x3, Check,
} from "lucide-react";
import type { Profile, Event, ShoppingItem, Task, Medication } from "@shared/schema";
import { format, isToday, isTomorrow } from "date-fns";
import { it } from "date-fns/locale";

interface MemberLocation {
  profile: Profile;
  location: { lat: number; lng: number; timestamp: string; isMoving?: boolean; batteryPct?: number | null } | null;
  locationPaused?: boolean;
}
interface BriefingPageProps { onNavigate: (tab: string) => void; }

// ── Time ─────────────────────────────────────────────────────────────────────
type TimeSlot = "morning" | "afternoon" | "evening" | "night";
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
const TIME_SLOT_META: Record<TimeSlot, { greeting: string }> = {
  morning:   { greeting: "Buongiorno" },
  afternoon: { greeting: "Buon pomeriggio" },
  evening:   { greeting: "Buonasera" },
  night:     { greeting: "Buonanotte" },
};
const DAY_NAMES_IT = ["dom","lun","mar","mer","gio","ven","sab"];
const MON_NAMES_IT = ["gen","feb","mar","apr","mag","giu","lug","ago","set","ott","nov","dic"];

// ── Weather ──────────────────────────────────────────────────────────────────
interface WeatherData {
  temp: number; feelsLike: number; city: string;
  wind: number; humidity: number; description: string;
  iconType: "sun" | "cloud" | "rain" | "storm" | "snow";
}
function weatherCodeToMeta(code: number): { description: string; iconType: WeatherData["iconType"] } {
  if (code === 0)  return { description: "Soleggiato",    iconType: "sun" };
  if (code <= 3)   return { description: "Poco nuvoloso", iconType: "cloud" };
  if (code <= 49)  return { description: "Nuvoloso",      iconType: "cloud" };
  if (code <= 67)  return { description: "Pioggia",       iconType: "rain" };
  if (code <= 79)  return { description: "Neve",          iconType: "snow" };
  if (code <= 99)  return { description: "Temporale",     iconType: "storm" };
  return { description: "Variabile", iconType: "cloud" };
}
const WEATHER_ICON_MAP: Record<WeatherData["iconType"], typeof CloudSun> = {
  sun: CloudSun, cloud: Cloud, rain: CloudRain, storm: CloudLightning, snow: CloudSnow,
};
function useWeather(): { weather: WeatherData | null; loading: boolean } {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude: lat, longitude: lng } = pos.coords;
        const [a, b] = await Promise.allSettled([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code,relative_humidity_2m&timezone=auto`),
          fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`),
        ]);
        const meteo = a.status === "fulfilled" ? await a.value.json() : {};
        const geo   = b.status === "fulfilled" ? await b.value.json() : {};
        const meta  = weatherCodeToMeta(meteo.current?.weather_code ?? 0);
        setWeather({
          temp: Math.round(meteo.current?.temperature_2m ?? 0),
          feelsLike: Math.round(meteo.current?.apparent_temperature ?? 0),
          wind: Math.round(meteo.current?.wind_speed_10m ?? 0),
          humidity: Math.round(meteo.current?.relative_humidity_2m ?? 0),
          city: geo.address?.city || geo.address?.town || geo.address?.village || "",
          ...meta,
        });
      } catch { /* silent */ } finally { setLoading(false); }
    }, () => setLoading(false), { timeout: 8000 });
  }, []);
  return { weather, loading };
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function isOnline(m: MemberLocation): boolean {
  if (!m.location || m.locationPaused) return false;
  return Date.now() - new Date(m.location.timestamp).getTime() < 600000;
}
function formatEventLabel(startAt: string | Date) {
  const d = new Date(startAt);
  if (isToday(d))    return `oggi ${format(d, "H:mm")}`;
  if (isTomorrow(d)) return `domani ${format(d, "H:mm")}`;
  return format(d, "EEE d MMM · H:mm", { locale: it });
}

// Category → chip style
const CAT_CHIP: Record<string, { label: string; color: string; bg: string }> = {
  health:  { label: "Salute",  color: "#4F2A3F", bg: "var(--k-plum-soft)" },
  school:  { label: "Scuola",  color: "#2B4663", bg: "var(--k-steel-soft)" },
  sport:   { label: "Sport",   color: "#3F5E44", bg: "var(--k-sage-soft)" },
  work:    { label: "Lavoro",  color: "#2B4663", bg: "var(--k-steel-soft)" },
  family:  { label: "Famiglia",color: "#3F5E44", bg: "var(--k-sage-soft)" },
  home:    { label: "Casa",    color: "#7A4E12", bg: "var(--k-ochre-soft)" },
};
function catChip(cat?: string) {
  return CAT_CHIP[cat ?? ""] ?? { label: cat ?? "Evento", color: "var(--k-coral-ink)", bg: "var(--k-coral-soft)" };
}

// ── Component ────────────────────────────────────────────────────────────────
export default function BriefingPage({ onNavigate }: BriefingPageProps) {
  const { profile } = useAuth();
  const { toast } = useToast();
  const now = useLiveTime();
  const { weather } = useWeather();
  const slot = getTimeSlot(now.getHours());
  const [aiInput, setAiInput] = useState("");
  const [aiReply, setAiReply] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: members } = useQuery<MemberLocation[]>({ queryKey: ["/api/family/locations"], refetchInterval: 30000 });
  const { data: aiSummaryData, isLoading: aiLoading } = useQuery<{ text: string }>({
    queryKey: ["/api/ai/summary"],
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const { data: events }    = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: tasks }     = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: meds }      = useQuery<(Medication & { profile: Profile })[]>({ queryKey: ["/api/medications"] });

  const aiMutation = useMutation({
    mutationFn: (message: string) => apiRequest("POST", "/api/briefing/chat", { message }),
    onSuccess: async (res) => { const d = await res.json(); setAiReply(d.reply); },
    onError: () => toast({ title: "Errore AI", description: "Riprova più tardi.", variant: "destructive" }),
  });

  const sendMessage = () => {
    const msg = aiInput.trim();
    if (!msg || aiMutation.isPending) return;
    setAiReply(null); aiMutation.mutate(msg); setAiInput("");
  };

  // Derived
  const firstName  = profile?.name?.split(" ")[0] ?? "ciao";
  const familyName = profile?.name?.split(" ").slice(-1)[0] ?? "";
  const greeting   = TIME_SLOT_META[slot].greeting;
  const dateLabel  = `${DAY_NAMES_IT[now.getDay()]} ${now.getDate()} ${MON_NAMES_IT[now.getMonth()]}`;
  const WeatherIcon = weather ? WEATHER_ICON_MAP[weather.iconType] : CloudSun;

  const todayEvents = (events ?? [])
    .filter(e => isToday(new Date(e.startAt)))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const upcomingEvents = (events ?? [])
    .filter(e => new Date(e.startAt) > new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const pendingTasks = (tasks ?? []).filter(t => !t.completedAt);
  const briefingText = aiReply || aiSummaryData?.text;
  const todaySummary = `${todayEvents.length} eventi · ${pendingTasks.length} da fare`;

  return (
    <div style={{ background: "var(--k-paper)", height: "100%", overflow: "hidden", display: "flex", flexDirection: "column" }}>
      <style>{`
        .no-scrollbar::-webkit-scrollbar { display:none; }
        .no-scrollbar { -ms-overflow-style:none; scrollbar-width:none; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.3s ease forwards; }
      `}</style>

      <div className="flex-1 overflow-y-auto no-scrollbar" style={{ paddingBottom: 16 }}>

        {/* ── HEADER ── */}
        <div style={{ padding: "16px 20px 12px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--k-ink-3)", marginBottom: 4 }}>
              {dateLabel}
            </div>
            <div style={{ fontSize: 28, lineHeight: 1.1, letterSpacing: "-0.025em", fontWeight: 600, color: "var(--k-ink)" }}>
              <span style={{ fontFamily: "var(--k-serif)", fontStyle: "italic", fontWeight: 400, color: "var(--k-coral-ink)", marginRight: 4 }}>
                {greeting},
              </span>
              {firstName}
            </div>
          </div>
          <button
            onClick={() => onNavigate("settings")}
            style={{
              width: 40, height: 40, borderRadius: "50%",
              background: profile?.colorHex || "var(--k-coral)",
              color: "#fff", fontSize: 14, fontWeight: 700,
              border: "2px solid var(--k-paper)",
              boxShadow: "var(--k-sh-2)",
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: "pointer", flexShrink: 0, marginTop: 4,
            }}
            data-testid="button-settings"
          >
            {profile?.name?.charAt(0)}
          </button>
        </div>

        {/* ── WEATHER STRIP ── */}
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "8px 14px", borderRadius: 999,
            background: "var(--k-paper-2)",
            border: "1px solid var(--k-line)",
            width: "fit-content",
          }}>
            <WeatherIcon className="w-4 h-4" style={{ color: "var(--k-ochre)" }} strokeWidth={1.8} />
            <span style={{ fontSize: 13, fontWeight: 500, color: "var(--k-ink)" }}>
              {weather ? `${weather.city || "Meteo"} · ${weather.temp}°` : "Caricamento…"}
            </span>
            {weather && (
              <>
                <span style={{ color: "var(--k-ink-3)" }}>·</span>
                <span style={{ fontSize: 13, color: "var(--k-ink-2)" }}>{weather.description.toLowerCase()}</span>
              </>
            )}
          </div>
        </div>

        {/* ── MEMBER ROW ── */}
        {(members ?? []).length > 0 && (
          <div style={{ display: "flex", gap: 14, padding: "0 20px 16px", overflowX: "auto", alignItems: "center" }} className="no-scrollbar">
            {/* "Tutti" chip */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
              <div style={{
                width: 44, height: 44, borderRadius: "50%",
                background: "#fff", border: "2px solid var(--k-coral)",
                display: "flex", alignItems: "center", justifyContent: "center",
                color: "var(--k-coral)", fontSize: 10, fontWeight: 700,
              }}>ALL</div>
              <span style={{ fontSize: 10, fontWeight: 600, color: "var(--k-ink-2)" }}>Famiglia</span>
            </div>
            {(members ?? []).map((m, i) => {
              const online = isOnline(m);
              const MEMBER_COLORS = [
                "var(--k-coral)", "var(--k-steel)", "var(--k-sage)",
                "var(--k-plum)", "var(--k-ochre)", "var(--k-leaf)",
              ];
              const color = m.profile.colorHex || MEMBER_COLORS[i % MEMBER_COLORS.length];
              return (
                <button
                  key={m.profile.id}
                  onClick={() => onNavigate("map")}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0, background: "none", border: "none", cursor: "pointer" }}
                  data-testid={`member-avatar-${m.profile.id}`}
                >
                  <div style={{
                    width: 44, height: 44, borderRadius: "50%",
                    background: color,
                    border: "2px solid #fff",
                    boxShadow: "var(--k-sh-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontSize: 15, fontWeight: 700,
                    opacity: online ? 1 : 0.55,
                    transition: "opacity 0.2s",
                  }}>
                    {m.profile.name.charAt(0)}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: online ? 600 : 500, color: online ? "var(--k-ink-2)" : "var(--k-ink-3)" }}>
                    {m.profile.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── AI BRIEFING CARD ── */}
        <div style={{ padding: "0 20px 14px" }}>
          <div style={{
            background: "linear-gradient(180deg, #FFF8F1 0%, #FCEFE6 100%)",
            border: "1px solid #F3DDCB",
            borderRadius: "var(--k-r-xl)",
            padding: 20,
          }}>
            {/* Header row */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <div style={{
                width: 24, height: 24, borderRadius: "50%",
                background: "var(--k-coral)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Sparkles className="w-[13px] h-[13px]" style={{ color: "#fff" }} strokeWidth={2} />
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--k-coral-ink)" }}>
                Il tuo briefing
              </span>
            </div>

            {/* Content */}
            {aiLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[80, 100, 60].map((w, i) => (
                  <div key={i} style={{ height: 14, width: `${w}%`, borderRadius: 6, background: "rgba(225,85,60,0.1)", animation: "pulse 1.5s ease infinite" }} />
                ))}
              </div>
            ) : briefingText ? (
              <div className="fade-up" style={{ fontSize: 16, lineHeight: 1.45, color: "var(--k-ink)", letterSpacing: "-0.01em" }}>
                {briefingText}
              </div>
            ) : (
              <div style={{ fontSize: 16, lineHeight: 1.45, color: "var(--k-ink-2)", letterSpacing: "-0.01em" }}>
                Tutto tranquillo per ora.{" "}
                <span style={{ fontFamily: "var(--k-serif)", fontStyle: "italic", color: "var(--k-coral-ink)", fontSize: 17 }}>Chiedimi qualcosa.</span>
              </div>
            )}

            {/* Quick chips */}
            <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
              {["Cosa cucino?", "Chi è in ritardo?", "Riassumi oggi"].map(q => (
                <button
                  key={q}
                  onClick={() => { setAiInput(q); inputRef.current?.focus(); }}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 6,
                    padding: "4px 10px", borderRadius: 999,
                    fontSize: 11, fontWeight: 600, letterSpacing: "0.02em",
                    background: "var(--k-coral-soft)", color: "var(--k-coral-ink)",
                    border: "none", cursor: "pointer",
                    transition: "transform 0.1s",
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── KINLY ASK BAR ── */}
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{
            display: "flex", alignItems: "center", gap: 12,
            background: "var(--k-navy)", color: "#fff",
            borderRadius: "var(--k-r-pill)", padding: "10px 10px 10px 18px",
          }}>
            <Sparkles className="w-[18px] h-[18px]" style={{ color: "var(--k-coral)", flexShrink: 0 }} strokeWidth={1.8} />
            <input
              ref={inputRef}
              type="text"
              value={aiInput}
              onChange={e => setAiInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && sendMessage()}
              placeholder="Chiedi a Kinly qualsiasi cosa…"
              disabled={aiMutation.isPending}
              style={{
                flex: 1, fontSize: 14, background: "transparent", border: "none",
                outline: "none", color: "#fff", fontFamily: "inherit",
                opacity: aiMutation.isPending ? 0.6 : 1,
              }}
              data-testid="input-ai-briefing"
            />
            <button
              onClick={sendMessage}
              disabled={!aiInput.trim() || aiMutation.isPending}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                background: "var(--k-coral)",
                boxShadow: "var(--k-sh-coral)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: "none", cursor: "pointer", flexShrink: 0,
                opacity: aiInput.trim() ? 1 : 0.5,
                transition: "opacity 0.15s",
              }}
              data-testid="button-ai-send"
            >
              <Mic className="w-4 h-4" style={{ color: "#fff" }} />
            </button>
          </div>
        </div>

        {/* ── AGENDA OGGI ── */}
        <div style={{ padding: "0 20px 16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--k-ink)" }}>Oggi</div>
            <button
              onClick={() => onNavigate("calendar")}
              style={{ fontSize: 12, color: "var(--k-ink-3)", background: "none", border: "none", cursor: "pointer" }}
            >
              {todaySummary}
            </button>
          </div>

          {todayEvents.length === 0 && pendingTasks.length === 0 ? (
            <div style={{
              padding: "20px 16px", borderRadius: "var(--k-r-md)",
              background: "var(--k-paper-2)", border: "1px solid var(--k-line)",
              textAlign: "center",
            }}>
              <p style={{ fontSize: 14, color: "var(--k-ink-3)" }}>Nessun impegno per oggi 🎉</p>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {/* Events */}
              {todayEvents.slice(0, 4).map(event => {
                const chip = catChip(event.category ?? undefined);
                const assignedMember = (members ?? []).find(m => ((event.assignedTo ?? []) as string[]).includes(m.profile.id));
                const timeStr = format(new Date(event.startAt), "H:mm");
                return (
                  <button
                    key={event.id}
                    onClick={() => onNavigate("calendar")}
                    style={{
                      display: "flex", alignItems: "center", gap: 12,
                      padding: "12px 14px", background: "#fff",
                      border: "1px solid var(--k-line)", borderRadius: "var(--k-r-md)",
                      cursor: "pointer", textAlign: "left",
                      transition: "transform 0.1s",
                    }}
                    className="active:scale-[.98]"
                    data-testid={`event-row-${event.id}`}
                  >
                    {/* Time */}
                    <div style={{
                      width: 44, textAlign: "center",
                      fontFamily: "var(--k-mono)", fontSize: 12,
                      color: "var(--k-ink-2)", fontWeight: 600, flexShrink: 0,
                    }}>{timeStr}</div>
                    {/* Divider */}
                    <div style={{ width: 1, height: 32, background: "var(--k-line)", flexShrink: 0 }} />
                    {/* Content */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.01em", color: "var(--k-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {event.title}
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 4, alignItems: "center" }}>
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          padding: "2px 8px", borderRadius: 999,
                          fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                          background: chip.bg, color: chip.color,
                        }}>{chip.label}</span>
                      </div>
                    </div>
                    {/* Member avatar */}
                    {assignedMember && (
                      <div style={{
                        width: 26, height: 26, borderRadius: "50%",
                        background: assignedMember.profile.colorHex || "var(--k-coral)",
                        color: "#fff", fontSize: 10, fontWeight: 700,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        flexShrink: 0,
                      }}>
                        {assignedMember.profile.name.charAt(0)}
                      </div>
                    )}
                  </button>
                );
              })}

              {/* Pending tasks (first 2) */}
              {pendingTasks.slice(0, 2).map(task => (
                <button
                  key={task.id}
                  onClick={() => onNavigate("tasks")}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 14px", background: "#fff",
                    border: "1px solid var(--k-line)", borderRadius: "var(--k-r-md)",
                    cursor: "pointer", textAlign: "left",
                    transition: "transform 0.1s",
                  }}
                  className="active:scale-[.98]"
                  data-testid={`task-row-${task.id}`}
                >
                  {/* Checkbox */}
                  <div style={{
                    width: 20, height: 20, borderRadius: 6,
                    border: "2px solid var(--k-line-2)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--k-ink)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      {task.title}
                    </div>
                    <span style={{
                      display: "inline-flex", alignItems: "center",
                      padding: "2px 8px", borderRadius: 999,
                      fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                      background: "var(--k-ochre-soft)", color: "#7A4E12",
                      marginTop: 4,
                    }}>Da fare</span>
                  </div>
                </button>
              ))}

              {/* "See all" link if more events */}
              {(todayEvents.length > 4 || pendingTasks.length > 2) && (
                <button
                  onClick={() => onNavigate("calendar")}
                  style={{
                    padding: "10px 14px", borderRadius: "var(--k-r-md)",
                    background: "var(--k-paper-2)", border: "1px solid var(--k-line)",
                    fontSize: 13, fontWeight: 600, color: "var(--k-ink-2)",
                    cursor: "pointer", textAlign: "center",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  Vedi tutti gli impegni <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── UPCOMING (fuori da oggi) ── */}
        {upcomingEvents.filter(e => !isToday(new Date(e.startAt))).length > 0 && (
          <div style={{ padding: "0 20px 16px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontSize: 18, fontWeight: 600, letterSpacing: "-0.02em", color: "var(--k-ink)" }}>In arrivo</div>
              <button
                onClick={() => onNavigate("calendar")}
                style={{ fontSize: 12, color: "var(--k-ink-3)", background: "none", border: "none", cursor: "pointer" }}
              >
                Agenda →
              </button>
            </div>
            <div className="no-scrollbar" style={{ display: "flex", gap: 12, overflowX: "auto", scrollSnapType: "x mandatory" }}>
              {upcomingEvents.filter(e => !isToday(new Date(e.startAt))).slice(0, 5).map(event => {
                const chip = catChip(event.category ?? undefined);
                const assignedMember = (members ?? []).find(m => ((event.assignedTo ?? []) as string[]).includes(m.profile.id));
                return (
                  <button
                    key={event.id}
                    onClick={() => onNavigate("calendar")}
                    style={{
                      flexShrink: 0, width: 220, scrollSnapAlign: "start",
                      background: "#fff", border: "1px solid var(--k-line)",
                      borderRadius: "var(--k-r-lg)", padding: 16,
                      display: "flex", flexDirection: "column", gap: 8,
                      cursor: "pointer", textAlign: "left",
                    }}
                    className="active:scale-[.97]"
                    data-testid={`upcoming-card-${event.id}`}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{
                        display: "inline-flex", padding: "3px 8px", borderRadius: 999,
                        fontSize: 10, fontWeight: 600, letterSpacing: "0.02em",
                        background: chip.bg, color: chip.color,
                      }}>{chip.label}</span>
                      <span style={{ fontSize: 11, color: "var(--k-ink-3)", fontFamily: "var(--k-mono)" }}>
                        {format(new Date(event.startAt), "H:mm")}
                      </span>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "var(--k-ink)", lineHeight: 1.3, letterSpacing: "-0.01em" }}>
                      {event.title}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--k-ink-3)", marginTop: "auto" }}>
                      {formatEventLabel(event.startAt)}
                    </div>
                    {event.locationName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "var(--k-ink-3)" }}>
                        <MapPin className="w-3 h-3" />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.locationName}</span>
                      </div>
                    )}
                    {assignedMember && (
                      <div style={{ display: "flex", alignItems: "center", gap: 6, paddingTop: 8, borderTop: "1px solid var(--k-line)" }}>
                        <div style={{
                          width: 22, height: 22, borderRadius: "50%",
                          background: assignedMember.profile.colorHex || "var(--k-coral)",
                          color: "#fff", fontSize: 9, fontWeight: 700,
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          {assignedMember.profile.name.charAt(0)}
                        </div>
                        <span style={{ fontSize: 11, color: "var(--k-ink-2)" }}>{assignedMember.profile.name.split(" ")[0]}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div style={{ height: 8 }} />
      </div>
    </div>
  );
}
