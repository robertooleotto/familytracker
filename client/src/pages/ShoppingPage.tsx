import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { ShoppingCart, Plus, Trash2, Package } from "lucide-react";
import type { ShoppingItem } from "@shared/schema";

const CATEGORIES = ["Produce", "Dairy", "Meat", "Bakery", "Frozen", "Beverages", "Snacks", "Household", "Other"];

const CATEGORY_COLORS: Record<string, string> = {
  Produce: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  Dairy: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  Meat: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  Bakery: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  Frozen: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400",
  Beverages: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  Snacks: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  Household: "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400",
  Other: "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-400",
};

export default function ShoppingPage() {
  const { toast } = useToast();
  const [newItem, setNewItem] = useState({ name: "", qty: 1, unit: "", category: "Other" });
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending" | "checked">("all");

  const { data: items, isLoading } = useQuery<ShoppingItem[]>({
    queryKey: ["/api/shopping"],
    refetchInterval: 5000,
  });

  const addMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/shopping", newItem);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping"] });
      setNewItem({ name: "", qty: 1, unit: "", category: "Other" });
      setShowAdd(false);
    },
    onError: (e: Error) => toast({ title: "Failed to add item", description: e.message, variant: "destructive" }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, checked }: { id: string; checked: boolean }) => {
      await apiRequest("PATCH", `/api/shopping/${id}`, { checked });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/shopping"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/shopping/${id}`, undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping"] });
    },
  });

  const clearCheckedMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("DELETE", "/api/shopping/checked/all", undefined);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shopping"] });
      toast({ title: "Cleared checked items" });
    },
  });

  const filteredItems = items?.filter((item) => {
    if (filter === "pending") return !item.checked;
    if (filter === "checked") return item.checked;
    return true;
  });

  const pendingCount = items?.filter((i) => !i.checked).length || 0;
  const checkedCount = items?.filter((i) => i.checked).length || 0;

  const groupedItems = filteredItems?.reduce<Record<string, ShoppingItem[]>>((groups, item) => {
    const cat = item.category || "Other";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
    return groups;
  }, {});

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex gap-2 text-xs">
              <span className="font-medium">{pendingCount} to get</span>
              {checkedCount > 0 && <span className="text-muted-foreground">· {checkedCount} done</span>}
            </div>
          </div>
          <div className="flex gap-2">
            {checkedCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => clearCheckedMutation.mutate()} className="text-xs">
                Clear done
              </Button>
            )}
            <Button size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-item">
              <Plus className="w-4 h-4 mr-1" />
              Add Item
            </Button>
          </div>
        </div>

        <div className="flex gap-1">
          {(["all", "pending", "checked"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-full text-xs transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent"
              }`}
            >
              {f === "all" ? "All" : f === "pending" ? "To Get" : "Done"}
            </button>
          ))}
        </div>

        {showAdd && (
          <div className="bg-accent/50 rounded-lg p-3 space-y-2">
            <div className="flex gap-2">
              <Input
                placeholder="Item name"
                value={newItem.name}
                onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                className="flex-1"
                onKeyDown={(e) => e.key === "Enter" && newItem.name && addMutation.mutate()}
                data-testid="input-item-name"
                autoFocus
              />
              <Input
                type="number"
                placeholder="Qty"
                value={newItem.qty}
                onChange={(e) => setNewItem({ ...newItem, qty: Number(e.target.value) })}
                className="w-16"
                min={1}
              />
              <Input
                placeholder="Unit"
                value={newItem.unit}
                onChange={(e) => setNewItem({ ...newItem, unit: e.target.value })}
                className="w-20"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setNewItem({ ...newItem, category: cat })}
                  className={`px-2 py-0.5 rounded-full text-xs transition-colors ${
                    newItem.category === cat
                      ? "bg-primary text-primary-foreground"
                      : "bg-background border border-border hover:bg-accent"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => addMutation.mutate()}
                disabled={!newItem.name || addMutation.isPending}
                className="flex-1"
                data-testid="button-confirm-add-item"
              >
                {addMutation.isPending ? "Adding…" : "Add to List"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-lg" />)}
          </div>
        ) : groupedItems && Object.keys(groupedItems).length > 0 ? (
          Object.entries(groupedItems).map(([category, catItems]) => (
            <div key={category}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${CATEGORY_COLORS[category] || CATEGORY_COLORS.Other}`}>
                  {category}
                </span>
                <span className="text-xs text-muted-foreground">{catItems.length}</span>
              </div>
              <div className="space-y-1">
                {catItems.map((item) => (
                  <div
                    key={item.id}
                    className={`flex items-center gap-3 p-3 rounded-lg border border-card-border transition-all ${
                      item.checked ? "opacity-50 bg-muted/30" : "bg-card hover:bg-accent/20"
                    }`}
                    data-testid={`shopping-item-${item.id}`}
                  >
                    <Checkbox
                      checked={item.checked}
                      onCheckedChange={(checked) =>
                        toggleMutation.mutate({ id: item.id, checked: !!checked })
                      }
                      data-testid={`checkbox-item-${item.id}`}
                    />
                    <div className="flex-1 min-w-0">
                      <span className={`text-sm ${item.checked ? "line-through text-muted-foreground" : "font-medium"}`}>
                        {item.name}
                      </span>
                      {(item.qty > 1 || item.unit) && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {item.qty} {item.unit}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => deleteMutation.mutate(item.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors p-1"
                      data-testid={`delete-item-${item.id}`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground py-12">
            <ShoppingCart className="w-12 h-12 mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {filter === "checked" ? "No completed items" : filter === "pending" ? "All done!" : "Shopping list is empty"}
            </p>
            <p className="text-xs mt-1">
              {filter === "all" ? "Add items to get started" : ""}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
