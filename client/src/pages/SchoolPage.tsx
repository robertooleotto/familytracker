import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/auth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  GraduationCap, RefreshCw, Trash2, Plus, X, BookOpen,
  AlertCircle, CheckCircle, Clock, FileText, ChevronDown, ChevronUp,
} from "lucide-react";

type Platform = "classeviva" | "argo";

interface SchoolConnection {
  id: string;
  platform: Platform;
  studentName: string;
  schoolCode: string | null;
  username: string;
  lastSync: string | null;
  syncError: string | null;
}

interface SchoolGrade {
  id: string;
  subjectName: string;
  grade: number | null;
  gradeStr: string;
  type: string;
  date: string;
  notes: string;
}

interface SchoolAbsence {
  id: string;
  date: string;
  type: string;
  minutes: number | null;
  justified: boolean;
  notes: string;
}

interface SchoolHomework {
  id: string;
  subjectName: string;
  description: string;
  dueDate: string | null;
  givenAt: string | null;
  done: boolean;
}

interface SchoolNotice {
  id: string;
  title: string;
  content: string | null;
  date: string | null;
  read: boolean;
}

function gradeColor(g: number | null): string {
  if (g === null) return "text-muted-foreground";
  if (g >= 7) return "text-green-600 dark:text-green-400";
  if (g >= 6) return "text-yellow-600 dark:text-yellow-400";
  return "text-red-600 dark:text-red-400";
}

function gradeLabel(g: number | null, str: string): string {
  if (str && str !== "–") return str;
  if (g !== null) return g.toFixed(1);
  return "–";
}

function absenceIcon(type: string) {
  if (type === "ritardo") return <Clock className="w-4 h-4 text-yellow-500" />;
  if (type === "uscita_anticipata") return <ChevronDown className="w-4 h-4 text-orange-500" />;
  return <AlertCircle className="w-4 h-4 text-red-500" />;
}

function absenceLabel(type: string): string {
  if (type === "ritardo") return "Ritardo";
  if (type === "uscita_anticipata") return "Uscita anticipata";
  return "Assenza";
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "–";
  return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

function PlatformBadge({ p }: { p: Platform }) {
  return p === "classeviva"
    ? <Badge className="bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 text-[10px]">ClasseViva</Badge>
    : <Badge className="bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300 text-[10px]">Argo</Badge>;
}

function ConnectForm({ onClose }: { onClose: () => void }) {
  const { toast } = useToast();
  const [platform, setPlatform] = useState<Platform>("classeviva");
  const [studentName, setStudentName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [schoolCode, setSchoolCode] = useState("");

  const connect = useMutation({
    mutationFn: (body: any) => apiRequest("POST", "/api/school/connect", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school/connections"] });
      toast({ title: "Connesso!", description: "Registro scolastico collegato con successo." });
      onClose();
    },
    onError: (e: any) => toast({ title: "Errore connessione", description: e.message, variant: "destructive" }),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    connect.mutate({ platform, studentName, username, password, schoolCode: schoolCode || undefined });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-end justify-center" onClick={onClose}>
      <div className="bg-background w-full max-w-md rounded-t-2xl p-5 pb-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Collega registro scolastico</h3>
          <button onClick={onClose} data-testid="button-close-connect"><X className="w-5 h-5 text-muted-foreground" /></button>
        </div>

        <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-3 mb-4 text-xs text-amber-800 dark:text-amber-200">
          ⚠️ Le credenziali vengono usate solo per sincronizzare i dati scolastici e sono memorizzate in modo sicuro sul server.
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label className="text-xs">Piattaforma</Label>
            <Select value={platform} onValueChange={v => setPlatform(v as Platform)}>
              <SelectTrigger data-testid="select-platform" className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="classeviva">ClasseViva (Spaggiari)</SelectItem>
                <SelectItem value="argo">Argo ScuolaNext</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs">Nome studente</Label>
            <Input data-testid="input-student-name" className="mt-1" placeholder="Es. Marco Rossi" value={studentName} onChange={e => setStudentName(e.target.value)} required />
          </div>

          {platform === "argo" && (
            <div>
              <Label className="text-xs">Codice scuola</Label>
              <Input data-testid="input-school-code" className="mt-1" placeholder="Es. UDMM12345" value={schoolCode} onChange={e => setSchoolCode(e.target.value)} required />
              <p className="text-[10px] text-muted-foreground mt-1">Visibile nel portale Argo o dalla segreteria scolastica</p>
            </div>
          )}

          <div>
            <Label className="text-xs">Username / Codice fiscale</Label>
            <Input data-testid="input-school-username" className="mt-1" placeholder={platform === "classeviva" ? "Codice fiscale genitore" : "Username Argo"} value={username} onChange={e => setUsername(e.target.value)} required />
          </div>

          <div>
            <Label className="text-xs">Password</Label>
            <Input data-testid="input-school-password" className="mt-1" type="password" placeholder="Password del registro" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          <Button data-testid="button-connect-school" type="submit" className="w-full" disabled={connect.isPending}>
            {connect.isPending ? <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Connessione in corso…</> : "Collega registro"}
          </Button>
        </form>
      </div>
    </div>
  );
}

function ConnectionDetail({ conn }: { conn: SchoolConnection }) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"grades" | "absences" | "homework" | "notices">("grades");
  const [expandedNotice, setExpandedNotice] = useState<string | null>(null);

  const gradesQ = useQuery<SchoolGrade[]>({ queryKey: ["/api/school/grades", conn.id], queryFn: () => fetch(`/api/school/grades/${conn.id}`, { headers: getAuthHeaders() }).then(r => r.json()) });
  const absencesQ = useQuery<SchoolAbsence[]>({ queryKey: ["/api/school/absences", conn.id], queryFn: () => fetch(`/api/school/absences/${conn.id}`, { headers: getAuthHeaders() }).then(r => r.json()) });
  const homeworkQ = useQuery<SchoolHomework[]>({ queryKey: ["/api/school/homework", conn.id], queryFn: () => fetch(`/api/school/homework/${conn.id}`, { headers: getAuthHeaders() }).then(r => r.json()) });
  const noticesQ = useQuery<SchoolNotice[]>({ queryKey: ["/api/school/notices", conn.id], queryFn: () => fetch(`/api/school/notices/${conn.id}`, { headers: getAuthHeaders() }).then(r => r.json()) });

  const sync = useMutation({
    mutationFn: () => apiRequest("POST", `/api/school/sync/${conn.id}`, {}),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/school/grades", conn.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/school/absences", conn.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/school/homework", conn.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/school/notices", conn.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/school/connections"] });
      toast({ title: "Sincronizzato!", description: `${data.grades} voti · ${data.absences} assenze · ${data.homework} compiti` });
    },
    onError: (e: any) => toast({ title: "Errore sincronizzazione", description: e.message, variant: "destructive" }),
  });

  const toggleDone = useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) => apiRequest("PATCH", `/api/school/homework/${id}/done`, { done }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/school/homework", conn.id] }),
  });

  const tabs = [
    { id: "grades", label: "Voti", count: gradesQ.data?.length },
    { id: "absences", label: "Assenze", count: absencesQ.data?.length },
    { id: "homework", label: "Compiti", count: homeworkQ.data?.filter(h => !h.done).length },
    { id: "notices", label: "Avvisi", count: noticesQ.data?.length },
  ] as const;

  const grades = gradesQ.data || [];
  const absences = absencesQ.data || [];
  const homework = homeworkQ.data || [];
  const notices = noticesQ.data || [];

  const gradesBySubject = grades.reduce((acc: Record<string, SchoolGrade[]>, g) => {
    if (!acc[g.subjectName]) acc[g.subjectName] = [];
    acc[g.subjectName].push(g);
    return acc;
  }, {});

  const isEmpty = (q: any) => !q.isLoading && (q.data?.length ?? 0) === 0;

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2.5 bg-muted/30">
        <GraduationCap className="w-4 h-4 text-primary" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{conn.studentName}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
            <PlatformBadge p={conn.platform} />
            {conn.lastSync && <span className="text-[10px] text-muted-foreground">Sync {fmtDate(conn.lastSync)}</span>}
            {conn.syncError && <span className="text-[10px] text-red-500 truncate">{conn.syncError}</span>}
          </div>
        </div>
        <Button data-testid={`button-sync-${conn.id}`} size="sm" variant="outline" className="h-7 text-xs px-2 gap-1" onClick={() => sync.mutate()} disabled={sync.isPending}>
          <RefreshCw className={`w-3.5 h-3.5 ${sync.isPending ? "animate-spin" : ""}`} />
          {sync.isPending ? "…" : "Sync"}
        </Button>
      </div>

      {conn.lastSync && (
        <>
          <div className="flex border-b border-border">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                data-testid={`tab-school-${t.id}`}
                className={`flex-1 py-2 text-[11px] font-medium transition-colors relative ${tab === t.id ? "text-primary border-b-2 border-primary" : "text-muted-foreground hover:text-foreground"}`}
              >
                {t.label}
                {(t.count ?? 0) > 0 && (
                  <span className="ml-1 text-[10px] bg-primary/10 text-primary rounded-full px-1.5">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="max-h-72 overflow-y-auto">
            {tab === "grades" && (
              <div className="divide-y divide-border">
                {gradesQ.isLoading && <p className="text-xs text-muted-foreground p-4 text-center">Caricamento…</p>}
                {isEmpty(gradesQ) && <p className="text-xs text-muted-foreground p-4 text-center">Nessun voto registrato</p>}
                {Object.entries(gradesBySubject).map(([subject, gs]) => {
                  const avg = gs.filter(g => g.grade !== null).reduce((s, g) => s + g.grade!, 0) / (gs.filter(g => g.grade !== null).length || 1);
                  return (
                    <div key={subject} className="px-3 py-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-xs font-semibold">{subject}</p>
                        <span className={`text-xs font-bold ${gradeColor(avg)}`}>media {avg.toFixed(1)}</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {gs.map(g => (
                          <div key={g.id} data-testid={`grade-${g.id}`} className="flex flex-col items-center bg-muted/40 rounded-lg px-2 py-1 min-w-[48px]">
                            <span className={`text-base font-black leading-none ${gradeColor(g.grade)}`}>{gradeLabel(g.grade, g.gradeStr)}</span>
                            <span className="text-[9px] text-muted-foreground mt-0.5">{fmtDate(g.date)}</span>
                            {g.type && <span className="text-[9px] text-muted-foreground">{g.type}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === "absences" && (
              <div className="divide-y divide-border">
                {absencesQ.isLoading && <p className="text-xs text-muted-foreground p-4 text-center">Caricamento…</p>}
                {isEmpty(absencesQ) && <p className="text-xs text-muted-foreground p-4 text-center">Nessuna assenza registrata 🎉</p>}
                {absences.map(a => (
                  <div key={a.id} data-testid={`absence-${a.id}`} className="flex items-center gap-2 px-3 py-2">
                    {absenceIcon(a.type)}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium">{absenceLabel(a.type)}</p>
                      {a.notes && <p className="text-[11px] text-muted-foreground truncate">{a.notes}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-[11px] text-muted-foreground">{fmtDate(a.date)}</p>
                      {a.justified
                        ? <span className="text-[10px] text-green-600 flex items-center gap-0.5 justify-end"><CheckCircle className="w-3 h-3" />Giustificata</span>
                        : <span className="text-[10px] text-orange-500">Da giustificare</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {tab === "homework" && (
              <div className="divide-y divide-border">
                {homeworkQ.isLoading && <p className="text-xs text-muted-foreground p-4 text-center">Caricamento…</p>}
                {isEmpty(homeworkQ) && <p className="text-xs text-muted-foreground p-4 text-center">Nessun compito assegnato</p>}
                {homework.map(h => (
                  <div key={h.id} data-testid={`homework-${h.id}`} className={`flex items-start gap-2 px-3 py-2 ${h.done ? "opacity-50" : ""}`}>
                    <button
                      data-testid={`button-done-${h.id}`}
                      onClick={() => toggleDone.mutate({ id: h.id, done: !h.done })}
                      className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${h.done ? "bg-green-500 border-green-500" : "border-border"}`}
                    >
                      {h.done && <CheckCircle className="w-3 h-3 text-white" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-semibold ${h.done ? "line-through" : ""}`}>{h.subjectName}</p>
                      <p className="text-[11px] text-muted-foreground">{h.description}</p>
                    </div>
                    {h.dueDate && (
                      <span className="text-[10px] text-muted-foreground flex-shrink-0">{fmtDate(h.dueDate)}</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {tab === "notices" && (
              <div className="divide-y divide-border">
                {noticesQ.isLoading && <p className="text-xs text-muted-foreground p-4 text-center">Caricamento…</p>}
                {isEmpty(noticesQ) && <p className="text-xs text-muted-foreground p-4 text-center">Nessuna comunicazione</p>}
                {notices.map(n => (
                  <div key={n.id} data-testid={`notice-${n.id}`} className="px-3 py-2">
                    <button className="w-full text-left" onClick={() => setExpandedNotice(expandedNotice === n.id ? null : n.id)}>
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                          <p className="text-xs font-medium truncate">{n.title}</p>
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {n.date && <span className="text-[10px] text-muted-foreground">{fmtDate(n.date)}</span>}
                          {expandedNotice === n.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                        </div>
                      </div>
                    </button>
                    {expandedNotice === n.id && n.content && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">{n.content}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {!conn.lastSync && (
        <div className="p-4 text-center">
          <p className="text-xs text-muted-foreground mb-2">Mai sincronizzato. Premi Sync per caricare i dati.</p>
          <Button data-testid={`button-first-sync-${conn.id}`} size="sm" onClick={() => sync.mutate()} disabled={sync.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${sync.isPending ? "animate-spin" : ""}`} />
            {sync.isPending ? "Sincronizzazione…" : "Prima sincronizzazione"}
          </Button>
        </div>
      )}
    </div>
  );
}

function DeleteConfirm({ conn, onClose }: { conn: SchoolConnection; onClose: () => void }) {
  const { toast } = useToast();
  const del = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/school/connections/${conn.id}`, undefined),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/school/connections"] });
      toast({ title: "Connessione rimossa" });
      onClose();
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });
  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center px-4" onClick={onClose}>
      <div className="bg-background rounded-2xl p-5 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="font-semibold text-sm mb-1">Rimuovi connessione</h3>
        <p className="text-xs text-muted-foreground mb-4">Verranno eliminati tutti i voti, assenze e compiti di <strong>{conn.studentName}</strong> salvati localmente.</p>
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Annulla</Button>
          <Button variant="destructive" className="flex-1" onClick={() => del.mutate()} disabled={del.isPending} data-testid="button-confirm-delete-school">
            {del.isPending ? "Rimozione…" : "Rimuovi"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function SchoolPage() {
  const [showForm, setShowForm] = useState(false);
  const [deleting, setDeleting] = useState<SchoolConnection | null>(null);

  const { data: connections = [], isLoading } = useQuery<SchoolConnection[]>({
    queryKey: ["/api/school/connections"],
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-semibold text-sm">Registri scolastici</h2>
            <p className="text-xs text-muted-foreground">ClasseViva e Argo sincronizzati</p>
          </div>
          <Button data-testid="button-add-school" size="sm" onClick={() => setShowForm(true)} className="gap-1.5">
            <Plus className="w-4 h-4" />
            Collega
          </Button>
        </div>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-24 bg-muted/30 rounded-xl animate-pulse" />)}
          </div>
        )}

        {!isLoading && connections.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mb-4">
              <GraduationCap className="w-8 h-8 text-primary" />
            </div>
            <h3 className="font-semibold mb-1">Nessun registro collegato</h3>
            <p className="text-xs text-muted-foreground mb-4">Collega ClasseViva o Argo per vedere voti, assenze e compiti direttamente nell'app.</p>
            <p className="text-[11px] text-muted-foreground bg-muted/30 rounded-lg px-3 py-2 mb-4">
              Supporta il <strong>70% delle scuole italiane</strong>: ClasseViva (Spaggiari) e Argo ScuolaNext
            </p>
            <Button data-testid="button-add-school-empty" onClick={() => setShowForm(true)} className="gap-2">
              <BookOpen className="w-4 h-4" />
              Collega registro
            </Button>
          </div>
        )}

        {connections.length > 0 && (
          <div className="space-y-3">
            {connections.map(conn => (
              <div key={conn.id} className="relative">
                <ConnectionDetail conn={conn} />
                <button
                  data-testid={`button-delete-school-${conn.id}`}
                  onClick={() => setDeleting(conn)}
                  className="absolute top-2 right-16 p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="bg-muted/20 rounded-xl p-3 text-[11px] text-muted-foreground space-y-1">
          <p className="font-medium text-foreground text-xs">ℹ️ Come funziona</p>
          <p>Le credenziali vengono usate solo per sincronizzare i dati con i server scolastici. Le API usate sono non ufficiali ma ampiamente utilizzate dalla community.</p>
          <p>Dal <strong>2026</strong> l'accesso richiederà SPID/CIE: aggiorneremo l'integrazione di conseguenza.</p>
        </div>
      </div>

      {showForm && <ConnectForm onClose={() => setShowForm(false)} />}
      {deleting && <DeleteConfirm conn={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}
