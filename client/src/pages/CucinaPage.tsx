import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import {
  Camera, ChefHat, Calendar, Settings2, Loader2, Plus, Trash2,
  ShoppingCart, Star, Clock, CheckCircle2, AlertCircle, RefreshCw,
  Utensils, Sparkles, X,
} from "lucide-react";
import type { Profile } from "@shared/schema";

// ── Types ─────────────────────────────────────────────────────────────────────
interface Recipe {
  name: string;
  time: string;
  difficulty: "facile" | "media" | "difficile";
  ingredients: string[];
  steps: string[];
  emoji: string;
}
interface ScanResult {
  detectedIngredients?: string[];
  recipes?: Recipe[];
  missingItems?: { name: string; category: string; priority: "alta" | "media" | "bassa"; reason: string }[];
  detectedItems?: string[];
}
interface MenuDay {
  day: string;
  lunch: { name: string; time: string; emoji: string };
  dinner: { name: string; time: string; emoji: string };
}
interface WeekMenu { week: MenuDay[] }
interface FoodPref {
  id: string;
  profileId: string | null;
  likes: string[];
  dislikes: string[];
  allergies: string[];
  dietaryRestrictions: string[];
}

type Tab = "scan" | "menu" | "prefs";
type ScanMode = "recipes" | "missing";

const DIFFICULTY_COLOR: Record<string, string> = {
  facile: "bg-emerald-100 text-emerald-700",
  media: "bg-amber-100 text-amber-700",
  difficile: "bg-red-100 text-red-700",
};
const PRIORITY_COLOR: Record<string, string> = {
  alta: "bg-red-100 text-red-700",
  media: "bg-amber-100 text-amber-700",
  bassa: "bg-slate-100 text-slate-600",
};

// ── Helpers ───────────────────────────────────────────────────────────────────
async function fileToBase64(file: File): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(",");
      const mediaType = header.split(":")[1].split(";")[0];
      resolve({ base64, mediaType: mediaType as any });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function compressImage(file: File, maxSize = 1200): Promise<{ base64: string; mediaType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      let w = img.naturalWidth, h = img.naturalHeight;
      if (w > maxSize || h > maxSize) {
        if (w > h) { h = Math.round((h * maxSize) / w); w = maxSize; }
        else { w = Math.round((w * maxSize) / h); h = maxSize; }
      }
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
      const base64 = canvas.toDataURL("image/jpeg", 0.82).split(",")[1];
      resolve({ base64, mediaType: "image/jpeg" });
    };
    img.onerror = reject;
    img.src = url;
  });
}

// ── Components ────────────────────────────────────────────────────────────────
function TagInput({ label, values, onChange, placeholder }: {
  label: string; values: string[]; onChange: (v: string[]) => void; placeholder: string;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim();
    if (t && !values.includes(t)) onChange([...values, t]);
    setInput("");
  };
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">{label}</p>
      <div className="flex gap-2 mb-2">
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && (e.preventDefault(), add())}
          placeholder={placeholder}
          className="flex-1 bg-slate-100 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
          data-testid={`input-tag-${label}`}
        />
        <button onClick={add} className="px-3 py-2 bg-slate-200 rounded-xl text-slate-600 hover:bg-slate-300 transition" data-testid={`btn-add-tag-${label}`}>
          <Plus size={16} />
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => (
          <span key={v} className="flex items-center gap-1 bg-slate-200 text-slate-700 rounded-full px-2.5 py-0.5 text-xs">
            {v}
            <button onClick={() => onChange(values.filter(x => x !== v))}><X size={10} /></button>
          </span>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function CucinaPage() {
  const { profile } = useAuth();
  const [tab, setTab] = useState<Tab>("scan");
  const [scanMode, setScanMode] = useState<ScanMode>("recipes");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [weekMenu, setWeekMenu] = useState<WeekMenu | null>(null);
  const [expandedRecipe, setExpandedRecipe] = useState<number | null>(null);
  const [prefLikes, setPrefLikes] = useState<string[]>([]);
  const [prefDislikes, setPrefDislikes] = useState<string[]>([]);
  const [prefAllergies, setPrefAllergies] = useState<string[]>([]);
  const [prefDietary, setPrefDietary] = useState<string[]>([]);
  const [prefSaved, setPrefSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: members } = useQuery<(Profile & { role: string })[]>({ queryKey: ["/api/family/profiles"] });
  const { data: prefs } = useQuery<FoodPref[]>({ queryKey: ["/api/kitchen/preferences"] });

  useEffect(() => {
    if (!prefs) return;
    const familyPref = prefs.find(p => !p.profileId);
    if (familyPref) {
      setPrefLikes(familyPref.likes ?? []);
      setPrefDislikes(familyPref.dislikes ?? []);
      setPrefAllergies(familyPref.allergies ?? []);
      setPrefDietary(familyPref.dietaryRestrictions ?? []);
    }
  }, [prefs]);

  const scanMutation = useMutation({
    mutationFn: (body: { imageBase64: string; mediaType: string; mode: ScanMode }) =>
      apiRequest("POST", "/api/kitchen/scan", body).then(r => r.json()),
    onSuccess: (data: ScanResult) => setScanResult(data),
  });

  const menuMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/kitchen/menu", {}).then(r => r.json()),
    onSuccess: (data: WeekMenu) => setWeekMenu(data),
  });

  const prefMutation = useMutation({
    mutationFn: (body: any) => apiRequest("PUT", "/api/kitchen/preferences", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/kitchen/preferences"] });
      setPrefSaved(true);
      setTimeout(() => setPrefSaved(false), 2500);
    },
  });

  const addToShoppingMutation = useMutation({
    mutationFn: (name: string) => apiRequest("POST", "/api/shopping", { name, qty: 1, unit: "pz", category: "Altro" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/shopping"] }),
  });

  const handlePhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanResult(null);
    setPreviewUrl(URL.createObjectURL(file));
    const { base64, mediaType } = await compressImage(file);
    scanMutation.mutate({ imageBase64: base64, mediaType, mode: scanMode });
    e.target.value = "";
  };

  const TABS: { id: Tab; label: string; Icon: any }[] = [
    { id: "scan", label: "Scansiona", Icon: Camera },
    { id: "menu", label: "Menu", Icon: Calendar },
    { id: "prefs", label: "Preferenze", Icon: Settings2 },
  ];

  return (
    <div className="flex flex-col h-full bg-[#f5f5f0]">
      {/* Tab bar */}
      <div className="flex gap-1 px-4 pt-4 pb-2">
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-2xl text-sm font-medium transition-all ${
              tab === id ? "bg-slate-900 text-white shadow-sm" : "bg-white text-slate-500 border border-slate-200"
            }`}
            data-testid={`tab-cucina-${id}`}
          >
            <Icon size={15} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-4">

        {/* ── SCAN TAB ── */}
        {tab === "scan" && (
          <>
            {/* Mode selector */}
            <div className="flex gap-2 bg-white rounded-2xl p-1.5 border border-slate-200">
              <button
                onClick={() => { setScanMode("recipes"); setScanResult(null); setPreviewUrl(null); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${scanMode === "recipes" ? "bg-orange-500 text-white shadow-sm" : "text-slate-500"}`}
                data-testid="btn-scan-recipes"
              >
                🍳 Ricette dal frigo
              </button>
              <button
                onClick={() => { setScanMode("missing"); setScanResult(null); setPreviewUrl(null); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-all ${scanMode === "missing" ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500"}`}
                data-testid="btn-scan-missing"
              >
                🛒 Cosa manca?
              </button>
            </div>

            {/* Camera button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative rounded-3xl overflow-hidden cursor-pointer active:scale-95 transition-transform"
              style={{ minHeight: 180 }}
              data-testid="btn-camera"
            >
              {previewUrl ? (
                <img src={previewUrl} alt="Foto frigo" className="w-full object-cover" style={{ maxHeight: 260 }} />
              ) : (
                <div className={`flex flex-col items-center justify-center gap-3 py-12 ${scanMode === "recipes" ? "bg-gradient-to-br from-orange-400 to-amber-500" : "bg-gradient-to-br from-emerald-400 to-teal-500"}`}>
                  <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center">
                    <Camera size={28} className="text-white" />
                  </div>
                  <p className="text-white font-semibold text-sm">
                    {scanMode === "recipes" ? "Fotografa frigo o dispensa" : "Fotografa per trovare cosa manca"}
                  </p>
                  <p className="text-white/70 text-xs">Tocca per aprire la fotocamera</p>
                </div>
              )}
              {scanMutation.isPending && (
                <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-3">
                  <Loader2 size={32} className="text-white animate-spin" />
                  <p className="text-white text-sm font-medium">Analisi AI in corso…</p>
                </div>
              )}
            </div>

            {previewUrl && !scanMutation.isPending && (
              <button
                onClick={() => { setScanResult(null); setPreviewUrl(null); fileInputRef.current?.click(); }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-2xl bg-white border border-slate-200 text-sm text-slate-600"
                data-testid="btn-new-scan"
              >
                <RefreshCw size={15} /> Nuova scansione
              </button>
            )}

            <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handlePhoto} />

            {/* Scan error */}
            {scanMutation.isError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 rounded-2xl border border-red-100">
                <AlertCircle size={16} className="text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600">Errore durante l'analisi. Riprova.</p>
              </div>
            )}

            {/* Results — RECIPES */}
            {scanResult?.detectedIngredients && (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-1.5">
                  {scanResult.detectedIngredients.map(ing => (
                    <span key={ing} className="bg-amber-100 text-amber-800 rounded-full px-2.5 py-0.5 text-xs font-medium">{ing}</span>
                  ))}
                </div>
                {scanResult.recipes?.map((recipe, i) => (
                  <div key={i} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden" data-testid={`recipe-card-${i}`}>
                    <button
                      className="w-full text-left px-4 pt-4 pb-3 flex items-start gap-3"
                      onClick={() => setExpandedRecipe(expandedRecipe === i ? null : i)}
                    >
                      <span className="text-2xl">{recipe.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900 text-sm">{recipe.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="flex items-center gap-1 text-xs text-slate-500"><Clock size={11} />{recipe.time}</span>
                          <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${DIFFICULTY_COLOR[recipe.difficulty]}`}>{recipe.difficulty}</span>
                        </div>
                      </div>
                    </button>
                    {expandedRecipe === i && (
                      <div className="px-4 pb-4 border-t border-slate-100">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Ingredienti</p>
                        <ul className="space-y-0.5">
                          {recipe.ingredients.map((ing, j) => (
                            <li key={j} className="text-sm text-slate-600 flex items-center gap-2">
                              <span className="w-1 h-1 rounded-full bg-slate-300 flex-shrink-0" />{ing}
                            </li>
                          ))}
                        </ul>
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-3 mb-1.5">Procedimento</p>
                        <ol className="space-y-1.5">
                          {recipe.steps.map((step, j) => (
                            <li key={j} className="text-sm text-slate-600 flex gap-2">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-orange-100 text-orange-600 text-[11px] font-bold flex items-center justify-center">{j + 1}</span>
                              {step}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Results — MISSING ITEMS */}
            {scanResult?.missingItems && (
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Rilevato nel frigo</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(scanResult.detectedItems ?? []).map(item => (
                      <span key={item} className="bg-slate-100 text-slate-600 rounded-full px-2.5 py-0.5 text-xs">{item}</span>
                    ))}
                  </div>
                </div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prodotti mancanti</p>
                {scanResult.missingItems.map((item, i) => (
                  <div key={i} className="bg-white rounded-2xl border border-slate-100 px-4 py-3 flex items-center gap-3 shadow-sm" data-testid={`missing-item-${i}`}>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-sm text-slate-900">{item.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${PRIORITY_COLOR[item.priority]}`}>{item.priority}</span>
                        <span className="text-xs text-slate-400">{item.reason}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => addToShoppingMutation.mutate(item.name)}
                      className="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center active:scale-90 transition-transform"
                      data-testid={`btn-add-shopping-${i}`}
                    >
                      {addToShoppingMutation.isPending ? <Loader2 size={14} className="text-emerald-600 animate-spin" /> : <ShoppingCart size={14} className="text-emerald-600" />}
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => scanResult.missingItems?.forEach(item => addToShoppingMutation.mutate(item.name))}
                  className="w-full py-3 rounded-2xl bg-emerald-500 text-white text-sm font-semibold flex items-center justify-center gap-2"
                  data-testid="btn-add-all-shopping"
                >
                  <ShoppingCart size={16} /> Aggiungi tutti alla lista spesa
                </button>
              </div>
            )}
          </>
        )}

        {/* ── MENU TAB ── */}
        {tab === "menu" && (
          <>
            <div className="bg-gradient-to-br from-violet-500 to-purple-600 rounded-3xl p-5 shadow-md">
              <div className="flex items-center gap-3 mb-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Sparkles size={20} className="text-white" />
                </div>
                <div>
                  <p className="font-bold text-white text-sm">Menu settimanale AI</p>
                  <p className="text-white/70 text-xs">Basato su preferenze e stagionalità</p>
                </div>
              </div>
              <button
                onClick={() => menuMutation.mutate()}
                disabled={menuMutation.isPending}
                className="w-full py-2.5 rounded-2xl bg-white text-violet-700 text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                data-testid="btn-generate-menu"
              >
                {menuMutation.isPending ? <><Loader2 size={15} className="animate-spin" /> Generazione…</> : <><ChefHat size={15} /> Genera menu della settimana</>}
              </button>
            </div>

            {weekMenu?.week?.map((day, i) => (
              <div key={i} className="bg-white rounded-3xl border border-slate-100 shadow-sm overflow-hidden" data-testid={`menu-day-${i}`}>
                <div className="px-4 pt-3 pb-2 border-b border-slate-100">
                  <p className="font-bold text-slate-900 text-sm">{day.day}</p>
                </div>
                <div className="divide-y divide-slate-100">
                  {[{ label: "Pranzo", meal: day.lunch }, { label: "Cena", meal: day.dinner }].map(({ label, meal }) => (
                    <div key={label} className="px-4 py-3 flex items-center gap-3">
                      <span className="text-xl">{meal.emoji}</span>
                      <div>
                        <p className="text-xs text-slate-400 font-medium">{label}</p>
                        <p className="text-sm font-semibold text-slate-800">{meal.name}</p>
                      </div>
                      <span className="ml-auto flex items-center gap-1 text-xs text-slate-400"><Clock size={11} />{meal.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {!weekMenu && !menuMutation.isPending && (
              <div className="text-center py-8 text-slate-400 text-sm">
                <Utensils size={32} className="mx-auto mb-2 opacity-30" />
                Tocca "Genera menu" per ricevere<br />un piano settimanale personalizzato
              </div>
            )}
          </>
        )}

        {/* ── PREFERENCES TAB ── */}
        {tab === "prefs" && (
          <>
            <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-4">
              <div className="flex items-center gap-2 mb-4">
                <Star size={16} className="text-amber-500" />
                <p className="font-semibold text-slate-900 text-sm">Preferenze famiglia</p>
              </div>
              <TagInput label="Piatti preferiti" values={prefLikes} onChange={setPrefLikes} placeholder="Es: pasta, pizza…" />
              <TagInput label="Ingredienti da evitare" values={prefDislikes} onChange={setPrefDislikes} placeholder="Es: pesce, cipolla…" />
              <TagInput label="Allergie / intolleranze" values={prefAllergies} onChange={setPrefAllergies} placeholder="Es: lattosio, glutine…" />
              <TagInput label="Restrizioni dietetiche" values={prefDietary} onChange={setPrefDietary} placeholder="Es: vegetariano, vegan…" />
              <button
                onClick={() => prefMutation.mutate({ likes: prefLikes, dislikes: prefDislikes, allergies: prefAllergies, dietaryRestrictions: prefDietary })}
                disabled={prefMutation.isPending}
                className="w-full py-3 rounded-2xl bg-slate-900 text-white text-sm font-semibold flex items-center justify-center gap-2 active:scale-95 transition-transform"
                data-testid="btn-save-prefs"
              >
                {prefMutation.isPending ? <Loader2 size={15} className="animate-spin" /> : prefSaved ? <><CheckCircle2 size={15} /> Salvato!</> : "Salva preferenze"}
              </button>
            </div>

            <div className="bg-amber-50 border border-amber-100 rounded-2xl px-4 py-3">
              <p className="text-xs text-amber-700 leading-relaxed">
                💡 Le preferenze vengono usate per generare ricette e il menu settimanale evitando allergie e ingredienti non graditi.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
