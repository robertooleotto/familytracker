import type { Express, Request, Response } from "express";
import { requireAuth } from "../lib/requireAuth";

import { storage } from "../storage";
import { callClaude, callClaudeVision, parseJSON } from "../ai/aiEngine";

export function registerKitchenRoutes(app: Express): void {
  app.get("/api/kitchen/preferences", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getFoodPreferences(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.put("/api/kitchen/preferences", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { profileId, likes, dislikes, allergies, dietaryRestrictions } = req.body;
      const result = await storage.upsertFoodPreferences(a.familyId, profileId || null, { likes, dislikes, allergies, dietaryRestrictions });
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/kitchen/scan", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { imageBase64, mediaType = "image/jpeg", mode = "recipes" } = req.body;
      if (!imageBase64) return res.status(400).json({ message: "imageBase64 obbligatorio" });

      const prefs = await storage.getFoodPreferences(a.familyId);
      const shopping = await storage.getShoppingItems(a.familyId);
      const boughtItems = shopping.map((s: any) => s.name).join(", ") || "nessuno";

      const allergiesInfo = prefs.flatMap(p => p.allergies || []).filter(Boolean).join(", ") || "nessuna";
      const dislikesInfo = prefs.flatMap(p => p.dislikes || []).filter(Boolean).join(", ") || "nessuno";

      let prompt: string;
      if (mode === "missing") {
        prompt = `Analizza questa foto del frigo/dispensa.
Prodotti che la famiglia acquista abitualmente: ${boughtItems}.
Allergie/intolleranze: ${allergiesInfo}.

Identifica cosa manca rispetto agli acquisti abituali. Rispondi SOLO con questo JSON (nessun testo prima o dopo):
{"missingItems": [{"name": "...", "category": "...", "priority": "alta|media|bassa", "reason": "..."}], "detectedItems": ["item1", "item2"]}`;
      } else {
        prompt = `Analizza questa foto del frigo/dispensa.
Allergie/intolleranze da evitare: ${allergiesInfo}.
Ingredienti da evitare: ${dislikesInfo}.

Identifica tutti gli ingredienti visibili e proponi 3 ricette creative che si possono preparare con ciò che c'è. Rispondi SOLO con questo JSON (nessun testo prima o dopo):
{"detectedIngredients": ["ing1", "ing2"], "recipes": [{"name": "...", "time": "...", "difficulty": "facile|media|difficile", "ingredients": ["..."], "steps": ["..."], "emoji": "🍝"}]}`;
      }

      const raw = await callClaudeVision(prompt, imageBase64, mediaType, 1500);
      if (!raw) return res.status(503).json({ message: "AI temporaneamente non disponibile" });
      const result = parseJSON(raw);
      if (!result) return res.status(500).json({ message: "Risposta AI non valida", raw });
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/kitchen/menu", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const prefs = await storage.getFoodPreferences(a.familyId);
      const members = await storage.getFamilyMembers(a.familyId);
      const shopping = await storage.getShoppingItems(a.familyId);
      const availableItems = shopping.filter((s: any) => !s.checked).map((s: any) => s.name).join(", ") || "nessuno";

      const allergies = prefs.flatMap(p => p.allergies || []).filter(Boolean);
      const dislikes = prefs.flatMap(p => p.dislikes || []).filter(Boolean);
      const likes = prefs.flatMap(p => p.likes || []).filter(Boolean);
      const dietary = prefs.flatMap(p => p.dietaryRestrictions || []).filter(Boolean);
      const names = members.map((m: any) => m.name.split(" ")[0]).join(", ");

      const prompt = `Sei uno chef italiano che crea menu settimanali per famiglie.
Famiglia: ${names} (${members.length} persone).
Piatti preferiti: ${likes.join(", ") || "nessuna preferenza"}.
Allergie/intolleranze: ${allergies.join(", ") || "nessuna"}.
Da evitare: ${dislikes.join(", ") || "nessuno"}.
Restrizioni dietetiche: ${dietary.join(", ") || "nessuna"}.
Ingredienti già disponibili: ${availableItems}.

Crea un menu per 7 giorni (pranzo e cena per ogni giorno) bilanciato e vario, usando ingredienti stagionali italiani. Rispondi SOLO con questo JSON:
{"week": [{"day": "Lunedì", "lunch": {"name": "...", "time": "...", "emoji": "🍝"}, "dinner": {"name": "...", "time": "...", "emoji": "🍖"}}]}`;

      const raw = await callClaude(prompt, 2000);
      if (!raw) return res.status(503).json({ message: "AI temporaneamente non disponibile" });
      const result = parseJSON(raw);
      if (!result) return res.status(500).json({ message: "Risposta AI non valida" });
      res.json(result);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
