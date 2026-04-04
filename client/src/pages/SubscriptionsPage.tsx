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
  Card, CardContent,
} from "@/components/ui/card";
import {
  Tv, Music, Gamepad2, Smartphone, Cloud, Dumbbell, BookOpen, Newspaper, ShoppingBag, Heart, Wifi, Zap, Plus, Trash2, CreditCard, Check, X,
} from "lucide-react";
import type { Subscription } from "@shared/schema";

const ICON_OPTIONS = [
  { id: "tv", label: "TV", Icon: Tv },
  { id: "music", label: "Musica", Icon: Music },
  { id: "gamepad", label: "Giochi", Icon: Gamepad2 },
  { id: "smartphone", label: "App", Icon: Smartphone },
  { id: "cloud", label: "Cloud", Icon: Cloud },
  { id: "dumbbell", label: "Palestra", Icon: Dumbbell },
  { id: "book", label: "Libri", Icon: BookOpen },
  { id: "newspaper", label: "Notizie", Icon: Newspaper },
  { id: "shopping-bag", label: "Shopping", Icon: ShoppingBag },
  { id: "heart", label: "Salute", Icon: Heart },
  { id: "wifi", label: "Internet", Icon: Wifi },
  { id: "zap", label: "Utenze", Icon: Zap },
];

const COLOR_OPTIONS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
];

const CYCLE_LABELS: Record<string, string> = {
  monthly: "/mese",
  yearly: "/anno",
  weekly: "/sett.",
};

function iconForId(id: string) {
  return ICON_OPTIONS.find(o => o.id === id)?.Icon || Tv;
}

function formatEur(n: number) {
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

export default function SubscriptionsPage() {
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [newSub, setNewSub] = useState({
    name: "",
    amount: "",
    billingCycle: "monthly",
    renewalDate: "",
    color: COLOR_OPTIONS[4],
    icon: "tv",
  });

  const { data: subs, isLoading } = useQuery<Subscription[]>({
    queryKey: ["/api/subscriptions"],
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/subscriptions", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      setShowAdd(false);
      setNewSub({
        name: "",
        amount: "",
        billingCycle: "monthly",
        renewalDate: "",
        color: COLOR_OPTIONS[4],
        icon: "tv",
      });
      toast({ title: "Abbonamento aggiunto" });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      apiRequest("PATCH", `/api/subscriptions/${id}`, { active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/subscriptions/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/subscriptions"] });
      toast({ title: "Abbonamento eliminato" });
    },
  });

  const activeSubs = subs?.filter(s => s.active) ?? [];
  const inactiveSubs = subs?.filter(s => !s.active) ?? [];

  const totalMonthly = activeSubs.reduce((sum, s) => {
    const amt = parseFloat(String(s.amount));
    let monthly = amt;
    if (s.billingCycle === "yearly") monthly = amt / 12;
    if (s.billingCycle === "weekly") monthly = amt * 4;
    return sum + monthly;
  }, 0);

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24">
      <div className="p-4 space-y-4">
        <Card className="bg-primary text-primary-foreground">
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <p className="text-xs font-medium opacity-70 uppercase">Costo mensile stimato</p>
                <h2 className="text-3xl font-bold" data-testid="text-total-monthly">
                  {formatEur(totalMonthly)}
                </h2>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium opacity-70 uppercase">Attivi</p>
                <p className="text-2xl font-bold" data-testid="text-active-count">
                  {activeSubs.length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : subs && subs.length > 0 ? (
          <>
            {activeSubs.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase text-muted-foreground px-1">Attivi</h3>
                {activeSubs.map(sub => <SubscriptionCard key={sub.id} sub={sub} onToggle={toggleMutation.mutate} onDelete={deleteMutation.mutate} />)}
              </div>
            )}
            {inactiveSubs.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase text-muted-foreground px-1">Sospesi</h3>
                {inactiveSubs.map(sub => <SubscriptionCard key={sub.id} sub={sub} onToggle={toggleMutation.mutate} onDelete={deleteMutation.mutate} />)}
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>Nessun abbonamento</p>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-20"
        data-testid="fab-add-subscription"
      >
        <Plus className="w-6 h-6" />
      </button>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>Nuovo abbonamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome</Label>
              <Input
                placeholder="es. Netflix, Spotify..."
                value={newSub.name}
                onChange={e => setNewSub(p => ({ ...p, name: e.target.value }))}
                data-testid="input-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Importo (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newSub.amount}
                  onChange={e => setNewSub(p => ({ ...p, amount: e.target.value }))}
                  data-testid="input-amount"
                />
              </div>
              <div>
                <Label>Ciclo</Label>
                <Select
                  value={newSub.billingCycle}
                  onValueChange={v => setNewSub(p => ({ ...p, billingCycle: v }))}
                >
                  <SelectTrigger data-testid="select-billing-cycle">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Mensile</SelectItem>
                    <SelectItem value="yearly">Annuale</SelectItem>
                    <SelectItem value="weekly">Settimanale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Data rinnovo (opzionale)</Label>
              <Input
                type="date"
                value={newSub.renewalDate}
                onChange={e => setNewSub(p => ({ ...p, renewalDate: e.target.value }))}
                data-testid="input-renewal-date"
              />
            </div>
            <div>
              <Label>Icona</Label>
              <div className="grid grid-cols-6 gap-2 mt-1">
                {ICON_OPTIONS.map(({ id, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setNewSub(p => ({ ...p, icon: id }))}
                    className={`p-2 rounded-lg border-2 flex items-center justify-center ${newSub.icon === id ? "border-primary bg-primary/10" : "border-transparent hover:bg-accent"}`}
                    data-testid={`icon-${id}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Colore</Label>
              <div className="flex gap-2 mt-1">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewSub(p => ({ ...p, color: c }))}
                    className={`w-6 h-6 rounded-full border-2 ${newSub.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    data-testid={`color-${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annulla</Button>
            <Button
              onClick={() => addMutation.mutate({
                ...newSub,
                amount: parseFloat(newSub.amount),
                renewalDate: newSub.renewalDate || null,
              })}
              disabled={!newSub.name || !newSub.amount || addMutation.isPending}
              data-testid="button-save"
            >
              Salva
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SubscriptionCard({ sub, onToggle, onDelete }: { sub: Subscription; onToggle: any; onDelete: any }) {
  const Icon = iconForId(sub.icon);
  return (
    <div className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 group" data-testid={`subscription-card-${sub.id}`}>
      <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: sub.color + "20" }}>
        <Icon className="w-5 h-5" style={{ color: sub.color }} />
      </div>
      <div className="flex-1 min-w-0">
        <h4 className="text-sm font-semibold truncate">{sub.name}</h4>
        <p className="text-xs text-muted-foreground">
          <span className="font-bold text-foreground">{formatEur(parseFloat(String(sub.amount)))}</span>
          {CYCLE_LABELS[sub.billingCycle]}
        </p>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onToggle({ id: sub.id, active: !sub.active })}
          className={`p-2 rounded-lg transition-colors ${sub.active ? "text-primary hover:bg-primary/10" : "text-muted-foreground hover:bg-accent"}`}
          data-testid={`button-toggle-${sub.id}`}
        >
          {sub.active ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
        </button>
        <button
          onClick={() => onDelete(sub.id)}
          className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          data-testid={`button-delete-${sub.id}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
