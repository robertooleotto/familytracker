# FamilyTracker — Oleotto / Di Pascoli

PWA italiana mobile-first per la coordinazione familiare. Invito: `1FC75712`.

## Stack
- **Frontend**: React + Vite + TypeScript + TailwindCSS + shadcn/ui + Wouter
- **Backend**: Express + TypeScript
- **DB**: PostgreSQL via Drizzle ORM
- **Auth**: JWT + bcrypt
- **Realtime**: WebSocket (`/ws`)
- **AI**: Claude (Anthropic) via `CLAUDE_API_KEY`
- **Banking**: Tink Open Banking (client `8072b08f230f470b8c8f2b4f0743e687`)

## Lingua UI
Tutto in italiano. Nessun testo in inglese visibile all'utente.

## Moduli implementati
1. **Autenticazione** — JWT, bcrypt, profili multipli, codice invito
2. **Mappa live** — posizione GPS, batteria, geofence, buzz SOS
3. **Chat familiare** — messaggi in realtime via WS
4. **Agenda** — eventi, categorie, reminder
5. **Lista spesa** — voci, categorie, stati
6. **Budget** — categorie, spese, grafici
7. **Farmaci** — piani, reminder, storico
8. **Scadenze casa** — bollette, rinnovi, alert
9. **Compiti & Premi** — task assegnabili, punti, verifica
10. **Check-in** — presenze, moods
11. **Geofence** — zone sicure, eventi
12. **Animali** — schede, eventi veterinari
13. **Veicoli** — schede, logs manutenzione
14. **Abbonamenti** — rinnovi periodici
15. **Contatti casa** — idraulico, elettricista, ecc.
16. **Compleanni & Anniversari**
17. **Chi cucina** — rotazione cena
18. **Cucina AI** — ricette, preferenze alimentari
19. **Open Banking (Tink)** — conti, transazioni, previsioni AI
20. **AI Predittiva** — summary serale, anomalie, forecast spesa
21. **Scuola** — ClasseViva + Argo (voti, assenze, compiti, comunicazioni)
22. **Protezione Smart** — SmartProtection con sensori
23. **Documenti** — upload/gestione documenti famiglia
24. **Elderly Safety** — ✅ NUOVO modulo sicurezza anziani

## Modulo Elderly Safety (NUOVO)
- **Vista anziano**: SOS grande, check-in mattutino ("Sto bene" / "Chiamatemi"), conferma medicine
- **Dashboard caregiver**: semaforo stato (check-in, alert, medicine, posizione), parametri vitali, scheda emergenza, storico alert
- **Sensori**: rilevamento cadute (accelerometro), rilevamento incidenti auto, rilevamento suoni forti
- **Tabelle DB**: `vital_signs`, `daily_checkins`, `emergency_cards`, `elderly_alerts`, `med_confirmations`
- **Route API**: `/api/elderly/vitals`, `/api/elderly/checkin`, `/api/elderly/alerts`, `/api/elderly/meds`, `/api/elderly/dashboard/:profileId`, `/api/elderly/members`, `/api/elderly/fall-detected`, `/api/elderly/inactivity-alert`, `/api/elderly/emergency-card`
- **Hook**: `client/src/hooks/useSensorDetection.ts` (useCrashDetection, useFallDetection, useSoundDetection)

## File chiave
- `server/routes.ts` — tutte le API
- `server/storage.ts` — interfaccia DB (DbStorage class)
- `shared/schema.ts` — schema Drizzle + tipi
- `client/src/App.tsx` — routing tab + MoreSheet
- `client/src/pages/ElderlyPage.tsx` — pagina Elderly Safety
- `server/tink.ts` — Open Banking Tink
- `server/ai/aiEngine.ts` — wrapper Claude

## Note tecniche
- Drizzle `numeric` → ritorna `string` a runtime; usare `parseFloat(String(...))`
- TanStack Query v5: solo forma oggetto (`useQuery({ queryKey: [...] })`)
- ID primari: `varchar` con `gen_random_uuid()` — NON cambiare in serial
- Role `"elderly"` attiva la vista semplificata in ElderlyPage
- Salt Edge: piano gratuito non supporta `/connect_sessions/create` → usare sempre Tink
