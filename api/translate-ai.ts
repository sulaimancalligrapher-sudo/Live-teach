import {
  setCorsHeaders,
  parseBody,
  getGeminiClient,
  translateWithHttpFallbacks,
} from './_shared.ts';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { text, targetLang } = parseBody(req);
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const safeLang: 'th' | 'en' = targetLang === 'th' ? 'th' : 'en';
    const langName = safeLang === 'th' ? 'Thai' : 'English';
    const ai = getGeminiClient();

    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Translate the following educational text from Arabic to natural, idiomatic ${langName}. Return ONLY the direct translation text with no markdown, quotes, or conversational explanations:\n\n${text}`,
        });
        const translated = (response.text || '').trim().replace(/^["']|["']$/g, '');
        if (translated && translated !== text) {
          return res.status(200).json({ success: true, translated, engine: 'gemini' });
        }
      } catch (err: any) {
        console.warn('Vercel translate-ai Gemini error:', err?.message || err);
      }
    }

    const fallback = await translateWithHttpFallbacks(text, safeLang);
    if (fallback) {
      return res.status(200).json({ success: true, translated: fallback, engine: 'http-fallback' });
    }

    return res.status(200).json({ success: false, error: 'Translation unavailable' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
}
