import { callClaudeVision, parseJSON } from "../aiEngine";

interface ScannedReceipt {
  store: string | null;
  date: string | null;
  items: Array<{ name: string; amount: number; quantity?: number }>;
  total: number;
  category_suggestion: string | null;
}

export async function scanReceipt(
  imageBase64: string,
  mediaType: "image/jpeg" | "image/png" | "image/webp" = "image/jpeg"
): Promise<ScannedReceipt | null> {
  const prompt = `Analizza questa foto di uno scontrino/ricevuta e estrai le informazioni.
Rispondi SOLO in JSON valido, senza testo aggiuntivo né markdown.

Esempio di risposta corretta:
{"store":"Conad","date":"2026-04-08","items":[{"name":"Latte intero","amount":1.49,"quantity":2},{"name":"Pane integrale","amount":2.30}],"total":5.28,"category_suggestion":"Alimentari"}

Se la foto non è leggibile o non è uno scontrino, rispondi:
{"store":null,"date":null,"items":[],"total":0,"category_suggestion":null}

Analizza lo scontrino e rispondi con lo stesso formato JSON:`;

  const raw = await callClaudeVision(prompt, imageBase64, mediaType, 1000);
  return parseJSON<ScannedReceipt>(raw);
}
