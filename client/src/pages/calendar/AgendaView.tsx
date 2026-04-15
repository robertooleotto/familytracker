import { useMemo, useCallback } from "react";
import { Calendar, Plus } from "lucide-react";
import type { Event, Profile } from "@shared/schema";
import { format, startOfDay, isPast, isSameDay, parseISO } from "date-fns";
import { it } from "date-fns/locale";
import KinlyEventCard from "./KinlyEventCard";

interface EventWithDetails extends Event {
  assignedProfiles?: Profile[];
}

export interface AgendaViewProps {
  events: EventWithDetails[];
  members: Profile[];
  isLoading: boolean;
  currentProfileId?: string;
  onEventTap: (e: EventWithDetails) => void;
  onAddDay: (d: Date) => void;
}

export default function AgendaView({
  events, members, isLoading, currentProfileId, onEventTap, onAddDay
}: AgendaViewProps) {
  const groups = useMemo(() => {
    const grouped: Record<string, EventWithDetails[]> = {};
    for (const e of events) {
      const date = new Date(e.startAt);
      const dateStr = startOfDay(date).toISOString();
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(e);
    }
    return Object.entries(grouped).map(([dateStr, items]) => ({
      date: new Date(dateStr),
      items: items.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()),
    })).sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [events]);

  const memoizedOnEventTap = useCallback((e: EventWithDetails) => onEventTap(e), [onEventTap]);
  const memoizedOnAddDay = useCallback((d: Date) => onAddDay(d), [onAddDay]);

  const today = useMemo(() => startOfDay(new Date()), []);
  const upcomingAndPast = useMemo(() => {
    const upcoming = groups.filter(g => !isPast(g.date) || isSameDay(g.date, today)).slice(0, 30);
    const past = groups.filter(g => isPast(g.date) && !isSameDay(g.date, today)).slice(-3).reverse();
    return { upcoming, past };
  }, [groups, today]);
  const { upcoming, past } = upcomingAndPast;

  if (groups.length === 0) return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <Calendar className="w-12 h-12 opacity-20" style={{ color: "var(--color-text-tertiary)" }} />
      <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>Nessun evento in agenda</p>
      <button onClick={() => onAddDay(new Date())} className="px-4 py-2 rounded-full text-sm font-semibold text-white" style={{ background: "var(--color-primary)" }}>+ Aggiungi</button>
    </div>
  );

  const renderGroup = (g: { date: Date; items: EventWithDetails[] }, isPastGroup?: boolean) => (
    <div key={g.date.toString()} className={isPastGroup ? "opacity-50" : ""}>
      <div className="flex items-center justify-between px-4 py-1.5 sticky top-0 z-10" style={{ background: "var(--background)" }}>
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-bold capitalize" style={{ color: "var(--color-text-primary)" }}>
            {startOfDay(new Date()).getTime() === g.date.getTime() ? "Oggi" : format(g.date, "EEEE d MMMM", { locale: it })}
          </span>
          {startOfDay(new Date()).getTime() === g.date.getTime() && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--color-primary)" }}>OGGI</span>
          )}
        </div>
        <button onClick={() => memoizedOnAddDay(g.date)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-tertiary)" }}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-4 space-y-2 pb-3">
        {g.items.map(e => <KinlyEventCard key={e.id} event={e} members={members} onTap={memoizedOnEventTap} currentProfileId={currentProfileId} />)}
      </div>
    </div>
  );

  return (
    <div>
      {past.length > 0 && (
        <details className="mb-1">
          <summary className="px-4 py-2 text-xs font-semibold cursor-pointer" style={{ color: "var(--color-text-tertiary)" }}>
            Passati ({past.length} giorni)
          </summary>
          {past.map(g => renderGroup(g, true))}
        </details>
      )}
      {upcoming.map(g => renderGroup(g))}
    </div>
  );
}
