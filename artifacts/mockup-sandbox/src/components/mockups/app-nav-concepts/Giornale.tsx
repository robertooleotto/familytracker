import React, { useState } from 'react';
import { 
  MapPin, 
  MessageCircle, 
  CheckCircle2, 
  Calendar, 
  ShoppingCart, 
  Sun,
  Plus,
  Home,
  PenSquare,
  ChevronRight,
  ShieldCheck,
  Star,
  Navigation
} from 'lucide-react';

export function Giornale() {
  const [activeFilter, setActiveFilter] = useState('Tutto');
  const filters = ['Tutto', '📍Posizioni', '💬Messaggi', '📅Eventi', '✅Compiti', '🛒Spesa'];

  return (
    <div className="w-full min-h-screen bg-[#faf7f2] font-sans text-stone-800 pb-24 relative overflow-hidden flex flex-col items-center">
      {/* Mobile container constraint for desktop viewing */}
      <div className="w-full max-w-[390px] min-h-screen bg-[#faf7f2] relative shadow-2xl overflow-y-auto">
        
        {/* Header */}
        <header className="sticky top-0 z-20 bg-[#faf7f2]/90 backdrop-blur-md pt-12 pb-3 px-4 border-b border-stone-200/50">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl font-serif italic font-medium tracking-tight text-stone-900">
              📔 Giornale di Famiglia
            </h1>
            
            {/* Avatar Cluster */}
            <div className="flex -space-x-2">
              <div className="w-8 h-8 rounded-full border-2 border-[#faf7f2] bg-blue-100 flex items-center justify-center overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Roberto&backgroundColor=dbeafe`} alt="Roberto" className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 rounded-full border-2 border-[#faf7f2] bg-rose-100 flex items-center justify-center overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Elena&backgroundColor=ffe4e6`} alt="Elena" className="w-full h-full object-cover" />
              </div>
              <div className="w-8 h-8 rounded-full border-2 border-[#faf7f2] bg-emerald-100 flex items-center justify-center overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Luca&backgroundColor=d1fae5`} alt="Luca" className="w-full h-full object-cover" />
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex overflow-x-auto hide-scrollbar gap-2 pb-1 -mx-4 px-4">
            {filters.map((filter) => (
              <button
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm transition-all ${
                  activeFilter === filter
                    ? 'bg-stone-800 text-stone-50 shadow-md font-medium'
                    : 'bg-white border border-stone-200 text-stone-600 hover:bg-stone-50'
                }`}
              >
                {filter}
              </button>
            ))}
          </div>
        </header>

        {/* Main Feed */}
        <main className="p-4 space-y-6">
          
          {/* Timeline Line (Background) */}
          <div className="absolute left-8 top-[140px] bottom-0 w-px bg-stone-200 -z-10"></div>

          {/* Card 1: Location Event */}
          <div className="relative flex gap-3 group">
            <div className="w-12 pt-1 flex flex-col items-center flex-shrink-0">
              <span className="text-xs font-medium text-stone-400">14:35</span>
            </div>
            
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-100 relative">
              <div className="absolute -left-3 top-4 w-6 h-6 rounded-full border-4 border-[#faf7f2] bg-emerald-100 flex items-center justify-center z-10">
                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Luca`} alt="Luca" className="w-full h-full rounded-full" />
              </div>
              
              <p className="text-sm font-medium text-stone-800 leading-snug">
                Luca è arrivato a scuola
              </p>
              
              <div className="mt-3 relative h-24 rounded-xl overflow-hidden bg-stone-100 border border-stone-200">
                {/* Simulated Map */}
                <div className="absolute inset-0 bg-[url('https://maps.googleapis.com/maps/api/staticmap?center=45.4408,12.3155&zoom=15&size=400x200&style=feature:all|element:labels|visibility:off&style=feature:road|color:0xffffff&style=feature:landscape|color:0xf3f4f6')] bg-cover bg-center opacity-70"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-8 h-8 bg-emerald-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white animate-bounce">
                    <MapPin className="w-4 h-4 text-white" />
                  </div>
                </div>
              </div>
              
              <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 w-fit px-2.5 py-1 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5" />
                Zona sicura
              </div>
            </div>
          </div>

          {/* Card 2: Message Thread */}
          <div className="relative flex gap-3">
            <div className="w-12 pt-1 flex flex-col items-center flex-shrink-0">
              <span className="text-xs font-medium text-stone-400">14:10</span>
            </div>
            
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-100">
              <div className="flex items-center gap-2 mb-3">
                <MessageCircle className="w-4 h-4 text-blue-500" />
                <span className="text-xs font-semibold text-stone-500 uppercase tracking-wider">Chat Famiglia</span>
              </div>
              
              <div className="space-y-3">
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-blue-100 flex-shrink-0 overflow-hidden mt-0.5">
                    <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Roberto`} alt="Roberto" className="w-full h-full" />
                  </div>
                  <div className="bg-stone-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-stone-700">
                    Qualcuno può ritirare Luca alle 16?
                  </div>
                </div>
                
                <div className="flex gap-2">
                  <div className="w-6 h-6 rounded-full bg-rose-100 flex-shrink-0 overflow-hidden mt-0.5">
                    <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Elena`} alt="Elena" className="w-full h-full" />
                  </div>
                  <div className="bg-blue-50 border border-blue-100 rounded-2xl rounded-tl-sm px-3 py-2 text-sm text-stone-800">
                    Ci penso io 👍
                  </div>
                </div>
              </div>
              
              <button className="mt-3 text-xs font-medium text-stone-500 flex items-center gap-1 hover:text-stone-700 transition-colors">
                <div className="flex -space-x-1">
                  <div className="w-4 h-4 rounded-full bg-blue-200 border border-white"></div>
                  <div className="w-4 h-4 rounded-full bg-rose-200 border border-white"></div>
                </div>
                3 risposte
              </button>
            </div>
          </div>

          {/* Card 3: Task Completion */}
          <div className="relative flex gap-3">
            <div className="w-12 pt-1 flex flex-col items-center flex-shrink-0">
              <span className="text-xs font-medium text-stone-400">13:00</span>
            </div>
            
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
                <CheckCircle2 className="w-6 h-6 text-amber-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-stone-800">
                  <span className="font-semibold">Luca</span> ha completato: Compiti di matematica
                </p>
                <div className="mt-2 inline-flex items-center gap-1 bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full text-xs font-bold">
                  <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                  +50 punti
                </div>
              </div>
            </div>
          </div>

          {/* Card 4: Calendar Event */}
          <div className="relative flex gap-3">
            <div className="w-12 pt-1 flex flex-col items-center flex-shrink-0">
              <span className="text-xs font-medium text-stone-400">11:45</span>
            </div>
            
            <div className="flex-1 bg-white p-0 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-100 overflow-hidden flex">
              <div className="w-1.5 bg-blue-500 flex-shrink-0"></div>
              <div className="p-4 flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Calendar className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider">Oggi 17:00</span>
                </div>
                <h3 className="text-[15px] font-medium text-stone-800">
                  Visita pediatra (Elena)
                </h3>
                <p className="text-xs text-stone-500 mt-1 flex items-center gap-1">
                  fra 2h 25min
                </p>
                <div className="mt-3">
                  <button className="flex items-center justify-center gap-1.5 w-full bg-stone-50 hover:bg-stone-100 border border-stone-200 py-2 rounded-xl text-sm font-medium text-stone-700 transition-colors">
                    <Navigation className="w-4 h-4 text-blue-500" />
                    Naviga
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Card 5: Shopping Add */}
          <div className="relative flex gap-3">
            <div className="w-12 pt-1 flex flex-col items-center flex-shrink-0">
              <span className="text-xs font-medium text-stone-400">09:20</span>
            </div>
            
            <div className="flex-1 bg-white p-4 rounded-2xl shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] border border-stone-100">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-orange-50 flex items-center justify-center flex-shrink-0 mt-1">
                  <ShoppingCart className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800 leading-snug">
                    <span className="font-semibold">Roberto</span> ha aggiunto alla lista:
                  </p>
                  <div className="flex flex-wrap gap-2 mt-2">
                    <span className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-medium border border-stone-200">
                      Pasta
                    </span>
                    <span className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-medium border border-stone-200">
                      Pomodori
                    </span>
                    <span className="px-2.5 py-1 bg-stone-100 text-stone-700 rounded-lg text-xs font-medium border border-stone-200">
                      Olio
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Card 6: Weather Briefing (Dimmed) */}
          <div className="relative flex gap-3 opacity-75">
            <div className="w-12 pt-1 flex flex-col items-center flex-shrink-0">
              <span className="text-xs font-medium text-stone-400">07:00</span>
            </div>
            
            <div className="flex-1 bg-gradient-to-br from-blue-50 to-sky-50 p-4 rounded-2xl shadow-sm border border-blue-100/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm flex-shrink-0">
                  <Sun className="w-6 h-6 text-amber-400 fill-amber-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-stone-800">
                    Buongiorno! A Venezia 18°, cielo sereno
                  </p>
                  <p className="text-xs text-stone-500 mt-0.5">
                    Aggiunto stamattina alle 7:00
                  </p>
                </div>
              </div>
            </div>
          </div>
          
          {/* Bottom spacer */}
          <div className="h-10"></div>
        </main>

        {/* Floating Action Button */}
        <button className="absolute bottom-20 right-4 w-14 h-14 bg-gradient-to-tr from-stone-800 to-stone-700 text-white rounded-full flex items-center justify-center shadow-xl shadow-stone-800/20 hover:scale-105 active:scale-95 transition-all z-30">
          <Plus className="w-6 h-6" />
        </button>

        {/* Bottom Navigation */}
        <nav className="absolute bottom-0 left-0 right-0 bg-[#faf7f2]/90 backdrop-blur-xl border-t border-stone-200/50 pb-safe z-30">
          <div className="flex items-center justify-around h-16 px-6 max-w-[390px] mx-auto">
            <button className="flex flex-col items-center gap-1 text-stone-900 w-16">
              <Home className="w-6 h-6" />
            </button>
            <button className="flex flex-col items-center gap-1 text-stone-400 hover:text-stone-900 transition-colors w-16">
              <PenSquare className="w-6 h-6" />
            </button>
            <button className="flex flex-col items-center justify-center w-16">
              <div className="w-7 h-7 rounded-full border border-stone-300 overflow-hidden">
                <img src={`https://api.dicebear.com/7.x/notionists/svg?seed=Roberto&backgroundColor=dbeafe`} alt="Profile" className="w-full h-full object-cover opacity-60 grayscale" />
              </div>
            </button>
          </div>
        </nav>

        {/* Safe Area utility style placeholder if env supports it */}
        <style>{`
          .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
          .hide-scrollbar::-webkit-scrollbar { display: none; }
          .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>

      </div>
    </div>
  );
}
