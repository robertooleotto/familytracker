import { db } from "./db";
import {
  families, profiles, locations, events, messages, shoppingItems,
  geofences, geofenceEvents, medications, homeDeadlines, tasks, rewards, checkins,
  budgetCategories, expenses,
  pets, petEvents, vehicles, vehicleLogs, subscriptions, homeContacts, anniversaries, dinnerRotation,
  bankConnections, foodPreferences, documents, locationHistory,
  vitalSigns, dailyCheckins, emergencyCards, elderlyAlerts, medConfirmations,
} from "@shared/schema";
import { eq, desc, and, lt, gte, lte, isNull } from "drizzle-orm";
import type {
  Family, InsertFamily,
  Profile, InsertProfile,
  Location, InsertLocation,
  Geofence, InsertGeofence,
  Event, InsertEvent,
  Message, InsertMessage,
  ShoppingItem, InsertShoppingItem,
  Medication, InsertMedication,
  HomeDeadline, InsertHomeDeadline,
  Task, InsertTask,
  Reward,
  Checkin, InsertCheckin,
  BudgetCategory, InsertBudgetCategory,
  Expense, InsertExpense,
  Pet, InsertPet,
  PetEvent, InsertPetEvent,
  Vehicle, InsertVehicle,
  VehicleLog, InsertVehicleLog,
  Subscription, InsertSubscription,
  HomeContact, InsertHomeContact,
  Anniversary, InsertAnniversary,
  DinnerRotation, InsertDinnerRotation,
  BankConnection, InsertBankConnection,
  Document, InsertDocument,
} from "@shared/schema";

export class DbStorage {
  // ─── Family ────────────────────────────────────────────────────────────────
  async createFamily(data: InsertFamily): Promise<Family> {
    const [f] = await db.insert(families).values(data).returning();
    return f;
  }
  async getFamilyById(id: string): Promise<Family | undefined> {
    const [f] = await db.select().from(families).where(eq(families.id, id));
    return f;
  }
  async getFamilyByInviteCode(code: string): Promise<Family | undefined> {
    const [f] = await db.select().from(families).where(eq(families.inviteCode, code));
    return f;
  }

  // ─── Profiles ──────────────────────────────────────────────────────────────
  async createProfile(data: InsertProfile): Promise<Profile> {
    const [p] = await db.insert(profiles).values(data).returning();
    return p;
  }
  async getProfileById(id: string): Promise<Profile | undefined> {
    const [p] = await db.select().from(profiles).where(eq(profiles.id, id));
    return p;
  }
  async getProfileByUsername(username: string): Promise<Profile | undefined> {
    const [p] = await db.select().from(profiles).where(eq(profiles.username, username));
    return p;
  }
  async getProfileByEmail(email: string): Promise<Profile | undefined> {
    const [p] = await db.select().from(profiles).where(eq(profiles.email, email));
    return p;
  }
  async getProfileByAuthUserId(authUserId: string): Promise<Profile | undefined> {
    const [p] = await db.select().from(profiles).where(eq(profiles.authUserId, authUserId));
    return p;
  }
  async getFamilyMembers(familyId: string): Promise<Profile[]> {
    return db.select().from(profiles).where(eq(profiles.familyId, familyId));
  }
  async updateProfile(id: string, data: Partial<Profile>): Promise<Profile> {
    const [p] = await db.update(profiles).set(data).where(eq(profiles.id, id)).returning();
    return p;
  }
  async setLocationPaused(userId: string, paused: boolean): Promise<void> {
    await db.update(profiles).set({ locationPaused: paused }).where(eq(profiles.id, userId));
  }

  // ─── Locations ─────────────────────────────────────────────────────────────
  async upsertLocation(data: InsertLocation): Promise<Location> {
    // Fix #18: Write to location_history
    await db.insert(locationHistory).values({
      userId: data.userId, familyId: data.familyId, lat: data.lat, lng: data.lng,
      accuracy: data.accuracy, speed: data.speed, isMoving: data.isMoving,
    }).catch(() => {});
    const existing = await db.select().from(locations).where(eq(locations.userId, data.userId));
    if (existing.length > 0) {
      const [u] = await db.update(locations).set({
        lat: data.lat, lng: data.lng, accuracy: data.accuracy,
        speed: data.speed, isMoving: data.isMoving,
        batteryPct: data.batteryPct, wifiSsid: data.wifiSsid,
        timestamp: new Date(),
      }).where(eq(locations.userId, data.userId)).returning();
      return u;
    }
    const [c] = await db.insert(locations).values(data).returning();
    return c;
  }
  async getLatestLocations(familyId: string): Promise<(Location & { profile: Profile })[]> {
    const rows = await db.select().from(locations)
      .innerJoin(profiles, eq(locations.userId, profiles.id))
      .where(eq(locations.familyId, familyId));
    return rows.map(r => ({ ...r.locations, profile: r.profiles }));
  }
  async pruneOldLocations(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    await db.delete(locations).where(lt(locations.timestamp, thirtyDaysAgo));
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000);
    await db.delete(locationHistory).where(lt(locationHistory.timestamp, sevenDaysAgo));
  }
  async getLocationHistory(userId: string, familyId: string, hoursBack = 24): Promise<any[]> {
    const since = new Date(Date.now() - hoursBack * 3600 * 1000);
    return db.select().from(locationHistory)
      .where(and(eq(locationHistory.userId, userId), eq(locationHistory.familyId, familyId), gte(locationHistory.timestamp, since)))
      .orderBy(locationHistory.timestamp);
  }

  // ─── Geofences ─────────────────────────────────────────────────────────────
  async createGeofence(data: InsertGeofence): Promise<Geofence> {
    const [g] = await db.insert(geofences).values(data).returning();
    return g;
  }
  async getGeofencesByFamily(familyId: string): Promise<Geofence[]> {
    return db.select().from(geofences).where(eq(geofences.familyId, familyId));
  }
  async deleteGeofence(id: string, familyId: string): Promise<void> {
    await db.delete(geofences).where(and(eq(geofences.id, id), eq(geofences.familyId, familyId)));
  }

  // ─── Events ────────────────────────────────────────────────────────────────
  async createEvent(data: InsertEvent): Promise<Event> {
    const [e] = await db.insert(events).values(data).returning();
    return e;
  }
  async getEventsByFamily(familyId: string): Promise<Event[]> {
    return db.select().from(events).where(eq(events.familyId, familyId)).orderBy(events.startAt);
  }
  async deleteEvent(id: string, familyId: string): Promise<void> {
    await db.delete(events).where(and(eq(events.id, id), eq(events.familyId, familyId)));
  }
  async confirmPickup(id: string, familyId: string, userId: string): Promise<Event> {
    const [e] = await db.update(events).set({ pickupConfirmedBy: userId }).where(and(eq(events.id, id), eq(events.familyId, familyId))).returning();
    return e;
  }

  // ─── Messages ──────────────────────────────────────────────────────────────
  async createMessage(data: InsertMessage): Promise<Message> {
    const [m] = await db.insert(messages).values(data).returning();
    return m;
  }
  async getMessagesByFamily(familyId: string): Promise<(Message & { sender: Profile })[]> {
    const rows = await db.select().from(messages)
      .innerJoin(profiles, eq(messages.senderId, profiles.id))
      .where(eq(messages.familyId, familyId))
      .orderBy(messages.createdAt).limit(100);
    return rows.map(r => ({ ...r.messages, sender: r.profiles }));
  }
  async markMessageRead(messageId: string, userId: string): Promise<void> {
    const [msg] = await db.select().from(messages).where(eq(messages.id, messageId));
    if (!msg) return;
    const readBy = Array.isArray(msg.readBy) ? msg.readBy : [];
    if (!readBy.includes(userId)) {
      await db.update(messages).set({ readBy: [...readBy, userId] }).where(eq(messages.id, messageId));
    }
  }

  // ─── Shopping ──────────────────────────────────────────────────────────────
  async createShoppingItem(data: InsertShoppingItem): Promise<ShoppingItem> {
    const [i] = await db.insert(shoppingItems).values(data).returning();
    return i;
  }
  async getShoppingItems(familyId: string): Promise<ShoppingItem[]> {
    return db.select().from(shoppingItems).where(eq(shoppingItems.familyId, familyId))
      .orderBy(shoppingItems.checked, shoppingItems.createdAt);
  }
  async updateShoppingItem(id: string, familyId: string, data: Partial<ShoppingItem>): Promise<void> {
    await db.update(shoppingItems).set(data).where(and(eq(shoppingItems.id, id), eq(shoppingItems.familyId, familyId)));
  }
  async deleteShoppingItem(id: string, familyId: string): Promise<void> {
    await db.delete(shoppingItems).where(and(eq(shoppingItems.id, id), eq(shoppingItems.familyId, familyId)));
  }
  async clearCheckedItems(familyId: string): Promise<void> {
    await db.delete(shoppingItems).where(and(eq(shoppingItems.familyId, familyId), eq(shoppingItems.checked, true)));
  }

  // ─── Medications ───────────────────────────────────────────────────────────
  async createMedication(data: InsertMedication): Promise<Medication> {
    const [m] = await db.insert(medications).values(data).returning();
    return m;
  }
  async getMedicationsByFamily(familyId: string): Promise<(Medication & { profile: Profile })[]> {
    const rows = await db.select().from(medications)
      .innerJoin(profiles, eq(medications.profileId, profiles.id))
      .where(eq(medications.familyId, familyId))
      .orderBy(medications.createdAt);
    return rows.map(r => ({ ...r.medications, profile: r.profiles }));
  }
  async updateMedication(id: string, familyId: string, data: Partial<Medication>): Promise<void> {
    await db.update(medications).set(data).where(and(eq(medications.id, id), eq(medications.familyId, familyId)));
  }
  async deleteMedication(id: string, familyId: string): Promise<void> {
    await db.delete(medications).where(and(eq(medications.id, id), eq(medications.familyId, familyId)));
  }

  // ─── Home Deadlines ────────────────────────────────────────────────────────
  async createHomeDeadline(data: InsertHomeDeadline): Promise<HomeDeadline> {
    const [d] = await db.insert(homeDeadlines).values(data).returning();
    return d;
  }
  async getHomeDeadlines(familyId: string): Promise<HomeDeadline[]> {
    return db.select().from(homeDeadlines).where(eq(homeDeadlines.familyId, familyId))
      .orderBy(homeDeadlines.dueDate);
  }
  async updateHomeDeadline(id: string, familyId: string, data: Partial<HomeDeadline>): Promise<void> {
    await db.update(homeDeadlines).set(data).where(and(eq(homeDeadlines.id, id), eq(homeDeadlines.familyId, familyId)));
  }
  async deleteHomeDeadline(id: string, familyId: string): Promise<void> {
    await db.delete(homeDeadlines).where(and(eq(homeDeadlines.id, id), eq(homeDeadlines.familyId, familyId)));
  }

  // ─── Tasks & Rewards ───────────────────────────────────────────────────────
  async createTask(data: InsertTask): Promise<Task> {
    const [t] = await db.insert(tasks).values(data).returning();
    return t;
  }
  async getTasksByFamily(familyId: string): Promise<(Task & { assignedProfile: Profile | null })[]> {
    const rows = await db.select().from(tasks)
      .leftJoin(profiles, eq(tasks.assignedTo, profiles.id))
      .where(eq(tasks.familyId, familyId))
      .orderBy(desc(tasks.createdAt));
    return rows.map(r => ({ ...r.tasks, assignedProfile: r.profiles }));
  }
  async completeTask(id: string, familyId: string): Promise<void> {
    await db.update(tasks).set({ completedAt: new Date() })
      .where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)));
  }
  async verifyTask(id: string, verifierId: string, familyId: string): Promise<void> {
    const [t] = await db.select().from(tasks).where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)));
    if (!t || !t.completedAt) return;
    await db.update(tasks).set({ verifiedBy: verifierId }).where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)));
    // Add points to reward — only if task is assigned to someone
    if (!t.assignedTo) return;
    const assigneeId = t.assignedTo;
    const existing = await db.select().from(rewards).where(eq(rewards.profileId, assigneeId));
    if (existing.length > 0) {
      await db.update(rewards).set({ pointsTotal: existing[0].pointsTotal + t.points, updatedAt: new Date() })
        .where(eq(rewards.profileId, assigneeId));
    } else {
      await db.insert(rewards).values({ profileId: assigneeId, familyId, pointsTotal: t.points, pointsSpent: 0 });
    }
  }
  async deleteTask(id: string, familyId: string): Promise<void> {
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.familyId, familyId)));
  }
  async getRewards(familyId: string): Promise<(Reward & { profile: Profile })[]> {
    const rows = await db.select().from(rewards)
      .innerJoin(profiles, eq(rewards.profileId, profiles.id))
      .where(eq(rewards.familyId, familyId));
    return rows.map(r => ({ ...r.rewards, profile: r.profiles }));
  }

  // ─── Budget Categories ─────────────────────────────────────────────────────
  async createBudgetCategory(data: InsertBudgetCategory): Promise<BudgetCategory> {
    const [c] = await db.insert(budgetCategories).values(data).returning();
    return c;
  }
  async getBudgetCategories(familyId: string): Promise<BudgetCategory[]> {
    return db.select().from(budgetCategories).where(eq(budgetCategories.familyId, familyId)).orderBy(budgetCategories.createdAt);
  }
  async updateBudgetCategory(id: string, familyId: string, data: Partial<BudgetCategory>): Promise<void> {
    await db.update(budgetCategories).set(data).where(and(eq(budgetCategories.id, id), eq(budgetCategories.familyId, familyId)));
  }
  async deleteBudgetCategory(id: string, familyId: string): Promise<void> {
    await db.update(expenses).set({ categoryId: null }).where(and(eq(expenses.categoryId, id), eq(expenses.familyId, familyId)));
    await db.delete(budgetCategories).where(and(eq(budgetCategories.id, id), eq(budgetCategories.familyId, familyId)));
  }

  // ─── Expenses ──────────────────────────────────────────────────────────────
  async createExpense(data: InsertExpense): Promise<Expense> {
    const [e] = await db.insert(expenses).values(data).returning();
    return e;
  }
  async getExpensesByFamily(familyId: string, from?: Date, to?: Date): Promise<(Expense & { category: BudgetCategory | null; addedByProfile: Profile | null })[]> {
    const conditions = [eq(expenses.familyId, familyId)];
    if (from) conditions.push(gte(expenses.date, from));
    if (to) conditions.push(lte(expenses.date, to));
    const rows = await db.select().from(expenses)
      .leftJoin(budgetCategories, eq(expenses.categoryId, budgetCategories.id))
      .leftJoin(profiles, eq(expenses.addedBy, profiles.id))
      .where(and(...conditions))
      .orderBy(desc(expenses.date));
    return rows.map(r => ({ ...r.expenses, category: r.budget_categories, addedByProfile: r.profiles }));
  }
  async deleteExpense(id: string, familyId: string): Promise<void> {
    await db.delete(expenses).where(and(eq(expenses.id, id), eq(expenses.familyId, familyId)));
  }

  // ─── Check-ins ─────────────────────────────────────────────────────────────
  async createCheckin(data: InsertCheckin): Promise<Checkin> {
    const [c] = await db.insert(checkins).values(data).returning();
    return c;
  }
  async getCheckinsByFamily(familyId: string): Promise<(Checkin & { profile: Profile })[]> {
    const rows = await db.select().from(checkins)
      .innerJoin(profiles, eq(checkins.userId, profiles.id))
      .where(eq(checkins.familyId, familyId))
      .orderBy(desc(checkins.createdAt)).limit(50);
    return rows.map(r => ({ ...r.checkins, profile: r.profiles }));
  }

  // ─── Pets ───────────────────────────────────────────────────────────────────
  async createPet(data: InsertPet): Promise<Pet> {
    const [p] = await db.insert(pets).values(data).returning();
    return p;
  }
  async getPetsByFamily(familyId: string): Promise<Pet[]> {
    return db.select().from(pets).where(eq(pets.familyId, familyId)).orderBy(pets.name);
  }
  async updatePet(id: string, familyId: string, data: Partial<Pet>): Promise<void> {
    await db.update(pets).set(data).where(and(eq(pets.id, id), eq(pets.familyId, familyId)));
  }
  async deletePet(id: string, familyId: string): Promise<void> {
    await db.delete(petEvents).where(and(eq(petEvents.petId, id), eq(petEvents.familyId, familyId)));
    await db.delete(pets).where(and(eq(pets.id, id), eq(pets.familyId, familyId)));
  }

  // ─── Pet Events ─────────────────────────────────────────────────────────────
  async createPetEvent(data: InsertPetEvent): Promise<PetEvent> {
    const [e] = await db.insert(petEvents).values(data).returning();
    return e;
  }
  async getPetEvents(familyId: string, petId?: string): Promise<PetEvent[]> {
    if (petId) {
      return db.select().from(petEvents).where(and(eq(petEvents.familyId, familyId), eq(petEvents.petId, petId))).orderBy(desc(petEvents.date));
    }
    return db.select().from(petEvents).where(eq(petEvents.familyId, familyId)).orderBy(desc(petEvents.date));
  }
  async deletePetEvent(id: string, familyId: string): Promise<void> {
    await db.delete(petEvents).where(and(eq(petEvents.id, id), eq(petEvents.familyId, familyId)));
  }

  // ─── Vehicles ───────────────────────────────────────────────────────────────
  async createVehicle(data: InsertVehicle): Promise<Vehicle> {
    const [v] = await db.insert(vehicles).values(data).returning();
    return v;
  }
  async getVehiclesByFamily(familyId: string): Promise<(Vehicle & { currentUser: Profile | null })[]> {
    const rows = await db.select().from(vehicles)
      .leftJoin(profiles, eq(vehicles.currentUserId, profiles.id))
      .where(eq(vehicles.familyId, familyId))
      .orderBy(vehicles.name);
    return rows.map(r => ({ ...r.vehicles, currentUser: r.profiles }));
  }
  async updateVehicle(id: string, familyId: string, data: Partial<Vehicle>): Promise<void> {
    await db.update(vehicles).set(data).where(and(eq(vehicles.id, id), eq(vehicles.familyId, familyId)));
  }
  async deleteVehicle(id: string, familyId: string): Promise<void> {
    await db.delete(vehicleLogs).where(and(eq(vehicleLogs.vehicleId, id), eq(vehicleLogs.familyId, familyId)));
    await db.delete(vehicles).where(and(eq(vehicles.id, id), eq(vehicles.familyId, familyId)));
  }

  // ─── Vehicle Logs ────────────────────────────────────────────────────────────
  async createVehicleLog(data: InsertVehicleLog): Promise<VehicleLog> {
    const [l] = await db.insert(vehicleLogs).values(data).returning();
    return l;
  }
  async getVehicleLogs(familyId: string, vehicleId?: string): Promise<VehicleLog[]> {
    if (vehicleId) {
      return db.select().from(vehicleLogs).where(and(eq(vehicleLogs.familyId, familyId), eq(vehicleLogs.vehicleId, vehicleId))).orderBy(desc(vehicleLogs.date));
    }
    return db.select().from(vehicleLogs).where(eq(vehicleLogs.familyId, familyId)).orderBy(desc(vehicleLogs.date));
  }
  async deleteVehicleLog(id: string, familyId: string): Promise<void> {
    await db.delete(vehicleLogs).where(and(eq(vehicleLogs.id, id), eq(vehicleLogs.familyId, familyId)));
  }

  // ─── Subscriptions ───────────────────────────────────────────────────────────
  async createSubscription(data: InsertSubscription): Promise<Subscription> {
    const [s] = await db.insert(subscriptions).values(data).returning();
    return s;
  }
  async getSubscriptionsByFamily(familyId: string): Promise<Subscription[]> {
    return db.select().from(subscriptions).where(eq(subscriptions.familyId, familyId)).orderBy(subscriptions.name);
  }
  async updateSubscription(id: string, familyId: string, data: Partial<Subscription>): Promise<void> {
    await db.update(subscriptions).set(data).where(and(eq(subscriptions.id, id), eq(subscriptions.familyId, familyId)));
  }
  async deleteSubscription(id: string, familyId: string): Promise<void> {
    await db.delete(subscriptions).where(and(eq(subscriptions.id, id), eq(subscriptions.familyId, familyId)));
  }

  // ─── Home Contacts ───────────────────────────────────────────────────────────
  async createHomeContact(data: InsertHomeContact): Promise<HomeContact> {
    const [c] = await db.insert(homeContacts).values(data).returning();
    return c;
  }
  async getHomeContactsByFamily(familyId: string): Promise<HomeContact[]> {
    return db.select().from(homeContacts).where(eq(homeContacts.familyId, familyId)).orderBy(homeContacts.category, homeContacts.name);
  }
  async updateHomeContact(id: string, familyId: string, data: Partial<HomeContact>): Promise<void> {
    await db.update(homeContacts).set(data).where(and(eq(homeContacts.id, id), eq(homeContacts.familyId, familyId)));
  }
  async deleteHomeContact(id: string, familyId: string): Promise<void> {
    await db.delete(homeContacts).where(and(eq(homeContacts.id, id), eq(homeContacts.familyId, familyId)));
  }

  // ─── Anniversaries ───────────────────────────────────────────────────────────
  async createAnniversary(data: InsertAnniversary): Promise<Anniversary> {
    const [a] = await db.insert(anniversaries).values(data).returning();
    return a;
  }
  async getAnniversariesByFamily(familyId: string): Promise<Anniversary[]> {
    return db.select().from(anniversaries).where(eq(anniversaries.familyId, familyId)).orderBy(anniversaries.date);
  }
  async updateAnniversary(id: string, familyId: string, data: Partial<Anniversary>): Promise<void> {
    await db.update(anniversaries).set(data).where(and(eq(anniversaries.id, id), eq(anniversaries.familyId, familyId)));
  }
  async deleteAnniversary(id: string, familyId: string): Promise<void> {
    await db.delete(anniversaries).where(and(eq(anniversaries.id, id), eq(anniversaries.familyId, familyId)));
  }

  // ─── Dinner Rotation ─────────────────────────────────────────────────────────
  async getDinnerRotationByFamily(familyId: string): Promise<(DinnerRotation & { profile: Profile | null })[]> {
    const rows = await db.select().from(dinnerRotation)
      .leftJoin(profiles, eq(dinnerRotation.profileId, profiles.id))
      .where(eq(dinnerRotation.familyId, familyId))
      .orderBy(dinnerRotation.weekday);
    return rows.map(r => ({ ...r.dinner_rotation, profile: r.profiles }));
  }
  async upsertDinnerRotation(familyId: string, weekday: number, profileId: string | null, meal: string | null): Promise<void> {
    const existing = await db.select().from(dinnerRotation).where(and(eq(dinnerRotation.familyId, familyId), eq(dinnerRotation.weekday, weekday)));
    if (existing.length > 0) {
      await db.update(dinnerRotation).set({ profileId, meal }).where(and(eq(dinnerRotation.familyId, familyId), eq(dinnerRotation.weekday, weekday)));
    } else {
      await db.insert(dinnerRotation).values({ familyId, weekday, profileId, meal });
    }
  }
  // ─── Bank Connections ─────────────────────────────────────────────────────────
  // The full banking flow lives in `server/lib/banking/storage.ts` (it has to
  // handle token encryption); these wrappers exist only for legacy callers
  // (e.g. GDPR export) that just need to read the connection list.
  async createBankConnection(data: InsertBankConnection): Promise<BankConnection> {
    const [c] = await db.insert(bankConnections).values(data).returning();
    return c;
  }
  async getBankConnectionsByFamily(familyId: string): Promise<BankConnection[]> {
    return db.select().from(bankConnections).where(eq(bankConnections.familyId, familyId)).orderBy(desc(bankConnections.createdAt));
  }
  async updateBankConnection(id: string, familyId: string, data: Partial<BankConnection>): Promise<void> {
    await db.update(bankConnections).set(data).where(and(eq(bankConnections.id, id), eq(bankConnections.familyId, familyId)));
  }
  async deleteBankConnection(id: string, familyId: string): Promise<void> {
    await db.delete(bankConnections).where(and(eq(bankConnections.id, id), eq(bankConnections.familyId, familyId)));
  }

  // ─── Documents ───────────────────────────────────────────────────────────────
  async getDocuments(familyId: string, requestingProfileId: string, section?: string): Promise<Document[]> {
    const all = await db.select().from(documents)
      .where(section
        ? and(eq(documents.familyId, familyId), eq(documents.section, section))
        : eq(documents.familyId, familyId))
      .orderBy(desc(documents.createdAt));
    // Filter private docs: only the owner sees them
    return all.filter(d => !d.isPrivate || d.profileId === requestingProfileId);
  }
  async getDocumentById(id: string, familyId: string): Promise<Document | undefined> {
    const [d] = await db.select().from(documents).where(and(eq(documents.id, id), eq(documents.familyId, familyId)));
    return d;
  }
  async createDocument(data: InsertDocument): Promise<Document> {
    const [d] = await db.insert(documents).values(data).returning();
    return d;
  }
  async updateDocument(id: string, familyId: string, data: Partial<Document>): Promise<Document | undefined> {
    const [d] = await db.update(documents).set(data).where(and(eq(documents.id, id), eq(documents.familyId, familyId))).returning();
    return d;
  }
  async deleteDocument(id: string, familyId: string): Promise<void> {
    await db.delete(documents).where(and(eq(documents.id, id), eq(documents.familyId, familyId)));
  }

  // ─── Food Preferences ────────────────────────────────────────────────────────
  async getFoodPreferences(familyId: string): Promise<any[]> {
    return db.select().from(foodPreferences).where(eq(foodPreferences.familyId, familyId));
  }
  async upsertFoodPreferences(familyId: string, profileId: string | null, data: { likes?: string[]; dislikes?: string[]; allergies?: string[]; dietaryRestrictions?: string[] }): Promise<any> {
    // Fix #10: Proper handling of null profileId
    const existing = profileId
      ? await db.select().from(foodPreferences).where(and(eq(foodPreferences.familyId, familyId), eq(foodPreferences.profileId, profileId)))
      : await db.select().from(foodPreferences).where(eq(foodPreferences.familyId, familyId)).then(rows => rows.filter(r => !r.profileId));
    if (existing.length > 0) {
      const [r] = await db.update(foodPreferences).set({ ...data, updatedAt: new Date() }).where(eq(foodPreferences.id, existing[0].id)).returning();
      return r;
    }
    const [r] = await db.insert(foodPreferences).values({ familyId, profileId: profileId || null, ...data }).returning();
    return r;
  }

  // ─── Elderly Safety: Vital Signs ─────────────────────────────────────────────
  async getVitalSigns(profileId: string, type?: string, limit = 50): Promise<any[]> {
    const conditions: any[] = [eq(vitalSigns.profileId, profileId)];
    if (type) conditions.push(eq(vitalSigns.type, type));
    return db.select().from(vitalSigns).where(and(...conditions)).orderBy(desc(vitalSigns.measuredAt)).limit(limit);
  }
  async createVitalSign(data: any): Promise<any> {
    const [r] = await db.insert(vitalSigns).values(data).returning();
    return r;
  }
  async deleteVitalSign(id: string, familyId: string): Promise<void> {
    await db.delete(vitalSigns).where(and(eq(vitalSigns.id, id), eq(vitalSigns.familyId, familyId)));
  }

  // ─── Elderly Safety: Daily Check-ins ─────────────────────────────────────────
  async getDailyCheckins(profileId: string, limit = 30): Promise<any[]> {
    return db.select().from(dailyCheckins).where(eq(dailyCheckins.profileId, profileId)).orderBy(desc(dailyCheckins.createdAt)).limit(limit);
  }
  async getTodayCheckin(profileId: string): Promise<any | null> {
    const today = new Date().toISOString().split("T")[0];
    const [r] = await db.select().from(dailyCheckins).where(and(eq(dailyCheckins.profileId, profileId), eq(dailyCheckins.date, today)));
    return r || null;
  }
  async upsertDailyCheckin(data: any): Promise<any> {
    const existing = await this.getTodayCheckin(data.profileId);
    if (existing) {
      const [r] = await db.update(dailyCheckins).set({ status: data.status, respondedAt: new Date(), mood: data.mood, note: data.note }).where(eq(dailyCheckins.id, existing.id)).returning();
      return r;
    }
    const [r] = await db.insert(dailyCheckins).values({ ...data, date: data.date || new Date().toISOString().split("T")[0] }).returning();
    return r;
  }
  async getPendingCheckins(familyId: string): Promise<any[]> {
    const today = new Date().toISOString().split("T")[0];
    return db.select().from(dailyCheckins).where(and(eq(dailyCheckins.familyId, familyId), eq(dailyCheckins.date, today), eq(dailyCheckins.status, "pending")));
  }

  // ─── Elderly Safety: Emergency Cards ─────────────────────────────────────────
  async getEmergencyCard(profileId: string): Promise<any | null> {
    const [r] = await db.select().from(emergencyCards).where(eq(emergencyCards.profileId, profileId));
    return r || null;
  }
  async getEmergencyCardsByFamily(familyId: string): Promise<any[]> {
    return db.select().from(emergencyCards).where(eq(emergencyCards.familyId, familyId));
  }
  async upsertEmergencyCard(data: any): Promise<any> {
    const existing = await this.getEmergencyCard(data.profileId);
    if (existing) {
      const [r] = await db.update(emergencyCards).set({ ...data, updatedAt: new Date() }).where(eq(emergencyCards.id, existing.id)).returning();
      return r;
    }
    const [r] = await db.insert(emergencyCards).values(data).returning();
    return r;
  }

  // ─── Elderly Safety: Alert Log ────────────────────────────────────────────────
  async getElderlyAlerts(familyId: string, limit = 50): Promise<any[]> {
    return db.select().from(elderlyAlerts).where(eq(elderlyAlerts.familyId, familyId)).orderBy(desc(elderlyAlerts.createdAt)).limit(limit);
  }
  async getUnacknowledgedAlerts(familyId: string): Promise<any[]> {
    return db.select().from(elderlyAlerts).where(and(eq(elderlyAlerts.familyId, familyId), eq(elderlyAlerts.acknowledged, false)));
  }
  async createElderlyAlert(data: any): Promise<any> {
    const [r] = await db.insert(elderlyAlerts).values(data).returning();
    return r;
  }
  async acknowledgeAlert(id: string, familyId: string, profileId: string): Promise<void> {
    await db.update(elderlyAlerts).set({ acknowledged: true, acknowledgedBy: profileId, acknowledgedAt: new Date() })
      .where(and(eq(elderlyAlerts.id, id), eq(elderlyAlerts.familyId, familyId)));
  }

  // ─── Elderly Safety: Medication Confirmations ────────────────────────────────
  async getMedConfirmations(profileId: string, date: string): Promise<any[]> {
    return db.select().from(medConfirmations).where(and(eq(medConfirmations.profileId, profileId), eq(medConfirmations.scheduledDate, date)));
  }
  async upsertMedConfirmation(data: any): Promise<any> {
    const [existing] = await db.select().from(medConfirmations).where(and(
      eq(medConfirmations.medicationId, data.medicationId),
      eq(medConfirmations.scheduledDate, data.scheduledDate),
      eq(medConfirmations.scheduledTime, data.scheduledTime),
    ));
    if (existing) {
      const [r] = await db.update(medConfirmations).set({ status: data.status, confirmedAt: data.status === "taken" ? new Date() : null }).where(eq(medConfirmations.id, existing.id)).returning();
      return r;
    }
    const [r] = await db.insert(medConfirmations).values(data).returning();
    return r;
  }
  async getPendingMedConfirmations(familyId: string): Promise<any[]> {
    const today = new Date().toISOString().split("T")[0];
    return db.select().from(medConfirmations).where(and(eq(medConfirmations.familyId, familyId), eq(medConfirmations.scheduledDate, today), eq(medConfirmations.status, "pending")));
  }

  // ─── Elderly Safety: Caregiver Dashboard ─────────────────────────────────────
  async getElderlyProfiles(familyId: string): Promise<any[]> {
    return db.select().from(profiles).where(and(eq(profiles.familyId, familyId), eq(profiles.role, "elderly")));
  }
}

export const storage = new DbStorage();
