-- ============================================================================
-- Migration 0003: link the custom `profiles` table to Supabase Auth.
-- ============================================================================
--
-- Status: PLANNED, NOT YET APPLIED.
-- Apply only AFTER the backend has been updated to:
--   1. Use `supabase.auth.signUp()` for new accounts.
--   2. Set `profiles.auth_user_id` at signup time.
--   3. Run a one-shot script that creates auth.users rows for every existing
--      profile (using their email) and emails them a password-reset link so
--      they can re-set their password under the new system.
--
-- Why we are doing this:
--   - The current auth uses `username` + `password_hash` in `profiles`. That
--     works but cuts us off from RLS, OAuth, magic links, MFA and password
--     reset, all of which Supabase Auth gives us for free.
--   - Linking to `auth.users` means `auth.uid()` becomes meaningful inside
--     RLS policies, which is the only way to get database-level security
--     instead of trusting the backend to filter every query.
--
-- Rollback plan:
--   ALTER TABLE public.profiles DROP COLUMN auth_user_id;
--   (The `password_hash` column is left intact during the transition; only
--    drop it after a successful dual-mode period of at least 30 days.)
-- ============================================================================

-- Add the link column. Nullable for now so existing rows survive the change.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_auth_user_id_uidx
  ON public.profiles (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

-- Helper function used by every RLS policy in 0004. Returns the family_id of
-- the currently authenticated user, or NULL if not logged in.
-- Marked STABLE + SECURITY DEFINER so it can read profiles regardless of the
-- caller's RLS context, and so PostgREST caches it within a single request.
CREATE OR REPLACE FUNCTION public.current_family_id()
RETURNS varchar
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT family_id
  FROM public.profiles
  WHERE auth_user_id = auth.uid()
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.current_family_id() IS
  'Returns the family_id linked to the current Supabase Auth user. Used by RLS.';

-- Helper to check if the current user is in a specific family. Slightly
-- faster than `family_id = current_family_id()` because PostgREST inlines it.
CREATE OR REPLACE FUNCTION public.is_in_family(target_family_id varchar)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND family_id = target_family_id
  );
$$;

COMMENT ON FUNCTION public.is_in_family(varchar) IS
  'True if the current Supabase Auth user belongs to the given family.';
