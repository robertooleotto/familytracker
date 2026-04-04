import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Wrench, Zap, Stethoscope, Baby, Heart, AlertTriangle, FileText, Plus, Trash2, Phone, Search, ExternalLink,
} from "lucide-react";
import type { HomeContact } from "@shared/schema";

const CATEGORIES = [
  { id: "plumber", label: "Idraulico", icon: Wrench, emoji: "🔧" },
  { id: "electrician", label: "Elettricista", icon: Zap, emoji: "⚡" },
  { id: "doctor", label: "Medico", icon: Stethoscope, emoji: "🩺" },
  { id: "pediatrician", label: "Pediatra", icon: Baby, emoji: "👶" },
  { id: "dentist", label: "Dentista", icon: Heart, emoji: "🦷" },
  { id: "emergency", label: "Emergenza", icon: AlertTriangle, emoji: "🚨" },
  { id: "other", label: "Altro", icon: FileText, emoji: "📋" },
];

export default function HomeContactsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [newContact, setNewContact] = useState({
    name: "",
    category: "other",
    phone: "",
    email: "",
    notes: "",
  });

  const { data: contacts, isLoading } = useQuery<HomeContact[]>({
    queryKey: ["/api/home-contacts"],
  });

  const addMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/home-contacts", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/home-contacts"] });
      setShowAdd(false);
      setNewContact({ name: "", category: "other", phone: "", email: "", notes: "" });
      toast({ title: "Contatto aggiunto" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/home-contacts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/home-contacts"] });
      toast({ title: "Contatto eliminato" });
    },
  });

  const filteredContacts = contacts?.filter(c => 
    c.name.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const grouped = CATEGORIES.map(cat => ({
    ...cat,
    items: filteredContacts.filter(c => c.category === cat.id),
  })).filter(g => g.items.length > 0);

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24">
      <div className="p-4 space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Cerca contatto..."
            className="pl-9"
            value={search}
            onChange={e => setSearch(e.target.value)}
            data-testid="input-search"
          />
        </div>

        {isLoading ? (
          <div className="space-y-6">
            {[1, 2].map(i => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-20 rounded-xl" />
                <Skeleton className="h-20 rounded-xl" />
              </div>
            ))}
          </div>
        ) : filteredContacts.length > 0 ? (
          <div className="space-y-6">
            {grouped.map(group => (
              <div key={group.id} className="space-y-2">
                <div className="flex items-center gap-2 px-1">
                  <group.icon className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-xs font-bold uppercase text-muted-foreground tracking-wider">
                    {group.label} {group.emoji}
                  </h3>
                </div>
                <div className="grid gap-2">
                  {group.items.map(contact => (
                    <div key={contact.id} className="bg-card border border-border rounded-xl p-3 flex items-start gap-3 group" data-testid={`contact-card-${contact.id}`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate">{contact.name}</p>
                        {contact.phone && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <Phone className="w-3 h-3" /> {contact.phone}
                          </p>
                        )}
                        {contact.email && (
                          <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
                            <FileText className="w-3 h-3" /> {contact.email}
                          </p>
                        )}
                        {contact.notes && (
                          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{contact.notes}</p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1">
                        {contact.phone && (
                          <Button size="sm" variant="outline" className="h-8" asChild data-testid={`button-call-${contact.id}`}>
                            <a href={`tel:${contact.phone}`}>
                              Chiama
                            </a>
                          </Button>
                        )}
                        <button
                          onClick={() => deleteMutation.mutate(contact.id)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors self-end"
                          data-testid={`button-delete-${contact.id}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <Phone className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>{search ? "Nessun contatto trovato" : "Nessun contatto salvato"}</p>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAdd(true)}
        className="fixed bottom-20 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-20"
        data-testid="fab-add-contact"
      >
        <Plus className="w-6 h-6" />
      </button>

      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle>Nuovo contatto</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome</Label>
              <Input
                placeholder="es. Mario Rossi, Pediatra..."
                value={newContact.name}
                onChange={e => setNewContact(p => ({ ...p, name: e.target.value }))}
                data-testid="input-name"
              />
            </div>
            <div>
              <Label>Categoria</Label>
              <Select
                value={newContact.category}
                onValueChange={v => setNewContact(p => ({ ...p, category: v }))}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.id} value={cat.id}>{cat.emoji} {cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Telefono</Label>
              <Input
                type="tel"
                placeholder="es. +39 333..."
                value={newContact.phone}
                onChange={e => setNewContact(p => ({ ...p, phone: e.target.value }))}
                data-testid="input-phone"
              />
            </div>
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                placeholder="es. info@esempio.it"
                value={newContact.email}
                onChange={e => setNewContact(p => ({ ...p, email: e.target.value }))}
                data-testid="input-email"
              />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                placeholder="Indirizzo, orari, altro..."
                value={newContact.notes}
                onChange={e => setNewContact(p => ({ ...p, notes: e.target.value }))}
                data-testid="input-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAdd(false)}>Annulla</Button>
            <Button
              onClick={() => addMutation.mutate(newContact)}
              disabled={!newContact.name || addMutation.isPending}
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
