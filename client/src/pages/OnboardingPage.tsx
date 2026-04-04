import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import type { Profile } from "@shared/schema";
import {
  Sun, Moon, Briefcase, GraduationCap, Home, Heart, Users,
  Salad, Utensils, Dumbbell, Target, ChevronRight, ChevronLeft,
  Sparkles, Check, Car, PawPrint, Pill, Wallet, ShoppingCart,
  BookOpen, UtensilsCrossed, CreditCard, Bell,
} from "lucide-react";

interface Props {
  profile: Profile;
  token: string;
  onComplete: (updatedProfile: Profile) => void;
}

interface OnboardingData {
  wakeTime: string;
  sleepTime: string;
  dinnerTime: string;
  occupation: string;
  whoShops: string;
  shoppingFrequency: string;
  hasPartner: boolean | null;
  kidsCount: number;
  kidsAges: string[];
  hasPets: boolean | null;
  petTypes: string[];
  homeType: string;
  vehicleCount: number;
  recurringDeadlines: string[];
  activeSubscriptions: string[];
  allergies: string[];
  dietaryRestrictions: string[];
  foodDislikes: string;
  foodLikes: string;
  cookingFrequency: string;
  whoCoooks: string;
  activities: string[];
  hasMedications: boolean | null;
  kidsInSchool: boolean | null;
  schoolLevels: string[];
  kidsActivities: string[];
  monthlyBudget: string;
  mainExpenseCategories: string[];
  goals: string[];
}

const WAKE_OPTIONS = ["05:30", "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00"];
const SLEEP_OPTIONS = ["21:00", "21:30", "22:00", "22:30", "23:00", "23:30", "00:00", "01:00"];
const DINNER_OPTIONS = ["18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30"];
const ALLERGY_OPTIONS = ["Lattosio", "Glutine", "Uova", "Frutta secca", "Pesce", "Crostacei", "Soia", "Sesamo"];
const DIET_OPTIONS = ["Vegetariano", "Vegano", "Senza glutine", "Senza lattosio", "Halal", "Kosher"];
const ACTIVITY_OPTIONS = ["Corsa", "Palestra", "Calcio", "Nuoto", "Yoga", "Ciclismo", "Tennis", "Danza", "Sci", "Camminata", "Pilates", "Crossfit"];
const DEADLINE_OPTIONS = ["Assicurazione auto", "Bollo auto", "Revisione auto", "Mutuo/Affitto", "Bollette", "Assicurazione casa", "Carta di identità", "Passaporto", "Patente"];
const SUBSCRIPTION_OPTIONS = ["Netflix", "Spotify", "Amazon Prime", "Disney+", "Apple TV+", "Palestra", "YouTube Premium", "Audible", "Altro"];
const SCHOOL_LEVEL_OPTIONS = ["Asilo / Nido", "Elementari", "Medie", "Superiori", "Università"];
const KIDS_ACTIVITY_OPTIONS = ["Calcio", "Nuoto", "Basket", "Musica", "Danza", "Arte", "Inglese", "Tennis", "Judo", "Ginnastica", "Rugby", "Scherma"];
const EXPENSE_CATEGORIES = ["Alimentari", "Ristoranti/Pizza", "Carburante", "Abbigliamento", "Salute/Farmacia", "Intrattenimento", "Istruzione", "Casa/Fai da te", "Viaggi", "Sport"];
const GOAL_OPTIONS = [
  "Coordinare meglio la famiglia",
  "Non dimenticare le scadenze",
  "Risparmiare sulle spese",
  "Tenere d'occhio i figli",
  "Organizzare la spesa",
  "Gestire i farmaci",
  "Pianificare i pasti",
  "Tracciare manutenzione veicoli",
  "Restare connessi anche a distanza",
  "Monitorare le finanze familiari",
];

const TOTAL_STEPS = 8;

function ProgressBar({ step }: { step: number }) {
  const pct = Math.round((step / (TOTAL_STEPS - 1)) * 100);
  return (
    <div className="mb-5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">Step {step} di {TOTAL_STEPS - 1}</span>
        <span className="text-xs font-medium text-primary">{pct}%</span>
      </div>
      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Chip({ label, selected, onClick, testId }: { label: string; selected: boolean; onClick: () => void; testId?: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${selected ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border text-foreground hover:border-primary/40"}`}
      data-testid={testId ?? `chip-${label.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {selected && <Check className="inline w-3 h-3 mr-1" />}
      {label}
    </button>
  );
}

function TimeRow({ options, value, onChange }: { options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map(t => (
        <button
          key={t}
          onClick={() => onChange(t)}
          className={`px-4 py-2 rounded-xl text-sm font-medium border transition-all ${value === t ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}
          data-testid={`time-${t}`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function YesNoRow({ value, onChange, yesLabel = "Sì", noLabel = "No" }: {
  value: boolean | null; onChange: (v: boolean) => void; yesLabel?: string; noLabel?: string;
}) {
  return (
    <div className="flex gap-3">
      <button
        onClick={() => onChange(true)}
        className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${value === true ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}
        data-testid="btn-yes"
      >
        {yesLabel}
      </button>
      <button
        onClick={() => onChange(false)}
        className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${value === false ? "bg-muted border-border" : "bg-background border-border hover:border-primary/40"}`}
        data-testid="btn-no"
      >
        {noLabel}
      </button>
    </div>
  );
}

function SectionLabel({ icon: Icon, text, color = "text-primary" }: { icon: typeof Sun; text: string; color?: string }) {
  return (
    <div className={`flex items-center gap-2 font-medium text-sm mb-3 ${color}`}>
      <Icon className="w-4 h-4" />
      <span>{text}</span>
    </div>
  );
}

export default function OnboardingPage({ profile, onComplete }: Props) {
  const { toast } = useToast();
  const [step, setStep] = useState(0);
  const [data, setData] = useState<OnboardingData>({
    wakeTime: "07:00",
    sleepTime: "23:00",
    dinnerTime: "20:00",
    occupation: "",
    whoShops: "",
    shoppingFrequency: "",
    hasPartner: null,
    kidsCount: 0,
    kidsAges: [],
    hasPets: null,
    petTypes: [],
    homeType: "",
    vehicleCount: 1,
    recurringDeadlines: [],
    activeSubscriptions: [],
    allergies: [],
    dietaryRestrictions: [],
    foodDislikes: "",
    foodLikes: "",
    cookingFrequency: "",
    whoCoooks: "",
    activities: [],
    hasMedications: null,
    kidsInSchool: null,
    schoolLevels: [],
    kidsActivities: [],
    monthlyBudget: "",
    mainExpenseCategories: [],
    goals: [],
  });
  const [aiInsight, setAiInsight] = useState<string | null>(null);

  const toggleArr = (field: keyof OnboardingData, value: string) => {
    setData(prev => {
      const arr = prev[field] as string[];
      return {
        ...prev,
        [field]: arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value],
      };
    });
  };

  const set = (field: keyof OnboardingData, value: any) => setData(prev => ({ ...prev, [field]: value }));

  const submitMutation = useMutation({
    mutationFn: async (payload?: Partial<OnboardingData>) => {
      const res = await apiRequest("POST", "/api/onboarding", payload ?? data);
      return res.json();
    },
    onSuccess: (result) => {
      setAiInsight(result.insight || null);
      setStep(TOTAL_STEPS);
    },
    onError: (e: Error) => {
      toast({ title: "Errore", description: e.message, variant: "destructive" });
    },
  });

  const handleNext = () => {
    if (step === TOTAL_STEPS - 1) {
      submitMutation.mutate();
    } else {
      setStep(s => s + 1);
    }
  };

  const handleBack = () => setStep(s => Math.max(0, s - 1));

  const handleFinish = () => {
    onComplete({ ...profile, onboardingCompleted: true });
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-primary/5 to-background px-5 py-6 overflow-y-auto">

      {/* ── STEP 0 — Welcome ── */}
      {step === 0 && (
        <div className="flex flex-col flex-1 justify-center items-center text-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
            <Sparkles className="w-10 h-10 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Ciao, {profile.name}!</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Dimmi un po' di te e della tua famiglia: in 3 minuti l'assistente AI
              sarà già personalizzato per voi.
            </p>
            <p className="text-xs text-muted-foreground mt-3">Più rispondi, più l'AI è utile. Puoi sempre aggiornare le preferenze nelle impostazioni.</p>
          </div>
          <Button size="lg" className="w-full mt-2" onClick={handleNext} data-testid="button-start-onboarding">
            Iniziamo <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
          <button
            className="text-sm text-muted-foreground underline"
            onClick={() => submitMutation.mutate({})}
            data-testid="button-skip-onboarding"
            disabled={submitMutation.isPending}
          >
            Salta per ora
          </button>
        </div>
      )}

      {/* ── STEP 1 — Giornata & routine ── */}
      {step === 1 && (
        <div className="flex flex-col gap-5">
          <ProgressBar step={step} />
          <div>
            <h2 className="text-xl font-bold mb-1">La tua giornata</h2>
            <p className="text-muted-foreground text-sm">Routine quotidiane e occupazione.</p>
          </div>

          <div>
            <SectionLabel icon={Sun} text="Mi sveglio alle" color="text-amber-500" />
            <TimeRow options={WAKE_OPTIONS} value={data.wakeTime} onChange={v => set("wakeTime", v)} />
          </div>

          <div>
            <SectionLabel icon={Moon} text="Vado a letto alle" color="text-indigo-500" />
            <TimeRow options={SLEEP_OPTIONS} value={data.sleepTime} onChange={v => set("sleepTime", v)} />
          </div>

          <div>
            <SectionLabel icon={UtensilsCrossed} text="Ceniamo di solito alle" color="text-orange-500" />
            <TimeRow options={DINNER_OPTIONS} value={data.dinnerTime} onChange={v => set("dinnerTime", v)} />
          </div>

          <div>
            <SectionLabel icon={Briefcase} text="Occupazione principale" color="text-blue-600" />
            <div className="grid grid-cols-2 gap-2">
              {[
                { v: "lavoro", l: "Lavoro" }, { v: "scuola", l: "Scuola" },
                { v: "università", l: "Università" }, { v: "pensionato", l: "Pensionato/a" },
                { v: "casalingo", l: "A casa" }, { v: "altro", l: "Altro" },
              ].map(({ v, l }) => (
                <button key={v} onClick={() => set("occupation", v)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${data.occupation === v ? "bg-primary/10 border-primary text-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`occupation-${v}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-auto pt-4">
            <Button variant="outline" className="flex-1" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-1" /> Indietro</Button>
            <Button className="flex-1" onClick={handleNext} data-testid="button-next-step1">Avanti <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* ── STEP 2 — Famiglia ── */}
      {step === 2 && (
        <div className="flex flex-col gap-5">
          <ProgressBar step={step} />
          <div>
            <div className="flex items-center gap-2 mb-1"><Users className="w-5 h-5 text-violet-500" /><h2 className="text-xl font-bold">La famiglia</h2></div>
            <p className="text-muted-foreground text-sm">Chi c'è in casa con te?</p>
          </div>

          <div>
            <SectionLabel icon={Heart} text="Hai un partner / coniuge?" color="text-pink-500" />
            <YesNoRow value={data.hasPartner} onChange={v => set("hasPartner", v)} />
          </div>

          <div>
            <SectionLabel icon={GraduationCap} text="Quanti figli hai?" color="text-blue-500" />
            <div className="flex gap-2 flex-wrap">
              {[0, 1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => set("kidsCount", n)}
                  className={`w-14 h-12 rounded-xl border text-sm font-bold transition-all ${data.kidsCount === n ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`kids-count-${n}`}
                >
                  {n === 0 ? "Nessuno" : n}
                </button>
              ))}
            </div>
          </div>

          {data.kidsCount > 0 && (
            <div>
              <SectionLabel icon={GraduationCap} text="Fasce d'età dei figli" color="text-blue-500" />
              <div className="flex flex-wrap gap-2">
                {["0–5 anni", "6–11 anni", "12–17 anni", "18+ anni"].map(a => (
                  <Chip key={a} label={a} selected={data.kidsAges.includes(a)} onClick={() => toggleArr("kidsAges", a)} />
                ))}
              </div>
            </div>
          )}

          <div>
            <SectionLabel icon={PawPrint} text="Avete animali domestici?" color="text-amber-500" />
            <YesNoRow value={data.hasPets} onChange={v => set("hasPets", v)} />
            {data.hasPets && (
              <div className="flex flex-wrap gap-2 mt-3">
                {["Cane", "Gatto", "Uccello", "Pesce", "Coniglio", "Altro"].map(p => (
                  <Chip key={p} label={p} selected={data.petTypes.includes(p)} onClick={() => toggleArr("petTypes", p)} />
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <Button variant="outline" className="flex-1" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-1" /> Indietro</Button>
            <Button className="flex-1" onClick={handleNext} data-testid="button-next-step2">Avanti <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* ── STEP 3 — Casa & veicoli ── */}
      {step === 3 && (
        <div className="flex flex-col gap-5">
          <ProgressBar step={step} />
          <div>
            <div className="flex items-center gap-2 mb-1"><Home className="w-5 h-5 text-green-600" /><h2 className="text-xl font-bold">Casa & veicoli</h2></div>
            <p className="text-muted-foreground text-sm">Per gestire scadenze, abbonamenti e manutenzioni.</p>
          </div>

          <div>
            <SectionLabel icon={Home} text="La casa è" color="text-green-600" />
            <div className="flex gap-2">
              {["Di proprietà", "In affitto", "Altro"].map(v => (
                <button key={v} onClick={() => set("homeType", v)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-medium transition-all ${data.homeType === v ? "bg-primary/10 border-primary text-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`home-type-${v.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={Car} text="Quanti veicoli ha la famiglia?" color="text-slate-600" />
            <div className="flex gap-2">
              {[0, 1, 2, 3, 4].map(n => (
                <button key={n} onClick={() => set("vehicleCount", n)}
                  className={`flex-1 py-3 rounded-xl border text-sm font-bold transition-all ${data.vehicleCount === n ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`vehicle-count-${n}`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={Bell} text="Scadenze ricorrenti che gestite" color="text-red-500" />
            <p className="text-xs text-muted-foreground mb-2">L'AI ti ricorderà in anticipo</p>
            <div className="flex flex-wrap gap-2">
              {DEADLINE_OPTIONS.map(d => (
                <Chip key={d} label={d} selected={data.recurringDeadlines.includes(d)} onClick={() => toggleArr("recurringDeadlines", d)} />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={CreditCard} text="Abbonamenti attivi" color="text-purple-500" />
            <div className="flex flex-wrap gap-2">
              {SUBSCRIPTION_OPTIONS.map(s => (
                <Chip key={s} label={s} selected={data.activeSubscriptions.includes(s)} onClick={() => toggleArr("activeSubscriptions", s)} />
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <Button variant="outline" className="flex-1" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-1" /> Indietro</Button>
            <Button className="flex-1" onClick={handleNext} data-testid="button-next-step3">Avanti <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* ── STEP 4 — Cucina & spesa ── */}
      {step === 4 && (
        <div className="flex flex-col gap-5">
          <ProgressBar step={step} />
          <div>
            <div className="flex items-center gap-2 mb-1"><Salad className="w-5 h-5 text-green-500" /><h2 className="text-xl font-bold">Cucina & spesa</h2></div>
            <p className="text-muted-foreground text-sm">Per la lista spesa intelligente e le ricette AI.</p>
          </div>

          <div>
            <SectionLabel icon={ShoppingCart} text="Chi fa la spesa di solito?" color="text-emerald-600" />
            <div className="grid grid-cols-2 gap-2">
              {[{ v: "io", l: "Io" }, { v: "partner", l: "Il partner" }, { v: "entrambi", l: "Entrambi" }, { v: "online", l: "Online" }].map(({ v, l }) => (
                <button key={v} onClick={() => set("whoShops", v)}
                  className={`py-3 rounded-xl border text-sm font-medium transition-all ${data.whoShops === v ? "bg-primary/10 border-primary text-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`who-shops-${v}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={ShoppingCart} text="Con che frequenza?" color="text-emerald-600" />
            <div className="flex flex-col gap-2">
              {["Quasi ogni giorno", "2–3 volte a settimana", "Una volta a settimana", "Ogni due settimane"].map(f => (
                <button key={f} onClick={() => set("shoppingFrequency", f)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${data.shoppingFrequency === f ? "bg-primary/10 border-primary text-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`shopping-freq-${f.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={UtensilsCrossed} text="Chi cucina di solito?" color="text-orange-500" />
            <div className="grid grid-cols-2 gap-2">
              {[{ v: "io", l: "Io" }, { v: "partner", l: "Il partner" }, { v: "entrambi", l: "A rotazione" }, { v: "vario", l: "Dipende" }].map(({ v, l }) => (
                <button key={v} onClick={() => set("whoCoooks", v)}
                  className={`py-3 rounded-xl border text-sm font-medium transition-all ${data.whoCoooks === v ? "bg-primary/10 border-primary text-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`who-cooks-${v}`}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={Salad} text="Allergie o intolleranze personali" color="text-red-500" />
            <div className="flex flex-wrap gap-2">
              {ALLERGY_OPTIONS.map(a => (
                <Chip key={a} label={a} selected={data.allergies.includes(a)} onClick={() => toggleArr("allergies", a)} />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={Salad} text="Preferenze alimentari" color="text-green-500" />
            <div className="flex flex-wrap gap-2">
              {DIET_OPTIONS.map(d => (
                <Chip key={d} label={d} selected={data.dietaryRestrictions.includes(d)} onClick={() => toggleArr("dietaryRestrictions", d)} />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={Utensils} text="Piatti/ingredienti non graditi (opzionale)" color="text-muted-foreground" />
            <input
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
              placeholder="Es. funghi, olive, fegato..."
              value={data.foodDislikes}
              onChange={e => set("foodDislikes", e.target.value)}
              data-testid="input-food-dislikes"
            />
          </div>

          <div>
            <SectionLabel icon={Utensils} text="Piatti preferiti (opzionale)" color="text-muted-foreground" />
            <input
              className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm outline-none focus:border-primary"
              placeholder="Es. pasta al pesto, risotto, pizza..."
              value={data.foodLikes}
              onChange={e => set("foodLikes", e.target.value)}
              data-testid="input-food-likes"
            />
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <Button variant="outline" className="flex-1" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-1" /> Indietro</Button>
            <Button className="flex-1" onClick={handleNext} data-testid="button-next-step4">Avanti <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* ── STEP 5 — Sport & hobby ── */}
      {step === 5 && (
        <div className="flex flex-col gap-5">
          <ProgressBar step={step} />
          <div>
            <div className="flex items-center gap-2 mb-1"><Dumbbell className="w-5 h-5 text-blue-500" /><h2 className="text-xl font-bold">Sport & hobby</h2></div>
            <p className="text-muted-foreground text-sm">Cosa fai nel tempo libero?</p>
          </div>

          <div>
            <p className="font-medium text-sm mb-3">Seleziona tutto quello che pratichi</p>
            <div className="flex flex-wrap gap-2">
              {ACTIVITY_OPTIONS.map(a => (
                <Chip key={a} label={a} selected={data.activities.includes(a)} onClick={() => toggleArr("activities", a)} />
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <Button variant="outline" className="flex-1" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-1" /> Indietro</Button>
            <Button className="flex-1" onClick={handleNext} data-testid="button-next-step5">Avanti <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* ── STEP 6 — Salute & scuola ── */}
      {step === 6 && (
        <div className="flex flex-col gap-5">
          <ProgressBar step={step} />
          <div>
            <div className="flex items-center gap-2 mb-1"><Pill className="w-5 h-5 text-red-500" /><h2 className="text-xl font-bold">Salute & scuola</h2></div>
            <p className="text-muted-foreground text-sm">Per promemoria farmaci e monitoraggio scolastico.</p>
          </div>

          <div>
            <SectionLabel icon={Pill} text="Prendi farmaci regolarmente?" color="text-red-500" />
            <YesNoRow value={data.hasMedications} onChange={v => set("hasMedications", v)} yesLabel="Sì, regolarmente" noLabel="No" />
            {data.hasMedications && (
              <p className="text-xs text-primary mt-2 bg-primary/5 rounded-lg p-2">
                Potrai aggiungere i dettagli dei farmaci nella sezione "Farmaci & Salute".
              </p>
            )}
          </div>

          {data.kidsCount > 0 && (
            <>
              <div>
                <SectionLabel icon={BookOpen} text="I figli vanno a scuola?" color="text-blue-500" />
                <YesNoRow value={data.kidsInSchool} onChange={v => set("kidsInSchool", v)} />
              </div>

              {data.kidsInSchool && (
                <div>
                  <SectionLabel icon={GraduationCap} text="Quale livello scolastico?" color="text-blue-500" />
                  <div className="flex flex-wrap gap-2">
                    {SCHOOL_LEVEL_OPTIONS.map(l => (
                      <Chip key={l} label={l} selected={data.schoolLevels.includes(l)} onClick={() => toggleArr("schoolLevels", l)} />
                    ))}
                  </div>
                </div>
              )}

              <div>
                <SectionLabel icon={Dumbbell} text="Attività extrascolastiche dei figli" color="text-violet-500" />
                <div className="flex flex-wrap gap-2">
                  {KIDS_ACTIVITY_OPTIONS.map(a => (
                    <Chip key={a} label={a} selected={data.kidsActivities.includes(a)} onClick={() => toggleArr("kidsActivities", a)} />
                  ))}
                </div>
              </div>
            </>
          )}

          <div className="flex gap-2 mt-auto pt-2">
            <Button variant="outline" className="flex-1" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-1" /> Indietro</Button>
            <Button className="flex-1" onClick={handleNext} data-testid="button-next-step6">Avanti <ChevronRight className="w-4 h-4 ml-1" /></Button>
          </div>
        </div>
      )}

      {/* ── STEP 7 — Budget & obiettivi ── */}
      {step === 7 && (
        <div className="flex flex-col gap-5">
          <ProgressBar step={step} />
          <div>
            <div className="flex items-center gap-2 mb-1"><Wallet className="w-5 h-5 text-violet-500" /><h2 className="text-xl font-bold">Budget & obiettivi</h2></div>
            <p className="text-muted-foreground text-sm">L'AI darà priorità a ciò che conta per te.</p>
          </div>

          <div>
            <SectionLabel icon={Wallet} text="Budget familiare mensile indicativo" color="text-violet-500" />
            <div className="flex flex-col gap-2">
              {["Meno di 1.500 €", "1.500 – 3.000 €", "3.000 – 5.000 €", "Più di 5.000 €", "Preferisco non dirlo"].map(b => (
                <button key={b} onClick={() => set("monthlyBudget", b)}
                  className={`p-3 rounded-xl border text-sm font-medium transition-all text-left ${data.monthlyBudget === b ? "bg-primary/10 border-primary text-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`budget-${b.toLowerCase().replace(/\s+/g, "-").replace(/[€–]/g, "")}`}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={Wallet} text="Principali voci di spesa" color="text-violet-500" />
            <div className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES.map(c => (
                <Chip key={c} label={c} selected={data.mainExpenseCategories.includes(c)} onClick={() => toggleArr("mainExpenseCategories", c)} />
              ))}
            </div>
          </div>

          <div>
            <SectionLabel icon={Target} text="Cosa vuoi migliorare con FamilyTracker?" color="text-emerald-600" />
            <div className="flex flex-col gap-2">
              {GOAL_OPTIONS.map(g => (
                <button key={g} onClick={() => toggleArr("goals", g)}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${data.goals.includes(g) ? "bg-primary/10 border-primary" : "bg-background border-border hover:border-primary/40"}`}
                  data-testid={`goal-${g.toLowerCase().replace(/\s+/g, "-").slice(0, 30)}`}
                >
                  {data.goals.includes(g)
                    ? <Check className="w-5 h-5 text-primary flex-shrink-0" />
                    : <div className="w-5 h-5 rounded-full border-2 border-border flex-shrink-0" />}
                  <span className="text-sm font-medium">{g}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 mt-auto pt-2">
            <Button variant="outline" className="flex-1" onClick={handleBack}><ChevronLeft className="w-4 h-4 mr-1" /> Indietro</Button>
            <Button className="flex-1" onClick={handleNext} disabled={submitMutation.isPending} data-testid="button-finish-onboarding">
              {submitMutation.isPending
                ? <span className="flex items-center gap-2"><Sparkles className="w-4 h-4 animate-pulse" /> Elaboro...</span>
                : <span className="flex items-center gap-2">Finito! <Sparkles className="w-4 h-4" /></span>}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 8 — Done ── */}
      {step === TOTAL_STEPS && (
        <div className="flex flex-col flex-1 justify-center items-center text-center gap-6">
          <div className="w-20 h-20 rounded-2xl bg-green-100 flex items-center justify-center">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold mb-2">Tutto pronto!</h1>
            <p className="text-muted-foreground text-base leading-relaxed">
              Ho imparato le abitudini della tua famiglia. Posso già aiutarti in modo personale.
            </p>
          </div>

          {aiInsight && (
            <div className="w-full bg-primary/5 border border-primary/20 rounded-2xl p-4 text-left">
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-4 h-4 text-primary" />
                <span className="text-xs font-semibold text-primary uppercase tracking-wide">Il tuo primo insight AI</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{aiInsight}</p>
            </div>
          )}

          <Button size="lg" className="w-full" onClick={handleFinish} data-testid="button-enter-app">
            Entra nell'app <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      )}
    </div>
  );
}
