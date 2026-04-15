# FamilyTracker API Reference

Documentazione completa di tutte le route del progetto FamilyTracker. Le route sono raggruppate per dominio.

## Authentication Routes (`/api/auth`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/v2/register` | ✗ | Registra un nuovo utente con email/password |
| POST | `/api/auth/v2/join` | ✗ | Unisce un utente a un nucleo familiare esistente |
| POST | `/api/auth/v2/sync` | ✗ | Sincronizza dati di autenticazione |
| GET | `/api/auth/v2/me` | ✓ | Recupera il profilo dell'utente autenticato |

## AI & Insights Routes (`/api/ai`, `/api/briefing`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/ai/status` | ✓ | Stato del sistema AI |
| GET | `/api/ai/summary` | ✓ | Riassunto AI dell'attività familiare |
| GET | `/api/ai/forecast` | ✓ | Previsioni AI su prossimi eventi/attività |
| GET | `/api/ai/anomalies` | ✓ | Anomalie rilevate dall'AI |
| GET | `/api/ai/score` | ✓ | Score di benessere familiare |
| GET | `/api/ai/study/:childId` | ✓ | Analisi studio AI per un bambino |
| GET | `/api/ai/shopping` | ✓ | Suggerimenti per la spesa da AI |
| GET | `/api/ai/insights` | ✓ | Insights generali del sistema |
| POST | `/api/ai/insights/:id/read` | ✓ | Marca un insight come letto |
| GET | `/api/ai/narrative/:memberId` | ✓ | Narrativa personale AI per un membro |
| POST | `/api/ai/chat` | ✓ | Invia messaggio alla chat AI |
| GET | `/api/ai/chat/conversations` | ✓ | Recupera conversazioni con AI |
| GET | `/api/ai/chat/conversations/:id/messages` | ✓ | Recupera messaggi di una conversazione |
| POST | `/api/ai/chat/conversations/:id/close` | ✓ | Chiude una conversazione |
| POST | `/api/briefing/chat` | ✓ | Chat briefing (riassunto quotidiano) |
| POST | `/api/ai/tutor/chat` | ✓ | Chat con AI tutor (insegnante) |
| POST | `/api/ai/tutor/sessions/:id/end` | ✓ | Termina una sessione di tutor |
| GET | `/api/ai/tutor/sessions/:id/report` | ✓ | Recupera report di una sessione tutor |
| GET | `/api/ai/tutor/sessions` | ✓ | Recupera tutte le sessioni tutor |
| GET | `/api/ai/tutor/conversations` | ✓ | Recupera conversazioni tutor |

## Banking Routes (`/api/banking`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/banking/providers` | ✓ | Recupera lista di provider bancari disponibili |
| GET | `/api/banking/institutions` | ✓ | Recupera lista di istituti bancari |
| POST | `/api/banking/connections` | ✓ | Crea una nuova connessione bancaria |
| GET | `/api/banking/connections` | ✓ | Recupera connessioni bancarie dell'utente |
| POST | `/api/banking/connections/:id/sync` | ✓ | Sincronizza una connessione bancaria |
| DELETE | `/api/banking/connections/:id` | ✓ | Elimina una connessione bancaria |
| GET | `/api/banking/accounts` | ✓ | Recupera conti bancari |
| GET | `/api/banking/accounts/:id/transactions` | ✓ | Recupera transazioni di un conto |

## Budget Routes (`/api/budget`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/budget/categories` | ✓ | Recupera categorie di budget |
| POST | `/api/budget/categories` | ✓ | Crea nuova categoria di budget |
| PATCH | `/api/budget/categories/:id` | ✓ | Aggiorna categoria di budget |
| DELETE | `/api/budget/categories/:id` | ✓ | Elimina categoria di budget |
| GET | `/api/budget/expenses` | ✓ | Recupera spese |
| POST | `/api/budget/expenses` | ✓ | Registra nuova spesa |
| DELETE | `/api/budget/expenses/:id` | ✓ | Elimina spesa |

## Calendar Routes (`/api/events`, `/api/calendar`, `/api/gaps`, `/api/profiles`, `/api/milestones`, `/api/autonomy`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/events` | ✓ | Recupera tutti gli eventi del calendario |
| POST | `/api/events` | ✓ | Crea nuovo evento |
| DELETE | `/api/events/:id` | ✓ | Elimina evento |
| PATCH | `/api/events/:id/pickup` | ✓ | Aggiorna info su ritiro/pickup per evento |
| POST | `/api/calendar/analyze` | ✓ | Analizza il calendario |
| POST | `/api/calendar/parse` | ✓ | Analizza testo libero e crea evento |
| GET | `/api/gaps` | ✓ | Recupera gap di copertura nel calendario |
| POST | `/api/gaps/resolve` | ✓ | Risolvi gap di copertura |
| PATCH | `/api/profiles/:id/autonomy` | ✓ | Aggiorna livello di autonomia di un profilo |
| GET | `/api/milestones` | ✓ | Recupera milestone della famiglia |
| POST | `/api/milestones/respond` | ✓ | Risponde a una milestone |
| GET | `/api/autonomy/patterns` | ✓ | Recupera pattern di autonomia |

## Documents Routes (`/api/documents`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/documents` | ✓ | Carica nuovo documento |
| GET | `/api/documents` | ✓ | Recupera lista documenti |
| GET | `/api/documents/:id` | ✓ | Recupera dettagli documento |
| GET | `/api/documents/:id/file` | ✓ | Scarica file documento |
| PATCH | `/api/documents/:id` | ✓ | Aggiorna metadati documento |
| DELETE | `/api/documents/:id` | ✓ | Elimina documento |

## Elderly & Health Routes (`/api/elderly`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/elderly/vitals/:profileId` | ✓ | Recupera segni vitali di una persona anziana |
| POST | `/api/elderly/vitals` | ✓ | Registra nuovi segni vitali |
| DELETE | `/api/elderly/vitals/:id` | ✓ | Elimina segno vitale |
| GET | `/api/elderly/checkin/today` | ✓ | Recupera check-in odierno |
| POST | `/api/elderly/checkin` | ✓ | Registra check-in |
| GET | `/api/elderly/checkin/history/:profileId` | ✓ | Recupera storico check-in |
| GET | `/api/elderly/emergency-card/:profileId` | ✓ | Recupera scheda di emergenza |
| GET | `/api/elderly/emergency-cards` | ✓ | Recupera tutte le schede di emergenza |
| POST | `/api/elderly/emergency-card` | ✓ | Crea scheda di emergenza |
| GET | `/api/elderly/alerts` | ✓ | Recupera avvisi di salute |
| GET | `/api/elderly/alerts/unacknowledged` | ✓ | Recupera avvisi non riconosciuti |
| POST | `/api/elderly/alerts/:id/acknowledge` | ✓ | Riconosci un avviso |
| GET | `/api/elderly/meds/today/:profileId` | ✓ | Recupera farmaci da prendere oggi |
| POST | `/api/elderly/meds/confirm` | ✓ | Conferma assunzione farmaco |
| GET | `/api/elderly/dashboard/:profileId` | ✓ | Dashboard di monitoraggio persona anziana |
| GET | `/api/elderly/members` | ✓ | Recupera familiari di persone anziane |
| POST | `/api/elderly/fall-detected` | ✓ | Registra rilevamento caduta |
| POST | `/api/elderly/inactivity-alert` | ✓ | Registra avviso di inattività |

## Family & Profile Routes (`/api/family`, `/api/profile`, `/api/location`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/family` | ✓ | Recupera dati nucleo familiare |
| GET | `/api/family/members` | ✓ | Recupera elenco membri famiglia |
| PATCH | `/api/profile` | ✓ | Aggiorna profilo utente |
| POST | `/api/location/pause` | ✓ | Mette in pausa la condivisione posizione |
| POST | `/api/location/resume` | ✓ | Riprende condivisione posizione |
| POST | `/api/locations` | ✓ | Registra nuova posizione |
| GET | `/api/family/locations` | ✓ | Recupera posizioni famigliari |
| POST | `/api/sos` | ✓ | Invia segnale SOS di emergenza |
| GET | `/api/profile/settings` | ✓ | Recupera impostazioni profilo |
| PATCH | `/api/profile/mood` | ✓ | Aggiorna stato d'animo |
| GET | `/api/profile/mood-photos` | ✓ | Recupera foto mood |
| POST | `/api/profile/mood-photos/upload-url` | ✓ | Ottiene URL per upload foto mood |
| POST | `/api/profile/mood-photos` | ✓ | Carica foto mood |
| GET | `/api/family/mood-photos` | ✓ | Recupera foto mood familiari |
| DELETE | `/api/profile/mood-photos/:mood` | ✓ | Elimina foto mood |
| POST | `/api/profile/avatar-upload-url` | ✓ | Ottiene URL per upload avatar |
| GET | `/api/photos/:id` | ✓ | Recupera una foto |
| PATCH | `/api/profile/settings` | ✓ | Aggiorna impostazioni profilo |
| GET | `/api/profile/family-settings` | ✓ | Recupera impostazioni familiari |

## GDPR Routes (`/api/gdpr`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/gdpr/export` | ✓ | Esporta dati personali (GDPR) |
| POST | `/api/gdpr/delete` | ✓ | Elimina dati personali (GDPR) |

## Geofences Routes (`/api/geofences`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/geofences` | ✓ | Recupera geofence (zone di sicurezza) |
| POST | `/api/geofences` | ✓ | Crea nuovo geofence |
| DELETE | `/api/geofences/:id` | ✓ | Elimina geofence |

## Home & Contacts Routes (`/api/deadlines`, `/api/home-contacts`, `/api/anniversaries`, `/api/dinner-rotation`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/deadlines` | ✓ | Recupera scadenze |
| POST | `/api/deadlines` | ✓ | Crea nuova scadenza |
| PATCH | `/api/deadlines/:id` | ✓ | Aggiorna scadenza |
| DELETE | `/api/deadlines/:id` | ✓ | Elimina scadenza |
| GET | `/api/home-contacts` | ✓ | Recupera contatti casa |
| POST | `/api/home-contacts` | ✓ | Crea contatto casa |
| PATCH | `/api/home-contacts/:id` | ✓ | Aggiorna contatto casa |
| DELETE | `/api/home-contacts/:id` | ✓ | Elimina contatto casa |
| GET | `/api/anniversaries` | ✓ | Recupera anniversari |
| POST | `/api/anniversaries` | ✓ | Crea anniversario |
| PATCH | `/api/anniversaries/:id` | ✓ | Aggiorna anniversario |
| DELETE | `/api/anniversaries/:id` | ✓ | Elimina anniversario |
| GET | `/api/dinner-rotation` | ✓ | Recupera rotazione cena |
| PUT | `/api/dinner-rotation` | ✓ | Aggiorna rotazione cena |

## Kitchen Routes (`/api/kitchen`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/kitchen/preferences` | ✓ | Recupera preferenze cucina |
| PUT | `/api/kitchen/preferences` | ✓ | Aggiorna preferenze cucina |
| POST | `/api/kitchen/scan` | ✓ | Scansiona ingrediente/codice |
| POST | `/api/kitchen/menu` | ✓ | Genera menu |

## Lifestyle Routes (`/api/pets`, `/api/vehicles`, `/api/subscriptions`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/pets` | ✓ | Recupera animali domestici |
| POST | `/api/pets` | ✓ | Crea animale domestico |
| PATCH | `/api/pets/:id` | ✓ | Aggiorna animale domestico |
| DELETE | `/api/pets/:id` | ✓ | Elimina animale domestico |
| GET | `/api/pets/events` | ✓ | Recupera eventi animali |
| POST | `/api/pets/events` | ✓ | Crea evento animale |
| DELETE | `/api/pets/events/:id` | ✓ | Elimina evento animale |
| GET | `/api/vehicles` | ✓ | Recupera veicoli |
| POST | `/api/vehicles` | ✓ | Crea veicolo |
| PATCH | `/api/vehicles/:id` | ✓ | Aggiorna veicolo |
| DELETE | `/api/vehicles/:id` | ✓ | Elimina veicolo |
| GET | `/api/vehicles/logs` | ✓ | Recupera log veicoli |
| POST | `/api/vehicles/logs` | ✓ | Registra log veicolo |
| DELETE | `/api/vehicles/logs/:id` | ✓ | Elimina log veicolo |
| GET | `/api/subscriptions` | ✓ | Recupera abbonamenti |
| POST | `/api/subscriptions` | ✓ | Crea abbonamento |
| PATCH | `/api/subscriptions/:id` | ✓ | Aggiorna abbonamento |
| DELETE | `/api/subscriptions/:id` | ✓ | Elimina abbonamento |

## Medications Routes (`/api/medications`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/medications` | ✓ | Recupera elenco farmaci |
| POST | `/api/medications` | ✓ | Registra nuovo farmaco |
| POST | `/api/medications/:id/taken` | ✓ | Registra assunzione farmaco |
| DELETE | `/api/medications/:id` | ✓ | Elimina farmaco |

## Messages Routes (`/api/messages`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/messages` | ✓ | Recupera messaggi |
| POST | `/api/messages` | ✓ | Invia messaggio |
| POST | `/api/messages/:id/read` | ✓ | Marca messaggio come letto |

## Miscellaneous Routes (`/api/trips`, `/api/weather`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/trips` | ✓ | Recupera trip/gite |
| POST | `/api/trips` | ✓ | Crea trip/gita |
| DELETE | `/api/trips/:id` | ✓ | Elimina trip/gita |
| GET | `/api/trips/memory` | ✓ | Recupera memorie di trip |
| GET | `/api/weather` | ✓ | Recupera dati meteo |

## Onboarding Routes (`/api/onboarding`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/onboarding` | ✓ | Completa step di onboarding |

## School Routes (`/api/school`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/school/connections` | ✓ | Recupera connessioni scolastiche |
| POST | `/api/school/connect` | ✓ | Crea connessione a scuola |
| DELETE | `/api/school/connections/:id` | ✓ | Elimina connessione scolastica |
| POST | `/api/school/sync/:id` | ✓ | Sincronizza dati scolastici |
| GET | `/api/school/grades/:connectionId` | ✓ | Recupera voti |
| GET | `/api/school/absences/:connectionId` | ✓ | Recupera assenze |
| GET | `/api/school/homework/:connectionId` | ✓ | Recupera compiti |
| GET | `/api/school/notices/:connectionId` | ✓ | Recupera comunicazioni scuola |
| PATCH | `/api/school/homework/:id/done` | ✓ | Marca compito come completato |

## Shopping Routes (`/api/shopping`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/shopping` | ✓ | Recupera lista spesa |
| POST | `/api/shopping` | ✓ | Aggiungi articolo a lista spesa |
| PATCH | `/api/shopping/:id` | ✓ | Aggiorna articolo lista spesa |
| DELETE | `/api/shopping/checked/all` | ✓ | Elimina tutti articoli controllati |
| DELETE | `/api/shopping/:id` | ✓ | Elimina articolo specifico |

## Tasks & Rewards Routes (`/api/tasks`, `/api/rewards`, `/api/checkins`)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/tasks` | ✓ | Recupera compiti |
| POST | `/api/tasks` | ✓ | Crea compito |
| POST | `/api/tasks/:id/claim` | ✓ | Rivendica compito |
| POST | `/api/tasks/ai-suggest` | ✓ | Ottiene suggerimenti AI per compiti |
| POST | `/api/tasks/:id/complete` | ✓ | Marca compito come completato |
| POST | `/api/tasks/:id/verify` | ✓ | Verifica completamento compito |
| DELETE | `/api/tasks/:id` | ✓ | Elimina compito |
| GET | `/api/rewards` | ✓ | Recupera premi |
| GET | `/api/checkins` | ✓ | Recupera check-in |
| POST | `/api/checkins` | ✓ | Crea check-in |
| GET | `/api/checkins/family` | ✓ | Recupera check-in familiari |
| GET | `/api/checkins/mine` | ✓ | Recupera miei check-in |

---

## Note sull'Autenticazione

- **Auth ✓**: Richiede token di autenticazione valido (JWT da Supabase o sessione)
- **Auth ✗**: Nessuna autenticazione richiesta
- Tutte le route autenticate usano il middleware `requireAuth` o `requireSupabaseAuth`
- Le route di registrazione/join hanno rate limiting stretto (`strictAuthLimiter`)

## Rate Limiting

- `strictAuthLimiter`: Route di auth sensibili (`/api/auth/v2/register`, `/api/auth/v2/join`)
- `authLimiter`: Altre route di auth (`/api/auth`)
- `aiLimiter`: Route AI (`/api/ai`)
- `apiLimiter`: Tutte le altre route API (`/api`)
