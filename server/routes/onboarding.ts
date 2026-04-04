import type { Express } from "express";
import { storage } from "../storage";
import { db } from "../db";
import { aiCache, profiles } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { auth, safe } from "../lib/routeHelpers";
import { callClaude, saveInsight } from "../ai/aiEngine";

export function registerOnboardingRoutes(app: Express): void {
  app.post("/api/onboarding", async (req, res) => {
    const a = await auth(req, res);
    if (!a) return;
    try {
      const {
        wakeTime,
        sleepTime,
        dinnerTime,
        occupation,
        whoShops,
        shoppingFrequency,
        hasPartner,
        kidsCount,
        kidsAges,
        hasPets,
        petTypes,
        homeType,
        vehicleCount,
        recurringDeadlines,
        activeSubscriptions,
        allergies,
        dietaryRestrictions,
        foodDislikes,
        foodLikes,
        whoCooks,
        activities,
        hasMedications,
        kidsInSchool,
        schoolLevels,
        kidsActivities,
        monthlyBudget,
        mainExpenseCategories,
        goals,
      } = req.body;

      // Save food preferences
      if (allergies?.length || dietaryRestrictions?.length || foodDislikes || foodLikes) {
        await storage.upsertFoodPreferences(a.familyId, a.profileId, {
          likes: foodLikes ? foodLikes.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          dislikes: foodDislikes ? foodDislikes.split(",").map((s: string) => s.trim()).filter(Boolean) : [],
          allergies: allergies || [],
          dietaryRestrictions: dietaryRestrictions || [],
        });
      }

      // Save structured onboarding profile to ai_cache for later use
      const onboardingProfile = {
        wakeTime,
        sleepTime,
        dinnerTime,
        occupation,
        whoShops,
        shoppingFrequency,
        hasPartner,
        kidsCount: kidsCount || 0,
        kidsAges: kidsAges || [],
        hasPets,
        petTypes: petTypes || [],
        homeType,
        vehicleCount: vehicleCount || 0,
        recurringDeadlines: recurringDeadlines || [],
        activeSubscriptions: activeSubscriptions || [],
        foodDislikes,
        foodLikes,
        whoCooks,
        activities: activities || [],
        hasMedications,
        kidsInSchool,
        schoolLevels: schoolLevels || [],
        kidsActivities: kidsActivities || [],
        monthlyBudget,
        mainExpenseCategories: mainExpenseCategories || [],
        goals: goals || [],
        completedAt: new Date().toISOString(),
      };
      const cacheFeature = `onboarding_profile_${a.profileId}`;
      const [existingOb] = await db
        .select()
        .from(aiCache)
        .where(
          and(
            eq(aiCache.familyId, a.familyId),
            eq(aiCache.feature, cacheFeature),
          ),
        );
      if (existingOb) {
        await db
          .update(aiCache)
          .set({
            resultJson: JSON.stringify(onboardingProfile),
            generatedAt: new Date(),
          })
          .where(eq(aiCache.id, existingOb.id));
      } else {
        await db.insert(aiCache).values({
          familyId: a.familyId,
          feature: cacheFeature,
          resultJson: JSON.stringify(onboardingProfile),
        });
      }

      // Fetch profile name
      const profileForPrompt = await storage.getProfileById(a.profileId);
      const profileName = profileForPrompt?.name || "questa persona";

      // Generate rich personalized AI insight
      const kidsDesc =
        (kidsCount || 0) > 0
          ? `${kidsCount} ${(kidsCount || 0) === 1 ? "figlio" : "figli"}${kidsAges?.length ? ` (${kidsAges.join(", ")})` : ""}${kidsInSchool ? ` a scuola (${(schoolLevels || []).join(", ")})` : ""}${kidsActivities?.length ? `, attività: ${kidsActivities.join(", ")}` : ""}`
          : "nessun figlio";

      const prompt = `
Sei l'assistente di fiducia di una famiglia italiana. ${profileName} ha appena completato la configurazione.
Scrivi un messaggio di benvenuto personalizzato in italiano, massimo 4 frasi, tono caldo e familiare.
Menziona 2-3 aspetti specifici della loro vita. NON usare elenchi puntati. Usa un italiano naturale.

Profilo di ${profileName}:
- Orari: sveglia ${wakeTime || "07:00"}, cena ${dinnerTime || "20:00"}, letto ${sleepTime || "23:00"}
- Occupazione: ${occupation || "non specificata"}
- Famiglia: ${hasPartner ? "con partner" : "senza partner"}, ${kidsDesc}
- Animali: ${hasPets ? (petTypes || []).join(", ") || "sì" : "no"}
- Casa: ${homeType || "non specificato"}, ${vehicleCount || 0} veicolo/i
- Scadenze da seguire: ${(recurringDeadlines || []).join(", ") || "nessuna indicata"}
- Abbonamenti: ${(activeSubscriptions || []).join(", ") || "nessuno"}
- Spesa: ${whoShops || "?"}, ${shoppingFrequency || "?"}, cucina: ${whoCooks || "?"}
- Allergie: ${(allergies || []).join(", ") || "nessuna"}
- Dieta: ${(dietaryRestrictions || []).join(", ") || "nessuna preferenza"}
- Farmaci regolari: ${hasMedications ? "sì" : "no"}
- Sport/hobby: ${(activities || []).join(", ") || "nessuno indicato"}
- Budget mensile: ${monthlyBudget || "non specificato"}
- Principali spese: ${(mainExpenseCategories || []).join(", ") || "non specificate"}
- Vuole migliorare: ${(goals || []).join(", ") || "non specificato"}
      `.trim();

      const insight = await callClaude(prompt, 300);

      if (insight) {
        await saveInsight(a.familyId, "onboarding_welcome", insight, "info");
      }

      // Mark onboarding as completed
      await db
        .update(profiles)
        .set({ onboardingCompleted: true } as any)
        .where(eq(profiles.id, a.profileId));

      const updatedProfile = await storage.getProfileById(a.profileId);
      res.json({ profile: updatedProfile ? safe(updatedProfile) : null, insight });
    } catch (e: any) {
      res.status(500).json({ message: e.message });
    }
  });
}
