import { pgTable, text, varchar, timestamp, real, integer, boolean, pgEnum, numeric, jsonb, date, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const roleEnum = pgEnum("role", ["parent", "child", "guardian", "elderly"]);
export const notifyOnEnum = pgEnum("notify_on", ["enter", "exit", "both"]);
export const uiModeEnum = pgEnum("ui_mode", ["full", "simple", "elderly"]);

export const families = pgTable("families", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  inviteCode: varchar("invite_code", { length: 8 }).notNull().unique(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const profiles = pgTable("profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  lastName: text("last_name"),
  email: text("email").unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  role: roleEnum("role").notNull().default("parent"),
  uiMode: uiModeEnum("ui_mode").notNull().default("full"),
  avatarUrl: text("avatar_url"),
  colorHex: varchar("color_hex", { length: 7 }).notNull().default("#3B82F6"),
  fcmToken: text("fcm_token"),
  locationPaused: boolean("location_paused").notNull().default(false),
  currentMood: text("current_mood").default("happy"),
  onboardingCompleted: boolean("onboarding_completed").notNull().default(false),
  birthDate: date("birth_date"),
  autonomy: jsonb("autonomy").$type<{
    can_travel_alone: boolean;
    can_stay_home_alone: boolean;
    max_walk_distance_km: number;
    trusted_routes: string[];
    trusted_route_labels: Record<string, string>;
  }>().default({ can_travel_alone: false, can_stay_home_alone: false, max_walk_distance_km: 0, trusted_routes: [], trusted_route_labels: {} }),
  transport: jsonb("transport").$type<{
    has_driving_license: boolean;
    can_use_bus: boolean;
    has_bike: boolean;
    bike_allowed_routes: string[];
  }>().default({ has_driving_license: false, can_use_bus: false, has_bike: false, bike_allowed_routes: [] }),
  ageMilestonesNotified: text("age_milestones_notified").array().default(sql`'{}'::text[]`),
  // Link to Supabase auth.users(id). NULL for legacy profiles created before
  // the Supabase Auth migration; populated by the v2 register/login flow and
  // by the backfill script. Used by RLS helper current_family_id().
  authUserId: varchar("auth_user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const locations = pgTable("locations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  accuracy: real("accuracy"),
  speed: real("speed"),
  isMoving: boolean("is_moving").default(false),
  batteryPct: integer("battery_pct"),
  wifiSsid: text("wifi_ssid"),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

// Fix #18: Location history for trajectory tracking (retained 7 days)
export const locationHistory = pgTable("location_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  accuracy: real("accuracy"),
  speed: real("speed"),
  isMoving: boolean("is_moving").default(false),
  timestamp: timestamp("timestamp").defaultNow().notNull(),
});

export const geofences = pgTable("geofences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  centerLat: real("center_lat").notNull(),
  centerLng: real("center_lng").notNull(),
  radiusM: integer("radius_m").notNull().default(200),
  notifyOn: notifyOnEnum("notify_on").notNull().default("both"),
  debounceMin: integer("debounce_min").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const geofenceEvents = pgTable("geofence_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  geofenceId: varchar("geofence_id").references(() => geofences.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  event: text("event").notNull(),
  triggeredAt: timestamp("triggered_at").defaultNow().notNull(),
});

export const events = pgTable("events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at"),
  assignedTo: text("assigned_to").array().default(sql`'{}'::text[]`),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"),
  reminderMin: integer("reminder_min").default(30),
  category: text("category").default("family"),
  allDay: boolean("all_day").default(false),
  locationName: text("location_name"),
  aiSuggested: boolean("ai_suggested").default(false),
  departureTime: text("departure_time"),
  participants: jsonb("participants").$type<Array<{ member_id: string; role: "participant" | "driver" | "pickup" | "support"; autonomous?: boolean; mode?: string }>>().default([]),
  derived: jsonb("derived").$type<{ departure_time?: string; return_time?: string; travel_time_min?: number; driver_needed?: boolean; pickup_needed?: boolean }>().default({}),
  gaps: text("gaps").array().default(sql`'{}'::text[]`),
  createdBy: varchar("created_by").references(() => profiles.id, { onDelete: "set null" }),
  pickupConfirmedBy: varchar("pickup_confirmed_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const calendarPrefs = pgTable("calendar_prefs", {
  familyId: varchar("family_id").primaryKey().references(() => families.id, { onDelete: "cascade" }),
  defaultView: text("default_view").default("agenda"),
  activeCats: text("active_cats").array().default(sql`ARRAY['school','sport','work','health','family','personal']::text[]`),
  activeMembers: text("active_members").array().default(sql`'{}'::text[]`),
  showAiBadge: boolean("show_ai_badge").default(true),
  briefingTime: text("briefing_time").default("07:30"),
});

export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  senderId: varchar("sender_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  body: text("body").notNull(),
  readBy: text("read_by").array().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const shoppingItems = pgTable("shopping_items", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  qty: integer("qty").notNull().default(1),
  unit: text("unit"),
  category: text("category"),
  checked: boolean("checked").notNull().default(false),
  addedBy: varchar("added_by").references(() => profiles.id, { onDelete: "set null" }),
  checkedBy: varchar("checked_by").references(() => profiles.id, { onDelete: "set null" }),
  sortOrder: integer("sort_order").default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const medications = pgTable("medications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  dosage: text("dosage"),
  scheduleTimes: text("schedule_times").array().default(sql`'{}'::text[]`),
  lastTakenAt: timestamp("last_taken_at"),
  active: boolean("active").notNull().default(true),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const homeDeadlines = pgTable("home_deadlines", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  dueDate: timestamp("due_date").notNull(),
  category: text("category").notNull().default("other"),
  reminderDaysBefore: integer("reminder_days_before").notNull().default(7),
  notes: text("notes"),
  completed: boolean("completed").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  assignedTo: varchar("assigned_to").references(() => profiles.id),
  title: text("title").notNull(),
  description: text("description"),
  points: integer("points").notNull().default(10),
  recurrence: varchar("recurrence").default("once"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  verifiedBy: varchar("verified_by").references(() => profiles.id, { onDelete: "set null" }),
  createdBy: varchar("created_by").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const rewards = pgTable("rewards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  pointsTotal: integer("points_total").notNull().default(0),
  pointsSpent: integer("points_spent").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const checkins = pgTable("checkins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  placeName: text("place_name").notNull(),
  lat: real("lat"),
  lng: real("lng"),
  note: text("note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const budgetCategories = pgTable("budget_categories", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  budgetAmount: numeric("budget_amount", { precision: 12, scale: 2 }).notNull().default("0"),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"),
  icon: text("icon").notNull().default("wallet"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const expenses = pgTable("expenses", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  categoryId: varchar("category_id").references(() => budgetCategories.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  date: timestamp("date").notNull().default(sql`now()`),
  addedBy: varchar("added_by").references(() => profiles.id, { onDelete: "set null" }),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Pets ──────────────────────────────────────────────────────────────────────
export const pets = pgTable("pets", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  species: text("species").notNull().default("dog"),
  breed: text("breed"),
  birthDate: timestamp("birth_date"),
  color: varchar("color", { length: 7 }).notNull().default("#F59E0B"),
  vetName: text("vet_name"),
  vetPhone: text("vet_phone"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const petEvents = pgTable("pet_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  petId: varchar("pet_id").references(() => pets.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull().default("checkup"),
  title: text("title").notNull(),
  date: timestamp("date").notNull(),
  nextDueDate: timestamp("next_due_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Vehicles ──────────────────────────────────────────────────────────────────
export const vehicles = pgTable("vehicles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  brand: text("brand"),
  model: text("model"),
  plate: text("plate"),
  year: integer("year"),
  color: varchar("color", { length: 7 }).notNull().default("#3B82F6"),
  currentKm: integer("current_km"),
  insuranceExpiry: timestamp("insurance_expiry"),
  revisionExpiry: timestamp("revision_expiry"),
  bolloExpiry: timestamp("bollo_expiry"),
  currentUserId: varchar("current_user_id").references(() => profiles.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const vehicleLogs = pgTable("vehicle_logs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  vehicleId: varchar("vehicle_id").references(() => vehicles.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull().default("fuel"),
  title: text("title").notNull(),
  date: timestamp("date").notNull().default(sql`now()`),
  amount: numeric("amount", { precision: 12, scale: 2 }),
  km: integer("km"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Subscriptions ─────────────────────────────────────────────────────────────
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
  billingCycle: text("billing_cycle").notNull().default("monthly"),
  renewalDate: timestamp("renewal_date"),
  color: varchar("color", { length: 7 }).notNull().default("#8B5CF6"),
  icon: text("icon").notNull().default("tv"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Home Contacts ─────────────────────────────────────────────────────────────
export const homeContacts = pgTable("home_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("other"),
  phone: text("phone"),
  email: text("email"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Anniversaries & Birthdays ─────────────────────────────────────────────────
export const anniversaries = pgTable("anniversaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  date: timestamp("date").notNull(),
  type: text("type").notNull().default("birthday"),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  reminderDaysBefore: integer("reminder_days_before").notNull().default(3),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Bank Connections (Open Banking aggregators) ───────────────────────────────
// One row per (family member ↔ bank) connection. The `provider` column tells us
// which aggregator owns this connection (truelayer | tink | saltedge | yapily).
// Tokens are stored encrypted at rest via encryptField/decryptField.
export const bankConnections = pgTable("bank_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  provider: text("provider").notNull(), // "truelayer" | "tink" | "saltedge" | "yapily"
  // External identifiers used by the upstream provider:
  externalConnectionId: text("external_connection_id"), // saltedge connection id, yapily consent id, tink credentials id, truelayer connection id
  institutionId: text("institution_id").notNull(),
  institutionName: text("institution_name").notNull(),
  institutionLogo: text("institution_logo"),
  countryCode: text("country_code"),
  status: text("status").notNull().default("pending"), // pending | active | needs_reauth | error | revoked
  // Encrypted credentials. For OAuth flows we keep access/refresh; for Salt Edge
  // connections we only need the connection id.
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at"),
  consentExpiresAt: timestamp("consent_expires_at"),
  // Per-connection scratch space for provider state (e.g. last cursor, next sync token).
  providerMetadata: jsonb("provider_metadata").$type<Record<string, unknown>>(),
  errorMessage: text("error_message"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastSyncAt: timestamp("last_sync_at"),
});

// ── Bank Accounts (one row per IBAN/account exposed by a connection) ──────────
export const bankAccounts = pgTable("bank_accounts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  connectionId: varchar("connection_id").references(() => bankConnections.id, { onDelete: "cascade" }).notNull(),
  externalAccountId: text("external_account_id").notNull(),
  name: text("name").notNull(),
  type: text("type"), // current | savings | credit_card | loan | …
  iban: text("iban"),
  currency: text("currency").notNull().default("EUR"),
  balance: numeric("balance", { precision: 14, scale: 2 }),
  available: numeric("available", { precision: 14, scale: 2 }),
  lastSyncedAt: timestamp("last_synced_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Bank Transactions ────────────────────────────────────────────────────────
export const bankTransactions = pgTable("bank_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  accountId: varchar("account_id").references(() => bankAccounts.id, { onDelete: "cascade" }).notNull(),
  externalTransactionId: text("external_transaction_id").notNull(),
  bookedAt: timestamp("booked_at").notNull(),
  valueAt: timestamp("value_at"),
  amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  currency: text("currency").notNull().default("EUR"),
  description: text("description"),
  counterparty: text("counterparty"),
  category: text("category"),
  rawPayload: jsonb("raw_payload").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ── Dinner Rotation ───────────────────────────────────────────────────────────
export const dinnerRotation = pgTable("dinner_rotation", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  weekday: integer("weekday").notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  meal: text("meal"),
});

// ── AI Cache & Insights ───────────────────────────────────────────────────────
export const aiCache = pgTable("ai_cache", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  feature: text("feature").notNull(),
  resultJson: text("result_json").notNull(),
  generatedAt: timestamp("generated_at").defaultNow().notNull(),
}, (table) => ({
  // Composite unique constraint to support atomic UPSERT in saveCache()
  aiCacheUnique: uniqueIndex("ai_cache_family_id_feature_unique").on(table.familyId, table.feature),
}));

export const aiInsights = pgTable("ai_insights", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  type: text("type").notNull(),
  message: text("message").notNull(),
  severity: text("severity").notNull().default("info"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  readAt: timestamp("read_at"),
});

// Insert schemas
export const insertFamilySchema = createInsertSchema(families).omit({ id: true, createdAt: true });
export const insertProfileSchema = createInsertSchema(profiles).omit({ id: true, createdAt: true });
export const insertLocationSchema = createInsertSchema(locations).omit({ id: true });
export const insertGeofenceSchema = createInsertSchema(geofences).omit({ id: true, createdAt: true });
export const insertEventSchema = createInsertSchema(events).omit({ id: true, createdAt: true });
export const insertMessageSchema = createInsertSchema(messages).omit({ id: true, createdAt: true });
export const insertShoppingItemSchema = createInsertSchema(shoppingItems).omit({ id: true, createdAt: true });
export const insertMedicationSchema = createInsertSchema(medications).omit({ id: true, createdAt: true });
export const insertHomeDeadlineSchema = createInsertSchema(homeDeadlines).omit({ id: true, createdAt: true });
export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true });
export const insertCheckinSchema = createInsertSchema(checkins).omit({ id: true, createdAt: true });
export const insertBudgetCategorySchema = createInsertSchema(budgetCategories).omit({ id: true, createdAt: true });
export const insertExpenseSchema = createInsertSchema(expenses).omit({ id: true, createdAt: true });
export const insertPetSchema = createInsertSchema(pets).omit({ id: true, createdAt: true });
export const insertPetEventSchema = createInsertSchema(petEvents).omit({ id: true, createdAt: true });
export const insertVehicleSchema = createInsertSchema(vehicles).omit({ id: true, createdAt: true });
export const insertVehicleLogSchema = createInsertSchema(vehicleLogs).omit({ id: true, createdAt: true });
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({ id: true, createdAt: true });
export const insertHomeContactSchema = createInsertSchema(homeContacts).omit({ id: true, createdAt: true });
export const insertAnniversarySchema = createInsertSchema(anniversaries).omit({ id: true, createdAt: true });
export const insertDinnerRotationSchema = createInsertSchema(dinnerRotation).omit({ id: true });
export const insertBankConnectionSchema = createInsertSchema(bankConnections).omit({ id: true, createdAt: true });
export const insertCalendarPrefsSchema = createInsertSchema(calendarPrefs).omit({ familyId: true });

// ─── PROFILE SETTINGS (extended per-user settings) ───────────────────────────
export const profileSettings = pgTable("profile_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull().unique(),
  // Modalità "sono in classe"
  schoolModeEnabled: boolean("school_mode_enabled").default(false),
  schoolModeFrom: text("school_mode_from").default("08:00"),
  schoolModeTo: text("school_mode_to").default("13:30"),
  schoolModeDays: text("school_mode_days").array().default(sql`ARRAY['Lun','Mar','Mer','Gio','Ven']::text[]`),
  // Tracciamento anziani con demenza
  elderlyTrackingEnabled: boolean("elderly_tracking_enabled").default(false),
  nightAlertEnabled: boolean("night_alert_enabled").default(false),
  nightAlertFrom: text("night_alert_from").default("22:00"),
  nightAlertTo: text("night_alert_to").default("06:00"),
  safeZonesOnly: boolean("safe_zones_only").default(false),
  caregiverPhone: text("caregiver_phone"),
  caregiverName: text("caregiver_name"),
  // Check-in consensuale (gamification)
  checkInStreak: integer("check_in_streak").default(0),
  checkInTotal: integer("check_in_total").default(0),
  lastCheckInDate: text("last_check_in_date"),
  // Battery mode
  batteryMode: text("battery_mode").default("auto"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertProfileSettingsSchema = createInsertSchema(profileSettings).omit({ id: true, updatedAt: true });

// ─── MOOD PHOTOS ──────────────────────────────────────────────────────────────
export const moodPhotos = pgTable("mood_photos", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  mood: text("mood").notNull(),
  photoBase64: text("photo_base64"), // legacy — new uploads use objectPath
  objectPath: text("object_path"),  // cloud storage path (preferred)
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertMoodPhotoSchema = createInsertSchema(moodPhotos).omit({ id: true, updatedAt: true });
export type MoodPhoto = typeof moodPhotos.$inferSelect;

// ─── SCHOOL CONNECTIONS ──────────────────────────────────────────────────────
export const schoolPlatformEnum = pgEnum("school_platform", ["classeviva", "argo"]);

export const schoolConnections = pgTable("school_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  userId: varchar("user_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  platform: schoolPlatformEnum("platform").notNull(),
  studentName: text("student_name").notNull(),
  schoolCode: text("school_code"),
  username: text("username").notNull(),
  password: text("password").notNull(),
  studentId: text("student_id"),
  lastSync: timestamp("last_sync"),
  syncError: text("sync_error"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const schoolGrades = pgTable("school_grades", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").references(() => schoolConnections.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  subjectName: text("subject_name").notNull(),
  grade: real("grade"),
  gradeStr: text("grade_str"),
  type: text("type"),
  date: timestamp("date").notNull(),
  notes: text("notes"),
  externalId: text("external_id"),
});

export const schoolAbsences = pgTable("school_absences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").references(() => schoolConnections.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  date: timestamp("date").notNull(),
  type: text("type").notNull(),
  minutes: integer("minutes"),
  justified: boolean("justified").default(false),
  notes: text("notes"),
  externalId: text("external_id"),
});

export const schoolHomework = pgTable("school_homework", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").references(() => schoolConnections.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  subjectName: text("subject_name").notNull(),
  description: text("description").notNull(),
  dueDate: timestamp("due_date"),
  givenAt: timestamp("given_at"),
  done: boolean("done").default(false),
  externalId: text("external_id"),
});

export const schoolNotices = pgTable("school_notices", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id").references(() => schoolConnections.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  title: text("title").notNull(),
  content: text("content"),
  date: timestamp("date"),
  read: boolean("read").default(false),
  externalId: text("external_id"),
});

export const insertSchoolConnectionSchema = createInsertSchema(schoolConnections).omit({ id: true, createdAt: true, studentId: true, lastSync: true, syncError: true });
export const insertSchoolGradeSchema = createInsertSchema(schoolGrades).omit({ id: true });
export const insertSchoolAbsenceSchema = createInsertSchema(schoolAbsences).omit({ id: true });
export const insertSchoolHomeworkSchema = createInsertSchema(schoolHomework).omit({ id: true });
export const insertSchoolNoticeSchema = createInsertSchema(schoolNotices).omit({ id: true });

// Types
export type InsertFamily = z.infer<typeof insertFamilySchema>;
export type Family = typeof families.$inferSelect;
export type InsertProfile = z.infer<typeof insertProfileSchema>;
export type Profile = typeof profiles.$inferSelect;
export type InsertLocation = z.infer<typeof insertLocationSchema>;
export type Location = typeof locations.$inferSelect;
export type InsertGeofence = z.infer<typeof insertGeofenceSchema>;
export type Geofence = typeof geofences.$inferSelect;
export type GeofenceEvent = typeof geofenceEvents.$inferSelect;
export type InsertEvent = z.infer<typeof insertEventSchema>;
export type Event = typeof events.$inferSelect;
export type CalendarPrefs = typeof calendarPrefs.$inferSelect;
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;
export type InsertShoppingItem = z.infer<typeof insertShoppingItemSchema>;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type InsertMedication = z.infer<typeof insertMedicationSchema>;
export type Medication = typeof medications.$inferSelect;
export type InsertHomeDeadline = z.infer<typeof insertHomeDeadlineSchema>;
export type HomeDeadline = typeof homeDeadlines.$inferSelect;
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;
export type Reward = typeof rewards.$inferSelect;
export type InsertCheckin = z.infer<typeof insertCheckinSchema>;
export type Checkin = typeof checkins.$inferSelect;

export type InsertBudgetCategory = z.infer<typeof insertBudgetCategorySchema>;
export type BudgetCategory = typeof budgetCategories.$inferSelect;
export type InsertExpense = z.infer<typeof insertExpenseSchema>;
export type Expense = typeof expenses.$inferSelect;

export type InsertPet = z.infer<typeof insertPetSchema>;
export type Pet = typeof pets.$inferSelect;
export type InsertPetEvent = z.infer<typeof insertPetEventSchema>;
export type PetEvent = typeof petEvents.$inferSelect;

export type InsertVehicle = z.infer<typeof insertVehicleSchema>;
export type Vehicle = typeof vehicles.$inferSelect;
export type InsertVehicleLog = z.infer<typeof insertVehicleLogSchema>;
export type VehicleLog = typeof vehicleLogs.$inferSelect;

export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

export type InsertHomeContact = z.infer<typeof insertHomeContactSchema>;
export type HomeContact = typeof homeContacts.$inferSelect;

export type InsertAnniversary = z.infer<typeof insertAnniversarySchema>;
export type Anniversary = typeof anniversaries.$inferSelect;

export type InsertDinnerRotation = z.infer<typeof insertDinnerRotationSchema>;
export type DinnerRotation = typeof dinnerRotation.$inferSelect;

export type InsertBankConnection = z.infer<typeof insertBankConnectionSchema>;
export type BankConnection = typeof bankConnections.$inferSelect;

// ─── Food Preferences ────────────────────────────────────────────────────────
export const foodPreferences = pgTable("food_preferences", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  likes: text("likes").array().default(sql`'{}'::text[]`),
  dislikes: text("dislikes").array().default(sql`'{}'::text[]`),
  allergies: text("allergies").array().default(sql`'{}'::text[]`),
  dietaryRestrictions: text("dietary_restrictions").array().default(sql`'{}'::text[]`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export const insertFoodPreferencesSchema = createInsertSchema(foodPreferences).omit({ id: true, updatedAt: true });
export type InsertFoodPreferences = z.infer<typeof insertFoodPreferencesSchema>;
export type FoodPreferences = typeof foodPreferences.$inferSelect;

// ─── Documents ───────────────────────────────────────────────────────────────
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "set null" }),
  section: varchar("section", { length: 20 }).notNull().default("personal"), // "personal" | "house"
  category: varchar("category", { length: 50 }).notNull(),
  title: text("title").notNull(),
  notes: text("notes"),
  fileName: text("file_name"),
  mimeType: varchar("mime_type", { length: 100 }),
  fileData: text("file_data"), // base64 (legacy) — new uploads use objectPath
  objectPath: text("object_path"), // object storage path (preferred)
  fileSize: integer("file_size"),
  isPrivate: boolean("is_private").notNull().default(false),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ─── Elderly Safety: Vital Signs ─────────────────────────────────────────────
export const vitalSigns = pgTable("vital_signs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 30 }).notNull(), // blood_pressure | blood_sugar | heart_rate | weight | temperature | oxygen
  value: real("value").notNull(),
  value2: real("value2"), // second value (e.g. diastolic for blood pressure)
  unit: varchar("unit", { length: 20 }).notNull(),
  notes: text("notes"),
  measuredAt: timestamp("measured_at").defaultNow().notNull(),
});

// ─── Elderly Safety: Daily Check-ins ─────────────────────────────────────────
export const dailyCheckins = pgTable("daily_checkins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | ok | help
  mood: varchar("mood", { length: 20 }), // good | bad | tired | anxious
  note: text("note"),
  respondedAt: timestamp("responded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Elderly Safety: Emergency Medical Cards ──────────────────────────────────
export const emergencyCards = pgTable("emergency_cards", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull().unique(),
  fullName: text("full_name").notNull(),
  dateOfBirth: varchar("date_of_birth", { length: 10 }),
  bloodType: varchar("blood_type", { length: 5 }),
  allergies: text("allergies").array().default(sql`'{}'::text[]`),
  conditions: text("conditions").array().default(sql`'{}'::text[]`),
  currentMedications: text("current_medications").array().default(sql`'{}'::text[]`),
  doctorName: text("doctor_name"),
  doctorPhone: varchar("doctor_phone", { length: 30 }),
  emergencyContact1Name: text("emergency_contact1_name"),
  emergencyContact1Phone: varchar("emergency_contact1_phone", { length: 30 }),
  emergencyContact1Relation: varchar("emergency_contact1_relation", { length: 50 }),
  emergencyContact2Name: text("emergency_contact2_name"),
  emergencyContact2Phone: varchar("emergency_contact2_phone", { length: 30 }),
  emergencyContact2Relation: varchar("emergency_contact2_relation", { length: 50 }),
  insuranceInfo: text("insurance_info"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// ─── Elderly Safety: Alert Log ────────────────────────────────────────────────
export const elderlyAlerts = pgTable("elderly_alerts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 30 }).notNull(), // fall | vital_alert | sos | inactivity
  severity: varchar("severity", { length: 20 }).notNull().default("warning"), // info | warning | critical
  title: text("title").notNull(),
  description: text("description"),
  lat: real("lat"),
  lng: real("lng"),
  acknowledged: boolean("acknowledged").notNull().default(false),
  acknowledgedBy: varchar("acknowledged_by"),
  acknowledgedAt: timestamp("acknowledged_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── Elderly Safety: Medication Confirmations ─────────────────────────────────
export const medConfirmations = pgTable("med_confirmations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  medicationId: varchar("medication_id").references(() => medications.id, { onDelete: "cascade" }).notNull(),
  scheduledDate: varchar("scheduled_date", { length: 10 }).notNull(), // YYYY-MM-DD
  scheduledTime: varchar("scheduled_time", { length: 10 }).notNull(), // HH:MM
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending | taken | skipped
  confirmedAt: timestamp("confirmed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── AI Chat Conversations ──────────────────────────────────────────────────
export const aiConversations = pgTable("ai_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  // userId is a legacy column kept nullable to match existing DB; prefer profileId.
  userId: varchar("user_id"),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  type: varchar("type", { length: 20 }).notNull().default("family_chat"), // "family_chat" | "tutor"
  status: varchar("status", { length: 20 }).notNull().default("active"), // "active" | "closed" | "archived"
  title: text("title"),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  closedAt: timestamp("closed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const aiMessages = pgTable("ai_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => aiConversations.id, { onDelete: "cascade" }).notNull(),
  role: varchar("role", { length: 10 }).notNull(), // "user" | "assistant"
  content: text("content").notNull(),
  metadata: jsonb("metadata").$type<Record<string, any>>().default({}),
  tokensUsed: integer("tokens_used"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// ─── AI Tutor Sessions ──────────────────────────────────────────────────────
export const tutorSessions = pgTable("tutor_sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").references(() => aiConversations.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  childId: varchar("child_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  subject: text("subject").notNull(),
  topic: text("topic"),
  difficulty: varchar("difficulty", { length: 15 }).default("medium"), // "easy" | "medium" | "hard"
  questionsAsked: integer("questions_asked").notNull().default(0),
  correctAnswers: integer("correct_answers").notNull().default(0),
  durationMinutes: integer("duration_minutes").notNull().default(0),
  parentReportSent: boolean("parent_report_sent").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertAiConversationSchema = createInsertSchema(aiConversations).omit({ id: true, createdAt: true, updatedAt: true });
export const insertAiMessageSchema = createInsertSchema(aiMessages).omit({ id: true, createdAt: true });
export const insertTutorSessionSchema = createInsertSchema(tutorSessions).omit({ id: true, createdAt: true, updatedAt: true });

export type AiConversation = typeof aiConversations.$inferSelect;
export type InsertAiConversation = z.infer<typeof insertAiConversationSchema>;
export type AiMessage = typeof aiMessages.$inferSelect;
export type InsertAiMessage = z.infer<typeof insertAiMessageSchema>;
export type TutorSession = typeof tutorSessions.$inferSelect;
export type InsertTutorSession = z.infer<typeof insertTutorSessionSchema>;

export type User = Profile;
export type InsertUser = InsertProfile;

export type AiCache = typeof aiCache.$inferSelect;
export type AiInsight = typeof aiInsights.$inferSelect;

export type InsertProfileSettings = z.infer<typeof insertProfileSettingsSchema>;
export type ProfileSettings = typeof profileSettings.$inferSelect;

export type InsertSchoolConnection = z.infer<typeof insertSchoolConnectionSchema>;
export type SchoolConnection = typeof schoolConnections.$inferSelect;
export type InsertSchoolGrade = z.infer<typeof insertSchoolGradeSchema>;
export type SchoolGrade = typeof schoolGrades.$inferSelect;
export type InsertSchoolAbsence = z.infer<typeof insertSchoolAbsenceSchema>;
export type SchoolAbsence = typeof schoolAbsences.$inferSelect;
export type InsertSchoolHomework = z.infer<typeof insertSchoolHomeworkSchema>;
export type SchoolHomework = typeof schoolHomework.$inferSelect;
export type InsertSchoolNotice = z.infer<typeof insertSchoolNoticeSchema>;
export type SchoolNotice = typeof schoolNotices.$inferSelect;

// ── Diario di guida e luoghi ──────────────────────────────────────────────────
export const trips = pgTable("trips", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  profileId: varchar("profile_id").references(() => profiles.id, { onDelete: "cascade" }).notNull(),
  familyId: varchar("family_id").references(() => families.id, { onDelete: "cascade" }).notNull(),
  fromName: text("from_name").notNull(),
  toName: text("to_name").notNull(),
  fromLat: real("from_lat"),
  fromLng: real("from_lng"),
  toLat: real("to_lat"),
  toLng: real("to_lng"),
  distanceKm: real("distance_km"),
  durationMin: integer("duration_min"),
  mode: text("mode").default("car"),
  note: text("note"),
  startedAt: timestamp("started_at").notNull(),
  endedAt: timestamp("ended_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertTripSchema = createInsertSchema(trips).omit({ id: true, createdAt: true });
export type InsertTrip = z.infer<typeof insertTripSchema>;
export type Trip = typeof trips.$inferSelect;
