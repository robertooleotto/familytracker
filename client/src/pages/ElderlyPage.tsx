import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Heart, Phone, Pill, AlertTriangle, CheckCircle2,
  Activity, Thermometer, Droplets, Scale, Wind, Plus,
  MapPin, Shield, Bell, FileText,
} from "lucide-react";
import { format } from "date-fns";
import { it } from "date-fns/locale";

type VitalType = "blood_pressure" | "blood_sugar" | "heart_rate" | "weight" | "temperature" | "oxygen";
const VITAL_CONFIG: Record<VitalType, { label: string; unit: string; icon: any; color: string; hasValue2?: boolean; v2Label?: string }> = {
  blood_pressure: { label: "Pressione", unit: "mmHg", icon: Activity, color: "#DC2626", hasValue2: true, v2Label: "Diastolica" },
  blood_sugar: { label: "Glicemia", unit: "mg/dl", icon: Droplets, color: "#F59E0B" },
  heart_rate: { label: "Battito", unit: "bpm", icon: Heart, color: "#EC4899" },
  weight: { label: "Peso", unit: "kg", icon: Scale, color: "#3B82F6" },
  temperature: { label: "Temperatura", unit: "°C", icon: Thermometer, color: "#EF4444" },
  oxygen: { label: "Saturazione O₂", unit: "%", icon: Wind, color: "#06B6D4" },
};

export default function ElderlyPage() {
  const { profile } = useAuth();
  const isElderly = profile?.role === "elderly";

  if (isElderly) return <ElderlySimplifiedView />;
  return <CaregiverDashboard />;
}

// ─── SIMPLIFIED VIEW FOR ELDERLY USERS ──────────────────────────────────────
function ElderlySimplifiedView() {
  const { profile } = useAuth();
  const { toast } = useToast();

  const { data: todayCheckin } = useQuery({ queryKey: ["/api/elderly/checkin/today"] });
  const { data: todayMeds } = useQuery({ queryKey: [`/api/elderly/meds/today/${profile?.id}`], enabled: !!profile });

  const checkinMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/elderly/checkin", body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/elderly/checkin/today"] });
      toast({ title: "Registrato!" });
    },
  });

  const medConfirmMut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/elderly/meds/confirm", body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [`/api/elderly/meds/today/${profile?.id}`] });
      toast({ title: "Medicina confermata!" });
    },
  });

  const sosMut = useMutation({
    mutationFn: () => {
      return new Promise<any>((resolve, reject) => {
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition(
            pos => apiRequest("POST", "/api/elderly/fall-detected", { lat: pos.coords.latitude, lng: pos.coords.longitude, impactG: 0 }).then(r => r.json()).then(resolve).catch(reject),
            () => apiRequest("POST", "/api/elderly/fall-detected", { impactG: 0 }).then(r => r.json()).then(resolve).catch(reject),
            { timeout: 5000 }
          );
        } else {
          apiRequest("POST", "/api/elderly/fall-detected", { impactG: 0 }).then(r => r.json()).then(resolve).catch(reject);
        }
      });
    },
    onSuccess: () => toast({ title: "SOS inviato!", description: "La famiglia è stata avvisata." }),
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const checkedIn = todayCheckin && (todayCheckin as any).status !== "pending";

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">
        <button
          data-testid="button-sos"
          onClick={() => { if (confirm("Inviare SOS alla famiglia?")) sosMut.mutate(); }}
          disabled={sosMut.isPending}
          className="w-full py-8 rounded-2xl bg-red-600 hover:bg-red-700 active:bg-red-800 text-white text-center transition-colors"
        >
          <AlertTriangle className="w-12 h-12 mx-auto mb-2" />
          <span className="text-2xl font-bold block">{sosMut.isPending ? "Invio in corso…" : "SOS — Ho bisogno di aiuto"}</span>
          <span className="text-sm opacity-80 block mt-1">Invia posizione e avvisa la famiglia</span>
        </button>

        <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
          <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Come stai oggi?</p>
          {checkedIn ? (
            <div className="flex items-center gap-3 py-2">
              <CheckCircle2 className="w-8 h-8 text-green-500" />
              <div>
                <p className="font-semibold text-green-700 dark:text-green-400">
                  {(todayCheckin as any).status === "ok" ? "Hai segnalato: Tutto bene!" : "Hai chiesto aiuto"}
                </p>
                {(todayCheckin as any).respondedAt && (
                  <p className="text-xs text-muted-foreground">alle {format(new Date((todayCheckin as any).respondedAt), "HH:mm")}</p>
                )}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <button
                data-testid="button-checkin-ok"
                onClick={() => checkinMut.mutate({ status: "ok", mood: "good" })}
                disabled={checkinMut.isPending}
                className="py-6 rounded-xl bg-green-100 dark:bg-green-950/40 hover:bg-green-200 dark:hover:bg-green-950/60 text-center transition-colors"
              >
                <CheckCircle2 className="w-10 h-10 text-green-600 mx-auto mb-1" />
                <span className="text-lg font-bold text-green-700 dark:text-green-400">Sto bene</span>
              </button>
              <button
                data-testid="button-checkin-help"
                onClick={() => checkinMut.mutate({ status: "help", mood: "bad" })}
                disabled={checkinMut.isPending}
                className="py-6 rounded-xl bg-amber-100 dark:bg-amber-950/40 hover:bg-amber-200 dark:hover:bg-amber-950/60 text-center transition-colors"
              >
                <Phone className="w-10 h-10 text-amber-600 mx-auto mb-1" />
                <span className="text-lg font-bold text-amber-700 dark:text-amber-400">Chiamatemi</span>
              </button>
            </div>
          )}
        </div>

        {Array.isArray(todayMeds) && todayMeds.length > 0 && (
          <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
            <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Medicine di oggi</p>
            {(todayMeds as any[]).map((med: any) => (
              <div key={med.id} data-testid={`row-med-${med.id}`} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                <div className="flex items-center gap-3">
                  <Pill className={`w-5 h-5 ${med.status === "taken" ? "text-green-500" : "text-amber-500"}`} />
                  <div>
                    <p className="font-medium text-sm">{med.scheduledTime}</p>
                  </div>
                </div>
                {med.status === "taken" ? (
                  <span className="text-xs font-semibold text-green-600 bg-green-100 dark:bg-green-950/40 px-3 py-1 rounded-full">Presa</span>
                ) : (
                  <Button size="sm" data-testid={`button-med-taken-${med.id}`} onClick={() => medConfirmMut.mutate({ medicationId: med.medicationId, scheduledTime: med.scheduledTime, status: "taken" })}>
                    Presa!
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CAREGIVER DASHBOARD ────────────────────────────────────────────────────
function CaregiverDashboard() {
  const { toast } = useToast();
  const [selectedElderly, setSelectedElderly] = useState<string | null>(null);
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [showEmergencyCard, setShowEmergencyCard] = useState(false);

  const { data: elderlyMembers, isLoading } = useQuery<any[]>({ queryKey: ["/api/elderly/members"] });
  const { data: unackAlerts } = useQuery<any[]>({ queryKey: ["/api/elderly/alerts/unacknowledged"] });

  const activePid = selectedElderly || elderlyMembers?.[0]?.id;

  const { data: dashboard, isLoading: loadingDash } = useQuery<any>({
    queryKey: [`/api/elderly/dashboard/${activePid}`],
    enabled: !!activePid,
    refetchInterval: 60000,
  });

  const ackMut = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/elderly/alerts/${id}/acknowledge`).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/elderly/alerts/unacknowledged"] });
      queryClient.invalidateQueries({ queryKey: [`/api/elderly/dashboard/${activePid}`] });
      toast({ title: "Avviso archiviato" });
    },
  });

  if (isLoading) return (
    <div className="flex-1 overflow-y-auto p-4 space-y-3">
      {[1,2,3].map(i => <Skeleton key={i} className="h-24 w-full rounded-2xl" />)}
    </div>
  );

  if (!elderlyMembers?.length) return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="rounded-2xl border border-border bg-muted/30 p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-2xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center mx-auto">
          <Heart className="w-8 h-8 text-red-600" />
        </div>
        <div>
          <h3 className="font-semibold text-base mb-1">Nessun anziano nella famiglia</h3>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Per attivare il monitoraggio anziani, modifica il ruolo di un membro della famiglia in "Anziano" nelle Impostazioni del profilo.
          </p>
        </div>
        <div className="text-left bg-background rounded-xl border border-border p-4 space-y-2">
          <ol className="text-sm space-y-2">
            <li className="flex gap-2"><span className="font-bold text-primary">1.</span>Vai su Impostazioni → seleziona il profilo dell'anziano</li>
            <li className="flex gap-2"><span className="font-bold text-primary">2.</span>Cambia il ruolo da "Genitore" a "Anziano"</li>
            <li className="flex gap-2"><span className="font-bold text-primary">3.</span>Attiva il tracciamento nelle impostazioni del profilo</li>
          </ol>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">
        {unackAlerts && unackAlerts.length > 0 && (
          <div className="rounded-2xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm font-semibold text-red-700 dark:text-red-400">{unackAlerts.length} avviso/i da gestire</p>
            </div>
            {unackAlerts.slice(0, 3).map((al: any) => (
              <div key={al.id} data-testid={`row-alert-${al.id}`} className="flex items-center justify-between bg-white dark:bg-red-950/20 rounded-xl px-3 py-2">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${al.severity === "critical" ? "bg-red-500" : "bg-amber-500"}`} />
                  <p className="text-xs font-medium truncate">{al.title}</p>
                </div>
                <Button size="sm" variant="ghost" className="text-xs h-7" data-testid={`button-ack-${al.id}`} onClick={() => ackMut.mutate(al.id)}>Visto</Button>
              </div>
            ))}
            {unackAlerts.length > 3 && (
              <p className="text-xs text-red-600 font-medium">+{unackAlerts.length - 3} altri avvisi</p>
            )}
          </div>
        )}

        {elderlyMembers.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {elderlyMembers.map((m: any) => (
              <button
                key={m.id}
                data-testid={`button-member-${m.id}`}
                onClick={() => setSelectedElderly(m.id)}
                className={`px-4 py-2 rounded-xl text-sm font-medium flex-shrink-0 transition-colors ${
                  activePid === m.id ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {m.name}
              </button>
            ))}
          </div>
        )}

        {loadingDash ? (
          <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-20 w-full rounded-2xl" />)}</div>
        ) : dashboard ? (
          <>
            <div className="grid grid-cols-2 gap-3">
              <StatusCard label="Check-in oggi" status={dashboard.statuses?.checkin} detail={dashboard.todayCheckin?.status === "ok" ? "Sta bene" : dashboard.todayCheckin?.status === "help" ? "Ha chiesto aiuto!" : "In attesa"} />
              <StatusCard label="Alert attivi" status={dashboard.statuses?.alerts} detail={`${dashboard.unackAlerts?.length || 0} da gestire`} />
              <StatusCard label="Medicine" status={dashboard.statuses?.medications} detail={dashboard.medicationAdherence != null ? `${dashboard.medicationAdherence}% aderenza` : "Nessuna"} />
              <StatusCard label="Posizione" status={dashboard.statuses?.location} detail={dashboard.location ? format(new Date(dashboard.location.timestamp), "HH:mm", { locale: it }) : "Non disponibile"} />
            </div>

            {dashboard.location && (
              <div className="rounded-2xl border border-border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-primary" />
                    <span className="text-sm font-medium">Ultima posizione</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{format(new Date(dashboard.location.timestamp), "HH:mm dd/MM", { locale: it })}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Lat {dashboard.location.lat?.toFixed(4)}, Lng {dashboard.location.lng?.toFixed(4)}
                  {dashboard.location.batteryPct != null && ` · Batteria: ${dashboard.location.batteryPct}%`}
                </p>
              </div>
            )}

            {dashboard.latestVitals && Object.keys(dashboard.latestVitals).length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Parametri vitali</p>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid="button-add-vital" onClick={() => setShowVitalForm(!showVitalForm)}>
                    <Plus className="w-3 h-3 mr-1" /> Aggiungi
                  </Button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {Object.entries(dashboard.latestVitals).map(([type, v]: [string, any]) => {
                    const cfg = VITAL_CONFIG[type as VitalType];
                    if (!cfg) return null;
                    const Icon = cfg.icon;
                    return (
                      <div key={type} data-testid={`card-vital-${type}`} className="rounded-xl border border-border bg-card p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-4 h-4" style={{ color: cfg.color }} />
                          <span className="text-xs text-muted-foreground">{cfg.label}</span>
                        </div>
                        <p className="text-lg font-bold">
                          {v.value}{v.value2 ? `/${v.value2}` : ""} <span className="text-xs font-normal text-muted-foreground">{cfg.unit}</span>
                        </p>
                        <p className="text-xs text-muted-foreground">{format(new Date(v.measuredAt), "dd/MM HH:mm", { locale: it })}</p>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {!dashboard.latestVitals || Object.keys(dashboard.latestVitals).length === 0 ? (
              <div className="rounded-2xl border border-border bg-card p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Nessun parametro vitale registrato</span>
                </div>
                <Button size="sm" variant="outline" data-testid="button-add-vital-empty" onClick={() => setShowVitalForm(true)}>
                  <Plus className="w-3 h-3 mr-1" /> Aggiungi
                </Button>
              </div>
            ) : null}

            {showVitalForm && (
              <VitalSignForm
                profileId={activePid!}
                onDone={() => {
                  setShowVitalForm(false);
                  queryClient.invalidateQueries({ queryKey: [`/api/elderly/dashboard/${activePid}`] });
                }}
              />
            )}

            {dashboard.recentCheckins?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Storico check-in</p>
                <div className="space-y-1">
                  {dashboard.recentCheckins.slice(0, 7).map((c: any) => (
                    <div key={c.id} data-testid={`row-checkin-${c.id}`} className="flex items-center justify-between py-1.5 px-3 rounded-lg bg-muted/30">
                      <span className="text-xs">{c.date}</span>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        c.status === "ok" ? "bg-green-100 text-green-700 dark:bg-green-950/40 dark:text-green-400" :
                        c.status === "help" ? "bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-400" :
                        c.status === "missed" ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400" :
                        "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      }`}>
                        {c.status === "ok" ? "Bene" : c.status === "help" ? "Aiuto" : c.status === "missed" ? "Saltato" : "In attesa"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Scheda emergenza</p>
                <Button size="sm" variant="ghost" className="h-7 text-xs" data-testid="button-emergency-card" onClick={() => setShowEmergencyCard(!showEmergencyCard)}>
                  <FileText className="w-3 h-3 mr-1" /> {dashboard.emergencyCard ? "Modifica" : "Crea"}
                </Button>
              </div>
              {dashboard.emergencyCard && !showEmergencyCard && (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-2">
                  <p className="font-semibold text-sm">{dashboard.emergencyCard.fullName}</p>
                  {dashboard.emergencyCard.bloodType && <p className="text-xs">Gruppo sanguigno: <span className="font-bold text-red-600">{dashboard.emergencyCard.bloodType}</span></p>}
                  {dashboard.emergencyCard.allergies?.length > 0 && <p className="text-xs">Allergie: {dashboard.emergencyCard.allergies.join(", ")}</p>}
                  {dashboard.emergencyCard.conditions?.length > 0 && <p className="text-xs">Patologie: {dashboard.emergencyCard.conditions.join(", ")}</p>}
                  {dashboard.emergencyCard.currentMedications?.length > 0 && <p className="text-xs">Farmaci: {dashboard.emergencyCard.currentMedications.join(", ")}</p>}
                  {dashboard.emergencyCard.doctorName && <p className="text-xs">Medico: {dashboard.emergencyCard.doctorName} {dashboard.emergencyCard.doctorPhone && `— ${dashboard.emergencyCard.doctorPhone}`}</p>}
                  {dashboard.emergencyCard.emergencyContact1Name && <p className="text-xs">Contatto 1: {dashboard.emergencyCard.emergencyContact1Name} — {dashboard.emergencyCard.emergencyContact1Phone}</p>}
                  {dashboard.emergencyCard.emergencyContact2Name && <p className="text-xs">Contatto 2: {dashboard.emergencyCard.emergencyContact2Name} — {dashboard.emergencyCard.emergencyContact2Phone}</p>}
                </div>
              )}
              {showEmergencyCard && (
                <EmergencyCardForm
                  profileId={activePid!}
                  existing={dashboard.emergencyCard}
                  onDone={() => {
                    setShowEmergencyCard(false);
                    queryClient.invalidateQueries({ queryKey: [`/api/elderly/dashboard/${activePid}`] });
                  }}
                />
              )}
            </div>

            {dashboard.recentAlerts?.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Ultimi alert</p>
                {dashboard.recentAlerts.slice(0, 5).map((al: any) => (
                  <div key={al.id} data-testid={`row-recent-alert-${al.id}`} className="flex items-start gap-2 py-2 px-3 rounded-xl border border-border bg-card">
                    <span className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${al.severity === "critical" ? "bg-red-500" : al.severity === "warning" ? "bg-amber-500" : "bg-blue-500"}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{al.title}</p>
                      {al.description && <p className="text-xs text-muted-foreground">{al.description}</p>}
                      <p className="text-xs text-muted-foreground mt-0.5">{format(new Date(al.createdAt), "dd/MM HH:mm", { locale: it })}</p>
                    </div>
                    {al.acknowledged && <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />}
                  </div>
                ))}
              </div>
            )}
          </>
        ) : null}

        <p className="text-center text-xs text-muted-foreground pb-2 flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" /> Dati protetti · Aggiornamento ogni 60 secondi
        </p>
      </div>
    </div>
  );
}

// ─── STATUS CARD ────────────────────────────────────────────────────────────
function StatusCard({ label, status, detail }: { label: string; status?: "green" | "yellow" | "red"; detail: string }) {
  const colors = {
    green: "border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/20",
    yellow: "border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20",
    red: "border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20",
  };
  const dots = { green: "bg-green-500", yellow: "bg-amber-500", red: "bg-red-500" };
  const s = status || "yellow";
  return (
    <div className={`rounded-xl border p-3 ${colors[s]}`} data-testid={`card-status-${label.toLowerCase().replace(/ /g, "-")}`}>
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`w-2 h-2 rounded-full ${dots[s]}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-sm font-semibold">{detail}</p>
    </div>
  );
}

// ─── VITAL SIGN FORM ────────────────────────────────────────────────────────
function VitalSignForm({ profileId, onDone }: { profileId: string; onDone: () => void }) {
  const { toast } = useToast();
  const [type, setType] = useState<VitalType>("blood_pressure");
  const [value, setValue] = useState("");
  const [value2, setValue2] = useState("");

  const mut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/elderly/vitals", body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Valore registrato" }); onDone(); },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const cfg = VITAL_CONFIG[type];
  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">Inserisci valore</p>
      <select data-testid="select-vital-type" value={type} onChange={e => setType(e.target.value as VitalType)} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background">
        {Object.entries(VITAL_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label} ({v.unit})</option>)}
      </select>
      <div className="flex gap-2">
        <input data-testid="input-vital-value" type="number" placeholder={cfg.hasValue2 ? "Sistolica" : cfg.label} value={value} onChange={e => setValue(e.target.value)} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background" />
        {cfg.hasValue2 && <input data-testid="input-vital-value2" type="number" placeholder={cfg.v2Label || "Valore 2"} value={value2} onChange={e => setValue2(e.target.value)} className="flex-1 rounded-lg border border-border px-3 py-2 text-sm bg-background" />}
      </div>
      <div className="flex gap-2">
        <Button data-testid="button-save-vital" className="flex-1" disabled={!value || mut.isPending} onClick={() => mut.mutate({ profileId, type, value, value2: value2 || undefined, unit: cfg.unit })}>
          {mut.isPending ? "Salvataggio…" : "Salva"}
        </Button>
        <Button variant="outline" onClick={onDone}>Annulla</Button>
      </div>
    </div>
  );
}

// ─── EMERGENCY CARD FORM ────────────────────────────────────────────────────
function EmergencyCardForm({ profileId, existing, onDone }: { profileId: string; existing?: any; onDone: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    fullName: existing?.fullName || "", dateOfBirth: existing?.dateOfBirth || "", bloodType: existing?.bloodType || "",
    allergies: existing?.allergies?.join(", ") || "", conditions: existing?.conditions?.join(", ") || "",
    currentMedications: existing?.currentMedications?.join(", ") || "",
    doctorName: existing?.doctorName || "", doctorPhone: existing?.doctorPhone || "",
    emergencyContact1Name: existing?.emergencyContact1Name || "", emergencyContact1Phone: existing?.emergencyContact1Phone || "",
    emergencyContact1Relation: existing?.emergencyContact1Relation || "",
    emergencyContact2Name: existing?.emergencyContact2Name || "", emergencyContact2Phone: existing?.emergencyContact2Phone || "",
    emergencyContact2Relation: existing?.emergencyContact2Relation || "",
    notes: existing?.notes || "",
  });

  const mut = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/elderly/emergency-card", body).then(r => r.json()),
    onSuccess: () => { toast({ title: "Scheda emergenza salvata" }); onDone(); },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const field = (label: string, key: string, placeholder?: string, type = "text") => (
    <div>
      <label className="text-xs text-muted-foreground block mb-1">{label}</label>
      <input data-testid={`input-emergency-${key}`} type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} placeholder={placeholder || label}
        className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background" />
    </div>
  );

  return (
    <div className="rounded-2xl border-2 border-primary/30 bg-card p-4 space-y-3">
      <p className="text-sm font-semibold">Scheda medica d'emergenza</p>
      {field("Nome completo", "fullName")}
      <div className="grid grid-cols-2 gap-2">
        {field("Data di nascita", "dateOfBirth", "GG/MM/AAAA")}
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Gruppo sanguigno</label>
          <select data-testid="select-blood-type" value={form.bloodType} onChange={e => setForm(f => ({ ...f, bloodType: e.target.value }))} className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background">
            <option value="">---</option>
            {["A+","A-","B+","B-","AB+","AB-","0+","0-"].map(bt => <option key={bt} value={bt}>{bt}</option>)}
          </select>
        </div>
      </div>
      {field("Allergie (separate da virgola)", "allergies", "es. Penicillina, Lattosio")}
      {field("Patologie croniche", "conditions", "es. Diabete tipo 2, Ipertensione")}
      {field("Farmaci attuali", "currentMedications", "es. Metformina 500mg, Ramipril 5mg")}
      <div className="grid grid-cols-2 gap-2">
        {field("Medico di base", "doctorName")}
        {field("Tel. medico", "doctorPhone", "+39...")}
      </div>
      <p className="text-xs font-semibold text-muted-foreground mt-2">Contatto emergenza 1</p>
      <div className="grid grid-cols-3 gap-2">
        {field("Nome", "emergencyContact1Name")}
        {field("Telefono", "emergencyContact1Phone")}
        {field("Relazione", "emergencyContact1Relation", "Figlio/a")}
      </div>
      <p className="text-xs font-semibold text-muted-foreground mt-2">Contatto emergenza 2</p>
      <div className="grid grid-cols-3 gap-2">
        {field("Nome", "emergencyContact2Name")}
        {field("Telefono", "emergencyContact2Phone")}
        {field("Relazione", "emergencyContact2Relation", "Nipote")}
      </div>
      {field("Note aggiuntive", "notes", "Altre informazioni importanti")}
      <div className="flex gap-2">
        <Button data-testid="button-save-emergency-card" className="flex-1" disabled={!form.fullName || mut.isPending} onClick={() => mut.mutate({
          profileId, fullName: form.fullName, dateOfBirth: form.dateOfBirth || null, bloodType: form.bloodType || null,
          allergies: form.allergies.split(",").map((s: string) => s.trim()).filter(Boolean),
          conditions: form.conditions.split(",").map((s: string) => s.trim()).filter(Boolean),
          currentMedications: form.currentMedications.split(",").map((s: string) => s.trim()).filter(Boolean),
          doctorName: form.doctorName || null, doctorPhone: form.doctorPhone || null,
          emergencyContact1Name: form.emergencyContact1Name || null, emergencyContact1Phone: form.emergencyContact1Phone || null,
          emergencyContact1Relation: form.emergencyContact1Relation || null,
          emergencyContact2Name: form.emergencyContact2Name || null, emergencyContact2Phone: form.emergencyContact2Phone || null,
          emergencyContact2Relation: form.emergencyContact2Relation || null,
          notes: form.notes || null,
        })}>
          {mut.isPending ? "Salvataggio…" : "Salva scheda"}
        </Button>
        <Button variant="outline" onClick={onDone}>Annulla</Button>
      </div>
    </div>
  );
}
