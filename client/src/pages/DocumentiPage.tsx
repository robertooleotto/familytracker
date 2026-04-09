import { useState, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { getAuthHeaders } from "@/lib/auth";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  FileText, Plus, Lock, Globe, Trash2, Download, Eye, ChevronRight,
  IdCard, Heart, BookOpen, Receipt, Wrench, ShieldCheck, Home, User,
  AlertTriangle, Upload, X, ScanLine,
} from "lucide-react";
import { DocumentScanner } from "@/components/DocumentScanner";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Profile { id: string; name: string; colorHex: string; role: string; }
interface Doc {
  id: string; familyId: string; profileId: string | null; section: string;
  category: string; title: string; notes: string | null; fileName: string | null;
  mimeType: string | null; fileSize: number | null; isPrivate: boolean;
  expiresAt: string | null; createdAt: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const PERSONAL_CATEGORIES = [
  { id: "carta_identita",    label: "Carta d'identità",  icon: IdCard },
  { id: "tessera_sanitaria", label: "Tessera sanitaria", icon: Heart },
  { id: "passaporto",        label: "Passaporto",        icon: BookOpen },
  { id: "patente",           label: "Patente",           icon: FileText },
  { id: "codice_fiscale",    label: "Codice fiscale",    icon: ShieldCheck },
  { id: "altro_personale",   label: "Altro",             icon: FileText },
];

const HOUSE_CATEGORIES = [
  { id: "manuale",     label: "Manuale istruzioni", icon: BookOpen },
  { id: "garanzia",   label: "Garanzia",            icon: ShieldCheck },
  { id: "scontrino",  label: "Scontrino",           icon: Receipt },
  { id: "contratto",  label: "Contratto",           icon: FileText },
  { id: "bolletta",   label: "Bolletta",             icon: Home },
  { id: "certificato",label: "Certificato",          icon: ShieldCheck },
  { id: "altro_casa", label: "Altro",                icon: FileText },
];

function categoryLabel(cat: string, section: string) {
  const list = section === "personal" ? PERSONAL_CATEGORIES : HOUSE_CATEGORIES;
  return list.find(c => c.id === cat)?.label ?? cat;
}

function categoryIcon(cat: string, section: string) {
  const list = section === "personal" ? PERSONAL_CATEGORIES : HOUSE_CATEGORIES;
  const C = list.find(c => c.id === cat)?.icon ?? FileText;
  return C;
}

function formatBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function isExpiringSoon(dateStr: string | null): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const now = new Date();
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= 0 && diff <= 60;
}

function isExpired(dateStr: string | null): boolean {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}

// ─── Upload helpers ───────────────────────────────────────────────────────────
/**
 * Two-step upload to Supabase Storage:
 *  1. Ask our backend to mint a signed upload URL (server holds the service-role key).
 *  2. PUT the file directly to that URL — the request bypasses our server entirely
 *     so there's no streaming bottleneck and no need to buffer the upload in Express.
 */
async function uploadToObjectStorage(
  file: File,
  token: string,
): Promise<{ objectPath: string; fileName: string; mimeType: string; fileSize: number }> {
  const res = await fetch("/api/documents/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileName: file.name, contentType: file.type, fileSize: file.size }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.message ?? "Impossibile ottenere URL di upload");
  }
  const { signedUrl, objectPath } = await res.json();

  // Supabase signed upload URLs accept a plain PUT with the raw bytes as body.
  const putRes = await fetch(signedUrl, {
    method: "PUT",
    headers: { "Content-Type": file.type || "application/octet-stream" },
    body: file,
  });
  if (!putRes.ok) throw new Error("Errore upload file nello storage");

  return { objectPath, fileName: file.name, mimeType: file.type, fileSize: file.size };
}

// ─── Document Card ────────────────────────────────────────────────────────────
function DocCard({ doc, section, ownerName, onView, onDelete }: {
  doc: Doc; section: string; ownerName?: string; onView: () => void; onDelete: () => void;
}) {
  const Icon = categoryIcon(doc.category, section);
  const expired = isExpired(doc.expiresAt);
  const expiringSoon = !expired && isExpiringSoon(doc.expiresAt);

  return (
    <div
      className="flex items-center gap-3 p-3 bg-white dark:bg-slate-800 rounded-xl border border-border shadow-sm"
      data-testid={`doc-card-${doc.id}`}
    >
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${expired ? "bg-red-50" : expiringSoon ? "bg-amber-50" : "bg-slate-50"}`}>
        <Icon className={`w-5 h-5 ${expired ? "text-red-500" : expiringSoon ? "text-amber-500" : "text-slate-500"}`} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm truncate">{doc.title}</span>
          {doc.isPrivate
            ? <Lock className="w-3 h-3 text-slate-400 flex-shrink-0" />
            : <Globe className="w-3 h-3 text-slate-400 flex-shrink-0" />}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-xs text-muted-foreground">{categoryLabel(doc.category, section)}</span>
          {ownerName && <span className="text-xs text-muted-foreground">· {ownerName}</span>}
          {doc.fileSize && <span className="text-xs text-muted-foreground">· {formatBytes(doc.fileSize)}</span>}
        </div>
        {(expired || expiringSoon) && doc.expiresAt && (
          <div className={`flex items-center gap-1 mt-0.5 text-xs ${expired ? "text-red-500" : "text-amber-500"}`}>
            <AlertTriangle className="w-3 h-3" />
            {expired ? "Scaduto" : `Scade il ${new Date(doc.expiresAt).toLocaleDateString("it-IT")}`}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        <button
          onClick={onView}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
          data-testid={`button-view-doc-${doc.id}`}
        >
          <Eye className="w-4 h-4 text-slate-500" />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"
          data-testid={`button-delete-doc-${doc.id}`}
        >
          <Trash2 className="w-4 h-4 text-red-400" />
        </button>
      </div>
    </div>
  );
}

// ─── Add Document Dialog ──────────────────────────────────────────────────────
function AddDocDialog({
  open, onClose, section, members, myProfileId,
}: {
  open: boolean; onClose: () => void; section: "personal" | "house"; members: Profile[]; myProfileId: string;
}) {
  const { toast } = useToast();
  const { token } = useAuth();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [profileId, setProfileId] = useState(myProfileId);
  const [notes, setNotes] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const cats = section === "personal" ? PERSONAL_CATEGORIES : HOUSE_CATEGORIES;

  const createMutation = useMutation({
    mutationFn: async (body: object) => apiRequest("POST", "/api/documents", body).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Documento salvato" });
      onClose();
      reset();
    },
    onError: (e: any) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  function reset() {
    setTitle(""); setCategory(""); setNotes(""); setIsPrivate(false); setExpiresAt(""); setFile(null);
    setProfileId(myProfileId);
  }

  async function handleSubmit() {
    if (!title.trim() || !category) return;
    let objectPath: string | undefined;
    let fileName: string | undefined;
    let mimeType: string | undefined;
    let fileSize: number | undefined;
    if (file) {
      try {
        setUploading(true);
        const result = await uploadToObjectStorage(file, token!);
        objectPath = result.objectPath;
        fileName = result.fileName;
        mimeType = result.mimeType;
        fileSize = result.fileSize;
      } catch (e: any) {
        toast({ title: "Errore upload", description: e.message, variant: "destructive" });
        setUploading(false);
        return;
      } finally {
        setUploading(false);
      }
    }
    createMutation.mutate({
      title: title.trim(), category, section,
      profileId: section === "personal" ? profileId : null,
      notes: notes.trim() || null,
      isPrivate,
      expiresAt: expiresAt || null,
      objectPath, fileName, mimeType, fileSize,
    });
  }

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) { onClose(); reset(); } }}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle>{section === "personal" ? "Documento personale" : "Documento casa"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Titolo *</label>
            <Input
              value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Es. Carta d'identità di Mario"
              data-testid="input-doc-title"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Categoria *</label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger data-testid="select-doc-category"><SelectValue placeholder="Seleziona..." /></SelectTrigger>
              <SelectContent>
                {cats.map(c => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {section === "personal" && (
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Intestatario</label>
              <Select value={profileId} onValueChange={setProfileId}>
                <SelectTrigger data-testid="select-doc-profile"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {members.map(m => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Data scadenza (opzionale)</label>
            <Input
              type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)}
              data-testid="input-doc-expires"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Note</label>
            <Textarea
              value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Note opzionali..."
              rows={2} data-testid="input-doc-notes"
            />
          </div>
          {/* Privacy toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800">
            <div className="flex-1">
              <p className="text-sm font-medium">{isPrivate ? "Documento privato" : "Visibile a tutti"}</p>
              <p className="text-xs text-muted-foreground">{isPrivate ? "Solo tu puoi vederlo" : "Tutti i membri della famiglia possono vederlo"}</p>
            </div>
            <button
              onClick={() => setIsPrivate(!isPrivate)}
              className={`w-10 h-6 rounded-full transition-colors flex items-center ${isPrivate ? "bg-slate-700 justify-end" : "bg-green-500 justify-start"}`}
              data-testid="toggle-doc-private"
            >
              <div className="w-5 h-5 bg-white rounded-full mx-0.5 shadow-sm" />
            </button>
          </div>
          {/* File upload */}
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Allegato (foto o PDF, max 20MB)</label>
            {file ? (
              <div className="flex items-center gap-2 p-2 rounded-lg border border-border bg-slate-50 dark:bg-slate-800">
                <FileText className="w-4 h-4 text-slate-500 flex-shrink-0" />
                <span className="text-xs flex-1 truncate">{file.name}</span>
                <span className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                <button onClick={() => setFile(null)} data-testid="button-remove-file">
                  <X className="w-4 h-4 text-slate-400" />
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => setScannerOpen(true)}
                  className="p-3 border-2 border-dashed border-primary/40 rounded-lg flex flex-col items-center gap-1 text-xs text-primary hover:bg-primary/5 transition-colors"
                  data-testid="button-scan-document"
                >
                  <ScanLine className="w-5 h-5" />
                  Scansiona
                </button>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="p-3 border-2 border-dashed border-border rounded-lg flex flex-col items-center gap-1 text-xs text-muted-foreground hover:border-primary/50 hover:bg-primary/5 transition-colors"
                  data-testid="button-upload-file"
                >
                  <Upload className="w-5 h-5" />
                  Galleria / file
                </button>
              </div>
            )}
            <input
              ref={fileRef} type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]); }}
            />
          </div>
          <DocumentScanner
            open={scannerOpen}
            onCancel={() => setScannerOpen(false)}
            onCapture={(captured) => setFile(captured)}
            filenameHint={title.trim() || category || "documento"}
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onClose(); reset(); }} data-testid="button-cancel-doc">Annulla</Button>
          <Button
            onClick={handleSubmit}
            disabled={!title.trim() || !category || createMutation.isPending || uploading}
            data-testid="button-save-doc"
          >
            {uploading ? "Carico file..." : createMutation.isPending ? "Salvo..." : "Salva"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Document Dialog ─────────────────────────────────────────────────────
function ViewDocDialog({ doc, section, ownerName, myProfileId, onClose }: {
  doc: Doc | null; section: string; ownerName?: string; myProfileId: string; onClose: () => void;
}) {
  const { toast } = useToast();
  if (!doc) return null;
  const Icon = categoryIcon(doc.category, section);

  async function handleDownload() {
    if (!doc) return;
    try {
      // Step 1: ask the API for a fresh signed download URL.
      const r = await fetch(`/api/documents/${doc.id}`, { headers: getAuthHeaders() });
      if (!r.ok) throw new Error("Errore download");
      const meta = await r.json();
      if (!meta.downloadUrl) throw new Error("Documento senza file");
      // Step 2: open the signed URL directly. It works in a new tab without
      // an auth header because the URL embeds a short-lived token.
      window.open(meta.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (e: any) {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    }
  }

  return (
    <Dialog open={!!doc} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm mx-4">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="w-5 h-5 text-slate-500" />
            {doc.title}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground">Categoria</p>
              <p className="font-medium">{categoryLabel(doc.category, section)}</p>
            </div>
            {ownerName && (
              <div>
                <p className="text-xs text-muted-foreground">Intestatario</p>
                <p className="font-medium">{ownerName}</p>
              </div>
            )}
            <div>
              <p className="text-xs text-muted-foreground">Visibilità</p>
              <p className="font-medium flex items-center gap-1">
                {doc.isPrivate ? <><Lock className="w-3 h-3" /> Privato</> : <><Globe className="w-3 h-3" /> Famiglia</>}
              </p>
            </div>
            {doc.expiresAt && (
              <div>
                <p className="text-xs text-muted-foreground">Scadenza</p>
                <p className={`font-medium ${isExpired(doc.expiresAt) ? "text-red-500" : isExpiringSoon(doc.expiresAt) ? "text-amber-500" : ""}`}>
                  {new Date(doc.expiresAt).toLocaleDateString("it-IT")}
                </p>
              </div>
            )}
          </div>
          {doc.notes && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg text-sm text-slate-600 dark:text-slate-400">
              {doc.notes}
            </div>
          )}
          {doc.fileName && (
            <div className="flex items-center gap-2 p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
              <FileText className="w-4 h-4 text-slate-500" />
              <span className="text-sm flex-1 truncate">{doc.fileName}</span>
              {doc.fileSize && <span className="text-xs text-muted-foreground">{formatBytes(doc.fileSize)}</span>}
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Chiudi</Button>
          {doc.fileName && (
            <Button onClick={handleDownload} data-testid="button-download-doc">
              <Download className="w-4 h-4 mr-1" /> Apri file
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DocumentiPage() {
  const { profile } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<"personal" | "house">("personal");
  const [selectedPerson, setSelectedPerson] = useState<string | "all">("all");
  const [addDialog, setAddDialog] = useState<"personal" | "house" | null>(null);
  const [viewDoc, setViewDoc] = useState<Doc | null>(null);
  const [deleteDocId, setDeleteDocId] = useState<string | null>(null);

  const { data: members = [] } = useQuery<Profile[]>({ queryKey: ["/api/family/profiles"] });
  const { data: docs = [], isLoading } = useQuery<Doc[]>({
    queryKey: ["/api/documents", activeTab],
    queryFn: () => fetch(`/api/documents?section=${activeTab}`, {
      headers: getAuthHeaders(),
    }).then(r => r.json()),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/documents/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/documents"] });
      toast({ title: "Documento eliminato" });
      setDeleteDocId(null);
    },
    onError: () => toast({ title: "Errore eliminazione", variant: "destructive" }),
  });

  const ownerMap = useCallback((id: string | null) => {
    if (!id) return undefined;
    return members.find(m => m.id === id)?.name;
  }, [members]);

  // Filter docs
  const filteredDocs = (docs ?? []).filter(d => {
    if (activeTab === "personal" && selectedPerson !== "all") {
      return d.profileId === selectedPerson;
    }
    return true;
  });

  // Expired / expiring docs for badge
  const expiringCount = (docs ?? []).filter(d => !isExpired(d.expiresAt) && isExpiringSoon(d.expiresAt)).length;
  const expiredCount = (docs ?? []).filter(d => isExpired(d.expiresAt)).length;

  return (
    <div className="flex flex-col h-full bg-[#f5f5f0] dark:bg-background">
      {/* Tab bar */}
      <div className="flex bg-white dark:bg-slate-900 border-b border-border px-4 pt-2 flex-shrink-0">
        <button
          onClick={() => setActiveTab("personal")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "personal" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          data-testid="tab-personal-docs"
        >
          <User className="w-4 h-4" /> Personali
        </button>
        <button
          onClick={() => setActiveTab("house")}
          className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === "house" ? "border-primary text-primary" : "border-transparent text-muted-foreground"}`}
          data-testid="tab-house-docs"
        >
          <Home className="w-4 h-4" /> Casa
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Alerts banner */}
        {(expiredCount > 0 || expiringCount > 0) && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-50 border border-amber-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-amber-700">
              {expiredCount > 0 && <p><strong>{expiredCount} documento{expiredCount > 1 ? "i" : ""} scaduto{expiredCount > 1 ? "i" : ""}</strong> — aggiorna i tuoi documenti</p>}
              {expiringCount > 0 && <p><strong>{expiringCount} documento{expiringCount > 1 ? "i" : ""}</strong> in scadenza nei prossimi 60 giorni</p>}
            </div>
          </div>
        )}

        {/* Person filter (personal section only) */}
        {activeTab === "personal" && (members ?? []).length > 0 && (
          <div className="px-4 mt-3 flex gap-2 overflow-x-auto pb-1 flex-shrink-0" style={{ scrollbarWidth: "none" }}>
            <button
              onClick={() => setSelectedPerson("all")}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedPerson === "all" ? "bg-primary text-white" : "bg-white dark:bg-slate-800 border border-border text-foreground"}`}
              data-testid="filter-person-all"
            >
              Tutti
            </button>
            {(members ?? []).map(m => (
              <button
                key={m.id}
                onClick={() => setSelectedPerson(m.id)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedPerson === m.id ? "bg-primary text-white" : "bg-white dark:bg-slate-800 border border-border text-foreground"}`}
                data-testid={`filter-person-${m.id}`}
              >
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: m.colorHex }} />
                {m.name.split(" ")[0]}
              </button>
            ))}
          </div>
        )}

        {/* Document list */}
        <div className="px-4 mt-3 space-y-2 pb-24">
          {isLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-16 rounded-xl bg-white dark:bg-slate-800 animate-pulse" />)}
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
                {activeTab === "personal" ? <User className="w-7 h-7 text-slate-400" /> : <Home className="w-7 h-7 text-slate-400" />}
              </div>
              <p className="text-sm font-medium text-slate-600 dark:text-slate-400">Nessun documento</p>
              <p className="text-xs text-muted-foreground mt-1">
                {activeTab === "personal" ? "Aggiungi carte d'identità, tessere, patenti..." : "Aggiungi manuali, garanzie, scontrini..."}
              </p>
            </div>
          ) : (
            filteredDocs.map(doc => (
              <DocCard
                key={doc.id}
                doc={doc}
                section={activeTab}
                ownerName={activeTab === "personal" ? ownerMap(doc.profileId) : undefined}
                onView={() => setViewDoc(doc)}
                onDelete={() => setDeleteDocId(doc.id)}
              />
            ))
          )}
        </div>
      </div>

      {/* FAB */}
      <button
        onClick={() => setAddDialog(activeTab)}
        className="absolute bottom-24 right-4 w-12 h-12 bg-primary rounded-full shadow-lg flex items-center justify-center text-white hover:bg-primary/90 active:scale-95 transition-transform z-10"
        data-testid="button-add-doc"
      >
        <Plus className="w-6 h-6" />
      </button>

      {/* Add Dialog */}
      {addDialog && (
        <AddDocDialog
          open={!!addDialog}
          onClose={() => setAddDialog(null)}
          section={addDialog}
          members={members}
          myProfileId={profile?.id ?? ""}
        />
      )}

      {/* View Dialog */}
      <ViewDocDialog
        doc={viewDoc}
        section={activeTab}
        ownerName={viewDoc ? ownerMap(viewDoc.profileId) : undefined}
        myProfileId={profile?.id ?? ""}
        onClose={() => setViewDoc(null)}
      />

      {/* Delete Confirm */}
      <AlertDialog open={!!deleteDocId} onOpenChange={v => { if (!v) setDeleteDocId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Elimina documento</AlertDialogTitle>
            <AlertDialogDescription>Questa azione è irreversibile. Il documento e il file allegato verranno eliminati definitivamente.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annulla</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteDocId && deleteMutation.mutate(deleteDocId)} className="bg-red-500 hover:bg-red-600">
              Elimina
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
