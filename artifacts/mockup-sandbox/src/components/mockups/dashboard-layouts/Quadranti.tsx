import React from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  CloudSun,
  Wind,
  Bell,
  MessageSquare,
  ShoppingCart,
  CheckSquare,
  Users,
  Calendar,
  AlertTriangle,
  Pill,
  MapPin,
  Heart
} from "lucide-react";

export default function Quadranti() {
  return (
    <div className="w-[390px] min-h-[800px] bg-background text-foreground flex flex-col overflow-hidden font-sans p-4 space-y-4 pb-8">
      
      {/* 1. TOP BAND */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Buonasera, Sarah 👋</h1>
            <p className="text-sm text-muted-foreground">Johnson Family</p>
          </div>
          <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
            <AvatarFallback className="bg-[#3B82F6] text-white">S</AvatarFallback>
          </Avatar>
        </div>

        <div className="bg-gradient-to-r from-sky-400 to-blue-500 rounded-xl p-3 text-white flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <CloudSun className="h-8 w-8 text-white/90" />
            <div>
              <div className="text-xl font-bold leading-none">18°C</div>
              <div className="text-xs text-white/80 mt-1">Parzialmente nuvoloso</div>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs bg-white/20 px-2 py-1 rounded-full">
            <Wind className="h-3 w-3" />
            <span>12 km/h</span>
          </div>
        </div>
      </div>

      {/* 2. ROW 2 — Two columns */}
      <div className="grid grid-cols-2 gap-3 h-[140px]">
        {/* Left: Famiglia */}
        <Card className="rounded-2xl p-3 border-border bg-card shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-green-500/80"></div>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <Users className="h-4 w-4 text-green-500" />
              Famiglia
            </div>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-green-50 text-green-600 border-green-200">1 online</Badge>
          </div>
          <div className="flex flex-col gap-2 flex-1 justify-center">
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="h-6 w-6 border border-background">
                  <AvatarFallback className="bg-blue-500 text-white text-[10px]">S</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full border border-background"></div>
              </div>
              <span className="text-xs font-medium">Sarah</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="h-6 w-6 border border-background">
                  <AvatarFallback className="bg-green-600 text-white text-[10px]">M</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-gray-300 rounded-full border border-background"></div>
              </div>
              <span className="text-xs text-muted-foreground">Mike</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Avatar className="h-6 w-6 border border-background">
                  <AvatarFallback className="bg-amber-500 text-white text-[10px]">E</AvatarFallback>
                </Avatar>
                <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-gray-300 rounded-full border border-background"></div>
              </div>
              <span className="text-xs text-muted-foreground">Emma</span>
            </div>
          </div>
        </Card>

        {/* Right: Chat */}
        <Card className="rounded-2xl p-3 border-border bg-card shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/80"></div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground">
              <MessageSquare className="h-4 w-4 text-blue-500" />
              Chat
            </div>
            <Badge className="bg-blue-500 hover:bg-blue-600 text-[10px] px-1.5 py-0 h-5">1</Badge>
          </div>
          <div className="flex flex-col gap-2.5 flex-1 mt-1">
            <div className="flex gap-2 items-start">
              <Avatar className="h-5 w-5 mt-0.5 shrink-0">
                <AvatarFallback className="bg-amber-500 text-white text-[8px]">E</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-medium text-foreground">Emma</span>
                  <span className="text-[9px] text-muted-foreground">1m fa</span>
                </div>
                <p className="text-[10px] text-foreground truncate font-medium">Can we have pizza tonight? 🍕</p>
              </div>
            </div>
            <div className="flex gap-2 items-start">
              <Avatar className="h-5 w-5 mt-0.5 shrink-0">
                <AvatarFallback className="bg-green-600 text-white text-[8px]">M</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs text-muted-foreground">Mike</span>
                  <span className="text-[9px] text-muted-foreground">2h fa</span>
                </div>
                <p className="text-[10px] text-muted-foreground truncate">Thanks for the reminder!</p>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* 3. ROW 3 — Two columns */}
      <div className="grid grid-cols-2 gap-3 h-[140px]">
        {/* Left: Agenda */}
        <Card className="rounded-2xl p-3 border-border bg-card shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-500/80"></div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-3">
            <Calendar className="h-4 w-4 text-amber-500" />
            Agenda
          </div>
          <div className="flex flex-col gap-3 flex-1">
            <div className="flex gap-2 items-start">
              <div className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">Soccer Practice</div>
                <div className="text-[10px] text-amber-600 font-medium">Oggi 10:36</div>
              </div>
            </div>
            <div className="flex gap-2 items-start">
              <div className="w-1.5 h-1.5 rounded-full bg-red-500 mt-1.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-muted-foreground truncate">Family Dinner</div>
                <div className="text-[10px] text-muted-foreground">dom 8:36</div>
              </div>
            </div>
          </div>
        </Card>

        {/* Right: Azioni rapide */}
        <Card className="rounded-2xl p-3 border-border bg-card shadow-sm flex flex-col relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1 bg-purple-500/80"></div>
          <div className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground mb-2">
            <div className="h-4 w-4 grid grid-cols-2 gap-0.5">
              <div className="bg-purple-500 rounded-[2px]" />
              <div className="bg-purple-400 rounded-[2px]" />
              <div className="bg-purple-300 rounded-[2px]" />
              <div className="bg-purple-200 rounded-[2px]" />
            </div>
            Azioni rapide
          </div>
          
          <div className="grid grid-cols-2 gap-2 flex-1">
            <div className="bg-purple-50 rounded-xl flex flex-col items-center justify-center p-1 relative">
              <Bell className="h-5 w-5 text-purple-600 mb-1" />
              <span className="text-[9px] font-medium text-purple-700">Scadenze</span>
            </div>
            <div className="bg-orange-50 rounded-xl flex flex-col items-center justify-center p-1 relative">
              <CheckSquare className="h-5 w-5 text-orange-600 mb-1" />
              <span className="text-[9px] font-medium text-orange-700">Compiti</span>
              <Badge className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[8px] bg-orange-500">1</Badge>
            </div>
            <div className="bg-blue-50 rounded-xl flex flex-col items-center justify-center p-1 relative">
              <MapPin className="h-5 w-5 text-blue-600 mb-1" />
              <span className="text-[9px] font-medium text-blue-700">Zone</span>
            </div>
            <div className="bg-red-50 rounded-xl flex flex-col items-center justify-center p-1 relative">
              <Pill className="h-5 w-5 text-red-600 mb-1" />
              <span className="text-[9px] font-medium text-red-700">Farmaci</span>
            </div>
          </div>
        </Card>
      </div>

      {/* 4. ALERT ROW */}
      <div className="bg-red-50 text-red-700 border border-red-100 rounded-xl p-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-red-500" />
          <span className="text-sm font-medium">1 scadenza in arrivo</span>
        </div>
        <Badge variant="outline" className="bg-white text-red-600 border-red-200 text-xs">Vedi</Badge>
      </div>

      {/* 5. BOTTOM ROW — Two columns */}
      <div className="grid grid-cols-2 gap-3 h-[100px]">
        {/* Left: Spesa */}
        <Card className="rounded-2xl p-3 border-border bg-card shadow-sm flex flex-col relative overflow-hidden bg-amber-50/50">
          <div className="absolute top-0 left-0 w-full h-1 bg-amber-400/80"></div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-1.5 text-sm font-semibold text-amber-700">
              <ShoppingCart className="h-4 w-4" />
              Spesa
            </div>
          </div>
          <div className="mt-auto">
            <div className="text-2xl font-bold text-amber-600 leading-none mb-1">4</div>
            <div className="text-xs text-amber-700 font-medium">Articoli da comprare</div>
          </div>
        </Card>

        {/* Right: Farmaci & Zone (Stacked) */}
        <div className="flex flex-col gap-3">
          <Card className="rounded-xl px-3 py-2.5 border-border bg-card shadow-sm flex items-center justify-between flex-1 relative overflow-hidden">
            <div className="absolute left-0 top-0 w-1 h-full bg-red-500/80"></div>
            <div className="flex items-center gap-2">
              <Pill className="h-4 w-4 text-red-500" />
              <span className="text-xs font-medium">Farmaci</span>
            </div>
            <span className="text-xs font-medium text-muted-foreground">Tutto OK</span>
          </Card>
          <Card className="rounded-xl px-3 py-2.5 border-border bg-card shadow-sm flex items-center justify-between flex-1 relative overflow-hidden">
            <div className="absolute left-0 top-0 w-1 h-full bg-blue-500/80"></div>
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-blue-500" />
              <span className="text-xs font-medium">Zone sicure</span>
            </div>
            <span className="text-xs font-medium text-muted-foreground">3 attive</span>
          </Card>
        </div>
      </div>

      {/* 6. Invite code */}
      <div className="mt-auto pt-4 flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Heart className="h-3 w-3 text-red-400" />
        <span>Codice Famiglia: <strong className="font-mono text-foreground">DEMO1234</strong></span>
      </div>

    </div>
  );
}
