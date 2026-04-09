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
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
  Plus, Trash2, Car, Droplets, Wrench, ClipboardList, Receipt, Shield, FileText, ChevronDown, ChevronUp, AlertCircle, Calendar
} from "lucide-react";
import type { Vehicle, VehicleLog, Profile } from "@shared/schema";
import { format, differenceInDays } from "date-fns";
import { it } from "date-fns/locale/it";

const LOG_ICONS: Record<string, any> = {
  fuel: Droplets,
  maintenance: Wrench,
  revision: ClipboardList,
  bollo: Receipt,
  insurance: Shield,
  other: FileText,
};

const COLOR_OPTIONS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#6B7280"
];

function formatEur(n: number) {
  return `€ ${n.toFixed(2).replace(".", ",")}`;
}

function getExpiryStatus(dateStr: string | null | undefined) {
  if (!dateStr) return null;
  const days = differenceInDays(new Date(dateStr), new Date());
  if (days < 0) return { color: "bg-red-500", label: "Scaduto" };
  if (days < 30) return { color: "bg-red-500", label: `-${days} gg` };
  if (days < 60) return { color: "bg-orange-500", label: `-${days} gg` };
  return { color: "bg-green-500", label: `${days} gg` };
}

export default function VehiclesPage() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const [showAddVehicle, setShowAddVehicle] = useState(false);
  const [showAddLog, setShowAddLog] = useState<string | null>(null);
  const [expandedVehicle, setExpandedVehicle] = useState<string | null>(null);

  const [newVehicle, setNewVehicle] = useState({
    name: "",
    brand: "",
    model: "",
    plate: "",
    year: "",
    color: COLOR_OPTIONS[0],
    currentKm: "",
    insuranceExpiry: "",
    revisionExpiry: "",
    bolloExpiry: ""
  });

  const [newLog, setNewLog] = useState({
    type: "fuel",
    title: "",
    date: format(new Date(), "yyyy-MM-dd"),
    amount: "",
    km: "",
    notes: ""
  });

  const { data: vehicles, isLoading: loadingVehicles } = useQuery<Vehicle[]>({
    queryKey: ["/api/vehicles"],
  });

  const { data: allLogs } = useQuery<VehicleLog[]>({
    queryKey: ["/api/vehicles/logs"],
  });

  const { data: familyMembers } = useQuery<Profile[]>({
    queryKey: ["/api/family/members"],
  });

  const addVehicleMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vehicles", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      setShowAddVehicle(false);
      setNewVehicle({
        name: "", brand: "", model: "", plate: "", year: "",
        color: COLOR_OPTIONS[0], currentKm: "", insuranceExpiry: "",
        revisionExpiry: "", bolloExpiry: ""
      });
      toast({ title: "Veicolo aggiunto" });
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const deleteVehicleMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vehicles/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles"] });
      toast({ title: "Veicolo rimosso" });
    },
  });

  const addLogMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/vehicles/logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles/logs"] });
      setShowAddLog(null);
      setNewLog({
        type: "fuel", title: "", date: format(new Date(), "yyyy-MM-dd"),
        amount: "", km: "", notes: ""
      });
      toast({ title: "Log registrato" });
    },
  });

  const deleteLogMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/vehicles/logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/vehicles/logs"] });
      toast({ title: "Voce rimossa" });
    },
  });

  return (
    <div className="flex-1 overflow-y-auto bg-background pb-24">
      <div className="px-4 py-6">
        <h1 className="text-2xl font-bold mb-6">Veicoli di famiglia</h1>

        {loadingVehicles ? (
          <div className="space-y-4">
            {[1, 2].map(i => <Skeleton key={i} className="h-48 rounded-xl" />)}
          </div>
        ) : vehicles && vehicles.length > 0 ? (
          <div className="space-y-4">
            {vehicles.map(vehicle => {
              const isExpanded = expandedVehicle === vehicle.id;
              const vehicleLogs = allLogs?.filter(l => l.vehicleId === vehicle.id).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) || [];
              const insurance = getExpiryStatus(vehicle.insuranceExpiry?.toString());
              const revision = getExpiryStatus(vehicle.revisionExpiry?.toString());
              const bollo = getExpiryStatus(vehicle.bolloExpiry?.toString());
              
              const currentUser = familyMembers?.find(m => m.id === vehicle.currentUserId);

              return (
                <div key={vehicle.id} className="bg-card border border-border rounded-xl overflow-hidden" data-testid={`card-vehicle-${vehicle.id}`}>
                  <div className="p-4">
                    <div className="flex items-start gap-4">
                      <div
                        className="w-12 h-12 rounded-xl flex items-center justify-center shadow-sm flex-shrink-0"
                        style={{ backgroundColor: vehicle.color + "20" }}
                      >
                        <Car className="w-6 h-6" style={{ color: vehicle.color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-lg truncate">{vehicle.name}</h3>
                          <Badge variant="outline" className="text-[10px] font-mono" data-testid={`badge-plate-${vehicle.id}`}>
                            {vehicle.plate || "NO PLATE"}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground truncate">
                          {vehicle.brand} {vehicle.model} {vehicle.year ? `(${vehicle.year})` : ""}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 mt-4">
                      {insurance && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">Assicuraz.</span>
                          <Badge className={`${insurance.color} text-white border-0 h-6`} data-testid={`status-insurance-${vehicle.id}`}>
                            {insurance.label}
                          </Badge>
                        </div>
                      )}
                      {revision && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">Revisione</span>
                          <Badge className={`${revision.color} text-white border-0 h-6`} data-testid={`status-revision-${vehicle.id}`}>
                            {revision.label}
                          </Badge>
                        </div>
                      )}
                      {bollo && (
                        <div className="flex flex-col gap-1">
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">Bollo</span>
                          <Badge className={`${bollo.color} text-white border-0 h-6`} data-testid={`status-bollo-${vehicle.id}`}>
                            {bollo.label}
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between mt-4 pt-4 border-t border-border">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">Chi ha la macchina:</span>
                        {currentUser ? (
                          <div className="flex items-center gap-1.5 bg-accent/50 px-2 py-1 rounded-full border border-border">
                            <Avatar className="w-5 h-5">
                              {currentUser.avatarUrl && <AvatarImage src={currentUser.avatarUrl} />}
                              <AvatarFallback style={{ backgroundColor: currentUser.colorHex }} className="text-[8px] text-white">
                                {currentUser.name.substring(0, 2).toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <span className="text-xs font-medium" data-testid={`text-current-user-${vehicle.id}`}>
                              {currentUser.name.split(" ")[0]}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs font-medium text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deleteVehicleMutation.mutate(vehicle.id)}
                          className="p-2 text-muted-foreground hover:text-destructive transition-colors"
                          data-testid={`button-delete-vehicle-${vehicle.id}`}
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => setExpandedVehicle(isExpanded ? null : vehicle.id)}
                          className="p-2 text-muted-foreground hover:text-foreground transition-colors"
                          data-testid={`button-toggle-expand-vehicle-${vehicle.id}`}
                        >
                          {isExpanded ? <ChevronUp className="w-6 h-6" /> : <ChevronDown className="w-6 h-6" />}
                        </button>
                      </div>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 pt-2 border-t border-border bg-accent/30">
                      <div className="flex items-center justify-between mb-4">
                        <h4 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Registro attività</h4>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1"
                          onClick={() => setShowAddLog(vehicle.id)}
                          data-testid={`button-add-log-${vehicle.id}`}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Nuovo
                        </Button>
                      </div>

                      {vehicleLogs.length > 0 ? (
                        <div className="space-y-2">
                          {vehicleLogs.map(log => {
                            const Icon = LOG_ICONS[log.type] || FileText;
                            return (
                              <div key={log.id} className="flex items-center gap-3 bg-card rounded-lg p-3 border border-border/50 shadow-sm" data-testid={`log-item-${log.id}`}>
                                <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                                  <Icon className="w-4 h-4 text-primary" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center justify-between">
                                    <p className="text-sm font-semibold truncate">{log.title}</p>
                                    <span className="text-sm font-bold text-primary">
                                      {log.amount ? formatEur(Number(log.amount)) : log.km ? `${log.km} km` : ""}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tight">
                                      {format(new Date(log.date), "d MMM yyyy", { locale: it })}
                                    </span>
                                    {log.km && log.amount && (
                                      <span className="text-[10px] text-muted-foreground">• {log.km} km</span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => deleteLogMutation.mutate(log.id)}
                                  className="p-1.5 text-muted-foreground hover:text-destructive transition-colors"
                                  data-testid={`button-delete-log-${log.id}`}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground/60 bg-card/50 rounded-lg border border-dashed border-border">
                          <p className="text-sm">Nessuna attività registrata</p>
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
            <Car className="w-16 h-16 mx-auto mb-4 opacity-20" />
            <p className="text-lg font-medium">Nessun veicolo aggiunto</p>
          </div>
        )}
      </div>

      <button
        onClick={() => setShowAddVehicle(true)}
        className="fixed bottom-24 right-4 w-14 h-14 bg-primary text-primary-foreground rounded-full shadow-lg flex items-center justify-center hover:scale-105 active:scale-95 transition-transform z-20"
        data-testid="button-fab-add-vehicle"
      >
        <Plus className="w-7 h-7" />
      </button>

      <Dialog open={showAddVehicle} onOpenChange={setShowAddVehicle}>
        <DialogContent className="max-w-md mx-4 overflow-y-auto max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Aggiungi veicolo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>Nome (es. Auto Mamma)</Label>
              <Input
                value={newVehicle.name}
                onChange={e => setNewVehicle(p => ({ ...p, name: e.target.value }))}
                className="mt-1.5"
                data-testid="input-vehicle-name"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Marca</Label>
                <Input
                  value={newVehicle.brand}
                  onChange={e => setNewVehicle(p => ({ ...p, brand: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-vehicle-brand"
                />
              </div>
              <div>
                <Label>Modello</Label>
                <Input
                  value={newVehicle.model}
                  onChange={e => setNewVehicle(p => ({ ...p, model: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-vehicle-model"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Targa</Label>
                <Input
                  value={newVehicle.plate}
                  onChange={e => setNewVehicle(p => ({ ...p, plate: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-vehicle-plate"
                />
              </div>
              <div>
                <Label>Anno</Label>
                <Input
                  type="number"
                  value={newVehicle.year}
                  onChange={e => setNewVehicle(p => ({ ...p, year: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-vehicle-year"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Km attuali</Label>
                <Input
                  type="number"
                  value={newVehicle.currentKm}
                  onChange={e => setNewVehicle(p => ({ ...p, currentKm: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-vehicle-km"
                />
              </div>
              <div>
                <Label>Colore icona</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setNewVehicle(p => ({ ...p, color: c }))}
                      className={`w-6 h-6 rounded-full border-2 transition-all ${newVehicle.color === c ? "border-foreground scale-110" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                      data-testid={`color-vehicle-${c}`}
                    />
                  ))}
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-[10px] uppercase font-bold">Assicuraz.</Label>
                <Input
                  type="date"
                  value={newVehicle.insuranceExpiry}
                  onChange={e => setNewVehicle(p => ({ ...p, insuranceExpiry: e.target.value }))}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase font-bold">Revisione</Label>
                <Input
                  type="date"
                  value={newVehicle.revisionExpiry}
                  onChange={e => setNewVehicle(p => ({ ...p, revisionExpiry: e.target.value }))}
                  className="mt-1 text-xs"
                />
              </div>
              <div>
                <Label className="text-[10px] uppercase font-bold">Bollo</Label>
                <Input
                  type="date"
                  value={newVehicle.bolloExpiry}
                  onChange={e => setNewVehicle(p => ({ ...p, bolloExpiry: e.target.value }))}
                  className="mt-1 text-xs"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddVehicle(false)}>Annulla</Button>
            <Button
              onClick={() => addVehicleMutation.mutate({
                ...newVehicle,
                year: parseInt(newVehicle.year) || null,
                currentKm: parseInt(newVehicle.currentKm) || null,
                insuranceExpiry: newVehicle.insuranceExpiry ? new Date(newVehicle.insuranceExpiry).toISOString() : null,
                revisionExpiry: newVehicle.revisionExpiry ? new Date(newVehicle.revisionExpiry).toISOString() : null,
                bolloExpiry: newVehicle.bolloExpiry ? new Date(newVehicle.bolloExpiry).toISOString() : null,
              })}
              disabled={!newVehicle.name || addVehicleMutation.isPending}
              data-testid="button-save-vehicle"
            >
              {addVehicleMutation.isPending ? "Salvo…" : "Salva"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Sheet open={!!showAddLog} onOpenChange={v => { if (!v) setShowAddLog(null); }}>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle>Nuova attività</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Tipo attività</Label>
              <Select
                value={newLog.type}
                onValueChange={v => setNewLog(p => ({ ...p, type: v }))}
              >
                <SelectTrigger className="mt-1.5">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fuel">Rifornimento</SelectItem>
                  <SelectItem value="maintenance">Manutenzione</SelectItem>
                  <SelectItem value="revision">Revisione</SelectItem>
                  <SelectItem value="bollo">Bollo</SelectItem>
                  <SelectItem value="insurance">Assicurazione</SelectItem>
                  <SelectItem value="other">Altro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Titolo</Label>
              <Input
                placeholder="es. Pieno Diesel"
                value={newLog.title}
                onChange={e => setNewLog(p => ({ ...p, title: e.target.value }))}
                className="mt-1.5"
                data-testid="input-log-title"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Importo (€)</Label>
                <Input
                  type="number"
                  step="0.01"
                  placeholder="0,00"
                  value={newLog.amount}
                  onChange={e => setNewLog(p => ({ ...p, amount: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-log-amount"
                />
              </div>
              <div>
                <Label>Chilometraggio</Label>
                <Input
                  type="number"
                  placeholder="km"
                  value={newLog.km}
                  onChange={e => setNewLog(p => ({ ...p, km: e.target.value }))}
                  className="mt-1.5"
                  data-testid="input-log-km"
                />
              </div>
            </div>
            <div>
              <Label>Data</Label>
              <Input
                type="date"
                value={newLog.date}
                onChange={e => setNewLog(p => ({ ...p, date: e.target.value }))}
                className="mt-1.5"
                data-testid="input-log-date"
              />
            </div>
            <div>
              <Label>Note</Label>
              <Textarea
                value={newLog.notes}
                onChange={e => setNewLog(p => ({ ...p, notes: e.target.value }))}
                className="mt-1.5"
                data-testid="input-log-notes"
              />
            </div>
          </div>
          <SheetFooter className="mt-6">
            <Button
              className="w-full"
              onClick={() => addLogMutation.mutate({
                ...newLog,
                vehicleId: showAddLog,
                amount: parseFloat(newLog.amount) || null,
                km: parseInt(newLog.km) || null,
                date: new Date(newLog.date).toISOString()
              })}
              disabled={!newLog.title || addLogMutation.isPending}
              data-testid="button-save-log"
            >
              {addLogMutation.isPending ? "Salvo…" : "Registra attività"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </div>
  );
}
