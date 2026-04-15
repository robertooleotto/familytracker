import { useMemo, useCallback } from "react";
import { Plus } from "lucide-react";
import type { Event, Profile } from "@shared/schema";
import {
  format, eachDayOfInterval, isSameDay, isToday, parseISO,
  startOfWeek, endOfWeek, getHours, getMinutes,
} from "date-fns";
import { it } from "date-fns/locale";
import KinlyEventCard from "./KinlyEventCard";
import { categoryColor, formatTime } from "./constants";

interface EventWithDetails extends Event {
  assignedProfiles?: Profile[];
}

const IT_DAYS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const HOUR_SLOTS    = Array.from({ length: 16 }, (_, i) => i + 7); // 7–22

export interface WeekViewProps {
  cursor: Date;
  events: EventWithDetails[];
  members: Profile[];
  selectedDate: Date;
  isLoading: boolean;
  onDaySelect: (d: Date) => void;
  onEventTap: (e: EventWithDetails) => void;
  onAddDay: (d: Date) => void;
}

export default function WeekView({
  cursor, events, members, selectedDate, isLoading,
  onDaySelect, onEventTap, onAddDay
}: WeekViewProps) {
  const weekDays = useMemo(() => eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end:   endOfWeek(cursor, { weekStartsOn: 1 }),
  }), [cursor]);

  const dayEvs = useMemo(() => events.filter(e => isSameDay(parseISO(String(e.startAt)), selectedDate))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime()), [events, selectedDate]);

  const HOUR_H = 50;

  const evPos = useCallback((e: EventWithDetails) => {
    const s = new Date(e.startAt);
    const startMin = (getHours(s) - 7) * 60 + getMinutes(s);
    const endDate  = e.endAt ? new Date(e.endAt) : new Date(s.getTime() + 60 * 60000);
    const endMin   = (getHours(endDate) - 7) * 60 + getMinutes(endDate);
    const top    = (startMin / 60) * HOUR_H;
    const height = Math.max(((endMin - startMin) / 60) * HOUR_H, 24);
    return { top, height };
  }, []);

  const memoizedOnDaySelect = useCallback((d: Date) => onDaySelect(d), [onDaySelect]);
  const memoizedOnEventTap = useCallback((e: Event) => onEventTap(e as any), [onEventTap]);
  const memoizedOnAddDay = useCallback((d: Date) => onAddDay(d), [onAddDay]);

  return (
    <div className="px-3 pt-2">
      {/* 7-day bubble strip */}
      <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-3">
        {weekDays.map(day => {
          const cnt = events.filter(e => isSameDay(parseISO(String(e.startAt)), day)).length;
          const sel = isSameDay(day, selectedDate);
          const tod = isToday(day);
          return (
            <button
              key={day.toString()}
              onClick={() => memoizedOnDaySelect(day)}
              className="flex-shrink-0 flex flex-col items-center gap-1 px-2.5 py-2 rounded-2xl transition-all active:scale-95"
              style={sel
                ? { background: "var(--color-surface)", color: "white" }
                : tod
                ? { background: "var(--color-primary)", color: "white" }
                : { background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }
              }
            >
              <span className="text-[10px] font-semibold uppercase">{IT_DAYS_SHORT[day.getDay()]}</span>
              <span className="text-sm font-bold">{format(day, "d")}</span>
              {cnt > 0 && <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sel || tod ? "rgba(255,255,255,.7)" : "var(--color-primary)" }} />}
            </button>
          );
        })}
      </div>

      {/* Day label + add */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-bold capitalize" style={{ color: "var(--color-text-primary)" }}>
          {isToday(selectedDate) ? "Oggi" : ""} {format(selectedDate, "EEEE d MMMM", { locale: it })}
        </p>
        <button onClick={() => memoizedOnAddDay(selectedDate)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }} aria-label={`Aggiungi evento per ${format(selectedDate, "d MMMM", { locale: it })}`}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hourly timeline */}
      {isLoading ? <div className="h-40 rounded-2xl" style={{ background: "var(--color-bg-grouped)" }} /> : (
        <div className="relative" style={{ height: HOUR_H * HOUR_SLOTS.length }}>
          {/* Hour grid lines */}
          {HOUR_SLOTS.map(h => (
            <div key={h} className="absolute flex items-center gap-2" style={{ top: (h - 7) * HOUR_H, left: 0, right: 0, height: HOUR_H }}>
              <span className="text-[11px] font-semibold w-10 text-right flex-shrink-0" style={{ color: "var(--color-text-tertiary)" }}>{h}:00</span>
              <div className="flex-1 border-t" style={{ borderColor: "var(--color-border)" }} />
            </div>
          ))}

          {/* Event blocks */}
          {dayEvs.map(e => {
            const { top, height } = evPos(e);
            if (top < 0 || top > HOUR_H * HOUR_SLOTS.length) return null;
            return (
              <button
                key={e.id}
                className="absolute rounded-xl overflow-hidden text-left active:scale-95 transition-transform"
                style={{
                  top, height,
                  left: 56, right: 8,
                  background: `${categoryColor(e.category)}18`,
                  borderLeft: `3px solid ${categoryColor(e.category)}`,
                }}
                onClick={() => memoizedOnEventTap(e)}
                data-testid={`week-event-${e.id}`}
              >
                <div className="px-2 py-1">
                  <p className="text-[12px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{e.title}</p>
                  {height > 32 && (
                    <p className="text-[11px]" style={{ color: categoryColor(e.category) }}>{formatTime(new Date(e.startAt))}</p>
                  )}
                </div>
              </button>
            );
          })}

          {dayEvs.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center" style={{ left: 56 }}>
              <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>Giornata libera</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
