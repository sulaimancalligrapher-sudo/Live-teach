import React from 'react';
import { VoteButtonColor, VoteChartType } from '../types';
import { VoteChartEntry } from '../lib/voteAnalytics';
import { useLanguage } from '../translations';

export const VOTE_COLOR_MAP: Record<
  VoteButtonColor,
  { hex: string; bar: string; dot: string; text: string; badge: string; label: string }
> = {
  emerald: {
    hex: '#10b981',
    bar: 'bg-emerald-500',
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    label: 'أخضر',
  },
  rose: {
    hex: '#f43f5e',
    bar: 'bg-rose-500',
    dot: 'bg-rose-400',
    text: 'text-rose-400',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    label: 'أحمر',
  },
  sky: {
    hex: '#0ea5e9',
    bar: 'bg-sky-500',
    dot: 'bg-sky-400',
    text: 'text-sky-400',
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
    label: 'أزرق',
  },
  purple: {
    hex: '#a855f7',
    bar: 'bg-purple-500',
    dot: 'bg-purple-400',
    text: 'text-purple-400',
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
    label: 'بنفسجي',
  },
  amber: {
    hex: '#f59e0b',
    bar: 'bg-amber-500',
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    label: 'ذهبي',
  },
  slate: {
    hex: '#64748b',
    bar: 'bg-slate-500',
    dot: 'bg-slate-400',
    text: 'text-slate-300',
    badge: 'bg-slate-700/60 text-slate-200 border-slate-600',
    label: 'رمادي',
  },
};

export const VOTE_CHART_OPTIONS: Array<{
  value: VoteChartType;
  labelKey: string;
  label: string;
  shortLabel: string;
}> = [
  { value: 'numbers', labelKey: 'vote_chart_numbers_only', label: 'عدد فقط', shortLabel: 'عدد' },
  { value: 'horizontal_bar', labelKey: 'vote_chart_horizontal_bar', label: 'عدد وشريط أفقي', shortLabel: 'شريط أفقي' },
  { value: 'vertical_bar', labelKey: 'vote_chart_vertical_bar', label: 'عدد وشريط عمودي', shortLabel: 'شريط عمودي' },
  { value: 'donut', labelKey: 'vote_chart_donut', label: 'عدد ودائرة ملونة', shortLabel: 'دائرة ملونة' },
];

interface VoteChartRendererProps {
  entries: VoteChartEntry[];
  chartType?: VoteChartType;
  totalVotes?: number;
  size?: 'compact' | 'normal' | 'projector';
}

export default function VoteChartRenderer({
  entries,
  chartType = 'horizontal_bar',
  totalVotes,
  size = 'normal',
}: VoteChartRendererProps) {
  const { t } = useLanguage();
  const effectiveTotal =
    totalVotes !== undefined
      ? totalVotes
      : entries.reduce((sum, item) => sum + item.count, 0);

  const voteUnit = t('vote_unit_label', 'صوت');

  if (entries.length === 0) {
    return (
      <div className="text-xs text-slate-500 py-3 text-center">
        {t('vote_no_chart_data', 'لا توجد بيانات للعرض بعد')}
      </div>
    );
  }

  // 1. Numbers (counts) only
  if (chartType === 'numbers') {
    return (
      <div
        className={`grid gap-2.5 ${
          entries.length === 2
            ? 'grid-cols-2'
            : entries.length === 3
            ? 'grid-cols-3'
            : 'grid-cols-2 sm:grid-cols-4'
        }`}
      >
        {entries.map((entry) => {
          const c = VOTE_COLOR_MAP[entry.color || 'emerald'] || VOTE_COLOR_MAP.emerald;
          return (
            <div
              key={entry.id}
              className="rounded-xl bg-slate-900 border border-slate-800 p-3 flex flex-col justify-between gap-1.5"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                <span
                  className={`font-bold text-slate-200 truncate ${
                    size === 'projector' ? 'text-base sm:text-lg' : 'text-xs'
                  }`}
                >
                  {entry.label}
                </span>
              </div>
              <div className="flex items-baseline justify-between gap-2 pt-1">
                <span
                  className={`font-black font-mono tabular-nums ${c.text} ${
                    size === 'projector'
                      ? 'text-3xl sm:text-4xl'
                      : size === 'compact'
                      ? 'text-xl'
                      : 'text-2xl'
                  }`}
                >
                  {entry.count}
                </span>
                <span className="text-xs font-bold text-slate-400">
                  {voteUnit}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // 3. Vertical Bar Chart
  if (chartType === 'vertical_bar') {
    const barBoxHeight =
      size === 'projector' ? 'h-56' : size === 'compact' ? 'h-32' : 'h-44';
    return (
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4">
        <div
          className="grid gap-3 items-end"
          style={{
            gridTemplateColumns: `repeat(${Math.min(entries.length, 6)}, minmax(0, 1fr))`,
          }}
        >
          {entries.map((entry) => {
            const c = VOTE_COLOR_MAP[entry.color || 'emerald'] || VOTE_COLOR_MAP.emerald;
            const visualRatio = effectiveTotal > 0 ? Math.round((entry.count / effectiveTotal) * 100) : entry.percent;
            const visualHeight = entry.count > 0 ? Math.max(visualRatio, 8) : 2;
            return (
              <div key={entry.id} className="flex flex-col items-center gap-2 min-w-0">
                <div className="text-center">
                  <span
                    className={`font-black font-mono tabular-nums block ${c.text} ${
                      size === 'projector' ? 'text-2xl' : 'text-sm sm:text-base'
                    }`}
                  >
                    {entry.count}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400">
                    {voteUnit}
                  </span>
                </div>

                <div
                  className={`w-full max-w-[64px] ${barBoxHeight} rounded-xl bg-slate-950 border border-slate-800 flex items-end p-1 overflow-hidden`}
                >
                  <div
                    className={`w-full rounded-lg ${c.bar} transition-all duration-500`}
                    style={{ height: `${visualHeight}%` }}
                  />
                </div>

                <span
                  className={`font-bold text-slate-200 text-center leading-tight line-clamp-2 ${
                    size === 'projector' ? 'text-sm sm:text-base' : 'text-[11px] sm:text-xs'
                  }`}
                >
                  {entry.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 4. Colorful Donut Chart
  if (chartType === 'donut') {
    const svgSize = size === 'projector' ? 210 : size === 'compact' ? 128 : 164;
    const radius = 44;
    const circumference = 2 * Math.PI * radius;

    let cumulative = 0;
    const nonZero = entries.filter((e) => e.count > 0);
    const denom = nonZero.reduce((sum, e) => sum + e.count, 0);

    return (
      <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-5">
        <div className="relative shrink-0 flex items-center justify-center">
          <svg
            width={svgSize}
            height={svgSize}
            viewBox="0 0 120 120"
            className="-rotate-90"
          >
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="transparent"
              stroke="#1e293b"
              strokeWidth="16"
            />
            {denom > 0 &&
              nonZero.map((entry) => {
                const c = VOTE_COLOR_MAP[entry.color || 'emerald'] || VOTE_COLOR_MAP.emerald;
                const fraction = entry.count / denom;
                const dash = fraction * circumference;
                const offset = -cumulative * circumference;
                cumulative += fraction;
                return (
                  <circle
                    key={entry.id}
                    cx="60"
                    cy="60"
                    r={radius}
                    fill="transparent"
                    stroke={c.hex}
                    strokeWidth="16"
                    strokeDasharray={`${dash} ${circumference}`}
                    strokeDashoffset={offset}
                    className="transition-all duration-500"
                  />
                );
              })}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none px-2">
            <span
              className={`font-black font-mono tabular-nums text-white ${
                size === 'projector' ? 'text-3xl' : 'text-xl'
              }`}
            >
              {effectiveTotal}
            </span>
            <span className="text-[10px] font-bold text-slate-400 leading-tight">
              {t('vote_total_votes_label', 'إجمالي الأصوات')}
            </span>
          </div>
        </div>

        <div className="flex-1 w-full space-y-2">
          {entries.map((entry) => {
            const c = VOTE_COLOR_MAP[entry.color || 'emerald'] || VOTE_COLOR_MAP.emerald;
            return (
              <div
                key={entry.id}
                className="flex items-center justify-between gap-3 py-1.5 border-b border-slate-800/70 last:border-b-0"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-3 h-3 rounded-sm shrink-0"
                    style={{ backgroundColor: c.hex }}
                  />
                  <span
                    className={`font-bold text-slate-100 truncate ${
                      size === 'projector' ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'
                    }`}
                  >
                    {entry.label}
                  </span>
                </div>
                <span
                  className={`font-mono tabular-nums font-black shrink-0 ${c.text} ${
                    size === 'projector' ? 'text-base sm:text-lg' : 'text-xs sm:text-sm'
                  }`}
                >
                  {entry.count} {voteUnit}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // 2. Default: Horizontal Bars
  return (
    <div className="space-y-2.5">
      {entries.map((entry) => {
        const c = VOTE_COLOR_MAP[entry.color || 'emerald'] || VOTE_COLOR_MAP.emerald;
        const barWidth = effectiveTotal > 0 ? Math.round((entry.count / effectiveTotal) * 100) : entry.percent;
        return (
          <div key={entry.id} className="space-y-1">
            <div
              className={`flex items-center justify-between font-bold ${
                size === 'projector' ? 'text-base sm:text-xl' : 'text-xs'
              }`}
            >
              <span className="text-slate-100 flex items-center gap-2 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${c.dot}`} />
                <span className="truncate">{entry.label}</span>
              </span>
              <span className="font-mono tabular-nums text-slate-200 shrink-0">
                {entry.count} {voteUnit}
              </span>
            </div>
            <div
              className={`w-full rounded-xl bg-slate-900 border border-slate-800 overflow-hidden ${
                size === 'projector' ? 'h-6' : size === 'compact' ? 'h-2.5' : 'h-3.5'
              }`}
            >
              <div
                className={`h-full ${c.bar} transition-all duration-500`}
                style={{ width: `${barWidth}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

