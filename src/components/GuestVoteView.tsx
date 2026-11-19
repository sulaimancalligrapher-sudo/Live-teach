import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, Loader2, Vote } from 'lucide-react';
import {
  HeaderConfig,
  VoteButtonColor,
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
  subscribeToVotingConfig,
  subscribeToVotingRoundActivity,
} from '../api';

const GUEST_BUTTON_CLASSES: Record<VoteButtonColor, string> = {
  emerald: 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/60 shadow-emerald-600/20',
  rose: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400/60 shadow-rose-600/20',
  sky: 'bg-sky-600 hover:bg-sky-500 text-white border-sky-400/60 shadow-sky-600/20',
  purple: 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400/60 shadow-purple-600/20',
  amber: 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300 shadow-amber-500/20',
  slate: 'bg-slate-700 hover:bg-slate-600 text-white border-slate-500 shadow-slate-700/20',
};

const BAR_COLOR_CLASSES: Record<VoteButtonColor, string> = {
  emerald: 'bg-emerald-500',
  rose: 'bg-rose-500',
  sky: 'bg-sky-500',
  purple: 'bg-purple-500',
  amber: 'bg-amber-500',
  slate: 'bg-slate-400',
};

export default function GuestVoteView() {
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [votingState, setVotingState] = useState<VotingConfigState>(defaultVotingConfigState);
  const [votes, setVotes] = useState<VoteSubmissionRecord[]>([]);
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null);
  const [localVotedMap, setLocalVotedMap] = useState<Record<string, VoteOption>>({});
  const [feedbackMsg, setFeedbackMsg] = useState<string | null>(null);

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

  // Register device presence immediately when opening guest vote page during an active poll
  useEffect(() => {
    if (!roundId || activePoll?.status !== 'active') return;
    registerVoteParticipant(roundId, {
      voterId: guestId,
      voterType: 'guest',
    });
  }, [roundId, activePoll?.status, guestId]);

  // Subscribe to round votes (to restore own vote on refresh & display public results if enabled)
  useEffect(() => {
    if (!roundId) return;
    const unsub = subscribeToVotingRoundActivity(roundId, ({ votes: v }) => {
      setVotes(v);
      const myVote = v.find((item) => item.voterId === guestId);
      if (myVote) {
        setLocalVotedMap((prev) => ({
          ...prev,
          [roundId]: { id: myVote.optionId, label: myVote.optionLabel },
        }));
      }
    });
    return () => unsub();
  }, [roundId, guestId]);

  const mySelectedOption = localVotedMap[roundId] || null;
  const isPollActive = activePoll?.status === 'active';
  const canShowResults =
    Boolean(activePoll?.showResultsToVoters) &&
    (Boolean(mySelectedOption) || activePoll?.status === 'closed');

  const handleVote = async (opt: VoteOption) => {
    if (!isPollActive || submittingOptionId) return;
    if (mySelectedOption && !activePoll.allowChangeVote) return;

    setSubmittingOptionId(opt.id);
    setFeedbackMsg(null);
    try {
      const res = await submitVoteChoice(
        roundId,
        { voterId: guestId, voterType: 'guest' },
        opt,
        Boolean(activePoll.allowChangeVote)
      );
      if (res.success) {
        setLocalVotedMap((prev) => ({ ...prev, [roundId]: opt }));
        setFeedbackMsg(`تم تسجيل تصويتك بنجاح: ${opt.label}`);
      } else if (res.alreadyVoted) {
        setFeedbackMsg('تم تسجيل تصويتك في هذه الجولة مسبقاً.');
      }
    } catch {
      setFeedbackMsg('تعذر تسجيل الصوت، يرجى المحاولة مجدداً.');
    } finally {
      setSubmittingOptionId(null);
    }
  };

  const totalVotes = votes.length;
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
          {!isPollActive ? (
            <div className="space-y-4 py-6">
              <div className="w-16 h-16 rounded-2xl bg-slate-800 text-amber-400 mx-auto flex items-center justify-center">
                <Clock className="w-8 h-8" />
              </div>
              <h2 className="text-xl font-black text-white">
                {activePoll?.status === 'closed'
                  ? 'انتهى التصويت الحالي'
                  : 'في انتظار بدء التصويت المباشر'}
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                {activePoll?.status === 'closed'
                  ? 'شكراً لمشاركتكم، ستظهر جولة التصويت الجديدة هنا تلقائياً عند فتحها.'
                  : 'أبقِ هذه الصفحة مفتوحة؛ بمجرد أن يبدأ المحاضر التصويت ستظهر الأزرار هنا فوراً.'}
              </p>

              {canShowResults && activePoll.options.length > 0 && (
                <div className="pt-4 border-t border-slate-800 text-right space-y-3">
                  <div className="text-xs font-bold text-slate-300 text-center">
                    {activePoll.question} (إجمالي الأصوات: {totalVotes})
                  </div>
                  {activePoll.options.map((opt) => {
                    const count = votes.filter(
                      (v) => v.optionId === opt.id || v.optionLabel === opt.label
                    ).length;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    return (
                      <div key={opt.id} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span>{opt.label}</span>
                          <span className="font-mono text-slate-300">
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-lg bg-slate-950 overflow-hidden">
                          <div
                            className={`h-full ${BAR_COLOR_CLASSES[opt.color || 'emerald']} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
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

              {/* Large Tap Voting Buttons */}
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

              {/* Confirmation */}
              {(mySelectedOption || feedbackMsg) && (
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs sm:text-sm font-bold flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  <span>
                    {feedbackMsg || `تم تسجيل تصويتك: ${mySelectedOption?.label}`}
                  </span>
                </div>
              )}

              {/* Live Results if allowed by teacher */}
              {canShowResults && (
                <div className="pt-4 border-t border-slate-800 text-right space-y-3">
                  <div className="text-xs font-bold text-slate-400">
                    النتائج المباشرة (إجمالي المصوّتين: {totalVotes})
                  </div>
                  {activePoll.options.map((opt) => {
                    const count = votes.filter(
                      (v) => v.optionId === opt.id || v.optionLabel === opt.label
                    ).length;
                    const pct = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                    return (
                      <div key={opt.id} className="space-y-1">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-200">{opt.label}</span>
                          <span className="font-mono text-slate-300">
                            {count} ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-3 rounded-lg bg-slate-950 overflow-hidden">
                          <div
                            className={`h-full ${BAR_COLOR_CLASSES[opt.color || 'emerald']} transition-all`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
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
