import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Cake, Heart, Star, Plus, Trash2, Calendar, Clock,
} from "lucide-react";
import type { Anniversary } from "@shared/schema";
import { format, addYears, isBefore, setYear, differenceInDays, differenceInYears, parseISO } from "date-fns";
import { it } from "date-fns/locale/it";

function getNextOccurrence(date: Date) {
  const now = new Date();
  const year = now.getFullYear();
  let next = setYear(date, year);
  if (isBefore(next, now) && format(next, "MM-dd") !== format(now, "MM-dd")) {
    next = setYear(date, year + 1);
  }
  return next;
}

export default function AnniversariesPage() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newAnn, setNewAnn] = useState({
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    type: "birthday",
    reminderDaysBefore: "3",
  });

  const { data: anniversaries, isLoading } = useQuery<Anniversary[]>({
    queryKey: ["/api/anniversaries"],
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/anniversaries", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anniversaries"] });
      setShowAdd(false);
      setNewAnn({
        title: "",
        date: format(new Date(), "yyyy-MM-dd"),
        type: "birthday",
        reminderDaysBefore: "3",
      });
      toast({ title: "Ricorrenza aggiunta" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/anniversaries/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/anniversaries"] });
      toast({ title: "Ricorrenza eliminata" });
    },
  });

  const processed = anniversaries?.map(ann => {
    const date = new Date(ann.date);
    const next = getNextOccurrence(date);
    const daysUntil = differenceInDays(next, new Date());
    return { ...ann, dateObj: date, nextOccurrence: next, daysUntil };
  }).sort((a, b) => a.daysUntil - b.daysUntil) || [];

  const upcoming = processed.filter(a => a.daysUntil <= 30);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "birthday": return <Cake className="w-4 h-4 text-pink-500" />;
      case "anniversary": return <Heart className="w-4 h-4 text-red-500" />;
      default: return <Star className="w-4 h-4 text-yellow-500" />;
    }
  };

  const getTypeEmoji = (type: string) => {
    switch (type) {
      case "birthday": return "🎂";
      case "anniversary": return "💍";
      default: return "⭐";
    }
  };

  const getCountdownColor = (days: number) => {
    if (days <= 3) return "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400";
    if (days <= 7) return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
  };

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-20">
      <div className="p-4 border-b bg-card">
        <h1 className="text-xl font-bold">Anniversari e Compleanni</h1>
      </div>

      {isLoading ? (
        <div className="p-4 space-y-4">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : processed.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground px-4 text-center">
          <Cake className="w-16 h-16 mb-4 opacity-20" />
          <p className="text-lg font-medium">Nessuna ricorrenza</p>
          <p className="text-sm">Aggiungi compleanni e anniversari per non dimenticarli.</p>
        </div>
      ) : (
        <div className="p-4 space-y-6">
          {upcoming.length > 0 && (
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">In arrivo</h2>
              <div className="space-y-3">
                {upcoming.map(ann => (
                  <div key={ann.id} className="bg-card border rounded-xl p-3 flex items-center gap-3 shadow-sm">
                    <div className="w-10 h-10 rounded-full bg-accent flex items-center justify-center flex-shrink-0">
                      {getTypeIcon(ann.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="font-semibold truncate">{ann.title}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${getCountdownColor(ann.daysUntil)}`}>
                          tra {ann.daysUntil} {ann.daysUntil === 1 ? "giorno" : "giorni"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Calendar className="w-3 h-3" />
                        {format(ann.nextOccurrence, "d MMMM", { locale: it })}
                        {ann.type === "birthday" && (
                          <span className="ml-1">• {differenceInYears(ann.nextOccurrence, ann.dateObj)} anni</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3">Tutte le ricorrenze</h2>
            <div className="space-y-2">
              {processed.map(ann => (
                <div key={ann.id} className="bg-card border rounded-xl p-3 flex items-center gap-3 group" data-testid={`anniversary-item-${ann.id}`}>
                  <span className="text-xl flex-shrink-0">{getTypeEmoji(ann.type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{ann.title}</p>
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground capitalize">
                        {format(ann.dateObj, "d MMMM", { locale: it })}
                      </span>
                      {ann.reminderDaysBefore > 0 && (
                        <span className="text-[10px] flex items-center gap-1 text-muted-foreground bg-accent/50 px-1.5 py-0.5 rounded">
                          <Clock className="w-2.5 h-2.5" />
                          -{ann.reminderDaysBefore}d
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => deleteMutation.mutate(ann.id)}
                    className="p-2 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 text-destructive transition-all"
                    data-testid={`button-delete-${ann.id}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-20"
        data-testid="button-add-anniversary"
      >
        <Plus className="w-6 h-6" />
      </button>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>Nuova ricorrenza</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Titolo</Label>
              <Input
                placeholder="es. Compleanno di Marco"
                value={newAnn.title}
                onChange={e => setNewAnn(p => ({ ...p, title: e.target.value }))}
                className="mt-1.5"
                data-testid="input-title"
              />
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={newAnn.date}
                onChange={e => setNewAnn(p => ({ ...p, date: e.target.value }))}
                className="mt-1.5"
                data-testid="input-date"
              />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={newAnn.type}
                onValueChange={v => setNewAnn(p => ({ ...p, type: v }))}
              >
                <SelectTrigger className="mt-1.5" data-testid="select-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="birthday">Compleanno</SelectItem>
                  <SelectItem value="anniversary">Anniversario</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Promemoria</Label>
              <Select
                value={newAnn.reminderDaysBefore}
                onValueChange={v => setNewAnn(p => ({ ...p, reminderDaysBefore: v }))}
              >
                <SelectTrigger className="mt-1.5" data-testid="select-reminder">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 giorno prima</SelectItem>
                  <SelectItem value="3">3 giorni prima</SelectItem>
                  <SelectItem value="7">7 giorni prima</SelectItem>
                  <SelectItem value="14">14 giorni prima</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annulla</Button>
            <Button
              onClick={() => addMutation.mutate({
                ...newAnn,
                reminderDaysBefore: parseInt(newAnn.reminderDaysBefore)
              })}
              disabled={!newAnn.title || !newAnn.date || addMutation.isPending}
              data-testid="button-save"
            >
              {addMutation.isPending ? "Salvo..." : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
