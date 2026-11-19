import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Tv, Mic, Trophy, Video, Radio, Monitor, Sparkles, 
  Zap, Users, QrCode, ArrowLeft, Maximize2, Minimize2, 
  CheckCircle2, Flame, Award, Sliders, ChevronDown, ChevronUp,
  Volume2, VolumeX, Eye, HelpCircle, Vote, UserCheck, Clock
} from 'lucide-react';
import { LiveSessionState, LiveLessonRow, QuizActiveState, VotingConfigState, VoteParticipantRecord, VoteSubmissionRecord } from '../types';
import {
  subscribeToLiveSession,
  fetchLiveQuestionsT,
  getLiveSessionState,
  subscribeToVotingConfig,
  subscribeToVotingRoundActivity,
  defaultVotingConfigState,
} from '../api';
import LiveTeacherRoom from './LiveTeacherRoom';
import LiveDirectDisplayRoom from './LiveDirectDisplayRoom';
import LiveQuizArenaDisplay from './LiveQuizArenaDisplay';

interface SmartHubDisplayRoomProps {
  onBackToMain?: () => void;
  initialMode?: 'auto' | 'video' | 'direct' | 'quiz' | 'vote';
}

export default function SmartHubDisplayRoom({ onBackToMain, initialMode = 'auto' }: SmartHubDisplayRoomProps) {
  // Mode selection: 'auto' | 'video' | 'direct' | 'quiz' | 'vote'
  const [activeMode, setActiveMode] = useState<'auto' | 'video' | 'direct' | 'quiz' | 'vote'>(initialMode);
  const [sessionState, setSessionState] = useState<LiveSessionState | null>(null);
  const [votingState, setVotingState] = useState<VotingConfigState>(defaultVotingConfigState);
  const [voteParticipants, setVoteParticipants] = useState<VoteParticipantRecord[]>([]);
  const [voteSubmissions, setVoteSubmissions] = useState<VoteSubmissionRecord[]>([]);
  const [allLessons, setAllLessons] = useState<LiveLessonRow[]>([]);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isBarExpanded, setIsBarExpanded] = useState(true);

  // Subscribe to live session state
  useEffect(() => {
    const unsub = subscribeToLiveSession((state) => {
      setSessionState(state);
    });
    const unsubVoting = subscribeToVotingConfig((vState) => {
      setVotingState(vState);
    });

    fetchLiveQuestionsT().then((lessons) => {
      if (lessons && lessons.length > 0) setAllLessons(lessons);
    }).catch(() => {});

    return () => {
      unsub();
      unsubVoting();
    };
  }, []);

  const pollRoundId = votingState.activePoll?.roundId || '';
  useEffect(() => {
    if (!pollRoundId) return;
    const unsub = subscribeToVotingRoundActivity(pollRoundId, ({ participants, votes }) => {
      setVoteParticipants(participants);
      setVoteSubmissions(votes);
    });
    return () => unsub();
  }, [pollRoundId]);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Determine current effective view with strict channel isolation
  const currentMode = sessionState?.activeMode || sessionState?.mode;
  const isQuizActive = Boolean(sessionState?.quizState?.isActive);
  const isVoteBigScreenActive = Boolean(
    votingState.activePoll?.status === 'active' && votingState.activePoll?.showOnBigScreen
  );
  const isDirectActive = Boolean(currentMode === 'direct');
  const isVideoActive = Boolean(currentMode === 'video');

  let effectiveView: 'standby' | 'video' | 'direct' | 'quiz' | 'vote' = 'standby';

  if (activeMode === 'auto') {
    if (isVoteBigScreenActive) {
      effectiveView = 'vote';
    } else if (isQuizActive) {
      effectiveView = 'quiz';
    } else if (isDirectActive) {
      effectiveView = 'direct';
    } else if (isVideoActive) {
      effectiveView = 'video';
    } else {
      effectiveView = 'standby';
    }
  } else {
    effectiveView = activeMode;
  }

  // Fallback quiz state for previewing quiz arena when in manual quiz mode
  const effectiveQuizState: QuizActiveState = sessionState?.quizState?.isActive
    ? sessionState.quizState
    : {
        isActive: true,
        quizStatus: 'waiting',
        quizTitle: sessionState?.quizState?.quizTitle || 'ساحة تحدي كويز الكبرى 🏆',
        questions: sessionState?.quizState?.questions || [],
        timerDurationSeconds: 0,
        startTime: null,
        endTime: null,
        shuffleQuestions: false,
        showInstantFeedback: true,
        allowRetryWrong: true,
        podiumCount: 10,
        participants: sessionState?.quizState?.participants || {},
      };

  const effectivePin = sessionState?.sessionPin || '1234';
  const studentJoinUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?page=live-student&pin=${encodeURIComponent(effectivePin)}`
    : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(studentJoinUrl)}`;
  const guestVoteUrl = typeof window !== 'undefined' ? `${window.location.origin}/?page=vote` : '';
  const guestVoteQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(guestVoteUrl)}`;

  return (
    <div className="relative min-h-screen w-full bg-slate-950 text-slate-100 font-sans overflow-x-hidden selection:bg-amber-500 selection:text-slate-950" dir="rtl">
      
      {/* ============================================================== */}
      {/* FLOATING QUICK SWITCHER BAR (شريط التبديل السريع للشاشة الجامعة) */}
      {/* ============================================================== */}
      <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 transition-all duration-300">
        <div className="bg-slate-900/90 hover:bg-slate-900 border border-slate-700/80 rounded-2xl p-1.5 shadow-2xl backdrop-blur-xl flex items-center gap-1.5 sm:gap-2">
          
          {/* Quick Collapse / Expand Toggle */}
          <button
            onClick={() => setIsBarExpanded(!isBarExpanded)}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
            title={isBarExpanded ? 'إخفاء شريط التحكم' : 'إظهار شريط التحكم'}
          >
            {isBarExpanded ? <ChevronUp className="w-4 h-4" /> : <Sliders className="w-4 h-4 text-amber-400" />}
          </button>

          {isBarExpanded && (
            <>
              {/* Option 1: Auto Switch Mode (التحويل التلقائي الذكي) */}
              <button
                onClick={() => setActiveMode('auto')}
                className={`px-3 py-1.5 sm:px-3.5 sm:py-2 rounded-xl text-xs font-black flex items-center gap-1.5 transition cursor-pointer ${
                  activeMode === 'auto'
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 shadow-md shadow-amber-500/25 ring-2 ring-amber-300'
                    : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
                }`}
                title="التحويل التلقائي: تتبع ما يقوم به المعلم في لوحة التحكم وتتحول الشاشة تلقائياً للنشاط النشط"
              >
                <Zap className={`w-3.5 h-3.5 ${activeMode === 'auto' ? 'fill-slate-950' : 'text-amber-400'}`} />
                <span>التحويل الذكي ⚡</span>
              </button>

              <div className="w-[1px] h-5 bg-slate-700/80 my-auto" />

              {/* Option 2: Video Theater */}
              <button
                onClick={() => setActiveMode('video')}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeMode === 'video'
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30 ring-1 ring-blue-400'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Video className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">مسرح الفيديو</span>
              </button>

              {/* Option 3: Direct Lecture & PDF */}
              <button
                onClick={() => setActiveMode('direct')}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeMode === 'direct'
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30 ring-1 ring-emerald-400'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Radio className="w-3.5 h-3.5 text-emerald-400" />
                <span className="hidden sm:inline">الشرح و PDF</span>
              </button>

              {/* Option 4: Quiz Arena */}
              <button
                onClick={() => setActiveMode('quiz')}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeMode === 'quiz'
                    ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30 ring-1 ring-purple-400'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Trophy className="w-3.5 h-3.5 text-purple-400" />
                <span className="hidden sm:inline">تحدي كويز</span>
              </button>

              {/* Option 5: Live Voting */}
              <button
                onClick={() => setActiveMode('vote')}
                className={`px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition cursor-pointer ${
                  activeMode === 'vote'
                    ? 'bg-teal-600 text-white shadow-md shadow-teal-600/30 ring-1 ring-teal-400'
                    : 'hover:bg-slate-800 text-slate-300 hover:text-white'
                }`}
              >
                <Vote className="w-3.5 h-3.5 text-teal-400" />
                <span className="hidden sm:inline">تصويت مباشر</span>
              </button>

              <div className="w-[1px] h-5 bg-slate-700/80 my-auto" />

              {/* Fullscreen Button */}
              <button
                onClick={toggleFullscreen}
                className="p-1.5 sm:p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title={isFullscreen ? 'تصغير' : 'ملء الشاشة'}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>

              {/* Exit to Main */}
              {onBackToMain && (
                <button
                  onClick={onBackToMain}
                  className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer flex items-center gap-1"
                  title="العودة للصفحة الرئيسية"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span className="hidden md:inline">الرئيسية</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* ============================================================== */}
      {/* SCREEN CONTENT RENDERING BASED ON EFFECTIVE VIEW */}
      {/* ============================================================== */}
      
      {/* 1. QUIZ ARENA VIEW */}
      {effectiveView === 'quiz' && (
        <div className="w-full min-h-screen">
          <LiveQuizArenaDisplay
            quizState={effectiveQuizState}
            connectedStudents={sessionState?.connectedStudents || []}
            isPresenter={false}
          />
        </div>
      )}

      {/* 2. DIRECT LECTURE & PDF VIEW */}
      {effectiveView === 'direct' && (
        <div className="w-full min-h-screen">
          <LiveDirectDisplayRoom />
        </div>
      )}

      {/* 3. VIDEO THEATER VIEW */}
      {effectiveView === 'video' && (
        <div className="w-full min-h-screen">
          <LiveTeacherRoom
            initialLesson={allLessons[0]}
            allLessons={allLessons}
            onBack={() => {
              if (activeMode === 'video') setActiveMode('auto');
            }}
          />
        </div>
      )}

      {/* 3b. LIVE VOTING PROJECTOR VIEW */}
      {effectiveView === 'vote' && (() => {
        const poll = votingState.activePoll;
        const uniqueVoterIds = new Set<string>([
          ...voteParticipants.map((p) => p.voterId),
          ...voteSubmissions.map((v) => v.voterId),
        ]);
        const totalEntered = uniqueVoterIds.size;
        const totalVoted = voteSubmissions.length;
        const notVoted = Math.max(0, totalEntered - totalVoted);
        const barColors: Record<string, string> = {
          emerald: 'bg-emerald-500',
          rose: 'bg-rose-500',
          sky: 'bg-sky-500',
          purple: 'bg-purple-500',
          amber: 'bg-amber-500',
          slate: 'bg-slate-400',
        };

        return (
          <div className="min-h-screen flex flex-col justify-center p-6 sm:p-12 pt-20 max-w-6xl mx-auto space-y-8">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
              {/* Right/Main Column: Question + Live Counters + Bars */}
              <div className="lg:col-span-8 space-y-6">
                <div className="space-y-2">
                  <div className="inline-flex items-center gap-2 text-emerald-400 text-sm font-black">
                    <Vote className="w-5 h-5" />
                    <span>
                      {poll.status === 'active'
                        ? 'التصويت المباشر مفتوح الآن'
                        : poll.status === 'closed'
                        ? 'النتائج النهائية للتصويت'
                        : 'في انتظار بدء التصويت'}
                    </span>
                  </div>
                  <h2 className="text-3xl sm:text-5xl font-black text-white leading-tight">
                    {poll.question}
                  </h2>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <Users className="w-4 h-4 text-sky-400" />
                      <span>الدخول الكلي</span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-black font-mono text-sky-400 mt-1">
                      {totalEntered}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-emerald-400" />
                      <span>المصوّتون</span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-black font-mono text-emerald-400 mt-1">
                      {totalVoted}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                    <div className="text-xs font-bold text-slate-400 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-amber-400" />
                      <span>لم يصوّتوا</span>
                    </div>
                    <div className="text-3xl sm:text-4xl font-black font-mono text-amber-400 mt-1">
                      {notVoted}
                    </div>
                  </div>
                </div>

                <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-5">
                  {poll.options.map((opt) => {
                    const count = voteSubmissions.filter(
                      (v) => v.optionId === opt.id || v.optionLabel === opt.label
                    ).length;
                    const pct = totalVoted > 0 ? Math.round((count / totalVoted) * 100) : 0;
                    return (
                      <div key={opt.id} className="space-y-2">
                        <div className="flex items-center justify-between text-lg sm:text-xl font-black">
                          <span className="text-white">{opt.label}</span>
                          <span className="font-mono text-slate-200">
                            {count} صوت ({pct}%)
                          </span>
                        </div>
                        <div className="w-full h-6 rounded-xl bg-slate-950 border border-slate-800 overflow-hidden">
                          <div
                            className={`h-full ${barColors[opt.color || 'emerald']} transition-all duration-500`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Left Column: Instant Guest QR Code */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-3xl p-6 text-center space-y-4 shadow-2xl">
                <span className="text-sm font-black text-amber-300 block">
                  امسح الرمز للتصويت الفوري (بدون تسجيل)
                </span>
                <div className="w-56 h-56 mx-auto p-3 bg-white rounded-2xl flex items-center justify-center">
                  <img src={guestVoteQrUrl} alt="Guest Vote QR" className="w-full h-full object-contain" />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  المشتركون المسجلون يظهر لهم التصويت تلقائياً في شاشاتهم، والضيوف يمسحون هذا الرمز للتصويت مباشرة.
                </p>
              </div>
            </div>
          </div>
        );
      })()}

      {/* 4. SMART HUB STANDBY SCREEN (قاعة الاستقبال التفاعلية للبروجكتر) */}
      {effectiveView === 'standby' && (
        <div className="min-h-screen flex flex-col items-center justify-between p-6 sm:p-12 relative overflow-hidden bg-gradient-to-b from-slate-950 via-slate-900 to-[#0e0a1f]">
          
          {/* Ambient lighting effects */}
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Top Brand & Title */}
          <div className="pt-12 text-center space-y-3 z-10">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-black shadow-lg">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>الشاشة الذكية الجامعة للبروجكتر (Smart Hub Display) ⚡</span>
            </div>
            
            <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
              {sessionState?.lessonTitle || 'قاعة العرض التفاعلية الشاملة'}
            </h1>
            
            <p className="text-xs sm:text-sm text-slate-400 max-w-md mx-auto">
              شاشة العرض موصولة وجاهزة. التحويل التلقائي الذكي نشط، وتتحول الشاشة فوراً عند بدء أي نشاط من قبل المعلم.
            </p>
          </div>

          {/* Center Connection Card (PIN & QR Code) */}
          <div className="my-8 z-10 w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl text-center space-y-6">
            <div className="space-y-1">
              <span className="text-xs font-bold text-slate-400">امسح الكود بجوالك للانضمام المباشر:</span>
              <div className="w-48 h-48 sm:w-56 sm:h-56 mx-auto p-3 bg-white rounded-3xl shadow-2xl flex items-center justify-center">
                <img
                  src={qrCodeUrl}
                  alt="QR Code"
                  className="w-full h-full object-contain rounded-2xl"
                />
              </div>
            </div>

            {/* PIN Code Box */}
            <div className="p-4 bg-slate-950 border border-amber-500/40 rounded-2xl flex items-center justify-between px-6 shadow-inner">
              <div className="text-right">
                <span className="text-[10px] uppercase font-bold text-slate-400">رمز الدخول السريع</span>
                <div className="text-xs text-amber-400 font-bold">PIN Code</div>
              </div>
              <span className="text-3xl sm:text-4xl font-black font-mono text-amber-300 tracking-widest">
                {effectivePin}
              </span>
            </div>

            {/* Connected Students Counter */}
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-300">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
              <span>الطلاب المتصلون بالقاعة الآن:</span>
              <span className="text-emerald-400 font-mono text-sm font-black">
                {(sessionState?.connectedStudents || []).length} طالب
              </span>
            </div>
          </div>

          {/* Bottom 3 Activity Readiness Badges */}
          <div className="w-full max-w-3xl grid grid-cols-1 sm:grid-cols-3 gap-3 z-10">
            <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center shrink-0">
                <Video className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-200">مسرح الحصص التفاعلية</span>
                <div className="text-[10px] text-slate-400 font-medium">فيديو الدرس والأسئلة (Questions-T)</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
                <Radio className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-200">الشرح المباشر و PDF</span>
                <div className="text-[10px] text-slate-400 font-medium">إلقاء مباشر وأسئلة (Questions-Live)</div>
              </div>
            </div>

            <div className="p-3.5 bg-slate-900/80 border border-slate-800 rounded-2xl flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center shrink-0">
                <Trophy className="w-4 h-4" />
              </div>
              <div>
                <span className="text-xs font-bold text-slate-200">ساحة تحدي كويز</span>
                <div className="text-[10px] text-slate-400 font-medium">بطولة كويز والتتويج (Questions-Qui)</div>
              </div>
            </div>
          </div>

        </div>
      )}

    </div>
  );
}
