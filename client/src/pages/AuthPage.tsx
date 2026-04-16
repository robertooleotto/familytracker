import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { setSession } from "@/lib/auth";
import { supabase } from "@/lib/supabase";
import type { Profile } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, MessageCircle, Calendar, Shield } from "lucide-react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

interface AuthPageProps {
  onLogin: (profile: Profile, token: string, refreshToken?: string) => void;
}

const COLOR_OPTIONS = [
  { value: "#3B82F6", label: "Blu" },
  { value: "#10B981", label: "Verde" },
  { value: "#F59E0B", label: "Ambra" },
  { value: "#EF4444", label: "Rosso" },
  { value: "#8B5CF6", label: "Viola" },
  { value: "#EC4899", label: "Rosa" },
  { value: "#14B8A6", label: "Verde acqua" },
  { value: "#F97316", label: "Arancione" },
];

export default function AuthPage({ onLogin }: AuthPageProps) {
  const { toast } = useToast();
  const [tab, setTab] = useState<"login" | "register" | "join">("login");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    familyName: "",
    role: "parent" as "parent" | "child" | "guardian",
    colorHex: "#3B82F6",
  });
  const [joinForm, setJoinForm] = useState({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    inviteCode: "",
    role: "child" as "parent" | "child" | "guardian",
    colorHex: "#10B981",
  });

  const loginMutation = useMutation({
    mutationFn: async () => {
      // Sign in with Supabase
      const { data, error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });
      if (error) throw error;
      if (!data.session) throw new Error("No session returned");

      // Fetch profile from backend
      const res = await fetch("/api/auth/v2/me", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.message || "Failed to fetch profile");
      }

      const profileData = await res.json();

      return {
        profile: profileData.profile || profileData,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    },
    onSuccess: (data) => {
      setSession(data.profile, data.access_token, data.refresh_token);
      onLogin(data.profile, data.access_token, data.refresh_token);
    },
    onError: (e: Error) => toast({ title: "Accesso fallito", description: e.message, variant: "destructive" }),
  });

  const registerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/v2/register", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(registerForm),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        // Prefer Zod field-level error (path + message) over the generic
        // "Invalid request body" so the user sees WHICH field failed.
        const fieldErr = Array.isArray(errorData.errors) && errorData.errors[0];
        const detail = fieldErr
          ? `${fieldErr.path ? fieldErr.path + ": " : ""}${fieldErr.message}`
          : errorData.message;
        throw new Error(detail || "Registrazione fallita");
      }

      const data = await res.json();

      // Set the Supabase session with the returned tokens
      if (data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      if (!data.session?.access_token || !data.session?.refresh_token) {
        throw new Error(data.warning || "Sessione non avviata. Riprova il login.");
      }

      return {
        profile: data.profile,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    },
    onSuccess: (data) => {
      toast({ title: `Famiglia "${registerForm.familyName}" creata!`, description: "Benvenuto/a in FamilyTracker" });
      setSession(data.profile, data.access_token, data.refresh_token);
      onLogin(data.profile, data.access_token, data.refresh_token);
    },
    onError: (e: Error) => toast({ title: "Registrazione fallita", description: e.message, variant: "destructive" }),
  });

  const joinMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/auth/v2/join", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(joinForm),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        const fieldErr = Array.isArray(errorData.errors) && errorData.errors[0];
        const detail = fieldErr
          ? `${fieldErr.path ? fieldErr.path + ": " : ""}${fieldErr.message}`
          : errorData.message;
        throw new Error(detail || "Errore durante l'ingresso");
      }

      const data = await res.json();

      // Set the Supabase session with the returned tokens
      if (data.session?.access_token && data.session?.refresh_token) {
        await supabase.auth.setSession({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        });
      }

      if (!data.session?.access_token || !data.session?.refresh_token) {
        throw new Error(data.warning || "Sessione non avviata. Riprova il login.");
      }

      return {
        profile: data.profile,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      };
    },
    onSuccess: (data) => {
      toast({ title: `Benvenuto/a ${data.profile.name}!` });
      setSession(data.profile, data.access_token, data.refresh_token);
      onLogin(data.profile, data.access_token, data.refresh_token);
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const colorSelect = (value: string, onChange: (v: string) => void, testId: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue>
          <span className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: value }} />
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {COLOR_OPTIONS.map((c) => (
          <SelectItem key={c.value} value={c.value}>
            <span className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full inline-block" style={{ background: c.value }} />
              {c.label}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const roleSelect = (value: string, onChange: (v: string) => void, testId: string) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger data-testid={testId}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="parent">Genitore</SelectItem>
        <SelectItem value="guardian">Tutore</SelectItem>
        <SelectItem value="child">Figlio/a</SelectItem>
      </SelectContent>
    </Select>
  );

  const inputCls = "bg-white/10 border-white/20 text-white placeholder:text-slate-500";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-10">
        <div className="text-center mb-6 space-y-1">
          {/* Lottie animation */}
          <div className="flex items-center justify-center mb-2">
            <DotLottieReact
              src="/family-animation.lottie"
              loop
              autoplay
              style={{ width: 200, height: 200 }}
            />
          </div>
          <h1 className="text-3xl font-black text-white tracking-tight">FamilyTracker</h1>
          <p className="text-slate-400 text-base">La tua famiglia, sempre connessa</p>
          <div className="flex items-center justify-center gap-6 pt-2">
            {[
              { icon: MapPin, label: "Posizione" },
              { icon: MessageCircle, label: "Chat" },
              { icon: Calendar, label: "Agenda" },
              { icon: Shield, label: "Privacy" },
            ].map(({ icon: Icon, label }) => (
              <div key={label} className="flex flex-col items-center gap-1 text-slate-400">
                <Icon className="w-4 h-4" />
                <span className="text-[10px] font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full max-w-sm bg-white/10 backdrop-blur border border-white/10 rounded-2xl p-5 shadow-2xl">
          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
            <TabsList className="w-full mb-5 bg-white/10">
              <TabsTrigger value="login" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-300" data-testid="tab-login">
                Accedi
              </TabsTrigger>
              <TabsTrigger value="register" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-300" data-testid="tab-register">
                Crea
              </TabsTrigger>
              <TabsTrigger value="join" className="flex-1 data-[state=active]:bg-white data-[state=active]:text-slate-900 text-slate-300" data-testid="tab-join">
                Unisciti
              </TabsTrigger>
            </TabsList>

            {/* ── LOGIN ── */}
            <TabsContent value="login" className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Email</Label>
                <Input
                  data-testid="input-login-email"
                  type="email"
                  placeholder="mario.rossi@email.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  inputMode="email"
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  className={inputCls}
                  onKeyDown={e => e.key === "Enter" && loginMutation.mutate()}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Password</Label>
                <Input
                  data-testid="input-login-password"
                  type="password"
                  placeholder="••••••••"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  className={inputCls}
                  onKeyDown={e => e.key === "Enter" && loginMutation.mutate()}
                />
              </div>
              <Button
                className="w-full"
                data-testid="button-login"
                onClick={() => loginMutation.mutate()}
                disabled={loginMutation.isPending}
              >
                {loginMutation.isPending ? "Accesso…" : "Accedi"}
              </Button>
            </TabsContent>

            {/* ── REGISTER ── */}
            <TabsContent value="register" className="space-y-3">
              <p className="text-xs text-slate-400">Crea una nuova famiglia. Riceverai un codice invito da condividere.</p>
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Nome famiglia</Label>
                <Input
                  data-testid="input-family-name"
                  placeholder="es. Famiglia Rossi"
                  value={registerForm.familyName}
                  onChange={(e) => setRegisterForm({ ...registerForm, familyName: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Nome</Label>
                  <Input
                    data-testid="input-reg-firstname"
                    placeholder="Mario"
                    value={registerForm.firstName}
                    onChange={(e) => setRegisterForm({ ...registerForm, firstName: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Cognome</Label>
                  <Input
                    data-testid="input-reg-lastname"
                    placeholder="Rossi"
                    value={registerForm.lastName}
                    onChange={(e) => setRegisterForm({ ...registerForm, lastName: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Email</Label>
                <Input
                  data-testid="input-reg-email"
                  type="email"
                  inputMode="email"
                  placeholder="mario.rossi@email.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Password</Label>
                <Input
                  data-testid="input-reg-password"
                  type="password"
                  placeholder="••••••••"
                  value={registerForm.password}
                  onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-400 pl-0.5">
                  Almeno 8 caratteri, una lettera e un numero.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Ruolo</Label>
                  {roleSelect(registerForm.role, v => setRegisterForm({ ...registerForm, role: v as any }), "select-role")}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Colore</Label>
                  {colorSelect(registerForm.colorHex, v => setRegisterForm({ ...registerForm, colorHex: v }), "select-color")}
                </div>
              </div>
              <Button
                className="w-full"
                data-testid="button-register"
                onClick={() => registerMutation.mutate()}
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? "Creazione…" : "Crea famiglia"}
              </Button>
            </TabsContent>

            {/* ── JOIN ── */}
            <TabsContent value="join" className="space-y-3">
              <p className="text-xs text-slate-400">Hai un codice invito? Unisciti alla famiglia!</p>
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Codice invito</Label>
                <Input
                  data-testid="input-invite-code"
                  placeholder="A1B2C3D4"
                  value={joinForm.inviteCode}
                  onChange={(e) => setJoinForm({ ...joinForm, inviteCode: e.target.value.toUpperCase() })}
                  className={`uppercase tracking-widest text-center font-mono ${inputCls}`}
                  maxLength={8}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Nome</Label>
                  <Input
                    data-testid="input-join-firstname"
                    placeholder="Giulia"
                    value={joinForm.firstName}
                    onChange={(e) => setJoinForm({ ...joinForm, firstName: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Cognome</Label>
                  <Input
                    data-testid="input-join-lastname"
                    placeholder="Rossi"
                    value={joinForm.lastName}
                    onChange={(e) => setJoinForm({ ...joinForm, lastName: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Email <span className="text-slate-500">(opzionale)</span></Label>
                <Input
                  data-testid="input-join-email"
                  type="email"
                  inputMode="email"
                  placeholder="giulia@email.com"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={joinForm.email}
                  onChange={(e) => setJoinForm({ ...joinForm, email: e.target.value })}
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-slate-200 text-sm">Password</Label>
                <Input
                  data-testid="input-join-password"
                  type="password"
                  placeholder="••••••••"
                  value={joinForm.password}
                  onChange={(e) => setJoinForm({ ...joinForm, password: e.target.value })}
                  className={inputCls}
                />
                <p className="text-[11px] text-slate-400 pl-0.5">
                  Almeno 8 caratteri, una lettera e un numero.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Ruolo</Label>
                  {roleSelect(joinForm.role, v => setJoinForm({ ...joinForm, role: v as any }), "select-join-role")}
                </div>
                <div className="space-y-1.5">
                  <Label className="text-slate-200 text-sm">Colore</Label>
                  {colorSelect(joinForm.colorHex, v => setJoinForm({ ...joinForm, colorHex: v }), "select-join-color")}
                </div>
              </div>
              <Button
                className="w-full"
                data-testid="button-join"
                onClick={() => joinMutation.mutate()}
                disabled={joinMutation.isPending}
              >
                {joinMutation.isPending ? "Ingresso…" : "Unisciti alla famiglia"}
              </Button>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <footer className="text-center py-4 text-xs text-slate-500">
        Privacy first · Nessuna vendita dati · La tua famiglia, i tuoi dati
      </footer>
    </div>
  );
}
