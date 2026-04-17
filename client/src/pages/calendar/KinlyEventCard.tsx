import { Clock, MapPin } from "lucide-react";
import type { Event, Profile } from "@shared/schema";
import { format } from "date-fns";
import { it } from "date-fns/locale";
import { categoryColor, formatDuration } from "./constants";

interface EventWithDetails extends Event {
  assignedProfiles?: Profile[];
}

export interface KinlyEventCardProps {
  event: EventWithDetails;
  members: Profile[];
  onTap: (e: EventWithDetails) => void;
  showDate?: boolean;
  currentProfileId?: string;
}

export default function KinlyEventCard({
  event, members, onTap, showDate, currentProfileId
}: KinlyEventCardProps) {
  const assigned = members.filter(m => (event.assignedTo || []).includes(m.id));
  const cc = categoryColor(event.category);

  // ── Ruolo dell'utente corrente in questo evento ──
  const participants: Array<{ member_id: string; role: string; autonomous?: boolean }> = (event as unknown as { participants?: unknown }).participants || [];
  const myParticipant = currentProfileId ? participants.find(p => p.member_id === currentProfileId) : null;
  const isDriver = myParticipant?.role === "driver";
  const isSupport = myParticipant?.role === "support";
  const hasGap = ((event as unknown as { gaps?: unknown }).gaps || []).includes("driver_missing");

  // Orario di partenza dal campo derived o departureTime
  const derived = (event as unknown as { derived?: Record<string, unknown> }).derived || {};
  const showDeparture = isDriver && (derived.departure_time || event.departureTime);
  const departureLabel = derived.departure_time || event.departureTime;

  return (
    <button
      className="w-full flex items-stretch rounded-[var(--event-radius)] overflow-hidden active:scale-[.98] transition-transform text-left"
      style={{
        background: "var(--color-bg-elevated)",
        border: hasGap ? "1.5px solid #F59E0B40" : ".5px solid var(--color-border)",
        boxShadow: "var(--event-shadow)",
        opacity: isSupport ? 0.45 : 1,
      }}
      onClick={() => onTap(event)}
      data-testid={`event-${event.id}`}
      aria-label={`Evento: ${event.title} - ${format(new Date(event.startAt), "d MMM HH:mm")}`}
    >
      <div className="w-1 flex-shrink-0" style={{ backgroundColor: cc, minHeight: 44 }} />
      <div className="flex-1 px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 mb-0.5">
              {showDate && (
                <span className="text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  {format(new Date(event.startAt), "d MMM", { locale: it })} ·
                </span>
              )}
              <span className="text-sm font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{event.title}</span>
              {isDriver && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full flex-shrink-0" style={{ background: "#10B98120", color: "#10B981" }}>🚗 Driver</span>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {showDeparture ? (
                <span className="flex items-center gap-1 text-[12px] font-bold" style={{ color: "var(--color-primary)" }}>
                  <Clock className="w-3 h-3" />
                  Parti alle {departureLabel}
                </span>
              ) : !event.allDay ? (
                <span className="flex items-center gap-1 text-[12px] font-medium" style={{ color: cc }}>
                  <Clock className="w-3 h-3" />
                  {formatDuration(new Date(event.startAt), event.endAt ? new Date(event.endAt) : null)}
                </span>
              ) : (
                <span className="text-[12px]" style={{ color: cc }}>Tutto il giorno</span>
              )}
              {event.locationName && (
                <span className="flex items-center gap-1 text-[11px]" style={{ color: "var(--color-text-tertiary)" }}>
                  <MapPin className="w-3 h-3" />{event.locationName}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {event.aiSuggested && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "var(--ai-badge-bg)", color: "var(--ai-badge-text)" }}>AI</span>
            )}
            {!isDriver && event.departureTime && !showDeparture && (
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full" style={{ background: "var(--depart-badge-bg)", color: "var(--depart-badge-text)" }}>
                🚗 {event.departureTime}
              </span>
            )}
            {hasGap && !isDriver && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#FEF9C3", color: "#B45309" }}>⚠️</span>
            )}
            {assigned.length > 0 && (
              <div className="flex -space-x-1">
                {assigned.slice(0, 3).map(m => (
                  <div key={m.id} className="w-5 h-5 rounded-full border-2 border-white text-white text-[9px] flex items-center justify-center font-bold" style={{ backgroundColor: m.colorHex }}>
                    {m.name.charAt(0)}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
}
