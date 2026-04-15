import { useState, useMemo, useCallback } from "react";
import { Plus, Skeleton } from "lucide-react";
import type { Event, Profile } from "@shared/schema";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  isToday, parseISO,
} from "date-fns";
import { it } from "date-fns/locale";
import KinlyEventCard from "./KinlyEventCard";
import { categoryColor } from "./constants";

interface EventWithDetails extends Event {
  assignedProfiles?: Profile[];
}

export interface MonthViewProps {
  cursor: Date;
  events: EventWithDetails[];
  members: Profile[];
  selectedDate: Date;
  isLoading: boolean;
  currentProfileId?: string;
  onDaySelect: (d: Date) => void;
  onEventTap: (e: EventWithDetails) => void;
  onAddDay: (d: Date) => void;
}

export default function MonthView({
  cursor, events, members, selectedDate, isLoading, currentProfileId,
  onDaySelect, onEventTap, onAddDay
}: MonthViewProps) {
  const days = useMemo(() => eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) }), [cursor]);
  const getForDay = useCallback((d: Date) => events.filter(e => isSameDay(parseISO(String(e.startAt)), d)), [events]);
  const leadingDays = useMemo(() => (startOfMonth(cursor).getDay() + 6) % 7, [cursor]);

  const memoizedOnDaySelect = useCallback((d: Date) => onDaySelect(d), [onDaySelect]);
  const memoizedOnEventTap = useCallback((e: Event) => onEventTap(e as any), [onEventTap]);
  const memoizedOnAddDay = useCallback((d: Date) => onAddDay(d), [onAddDay]);

  return (
    <div className="px-3 pt-2">
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {["L","M","M","G","V","S","D"].map((d, i) => (
          <div key={i} className="text-center text-[11px] font-semibold py-1" style={{ color: i === 6 ? "var(--color-primary)" : "var(--color-text-tertiary)" }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-[2px]">
        {Array.from({ length: leadingDays }).map((_, i) => <div key={`e-${i}`} className="aspect-square" />)}
        {days.map(day => {
          const dayEvs = getForDay(day);
          const sel = isSameDay(day, selectedDate);
          const tod = isToday(day);
          const isSunday = day.getDay() === 0;
          const dots = dayEvs.slice(0, 3);
          const extra = dayEvs.length - 3;
          return (
            <button
              key={day.toString()}
              onClick={() => memoizedOnDaySelect(day)}
              className="aspect-square flex flex-col items-center justify-start pt-1 rounded-xl transition-all active:scale-95"
              style={sel
                ? { background: "var(--color-surface)", color: "white" }
                : tod
                ? { background: "var(--color-primary)", color: "white", animation: "todayPulse 2.5s ease-in-out infinite" }
                : {}}
              data-testid={`day-${format(day, "yyyy-MM-dd")}`}
            >
              <span className={`text-[12px] font-bold leading-none`} style={{
                color: sel || tod ? "white" : isSunday ? "var(--color-primary)" : "var(--color-text-primary)"
              }}>
                {format(day, "d")}
              </span>
              {dayEvs.length > 0 && (
                <div className="flex gap-[2px] mt-0.5 flex-wrap justify-center">
                  {dots.map((e, i) => (
                    <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sel || tod ? "rgba(255,255,255,.7)" : categoryColor(e.category) }} />
                  ))}
                  {extra > 0 && (
                    <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sel || tod ? "rgba(255,255,255,.5)" : "var(--color-text-tertiary)" }} />
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected day mini-agenda */}
      <div className="mt-5 border-t pt-4" style={{ borderColor: "var(--color-border)" }}>
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--color-text-tertiary)" }}>
              {isToday(selectedDate) ? "Oggi" : format(selectedDate, "EEEE", { locale: it })}
            </p>
            <p className="text-base font-bold capitalize" style={{ color: "var(--color-text-primary)" }}>
              {format(selectedDate, "d MMMM", { locale: it })}
            </p>
          </div>
          <button
            onClick={() => memoizedOnAddDay(selectedDate)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }}
            aria-label={`Aggiungi evento per ${format(selectedDate, "d MMMM", { locale: it })}`}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {isLoading ? <div className="h-16 rounded-2xl" style={{ background: "var(--color-bg-grouped)" }} /> : (
          <div className="space-y-2">
            {getForDay(selectedDate).length === 0
              ? <p className="text-sm text-center py-4" style={{ color: "var(--color-text-tertiary)" }}>Nessun evento</p>
              : getForDay(selectedDate).map(e => <KinlyEventCard key={e.id} event={e} members={members} onTap={memoizedOnEventTap} currentProfileId={currentProfileId} />)
            }
          </div>
        )}
      </div>
    </div>
  );
}
