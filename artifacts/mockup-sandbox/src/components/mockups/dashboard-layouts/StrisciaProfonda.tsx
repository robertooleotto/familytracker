import { 
  Cloud, Wind, Users, MessageSquare, ShoppingCart, CheckSquare, 
  Calendar, Pill, MapPin, Heart, AlertTriangle, ChevronRight, Sun,
  Copy, ArrowRight, QrCode
} from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

export default function StrisciaProfonda() {
  return (
    <div className="w-[390px] min-h-[800px] bg-background text-foreground flex flex-col overflow-hidden font-sans border-x border-border shadow-sm">
      {/* Header Row */}
      <div className="flex items-start justify-between p-5 pb-4">
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5 mb-1">
            <div className="w-2 h-2 rounded-full bg-blue-600 shadow-sm" />
            <p className="text-[11px] text-muted-foreground font-semibold uppercase tracking-wider">Johnson Family</p>
          </div>
          <h1 className="text-2xl font-bold tracking-tight mb-1">Buonasera, Sarah 👋</h1>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground font-medium">
            <span>Parzialmente nuvoloso</span>
            <span className="w-1 h-1 rounded-full bg-border" />
            <div className="flex items-center gap-1">
              <Wind className="w-3.5 h-3.5" />
              <span>12 km/h</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-3">
          <Avatar className="h-11 w-11 shadow-md cursor-pointer transition-transform hover:scale-105 active:scale-95 ring-2 ring-blue-500 ring-offset-2 ring-offset-background">
            <AvatarFallback className="bg-blue-600 text-white font-semibold">S</AvatarFallback>
          </Avatar>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gradient-to-br from-sky-400 via-blue-500 to-indigo-600 text-white text-xs font-bold shadow-md">
            <Sun className="w-3.5 h-3.5 fill-white/20" />
            <span>18°C</span>
          </div>
        </div>
      </div>
      
      {/* Family Members Rail */}
      <div className="px-5 pb-5">
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-5 px-5">
          <div className="flex flex-col items-center gap-2 min-w-[64px] group cursor-pointer">
            <div className="relative transition-transform group-hover:scale-105 group-active:scale-95">
              <Avatar className="h-[60px] w-[60px] border border-border shadow-sm ring-2 ring-blue-500 ring-offset-2 ring-offset-background">
                <AvatarFallback className="bg-blue-600 text-white text-xl font-medium">S</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-green-500 border-2 border-background rounded-full shadow-sm z-10"></span>
            </div>
            <span className="text-xs font-bold text-foreground">Sarah</span>
          </div>
          <div className="flex flex-col items-center gap-2 min-w-[64px] group cursor-pointer opacity-65 hover:opacity-100 transition-opacity">
            <div className="relative transition-transform group-hover:scale-105 group-active:scale-95">
              <Avatar className="h-[60px] w-[60px] border border-border shadow-sm">
                <AvatarFallback className="bg-emerald-500 text-white text-xl font-medium">M</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-muted-foreground/40 border-2 border-background rounded-full shadow-sm z-10"></span>
            </div>
            <span className="text-xs font-medium text-foreground">Mike</span>
          </div>
          <div className="flex flex-col items-center gap-2 min-w-[64px] group cursor-pointer opacity-65 hover:opacity-100 transition-opacity">
            <div className="relative transition-transform group-hover:scale-105 group-active:scale-95">
              <Avatar className="h-[60px] w-[60px] border border-border shadow-sm">
                <AvatarFallback className="bg-amber-500 text-white text-xl font-medium">E</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 w-4 h-4 bg-muted-foreground/40 border-2 border-background rounded-full shadow-sm z-10"></span>
            </div>
            <span className="text-xs font-medium text-foreground">Emma</span>
          </div>
        </div>
      </div>

      {/* Alert Strip */}
      <div className="bg-red-50 text-red-700 px-5 py-3.5 flex items-center justify-between cursor-pointer border-y border-red-100 dark:bg-red-950/40 dark:border-red-900/50 hover:bg-red-100/80 transition-colors">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-5 h-5 rounded-full bg-red-600 text-white text-[10px] font-bold shadow-sm">1</span>
            <span className="text-sm font-bold tracking-tight">scadenza in arrivo</span>
          </div>
        </div>
        <ChevronRight className="w-4 h-4 text-red-500/80" />
      </div>

      {/* Stats + Quick Access Row */}
      <div className="py-6 border-b border-border shadow-sm">
        <div className="flex overflow-x-auto px-5 gap-3.5 pb-2 scrollbar-hide snap-x -mx-5">
          {/* Spacer for proper padding with negative margins */}
          <div className="w-1 shrink-0" />
          
          {/* Stats */}
          <div className="flex flex-col items-center justify-center bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 shadow-sm rounded-2xl min-w-[76px] h-[84px] gap-1.5 snap-start transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <div className="relative">
              <Users className="w-5 h-5 text-emerald-600 transition-transform group-hover:scale-110" />
              <span className="absolute -top-2.5 -right-3 bg-emerald-600 text-white text-[10px] font-bold px-1.5 rounded-full min-w-[20px] h-[20px] flex items-center justify-center shadow-sm">1</span>
            </div>
            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-400 mt-1">Online</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 shadow-sm rounded-2xl min-w-[76px] h-[84px] gap-1.5 snap-start transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <div className="relative">
              <MessageSquare className="w-5 h-5 text-blue-600 transition-transform group-hover:scale-110" />
              <span className="absolute -top-2.5 -right-3 bg-blue-600 text-white text-[10px] font-bold px-1.5 rounded-full min-w-[20px] h-[20px] flex items-center justify-center shadow-sm">1</span>
            </div>
            <span className="text-[11px] font-bold text-blue-800 dark:text-blue-400 mt-1">Messaggi</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 shadow-sm rounded-2xl min-w-[76px] h-[84px] gap-1.5 snap-start transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <div className="relative">
              <ShoppingCart className="w-5 h-5 text-amber-600 transition-transform group-hover:scale-110" />
              <span className="absolute -top-2.5 -right-3 bg-amber-600 text-white text-[10px] font-bold px-1.5 rounded-full min-w-[20px] h-[20px] flex items-center justify-center shadow-sm">4</span>
            </div>
            <span className="text-[11px] font-bold text-amber-800 dark:text-amber-400 mt-1">Spesa</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/50 shadow-sm rounded-2xl min-w-[76px] h-[84px] gap-1.5 snap-start transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <div className="relative">
              <CheckSquare className="w-5 h-5 text-orange-600 transition-transform group-hover:scale-110" />
              <span className="absolute -top-2.5 -right-3 bg-orange-600 text-white text-[10px] font-bold px-1.5 rounded-full min-w-[20px] h-[20px] flex items-center justify-center shadow-sm">1</span>
            </div>
            <span className="text-[11px] font-bold text-orange-800 dark:text-orange-400 mt-1">Compiti</span>
          </div>
          
          <div className="w-px h-[60px] bg-border mx-1.5 shrink-0 self-center" />
          
          {/* Quick Access */}
          <div className="flex flex-col items-center justify-center bg-background border border-border shadow-sm rounded-2xl min-w-[76px] h-[84px] gap-1.5 snap-start transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <Calendar className="w-5 h-5 text-violet-500 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-semibold text-muted-foreground mt-1">Scadenze</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-background border border-border shadow-sm rounded-2xl min-w-[76px] h-[84px] gap-1.5 snap-start transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <Pill className="w-5 h-5 text-red-500 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-semibold text-muted-foreground mt-1">Farmaci</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-background border border-border shadow-sm rounded-2xl min-w-[76px] h-[84px] gap-1.5 snap-start transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer group">
            <MapPin className="w-5 h-5 text-blue-500 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-semibold text-muted-foreground mt-1">Zone</span>
          </div>
          
          <div className="w-1 shrink-0" />
        </div>
      </div>

      {/* Main Content Columns */}
      <div className="flex flex-1 p-5 gap-6 pb-8">
        {/* Left Column: Events */}
        <div className="flex-1 max-w-[50%]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Prossimi eventi</h2>
          </div>
          <div className="space-y-3">
            <div className="relative flex items-center group cursor-pointer border-l-2 border-amber-500 bg-muted/30 dark:bg-amber-950/10 rounded-r-lg p-2.5 transition-colors hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold truncate leading-tight group-hover:text-amber-600 transition-colors">Soccer Practice</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-1">Oggi · 10:36</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute right-2" />
            </div>
            <div className="relative flex items-center group cursor-pointer border-l-2 border-violet-500 bg-muted/30 dark:bg-violet-950/10 rounded-r-lg p-2.5 transition-colors hover:bg-muted/50">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-bold truncate leading-tight group-hover:text-violet-600 transition-colors">Parent-Teacher Meeting</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-1">Sab 14 mar · 8:36</p>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity absolute right-2" />
            </div>
          </div>
        </div>

        {/* Right Column: Chat */}
        <div className="flex-1 max-w-[50%] border-l border-border pl-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Chat</h2>
          </div>
          <div className="space-y-5">
            <div className="flex items-start gap-2.5 group cursor-pointer relative">
              <div className="absolute -left-[14px] top-1.5 w-1.5 h-1.5 rounded-full bg-amber-500" />
              <Avatar className="w-8 h-8 shrink-0 shadow-sm ring-1 ring-amber-500 ring-offset-1 ring-offset-background">
                <AvatarFallback className="bg-amber-500 text-white text-[11px] font-bold">E</AvatarFallback>
              </Avatar>
              <div className="min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[12px] font-bold text-foreground">Emma</span>
                  <span className="text-[10px] font-semibold text-amber-600">1m fa</span>
                </div>
                <p className="text-[12px] text-foreground font-medium line-clamp-2 leading-tight">Can we have pizza tonight? 🍕</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 group cursor-pointer pl-[3px]">
              <Avatar className="w-8 h-8 shrink-0 shadow-sm">
                <AvatarFallback className="bg-emerald-500 text-white text-[11px] font-bold">M</AvatarFallback>
              </Avatar>
              <div className="min-w-0 pt-0.5">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="text-[12px] font-semibold text-muted-foreground">Mike</span>
                  <span className="text-[10px] font-medium text-muted-foreground">2h fa</span>
                </div>
                <p className="text-[12px] text-muted-foreground line-clamp-2 leading-tight">Thanks for the reminder!</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Invite */}
      <div className="px-5 pb-8 pt-2 mt-auto">
        <div className="flex items-center justify-between bg-muted/30 border-2 border-dashed border-border rounded-xl p-3 cursor-pointer hover:bg-muted/50 transition-colors group">
          <div className="flex items-center gap-3">
            <div className="bg-background p-1.5 rounded-md shadow-sm border border-border">
              <QrCode className="w-4 h-4 text-foreground/80" />
            </div>
            <div className="flex flex-col">
              <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Codice Famiglia</span>
              <span className="text-sm font-mono font-bold text-foreground tracking-widest mt-0.5">DEMO1234</span>
            </div>
          </div>
          <div className="w-8 h-8 flex items-center justify-center rounded-lg bg-background border border-border shadow-sm group-hover:border-primary/30 transition-colors">
            <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-primary transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
}
