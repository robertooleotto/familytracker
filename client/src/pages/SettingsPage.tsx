import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { User, Shield, Info, Eye, EyeOff, Smartphone, LogOut, Share2, Copy, ChevronRight, Baby } from "lucide-react";
import { AutonomyWizard } from "@/components/AutonomyWizard";
import type { Profile } from "@shared/schema";

const COLORS = [
  "#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6",
  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16",
];

const UI_MODES = [
  { value: "full", label: "Completa", desc: "Tutte le funzionalità" },
  { value: "simple", label: "Semplice", desc: "Meno elementi, più semplice" },
  { value: "elderly", label: "Anziani", desc: "Font grande, 3 azioni principali" },
];

export default function SettingsPage() {
  const { profile, logout, updateProfile } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState(profile?.name || "");
  const [color, setColor] = useState(profile?.colorHex || "#3B82F6");
  const [uiMode, setUiMode] = useState<string>(profile?.uiMode || "full");
  const [locationPaused, setLocationPaused] = useState(profile?.locationPaused || false);
  const [autonomyWizardMember, setAutonomyWizardMember] = useState<Profile | null>(null);

  const { data: family } = useQuery<{ name: string; inviteCode: string }>({
    queryKey: ["/api/family"],
  });

  const { data: familyMembersRaw } = useQuery<Array<{ profile: Profile }>>({
    queryKey: ["/api/family/members"],
  });

  const copyInviteCode = () => {
    if (!family?.inviteCode) return;
    navigator.clipboard.writeText(family.inviteCode).then(() => {
      toast({ title: "Codice copiato!", description: family.inviteCode });
    });
  };

  const shareInviteCode = () => {
    if (!family?.inviteCode) return;
    const text = `Entra nella nostra famiglia su FamilyTracker!\nCodice invito: ${family.inviteCode}`;
    if (navigator.share) {
      navigator.share({ title: "FamilyTracker – Codice invito", text });
    } else {
      navigator.clipboard.writeText(text);
      toast({ title: "Testo copiato negli appunti" });
    }
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("PATCH", "/api/profile", { name, colorHex: color, uiMode });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/family/members"] });
      if (data) updateProfile(data);
      toast({ title: "Profilo aggiornato!" });
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const pauseMutation = useMutation({
    mutationFn: async (pause: boolean) => {
      await apiRequest("POST", pause ? "/api/location/pause" : "/api/location/resume", {});
    },
    onSuccess: (_, pause) => {
      setLocationPaused(pause);
      queryClient.invalidateQueries({ queryKey: ["/api/family/locations"] });
      toast({ title: pause ? "Posizione in pausa" : "Posizione ripresa" });
    },
  });

  if (!profile) return null;

  return (
    <div className="flex flex-col h-full overflow-y-auto bg-background">
      <div className="p-4 space-y-5">
        <h2 className="text-lg font-bold">Impostazioni</h2>

        {/* Profile */}
        <section className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Profilo</h3>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full flex items-center justify-center text-white text-2xl font-black shadow-md" style={{ backgroundColor: color }}>
              {name.charAt(0) || profile.name.charAt(0)}
            </div>
            <div>
              <p className="font-semibold">{profile.name}</p>
              <p className="text-xs text-muted-foreground">@{profile.username}</p>
              <Badge variant="outline" className="text-xs mt-1 capitalize">{profile.role}</Badge>
            </div>
          </div>
          <div>
            <Label className="text-xs">Nome visualizzato</Label>
            <Input value={name} onChange={e => setName(e.target.value)} data-testid="input-profile-name" />
          </div>
          <div>
            <Label className="text-xs mb-2 block">Colore</Label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c => (
                <button key={c} onClick={() => setColor(c)} className={`w-8 h-8 rounded-full border-2 transition-all ${color === c ? "border-foreground scale-110" : "border-transparent"}`} style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <Button size="sm" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending} data-testid="button-save-profile">
            {updateMutation.isPending ? "Salvataggio…" : "Salva modifiche"}
          </Button>
        </section>

        {/* Interface mode */}
        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Smartphone className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Modalità interfaccia</h3>
          </div>
          <div className="space-y-2">
            {UI_MODES.map(m => (
              <button key={m.value} onClick={() => setUiMode(m.value)} className={`w-full text-left p-3 rounded-xl border-2 transition-all ${uiMode === m.value ? "border-primary bg-primary/5" : "border-border"}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium text-sm">{m.label}</p>
                    <p className="text-xs text-muted-foreground">{m.desc}</p>
                  </div>
                  {uiMode === m.value && <div className="w-5 h-5 rounded-full bg-primary flex items-center justify-center"><div className="w-2 h-2 rounded-full bg-white" /></div>}
                </div>
              </button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={() => updateMutation.mutate()} disabled={updateMutation.isPending}>
            Applica modalità
          </Button>
        </section>

        {/* Privacy */}
        <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Privacy posizione</h3>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-2">
              {locationPaused ? <EyeOff className="w-4 h-4 text-amber-500 mt-0.5" /> : <Eye className="w-4 h-4 text-green-500 mt-0.5" />}
              <div>
                <p className="text-sm font-medium">{locationPaused ? "Posizione in pausa" : "Posizione attiva"}</p>
                <p className="text-xs text-muted-foreground">{locationPaused ? "Gli altri vedono 'posizione non condivisa'" : "Gli altri membri possono vedere la tua posizione"}</p>
              </div>
            </div>
            <Switch checked={!locationPaused} onCheckedChange={v => pauseMutation.mutate(!v)} data-testid="switch-location-pause" />
          </div>
        </section>

        {/* Privacy policy */}
        <section className="bg-card border border-border rounded-2xl p-4 space-y-2">
          <div className="flex items-center gap-2 mb-1">
            <Info className="w-4 h-4 text-primary" />
            <h3 className="font-semibold">Informazioni privacy</h3>
          </div>
          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span>Zero vendita dati — le coordinate non vengono mai condivise con terze parti</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span>Retention posizione: 30 giorni max, poi eliminazione automatica</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span>Ogni membro può sospendere la propria posizione in qualsiasi momento</span>
            </div>
            <div className="flex items-start gap-2">
              <span className="text-green-500 font-bold">✓</span>
              <span>Zero analytics di terze parti</span>
            </div>
          </div>
        </section>

        {/* Invite code */}
        {family && (
          <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Share2 className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Invita un membro</h3>
            </div>
            <p className="text-xs text-muted-foreground">Condividi questo codice con chi vuoi aggiungere alla famiglia <strong>{family.name}</strong>.</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-accent rounded-xl px-4 py-3 font-mono text-xl font-bold tracking-widest text-center text-foreground" data-testid="text-invite-code">
                {family.inviteCode}
              </div>
              <button onClick={copyInviteCode} className="p-3 rounded-xl border border-border hover:bg-accent transition-colors" data-testid="button-copy-invite">
                <Copy className="w-4 h-4" />
              </button>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={shareInviteCode} data-testid="button-share-invite">
              <Share2 className="w-4 h-4" />
              Condividi codice invito
            </Button>
          </section>
        )}

        {/* Autonomia bambini */}
        {profile?.role === "parent" && familyMembersRaw && familyMembersRaw.some(m => m.profile.role === "child") && (
          <section className="bg-card border border-border rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 mb-1">
              <Baby className="w-4 h-4 text-primary" />
              <h3 className="font-semibold">Profili autonomia</h3>
            </div>
            <p className="text-xs text-muted-foreground">
              Configura quando ogni membro può spostarsi da solo. Kinly userà queste informazioni per rilevare se serve un accompagnatore.
            </p>
            {familyMembersRaw
              .filter(m => m.profile.role === "child")
              .map(m => {
                const hasAutonomy = !!(m.profile as any).autonomy;
                return (
                  <button
                    key={m.profile.id}
                    onClick={() => setAutonomyWizardMember(m.profile)}
                    className="w-full flex items-center gap-3 py-2 px-3 rounded-xl hover:bg-accent transition-colors text-left"
                    data-testid={`button-autonomy-${m.profile.id}`}
                  >
                    <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold" style={{ backgroundColor: m.profile.colorHex || "var(--color-primary)" }}>
                      {m.profile.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{m.profile.name.split(" ")[0]}</p>
                      <p className="text-xs text-muted-foreground">{hasAutonomy ? "Profilo configurato" : "Da configurare"}</p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasAutonomy && <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓</span>}
                      <ChevronRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </button>
                );
              })
            }
          </section>
        )}

        {/* Logout */}
        <section className="pb-2">
          <Button
            variant="destructive"
            className="w-full gap-2"
            onClick={logout}
            data-testid="button-logout"
          >
            <LogOut className="w-4 h-4" />
            Esci dall'account
          </Button>
        </section>
      </div>

      {autonomyWizardMember && (
        <AutonomyWizard
          member={autonomyWizardMember}
          open={!!autonomyWizardMember}
          onClose={() => setAutonomyWizardMember(null)}
        />
      )}
    </div>
  );
}
