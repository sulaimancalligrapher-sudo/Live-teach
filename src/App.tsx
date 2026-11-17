import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { 
  Trophy, ShieldCheck, Lock, Unlock,
  Sun, Moon, Users, 
  Copy, ArrowLeft, Monitor,
  Radio, LayoutGrid, Film, Power, QrCode, Link as LinkIcon,
  X, Clock, CheckCircle2, Check, ListVideo,
  BookOpen, Video, Captions
} from 'lucide-react';
import { HeaderConfig, LiveLessonRow, LiveSessionState } from './types';
import { 
  fetchHeaderConfig, 
  getWebAppUrl, 
  isApiConfigured,
  fetchLiveQuestionsT,
  subscribeToLiveSession,
  startLiveProgram,
  endLiveProgram,
  toggleLiveAccessMode
} from './api';
import { showAppConfirm } from './components/AppDialog';
import AdminPanel from './components/AdminPanel';
import AdminPasswordModal from './components/AdminPasswordModal';
import LiveTeacherRoom from './components/LiveTeacherRoom';
import LiveStudentView from './components/LiveStudentView';
import LiveDirectDisplayRoom from './components/LiveDirectDisplayRoom';
import LiveQuizArenaDisplay from './components/LiveQuizArenaDisplay';
import SmartHubDisplayRoom from './components/SmartHubDisplayRoom';
import StudentQuizView from './components/StudentQuizView';
import LanguageSelector from './components/LanguageSelector';
import StandaloneChatRoom from './components/StandaloneChatRoom';
import ScriptPrompterPanel from './components/ScriptPrompterPanel';
import QuizManagerPanel from './components/QuizManagerPanel';
import LiveClassManager from './components/LiveClassManager';
import LiveDirectManager from './components/LiveDirectManager';
import LiveCameraManager from './components/LiveCameraManager';
import { useLanguage } from './translations';

export default function App() {
  const { t } = useLanguage();
  const [webAppUrl, setWebAppUrl] = useState(getWebAppUrl());
  const [isConfigured, setIsConfigured] = useState(isApiConfigured());
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);

  // Page Routing Mode: 'student' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz' | 'display' | 'chat' | 'script-prompter'
  const [pageMode, setPageMode] = useState<'student' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz' | 'display' | 'chat' | 'script-prompter'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('page');
      const mode = params.get('mode');
      if (p === 'chat' || mode === 'chat') return 'chat';
      if (p === 'script-prompter' || p === 'prompter') return 'script-prompter';
      if (p === 'admin') return 'admin';
      if (p === 'display' || p === 'smart-display') return 'display';
      if (p === 'live-teacher') return 'live-teacher';
      if (p === 'live-student') return 'live-student';
      if (p === 'live-direct-display' || p === 'live-direct' || p === 'live-display') return 'live-direct-display';
      if (p === 'quiz-arena' || p === 'quiz-display') return 'quiz-arena';
      if (p === 'student-quiz') return 'student-quiz';
    }
    return 'student';
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => localStorage.getItem('isAdminUnlocked') === 'true');
  const [adminName, setAdminName] = useState(() => localStorage.getItem('adminName') || 'الأستاذ المشرف');
  const [adminInputName, setAdminInputName] = useState(() => localStorage.getItem('adminName') || '');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [showAdminPassModal, setShowAdminPassModal] = useState(false);
  const [adminInputPassword, setAdminInputPassword] = useState('');
  const [adminPassError, setAdminPassError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Master Quick-Control Bar & Stackable Open Cards (ordered by opening)
  type QuickPanelId = 'screen' | 'start' | 'login' | 'quiz' | 'video-questions' | 'live-direct' | 'pdf' | 'camera' | 'translation';
  const [openPanels, setOpenPanels] = useState<QuickPanelId[]>([]);
  const [loginFilterView, setLoginFilterView] = useState<'live' | 'unanswered' | 'answers'>('live');

  const toggleQuickPanel = (id: QuickPanelId) => {
    setOpenPanels((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const closeQuickPanel = (id: QuickPanelId) => {
    setOpenPanels((prev) => prev.filter((item) => item !== id));
  };

  // Live Session Controls & QR Modal State
  const [liveSession, setLiveSession] = useState<LiveSessionState | null>(null);
  const [isTogglingProgram, setIsTogglingProgram] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  // Live Classroom Lessons
  const [allLiveLessons, setAllLiveLessons] = useState<LiveLessonRow[]>([]);
  const [activeLiveLesson, setActiveLiveLesson] = useState<LiveLessonRow | null>(null);

  // Student credentials state (for lessons display)
  const [studentName, setStudentName] = useState(() => {
    return localStorage.getItem('liveStudentUsername') || localStorage.getItem('loggedInUsername') || '';
  });
  const [studentNumber, setStudentNumber] = useState(() => {
    return localStorage.getItem('liveStudentSheet') || localStorage.getItem('loggedInSheetNumber') || '';
  });
  const [isEditingStudent, setIsEditingStudent] = useState(false);

  // Dark Mode State
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme') === 'dark';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [darkMode]);

  // Load Header Config + Subscribe to Live Session
  useEffect(() => {
    fetchHeaderConfig().then(cfg => {
      if (cfg) setHeaderConfig(cfg);
    }).catch(() => {});

    fetchLiveQuestionsT().then(data => {
      if (data && data.length > 0) setAllLiveLessons(data);
    }).catch(() => {});

    const unsub = subscribeToLiveSession((st) => {
      setLiveSession(st);
    });
    return () => unsub();
  }, [webAppUrl, isConfigured]);

  // Generate QR code when modal opens OR when live PIN changes
  const effectivePin = liveSession?.sessionPin ? liveSession.sessionPin.trim() : '';
  const studentJoinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?page=live-student${effectivePin ? `&pin=${encodeURIComponent(effectivePin)}` : ''}`
      : '';

  useEffect(() => {
    if (!studentJoinUrl) return;
    QRCode.toDataURL(studentJoinUrl, { width: 240, margin: 1 })
      .then((url) => setQrDataUrl(url))
      .catch(() => {});
  }, [showQrModal, studentJoinUrl]);

  const handleToggleProgramHome = async () => {
    const running = Boolean(liveSession?.isProgramActive);
    if (running) {
      const ok = await showAppConfirm(
        'هل تريد إنهاء البرنامج المباشر وإغلاق دخول الطلاب؟',
        'إنهاء البرنامج',
        'warning',
        'نعم، إنهاء'
      );
      if (!ok) return;
    }
    setIsTogglingProgram(true);
    try {
      if (running) {
        await endLiveProgram();
      } else {
        await startLiveProgram();
      }
    } catch (err) {
      console.warn('Program toggle failed:', err);
    } finally {
      setIsTogglingProgram(false);
    }
  };

  // URL sync & history navigation
  const navigateToPage = (mode: 'student' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz' | 'display' | 'script-prompter') => {
    setPageMode(mode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (mode === 'admin') {
        url.searchParams.set('page', 'admin');
      } else if (mode === 'display') {
        url.searchParams.set('page', 'display');
      } else if (mode === 'live-teacher') {
        url.searchParams.set('page', 'live-teacher');
      } else if (mode === 'live-student') {
        url.searchParams.set('page', 'live-student');
      } else if (mode === 'live-direct-display') {
        url.searchParams.set('page', 'live-direct-display');
      } else if (mode === 'quiz-arena') {
        url.searchParams.set('page', 'quiz-arena');
      } else if (mode === 'student-quiz') {
        url.searchParams.set('page', 'student-quiz');
      } else if (mode === 'script-prompter') {
        url.searchParams.set('page', 'script-prompter');
      } else {
        url.searchParams.delete('page');
      }
      window.history.pushState({}, '', url.toString());
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('page');
      if (p === 'admin') setPageMode('admin');
      else if (p === 'script-prompter' || p === 'prompter') setPageMode('script-prompter');
      else if (p === 'display' || p === 'smart-display') setPageMode('display');
      else if (p === 'live-teacher') setPageMode('live-teacher');
      else if (p === 'live-student') setPageMode('live-student');
      else if (p === 'live-direct-display') setPageMode('live-direct-display');
      else if (p === 'quiz-arena') setPageMode('quiz-arena');
      else if (p === 'student-quiz') setPageMode('student-quiz');
      else setPageMode('student');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleAdminUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassError(null);
    const validCodes = ['1122', '3344', 'أستاذ2026', 'إدارة2026', 'teacher2026', 'admin2026'];
    if (validCodes.includes(adminInputPassword.trim())) {
      setIsAdminUnlocked(true);
      localStorage.setItem('isAdminUnlocked', 'true');
      const savedName = adminInputName.trim() || 'الأستاذ المشرف';
      localStorage.setItem('adminName', savedName);
      setAdminName(savedName);
      setAdminInputPassword('');
      setShowAdminPassModal(false);
      setIsAdminPanelOpen(true);
    } else {
      setAdminPassError('رمز الدخول غير صحيح! الرمز الافتراضي: 1122 أو 3344');
    }
  };

  const handleSaveStudentProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (!studentName.trim()) return;
    localStorage.setItem('liveStudentUsername', studentName.trim());
    localStorage.setItem('loggedInUsername', studentName.trim());
    localStorage.setItem('liveStudentSheet', studentNumber.trim());
    localStorage.setItem('loggedInSheetNumber', studentNumber.trim());
    setIsEditingStudent(false);
  };

  const copyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  // Route: Standalone Teacher Chat Window
  if (pageMode === 'chat') {
    return (
      <StandaloneChatRoom
        onBack={() => navigateToPage('admin')}
      />
    );
  }

  // Route: Standalone Script Prompter & Subtitle Control Window
  if (pageMode === 'script-prompter') {
    return (
      <ScriptPrompterPanel
        isStandalone={true}
        onBack={() => navigateToPage('admin')}
      />
    );
  }

  // Route: Live Classroom Teacher Theater
  if (pageMode === 'live-teacher') {
    return (
      <LiveTeacherRoom
        initialLesson={activeLiveLesson || undefined}
        allLessons={allLiveLessons}
        onBack={() => navigateToPage('student')}
      />
    );
  }

  // Route: Live Student Interactive Device
  if (pageMode === 'live-student') {
    return (
      <LiveStudentView
        onBackToMain={() => navigateToPage('student')}
      />
    );
  }

  // Route: Live Direct Display Room
  if (pageMode === 'live-direct-display') {
    return (
      <div className="relative min-h-screen bg-slate-950">
        <button
          onClick={() => navigateToPage('student')}
          className="fixed top-3 right-3 z-50 px-3 py-1.5 rounded-xl bg-slate-800/90 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition shadow-lg"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          العودة للرئيسية
        </button>
        <LiveDirectDisplayRoom />
      </div>
    );
  }

  // Route: Unified Smart Hub Display (الشاشة الرابعة الجامعة للبروجكتر مع التحويل التلقائي والتبديل السريع)
  if (pageMode === 'display') {
    return (
      <SmartHubDisplayRoom
        initialMode="auto"
        onBackToMain={() => navigateToPage('student')}
      />
    );
  }

  // Route: Quiz Arena Big Screen Display (ساحة تحدي كويز ومنصة التتويج المستقلة)
  if (pageMode === 'quiz-arena') {
    return (
      <SmartHubDisplayRoom
        initialMode="quiz"
        onBackToMain={() => navigateToPage('student')}
      />
    );
  }

  // Route: Student Quiz Fast Mobile View
  if (pageMode === 'student-quiz') {
    return (
      <LiveStudentView
        onBackToMain={() => navigateToPage('student')}
        headerConfig={headerConfig}
      />
    );
  }

  return (
    <div className="bg-gradient-to-br from-[#faf7f2] via-[#f5efe5] to-[#ebf3ed] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100 min-h-screen flex flex-col font-sans transition-colors duration-300 selection:bg-amber-500/20" dir="rtl">
      
      {/* ----------------- TOP NAVBAR ----------------- */}
      <header className="bg-[#fefdfa]/90 dark:bg-slate-900/90 border-b border-amber-100/60 dark:border-slate-800 sticky top-0 z-40 backdrop-blur-md px-4 py-3 shadow-sm transition-colors duration-300">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo & Branding - Strictly based on header sheet (no hardcoded fallbacks) */}
          <div className="flex items-center gap-3">
            {headerConfig?.logoUrl ? (
              <img
                src={headerConfig.logoUrl}
                alt="Logo"
                className="w-10 h-10 rounded-2xl object-cover shadow-md border border-amber-200/60 dark:border-slate-700 bg-white dark:bg-slate-800"
                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
              />
            ) : null}
            {(headerConfig?.title || headerConfig?.subtitle) ? (
              <div>
                {headerConfig.title && (
                  <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-50 tracking-tight">
                    {headerConfig.title}
                  </h1>
                )}
                {headerConfig.subtitle && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                    {headerConfig.subtitle}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          {/* Quick Controls */}
          <div className="flex items-center gap-2">
            
            {/* Admin Access Button */}
            {isAdminUnlocked ? (
              <button
                onClick={() => setIsAdminPanelOpen(true)}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/10 transition cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4 text-slate-950" />
                <span>لوحة التحكم المركزية</span>
              </button>
            ) : (
              <button
                onClick={() => setShowAdminPassModal(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>دخول الإدارة / المعلم</span>
              </button>
            )}

            {/* Dark Mode Toggle */}
            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition cursor-pointer"
              title={darkMode ? 'الوضع الفاتح' : 'الوضع الليلي'}
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-700" />}
            </button>
          </div>

        </div>
      </header>

      {/* ----------------- MAIN CONTENT ----------------- */}
      <main className="flex-grow max-w-5xl mx-auto w-full px-4 py-6 sm:py-8 space-y-4">
        {(() => {
          const connectedList = liveSession?.connectedStudents || [];
          const answersMap = liveSession?.answersForCurrentQuestion || {};
          const answerEntries = Object.values(answersMap);
          const answeredNames = new Set(
            answerEntries.map((sub) => String(sub.username || '').trim().toLowerCase()).filter(Boolean)
          );
          const unansweredList = connectedList.filter(
            (s) => !answeredNames.has(String(s.username || '').trim().toLowerCase())
          );
          const isProgramRunning = Boolean(liveSession?.isProgramActive);
          const currentPin = effectivePin;
          const isQuizLiveActive = Boolean(
            liveSession?.quizState?.isActive &&
            (liveSession?.quizState?.quizStatus === 'in_progress' || liveSession?.quizState?.quizStatus === 'waiting')
          );
          const isVideoQuestionActive = liveSession?.status === 'question_active';
          const isCameraActive = Boolean(liveSession?.streamState?.isActive);
          const isSubtitlesShown = Boolean(liveSession?.subtitleState?.showToStudents);

          const mainButtons: Array<{
            id: QuickPanelId;
            label: string;
            renderIcon: (isOpen: boolean) => React.ReactNode;
            activeClass: string;
            badge?: React.ReactNode;
          }> = [
            {
              id: 'screen',
              label: 'الشاشة',
              renderIcon: (isOpen) => <Monitor className={`w-4 h-4 ${isOpen ? 'text-slate-950' : 'text-amber-500'}`} />,
              activeClass: 'bg-amber-500 text-slate-950 border-amber-400 shadow-md shadow-amber-500/20',
            },
            {
              id: 'start',
              label: 'ابدأ',
              renderIcon: (isOpen) => (
                <Power className={`w-4 h-4 ${isOpen ? 'text-white' : isProgramRunning ? 'text-emerald-500' : 'text-indigo-500'}`} />
              ),
              activeClass: 'bg-emerald-600 text-white border-emerald-500 shadow-md shadow-emerald-600/20',
              badge: isProgramRunning && currentPin ? (
                <span className="px-1.5 py-0.5 rounded-md bg-black/20 font-mono text-[10px] font-black">
                  {currentPin}
                </span>
              ) : undefined,
            },
            {
              id: 'login',
              label: 'تسجيل الدخول',
              renderIcon: (isOpen) => <Users className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-blue-500'}`} />,
              activeClass: 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20',
              badge: (
                <span className="px-1.5 py-0.5 rounded-md bg-black/15 dark:bg-white/10 font-mono text-[10px] font-black">
                  {connectedList.length}
                </span>
              ),
            },
            {
              id: 'quiz',
              label: 'تحدي الكويز',
              renderIcon: (isOpen) => <Trophy className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-purple-500'}`} />,
              activeClass: 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20',
              badge: isQuizLiveActive ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              ) : undefined,
            },
            {
              id: 'video-questions',
              label: 'أسئلة الفيديو',
              renderIcon: (isOpen) => <ListVideo className={`w-4 h-4 ${isOpen ? 'text-slate-950' : 'text-orange-500'}`} />,
              activeClass: 'bg-orange-500 text-slate-950 border-orange-400 shadow-md shadow-orange-500/20',
              badge: isVideoQuestionActive ? (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              ) : undefined,
            },
            {
              id: 'live-direct',
              label: 'البث المباشر',
              renderIcon: (isOpen) => <Radio className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-rose-500'}`} />,
              activeClass: 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/20',
              badge: liveSession?.mode === 'direct' && isVideoQuestionActive ? (
                <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
              ) : undefined,
            },
            {
              id: 'pdf',
              label: 'PDF',
              renderIcon: (isOpen) => <BookOpen className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-emerald-500'}`} />,
              activeClass: 'bg-teal-600 text-white border-teal-500 shadow-md shadow-teal-600/20',
              badge: liveSession?.showPdfInRoom ? (
                <span className="w-2 h-2 rounded-full bg-emerald-300 animate-pulse" />
              ) : undefined,
            },
            {
              id: 'camera',
              label: 'كاميرا',
              renderIcon: (isOpen) => <Video className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-sky-500'}`} />,
              activeClass: 'bg-sky-600 text-white border-sky-500 shadow-md shadow-sky-600/20',
              badge: isCameraActive ? (
                <span className="w-2 h-2 rounded-full bg-rose-400 animate-ping" />
              ) : undefined,
            },
            {
              id: 'translation',
              label: 'الترجمة',
              renderIcon: (isOpen) => <Captions className={`w-4 h-4 ${isOpen ? 'text-slate-950' : 'text-indigo-500'}`} />,
              activeClass: 'bg-indigo-500 text-white border-indigo-400 shadow-md shadow-indigo-500/20',
              badge: isSubtitlesShown ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ) : undefined,
            },
          ];

          return (
            <>
              {/* ========== MASTER CARD: TOP QUICK-CONTROL BUTTON BAR ========== */}
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2.5 flex-1">
                    {mainButtons.map((btn) => {
                      const isOpen = openPanels.includes(btn.id);
                      return (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={() => toggleQuickPanel(btn.id)}
                          className={`px-4 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 border transition-all cursor-pointer active:scale-[0.98] ${
                            isOpen
                              ? btn.activeClass
                              : 'bg-slate-50 dark:bg-slate-950 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          {btn.renderIcon(isOpen)}
                          <span>{btn.label}</span>
                          {btn.badge}
                        </button>
                      );
                    })}
                  </div>

                  {openPanels.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setOpenPanels([])}
                      className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/15 text-slate-500 hover:text-rose-500 text-xs font-bold flex items-center gap-1 border border-slate-200 dark:border-slate-700 transition cursor-pointer shrink-0"
                      title="إغلاق جميع البطاقات المفتوحة"
                    >
                      <X className="w-3.5 h-3.5" />
                      <span>إغلاق الكل</span>
                    </button>
                  )}
                </div>
              </section>

              {/* ========== STACKABLE OPEN CARDS BELOW MASTER CARD ========== */}
              {openPanels.map((panelId) => {
                if (panelId === 'screen') {
                  return (
                    <section
                      key="screen"
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
                            <Monitor className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                            الشاشة
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('screen')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/15 text-slate-500 hover:text-rose-500 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4 flex flex-wrap items-center gap-2.5">
                        <button
                          type="button"
                          onClick={() => navigateToPage('display')}
                          className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer active:scale-[0.98]"
                        >
                          <LayoutGrid className="w-3.5 h-3.5 shrink-0" />
                          <span>جميع الشاشات</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => navigateToPage('live-direct-display')}
                          className="px-3.5 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer active:scale-[0.98]"
                        >
                          <Film className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                          <span>فيديو مباشر</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (isAdminUnlocked) {
                              navigateToPage('live-teacher');
                            } else {
                              setShowAdminPassModal(true);
                            }
                          }}
                          className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer active:scale-[0.98]"
                        >
                          <Radio className="w-3.5 h-3.5 shrink-0" />
                          <span>بث مباشر</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => navigateToPage('quiz-arena')}
                          className="px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition shadow-sm cursor-pointer active:scale-[0.98]"
                        >
                          <Trophy className="w-3.5 h-3.5 shrink-0" />
                          <span>التحدي</span>
                        </button>
                      </div>
                    </section>
                  );
                }

                if (panelId === 'start') {
                  return (
                    <section
                      key="start"
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                              isProgramRunning
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-indigo-500/15 text-indigo-500'
                            }`}
                          >
                            <Power className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                            ابدأ
                          </span>
                          {isProgramRunning && currentPin && (
                            <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-mono text-[11px] font-black border border-emerald-500/30">
                              PIN: {currentPin}
                            </span>
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('start')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/15 text-slate-500 hover:text-rose-500 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4 flex flex-wrap items-center gap-2.5">
                        {/* 1. Start / End + Access Mode Toggle + PIN + Copy PIN */}
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={handleToggleProgramHome}
                            disabled={isTogglingProgram}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer active:scale-[0.98] disabled:opacity-50 ${
                              isProgramRunning
                                ? 'bg-rose-600 hover:bg-rose-500 text-white'
                                : 'bg-emerald-600 hover:bg-emerald-500 text-white'
                            }`}
                          >
                            <Power className={`w-3.5 h-3.5 ${isTogglingProgram ? 'animate-spin' : ''}`} />
                            <span>{isTogglingProgram ? 'جارٍ...' : isProgramRunning ? 'إنهاء' : 'ابدأ'}</span>
                          </button>

                          {/* Toggle Verification (تحقيق / إلغاء التحقق) */}
                          <button
                            type="button"
                            onClick={async () => {
                              const nextMode = liveSession?.accessMode === 'open' ? 'restricted' : 'open';
                              setLiveSession((prev) => (prev ? { ...prev, accessMode: nextMode } : prev));
                              await toggleLiveAccessMode(nextMode);
                            }}
                            className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition cursor-pointer active:scale-[0.98] border ${
                              liveSession?.accessMode === 'open'
                                ? 'bg-emerald-600 hover:bg-emerald-500 text-white border-emerald-400/50'
                                : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
                            }`}
                            title={
                              liveSession?.accessMode === 'open'
                                ? 'الدخول حالياً مفتوح للجميع بدون قيود. اضغط على "تحقيق" لتفعيل التحقق'
                                : 'التحقق مفعل حالياً. اضغط على "إلغاء التحقق" لجعل الدخول مفتوحاً بدون قيود'
                            }
                          >
                            {liveSession?.accessMode === 'open' ? (
                              <>
                                <Lock className="w-3.5 h-3.5" />
                                <span>تحقيق 🔒</span>
                              </>
                            ) : (
                              <>
                                <Unlock className="w-3.5 h-3.5" />
                                <span>إلغاء التحقق 🔓</span>
                              </>
                            )}
                          </button>

                          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 rounded-xl font-mono text-xs">
                            <span className="text-slate-500 dark:text-slate-400">PIN:</span>
                            <span className="font-black text-amber-600 dark:text-amber-300">
                              {currentPin || '----'}
                            </span>
                            <button
                              type="button"
                              onClick={() => currentPin && copyLink(currentPin, 'pin-code')}
                              disabled={!currentPin}
                              title="نسخ رقم PIN"
                              className="p-0.5 text-slate-500 hover:text-amber-500 transition cursor-pointer disabled:opacity-40"
                            >
                              {copiedLink === 'pin-code' ? (
                                <Check className="w-3.5 h-3.5 text-emerald-500" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        </div>

                        {/* 2. Copy Student Join Link (includes PIN automatically) */}
                        <button
                          type="button"
                          onClick={() => copyLink(studentJoinUrl, 'home-student-link')}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                        >
                          {copiedLink === 'home-student-link' ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                          ) : (
                            <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                          )}
                          <span>{copiedLink === 'home-student-link' ? 'تم النسخ' : 'نسخ رابط'}</span>
                        </button>

                        {/* 3. Quick QR Code Modal (embeds live PIN dynamically) */}
                        <button
                          type="button"
                          onClick={() => setShowQrModal(true)}
                          className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs flex items-center gap-1.5 border border-slate-200 dark:border-slate-700 transition cursor-pointer"
                        >
                          <QrCode className="w-3.5 h-3.5 text-amber-500" />
                          <span>رمز الدخول السريع (QR Code)</span>
                        </button>
                      </div>
                    </section>
                  );
                }

                if (panelId === 'login') {
                  return (
                    <section
                      key="login"
                      className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden"
                    >
                      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-500 flex items-center justify-center shrink-0">
                            <Users className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-slate-900 dark:text-white">
                            تسجيل الدخول
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono text-[11px] font-bold">
                            {connectedList.length}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('login')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-rose-500/15 text-slate-500 hover:text-rose-500 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4 space-y-3">
                        {/* Clean Direct Metrics without sub-tabs: عدد المتصلون / الذين لم يجاوبوا / إجابات الطلاب */}
                        <div className="grid grid-cols-3 gap-2">
                          <button
                            type="button"
                            onClick={() => setLoginFilterView('live')}
                            className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                              loginFilterView === 'live'
                                ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-400/60'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                              عدد المتصلون
                            </div>
                            <div className="text-base font-black text-indigo-600 dark:text-indigo-400 font-mono">
                              {connectedList.length}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setLoginFilterView('unanswered')}
                            className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                              loginFilterView === 'unanswered'
                                ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-400/60'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3 text-amber-500" />
                              <span>الذين لم يجاوبوا</span>
                            </div>
                            <div className="text-base font-black text-amber-600 dark:text-amber-400 font-mono">
                              {unansweredList.length}
                            </div>
                          </button>

                          <button
                            type="button"
                            onClick={() => setLoginFilterView('answers')}
                            className={`p-2.5 rounded-xl border text-right transition cursor-pointer ${
                              loginFilterView === 'answers'
                                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-400/60'
                                : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                            }`}
                          >
                            <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                              <span>إجابات الطلاب</span>
                            </div>
                            <div className="text-base font-black text-emerald-600 dark:text-emerald-400 font-mono">
                              {answerEntries.length}
                            </div>
                          </button>
                        </div>

                        {/* Active Roster / Data List */}
                        <div className="max-h-56 overflow-y-auto rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 p-2.5 space-y-1.5 text-xs">
                          {loginFilterView === 'live' && (
                            connectedList.length === 0 ? (
                              <div className="text-center text-slate-400 py-3">لا يوجد طلاب متصلون حالياً</div>
                            ) : (
                              connectedList.map((s, idx) => (
                                <div
                                  key={`${s.username}_${s.sheetNumber}_${idx}`}
                                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800"
                                >
                                  <span className="font-bold text-slate-800 dark:text-slate-100">{s.username}</span>
                                  {s.sheetNumber && (
                                    <span className="font-mono text-[11px] text-slate-500">#{s.sheetNumber}</span>
                                  )}
                                </div>
                              ))
                            )
                          )}

                          {loginFilterView === 'unanswered' && (
                            unansweredList.length === 0 ? (
                              <div className="text-center text-slate-400 py-3">لا يوجد طلاب منتظرون للإجابة</div>
                            ) : (
                              unansweredList.map((s, idx) => (
                                <div
                                  key={`${s.username}_${s.sheetNumber}_${idx}`}
                                  className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-amber-500/20"
                                >
                                  <span className="font-bold text-slate-800 dark:text-slate-100">{s.username}</span>
                                  <span className="text-[11px] text-amber-500 font-bold">لم يجب بعد</span>
                                </div>
                              ))
                            )
                          )}

                          {loginFilterView === 'answers' && (
                            answerEntries.length === 0 ? (
                              <div className="text-center text-slate-400 py-3">لا توجد إجابات مسجلة للسؤال الحالي</div>
                            ) : (
                              answerEntries.map((sub, idx) => (
                                <div
                                  key={`${sub.username}_${idx}`}
                                  className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-emerald-500/20"
                                >
                                  <span className="font-bold text-slate-800 dark:text-slate-100">{sub.username}</span>
                                  <span className="font-bold text-emerald-600 dark:text-emerald-400 truncate max-w-[55%]">
                                    {sub.answer}
                                  </span>
                                </div>
                              ))
                            )
                          )}
                        </div>
                      </div>
                    </section>
                  );
                }

                if (panelId === 'quiz') {
                  return (
                    <section
                      key="quiz"
                      className="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden text-slate-100"
                    >
                      <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/60">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                            <Trophy className="w-3.5 h-3.5" />
                          </div>
                          <span className="text-sm font-black text-white">
                            تحدي الكويز — غرفة التحكم المباشرة
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('quiz')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-2.5 sm:p-3">
                        <QuizManagerPanel
                          sessionState={liveSession}
                          embeddedControlOnly={true}
                        />
                      </div>
                    </section>
                  );
                }

                if (panelId === 'video-questions') {
                  return (
                    <section
                      key="video-questions"
                      className="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden text-slate-100"
                    >
                      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-orange-500/15 text-orange-400 flex items-center justify-center shrink-0">
                            <ListVideo className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-white">
                            أسئلة الفيديو
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('video-questions')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4">
                        <LiveClassManager embeddedVideoQuestionsOnly={true} />
                      </div>
                    </section>
                  );
                }

                if (panelId === 'live-direct') {
                  return (
                    <section
                      key="live-direct"
                      className="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden text-slate-100"
                    >
                      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center shrink-0">
                            <Radio className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-white">
                            البث المباشر — قائمة الدروس وبنك الأسئلة المباشرة
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('live-direct')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4">
                        <LiveDirectManager
                          embeddedView="broadcast"
                          onOpenDisplayScreen={() => navigateToPage('live-direct-display')}
                        />
                      </div>
                    </section>
                  );
                }

                if (panelId === 'pdf') {
                  return (
                    <section
                      key="pdf"
                      className="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden text-slate-100"
                    >
                      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                            <BookOpen className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-white">
                            PDF — مكتبة أدوات التعليم وعرض الملفات
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('pdf')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4">
                        <LiveDirectManager
                          embeddedView="pdf"
                          onOpenDisplayScreen={() => navigateToPage('live-direct-display')}
                        />
                      </div>
                    </section>
                  );
                }

                if (panelId === 'camera') {
                  return (
                    <section
                      key="camera"
                      className="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden text-slate-100"
                    >
                      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                            <Video className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-white">
                            كاميرا — الكاميرا والبث المباشر
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('camera')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4">
                        <LiveCameraManager />
                      </div>
                    </section>
                  );
                }

                if (panelId === 'translation') {
                  return (
                    <section
                      key="translation"
                      className="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden text-slate-100"
                    >
                      <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3 bg-slate-950/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-indigo-500/15 text-indigo-400 flex items-center justify-center shrink-0">
                            <Captions className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-white">
                            الترجمة — التحكم السريع بالترجمة والتتبع الصوتي
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => closeQuickPanel('translation')}
                          title="إغلاق"
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>

                      <div className="p-4">
                        <ScriptPrompterPanel embeddedTranslationQuickOnly={true} />
                      </div>
                    </section>
                  );
                }

                return null;
              })}
            </>
          );
        })()}
      </main>

      {/* ----------------- MODAL: QUICK ENTRY QR CODE ----------------- */}
      <AnimatePresence>
        {showQrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-sm w-full text-center space-y-4 shadow-2xl relative"
              dir="rtl"
            >
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="absolute top-4 left-4 p-1.5 text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-white rounded-xl bg-slate-100 dark:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
              <h3 className="text-base font-black text-slate-900 dark:text-slate-100">
                رمز الدخول السريع (QR Code)
              </h3>
              <div className="p-3 bg-white rounded-2xl inline-block border border-slate-200 shadow-inner">
                {qrDataUrl ? (
                  <img src={qrDataUrl} alt="QR Code" className="w-48 h-48 object-contain" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center text-xs text-slate-400">
                    جارٍ التجهيز...
                  </div>
                )}
              </div>
              <div className="font-mono text-base font-black text-amber-600 dark:text-amber-400 tracking-widest bg-slate-100 dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                PIN: {effectivePin || '----'}
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                {effectivePin
                  ? 'رمز PIN مدمج تلقائياً داخل هذا الباركود ورابط النسخ للدخول السريع.'
                  : 'اضغط على زر "ابدأ" لتوليد رقم PIN ودمجه تلقائياً في الباركود.'}
              </p>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ----------------- MODAL: STUDENT PROFILE EDIT ----------------- */}
      <AnimatePresence>
        {isEditingStudent && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl text-right"
            >
              <h3 className="text-base font-black text-slate-900 dark:text-white mb-2 flex items-center gap-2">
                <Users className="w-5 h-5 text-amber-500" />
                بيانات الطالب لحفظ الإجابات
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                يتم تسجيل اسمك ورقمك المدرسي في أوراق الشيت عند الإجابة على أي سؤال تفاعلي.
              </p>

              <form onSubmit={handleSaveStudentProfile} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    اسم الطالب (ثلاثي أو ثنائي):
                  </label>
                  <input
                    type="text"
                    required
                    value={studentName}
                    onChange={(e) => setStudentName(e.target.value)}
                    placeholder="مثال: أحمد محمد علي"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رقم الطالب المدرسي / رقم الورقة (اختياري):
                  </label>
                  <input
                    type="text"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    placeholder="مثال: 101 أو 12"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    حفظ ومتابعة
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingStudent(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ----------------- MODAL: ADMIN PASSWORD ----------------- */}
      <AnimatePresence>
        {showAdminPassModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm">
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl text-right"
            >
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 flex items-center justify-center mb-3">
                <Lock className="w-6 h-6" />
              </div>

              <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">
                تسجيل دخول الإدارة والمعلم
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                أدخل رمز المرور الإداري (الرمز الافتراضي: <span className="font-mono font-bold text-amber-500">1122</span> أو <span className="font-mono font-bold text-amber-500">3344</span>)
              </p>

              <form onSubmit={handleAdminUnlock} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    اسم المعلم / الإداري:
                  </label>
                  <input
                    type="text"
                    value={adminInputName}
                    onChange={(e) => setAdminInputName(e.target.value)}
                    placeholder="مثال: أستاذ أحمد..."
                    className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right text-xs focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    رمز المرور الإداري:
                  </label>
                  <input
                    type="password"
                    autoFocus
                    required
                    value={adminInputPassword}
                    onChange={(e) => setAdminInputPassword(e.target.value)}
                    placeholder="رمز المرور الإداري..."
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-mono text-base focus:outline-none focus:border-amber-500"
                  />
                  {adminPassError && (
                    <p className="text-xs text-rose-500 font-bold mt-1.5">{adminPassError}</p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition cursor-pointer"
                  >
                    دخول
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAdminPassModal(false);
                      setAdminPassError(null);
                      setAdminInputPassword('');
                    }}
                    className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-bold transition cursor-pointer"
                  >
                    إلغاء
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ----------------- STANDALONE ADMIN PANEL MODAL ----------------- */}
      <AnimatePresence>
        {isAdminPanelOpen && (
          <AdminPanel
            onClose={() => setIsAdminPanelOpen(false)}
            onStartTeacherTheater={(lesson) => {
              setActiveLiveLesson(lesson);
              navigateToPage('live-teacher');
              setIsAdminPanelOpen(false);
            }}
            onOpenLiveDirectDisplay={() => {
              navigateToPage('live-direct-display');
              setIsAdminPanelOpen(false);
            }}
            onOpenQuizArenaDisplay={() => {
              navigateToPage('quiz-arena');
              setIsAdminPanelOpen(false);
            }}
            onOpenSmartDisplay={() => {
              navigateToPage('display');
              setIsAdminPanelOpen(false);
            }}
          />
        )}
      </AnimatePresence>

    </div>
  );
}
