# Report Fix QA FamilyTracker — 2026-04-07

## Cosa è stato fatto

### 1. shared/schema.ts — allineato al DB
File: `shared/schema.ts`, tabelle `aiConversations` e `aiMessages`.

- Aggiunta colonna `status` con default `"active"` (era NOT NULL nel DB ma assente in Drizzle: prima ogni INSERT senza status crashava con `null value in column "status"`).
- Aggiunta colonna `userId` (varchar, nullable) per riflettere la colonna legacy presente nel DB ma fantasma per l'ORM.
- Aggiunta colonna `metadata` (jsonb, default `{}`) anche in `aiMessages`, dove esisteva nel DB ma non in Drizzle.
- `profileId` riportato a `notNull()` (verificato che tutte le 3 righe esistenti hanno il valore).

### 2. Migration applicata sul DB di produzione
File: `migrations/0002_align_ai_conversations_with_drizzle.sql`. Eseguita via Supabase MCP, esito `success: true`.

```sql
ALTER TABLE public.ai_conversations ALTER COLUMN status     SET DEFAULT 'active';
ALTER TABLE public.ai_conversations ALTER COLUMN profile_id SET NOT NULL;
ALTER TABLE public.ai_messages      ALTER COLUMN metadata   SET DEFAULT '{}'::jsonb;
```

Verifica post-migrazione (information_schema):

| Tabella | Colonna | Nullable | Default |
|---|---|---|---|
| ai_conversations | status | NO | `'active'::text` |
| ai_conversations | profile_id | NO | — |
| ai_conversations | metadata | YES | `'{}'::jsonb` |
| ai_messages | metadata | YES | `'{}'::jsonb` |

Risultato: il bug bloccante "INSERT ai_conversations crasha senza status" è risolto. Drizzle e DB sono ora allineati.

## Cosa NON è stato fatto (e perché)

### RLS — riclassificato
Nel report iniziale avevo segnalato come critico il fatto che 51 tabelle abbiano RLS abilitata senza alcuna policy. Indagando ho scoperto che:

- La tabella `profiles` **non ha alcuna colonna `auth_user_id`** che la colleghi a `auth.users`. L'app usa autenticazione **custom** (`username` + `password_hash` in `profiles`), non Supabase Auth.
- Quindi `auth.uid()` è sempre `NULL` per questa app, e qualsiasi policy basata su `auth.uid()` chiuderebbe completamente l'accesso.
- Il backend Railway si connette quasi sicuramente con la `service_role` key (o connessione Postgres diretta via Drizzle), che bypassa RLS.
- L'advisor Supabase classifica il problema come **INFO**, non WARN/ERROR, perché RLS abilitata senza policy in pratica nega tutto agli utenti `anon` e `authenticated` — quindi nessun dato è esposto al pubblico.

Conclusione: la situazione attuale **è sicura** se il backend resta l'unico punto d'ingresso al DB. Scrivere policy basate su `auth.uid()` ora sarebbe **dannoso**, non utile. Le opzioni "professionali" reali sono:

1. **Lasciare così** ed eliminare il rumore dell'advisor disabilitando RLS sulle tabelle che non saranno mai esposte al client Supabase. Più pulito, ma rinuncia alla difesa in profondità.
2. **Migrare ad auth Supabase**: aggiungere `auth_user_id uuid REFERENCES auth.users(id)` su `profiles`, popolarlo per gli utenti esistenti, scrivere policy `family_id IN (SELECT family_id FROM profiles WHERE auth_user_id = auth.uid())` su tutte le tabelle. Lavoro grosso ma risolverebbe alla radice.
3. **Status quo** consapevole, documentato, con monitoring sulla `service_role` key.

Da decidere insieme. Per ora non ho toccato nulla di RLS perché qualsiasi cambio sarebbe più rischioso del problema attuale.

### Worktree duplicati
Nel filesystem ci sono 4 worktree git in `.claude/worktrees/` (`practical-tu`, `confident-goodall`, `funny-franklin`, `sweet-merkle`) che contengono ciascuno una copia di `shared/schema.ts` e delle migration. Due di loro hanno già una `0002_fix_ai_conversations_profile_id.sql` mai mergiata. **Non li ho cancellati** perché:

- Cancellare un worktree senza prima recuperare le modifiche pendenti può perdere lavoro.
- Andrebbe fatto con `git worktree list` + `git worktree remove` da terminale, su Windows, davanti a te.

Suggerimento: prima di eliminarli, fai `git -C .claude/worktrees/funny-franklin diff main -- migrations/` per vedere se contengono fix che vale la pena estrarre.

### Health check produzione
Resta **non eseguibile** dal task schedulato perché il dominio Railway è bloccato dal proxy egress del sandbox. Suggerimento operativo: configurare un monitor esterno (UptimeRobot/Better Stack/Healthchecks.io) e aggiungere un endpoint `/healthz` pubblico nel backend.

## Stato finale

| Problema | Stato |
|---|---|
| INSERT ai_conversations rotto per status NOT NULL | ✅ Risolto (default + Drizzle aggiornato) |
| user_id fantasma in Drizzle | ✅ Risolto (colonna aggiunta) |
| ai_messages.metadata non gestita dall'ORM | ✅ Risolto (colonna aggiunta + default) |
| profile_id Drizzle vs DB nullability | ✅ Risolto (entrambi NOT NULL) |
| Migration tracciata nel repo | ✅ `migrations/0002_align_ai_conversations_with_drizzle.sql` |
| RLS senza policy su 51 tabelle | ⚠️ Documentato, decisione architetturale necessaria |
| Worktree duplicati | ⚠️ Da pulire manualmente |
| Health check produzione automatizzato | ⚠️ Bloccato da egress proxy |

## Prossimi passi consigliati

1. Eseguire `npm run typecheck` (o `tsc --noEmit`) localmente per confermare che le nuove colonne non hanno rotto altro codice.
2. Eseguire `npx drizzle-kit generate` per rigenerare lo snapshot Drizzle e verificare che combaci con la migration `0002`.
3. Decidere il piano RLS / auth model fra le 3 opzioni descritte sopra.
4. Pulire i worktree dopo aver salvato eventuali fix in sospeso.
5. Aggiungere `/healthz` al backend Railway e agganciare un monitor esterno.
