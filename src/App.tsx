import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Tv, Mic, Trophy, ShieldCheck, Lock, Unlock, 
  Settings, RefreshCw, Sun, Moon, Users, Play, 
  ExternalLink, KeyRound, CheckCircle2, Copy, 
  Sparkles, ArrowLeft, Globe, HelpCircle, Monitor,
  Radio, Compass, ChevronLeft, LogIn, LogOut, Check
} from 'lucide-react';
import { HeaderConfig, LiveLessonRow } from './types';
import { 
  fetchHeaderConfig, 
  getWebAppUrl, 
  isApiConfigured,
  fetchLiveQuestionsT,
  getLiveSessionState
} from './api';
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

  // Load Header Config
  useEffect(() => {
    fetchHeaderConfig().then(cfg => {
      if (cfg) setHeaderConfig(cfg);
    }).catch(() => {});

    fetchLiveQuestionsT().then(data => {
      if (data && data.length > 0) setAllLiveLessons(data);
    }).catch(() => {});
  }, [webAppUrl, isConfigured]);

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
      <main className="flex-grow max-w-6xl mx-auto w-full px-4 py-6 sm:py-8 space-y-8">
        
        {/* HERO SECTION WITH PIN ENTRY */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 text-white p-6 sm:p-10 shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))] pointer-events-none" />
          
          <div className="relative z-10 max-w-3xl mx-auto text-center space-y-4">
            {headerConfig?.title ? (
              <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight">
                {headerConfig.title}
              </h2>
            ) : null}
            
            {headerConfig?.subtitle ? (
              <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
                {headerConfig.subtitle}
              </p>
            ) : null}

            {/* Admin Profile & Action Bar */}
            <div className="pt-4 flex flex-col items-center justify-center gap-3 max-w-lg mx-auto">
              {isAdminUnlocked ? (
                <div className="w-full flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-800/90 border border-amber-500/40 text-amber-300 shadow-xl backdrop-blur-md">
                  <div className="flex items-center gap-3 text-right">
                    <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[11px] text-slate-400 font-bold">الحساب الإداري المعتمد:</div>
                      <div className="text-sm font-black text-white">{adminName || 'الأستاذ المشرف'}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAdminPanelOpen(true)}
                    className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer shadow-md shadow-amber-500/20 active:scale-95"
                  >
                    لوحة التحكم المركزية ⚙️
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowAdminPassModal(true)}
                  className="px-6 py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2.5 transition cursor-pointer shadow-lg shadow-amber-500/20 active:scale-95"
                >
                  <Lock className="w-4 h-4 text-slate-950" />
                  <span>تسجيل دخول المعلم / الإدارة 🔐</span>
                </button>
              )}
            </div>

          </div>
        </section>

        {/* ----------------- UNIFIED SCREEN ACTIONS CARD (الشاشة) ----------------- */}
        <section className="rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-lg">
          <div className="flex items-center gap-2.5 mb-5 pb-3 border-b border-slate-100 dark:border-slate-800">
            <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-500 flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5" />
            </div>
            <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-white">
              الشاشة
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <button
              onClick={() => navigateToPage('display')}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md shadow-amber-500/15 cursor-pointer active:scale-[0.98]"
            >
              <ExternalLink className="w-4 h-4 shrink-0" />
              <span>فتح الشاشة الجامعة</span>
            </button>

            <button
              onClick={() => navigateToPage('live-student')}
              className="w-full py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md shadow-blue-500/15 cursor-pointer active:scale-[0.98]"
            >
              <LogIn className="w-4 h-4 shrink-0" />
              <span>دخول غرفة الطالب</span>
            </button>

            <button
              onClick={() => {
                if (isAdminUnlocked) {
                  navigateToPage('live-teacher');
                } else {
                  setShowAdminPassModal(true);
                }
              }}
              className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
            >
              <Play className="w-4 h-4 text-blue-500 shrink-0" />
              <span>فتح مسرح المعلم</span>
            </button>

            <button
              onClick={() => navigateToPage('live-direct-display')}
              className="w-full py-3.5 px-4 rounded-2xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-700 dark:text-amber-300 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
            >
              <Monitor className="w-4 h-4 text-amber-500 shrink-0" />
              <span>شاشة العرض المباشر</span>
            </button>

            <button
              onClick={() => navigateToPage('live-student')}
              className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
            >
              <Users className="w-4 h-4 text-amber-500 shrink-0" />
              <span>انضمام كطالب للشرح المباشر</span>
            </button>

            <button
              onClick={() => navigateToPage('quiz-arena')}
              className="w-full py-3.5 px-4 rounded-2xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition shadow-md shadow-purple-500/15 cursor-pointer active:scale-[0.98]"
            >
              <Trophy className="w-4 h-4 shrink-0" />
              <span>فتح ساحة تحدي كويز</span>
            </button>

            <button
              onClick={() => navigateToPage('student-quiz')}
              className="w-full py-3.5 px-4 rounded-2xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-100 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition cursor-pointer active:scale-[0.98]"
            >
              <Users className="w-4 h-4 text-purple-500 shrink-0" />
              <span>واجهة الطالب للمسابقة</span>
            </button>
          </div>
        </section>

      </main>

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
