-- Remove AI Tutor Feature
-- This migration removes all tutor_sessions tables, indexes, and related infrastructure.

-- Drop indexes first
DROP INDEX IF EXISTS idx_tutor_sessions_family_child;
DROP INDEX IF EXISTS idx_tutor_sessions_conversation;

-- Drop the table
DROP TABLE IF EXISTS public.tutor_sessions;
