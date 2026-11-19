import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Plus,
  Trash2,
  Play,
  Square,
  RotateCcw,
  QrCode,
  Copy,
  CheckCircle2,
  ExternalLink,
  FileSpreadsheet,
  Users,
  UserCheck,
  Clock,
  Eye,
  EyeOff,
  Sliders,
  Vote,
  X,
  ArrowLeft,
  Monitor,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import {
  LiveConnectedStudent,
  VoteButtonColor,
  VoteOption,
  VoteParticipantRecord,
  VotePresetOptionSet,
  VotePresetQuestion,
  VoteSheetRecord,
  VoteSubmissionRecord,
  VotingConfigState,
} from '../types';
import {
  DEFAULT_VOTE_PRESET_OPTION_SETS,
  DEFAULT_VOTE_PRESET_QUESTIONS,
  closeActivePoll,
  defaultVotingConfigState,
  fetchVoteResultsFromSheet,
  resetPollRound,
  saveVoteResultToSheetApi,
  saveVotingPresets,
  setupVotesSheetApi,
  startOrUpdatePoll,
  subscribeToVotingConfig,
  subscribeToVotingRoundActivity,
  updateVotingSettings,
} from '../api';

interface VotingManagerPanelProps {
  mode?: 'admin' | 'quick' | 'teacher-monitor';
  connectedStudents?: LiveConnectedStudent[];
  onNotice?: (text: string, type: 'success' | 'error') => void;
  onBack?: () => void;
  onOpenBigScreen?: () => void;
}

const COLOR_STYLES: Record<
  VoteButtonColor,
  { badge: string; bar: string; btn: string; dot: string; label: string }
> = {
  emerald: {
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35',
    bar: 'bg-emerald-500',
    btn: 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400',
    dot: 'bg-emerald-400',
    label: 'أخضر',
  },
  rose: {
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/35',
    bar: 'bg-rose-500',
    btn: 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400',
    dot: 'bg-rose-400',
    label: 'أحمر',
  },
  sky: {
    badge: 'bg-sky-500/15 text-sky-300 border-sky-500/35',
    bar: 'bg-sky-500',
    btn: 'bg-sky-600 hover:bg-sky-500 text-white border-sky-400',
    dot: 'bg-sky-400',
    label: 'أزرق',
  },
  purple: {
    badge: 'bg-purple-500/15 text-purple-300 border-purple-500/35',
    bar: 'bg-purple-500',
    btn: 'bg-purple-600 hover:bg-purple-500 text-white border-purple-400',
    dot: 'bg-purple-400',
    label: 'بنفسجي',
  },
  amber: {
    badge: 'bg-amber-500/15 text-amber-300 border-amber-500/35',
    bar: 'bg-amber-500',
    btn: 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-300',
    dot: 'bg-amber-400',
    label: 'ذهبي',
  },
  slate: {
    badge: 'bg-slate-700/60 text-slate-200 border-slate-600',
    bar: 'bg-slate-400',
    btn: 'bg-slate-700 hover:bg-slate-600 text-white border-slate-500',
    dot: 'bg-slate-400',
    label: 'رمادي',
  },
};

export default function VotingManagerPanel({
  mode = 'admin',
  connectedStudents = [],
  onNotice,
  onBack,
  onOpenBigScreen,
}: VotingManagerPanelProps) {
  const [votingState, setVotingState] = useState<VotingConfigState>(defaultVotingConfigState);
  const [participants, setParticipants] = useState<VoteParticipantRecord[]>([]);
  const [votes, setVotes] = useState<VoteSubmissionRecord[]>([]);

  // Draft selections (updated automatically when tapping preset check/radio tiles)
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(DEFAULT_VOTE_PRESET_QUESTIONS[0].id);
  const [customQuestionText, setCustomQuestionText] = useState<string>(DEFAULT_VOTE_PRESET_QUESTIONS[0].text);
  const [showCustomQuestionInput, setShowCustomQuestionInput] = useState(false);

  const [selectedOptionSetId, setSelectedOptionSetId] = useState<string>(DEFAULT_VOTE_PRESET_OPTION_SETS[0].id);
  const [draftOptions, setDraftOptions] = useState<VoteOption[]>(DEFAULT_VOTE_PRESET_OPTION_SETS[0].options);

  // Add new preset question modal/inline state
  const [showAddQuestionForm, setShowAddQuestionForm] = useState(false);
  const [newPresetQuestionText, setNewPresetQuestionText] = useState('');
  const [newPresetQuestionSetId, setNewPresetQuestionSetId] = useState<string>('yes_no');

  // Add new preset button set form
  const [showAddButtonSetForm, setShowAddButtonSetForm] = useState(false);
  const [newSetName, setNewSetName] = useState('');
  const [newSetOptions, setNewSetOptions] = useState<VoteOption[]>([
    { id: 'new_opt_1', label: '', color: 'emerald' },
    { id: 'new_opt_2', label: '', color: 'rose' },
  ]);

  // Operations state
  const [isBusy, setIsBusy] = useState(false);
  const [isSavingSheet, setIsSavingSheet] = useState(false);
  const [isSettingUpSheet, setIsSettingUpSheet] = useState(false);
  const [copiedGuestLink, setCopiedGuestLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [localToast, setLocalToast] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Sheet history
  const [sheetHistory, setSheetHistory] = useState<VoteSheetRecord[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const notify = (text: string, type: 'success' | 'error' = 'success') => {
    setLocalToast({ text, type });
    setTimeout(() => setLocalToast(null), 4000);
    if (onNotice) onNotice(text, type);
  };

  // Subscribe to Firestore Voting config
  useEffect(() => {
    const unsub = subscribeToVotingConfig((state) => {
      setVotingState(state);
    });
    return () => unsub();
  }, []);

  // Subscribe to participants and votes for the active roundId
  const activeRoundId = votingState.activePoll?.roundId || '';
  useEffect(() => {
    if (!activeRoundId) return;
    const unsub = subscribeToVotingRoundActivity(activeRoundId, ({ participants: p, votes: v }) => {
      setParticipants(p);
      setVotes(v);
    });
    return () => unsub();
  }, [activeRoundId]);

  // Load saved Vote Results history in Admin mode
  const loadSheetHistory = async () => {
    setLoadingHistory(true);
    try {
      const res = await fetchVoteResultsFromSheet();
      if (res.success) {
        setSheetHistory(res.data || []);
      }
    } catch {
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (mode === 'admin') {
      loadSheetHistory();
    }
  }, [mode]);

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const guestVoteUrl = `${baseUrl}/?page=vote`;
  const teacherMonitorUrl = `${baseUrl}/?page=vote-teacher`;

  useEffect(() => {
    if (!guestVoteUrl) return;
    QRCode.toDataURL(guestVoteUrl, { width: 280, margin: 1 })
      .then((u) => setQrDataUrl(u))
      .catch(() => {});
  }, [guestVoteUrl, showQrModal]);

  const presetQuestions = votingState.presetQuestions || DEFAULT_VOTE_PRESET_QUESTIONS;
  const presetOptionSets = votingState.presetOptionSets || DEFAULT_VOTE_PRESET_OPTION_SETS;
  const activePoll = votingState.activePoll;

  // Computed live metrics
  const stats = useMemo(() => {
    const activeOptions = activePoll?.options || [];
    const uniqueVoterIds = new Set<string>();
    const participantMap = new Map<string, VoteParticipantRecord>();

    participants.forEach((p) => {
      if (p.voterId) {
        uniqueVoterIds.add(p.voterId);
        participantMap.set(p.voterId, p);
      }
    });
    votes.forEach((v) => {
      if (v.voterId) uniqueVoterIds.add(v.voterId);
    });

    const totalEntered = uniqueVoterIds.size;
    const totalVoted = votes.length;
    const notVoted = Math.max(0, totalEntered - totalVoted);

    const optionStats = activeOptions.map((opt) => {
      const count = votes.filter((v) => v.optionId === opt.id || v.optionLabel === opt.label).length;
      const percent = totalVoted > 0 ? Math.round((count / totalVoted) * 100) : 0;
      return {
        ...opt,
        count,
        percent,
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

    return {
      totalEntered,
      totalVoted,
      notVoted,
      optionStats,
      studentVotes,
      guestVotes,
      guestParticipantsCount,
      studentParticipantsCount,
      unvotedRegistered,
    };
  }, [activePoll?.options, participants, votes]);

  // Preset Tap Handlers (NO typing needed!)
  const handleSelectPresetQuestion = (pq: VotePresetQuestion) => {
    setSelectedQuestionId(pq.id);
    setCustomQuestionText(pq.text);
    setShowCustomQuestionInput(false);

    if (pq.defaultOptionSetId) {
      const foundSet = presetOptionSets.find((s) => s.id === pq.defaultOptionSetId);
      if (foundSet) {
        setSelectedOptionSetId(foundSet.id);
        setDraftOptions(foundSet.options);
      }
    }
  };

  const handleSelectPresetOptionSet = (setItem: VotePresetOptionSet) => {
    setSelectedOptionSetId(setItem.id);
    setDraftOptions(setItem.options);
  };

  const handleAddPresetQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = newPresetQuestionText.trim();
    if (!txt) return;

    const newItem: VotePresetQuestion = {
      id: `pq_${Date.now()}`,
      text: txt,
      defaultOptionSetId: newPresetQuestionSetId || undefined,
      isCustom: true,
    };
    const nextQuestions = [...presetQuestions, newItem];
    try {
      await saveVotingPresets(nextQuestions, presetOptionSets);
      setSelectedQuestionId(newItem.id);
      setCustomQuestionText(newItem.text);
      if (newPresetQuestionSetId) {
        const s = presetOptionSets.find((x) => x.id === newPresetQuestionSetId);
        if (s) {
          setSelectedOptionSetId(s.id);
          setDraftOptions(s.options);
        }
      }
      setNewPresetQuestionText('');
      setShowAddQuestionForm(false);
      notify('تمت إضافة السؤال الافتراضي بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر حفظ السؤال الافتراضي', 'error');
    }
  };

  const handleDeletePresetQuestion = async (id: string) => {
    const nextQuestions = presetQuestions.filter((q) => q.id !== id);
    if (nextQuestions.length === 0) return;
    try {
      await saveVotingPresets(nextQuestions, presetOptionSets);
      if (selectedQuestionId === id) {
        setSelectedQuestionId(nextQuestions[0].id);
        setCustomQuestionText(nextQuestions[0].text);
      }
      notify('تم حذف السؤال من القائمة');
    } catch (err: any) {
      notify(err?.message || 'تعذر الحذف', 'error');
    }
  };

  const handleAddPresetButtonSet = async (e: React.FormEvent) => {
    e.preventDefault();
    const validOpts = newSetOptions
      .map((o, idx) => ({
        id: `opt_${Date.now()}_${idx + 1}`,
        label: o.label.trim(),
        color: o.color || 'emerald',
      }))
      .filter((o) => o.label.length > 0);

    if (validOpts.length < 2) {
      notify('يرجى إدخال زرين على الأقل لمجموعة الأزرار', 'error');
      return;
    }

    const labelName = newSetName.trim() || validOpts.map((o) => o.label).join(' / ');
    const newSet: VotePresetOptionSet = {
      id: `set_${Date.now()}`,
      name: labelName,
      options: validOpts,
      isCustom: true,
    };
    const nextSets = [...presetOptionSets, newSet];

    try {
      await saveVotingPresets(presetQuestions, nextSets);
      setSelectedOptionSetId(newSet.id);
      setDraftOptions(newSet.options);
      setNewSetName('');
      setNewSetOptions([
        { id: 'new_opt_1', label: '', color: 'emerald' },
        { id: 'new_opt_2', label: '', color: 'rose' },
      ]);
      setShowAddButtonSetForm(false);
      notify('تمت إضافة مجموعة الأزرار الافتراضية بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر إضافة مجموعة الأزرار', 'error');
    }
  };

  const handleDeletePresetButtonSet = async (id: string) => {
    const nextSets = presetOptionSets.filter((s) => s.id !== id);
    if (nextSets.length === 0) return;
    try {
      await saveVotingPresets(presetQuestions, nextSets);
      if (selectedOptionSetId === id) {
        setSelectedOptionSetId(nextSets[0].id);
        setDraftOptions(nextSets[0].options);
      }
      notify('تم حذف مجموعة الأزرار');
    } catch (err: any) {
      notify(err?.message || 'تعذر الحذف', 'error');
    }
  };

  const handleStartPoll = async (forceNewRound: boolean = false) => {
    setIsBusy(true);
    try {
      await startOrUpdatePoll({
        question: customQuestionText.trim() || DEFAULT_VOTE_PRESET_QUESTIONS[0].text,
        options: draftOptions,
        newRound: forceNewRound,
      });
      notify(forceNewRound ? 'تم بدء جولة تصويت جديدة وإظهارها للجميع' : 'تم تفعيل التصويت وإظهاره للمسجلين والضيوف');
    } catch (err: any) {
      notify(err?.message || 'تعذر بدء التصويت', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleClosePoll = async () => {
    setIsBusy(true);
    try {
      await closeActivePoll();
      notify('تم إغلاق التصويت بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر إغلاق التصويت', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleResetPoll = async () => {
    setIsBusy(true);
    try {
      await resetPollRound(false);
      notify('تم تصفير العدّادات وفتح جولة جديدة');
    } catch (err: any) {
      notify(err?.message || 'تعذر تصفير التصويت', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveResultToSheet = async () => {
    setIsSavingSheet(true);
    try {
      const summaryText = stats.optionStats
        .map((o) => `${o.label}: ${o.count} (${o.percent}%)`)
        .join(' | ');
      const studentsText =
        stats.studentVotes.length > 0
          ? stats.studentVotes.map((s) => `${s.name || 'طالب'}: ${s.optionLabel}`).join(' ، ')
          : `ضيوف: ${stats.guestVotes.length}`;

      const res = await saveVoteResultToSheetApi({
        timestamp: new Date().toLocaleString('en-GB', { hour12: false }),
        roundId: activePoll.roundId,
        question: activePoll.question,
        totalEntered: stats.totalEntered,
        totalVoted: stats.totalVoted,
        notVoted: stats.notVoted,
        summaryText,
        votersBreakdown: studentsText,
        notes: `مسجلون: ${stats.studentVotes.length} | ضيوف: ${stats.guestVotes.length}`,
      });
      if (res.success) {
        notify(res.message || 'تم تسجيل نتيجة التصويت في ورقة Votes-Results بنجاح');
        if (mode === 'admin') loadSheetHistory();
      } else {
        notify(res.message || 'فشل الحفظ في الشيت', 'error');
      }
    } catch (err: any) {
      notify(err?.message || 'تعذر تسجيل النتيجة', 'error');
    } finally {
      setIsSavingSheet(false);
    }
  };

  const handleSetupVotesSheet = async () => {
    setIsSettingUpSheet(true);
    try {
      const res = await setupVotesSheetApi();
      if (res.success) {
        notify(res.message || 'تمت تهيئة ورقة Votes-Results بنجاح');
        if (mode === 'admin') loadSheetHistory();
      } else {
        notify(res.message || 'تعذر تهيئة الورقة', 'error');
      }
    } catch (err: any) {
      notify(err?.message || 'حدث خطأ أثناء التهيئة', 'error');
    } finally {
      setIsSettingUpSheet(false);
    }
  };

  const copyGuestLink = () => {
    navigator.clipboard.writeText(guestVoteUrl);
    setCopiedGuestLink(true);
    setTimeout(() => setCopiedGuestLink(false), 2500);
  };

  const isPollActive = activePoll?.status === 'active';

  // Standalone Teacher Monitor Mode (?page=vote-teacher)
  if (mode === 'teacher-monitor') {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 p-4 sm:p-8 font-sans" dir="rtl">
        <div className="max-w-5xl mx-auto space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 flex items-center justify-center">
                <Vote className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-black text-white">شاشة نتائج التصويت المباشر — المعلم</h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  متابعة لحظية للدخول الكلي، المصوّتين، ومن لم يصوّتوا بعد (مسجلين + ضيوف QR)
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowQrModal(true)}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
              >
                <QrCode className="w-4 h-4" />
                <span>QR الضيوف</span>
              </button>
              <button
                type="button"
                onClick={handleSaveResultToSheet}
                disabled={isSavingSheet}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <FileSpreadsheet className="w-4 h-4" />
                <span>{isSavingSheet ? 'جارٍ الحفظ...' : 'حفظ في الشيت'}</span>
              </button>
              {onBack && (
                <button
                  type="button"
                  onClick={onBack}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>عودة</span>
                </button>
              )}
            </div>
          </div>

          {localToast && (
            <div
              className={`p-3 rounded-xl text-xs font-bold border ${
                localToast.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
                  : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
              }`}
            >
              {localToast.text}
            </div>
          )}

          {/* Active Question Banner */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span
                className={`text-xs font-black px-3 py-1 rounded-lg border ${
                  isPollActive
                    ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/35'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {isPollActive ? 'التصويت مفتوح الآن' : activePoll.status === 'closed' ? 'التصويت مغلق' : 'في انتظار البدء'}
              </span>

              <div className="flex items-center gap-2">
                {isPollActive ? (
                  <button
                    type="button"
                    onClick={handleClosePoll}
                    disabled={isBusy}
                    className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Square className="w-3.5 h-3.5" />
                    <span>إغلاق التصويت</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleStartPoll(true)}
                    disabled={isBusy}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span>تشغيل جولة جديدة</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetPoll}
                  disabled={isBusy}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>تصفير</span>
                </button>
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-black text-white leading-snug">
              {activePoll.question}
            </h2>
          </div>

          {/* 3 Main Counters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400">إجمالي الدخول الكلي</div>
                <div className="text-3xl font-black font-mono text-sky-400 mt-1">{stats.totalEntered}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  مسجلون: {stats.studentParticipantsCount} · ضيوف: {stats.guestParticipantsCount}
                </div>
              </div>
              <Users className="w-9 h-9 text-sky-500/40" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400">عدد المصوّتين فعلياً</div>
                <div className="text-3xl font-black font-mono text-emerald-400 mt-1">{stats.totalVoted}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  نسبة المشاركة: {stats.totalEntered > 0 ? Math.round((stats.totalVoted / stats.totalEntered) * 100) : 0}%
                </div>
              </div>
              <UserCheck className="w-9 h-9 text-emerald-500/40" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400">عدد من لم يصوّتوا بعد</div>
                <div className="text-3xl font-black font-mono text-amber-400 mt-1">{stats.notVoted}</div>
                <div className="text-[11px] text-slate-500 mt-1">منتظرون داخل صفحة التصويت</div>
              </div>
              <Clock className="w-9 h-9 text-amber-500/40" />
            </div>
          </div>

          {/* Live Option Bars */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-200">توزيع الأصوات حسب الخيارات</h3>
            <div className="space-y-4">
              {stats.optionStats.map((opt) => {
                const style = COLOR_STYLES[opt.color || 'emerald'];
                return (
                  <div key={opt.id} className="space-y-1.5">
                    <div className="flex items-center justify-between text-sm font-bold">
                      <span className="text-white flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                        <span>{opt.label}</span>
                      </span>
                      <span className="font-mono text-slate-200">
                        {opt.count} صوت ({opt.percent}%)
                      </span>
                    </div>
                    <div className="w-full h-4 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                      <div
                        className={`h-full ${style.bar} transition-all duration-500`}
                        style={{ width: `${opt.percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* QR Modal */}
        {showQrModal && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-sm w-full text-center space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-black text-white">رمز التصويت العام للضيوف (QR)</span>
                <button type="button" onClick={() => setShowQrModal(false)} className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer">
                  <X className="w-4 h-4" />
                </button>
              </div>
              {qrDataUrl && (
                <div className="bg-white p-3 rounded-2xl inline-block">
                  <img src={qrDataUrl} alt="Vote QR" className="w-56 h-56 object-contain" />
                </div>
              )}
              <p className="text-xs text-slate-300 leading-relaxed">
                للحاضرين غير المسجلين: مسح الكود يفتح صفحة التصويت فوراً بدون تسجيل أو رقم.
              </p>
              <button
                type="button"
                onClick={copyGuestLink}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
              >
                {copiedGuestLink ? 'تم نسخ الرابط بنجاح' : 'نسخ رابط التصويت العام'}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-5 text-right" dir="rtl">
      {localToast && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center justify-between gap-2 border ${
            localToast.type === 'success'
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-300'
              : 'bg-rose-500/15 border-rose-500/35 text-rose-300'
          }`}
        >
          <span>{localToast.text}</span>
          <button type="button" onClick={() => setLocalToast(null)} className="text-slate-400 hover:text-white cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Quick Control Top Action Row */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
              <Vote className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">
                نظام التصويت المباشر (للمسجلين والضيوف)
              </h3>
              <p className="text-[11px] text-slate-400">
                اختر سؤالاً وأزراراً بالضغط مباشرة بدون كتابة ثم اضغط تشغيل
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isPollActive ? (
              <button
                type="button"
                onClick={handleClosePoll}
                disabled={isBusy}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              >
                <Square className="w-3.5 h-3.5" />
                <span>إغلاق التصويت</span>
              </button>
            ) : null}

            <button
              type="button"
              onClick={() => handleStartPoll(activePoll?.status !== 'active')}
              disabled={isBusy}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isPollActive ? 'تحديث وإظهار للجميع' : 'تشغيل التصويت للجميع'}</span>
            </button>

            <button
              type="button"
              onClick={handleResetPoll}
              disabled={isBusy}
              className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
              title="بدء جولة جديدة وتصفير الأصوات السابقة"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>جولة جديدة (تصفير)</span>
            </button>
          </div>
        </div>

        {/* Share & Teacher Screen Links */}
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
          <button
            type="button"
            onClick={copyGuestLink}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer"
          >
            {copiedGuestLink ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-amber-400" />}
            <span>{copiedGuestLink ? 'تم نسخ رابط الضيوف!' : 'نسخ رابط التصويت العام (بدون تسجيل)'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            className="px-3 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 text-xs font-bold flex items-center gap-1.5 border border-amber-500/30 cursor-pointer"
          >
            <QrCode className="w-3.5 h-3.5" />
            <span>رمز QR للضيوف</span>
          </button>

          <a
            href={teacherMonitorUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 text-xs font-bold flex items-center gap-1.5 border border-sky-500/30 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>صفحة المعلم لنتائج التصويت</span>
          </a>

          {onOpenBigScreen && (
            <button
              type="button"
              onClick={onOpenBigScreen}
              className="px-3 py-1.5 rounded-xl bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 text-xs font-bold flex items-center gap-1.5 border border-purple-500/30 cursor-pointer"
            >
              <Monitor className="w-3.5 h-3.5" />
              <span>عرض على البروجكتر</span>
            </button>
          )}
        </div>

        {/* Toggle Settings */}
        <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
          <button
            type="button"
            onClick={() => updateVotingSettings({ showResultsToVoters: !activePoll.showResultsToVoters })}
            className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activePoll.showResultsToVoters
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            {activePoll.showResultsToVoters ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            <span>إظهار النتائج للمصوّتين: {activePoll.showResultsToVoters ? 'نعم' : 'لا'}</span>
          </button>

          <button
            type="button"
            onClick={() => updateVotingSettings({ allowChangeVote: !activePoll.allowChangeVote })}
            className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activePoll.allowChangeVote
                ? 'bg-sky-500/15 border-sky-500/40 text-sky-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>السماح بتغيير الصوت: {activePoll.allowChangeVote ? 'نعم' : 'لا'}</span>
          </button>

          <button
            type="button"
            onClick={() => updateVotingSettings({ showOnBigScreen: !activePoll.showOnBigScreen })}
            className={`px-3 py-1.5 rounded-xl border font-bold flex items-center gap-1.5 transition cursor-pointer ${
              activePoll.showOnBigScreen
                ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            <span>توجيه البروجكتر للتصويت تلقائياً: {activePoll.showOnBigScreen ? 'نعم' : 'لا'}</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: Preset Questions (Radio/Check Selector Tiles — No Typing Needed!) */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-xs sm:text-sm font-black text-amber-300">
              1. الأسئلة الافتراضية (اختر بنقرة واحدة)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCustomQuestionInput((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              <span>{showCustomQuestionInput ? 'إخفاء التعديل' : 'كتابة / تعديل نص'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAddQuestionForm((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة سؤال افتراضي</span>
            </button>
          </div>
        </div>

        {/* Radio/Checkbox-style clickable tiles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {presetQuestions.map((pq) => {
            const isSelected = selectedQuestionId === pq.id && customQuestionText === pq.text;
            return (
              <div
                key={pq.id}
                onClick={() => handleSelectPresetQuestion(pq)}
                className={`group p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-emerald-500/15 border-emerald-400 text-white shadow-sm'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                      isSelected
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'bg-slate-950 border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                  <span className="text-xs font-bold leading-snug truncate">{pq.text}</span>
                </div>

                {pq.isCustom && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePresetQuestion(pq.id);
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 rounded-lg cursor-pointer shrink-0"
                    title="حذف السؤال"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Optional Custom Text Tweaking */}
        {showCustomQuestionInput && (
          <div className="pt-1">
            <input
              type="text"
              value={customQuestionText}
              onChange={(e) => setCustomQuestionText(e.target.value)}
              placeholder="اكتب نص سؤال التصويت هنا..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 text-xs sm:text-sm font-bold text-white outline-none"
            />
          </div>
        )}

        {/* Inline Add Preset Question Form */}
        {showAddQuestionForm && (
          <form onSubmit={handleAddPresetQuestion} className="p-3 rounded-xl bg-slate-900 border border-amber-500/30 space-y-2.5">
            <div className="text-xs font-bold text-amber-300">حفظ سؤال افتراضي جديد في القائمة</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                value={newPresetQuestionText}
                onChange={(e) => setNewPresetQuestionText(e.target.value)}
                placeholder="مثال: هل تحفظ الآية بالصوت أم بالقراءة؟"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none focus:border-amber-400"
              />
              <select
                value={newPresetQuestionSetId}
                onChange={(e) => setNewPresetQuestionSetId(e.target.value)}
                className="px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200 outline-none"
              >
                {presetOptionSets.map((s) => (
                  <option key={s.id} value={s.id}>
                    الأزرار المرتبطة: {s.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer shrink-0"
              >
                حفظ السؤال
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SECTION 2: Preset Button Sets (Radio/Check Selector Tiles — No Typing Needed!) */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-black text-sky-300">
            2. الأزرار الافتراضية (اختر بنقرة واحدة)
          </span>
          <button
            type="button"
            onClick={() => setShowAddButtonSetForm((v) => !v)}
            className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 text-sky-300 border border-sky-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>إضافة أزرار جديدة</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {presetOptionSets.map((setItem) => {
            const isSelected = selectedOptionSetId === setItem.id;
            return (
              <div
                key={setItem.id}
                onClick={() => handleSelectPresetOptionSet(setItem)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-sky-500/15 border-sky-400 text-white shadow-sm'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 transition ${
                      isSelected
                        ? 'bg-sky-400 border-sky-300'
                        : 'bg-slate-950 border-slate-600'
                    }`}
                  >
                    {isSelected && <span className="w-2 h-2 rounded-full bg-slate-950" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-black truncate">{setItem.name}</div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {setItem.options.map((o) => (
                        <span
                          key={o.id}
                          className="text-[10px] text-slate-400 flex items-center gap-1"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${COLOR_STYLES[o.color || 'emerald'].dot}`} />
                          <span>{o.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {setItem.isCustom && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePresetButtonSet(setItem.id);
                    }}
                    className="p-1 text-slate-500 hover:text-rose-400 rounded-lg cursor-pointer shrink-0"
                    title="حذف المجموعة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Inline Add Button Set Form */}
        {showAddButtonSetForm && (
          <form onSubmit={handleAddPresetButtonSet} className="p-3.5 rounded-xl bg-slate-900 border border-sky-500/30 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-sky-300">إنشاء مجموعة أزرار افتراضية جديدة</span>
              <button
                type="button"
                onClick={() =>
                  setNewSetOptions((prev) => [
                    ...prev,
                    { id: `new_opt_${Date.now()}`, label: '', color: 'amber' },
                  ])
                }
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>زيادة زر</span>
              </button>
            </div>

            <input
              type="text"
              value={newSetName}
              onChange={(e) => setNewSetName(e.target.value)}
              placeholder="اسم المجموعة (اختياري، مثلاً: التقييم العام)"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none focus:border-sky-400"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {newSetOptions.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    required
                    value={opt.label}
                    onChange={(e) =>
                      setNewSetOptions((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                      )
                    }
                    placeholder={`نص الزر ${idx + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none"
                  />
                  <select
                    value={opt.color || 'emerald'}
                    onChange={(e) =>
                      setNewSetOptions((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, color: e.target.value as VoteButtonColor } : item
                        )
                      )
                    }
                    className="px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200 outline-none"
                  >
                    {Object.entries(COLOR_STYLES).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.label}
                      </option>
                    ))}
                  </select>
                  {newSetOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setNewSetOptions((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-2 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddButtonSetForm(false)}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black cursor-pointer"
              >
                حفظ المجموعة
              </button>
            </div>
          </form>
        )}

        {/* Active Preview Strip */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-slate-400">
          <span>السؤال المختار: <b className="text-white">{customQuestionText}</b></span>
          <span aria-hidden="true">·</span>
          <span>الأزرار:</span>
          {draftOptions.map((o) => (
            <span
              key={o.id}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${COLOR_STYLES[o.color || 'emerald'].badge}`}
            >
              {o.label}
            </span>
          ))}
        </div>
      </div>

      {/* SECTION 3: LIVE VOTING RESULTS & COUNTERS */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>النتائج الحية للجولة الحالية</span>
              <span className={`text-[11px] font-bold ${isPollActive ? 'text-emerald-400' : 'text-slate-400'}`}>
                ({isPollActive ? 'مفتوح الآن' : activePoll.status === 'closed' ? 'مغلق' : 'جاهز'})
              </span>
            </h4>
            <p className="text-xs text-slate-400 mt-0.5">{activePoll.question}</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleSaveResultToSheet}
              disabled={isSavingSheet}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              <span>{isSavingSheet ? 'جارٍ التسجيل...' : 'تسجيل النتائج في الشيت'}</span>
            </button>
            <button
              type="button"
              onClick={handleSetupVotesSheet}
              disabled={isSettingUpSheet}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 font-bold text-xs flex items-center gap-1.5 border border-slate-700 cursor-pointer disabled:opacity-50"
              title="إنشاء وتهيئة ورقة Votes-Results في قوقل شيت"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSettingUpSheet ? 'animate-spin' : ''}`} />
              <span>{isSettingUpSheet ? 'جارٍ التهيئة...' : 'تهيئة ورقة الشيت'}</span>
            </button>
          </div>
        </div>

        {/* 3 Real-Time Counters */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400">عدد الدخول الكلي</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-sky-400">{stats.totalEntered}</div>
            <div className="text-[10px] text-slate-500">
              مسجلون: {stats.studentParticipantsCount} · ضيوف: {stats.guestParticipantsCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400">إجمالي المصوّتين</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-emerald-400">{stats.totalVoted}</div>
            <div className="text-[10px] text-slate-500">
              نسبة: {stats.totalEntered > 0 ? Math.round((stats.totalVoted / stats.totalEntered) * 100) : 0}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400">الذين لم يصوّتوا</div>
            <div className="text-xl sm:text-2xl font-black font-mono text-amber-400">{stats.notVoted}</div>
            <div className="text-[10px] text-slate-500">بانتظار النقر</div>
          </div>
        </div>

        {/* Option Breakdown Bars */}
        <div className="space-y-2.5">
          {stats.optionStats.map((opt) => {
            const style = COLOR_STYLES[opt.color || 'emerald'];
            return (
              <div key={opt.id} className="space-y-1">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-slate-100">{opt.label}</span>
                  <span className="font-mono text-slate-300">
                    {opt.count} ({opt.percent}%)
                  </span>
                </div>
                <div className="w-full h-3 rounded-lg bg-slate-900 border border-slate-800 overflow-hidden">
                  <div
                    className={`h-full ${style.bar} transition-all duration-300`}
                    style={{ width: `${opt.percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>

        {/* Registered Students Breakdown (when any registered students joined) */}
        {(stats.studentVotes.length > 0 || stats.unvotedRegistered.length > 0) && (
          <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 max-h-40 overflow-y-auto space-y-1">
              <div className="font-bold text-emerald-400 mb-1.5">
                المسجلون المصوّتون ({stats.studentVotes.length})
              </div>
              {stats.studentVotes.map((sv) => (
                <div key={sv.id} className="flex items-center justify-between text-slate-300">
                  <span className="truncate">{sv.name || 'طالب'}</span>
                  <span className="font-bold text-emerald-300 shrink-0">{sv.optionLabel}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 max-h-40 overflow-y-auto space-y-1">
              <div className="font-bold text-amber-400 mb-1.5">
                مسجلون لم يصوّتوا بعد ({stats.unvotedRegistered.length})
              </div>
              {stats.unvotedRegistered.map((ur) => (
                <div key={ur.id} className="flex items-center justify-between text-slate-300">
                  <span className="truncate">{ur.name || 'طالب'}</span>
                  <span className="text-[11px] text-amber-400">منتظر</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION 4: Sheet Archive (Admin Mode Only) */}
      {mode === 'admin' && (
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
              <span>سجل نتائج التصويت المحفوظة (ورقة Votes-Results)</span>
            </h4>
            <button
              type="button"
              onClick={loadSheetHistory}
              disabled={loadingHistory}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingHistory ? 'animate-spin' : ''}`} />
              <span>تحديث السجل</span>
            </button>
          </div>

          {sheetHistory.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center">
              لا توجد جولات تصويت مسجلة في ورقة Votes-Results بعد.
            </p>
          ) : (
            <div className="overflow-x-auto max-h-64 overflow-y-auto">
              <table className="w-full text-xs text-right border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="py-2 px-2">التاريخ</th>
                    <th className="py-2 px-2">السؤال</th>
                    <th className="py-2 px-2">الدخول</th>
                    <th className="py-2 px-2">المصوّتون</th>
                    <th className="py-2 px-2">لم يصوّت</th>
                    <th className="py-2 px-2">النتيجة</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/70">
                  {sheetHistory.map((row, idx) => (
                    <tr key={`${row.roundId}_${idx}`} className="hover:bg-slate-900/60">
                      <td className="py-2 px-2 text-slate-400 whitespace-nowrap font-mono text-[11px]">
                        {row.timestamp}
                      </td>
                      <td className="py-2 px-2 font-bold text-white">{row.question}</td>
                      <td className="py-2 px-2 font-mono text-sky-400">{row.totalEntered}</td>
                      <td className="py-2 px-2 font-mono text-emerald-400">{row.totalVoted}</td>
                      <td className="py-2 px-2 font-mono text-amber-400">{row.notVoted}</td>
                      <td className="py-2 px-2 text-slate-200">{row.summaryText}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* QR Code Modal for Guests */}
      {showQrModal && (
        <div className="fixed inset-0 z-[70] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" dir="rtl">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <span className="text-sm font-black text-white">رمز التصويت السريع للضيوف (QR)</span>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {qrDataUrl && (
              <div className="bg-white p-3 rounded-2xl inline-block">
                <img src={qrDataUrl} alt="Vote QR" className="w-56 h-56 object-contain" />
              </div>
            )}
            <p className="text-xs text-slate-300 leading-relaxed">
              للحضور العام غير المسجلين: مسح هذا الرمز يفتح شاشة التصويت الفورية مباشرة بدون اسم أو رقم.
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copyGuestLink}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer"
              >
                {copiedGuestLink ? 'تم نسخ الرابط' : 'نسخ رابط الضيوف'}
              </button>
              <a
                href={guestVoteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-1"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>فتح</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
