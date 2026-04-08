-- Migration: align ai_conversations and ai_messages with shared/schema.ts (Drizzle)
-- Applied via Supabase MCP on 2026-04-07.
-- Background: the Drizzle schema was missing `status`, `user_id`, and `metadata`
-- columns that already existed in the production database. Insert calls without
-- a `status` would have failed because the column was NOT NULL with no default.

-- 1. Default for status so backend INSERTs without an explicit status keep working.
ALTER TABLE public.ai_conversations
  ALTER COLUMN status SET DEFAULT 'active';

-- 2. profile_id is logically required (all current rows already have it set);
--    enforce it at the database level so the Drizzle .notNull() promise holds.
ALTER TABLE public.ai_conversations
  ALTER COLUMN profile_id SET NOT NULL;

-- 3. ai_messages.metadata: column already existed but had no default. Add `{}`
--    so the Drizzle insert (which omits metadata) does not produce nulls.
ALTER TABLE public.ai_messages
  ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
