-- Fix #3: Add unique constraint on (family_id, feature) to support atomic UPSERT
-- This ensures that saveCache() can safely use INSERT ... ON CONFLICT DO UPDATE
-- without race conditions in concurrent scenarios.

ALTER TABLE "ai_cache" ADD CONSTRAINT "ai_cache_family_id_feature_unique" UNIQUE ("family_id", "feature");
