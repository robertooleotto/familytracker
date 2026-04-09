-- ============================================================================
-- Migration 0004: Row Level Security policies for every public table.
-- ============================================================================
--
-- Status: PLANNED, NOT YET APPLIED.
-- Depends on 0003_supabase_auth_link.sql having been applied first AND on
-- the backend actually setting `auth_user_id` for every profile.
--
-- Strategy:
--   - Tables that own a `family_id` use `is_in_family(family_id)`.
--   - Tables that own only a `profile_id` join through profiles to derive the
--     family.
--   - Tables that own only a `user_id` (legacy column meaning profile_id)
--     follow the same join pattern.
--   - `families` and `profiles` are special-cased.
--   - `ai_messages` has no family_id of its own and is gated through its
--     parent `ai_conversations`.
--   - `mood_photos` is gated through its `profile_id`.
--   - `geofence_events` is gated through `user_id` -> profiles.
--
-- All policies grant read+write to members of the family. If you need finer
-- granularity (e.g. children cannot see bank_connections), add a role check
-- inside the USING clause: `AND (SELECT role FROM profiles WHERE
-- auth_user_id = auth.uid()) IN ('parent','guardian')`.
-- ============================================================================

-- Convenience: drop and recreate idempotently if re-running.
-- Each block follows the same pattern. Apply once.

-- ─── families ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS families_member_all ON public.families;
CREATE POLICY families_member_all ON public.families
  FOR ALL
  USING (id = public.current_family_id())
  WITH CHECK (id = public.current_family_id());

-- ─── profiles ───────────────────────────────────────────────────────────────
-- Members can see all profiles in their own family. They can update only
-- their own row.
DROP POLICY IF EXISTS profiles_select_same_family ON public.profiles;
CREATE POLICY profiles_select_same_family ON public.profiles
  FOR SELECT
  USING (public.is_in_family(family_id));

DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE
  USING (auth_user_id = auth.uid())
  WITH CHECK (auth_user_id = auth.uid());

-- Insert is performed by the backend during signup with service_role; no
-- public INSERT policy.

-- ─── ai_messages (gated through ai_conversations) ───────────────────────────
DROP POLICY IF EXISTS ai_messages_via_conv ON public.ai_messages;
CREATE POLICY ai_messages_via_conv ON public.ai_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND public.is_in_family(c.family_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.ai_conversations c
      WHERE c.id = ai_messages.conversation_id
        AND public.is_in_family(c.family_id)
    )
  );

-- ─── mood_photos (gated through profile_id) ─────────────────────────────────
DROP POLICY IF EXISTS mood_photos_via_profile ON public.mood_photos;
CREATE POLICY mood_photos_via_profile ON public.mood_photos
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = mood_photos.profile_id
        AND public.is_in_family(p.family_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = mood_photos.profile_id
        AND public.is_in_family(p.family_id)
    )
  );

-- ─── profile_settings (gated through profile_id) ────────────────────────────
DROP POLICY IF EXISTS profile_settings_via_profile ON public.profile_settings;
CREATE POLICY profile_settings_via_profile ON public.profile_settings
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_settings.profile_id
        AND public.is_in_family(p.family_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profile_settings.profile_id
        AND public.is_in_family(p.family_id)
    )
  );

-- ─── geofence_events (gated through user_id -> profiles) ────────────────────
DROP POLICY IF EXISTS geofence_events_via_profile ON public.geofence_events;
CREATE POLICY geofence_events_via_profile ON public.geofence_events
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = geofence_events.user_id
        AND public.is_in_family(p.family_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = geofence_events.user_id
        AND public.is_in_family(p.family_id)
    )
  );

-- ─── All tables that own family_id directly ─────────────────────────────────
-- One block per table. Boring on purpose: each is independently auditable.
DO $$
DECLARE
  tbl text;
  family_tables text[] := ARRAY[
    'ai_cache','ai_conversations','ai_insights','anniversaries',
    'bank_connections','budget_categories','calendar_prefs','checkins',
    'daily_checkins','dinner_rotation','documents','elderly_alerts',
    'emergency_cards','events','expenses','food_preferences','geofences',
    'home_contacts','home_deadlines','location_history','locations',
    'med_confirmations','medications','messages','pet_events','pets',
    'rewards','school_absences','school_connections','school_grades',
    'school_homework','school_notices','shopping_items','subscriptions',
    'tasks','trips','vehicle_logs','vehicles','vital_signs'
  ];
BEGIN
  FOREACH tbl IN ARRAY family_tables LOOP
    EXECUTE format(
      'DROP POLICY IF EXISTS %I_member_all ON public.%I;',
      tbl, tbl
    );
    EXECUTE format(
      'CREATE POLICY %I_member_all ON public.%I FOR ALL '
      'USING (public.is_in_family(family_id)) '
      'WITH CHECK (public.is_in_family(family_id));',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- After running this migration, re-run the Supabase advisors:
--   SELECT * FROM <get_advisors security>;
-- The "rls_enabled_no_policy" warnings should be gone.
-- ============================================================================
