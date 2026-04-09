import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Car, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale/it";

// ── Tipo Gap (mirrors the server response) ───────────────────────────────────
interface Gap {
  id: string;
  type: "driver_missing" | "pickup_missing" | "both_missing";
  event: {
    id: string; title: string; startAt: string; endAt?: string;
    locationName?: string; derived?: { departure_time?: string; return_time?: string };
    category?: string;
  };
  child: { id: string; name: string; colorHex?: string };
  available: Array<{ id: string; name: string; colorHex?: string }>;
  allBusy: boolean;
  urgency: "high" | "medium" | "low";
  question: { text: string; context: string; urgent?: boolean };
  quickActions: Array<{ label: string; type: string; payload: Record<string, string> }>;
}

export function GapCards() {
  const { toast } = useToast();

  const { data: gaps, isLoading } = useQuery<Gap[]>({
    queryKey: ["/api/gaps"],
    refetchInterval: 60_000,
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ action_type, payload }: { action_type: string; payload: Record<string, string> }) => {
      const r = await apiRequest("POST", "/api/gaps/resolve", { action_type, payload });
      return r.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gaps"] });
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      toast({ title: data.message || "Gap risolto!" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  if (isLoading || !gaps?.length) return null;

  return (
    <div className="px-4 space-y-3 mb-2">
      <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: "var(--color-text-tertiary)" }}>
        Da organizzare
      </p>
      {gaps.map(gap => {
        const urgencyColor = gap.urgency === "high" ? "#EF4444" : gap.urgency === "medium" ? "#F59E0B" : "var(--color-text-tertiary)";
        const evDate = new Date(gap.event.startAt);
        const evDateStr = format(evDate, "EEE d MMM", { locale: it });
        const evTime = format(evDate, "HH:mm");
        const dept = gap.event.derived?.departure_time;

        return (
          <div
            key={gap.id}
            className="rounded-[18px] p-4"
            style={{
              background: "var(--color-bg-elevated)",
              border: gap.urgency === "high" ? `1.5px solid ${urgencyColor}30` : "1px solid var(--color-border)",
              boxShadow: gap.urgency === "high" ? `0 0 0 1px ${urgencyColor}20` : "var(--shadow-sm)",
            }}
            data-testid={`gap-card-${gap.id}`}
          >
            {/* Header */}
            <div className="flex items-start gap-3 mb-3">
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0"
                style={{ backgroundColor: gap.child.colorHex || "var(--color-primary)" }}
              >
                {gap.child.name.charAt(0)}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold" style={{ color: "var(--color-text-primary)" }}>
                    {gap.event.title}
                  </span>
                  {gap.urgency === "high" && (
                    <span className="flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: "#FEE2E2", color: "#EF4444" }}>
                      <AlertTriangle className="w-2.5 h-2.5" />URGENTE
                    </span>
                  )}
                </div>
                <p className="text-xs mt-0.5" style={{ color: "var(--color-text-secondary)" }}>
                  {evDateStr} · {evTime}
                  {dept && <span style={{ color: "var(--color-primary)" }}> · Partenza {dept}</span>}
                  {gap.event.locationName && ` · ${gap.event.locationName}`}
                </p>
              </div>
            </div>

            {/* Domanda */}
            <div className="mb-3 px-1">
              <p className="text-[13px] font-medium leading-snug" style={{ color: "var(--color-text-primary)" }}>
                {gap.question.text}
              </p>
              {gap.question.context && (
                <p className="text-[12px] mt-1" style={{ color: "var(--color-text-tertiary)" }}>
                  {gap.question.context}
                </p>
              )}
            </div>

            {/* Quick actions */}
            <div className="flex flex-wrap gap-2">
              {gap.quickActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => resolveMutation.mutate({ action_type: action.type, payload: action.payload })}
                  disabled={resolveMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[12px] font-semibold transition-all active:scale-[.97] disabled:opacity-50"
                  style={i === 0 && action.type === "assign_driver"
                    ? { background: "var(--color-primary)", color: "white" }
                    : { background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }
                  }
                  data-testid={`gap-action-${gap.id}-${i}`}
                >
                  {resolveMutation.isPending && i === 0
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : action.type === "assign_driver" ? <Car className="w-3.5 h-3.5" />
                    : action.type === "mark_autonomous" ? <CheckCircle className="w-3.5 h-3.5" />
                    : null
                  }
                  {action.label}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
