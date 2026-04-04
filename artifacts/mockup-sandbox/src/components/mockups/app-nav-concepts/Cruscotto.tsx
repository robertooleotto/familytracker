import React from 'react';
import { 
  CloudSun, 
  Wind, 
  Droplets,
  MapPin,
  Calendar,
  ShoppingCart,
  Star,
  MessageCircle,
  Pill,
  CreditCard,
  Home,
  MoreHorizontal,
  ChevronRight
} from 'lucide-react';

export function Cruscotto() {
  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-900 p-4 font-sans">
      {/* Mobile Device Container */}
      <div className="w-[390px] h-[844px] bg-[#f0f2f5] rounded-[40px] shadow-2xl overflow-hidden relative border-[8px] border-neutral-800 flex flex-col">
        
        {/* Status Bar Area */}
        <div className="pt-4 px-6 pb-2 flex justify-between items-center text-xs font-medium text-neutral-800 bg-[#f0f2f5]/80 backdrop-blur-md z-10 sticky top-0">
          <div className="font-bold tracking-tight">FamilyTracker</div>
          <div className="text-neutral-500">mer 23 mar · 14:03</div>
        </div>

        {/* Family Avatars Strip */}
        <div className="px-5 py-2 flex gap-3 items-center bg-[#f0f2f5]/80 backdrop-blur-md z-10 sticky top-[34px]">
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">R</div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#f0f2f5]"></div>
          </div>
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">E</div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#f0f2f5]"></div>
          </div>
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-orange-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">L</div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-gray-400 rounded-full border-2 border-[#f0f2f5]"></div>
          </div>
          <div className="relative">
            <div className="w-8 h-8 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold shadow-sm">N</div>
            <div className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-[#f0f2f5]"></div>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-hide pb-24">
          <div className="p-4 grid grid-cols-2 gap-[12px]">
            
            {/* Widget 1 - Weather */}
            <div className="col-span-2 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 p-4 text-white shadow-sm flex flex-col justify-between min-h-[140px]">
              <div className="flex justify-between items-start">
                <div>
                  <div className="text-4xl font-light mb-1">19°</div>
                  <div className="text-sm font-medium opacity-90">Venezia · Soleggiato</div>
                </div>
                <CloudSun size={32} className="opacity-90" />
              </div>
              <div className="mt-4 flex flex-col gap-2">
                <div className="flex gap-4 text-xs opacity-80">
                  <span className="flex items-center gap-1"><Wind size={12}/> 12 km/h</span>
                  <span className="flex items-center gap-1"><Droplets size={12}/> 65%</span>
                </div>
                <div className="text-xs bg-black/10 rounded-lg p-2 backdrop-blur-sm mt-1">
                  Domani: 🌧 15°
                </div>
              </div>
            </div>

            {/* Widget 2 - Family Map */}
            <div className="col-span-2 rounded-2xl bg-white shadow-sm overflow-hidden flex flex-col min-h-[160px] relative">
              {/* Fake Map Background */}
              <div className="absolute inset-0 bg-neutral-100 opacity-50 z-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-neutral-200 to-neutral-100">
                <svg className="w-full h-full text-neutral-200" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 40 Q 50 10 100 50 T 200 60 T 300 30 T 400 80" stroke="currentColor" strokeWidth="4" fill="none"/>
                  <path d="M50 0 L 70 160" stroke="currentColor" strokeWidth="6" fill="none"/>
                  <path d="M0 100 Q 150 130 250 90 T 400 120" stroke="currentColor" strokeWidth="8" fill="none"/>
                </svg>
              </div>
              <div className="relative z-10 p-4 flex flex-col h-full justify-between flex-1">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-sm text-neutral-800">Posizioni</div>
                  <span className="text-xs text-blue-500 font-medium flex items-center">Apri mappa <ChevronRight size={14}/></span>
                </div>
                
                {/* Dots on map */}
                <div className="relative h-20 w-full mb-2">
                  <div className="absolute top-2 left-10 flex flex-col items-center">
                    <div className="w-4 h-4 bg-blue-500 rounded-full border-2 border-white shadow-sm"></div>
                    <span className="text-[10px] font-bold mt-1 bg-white/80 px-1 rounded">Rob</span>
                  </div>
                  <div className="absolute top-8 left-32 flex flex-col items-center">
                    <div className="w-4 h-4 bg-green-500 rounded-full border-2 border-white shadow-sm"></div>
                    <span className="text-[10px] font-bold mt-1 bg-white/80 px-1 rounded">Ele</span>
                  </div>
                  <div className="absolute top-4 right-20 flex flex-col items-center">
                    <div className="w-4 h-4 bg-orange-500 rounded-full border-2 border-white shadow-sm"></div>
                    <span className="text-[10px] font-bold mt-1 bg-white/80 px-1 rounded">Luc</span>
                  </div>
                  <div className="absolute bottom-2 right-10 flex flex-col items-center">
                    <div className="w-4 h-4 bg-purple-500 rounded-full border-2 border-white shadow-sm"></div>
                    <span className="text-[10px] font-bold mt-1 bg-white/80 px-1 rounded">Non</span>
                  </div>
                </div>

                <div className="text-[11px] text-neutral-600 leading-tight">
                  <span className="font-medium text-neutral-800">Roberto</span> al lavoro · <span className="font-medium text-neutral-800">Elena</span> in giro · <span className="font-medium text-neutral-800">Luca</span> a scuola · <span className="font-medium text-neutral-800">Nonna</span> a casa
                </div>
              </div>
            </div>

            {/* Widget 3 - Next Event */}
            <div className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-blue-500">
              <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-500 flex items-center justify-center mb-3">
                <Calendar size={18} />
              </div>
              <div className="text-xs text-blue-600 font-semibold mb-1">Oggi 17:00</div>
              <div className="text-sm font-bold text-neutral-800 leading-tight">Visita pediatra</div>
            </div>

            {/* Widget 4 - Shopping */}
            <div className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-green-500">
              <div className="w-8 h-8 rounded-full bg-green-50 text-green-500 flex items-center justify-center mb-3">
                <ShoppingCart size={18} />
              </div>
              <div className="text-sm font-bold text-neutral-800 mb-1">Lista spesa</div>
              <div className="text-xs text-neutral-500 mt-auto">7 prodotti</div>
              <div className="text-xs text-red-500 font-medium mt-0.5">3 urgenti</div>
            </div>

            {/* Widget 5 - Tasks */}
            <div className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-orange-500">
              <div className="w-8 h-8 rounded-full bg-orange-50 text-orange-500 flex items-center justify-center mb-3">
                <Star size={18} />
              </div>
              <div className="text-sm font-bold text-neutral-800 mb-2">Compiti Luca</div>
              
              <div className="mt-auto">
                <div className="flex justify-between text-xs mb-1 font-medium">
                  <span className="text-neutral-500">2/5 completati</span>
                  <span className="text-orange-500">40%</span>
                </div>
                <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500 w-[40%] rounded-full"></div>
                </div>
              </div>
            </div>

            {/* Widget 6 - Chat */}
            <div className="col-span-1 rounded-2xl bg-white shadow-sm p-4 flex flex-col h-[140px] border-t-4 border-purple-500 relative">
              <div className="absolute top-4 right-4 w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center">1</div>
              <div className="w-8 h-8 rounded-full bg-purple-50 text-purple-500 flex items-center justify-center mb-3">
                <MessageCircle size={18} />
              </div>
              <div className="text-sm font-bold text-neutral-800 mb-1">Chat</div>
              <div className="text-xs text-neutral-600 mt-auto italic bg-neutral-50 p-2 rounded-lg">
                <span className="font-semibold not-italic">Elena:</span> "Ci penso io 👍"
              </div>
            </div>

            {/* Widget 7 - Meds (Small Strip) */}
            <div className="col-span-2 rounded-2xl bg-white shadow-sm p-4 flex flex-col border-l-4 border-rose-500">
              <div className="flex justify-between items-center mb-3">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-800">
                  <Pill size={16} className="text-rose-500" /> Farmaci oggi
                </div>
                <div className="flex gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-rose-500 text-white flex items-center justify-center text-[10px]">✓</div>
                  <div className="w-4 h-4 rounded-full border border-neutral-300"></div>
                  <div className="w-4 h-4 rounded-full border border-neutral-300"></div>
                </div>
              </div>
              <div className="text-xs text-neutral-500">
                Prossimo: <span className="font-medium text-neutral-800">Paracetamolo ore 16:00</span>
              </div>
            </div>

            {/* Widget 8 - Budget (Small Strip) */}
            <div className="col-span-2 rounded-2xl bg-white shadow-sm p-4 flex flex-col border-l-4 border-teal-500 mb-4">
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2 text-sm font-bold text-neutral-800">
                  <CreditCard size={16} className="text-teal-500" /> Budget mese
                </div>
                <div className="text-xs font-semibold text-neutral-800">
                  €420 <span className="text-neutral-400 font-normal">/ €800 spesi</span>
                </div>
              </div>
              <div className="h-2 w-full bg-neutral-100 rounded-full overflow-hidden mt-2">
                <div className="h-full bg-gradient-to-r from-teal-400 to-yellow-400 w-[52.5%] rounded-full"></div>
              </div>
            </div>

          </div>
        </div>

        {/* Bottom Nav */}
        <div className="absolute bottom-0 left-0 right-0 h-[88px] bg-white/90 backdrop-blur-xl border-t border-neutral-100 px-6 pb-6 pt-3 flex justify-between items-center z-20">
          <div className="flex flex-col items-center gap-1 text-blue-600">
            <Home size={24} strokeWidth={2.5} />
            <span className="text-[10px] font-semibold">Home</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-neutral-400">
            <MapPin size={24} />
            <span className="text-[10px] font-medium">Mappa</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-neutral-400 relative">
            <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full border-2 border-white"></div>
            <MessageCircle size={24} />
            <span className="text-[10px] font-medium">Chat</span>
          </div>
          <div className="flex flex-col items-center gap-1 text-neutral-400">
            <MoreHorizontal size={24} />
            <span className="text-[10px] font-medium">Altro</span>
          </div>
        </div>
        
      </div>
    </div>
  );
}
