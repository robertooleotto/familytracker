-- Smart Places: learned family locations
CREATE TABLE IF NOT EXISTS family_places (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id VARCHAR(36) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category VARCHAR(30),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  radius_m INTEGER DEFAULT 50,
  source VARCHAR(20) DEFAULT 'auto',
  confirmed_by VARCHAR(36) REFERENCES profiles(id) ON DELETE SET NULL,
  visit_count INTEGER DEFAULT 0,
  avg_duration_min INTEGER,
  last_visit_at TIMESTAMP,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_family_places_family ON family_places(family_id);
CREATE INDEX idx_family_places_geo ON family_places(family_id, lat, lng);

-- Visit log: tracks visits to places
CREATE TABLE IF NOT EXISTS visit_log (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id VARCHAR(36) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  profile_id VARCHAR(36) NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  place_id VARCHAR(36) REFERENCES family_places(id) ON DELETE SET NULL,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  arrived_at TIMESTAMP NOT NULL,
  departed_at TIMESTAMP,
  duration_min INTEGER,
  place_name TEXT,
  place_category VARCHAR(30),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_visit_log_profile ON visit_log(profile_id, arrived_at DESC);
CREATE INDEX idx_visit_log_place ON visit_log(place_id);

-- Smart notifications: proactive AI alerts
CREATE TABLE IF NOT EXISTS smart_notifications (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id VARCHAR(36) NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  profile_id VARCHAR(36) REFERENCES profiles(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  action_type VARCHAR(30),
  action_payload JSONB DEFAULT '{}',
  priority VARCHAR(10) DEFAULT 'normal',
  expires_at TIMESTAMP,
  read_at TIMESTAMP,
  acted_at TIMESTAMP,
  dismissed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_smart_notifications_profile ON smart_notifications(family_id, profile_id, created_at DESC);
CREATE INDEX idx_smart_notifications_active ON smart_notifications(family_id, profile_id) WHERE read_at IS NULL AND dismissed_at IS NULL;
