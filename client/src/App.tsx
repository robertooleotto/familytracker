import { useState, useEffect, useRef, lazy, Suspense, Component, type ReactNode, useCallback } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { AuthContext } from "@/lib/authContext";
import { haptics } from "@/lib/haptics";
import { useLocation } from "wouter";
import AuthPage from "@/pages/AuthPage";
import BriefingPage from "@/pages/BriefingPage";
import OnboardingPage from "@/pages/OnboardingPage";

const DashboardPage       = lazy(() => import("@/pages/DashboardPage"));
const MapPage             = lazy(() => import("@/pages/MapPage"));
const ChatPage            = lazy(() => import("@/pages/ChatPage"));
const CalendarPage        = lazy(() => import("@/pages/CalendarPage"));
const ShoppingPage        = lazy(() => import("@/pages/ShoppingPage"));
const GeofencePage        = lazy(() => import("@/pages/GeofencePage"));
const MedsPage            = lazy(() => import("@/pages/MedsPage"));
const HomeDeadlinesPage   = lazy(() => import("@/pages/HomeDeadlinesPage"));
const TasksPage           = lazy(() => import("@/pages/TasksPage"));
const SettingsPage        = lazy(() => import("@/pages/SettingsPage"));
const BudgetPage          = lazy(() => import("@/pages/BudgetPage"));
const PetsPage            = lazy(() => import("@/pages/PetsPage"));
const VehiclesPage        = lazy(() => import("@/pages/VehiclesPage"));
const SubscriptionsPage   = lazy(() => import("@/pages/SubscriptionsPage"));
const HomeContactsPage    = lazy(() => import("@/pages/HomeContactsPage"));
const AnniversariesPage   = lazy(() => import("@/pages/AnniversariesPage"));
const DinnerPage          = lazy(() => import("@/pages/DinnerPage"));
const BankingPage         = lazy(() => import("@/pages/BankingPage"));
const AiPage              = lazy(() => import("@/pages/AiPage"));
const SchoolPage          = lazy(() => import("@/pages/SchoolPage"));
const SmartProtectionPage = lazy(() => import("@/pages/SmartProtectionPage"));
const CucinaPage          = lazy(() => import("@/pages/CucinaPage"));
const DocumentiPage       = lazy(() => import("@/pages/DocumentiPage"));
const ElderlyPage         = lazy(() => import("@/pages/ElderlyPage"));
const GiornalePage        = lazy(() => import("@/pages/GiornalePage"));
const DiarioPage          = lazy(() => import("@/pages/DiarioPage"));
const AiFamilyChatPage    = lazy(() => import("@/pages/AiFamilyChatPage"));

// ─── Error Boundary ───────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <p className="text-muted-foreground">Si è verificato un errore in questa sezione.</p>
          <button
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium"
            onClick={() => this.setState({ hasError: false })}
          >
            Riprova
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
import {
  LayoutDashboard, MapPin, MessageCircle, Calendar, ShoppingCart,
  Shield, Pill, Home, Star, Settings, X, Wallet,
  PawPrint, Car, Phone, UtensilsCrossed, Sparkles, GraduationCap, ShieldCheck, ChefHat, FolderOpen, Heart, BookOpen, Map, Bot, LogOut,
} from "lucide-react";

const MAIN_TABS = [
  { id: "briefing", label: "Home",   icon: Home },
  { id: "map",      label: "Mappa",  icon: MapPin },
  { id: "chat",     label: "Chat",   icon: MessageCircle },
  { id: "calendar", label: "Agenda", icon: Calendar },
  { id: "more",     label: "Altro",  icon: Settings },
];

const MORE_SECTIONS = [
  {
    title: "📔 Giornale",
    items: [
      { id: "giornale",  label: "Giornale",       icon: BookOpen,     color: "#E8533A" },
      { id: "diario",    label: "Diario Percorsi", icon: Map,          color: "#3B82F6" },
    ],
  },
  {
    title: "📅 Pianificazione",
    items: [
      { id: "calendar",  label: "Agenda",        icon: Calendar,     color: "#8B5CF6" },
      { id: "tasks",     label: "Compiti",        icon: Star,         color: "#F59E0B" },
      { id: "deadlines", label: "Scadenze casa",  icon: Home,         color: "#8B5CF6" },
      { id: "contacts",  label: "Contatti casa",  icon: Phone,        color: "#10B981" },
    ],
  },
  {
    title: "🛒 Spesa & Finanze",
    items: [
      { id: "shopping",  label: "Lista spesa",    icon: ShoppingCart, color: "#10B981" },
      { id: "budget",    label: "Budget + Conto", icon: Wallet,       color: "#3B82F6" },
      { id: "documenti", label: "Documenti",      icon: FolderOpen,   color: "#0EA5E9" },
    ],
  },
  {
    title: "🏡 Casa & Vita quotidiana",
    items: [
      { id: "dinner",    label: "Chi cucina",     icon: UtensilsCrossed, color: "#F97316" },
      { id: "cucina",    label: "Cucina AI",      icon: ChefHat,         color: "#EA580C" },
      { id: "pets",      label: "Animali",        icon: PawPrint,        color: "#F59E0B" },
      { id: "vehicles",  label: "Veicoli",        icon: Car,             color: "#3B82F6" },
      { id: "meds",      label: "Farmaci",        icon: Pill,            color: "#EF4444" },
      { id: "geofences", label: "Zone sicure",    icon: Shield,          color: "#06B6D4" },
    ],
  },
  {
    title: "🛡️ Sicurezza & Scuola",
    items: [
      { id: "elderly",         label: "Sicurezza anziani", icon: Heart,         color: "#EF4444" },
      { id: "smartprotection", label: "Protezione smart",  icon: ShieldCheck,   color: "#10B981" },
      { id: "school",          label: "Registri scuola",   icon: GraduationCap, color: "#0EA5E9" },
      { id: "ai",              label: "AI Predittiva",     icon: Sparkles,      color: "#8B5CF6" },
      { id: "aichat",          label: "Assistente AI",     icon: Bot,           color: "#2563EB" },
    ],
  },
];

const PAGE_TITLES: Record<string, string> = {
  briefing: "FamilyTracker",
  map: "Mappa live",
  chat: "Chat familiare",
  calendar: "Agenda",
  shopping: "Lista spesa",
  budget: "Budget spese",
  tasks: "Compiti & Premi",
  deadlines: "Scadenze casa",
  meds: "Farmaci & Salute",
  geofences: "Zone sicure",
  settings: "Impostazioni",
  pets: "Animali domestici",
  vehicles: "Veicoli di famiglia",
  subscriptions: "Abbonamenti",
  contacts: "Contatti casa",
  anniversaries: "Compleanni & Anniversari",
  dinner: "Chi cucina stasera",
  cucina: "Cucina AI",
  ai: "AI Predittiva",
  school: "Registri scolastici",
  smartprotection: "Protezione smart",
  documenti: "Documenti di famiglia",
  elderly: "Sicurezza anziani",
  giornale: "Giornale di Famiglia",
  diario: "Diario Percorsi",
  aichat: "Assistente Famiglia",
};

// ─── More Sheet (slide-up) ────────────────────────────────────────────────────
function MoreSheet({ onSelect, onClose, onLogout }: { onSelect: (id: string) => void; onClose: () => void; onLogout: () => void }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Trigger animation after mount
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 280);
  };

  const handleSelect = (id: string) => {
    haptics.tap();
    setVisible(false);
    setTimeout(() => { onSelect(id); onClose(); }, 220);
  };

  return (
    <div
      className="absolute inset-0 z-[9999]"
      style={{
        background: visible ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0)",
        backdropFilter: visible ? "blur(4px)" : "blur(0px)",
        transition: "background 0.28s ease, backdrop-filter 0.28s ease",
      }}
      onClick={handleClose}
    >
      <div
        className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl overflow-hidden"
        style={{
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "84vh",
          boxShadow: "0 -4px 40px rgba(0,0,0,0.18)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-10 h-1 bg-slate-200 rounded-full" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h3 className="font-bold text-base text-slate-900">Funzionalità</h3>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center active:bg-slate-200 transition-colors"
            data-testid="button-close-more"
          >
            <X className="w-4 h-4 text-slate-600" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto pb-4 px-4" style={{ maxHeight: "calc(84vh - 80px)" }}>
          {MORE_SECTIONS.map(section => (
            <div key={section.title} className="mb-5">
              <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-widest mb-2 px-1">{section.title}</p>
              <div className="grid grid-cols-2 gap-2.5">
                {section.items.map(({ id, label, icon: Icon, color }) => (
                  <button
                    key={id}
                    onClick={() => handleSelect(id)}
                    className="flex items-center gap-3 p-3.5 rounded-2xl text-left active:scale-95 transition-transform"
                    style={{ background: `${color}12`, border: `1px solid ${color}22` }}
                    data-testid={`more-nav-${id}`}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${color}20` }}
                    >
                      <Icon className="w-[18px] h-[18px]" style={{ color }} />
                    </div>
                    <span className="text-[13px] font-semibold text-slate-800 leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Impostazioni e Logout — separati in fondo */}
          <div className="border-t border-slate-100 pt-3 pb-4 space-y-2">
            <button
              onClick={() => handleSelect("settings")}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left active:scale-95 transition-transform bg-slate-50 border border-slate-100"
              data-testid="more-nav-settings"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-slate-200">
                <Settings className="w-[18px] h-[18px] text-slate-500" />
              </div>
              <span className="text-[13px] font-semibold text-slate-600">Impostazioni</span>
            </button>
            <button
              onClick={() => { haptics.tap(); setVisible(false); setTimeout(() => { onLogout(); onClose(); }, 220); }}
              className="w-full flex items-center gap-3 px-3.5 py-3 rounded-2xl text-left active:scale-95 transition-transform bg-red-50 border border-red-100"
              data-testid="more-nav-logout"
            >
              <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-red-100">
                <LogOut className="w-[18px] h-[18px] text-red-500" />
              </div>
              <span className="text-[13px] font-semibold text-red-600">Esci dall'account</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Bottom Navigation ────────────────────────────────────────────────────────
function BottomNav({
  activeId,
  onClick,
}: {
  activeId: string;
  onClick: (id: string) => void;
}) {
  const [pressedId, setPressedId] = useState<string | null>(null);

  const handleClick = (id: string) => {
    haptics.medium();
    setPressedId(id);
    setTimeout(() => setPressedId(null), 150);
    onClick(id);
  };

  return (
    <nav
      className="flex flex-shrink-0 border-t border-border bg-background"
      style={{
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      {MAIN_TABS.map(({ id, label, icon: Icon }) => {
        const isActive = activeId === id;
        const isPressed = pressedId === id;
        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            className="flex-1 flex flex-col items-center justify-center py-2 gap-0.5 relative"
            style={{
              transform: isPressed ? "scale(0.88)" : "scale(1)",
              transition: "transform 0.12s cubic-bezier(0.34,1.56,0.64,1)",
            }}
            data-testid={`nav-${id}`}
          >
            {/* Active pill / glow behind icon */}
            {isActive && (
              <div
                className="absolute rounded-2xl"
                style={{
                  top: 6,
                  width: 44,
                  height: 30,
                  background: "rgba(59,130,246,0.10)",
                  transition: "opacity 0.2s",
                }}
              />
            )}
            <Icon
              className="w-[22px] h-[22px] relative z-10"
              strokeWidth={isActive ? 2.5 : 1.75}
              style={{
                color: isActive ? "#3B82F6" : "#94a3b8",
                transition: "color 0.18s, transform 0.18s",
                transform: isActive ? "scale(1.1)" : "scale(1)",
              }}
            />
            <span
              className="text-[10px] font-semibold relative z-10"
              style={{
                color: isActive ? "#3B82F6" : "#94a3b8",
                transition: "color 0.18s",
              }}
            >
              {label}
            </span>
            {/* Active dot */}
            {isActive && (
              <span
                className="absolute bottom-[3px] w-1 h-1 rounded-full"
                style={{ background: "#3B82F6" }}
              />
            )}
          </button>
        );
      })}
    </nav>
  );
}

// ─── Main App ─────────────────────────────────────────────────────────────────
function MainApp() {
  const { profile, token, isAuthenticated, login, logout, updateProfile } = useAuth();
  // Fix #22: URL-based routing — enables deep links, refresh, back button
  const [location, navigate] = useLocation();
  const VALID_TABS = new Set(["briefing","map","chat","calendar","shopping","budget","tasks","deadlines","meds","geofences","settings","pets","vehicles","subscriptions","contacts","anniversaries","dinner","cucina","banking","ai","school","smartprotection","documenti","elderly","home","giornale","diario","aichat"]);
  const pathTab = location.replace(/^\//, "") || "briefing";
  const activeTab = VALID_TABS.has(pathTab) ? pathTab : "briefing";
  const setActiveTab = useCallback((tab: string) => navigate(`/${tab === "briefing" ? "" : tab}`), [navigate]);
  const [showMore, setShowMore] = useState(false);
  // Track first visit to map so we can keep it mounted thereafter (avoids Leaflet cleanup artifacts)
  const [mapEverVisited, setMapEverVisited] = useState(activeTab === "map");
  useEffect(() => { if (activeTab === "map") setMapEverVisited(true); }, [activeTab]);

  // Auto-navigate to budget tab on OAuth callback (banking is inside budget)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if ((params.get("code") && params.get("state")) || params.get("error")) {
      setActiveTab("budget");
      setShowMore(false);
    }
  }, []);

  const mainTabIds = MAIN_TABS.slice(0, 4).map(t => t.id);
  const isMainTab = mainTabIds.includes(activeTab);
  const activeNavId = isMainTab ? activeTab : "more";

  const handleNavClick = (id: string) => {
    if (id === "more") { setShowMore(true); return; }
    setActiveTab(id);
  };

  const handleMoreSelect = (id: string) => {
    setActiveTab(id);
    setShowMore(false);
  };

  if (!isAuthenticated) {
    return <AuthPage onLogin={login} />;
  }

  if (profile && !profile.onboardingCompleted) {
    return (
      <div className="flex flex-col h-screen max-w-md mx-auto overflow-hidden shadow-2xl relative bg-background">
        <OnboardingPage
          profile={profile}
          token={token || ""}
          onComplete={(updatedProfile) => updateProfile(updatedProfile)}
        />
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ profile, token, isAuthenticated, login, logout }}>
      <div className="flex flex-col h-screen max-w-md mx-auto overflow-hidden shadow-2xl relative bg-background">

        {/* ── Top header (all tabs except briefing) ── */}
        {activeTab !== "briefing" && (
          <header
            className={`flex items-center justify-between px-4 py-3 flex-shrink-0 border-b border-border ${activeTab === "map" ? "bg-background/[0.96]" : "bg-background"}`}
            style={activeTab === "map" ? { backdropFilter: "blur(16px)" } : undefined}
          >
            <div className="flex items-center gap-2.5">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#3B82F6,#6366F1)" }}
              >
                <span className="text-white text-[10px] font-black">FT</span>
              </div>
              <span className="font-bold text-[15px] text-foreground">{PAGE_TITLES[activeTab] || "FamilyTracker"}</span>
            </div>
            <button
              className="w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold active:scale-90 transition-transform"
              style={{ backgroundColor: profile?.colorHex || "#3B82F6" }}
              onClick={() => { haptics.tap(); setActiveTab("settings"); }}
              data-testid="button-header-avatar"
            >
              {profile?.name?.charAt(0)}
            </button>
          </header>
        )}

        {/* ── Page content ── */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0 relative" style={{ zIndex: 0 }}>
          <ErrorBoundary>
            <Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 rounded-full border-2 border-primary border-t-transparent animate-spin" /></div>}>
              {activeTab === "briefing"       && <BriefingPage onNavigate={setActiveTab} />}
              {/* MapPage: mounted on first visit, then kept alive via display:none to avoid Leaflet artifacts */}
              {mapEverVisited && (
                <div style={{ display: activeTab === "map" ? "flex" : "none", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
                  <MapPage isActive={activeTab === "map"} />
                </div>
              )}
              {activeTab === "chat"           && <ChatPage />}
              {activeTab === "calendar"       && <CalendarPage />}
              {activeTab === "shopping"       && <ShoppingPage />}
              {activeTab === "budget"         && <BudgetPage />}
              {activeTab === "tasks"          && <TasksPage />}
              {activeTab === "deadlines"      && <HomeDeadlinesPage />}
              {activeTab === "meds"           && <MedsPage />}
              {activeTab === "geofences"      && <GeofencePage />}
              {activeTab === "settings"       && <SettingsPage />}
              {activeTab === "pets"           && <PetsPage />}
              {activeTab === "vehicles"       && <VehiclesPage />}
              {activeTab === "subscriptions"  && <SubscriptionsPage />}
              {activeTab === "contacts"       && <HomeContactsPage />}
              {activeTab === "anniversaries"  && <AnniversariesPage />}
              {activeTab === "dinner"         && <DinnerPage />}
              {activeTab === "cucina"         && <CucinaPage />}
              {activeTab === "banking"        && <BankingPage />}
              {activeTab === "ai"             && <AiPage />}
              {activeTab === "school"         && <SchoolPage />}
              {activeTab === "smartprotection"&& <SmartProtectionPage />}
              {activeTab === "documenti"      && <DocumentiPage />}
              {activeTab === "elderly"        && <ElderlyPage />}
              {activeTab === "home"           && <DashboardPage onNavigate={setActiveTab} />}
              {activeTab === "giornale"       && <GiornalePage />}
              {activeTab === "diario"         && <DiarioPage />}
              {activeTab === "aichat"         && <AiFamilyChatPage />}
            </Suspense>
          </ErrorBoundary>
        </main>

        {/* ── Bottom Navigation ── */}
        <BottomNav activeId={activeNavId} onClick={handleNavClick} />

        {/* ── More Sheet ── */}
        {showMore && <MoreSheet onSelect={handleMoreSelect} onClose={() => setShowMore(false)} onLogout={logout} />}
      </div>
    </AuthContext.Provider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <MainApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
