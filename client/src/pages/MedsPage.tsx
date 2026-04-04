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
import { Pill, Plus, Trash2, CheckCircle, Clock, BookOpen } from "lucide-react";
import type { Medication, Profile } from "@shared/schema";

type MedWithProfile = Medication & { profile: Profile };

export default function MedsPage() {
  const { profile: myProfile } = useAuth();
  const { toast } = useToast();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ profileId: myProfile?.id || "", name: "", dosage: "", time1: "", time2: "", time3: "", notes: "" });

  const { data: members } = useQuery<Profile[]>({ queryKey: ["/api/family/members"] });
  const { data: meds, isLoading } = useQuery<MedWithProfile[]>({ queryKey: ["/api/medications"] });

  const addMutation = useMutation({
    mutationFn: async () => {
      const scheduleTimes = [form.time1, form.time2, form.time3].filter(Boolean);
      const res = await apiRequest("POST", "/api/medications", {
        profileId: form.profileId, name: form.name, dosage: form.dosage || null,
        scheduleTimes, notes: form.notes || null,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/medications"] });
      setShowAdd(false);
      setForm({ profileId: myProfile?.id || "", name: "", dosage: "", time1: "", time2: "", time3: "", notes: "" });
      toast({ title: "Farmaco aggiunto!" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const takenMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("POST", `/api/medications/${id}/taken`, {}); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/medications"] }); toast({ title: "✅ Farmaco registrato" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => { await apiRequest("DELETE", `/api/medications/${id}`, undefined); },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["/api/medications"] }); toast({ title: "Farmaco rimosso" }); },
  });

  const formatLastTaken = (d: Date | string | null) => {
    if (!d) return null;
    const diff = Date.now() - new Date(d).getTime();
    const hrs = Math.floor(diff / 3600000);
    if (hrs < 1) return "meno di 1h fa";
    if (hrs < 24) return `${hrs}h fa`;
    return `${Math.floor(hrs/24)}g fa`;
  };

  const isOverdue = (med: Medication) => {
    if (!med.scheduleTimes || med.scheduleTimes.length === 0) return false;
    if (!med.lastTakenAt) return true;
    const diff = Date.now() - new Date(med.lastTakenAt).getTime();
    return diff > 20 * 3600000; // >20h
  };

  // Group by profile
  const byProfile = members?.map(m => ({
    member: m,
    meds: meds?.filter(med => med.profileId === m.id) || [],
  })).filter(g => g.meds.length > 0) || [];

  return (
    <div className="flex flex-col h-full overflow-y-auto">
      <div className="p-4 space-y-4">
        {/* Header + Add */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">Farmaci & Salute</h2>
            <p className="text-xs text-muted-foreground">Terapie e promemoria assunzione</p>
          </div>
          <Button size="sm" onClick={() => setShowAdd(!showAdd)} data-testid="button-add-med">
            <Plus className="w-4 h-4 mr-1" /> Aggiungi
          </Button>
        </div>

        {/* Add form */}
        {showAdd && (
          <div className="bg-accent/40 rounded-xl p-4 space-y-3">
            <h3 className="font-semibold text-sm">Nuovo farmaco</h3>
            <div>
              <Label className="text-xs">Per chi</Label>
              <Select value={form.profileId} onValueChange={v => setForm({ ...form, profileId: v })}>
                <SelectTrigger data-testid="select-med-member"><SelectValue placeholder="Seleziona membro" /></SelectTrigger>
                <SelectContent>
                  {members?.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Nome farmaco</Label>
                <Input placeholder="es. Amoxicillina" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} data-testid="input-med-name" />
              </div>
              <div>
                <Label className="text-xs">Dosaggio</Label>
                <Input placeholder="es. 500mg" value={form.dosage} onChange={e => setForm({ ...form, dosage: e.target.value })} />
              </div>
            </div>
            <div>
              <Label className="text-xs">Orari assunzione</Label>
              <div className="grid grid-cols-3 gap-2">
                <Input type="time" value={form.time1} onChange={e => setForm({ ...form, time1: e.target.value })} placeholder="08:00" />
                <Input type="time" value={form.time2} onChange={e => setForm({ ...form, time2: e.target.value })} placeholder="14:00" />
                <Input type="time" value={form.time3} onChange={e => setForm({ ...form, time3: e.target.value })} placeholder="20:00" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Note</Label>
              <Input placeholder="Con il cibo, a stomaco vuoto…" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => addMutation.mutate()} disabled={!form.profileId || !form.name || addMutation.isPending}>
                {addMutation.isPending ? "Salvataggio…" : "Salva"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setShowAdd(false)}>Annulla</Button>
            </div>
          </div>
        )}

        {/* Meds list */}
        {isLoading ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
        ) : byProfile.length > 0 ? (
          <div className="space-y-4">
            {byProfile.map(({ member, meds: memberMeds }) => (
              <div key={member.id}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold" style={{ backgroundColor: member.colorHex || "#3B82F6" }}>
                    {member.name.charAt(0)}
                  </div>
                  <span className="text-sm font-semibold">{member.name}</span>
                  <Badge variant="secondary" className="text-xs">{memberMeds.length} farmac{memberMeds.length === 1 ? "o" : "i"}</Badge>
                </div>
                <div className="space-y-2">
                  {memberMeds.map(med => (
                    <div key={med.id} className={`p-3 rounded-xl border ${isOverdue(med) ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20" : "border-border bg-card"}`} data-testid={`med-${med.id}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Pill className={`w-4 h-4 mt-0.5 flex-shrink-0 ${isOverdue(med) ? "text-red-500" : "text-blue-500"}`} />
                          <div className="min-w-0">
                            <p className="font-semibold text-sm">{med.name}</p>
                            {med.dosage && <p className="text-xs text-muted-foreground">{med.dosage}</p>}
                            {med.scheduleTimes && med.scheduleTimes.length > 0 && (
                              <div className="flex items-center gap-1 mt-1 flex-wrap">
                                <Clock className="w-3 h-3 text-muted-foreground" />
                                {med.scheduleTimes.map((t, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">{t}</Badge>
                                ))}
                              </div>
                            )}
                            <p className="text-xs mt-1">
                              {med.lastTakenAt
                                ? <span className="text-green-600">Ultima: {formatLastTaken(med.lastTakenAt)}</span>
                                : <span className="text-amber-600">Non ancora preso oggi</span>}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <a
                            href={`https://medicinali.aifa.gov.it/index.php#/ricerca?tipo=farmaco&key=${encodeURIComponent(med.name.split(" ")[0])}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors"
                            title="Cerca bugiardino su AIFA"
                            data-testid={`leaflet-med-${med.id}`}
                          >
                            <BookOpen className="w-4 h-4" />
                          </a>
                          <button onClick={() => takenMutation.mutate(med.id)} className="p-1.5 rounded-lg bg-green-100 dark:bg-green-900/30 text-green-600 hover:bg-green-200 transition-colors" title="Segna come preso" data-testid={`taken-med-${med.id}`}>
                            <CheckCircle className="w-4 h-4" />
                          </button>
                          <button onClick={() => deleteMutation.mutate(med.id)} className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive transition-colors" data-testid={`delete-med-${med.id}`}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                      {med.notes && <p className="text-xs text-muted-foreground mt-2 pl-6">{med.notes}</p>}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Pill className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium text-sm">Nessun farmaco registrato</p>
            <p className="text-xs mt-1">Aggiungi farmaci e orari di assunzione</p>
          </div>
        )}
      </div>
    </div>
  );
}
