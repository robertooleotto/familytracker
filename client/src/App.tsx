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
interface ErrorBoundaryProps {
  children: ReactNode;
  name?: string;
}
interface ErrorBoundaryState {
  hasError: boolean;
  errorInfo?: string;
}
class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorInfo: error.message };
  }
  componentDidCatch(error: Error, errorInfo: any) {
    console.error("[ErrorBoundary]", this.props.name || "unknown section", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
          <p className="text-muted-foreground">Si è verificato un errore{this.props.name ? ` in "${this.props.name}"` : " in questa sezione"}.</p>
          {process.env.NODE_ENV === "development" && this.state.errorInfo && (
            <p className="text-xs text-muted-foreground/60 font-mono">{this.state.errorInfo}</p>
          )}
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
  MapPin, MessageCircle, Calendar, ShoppingCart,
  Shield, Pill, Home, Star, Settings, X, Wallet, Grid3x3,
  PawPrint, Car, Phone, UtensilsCrossed, Sparkles, GraduationCap, ShieldCheck, ChefHat, FolderOpen, Heart, BookOpen, Map, Bot, LogOut,
} from "lucide-react";

// 5 tab: Home · Agenda · Kinly(centro) · Mappa · Chat
const MAIN_TABS = [
  { id: "briefing", label: "Home",   icon: Home },
  { id: "calendar", label: "Agenda", icon: Calendar },
  { id: "aichat",   label: "Kinly",  icon: Sparkles, center: true },
  { id: "map",      label: "Mappa",  icon: MapPin },
  { id: "chat",     label: "Chat",   icon: MessageCircle },
];

const MORE_SECTIONS = [
  {
    title: "Giornale",
    items: [
      { id: "giornale",  label: "Giornale",       icon: BookOpen,     color: "var(--k-coral)",  soft: "var(--k-coral-soft)" },
      { id: "diario",    label: "Diario Percorsi", icon: Map,          color: "var(--k-steel)",  soft: "var(--k-steel-soft)" },
    ],
  },
  {
    title: "Pianificazione",
    items: [
      { id: "calendar",  label: "Agenda",         icon: Calendar,     color: "var(--k-navy)",   soft: "var(--k-paper-2)" },
      { id: "tasks",     label: "Compiti",         icon: Star,         color: "var(--k-ochre)",  soft: "var(--k-ochre-soft)" },
      { id: "deadlines", label: "Scadenze casa",   icon: Home,         color: "var(--k-ochre)",  soft: "var(--k-ochre-soft)" },
      { id: "contacts",  label: "Contatti casa",   icon: Phone,        color: "var(--k-sage)",   soft: "var(--k-sage-soft)" },
    ],
  },
  {
    title: "Spesa & Finanze",
    items: [
      { id: "shopping",  label: "Lista spesa",    icon: ShoppingCart, color: "var(--k-sage)",   soft: "var(--k-sage-soft)" },
      { id: "budget",    label: "Budget + Conto", icon: Wallet,       color: "var(--k-steel)",  soft: "var(--k-steel-soft)" },
      { id: "documenti", label: "Documenti",      icon: FolderOpen,   color: "var(--k-steel)",  soft: "var(--k-steel-soft)" },
    ],
  },
  {
    title: "Casa & Vita quotidiana",
    items: [
      { id: "dinner",    label: "Chi cucina",     icon: UtensilsCrossed, color: "var(--k-coral)",  soft: "var(--k-coral-soft)" },
      { id: "cucina",    label: "Cucina AI",      icon: ChefHat,         color: "var(--k-coral)",  soft: "var(--k-coral-soft)" },
      { id: "pets",      label: "Animali",        icon: PawPrint,        color: "var(--k-ochre)",  soft: "var(--k-ochre-soft)" },
      { id: "vehicles",  label: "Veicoli",        icon: Car,             color: "var(--k-steel)",  soft: "var(--k-steel-soft)" },
      { id: "meds",      label: "Farmaci",        icon: Pill,            color: "var(--k-plum)",   soft: "var(--k-plum-soft)" },
      { id: "geofences", label: "Zone sicure",    icon: Shield,          color: "var(--k-leaf)",   soft: "var(--k-leaf-soft)" },
    ],
  },
  {
    title: "Sicurezza & Scuola",
    items: [
      { id: "elderly",         label: "Sicurezza anziani", icon: Heart,         color: "var(--k-plum)",  soft: "var(--k-plum-soft)" },
      { id: "smartprotection", label: "Protezione smart",  icon: ShieldCheck,   color: "var(--k-leaf)",  soft: "var(--k-leaf-soft)" },
      { id: "school",          label: "Registri scuola",   icon: GraduationCap, color: "var(--k-steel)", soft: "var(--k-steel-soft)" },
      { id: "ai",              label: "AI Predittiva",     icon: Sparkles,      color: "var(--k-coral)", soft: "var(--k-coral-soft)" },
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
        className="absolute bottom-0 left-0 right-0 overflow-hidden"
        style={{
          background: "var(--k-paper)",
          borderRadius: "var(--k-r-xl) var(--k-r-xl) 0 0",
          transform: visible ? "translateY(0)" : "translateY(100%)",
          transition: "transform 0.32s cubic-bezier(0.32, 0.72, 0, 1)",
          maxHeight: "84vh",
          boxShadow: "0 -4px 40px rgba(21,32,46,0.14)",
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1">
          <div style={{ width: 40, height: 4, background: "var(--k-line-2)", borderRadius: 999 }} />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3">
          <h3 style={{ fontSize: 16, fontWeight: 700, color: "var(--k-ink)", letterSpacing: "-0.01em" }}>Funzionalità</h3>
          <button
            onClick={handleClose}
            style={{ width: 44, height: 44, borderRadius: "50%", background: "var(--k-paper-2)", display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid var(--k-line)" }}
            data-testid="button-close-more"
            aria-label="Chiudi menu"
          >
            <X className="w-4 h-4" style={{ color: "var(--k-ink-2)" }} />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto pb-4 px-4" style={{ maxHeight: "calc(84vh - 80px)" }}>
          {MORE_SECTIONS.map(section => (
            <div key={section.title} className="mb-5">
              <p style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--k-ink-3)", marginBottom: 8, paddingLeft: 4 }}>{section.title}</p>
              <div className="grid grid-cols-2 gap-2">
                {section.items.map(({ id, label, icon: Icon, color, soft }) => (
                  <button
                    key={id}
                    onClick={() => handleSelect(id)}
                    className="flex items-center gap-3 text-left active:scale-95 transition-transform"
                    style={{ background: soft, border: `1px solid rgba(21,32,46,0.06)`, borderRadius: "var(--k-r-md)", padding: "12px 14px" }}
                    data-testid={`more-nav-${id}`}
                  >
                    <div
                      className="flex items-center justify-center flex-shrink-0"
                      style={{ width: 36, height: 36, borderRadius: "var(--k-r-sm)", background: "rgba(255,255,255,0.7)" }}
                    >
                      <Icon className="w-[17px] h-[17px]" style={{ color }} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "var(--k-ink)", lineHeight: 1.2 }}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}

          {/* Impostazioni e Logout */}
          <div style={{ borderTop: "1px solid var(--k-line)", paddingTop: 12, paddingBottom: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            <button
              onClick={() => handleSelect("settings")}
              className="w-full flex items-center gap-3 text-left active:scale-95 transition-transform"
              style={{ background: "var(--k-paper-2)", border: "1px solid var(--k-line)", borderRadius: "var(--k-r-md)", padding: "12px 14px" }}
              data-testid="more-nav-settings"
            >
              <div style={{ width: 36, height: 36, borderRadius: "var(--k-r-sm)", background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Settings className="w-[17px] h-[17px]" style={{ color: "var(--k-ink-2)" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--k-ink-2)" }}>Impostazioni</span>
            </button>
            <button
              onClick={() => { haptics.tap(); setVisible(false); setTimeout(() => { onLogout(); onClose(); }, 220); }}
              className="w-full flex items-center gap-3 text-left active:scale-95 transition-transform"
              style={{ background: "#FFF0EE", border: "1px solid #FDDAD5", borderRadius: "var(--k-r-md)", padding: "12px 14px" }}
              data-testid="more-nav-logout"
            >
              <div style={{ width: 36, height: 36, borderRadius: "var(--k-r-sm)", background: "rgba(255,255,255,0.7)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <LogOut className="w-[17px] h-[17px]" style={{ color: "var(--k-coral-ink)" }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--k-coral-ink)" }}>Esci dall'account</span>
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
      className="flex-shrink-0 flex items-end justify-around"
      style={{
        background: "rgba(255,255,255,0.92)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--k-line)",
        padding: "10px 20px",
        paddingBottom: `max(22px, env(safe-area-inset-bottom, 22px))`,
      }}
    >
      {MAIN_TABS.map(({ id, label, icon: Icon, center }: any) => {
        const isActive = activeId === id;
        const isPressed = pressedId === id;

        if (center) {
          // Centro Kinly FAB
          return (
            <button
              key={id}
              onClick={() => handleClick(id)}
              className="flex flex-col items-center gap-1"
              style={{
                marginTop: -22,
                transform: isPressed ? "scale(0.9)" : "scale(1)",
                transition: "transform 0.14s cubic-bezier(0.34,1.56,0.64,1)",
                border: "none",
                background: "none",
                cursor: "pointer",
              }}
              data-testid={`nav-${id}`}
            >
              <div style={{
                width: 56, height: 56, borderRadius: "50%",
                background: "var(--k-coral)",
                boxShadow: "var(--k-sh-coral)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <Icon className="w-[22px] h-[22px]" style={{ color: "#fff" }} strokeWidth={1.8} />
              </div>
              <span style={{ fontSize: 10, fontWeight: 600, color: isActive ? "var(--k-coral)" : "var(--k-ink-3)" }}>
                {label}
              </span>
            </button>
          );
        }

        const color = isActive ? "var(--k-coral)" : "var(--k-ink-3)";
        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            className="flex flex-col items-center gap-1"
            style={{
              transform: isPressed ? "scale(0.88)" : "scale(1)",
              transition: "transform 0.12s cubic-bezier(0.34,1.56,0.64,1)",
              border: "none",
              background: "none",
              cursor: "pointer",
              minWidth: 44,
            }}
            data-testid={`nav-${id}`}
          >
            <Icon
              className="w-[22px] h-[22px]"
              strokeWidth={isActive ? 2.2 : 1.6}
              style={{ color, transition: "color 0.15s" }}
            />
            <span style={{ fontSize: 10, fontWeight: isActive ? 600 : 500, color, transition: "color 0.15s" }}>
              {label}
            </span>
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

  const mainTabIds = MAIN_TABS.map(t => t.id);
  const isMainTab = mainTabIds.includes(activeTab);
  // For secondary pages opened from MoreSheet, keep "briefing" highlighted
  const activeNavId = isMainTab ? activeTab : "briefing";

  const handleNavClick = (id: string) => {
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
      <div className="flex flex-col h-screen max-w-md mx-auto overflow-hidden shadow-2xl relative" style={{ background: "var(--k-paper)" }}>
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
      <div className="flex flex-col h-screen max-w-md mx-auto overflow-hidden shadow-2xl relative" style={{ background: "var(--k-paper)" }}>

        {/* ── Top header (all tabs except briefing) ── */}
        {activeTab !== "briefing" && (
          <header
            className="flex items-center justify-between flex-shrink-0"
            style={{
              background: "var(--k-paper)",
              borderBottom: "1px solid var(--k-line)",
              padding: "12px 16px",
              paddingTop: `max(12px, calc(env(safe-area-inset-top, 0px) + 12px))`,
            }}
          >
            {/* Left: Grid3x3 → MoreSheet */}
            <button
              onClick={() => { haptics.tap(); setShowMore(true); }}
              style={{
                width: 40, height: 40, borderRadius: "var(--k-r-sm)",
                background: "var(--k-paper-2)", border: "1px solid var(--k-line)",
                display: "flex", alignItems: "center", justifyContent: "center",
                cursor: "pointer",
              }}
              data-testid="button-header-menu"
              aria-label="Menu"
            >
              <Grid3x3 className="w-[18px] h-[18px]" style={{ color: "var(--k-ink-2)" }} />
            </button>

            {/* Center: page title */}
            <span style={{ fontSize: 15, fontWeight: 700, color: "var(--k-ink)", letterSpacing: "-0.015em" }}>
              {PAGE_TITLES[activeTab] || "Kinly"}
            </span>

            {/* Right: avatar → settings */}
            <button
              className="flex items-center justify-center active:scale-90 transition-transform"
              style={{
                width: 40, height: 40, borderRadius: "50%",
                background: profile?.colorHex || "var(--k-coral)",
                color: "#fff", fontSize: 14, fontWeight: 700,
                border: "2px solid var(--k-paper)",
                boxShadow: "var(--k-sh-2)",
                cursor: "pointer",
              }}
              onClick={() => { haptics.tap(); setActiveTab("settings"); }}
              data-testid="button-header-avatar"
            >
              {profile?.name?.charAt(0)}
            </button>
          </header>
        )}

        {/* ── Page content ── */}
        <main className="flex-1 overflow-hidden flex flex-col min-h-0 relative" style={{ zIndex: 0 }}>
          <ErrorBoundary name={activeTab}>
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
