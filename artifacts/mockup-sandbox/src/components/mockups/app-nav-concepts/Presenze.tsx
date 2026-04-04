import React, { useState } from "react";
import {
  MapPin,
  MessageCircle,
  Calendar as CalendarIcon,
  ShoppingCart,
  Clock,
  Pill,
  MessageSquare,
  PiggyBank,
  CheckCircle2,
  Users,
  Settings,
  Battery,
  BatteryMedium,
  BatteryLow,
  Navigation
} from "lucide-react";

// Types
type PersonId = "roberto" | "elena" | "luca" | "nonna";

interface Person {
  id: PersonId;
  name: string;
  avatar: string;
  color: string;
  glowColor: string;
  status: string;
  mood: string;
  battery: number;
  location: string;
  lastSeen: string;
  timeline: { time: string; text: string; current?: boolean }[];
  stats: { tasks: string; events: number; meds: string };
}

// Data
const familyData: Record<PersonId, Person> = {
  roberto: {
    id: "roberto",
    name: "Roberto",
    avatar: "👨",
    color: "bg-blue-500",
    glowColor: "shadow-[0_0_20px_rgba(59,130,246,0.6)]",
    status: "Casa",
    mood: "😊",
    battery: 85,
    location: "Via Roma 12, Venezia",
    lastSeen: "2 min fa",
    timeline: [
      { time: "08:30", text: "Partito da casa" },
      { time: "12:15", text: "Pranzo con colleghi" },
      { time: "Ora", text: "Al lavoro", current: true },
      { time: "18:00", text: "Torna a casa (previsto)" },
    ],
    stats: { tasks: "3/5", events: 2, meds: "✓" },
  },
  elena: {
    id: "elena",
    name: "Elena",
    avatar: "👩",
    color: "bg-emerald-500",
    glowColor: "shadow-[0_0_20px_rgba(16,185,129,0.6)]",
    status: "Scuola",
    mood: "📚",
    battery: 62,
    location: "Liceo Scientifico, Mestre",
    lastSeen: "15 min fa",
    timeline: [
      { time: "07:45", text: "Autobus preso" },
      { time: "08:10", text: "Arrivata a scuola" },
      { time: "Ora", text: "In classe (Matematica)", current: true },
      { time: "14:20", text: "Fine lezioni" },
    ],
    stats: { tasks: "1/2", events: 1, meds: "-" },
  },
  luca: {
    id: "luca",
    name: "Luca",
    avatar: "🧒",
    color: "bg-orange-500",
    glowColor: "shadow-[0_0_20px_rgba(249,115,22,0.6)]",
    status: "In viaggio",
    mood: "😴",
    battery: 24,
    location: "Via Garibaldi",
    lastSeen: "Appena ora",
    timeline: [
      { time: "14:00", text: "Uscito da scuola" },
      { time: "14:30", text: "Allenamento calcio" },
      { time: "Ora", text: "In autobus verso casa", current: true },
      { time: "17:15", text: "Arrivo a casa" },
    ],
    stats: { tasks: "0/1", events: 0, meds: "-" },
  },
  nonna: {
    id: "nonna",
    name: "Nonna Rosa",
    avatar: "👵",
    color: "bg-purple-500",
    glowColor: "shadow-[0_0_20px_rgba(168,85,247,0.6)]",
    status: "Casa",
    mood: "😌",
    battery: 98,
    location: "Via Napoli 4, Padova",
    lastSeen: "1 ora fa",
    timeline: [
      { time: "09:00", text: "Sveglia" },
      { time: "10:30", text: "Misurazione pressione" },
      { time: "Ora", text: "Riposo in soggiorno", current: true },
      { time: "19:00", text: "Cena" },
    ],
    stats: { tasks: "2/2", events: 0, meds: "✓" },
  },
};

export function Presenze() {
  const [selectedId, setSelectedId] = useState<PersonId>("roberto");
  const selectedPerson = familyData[selectedId];

  return (
    <div className="flex items-center justify-center min-h-screen bg-neutral-950 p-4 font-sans">
      {/* Mobile Device Mockup Container */}
      <div className="relative w-[390px] h-[844px] bg-[#0a0f1e] rounded-[3rem] shadow-2xl overflow-hidden border-[8px] border-neutral-900 flex flex-col">
        
        {/* TOP SECTION: Family Presence Row (~35%) */}
        <div className="pt-12 pb-6 px-4 bg-gradient-to-b from-[#0f172a] to-transparent shrink-0">
          <div className="flex justify-between items-center mb-6 px-2">
            <h1 className="text-indigo-300/80 text-sm font-semibold tracking-wide flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              FamilyTracker
            </h1>
            <div className="flex gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
              <div className="w-1.5 h-1.5 rounded-full bg-white/20" />
            </div>
          </div>

          <div className="flex overflow-x-auto gap-4 pb-4 px-2 snap-x hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
            {Object.values(familyData).map((person) => {
              const isSelected = selectedId === person.id;
              
              return (
                <button
                  key={person.id}
                  onClick={() => setSelectedId(person.id)}
                  className="flex flex-col items-center gap-2 snap-start relative group transition-all duration-300"
                >
                  <div className="relative">
                    {/* Avatar Circle */}
                    <div 
                      className={`w-20 h-20 rounded-full flex items-center justify-center text-4xl bg-[#131b2f] border-2 transition-all duration-500 z-10 relative
                        ${isSelected ? `border-${person.color.replace('bg-', '')} ${person.glowColor} scale-110` : 'border-white/10 scale-100 opacity-60'}`}
                    >
                      {person.avatar}
                    </div>
                    
                    {/* Status Badge */}
                    <div className={`absolute -bottom-2 -right-2 px-2.5 py-0.5 rounded-full text-[10px] font-bold text-white z-20 border-2 border-[#0a0f1e] whitespace-nowrap
                      ${person.status === 'Casa' ? 'bg-indigo-500' : person.status === 'Scuola' ? 'bg-emerald-500' : person.status === 'In viaggio' ? 'bg-orange-500' : 'bg-neutral-500'}`}
                    >
                      {person.status}
                    </div>
                  </div>

                  <div className={`text-center transition-all duration-300 ${isSelected ? 'opacity-100' : 'opacity-60'}`}>
                    <p className={`font-medium ${isSelected ? 'text-white' : 'text-white/70'}`}>
                      {person.name}
                    </p>
                    <div className="flex items-center justify-center gap-1.5 mt-0.5 text-xs text-white/50">
                      <span>{person.mood}</span>
                      <span className="flex items-center gap-0.5">
                        {person.battery > 60 ? <Battery className="w-3 h-3 text-emerald-400" /> : 
                         person.battery > 20 ? <BatteryMedium className="w-3 h-3 text-orange-400" /> : 
                         <BatteryLow className="w-3 h-3 text-red-400" />}
                        {person.battery}%
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* MIDDLE SECTION: Selected Person Detail Card (~40%) */}
        <div className="flex-1 px-4 flex flex-col min-h-0 relative z-10">
          <div className="bg-white/[0.03] backdrop-blur-xl border border-white/10 rounded-3xl p-5 flex flex-col h-full shadow-lg">
            
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1 tracking-tight">
                  {selectedPerson.name}
                </h2>
                <div className="flex items-center gap-2 text-sm text-white/60">
                  <Clock className="w-3.5 h-3.5" />
                  <span>Visto {selectedPerson.lastSeen}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/80 mt-1.5">
                  <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="truncate max-w-[200px]">{selectedPerson.location}</span>
                </div>
              </div>
              <div className={`w-12 h-12 rounded-2xl ${selectedPerson.color} bg-opacity-20 flex items-center justify-center border border-white/10`}>
                 <span className="text-2xl">{selectedPerson.avatar}</span>
              </div>
            </div>

            {/* Action Pills */}
            <div className="flex gap-2 mb-6 overflow-x-auto hide-scrollbar shrink-0 pb-1" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
              <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-500/20 text-indigo-300 text-sm font-medium whitespace-nowrap border border-indigo-500/30 hover:bg-indigo-500/30 transition-colors">
                <Navigation className="w-4 h-4" /> Vedi mappa
              </button>
              <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 text-white/80 text-sm font-medium whitespace-nowrap border border-white/10 hover:bg-white/10 transition-colors">
                <MessageCircle className="w-4 h-4" /> Scrivi
              </button>
              <button className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white/5 text-white/80 text-sm font-medium whitespace-nowrap border border-white/10 hover:bg-white/10 transition-colors">
                <CalendarIcon className="w-4 h-4" /> Agenda sua
              </button>
            </div>

            {/* Timeline */}
            <div className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-4 mb-4" style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent' }}>
              <div className="relative pl-4 border-l-2 border-white/10 space-y-4 py-1">
                {selectedPerson.timeline.map((item, idx) => (
                  <div key={idx} className="relative flex items-center">
                    <div className={`absolute -left-[21px] w-3 h-3 rounded-full border-2 border-[#131b2f] 
                      ${item.current ? selectedPerson.color + ' ' + selectedPerson.glowColor : 'bg-white/30'}`} 
                    />
                    <span className={`text-xs font-medium w-12 shrink-0 ${item.current ? 'text-white' : 'text-white/40'}`}>
                      {item.time}
                    </span>
                    <span className={`text-sm ml-2 ${item.current ? 'text-white font-medium' : 'text-white/60'}`}>
                      {item.text}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2 mt-auto shrink-0 pt-2 border-t border-white/5">
              <div className="bg-white/[0.02] rounded-xl p-2.5 flex flex-col items-center justify-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span className="text-white font-semibold text-sm">{selectedPerson.stats.tasks}</span>
                <span className="text-white/40 text-[10px] uppercase tracking-wider">Tasks</span>
              </div>
              <div className="bg-white/[0.02] rounded-xl p-2.5 flex flex-col items-center justify-center gap-1">
                <CalendarIcon className="w-4 h-4 text-blue-400" />
                <span className="text-white font-semibold text-sm">{selectedPerson.stats.events}</span>
                <span className="text-white/40 text-[10px] uppercase tracking-wider">Eventi</span>
              </div>
              <div className="bg-white/[0.02] rounded-xl p-2.5 flex flex-col items-center justify-center gap-1">
                <Pill className="w-4 h-4 text-purple-400" />
                <span className="text-white font-semibold text-sm">{selectedPerson.stats.meds}</span>
                <span className="text-white/40 text-[10px] uppercase tracking-wider">Farmaci</span>
              </div>
            </div>

          </div>
        </div>

        {/* BOTTOM SECTION: Shared Family Actions (~25%) */}
        <div className="px-4 py-5 shrink-0">
          <h3 className="text-white/60 text-xs font-semibold uppercase tracking-widest mb-3 flex items-center gap-2 ml-1">
            Famiglia
          </h3>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: ShoppingCart, label: "Spesa", color: "text-amber-400" },
              { icon: CalendarIcon, label: "Agenda", color: "text-blue-400" },
              { icon: Clock, label: "Scadenze", color: "text-rose-400" },
              { icon: Pill, label: "Farmaci", color: "text-purple-400" },
              { icon: MessageSquare, label: "Chat", color: "text-emerald-400" },
              { icon: PiggyBank, label: "Budget", color: "text-indigo-400" },
            ].map((action, idx) => (
              <button key={idx} className="bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 rounded-2xl p-3 flex flex-col items-center justify-center gap-2 transition-all active:scale-95 backdrop-blur-sm">
                <action.icon className={`w-5 h-5 ${action.color}`} />
                <span className="text-white/80 text-[11px] font-medium">{action.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Bottom Tab Bar */}
        <div className="mt-auto h-20 bg-[#0a0f1e]/90 backdrop-blur-md border-t border-white/10 flex items-center justify-around px-6 pb-4 pt-2 shrink-0 relative z-20">
          <button className="flex flex-col items-center gap-1 text-indigo-400 relative">
            <div className="absolute -top-3 w-10 h-1 bg-indigo-500 rounded-full shadow-[0_0_10px_rgba(99,102,241,0.5)]" />
            <Users className="w-6 h-6" />
            <span className="text-[10px] font-medium">Persone</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-white/40 hover:text-white/70 transition-colors">
            <MessageSquare className="w-6 h-6" />
            <span className="text-[10px] font-medium">Chat</span>
          </button>
          <button className="flex flex-col items-center gap-1 text-white/40 hover:text-white/70 transition-colors">
            <Settings className="w-6 h-6" />
            <span className="text-[10px] font-medium">Impostazioni</span>
          </button>
        </div>
        
      </div>
    </div>
  );
}
