-- Phase 1: AI Chat & Tutor tables
-- ai_conversations: stores chat and tutor conversation sessions
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

-- tutor_sessions: metadata for tutor study sessions
CREATE TABLE IF NOT EXISTS "tutor_sessions" (
  "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  "conversation_id" varchar NOT NULL REFERENCES "ai_conversations"("id") ON DELETE CASCADE,
  "family_id" varchar NOT NULL REFERENCES "families"("id") ON DELETE CASCADE,
  "child_id" varchar NOT NULL REFERENCES "profiles"("id") ON DELETE CASCADE,
  "subject" text NOT NULL,
  "topic" text,
  "difficulty" varchar(15) DEFAULT 'medium',
  "questions_asked" integer NOT NULL DEFAULT 0,
  "correct_answers" integer NOT NULL DEFAULT 0,
  "duration_minutes" integer NOT NULL DEFAULT 0,
  "parent_report_sent" boolean NOT NULL DEFAULT false,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "idx_ai_conversations_family_profile" ON "ai_conversations" ("family_id", "profile_id", "type");
CREATE INDEX IF NOT EXISTS "idx_ai_conversations_open" ON "ai_conversations" ("family_id", "profile_id", "type") WHERE "closed_at" IS NULL;
CREATE INDEX IF NOT EXISTS "idx_ai_messages_conversation" ON "ai_messages" ("conversation_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_tutor_sessions_family_child" ON "tutor_sessions" ("family_id", "child_id");
CREATE INDEX IF NOT EXISTS "idx_tutor_sessions_conversation" ON "tutor_sessions" ("conversation_id");
