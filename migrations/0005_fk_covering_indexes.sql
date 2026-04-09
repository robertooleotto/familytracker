-- ============================================================================
-- Migration 0005: Covering indexes for every foreign key in the schema.
-- ============================================================================
--
-- Why: Supabase's performance advisor reported 74 foreign keys without a
-- covering index. Unindexed FKs don't hurt SELECTs directly, but they make
-- every DELETE / UPDATE of the *parent* table do a full scan of the child
-- table to find referencing rows. That's catastrophic when a family has
-- thousands of events/expenses and we try to delete a profile or family.
--
-- Tables are small today (<2k rows each) so CREATE INDEX without
-- CONCURRENTLY is sub-second. We use `IF NOT EXISTS` so the migration is
-- idempotent and safe to rerun. Drizzle won't own these indexes — they're
-- a pure performance concern and we'd rather manage them by hand than
-- pollute schema.ts with index() calls for every FK.
-- ============================================================================

-- ai_cache
CREATE INDEX IF NOT EXISTS idx_ai_cache_family_id ON public.ai_cache (family_id);
-- ai_insights
CREATE INDEX IF NOT EXISTS idx_ai_insights_family_id ON public.ai_insights (family_id);
-- anniversaries
CREATE INDEX IF NOT EXISTS idx_anniversaries_family_id ON public.anniversaries (family_id);
CREATE INDEX IF NOT EXISTS idx_anniversaries_profile_id ON public.anniversaries (profile_id);
-- bank_connections
CREATE INDEX IF NOT EXISTS idx_bank_connections_family_id ON public.bank_connections (family_id);
CREATE INDEX IF NOT EXISTS idx_bank_connections_profile_id ON public.bank_connections (profile_id);
-- budget_categories
CREATE INDEX IF NOT EXISTS idx_budget_categories_family_id ON public.budget_categories (family_id);
-- checkins
CREATE INDEX IF NOT EXISTS idx_checkins_family_id ON public.checkins (family_id);
CREATE INDEX IF NOT EXISTS idx_checkins_user_id ON public.checkins (user_id);
-- daily_checkins
CREATE INDEX IF NOT EXISTS idx_daily_checkins_family_id ON public.daily_checkins (family_id);
CREATE INDEX IF NOT EXISTS idx_daily_checkins_profile_id ON public.daily_checkins (profile_id);
-- dinner_rotation
CREATE INDEX IF NOT EXISTS idx_dinner_rotation_family_id ON public.dinner_rotation (family_id);
CREATE INDEX IF NOT EXISTS idx_dinner_rotation_profile_id ON public.dinner_rotation (profile_id);
-- documents
CREATE INDEX IF NOT EXISTS idx_documents_family_id ON public.documents (family_id);
CREATE INDEX IF NOT EXISTS idx_documents_profile_id ON public.documents (profile_id);
-- elderly_alerts
CREATE INDEX IF NOT EXISTS idx_elderly_alerts_family_id ON public.elderly_alerts (family_id);
CREATE INDEX IF NOT EXISTS idx_elderly_alerts_profile_id ON public.elderly_alerts (profile_id);
-- emergency_cards
CREATE INDEX IF NOT EXISTS idx_emergency_cards_family_id ON public.emergency_cards (family_id);
-- events
CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events (created_by);
CREATE INDEX IF NOT EXISTS idx_events_family_id ON public.events (family_id);
CREATE INDEX IF NOT EXISTS idx_events_pickup_confirmed_by ON public.events (pickup_confirmed_by);
-- expenses
CREATE INDEX IF NOT EXISTS idx_expenses_added_by ON public.expenses (added_by);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON public.expenses (category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_family_id ON public.expenses (family_id);
-- food_preferences
CREATE INDEX IF NOT EXISTS idx_food_preferences_family_id ON public.food_preferences (family_id);
CREATE INDEX IF NOT EXISTS idx_food_preferences_profile_id ON public.food_preferences (profile_id);
-- geofence_events
CREATE INDEX IF NOT EXISTS idx_geofence_events_geofence_id ON public.geofence_events (geofence_id);
CREATE INDEX IF NOT EXISTS idx_geofence_events_user_id ON public.geofence_events (user_id);
-- geofences
CREATE INDEX IF NOT EXISTS idx_geofences_family_id ON public.geofences (family_id);
-- home_contacts
CREATE INDEX IF NOT EXISTS idx_home_contacts_family_id ON public.home_contacts (family_id);
-- home_deadlines
CREATE INDEX IF NOT EXISTS idx_home_deadlines_family_id ON public.home_deadlines (family_id);
-- location_history
CREATE INDEX IF NOT EXISTS idx_location_history_family_id ON public.location_history (family_id);
CREATE INDEX IF NOT EXISTS idx_location_history_user_id ON public.location_history (user_id);
-- locations
CREATE INDEX IF NOT EXISTS idx_locations_family_id ON public.locations (family_id);
CREATE INDEX IF NOT EXISTS idx_locations_user_id ON public.locations (user_id);
-- med_confirmations
CREATE INDEX IF NOT EXISTS idx_med_confirmations_family_id ON public.med_confirmations (family_id);
CREATE INDEX IF NOT EXISTS idx_med_confirmations_medication_id ON public.med_confirmations (medication_id);
CREATE INDEX IF NOT EXISTS idx_med_confirmations_profile_id ON public.med_confirmations (profile_id);
-- medications
CREATE INDEX IF NOT EXISTS idx_medications_family_id ON public.medications (family_id);
CREATE INDEX IF NOT EXISTS idx_medications_profile_id ON public.medications (profile_id);
-- messages
CREATE INDEX IF NOT EXISTS idx_messages_family_id ON public.messages (family_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender_id ON public.messages (sender_id);
-- mood_photos
CREATE INDEX IF NOT EXISTS idx_mood_photos_profile_id ON public.mood_photos (profile_id);
-- pet_events
CREATE INDEX IF NOT EXISTS idx_pet_events_family_id ON public.pet_events (family_id);
CREATE INDEX IF NOT EXISTS idx_pet_events_pet_id ON public.pet_events (pet_id);
-- pets
CREATE INDEX IF NOT EXISTS idx_pets_family_id ON public.pets (family_id);
-- profiles
CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON public.profiles (family_id);
-- rewards
CREATE INDEX IF NOT EXISTS idx_rewards_family_id ON public.rewards (family_id);
CREATE INDEX IF NOT EXISTS idx_rewards_profile_id ON public.rewards (profile_id);
-- school_absences
CREATE INDEX IF NOT EXISTS idx_school_absences_connection_id ON public.school_absences (connection_id);
CREATE INDEX IF NOT EXISTS idx_school_absences_family_id ON public.school_absences (family_id);
-- school_connections
CREATE INDEX IF NOT EXISTS idx_school_connections_family_id ON public.school_connections (family_id);
CREATE INDEX IF NOT EXISTS idx_school_connections_user_id ON public.school_connections (user_id);
-- school_grades
CREATE INDEX IF NOT EXISTS idx_school_grades_connection_id ON public.school_grades (connection_id);
CREATE INDEX IF NOT EXISTS idx_school_grades_family_id ON public.school_grades (family_id);
-- school_homework
CREATE INDEX IF NOT EXISTS idx_school_homework_connection_id ON public.school_homework (connection_id);
CREATE INDEX IF NOT EXISTS idx_school_homework_family_id ON public.school_homework (family_id);
-- school_notices
CREATE INDEX IF NOT EXISTS idx_school_notices_connection_id ON public.school_notices (connection_id);
CREATE INDEX IF NOT EXISTS idx_school_notices_family_id ON public.school_notices (family_id);
-- shopping_items
CREATE INDEX IF NOT EXISTS idx_shopping_items_added_by ON public.shopping_items (added_by);
CREATE INDEX IF NOT EXISTS idx_shopping_items_checked_by ON public.shopping_items (checked_by);
CREATE INDEX IF NOT EXISTS idx_shopping_items_family_id ON public.shopping_items (family_id);
-- subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_family_id ON public.subscriptions (family_id);
-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON public.tasks (assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_created_by ON public.tasks (created_by);
CREATE INDEX IF NOT EXISTS idx_tasks_family_id ON public.tasks (family_id);
CREATE INDEX IF NOT EXISTS idx_tasks_verified_by ON public.tasks (verified_by);
-- trips
CREATE INDEX IF NOT EXISTS idx_trips_family_id ON public.trips (family_id);
CREATE INDEX IF NOT EXISTS idx_trips_profile_id ON public.trips (profile_id);
-- vehicle_logs
CREATE INDEX IF NOT EXISTS idx_vehicle_logs_family_id ON public.vehicle_logs (family_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_logs_vehicle_id ON public.vehicle_logs (vehicle_id);
-- vehicles
CREATE INDEX IF NOT EXISTS idx_vehicles_current_user_id ON public.vehicles (current_user_id);
CREATE INDEX IF NOT EXISTS idx_vehicles_family_id ON public.vehicles (family_id);
-- vital_signs
CREATE INDEX IF NOT EXISTS idx_vital_signs_family_id ON public.vital_signs (family_id);
CREATE INDEX IF NOT EXISTS idx_vital_signs_profile_id ON public.vital_signs (profile_id);
