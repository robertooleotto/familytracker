-- Phase 1: AI Chat
-- ai_conversations: stores chat conversation sessions
CREATE TABLE IF NOT EXISTS "ai_conversations" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "family_id" varchar NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "profile_id" varchar NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "type" varchar(20) NOT NULL DEFAULT 'family_chat',
  "title" text,
  "metadata" jsonb DEFAULT '{}'::jsonb,
  "closed_at" timestamp,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- ai_messages: individual messages in a conversation
CREATE TABLE IF NOT EXISTS "ai_messages" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar NOT NULL REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "role" varchar(10) NOT NULL,
  "content" text NOT NULL,
  "tokens_used" integer,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_ai_conversations_family_profile" ON "ai_conversations" ("family_id", "profile_id", "type");
CREATE INDEX IF NOT EXISTS "idx_ai_conversations_open" ON "ai_conversations" ("family_id", "profile_id", "type") WHERE "closed_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_ai_messages_conversation" ON "ai_messages" ("conversation_id", "created_at");
