import { db } from "../db";
import { aiCache, aiInsights } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
// Standard model for routine AI calls (summaries, suggestions, etc.)
const MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";
// Premium model for complex reasoning tasks (spending forecast, study plans, narratives)
const MODEL_PREMIUM = process.env.CLAUDE_PREMIUM_MODEL ?? "claude-opus-4-5";

export async function callClaude(prompt: string, maxTokens = 800, usePremium = false): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.warn("[AI] CLAUDE_API_KEY not set — returning null");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const res = await fetch(CLAUDE_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: usePremium ? MODEL_PREMIUM : MODEL,
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[AI] Claude API error:", res.status, err);
      return null;
    }

    const data = await res.json() as any;
    return data?.content?.[0]?.text ?? null;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn("[AI] Claude call timed out");
      return null;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Multi-turn conversation call to Claude API.
 * Accepts a system prompt and an array of messages with roles.
 */
export async function callClaudeConversation(
  systemPrompt: string,
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  maxTokens = 1200,
  usePremium = false
): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    console.warn("[AI] CLAUDE_API_KEY not set — returning null");
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  try {
    const res = await fetch(CLAUDE_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: usePremium ? MODEL_PREMIUM : MODEL,
        max_tokens: maxTokens,
        system: systemPrompt,
        messages,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error("[AI] Claude conversation API error:", res.status, err);
      return null;
    }

    const data = (await res.json()) as any;
    return data?.content?.[0]?.text ?? null;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.warn("[AI] Claude conversation call timed out");
      return null;
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

export async function callClaudeVision(
  prompt: string,
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg",
  maxTokens = 1500
): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) { console.warn("[AI] CLAUDE_API_KEY not set"); return null; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const res = await fetch(CLAUDE_API, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: maxTokens,
        messages: [{
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
            { type: "text", text: prompt },
          ],
        }],
      }),
    });
    if (!res.ok) { console.error("[AI] Vision error:", res.status, await res.text()); return null; }
    const data = await res.json() as any;
    return data?.content?.[0]?.text ?? null;
  } catch (err: any) {
    if (err.name === "AbortError") { console.warn("[AI] Vision call timed out"); return null; }
    throw err;
  } finally { clearTimeout(timeout); }
}

export function parseJSON<T = any>(text: string | null): T | null {
  if (!text) return null;
  // Try direct parse first
  try { return JSON.parse(text.trim()) as T; } catch {}
  // Try extracting from code block
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) { try { return JSON.parse(codeBlock[1].trim()) as T; } catch {} }
  // Balanced brace finder
  const starts = [text.indexOf("{"), text.indexOf("[")].filter(i => i >= 0);
  if (!starts.length) return null;
  const start = Math.min(...starts);
  const open = text[start] === "{" ? "{" : "[";
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === open) depth++;
    else if (text[i] === close) { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)) as T; } catch {} break; } }
  }
  return null;
}

export async function getCached<T = any>(familyId: string, feature: string, maxAgeHours = 6): Promise<T | null> {
  const [row] = await db
    .select()
    .from(aiCache)
    .where(and(eq(aiCache.familyId, familyId), eq(aiCache.feature, feature)))
    .orderBy(desc(aiCache.generatedAt))
    .limit(1);

  if (!row) return null;
  const ageHours = (Date.now() - new Date(row.generatedAt).getTime()) / 3_600_000;
  if (ageHours >= maxAgeHours) return null;
  try { return JSON.parse(row.resultJson) as T; } catch { return null; }
}

export async function saveCache(familyId: string, feature: string, result: any): Promise<void> {
  const resultJson = JSON.stringify(result);
  const now = new Date();
  // Fix #9: Check by ID to avoid race condition
  const [existing] = await db.select({ id: aiCache.id }).from(aiCache)
    .where(and(eq(aiCache.familyId, familyId), eq(aiCache.feature, feature))).limit(1);
  if (existing) {
    await db.update(aiCache).set({ resultJson, generatedAt: now }).where(eq(aiCache.id, existing.id));
  } else {
    try {
      await db.insert(aiCache).values({ familyId, feature, resultJson });
    } catch (e: any) {
      if (e.code === "23505" || e.message?.includes("duplicate")) {
        await db.update(aiCache).set({ resultJson, generatedAt: now })
          .where(and(eq(aiCache.familyId, familyId), eq(aiCache.feature, feature)));
      } else throw e;
    }
  }
}

export async function saveInsight(familyId: string, type: string, message: string, severity: "info" | "warning" | "error" = "info"): Promise<void> {
  await db.insert(aiInsights).values({ familyId, type, message, severity });
}
