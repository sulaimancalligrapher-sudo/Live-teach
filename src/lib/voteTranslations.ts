import { VoteExtraGroup, VoteI18nMap, VoteOption } from '../types';
import { Language } from '../translations';
import { translateBatchWithAi } from '../api';

export const BUILTIN_VOTE_PHRASES: Record<string, { th: string; en: string }> = {
  // Default Questions
  'هل الشرح واضح ومفهوم؟': {
    th: 'คำอธิบายชัดเจนและเข้าใจง่ายหรือไม่?',
    en: 'Is the explanation clear and easy to understand?',
  },
  'هل ننتقل للفقرة التالية؟': {
    th: 'เราควรไปหัวข้อถัดไปเลยหรือไม่?',
    en: 'Should we move on to the next section?',
  },
  'اختر الجنس للتقييم الصحيح': {
    th: 'เลือกเพศเพื่อการประเมินที่ถูกต้อง',
    en: 'Select gender for accurate evaluation',
  },
  'ما تقييمكم للدرس والتمرين؟': {
    th: 'คุณประเมินบทเรียนและแบบฝึกหัดนี้อย่างไร?',
    en: 'How do you rate this lesson and exercise?',
  },
  'هل الصوت والصورة واضحان؟': {
    th: 'เสียงและภาพชัดเจนหรือไม่?',
    en: 'Are the audio and video clear?',
  },
  'هل توافقون على هذا المقترح؟': {
    th: 'คุณเห็นด้วยกับข้อเสนอนี้หรือไม่?',
    en: 'Do you agree with this proposal?',
  },

  // Default Option Sets & Labels
  'نعم / لا': { th: 'ใช่ / ไม่ใช่', en: 'Yes / No' },
  'نعم': { th: 'ใช่', en: 'Yes' },
  'لا': { th: 'ไม่ใช่', en: 'No' },
  'موافق / غير موافق': { th: 'เห็นด้วย / ไม่เห็นด้วย', en: 'Agree / Disagree' },
  'موافق': { th: 'เห็นด้วย', en: 'Agree' },
  'غير موافق': { th: 'ไม่เห็นด้วย', en: 'Disagree' },
  'واضح / أعد الشرح': { th: 'เข้าใจแล้ว / อธิบายอีกครั้ง', en: 'Clear / Explain Again' },
  'واضح': { th: 'เข้าใจแล้ว', en: 'Clear' },
  'أعد الشرح': { th: 'อธิบายอีกครั้ง', en: 'Explain Again' },
  'ممتاز / جيد / يحتاج تحسين': { th: 'ดีเยี่ยม / ดี / ควรปรับปรุง', en: 'Excellent / Good / Needs Improvement' },
  'ممتاز': { th: 'ดีเยี่ยม', en: 'Excellent' },
  'جيد': { th: 'ดี', en: 'Good' },
  'يحتاج تحسين': { th: 'ควรปรับปรุง', en: 'Needs Improvement' },

  // Default Extra Detail Groups & Items
  'ذكر / أنثى': { th: 'ชาย / หญิง', en: 'Male / Female' },
  'ذكر': { th: 'ชาย', en: 'Male' },
  'أنثى': { th: 'หญิง', en: 'Female' },
  'العمر (صغير / كبير)': { th: 'อายุ (เด็ก / ผู้ใหญ่)', en: 'Age (Young / Adult)' },
  'صغير': { th: 'เด็ก', en: 'Young' },
  'كبير': { th: 'ผู้ใหญ่', en: 'Adult' },
  'العمر (إضافة عدد)': { th: 'อายุ (กรอกตัวเลข)', en: 'Age (Enter Number)' },
  'العمر': { th: 'อายุ', en: 'Age' },
  'ذكر / أنثى + العمر (عدد)': { th: 'ชาย / หญิง + อายุ (ตัวเลข)', en: 'Male / Female + Age (Number)' },
};

const runtimeVoteTextCache: Record<'th' | 'en', Record<string, string>> = {
  th: {},
  en: {},
};

export function sanitizeI18nMap(raw: any): VoteI18nMap | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: VoteI18nMap = {};
  if (typeof raw.ar === 'string' && raw.ar.trim()) out.ar = raw.ar.trim();
  if (typeof raw.th === 'string' && raw.th.trim()) out.th = raw.th.trim();
  if (typeof raw.en === 'string' && raw.en.trim()) out.en = raw.en.trim();
  return Object.keys(out).length > 0 ? out : undefined;
}

export function getLocalizedVoteText(
  arText: string,
  lang: Language,
  i18n?: VoteI18nMap
): string {
  const clean = String(arText || '').trim();
  if (!clean) return '';
  if (lang === 'ar') return i18n?.ar || clean;

  if (i18n && i18n[lang] && String(i18n[lang]).trim()) {
    return String(i18n[lang]).trim();
  }
  const builtin = BUILTIN_VOTE_PHRASES[clean];
  if (builtin && builtin[lang]) {
    return builtin[lang];
  }
  const cached = runtimeVoteTextCache[lang][clean];
  if (cached) return cached;

  return clean;
}

function buildI18nForText(
  sourceText: string,
  existing?: VoteI18nMap,
  fetched?: { th?: string; en?: string }
): VoteI18nMap {
  const clean = sourceText.trim();
  const builtin = BUILTIN_VOTE_PHRASES[clean];
  return {
    ar: existing?.ar || clean,
    ...(existing?.th || fetched?.th || builtin?.th
      ? { th: (existing?.th || fetched?.th || builtin?.th || '').trim() }
      : {}),
    ...(existing?.en || fetched?.en || builtin?.en
      ? { en: (existing?.en || fetched?.en || builtin?.en || '').trim() }
      : {}),
  };
}

function needsTranslation(text: string, i18n?: VoteI18nMap): boolean {
  const clean = text.trim();
  if (!clean || /^\d+$/.test(clean)) return false;
  if (BUILTIN_VOTE_PHRASES[clean]) return false;
  if (i18n?.th && i18n?.en) return false;
  if (runtimeVoteTextCache.th[clean] && runtimeVoteTextCache.en[clean]) return false;
  return true;
}

async function fetchMissingBatchTranslations(
  texts: string[]
): Promise<Record<string, { th: string; en: string }>> {
  const unique = Array.from(new Set(texts.map((t) => t.trim()).filter(Boolean)));
  if (unique.length === 0) return {};

  const items = unique.map((ar, idx) => ({ key: `vt_${idx}`, ar }));
  try {
    const rawMap = await Promise.race([
      translateBatchWithAi(items),
      new Promise<Record<string, { th: string; en: string }>>((resolve) =>
        setTimeout(() => resolve({}), 4000)
      ),
    ]);
    const out: Record<string, { th: string; en: string }> = {};
    items.forEach((it) => {
      const tr = rawMap?.[it.key];
      if (tr && (tr.th || tr.en)) {
        out[it.ar] = {
          th: (tr.th || '').trim(),
          en: (tr.en || '').trim(),
        };
        if (tr.th) runtimeVoteTextCache.th[it.ar] = tr.th.trim();
        if (tr.en) runtimeVoteTextCache.en[it.ar] = tr.en.trim();
      }
    });
    return out;
  } catch {
    return {};
  }
}

/**
 * Translates all variable poll texts (question, primary buttons, extra groups & items)
 * ONCE at launch / preset save time so every device renders TH/EN immediately with zero delay.
 */
export async function translatePollPackageOnce(params: {
  question: string;
  questionI18n?: VoteI18nMap;
  options: VoteOption[];
  extraGroups: VoteExtraGroup[];
}): Promise<{
  questionI18n: VoteI18nMap;
  options: VoteOption[];
  extraGroups: VoteExtraGroup[];
}> {
  const missingTexts: string[] = [];

  if (needsTranslation(params.question, params.questionI18n)) {
    missingTexts.push(params.question);
  }
  params.options.forEach((opt) => {
    if (needsTranslation(opt.label, opt.i18n)) {
      missingTexts.push(opt.label);
    }
  });
  params.extraGroups.forEach((grp) => {
    if (needsTranslation(grp.name, grp.nameI18n)) {
      missingTexts.push(grp.name);
    }
    grp.items.forEach((it) => {
      if (needsTranslation(it.label, it.i18n)) {
        missingTexts.push(it.label);
      }
    });
  });

  const fetched = await fetchMissingBatchTranslations(missingTexts);

  const getCachedOrFetched = (txt: string) => {
    const c = txt.trim();
    return (
      fetched[c] || {
        th: runtimeVoteTextCache.th[c] || '',
        en: runtimeVoteTextCache.en[c] || '',
      }
    );
  };

  return {
    questionI18n: buildI18nForText(
      params.question,
      params.questionI18n,
      getCachedOrFetched(params.question)
    ),
    options: params.options.map((opt) => ({
      ...opt,
      i18n: buildI18nForText(opt.label, opt.i18n, getCachedOrFetched(opt.label)),
    })),
    extraGroups: params.extraGroups.map((grp) => ({
      ...grp,
      nameI18n: buildI18nForText(grp.name, grp.nameI18n, getCachedOrFetched(grp.name)),
      items: grp.items.map((it) => ({
        ...it,
        i18n: buildI18nForText(it.label, it.i18n, getCachedOrFetched(it.label)),
      })),
    })),
  };
}
