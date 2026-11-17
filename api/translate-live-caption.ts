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
    const { text } = parseBody(req);
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const ai = getGeminiClient();
    if (ai) {
      try {
        const response = await ai.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents: `Translate this spoken Arabic educational sentence into natural, idiomatic Thai and English. Return ONLY a strict JSON object with keys "th" and "en" without markdown formatting or conversational text. Example: {"th": "...", "en": "..."}\n\nArabic: "${text}"`,
          config: { responseMimeType: 'application/json' },
        });
        const parsed = JSON.parse(cleanJsonText(response.text || '{}'));
        if (parsed.th || parsed.en) {
          return res.status(200).json({
            success: true,
            th: String(parsed.th || '').trim(),
            en: String(parsed.en || '').trim(),
            engine: 'gemini',
          });
        }
      } catch (err: any) {
        console.warn('Vercel translate-live-caption Gemini error:', err?.message || err);
      }
    }

    const [th, en] = await Promise.all([
      translateWithHttpFallbacks(text, 'th'),
      translateWithHttpFallbacks(text, 'en'),
    ]);

    return res.status(200).json({
      success: Boolean(th || en),
      th,
      en,
      engine: 'http-fallback',
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err?.message || 'Server error' });
  }
}
