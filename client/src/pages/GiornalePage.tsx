import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import type { Event, ShoppingItem, Task, Profile } from "@shared/schema";
import {
  MapPin, MessageCircle, CheckCircle2, Calendar,
  ShoppingCart, Star, ShieldCheck, Navigation,
  Clock, CloudSun,
} from "lucide-react";

type FilterKey = "Tutto" | "Posizioni" | "Messaggi" | "Eventi" | "Compiti" | "Spesa";
const FILTERS: FilterKey[] = ["Tutto", "Posizioni", "Messaggi", "Eventi", "Compiti", "Spesa"];

interface FeedItem {
  id: string;
  type: "location" | "message" | "event" | "task" | "shopping" | "weather";
  time: Date;
  data: Record<string, unknown>;
}

function timeLabel(d: Date) {
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
function relativeDay(d: Date) {
  const now = new Date();
  const diff = Math.round((now.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return "Oggi";
  if (diff === 1) return "Ieri";
  return d.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

function LocationCard({ item }: { item: FeedItem }) {
  const { name, colorHex } = item.data as { name: string; colorHex: string; locationName: string };
  const loc = item.data.locationName as string | null;
  return (
    <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] border border-stone-100 relative">
      <div
        className="absolute -left-3 top-4 w-6 h-6 rounded-full border-4 border-[#faf7f2] flex items-center justify-center text-white text-[10px] font-bold z-10"
        style={{ backgroundColor: colorHex || "#E8533A" }}
      >
        {(name as string).charAt(0)}
      </div>
      <p className="text-sm font-medium text-stone-800 leading-snug">
        <span className="font-semibold">{name}</span>{loc ? ` è a ${loc}` : " ha condiviso la posizione"}
      </p>
      <div className="mt-2 flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2.5 py-1 rounded-md">
        <ShieldCheck className="w-3.5 h-3.5" />
        Zona sicura
      </div>
    </div>
  );
}

function EventCard({ item }: { item: FeedItem }) {
  const { title, locationName } = item.data as { title: string; locationName: string | null };
  const start = new Date(item.data.startAt as string);
  const minsLeft = Math.round((start.getTime() - Date.now()) / 60000);
  const label = minsLeft > 0 ? `fra ${minsLeft} min` : minsLeft > -120 ? "in corso" : "concluso";
  return (
    <div className="flex-1 bg-white rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] border border-stone-100 overflow-hidden flex">
      <div className="w-1.5 flex-shrink-0" style={{ backgroundColor: "var(--color-primary)" }} />
      <div className="p-4 flex-1">
        <div className="flex items-center gap-2 mb-1.5">
          <Calendar className="w-3.5 h-3.5 text-blue-500" />
          <span className="text-[11px] font-semibold text-blue-600 uppercase tracking-wider">
            {timeLabel(start)}
          </span>
        </div>
        <h3 className="text-[15px] font-medium text-stone-800">{title}</h3>
        <p className="text-xs text-stone-500 mt-0.5 flex items-center gap-1">
          <Clock className="w-3 h-3" />{label}
          {locationName && <> · {locationName}</>}
        </p>
        {locationName && (
          <div className="mt-2.5">
            <button className="flex items-center gap-1.5 bg-stone-50 hover:bg-stone-100 border border-stone-200 px-3 py-1.5 rounded-xl text-sm font-medium text-stone-700 transition-colors">
              <Navigation className="w-3.5 h-3.5 text-blue-500" />
              Naviga
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskCard({ item }: { item: FeedItem }) {
  const { title, profileName, points } = item.data as { title: string; profileName: string; points: number };
  const done = !!item.data.completedAt;
  return (
    <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] border border-stone-100 flex items-start gap-3">
      <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
        <CheckCircle2 className={`w-6 h-6 ${done ? "text-amber-500" : "text-stone-300"}`} />
      </div>
      <div>
        <p className="text-sm font-medium text-stone-800">
          {done ? (
            <><span className="font-semibold">{profileName}</span> ha completato: {title}</>
          ) : (
            <>In attesa: {title} — <span className="font-semibold">{profileName}</span></>
          )}
        </p>
        {done && points > 0 && (
          <div className="mt-2 inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">
            <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
            +{points} punti
          </div>
        )}
      </div>
    </div>
  );
}

function ShoppingCard({ item }: { item: FeedItem }) {
  const { items, profileName } = item.data as { items: string[]; profileName: string };
  return (
    <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] border border-stone-100">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 mt-1">
          <ShoppingCart className="w-4 h-4 text-orange-500" />
        </div>
        <div>
          <p className="text-sm font-medium text-stone-800 leading-snug">
            <span className="font-semibold">{profileName}</span> ha aggiunto alla lista:
          </p>
          <div className="flex flex-wrap gap-1.5 mt-2">
            {items.slice(0, 5).map((name, i) => (
              <span key={i} className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-medium border border-stone-200">
                {name}
              </span>
            ))}
            {items.length > 5 && (
              <span className="px-2.5 py-1 bg-stone-100 text-stone-400 rounded-lg text-xs border border-stone-200">
                +{items.length - 5}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WeatherCard({ item }: { item: FeedItem }) {
  const { text } = item.data as { text: string };
  return (
    <div className="flex-1 bg-gradient-to-br from-blue-50 to-sky-50 p-4 rounded-2xl shadow-sm border border-blue-100/50">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0">
          <CloudSun className="w-5 h-5 text-amber-400 fill-amber-50" />
        </div>
        <p className="text-sm font-medium text-stone-800">{text}</p>
      </div>
    </div>
  );
}

function MessageCard({ item }: { item: FeedItem }) {
  const { text, senderName, colorHex } = item.data as { text: string; senderName: string; colorHex: string };
  return (
    <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.06)] border border-stone-100">
      <div className="flex items-center gap-2 mb-2.5">
        <MessageCircle className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Chat Famiglia</span>
      </div>
      <div className="flex gap-2.5">
        <div
          className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
          style={{ backgroundColor: colorHex || "#E8533A" }}
        >
          {senderName.charAt(0)}
        </div>
        <div className="bg-stone-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-stone-700">
          {text}
        </div>
      </div>
    </div>
  );
}

const FILTER_TYPE_MAP: Record<FilterKey, FeedItem["type"] | null> = {
  Tutto: null,
  Posizioni: "location",
  Messaggi: "message",
  Eventi: "event",
  Compiti: "task",
  Spesa: "shopping",
};

export default function GiornalePage() {
  const { profile } = useAuth();
  const [activeFilter, setActiveFilter] = useState<FilterKey>("Tutto");

  const { data: events = [] } = useQuery<Event[]>({ queryKey: ["/api/events"] });
  const { data: tasks = [] } = useQuery<Task[]>({ queryKey: ["/api/tasks"] });
  const { data: shopping = [] } = useQuery<ShoppingItem[]>({ queryKey: ["/api/shopping"] });
  const { data: locations = [] } = useQuery<{ profile: Profile; location: { locationName?: string } | null }[]>({
    queryKey: ["/api/family/locations"],
  });
  const { data: membersCtx = [] } = useQuery<Array<{ profile: Profile }>>({
    queryKey: ["/api/family/members"],
  });
  const { data: aiSummary } = useQuery<{ text: string; date: string }>({ queryKey: ["/api/ai/summary"] });

  const profileMap = useMemo(() => {
    const map: Record<string, Profile> = {};
    (membersCtx ?? []).forEach((m) => { map[m.profile.id] = m.profile; });
    return map;
  }, [membersCtx]);

  const feed = useMemo<FeedItem[]>(() => {
    const items: FeedItem[] = [];

    events.forEach((ev) => {
      items.push({
        id: `event-${ev.id}`,
        type: "event",
        time: new Date(ev.startAt),
        data: { ...ev },
      });
    });

    tasks.forEach((t) => {
      const p = t.assignedTo ? profileMap[t.assignedTo] : undefined;
      items.push({
        id: `task-${t.id}`,
        type: "task",
        time: new Date(t.completedAt ?? t.createdAt),
        data: {
          title: t.title,
          profileName: p?.name ?? "Membro",
          points: t.points ?? 0,
          completedAt: t.completedAt,
        },
      });
    });

    const shoppingByProfile: Record<string, string[]> = {};
    shopping.forEach((s) => {
      const key = s.addedBy ?? "unknown";
      if (!shoppingByProfile[key]) shoppingByProfile[key] = [];
      shoppingByProfile[key].push(s.name);
    });
    Object.entries(shoppingByProfile).forEach(([pid, names]) => {
      const p = profileMap[pid];
      items.push({
        id: `shopping-${pid}`,
        type: "shopping",
        time: new Date(),
        data: { items: names, profileName: p?.name ?? "Membro" },
      });
    });

    locations.forEach(({ profile: p, location }) => {
      if (!location) return;
      items.push({
        id: `loc-${p.id}`,
        type: "location",
        time: new Date(),
        data: { name: p.name, colorHex: p.colorHex, locationName: (location as Record<string, string | null>).locationName ?? null },
      });
    });

    if (aiSummary?.text) {
      items.push({
        id: "weather-ai",
        type: "weather",
        time: new Date(),
        data: { text: aiSummary.text },
      });
    }

    return items.sort((a, b) => b.time.getTime() - a.time.getTime());
  }, [events, tasks, shopping, locations, aiSummary, profileMap]);

  const filtered = useMemo(() => {
    const type = FILTER_TYPE_MAP[activeFilter];
    return type ? feed.filter((i) => i.type === type) : feed;
  }, [feed, activeFilter]);

  const grouped = useMemo(() => {
    const groups: Record<string, FeedItem[]> = {};
    filtered.forEach((item) => {
      const key = relativeDay(item.time);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups);
  }, [filtered]);

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-y-auto" style={{ background: "#faf7f2" }}>
      <style>{`
        .giornale-scrollbar::-webkit-scrollbar { display: none; }
        .giornale-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur-md pt-3 pb-2 px-4 border-b border-stone-200/50" style={{ background: "rgba(250,247,242,0.92)" }}>
        <div className="flex justify-between items-center mb-3">
          <h1 className="text-xl font-serif italic font-medium tracking-tight text-stone-900">
            📔 Giornale di Famiglia
          </h1>
          <div className="flex -space-x-2">
            {(membersCtx ?? []).slice(0, 3).map((m: { profile: Profile }) => (
              <div
                key={m.profile.id}
                className="w-8 h-8 rounded-full border-2 border-[#faf7f2] flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: m.profile.colorHex || "#E8533A" }}
              >
                {m.profile.name.charAt(0)}
              </div>
            ))}
          </div>
        </div>

        {/* Filtri */}
        <div className="flex overflow-x-auto giornale-scrollbar gap-2 pb-1 -mx-4 px-4">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setActiveFilter(f)}
              data-testid={`filter-${f}`}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm transition-all ${
                activeFilter === f
                  ? "bg-stone-800 text-stone-50 shadow-md font-medium"
                  : "bg-white border border-stone-200 text-stone-600"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </header>

      {/* Feed */}
      <main className="px-4 py-5 space-y-6 pb-10">
        {grouped.length === 0 && (
          <div className="text-center py-16 text-stone-400 text-sm">
            Nessuna attività da mostrare
          </div>
        )}

        {grouped.map(([dayLabel, items]) => (
          <div key={dayLabel}>
            {/* Day header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="h-px flex-1 bg-stone-200" />
              <span className="text-xs font-semibold text-stone-400 uppercase tracking-widest">{dayLabel}</span>
              <div className="h-px flex-1 bg-stone-200" />
            </div>

            <div className="space-y-5 relative">
              {/* Timeline line */}
              <div className="absolute left-[23px] top-0 bottom-0 w-px bg-stone-200 -z-10" />

              {items.map((item) => (
                <div key={item.id} className="flex gap-3">
                  {/* Time column */}
                  <div className="w-12 pt-1 flex flex-col items-center flex-shrink-0">
                    <span className="text-xs font-medium text-stone-400">{timeLabel(item.time)}</span>
                  </div>

                  {/* Card */}
                  {item.type === "location"  && <LocationCard item={item} />}
                  {item.type === "event"     && <EventCard item={item} />}
                  {item.type === "task"      && <TaskCard item={item} />}
                  {item.type === "shopping"  && <ShoppingCard item={item} />}
                  {item.type === "weather"   && <WeatherCard item={item} />}
                  {item.type === "message"   && <MessageCard item={item} />}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="h-4" />
      </main>
    </div>
  );
}
