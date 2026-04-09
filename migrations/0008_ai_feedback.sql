-- AI Feedback System
-- Stores thumbs up/down feedback on AI responses (insights, chat messages, suggestions)

CREATE TABLE IF NOT EXISTS ai_feedback (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id VARCHAR(36) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  profile_id VARCHAR(36) REFERENCES profiles(id) ON DELETE SET NULL,
  target_type VARCHAR(20) NOT NULL,
  target_id VARCHAR(36),
  rating INTEGER NOT NULL,
  comment TEXT,
  context JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_ai_feedback_family ON ai_feedback(family_id, target_type);
