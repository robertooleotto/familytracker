import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Star, Plus, Trash2, CheckCircle, Award, Trophy,
  Sparkles, RefreshCw, CalendarDays, CalendarRange, Calendar,
  Clock, User, X, Check,
} from "lucide-react";
import type { Task, Profile, Reward } from "@shared/schema";

type TaskWithProfile = Task & { assignedProfile: Profile | null };
type RewardWithProfile = Reward & { profile: Profile };

type Recurrence = "daily" | "weekly" | "monthly" | "once";

interface AISuggestion {
  title: string;
  description: string;
  recurrence: Recurrence;
  suggestedAssigneeName: string | null;
  suggestedAssigneeId: string | null;
  points: number;
  reason: string;
}

const RECURRENCE_LABELS: Record<Recurrence, string> = {
  daily: "Giornaliero",
  weekly: "Settimanale",
  monthly: "Mensile",
  once: "Una tantum",
};

const RECURRENCE_ICON: Record<Recurrence, typeof Clock> = {
  daily: CalendarDays,
  weekly: CalendarRange,
  monthly: Calendar,
  once: Clock,
};

const RECURRENCE_COLOR: Record<Recurrence, string> = {
  daily: "#10B981",
  weekly: "#3B82F6",
  monthly: "#8B5CF6",
  once: "#F59E0B",
};

const RECURRENCE_SECTIONS: { key: Recurrence; label: string; emoji: string }[] = [
  { key: "daily",   label: "Giornalieri",  emoji: "☀️" },
  { key: "weekly",  label: "Settimanali",  emoji: "📅" },
  { key: "monthly", label: "Mensili",      emoji: "🗓️" },
  { key: "once",    label: "Da fare",      emoji: "✏️" },
];

export default function TasksPage() {
  const { profile: myProfile } = useAuth();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [activeTab, setActiveTab] = useState<"tasks" | "rewards">("tasks");
  const [showAI, setShowAI] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestion[]>([]);
  const [rejectedIdxs, setRejectedIdxs] = useState<Set<number>>(new Set());
  const [form, setForm] = useState({
    assignedTo: "none",
    title: "",
    description: "",
    points: 10,
    recurrence: "once" as Recurrence,
  });

  const { data: members } = useQuery<Profile[]>({ queryKey: ["/api/family/members"] });
  const { data: tasks, isLoading } = useQuery<TaskWithProfile[]>({ queryKey: ["/api/tasks"] });
  const { data: rewards } = useQuery<RewardWithProfile[]>({ queryKey: ["/api/rewards"] });

  const isParent = myProfile?.role === "parent" || myProfile?.role === "guardian";
  const canAdd = true;

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks", {
        ...form,
        assignedTo: (form.assignedTo && form.assignedTo !== "none") ? form.assignedTo : null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setShowAdd(false);
      setForm({ assignedTo: "none", title: "", description: "", points: 10, recurrence: "once" });
      toast({ title: "Compito aggiunto!" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const claimMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/tasks/${id}/claim`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "✋ Compito preso in carico!" });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/tasks/${id}/complete`, {}),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }); toast({ title: "✅ Completato! In attesa di verifica." }); },
  });

  const verifyMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("POST", `/api/tasks/${id}/verify`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      queryClient.invalidateQueries({ queryKey: ["/api/rewards"] });
      toast({ title: "⭐ Punti assegnati!" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => apiRequest("DELETE", `/api/tasks/${id}`, undefined),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const aiSuggestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/tasks/ai-suggest", {});
      return res.json();
    },
    onSuccess: (data) => {
      setAiSuggestions(data.tasks || []);
      setRejectedIdxs(new Set());
      setShowAI(true);
    },
    onError: (e: Error) => toast({ title: "Errore AI", description: e.message, variant: "destructive" }),
  });

  const acceptSuggestionMutation = useMutation({
    mutationFn: async (s: AISuggestion) => {
      const res = await apiRequest("POST", "/api/tasks", {
        title: s.title,
        description: s.description,
        recurrence: s.recurrence,
        assignedTo: s.suggestedAssigneeId || null,
        points: s.points,
      });
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] }),
  });

  const pendingTasks = tasks?.filter(t => !t.completedAt) || [];
  const completedTasks = tasks?.filter(t => t.completedAt && !t.verifiedBy) || [];
  const verifiedTasks = tasks?.filter(t => t.verifiedBy) || [];
  const myPoints = rewards?.find(r => r.profileId === myProfile?.id)?.pointsTotal || 0;

  function getGroupTasks(recurrence: Recurrence) {
    return pendingTasks.filter(t => (t.recurrence || "once") === recurrence);
  }

  function TaskCard({ t }: { t: TaskWithProfile }) {
    const recurrence = (t.recurrence || "once") as Recurrence;
    const RecIcon = RECURRENCE_ICON[recurrence];
    const color = RECURRENCE_COLOR[recurrence];
    const isOpen = !t.assignedTo;
    const isMine = t.assignedTo === myProfile?.id;

    return (
      <div className="p-3 rounded-xl border bg-card" data-testid={`task-${t.id}`}>
        <div className="flex items-start gap-3">
          {isOpen ? (
            <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center bg-slate-100 border-2 border-dashed border-slate-300">
              <User className="w-4 h-4 text-slate-400" />
            </div>
          ) : (
            <div
              className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white"
              style={{ backgroundColor: t.assignedProfile?.colorHex || "#3B82F6" }}
            >
              {t.assignedProfile?.name.charAt(0) || "?"}
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm">{t.title}</p>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              {isOpen ? (
                <span className="text-xs text-slate-400 italic">Aperto a tutti</span>
              ) : (
                <span className="text-xs text-muted-foreground">{t.assignedProfile?.name}</span>
              )}
              <Badge className="text-xs border-0 px-1.5 py-0" style={{ backgroundColor: `${color}20`, color }}>
                <Star className="w-2.5 h-2.5 mr-1" />{t.points} pt
              </Badge>
              <Badge className="text-xs border-0 px-1.5 py-0 bg-slate-100 text-slate-500">
                <RecIcon className="w-2.5 h-2.5 mr-1" />{RECURRENCE_LABELS[recurrence]}
              </Badge>
            </div>
            {t.description && <p className="text-xs text-muted-foreground mt-1">{t.description}</p>}
          </div>

          <div className="flex items-center gap-1 flex-shrink-0">
            {isOpen && (
              <button
                onClick={() => claimMutation.mutate(t.id)}
                disabled={claimMutation.isPending}
                className="px-2 py-1 rounded-lg bg-blue-100 text-blue-700 text-xs font-semibold hover:bg-blue-200 transition-colors"
                data-testid={`claim-task-${t.id}`}
              >
                Me ne occupo io
              </button>
            )}
            {!isOpen && (isMine || isParent) && (
              <button
                onClick={() => completeMutation.mutate(t.id)}
                className="p-1.5 rounded-lg bg-green-100 text-green-600 hover:bg-green-200"
                data-testid={`complete-task-${t.id}`}
              >
                <CheckCircle className="w-4 h-4" />
              </button>
            )}
            {isParent && (
              <button
                onClick={() => deleteMutation.mutate(t.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive"
                data-testid={`delete-task-${t.id}`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Compiti & Premi</h2>
            <p className="text-xs text-muted-foreground">Guadagna punti completando compiti</p>
          </div>
          <div className="flex gap-2">
            {isParent && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => aiSuggestMutation.mutate()}
                disabled={aiSuggestMutation.isPending}
                data-testid="button-ai-suggest"
              >
                {aiSuggestMutation.isPending
                  ? <RefreshCw className="w-4 h-4 animate-spin" />
                  : <Sparkles className="w-4 h-4" />}
                <span className="ml-1 hidden sm:inline">AI</span>
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-task">
              <Plus className="w-4 h-4 mr-1" /> Compito
            </Button>
          </div>
        </div>

        {/* Points card */}
        <div className="bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl p-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-90">I tuoi punti</p>
              <p className="text-3xl font-black">{myPoints}</p>
            </div>
            <Trophy className="w-12 h-12 opacity-25" />
          </div>
          <div className="mt-2 flex gap-2 flex-wrap">
            {rewards?.map(r => (
              <div key={r.profile.id} className="flex items-center gap-1.5 bg-white/20 rounded-full px-2 py-1">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: r.profile.colorHex || "#fff" }} />
                <span className="text-xs font-semibold">{r.profile.name}: {r.pointsTotal}pt</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            onClick={() => setActiveTab("tasks")}
            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${activeTab === "tasks" ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
            data-testid="tab-tasks"
          >
            Compiti {pendingTasks.length > 0 && <span className="ml-1 bg-primary text-primary-foreground rounded-full px-1.5 text-xs">{pendingTasks.length}</span>}
          </button>
          <button
            onClick={() => setActiveTab("rewards")}
            className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${activeTab === "rewards" ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}
            data-testid="tab-rewards"
          >
            Classifica
          </button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-accent/40 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Nuovo compito</h3>

            <div>
              <Label className="text-xs">Frequenza</Label>
              <div className="grid grid-cols-4 gap-1.5 mt-1">
                {(["daily", "weekly", "monthly", "once"] as Recurrence[]).map(r => {
                  const Icon = RECURRENCE_ICON[r];
                  const active = form.recurrence === r;
                  return (
                    <button
                      key={r}
                      onClick={() => setForm({ ...form, recurrence: r })}
                      className={`flex flex-col items-center gap-1 p-2 rounded-lg border text-xs font-medium transition-colors ${active ? "border-primary bg-primary/10 text-primary" : "border-border bg-background text-muted-foreground"}`}
                      data-testid={`recurrence-${r}`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-[10px]">{RECURRENCE_LABELS[r]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <Label className="text-xs">Assegna a (opzionale — lascia vuoto per "aperto a tutti")</Label>
              <Select value={form.assignedTo} onValueChange={v => setForm({ ...form, assignedTo: v })}>
                <SelectTrigger data-testid="select-task-member"><SelectValue placeholder="Chiunque può farlo" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Aperto a tutti</SelectItem>
                  {members?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs">Titolo compito</Label>
              <Input
                placeholder="es. Riordina la camera, Porta fuori il cane"
                value={form.title}
                onChange={e => setForm({ ...form, title: e.target.value })}
                data-testid="input-task-title"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Descrizione</Label>
                <Input placeholder="Dettagli…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div>
                <Label className="text-xs">Punti premio</Label>
                <Select value={String(form.points)} onValueChange={v => setForm({ ...form, points: Number(v) })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[5, 10, 15, 20, 30, 50].map(p => <SelectItem key={p} value={String(p)}>{p} pt</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                onClick={() => addMutation.mutate()}
                disabled={!form.title || addMutation.isPending}
                data-testid="button-submit-task"
              >
                {addMutation.isPending ? "Salvataggio…" : "Aggiungi compito"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Annulla</Button>
            </div>
          </div>
        )}

        {/* AI Suggestion Panel */}
        {showAI && aiSuggestions.length > 0 && (
          <div className="rounded-xl border border-violet-200 bg-violet-50 dark:border-violet-800 dark:bg-violet-900/20 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-violet-200 dark:border-violet-800">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600" />
                <span className="text-sm font-semibold text-violet-800 dark:text-violet-300">Suggerimenti AI</span>
                <span className="text-xs text-violet-500">basati sulla vostra routine</span>
              </div>
              <button onClick={() => setShowAI(false)} className="text-violet-400 hover:text-violet-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-2 max-h-[400px] overflow-y-auto">
              {aiSuggestions.map((s, i) => {
                const rejected = rejectedIdxs.has(i);
                const RecIcon = RECURRENCE_ICON[s.recurrence as Recurrence] || Clock;
                const color = RECURRENCE_COLOR[s.recurrence as Recurrence] || "#8B5CF6";
                return (
                  <div
                    key={i}
                    className={`p-3 rounded-lg bg-white dark:bg-slate-800 border transition-opacity ${rejected ? "opacity-40 border-slate-200" : "border-violet-100"}`}
                    data-testid={`ai-suggestion-${i}`}
                  >
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-semibold text-sm">{s.title}</p>
                          <Badge className="text-xs border-0 px-1.5 py-0" style={{ backgroundColor: `${color}20`, color }}>
                            <RecIcon className="w-2.5 h-2.5 mr-1" />{RECURRENCE_LABELS[s.recurrence as Recurrence] || s.recurrence}
                          </Badge>
                          <Badge className="text-xs border-0 px-1.5 py-0 bg-amber-100 text-amber-700">
                            <Star className="w-2.5 h-2.5 mr-1" />{s.points} pt
                          </Badge>
                        </div>
                        {s.suggestedAssigneeName && (
                          <p className="text-xs text-muted-foreground mt-0.5">→ {s.suggestedAssigneeName}</p>
                        )}
                        <p className="text-xs text-violet-600 dark:text-violet-400 mt-1 italic">{s.reason}</p>
                      </div>
                      {!rejected && (
                        <div className="flex gap-1 flex-shrink-0">
                          <button
                            onClick={() => {
                              acceptSuggestionMutation.mutate(s);
                              setRejectedIdxs(prev => new Set([...prev, i]));
                              toast({ title: `"${s.title}" aggiunto!` });
                            }}
                            className="p-1.5 rounded-lg bg-green-100 text-green-600 hover:bg-green-200"
                            data-testid={`accept-suggestion-${i}`}
                          >
                            <Check className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setRejectedIdxs(prev => new Set([...prev, i]))}
                            className="p-1.5 rounded-lg bg-slate-100 text-slate-500 hover:bg-slate-200"
                            data-testid={`reject-suggestion-${i}`}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Content */}
        {isLoading ? (
          <div className="space-y-2">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
        ) : activeTab === "tasks" ? (
          <div className="space-y-5">

            {/* Grouped pending tasks */}
            {RECURRENCE_SECTIONS.map(({ key, label, emoji }) => {
              const group = getGroupTasks(key);
              if (group.length === 0) return null;
              return (
                <div key={key}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                    {emoji} {label}
                  </h3>
                  <div className="space-y-2">
                    {group.map(t => <TaskCard key={t.id} t={t} />)}
                  </div>
                </div>
              );
            })}

            {/* Awaiting verification */}
            {completedTasks.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">⏳ In attesa di verifica</h3>
                <div className="space-y-2">
                  {completedTasks.map(t => (
                    <div key={t.id} className="p-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20" data-testid={`completed-task-${t.id}`}>
                      <div className="flex items-center gap-3">
                        <div
                          className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold text-white opacity-70"
                          style={{ backgroundColor: t.assignedProfile?.colorHex || "#3B82F6" }}
                        >
                          {t.assignedProfile?.name.charAt(0) || "?"}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{t.assignedProfile?.name} • {t.points} pt</p>
                        </div>
                        {isParent && (
                          <Button
                            size="sm"
                            className="bg-amber-500 hover:bg-amber-600 text-white flex-shrink-0"
                            onClick={() => verifyMutation.mutate(t.id)}
                            disabled={verifyMutation.isPending}
                            data-testid={`verify-task-${t.id}`}
                          >
                            <Award className="w-4 h-4 mr-1" /> Verifica
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Verified */}
            {verifiedTasks.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-green-600 uppercase tracking-wide mb-2">✅ Completati</h3>
                <div className="space-y-2">
                  {verifiedTasks.slice(0, 5).map(t => (
                    <div key={t.id} className="p-3 rounded-xl border border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20 opacity-80" data-testid={`verified-task-${t.id}`}>
                      <div className="flex items-center gap-3">
                        <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm line-through text-muted-foreground">{t.title}</p>
                          <p className="text-xs text-muted-foreground">{t.assignedProfile?.name} • +{t.points} pt</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {pendingTasks.length === 0 && completedTasks.length === 0 && verifiedTasks.length === 0 && (
              <div className="text-center py-12 text-muted-foreground">
                <Star className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="font-medium text-sm">Nessun compito</p>
                <p className="text-xs mt-1">Tocca "+ Compito" in alto per aggiungere il primo compito</p>
              </div>
            )}
          </div>
        ) : (
          /* Classifica */
          <div className="space-y-3">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Classifica punti</h3>
            {rewards && rewards.length > 0 ? (
              [...rewards].sort((a, b) => b.pointsTotal - a.pointsTotal).map((r, i) => (
                <div
                  key={r.profileId}
                  className={`p-4 rounded-xl border ${r.profileId === myProfile?.id ? "border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-900/20" : "border-border bg-card"}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl font-black text-muted-foreground w-8 text-center">{i + 1}</span>
                    <div
                      className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-bold"
                      style={{ backgroundColor: r.profile.colorHex || "#3B82F6" }}
                    >
                      {r.profile.name.charAt(0)}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold">{r.profile.name}</p>
                      <p className="text-xs text-muted-foreground capitalize">{r.profile.role}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xl font-black text-amber-500">{r.pointsTotal}</p>
                      <p className="text-xs text-muted-foreground">punti</p>
                    </div>
                  </div>
                  {r.pointsTotal > 0 && (
                    <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-amber-400 rounded-full transition-all"
                        style={{ width: `${Math.min(100, (r.pointsTotal / (Math.max(...rewards.map(x => x.pointsTotal)) || 1)) * 100)}%` }}
                      />
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="text-center py-10 text-muted-foreground">
                <Trophy className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Nessun punto ancora. Completa i compiti!</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
