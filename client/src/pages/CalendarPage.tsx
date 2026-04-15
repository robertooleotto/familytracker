import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft, ChevronRight, Plus, Clock, Trash2, Calendar,
  MapPin, Loader2, Sparkles, BarChart2, List, AlignJustify, Users, X, Check,
} from "lucide-react";
import type { Event, Profile } from "@shared/schema";
import {
  format, addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  startOfWeek, endOfWeek, startOfDay, parseISO, isSameDay, isToday,
} from "date-fns";
import { it } from "date-fns/locale";
import AgendaView from "./calendar/AgendaView";
import MonthView from "./calendar/MonthView";
import WeekView from "./calendar/WeekView";
import MemberView from "./calendar/MemberView";
import { CATEGORIES, ALL_CATEGORIES, categoryIcon, formatDuration, type CategoryKey } from "./calendar/constants";

// ── Types ────────────────────────────────────────────────────────────────────
interface EventWithDetails extends Event {
  assignedProfiles?: Profile[];
}
type View = "agenda" | "month" | "week" | "member";

const REMINDER_OPTIONS = [
  { value: "0", label: "Nessuno" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 ora" },
  { value: "1440", label: "1 giorno" },
];

// ── Main component ───────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  // View state
  const [view, setView]           = useState<View>("agenda");
  const [cursor, setCursor]       = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Filters
  const [activeCategories, setActiveCategories]       = useState<string[]>(ALL_CATEGORIES);
  const [activeMembers, setActiveMembers] = useState<string[]>([]);

  // Form
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    title: "", description: "", startAt: "", endAt: "",
    color: "#3B82F6", reminderMin: 30, assignedTo: [] as string[],
    category: "family", allDay: false, locationName: "",
  });

  // AI NLP
  const [nlpText, setNlpText]     = useState("");
  const [nlpResult, setNlpResult] = useState<any>(null);
  const [nlpOpen, setNlpOpen]     = useState(false);

  // Event detail
  const [detailEvent, setDetailEvent] = useState<EventWithDetails | null>(null);

  // Queries
  const { data: events, isLoading } = useQuery<EventWithDetails[]>({
    queryKey: ["/api/events"],
    refetchInterval: 30000,
  });
  const { data: members } = useQuery<Profile[]>({ queryKey: ["/api/family/members"] });

  // Filtered events
  const filtered = useMemo(() => {
    if (!events) return [];
    return events.filter(e => {
      const cat = e.category || "other";
      const okCat = activeCategories.includes(cat) || activeCategories.includes(cat);
      const okMem = activeMembers.length === 0 || (e.assignedTo || []).some(id => activeMembers.includes(id));
      return okCat && okMem;
    });
  }, [events, activeCategories, activeMembers]);

  // Mutations
  const addMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const r = await apiRequest("POST", "/api/events", {
        ...data,
        startAt: data.startAt, endAt: data.endAt || null,
        locationName: data.locationName || null,
      });
      return r.json();
    },
    onSuccess: (created) => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setShowAdd(false);
      resetForm();
      toast({ title: "Evento creato!" });
      // Background AI analysis
      apiRequest("POST", "/api/calendar/analyze", { event: created }).then(r => r.json()).then(result => {
        if (result?.conflicts?.length > 0 && result.conflicts[0]?.description) {
          toast({ title: "⚠️ Conflitto rilevato", description: result.conflicts[0].description });
        }
        if (result?.study_slots?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ["/api/events"] });
          toast({ title: "📚 Slot di studio aggiunti dall'AI" });
        }
      }).catch(() => {});
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/events/${id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/events"] });
      setDetailEvent(null);
      toast({ title: "Evento eliminato" });
    },
  });

  const nlpMutation = useMutation({
    mutationFn: async (text: string) => {
      const r = await apiRequest("POST", "/api/calendar/parse", { text });
      return r.json();
    },
    onSuccess: (result) => {
      setNlpResult(result);
      setNlpOpen(true);
    },
    onError: () => toast({ title: "Errore", description: "Parsing non riuscito", variant: "destructive" }),
  });

  // Helpers
  const resetForm = () => setForm({
    title: "", description: "", startAt: "", endAt: "",
    color: "#3B82F6", reminderMin: 30, assignedTo: [],
    category: "family", allDay: false, locationName: "",
  });

  const openAdd = (d?: Date) => {
    const base = d || selectedDate;
    const dt = format(base, "yyyy-MM-dd");
    setForm(f => ({ ...f, startAt: `${dt}T09:00`, endAt: `${dt}T10:00` }));
    setShowAdd(true);
  };

  const confirmNlp = () => {
    if (!nlpResult) return;
    const startAt = `${nlpResult.date}T${nlpResult.time || "09:00"}`;
    const endMinutes = (nlpResult.duration_min ?? 60);
    const endDate = new Date(startAt);
    endDate.setMinutes(endDate.getMinutes() + endMinutes);
    const endAt = format(endDate, "yyyy-MM-dd'T'HH:mm");
    setForm({
      title: nlpResult.title || "",
      description: "",
      startAt, endAt,
      color: "#3B82F6",
      reminderMin: nlpResult.reminder_min ?? 30,
      assignedTo: nlpResult.assigned_to || [],
      category: nlpResult.category || "family",
      allDay: false,
      locationName: nlpResult.location_name || "",
    });
    setNlpOpen(false);
    setNlpText("");
    setShowAdd(true);
  };

  // Navigation
  const prev = () => {
    if (view === "month") setCursor(subMonths(cursor, 1));
    else if (view === "week") { setCursor(subWeeks(cursor, 1)); setSelectedDate(subWeeks(cursor, 1)); }
    else { const d = subDays(cursor, 1); setCursor(d); setSelectedDate(d); }
  };
  const next = () => {
    if (view === "month") setCursor(addMonths(cursor, 1));
    else if (view === "week") { setCursor(addWeeks(cursor, 1)); setSelectedDate(addWeeks(cursor, 1)); }
    else { const d = addDays(cursor, 1); setCursor(d); setSelectedDate(d); }
  };
  const goToday = () => { const t = new Date(); setCursor(t); setSelectedDate(t); };

  const navLabel = (() => {
    if (view === "month") return format(cursor, "MMMM yyyy", { locale: it });
    if (view === "week") {
      const ws = startOfWeek(cursor, { weekStartsOn: 1 });
      const we = endOfWeek(cursor, { weekStartsOn: 1 });
      return `${format(ws, "d MMM", { locale: it })} – ${format(we, "d MMM", { locale: it })}`;
    }
    if (view === "agenda") return format(cursor, "MMMM yyyy", { locale: it });
    return "Membro";
  })();

  // Toggle helpers (memoized)
  const toggleCat = useCallback((cat: string) => {
    if (cat === "all") { setActiveCategories(activeCategories.length === ALL_CATEGORIES.length ? [] : [...ALL_CATEGORIES]); return; }
    setActiveCategories(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]);
  }, [activeCategories]);

  const toggleMember = useCallback((id: string) =>
    setActiveMembers(p => p.includes(id) ? p.filter(m => m !== id) : [...p, id]), []);

  // Memoized view handlers
  const handleAddDay = useCallback((d?: Date) => openAdd(d), [selectedDate]);
  const handleEventTap = useCallback((e: any) => setDetailEvent(e), []);
  const handleDaySelect = useCallback((d: Date) => setSelectedDate(d), []);

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden">
      <style>{`
        .no-scrollbar::-webkit-scrollbar{display:none}
        .no-scrollbar{-ms-overflow-style:none;scrollbar-width:none}
        @keyframes todayPulse{0%,100%{box-shadow:0 0 0 3px rgba(232,83,58,.2)}50%{box-shadow:0 0 0 6px rgba(232,83,58,0)}}
      `}</style>

      {/* ── Header ── */}
      <div className="px-4 pt-5 pb-0 space-y-3 flex-shrink-0">

        {/* View switcher + nav */}
        <div className="flex items-center gap-2">
          <div className="flex-1 flex gap-0.5 rounded-xl p-0.5" style={{ background: "var(--color-bg-grouped)" }}>
            {([
              { v: "agenda" as View, icon: List,       label: "Agenda" },
              { v: "month"  as View, icon: Calendar,   label: "Mese" },
              { v: "week"   as View, icon: AlignJustify,label: "Sett." },
              { v: "member" as View, icon: Users,       label: "Membro" },
            ] as const).map(({ v, icon: Icon, label }) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="flex-1 flex flex-col items-center justify-center py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                style={view === v ? { background: "var(--color-surface)", color: "white", boxShadow: "var(--shadow-sm)" } : { color: "var(--color-text-tertiary)" }}
                data-testid={`view-${v}`}
                aria-label={`Visualizza ${label}`}
                aria-pressed={view === v}
              >
                <Icon className="w-3.5 h-3.5 mb-0.5" />
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => openAdd()}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0"
            style={{ background: "var(--color-primary)", boxShadow: "var(--shadow-primary)" }}
            data-testid="button-add-event"
            aria-label="Aggiungi nuovo evento"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Nav row (not member view) */}
        {view !== "member" && (
          <div className="flex items-center justify-between">
            <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--color-bg-grouped)" }} aria-label="Mese precedente">
              <ChevronLeft className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
            </button>
            <p className="text-sm font-bold capitalize" style={{ color: "var(--color-text-primary)" }}>{navLabel}</p>
            <div className="flex items-center gap-1">
              <button onClick={goToday} className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: "var(--color-bg-grouped)", color: "var(--color-primary)" }}>
                Oggi
              </button>
              <button onClick={next} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--color-bg-grouped)" }} aria-label="Mese successivo">
                <ChevronRight className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
              </button>
            </div>
          </div>
        )}

        {/* ── Category filter chips ── */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          <button
            onClick={() => toggleCat("all")}
            className="px-3 py-1 rounded-full text-[12px] font-semibold flex-shrink-0 transition-all"
            style={activeCategories.length === ALL_CATEGORIES.length
              ? { background: "var(--color-surface)", color: "white" }
              : { background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }
            }
            data-testid="filter-cat-all"
          >Tutte</button>
          {ALL_CATEGORIES.filter(k => k !== "other").map(cat => {
            const active = activeCategories.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                className="px-2.5 py-1 rounded-full text-[12px] font-semibold flex-shrink-0 flex items-center gap-1 transition-all"
                style={active
                  ? { background: `var(${CATEGORIES[cat].cssVar})`, color: "white" }
                  : { background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }
                }
                data-testid={`filter-cat-${cat}`}
              >
                <span>{CATEGORIES[cat].icon}</span>
                {CATEGORIES[cat].label}
              </button>
            );
          })}
        </div>

        {/* ── Member filter avatars ── */}
        {(members ?? []).length > 0 && (
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {(members ?? []).map(m => {
              const active = activeMembers.includes(m.id);
              return (
                <button
                  key={m.id}
                  onClick={() => toggleMember(m.id)}
                  className="flex flex-col items-center gap-0.5 flex-shrink-0 transition-all active:scale-95"
                  data-testid={`filter-member-${m.id}`}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
                    style={{
                      backgroundColor: m.colorHex || "var(--color-primary)",
                      opacity: active || activeMembers.length === 0 ? 1 : 0.35,
                      border: active ? `2px solid var(--color-surface)` : "2px solid transparent",
                    }}
                  >
                    {m.name.charAt(0)}
                  </div>
                  <span className="text-[10px] font-medium" style={{ color: active ? "var(--color-text-primary)" : "var(--color-text-tertiary)" }}>
                    {m.name.split(" ")[0]}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* ── AI NLP input ── */}
        <div className="relative flex items-center gap-2 pb-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={nlpText}
              onChange={e => setNlpText(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" && nlpText.trim()) nlpMutation.mutate(nlpText.trim()); }}
              placeholder="Scrivi un evento… (es. dentista Marco giovedì)"
              className="w-full rounded-xl py-2.5 pl-9 pr-3 text-[13px] focus:outline-none"
              style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-primary)", border: ".5px solid var(--color-border)" }}
              data-testid="input-nlp"
              aria-label="Input evento con parsing AI"
            />
            <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--color-primary)" }} />
          </div>
          <button
            onClick={() => nlpText.trim() && nlpMutation.mutate(nlpText.trim())}
            disabled={!nlpText.trim() || nlpMutation.isPending}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40"
            style={{ background: "var(--color-primary)" }}
            aria-label="Analizza evento con AI"
          >
            {nlpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto no-scrollbar pb-6">

        {/* ═══ AGENDA ═══ */}
        {view === "agenda" && (
          <AgendaView
            events={filtered}
            members={members || []}
            isLoading={isLoading}
            onEventTap={handleEventTap}
            onAddDay={handleAddDay}
            currentProfileId={profile?.id}
          />
        )}

        {/* ═══ MESE ═══ */}
        {view === "month" && (
          <MonthView
            cursor={cursor}
            events={filtered}
            members={members || []}
            selectedDate={selectedDate}
            onDaySelect={handleDaySelect}
            onEventTap={handleEventTap}
            onAddDay={handleAddDay}
            isLoading={isLoading}
            currentProfileId={profile?.id}
          />
        )}

        {/* ═══ SETTIMANA ═══ */}
        {view === "week" && (
          <WeekView
            cursor={cursor}
            events={filtered}
            members={members || []}
            selectedDate={selectedDate}
            onDaySelect={handleDaySelect}
            onEventTap={handleEventTap}
            onAddDay={handleAddDay}
            isLoading={isLoading}
          />
        )}

        {/* ═══ MEMBRO ═══ */}
        {view === "member" && (
          <MemberView
            events={filtered}
            members={members || []}
            onEventTap={handleEventTap}
            isLoading={isLoading}
          />
        )}
      </div>

      {/* ── Add event dialog ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuovo evento</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <div>
              <Label className="text-xs" htmlFor="event-title">Titolo *</Label>
              <Input
                id="event-title"
                placeholder="Es. Allenamento calcio"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                data-testid="input-event-title"
                aria-required="true"
              />
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span>{CATEGORIES[form.category as CategoryKey]?.icon}</span>
                      {CATEGORIES[form.category as CategoryKey]?.label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORIES).filter(([k]) => k !== "other").map(([k, v]) => (
                    <SelectItem key={k} value={k}>
                      <span className="flex items-center gap-2">{v.icon} {v.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="allday"
                checked={form.allDay}
                onCheckedChange={c => setForm({ ...form, allDay: !!c })}
                aria-label="Evento che occupa tutto il giorno"
              />
              <label htmlFor="allday" className="text-sm">Tutto il giorno</label>
            </div>
            {!form.allDay && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Inizio</Label>
                  <Input type="datetime-local" value={form.startAt} onChange={e => setForm({ ...form, startAt: e.target.value })} data-testid="input-event-start" />
                </div>
                <div>
                  <Label className="text-xs">Fine</Label>
                  <Input type="datetime-local" value={form.endAt} onChange={e => setForm({ ...form, endAt: e.target.value })} />
                </div>
              </div>
            )}
            {form.allDay && (
              <div>
                <Label className="text-xs">Data</Label>
                <Input type="date" value={form.startAt.slice(0, 10)} onChange={e => setForm({ ...form, startAt: `${e.target.value}T00:00`, endAt: `${e.target.value}T23:59` })} />
              </div>
            )}
            <div>
              <Label className="text-xs">Luogo (opzionale)</Label>
              <Input
                placeholder="Es. Piazza della Repubblica"
                value={form.locationName}
                onChange={e => setForm({ ...form, locationName: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Textarea placeholder="Note opzionali…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
            <div>
              <Label className="text-xs">Promemoria</Label>
              <Select value={String(form.reminderMin)} onValueChange={v => setForm({ ...form, reminderMin: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {REMINDER_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {members && members.length > 0 && (
              <div>
                <Label className="text-xs mb-2 block">Partecipanti</Label>
                <div className="space-y-2">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`p-${m.id}`}
                        checked={form.assignedTo.includes(m.id)}
                        onCheckedChange={checked => setForm({
                          ...form,
                          assignedTo: checked
                            ? [...form.assignedTo, m.id]
                            : form.assignedTo.filter(id => id !== m.id)
                        })}
                      />
                      <div className="w-5 h-5 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ backgroundColor: m.colorHex }}>
                        {m.name.charAt(0)}
                      </div>
                      <label htmlFor={`p-${m.id}`} className="text-sm">{m.name}</label>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <Button
              className="w-full"
              onClick={() => addMutation.mutate(form)}
              disabled={addMutation.isPending || !form.title || !form.startAt}
              style={{ background: "var(--color-primary)" }}
              aria-label={addMutation.isPending ? "Salvataggio in corso..." : "Crea evento"}
            >
              {addMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              {addMutation.isPending ? "Salvataggio…" : "Crea evento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── NLP Preview dialog ── */}
      <Dialog open={nlpOpen} onOpenChange={setNlpOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>✦ Evento rilevato dall'AI</DialogTitle>
          </DialogHeader>
          {nlpResult && (
            <div className="space-y-3">
              <div className="rounded-xl p-4 space-y-2" style={{ background: "var(--color-bg-grouped)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-xl">{categoryIcon(nlpResult.category)}</span>
                  <span className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>{nlpResult.title}</span>
                </div>
                <div className="text-sm space-y-1" style={{ color: "var(--color-text-secondary)" }}>
                  <p>📅 {nlpResult.date} alle {nlpResult.time || "09:00"}</p>
                  <p>⏱ {nlpResult.duration_min ?? 60} min</p>
                  {nlpResult.location_name && <p>📍 {nlpResult.location_name}</p>}
                  <p>Categoria: {CATEGORIES[nlpResult.category as CategoryKey]?.label || nlpResult.category}</p>
                  {nlpResult.ai_will_add_study_slots && (
                    <p className="text-xs" style={{ color: "var(--color-primary)" }}>📚 L'AI aggiungerà slot di studio</p>
                  )}
                </div>
                <div className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                  Confidenza: {Math.round((nlpResult.confidence ?? 0) * 100)}%
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setNlpOpen(false)}>Modifica</Button>
                <Button className="flex-1" onClick={confirmNlp} style={{ background: "var(--color-primary)" }}>
                  <Check className="w-4 h-4 mr-1" /> Conferma
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Event detail panel ── */}
      {detailEvent && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "rgba(26,37,53,.5)" }}
          onClick={() => setDetailEvent(null)}
        >
          <div
            className="w-full rounded-t-3xl p-5 space-y-4"
            style={{ background: "var(--color-bg-elevated)" }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: `var(${CATEGORIES[(detailEvent.category || "other") as CategoryKey].cssVar})`, minHeight: 48 }} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span>{categoryIcon(detailEvent.category)}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }}>
                    {CATEGORIES[(detailEvent.category || "other") as CategoryKey]?.label}
                  </span>
                  {detailEvent.aiSuggested && (
                    <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--ai-badge-bg)", color: "var(--ai-badge-text)" }}>AI</span>
                  )}
                </div>
                <h3 className="text-xl font-bold" style={{ color: "var(--color-text-primary)" }}>{detailEvent.title}</h3>
                {detailEvent.description && <p className="text-sm mt-1" style={{ color: "var(--color-text-secondary)" }}>{detailEvent.description}</p>}
              </div>
              <button onClick={() => setDetailEvent(null)} className="p-1" style={{ color: "var(--color-text-tertiary)" }}><X className="w-5 h-5" /></button>
            </div>

            <div className="space-y-2 text-sm" style={{ color: "var(--color-text-secondary)" }}>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 flex-shrink-0" />
                <span>{formatDuration(new Date(detailEvent.startAt), detailEvent.endAt ? new Date(detailEvent.endAt) : null)}</span>
                {detailEvent.allDay && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "var(--color-bg-grouped)" }}>Tutto il giorno</span>}
              </div>
              {detailEvent.locationName && (
                <div className="flex items-center gap-2">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span>{detailEvent.locationName}</span>
                </div>
              )}
              {detailEvent.departureTime && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2 py-1 rounded-full" style={{ background: "var(--depart-badge-bg)", color: "var(--depart-badge-text)" }}>
                    🚗 Parti alle {detailEvent.departureTime}
                  </span>
                </div>
              )}
            </div>

            {(members || []).filter(m => (detailEvent.assignedTo || []).includes(m.id)).length > 0 && (
              <div className="flex gap-2">
                {(members || []).filter(m => (detailEvent.assignedTo || []).includes(m.id)).map(m => (
                  <div key={m.id} className="flex items-center gap-1.5">
                    <div className="w-6 h-6 rounded-full text-white text-xs flex items-center justify-center font-bold" style={{ backgroundColor: m.colorHex }}>
                      {m.name.charAt(0)}
                    </div>
                    <span className="text-sm" style={{ color: "var(--color-text-secondary)" }}>{m.name.split(" ")[0]}</span>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={() => { if (confirm("Eliminare questo evento?")) deleteMutation.mutate(detailEvent.id); }}
              className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{ background: "var(--color-error-bg)", color: "var(--color-error)" }}
              data-testid={`delete-event-${detailEvent.id}`}
              aria-label="Elimina questo evento"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Elimina evento
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
