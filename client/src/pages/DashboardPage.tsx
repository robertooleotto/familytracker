import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Wind, Droplets, MapPin, Calendar, ShoppingCart, Star,
  MessageCircle, Pill, CreditCard, ChevronRight,
  CloudSun, Cloud, CloudRain, CloudSnow, CloudLightning,
} from "lucide-react";
import type { Profile, Event, Message, ShoppingItem, Task, Medication } from "@shared/schema";
import { format, isToday, isTomorrow } from "date-fns";
import { it } from "date-fns/locale";

interface MemberLocation {
  profile: Profile;
  location: { lat: number; lng: number; timestamp: string; batteryPct?: number; isMoving?: boolean } | null;
  locationPaused?: boolean;
}

interface DashboardPageProps {
  onNavigate: (tab: string) => void;
}

interface WeatherData {
  temp: number;
  feelsLike: number;
  description: string;
  icon: "sun" | "rain" | "cloud" | "storm" | "snow";
  wind: number;
  humidity: number;
  city: string;
}

function useWeather() {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!navigator.geolocation) { setLoading(false); return; }
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const [weatherRes, geoRes] = await Promise.allSettled([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,apparent_temperature,wind_speed_10m,weather_code,relative_humidity_2m&timezone=auto`),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`),
        ]);
        const data = weatherRes.status === "fulfilled" ? await weatherRes.value.json() : {};
        const geoData = geoRes.status === "fulfilled" ? await geoRes.value.json() : {};
        const code = data.current?.weather_code || 0;
        const temp = Math.round(data.current?.temperature_2m || 0);
        const feelsLike = Math.round(data.current?.apparent_temperature || temp);
        const wind = Math.round(data.current?.wind_speed_10m || 0);
        const humidity = Math.round(data.current?.relative_humidity_2m || 0);
        const desc = weatherCodeToDesc(code);
        const city = geoData?.address?.city || geoData?.address?.town || geoData?.address?.village || "";
        setWeather({ temp, feelsLike, description: desc.text, icon: desc.icon, wind, humidity, city });
      } catch { } finally { setLoading(false); }
    }, () => setLoading(false), { timeout: 6000 });
  }, []);

  return { weather, loading };
}

function weatherCodeToDesc(code: number): { text: string; icon: WeatherData["icon"] } {
  if (code === 0) return { text: "Soleggiato", icon: "sun" };
  if (code <= 3) return { text: "Parzialmente nuvoloso", icon: "cloud" };
  if (code <= 49) return { text: "Nuvoloso", icon: "cloud" };
  if (code <= 67) return { text: "Pioggia", icon: "rain" };
  if (code <= 79) return { text: "Neve", icon: "snow" };
  if (code <= 99) return { text: "Temporale", icon: "storm" };
  return { text: "Variabile", icon: "cloud" };
}

const WEATHER_GRADIENTS: Record<WeatherData["icon"], string> = {
  sun:   "from-sky-400 to-blue-600",
  cloud: "from-slate-400 to-slate-600",
  rain:  "from-slate-600 to-blue-800",
  storm: "from-slate-800 to-gray-900",
  snow:  "from-sky-200 to-blue-400",
};

const WEATHER_ICONS: Record<WeatherData["icon"], typeof CloudSun> = {
  sun:   CloudSun,
  cloud: Cloud,
  rain:  CloudRain,
  storm: CloudLightning,
  snow:  CloudSnow,
};

function useLiveTime() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function isOnline(member: MemberLocation): boolean {
  if (!member.location || member.locationPaused) return false;
  return Date.now() - new Date(member.location.timestamp).getTime() < 600000;
}

function formatEventLabel(startAt: string | Date) {
  const d = new Date(startAt);
  if (isToday(d)) return `Oggi ${format(d, "H:mm")}`;
  if (isTomorrow(d)) return `Dom ${format(d, "H:mm")}`;
  return format(d, "EEE d MMM · H:mm", { locale: it });
}

function getNextMedTime(scheduleTimes: string[]): string | null {
  if (!scheduleTimes || scheduleTimes.length === 0) return null;
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const sorted = [...scheduleTimes].sort();
  for (const t of sorted) {
    const [h, m] = t.split(":").map(Number);
    if (h * 60 + m > nowMins) return t;
  }
  return sorted[0];
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { profile } = useAuth();
  const { weather, loading: weatherLoading } = useWeather();
  const now = useLiveTime();

  const { data: members, isLoading: loadingMembers } = useQuery<MemberLocation[]>({
    queryKey: ["/api/family/locations"], refetchInterval: 30000,
  });
  const { data: events } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: messages } = useQuery<(Message & { sender: Profile })[]>({ queryKey: ["/api/messages"] });
  const { data: shoppingItems } = useQuery<ShoppingItem[]>({ queryKey: ["/api/shopping"] });
  const { data: tasks } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: meds } = useQuery<(Medication & { profile: Profile })[]>({ queryKey: ["/api/medications"] });
  const { data: expenses } = useQuery<{ amount: number }[]>({ queryKey: ["/api/budget/expenses"] });
  const { data: budgetCategories } = useQuery<{ budgetAmount: number }[]>({ queryKey: ["/api/budget/categories"] });

  const pendingItems = shoppingItems?.filter(i => !i.checked).length ?? 0;
  const unreadMessages = messages?.filter(
    m => m.senderId !== profile?.id && !m.readBy?.includes(profile?.id ?? "")
  ).length ?? 0;
  const lastMessage = messages && messages.length > 0 ? messages[messages.length - 1] : null;

  const nextEvent = events
    ?.filter(e => new Date(e.startAt) >= new Date())
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime())[0];

  const totalTasks = tasks?.length ?? 0;
  const completedTasks = tasks?.filter(t => t.completedAt).length ?? 0;
  const taskPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

  const activeMeds = meds?.filter(m => m.active) ?? [];
  const medsWithNextTime = activeMeds.map(m => ({
    ...m,
    nextTime: getNextMedTime((m.scheduleTimes as string[]) ?? []),
  }));
  const nextMed = medsWithNextTime
    .filter(m => m.nextTime)
    .sort((a, b) => (a.nextTime ?? "").localeCompare(b.nextTime ?? ""))[0];

  const now_ = new Date();
  const startOfMonth = new Date(now_.getFullYear(), now_.getMonth(), 1);
  const monthlyExpenses = expenses?.filter(e => new Date((e as any).date) >= startOfMonth) ?? [];
  const totalSpent = monthlyExpenses.reduce((s, e) => s + e.amount, 0);
  const totalBudget = budgetCategories?.reduce((s, c) => s + c.budgetAmount, 0) ?? 0;
  const budgetPct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;

  const dayNames = ["dom", "lun", "mar", "mer", "gio", "ven", "sab"];
  const monthNames = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];
  const dateLabel = `${dayNames[now.getDay()]} ${now.getDate()} ${monthNames[now.getMonth()]}`;
  const timeLabel = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;

  const WeatherIcon = weather ? WEATHER_ICONS[weather.icon] : CloudSun;
  const weatherGrad = weather ? WEATHER_GRADIENTS[weather.icon] : "from-sky-400 to-blue-600";

  return (
    <div className="flex-1 overflow-y-auto bg-background" data-testid="dashboard-cruscotto">

      {/* ── Header ── */}
      <div className="sticky top-0 z-10 px-4 pt-3 pb-2 bg-background/90 backdrop-blur-md flex justify-between items-center">
        <span className="font-bold text-sm tracking-tight text-neutral-800">FamilyTracker</span>
        <span className="text-[11px] text-neutral-500 font-medium">{dateLabel} · {timeLabel}</span>
      </div>

      {/* ── Family Avatar Strip ── */}
      <div className="sticky top-[40px] z-10 px-4 pb-2 bg-background/90 backdrop-blur-md flex gap-3 items-center">
        {loadingMembers ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="w-8 h-8 rounded-full" />
          ))
        ) : (
          members?.map(member => (
            <button
              key={member.profile.id}
              onClick={() => onNavigate("map")}
              className="relative flex-shrink-0"
              data-testid={`avatar-member-${member.profile.id}`}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shadow-sm"
                style={{ backgroundColor: member.profile.colorHex ?? "#3B82F6" }}
              >
                {member.profile.name.charAt(0).toUpperCase()}
              </div>
              <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-background ${isOnline(member) ? "bg-green-500" : "bg-gray-400"}`} />
            </button>
          ))
        )}
      </div>

      {/* ── Widget Grid ── */}
      <div className="p-3 grid grid-cols-2 gap-3 pb-6">

        {/* Widget 1 — Weather */}
        <div
          className={`col-span-2 rounded-2xl bg-gradient-to-br ${weatherGrad} p-4 text-white shadow-sm flex flex-col justify-between min-h-[130px] cursor-pointer active:opacity-90`}
          data-testid="widget-weather"
        >
          {weatherLoading ? (
            <div className="flex gap-3 items-center">
              <Skeleton className="w-12 h-12 rounded-full bg-white/20" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-8 w-20 bg-white/20 rounded" />
                <Skeleton className="h-3 w-32 bg-white/20 rounded" />
              </div>
            </div>
          ) : weather ? (
            <>
              <div className="flex justify-between items-start">
                <div>
                  {weather.city && (
                    <div className="text-[11px] text-white/70 font-medium flex items-center gap-1 mb-1">
                      <MapPin className="w-3 h-3" /> {weather.city}
                    </div>
                  )}
                  <div className="text-4xl font-light leading-none mb-1">{weather.temp}°</div>
                  <div className="text-sm font-medium opacity-90">{weather.description}</div>
                </div>
                <WeatherIcon size={36} className="opacity-90" />
              </div>
              <div className="flex gap-4 text-xs opacity-80 mt-3">
                <span className="flex items-center gap-1"><Wind size={11} /> {weather.wind} km/h</span>
                <span className="flex items-center gap-1"><Droplets size={11} /> {weather.humidity}%</span>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <CloudSun size={36} className="opacity-70" />
              <div className="text-sm opacity-80">Meteo non disponibile</div>
            </div>
          )}
        </div>

        {/* Widget 2 — Family Map */}
        <button
          onClick={() => onNavigate("map")}
          className="col-span-2 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col min-h-[150px] relative text-left active:opacity-90"
          data-testid="widget-map"
        >
          <div className="absolute inset-0 bg-neutral-100/50 z-0">
            <svg className="w-full h-full text-neutral-200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none">
              <path d="M0 40 Q 50 10 110 50 T 230 60 T 330 30 T 420 80" stroke="currentColor" strokeWidth="5" fill="none"/>
              <path d="M60 0 L 80 160" stroke="currentColor" strokeWidth="7" fill="none"/>
              <path d="M0 100 Q 160 130 270 90 T 420 120" stroke="currentColor" strokeWidth="9" fill="none"/>
            </svg>
          </div>
          <div className="relative z-10 p-4 flex flex-col h-full flex-1">
            <div className="flex justify-between items-center mb-3">
              <div className="font-semibold text-sm text-neutral-800">Posizioni famiglia</div>
              <span className="text-xs font-medium flex items-center gap-0.5" style={{ color: "#E8533A" }}>
                Apri <ChevronRight size={13} />
              </span>
            </div>
            <div className="relative h-16 w-full mb-2">
              {loadingMembers ? (
                <div className="flex gap-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="w-4 h-4 rounded-full" />
                  ))}
                </div>
              ) : (
                members?.slice(0, 4).map((member, i) => {
                  const positions = [
                    { top: "10%", left: "8%" },
                    { top: "50%", left: "35%" },
                    { top: "20%", right: "25%" },
                    { bottom: "10%", right: "8%" },
                  ];
                  return (
                    <div
                      key={member.profile.id}
                      className="absolute flex flex-col items-center"
                      style={positions[i] as React.CSSProperties}
                    >
                      <div
                        className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
                        style={{ backgroundColor: member.profile.colorHex ?? "#3B82F6" }}
                      />
                      <span className="text-[10px] font-bold mt-0.5 bg-white/80 px-1 rounded leading-tight">
                        {member.profile.name.slice(0, 3)}
                      </span>
                    </div>
                  );
                })
              )}
            </div>
            {!loadingMembers && members && members.length > 0 && (
              <div className="text-[11px] text-neutral-600 leading-snug">
                {members.map((m, i) => (
                  <span key={m.profile.id}>
                    {i > 0 && " · "}
                    <span className="font-medium text-neutral-800">{m.profile.name}</span>
                    {" "}
                    {isOnline(m) ? "online" : "non raggiungibile"}
                  </span>
                ))}
              </div>
            )}
          </div>
        </button>

        {/* Widget 3 — Next Event */}
        <button
          onClick={() => onNavigate("calendar")}
          className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-blue-500 text-left active:opacity-90"
          data-testid="widget-event"
        >
          <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mb-3 flex-shrink-0">
            <Calendar size={17} />
          </div>
          {nextEvent ? (
            <>
              <div className="text-xs text-blue-600 font-semibold mb-1 leading-tight">
                {formatEventLabel(nextEvent.startAt)}
              </div>
              <div className="text-sm font-bold text-neutral-800 leading-tight line-clamp-2">
                {nextEvent.title}
              </div>
            </>
          ) : (
            <>
              <div className="text-xs text-neutral-400 mb-1">Nessun evento</div>
              <div className="text-sm font-bold text-neutral-400">Agenda libera</div>
            </>
          )}
        </button>

        {/* Widget 4 — Shopping */}
        <button
          onClick={() => onNavigate("shopping")}
          className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-green-500 text-left active:opacity-90"
          data-testid="widget-shopping"
        >
          <div className="w-8 h-8 rounded-full bg-green-50 text-green-500 flex items-center justify-center mb-3 flex-shrink-0">
            <ShoppingCart size={17} />
          </div>
          <div className="text-sm font-bold text-neutral-800 mb-1">Lista spesa</div>
          {pendingItems > 0 ? (
            <div className="text-xs text-neutral-500 mt-auto">
              <span className="font-semibold text-neutral-800">{pendingItems}</span> da comprare
            </div>
          ) : (
            <div className="text-xs text-green-600 mt-auto font-medium">Lista vuota ✓</div>
          )}
        </button>

        {/* Widget 5 — Tasks */}
        <button
          onClick={() => onNavigate("tasks")}
          className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-orange-500 text-left active:opacity-90"
          data-testid="widget-tasks"
        >
          <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mb-3 flex-shrink-0">
            <Star size={17} />
          </div>
          <div className="text-sm font-bold text-neutral-800 mb-2">Compiti</div>
          <div className="mt-auto w-full">
            <div className="flex justify-between text-xs mb-1 font-medium">
              <span className="text-neutral-500">{completedTasks}/{totalTasks}</span>
              <span className="text-orange-500">{taskPct}%</span>
            </div>
            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-orange-500 rounded-full transition-all"
                style={{ width: `${taskPct}%` }}
              />
            </div>
          </div>
        </button>

        {/* Widget 6 — Chat */}
        <button
          onClick={() => onNavigate("chat")}
          className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-purple-500 relative text-left active:opacity-90"
          data-testid="widget-chat"
        >
          {unreadMessages > 0 && (
            <div className="absolute top-3 right-3 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">
              {unreadMessages}
            </div>
          )}
          <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center mb-3 flex-shrink-0">
            <MessageCircle size={17} />
          </div>
          <div className="text-sm font-bold text-neutral-800 mb-1">Chat</div>
          {lastMessage ? (
            <div className="text-xs text-neutral-600 mt-auto italic bg-neutral-50 p-2 rounded-lg line-clamp-2 leading-snug">
              <span className="font-semibold not-italic">
                {lastMessage.sender?.name ?? "Qualcuno"}:
              </span>{" "}
              "{lastMessage.body}"
            </div>
          ) : (
            <div className="text-xs text-neutral-400 mt-auto">Nessun messaggio</div>
          )}
        </button>

        {/* Widget 7 — Meds Strip */}
        <button
          onClick={() => onNavigate("meds")}
          className="col-span-2 rounded-2xl bg-white shadow-sm p-4 flex flex-col border-l-4 border-rose-500 text-left active:opacity-90"
          data-testid="widget-meds"
        >
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-800">
              <Pill size={15} className="text-rose-500" /> Farmaci oggi
            </div>
            {activeMeds.length > 0 && (
              <div className="flex gap-1.5">
                {["mat", "pom", "ser"].map((slot, i) => {
                  const slotHour = [9, 15, 21][i];
                  const done = now.getHours() > slotHour;
                  return (
                    <div
                      key={slot}
                      className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] border ${done ? "bg-rose-500 border-rose-500 text-white" : "border-neutral-300"}`}
                    >
                      {done ? "✓" : ""}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          <div className="text-xs text-neutral-500">
            {nextMed ? (
              <>Prossimo: <span className="font-medium text-neutral-800">{nextMed.name} ore {nextMed.nextTime}</span></>
            ) : activeMeds.length > 0 ? (
              <span className="text-green-600 font-medium">Tutti i farmaci di oggi dati ✓</span>
            ) : (
              "Nessun farmaco attivo"
            )}
          </div>
        </button>

        {/* Widget 8 — Budget Strip */}
        <button
          onClick={() => onNavigate("budget")}
          className="col-span-2 rounded-2xl bg-white shadow-sm p-4 flex flex-col border-l-4 border-teal-500 text-left active:opacity-90"
          data-testid="widget-budget"
        >
          <div className="flex justify-between items-center mb-2">
            <div className="flex items-center gap-2 text-sm font-bold text-neutral-800">
              <CreditCard size={15} className="text-teal-500" /> Budget mese
            </div>
            <div className="text-xs font-semibold text-neutral-800">
              €{totalSpent.toFixed(0)}{" "}
              {totalBudget > 0 && <span className="text-neutral-400 font-normal">/ €{totalBudget.toFixed(0)}</span>}
            </div>
          </div>
          {totalBudget > 0 ? (
            <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden mt-1">
              <div
                className="h-full rounded-full transition-all"
                style={{
                  width: `${budgetPct}%`,
                  background: budgetPct > 80
                    ? "linear-gradient(to right, #f59e0b, #ef4444)"
                    : "linear-gradient(to right, #14b8a6, #fbbf24)",
                }}
              />
            </div>
          ) : (
            <div className="text-xs text-neutral-400 mt-1">Nessun budget impostato</div>
          )}
        </button>

      </div>
    </div>
  );
}
