-- Fix: rename user_id → profile_id in ai_conversations (column was created with wrong name)
-- Safe: only renames if user_id exists and profile_id does not
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'user_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'ai_conversations' AND column_name = 'profile_id'
  ) THEN
    ALTER TABLE "ai_conversations" RENAME COLUMN "user_id" TO "profile_id";
  END IF;
END $$;

-- Recreate indexes with correct column name (DROP IF EXISTS + CREATE IF NOT EXISTS)
DROP INDEX IF EXISTS "idx_ai_conversations_family_profile";
DROP INDEX IF EXISTS "idx_ai_conversations_open";

CREATE INDEX IF NOT EXISTS "idx_ai_conversations_family_profile"
  ON "ai_conversations" ("family_id", "profile_id", "type");

CREATE INDEX IF NOT EXISTS "idx_ai_conversations_open"
  ON "ai_conversations" ("family_id", "profile_id", "type")
  WHERE "closed_at" IS NULL;
