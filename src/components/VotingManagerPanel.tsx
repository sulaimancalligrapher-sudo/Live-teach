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
  LogOut,
  BarChart3,
  PieChart,
  Hash,
  AlignLeft,
} from 'lucide-react';
import {
  LiveConnectedStudent,
  VoteButtonColor,
  VoteChartType,
  VoteExtraGroup,
  VoteExtraInputType,
  VoteExtraItem,
  VoteOption,
  VoteParticipantRecord,
  VotePresetOptionSet,
  VotePresetQuestion,
  VoteSheetRecord,
  VoteSubmissionRecord,
  VotingConfigState,
} from '../types';
import {
  DEFAULT_VOTE_EXTRA_GROUPS,
  DEFAULT_VOTE_PRESET_OPTION_SETS,
  DEFAULT_VOTE_PRESET_QUESTIONS,
  closeActivePoll,
  defaultVotingConfigState,
  exitAndResetVotingSession,
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
import { computeVoteAnalytics } from '../lib/voteAnalytics';
import VoteChartRenderer, { VOTE_CHART_OPTIONS, VOTE_COLOR_MAP } from './VoteChartRenderer';

interface VotingManagerPanelProps {
  mode?: 'admin' | 'quick' | 'teacher-monitor';
  connectedStudents?: LiveConnectedStudent[];
  onNotice?: (text: string, type: 'success' | 'error') => void;
  onBack?: () => void;
  onOpenBigScreen?: () => void;
}

function ChartTypeSelector({
  value,
  onChange,
  label,
  accentClass = 'text-sky-300',
}: {
  value: VoteChartType;
  onChange: (next: VoteChartType) => void;
  label: string;
  accentClass?: string;
}) {
  const icons: Record<VoteChartType, React.ReactNode> = {
    numbers: <Hash className="w-3.5 h-3.5" />,
    horizontal_bar: <AlignLeft className="w-3.5 h-3.5" />,
    vertical_bar: <BarChart3 className="w-3.5 h-3.5" />,
    donut: <PieChart className="w-3.5 h-3.5" />,
  };

  return (
    <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
      <span className={`text-[11px] font-black ${accentClass}`}>{label}:</span>
      <div className="flex flex-wrap items-center gap-1.5">
        {VOTE_CHART_OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className={`px-2.5 py-1.5 rounded-xl border text-[11px] font-bold flex items-center gap-1.5 transition cursor-pointer ${
                active
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-sm font-black'
                  : 'bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500'
              }`}
            >
              {icons[opt.value]}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function VotingManagerPanel({
  mode = 'admin',
  onNotice,
  onBack,
  onOpenBigScreen,
}: VotingManagerPanelProps) {
  const [votingState, setVotingState] = useState<VotingConfigState>(defaultVotingConfigState);
  const [participants, setParticipants] = useState<VoteParticipantRecord[]>([]);
  const [votes, setVotes] = useState<VoteSubmissionRecord[]>([]);

  // Draft Question & Buttons
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(DEFAULT_VOTE_PRESET_QUESTIONS[0].id);
  const [customQuestionText, setCustomQuestionText] = useState<string>(DEFAULT_VOTE_PRESET_QUESTIONS[0].text);
  const [showCustomQuestionInput, setShowCustomQuestionInput] = useState(false);

  const [selectedOptionSetId, setSelectedOptionSetId] = useState<string>(DEFAULT_VOTE_PRESET_OPTION_SETS[0].id);
  const [draftOptions, setDraftOptions] = useState<VoteOption[]>(DEFAULT_VOTE_PRESET_OPTION_SETS[0].options);

  // Draft Selected Extra Groups (multi-check IDs)
  const [selectedExtraGroupIds, setSelectedExtraGroupIds] = useState<string[]>([]);

  // Question Add / Edit Form State
  const [questionFormMode, setQuestionFormMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [formQuestionText, setFormQuestionText] = useState('');
  const [formQuestionSetId, setFormQuestionSetId] = useState<string>('yes_no');

  // Button Set Add / Edit Form State
  const [buttonSetFormMode, setButtonSetFormMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingSetId, setEditingSetId] = useState<string | null>(null);
  const [formSetName, setFormSetName] = useState('');
  const [formSetOptions, setFormSetOptions] = useState<VoteOption[]>([
    { id: 'new_opt_1', label: '', color: 'emerald' },
    { id: 'new_opt_2', label: '', color: 'rose' },
  ]);

  // Extra Detail Group Add / Edit Form State
  const [extraFormMode, setExtraFormMode] = useState<'none' | 'add' | 'edit'>('none');
  const [editingExtraGroupId, setEditingExtraGroupId] = useState<string | null>(null);
  const [formExtraGroupName, setFormExtraGroupName] = useState('');
  const [formExtraGroupItems, setFormExtraGroupItems] = useState<VoteExtraItem[]>([
    { id: 'ex_new_1', label: '', inputType: 'choice', color: 'sky' },
    { id: 'ex_new_2', label: '', inputType: 'choice', color: 'rose' },
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

  // Subscribe strictly to current activePoll.roundId
  const activeRoundId = votingState.activePoll?.roundId || '';
  useEffect(() => {
    setParticipants([]);
    setVotes([]);
    if (!activeRoundId) return;
    let active = true;
    const unsub = subscribeToVotingRoundActivity(activeRoundId, ({ participants: p, votes: v }) => {
      if (!active) return;
      setParticipants(p.filter((item) => item.roundId === activeRoundId));
      setVotes(v.filter((item) => item.roundId === activeRoundId));
    });
    return () => {
      active = false;
      unsub();
    };
  }, [activeRoundId]);

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
  const presetExtraGroups = votingState.presetExtraGroups ?? DEFAULT_VOTE_EXTRA_GROUPS;
  const activePoll = votingState.activePoll;

  const primaryChartType: VoteChartType = activePoll?.primaryChartType || 'horizontal_bar';
  const extraChartType: VoteChartType = activePoll?.extraChartType || 'horizontal_bar';

  // Compute full analytics (totals, options, extra breakdowns, "لم يحدد", cross-tabs)
  const stats = useMemo(
    () => computeVoteAnalytics(activePoll, participants, votes),
    [activePoll, participants, votes]
  );

  // Selected Extra Groups resolved objects
  const selectedExtraGroups = useMemo(
    () => presetExtraGroups.filter((g) => selectedExtraGroupIds.includes(g.id)),
    [presetExtraGroups, selectedExtraGroupIds]
  );

  // Preset Question Handlers
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

  const openAddQuestionForm = () => {
    setQuestionFormMode('add');
    setEditingQuestionId(null);
    setFormQuestionText('');
    setFormQuestionSetId(presetOptionSets[0]?.id || 'yes_no');
  };

  const openEditQuestionForm = (pq: VotePresetQuestion) => {
    setQuestionFormMode('edit');
    setEditingQuestionId(pq.id);
    setFormQuestionText(pq.text);
    setFormQuestionSetId(pq.defaultOptionSetId || presetOptionSets[0]?.id || 'yes_no');
  };

  const handleSaveQuestionForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const txt = formQuestionText.trim();
    if (!txt) return;

    let nextQuestions: VotePresetQuestion[];
    let targetId = editingQuestionId || `pq_${Date.now()}`;

    if (questionFormMode === 'edit' && editingQuestionId) {
      nextQuestions = presetQuestions.map((q) =>
        q.id === editingQuestionId
          ? { ...q, text: txt, defaultOptionSetId: formQuestionSetId || undefined }
          : q
      );
    } else {
      const newItem: VotePresetQuestion = {
        id: targetId,
        text: txt,
        defaultOptionSetId: formQuestionSetId || undefined,
        isCustom: true,
      };
      nextQuestions = [...presetQuestions, newItem];
    }

    try {
      await saveVotingPresets(nextQuestions, presetOptionSets, presetExtraGroups);
      setSelectedQuestionId(targetId);
      setCustomQuestionText(txt);
      const linkedSet = presetOptionSets.find((s) => s.id === formQuestionSetId);
      if (linkedSet) {
        setSelectedOptionSetId(linkedSet.id);
        setDraftOptions(linkedSet.options);
      }
      setQuestionFormMode('none');
      setEditingQuestionId(null);
      setFormQuestionText('');
      notify(questionFormMode === 'edit' ? 'تم تعديل السؤال الافتراضي بنجاح' : 'تمت إضافة السؤال الافتراضي بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر حفظ السؤال الافتراضي', 'error');
    }
  };

  const handleDeletePresetQuestion = async (id: string) => {
    if (presetQuestions.length <= 1) {
      notify('يجب الإبقاء على سؤال واحد على الأقل في القائمة', 'error');
      return;
    }
    const nextQuestions = presetQuestions.filter((q) => q.id !== id);
    try {
      await saveVotingPresets(nextQuestions, presetOptionSets, presetExtraGroups);
      if (selectedQuestionId === id) {
        setSelectedQuestionId(nextQuestions[0].id);
        setCustomQuestionText(nextQuestions[0].text);
      }
      if (editingQuestionId === id) {
        setQuestionFormMode('none');
        setEditingQuestionId(null);
      }
      notify('تم حذف السؤال من القائمة');
    } catch (err: any) {
      notify(err?.message || 'تعذر الحذف', 'error');
    }
  };

  // Preset Button Sets Handlers
  const handleSelectPresetOptionSet = (setItem: VotePresetOptionSet) => {
    setSelectedOptionSetId(setItem.id);
    setDraftOptions(setItem.options);
  };

  const openAddButtonSetForm = () => {
    setButtonSetFormMode('add');
    setEditingSetId(null);
    setFormSetName('');
    setFormSetOptions([
      { id: `opt_${Date.now()}_1`, label: '', color: 'emerald' },
      { id: `opt_${Date.now()}_2`, label: '', color: 'rose' },
    ]);
  };

  const openEditButtonSetForm = (setItem: VotePresetOptionSet) => {
    setButtonSetFormMode('edit');
    setEditingSetId(setItem.id);
    setFormSetName(setItem.name);
    setFormSetOptions(setItem.options.map((o) => ({ ...o })));
  };

  const handleSaveButtonSetForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const validOpts = formSetOptions
      .map((o, idx) => ({
        id: o.id || `opt_${Date.now()}_${idx + 1}`,
        label: o.label.trim(),
        color: o.color || 'emerald',
      }))
      .filter((o) => o.label.length > 0);

    if (validOpts.length < 2) {
      notify('يرجى إدخال زرين على الأقل لمجموعة الأزرار', 'error');
      return;
    }

    const labelName = formSetName.trim() || validOpts.map((o) => o.label).join(' / ');
    let nextSets: VotePresetOptionSet[];
    let targetSetId = editingSetId || `set_${Date.now()}`;

    if (buttonSetFormMode === 'edit' && editingSetId) {
      nextSets = presetOptionSets.map((s) =>
        s.id === editingSetId ? { ...s, name: labelName, options: validOpts } : s
      );
    } else {
      const newSet: VotePresetOptionSet = {
        id: targetSetId,
        name: labelName,
        options: validOpts,
        isCustom: true,
      };
      nextSets = [...presetOptionSets, newSet];
    }

    try {
      await saveVotingPresets(presetQuestions, nextSets, presetExtraGroups);
      setSelectedOptionSetId(targetSetId);
      setDraftOptions(validOpts);
      setButtonSetFormMode('none');
      setEditingSetId(null);
      setFormSetName('');
      notify(buttonSetFormMode === 'edit' ? 'تم تعديل مجموعة الأزرار بنجاح' : 'تمت إضافة مجموعة الأزرار بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر حفظ مجموعة الأزرار', 'error');
    }
  };

  const handleDeletePresetButtonSet = async (id: string) => {
    if (presetOptionSets.length <= 1) {
      notify('يجب الإبقاء على مجموعة أزرار واحدة على الأقل', 'error');
      return;
    }
    const nextSets = presetOptionSets.filter((s) => s.id !== id);
    try {
      await saveVotingPresets(presetQuestions, nextSets, presetExtraGroups);
      if (selectedOptionSetId === id) {
        setSelectedOptionSetId(nextSets[0].id);
        setDraftOptions(nextSets[0].options);
      }
      if (editingSetId === id) {
        setButtonSetFormMode('none');
        setEditingSetId(null);
      }
      notify('تم حذف مجموعة الأزرار');
    } catch (err: any) {
      notify(err?.message || 'تعذر الحذف', 'error');
    }
  };

  // Extra Detail Groups Handlers
  const toggleSelectExtraGroup = (groupId: string) => {
    setSelectedExtraGroupIds((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]
    );
  };

  const openAddExtraForm = () => {
    setExtraFormMode('add');
    setEditingExtraGroupId(null);
    setFormExtraGroupName('');
    setFormExtraGroupItems([
      { id: `ex_it_${Date.now()}_1`, label: '', inputType: 'choice', color: 'sky' },
      { id: `ex_it_${Date.now()}_2`, label: '', inputType: 'choice', color: 'rose' },
    ]);
  };

  const openEditExtraForm = (grp: VoteExtraGroup) => {
    setExtraFormMode('edit');
    setEditingExtraGroupId(grp.id);
    setFormExtraGroupName(grp.name);
    setFormExtraGroupItems(grp.items.map((it) => ({ ...it })));
  };

  const handleSaveExtraForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanItems: VoteExtraItem[] = formExtraGroupItems
      .map((it, idx) => ({
        id: it.id || `ex_it_${Date.now()}_${idx + 1}`,
        label: it.label.trim(),
        inputType: (it.inputType === 'number' ? 'number' : 'choice') as VoteExtraInputType,
        color: it.color || 'sky',
        ...(it.inputType === 'number' && typeof it.splitAt === 'number' && !isNaN(it.splitAt)
          ? { splitAt: it.splitAt }
          : {}),
      }))
      .filter((it) => it.label.length > 0);

    if (cleanItems.length === 0) {
      notify('يرجى إضافة عنصر واحد على الأقل داخل مجموعة التفاصيل الإضافية', 'error');
      return;
    }

    const grpName = formExtraGroupName.trim() || cleanItems.map((i) => i.label).join(' / ');
    let nextGroups: VoteExtraGroup[];
    const targetId = editingExtraGroupId || `extra_${Date.now()}`;

    if (extraFormMode === 'edit' && editingExtraGroupId) {
      nextGroups = presetExtraGroups.map((g) =>
        g.id === editingExtraGroupId ? { ...g, name: grpName, items: cleanItems, required: true } : g
      );
    } else {
      const newGroup: VoteExtraGroup = {
        id: targetId,
        name: grpName,
        items: cleanItems,
        required: true,
        isCustom: true,
      };
      nextGroups = [...presetExtraGroups, newGroup];
    }

    try {
      await saveVotingPresets(presetQuestions, presetOptionSets, nextGroups);
      setSelectedExtraGroupIds((prev) => (prev.includes(targetId) ? prev : [...prev, targetId]));
      setExtraFormMode('none');
      setEditingExtraGroupId(null);
      setFormExtraGroupName('');
      notify(extraFormMode === 'edit' ? 'تم تعديل مجموعة التفاصيل الإضافية بنجاح' : 'تمت إضافة مجموعة التفاصيل الإضافية بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر حفظ مجموعة التفاصيل الإضافية', 'error');
    }
  };

  const handleDeleteExtraGroup = async (id: string) => {
    const nextGroups = presetExtraGroups.filter((g) => g.id !== id);
    try {
      await saveVotingPresets(presetQuestions, presetOptionSets, nextGroups);
      setSelectedExtraGroupIds((prev) => prev.filter((x) => x !== id));
      if (editingExtraGroupId === id) {
        setExtraFormMode('none');
        setEditingExtraGroupId(null);
      }
      notify('تم حذف مجموعة التفاصيل الإضافية');
    } catch (err: any) {
      notify(err?.message || 'تعذر الحذف', 'error');
    }
  };

  const handleRestoreDefaults = async () => {
    try {
      await saveVotingPresets(
        DEFAULT_VOTE_PRESET_QUESTIONS,
        DEFAULT_VOTE_PRESET_OPTION_SETS,
        DEFAULT_VOTE_EXTRA_GROUPS
      );
      notify('تمت استعادة الأسئلة والأزرار والتفاصيل الافتراضية');
    } catch (err: any) {
      notify(err?.message || 'تعذر الاستعادة', 'error');
    }
  };

  // Poll Lifecycle Actions
  const handleStartPoll = async (forceNewRound: boolean = true) => {
    setIsBusy(true);
    try {
      await startOrUpdatePoll({
        question: customQuestionText.trim() || DEFAULT_VOTE_PRESET_QUESTIONS[0].text,
        options: draftOptions,
        extraGroups: selectedExtraGroups,
        primaryChartType,
        extraChartType,
        newRound: forceNewRound,
      });
      notify('تم بدء جولة التصويت الجديدة وإظهارها للجميع كتصويت جديد');
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
      notify('تم إغلاق التصويت وعرض النتائج النهائية');
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

  const handleExitAndResetSession = async () => {
    setIsBusy(true);
    try {
      await exitAndResetVotingSession();
      notify('تم إخراج المصوّتين، تصفير الذاكرة، وإظهار رسالة الشكر بنجاح');
    } catch (err: any) {
      notify(err?.message || 'تعذر تنفيذ الخروج', 'error');
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveResultToSheet = async () => {
    setIsSavingSheet(true);
    try {
      const primarySummary = stats.optionStats
        .map((o) => `${o.label}: ${o.count} (${o.percent}%)`)
        .join(' | ');
      const fullSummary = stats.extraSummaryText
        ? `${primarySummary} || ${stats.extraSummaryText}`
        : primarySummary;

      const studentsText =
        stats.studentVotes.length > 0
          ? stats.studentVotes
              .map((s) => {
                const extras = Object.values(s.extraChoices || {})
                  .map((c) => c.label)
                  .join('/');
                return `${s.name || 'طالب'}: ${s.optionLabel}${extras ? ` (${extras})` : ''}`;
              })
              .join(' ، ')
          : `ضيوف: ${stats.guestVotes.length}`;

      const res = await saveVoteResultToSheetApi({
        timestamp: new Date().toLocaleString('en-GB', { hour12: false }),
        roundId: activePoll.roundId,
        question: activePoll.question,
        totalEntered: stats.totalEntered,
        totalVoted: stats.totalVoted,
        notVoted: stats.notVoted,
        summaryText: fullSummary,
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
                  متابعة لحظية للدخول الكلي، المصوّتين، ومن لم يصوّتوا، وتحليل التفاصيل الإضافية
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
                    : activePoll.status === 'exited'
                    ? 'bg-amber-500/15 text-amber-300 border-amber-500/35'
                    : 'bg-slate-800 text-slate-400 border-slate-700'
                }`}
              >
                {isPollActive
                  ? 'التصويت مفتوح الآن'
                  : activePoll.status === 'closed'
                  ? 'التصويت مغلق'
                  : activePoll.status === 'exited'
                  ? 'تم إخراج المصوّتين وتصفير الذاكرة'
                  : 'في انتظار البدء'}
              </span>

              <div className="flex items-center gap-2 flex-wrap">
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
                <button
                  type="button"
                  onClick={handleExitAndResetSession}
                  disabled={isBusy}
                  className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black flex items-center gap-1.5 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>خروج وشكر</span>
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
                <div className="text-3xl font-black font-mono tabular-nums text-sky-400 mt-1">{stats.totalEntered}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  مسجلون: {stats.studentParticipantsCount} · ضيوف: {stats.guestParticipantsCount}
                </div>
              </div>
              <Users className="w-9 h-9 text-sky-500/40" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400">عدد المصوّتين فعلياً</div>
                <div className="text-3xl font-black font-mono tabular-nums text-emerald-400 mt-1">{stats.totalVoted}</div>
                <div className="text-[11px] text-slate-500 mt-1">
                  نسبة المشاركة: {stats.totalEntered > 0 ? Math.round((stats.totalVoted / stats.totalEntered) * 100) : 0}%
                </div>
              </div>
              <UserCheck className="w-9 h-9 text-emerald-500/40" />
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-slate-400">عدد من لم يصوّتوا بعد</div>
                <div className="text-3xl font-black font-mono tabular-nums text-amber-400 mt-1">{stats.notVoted}</div>
                <div className="text-[11px] text-slate-500 mt-1">منتظرون داخل صفحة التصويت</div>
              </div>
              <Clock className="w-9 h-9 text-amber-500/40" />
            </div>
          </div>

          {/* Primary Chart Section */}
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-sm font-black text-slate-200">توزيع الأصوات حسب الخيارات الأساسية</h3>
            <VoteChartRenderer
              entries={stats.optionStats}
              chartType={primaryChartType}
              totalVotes={stats.totalVoted}
              size="normal"
            />
            <ChartTypeSelector
              label="تغيير عرض النتائج الأساسية"
              value={primaryChartType}
              onChange={(next) => updateVotingSettings({ primaryChartType: next })}
              accentClass="text-sky-300"
            />
          </div>

          {/* Extra Details & Cross-Tab Breakdown in Teacher Monitor */}
          {stats.extraGroupAnalytics.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-black text-amber-300">تحليل التفاصيل الإضافية والفئات</h3>
              </div>

              {stats.extraGroupAnalytics.map((ga) => (
                <div key={ga.group.id} className="space-y-4 pt-3 border-t border-slate-800 first:border-t-0 first:pt-0">
                  <div className="text-xs font-black text-white">{ga.group.name}</div>

                  {ga.hasChoiceItems && (
                    <div className="space-y-3">
                      <VoteChartRenderer
                        entries={ga.choiceEntries}
                        chartType={extraChartType}
                        totalVotes={stats.totalVoted}
                        size="normal"
                      />
                      <div className="overflow-x-auto bg-slate-950/80 border border-slate-800 rounded-2xl p-3">
                        <table className="w-full text-xs text-right">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400">
                              <th className="py-2 px-2">الفئة</th>
                              <th className="py-2 px-2">المجموع</th>
                              {stats.optionStats.map((po) => (
                                <th key={po.id} className="py-2 px-2">{po.label}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {ga.choiceCrossTab.map((row) => (
                              <tr key={row.categoryId}>
                                <td className="py-2 px-2 font-bold text-white">{row.categoryLabel}</td>
                                <td className="py-2 px-2 font-mono tabular-nums text-sky-400">{row.total}</td>
                                {row.byPrimary.map((bp) => (
                                  <td key={bp.optionId} className="py-2 px-2 font-mono tabular-nums text-slate-300">
                                    {bp.count} ({bp.percent}%)
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {ga.numberFields.map((nf) => (
                    <div key={nf.item.id} className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <span className="font-bold text-sky-300">{nf.item.label}</span>
                        <span className="font-mono tabular-nums text-slate-300">
                          أجاب: {nf.answeredCount} · لم يحدد: {nf.missingCount}
                          {nf.average !== null ? ` · المتوسط: ${nf.average} (${nf.min}–${nf.max})` : ''}
                        </span>
                      </div>
                      <VoteChartRenderer
                        entries={nf.bracketEntries}
                        chartType={extraChartType}
                        totalVotes={stats.totalVoted}
                        size="normal"
                      />
                    </div>
                  ))}
                </div>
              ))}

              <ChartTypeSelector
                label="تغيير عرض نتائج التفاصيل الإضافية"
                value={extraChartType}
                onChange={(next) => updateVotingSettings({ extraChartType: next })}
                accentClass="text-amber-300"
              />
            </div>
          )}
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

      {/* TOP CONTROL ACTION BAR */}
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
                اختر السؤال والأزرار والتفاصيل الإضافية بنقرة واحدة ثم اضغط تشغيل
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
              onClick={() => handleStartPoll(true)}
              disabled={isBusy}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{isPollActive ? 'بدء تصويت السؤال المختار' : 'تشغيل التصويت للجميع'}</span>
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

            <button
              type="button"
              onClick={handleExitAndResetSession}
              disabled={isBusy}
              className="px-3.5 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-black flex items-center gap-1.5 shadow-sm cursor-pointer disabled:opacity-50"
              title="إخراج المصوّتين وتصفير الذاكرة مع إظهار رسالة شكر لهم حتى يتم إطلاق سؤال جديد"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج (تصفير وشكر)</span>
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

      {/* SECTION 1: Preset Questions (Select + Edit + Delete on EVERY item) */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-black text-amber-300">
            1. الأسئلة الافتراضية (اختر بنقرة واحدة)
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowCustomQuestionInput((v) => !v)}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Edit3 className="w-3 h-3" />
              <span>{showCustomQuestionInput ? 'إخفاء كتابة نص' : 'كتابة نص سريع'}</span>
            </button>
            <button
              type="button"
              onClick={openAddQuestionForm}
              className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة سؤال</span>
            </button>
            <button
              type="button"
              onClick={handleRestoreDefaults}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              title="استعادة القيم الافتراضية للأسئلة والأزرار والتفاصيل"
            >
              <RefreshCw className="w-3 h-3" />
              <span>استعادة الافتراضي</span>
            </button>
          </div>
        </div>

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

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditQuestionForm(pq);
                    }}
                    className="p-1 text-slate-400 hover:text-amber-300 rounded-lg cursor-pointer"
                    title="تعديل السؤال"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePresetQuestion(pq.id);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded-lg cursor-pointer"
                    title="حذف السؤال"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {showCustomQuestionInput && (
          <div className="pt-1">
            <input
              type="text"
              value={customQuestionText}
              onChange={(e) => setCustomQuestionText(e.target.value)}
              placeholder="اكتب نص سؤال التصويت المباشر هنا..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-slate-700 focus:border-amber-400 text-xs sm:text-sm font-bold text-white outline-none"
            />
          </div>
        )}

        {questionFormMode !== 'none' && (
          <form onSubmit={handleSaveQuestionForm} className="p-3 rounded-xl bg-slate-900 border border-amber-500/30 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-amber-300">
                {questionFormMode === 'edit' ? 'تعديل السؤال الافتراضي' : 'حفظ سؤال افتراضي جديد في القائمة'}
              </span>
              <button
                type="button"
                onClick={() => {
                  setQuestionFormMode('none');
                  setEditingQuestionId(null);
                }}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                required
                value={formQuestionText}
                onChange={(e) => setFormQuestionText(e.target.value)}
                placeholder="مثال: هل تحفظ الآية بالصوت أم بالقراءة؟"
                className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none focus:border-amber-400"
              />
              <select
                value={formQuestionSetId}
                onChange={(e) => setFormQuestionSetId(e.target.value)}
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
                {questionFormMode === 'edit' ? 'حفظ التعديل' : 'حفظ السؤال'}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* SECTION 2: Preset Button Sets (Select + Edit + Delete + Chart Mode Selector) */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-xs sm:text-sm font-black text-sky-300">
            2. الأزرار الافتراضية الرئيسية (الكبيرة)
          </span>
          <button
            type="button"
            onClick={openAddButtonSetForm}
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
                          <span className={`w-1.5 h-1.5 rounded-full ${VOTE_COLOR_MAP[o.color || 'emerald'].dot}`} />
                          <span>{o.label}</span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditButtonSetForm(setItem);
                    }}
                    className="p-1 text-slate-400 hover:text-sky-300 rounded-lg cursor-pointer"
                    title="تعديل مجموعة الأزرار"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeletePresetButtonSet(setItem.id);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded-lg cursor-pointer"
                    title="حذف المجموعة"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Inline Add / Edit Button Set Form */}
        {buttonSetFormMode !== 'none' && (
          <form onSubmit={handleSaveButtonSetForm} className="p-3.5 rounded-xl bg-slate-900 border border-sky-500/30 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-sky-300">
                {buttonSetFormMode === 'edit' ? 'تعديل مجموعة الأزرار' : 'إنشاء مجموعة أزرار افتراضية جديدة'}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFormSetOptions((prev) => [
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
              value={formSetName}
              onChange={(e) => setFormSetName(e.target.value)}
              placeholder="اسم المجموعة (مثلاً: نعم / لا)"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none focus:border-sky-400"
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {formSetOptions.map((opt, idx) => (
                <div key={opt.id} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    required
                    value={opt.label}
                    onChange={(e) =>
                      setFormSetOptions((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, label: e.target.value } : item))
                      )
                    }
                    placeholder={`نص الزر ${idx + 1}`}
                    className="flex-1 px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none"
                  />
                  <select
                    value={opt.color || 'emerald'}
                    onChange={(e) =>
                      setFormSetOptions((prev) =>
                        prev.map((item, i) =>
                          i === idx ? { ...item, color: e.target.value as VoteButtonColor } : item
                        )
                      )
                    }
                    className="px-2 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-slate-200 outline-none"
                  >
                    {Object.entries(VOTE_COLOR_MAP).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.label}
                      </option>
                    ))}
                  </select>
                  {formSetOptions.length > 2 && (
                    <button
                      type="button"
                      onClick={() => setFormSetOptions((prev) => prev.filter((_, i) => i !== idx))}
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
                onClick={() => {
                  setButtonSetFormMode('none');
                  setEditingSetId(null);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black cursor-pointer"
              >
                {buttonSetFormMode === 'edit' ? 'حفظ التعديلات' : 'حفظ المجموعة'}
              </button>
            </div>
          </form>
        )}

        {/* Primary Results Display Format Selector */}
        <ChartTypeSelector
          label="طريقة إظهار نتائج الأزرار الأساسية"
          value={primaryChartType}
          onChange={(next) => updateVotingSettings({ primaryChartType: next })}
          accentClass="text-sky-300"
        />
      </div>

      {/* SECTION 3: ADDITIONAL DETAILS (تفاصيل إضافية - Mandatory Sub-Options Below Main Buttons) */}
      <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="text-xs sm:text-sm font-black text-purple-300">
              3. تفاصيل إضافية (تظهر أسفل الأزرار وإجبارية للمصوّت)
            </span>
            <p className="text-[11px] text-slate-400 mt-0.5">
              اختر مجموعة أو أكثر (مثل ذكر/أنثى أو العمر) ليظهر للمصوّت أسفل السؤال، ومن لم يُجب يُسجّل «لم يحدد»
            </p>
          </div>
          <div className="flex items-center gap-2">
            {selectedExtraGroupIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedExtraGroupIds([])}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold cursor-pointer"
              >
                إلغاء تحديد الكل ({selectedExtraGroupIds.length})
              </button>
            )}
            <button
              type="button"
              onClick={openAddExtraForm}
              className="px-2.5 py-1 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 text-purple-300 border border-purple-500/30 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>إضافة تفاصيل إضافية</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-2">
          {presetExtraGroups.map((grp) => {
            const isSelected = selectedExtraGroupIds.includes(grp.id);
            return (
              <div
                key={grp.id}
                onClick={() => toggleSelectExtraGroup(grp.id)}
                className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSelected
                    ? 'bg-purple-500/15 border-purple-400 text-white shadow-sm'
                    : 'bg-slate-900/90 border-slate-800 hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition ${
                      isSelected
                        ? 'bg-purple-500 border-purple-300 text-white'
                        : 'bg-slate-950 border-slate-600'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-black truncate">{grp.name}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      {grp.items.map((it) => (
                        <span
                          key={it.id}
                          className="text-[10px] text-slate-400 flex items-center gap-1"
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${VOTE_COLOR_MAP[it.color || 'sky'].dot}`} />
                          <span>
                            {it.label} ({it.inputType === 'number' ? 'عدد' : 'صح'})
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditExtraForm(grp);
                    }}
                    className="p-1 text-slate-400 hover:text-purple-300 rounded-lg cursor-pointer"
                    title="تعديل مجموعة التفاصيل"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteExtraGroup(grp.id);
                    }}
                    className="p-1 text-slate-400 hover:text-rose-400 rounded-lg cursor-pointer"
                    title="حذف مجموعة التفاصيل"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Inline Add / Edit Extra Detail Group Form */}
        {extraFormMode !== 'none' && (
          <form onSubmit={handleSaveExtraForm} className="p-3.5 rounded-xl bg-slate-900 border border-purple-500/35 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-purple-300">
                {extraFormMode === 'edit' ? 'تعديل مجموعة التفاصيل الإضافية' : 'إنشاء مجموعة تفاصيل إضافية جديدة'}
              </span>
              <button
                type="button"
                onClick={() =>
                  setFormExtraGroupItems((prev) => [
                    ...prev,
                    { id: `ex_it_${Date.now()}`, label: '', inputType: 'choice', color: 'amber' },
                  ])
                }
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-emerald-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>إضافة أزرار / حقل</span>
              </button>
            </div>

            <input
              type="text"
              required
              value={formExtraGroupName}
              onChange={(e) => setFormExtraGroupName(e.target.value)}
              placeholder="اسم المجموعة (مثلاً: ذكر / أنثى أو العمر أو الفئة)"
              className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-700 text-xs font-bold text-white outline-none focus:border-purple-400"
            />

            <div className="space-y-2">
              {formExtraGroupItems.map((it, idx) => (
                <div key={it.id} className="p-2 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-wrap items-center gap-2">
                  {/* حقل نص */}
                  <input
                    type="text"
                    required
                    value={it.label}
                    onChange={(e) =>
                      setFormExtraGroupItems((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, label: e.target.value } : row))
                      )
                    }
                    placeholder={`نص الخيار ${idx + 1} (مثال: ذكر أو العمر)`}
                    className="flex-1 min-w-[140px] px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-white outline-none"
                  />

                  {/* حقل نوع الإجابة */}
                  <select
                    value={it.inputType}
                    onChange={(e) =>
                      setFormExtraGroupItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, inputType: e.target.value as VoteExtraInputType } : row
                        )
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-amber-300 outline-none"
                  >
                    <option value="choice">مربع صح (زر اختيار)</option>
                    <option value="number">مربع إضافة عدد (رقم)</option>
                  </select>

                  {/* حد التصنيف الاختياري عند نوع العدد */}
                  {it.inputType === 'number' && (
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={it.splitAt ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        setFormExtraGroupItems((prev) =>
                          prev.map((row, i) =>
                            i === idx
                              ? { ...row, splitAt: raw === '' ? undefined : Number(raw) }
                              : row
                          )
                        );
                      }}
                      placeholder="حد فرز (اختياري مثل 18)"
                      title="إذا وضعت 18 مثلاً يفرز الحساب تلقائياً إلى: أقل من 18 و 18 فأكثر"
                      className="w-36 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-sky-300 outline-none"
                    />
                  )}

                  {/* حقل اختيار اللون */}
                  <select
                    value={it.color || 'sky'}
                    onChange={(e) =>
                      setFormExtraGroupItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, color: e.target.value as VoteButtonColor } : row
                        )
                      )
                    }
                    className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs font-bold text-slate-200 outline-none"
                  >
                    {Object.entries(VOTE_COLOR_MAP).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.label}
                      </option>
                    ))}
                  </select>

                  {/* زر حذف العنصر */}
                  {formExtraGroupItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setFormExtraGroupItems((prev) => prev.filter((_, i) => i !== idx))}
                      className="p-1.5 rounded-lg bg-slate-800 text-rose-400 hover:bg-rose-500/20 cursor-pointer"
                      title="حذف"
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
                onClick={() => {
                  setExtraFormMode('none');
                  setEditingExtraGroupId(null);
                }}
                className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-white text-xs font-black cursor-pointer"
              >
                {extraFormMode === 'edit' ? 'حفظ التعديلات' : 'حفظ المجموعة'}
              </button>
            </div>
          </form>
        )}

        {/* Extra Details Results Display Format Selector */}
        <ChartTypeSelector
          label="طريقة إظهار نتائج التفاصيل الإضافية"
          value={extraChartType}
          onChange={(next) => updateVotingSettings({ extraChartType: next })}
          accentClass="text-purple-300"
        />

        {/* Draft Preview Summary Strip */}
        <div className="pt-2 border-t border-slate-800/70 flex flex-wrap items-center gap-2 text-xs text-slate-400">
          <span>السؤال الجاهز: <b className="text-white">{customQuestionText}</b></span>
          <span aria-hidden="true">·</span>
          <span>الأزرار:</span>
          {draftOptions.map((o) => (
            <span
              key={o.id}
              className={`px-2 py-0.5 rounded-lg border text-[11px] font-bold ${VOTE_COLOR_MAP[o.color || 'emerald'].badge}`}
            >
              {o.label}
            </span>
          ))}
          {selectedExtraGroups.length > 0 && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-purple-300 font-bold">
                تفاصيل إضافية: {selectedExtraGroups.map((g) => g.name).join(' + ')}
              </span>
            </>
          )}
        </div>
      </div>

      {/* SECTION 4: LIVE VOTING RESULTS, EXTRA DETAILS BREAKDOWN & COUNTERS */}
      <div className="bg-slate-950/70 border border-slate-800 rounded-2xl p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-black text-white flex items-center gap-2">
              <span>النتائج الحية للجولة الحالية</span>
              <span
                className={`text-[11px] font-bold ${
                  isPollActive
                    ? 'text-emerald-400'
                    : activePoll.status === 'exited'
                    ? 'text-amber-400'
                    : 'text-slate-400'
                }`}
              >
                (
                {isPollActive
                  ? 'مفتوح الآن'
                  : activePoll.status === 'closed'
                  ? 'مغلق'
                  : activePoll.status === 'exited'
                  ? 'تم الخروج والتصفير'
                  : 'جاهز'}
                )
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
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-sky-400">{stats.totalEntered}</div>
            <div className="text-[10px] text-slate-500">
              مسجلون: {stats.studentParticipantsCount} · ضيوف: {stats.guestParticipantsCount}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400">إجمالي المصوّتين</div>
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-emerald-400">{stats.totalVoted}</div>
            <div className="text-[10px] text-slate-500">
              نسبة: {stats.totalEntered > 0 ? Math.round((stats.totalVoted / stats.totalEntered) * 100) : 0}%
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900 border border-slate-800">
            <div className="text-[11px] font-bold text-slate-400">الذين لم يصوّتوا</div>
            <div className="text-xl sm:text-2xl font-black font-mono tabular-nums text-amber-400">{stats.notVoted}</div>
            <div className="text-[10px] text-slate-500">بانتظار النقر</div>
          </div>
        </div>

        {/* Primary Option Chart */}
        <VoteChartRenderer
          entries={stats.optionStats}
          chartType={primaryChartType}
          totalVotes={stats.totalVoted}
          size="normal"
        />

        {/* Extra Detail Analytics & Cross-Tabulation */}
        {stats.extraGroupAnalytics.length > 0 && (
          <div className="pt-3 border-t border-slate-800 space-y-4">
            <div className="text-xs font-black text-purple-300">
              نتائج التفاصيل الإضافية والتحليل الدقيق حسب الفئة
            </div>

            {stats.extraGroupAnalytics.map((ga) => (
              <div key={ga.group.id} className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="text-xs font-black text-white">{ga.group.name}</div>

                {ga.hasChoiceItems && (
                  <div className="space-y-3">
                    <VoteChartRenderer
                      entries={ga.choiceEntries}
                      chartType={extraChartType}
                      totalVotes={stats.totalVoted}
                      size="compact"
                    />
                    <div className="overflow-x-auto bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5">
                      <table className="w-full text-[11px] text-right">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-1.5 px-2">الفئة</th>
                            <th className="py-1.5 px-2">الإجمالي</th>
                            {stats.optionStats.map((po) => (
                              <th key={po.id} className="py-1.5 px-2">{po.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {ga.choiceCrossTab.map((row) => (
                            <tr key={row.categoryId}>
                              <td className="py-1.5 px-2 font-bold text-slate-200">{row.categoryLabel}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums text-sky-400">{row.total}</td>
                              {row.byPrimary.map((bp) => (
                                <td key={bp.optionId} className="py-1.5 px-2 font-mono tabular-nums text-slate-300">
                                  {bp.count} ({bp.percent}%)
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {ga.numberFields.map((nf) => (
                  <div key={nf.item.id} className="space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-bold text-amber-300">{nf.item.label}</span>
                      <span className="font-mono tabular-nums text-slate-300 text-[11px]">
                        أجاب: {nf.answeredCount} · لم يحدد: {nf.missingCount}
                        {nf.average !== null ? ` · المتوسط: ${nf.average} (من ${nf.min} إلى ${nf.max})` : ''}
                      </span>
                    </div>
                    <VoteChartRenderer
                      entries={nf.bracketEntries}
                      chartType={extraChartType}
                      totalVotes={stats.totalVoted}
                      size="compact"
                    />
                    <div className="overflow-x-auto bg-slate-950/70 border border-slate-800/90 rounded-xl p-2.5">
                      <table className="w-full text-[11px] text-right">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400">
                            <th className="py-1.5 px-2">الشريحة</th>
                            <th className="py-1.5 px-2">العدد</th>
                            {stats.optionStats.map((po) => (
                              <th key={po.id} className="py-1.5 px-2">{po.label}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60">
                          {nf.crossTabRows.map((row) => (
                            <tr key={row.categoryId}>
                              <td className="py-1.5 px-2 font-bold text-slate-200">{row.categoryLabel}</td>
                              <td className="py-1.5 px-2 font-mono tabular-nums text-sky-400">{row.total}</td>
                              {row.byPrimary.map((bp) => (
                                <td key={bp.optionId} className="py-1.5 px-2 font-mono tabular-nums text-slate-300">
                                  {bp.count} ({bp.percent}%)
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Registered Students Breakdown */}
        {(stats.studentVotes.length > 0 || stats.unvotedRegistered.length > 0) && (
          <div className="pt-2 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900 rounded-xl p-3 border border-slate-800 max-h-40 overflow-y-auto space-y-1">
              <div className="font-bold text-emerald-400 mb-1.5">
                المسجلون المصوّتون ({stats.studentVotes.length})
              </div>
              {stats.studentVotes.map((sv) => {
                const extras = [
                  ...Object.values(sv.extraChoices || {}).map((c) => c.label),
                  ...Object.values(sv.extraNumbers || {}).map((n) => String(n)),
                ];
                return (
                  <div key={sv.id} className="flex items-center justify-between gap-2 text-slate-300">
                    <span className="truncate">{sv.name || 'طالب'}</span>
                    <span className="font-bold text-emerald-300 shrink-0">
                      {sv.optionLabel}
                      {extras.length > 0 ? ` (${extras.join(' · ')})` : ''}
                    </span>
                  </div>
                );
              })}
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

      {/* SECTION 5: Sheet Archive (Admin Mode Only) */}
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
                      <td className="py-2 px-2 font-mono tabular-nums text-sky-400">{row.totalEntered}</td>
                      <td className="py-2 px-2 font-mono tabular-nums text-emerald-400">{row.totalVoted}</td>
                      <td className="py-2 px-2 font-mono tabular-nums text-amber-400">{row.notVoted}</td>
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
