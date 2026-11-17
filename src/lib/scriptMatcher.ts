import { ScriptSubtitleLine, normalizeArabicText } from '../types';

const ARABIC_STOPWORDS = new Set([
  'في', 'من', 'على', 'الي', 'عن', 'مع', 'بين', 'عند', 'حتي', 'منذ', 'خلال',
  'هذا', 'هذه', 'هؤلاء', 'ذلك', 'تلك', 'اولئك', 'الذي', 'التي', 'الذين', 'اللواتي',
  'هو', 'هي', 'هم', 'هن', 'انت', 'انتم', 'نحن', 'انا',
  'ان', 'انه', 'انها', 'كان', 'كانت', 'يكون', 'تكون', 'ليس', 'ليست',
  'او', 'ام', 'ثم', 'بل', 'لكن', 'لذلك', 'لان', 'اذا', 'لو', 'قد', 'لقد',
  'ما', 'لا', 'لم', 'لن', 'نعم', 'يا', 'ايها', 'كل', 'بعض', 'غير', 'مثل',
  'يعني', 'طيب', 'الان', 'هنا', 'هناك', 'ايضا', 'جدا', 'فقط', 'بعد', 'قبل',
]);

/**
 * Normalizes Arabic text for fuzzy speech matching:
 * Removes diacritics, normalizes letters, removes punctuation, collapses whitespace.
 */
export function normalizeForSpeechMatch(input: string): string {
  if (!input) return '';
  let text = normalizeArabicText(input);
  // Normalize waw/yaa hamza and remove extra symbols
  text = text
    .replace(/[ؤ]/g, 'و')
    .replace(/[ئ]/g, 'ي')
    .replace(/[ء]/g, '')
    .replace(/[^\u0600-\u06FFa-zA-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return text;
}

/**
 * Extracts significant content tokens (anchors) plus normalized full token list.
 */
export function tokenizeArabicSpeech(input: string): {
  allTokens: string[];
  anchorTokens: string[];
} {
  const norm = normalizeForSpeechMatch(input);
  if (!norm) return { allTokens: [], anchorTokens: [] };

  const allTokens = norm
    .split(' ')
    .map((w) => w.trim())
    .filter((w) => w.length >= 2);

  const anchorTokens = allTokens.filter((w) => {
    const bare = stripCommonPrefixes(w);
    return !ARABIC_STOPWORDS.has(w) && !ARABIC_STOPWORDS.has(bare) && bare.length >= 2;
  });

  return {
    allTokens,
    anchorTokens: anchorTokens.length > 0 ? anchorTokens : allTokens,
  };
}

function stripCommonPrefixes(word: string): string {
  let w = word;
  // Strip single coordinating conjunction + definite article safely when length permits
  if (w.length > 4 && (w.startsWith('وال') || w.startsWith('بال') || w.startsWith('كال') || w.startsWith('فال') || w.startsWith('لل'))) {
    return w.slice(w.startsWith('لل') ? 2 : 3);
  }
  if (w.length > 4 && w.startsWith('ال')) {
    return w.slice(2);
  }
  if (w.length > 3 && (w.startsWith('و') || w.startsWith('ب') || w.startsWith('ف') || w.startsWith('ل'))) {
    return w.slice(1);
  }
  return w;
}

function tokensMatch(spokenToken: string, scriptToken: string): number {
  if (spokenToken === scriptToken) return 1.0;

  const sBare = stripCommonPrefixes(spokenToken);
  const tBare = stripCommonPrefixes(scriptToken);
  if (sBare === tBare && sBare.length >= 2) return 0.95;

  // Partial stem / morphological overlap for words >= 4 chars
  if (sBare.length >= 4 && tBare.length >= 4) {
    if (sBare.includes(tBare) || tBare.includes(sBare)) return 0.8;
    // Quick prefix similarity (first 4 letters match e.g. verb conjugation)
    if (sBare.slice(0, 4) === tBare.slice(0, 4) && Math.abs(sBare.length - tBare.length) <= 2) {
      return 0.72;
    }
  }

  // Light Levenshtein distance <= 1 for 5+ char words (minor ASR typos)
  if (sBare.length >= 5 && Math.abs(sBare.length - tBare.length) <= 1) {
    if (editDistanceAtMostOne(sBare, tBare)) return 0.75;
  }

  return 0;
}

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let diffs = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
    } else {
      diffs++;
      if (diffs > 1) return false;
      if (a.length > b.length) i++;
      else if (b.length > a.length) j++;
      else {
        i++;
        j++;
      }
    }
  }
  if (i < a.length || j < b.length) diffs++;
  return diffs <= 1;
}

export interface ScriptMatchResult {
  matchedLine: ScriptSubtitleLine | null;
  confidence: number;
  matchedKeywords: string[];
  reason: 'next' | 'forward' | 'current' | 'jump' | 'none';
}

/**
 * Matches latest spoken transcript against script lines with forward progression bias.
 * Key behaviors guaranteed:
 * - Speaking >= 2 keywords from a line switches to that ENTIRE line (displaying full pre-translated line).
 * - If teacher stops midway in Line 1 and starts Line 2, the recent-words sliding window shifts focus to Line 2 immediately.
 * - Filters strictly to active PDF page first (if lines exist for that page).
 */
export function matchSpokenTranscriptToScript(params: {
  transcript: string;
  lines: ScriptSubtitleLine[];
  activePage: number;
  currentLineId?: string;
  activeLessonTitle?: string;
}): ScriptMatchResult {
  const { transcript, lines, activePage, currentLineId, activeLessonTitle } = params;
  if (!transcript || !lines || lines.length === 0) {
    return { matchedLine: null, confidence: 0, matchedKeywords: [], reason: 'none' };
  }

  // 1. Filter lines by active lesson (if specified and matches) and active PDF page
  let pool = lines;
  if (activeLessonTitle && activeLessonTitle.trim()) {
    const byLesson = lines.filter(
      (l) => !l.lessonTitle || l.lessonTitle.trim().toLowerCase() === activeLessonTitle.trim().toLowerCase()
    );
    if (byLesson.length > 0) pool = byLesson;
  }

  const pageLines = pool.filter((l) => Number(l.page) === Number(activePage));
  const candidates = pageLines.length > 0 ? pageLines : pool;
  if (candidates.length === 0) {
    return { matchedLine: null, confidence: 0, matchedKeywords: [], reason: 'none' };
  }

  const currentIdx = currentLineId ? candidates.findIndex((l) => l.id === currentLineId) : -1;

  // 2. Focus on trailing spoken words so skipping mid-sentence transitions immediately
  const { anchorTokens, allTokens } = tokenizeArabicSpeech(transcript);
  if (allTokens.length === 0) {
    return { matchedLine: null, confidence: 0, matchedKeywords: [], reason: 'none' };
  }

  const recentTokens = anchorTokens.slice(-10); // Strong recency window (last 10 meaningful words)
  const veryRecentTokens = anchorTokens.slice(-5); // Ultra-recent 5 words get extra weight

  let bestLine: ScriptSubtitleLine | null = null;
  let bestScore = 0;
  let bestMatchedWords: string[] = [];
  let bestReason: ScriptMatchResult['reason'] = 'none';

  candidates.forEach((line, idx) => {
    const lineTokens = tokenizeArabicSpeech(line.arabic);
    const targetWords = lineTokens.anchorTokens.length > 0 ? lineTokens.anchorTokens : lineTokens.allTokens;
    if (targetWords.length === 0) return;

    let hitWeight = 0;
    const matchedWords: string[] = [];
    const seenScriptIdx = new Set<number>();

    // Score trailing spoken tokens against script line tokens
    recentTokens.forEach((spoken, sIdx) => {
      const isUltraRecent = sIdx >= Math.max(0, recentTokens.length - veryRecentTokens.length);
      let bestWordHit = 0;
      let hitTargetIdx = -1;

      targetWords.forEach((target, tIdx) => {
        if (seenScriptIdx.has(tIdx)) return;
        const sim = tokensMatch(spoken, target);
        if (sim > bestWordHit) {
          bestWordHit = sim;
          hitTargetIdx = tIdx;
        }
      });

      if (bestWordHit > 0 && hitTargetIdx !== -1) {
        seenScriptIdx.add(hitTargetIdx);
        matchedWords.push(targetWords[hitTargetIdx]);
        // Ultra-recent words carry 1.35x weight so newly started Line 2 immediately outweighs old Line 1 words
        hitWeight += bestWordHit * (isUltraRecent ? 1.35 : 0.85);
      }
    });

    // Require at least 2 meaningful keyword hits (or 1 exact hit on short 1-2 word headings if adjacent next line)
    const minRequiredHits = targetWords.length <= 2 ? 1 : 2;
    if (matchedWords.length < minRequiredHits) {
      return;
    }

    // Coverage ratio bonus
    const coverage = matchedWords.length / Math.max(1, targetWords.length);
    let score = hitWeight + coverage * 1.4;
    let reason: ScriptMatchResult['reason'] = 'jump';

    // Apply progression heuristics relative to currentIdx
    if (currentIdx === -1) {
      // Starting fresh: slightly prefer earlier lines if tied
      score += Math.max(0, 0.5 - idx * 0.05);
      reason = 'next';
    } else if (idx === currentIdx + 1) {
      // Immediate next line gets strong forward progression priority
      score += 1.45;
      reason = 'next';
    } else if (idx > currentIdx + 1 && idx <= currentIdx + 4) {
      // Nearby upcoming lines (teacher skipped a line or two)
      score += 0.85;
      reason = 'forward';
    } else if (idx === currentIdx) {
      // Slight tie-breaker, but easily overtaken if Line+1 matches 2+ recent words
      score += 0.15;
      reason = 'current';
    } else if (idx < currentIdx) {
      // Going backwards requires stronger proof (at least 3 hits or high coverage)
      if (matchedWords.length < 3 && coverage < 0.65) {
        score -= 1.2;
      }
      reason = 'jump';
    }

    if (score > bestScore && score >= 1.55) {
      bestScore = score;
      bestLine = line;
      bestMatchedWords = matchedWords;
      bestReason = reason;
    }
  });

  return {
    matchedLine: bestLine,
    confidence: Math.min(1, bestScore / 5),
    matchedKeywords: bestMatchedWords,
    reason: bestLine ? bestReason : 'none',
  };
}
