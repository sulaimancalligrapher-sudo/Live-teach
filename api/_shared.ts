import { GoogleGenAI } from '@google/genai';

export function setCorsHeaders(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

export function parseBody(req: any): Record<string, any> {
  if (!req || req.body === undefined || req.body === null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  return typeof req.body === 'object' ? req.body : {};
}

export function cleanJsonText(raw: string): string {
  return String(raw || '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

export function getGeminiClient(): GoogleGenAI | null {
  const env = (globalThis as any).process?.env || {};
  const apiKey = env.GEMINI_API_KEY || env.VITE_GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: { 'User-Agent': 'aistudio-build' },
    },
  });
}

export async function translateViaGoogleFree(
  text: string,
  targetLang: 'th' | 'en'
): Promise<string | null> {
  try {
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=ar&tl=${targetLang}&dt=t&q=${encodeURIComponent(
      text.slice(0, 800)
    )}`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; aistudio-build/1.0)' },
    });
    if (!r.ok) return null;
    const json: any = await r.json();
    if (Array.isArray(json?.[0])) {
      const joined = json[0]
        .map((seg: any) => seg?.[0] || '')
        .join('')
        .trim();
      if (joined && joined !== text) return joined;
    }
    return null;
  } catch {
    return null;
  }
}

export async function translateViaMyMemory(
  text: string,
  targetLang: 'th' | 'en'
): Promise<string | null> {
  try {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(
      text.slice(0, 500)
    )}&langpair=ar|${targetLang}`;
    const r = await fetch(url);
    if (!r.ok) return null;
    const json: any = await r.json();
    const candidate = String(json?.responseData?.translatedText || '').trim();
    if (
      candidate &&
      candidate !== text &&
      !candidate.toUpperCase().includes('MYMEMORY WARNING')
    ) {
      return candidate;
    }
    return null;
  } catch {
    return null;
  }
}

export async function translateWithHttpFallbacks(
  text: string,
  targetLang: 'th' | 'en'
): Promise<string> {
  const g = await translateViaGoogleFree(text, targetLang);
  if (g) return g;
  const mm = await translateViaMyMemory(text, targetLang);
  if (mm) return mm;
  return '';
}
