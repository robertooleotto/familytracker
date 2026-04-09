import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import {
  Car, Bike, Bus, Footprints, MapPin, Clock, Plus,
  Trash2, Star, Route, Brain, ChevronRight, X,
} from "lucide-react";

type TravelMode = "car" | "bike" | "walk" | "bus" | "other";

const MODE_META: Record<TravelMode, { icon: typeof Car; label: string; color: string }> = {
  car:   { icon: Car,       label: "Auto",     color: "#3B82F6" },
  bike:  { icon: Bike,      label: "Bici",     color: "#10B981" },
  walk:  { icon: Footprints, label: "A piedi", color: "#F59E0B" },
  bus:   { icon: Bus,       label: "Mezzi",    color: "#8B5CF6" },
  other: { icon: Route,     label: "Altro",    color: "#6B7280" },
};

interface TripRow {
  trip: {
    id: string; fromName: string; toName: string;
    distanceKm: number | null; durationMin: number | null;
    mode: string; note: string | null; startedAt: string;
  };
  profile: { id: string; name: string; colorHex: string; role: string };
}

interface Memory {
  trips: TripRow[];
  checkins: { checkin: { id: string; placeName: string; createdAt: string }; profile: { name: string } }[];
  topPlaces: { name: string; count: number }[];
}

function formatDuration(min: number | null) {
  if (!min) return null;
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}min`;
}

function formatDate(s: string) {
  const d = new Date(s);
  const today = new Date();
  const diff = Math.floor((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return `Oggi · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  if (diff === 1) return `Ieri · ${d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" })}`;
  return d.toLocaleDateString("it-IT", { weekday: "short", day: "numeric", month: "short" });
}

export default function DiarioPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    fromName: "", toName: "", mode: "car" as TravelMode,
    distanceKm: "", durationMin: "", note: "", startedAt: new Date().toISOString().slice(0, 16),
  });

  const { data: tripsData = [], isLoading } = useQuery<TripRow[]>({ queryKey: ["/api/trips"] });
  const { data: memory } = useQuery<Memory>({ queryKey: ["/api/trips/memory"] });

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/trips", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips/memory"] });
      setShowForm(false);
      setForm({ fromName: "", toName: "", mode: "car", distanceKm: "", durationMin: "", note: "", startedAt: new Date().toISOString().slice(0, 16) });
      toast({ title: "Percorso salvato!" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/trips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      queryClient.invalidateQueries({ queryKey: ["/api/trips/memory"] });
    },
  });

  const handleSubmit = () => {
    if (!form.fromName.trim() || !form.toName.trim()) {
      toast({ title: "Inserisci partenza e arrivo", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      fromName: form.fromName.trim(),
      toName: form.toName.trim(),
      mode: form.mode,
      distanceKm: form.distanceKm ? parseFloat(form.distanceKm) : undefined,
      durationMin: form.durationMin ? parseInt(form.durationMin) : undefined,
      note: form.note.trim() || undefined,
      startedAt: new Date(form.startedAt).toISOString(),
    });
  };

  const topPlaces = (memory?.topPlaces ?? []);
  const aiMemoryLines = useMemo(() => {
    const lines = [];
    if ((topPlaces ?? []).length > 0) lines.push(`📍 Luoghi frequenti: ${(topPlaces ?? []).slice(0, 3).map(p => p.name).join(", ")}`);
    if (((memory?.trips ?? [])?.length ?? 0) > 0) {
      const routes = new Set((memory?.trips ?? []).map(r => `${r.trip.fromName} → ${r.trip.toName}`));
      lines.push(`🚗 Percorsi ricorrenti: ${[...routes].slice(0, 2).join(", ")}`);
    }
    if (lines.length === 0) lines.push("Nessun dato ancora — aggiungi i tuoi primi percorsi!");
    return lines;
  }, [memory, topPlaces]);

  const inputCls = "w-full rounded-xl border border-stone-200 bg-stone-50 px-4 py-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30";

  return (
    <div className="flex flex-col min-h-0 flex-1 overflow-y-auto" style={{ background: "#f8f7f5" }}>
      {/* Header */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-[22px] font-bold text-stone-900">📔 Diario Percorsi</h1>
          <button
            onClick={() => setShowForm(p => !p)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all"
            style={{ background: "var(--color-primary)" }}
            data-testid="button-add-trip"
          >
            <Plus size={15} /> Nuovo
          </button>
        </div>
        <p className="text-[13px] text-stone-500">I percorsi salvati alimentano la memoria dell'AI</p>
      </div>

      {/* AI Memory box */}
      <div className="mx-5 mb-4 rounded-2xl p-4" style={{ background: "linear-gradient(135deg, var(--color-surface) 0%, #1e3050 100%)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} className="text-white opacity-70" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-white/50">Memoria AI</span>
        </div>
        {aiMemoryLines.map((line, i) => (
          <p key={i} className="text-[13px] text-white/85 leading-relaxed">{line}</p>
        ))}
      </div>

      {/* Form aggiungi percorso */}
      {showForm && (
        <div className="mx-5 mb-4 bg-white rounded-2xl p-4 shadow-sm border border-stone-100">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[15px] font-semibold text-stone-800">Nuovo percorso</span>
            <button onClick={() => setShowForm(false)} className="text-stone-400 hover:text-stone-600">
              <X size={18} />
            </button>
          </div>

          {/* Mezzo di trasporto */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
            {(Object.entries(MODE_META) as [TravelMode, typeof MODE_META[TravelMode]][]).map(([key, meta]) => {
              const Icon = meta.icon;
              return (
                <button
                  key={key}
                  onClick={() => setForm(p => ({ ...p, mode: key }))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap flex-shrink-0 transition-all ${form.mode === key ? "text-white" : "bg-stone-100 text-stone-600"}`}
                  style={form.mode === key ? { backgroundColor: meta.color } : undefined}
                  data-testid={`mode-${key}`}
                >
                  <Icon size={12} /> {meta.label}
                </button>
              );
            })}
          </div>

          <div className="space-y-2.5">
            <input className={inputCls} placeholder="Da (partenza)" value={form.fromName}
              onChange={e => setForm(p => ({ ...p, fromName: e.target.value }))} data-testid="input-from" />
            <input className={inputCls} placeholder="A (arrivo)" value={form.toName}
              onChange={e => setForm(p => ({ ...p, toName: e.target.value }))} data-testid="input-to" />
            <div className="flex gap-2">
              <input className={inputCls} placeholder="km" type="number" min="0" step="0.1" value={form.distanceKm}
                onChange={e => setForm(p => ({ ...p, distanceKm: e.target.value }))} data-testid="input-distance" />
              <input className={inputCls} placeholder="minuti" type="number" min="0" value={form.durationMin}
                onChange={e => setForm(p => ({ ...p, durationMin: e.target.value }))} data-testid="input-duration" />
            </div>
            <input className={inputCls} type="datetime-local" value={form.startedAt}
              onChange={e => setForm(p => ({ ...p, startedAt: e.target.value }))} data-testid="input-date" />
            <input className={inputCls} placeholder="Note (opzionale)" value={form.note}
              onChange={e => setForm(p => ({ ...p, note: e.target.value }))} data-testid="input-note" />
          </div>

          <button
            onClick={handleSubmit}
            disabled={createMutation.isPending}
            className="mt-3 w-full py-2.5 rounded-xl text-sm font-semibold text-white active:scale-95 transition-all disabled:opacity-50"
            style={{ background: "var(--color-primary)" }}
            data-testid="button-save-trip"
          >
            {createMutation.isPending ? "Salvo…" : "Salva percorso"}
          </button>
        </div>
      )}

      {/* Top places */}
      {(topPlaces ?? []).length > 0 && (
        <div className="px-5 mb-4">
          <p className="text-[12px] font-semibold text-stone-400 uppercase tracking-widest mb-2">Luoghi frequenti</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {(topPlaces ?? []).slice(0, 8).map((place, i) => (
              <div key={i} className="flex items-center gap-1.5 bg-white border border-stone-200 rounded-full px-3 py-1.5 flex-shrink-0">
                <MapPin size={11} className="text-red-400" />
                <span className="text-xs font-medium text-stone-700">{place.name}</span>
                <span className="text-[10px] text-stone-400">×{place.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trip list */}
      <div className="px-5 pb-6">
        <p className="text-[12px] font-semibold text-stone-400 uppercase tracking-widest mb-3">Percorsi recenti</p>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-20 bg-white rounded-2xl animate-pulse border border-stone-100" />
            ))}
          </div>
        )}

        {!isLoading && tripsData.length === 0 && (
          <div className="text-center py-12 text-stone-400">
            <Route size={32} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">Nessun percorso ancora</p>
            <p className="text-xs mt-1">Tocca "Nuovo" per registrare il primo!</p>
          </div>
        )}

        <div className="space-y-3">
          {tripsData.map(({ trip, profile: p }) => {
            const modeMeta = MODE_META[(trip.mode as TravelMode) ?? "car"] ?? MODE_META.car;
            const ModeIcon = modeMeta.icon;
            return (
              <div key={trip.id} className="bg-white rounded-2xl border border-stone-100 p-4 shadow-sm" data-testid={`trip-${trip.id}`}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${modeMeta.color}15` }}>
                      <ModeIcon size={18} style={{ color: modeMeta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[15px] font-semibold text-stone-800 leading-tight">
                        <span className="truncate max-w-[100px]">{trip.fromName}</span>
                        <ChevronRight size={14} className="text-stone-400 flex-shrink-0" />
                        <span className="truncate max-w-[100px]">{trip.toName}</span>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-stone-400">
                        <span>{formatDate(trip.startedAt)}</span>
                        {trip.distanceKm && <span className="flex items-center gap-0.5"><Route size={9} />{trip.distanceKm.toFixed(1)} km</span>}
                        {trip.durationMin && <span className="flex items-center gap-0.5"><Clock size={9} />{formatDuration(trip.durationMin)}</span>}
                      </div>
                      {trip.note && <p className="text-xs text-stone-500 mt-1 italic">"{trip.note}"</p>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                    <div
                      className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                      style={{ backgroundColor: p.colorHex || "var(--color-primary)" }}
                    >
                      {p.name.charAt(0)}
                    </div>
                    {p.id === profile?.id && (
                      <button
                        onClick={() => deleteMutation.mutate(trip.id)}
                        className="text-stone-300 hover:text-red-400 transition-colors"
                        data-testid={`delete-trip-${trip.id}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
