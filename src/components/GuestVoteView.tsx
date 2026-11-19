import React, { useEffect, useMemo, useState } from 'react';
import { Award, CheckCircle2, Clock, Loader2, Vote } from 'lucide-react';
import {
  HeaderConfig,
  VoteButtonColor,
  VoteExtraGroup,
  VoteExtraItem,
  VoteOption,
  VoteSubmissionRecord,
  VotingConfigState,
} from '../types';
import {
  defaultVotingConfigState,
  fetchHeaderConfig,
  formatDriveImageUrl,
  getGuestVoterId,
  registerVoteParticipant,
  submitVoteChoice,
  submitVoteExtraDetails,
  subscribeToVotingConfig,
  subscribeToVotingRoundActivity,
} from '../api';
import { computeVoteAnalytics, isExtraDetailsComplete } from '../lib/voteAnalytics';
import VoteChartRenderer from './VoteChartRenderer';
import VoterExtraDetailsBox from './VoterExtraDetailsBox';

const GUEST_BUTTON_CLASSES: Record<VoteButtonColor, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/60 shadow-emerald-600/20',
  rose: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/60 shadow-rose-600/20',
  sky: 'bg-sky-600 hover:bg-sky-500 text-white border-sky-400/60 shadow-sky-600/20',
  purple: 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/60 shadow-purple-600/20',
  amber: 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/20',
  slate: 'bg-slate-700 hover:bg-slate-600 text-white border-slate-500 shadow-slate-700/20',
};

function parseNumericRecord(raw: Record<string, string>): Record<string, number> {
  const out: Record<string, number> = {};
  Object.entries(raw).forEach(([k, v]) => {
    const trimmed = String(v || '').trim();
    if (trimmed !== '') {
      const n = Number(trimmed);
      if (!isNaN(n)) out[k] = n;
    }
  });
  return out;
}

export default function GuestVoteView() {
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [votingState, setVotingState] = useState<VotingConfigState>(defaultVotingConfigState);
  const [votes, setVotes] = useState<VoteSubmissionRecord[]>([]);
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null);
  const [localVotedMap, setLocalVotedMap] = useState<Record<string, VoteOption>>({});
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

  // Additional Details State (reset cleanly on every new roundId or exit)
  const [extraChoices, setExtraChoices] = useState<Record<string, { itemId: string; label: string }>>({});
  const [extraNumbers, setExtraNumbers] = useState<Record<string, string>>({});
  const [extraCompletedLocal, setExtraCompletedLocal] = useState<boolean>(false);
  const [showExtraPrompt, setShowExtraPrompt] = useState<boolean>(false);
  const [isSavingExtra, setIsSavingExtra] = useState<boolean>(false);

  const guestId = useMemo(() => getGuestVoterId(), []);

  useEffect(() => {
    fetchHeaderConfig()
      .then((cfg) => {
        if (cfg) setHeaderConfig(cfg);
      })
      .catch(() => {});

    const unsub = subscribeToVotingConfig((state) => {
      setVotingState(state);
    });
    return () => unsub();
  }, []);

  const activePoll = votingState.activePoll;
  const roundId = activePoll?.roundId || '';
  const pollStatus = activePoll?.status || 'idle';
  const extraGroups = activePoll?.extraGroups || [];

  // CRITICAL FIX: Cleanly wipe all local per-round messages & extra fields whenever roundId changes or session exits
  useEffect(() => {
    setVotes([]);
    setFeedbackMsg(null);
    setSubmittingOptionId(null);
    setExtraChoices({});
    setExtraNumbers({});
    setExtraCompletedLocal(false);
    setShowExtraPrompt(false);
    setIsSavingExtra(false);

    if (pollStatus === 'exited') {
      setLocalVotedMap({});
    }
  }, [roundId, pollStatus]);

  // Register device presence immediately when opening guest vote page during an active poll
  useEffect(() => {
    if (!roundId || pollStatus !== 'active') return;
    registerVoteParticipant(roundId, {
      voterId: guestId,
      voterType: 'guest',
    });
  }, [roundId, pollStatus, guestId]);

  // Subscribe strictly to current roundId votes (restore own vote on refresh only for THIS roundId)
  useEffect(() => {
    if (!roundId) return;
    let active = true;
    const unsub = subscribeToVotingRoundActivity(roundId, ({ votes: v }) => {
      if (!active) return;
      const roundVotes = v.filter((item) => item.roundId === roundId);
      setVotes(roundVotes);

      const myVote = roundVotes.find((item) => item.voterId === guestId);
      if (myVote) {
        setLocalVotedMap((prev) => ({
          ...prev,
          [roundId]: { id: myVote.optionId, label: myVote.optionLabel },
        }));
        if (myVote.extraChoices && Object.keys(myVote.extraChoices).length > 0) {
          setExtraChoices(myVote.extraChoices);
        }
        if (myVote.extraNumbers && Object.keys(myVote.extraNumbers).length > 0) {
          const strMap: Record<string, string> = {};
          Object.entries(myVote.extraNumbers).forEach(([k, n]) => {
            strMap[k] = String(n);
          });
          setExtraNumbers(strMap);
        }
        if (myVote.extraCompleted) {
          setExtraCompletedLocal(true);
          setShowExtraPrompt(false);
        }
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [roundId, guestId]);

  const mySelectedOption = localVotedMap[roundId] || null;
  const isPollActive = pollStatus === 'active';

  const numericMap = useMemo(() => parseNumericRecord(extraNumbers), [extraNumbers]);
  const extraCheck = useMemo(
    () => isExtraDetailsComplete(extraGroups, extraChoices, numericMap),
    [extraGroups, extraChoices, numericMap]
  );

  const canShowResults =
    Boolean(activePoll?.showResultsToVoters) &&
    (Boolean(mySelectedOption) || pollStatus === 'closed');

  const analytics = useMemo(
    () => computeVoteAnalytics(activePoll, [], votes),
    [activePoll, votes]
  );

  const persistExtraToServer = async (
    nextChoices: Record<string, { itemId: string; label: string }>,
    nextNumbersRaw: Record<string, string>
  ) => {
    const parsedNums = parseNumericRecord(nextNumbersRaw);
    const check = isExtraDetailsComplete(extraGroups, nextChoices, parsedNums);
    setIsSavingExtra(true);
    try {
      await submitVoteExtraDetails(
        roundId,
        { voterId: guestId, voterType: 'guest' },
        {
          extraChoices: nextChoices,
          extraNumbers: parsedNums,
          extraCompleted: check.complete,
        }
      );
      if (check.complete) {
        setExtraCompletedLocal(true);
        setShowExtraPrompt(false);
        setFeedbackMsg(
          `تم تسجيل تصويتك (${mySelectedOption?.label || ''}) والتفاصيل الإضافية بنجاح`
        );
      } else {
        setExtraCompletedLocal(false);
        setShowExtraPrompt(true);
      }
    } catch {
      setFeedbackMsg('تعذر حفظ التفاصيل الإضافية، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsSavingExtra(false);
    }
  };

  const handleVote = async (opt: VoteOption) => {
    if (!isPollActive || submittingOptionId) return;
    if (mySelectedOption && !activePoll.allowChangeVote) return;

    setSubmittingOptionId(opt.id);
    setFeedbackMsg(null);

    const parsedNums = parseNumericRecord(extraNumbers);
    const check = isExtraDetailsComplete(extraGroups, extraChoices, parsedNums);

    try {
      const res = await submitVoteChoice(
        roundId,
        { voterId: guestId, voterType: 'guest' },
        opt,
        Boolean(activePoll.allowChangeVote),
        {
          extraChoices,
          extraNumbers: parsedNums,
          extraCompleted: check.complete,
        }
      );

      if (res.success) {
        setLocalVotedMap((prev) => ({ ...prev, [roundId]: opt }));
        if (check.complete) {
          setExtraCompletedLocal(true);
          setShowExtraPrompt(false);
          setFeedbackMsg(`تم تسجيل تصويتك بنجاح: ${opt.label}`);
        } else {
          setExtraCompletedLocal(false);
          setShowExtraPrompt(true);
          setFeedbackMsg(
            `تم اختيار (${opt.label}) — أرجو أن تجيب على التفاصيل الإضافية أدناه: ${check.missingGroupNames.join(' ، ')}`
          );
        }
      } else if (res.alreadyVoted) {
        setFeedbackMsg('تم تسجيل تصويتك في هذه الجولة مسبقاً.');
      }
    } catch {
      setFeedbackMsg('تعذر تسجيل الصوت، يرجى المحاولة مجدداً.');
    } finally {
      setSubmittingOptionId(null);
    }
  };

  const handleSelectExtraChoice = (group: VoteExtraGroup, item: VoteExtraItem) => {
    const nextChoices = {
      ...extraChoices,
      [group.id]: { itemId: item.id, label: item.label },
    };
    setExtraChoices(nextChoices);

    if (mySelectedOption && isPollActive) {
      const check = isExtraDetailsComplete(extraGroups, nextChoices, parseNumericRecord(extraNumbers));
      // Auto-save immediately whenever user already picked main option (especially on single-tap choice groups!)
      const hasUnfilledNumber = extraGroups.some((g) =>
        g.items.some((i) => i.inputType === 'number' && !String(extraNumbers[`${g.id}__${i.id}`] || '').trim())
      );
      if (check.complete || !hasUnfilledNumber) {
        persistExtraToServer(nextChoices, extraNumbers);
      }
    }
  };

  const handleChangeExtraNumber = (groupId: string, itemId: string, rawVal: string) => {
    setExtraNumbers((prev) => ({ ...prev, [`${groupId}__${itemId}`]: rawVal }));
  };

  const handleConfirmExtra = () => {
    if (!mySelectedOption || !isPollActive) return;
    persistExtraToServer(extraChoices, extraNumbers);
  };

  const logoUrl = formatDriveImageUrl(headerConfig?.logoUrl || '');

  return (
    <div
      className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 font-sans"
      dir="rtl"
    >
      {/* Simple Clean Branding Header */}
      <header className="max-w-lg w-full mx-auto flex items-center justify-center gap-3 pt-2 pb-4">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={headerConfig?.title || 'الشعار'}
            className="w-11 h-11 rounded-2xl object-cover border border-slate-800 bg-slate-900"
            onError={(e) => {
              (e.currentTarget as HTMLElement).style.display = 'none';
            }}
          />
        ) : null}
        {headerConfig?.title && (
          <h1 className="text-base sm:text-lg font-black text-white">{headerConfig.title}</h1>
        )}
      </header>

      {/* Main Public Voting Card */}
      <main className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6 text-center">
          {pollStatus === 'exited' ? (
            /* EXITED & RESET THANK YOU SCREEN */
            <div className="space-y-4 py-6">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 mx-auto flex items-center justify-center">
                <Award className="w-8 h-8" />
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white">
                شكراً لمشاركتكم وتفاعلكم في التصويت!
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                تم إنهاء جلسة التصويت وتصفير الذاكرة بنجاح. إذا أطلق المحاضر سؤالاً جديداً سيظهر هنا تلقائياً كصفحة جديدة.
              </p>
            </div>
          ) : !isPollActive ? (
            /* IDLE OR CLOSED SCREEN */
            <div className="space-y-4 py-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 text-amber-400 mx-auto flex items-center justify-center">
                <Clock className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-white">
                {pollStatus === 'closed'
                  ? 'انتهى التصويت الحالي'
                  : 'في انتظار بدء التصويت المباشر'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                {pollStatus === 'closed'
                  ? 'شكراً لمشاركتكم، ستظهر جولة التصويت الجديدة هنا تلقائياً عند فتحها.'
                  : 'أبقِ هذه الصفحة مفتوحة؛ بمجرد أن يبدأ المحاضر التصويت ستظهر الأزرار هنا فوراً.'}
              </p>

              {canShowResults && activePoll.options.length > 0 && (
                <div className="pt-4 border-t border-slate-800 text-right space-y-4">
                  <div className="text-xs font-bold text-slate-300 text-center">
                    {activePoll.question} (إجمالي الأصوات: {analytics.totalVoted})
                  </div>
                  <VoteChartRenderer
                    entries={analytics.optionStats}
                    chartType={activePoll.primaryChartType || 'horizontal_bar'}
                    totalVotes={analytics.totalVoted}
                    size="compact"
                  />
                  {analytics.extraGroupAnalytics.map((ga) => (
                    <div key={ga.group.id} className="pt-3 border-t border-slate-800/80 space-y-2">
                      <div className="text-[11px] font-black text-sky-300">{ga.group.name}</div>
                      {ga.hasChoiceItems && (
                        <VoteChartRenderer
                          entries={ga.choiceEntries}
                          chartType={activePoll.extraChartType || 'horizontal_bar'}
                          totalVotes={analytics.totalVoted}
                          size="compact"
                        />
                      )}
                      {ga.numberFields.map((nf) => (
                        <VoteChartRenderer
                          key={nf.item.id}
                          entries={nf.bracketEntries}
                          chartType={activePoll.extraChartType || 'horizontal_bar'}
                          totalVotes={analytics.totalVoted}
                          size="compact"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            /* ACTIVE POLL VIEW */
            <>
              <div className="space-y-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                  <Vote className="w-4 h-4" />
                  <span>تصويت مباشر</span>
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-white leading-snug">
                  {activePoll.question}
                </h2>
              </div>

              {/* Large Primary Tap Voting Buttons */}
              <div
                className={`grid gap-3 ${
                  activePoll.options.length === 2 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                }`}
              >
                {activePoll.options.map((opt) => {
                  const isChosen = mySelectedOption?.id === opt.id;
                  const isLocked = Boolean(mySelectedOption) && !activePoll.allowChangeVote;
                  const isBusyBtn = submittingOptionId === opt.id;
                  const colorCls = GUEST_BUTTON_CLASSES[opt.color || 'emerald'];

                  return (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={isLocked || Boolean(submittingOptionId)}
                      onClick={() => handleVote(opt)}
                      className={`w-full py-4 px-5 rounded-2xl border font-black text-base sm:text-lg transition-all flex items-center justify-center gap-2.5 shadow-lg cursor-pointer active:scale-[0.98] min-h-[56px] ${
                        isChosen
                          ? `${colorCls} ring-4 ring-white/70`
                          : isLocked
                          ? 'bg-slate-800/70 border-slate-700 text-slate-500 cursor-not-allowed shadow-none'
                          : colorCls
                      }`}
                    >
                      {isBusyBtn ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : isChosen ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : null}
                      <span>{opt.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Compact Mandatory Additional Details Underneath Primary Buttons */}
              {extraGroups.length > 0 && (
                <VoterExtraDetailsBox
                  extraGroups={extraGroups}
                  extraChoices={extraChoices}
                  extraNumbers={extraNumbers}
                  missingGroupIds={extraCheck.missingGroupIds}
                  missingGroupNames={extraCheck.missingGroupNames}
                  showUrgentPrompt={showExtraPrompt}
                  hasPrimaryVote={Boolean(mySelectedOption)}
                  isSavingExtra={isSavingExtra}
                  extraCompleted={extraCompletedLocal}
                  disabled={!isPollActive}
                  onSelectChoice={handleSelectExtraChoice}
                  onChangeNumber={handleChangeExtraNumber}
                  onConfirmExtra={handleConfirmExtra}
                />
              )}

              {/* Confirmation / Prompt Feedback */}
              {(mySelectedOption || feedbackMsg) && (
                <div
                  className={`p-3.5 rounded-2xl border text-xs sm:text-sm font-bold flex items-center justify-center gap-2 ${
                    extraGroups.length > 0 && !extraCheck.complete
                      ? 'bg-amber-500/10 border-amber-500/40 text-amber-200'
                      : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                  }`}
                >
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {feedbackMsg || `تم تسجيل تصويتك: ${mySelectedOption?.label}`}
                  </span>
                </div>
              )}

              {/* Live Results if allowed by teacher */}
              {canShowResults && (
                <div className="pt-4 border-t border-slate-800 text-right space-y-4">
                  <div className="text-xs font-bold text-slate-400">
                    النتائج المباشرة (إجمالي المصوّتين: {analytics.totalVoted})
                  </div>
                  <VoteChartRenderer
                    entries={analytics.optionStats}
                    chartType={activePoll.primaryChartType || 'horizontal_bar'}
                    totalVotes={analytics.totalVoted}
                    size="compact"
                  />
                  {analytics.extraGroupAnalytics.map((ga) => (
                    <div key={ga.group.id} className="pt-3 border-t border-slate-800/80 space-y-2">
                      <div className="text-[11px] font-black text-sky-300">{ga.group.name}</div>
                      {ga.hasChoiceItems && (
                        <VoteChartRenderer
                          entries={ga.choiceEntries}
                          chartType={activePoll.extraChartType || 'horizontal_bar'}
                          totalVotes={analytics.totalVoted}
                          size="compact"
                        />
                      )}
                      {ga.numberFields.map((nf) => (
                        <VoteChartRenderer
                          key={nf.item.id}
                          entries={nf.bracketEntries}
                          chartType={activePoll.extraChartType || 'horizontal_bar'}
                          totalVotes={analytics.totalVoted}
                          size="compact"
                        />
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>

      <footer className="py-3 text-center text-[11px] text-slate-500">
        تصويت مباشر فوري
      </footer>
    </div>
  );
}
