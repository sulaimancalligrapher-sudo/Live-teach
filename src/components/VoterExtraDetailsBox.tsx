import React from 'react';
import { AlertCircle, Check, CheckCircle2, Loader2 } from 'lucide-react';
import { VoteButtonColor, VoteExtraGroup, VoteExtraItem } from '../types';

const SUB_BTN_COLOR: Record<
  VoteButtonColor,
  { idle: string; active: string }
> = {
  emerald: {
    idle: 'bg-slate-900 border-slate-700 text-slate-200 hover:border-emerald-400',
    active: 'bg-emerald-600 border-emerald-300 text-white shadow-sm',
  },
  rose: {
    idle: 'bg-slate-900 border-slate-700 text-slate-200 hover:border-rose-400',
    active: 'bg-rose-600 border-rose-300 text-white shadow-sm',
  },
  sky: {
    idle: 'bg-slate-900 border-slate-700 text-slate-200 hover:border-sky-400',
    active: 'bg-sky-600 border-sky-300 text-white shadow-sm',
  },
  purple: {
    idle: 'bg-slate-900 border-slate-700 text-slate-200 hover:border-purple-400',
    active: 'bg-purple-600 border-purple-300 text-white shadow-sm',
  },
  amber: {
    idle: 'bg-slate-900 border-slate-700 text-slate-200 hover:border-amber-400',
    active: 'bg-amber-500 border-amber-200 text-slate-950 shadow-sm',
  },
  slate: {
    idle: 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-400',
    active: 'bg-slate-600 border-slate-300 text-white shadow-sm',
  },
};

interface VoterExtraDetailsBoxProps {
  extraGroups: VoteExtraGroup[];
  extraChoices: Record<string, { itemId: string; label: string }>;
  extraNumbers: Record<string, string>;
  missingGroupIds: string[];
  missingGroupNames: string[];
  showUrgentPrompt: boolean;
  hasPrimaryVote: boolean;
  isSavingExtra: boolean;
  extraCompleted: boolean;
  disabled?: boolean;
  onSelectChoice: (group: VoteExtraGroup, item: VoteExtraItem) => void;
  onChangeNumber: (groupId: string, itemId: string, rawVal: string) => void;
  onConfirmExtra: () => void;
}

export default function VoterExtraDetailsBox({
  extraGroups,
  extraChoices,
  extraNumbers,
  missingGroupIds,
  missingGroupNames,
  showUrgentPrompt,
  hasPrimaryVote,
  isSavingExtra,
  extraCompleted,
  disabled = false,
  onSelectChoice,
  onChangeNumber,
  onConfirmExtra,
}: VoterExtraDetailsBoxProps) {
  if (!extraGroups || extraGroups.length === 0) return null;

  const hasNumberInputs = extraGroups.some((g) =>
    g.items.some((i) => i.inputType === 'number')
  );

  return (
    <div
      className={`rounded-2xl border p-3.5 text-right space-y-3 transition-all ${
        showUrgentPrompt && missingGroupIds.length > 0
          ? 'bg-amber-500/10 border-amber-400 ring-2 ring-amber-400/35'
          : extraCompleted && hasPrimaryVote
          ? 'bg-emerald-500/5 border-emerald-500/30'
          : 'bg-slate-950/70 border-slate-800'
      }`}
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-black text-slate-200">
          تفاصيل إضافية (إجباري الإجابة)
        </span>
        {extraCompleted && hasPrimaryVote ? (
          <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>مكتمل</span>
          </span>
        ) : (
          <span className="text-[11px] font-bold text-amber-300">مطلوب</span>
        )}
      </div>

      {/* Urgent Prompt when primary button was tapped without answering extra details */}
      {showUrgentPrompt && missingGroupNames.length > 0 && (
        <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-400/50 text-amber-200 text-xs font-black flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-300 shrink-0 mt-0.5" />
          <span>
            أرجو أن تجيب على هذا أيضاً لإكمال التصويت:{' '}
            <span className="text-white underline decoration-amber-400/60">
              {missingGroupNames.join(' ، ')}
            </span>
          </span>
        </div>
      )}

      <div className="space-y-3">
        {extraGroups.map((group) => {
          const isGroupMissing = showUrgentPrompt && missingGroupIds.includes(group.id);
          const choiceItems = group.items.filter((it) => it.inputType === 'choice');
          const numberItems = group.items.filter((it) => it.inputType === 'number');
          const chosen = extraChoices[group.id];

          return (
            <div
              key={group.id}
              className={`rounded-xl p-2.5 border space-y-2 ${
                isGroupMissing
                  ? 'bg-slate-900/90 border-amber-400/70'
                  : 'bg-slate-900/60 border-slate-800/90'
              }`}
            >
              <div className="text-[11px] font-bold text-slate-300">{group.name}</div>

              {/* Compact small sub-choice buttons */}
              {choiceItems.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {choiceItems.map((item) => {
                    const isSelected = chosen?.itemId === item.id;
                    const cStyle = SUB_BTN_COLOR[item.color || 'sky'] || SUB_BTN_COLOR.sky;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        disabled={disabled || isSavingExtra}
                        onClick={() => onSelectChoice(group, item)}
                        className={`px-3 py-1.5 rounded-xl border text-xs font-black flex items-center gap-1.5 transition cursor-pointer active:scale-95 disabled:opacity-60 ${
                          isSelected ? cStyle.active : cStyle.idle
                        }`}
                      >
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                            isSelected
                              ? 'bg-white/20 border-white/60 text-white'
                              : 'bg-slate-950 border-slate-600 text-transparent'
                          }`}
                        >
                          <Check className="w-3 h-3 stroke-[3]" />
                        </span>
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Compact number fields (e.g., Age) */}
              {numberItems.length > 0 && (
                <div className="flex flex-wrap items-center gap-2">
                  {numberItems.map((item) => {
                    const key = `${group.id}__${item.id}`;
                    const rawVal = extraNumbers[key] ?? '';
                    return (
                      <label
                        key={item.id}
                        className="flex items-center gap-2 bg-slate-950 border border-slate-700 rounded-xl px-2.5 py-1.5 flex-1 min-w-[140px]"
                      >
                        <span className="text-[11px] font-bold text-slate-300 whitespace-nowrap">
                          {item.label}:
                        </span>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={150}
                          disabled={disabled || isSavingExtra}
                          value={rawVal}
                          onChange={(e) => onChangeNumber(group.id, item.id, e.target.value)}
                          placeholder="أدخل العدد..."
                          className="w-full bg-transparent text-xs font-black font-mono text-white outline-none placeholder:text-slate-600"
                        />
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirm button when voter already chose main vote & needs to submit number input or finalize */}
      {hasPrimaryVote && (hasNumberInputs || !extraCompleted) && !disabled && (
        <button
          type="button"
          disabled={isSavingExtra}
          onClick={onConfirmExtra}
          className="w-full py-2.5 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 transition"
        >
          {isSavingExtra ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <CheckCircle2 className="w-4 h-4" />
          )}
          <span>تأكيد حفظ التفاصيل الإضافية</span>
        </button>
      )}
    </div>
  );
}
