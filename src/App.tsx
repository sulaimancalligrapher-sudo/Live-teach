import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import QRCode from 'qrcode';
import { 
  Trophy, ShieldCheck, Lock, Unlock,
  Sun, Moon, Users, 
  Copy, ArrowLeft, Monitor,
  Radio, LayoutGrid, Film, Power, QrCode, Link as LinkIcon,
  X, Clock, CheckCircle2, Check,
  BookOpen, Video, Captions, MessageSquare, ExternalLink,
  LogOut, KeyRound, Eye, EyeOff, Loader2, User, Hash, AlertCircle,
  Facebook, Instagram, Youtube
} from 'lucide-react';
import { HeaderConfig, LiveLessonRow, LiveSessionState, AdminSheetUser, AdminAccessConfig } from './types';
import { 
  fetchHeaderConfig, 
  formatDriveImageUrl,
  getWebAppUrl, 
  isApiConfigured,
  fetchLiveQuestionsT,
  subscribeToLiveSession,
  startLiveProgram,
  endLiveProgram,
  toggleLiveAccessMode,
  replyToStudentMessage,
  deleteStudentMessage,
  clearAllStudentMessages,
  toggleShowChatInRoom,
  sendTeacherBroadcastMessage,
  verifyAdminCredentials,
  subscribeToAdminAccessConfig,
  matchAdminUserFromList,
  defaultAdminAccessConfig,
  fetchAdminUsersFromSheet
} from './api';
import { showAppConfirm } from './components/AppDialog';
import AdminPanel from './components/AdminPanel';
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
import LiveChatModal from './components/LiveChatModal';
import { useLanguage } from './translations';

export default function App() {
  const { t } = useLanguage();
  const [webAppUrl, setWebAppUrl] = useState(getWebAppUrl());
  const [isConfigured, setIsConfigured] = useState(isApiConfigured());
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);

  // Page Routing Mode:
  // 'public-home' (/) | 'control' (?live=control) | 'admin' (?Admin=controlroom2026) | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz' | 'display' | 'chat' | 'script-prompter'
  type AppPageMode = 'public-home' | 'control' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz' | 'display' | 'chat' | 'script-prompter';

  const resolvePageModeFromSearch = (search: string): AppPageMode => {
    const params = new URLSearchParams(search);
    const p = (params.get('page') || '').trim();
    const mode = (params.get('mode') || '').trim();
    const live = (params.get('live') || '').trim().toLowerCase();
    const adminParam = (params.get('Admin') || params.get('admin') || '').trim();

    if (p === 'chat' || mode === 'chat') return 'chat';
    if (p === 'script-prompter' || p === 'prompter') return 'script-prompter';
    if (adminParam.toLowerCase() === 'controlroom2026' || p === 'admin') return 'admin';
    if (live === 'control') return 'control';
    if (p === 'display' || p === 'smart-display') return 'display';
    if (p === 'live-teacher') return 'live-teacher';
    if (p === 'live-student') return 'live-student';
    if (p === 'live-direct-display' || p === 'live-direct' || p === 'live-display') return 'live-direct-display';
    if (p === 'quiz-arena' || p === 'quiz-display') return 'quiz-arena';
    if (p === 'student-quiz') return 'student-quiz';
    return 'public-home';
  };

  const [pageMode, setPageMode] = useState<AppPageMode>(() => {
    if (typeof window !== 'undefined') {
      return resolvePageModeFromSearch(window.location.search);
    }
    return 'public-home';
  });

  // Separate Authentication States: Quick Control (?live=control) vs Central Admin (?Admin=controlroom2026) backed by Admin sheet + Firestore
  const [adminAccessConfig, setAdminAccessConfig] = useState<AdminAccessConfig>(defaultAdminAccessConfig);

  const [homeAuthUser, setHomeAuthUser] = useState<AdminSheetUser | null>(() => {
    try {
      const raw = localStorage.getItem('homeAuthUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [homeInputName, setHomeInputName] = useState('');
  const [homeInputNumber, setHomeInputNumber] = useState('');
  const [homeShowNumber, setHomeShowNumber] = useState(false);
  const [homeAuthError, setHomeAuthError] = useState<string | null>(null);
  const [isVerifyingHome, setIsVerifyingHome] = useState(false);

  const [adminAuthUser, setAdminAuthUser] = useState<AdminSheetUser | null>(() => {
    try {
      const raw = localStorage.getItem('adminAuthUser');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const isAdminUnlocked = Boolean(adminAuthUser) || adminAccessConfig.requireAdminLogin === false;
  const [adminInputName, setAdminInputName] = useState('');
  const [adminInputPassword, setAdminInputPassword] = useState('');
  const [adminShowNumber, setAdminShowNumber] = useState(false);
  const [isVerifyingAdmin, setIsVerifyingAdmin] = useState(false);
  const [isAdminPanelOpen, setIsAdminPanelOpen] = useState(false);
  const [showAdminPassModal, setShowAdminPassModal] = useState(false);
  const [adminPassError, setAdminPassError] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);

  // Master Quick-Control Bar & Stackable Open Cards (ordered by opening)
  type QuickPanelId = 'screen' | 'start' | 'login' | 'video-questions' | 'live-direct' | 'quiz' | 'pdf' | 'camera' | 'translation' | 'chat';
  const [openPanels, setOpenPanels] = useState<QuickPanelId[]>([]);
  const [loginFilterView, setLoginFilterView] = useState<'live' | 'unanswered' | 'answers'>('live');

  // Unread student chat notifications (highlights Chat button & shows top alert banner)
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [chatTopNotice, setChatTopNotice] = useState<{
    visible: boolean;
    count: number;
    latestSender: string;
    latestText: string;
  }>({ visible: false, count: 0, latestSender: '', latestText: '' });
  const lastSeenStudentMsgCountRef = useRef(0);
  const openPanelsRef = useRef<QuickPanelId[]>([]);
  openPanelsRef.current = openPanels;

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
    const unsubAdmin = subscribeToAdminAccessConfig((cfg) => {
      setAdminAccessConfig(cfg);
    });
    // Quietly sync ورقة أدمن from Google Sheet on load so Sheet edits apply immediately
    fetchAdminUsersFromSheet().catch(() => {});

    return () => {
      unsub();
      unsubAdmin();
    };
  }, [webAppUrl, isConfigured]);

  // Auto-revalidate cached Home/Admin sessions when ورقة أدمن user list updates
  useEffect(() => {
    if (!adminAccessConfig.users || adminAccessConfig.users.length === 0) return;

    if (homeAuthUser) {
      const checkHome = matchAdminUserFromList(
        adminAccessConfig.users,
        homeAuthUser.name,
        homeAuthUser.number,
        'home'
      );
      if (!checkHome.success) {
        setHomeAuthUser(null);
        localStorage.removeItem('homeAuthUser');
      }
    }

    if (adminAuthUser) {
      const checkAdmin = matchAdminUserFromList(
        adminAccessConfig.users,
        adminAuthUser.name,
        adminAuthUser.number,
        'admin'
      );
      if (!checkAdmin.success) {
        setAdminAuthUser(null);
        localStorage.removeItem('adminAuthUser');
        setIsAdminPanelOpen(false);
      }
    }
  }, [adminAccessConfig.users]);

  // Sync Admin panel state when routed directly via ?Admin=controlroom2026
  useEffect(() => {
    if (pageMode === 'admin') {
      setShowAdminPassModal(false);
      setIsAdminPanelOpen(isAdminUnlocked);
    }
  }, [pageMode, isAdminUnlocked]);

  // Track incoming student chat messages -> highlight Chat button + show top notification banner
  useEffect(() => {
    const msgs = liveSession?.messages || [];
    const studentMsgs = msgs.filter(
      (m) => !m.senderName?.includes('الأستاذ') && !m.id?.startsWith('teach_')
    );
    const isChatOpen = openPanels.includes('chat');

    if (studentMsgs.length < lastSeenStudentMsgCountRef.current) {
      lastSeenStudentMsgCountRef.current = studentMsgs.length;
      if (studentMsgs.length === 0) {
        setUnreadChatCount(0);
        setChatTopNotice((prev) => ({ ...prev, visible: false, count: 0 }));
      }
      return;
    }

    if (isChatOpen) {
      lastSeenStudentMsgCountRef.current = studentMsgs.length;
      setUnreadChatCount(0);
      setChatTopNotice((prev) => (prev.visible ? { ...prev, visible: false, count: 0 } : prev));
      return;
    }

    if (studentMsgs.length > lastSeenStudentMsgCountRef.current) {
      const addedCount = studentMsgs.length - lastSeenStudentMsgCountRef.current;
      const latest = studentMsgs[studentMsgs.length - 1];
      lastSeenStudentMsgCountRef.current = studentMsgs.length;

      setUnreadChatCount((prev) => prev + addedCount);
      setChatTopNotice((prev) => ({
        visible: true,
        count: prev.visible ? prev.count + addedCount : addedCount,
        latestSender: latest?.senderName || 'طالب',
        latestText: latest?.text || 'أرسل رسالة أو تفاعلاً جديداً',
      }));
    }
  }, [liveSession?.messages, openPanels]);

  // Generate QR code when modal opens OR when live PIN changes
  const effectivePin = liveSession?.sessionPin ? liveSession.sessionPin.trim() : '';
  const studentJoinUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/?page=live-student${effectivePin ? `&pin=${encodeURIComponent(effectivePin)}` : ''}`
      : '';
  const chatStandaloneUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}${window.location.pathname}?mode=chat`
      : '?mode=chat';

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
  const navigateToPage = (mode: 'public-home' | 'control' | 'admin' | 'live-teacher' | 'live-student' | 'live-direct-display' | 'quiz-arena' | 'student-quiz' | 'display' | 'script-prompter') => {
    setPageMode(mode);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('page');
      url.searchParams.delete('mode');
      url.searchParams.delete('live');
      url.searchParams.delete('Admin');
      url.searchParams.delete('admin');

      if (mode === 'admin') {
        url.searchParams.set('Admin', 'controlroom2026');
      } else if (mode === 'control') {
        url.searchParams.set('live', 'control');
      } else if (mode !== 'public-home') {
        url.searchParams.set('page', mode);
      }
      window.history.pushState({}, '', url.toString());
    }
  };

  useEffect(() => {
    const handlePopState = () => {
      setPageMode(resolvePageModeFromSearch(window.location.search));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleHomeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setHomeAuthError(null);
    if (!homeInputName.trim() || !homeInputNumber.trim()) {
      setHomeAuthError('يرجى إدخال الاسم والرقم للدخول.');
      return;
    }
    setIsVerifyingHome(true);
    try {
      const res = await verifyAdminCredentials(homeInputName, homeInputNumber, 'home');
      if (res.success && res.user) {
        setHomeAuthUser(res.user);
        localStorage.setItem('homeAuthUser', JSON.stringify(res.user));
        setHomeInputName('');
        setHomeInputNumber('');
      } else {
        setHomeAuthError(res.message || 'الاسم أو الرقم غير صحيح!');
      }
    } catch (err: any) {
      setHomeAuthError(err?.message || 'تعذر التحقق من بيانات الدخول');
    } finally {
      setIsVerifyingHome(false);
    }
  };

  const handleHomeLogout = () => {
    setHomeAuthUser(null);
    localStorage.removeItem('homeAuthUser');
    setHomeInputName('');
    setHomeInputNumber('');
    setHomeAuthError(null);
    setOpenPanels([]);
  };

  const handleAdminUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminPassError(null);
    if (!adminInputName.trim() || !adminInputPassword.trim()) {
      setAdminPassError('يرجى إدخال الاسم والرقم الخاص بلوحة التحكم.');
      return;
    }
    setIsVerifyingAdmin(true);
    try {
      const res = await verifyAdminCredentials(adminInputName, adminInputPassword, 'admin');
      if (res.success && res.user) {
        setAdminAuthUser(res.user);
        localStorage.setItem('adminAuthUser', JSON.stringify(res.user));
        setAdminInputName('');
        setAdminInputPassword('');
        setShowAdminPassModal(false);
        setIsAdminPanelOpen(true);
      } else {
        setAdminPassError(res.message || 'الاسم أو الرقم غير مصرح له بلوحة التحكم المركزية.');
      }
    } catch (err: any) {
      setAdminPassError(err?.message || 'تعذر التحقق من صلاحية لوحة التحكم');
    } finally {
      setIsVerifyingAdmin(false);
    }
  };

  const handleAdminLock = () => {
    setAdminAuthUser(null);
    localStorage.removeItem('adminAuthUser');
    setAdminInputName('');
    setAdminInputPassword('');
    setIsAdminPanelOpen(false);
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
        onBack={() => navigateToPage('control')}
      />
    );
  }

  // Route: Standalone Script Prompter & Subtitle Control Window
  if (pageMode === 'script-prompter') {
    return (
      <ScriptPrompterPanel
        isStandalone={true}
        onBack={() => navigateToPage('control')}
      />
    );
  }

  // Route: Live Classroom Teacher Theater
  if (pageMode === 'live-teacher') {
    return (
      <LiveTeacherRoom
        initialLesson={activeLiveLesson || undefined}
        allLessons={allLiveLessons}
        onBack={() => navigateToPage('control')}
      />
    );
  }

  // Route: Live Student Interactive Device
  if (pageMode === 'live-student') {
    return (
      <LiveStudentView
        onBackToMain={() => navigateToPage('public-home')}
      />
    );
  }

  // Route: Live Direct Display Room
  if (pageMode === 'live-direct-display') {
    return (
      <div className="relative min-h-screen bg-slate-950">
        <button
          onClick={() => navigateToPage('control')}
          className="fixed top-3 right-3 z-50 px-3 py-1.5 rounded-xl bg-slate-800/90 text-slate-300 hover:text-white border border-slate-700 text-xs flex items-center gap-1.5 backdrop-blur-md cursor-pointer transition shadow-lg"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          العودة للتحكم السريع
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
        onBackToMain={() => navigateToPage('control')}
      />
    );
  }

  // Route: Quiz Arena Big Screen Display (ساحة تحدي كويز ومنصة التتويج المستقلة)
  if (pageMode === 'quiz-arena') {
    return (
      <SmartHubDisplayRoom
        initialMode="quiz"
        onBackToMain={() => navigateToPage('control')}
      />
    );
  }

  // Route: Student Quiz Fast Mobile View
  if (pageMode === 'student-quiz') {
    return (
      <LiveStudentView
        onBackToMain={() => navigateToPage('public-home')}
        headerConfig={headerConfig}
      />
    );
  }

  // Route: Dedicated Central Admin Panel (?Admin=controlroom2026)
  if (pageMode === 'admin') {
    if (!isAdminUnlocked) {
      return (
        <div className="min-h-screen bg-gradient-to-br from-[#faf7f2] via-[#f5efe5] to-[#ebf3ed] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100 flex flex-col justify-center items-center p-4 font-sans" dir="rtl">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-amber-200/70 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-right space-y-5"
          >
            <div className="text-center space-y-2">
              <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                تسجيل الدخول — لوحة التحكم المركزية
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                أدخل الاسم والرقم المصرح بهما لفتح لوحة التحكم المركزية والإعدادات.
              </p>
            </div>

            <form onSubmit={handleAdminUnlock} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  الاسم:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="off"
                    value={adminInputName}
                    onChange={(e) => setAdminInputName(e.target.value)}
                    placeholder="أدخل الاسم"
                    className="w-full pr-10 pl-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  الرقم:
                </label>
                <div className="relative">
                  <input
                    type={adminShowNumber ? 'text' : 'password'}
                    required
                    autoComplete="off"
                    value={adminInputPassword}
                    onChange={(e) => setAdminInputPassword(e.target.value)}
                    placeholder="أدخل الرقم"
                    className="w-full pr-10 pl-10 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center font-mono text-base font-bold tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                  <Hash className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <button
                    type="button"
                    onClick={() => setAdminShowNumber((v) => !v)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {adminShowNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {adminPassError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{adminPassError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifyingAdmin}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-60"
              >
                {isVerifyingAdmin ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق...</span>
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-4 h-4" />
                    <span>دخول لوحة التحكم</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </div>
      );
    }

    return (
      <div className="min-h-screen bg-slate-950" dir="rtl">
        <AdminPanel
          adminUserName={adminAuthUser?.name}
          onLockAdmin={adminAuthUser ? handleAdminLock : undefined}
          onClose={() => navigateToPage('control')}
          onStartTeacherTheater={(lesson) => {
            setActiveLiveLesson(lesson);
            navigateToPage('live-teacher');
          }}
          onOpenLiveDirectDisplay={() => {
            navigateToPage('live-direct-display');
          }}
          onOpenQuizArenaDisplay={() => {
            navigateToPage('quiz-arena');
          }}
          onOpenSmartDisplay={() => {
            navigateToPage('display');
          }}
        />
      </div>
    );
  }

  // Route: Clean Public Home Showcase (/) — Image Card + Text Card from `header` sheet + Social Channels Bar ONLY (zero action/nav buttons)
  if (pageMode === 'public-home') {
    const publicImageUrl = formatDriveImageUrl(headerConfig?.heroImageUrl || headerConfig?.logoUrl || '');
    const publicTitle = headerConfig?.title || '';
    const publicSubtitle = headerConfig?.subtitle || '';
    const socials = headerConfig?.socials;
    const hasSocials = Boolean(socials && (socials.facebook || socials.instagram || socials.youtube || socials.line));

    return (
      <div
        className="min-h-screen bg-gradient-to-br from-[#faf7f2] via-[#f5efe5] to-[#ebf3ed] dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 text-slate-800 dark:text-slate-100 flex flex-col justify-between font-sans transition-colors duration-300 selection:bg-amber-500/20"
        dir="rtl"
      >
        <main className="flex-1 flex items-center justify-center px-4 py-10 sm:py-16">
          <div className="w-full max-w-4xl space-y-6">
            <div className={`grid gap-6 items-stretch ${publicImageUrl && (publicTitle || publicSubtitle) ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 max-w-2xl mx-auto'}`}>
              {/* Card 1: Image Card (Header Sheet Col C: C3 / C2, supports Google Drive links) */}
              {publicImageUrl ? (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white/95 dark:bg-slate-900/95 border border-amber-200/70 dark:border-slate-800 rounded-3xl p-4 sm:p-5 shadow-xl flex items-center justify-center overflow-hidden min-h-[260px] sm:min-h-[320px]"
                >
                  <img
                    src={publicImageUrl}
                    alt={publicTitle || 'الصورة الرئيسية'}
                    className="w-full max-h-[380px] object-contain rounded-2xl"
                    onError={(e) => { (e.currentTarget as HTMLElement).style.display = 'none'; }}
                  />
                </motion.div>
              ) : null}

              {/* Card 2: Text Card (Header Sheet Col B: B2 & B3) */}
              {(publicTitle || publicSubtitle) ? (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.06 }}
                  className="bg-white/95 dark:bg-slate-900/95 border border-amber-200/70 dark:border-slate-800 rounded-3xl p-7 sm:p-10 shadow-xl flex flex-col justify-center text-right space-y-4 relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 left-0 h-1.5 bg-gradient-to-r from-amber-500 via-emerald-500 to-amber-500 opacity-80" />
                  {publicTitle && (
                    <h1 className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white leading-snug tracking-tight">
                      {publicTitle}
                    </h1>
                  )}
                  {publicSubtitle && (
                    <p className="text-sm sm:text-base text-slate-600 dark:text-slate-300 leading-loose font-medium whitespace-pre-line">
                      {publicSubtitle}
                    </p>
                  )}
                </motion.div>
              ) : null}
            </div>
          </div>
        </main>

        {/* Bottom Social Channels Bar ONLY (Header Sheet Cols E2:H2) */}
        <footer className="py-5 px-4 border-t border-amber-200/50 dark:border-slate-800/80 bg-[#fefdfa]/80 dark:bg-slate-950/80 backdrop-blur-md">
          {hasSocials && (
            <div className="max-w-4xl mx-auto flex items-center justify-center gap-3.5 flex-wrap">
              {socials?.facebook && (
                <a
                  href={socials.facebook}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Facebook"
                  title="Facebook"
                  className="w-11 h-11 rounded-2xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/25 flex items-center justify-center transition-all shadow-sm hover:-translate-y-0.5"
                >
                  <Facebook className="w-5 h-5" />
                </a>
              )}
              {socials?.instagram && (
                <a
                  href={socials.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Instagram"
                  title="Instagram"
                  className="w-11 h-11 rounded-2xl bg-pink-600/10 hover:bg-pink-600/20 text-pink-600 dark:text-pink-400 border border-pink-500/25 flex items-center justify-center transition-all shadow-sm hover:-translate-y-0.5"
                >
                  <Instagram className="w-5 h-5" />
                </a>
              )}
              {socials?.youtube && (
                <a
                  href={socials.youtube}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="YouTube"
                  title="YouTube"
                  className="w-11 h-11 rounded-2xl bg-red-600/10 hover:bg-red-600/20 text-red-600 dark:text-red-400 border border-red-500/25 flex items-center justify-center transition-all shadow-sm hover:-translate-y-0.5"
                >
                  <Youtube className="w-5 h-5" />
                </a>
              )}
              {socials?.line && (
                <a
                  href={socials.line}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="LINE"
                  title="LINE"
                  className="h-11 px-4 rounded-2xl bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 flex items-center justify-center text-xs font-black font-mono transition-all shadow-sm hover:-translate-y-0.5"
                >
                  LINE
                </a>
              )}
            </div>
          )}
        </footer>
      </div>
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
          <div className="flex items-center gap-2 flex-wrap">
            {/* Signed-in Home User Badge & Logout */}
            {homeAuthUser && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-xs font-bold">
                <User className="w-3.5 h-3.5 shrink-0" />
                <span className="max-w-[120px] truncate">{homeAuthUser.name}</span>
                {adminAccessConfig.requireHomeLogin !== false && (
                  <button
                    type="button"
                    onClick={handleHomeLogout}
                    title="تسجيل الخروج من الصفحة الرئيسية"
                    className="p-1 rounded-lg hover:bg-rose-500/20 text-slate-400 hover:text-rose-500 transition cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}

            {/* Admin Access Button */}
            {isAdminUnlocked ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsAdminPanelOpen(true)}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-amber-500/10 transition cursor-pointer"
                >
                  <ShieldCheck className="w-4 h-4 text-slate-950" />
                  <span>لوحة التحكم المركزية</span>
                </button>
                {adminAuthUser && adminAccessConfig.requireAdminLogin !== false && (
                  <button
                    type="button"
                    onClick={handleAdminLock}
                    title="قفل لوحة التحكم المركزية"
                    className="p-1.5 rounded-xl bg-slate-200/80 hover:bg-rose-500/20 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:text-rose-500 transition cursor-pointer"
                  >
                    <Lock className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ) : (
              <button
                onClick={() => setShowAdminPassModal(true)}
                className="px-3 py-1.5 rounded-xl bg-slate-200/80 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
              >
                <Lock className="w-3.5 h-3.5 text-amber-500" />
                <span>دخول لوحة التحكم</span>
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

      {/* ----------------- QUICK CONTROL LOGIN GATE (?live=control) OR CONTENT ----------------- */}
      {adminAccessConfig.requireHomeLogin !== false && !homeAuthUser ? (
        <main className="flex-grow flex items-center justify-center px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-amber-200/70 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-right space-y-5"
          >
            <div className="text-center space-y-2">
              {headerConfig?.loginLogoUrl || headerConfig?.logoUrl ? (
                <img
                  src={headerConfig.loginLogoUrl || headerConfig.logoUrl}
                  alt="Logo"
                  className="w-16 h-16 rounded-2xl object-cover mx-auto shadow-md border border-amber-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              ) : (
                <div className="w-14 h-14 rounded-2xl bg-amber-500/15 text-amber-500 flex items-center justify-center mx-auto">
                  <KeyRound className="w-7 h-7" />
                </div>
              )}
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                تسجيل الدخول — التحكم السريع
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                أدخل الاسم والرقم المصرح بهما لفتح أدوات العرض والتحكم السريع بالحصص.
              </p>
            </div>

            <form onSubmit={handleHomeLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  الاسم:
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="off"
                    value={homeInputName}
                    onChange={(e) => setHomeInputName(e.target.value)}
                    placeholder="أدخل الاسم"
                    className="w-full pr-10 pl-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-sm font-bold text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                  <User className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5">
                  الرقم:
                </label>
                <div className="relative">
                  <input
                    type={homeShowNumber ? 'text' : 'password'}
                    required
                    autoComplete="off"
                    value={homeInputNumber}
                    onChange={(e) => setHomeInputNumber(e.target.value)}
                    placeholder="أدخل الرقم"
                    className="w-full pr-10 pl-10 py-3 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-center font-mono text-base font-bold tracking-widest text-slate-900 dark:text-white focus:outline-none focus:border-amber-500"
                  />
                  <Hash className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2" />
                  <button
                    type="button"
                    onClick={() => setHomeShowNumber((v) => !v)}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                  >
                    {homeShowNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {homeAuthError && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/25 text-rose-600 dark:text-rose-400 text-xs font-bold flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{homeAuthError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isVerifyingHome}
                className="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 transition cursor-pointer disabled:opacity-60"
              >
                {isVerifyingHome ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>جاري التحقق...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="w-4 h-4" />
                    <span>دخول التحكم السريع</span>
                  </>
                )}
              </button>
            </form>
          </motion.div>
        </main>
      ) : (
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
            inactiveOverrideClass?: string;
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
              label: 'تسجيل',
              renderIcon: (isOpen) => <Users className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-blue-500'}`} />,
              activeClass: 'bg-blue-600 text-white border-blue-500 shadow-md shadow-blue-600/20',
              badge: (
                <span className="px-1.5 py-0.5 rounded-md bg-black/15 dark:bg-white/10 font-mono text-[10px] font-black">
                  {connectedList.length}
                </span>
              ),
            },
            {
              id: 'video-questions',
              label: 'فيديو',
              renderIcon: (isOpen) => <Film className={`w-4 h-4 ${isOpen ? 'text-slate-950' : 'text-orange-500'}`} />,
              activeClass: 'bg-orange-500 text-slate-950 border-orange-400 shadow-md shadow-orange-500/20',
              badge: isVideoQuestionActive ? (
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
              ) : undefined,
            },
            {
              id: 'live-direct',
              label: 'البث',
              renderIcon: (isOpen) => <Radio className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-rose-500'}`} />,
              activeClass: 'bg-rose-600 text-white border-rose-500 shadow-md shadow-rose-600/20',
              badge: liveSession?.mode === 'direct' && isVideoQuestionActive ? (
                <span className="w-2 h-2 rounded-full bg-amber-300 animate-ping" />
              ) : undefined,
            },
            {
              id: 'quiz',
              label: 'تحدي',
              renderIcon: (isOpen) => <Trophy className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-purple-500'}`} />,
              activeClass: 'bg-purple-600 text-white border-purple-500 shadow-md shadow-purple-600/20',
              badge: isQuizLiveActive ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
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
              renderIcon: (isOpen) => <Captions className={`w-4 h-4 ${isOpen ? 'text-white' : 'text-indigo-500'}`} />,
              activeClass: 'bg-indigo-500 text-white border-indigo-400 shadow-md shadow-indigo-500/20',
              badge: isSubtitlesShown ? (
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              ) : undefined,
            },
            {
              id: 'chat',
              label: 'المحادثة',
              renderIcon: (isOpen) => (
                <MessageSquare
                  className={`w-4 h-4 ${
                    isOpen || unreadChatCount > 0 ? 'text-white' : 'text-pink-500'
                  }`}
                />
              ),
              activeClass: 'bg-pink-600 text-white border-pink-500 shadow-md shadow-pink-600/20',
              inactiveOverrideClass:
                unreadChatCount > 0
                  ? 'bg-gradient-to-r from-rose-600 to-amber-500 hover:from-rose-500 hover:to-amber-400 text-white border-rose-400 shadow-lg shadow-rose-500/30 animate-pulse'
                  : undefined,
              badge:
                unreadChatCount > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-full bg-white text-rose-600 font-mono text-[10px] font-black shadow-sm">
                    {unreadChatCount}
                  </span>
                ) : (liveSession?.messages || []).length > 0 ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-black/15 dark:bg-white/10 font-mono text-[10px] font-black">
                    {(liveSession?.messages || []).length}
                  </span>
                ) : undefined,
            },
          ];

          return (
            <>
              {/* ========== TOP CHAT NOTIFICATION BANNER ABOVE HOME PAGE ========== */}
              <AnimatePresence>
                {chatTopNotice.visible && (
                  <motion.div
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -12 }}
                    className="rounded-2xl bg-gradient-to-r from-rose-600 via-pink-600 to-amber-500 p-[1px] shadow-xl shadow-rose-500/20"
                  >
                    <div className="rounded-2xl bg-slate-950/95 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-slate-100">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <div className="w-9 h-9 rounded-xl bg-rose-500/20 border border-rose-400/40 text-rose-400 flex items-center justify-center shrink-0">
                          <MessageSquare className="w-4 h-4 animate-bounce" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-black text-amber-300">
                              {chatTopNotice.count > 1
                                ? `رسائل جديدة من الطلاب (${chatTopNotice.count})`
                                : 'رسالة جديدة من طالب'}
                            </span>
                            <span className="text-xs font-bold text-white">
                              • {chatTopNotice.latestSender}
                            </span>
                          </div>
                          <p className="text-xs text-slate-300 truncate mt-0.5">
                            {chatTopNotice.latestText}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            if (!openPanels.includes('chat')) {
                              toggleQuickPanel('chat');
                            }
                            setUnreadChatCount(0);
                            setChatTopNotice((prev) => ({ ...prev, visible: false, count: 0 }));
                          }}
                          className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs cursor-pointer transition shadow-sm"
                        >
                          فتح المحادثة
                        </button>
                        <a
                          href={chatStandaloneUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => {
                            setUnreadChatCount(0);
                            setChatTopNotice((prev) => ({ ...prev, visible: false, count: 0 }));
                          }}
                          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1 transition cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                          <span>رابط المحادثة</span>
                        </a>
                        <button
                          type="button"
                          onClick={() => setChatTopNotice((prev) => ({ ...prev, visible: false, count: 0 }))}
                          title="إغلاق التنبيه"
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ========== MASTER CARD: TOP QUICK-CONTROL BUTTON BAR ========== */}
              <section className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm p-3.5 sm:p-4">
                <div className="flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex flex-wrap items-center gap-2 flex-1">
                    {mainButtons.map((btn) => {
                      const isOpen = openPanels.includes(btn.id);
                      return (
                        <button
                          key={btn.id}
                          type="button"
                          onClick={() => toggleQuickPanel(btn.id)}
                          className={`px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-black flex items-center gap-2 border transition-all cursor-pointer active:scale-[0.98] ${
                            isOpen
                              ? btn.activeClass
                              : btn.inactiveOverrideClass
                              ? btn.inactiveOverrideClass
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
                            if (homeAuthUser || isAdminUnlocked) {
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
                        {/* 1. Start / End + PIN + Copy PIN */}
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

                        {/* 4. Toggle Verification (تحقيق / إلغاء التحقق) after QR Code */}
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
                            <Film className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-white">
                            فيديو
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
                            البث — قائمة الدروس وبنك الأسئلة المباشرة
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
                        <LiveCameraManager embeddedCompact={true} />
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

                if (panelId === 'chat') {
                  return (
                    <section
                      key="chat"
                      className="rounded-2xl bg-slate-900 border border-slate-800 shadow-lg overflow-hidden text-slate-100"
                    >
                      <div className="px-4 py-3 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2.5 bg-slate-950/60">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-xl bg-pink-500/15 text-pink-400 flex items-center justify-center shrink-0">
                            <MessageSquare className="w-4 h-4" />
                          </div>
                          <span className="text-sm sm:text-base font-black text-white">
                            المحادثة — التواصل المباشر مع الطلاب
                          </span>
                          <span className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-300 font-mono text-[11px] font-bold">
                            {(liveSession?.messages || []).length}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <a
                            href={chatStandaloneUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-black text-xs flex items-center gap-1.5 shadow-sm transition cursor-pointer"
                            title="فتح صفحة المحادثة في نافذة مستقلة"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>فتح رابط المحادثة</span>
                          </a>

                          <button
                            type="button"
                            onClick={() => copyLink(chatStandaloneUrl, 'home-chat-link')}
                            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
                            title="نسخ رابط صفحة المحادثة"
                          >
                            {copiedLink === 'home-chat-link' ? (
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                            ) : (
                              <Copy className="w-3.5 h-3.5 text-slate-400" />
                            )}
                            <span>{copiedLink === 'home-chat-link' ? 'تم النسخ' : 'نسخ الرابط'}</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => closeQuickPanel('chat')}
                            title="إغلاق"
                            className="p-1.5 rounded-xl bg-slate-800 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="p-3 sm:p-4">
                        <LiveChatModal
                          isOpen={true}
                          embeddedInline={true}
                          onClose={() => closeQuickPanel('chat')}
                          messages={liveSession?.messages || []}
                          connectedStudents={liveSession?.connectedStudents || []}
                          isTeacher={true}
                          showChatInRoom={Boolean(liveSession?.showChatInRoom)}
                          onToggleShowInRoom={async (show) => {
                            await toggleShowChatInRoom(show);
                          }}
                          onReply={async (messageId, replyText, replyType) => {
                            await replyToStudentMessage(messageId, replyText, replyType);
                          }}
                          onDeleteMessage={async (messageId) => {
                            await deleteStudentMessage(messageId);
                          }}
                          onClearAll={async () => {
                            await clearAllStudentMessages();
                          }}
                          onSendTeacherBroadcast={async (text, recipientStudent, recipientSheet) => {
                            await sendTeacherBroadcastMessage({ text, recipientStudent, recipientSheet });
                          }}
                        />
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
      )}

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

      {/* ----------------- MODAL: ADMIN ACCESS LOGIN (الاسم والرقم من ورقة أدمن) ----------------- */}
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
                <ShieldCheck className="w-6 h-6" />
              </div>

              <h3 className="text-base font-black text-slate-900 dark:text-white mb-1">
                تسجيل الدخول — لوحة التحكم المركزية
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 leading-relaxed">
                أدخل الاسم والرقم المصرح لهما بدخول لوحة التحكم المركزية.
              </p>

              <form onSubmit={handleAdminUnlock} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الاسم:
                  </label>
                  <input
                    type="text"
                    required
                    autoFocus
                    autoComplete="off"
                    value={adminInputName}
                    onChange={(e) => setAdminInputName(e.target.value)}
                    placeholder="أدخل الاسم"
                    className="w-full px-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-right text-sm font-bold focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                    الرقم:
                  </label>
                  <div className="relative">
                    <input
                      type={adminShowNumber ? 'text' : 'password'}
                      required
                      autoComplete="off"
                      value={adminInputPassword}
                      onChange={(e) => setAdminInputPassword(e.target.value)}
                      placeholder="أدخل الرقم"
                      className="w-full px-10 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-center font-mono text-base font-bold tracking-widest focus:outline-none focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={() => setAdminShowNumber((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
                    >
                      {adminShowNumber ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {adminPassError && (
                    <p className="text-xs text-rose-500 font-bold mt-2 flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                      <span>{adminPassError}</span>
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="submit"
                    disabled={isVerifyingAdmin}
                    className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs transition cursor-pointer flex items-center justify-center gap-1.5 disabled:opacity-60"
                  >
                    {isVerifyingAdmin ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        <span>جاري التحقق...</span>
                      </>
                    ) : (
                      <span>دخول لوحة التحكم</span>
                    )}
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
            adminUserName={adminAuthUser?.name}
            onLockAdmin={adminAuthUser ? handleAdminLock : undefined}
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
