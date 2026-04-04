import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, MapPin, Bus, Bike, Car, CheckCircle } from "lucide-react";
import type { Profile } from "@shared/schema";

interface AutonomyWizardProps {
  member: Profile;
  open: boolean;
  onClose: () => void;
}

type TravelOption = "full" | "known_routes" | "never";
type HomeAloneOption = "yes" | "short" | "no";

const STEP_LABELS = ["Spostamenti", "Mezzi", "Casa", "Data di nascita", "Riepilogo"];

export function AutonomyWizard({ member, open, onClose }: AutonomyWizardProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState(0);

  // Answers
  const [travelAlone, setTravelAlone] = useState<TravelOption>("never");
  const [trustedRoutes, setTrustedRoutes] = useState<string[]>([""]);
  const [canUseBus, setCanUseBus] = useState(false);
  const [hasBike, setHasBike] = useState(false);
  const [homeAlone, setHomeAlone] = useState<HomeAloneOption>("no");
  const [birthDate, setBirthDate] = useState("");
  const [hasLicense, setHasLicense] = useState(false);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const validRoutes = trustedRoutes.filter(r => r.trim());
      const autonomyData: any = {
        can_travel_alone: travelAlone !== "never",
        can_stay_home_alone: homeAlone !== "no",
        max_walk_distance_km: travelAlone === "full" ? 2.0 : travelAlone === "known_routes" ? 0.5 : 0,
        trusted_routes: [],
        trusted_route_labels: {},
      };
      // Aggiungi ogni percorso fidato
      const trustedPayload: any = { ...autonomyData };
      for (const r of validRoutes) {
        trustedPayload.new_trusted_route = r; // verrà processato dal backend
      }
      const transportData = {
        has_driving_license: hasLicense,
        can_use_bus: canUseBus,
        has_bike: hasBike,
        bike_allowed_routes: [],
      };
      await apiRequest("PATCH", `/api/profiles/${member.id}/autonomy`, {
        autonomy: autonomyData,
        transport: transportData,
        birthDate: birthDate || undefined,
      });
      // Aggiunge i percorsi fidati uno ad uno
      for (const r of validRoutes) {
        await apiRequest("PATCH", `/api/profiles/${member.id}/autonomy`, {
          autonomy: { new_trusted_route: r },
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/family/members"] });
      toast({ title: `Profilo di ${member.name} aggiornato!` });
      onClose();
    },
    onError: (e: Error) => toast({ title: "Errore", description: e.message, variant: "destructive" }),
  });

  const name = member.name.split(" ")[0];

  function stepContent() {
    switch (step) {
      case 0: // Spostamenti
        return (
          <div className="space-y-3">
            <p className="text-base font-medium" style={{ color: "var(--color-text-primary)" }}>
              {name} può spostarsi da solo?
            </p>
            {([ 
              { v: "full" as TravelOption, label: "Sì, in piena autonomia", icon: "🚶" },
              { v: "known_routes" as TravelOption, label: "Solo percorsi che conosce", icon: "🗺️" },
              { v: "never" as TravelOption, label: "No, serve sempre un adulto", icon: "🛡️" },
            ]).map(opt => (
              <button
                key={opt.v}
                onClick={() => setTravelAlone(opt.v)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all text-left active:scale-[.98]"
                style={{
                  background: travelAlone === opt.v ? "var(--color-surface)" : "var(--color-bg-grouped)",
                  color: travelAlone === opt.v ? "white" : "var(--color-text-primary)",
                  border: travelAlone === opt.v ? "2px solid var(--color-surface)" : "2px solid transparent",
                }}
                data-testid={`travel-option-${opt.v}`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className="font-medium">{opt.label}</span>
                {travelAlone === opt.v && <CheckCircle className="w-5 h-5 ml-auto" />}
              </button>
            ))}

            {travelAlone !== "never" && (
              <div className="mt-4">
                <Label className="text-xs mb-2 block" style={{ color: "var(--color-text-secondary)" }}>
                  Percorsi che {name} fa già da solo (opzionale)
                </Label>
                {trustedRoutes.map((route, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <Input
                      placeholder={`Es. casa → scuola`}
                      value={route}
                      onChange={e => {
                        const r = [...trustedRoutes];
                        r[i] = e.target.value;
                        setTrustedRoutes(r);
                      }}
                    />
                    {i === trustedRoutes.length - 1 && (
                      <button
                        onClick={() => setTrustedRoutes([...trustedRoutes, ""])}
                        className="px-3 py-2 rounded-xl text-sm font-semibold"
                        style={{ background: "var(--color-bg-grouped)", color: "var(--color-text-secondary)" }}
                      >+</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case 1: // Mezzi
        return (
          <div className="space-y-4">
            <p className="text-base font-medium" style={{ color: "var(--color-text-primary)" }}>
              Che mezzi può usare {name}?
            </p>
            {[
              { icon: Bus, label: "Mezzi pubblici", key: "bus", state: canUseBus, set: setCanUseBus },
              { icon: Bike, label: "Bicicletta", key: "bike", state: hasBike, set: setHasBike },
              { icon: Car, label: "Ha la patente", key: "license", state: hasLicense, set: setHasLicense },
            ].map(item => (
              <button
                key={item.key}
                onClick={() => item.set(!item.state)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all active:scale-[.98]"
                style={{
                  background: item.state ? `var(--color-primary)` : "var(--color-bg-grouped)",
                  color: item.state ? "white" : "var(--color-text-primary)",
                }}
                data-testid={`transport-${item.key}`}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium flex-1 text-left">{item.label}</span>
                {item.state && <CheckCircle className="w-5 h-5" />}
              </button>
            ))}
          </div>
        );

      case 2: // Casa da solo
        return (
          <div className="space-y-3">
            <p className="text-base font-medium" style={{ color: "var(--color-text-primary)" }}>
              {name} può stare a casa da solo?
            </p>
            {([
              { v: "yes" as HomeAloneOption, label: "Sì, senza problemi", icon: "🏠" },
              { v: "short" as HomeAloneOption, label: "Per poco tempo", icon: "⏰" },
              { v: "no" as HomeAloneOption, label: "No", icon: "🚫" },
            ]).map(opt => (
              <button
                key={opt.v}
                onClick={() => setHomeAlone(opt.v)}
                className="w-full flex items-center gap-3 p-4 rounded-2xl transition-all text-left active:scale-[.98]"
                style={{
                  background: homeAlone === opt.v ? "var(--color-surface)" : "var(--color-bg-grouped)",
                  color: homeAlone === opt.v ? "white" : "var(--color-text-primary)",
                }}
                data-testid={`home-alone-${opt.v}`}
              >
                <span className="text-xl">{opt.icon}</span>
                <span className="font-medium">{opt.label}</span>
                {homeAlone === opt.v && <CheckCircle className="w-5 h-5 ml-auto" />}
              </button>
            ))}
          </div>
        );

      case 3: // Data di nascita
        return (
          <div className="space-y-4">
            <p className="text-base font-medium" style={{ color: "var(--color-text-primary)" }}>
              Quando è nato/a {name}?
            </p>
            <p className="text-sm" style={{ color: "var(--color-text-tertiary)" }}>
              Viene usato per i milestone di autonomia (es. quando compie 12 anni, l'AI chiede se può prendere il bus)
            </p>
            <Input
              type="date"
              value={birthDate}
              onChange={e => setBirthDate(e.target.value)}
              className="text-base"
              data-testid="input-birth-date"
            />
          </div>
        );

      case 4: // Riepilogo
        return (
          <div className="space-y-4">
            <p className="text-base font-semibold" style={{ color: "var(--color-text-primary)" }}>
              Profilo autonomia di {name}
            </p>
            <div className="rounded-2xl p-4 space-y-3" style={{ background: "var(--color-bg-grouped)" }}>
              {birthDate && <div className="flex justify-between text-sm"><span style={{ color: "var(--color-text-secondary)" }}>Data nascita</span><span className="font-medium">{birthDate}</span></div>}
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--color-text-secondary)" }}>Spostamenti</span>
                <span className="font-medium">{travelAlone === "full" ? "Autonomo" : travelAlone === "known_routes" ? "Percorsi noti" : "Sempre accompagnato"}</span>
              </div>
              {trustedRoutes.filter(r => r.trim()).length > 0 && (
                <div className="flex justify-between text-sm">
                  <span style={{ color: "var(--color-text-secondary)" }}>Percorsi fidati</span>
                  <span className="font-medium">{trustedRoutes.filter(r => r.trim()).join(", ")}</span>
                </div>
              )}
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--color-text-secondary)" }}>Bus</span>
                <span className="font-medium">{canUseBus ? "Sì" : "No"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--color-text-secondary)" }}>Bici</span>
                <span className="font-medium">{hasBike ? "Sì" : "No"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--color-text-secondary)" }}>Patente</span>
                <span className="font-medium">{hasLicense ? "Sì" : "No"}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span style={{ color: "var(--color-text-secondary)" }}>Casa da solo</span>
                <span className="font-medium">{homeAlone === "yes" ? "Sì" : homeAlone === "short" ? "Per poco" : "No"}</span>
              </div>
            </div>
          </div>
        );
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-sm max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-base"
              style={{ backgroundColor: member.colorHex || "var(--color-primary)" }}>
              {member.name.charAt(0)}
            </div>
            <div>
              <DialogTitle className="text-base">Profilo autonomia · {name}</DialogTitle>
              <p className="text-xs" style={{ color: "var(--color-text-tertiary)" }}>
                Passo {step + 1} di {STEP_LABELS.length} · {STEP_LABELS[step]}
              </p>
            </div>
          </div>
          {/* Progress bar */}
          <div className="h-1 rounded-full mt-2" style={{ background: "var(--color-bg-grouped)" }}>
            <div className="h-full rounded-full transition-all" style={{ width: `${((step + 1) / STEP_LABELS.length) * 100}%`, background: "var(--color-primary)" }} />
          </div>
        </DialogHeader>

        <div className="mt-2">
          {stepContent()}
        </div>

        <div className="flex gap-2 mt-4">
          {step > 0 && (
            <Button variant="outline" className="flex-1" onClick={() => setStep(s => s - 1)}>
              Indietro
            </Button>
          )}
          {step < STEP_LABELS.length - 1 ? (
            <Button
              className="flex-1"
              onClick={() => setStep(s => s + 1)}
              style={{ background: "var(--color-primary)" }}
            >
              Avanti
            </Button>
          ) : (
            <Button
              className="flex-1"
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              style={{ background: "var(--color-primary)" }}
              data-testid="button-save-autonomy"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
              Salva profilo
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
