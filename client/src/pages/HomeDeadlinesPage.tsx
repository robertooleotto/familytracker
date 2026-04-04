import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Home, Plus, Trash2, CheckCircle, AlertCircle, Clock, Calendar } from "lucide-react";
import type { HomeDeadline } from "@shared/schema";

const CATEGORIES = [
  { value: "utility", label: "Utenze", icon: "⚡" },
  { value: "insurance", label: "Assicurazione", icon: "🛡️" },
  { value: "tax", label: "Tasse/Bollo", icon: "📋" },
  { value: "maintenance", label: "Manutenzione", icon: "🔧" },
  { value: "medical", label: "Sanitario", icon: "🏥" },
  { value: "vehicle", label: "Veicolo", icon: "🚗" },
  { value: "subscription", label: "Abbonamento", icon: "📺" },
  { value: "other", label: "Altro", icon: "📌" },
];

export default function HomeDeadlinesPage() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "upcoming" | "done">("upcoming");
  const [form, setForm] = useState({ title: "", dueDate: "", category: "other", reminderDaysBefore: 7, notes: "" });

  const { data: deadlines, isLoading } = useQuery<HomeDeadline[]>({ queryKey: ["/api/deadlines"] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/deadlines", { ...form, dueDate: new Date(form.dueDate).toISOString() });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] });
      setShowAdd(false);
      setForm({ title: "", dueDate: "", category: "other", reminderDaysBefore: 7, notes: "" });
      toast({ title: "Scadenza aggiunta!" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, completed }: { id: string; completed: boolean }) => {
      await apiRequest("PATCH", `/api/deadlines/${id}`, { completed });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/deadlines/${id}`, undefined); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/deadlines"] }); toast({ title: "Scadenza rimossa" }); },
  });

  const getDaysUntil = (date: string | Date) => {
    const diff = new Date(date).getTime() - Date.now();
    return Math.ceil(diff / 86400000);
  };

  const getUrgencyColor = (days: number, completed: boolean) => {
    if (completed) return "text-muted-foreground";
    if (days < 0) return "text-red-600";
    if (days <= 7) return "text-red-500";
    if (days <= 30) return "text-amber-500";
    return "text-green-600";
  };

  const getUrgencyBg = (days: number, completed: boolean) => {
    if (completed) return "bg-muted/50";
    if (days < 0) return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
    if (days <= 7) return "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800";
    if (days <= 30) return "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800";
    return "bg-card border-border";
  };

  const getCatInfo = (v: string) => CATEGORIES.find(c => c.value === v) || { label: v, icon: "📌" };

  const filtered = deadlines?.filter(d => {
    if (filter === "upcoming") return !d.completed;
    if (filter === "done") return d.completed;
    return true;
  }) || [];

  const overdueCount = deadlines?.filter(d => !d.completed && getDaysUntil(d.dueDate) < 0).length || 0;
  const soonCount = deadlines?.filter(d => !d.completed && getDaysUntil(d.dueDate) >= 0 && getDaysUntil(d.dueDate) <= 30).length || 0;

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Scadenze Casa</h2>
            <p className="text-xs text-muted-foreground">Bollo, assicurazioni, bollette…</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-deadline">
            <Plus className="w-4 h-4 mr-1" /> Aggiungi
          </Button>
        </div>

        {/* Summary */}
        {(overdueCount > 0 || soonCount > 0) && (
          <div className="flex gap-2">
            {overdueCount > 0 && (
              <div className="flex-1 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span className="text-xs font-medium text-red-700 dark:text-red-400">{overdueCount} scadut{overdueCount === 1 ? "a" : "e"}</span>
              </div>
            )}
            {soonCount > 0 && (
              <div className="flex-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <span className="text-xs font-medium text-amber-700 dark:text-amber-400">{soonCount} entro 30gg</span>
              </div>
            )}
          </div>
        )}

        {/* Add form */}
        {showAdd && (
          <div className="bg-accent/40 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Nuova scadenza</h3>
            <div>
              <Label className="text-xs">Titolo</Label>
              <Input placeholder="es. Bollo auto, Revisione caldaia" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} data-testid="input-deadline-title" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Data scadenza</Label>
                <Input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} data-testid="input-deadline-date" />
              </div>
              <div>
                <Label className="text-xs">Categoria</Label>
                <Select value={form.category} onValueChange={v => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Promemoria (giorni prima)</Label>
              <Select value={String(form.reminderDaysBefore)} onValueChange={v => setForm({ ...form, reminderDaysBefore: Number(v) })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[1, 3, 7, 14, 30].map(d => <SelectItem key={d} value={String(d)}>{d} giorni prima</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Input placeholder="Importo previsto, dove pagare…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => addMutation.mutate()} disabled={!form.title || !form.dueDate || addMutation.isPending}>
                {addMutation.isPending ? "Salvataggio…" : "Salva"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Annulla</Button>
            </div>
          </div>
        )}

        {/* Filter tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          {(["upcoming", "all", "done"] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)} className={`flex-1 text-xs py-1.5 rounded-md font-medium transition-colors ${filter === f ? "bg-background shadow text-foreground" : "text-muted-foreground"}`}>
              {f === "upcoming" ? "Da fare" : f === "all" ? "Tutte" : "Fatte"}
            </button>
          ))}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : filtered.length > 0 ? (
          <div className="space-y-2">
            {filtered.map(d => {
              const days = getDaysUntil(d.dueDate);
              const cat = getCatInfo(d.category);
              return (
                <div key={d.id} className={`p-3 rounded-xl border transition-all ${getUrgencyBg(days, d.completed)}`} data-testid={`deadline-${d.id}`}>
                  <div className="flex items-start gap-3">
                    <button onClick={() => toggleMutation.mutate({ id: d.id, completed: !d.completed })} className={`mt-0.5 w-5 h-5 rounded-full border-2 flex-shrink-0 flex items-center justify-center transition-colors ${d.completed ? "border-green-500 bg-green-500" : "border-muted-foreground"}`} data-testid={`toggle-deadline-${d.id}`}>
                      {d.completed && <CheckCircle className="w-3.5 h-3.5 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`font-semibold text-sm ${d.completed ? "line-through text-muted-foreground" : ""}`}>{d.title}</span>
                        <Badge variant="outline" className="text-xs">{cat.icon} {cat.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Calendar className="w-3 h-3" />
                          {new Date(d.dueDate).toLocaleDateString("it-IT")}
                        </span>
                        {!d.completed && (
                          <span className={`text-xs font-medium ${getUrgencyColor(days, d.completed)}`}>
                            {days < 0 ? `Scaduta ${Math.abs(days)}gg fa` : days === 0 ? "Oggi!" : `${days} giorni`}
                          </span>
                        )}
                      </div>
                      {d.notes && <p className="text-xs text-muted-foreground mt-1">{d.notes}</p>}
                    </div>
                    <button onClick={() => deleteMutation.mutate(d.id)} className="text-muted-foreground hover:text-destructive p-1 flex-shrink-0" data-testid={`delete-deadline-${d.id}`}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Home className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">{filter === "done" ? "Nessuna scadenza completata" : "Nessuna scadenza in arrivo"}</p>
            <p className="text-xs mt-1">Aggiungi bollo, assicurazioni, revisione caldaia…</p>
          </div>
        )}
      </div>
    </div>
  );
}
