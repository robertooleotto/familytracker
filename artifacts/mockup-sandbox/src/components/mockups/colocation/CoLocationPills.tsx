// Mockup: 3 approcci visivi per mostrare la co-localizzazione tra membri

const NAVY = "#1A2535";
const CORAL = "#E8533A";

const members = [
  { name: "Sara",  color: "#3B82F6", battery: 82 },
  { name: "Mike",  color: "#10B981", battery: null },
  { name: "Emma",  color: "#F59E0B", battery: 45 },
  { name: "Nonna", color: "#8B5CF6", battery: 31 },
];

// Emma e Nonna sono insieme
const grouped = [
  { members: [members[0]] },
  { members: [members[1]] },
  { members: [members[2], members[3]], place: "Casa" }, // co-located
];

// ── Opzione A: Avatar sovrapposti con etichetta "Insieme" ─────────────────────
function OptionA() {
  return (
    <div className="rounded-3xl overflow-hidden shadow-xl" style={{ width: 360, background: NAVY }}>
      <div className="px-5 pt-5 pb-4">
        <p className="text-white text-[17px] font-bold">Buonasera, Sara 🌙</p>
        <p className="text-white/50 text-[12px] mt-0.5">Famiglia Oleotto · 3 apr</p>
      </div>
      <div className="flex items-start gap-4 px-5 pb-5 overflow-x-auto">
        {grouped.map((group, gi) => {
          if (group.members.length === 1) {
            const m = group.members[0];
            return (
              <div key={gi} className="flex flex-col items-center gap-1 flex-shrink-0">
                <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-bold"
                  style={{ backgroundColor: m.color, border: "3px solid rgba(255,255,255,.18)" }}>
                  {m.name[0]}
                </div>
                <span className="text-[11px] font-medium text-white/70">{m.name}</span>
                {m.battery != null
                  ? <span className="text-[10px] text-white/40">🔋 {m.battery}%</span>
                  : <span className="text-[10px] text-white/20">—</span>}
              </div>
            );
          }
          // Gruppo co-localizzato
          const [a, b] = group.members;
          return (
            <div key={gi} className="flex flex-col items-center gap-1 flex-shrink-0">
              {/* Avatar sovrapposti */}
              <div className="relative flex items-center" style={{ width: 70, height: 52 }}>
                <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-bold absolute left-0 z-10"
                  style={{ backgroundColor: a.color, border: "3px solid " + NAVY }}>
                  {a.name[0]}
                </div>
                <div className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-bold absolute left-[18px] z-0"
                  style={{ backgroundColor: b.color, border: "3px solid " + NAVY }}>
                  {b.name[0]}
                </div>
              </div>
              {/* Nomi */}
              <span className="text-[11px] font-medium text-white/70">{a.name} + {b.name}</span>
              {/* Badge luogo */}
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-semibold"
                style={{ background: "rgba(232,83,58,.25)", color: CORAL }}>
                📍 {group.place}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Opzione B: Linea di connessione sotto i bollini separati ──────────────────
function OptionB() {
  return (
    <div className="rounded-3xl overflow-hidden shadow-xl" style={{ width: 360, background: NAVY }}>
      <div className="px-5 pt-5 pb-4">
        <p className="text-white text-[17px] font-bold">Buonasera, Sara 🌙</p>
        <p className="text-white/50 text-[12px] mt-0.5">Famiglia Oleotto · 3 apr</p>
      </div>
      <div className="relative px-5 pb-5">
        <div className="flex items-start gap-5">
          {members.map((m, i) => (
            <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
              <div
                className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-bold"
                style={{
                  backgroundColor: m.color,
                  border: (i === 2 || i === 3) ? `3px solid ${CORAL}` : "3px solid rgba(255,255,255,.18)"
                }}>
                {m.name[0]}
              </div>
              <span className="text-[11px] font-medium text-white/70">{m.name}</span>
              {m.battery != null
                ? <span className="text-[10px] text-white/40">🔋 {m.battery}%</span>
                : <span className="text-[10px] text-white/20">—</span>}
            </div>
          ))}
        </div>
        {/* Linea di connessione sotto Emma e Nonna */}
        <div className="absolute bottom-[46px] flex items-end" style={{ left: "calc(5*1.25rem + 2*52px + 5*1.25rem + 2*52px - 4px)", width: "calc(52px + 1.25rem + 52px + 8px)" }}>
          {/* Usiamo un approccio più semplice con position assoluta */}
        </div>
        {/* Badge "Insieme" centrato tra Emma e Nonna */}
        <div className="flex justify-center mt-1">
          <div style={{ marginLeft: "calc(52px + 1.25rem + 52px / 2 - 30px)" }}
            className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-semibold"
            style={{ background: "rgba(232,83,58,.25)", color: CORAL }}>
            ❤️ Insieme · Casa
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Opzione C: Badge piccolo sull'avatar + anello pulsante ───────────────────
function OptionC() {
  return (
    <div className="rounded-3xl overflow-hidden shadow-xl" style={{ width: 360, background: NAVY }}>
      <div className="px-5 pt-5 pb-4">
        <p className="text-white text-[17px] font-bold">Buonasera, Sara 🌙</p>
        <p className="text-white/50 text-[12px] mt-0.5">Famiglia Oleotto · 3 apr</p>
      </div>
      <div className="flex items-start gap-5 px-5 pb-5">
        {members.map((m, i) => {
          const together = i === 2 || i === 3;
          return (
            <div key={i} className="flex flex-col items-center gap-1 flex-shrink-0">
              <div className="relative">
                {/* Anello pulsante per co-localizzati */}
                {together && (
                  <div className="absolute inset-0 rounded-full animate-ping opacity-20"
                    style={{ backgroundColor: CORAL, border: `2px solid ${CORAL}` }} />
                )}
                <div
                  className="w-[52px] h-[52px] rounded-full flex items-center justify-center text-white text-xl font-bold"
                  style={{ backgroundColor: m.color, border: together ? `3px solid ${CORAL}` : "3px solid rgba(255,255,255,.18)" }}>
                  {m.name[0]}
                </div>
                {/* Badge "insieme" */}
                {together && (
                  <div className="absolute -bottom-1 -right-1 w-[18px] h-[18px] rounded-full flex items-center justify-center text-[9px]"
                    style={{ background: CORAL, border: `2px solid ${NAVY}` }}>
                    👥
                  </div>
                )}
              </div>
              <span className="text-[11px] font-medium text-white/70">{m.name}</span>
              {m.battery != null
                ? <span className="text-[10px] text-white/40">🔋 {m.battery}%</span>
                : <span className="text-[10px] text-white/20">—</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CoLocationPills() {
  return (
    <div className="min-h-screen bg-stone-100 flex flex-col items-center justify-center gap-8 p-6">
      <p className="text-stone-500 text-xs font-semibold uppercase tracking-widest">Emma e Nonna sono insieme a Casa</p>

      <div className="flex flex-col gap-3 items-center">
        <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">A — Avatar sovrapposti</p>
        <OptionA />
        <p className="text-[10px] text-stone-400 text-center max-w-xs">Due avatar che si sovrappongono formano un "gruppo" visivo con il nome del luogo sotto</p>
      </div>

      <div className="flex flex-col gap-3 items-center">
        <p className="text-[11px] font-bold text-stone-400 uppercase tracking-widest">B — Bordo colorato + badge</p>
        <OptionC />
        <p className="text-[10px] text-stone-400 text-center max-w-xs">Ogni avatar co-localizzato riceve un bordo corallo + badge 👥 nell'angolo + anello pulsante</p>
      </div>
    </div>
  );
}
