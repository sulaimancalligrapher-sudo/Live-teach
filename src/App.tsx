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
import StudentQuizView from './components/StudentQuizView';
import LanguageSelector from './components/LanguageSelector';
import SettingsPanel from './components/SettingsPanel';
import { useLanguage } from './translations';

export default function App() {
  const { t } = useLanguage();
  const [webAppUrl, setWebAppUrl] = useState(getWebAppUrl());
  const [isConfigured, setIsConfigured] = useState(isApiConfigured());
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);

  // Page Routing Mode: 'student' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz'
  const [pageMode, setPageMode] = useState<'student' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const p = params.get('page');
      if (p === 'admin') return 'admin';
      if (p === 'live-teacher') return 'live-teacher';
      if (p === 'live-student') return 'live-student';
      if (p === 'live-direct-display' || p === 'live-direct' || p === 'live-display') return 'live-direct-display';
      if (p === 'quiz-arena' || p === 'quiz-display') return 'quiz-arena';
      if (p === 'student-quiz') return 'student-quiz';
    }
    return 'student';
  });

  const [isAdminUnlocked, setIsAdminUnlocked] = useState(() => localStorage.getItem('isAdminUnlocked') === 'true');
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [showAdminPassModal, setShowAdminPassModal] = useState(false);
  const [adminInputPassword, setAdminInputPassword] = useState('');
  const [adminPassError, setAdminPassError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Live Classroom Lessons
  const [allLiveLessons, setAllLiveLessons] = useState<LiveLessonRow[]>([]);
  const [activeLiveLesson, setActiveLiveLesson] = useState<LiveLessonRow | null>(null);

  // Fast Student PIN & Join State
  const [enteredPin, setEnteredPin] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);
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
  const navigateToPage = (mode: 'student' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz') => {
    setPageMode(mode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (mode === 'admin') {
        url.searchParams.set('page', 'admin');
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
      setAdminInputPassword('');
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

  const handleQuickPinJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setPinError(null);
    if (!enteredPin.trim()) {
      setPinError('يرجى كتابة رمز الـ PIN المكون من 4 أرقام');
      return;
    }
    // Save credentials & jump to live student view
    if (studentName.trim()) {
      localStorage.setItem('liveStudentUsername', studentName.trim());
    }
    if (studentNumber.trim()) {
      localStorage.setItem('liveStudentSheet', studentNumber.trim());
    }
    sessionStorage.setItem('prefilledPin', enteredPin.trim());
    navigateToPage('live-student');
  };

  const copyLink = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

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

  // Route: Quiz Arena Big Screen Display (Projector / Theater Screen)
  if (pageMode === 'quiz-arena') {
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

  // Route: Student Quiz Fast Mobile View
  if (pageMode === 'student-quiz') {
    return (
      <LiveStudentView
        onBackToMain={() => navigateToPage('student')}
      />
    );
  }

  return (
    <div className="bg-gradient-to-br from-[#faf7f2] via-[#f5efe5] to-[#ebf3ed] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100 min-h-screen flex flex-col font-sans transition-colors duration-300 selection:bg-amber-500/20" dir="rtl">
      
      {/* ----------------- TOP NAVBAR ----------------- */}
      <header className="bg-[#fefdfa]/90 dark:bg-slate-900/90 border-b border-amber-100/60 dark:border-slate-800 sticky top-0 z-40 backdrop-blur-md px-4 py-3 shadow-sm transition-colors duration-300">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          
          {/* Logo & Branding */}
          <div className="flex items-center gap-3">
            {headerConfig?.logoUrl ? (
              <img
                src={headerConfig.logoUrl}
                alt="Logo"
                className="w-10 h-10 rounded-2xl object-cover shadow-md border border-amber-200/60 dark:border-slate-700 bg-white dark:bg-slate-800"
                onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
              />
            ) : (
              <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-amber-400 via-orange-400 to-amber-500 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/20 text-lg">
                ⚡
              </div>
            )}
            <div>
              <h1 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-50 tracking-tight">
                {headerConfig?.title || 'منظومة البث والتفاعل المباشر'}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                الحصص التفاعلية • الشرح المباشر • ساحة تحدي كويز
              </p>
            </div>
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

            {/* Language Selector */}
            <LanguageSelector />
          </div>

        </div>
      </header>

      {/* ----------------- MAIN CONTENT ----------------- */}
      <main className="flex-grow max-w-6xl mx-auto w-full px-4 py-6 sm:py-8 space-y-8">
        
        {/* HERO SECTION WITH PIN ENTRY */}
        <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-slate-800 text-white p-6 sm:p-10 shadow-2xl">
          <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(245,158,11,0.15),rgba(255,255,255,0))] pointer-events-none" />
          
          <div className="relative z-10 max-w-3xl mx-auto text-center space-y-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-400/10 text-amber-300 border border-amber-400/30">
              <Sparkles className="w-3.5 h-3.5" />
              منصة تفاعلية موحدة مع Google Sheets
            </span>

            <h2 className="text-2xl sm:text-4xl font-black text-white leading-tight">
              تفاعل مباشر، شرح حي، وتحديات كويز حماسية
            </h2>
            
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl mx-auto leading-relaxed">
              انضم إلى الحصة التفاعلية المباشرة أو الشرح الحي أو تحدي كويز عبر إدخال رمز الـ PIN أو اختيار القسم الذي ترغب به أدناه.
            </p>

            {/* FAST PIN BAR */}
            <form onSubmit={handleQuickPinJoin} className="pt-2 max-w-md mx-auto">
              <div className="flex items-center gap-2 p-1.5 bg-slate-800/90 rounded-2xl border border-slate-700/80 shadow-lg backdrop-blur-md">
                <div className="px-3 text-slate-400 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-400" />
                  <span className="text-xs font-bold text-slate-300">PIN:</span>
                </div>
                <input
                  type="text"
                  maxLength={6}
                  value={enteredPin}
                  onChange={(e) => setEnteredPin(e.target.value)}
                  placeholder="أدخل رمز الحصة..."
                  className="flex-grow bg-transparent text-white font-mono font-bold text-base tracking-widest text-center focus:outline-none placeholder:text-slate-500 placeholder:font-normal placeholder:tracking-normal placeholder:text-xs"
                />
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <LogIn className="w-4 h-4" />
                  <span>دخول</span>
                </button>
              </div>

              {pinError && (
                <p className="text-xs text-rose-400 font-bold mt-2 text-center">
                  {pinError}
                </p>
              )}
            </form>

            {/* Logged in Student Quick Profile Pill */}
            <div className="pt-2 flex items-center justify-center gap-2 text-xs text-slate-400">
              {studentName ? (
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-xl bg-slate-800/60 border border-slate-700/60">
                  <span className="text-slate-400">الطالب الحالي:</span>
                  <span className="font-bold text-amber-300">{studentName}</span>
                  {studentNumber && <span className="font-mono text-slate-400">({studentNumber})</span>}
                  <button
                    onClick={() => setIsEditingStudent(true)}
                    className="text-slate-400 hover:text-white underline text-[11px] cursor-pointer mr-1"
                  >
                    تغيير
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingStudent(true)}
                  className="inline-flex items-center gap-1.5 text-amber-300 hover:text-amber-200 underline text-xs cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5" />
                  تسجيل اسمك ورقمك المدرسي لحفظ درجاتك بالشيت
                </button>
              )}
            </div>

          </div>
        </section>

        {/* ----------------- THREE EXTRACTED CORE SECTIONS ----------------- */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg sm:text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Radio className="w-5 h-5 text-amber-500" />
                الأقسام والأنظمة التفاعلية المستخرجة
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                ثلاثة أقسام مستقلة بالكامل متصلة بأوراق Google Sheets الخاصة بها
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* ================= CARD 1: LIVE CLASSROOM (Questions-T & Answers-T) ================= */}
            <div className="group relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 rounded-full blur-2xl group-hover:bg-blue-500/20 transition" />
              
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center text-xl shadow-sm">
                    <Tv className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-700/50">
                      Questions-T
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-2">
                    الحصص التفاعلية المباشرة
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    عرض فيديو الدرس مع أسئلة منبثقة تفاعلية عند كل توقيت محدد، وتجميع إجابات الطلاب وحفظها تلقائياً في ورقة <b>Answers-T</b>.
                  </p>
                </div>

                {/* Sub-features list */}
                <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>مزامنة فيديو وتوقيت ظهور السؤال</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>أسئلة خيارات متعددة وأسئلة نصية حرة</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />
                    <span>رصد فوري في ورقة <b>Answers-T</b></span>
                  </li>
                </ul>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 relative z-10">
                <button
                  onClick={() => navigateToPage('live-student')}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-blue-500/20"
                >
                  <LogIn className="w-4 h-4" />
                  <span>دخول غرفة الطالب (Live Student)</span>
                </button>
                <button
                  onClick={() => {
                    if (isAdminUnlocked) {
                      navigateToPage('live-teacher');
                    } else {
                      setShowAdminPassModal(true);
                    }
                  }}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5 text-blue-500" />
                  <span>فتح مسرح المعلم (Teacher Room)</span>
                </button>
              </div>
            </div>

            {/* ================= CARD 2: LIVE DIRECT LECTURE (Questions-Live & Answers-Live) ================= */}
            <div className="group relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl group-hover:bg-amber-500/20 transition" />
              
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center text-xl shadow-sm">
                    <Mic className="w-6 h-6 animate-pulse" />
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-700/50">
                      Questions-Live
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-2">
                    شرح مباشر (Live Direct)
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    إدارة أسئلة المحاضرات الحية وبث الأسئلة الفورية للطلاب مع عداد زمني، ورصد النتائج فورياً في ورقة <b>Answers-Live</b>.
                  </p>
                </div>

                {/* Sub-features list */}
                <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>شاشة عرض للمحاضر والبروجكتور (Display Screen)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>إرسال أسئلة فورية مع عد تنازلي</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-amber-500" />
                    <span>تسجيل النتائج والتصويت في <b>Answers-Live</b></span>
                  </li>
                </ul>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 relative z-10">
                <button
                  onClick={() => navigateToPage('live-direct-display')}
                  className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-amber-500/20"
                >
                  <Monitor className="w-4 h-4" />
                  <span>فتح شاشة العرض المباشر (Display Room)</span>
                </button>
                <button
                  onClick={() => navigateToPage('live-student')}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-amber-500" />
                  <span>انضمام كطالب للشرح المباشر</span>
                </button>
              </div>
            </div>

            {/* ================= CARD 3: QUIZ CHALLENGE (Questions-Qui & Answers-Qui) ================= */}
            <div className="group relative rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col justify-between overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/10 rounded-full blur-2xl group-hover:bg-purple-500/20 transition" />
              
              <div className="relative z-10 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="w-12 h-12 rounded-2xl bg-purple-500/10 text-purple-500 dark:bg-purple-500/20 dark:text-purple-400 flex items-center justify-center text-xl shadow-sm">
                    <Trophy className="w-6 h-6" />
                  </div>
                  <div className="text-right">
                    <span className="px-2.5 py-1 rounded-full text-[10px] font-bold font-mono bg-purple-100 dark:bg-purple-900/40 text-purple-800 dark:text-purple-300 border border-purple-200 dark:border-purple-700/50">
                      Questions-Qui
                    </span>
                  </div>
                </div>

                <div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white mb-1.5 flex items-center gap-2">
                    تحدي كويز (Quiz Arena)
                  </h4>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    ساحة تحدي سريعة وتنافسية على غرار كاهوت، مع لوحة متصدرين حية ومنصة فائزين، وتسجيل النقاط في <b>Answers-Qui</b>.
                  </p>
                </div>

                {/* Sub-features list */}
                <ul className="space-y-1.5 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-800/80 pt-3">
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                    <span>حلبة العرض الكبرى (Quiz Arena Display)</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                    <span>لوحة متصدرين ونقاط السرعة والإجابة</span>
                  </li>
                  <li className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-purple-500" />
                    <span>تخزين النتائج والمراكز في <b>Answers-Qui</b></span>
                  </li>
                </ul>
              </div>

              <div className="pt-5 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-2 relative z-10">
                <button
                  onClick={() => navigateToPage('quiz-arena')}
                  className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-md shadow-purple-500/20"
                >
                  <Trophy className="w-4 h-4" />
                  <span>فتح ساحة تحدي كويز (Quiz Arena)</span>
                </button>
                <button
                  onClick={() => navigateToPage('student-quiz')}
                  className="w-full py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                >
                  <Users className="w-3.5 h-3.5 text-purple-500" />
                  <span>واجهة الطالب للمسابقة (Quiz Remote)</span>
                </button>
              </div>
            </div>

          </div>
        </section>

        {/* ----------------- GOOGLE SHEETS CONNECTION & DESIGN BAR ----------------- */}
        <section className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-right">
            <h4 className="font-black text-slate-900 dark:text-white text-base flex items-center gap-2">
              <Settings className="w-5 h-5 text-amber-500" />
              أوراق الشيت وتصميم الصفحة
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              يمكنك ربط وتعديل رابط الـ Web App، تهيئة الأوراق التلقائية، وتخصيص العنوان والشعار وأزرار الصفحة من لوحة التحكم.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => {
                if (isAdminUnlocked) {
                  setIsAdminPanelOpen(true);
                } else {
                  setShowAdminPassModal(true);
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-bold text-xs flex items-center gap-2 transition cursor-pointer"
            >
              <Settings className="w-4 h-4 text-amber-400" />
              <span>إدارة الأوراق والتصميم</span>
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
          />
        )}
      </AnimatePresence>

    </div>
  );
}
