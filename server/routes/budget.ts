import type { Express, Request, Response } from "express";
import { storage } from "../storage";
import { requireAuth } from "../lib/requireAuth";

export function registerBudgetRoutes(app: Express): void {
  // ─── BUDGET CATEGORIES ─────────────────────────────────────────────────────
  app.get("/api/budget/categories", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { res.json(await storage.getBudgetCategories(a.familyId)); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/budget/categories", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { name, budgetAmount, color, icon } = req.body;
      if (!name) return res.status(400).json({ message: "Name required" });
      const cat = await storage.createBudgetCategory({
        familyId: a.familyId, name,
        budgetAmount: budgetAmount ?? 0,
        color: color || "#3B82F6",
        icon: icon || "wallet",
      });
      res.json(cat);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.patch("/api/budget/categories/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      await storage.updateBudgetCategory(req.params.id, a.familyId, req.body);
      res.json({ ok: true });
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/budget/categories/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteBudgetCategory(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  // ─── EXPENSES ──────────────────────────────────────────────────────────────
  app.get("/api/budget/expenses", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);
      const offset = parseInt(req.query.offset as string) || 0;
      const from = req.query.from ? new Date(req.query.from as string) : undefined;
      const to = req.query.to ? new Date(req.query.to as string) : undefined;
      const all = await storage.getExpensesByFamily(a.familyId, from, to);
      res.json(all.slice(offset, offset + limit));
    }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.post("/api/budget/expenses", requireAuth, async (req, res) => {
    const a = req.auth!;
    try {
      const { title, amount, categoryId, date, notes } = req.body;
      if (!title || amount === undefined) return res.status(400).json({ message: "Title and amount required" });
      const expense = await storage.createExpense({
        familyId: a.familyId, title, amount: String(parseFloat(amount)),
        categoryId: categoryId || null,
        date: date ? new Date(date) : new Date(),
        addedBy: a.profileId,
        notes: notes || null,
      });
      res.json(expense);
    } catch (e: any) { res.status(500).json({ message: e.message }); }
  });

  app.delete("/api/budget/expenses/:id", requireAuth, async (req, res) => {
    const a = req.auth!;
    try { await storage.deleteExpense(req.params.id, a.familyId); res.json({ ok: true }); }
    catch (e: any) { res.status(500).json({ message: e.message }); }
  });
}
