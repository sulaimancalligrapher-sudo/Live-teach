import {
  setCorsHeaders,
  parseBody,
  cleanJsonText,
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
    const { items } = parseBody(req);
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'Items array required' });
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const prompt = `Translate each of the following Arabic educational phrases into natural Thai (th) and English (en).
Return ONLY a valid JSON object matching this exact schema (use the exact "key" values provided):
{
  "keyName": { "th": "Thai translation", "en": "English translation" }
}

Input items:
${JSON.stringify(items.map((i: any) => ({ key: String(i.key), ar: String(i.ar || '') })))}
`;
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: prompt,
          config: { responseMimeType: 'application/json' },
        });
        const parsed = JSON.parse(cleanJsonText(response.text || '{}'));
        if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
          return res.status(200).json({
            success: true,
            translations: parsed,
            engine: 'gemini',
          });
        }
      } catch (err: any) {
        console.warn('Vercel translate-batch Gemini error:', err?.message || err);
      }
    }

    const fallbackTranslations: Record<string, { th: string; en: string }> = {};
    await Promise.all(
      items.map(async (item: any) => {
        const src = String(item.ar || item.key || '').trim();
        if (!src) return;
        const [th, en] = await Promise.all([
          translateWithHttpFallbacks(src, 'th'),
          translateWithHttpFallbacks(src, 'en'),
        ]);
        fallbackTranslations[String(item.key)] = { th, en };
      })
    );

    return res.status(200).json({
      success: true,
      translations: fallbackTranslations,
      engine: 'http-fallback',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
}
