-- Add metadata column to ai_insights for structured context (e.g. related entity IDs)
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS metadata jsonb;
