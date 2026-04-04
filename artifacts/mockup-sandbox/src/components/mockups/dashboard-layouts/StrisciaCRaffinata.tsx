import { 
  Wind, Users, MessageSquare, ShoppingCart, CheckSquare, 
  Calendar, Pill, MapPin, Heart, AlertTriangle, ChevronRight, Sun,
  Copy
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function StrisciaCRaffinata() {
  return (
    <div className="w-[390px] min-h-[800px] bg-background text-foreground flex flex-col overflow-hidden font-sans border-x border-border shadow-sm">
      {/* Header Row */}
      <div className="p-4 pb-4 mt-2">
        <div className="flex items-start justify-between">
          <div className="flex flex-col">
            <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wider">Johnson Family</p>
            <div className="flex items-center gap-2 mt-0.5">
              <h1 className="text-xl font-bold tracking-tight">Buonasera, Sarah 👋</h1>
            </div>
            {/* Secondary Weather Row - Integrated */}
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1.5 font-medium">
              <span>Parzialmente nuvoloso</span>
              <span className="w-1 h-1 rounded-full bg-border" />
              <div className="flex items-center gap-1">
                <Wind className="w-3.5 h-3.5" />
                <span>12 km/h</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-gradient-to-r from-sky-400 to-blue-600 text-white text-xs font-semibold shadow-sm">
              <Sun className="w-3.5 h-3.5 fill-white/20" />
              <span>18°C</span>
            </div>
            <Avatar className="h-10 w-10 border-2 border-blue-500 shadow-sm cursor-pointer transition-transform hover:scale-105 active:scale-95">
              <AvatarFallback className="bg-blue-600 text-white font-semibold">S</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </div>
      
      {/* Family Members Rail */}
      <div className="px-4 pb-4">
        <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4">
          <div className="flex flex-col items-center gap-1.5 min-w-[56px] group cursor-pointer">
            <div className="relative transition-transform group-hover:scale-105 group-active:scale-95">
              <Avatar className="h-[52px] w-[52px] border-[2.5px] border-blue-500 shadow-sm">
                <AvatarFallback className="bg-blue-600 text-white text-lg">S</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full shadow-sm"></span>
            </div>
            <span className="text-[11px] font-bold text-foreground">Sarah</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 min-w-[56px] group cursor-pointer">
            <div className="relative transition-transform group-hover:scale-105 group-active:scale-95 opacity-80">
              <Avatar className="h-[52px] w-[52px] border-2 border-border shadow-sm">
                <AvatarFallback className="bg-emerald-500 text-white text-lg">M</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-muted-foreground/30 border-2 border-background rounded-full shadow-sm"></span>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">Mike</span>
          </div>
          <div className="flex flex-col items-center gap-1.5 min-w-[56px] group cursor-pointer">
            <div className="relative transition-transform group-hover:scale-105 group-active:scale-95 opacity-80">
              <Avatar className="h-[52px] w-[52px] border-2 border-border shadow-sm">
                <AvatarFallback className="bg-amber-500 text-white text-lg">E</AvatarFallback>
              </Avatar>
              <span className="absolute bottom-0 right-0 w-3.5 h-3.5 bg-muted-foreground/30 border-2 border-background rounded-full shadow-sm"></span>
            </div>
            <span className="text-[11px] font-medium text-muted-foreground">Emma</span>
          </div>
        </div>
      </div>

      {/* Alert Strip */}
      <div className="bg-red-50 text-red-700 px-4 py-3 flex items-center justify-between cursor-pointer border-y border-red-100 dark:bg-red-950/30 dark:border-red-900/50 hover:bg-red-100/80 transition-colors">
        <div className="flex items-center gap-2.5">
          <AlertTriangle className="w-4 h-4 text-red-600" />
          <span className="text-sm font-bold tracking-tight">1 scadenza in arrivo</span>
        </div>
        <ChevronRight className="w-4 h-4 text-red-500/70" />
      </div>

      {/* Stats + Quick Access Row (Refined) */}
      <div className="py-5">
        <div className="flex overflow-x-auto px-4 gap-3.5 pb-2 scrollbar-hide snap-x -mx-4">
          <div className="w-1 shrink-0" />
          
          {/* Stats */}
          <div className="flex flex-col items-center justify-center bg-background border border-border/60 shadow-sm rounded-2xl min-w-[76px] h-[76px] gap-1.5 snap-start transition-all hover:border-border hover:shadow-md cursor-pointer group">
            <Users className="w-5 h-5 text-emerald-500 transition-transform group-hover:scale-110" />
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground">Online</span>
              <span className="bg-emerald-100 text-emerald-700 text-[9px] font-bold px-1 rounded-full min-w-[14px] h-[14px] flex items-center justify-center">1</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center bg-background border border-border/60 shadow-sm rounded-2xl min-w-[76px] h-[76px] gap-1.5 snap-start transition-all hover:border-border hover:shadow-md cursor-pointer group">
            <MessageSquare className="w-5 h-5 text-blue-500 transition-transform group-hover:scale-110" />
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground">Messaggi</span>
              <span className="bg-blue-100 text-blue-700 text-[9px] font-bold px-1 rounded-full min-w-[14px] h-[14px] flex items-center justify-center">1</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center bg-background border border-border/60 shadow-sm rounded-2xl min-w-[76px] h-[76px] gap-1.5 snap-start transition-all hover:border-border hover:shadow-md cursor-pointer group">
            <ShoppingCart className="w-5 h-5 text-amber-500 transition-transform group-hover:scale-110" />
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground">Spesa</span>
              <span className="bg-amber-100 text-amber-700 text-[9px] font-bold px-1 rounded-full min-w-[14px] h-[14px] flex items-center justify-center">4</span>
            </div>
          </div>
          <div className="flex flex-col items-center justify-center bg-background border border-border/60 shadow-sm rounded-2xl min-w-[76px] h-[76px] gap-1.5 snap-start transition-all hover:border-border hover:shadow-md cursor-pointer group">
            <CheckSquare className="w-5 h-5 text-orange-500 transition-transform group-hover:scale-110" />
            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[10px] font-semibold text-muted-foreground">Compiti</span>
              <span className="bg-orange-100 text-orange-700 text-[9px] font-bold px-1 rounded-full min-w-[14px] h-[14px] flex items-center justify-center">1</span>
            </div>
          </div>
          
          <div className="w-px h-[60px] bg-border mx-1 shrink-0 self-center" />
          
          {/* Quick Access */}
          <div className="flex flex-col items-center justify-center bg-violet-50/80 dark:bg-violet-950/20 border border-violet-200 dark:border-violet-900/30 shadow-sm rounded-2xl min-w-[76px] h-[76px] gap-1.5 snap-start transition-all hover:shadow-md cursor-pointer group">
            <Calendar className="w-5 h-5 text-violet-600 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-bold text-violet-800 dark:text-violet-400 mt-0.5">Scadenze</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-red-50/80 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 shadow-sm rounded-2xl min-w-[76px] h-[76px] gap-1.5 snap-start transition-all hover:shadow-md cursor-pointer group">
            <Pill className="w-5 h-5 text-red-600 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-bold text-red-800 dark:text-red-400 mt-0.5">Farmaci</span>
          </div>
          <div className="flex flex-col items-center justify-center bg-blue-50/80 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/30 shadow-sm rounded-2xl min-w-[76px] h-[76px] gap-1.5 snap-start transition-all hover:shadow-md cursor-pointer group">
            <MapPin className="w-5 h-5 text-blue-600 transition-transform group-hover:scale-110" />
            <span className="text-[10px] font-bold text-blue-800 dark:text-blue-400 mt-0.5">Zone</span>
          </div>
          
          <div className="w-1 shrink-0" />
        </div>
      </div>

      {/* Main Content Columns */}
      <div className="flex flex-1 p-5 gap-5 pb-8">
        {/* Left Column: Events */}
        <div className="flex-1 max-w-[50%]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Prossimi eventi</h2>
          </div>
          <div className="space-y-4">
            <div className="flex items-start gap-2.5 group cursor-pointer border-l-[2px] border-amber-500 pl-2.5 ml-0.5">
              <div className="min-w-0">
                <p className="text-[13px] font-bold truncate leading-tight group-hover:text-amber-600 transition-colors">Soccer Practice</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-0.5">Oggi 10:36</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 group cursor-pointer border-l-[2px] border-violet-500 pl-2.5 ml-0.5">
              <div className="min-w-0">
                <p className="text-[13px] font-bold truncate leading-tight group-hover:text-violet-600 transition-colors">Parent-Teacher Meeting</p>
                <p className="text-[11px] font-medium text-muted-foreground mt-0.5">sab 14 mar · 8:36</p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Chat */}
        <div className="flex-1 max-w-[50%] border-l border-border pl-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Chat</h2>
          </div>
          <div className="space-y-4.5">
            <div className="flex items-start gap-2.5 group cursor-pointer">
              <Avatar className="w-7 h-7 shrink-0 shadow-sm">
                <AvatarFallback className="bg-amber-500 text-white text-[11px] font-bold">E</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[12px] font-bold">Emma</span>
                  <span className="text-[10px] font-medium text-muted-foreground">1m fa</span>
                </div>
                <p className="text-[12px] text-foreground/90 line-clamp-2 leading-tight">Can we have pizza tonight? 🍕</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 mt-4 group cursor-pointer">
              <Avatar className="w-7 h-7 shrink-0 shadow-sm">
                <AvatarFallback className="bg-emerald-500 text-white text-[11px] font-bold">M</AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[12px] font-bold">Mike</span>
                  <span className="text-[10px] font-medium text-muted-foreground">2h fa</span>
                </div>
                <p className="text-[12px] text-foreground/90 line-clamp-2 leading-tight">Thanks for the reminder!</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Invite Code Card */}
      <div className="px-4 pb-8 pt-4 mt-auto">
        <div className="flex items-center justify-between bg-muted/30 border border-dashed border-border shadow-sm rounded-xl py-3 px-4 w-full cursor-pointer hover:shadow-md hover:border-primary/30 transition-all group">
          <div className="flex items-center gap-2.5">
            <Heart className="w-4 h-4 text-red-500 fill-red-500/20 group-hover:scale-110 transition-transform" />
            <span className="text-sm font-semibold text-muted-foreground">Codice Famiglia</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono font-bold text-primary tracking-wider">DEMO1234</span>
            <Copy className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
}
