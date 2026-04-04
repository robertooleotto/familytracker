import { useState, useEffect, lazy, Suspense } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter,
} from "@/components/ui/sheet";
import {
  Wallet, Plus, Trash2, ShoppingCart, Car, Utensils, Home,
  Zap, Heart, GraduationCap, Plane, Shirt, Tv, MoreHorizontal,
  TrendingUp, TrendingDown, ChevronRight, Euro, Calendar, Landmark,
} from "lucide-react";
import type { BudgetCategory, Expense, Profile } from "@shared/schema";
import { format, startOfMonth, endOfMonth, subMonths, addMonths } from "date-fns";
import { it } from "date-fns/locale";

const BankingPage = lazy(() => import("./BankingPage"));

type ExpenseWithCategory = Expense & { category: BudgetCategory | null; addedByProfile: Profile | null };

const ICON_OPTIONS = [
  { id: "wallet", label: "Varie", Icon: Wallet },
  { id: "shopping-cart", label: "Spesa", Icon: ShoppingCart },
  { id: "car", label: "Auto", Icon: Car },
  { id: "utensils", label: "Ristoranti", Icon: Utensils },
  { id: "home", label: "Casa", Icon: Home },
  { id: "zap", label: "Utenze", Icon: Zap },
  { id: "heart", label: "Salute", Icon: Heart },
  { id: "graduation-cap", label: "Istruzione", Icon: GraduationCap },
  { id: "plane", label: "Viaggi", Icon: Plane },
  { id: "shirt", label: "Abbigliamento", Icon: Shirt },
  { id: "tv", label: "Intrattenimento", Icon: Tv },
];

const COLOR_OPTIONS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444",
  "#8B5CF6", "#EC4899", "#06B6D4", "#84CC16",
];

function iconForId(id: string) {
  return ICON_OPTIONS.find(o => o.id === id)?.Icon || Wallet;
}

function formatEur(n: number) {
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

export default function BudgetPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [innerTab, setInnerTab] = useState<"spese" | "banca">("spese");
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(new Date()));
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddExpense, setShowAddExpense] = useState(false);
  const [editCategory, setEditCategory] = useState<BudgetCategory | null>(null);

  // Auto-switch to banking tab on OAuth callback
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if ((p.get("code") && p.get("state")) || p.get("error")) {
      setInnerTab("banca");
    }
  }, []);

  const [newCat, setNewCat] = useState({ name: "", budgetAmount: "", color: COLOR_OPTIONS[0], icon: "wallet" });
  const [newExp, setNewExp] = useState({ title: "", amount: "", categoryId: "", date: format(new Date(), "yyyy-MM-dd"), notes: "" });

  const { data: categories, isLoading: loadingCats } = useQuery<BudgetCategory[]>({
    queryKey: ["/api/budget/categories"],
  });
  const { data: allExpenses, isLoading: loadingExp } = useQuery<ExpenseWithCategory[]>({
    queryKey: ["/api/budget/expenses"],
  });

  const monthExpenses = allExpenses?.filter(e => {
    const d = new Date(e.date);
    return d >= currentMonth && d <= endOfMonth(currentMonth);
  }) ?? [];

  const totalBudget = categories?.reduce((s, c) => s + parseFloat(String(c.budgetAmount)), 0) ?? 0;
  const totalSpent = monthExpenses.reduce((s, e) => s + parseFloat(String(e.amount)), 0);
  const totalRemaining = totalBudget - totalSpent;

  function spentForCategory(catId: string) {
    return monthExpenses.filter(e => e.categoryId === catId).reduce((s, e) => s + parseFloat(String(e.amount)), 0);
  }

  const addCategoryMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/budget/categories", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget/categories"] });
      setShowAddCategory(false);
      setNewCat({ name: "", budgetAmount: "", color: COLOR_OPTIONS[0], icon: "wallet" });
      toast({ title: "Categoria aggiunta" });
    },
  });

  const updateCategoryMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: object }) =>
      apiRequest("PATCH", `/api/budget/categories/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget/categories"] });
      setEditCategory(null);
      toast({ title: "Categoria aggiornata" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/budget/categories/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget/categories"] });
      setEditCategory(null);
    },
  });

  const addExpenseMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/budget/expenses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/budget/expenses"] });
      setShowAddExpense(false);
      setNewExp({ title: "", amount: "", categoryId: "", date: format(new Date(), "yyyy-MM-dd"), notes: "" });
      toast({ title: "Spesa registrata" });
    },
  });

  const deleteExpenseMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/budget/expenses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/budget/expenses"] }),
  });

  const isCurrentMonth = currentMonth.getTime() === startOfMonth(new Date()).getTime();

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      {/* ── Tab switcher ── */}
      <div className="flex gap-1 px-4 pt-3 pb-0 sticky top-0 bg-background/95 backdrop-blur z-20">
        <button
          onClick={() => setInnerTab("spese")}
          data-testid="tab-budget-spese"
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-sm font-medium transition-colors border-b-2 ${innerTab === "spese" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Wallet className="w-4 h-4" /> Spese
        </button>
        <button
          onClick={() => setInnerTab("banca")}
          data-testid="tab-budget-banca"
          className={`flex items-center gap-1.5 px-4 py-2 rounded-t-xl text-sm font-medium transition-colors border-b-2 ${innerTab === "banca" ? "border-primary text-primary bg-primary/5" : "border-transparent text-muted-foreground hover:text-foreground"}`}
        >
          <Landmark className="w-4 h-4" /> Conto bancario
        </button>
      </div>

      {/* ── Banking Tab ── */}
      {innerTab === "banca" && (
        <Suspense fallback={<div className="p-4 space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}</div>}>
          <BankingPage />
        </Suspense>
      )}

      {/* ── Spese Tab ── */}
      {innerTab === "spese" && <>

      {/* ── Month selector ── */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-[42px] bg-background/95 backdrop-blur z-10">
        <button
          onClick={() => setCurrentMonth(m => subMonths(m, 1))}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors"
          data-testid="button-prev-month"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
        <span className="text-sm font-semibold capitalize" data-testid="text-current-month">
          {format(currentMonth, "MMMM yyyy", { locale: it })}
        </span>
        <button
          onClick={() => setCurrentMonth(m => addMonths(m, 1))}
          disabled={isCurrentMonth}
          className="p-1.5 rounded-lg hover:bg-accent transition-colors disabled:opacity-40"
          data-testid="button-next-month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Budget summary card ── */}
      <div className="mx-4 mt-4 rounded-2xl p-4 bg-primary text-primary-foreground shadow-lg">
        <p className="text-xs font-medium opacity-70 uppercase tracking-wider mb-1">Budget mensile</p>
        <div className="flex items-end justify-between mb-3">
          <div>
            <p className="text-3xl font-bold tracking-tight" data-testid="text-total-spent">
              {formatEur(totalSpent)}
            </p>
            <p className="text-xs opacity-70 mt-0.5">
              di {formatEur(totalBudget)} pianificati
            </p>
          </div>
          <div className="text-right">
            <div className={`flex items-center gap-1 text-sm font-bold ${totalRemaining >= 0 ? "text-green-300" : "text-red-300"}`}>
              {totalRemaining >= 0 ? <TrendingDown className="w-4 h-4" /> : <TrendingUp className="w-4 h-4" />}
              <span data-testid="text-remaining">{formatEur(Math.abs(totalRemaining))}</span>
            </div>
            <p className="text-[10px] opacity-60 mt-0.5">{totalRemaining >= 0 ? "rimanente" : "sforamento"}</p>
          </div>
        </div>
        <Progress
          value={totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0}
          className="h-2 bg-white/20"
          data-testid="progress-total-budget"
        />
        <div className="flex justify-between mt-1.5 text-[10px] opacity-60">
          <span>{totalBudget > 0 ? Math.round((totalSpent / totalBudget) * 100) : 0}% usato</span>
          <span>{monthExpenses.length} spese</span>
        </div>
      </div>

      {/* ── Categories ── */}
      <div className="px-4 mt-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Categorie</h2>
          <button
            onClick={() => setShowAddCategory(true)}
            className="flex items-center gap-1 text-xs text-primary font-medium"
            data-testid="button-add-category"
          >
            <Plus className="w-3.5 h-3.5" />
            Aggiungi
          </button>
        </div>

        {loadingCats ? (
          <div className="space-y-3">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-[72px] rounded-xl" />)}
          </div>
        ) : categories && categories.length > 0 ? (
          <div className="space-y-2.5">
            {categories.map(cat => {
              const spent = spentForCategory(cat.id);
              const budget = parseFloat(String(cat.budgetAmount));
              const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
              const over = spent > budget && budget > 0;
              const Icon = iconForId(cat.icon);
              return (
                <button
                  key={cat.id}
                  onClick={() => setEditCategory(cat)}
                  className="w-full bg-card border border-border rounded-xl p-3.5 text-left hover:border-primary/40 transition-all group"
                  data-testid={`category-${cat.id}`}
                >
                  <div className="flex items-center gap-3 mb-2.5">
                    <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + "20" }}>
                      <Icon className="w-4.5 h-4.5" style={{ color: cat.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-semibold">{cat.name}</span>
                        <span className={`text-xs font-bold ${over ? "text-red-500" : "text-muted-foreground"}`}>
                          {formatEur(spent)} / {formatEur(budget)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Progress
                    value={pct}
                    className="h-1.5"
                    style={{ "--progress-bg": over ? "#EF4444" : cat.color } as any}
                  />
                  {over && (
                    <p className="text-[10px] text-red-500 font-medium mt-1">
                      Sforamento di {formatEur(spent - budget)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Wallet className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nessuna categoria ancora</p>
            <p className="text-xs mt-1">Aggiungi categorie per pianificare il budget</p>
          </div>
        )}
      </div>

      {/* ── Recent expenses ── */}
      <div className="px-4 mt-5 pb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Spese {format(currentMonth, "MMM", { locale: it })}
          </h2>
          <button
            onClick={() => setShowAddExpense(true)}
            className="flex items-center gap-1 text-xs text-primary font-medium"
            data-testid="button-add-expense"
          >
            <Plus className="w-3.5 h-3.5" />
            Aggiungi
          </button>
        </div>

        {loadingExp ? (
          <div className="space-y-2">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-14 rounded-xl" />)}
          </div>
        ) : monthExpenses.length > 0 ? (
          <div className="space-y-2">
            {monthExpenses.map(exp => {
              const Icon = exp.category ? iconForId(exp.category.icon) : Euro;
              return (
                <div
                  key={exp.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-xl p-3 group"
                  data-testid={`expense-${exp.id}`}
                >
                  <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: (exp.category?.color || "#6B7280") + "20" }}
                  >
                    <Icon className="w-4 h-4" style={{ color: exp.category?.color || "#6B7280" }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{exp.title}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {exp.category && (
                        <span className="text-[10px] font-medium text-muted-foreground">{exp.category.name}</span>
                      )}
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Calendar className="w-2.5 h-2.5" />
                        {format(new Date(exp.date), "d MMM", { locale: it })}
                      </span>
                      {exp.addedByProfile && (
                        <span className="text-[10px] text-muted-foreground">• {exp.addedByProfile.name.split(" ")[0]}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-red-500" data-testid={`expense-amount-${exp.id}`}>
                      -{formatEur(parseFloat(String(exp.amount)))}
                    </span>
                    <button
                      onClick={() => deleteExpenseMutation.mutate(exp.id)}
                      className="p-1 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-destructive/10 transition-all"
                      data-testid={`delete-expense-${exp.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-destructive" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <Euro className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Nessuna spesa questo mese</p>
          </div>
        )}
      </div>

      {/* ── FAB ── */}
      <button
        onClick={() => setShowAddExpense(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-20"
        data-testid="fab-add-expense"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* ── Add Category Dialog ── */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>Nuova categoria</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome categoria</Label>
              <Input
                placeholder="es. Alimentari, Auto…"
                value={newCat.name}
                onChange={e => setNewCat(p => ({ ...p, name: e.target.value }))}
                className="mt-1.5"
                data-testid="input-category-name"
              />
            </div>
            <div>
              <Label>Budget mensile (€)</Label>
              <Input
                type="number"
                placeholder="0,00"
                value={newCat.budgetAmount}
                onChange={e => setNewCat(p => ({ ...p, budgetAmount: e.target.value }))}
                className="mt-1.5"
                data-testid="input-category-budget"
              />
            </div>
            <div>
              <Label>Icona</Label>
              <div className="grid grid-cols-6 gap-2 mt-1.5">
                {ICON_OPTIONS.map(({ id, label, Icon }) => (
                  <button
                    key={id}
                    onClick={() => setNewCat(p => ({ ...p, icon: id }))}
                    className={`p-2 rounded-lg border-2 flex items-center justify-center transition-all ${newCat.icon === id ? "border-primary bg-primary/10" : "border-border hover:border-primary/40"}`}
                    title={label}
                    data-testid={`icon-${id}`}
                  >
                    <Icon className="w-4 h-4" />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <Label>Colore</Label>
              <div className="flex gap-2 mt-1.5">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c}
                    onClick={() => setNewCat(p => ({ ...p, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-all ${newCat.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                    style={{ backgroundColor: c }}
                    data-testid={`color-${c}`}
                  />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCategory(false)}>Annulla</Button>
            <Button
              onClick={() => addCategoryMutation.mutate({ name: newCat.name, budgetAmount: parseFloat(newCat.budgetAmount) || 0, color: newCat.color, icon: newCat.icon })}
              disabled={!newCat.name || addCategoryMutation.isPending}
              data-testid="button-save-category"
            >
              {addCategoryMutation.isPending ? "Salvo…" : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Category Sheet ── */}
      {editCategory && (
        <Sheet open={!!editCategory} onOpenChange={v => { if (!v) setEditCategory(null); }}>
          <SheetContent side="bottom" className="rounded-t-2xl pb-8">
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                {(() => { const I = iconForId(editCategory.icon); return <I className="w-4 h-4" style={{ color: editCategory.color }} />; })()}
                {editCategory.name}
              </SheetTitle>
            </SheetHeader>
            <div className="mt-4 space-y-4">
              <div>
                <Label>Budget mensile (€)</Label>
                <Input
                  type="number"
                  defaultValue={editCategory.budgetAmount}
                  onChange={e => setEditCategory(p => p ? { ...p, budgetAmount: parseFloat(e.target.value) || 0 } : null)}
                  className="mt-1.5"
                  data-testid="input-edit-budget"
                />
              </div>
            </div>
            <SheetFooter className="mt-6 flex flex-row gap-2">
              <Button
                variant="destructive"
                className="flex-1"
                onClick={() => deleteCategoryMutation.mutate(editCategory.id)}
                disabled={deleteCategoryMutation.isPending}
                data-testid="button-delete-category"
              >
                <Trash2 className="w-4 h-4 mr-1.5" />
                Elimina
              </Button>
              <Button
                className="flex-1"
                onClick={() => updateCategoryMutation.mutate({ id: editCategory.id, data: { budgetAmount: editCategory.budgetAmount } })}
                disabled={updateCategoryMutation.isPending}
                data-testid="button-update-category"
              >
                {updateCategoryMutation.isPending ? "Salvo…" : "Aggiorna"}
              </Button>
            </SheetFooter>
          </SheetContent>
        </Sheet>
      )}

      {/* ── Add Expense Sheet ── */}
      <Sheet open={showAddExpense} onOpenChange={setShowAddExpense}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle>Nuova spesa</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Descrizione</Label>
              <Input
                placeholder="es. Supermercato Coop"
                value={newExp.title}
                onChange={e => setNewExp(p => ({ ...p, title: e.target.value }))}
                className="mt-1.5"
                data-testid="input-expense-title"
              />
            </div>
            <div>
              <Label>Importo (€)</Label>
              <Input
                type="number"
                step="0.01"
                placeholder="0,00"
                value={newExp.amount}
                onChange={e => setNewExp(p => ({ ...p, amount: e.target.value }))}
                className="mt-1.5"
                data-testid="input-expense-amount"
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select
                value={newExp.categoryId}
                onValueChange={v => setNewExp(p => ({ ...p, categoryId: v }))}
              >
                <SelectTrigger className="mt-1.5" data-testid="select-expense-category">
                  <SelectValue placeholder="Seleziona categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nessuna categoria</SelectItem>
                  {categories?.map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={newExp.date}
                onChange={e => setNewExp(p => ({ ...p, date: e.target.value }))}
                className="mt-1.5"
                data-testid="input-expense-date"
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button
              className="w-full"
              onClick={() => addExpenseMutation.mutate({
                title: newExp.title,
                amount: parseFloat(newExp.amount),
                categoryId: newExp.categoryId && newExp.categoryId !== "none" ? newExp.categoryId : null,
                date: newExp.date,
              })}
              disabled={!newExp.title || !newExp.amount || addExpenseMutation.isPending}
              data-testid="button-save-expense"
            >
              {addExpenseMutation.isPending ? "Salvo…" : "Aggiungi spesa"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      </>}
    </div>
  );
}
