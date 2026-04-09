import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Utensils, Edit2, Check, X, Calendar as CalendarIcon,
} from "lucide-react";
import type { DinnerRotation, Profile } from "@shared/schema";
import { format, startOfWeek, addDays, isSameDay } from "date-fns";
import { it } from "date-fns/locale/it";

const DAYS = [
  { label: "Lunedì", value: 1 },
  { label: "Martedì", value: 2 },
  { label: "Mercoledì", value: 3 },
  { label: "Giovedì", value: 4 },
  { label: "Venerdì", value: 5 },
  { label: "Sabato", value: 6 },
  { label: "Domenica", value: 0 },
];

export default function DinnerPage() {
  const { toast } = useToast();
  const [editingDay, setEditingDay] = useState<number | null>(null);
  const [editValues, setEditValues] = useState({ profileId: "", meal: "" });

  const { data: rotation, isLoading: loadingRotation } = useQuery<DinnerRotation[]>({
    queryKey: ["/api/dinner-rotation"],
  });

  const { data: members, isLoading: loadingMembers } = useQuery<Profile[]>({
    queryKey: ["/api/family/members"],
  });

  const upsertMutation = useMutation({
    mutationFn: (data: any) => apiRequest("PUT", "/api/dinner-rotation", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dinner-rotation"] });
      setEditingDay(null);
      toast({ title: "Rotazione aggiornata" });
    },
  });

  const start = startOfWeek(new Date(), { weekStartsOn: 1 });
  const assignedCount = rotation?.filter(r => r.profileId).length || 0;

  const getRotationForDay = (dayValue: number) => {
    return rotation?.find(r => r.weekday === dayValue);
  };

  const startEdit = (dayValue: number, current?: DinnerRotation) => {
    setEditingDay(dayValue);
    setEditValues({
      profileId: current?.profileId || "none",
      meal: current?.meal || "",
    });
  };

  const handleSave = (dayValue: number) => {
    upsertMutation.mutate({
      weekday: dayValue,
      profileId: editValues.profileId === "none" ? null : editValues.profileId,
      meal: editValues.meal || null,
    });
  };

  const isLoading = loadingRotation || loadingMembers;

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-10">
      <div className="p-4 border-b bg-card">
        <h1 className="text-xl font-bold">Rotazione Cena</h1>
        <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
          <CalendarIcon className="w-4 h-4" />
          <span>Questa settimana — {assignedCount} turni assegnati</span>
        </div>
      </div>

      <div className="p-4 space-y-3">
        {isLoading ? (
          [...Array(7)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)
        ) : (
          DAYS.map((day) => {
            const rot = getRotationForDay(day.value);
            const member = members?.find(m => m.id === rot?.profileId);
            const date = addDays(start, (day.value === 0 ? 6 : day.value - 1));
            const isToday = isSameDay(date, new Date());
            const isEditing = editingDay === day.value;

            return (
              <div
                key={day.value}
                className={`bg-card rounded-xl border-2 transition-all ${isToday ? "border-primary" : "border-border"}`}
                data-testid={`day-row-${day.value}`}
              >
                <div className="p-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-sm font-bold ${isToday ? "text-primary" : ""}`}>
                        {day.label}
                      </span>
                      {isToday && (
                        <span className="text-[10px] bg-primary text-primary-foreground px-1.5 py-0.5 rounded-full font-bold uppercase">Oggi</span>
                      )}
                    </div>

                    {isEditing ? (
                      <div className="space-y-2 py-1">
                        <Select
                          value={editValues.profileId}
                          onValueChange={(v) => setEditValues(p => ({ ...p, profileId: v }))}
                        >
                          <SelectTrigger className="h-8 text-xs" data-testid={`select-profile-${day.value}`}>
                            <SelectValue placeholder="Chi cucina?" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Nessuno</SelectItem>
                            {members?.map(m => (
                              <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input
                          placeholder="Cosa si mangia?"
                          value={editValues.meal}
                          onChange={(e) => setEditValues(p => ({ ...p, meal: e.target.value }))}
                          className="h-8 text-xs"
                          data-testid={`input-meal-${day.value}`}
                        />
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                          <Avatar className="w-8 h-8">
                            {member ? (
                              <AvatarFallback style={{ backgroundColor: member.colorHex }} className="text-white text-xs">
                                {member.name.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            ) : (
                              <AvatarFallback className="text-muted-foreground text-xs">—</AvatarFallback>
                            )}
                          </Avatar>
                          <div className="flex flex-col">
                            <span className="text-sm font-medium">
                              {member?.name || "Non assegnato"}
                            </span>
                            {rot?.meal ? (
                              <span className="text-xs text-muted-foreground italic flex items-center gap-1">
                                <Utensils className="w-3 h-3" />
                                {rot.meal}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-1">
                    {isEditing ? (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-green-600 hover:text-green-700 hover:bg-green-50"
                          onClick={() => handleSave(day.value)}
                          disabled={upsertMutation.isPending}
                          data-testid={`button-save-${day.value}`}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-muted-foreground"
                          onClick={() => setEditingDay(null)}
                          data-testid={`button-cancel-${day.value}`}
                        >
                          <X className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground"
                        onClick={() => startEdit(day.value, rot)}
                        data-testid={`button-edit-${day.value}`}
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
