import { setCorsHeaders, parseBody, getGeminiClient } from './_shared.ts';

export default async function handler(req: any, res: any) {
  setCorsHeaders(res);
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { text, lang } = parseBody(req);
    if (!text || typeof text !== 'string' || !text.trim()) {
      return res.status(400).json({ success: false, error: 'Text is required' });
    }

    const safeLang: 'ar' | 'th' | 'en' =
      lang === 'th' ? 'th' : lang === 'en' ? 'en' : 'ar';
    const cleanText = text.trim().slice(0, 600);

    const ai = getGeminiClient();
    if (ai) {
      try {
        const langLabel =
          safeLang === 'th' ? 'Thai' : safeLang === 'en' ? 'English' : 'Arabic';
        const response = await ai.models.generateContent({
          model: 'gemini-3.8-flash-lite-tts',
          contents: [
            {
              parts: [
                {
                  text: `Read the following ${langLabel} sentence clearly and naturally at a comfortable classroom pace:\n\n${cleanText}`,
                },
              ],
            },
          ],
          config: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: 'Kore' },
              },
            },
          },
        });
        const inlineData = response.candidates?.[0]?.content?.parts?.[0]?.inlineData;
        if (inlineData?.data) {
          const mime = inlineData.mimeType || 'audio/wav';
          return res.status(200).json({
            success: true,
            audioDataUrl: `data:${mime};base64,${inlineData.data}`,
            source: 'gemini-tts',
          });
        }
      } catch (err: any) {
        console.warn('Vercel TTS Gemini error:', err?.message || err);
      }
    }

    try {
      const gttsChunk = cleanText.slice(0, 200);
      const gttsUrl = `https://translate.googleapis.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${safeLang}&q=${encodeURIComponent(
        gttsChunk
      )}`;
      const audioRes = await fetch(gttsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; aistudio-build/1.0)',
        },
      });
      if (audioRes.ok) {
        const arrBuf = await audioRes.arrayBuffer();
        if (arrBuf.byteLength > 256) {
          const b64 = (globalThis as any).Buffer
            ? (globalThis as any).Buffer.from(arrBuf).toString('base64')
            : '';
          if (b64) {
            return res.status(200).json({
              success: true,
              audioDataUrl: `data:audio/mpeg;base64,${b64}`,
              source: 'google-tts',
            });
          }
        }
      }
    } catch {}

    return res.status(200).json({ success: false, fallback: 'browser' });
  } catch (err: any) {
    return res.status(200).json({ success: false, fallback: 'browser' });
  }
}
