# Family-Tracker — Audit & Fix Changelog

## Riepilogo

**42 problemi identificati → 42 fix applicate** su 17 file modificati, 2 file nuovi, 1 file eliminato.

---

## File Modificati

| File | Fix Applicate |
|------|---------------|
| `server/routes.ts` | #1, #2, #3, #4, #5, #6, #7, #8, #14, #15, #16, #17, #18, #23, #30, #37, #41 |
| `server/storage.ts` | #10, #18, #33, #34, #38 |
| `server/ai/aiEngine.ts` | #9, #11, #12, #28, #35 |
| `server/ai/scheduler.ts` | #27 |
| `server/seed.ts` | #1, #29 |
| `server/index.ts` | #23 |
| `shared/schema.ts` | #13, #18, #31 |
| `client/src/App.tsx` | #20, #21, #22, #39, #40 |
| `client/src/pages/ChatPage.tsx` | #23 |
| `client/src/pages/BankingPage.tsx` | #32 |
| `client/src/pages/SchoolPage.tsx` | #19 |
| `client/src/pages/DocumentiPage.tsx` | #19 |
| `client/src/pages/SmartProtectionPage.tsx` | #19 |
| `client/src/pages/SettingsPage.tsx` | #42 |
| `client/src/hooks/useSensorDetection.ts` | #36 |
| `client/public/sw.js` | #25 |
| `package.json` | #1, #15, #30 |

## File Nuovi

| File | Scopo |
|------|-------|
| `server/ws.ts` | #23 — WebSocket server per chat real-time |
| `client/src/hooks/useWebSocket.ts` | #23 — Hook React per connessione WS |

## File Eliminati

| File | Motivo |
|------|--------|
| `server/gocardless.ts` | #26 — Dead code, mai importato |

---

## Dettaglio Fix per Categoria

### SICUREZZA (7 fix)

**#1 — Password hashing: SHA-256 → bcrypt**
- `server/routes.ts`: `hashPassword()` ora usa `bcrypt.hash(password, 12)`
- `verifyPassword()` supporta sia bcrypt che legacy SHA-256 per migrazione trasparente
- `server/seed.ts`: seed usa bcrypt async
- `package.json`: aggiunto `bcryptjs` + `@types/bcryptjs`

**#2 — Credenziali scolastiche crittografate**
- `server/routes.ts`: `encryptField(password)` prima di salvare, `decryptField()` prima di usare
- Algoritmo: AES-256-GCM con chiave derivata da `ENCRYPTION_KEY` o `SESSION_SECRET`
- Retrocompatibile: `decryptField()` ritorna il plaintext se il dato non è crittografato

**#3 — JWT secret: throw in produzione**
- Se `NODE_ENV=production` e `SESSION_SECRET` non è impostata → throw all'avvio
- In development: warning + fallback (solo per dev locale)

**#4 — Token bancari crittografati at-rest**
- Tutti i `accessToken`/`refreshToken` TrueLayer ora passano per `encryptField/decryptField`
- Applicato in: bank callback, token refresh, bank delete

**#5 — Input whitelisting su 5 endpoint PATCH**
- `PATCH /api/deadlines/:id` — whitelist: title, dueDate, category, reminderDaysBefore, notes, completed
- `PATCH /api/subscriptions/:id` — whitelist: name, amount, billingCycle, renewalDate, color, icon, active
- `PATCH /api/home-contacts/:id` — whitelist: name, category, phone, email, notes
- `PATCH /api/anniversaries/:id` — whitelist: title, date, type, profileId, reminderDaysBefore
- `PATCH /api/pets/:id` — whitelist: name, species, breed, birthDate, color, vetName, vetPhone, notes

**#15 — Rate limiting**
- Auth: 20 req / 15 minuti
- AI: 10 req / minuto
- API generale: 120 req / minuto
- `package.json`: aggiunto `express-rate-limit`

**#33 — verifyTask IDOR**
- `storage.ts`: query + update ora filtrano per `familyId` oltre che `id`

### BUG BLOCCANTI (5 fix)

**#6 — Route POST /api/checkins duplicata**
- Rimossa la prima definizione (rotta, senza gamification)
- La seconda (con streak + punti) è ora l'unica

**#19 — localStorage.getItem("token") → getAuthHeaders()**
- `SchoolPage.tsx`: 4 query usavano `Bearer ${localStorage.getItem("token")}` → `getAuthHeaders()`
- `DocumentiPage.tsx`: 2 fetch → `getAuthHeaders()`
- `SmartProtectionPage.tsx`: 1 fetch → `getAuthHeaders()`

**#20 — AuthContext.Provider passava token: null**
- `App.tsx:345`: `token: null` → `token: token`

**#32 — BankingPage mutations non parsavano JSON**
- `connectMutation`: aggiunto `return res.json()` nella mutationFn
- `callbackMutation`: aggiunto `return res.json()` nella mutationFn

**#42 — SettingsPage non aggiornava profilo locale**
- `onSuccess`: chiama `updateProfile()` da `useAuth()` dopo il save

### BUG FUNZIONALI (10 fix)

**#7 — Mood photos full table scan**
- `routes.ts`: `db.select().from(moodPhotos)` → `inArray(moodPhotos.profileId, memberIds)`

**#8 — Family settings N+1 query**
- Rimossa variabile morta `settingsRows`
- Single query con `inArray` + Map lookup instead of N separate queries

**#9 — saveCache race condition**
- Update-first approach: check existing → update se trovato → insert con catch duplicate

**#10 — upsertFoodPreferences ambiguo con profileId null**
- Quando `profileId` è null: filtra rows senza profileId invece di match su familyId duplicato

**#11 — AI timeout 10s → 30s**
- `callClaude()`: 10s → 30s
- `callClaudeVision()`: 30s → 45s

**#12 — parseJSON regex greedy**
- Nuovo approccio: direct JSON.parse → code block extraction → balanced brace finder

**#34 — deleteBudgetCategory orfana spese**
- Prima di eliminare: `UPDATE expenses SET categoryId = NULL WHERE categoryId = id`

**#35 — getCached non ordinava per data**
- Aggiunto `orderBy(desc(aiCache.generatedAt)).limit(1)`

**#37 — Onboarding cache duplicati**
- Upsert: check existing → update se trovato → insert se nuovo

**#38 — getExpensesByFamily ignorava from/to**
- Aggiunta logica `gte(expenses.date, from)` e `lte(expenses.date, to)`

### ARCHITETTURA (12 fix)

**#13 — ON DELETE CASCADE/SET NULL**
- `familyId` FK: CASCADE (elimina famiglia → elimina tutto)
- `profileId` required FK: CASCADE
- Optional FK (createdBy, addedBy, etc.): SET NULL
- Child table FK (petEvents→pets, vehicleLogs→vehicles, school*→connections): CASCADE
- `categoryId` su expenses: SET NULL

**#14 — Base64 uploads deprecati**
- Limit base64 ridotto a 4MB con warning log
- Messaggio che invita a usare upload diretto via object storage

**#16 — Input sanitization**
- Helper `sanitize()` che rimuove tag HTML
- Applicato ai messaggi chat

**#17 — Pagination su expenses**
- `GET /api/budget/expenses` supporta `?limit=N&offset=N&from=DATE&to=DATE`

**#18 — Location history**
- Nuova tabella `location_history` nello schema
- `upsertLocation()` scrive anche in history
- `pruneOldLocations()` cancella history > 7 giorni
- Nuovo endpoint `GET /api/locations/history/:userId?hours=24`

**#22 — Wouter routing**
- Navigazione URL-based con `useLocation()` da wouter
- Deep link, refresh e back button ora funzionano
- Path pattern: `/map`, `/chat`, `/banking`, etc. — `/` = briefing

**#23 — WebSocket per chat**
- Nuovo `server/ws.ts`: WS server con auth JWT
- Nuovo `client/src/hooks/useWebSocket.ts`: hook con auto-reconnect
- `ChatPage.tsx`: polling ridotto da 3s a 30s (fallback), WS per real-time
- `broadcastToFamily()` chiamato su new message e SOS

**#25 — Service Worker migliorato**
- Cache-first per asset fingerprinted (JS/CSS bundles)
- Network-first per HTML
- Cache version bumped a v2

**#26 — GoCardless dead code rimosso**
- `server/gocardless.ts` eliminato (mai importato)

**#27 — Scheduler con DB lock**
- Lock basato su `aiCache` con `familyId: "__system__"` e minimum interval
- Previene esecuzioni duplicate su multi-instance e restart

**#28 — AI model configurabile**
- Default: `claude-sonnet-4-20250514` (env: `CLAUDE_MODEL`)
- Premium: `claude-opus-4-5` (env: `CLAUDE_PREMIUM_MODEL`)
- `callClaude(prompt, maxTokens, usePremium)` — terzo parametro opzionale

**#30 — CORS abilitato**
- `cors({ origin: true, credentials: true })` — pronto per Capacitor

**#31 — real → numeric per importi**
- `expenses.amount`: `numeric(12,2)`
- `budgetCategories.budgetAmount`: `numeric(12,2)`
- `subscriptions.amount`: `numeric(12,2)`
- `vehicleLogs.amount`: `numeric(12,2)`

**#41 — Weather proxy**
- Nuovo `GET /api/weather?lat=X&lng=Y` — proxy verso open-meteo + nominatim
- User-Agent corretto per Nominatim
- GPS non più esposto dal client a terze parti

### QUALITÀ (8 fix)

**#21 — Lazy loading pagine**
- 22 pagine ora caricate con `React.lazy()` + `<Suspense>`
- Solo AuthPage, BriefingPage, OnboardingPage nel bundle iniziale

**#29 — Seed bcrypt**
- `seed.ts` usa `bcrypt.hash()` async

**#36 — Sensor hooks callback stable**
- Nuovo helper `useStableCallback()` previene loop di re-subscribe

**#39 — Dark mode compatibility**
- Header: `bg-background/[0.96]`, `text-foreground`
- BottomNav: `bg-background/[0.97]`, `border-border`
- MoreSheet: `bg-background`, `text-foreground`, `text-muted-foreground`

**#40 — React Error Boundary**
- Classe `ErrorBoundary` con bottone "Riprova"
- Wrappa tutte le pagine — un crash di una pagina non crasha l'app

---

## Nuove Dipendenze

```
bcryptjs: ^2.4.3
cors: ^2.8.5
express-rate-limit: ^7.5.0
@types/bcryptjs: ^2.4.6
@types/cors: ^2.8.17
```

## Nuove Variabili d'Ambiente (opzionali)

```
ENCRYPTION_KEY       # Chiave per crittografia AES-256-GCM (default: SESSION_SECRET)
CLAUDE_MODEL         # Modello AI default (default: claude-sonnet-4-20250514)
CLAUDE_PREMIUM_MODEL # Modello AI premium (default: claude-opus-4-5)
```

## Note per il Deploy

1. **Esegui `npm install`** per installare le nuove dipendenze
2. **Esegui `drizzle-kit push`** per applicare le modifiche schema (location_history, numeric columns, FK cascades)
3. **Le password esistenti continuano a funzionare** — `verifyPassword()` supporta sia SHA-256 legacy che bcrypt
4. **Le credenziali scolastiche esistenti continuano a funzionare** — `decryptField()` ritorna plaintext se non crittografato
5. **Imposta `SESSION_SECRET`** come variabile d'ambiente in produzione (obbligatoria)
