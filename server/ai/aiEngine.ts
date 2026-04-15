import { db } from "../db";
import { aiCache, aiInsights } from "@shared/schema";
import { and, eq, desc } from "drizzle-orm";
import { logWarn, logError } from "../lib/logger";

// ─── Type definitions ───────────────────────────────────────────────────────
interface ClaudeApiResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
  error?: {
    type: string;
    message: string;
  };
}

interface ClaudeConversationResponse {
  content: Array<{
    type: string;
    text?: string;
  }>;
}

const CLAUDE_API = "https://api.anthropic.com/v1/messages";
// Standard model for routine AI calls (summaries, suggestions, etc.)
const MODEL = process.env.CLAUDE_MODEL ?? "claude-haiku-4-5-20251001";
// Premium model for complex reasoning tasks (spending forecast, study plans, narratives)
const MODEL_PREMIUM = process.env.CLAUDE_PREMIUM_MODEL ?? "claude-opus-4-5";

export async function callClaude(prompt: string, maxTokens = 800, usePremium = false): Promise<string | null> {
  const apiKey = process.env.CLAUDE_API_KEY;
  if (!apiKey) {
    logWarn("CLAUDE_API_KEY not set — returning null");
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
      logError("Claude API error", { status: res.status, error: String(err) });
      return null;
    }

    const data = await res.json() as ClaudeApiResponse;
    return data?.content?.[0]?.text ?? null;
  } catch (err: any) {
    if (err.name === "AbortError") {
      logWarn("Claude call timed out");
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
    logWarn("CLAUDE_API_KEY not set — returning null");
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
      logError("Claude conversation API error", { status: res.status, error: String(err) });
      return null;
    }

    const data = (await res.json()) as ClaudeConversationResponse;
    return data?.content?.[0]?.text ?? null;
  } catch (err: any) {
    if (err.name === "AbortError") {
      logWarn("Claude conversation call timed out");
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
    if (!res.ok) { logError("Vision error", { status: res.status }); return null; }
    const data = await res.json() as ClaudeApiResponse;
    return data?.content?.[0]?.text ?? null;
  } catch (err: any) {
    if (err.name === "AbortError") { logWarn("Vision call timed out"); return null; }
    throw err;
  } finally { clearTimeout(timeout); }
}

export function parseJSON<T = Record<string, unknown>>(text: string | null): T | null {
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

export async function saveCache<T = Record<string, unknown>>(familyId: string, feature: string, result: T): Promise<void> {
  const resultJson = JSON.stringify(result);
  const now = new Date();

  // SECURITY: Use atomic UPSERT to prevent race conditions with concurrent requests
  // If a row with (familyId, feature) exists, update it; otherwise insert a new row
  await db
    .insert(aiCache)
    .values({ familyId, feature, resultJson, generatedAt: now })
    .onConflictDoUpdate({
      target: [aiCache.familyId, aiCache.feature],
      set: { resultJson, generatedAt: now }
    });
}

export async function saveInsight(
  familyId: string,
  type: string,
  message: string,
  severity: "info" | "warning" | "error" = "info",
  metadata?: Record<string, unknown>,
): Promise<void> {
  await db.insert(aiInsights).values({ familyId, type, message, severity, metadata: metadata ?? null });
}
