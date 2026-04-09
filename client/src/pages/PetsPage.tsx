import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Plus, Trash2, Heart, Syringe, Bug, Scissors, FileText, Phone, ChevronDown, ChevronUp, PawPrint, Shield, Pill, Stethoscope
} from "lucide-react";
import type { Pet, PetEvent } from "@shared/schema";
import { format } from "date-fns";
import { it } from "date-fns/locale/it";

const SPECIES_EMOJI: Record<string, string> = {
  dog: "🐕",
  cat: "🐈",
  bird: "🐦",
  rabbit: "🐇",
  other: "🐾",
};

const EVENT_ICONS: Record<string, any> = {
  vaccination: Shield,
  deworming: Pill,
  checkup: Heart,
  grooming: Scissors,
  other: FileText,
};

const COLOR_OPTIONS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"
];

export default function PetsPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [showAddPet, setShowAddPet] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState<string | null>(null);
  const [expandedPet, setExpandedPet] = useState<string | null>(null);

  const [newPet, setNewPet] = useState({
    name: "",
    species: "dog",
    breed: "",
    birthDate: "",
    color: COLOR_OPTIONS[2],
    vetName: "",
    vetPhone: "",
    notes: ""
  });

  const [newEvent, setNewEvent] = useState({
    type: "checkup",
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    nextDueDate: "",
    notes: ""
  });

  const { data: pets, isLoading: loadingPets } = useQuery<Pet[]>({
    queryKey: ["/api/pets"],
  });

  const { data: allEvents } = useQuery<PetEvent[]>({
    queryKey: ["/api/pets/events"],
  });

  const addPetMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/pets", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
      setShowAddPet(false);
      setNewPet({
        name: "",
        species: "dog",
        breed: "",
        birthDate: "",
        color: COLOR_OPTIONS[2],
        vetName: "",
        vetPhone: "",
        notes: ""
      });
      toast({ title: "Animale aggiunto con successo" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deletePetMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pets/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pets"] });
      toast({ title: "Animale rimosso" });
    },
  });

  const addEventMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/pets/events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pets/events"] });
      setShowAddEvent(null);
      setNewEvent({
        type: "checkup",
        title: "",
        date: format(new Date(), "yyyy-MM-dd"),
        nextDueDate: "",
        notes: ""
      });
      toast({ title: "Evento registrato" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/pets/events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pets/events"] });
      toast({ title: "Evento rimosso" });
    },
  });

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24">
      <div className="px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">I miei animali</h1>
        </div>

        {loadingPets ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <Skeleton key={i} className="h-32 rounded-xl" />)}
          </div>
        ) : pets && pets.length > 0 ? (
          <div className="space-y-4">
            {pets.map(pet => {
              const isExpanded = expandedPet === pet.id;
              const petEvents = allEvents?.filter(e => e.petId === pet.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];

              return (
                <div key={pet.id} className="bg-card border border-border rounded-xl overflow-hidden" data-testid={`card-pet-${pet.id}`}>
                  <div className="p-4 flex items-center gap-4">
                    <div
                      className="w-14 h-14 rounded-full flex items-center justify-center text-2xl shadow-sm flex-shrink-0"
                      style={{ backgroundColor: pet.color + "20", border: `2px solid ${pet.color}` }}
                    >
                      {SPECIES_EMOJI[pet.species] || "🐾"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="font-bold text-lg truncate">{pet.name}</h3>
                      <p className="text-sm text-muted-foreground truncate">
                        {pet.breed ? `${pet.breed} • ` : ""}{pet.species === "dog" ? "Cane" : pet.species === "cat" ? "Gatto" : pet.species === "bird" ? "Uccello" : pet.species === "rabbit" ? "Coniglio" : "Altro"}
                      </p>
                      {pet.vetPhone && (
                        <a
                          href={`tel:${pet.vetPhone}`}
                          className="inline-flex items-center gap-1.5 text-xs text-primary font-medium mt-1 hover:underline"
                          data-testid={`link-call-vet-${pet.id}`}
                        >
                          <Phone className="w-3 h-3" />
                          {pet.vetName || "Veterinario"}
                        </a>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => deletePetMutation.mutate(pet.id)}
                        className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                        data-testid={`button-delete-pet-${pet.id}`}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setExpandedPet(isExpanded ? null : pet.id)}
                        className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                        data-testid={`button-toggle-expand-pet-${pet.id}`}
                      >
                        {isExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                      </button>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-border bg-accent/30">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Storia eventi</h4>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          onClick={() => setShowAddEvent(pet.id)}
                          data-testid={`button-add-event-${pet.id}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Aggiungi
                        </Button>
                      </div>

                      {petEvents.length > 0 ? (
                        <div className="space-y-3">
                          {petEvents.map(event => {
                            const Icon = EVENT_ICONS[event.type] || FileText;
                            return (
                              <div key={event.id} className="flex items-start gap-3 bg-card rounded-lg p-3 border border-border/50 shadow-sm" data-testid={`event-item-${event.id}`}>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <Icon className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-start justify-between">
                                    <p className="text-sm font-semibold leading-none">{event.title}</p>
                                    <button
                                      onClick={() => deleteEventMutation.mutate(event.id)}
                                      className="text-muted-foreground hover:text-destructive transition-colors"
                                      data-testid={`button-delete-event-${event.id}`}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                  <p className="text-[11px] text-muted-foreground mt-1">
                                    {format(new Date(event.date), "d MMM yyyy", { locale: it })}
                                  </p>
                                  {event.nextDueDate && (
                                    <div className="inline-flex items-center gap-1 mt-2 px-1.5 py-0.5 rounded bg-primary/10 text-[10px] font-bold text-primary uppercase tracking-wider">
                                      Prossima: {format(new Date(event.nextDueDate), "d MMM yyyy", { locale: it })}
                                    </div>
                                  )}
                                  {event.notes && <p className="text-xs text-muted-foreground mt-2 italic">{event.notes}</p>}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground/60 bg-card/50 rounded-lg border border-dashed border-border">
                          <p className="text-sm">Nessun evento registrato</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-20 text-muted-foreground">
            <PawPrint className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Nessun animale aggiunto</p>
            <p className="text-sm mt-1">Inizia aggiungendo il tuo primo amico a quattro zampe</p>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAddPet(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-20"
        data-testid="button-fab-add-pet"
      >
        <Plus className="w-7 h-7" />
      </button>

      <Dialog open={showAddPet} onOpenChange={setShowAddPet}>
        <DialogContent className="max-w-md mx-4 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Aggiungi animale</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>Nome</Label>
                <Input
                  placeholder="es. Fido"
                  value={newPet.name}
                  onChange={e => setNewPet(p => ({ ...p, name: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-pet-name"
                />
              </div>
              <div>
                <Label>Specie</Label>
                <Select
                  value={newPet.species}
                  onValueChange={v => setNewPet(p => ({ ...p, species: v }))}
                >
                  <SelectTrigger className="mt-1.5">
                    <SelectValue placeholder="Seleziona specie" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dog">Cane</SelectItem>
                    <SelectItem value="cat">Gatto</SelectItem>
                    <SelectItem value="bird">Uccello</SelectItem>
                    <SelectItem value="rabbit">Coniglio</SelectItem>
                    <SelectItem value="other">Altro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Razza</Label>
                <Input
                  placeholder="es. Labrador"
                  value={newPet.breed}
                  onChange={e => setNewPet(p => ({ ...p, breed: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-pet-breed"
                />
              </div>
              <div>
                <Label>Data di nascita</Label>
                <Input
                  type="date"
                  value={newPet.birthDate}
                  onChange={e => setNewPet(p => ({ ...p, birthDate: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-pet-birthdate"
                />
              </div>
              <div>
                <Label>Colore icona</Label>
                <div className="flex gap-2 mt-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewPet(p => ({ ...p, color: c }))}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${newPet.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      data-testid={`color-pet-${c}`}
                    />
                  ))}
                </div>
              </div>
              <div className="col-span-2">
                <Label>Veterinario (Nome)</Label>
                <Input
                  placeholder="es. Dr. Rossi"
                  value={newPet.vetName}
                  onChange={e => setNewPet(p => ({ ...p, vetName: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-pet-vet-name"
                />
              </div>
              <div className="col-span-2">
                <Label>Telefono Veterinario</Label>
                <Input
                  placeholder="+39 123 4567890"
                  value={newPet.vetPhone}
                  onChange={e => setNewPet(p => ({ ...p, vetPhone: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-pet-vet-phone"
                />
              </div>
              <div className="col-span-2">
                <Label>Note</Label>
                <Textarea
                  placeholder="Note aggiuntive..."
                  value={newPet.notes}
                  onChange={e => setNewPet(p => ({ ...p, notes: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-pet-notes"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddPet(false)}>Annulla</Button>
            <Button
              onClick={() => addPetMutation.mutate({ ...newPet, birthDate: newPet.birthDate ? new Date(newPet.birthDate).toISOString() : null })}
              disabled={!newPet.name || addPetMutation.isPending}
              data-testid="button-save-pet"
            >
              {addPetMutation.isPending ? "Salvo…" : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!showAddEvent} onOpenChange={v => { if (!v) setShowAddEvent(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle>Aggiungi evento</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Tipo evento</Label>
              <Select
                value={newEvent.type}
                onValueChange={v => setNewEvent(p => ({ ...p, type: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vaccination">Vaccinazione</SelectItem>
                  <SelectItem value="deworming">Sverminazione</SelectItem>
                  <SelectItem value="checkup">Visita</SelectItem>
                  <SelectItem value="grooming">Toelettatura</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Titolo</Label>
              <Input
                placeholder="es. Richiamo rabbia"
                value={newEvent.title}
                onChange={e => setNewEvent(p => ({ ...p, title: e.target.value }))}
                className="mt-1.5"
                data-testid="input-event-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Data</Label>
                <Input
                  type="date"
                  value={newEvent.date}
                  onChange={e => setNewEvent(p => ({ ...p, date: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-event-date"
                />
              </div>
              <div>
                <Label>Prossima scadenza (opzionale)</Label>
                <Input
                  type="date"
                  value={newEvent.nextDueDate}
                  onChange={e => setNewEvent(p => ({ ...p, nextDueDate: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-event-next-due"
                />
              </div>
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                placeholder="Dettagli dell'evento..."
                value={newEvent.notes}
                onChange={e => setNewEvent(p => ({ ...p, notes: e.target.value }))}
                className="mt-1.5"
                data-testid="input-event-notes"
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button
              className="w-full"
              onClick={() => addEventMutation.mutate({
                ...newEvent,
                petId: showAddEvent,
                date: new Date(newEvent.date).toISOString(),
                nextDueDate: newEvent.nextDueDate ? new Date(newEvent.nextDueDate).toISOString() : null
              })}
              disabled={!newEvent.title || !newEvent.date || addEventMutation.isPending}
              data-testid="button-save-event"
            >
              {addEventMutation.isPending ? "Salvo…" : "Registra evento"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
