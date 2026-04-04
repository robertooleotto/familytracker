import { useState, useMemo } from "react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ChevronLeft, ChevronRight, Plus, Clock, Trash2, Calendar,
  MapPin, Loader2, Sparkles, BarChart2, List, AlignJustify, Users, X, Check,
} from "lucide-react";
import type { Event, Profile } from "@shared/schema";
import {
  format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay,
  addMonths, subMonths, isToday, parseISO, startOfWeek, endOfWeek,
  addWeeks, subWeeks, addDays, subDays, getHours, getMinutes,
  isFuture, isPast, startOfDay, endOfDay, isWithinInterval,
} from "date-fns";
import { it } from "date-fns/locale";

// ── Types ────────────────────────────────────────────────────────────────────
interface EventWithDetails extends Event {
  assignedProfiles?: Profile[];
}
type View = "agenda" | "month" | "week" | "member";
type CatKey = "school" | "sport" | "work" | "health" | "family" | "personal" | "other";

// ── Category system ──────────────────────────────────────────────────────────
const CATS: Record<string, { label: string; cssVar: string; icon: string }> = {
  school:   { label: "Scuola",    cssVar: "--cal-school",   icon: "🎓" },
  sport:    { label: "Sport",     cssVar: "--cal-sport",    icon: "⚽" },
  work:     { label: "Lavoro",    cssVar: "--cal-work",     icon: "💼" },
  health:   { label: "Salute",    cssVar: "--cal-health",   icon: "🏥" },
  family:   { label: "Famiglia",  cssVar: "--cal-family",   icon: "🏠" },
  personal: { label: "Personale", cssVar: "--cal-personal", icon: "⭐" },
  other:    { label: "Altro",     cssVar: "--cal-other",    icon: "📌" },
};
const ALL_CATS = Object.keys(CATS);
function catColor(cat?: string | null): string {
  const k = (cat || "other") in CATS ? (cat as string) : "other";
  return `var(${CATS[k].cssVar})`;
}
function catIcon(cat?: string | null): string {
  const k = (cat || "other") in CATS ? (cat as string) : "other";
  return CATS[k].icon;
}

const IT_DAYS_SHORT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];
const HOUR_SLOTS    = Array.from({ length: 16 }, (_, i) => i + 7); // 7–22
const REMINDER_OPTIONS = [
  { value: "0", label: "Nessuno" },
  { value: "15", label: "15 min" },
  { value: "30", label: "30 min" },
  { value: "60", label: "1 ora" },
  { value: "1440", label: "1 giorno" },
];

function fmtOra(d: Date) { return format(d, "HH:mm"); }
function fmtDurata(start: Date, end: Date | null | undefined) {
  if (!end) return fmtOra(start);
  return `${fmtOra(start)} – ${fmtOra(end)}`;
}

// ── Main component ───────────────────────────────────────────────────────────
export default function CalendarPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  // View state
  const [view, setView]           = useState<View>("agenda");
  const [cursor, setCursor]       = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // Filters
  const [activeCats, setActiveCats]       = useState<string[]>(ALL_CATS);
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
      const okCat = activeCats.includes(cat) || activeCats.includes(cat);
      const okMem = activeMembers.length === 0 || (e.assignedTo || []).some(id => activeMembers.includes(id));
      return okCat && okMem;
    });
  }, [events, activeCats, activeMembers]);

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

  const getForDay = (d: Date) =>
    filtered.filter(e => isSameDay(parseISO(String(e.startAt)), d));

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

  // Toggle helpers
  const toggleCat = (cat: string) => {
    if (cat === "all") { setActiveCats(activeCats.length === ALL_CATS.length ? [] : [...ALL_CATS]); return; }
    setActiveCats(p => p.includes(cat) ? p.filter(c => c !== cat) : [...p, cat]);
  };
  const toggleMember = (id: string) =>
    setActiveMembers(p => p.includes(id) ? p.filter(m => m !== id) : [...p, id]);

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
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Nav row (not member view) */}
        {view !== "member" && (
          <div className="flex items-center justify-between">
            <button onClick={prev} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--color-bg-grouped)" }}>
              <ChevronLeft className="w-4 h-4" style={{ color: "var(--color-text-secondary)" }} />
            </button>
            <p className="text-sm font-bold capitalize" style={{ color: "var(--color-text-primary)" }}>{navLabel}</p>
            <div className="flex items-center gap-1">
              <button onClick={goToday} className="text-[11px] px-2.5 py-1 rounded-full font-medium" style={{ background: "var(--color-bg-grouped)", color: "var(--color-primary)" }}>
                Oggi
              </button>
              <button onClick={next} className="w-8 h-8 flex items-center justify-center rounded-full" style={{ background: "var(--color-bg-grouped)" }}>
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
            style={activeCats.length === ALL_CATS.length
              ? { background: "var(--color-surface)", color: "white" }
              : { background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }
            }
            data-testid="filter-cat-all"
          >Tutte</button>
          {ALL_CATS.filter(k => k !== "other").map(cat => {
            const active = activeCats.includes(cat);
            return (
              <button
                key={cat}
                onClick={() => toggleCat(cat)}
                className="px-2.5 py-1 rounded-full text-[12px] font-semibold flex-shrink-0 flex items-center gap-1 transition-all"
                style={active
                  ? { background: `var(${CATS[cat].cssVar})`, color: "white" }
                  : { background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }
                }
                data-testid={`filter-cat-${cat}`}
              >
                <span>{CATS[cat].icon}</span>
                {CATS[cat].label}
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
            />
            <Sparkles className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--color-primary)" }} />
          </div>
          <button
            onClick={() => nlpText.trim() && nlpMutation.mutate(nlpText.trim())}
            disabled={!nlpText.trim() || nlpMutation.isPending}
            className="w-9 h-9 rounded-xl flex items-center justify-center text-white flex-shrink-0 disabled:opacity-40"
            style={{ background: "var(--color-primary)" }}
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
            onEventTap={setDetailEvent}
            onAddDay={openAdd}
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
            onDaySelect={(d) => setSelectedDate(d)}
            onEventTap={setDetailEvent}
            onAddDay={openAdd}
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
            onDaySelect={(d) => { setSelectedDate(d); }}
            onEventTap={setDetailEvent}
            onAddDay={openAdd}
            isLoading={isLoading}
          />
        )}

        {/* ═══ MEMBRO ═══ */}
        {view === "member" && (
          <MemberView
            events={filtered}
            members={members || []}
            onEventTap={setDetailEvent}
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
              <Label className="text-xs">Titolo *</Label>
              <Input
                placeholder="Es. Allenamento calcio"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                data-testid="input-event-title"
              />
            </div>
            <div>
              <Label className="text-xs">Categoria</Label>
              <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                <SelectTrigger>
                  <SelectValue>
                    <span className="flex items-center gap-2">
                      <span>{CATS[form.category]?.icon}</span>
                      {CATS[form.category]?.label}
                    </span>
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(CATS).filter(([k]) => k !== "other").map(([k, v]) => (
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
                  <span className="text-xl">{catIcon(nlpResult.category)}</span>
                  <span className="font-semibold text-base" style={{ color: "var(--color-text-primary)" }}>{nlpResult.title}</span>
                </div>
                <div className="text-sm space-y-1" style={{ color: "var(--color-text-secondary)" }}>
                  <p>📅 {nlpResult.date} alle {nlpResult.time || "09:00"}</p>
                  <p>⏱ {nlpResult.duration_min ?? 60} min</p>
                  {nlpResult.location_name && <p>📍 {nlpResult.location_name}</p>}
                  <p>Categoria: {CATS[nlpResult.category]?.label || nlpResult.category}</p>
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
              <div className="w-1 self-stretch rounded-full" style={{ backgroundColor: catColor(detailEvent.category), minHeight: 48 }} />
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span>{catIcon(detailEvent.category)}</span>
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }}>
                    {CATS[detailEvent.category || "other"]?.label}
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
                <span>{fmtDurata(new Date(detailEvent.startAt), detailEvent.endAt ? new Date(detailEvent.endAt) : null)}</span>
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

// ── AGENDA VIEW ──────────────────────────────────────────────────────────────
function AgendaView({ events, members, isLoading, onEventTap, onAddDay, currentProfileId }: {
  events: EventWithDetails[]; members: Profile[]; isLoading: boolean;
  onEventTap: (e: EventWithDetails) => void; onAddDay: (d: Date) => void; currentProfileId?: string;
}) {
  if (isLoading) return <div className="px-4 space-y-2 pt-4">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;

  const sorted = [...events].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  // Group by day
  const groups: { date: Date; items: EventWithDetails[] }[] = [];
  for (const e of sorted) {
    const d = startOfDay(new Date(e.startAt));
    const g = groups.find(g => isSameDay(g.date, d));
    if (g) g.items.push(e);
    else groups.push({ date: d, items: [e] });
  }

  // Show 60 days forward from today
  const today = startOfDay(new Date());
  const upcoming = groups.filter(g => !isPast(g.date) || isSameDay(g.date, today)).slice(0, 30);
  const past     = groups.filter(g => isPast(g.date) && !isSameDay(g.date, today)).slice(-3).reverse();

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
            {isToday(g.date) ? "Oggi" : format(g.date, "EEEE d MMMM", { locale: it })}
          </span>
          {isToday(g.date) && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "var(--color-primary)" }}>OGGI</span>
          )}
        </div>
        <button onClick={() => onAddDay(g.date)} className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-tertiary)" }}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-4 space-y-2 pb-3">
        {g.items.map(e => <KinlyEventCard key={e.id} event={e} members={members} onTap={onEventTap} currentProfileId={currentProfileId} />)}
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

// ── MONTH VIEW ───────────────────────────────────────────────────────────────
function MonthView({ cursor, events, members, selectedDate, onDaySelect, onEventTap, onAddDay, isLoading, currentProfileId }: {
  cursor: Date; events: EventWithDetails[]; members: Profile[]; selectedDate: Date;
  onDaySelect: (d: Date) => void; onEventTap: (e: EventWithDetails) => void;
  onAddDay: (d: Date) => void; isLoading: boolean; currentProfileId?: string;
}) {
  const days = eachDayOfInterval({ start: startOfMonth(cursor), end: endOfMonth(cursor) });
  const getForDay = (d: Date) => events.filter(e => isSameDay(parseISO(String(e.startAt)), d));
  const leadingDays = (startOfMonth(cursor).getDay() + 6) % 7;

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
              onClick={() => onDaySelect(day)}
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
                    <div key={i} className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: sel || tod ? "rgba(255,255,255,.7)" : catColor(e.category) }} />
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
            onClick={() => onAddDay(selectedDate)}
            className="w-8 h-8 rounded-full flex items-center justify-center"
            style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }}
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>
        {isLoading ? <Skeleton className="h-16 rounded-2xl" /> : (
          <div className="space-y-2">
            {getForDay(selectedDate).length === 0
              ? <p className="text-sm text-center py-4" style={{ color: "var(--color-text-tertiary)" }}>Nessun evento</p>
              : getForDay(selectedDate).map(e => <KinlyEventCard key={e.id} event={e} members={members} onTap={onEventTap} currentProfileId={currentProfileId} />)
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── WEEK VIEW ────────────────────────────────────────────────────────────────
function WeekView({ cursor, events, members, selectedDate, onDaySelect, onEventTap, onAddDay, isLoading }: {
  cursor: Date; events: EventWithDetails[]; members: Profile[]; selectedDate: Date;
  onDaySelect: (d: Date) => void; onEventTap: (e: EventWithDetails) => void;
  onAddDay: (d: Date) => void; isLoading: boolean;
}) {
  const weekDays = eachDayOfInterval({
    start: startOfWeek(cursor, { weekStartsOn: 1 }),
    end:   endOfWeek(cursor, { weekStartsOn: 1 }),
  });
  const dayEvs = events.filter(e => isSameDay(parseISO(String(e.startAt)), selectedDate))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());

  const HOUR_H = 50;

  const evPos = (e: EventWithDetails) => {
    const s = new Date(e.startAt);
    const startMin = (getHours(s) - 7) * 60 + getMinutes(s);
    const endDate  = e.endAt ? new Date(e.endAt) : new Date(s.getTime() + 60 * 60000);
    const endMin   = (getHours(endDate) - 7) * 60 + getMinutes(endDate);
    const top    = (startMin / 60) * HOUR_H;
    const height = Math.max(((endMin - startMin) / 60) * HOUR_H, 24);
    return { top, height };
  };

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
              onClick={() => onDaySelect(day)}
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
        <button onClick={() => onAddDay(selectedDate)} className="w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }}>
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Hourly timeline */}
      {isLoading ? <Skeleton className="h-40 rounded-2xl" /> : (
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
                  background: `${catColor(e.category)}18`,
                  borderLeft: `3px solid ${catColor(e.category)}`,
                }}
                onClick={() => onEventTap(e)}
                data-testid={`week-event-${e.id}`}
              >
                <div className="px-2 py-1">
                  <p className="text-[12px] font-semibold truncate" style={{ color: "var(--color-text-primary)" }}>{e.title}</p>
                  {height > 32 && (
                    <p className="text-[11px]" style={{ color: catColor(e.category) }}>{fmtOra(new Date(e.startAt))}</p>
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

// ── MEMBER VIEW ──────────────────────────────────────────────────────────────
function MemberView({ events, members, onEventTap, isLoading }: {
  events: EventWithDetails[]; members: Profile[];
  onEventTap: (e: EventWithDetails) => void; isLoading: boolean;
}) {
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

  return (
    <div className="px-4 pt-2 space-y-4">
      {/* Member selector */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar py-1">
        {members.map(m => {
          const sel = m.id === selectedMember;
          return (
            <button key={m.id} onClick={() => setSelectedMember(m.id)} className="flex flex-col items-center gap-1.5 flex-shrink-0 active:scale-95 transition-transform" data-testid={`member-sel-${m.id}`}>
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
                <span className="text-sm w-16 flex-shrink-0" style={{ color: "rgba(255,255,255,.7)" }}>{CATS[cat]?.label || cat}</span>
                <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,.1)" }}>
                  <div className="h-full rounded-full" style={{ width: `${(count / stats.total) * 100}%`, background: `var(${CATS[cat]?.cssVar || "--cal-other"})` }} />
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
        {isLoading ? <Skeleton className="h-16 rounded-2xl" /> : (
          <div className="space-y-2">
            {memberEvs.filter(e => !isPast(new Date(e.startAt))).length === 0
              ? <p className="text-sm text-center py-6" style={{ color: "var(--color-text-tertiary)" }}>Nessun evento</p>
              : memberEvs.filter(e => !isPast(new Date(e.startAt))).slice(0, 20).map(e => (
                  <KinlyEventCard key={e.id} event={e} members={[]} onTap={onEventTap} showDate />
                ))
            }
          </div>
        )}
      </div>
    </div>
  );
}

// ── KINLY EVENT CARD ─────────────────────────────────────────────────────────
function KinlyEventCard({ event, members, onTap, showDate, currentProfileId }: {
  event: EventWithDetails; members: Profile[];
  onTap: (e: EventWithDetails) => void; showDate?: boolean; currentProfileId?: string;
}) {
  const assigned = members.filter(m => (event.assignedTo || []).includes(m.id));
  const cc = catColor(event.category);

  // ── Ruolo dell'utente corrente in questo evento ──
  const participants: Array<{ member_id: string; role: string; autonomous?: boolean }> = (event as any).participants || [];
  const myParticipant = currentProfileId ? participants.find(p => p.member_id === currentProfileId) : null;
  const isDriver = myParticipant?.role === "driver";
  const isSupport = myParticipant?.role === "support";
  const hasGap = ((event as any).gaps || []).includes("driver_missing");

  // Orario di partenza dal campo derived o departureTime
  const derived: any = (event as any).derived || {};
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
                  {fmtDurata(new Date(event.startAt), event.endAt ? new Date(event.endAt) : null)}
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
