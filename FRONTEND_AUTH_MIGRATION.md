# Frontend migration to Supabase Auth (Phase 2)

This document describes the frontend changes needed to switch FamilyTracker
from the legacy custom JWT auth (`/api/auth/login`) to Supabase Auth, in
**dual-mode** so we can roll back at any time.

> **Status:** Backend v2 endpoints are live behind the `SUPABASE_AUTH_ENABLED`
> feature flag. Frontend changes below are required before flipping the flag
> in production.

---

## 1. Install the client library

```bash
npm install @supabase/supabase-js
```

## 2. Create a single Supabase client

`client/src/lib/supabase.ts`:

```ts
import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set");
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
```

Add to `.env.local` (and Railway env vars for production builds):

```
VITE_SUPABASE_URL=https://mubtsuxqwhgtarckfyth.supabase.co
VITE_SUPABASE_ANON_KEY=<the public anon key from Supabase dashboard>
```

> **Never** put the service-role key in the frontend.

## 3. Replace login

**Before** (legacy):

```ts
const res = await fetch("/api/auth/login", {
  method: "POST",
  body: JSON.stringify({ email, password }),
  headers: { "Content-Type": "application/json" },
});
const { profile, token } = await res.json();
localStorage.setItem("token", token);
```

**After** (Supabase):

```ts
import { supabase } from "@/lib/supabase";

const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;
// Session is auto-persisted by supabase-js. Now fetch the local profile:
const me = await fetch("/api/auth/v2/me", {
  headers: { Authorization: `Bearer ${data.session.access_token}` },
});
const { profile } = await me.json();
```

## 4. Replace register

**After**:

```ts
const res = await fetch("/api/auth/v2/register", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ firstName, lastName, email, password, familyName }),
});
const { profile, session } = await res.json();
// session contains access_token + refresh_token; hand them to supabase-js:
await supabase.auth.setSession({
  access_token: session.access_token,
  refresh_token: session.refresh_token,
});
```

## 5. Replace join (invite code)

Same shape as register, but POST to `/api/auth/v2/join` with `inviteCode`
instead of `familyName`.

## 6. The Authorization header for every API call

Replace any code that reads `localStorage.getItem("token")` with:

```ts
const { data: { session } } = await supabase.auth.getSession();
const token = session?.access_token;
```

A small wrapper helps:

```ts
// client/src/lib/api.ts
import { supabase } from "./supabase";

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  headers.set("Content-Type", "application/json");
  const res = await fetch(path, { ...init, headers });
  if (!res.ok) throw new Error((await res.json()).message || res.statusText);
  return res.json();
}
```

## 7. Logout

```ts
await supabase.auth.signOut();
// Then redirect to /login
```

No backend call is needed — Supabase invalidates the refresh token client-side
and the access token expires within an hour.

## 8. Listening to auth changes

In `App.tsx` (or wherever your auth context lives):

```ts
useEffect(() => {
  const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") setProfile(null);
    if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
      // Refetch /api/auth/v2/me to keep the local profile in sync.
    }
  });
  return () => sub.subscription.unsubscribe();
}, []);
```

## 9. Migrating existing users (zero downtime)

The backend backfill script (`script/migrate-users-to-supabase-auth.ts`)
creates a Supabase auth user for every existing profile and sends a password
reset email. Order of operations:

1. Deploy backend with `SUPABASE_AUTH_ENABLED=false` (default).
2. Deploy frontend that *can* use Supabase but defaults to legacy.
3. Run the backfill script with `--apply --send-reset` from a one-shot job.
4. Set `SUPABASE_AUTH_ENABLED=true` and redeploy backend.
5. Switch the frontend `LOGIN_MODE` flag to `supabase`.
6. Monitor `/api/auth/v2/me` 401 rate; rollback by setting flag back to `legacy`.

## 10. Rollback plan

The legacy `/api/auth/*` routes are NOT removed. They keep working as long as
profiles still have a real `password_hash`. Backfilled users get a placeholder
hash that the legacy login refuses, so to rollback safely you'd need to either:

  - Re-run the backfill in reverse (`UPDATE profiles SET auth_user_id = NULL`)
    AND restore the original password hashes from a DB backup, or
  - Have users pick a new password via the legacy `/api/auth/forgot-password`
    flow.

The cleaner rollback is therefore: **don't backfill** until the v2 flow has
been smoke-tested by a real human in production with a freshly registered
account. Phase 2 ships the dual-mode infrastructure; the actual cutover
happens in Phase 8.
