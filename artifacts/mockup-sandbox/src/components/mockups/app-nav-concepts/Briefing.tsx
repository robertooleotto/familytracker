import React, { useState } from "react";
import { 
  Check, 
  MapPin, 
  Mic, 
  MessageCircle, 
  Home, 
  Settings, 
  Calendar, 
  ShoppingCart, 
  Plus,
  BellRing,
  Pill,
  ChefHat,
  ChevronRight,
  Sun,
  Sunrise,
  Sunset,
  Moon,
  CheckCircle2
} from "lucide-react";

export function Briefing() {
  const [activeTime, setActiveTime] = useState("afternoon");

  return (
    <div className="min-h-screen w-full overflow-hidden flex flex-col text-white" style={{ backgroundColor: "#1a1208" }}>
      {/* Background subtle noise/texture */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none mix-blend-overlay"
        style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")` }}
      ></div>

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto pb-48 pt-12 px-6 no-scrollbar relative z-10">
        
        {/* Header section */}
        <header className="mb-8">
          <div className="flex items-center space-x-2 text-sm text-amber-500/70 mb-2 font-medium tracking-wide">
            <span>⏱ 14:03</span>
            <span>·</span>
            <span>Mercoledì 23 mar</span>
            <span>·</span>
            <span>Venezia ⛅ 19°</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight mb-3 text-amber-50">
            Buon pomeriggio, Roberto <span className="inline-block animate-wave origin-bottom-right">👋</span>
          </h1>
          <p className="text-amber-100/60 leading-relaxed text-lg font-light">
            Luca è a scuola fino alle 16:00. Elena rientra alle 18:30. Hai 2 cose da fare oggi.
          </p>
        </header>

        {/* Time of day pill timeline */}
        <div className="flex items-center space-x-2 mb-8 overflow-x-auto no-scrollbar pb-2">
          <button className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/5 text-white/50 text-sm whitespace-nowrap">
            <Sunrise size={14} />
            <span>Mattina</span>
            <Check size={12} className="ml-1 opacity-50" />
          </button>
          
          <button className="flex items-center space-x-1.5 px-4 py-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 text-sm whitespace-nowrap shadow-[0_0_15px_rgba(245,158,11,0.1)] relative">
            <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-pulse"></div>
            <Sun size={14} />
            <span className="font-medium relative z-10">Pomeriggio</span>
          </button>
          
          <button className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/5 text-white/50 text-sm whitespace-nowrap">
            <Sunset size={14} />
            <span>Sera</span>
          </button>
          
          <button className="flex items-center space-x-1.5 px-3 py-1.5 rounded-full bg-white/5 text-white/50 text-sm whitespace-nowrap">
            <Moon size={14} />
            <span>Notte</span>
          </button>
        </div>

        {/* Smart Cards Stack */}
        <div className="space-y-4">
          
          {/* Card A - URGENT */}
          <div className="rounded-3xl p-6 bg-gradient-to-br from-amber-500/10 to-orange-600/5 border border-orange-500/20 relative overflow-hidden backdrop-blur-xl">
            <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
            
            <div className="flex items-start justify-between mb-4 relative z-10">
              <div className="flex items-center space-x-2 text-orange-400 font-medium">
                <div className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-orange-500"></span>
                </div>
                <span className="text-sm uppercase tracking-wider">Azione richiesta</span>
              </div>
            </div>
            
            <h3 className="text-2xl font-medium text-white mb-1">Chi ritira Luca?</h3>
            <p className="text-orange-200/70 mb-6">Luca finisce la scuola fra 1h 45min</p>
            
            <div className="flex space-x-3 mb-4">
              <button className="flex-1 py-3 px-4 rounded-xl bg-orange-500 text-white font-medium shadow-lg shadow-orange-500/20 hover:bg-orange-400 transition-colors">
                Vado io
              </button>
              <button className="flex-1 py-3 px-4 rounded-xl bg-white/10 text-white font-medium hover:bg-white/15 transition-colors border border-white/5">
                Chiedi a Elena
              </button>
            </div>
            
            <button className="flex items-center justify-center space-x-2 text-sm text-orange-300/60 w-full hover:text-orange-300 transition-colors">
              <BellRing size={14} />
              <span>Imposta promemoria</span>
            </button>
          </div>

          {/* Card B - ACTION */}
          <div className="rounded-3xl p-5 bg-gradient-to-br from-emerald-500/10 to-teal-600/5 border border-emerald-500/10 backdrop-blur-xl flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="h-12 w-12 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Pill size={24} />
              </div>
              <div>
                <h4 className="font-medium text-emerald-50 mb-1">3 farmaci da dare</h4>
                <p className="text-sm text-emerald-200/60">Paracetamolo (Luca) · Ore 16:00</p>
              </div>
            </div>
            <button className="h-8 w-8 rounded-full border-2 border-emerald-500/30 flex items-center justify-center text-emerald-500/0 hover:text-emerald-500 hover:border-emerald-500 transition-all">
              <Check size={16} />
            </button>
          </div>

          {/* Card C - PLANNING */}
          <div className="rounded-3xl p-5 bg-gradient-to-br from-amber-200/5 to-amber-700/5 border border-amber-500/10 backdrop-blur-xl">
            <div className="flex items-center space-x-2 text-amber-500/70 text-sm font-medium mb-3">
              <ChefHat size={16} />
              <span>Programmazione serale</span>
            </div>
            
            <h4 className="font-medium text-lg text-amber-50 mb-2">Stasera chi cucina?</h4>
            
            <div className="bg-black/20 rounded-2xl p-4 mb-4">
              <div className="flex justify-between items-start mb-2">
                <span className="text-amber-100/90 text-sm">🍝 Proposta AI</span>
                <span className="text-xs text-amber-100/40 bg-white/5 px-2 py-1 rounded-md">5 ing. in frigo</span>
              </div>
              <p className="font-medium text-white">Pasta al pomodoro</p>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="flex -space-x-2">
                  <div className="h-8 w-8 rounded-full bg-pink-500 border-2 border-[#1a1208] flex items-center justify-center text-xs font-bold text-white">E</div>
                </div>
                <span className="text-sm text-amber-100/70">Elena cucina</span>
              </div>
              <button className="px-4 py-2 rounded-lg bg-white/10 text-sm font-medium text-white hover:bg-white/20 transition-colors">
                Conferma
              </button>
            </div>
          </div>

          {/* Card D - INFO */}
          <div className="rounded-3xl p-5 bg-gradient-to-br from-blue-500/10 to-indigo-600/5 border border-blue-500/10 backdrop-blur-xl flex justify-between items-center">
            <div>
              <div className="flex items-center space-x-2 text-blue-400/80 text-sm font-medium mb-1">
                <MapPin size={16} />
                <span>Mappa famiglia</span>
              </div>
              <p className="text-sm text-blue-100/60 mt-2">
                Roberto <span className="text-white/40">al lavoro</span> · Elena <span className="text-white/40">in giro</span> · Luca <span className="text-white/40">a scuola</span>
              </p>
            </div>
            <button className="h-10 w-10 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400">
              <ChevronRight size={20} />
            </button>
          </div>

        </div>
      </div>

      {/* Bottom Fixed Area */}
      <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-[#1a1208] via-[#1a1208] to-transparent pt-12 pb-6 px-6 z-20">
        
        {/* Quick actions */}
        <div className="flex justify-center space-x-3 mb-4">
          <button className="px-4 py-2 rounded-full bg-white/5 border border-white/5 text-amber-100/70 text-sm font-medium flex items-center space-x-2 backdrop-blur-md hover:bg-white/10 transition-colors">
            <Plus size={14} />
            <span>Impegno</span>
          </button>
          <button className="px-4 py-2 rounded-full bg-white/5 border border-white/5 text-amber-100/70 text-sm font-medium flex items-center space-x-2 backdrop-blur-md hover:bg-white/10 transition-colors">
            <ShoppingCart size={14} />
            <span>Lista</span>
          </button>
          <button className="px-4 py-2 rounded-full bg-white/5 border border-white/5 text-amber-100/70 text-sm font-medium flex items-center space-x-2 backdrop-blur-md hover:bg-white/10 transition-colors">
            <MessageCircle size={14} />
            <span>Chat</span>
          </button>
        </div>

        {/* Input Bar */}
        <div className="relative mb-6">
          <input 
            type="text" 
            placeholder="Chiedi o aggiungi qualcosa..." 
            className="w-full bg-white/10 border border-white/10 rounded-full py-4 pl-6 pr-14 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-amber-500/50 backdrop-blur-xl"
          />
          <button className="absolute right-2 top-2 bottom-2 aspect-square rounded-full bg-amber-500 text-white flex items-center justify-center hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20">
            <Mic size={18} />
          </button>
        </div>

        {/* Minimal Nav */}
        <div className="flex justify-around items-center pt-2 px-6">
          <button className="p-3 text-amber-500 relative">
            <Home size={24} strokeWidth={2.5} />
            <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-amber-500 rounded-full"></span>
          </button>
          <button className="p-3 text-white/30 hover:text-white/60 transition-colors">
            <MessageCircle size={24} strokeWidth={2} />
          </button>
          <button className="p-3 text-white/30 hover:text-white/60 transition-colors">
            <Settings size={24} strokeWidth={2} />
          </button>
        </div>
      </div>
      
      <style dangerouslySetInnerHTML={{__html: `
        .no-scrollbar::-webkit-scrollbar {
          display: none;
        }
        .no-scrollbar {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        @keyframes wave {
          0% { transform: rotate(0.0deg) }
          10% { transform: rotate(14.0deg) }
          20% { transform: rotate(-8.0deg) }
          30% { transform: rotate(14.0deg) }
          40% { transform: rotate(-4.0deg) }
          50% { transform: rotate(10.0deg) }
          60% { transform: rotate(0.0deg) }
          100% { transform: rotate(0.0deg) }
        }
        .animate-wave {
          animation: wave 2.5s infinite;
        }
      `}} />
    </div>
  );
}
