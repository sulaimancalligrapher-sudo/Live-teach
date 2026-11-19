import {
  ActivePollState,
  VoteButtonColor,
  VoteExtraGroup,
  VoteExtraItem,
  VoteParticipantRecord,
  VoteSubmissionRecord,
} from '../types';
import { Language } from '../translations';
import { getLocalizedVoteText } from './voteTranslations';

export interface VoteChartEntry {
  id: string;
  label: string;
  count: number;
  percent: number;
  color: VoteButtonColor;
}

export interface CrossTabPrimaryBreakdown {
  optionId: string;
  optionLabel: string;
  count: number;
  percent: number;
  color: VoteButtonColor;
}

export interface CrossTabRow {
  categoryId: string;
  categoryLabel: string;
  total: number;
  color: VoteButtonColor;
  byPrimary: CrossTabPrimaryBreakdown[];
}

export interface NumberFieldAnalytics {
  item: VoteExtraItem;
  localizedItemLabel: string;
  answeredCount: number;
  missingCount: number;
  average: number | null;
  min: number | null;
  max: number | null;
  bracketEntries: VoteChartEntry[];
  crossTabRows: CrossTabRow[];
}

export interface ExtraGroupAnalytics {
  group: VoteExtraGroup;
  localizedGroupName: string;
  hasChoiceItems: boolean;
  choiceEntries: VoteChartEntry[];
  choiceCrossTab: CrossTabRow[];
  numberFields: NumberFieldAnalytics[];
}

export interface ComputedVoteAnalytics {
  totalEntered: number;
  totalVoted: number;
  notVoted: number;
  guestParticipantsCount: number;
  studentParticipantsCount: number;
  studentVotes: VoteSubmissionRecord[];
  guestVotes: VoteSubmissionRecord[];
  unvotedRegistered: VoteParticipantRecord[];
  optionStats: VoteChartEntry[];
  extraGroupAnalytics: ExtraGroupAnalytics[];
  extraSummaryText: string;
}

export function isExtraDetailsComplete(
  extraGroups: VoteExtraGroup[] | undefined,
  extraChoices: Record<string, { itemId: string; label: string }>,
  extraNumbers: Record<string, number>,
  lang: Language = 'ar'
): { complete: boolean; missingGroupIds: string[]; missingGroupNames: string[] } {
  if (!extraGroups || extraGroups.length === 0) {
    return { complete: true, missingGroupIds: [], missingGroupNames: [] };
  }

  const missingGroupIds: string[] = [];
  const missingGroupNames: string[] = [];

  for (const grp of extraGroups) {
    if (grp.required === false) continue;

    const choiceItems = grp.items.filter((i) => i.inputType === 'choice');
    const numberItems = grp.items.filter((i) => i.inputType === 'number');

    let grpComplete = true;

    if (choiceItems.length > 0) {
      const chosen = extraChoices?.[grp.id];
      if (!chosen || !chosen.label) {
        grpComplete = false;
      }
    }

    if (numberItems.length > 0) {
      for (const nItem of numberItems) {
        const key = `${grp.id}__${nItem.id}`;
        const val = extraNumbers?.[key];
        if (val === undefined || val === null || isNaN(Number(val))) {
          grpComplete = false;
        }
      }
    }

    if (!grpComplete) {
      missingGroupIds.push(grp.id);
      missingGroupNames.push(getLocalizedVoteText(grp.name, lang, grp.nameI18n));
    }
  }

  return {
    complete: missingGroupIds.length === 0,
    missingGroupIds,
    missingGroupNames,
  };
}

function getAnalyticsPhrase(lang: Language) {
  if (lang === 'th') {
    return {
      notSpecified: 'ไม่ได้ระบุ',
      lessThan: 'น้อยกว่า',
      andAbove: 'ขึ้นไป',
      greaterThan: 'มากกว่า',
    };
  }
  if (lang === 'en') {
    return {
      notSpecified: 'Not Specified',
      lessThan: 'Less than',
      andAbove: 'and above',
      greaterThan: 'Greater than',
    };
  }
  return {
    notSpecified: 'لم يحدد',
    lessThan: 'أقل من',
    andAbove: 'فأكثر',
    greaterThan: 'أكبر من',
  };
}

function buildCrossTabRow(
  categoryId: string,
  categoryLabel: string,
  color: VoteButtonColor,
  matchingVotes: VoteSubmissionRecord[],
  primaryOptions: ActivePollState['options'],
  lang: Language
): CrossTabRow {
  const total = matchingVotes.length;
  const byPrimary: CrossTabPrimaryBreakdown[] = primaryOptions.map((opt) => {
    const c = matchingVotes.filter(
      (v) => v.optionId === opt.id || v.optionLabel === opt.label
    ).length;
    return {
      optionId: opt.id,
      optionLabel: getLocalizedVoteText(opt.label, lang, opt.i18n),
      count: c,
      percent: total > 0 ? Math.round((c / total) * 100) : 0,
      color: opt.color || 'emerald',
    };
  });

  return {
    categoryId,
    categoryLabel,
    total,
    color,
    byPrimary,
  };
}

export function computeVoteAnalytics(
  poll: ActivePollState | undefined,
  participants: VoteParticipantRecord[],
  votes: VoteSubmissionRecord[],
  lang: Language = 'ar'
): ComputedVoteAnalytics {
  const activeOptions = poll?.options || [];
  const extraGroups = poll?.extraGroups || [];
  const phr = getAnalyticsPhrase(lang);

  const uniqueVoterIds = new Set<string>();
  participants.forEach((p) => {
    if (p.voterId) uniqueVoterIds.add(p.voterId);
  });
  votes.forEach((v) => {
    if (v.voterId) uniqueVoterIds.add(v.voterId);
  });

  const totalEntered = uniqueVoterIds.size;
  const totalVoted = votes.length;
  const notVoted = Math.max(0, totalEntered - totalVoted);

  const optionStats: VoteChartEntry[] = activeOptions.map((opt) => {
    const count = votes.filter((v) => v.optionId === opt.id || v.optionLabel === opt.label).length;
    const percent = totalVoted > 0 ? Math.round((count / totalVoted) * 100) : 0;
    return {
      id: opt.id,
      label: getLocalizedVoteText(opt.label, lang, opt.i18n),
      count,
      percent,
      color: opt.color || 'emerald',
    };
  });

  const studentVotes = votes.filter((v) => v.voterType === 'student');
  const guestVotes = votes.filter((v) => v.voterType === 'guest');
  const guestParticipantsCount = participants.filter((p) => p.voterType === 'guest').length;
  const studentParticipantsCount = participants.filter((p) => p.voterType === 'student').length;

  const votedStudentIds = new Set(studentVotes.map((v) => v.voterId));
  const unvotedRegistered = participants.filter(
    (p) => p.voterType === 'student' && !votedStudentIds.has(p.voterId)
  );

  // Extra Groups Analytics (including "لم يحدد" and Cross-Tabs)
  const extraGroupAnalytics: ExtraGroupAnalytics[] = extraGroups.map((group) => {
    const localizedGroupName = getLocalizedVoteText(group.name, lang, group.nameI18n);
    const choiceItems = group.items.filter((it) => it.inputType === 'choice');
    const numberItems = group.items.filter((it) => it.inputType === 'number');
    const hasChoiceItems = choiceItems.length > 0;

    let choiceEntries: VoteChartEntry[] = [];
    let choiceCrossTab: CrossTabRow[] = [];

    if (hasChoiceItems) {
      const assignedVotes = new Set<string>();

      const itemRows = choiceItems.map((it) => {
        const matched = votes.filter((v) => {
          const c = v.extraChoices?.[group.id];
          return c && (c.itemId === it.id || c.label === it.label);
        });
        matched.forEach((v) => assignedVotes.add(v.voterId));
        const pct = totalVoted > 0 ? Math.round((matched.length / totalVoted) * 100) : 0;
        const localizedItLabel = getLocalizedVoteText(it.label, lang, it.i18n);
        return {
          entry: {
            id: it.id,
            label: localizedItLabel,
            count: matched.length,
            percent: pct,
            color: it.color || 'sky',
          } as VoteChartEntry,
          cross: buildCrossTabRow(it.id, localizedItLabel, it.color || 'sky', matched, activeOptions, lang),
        };
      });

      const missingVotes = votes.filter((v) => !assignedVotes.has(v.voterId));
      const missingPct = totalVoted > 0 ? Math.round((missingVotes.length / totalVoted) * 100) : 0;
      const missingLabel = `${phr.notSpecified} (${localizedGroupName})`;

      choiceEntries = [
        ...itemRows.map((r) => r.entry),
        {
          id: `${group.id}_missing`,
          label: missingLabel,
          count: missingVotes.length,
          percent: missingPct,
          color: 'slate',
        },
      ];

      choiceCrossTab = [
        ...itemRows.map((r) => r.cross),
        buildCrossTabRow(`${group.id}_missing`, missingLabel, 'slate', missingVotes, activeOptions, lang),
      ];
    }

    const numberFields: NumberFieldAnalytics[] = numberItems.map((nItem) => {
      const numKey = `${group.id}__${nItem.id}`;
      const localizedNLabel = getLocalizedVoteText(nItem.label, lang, nItem.i18n);
      const validPairs: Array<{ vote: VoteSubmissionRecord; val: number }> = [];
      const missingVotes: VoteSubmissionRecord[] = [];

      for (const v of votes) {
        const raw = v.extraNumbers?.[numKey];
        if (raw !== undefined && raw !== null && !isNaN(Number(raw))) {
          validPairs.push({ vote: v, val: Number(raw) });
        } else {
          missingVotes.push(v);
        }
      }

      const answeredCount = validPairs.length;
      const missingCount = missingVotes.length;
      const values = validPairs.map((p) => p.val);
      const average =
        values.length > 0
          ? Math.round((values.reduce((acc, x) => acc + x, 0) / values.length) * 10) / 10
          : null;
      const min = values.length > 0 ? Math.min(...values) : null;
      const max = values.length > 0 ? Math.max(...values) : null;

      // Classify numeric entries into smart brackets (custom splitAt OR 3-tier age/number brackets)
      const splitThreshold =
        typeof nItem.splitAt === 'number' && !isNaN(nItem.splitAt) ? nItem.splitAt : null;

      const buckets: Array<{
        id: string;
        label: string;
        color: VoteButtonColor;
        votes: VoteSubmissionRecord[];
      }> = [];

      if (splitThreshold !== null) {
        const lower = validPairs.filter((p) => p.val < splitThreshold).map((p) => p.vote);
        const upper = validPairs.filter((p) => p.val >= splitThreshold).map((p) => p.vote);
        buckets.push(
          {
            id: `${nItem.id}_lt`,
            label: `${localizedNLabel}: ${phr.lessThan} ${splitThreshold}`,
            color: 'amber',
            votes: lower,
          },
          {
            id: `${nItem.id}_gte`,
            label: `${localizedNLabel}: ${splitThreshold} ${phr.andAbove}`,
            color: 'purple',
            votes: upper,
          }
        );
      } else {
        const b1 = validPairs.filter((p) => p.val < 18).map((p) => p.vote);
        const b2 = validPairs.filter((p) => p.val >= 18 && p.val <= 35).map((p) => p.vote);
        const b3 = validPairs.filter((p) => p.val > 35).map((p) => p.vote);
        buckets.push(
          { id: `${nItem.id}_b1`, label: `${localizedNLabel}: ${phr.lessThan} 18`, color: 'amber', votes: b1 },
          { id: `${nItem.id}_b2`, label: `${localizedNLabel}: 18 – 35`, color: 'sky', votes: b2 },
          { id: `${nItem.id}_b3`, label: `${localizedNLabel}: ${phr.greaterThan} 35`, color: 'purple', votes: b3 }
        );
      }

      buckets.push({
        id: `${nItem.id}_missing`,
        label: `${phr.notSpecified} (${localizedNLabel})`,
        color: 'slate',
        votes: missingVotes,
      });

      const bracketEntries: VoteChartEntry[] = buckets.map((b) => ({
        id: b.id,
        label: b.label,
        count: b.votes.length,
        percent: totalVoted > 0 ? Math.round((b.votes.length / totalVoted) * 100) : 0,
        color: b.color,
      }));

      const crossTabRows: CrossTabRow[] = buckets.map((b) =>
        buildCrossTabRow(b.id, b.label, b.color, b.votes, activeOptions, lang)
      );

      return {
        item: nItem,
        localizedItemLabel: localizedNLabel,
        answeredCount,
        missingCount,
        average,
        min,
        max,
        bracketEntries,
        crossTabRows,
      };
    });

    return {
      group,
      localizedGroupName,
      hasChoiceItems,
      choiceEntries,
      choiceCrossTab,
      numberFields,
    };
  });

  const extraSummaryParts: string[] = [];
  extraGroupAnalytics.forEach((ga) => {
    if (ga.hasChoiceItems) {
      const detail = ga.choiceCrossTab
        .filter((r) => r.total > 0)
        .map((r) => {
          const inner = r.byPrimary.map((p) => `${p.optionLabel}:${p.count}`).join('، ');
          return `${r.categoryLabel} (${r.total} ← ${inner})`;
        })
        .join(' | ');
      if (detail) extraSummaryParts.push(`${ga.localizedGroupName}: ${detail}`);
    }
    ga.numberFields.forEach((nf) => {
      const avgTxt = nf.average !== null ? `${phr.notSpecified === 'لم يحدد' ? 'المتوسط' : 'Avg'} ${nf.average}` : '—';
      const brTxt = nf.bracketEntries
        .filter((b) => b.count > 0)
        .map((b) => `${b.label}: ${b.count}`)
        .join(' | ');
      extraSummaryParts.push(`${getLocalizedVoteText(nf.item.label, lang, nf.item.i18n)} (${avgTxt}): ${brTxt}`);
    });
  });

  return {
    totalEntered,
    totalVoted,
    notVoted,
    guestParticipantsCount,
    studentParticipantsCount,
    studentVotes,
    guestVotes,
    unvotedRegistered,
    optionStats,
    extraGroupAnalytics,
    extraSummaryText: extraSummaryParts.join(' || '),
  };
}
