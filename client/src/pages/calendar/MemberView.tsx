import { useState, useMemo, useCallback } from "react";
import type { Event, Profile } from "@shared/schema";
import { isPast } from "date-fns";
import KinlyEventCard from "./KinlyEventCard";
import { CATEGORIES } from "./constants";

interface EventWithDetails extends Event {
  assignedProfiles?: Profile[];
}

export interface MemberViewProps {
  events: EventWithDetails[];
  members: Profile[];
  isLoading: boolean;
  onEventTap: (e: EventWithDetails) => void;
}

export default function MemberView({
  events, members, isLoading, onEventTap
}: MemberViewProps) {
  const [selectedMember, setSelectedMember] = useState<string | null>(members[0]?.id ?? null);

  const memberEvs = useMemo(() => {
    if (!selectedMember) return [];
    return events.filter(e => (e.assignedTo || []).includes(selectedMember))
      .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [events, selectedMember]);

  const stats = useMemo(() => {
    const total = memberEvs.length;
    const byCat: Record<string, number> = {};
    for (const e of memberEvs) {
      const k = e.category || "other";
      byCat[k] = (byCat[k] || 0) + 1;
    }
    return { total, byCat };
  }, [memberEvs]);

  const memoizedOnEventTap = useCallback((e: Event) => onEventTap(e as any), [onEventTap]);
  const upcomingFiltered = useMemo(() => memberEvs.filter(e => !isPast(new Date(e.startAt))).slice(0, 20), [memberEvs]);

  return (
    <div className="px-4 pt-2 space-y-4">
      {/* Member selector */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
        {members.map(m => {
          const sel = m.id === selectedMember;
          return (
            <button key={m.id} onClick={() => setSelectedMember(m.id)} className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform" data-testid={`member-sel-${m.id}`} aria-label={`Visualizza eventi di ${m.name}`} aria-pressed={sel}>
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center text-white text-xl font-bold"
                style={{
                  backgroundColor: m.colorHex || "var(--color-primary)",
                  border: sel ? `3px solid var(--color-surface)` : "3px solid transparent",
                  boxShadow: sel ? "var(--shadow-md)" : "none",
                }}
              >
                {m.name.charAt(0)}
              </div>
              <span className="text-[12px] font-medium" style={{ color: sel ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
                {m.name.split(" ")[0]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Stats card */}
      {selectedMember && (
        <div className="rounded-[18px] p-4" style={{ background: "var(--color-surface)" }}>
          <p className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "rgba(255,255,255,.5)" }}>
            Statistiche · {members.find(m => m.id === selectedMember)?.name.split(" ")[0]}
          </p>
          <p className="text-3xl font-bold text-white mb-3">{stats.total} <span className="text-base font-normal" style={{ color: "rgba(255,255,255,.6)" }}>eventi</span></p>
          <div className="space-y-2">
            {Object.entries(stats.byCat).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
              <div key={cat} className="flex items-center gap-2">
                <span className="text-sm w-16 flex-shrink-0" style={{ color: "rgba(255,255,255,.7)" }}>{CATEGORIES[cat as keyof typeof CATEGORIES]?.label || cat}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,.1)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(count / stats.total) * 100}%`, background: `var(${CATEGORIES[cat as keyof typeof CATEGORIES]?.cssVar || "--cal-other"})` }} />
                </div>
                <span className="text-xs font-semibold text-white">{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Events list */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: "var(--color-text-tertiary)" }}>Prossimi eventi</p>
        {isLoading ? <div className="h-16 rounded-2xl" style={{ background: "var(--color-bg-grouped)" }} /> : (
          <div className="space-y-2">
            {upcomingFiltered.length === 0
              ? <p className="text-sm text-center py-6" style={{ color: "var(--color-text-tertiary)" }}>Nessun evento</p>
              : upcomingFiltered.map(e => (
                  <KinlyEventCard key={e.id} event={e} members={[]} onTap={memoizedOnEventTap} showDate />
                ))
            }
          </div>
        )}
      </div>
    </div>
  );
}
