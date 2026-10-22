import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, Tv, Mic, Trophy, Monitor, Settings, RefreshCw, 
  ExternalLink, Copy, CheckCircle2, ShieldCheck, 
  Sparkles, KeyRound, Globe, Users, ArrowUpRight, 
  FileSpreadsheet, Play, QrCode, Sliders, Palette, Square,
  Video, Radio
} from 'lucide-react';
import { LiveLessonRow, HeaderConfig } from '../types';
import LiveClassManager from './LiveClassManager';
import LiveDirectManager from './LiveDirectManager';
import QuizManagerPanel from './QuizManagerPanel';
import SettingsPanel from './SettingsPanel';
import { 
  getLiveSessionState, 
  updateLivePin, 
  generatePinCode,
  getWebAppUrl,
  fetchHeaderConfig,
  setupLiveDirectSheetsApi,
  setupQuizDirectSheetsApi,
  stopAllActiveBroadcasts
} from '../api';

interface AdminPanelProps {
  onClose: () => void;
  onStartTeacherTheater?: (lesson: LiveLessonRow) => void;
  onOpenLiveDirectDisplay?: () => void;
  onOpenQuizArenaDisplay?: () => void;
  onOpenSmartDisplay?: () => void;
  initialTab?: 'live' | 'live-direct' | 'quiz-challenge' | 'broadcast' | 'sheets-design';
}

export default function AdminPanel({ 
  onClose, 
  onStartTeacherTheater, 
  onOpenLiveDirectDisplay,
  onOpenQuizArenaDisplay,
  onOpenSmartDisplay,
  initialTab = 'live'
}: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState<'live' | 'live-direct' | 'quiz-challenge' | 'broadcast' | 'sheets-design'>(initialTab);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [currentPin, setCurrentPin] = useState<string>('1234');
  const [isUpdatingPin, setIsUpdatingPin] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [headerConfig, setHeaderConfig] = useState<HeaderConfig | null>(null);
  const [settingUpLiveSheets, setSettingUpLiveSheets] = useState(false);
  const [settingUpQuizSheets, setSettingUpQuizSheets] = useState(false);

  useEffect(() => {
    getLiveSessionState().then(st => {
      if (st && st.sessionPin) setCurrentPin(st.sessionPin);
    }).catch(() => {});

    fetchHeaderConfig().then(cfg => {
      if (cfg) setHeaderConfig(cfg);
    }).catch(() => {});
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(id);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const handleGenerateNewPin = async () => {
    setIsUpdatingPin(true);
    try {
      const newPin = generatePinCode();
      const res = await updateLivePin(newPin);
      if (res && res.success) {
        setCurrentPin(newPin);
        setNotice({ text: `تم توليد رمز PIN جديد بنجاح: ${newPin}`, type: 'success' });
      }
    } catch (e: any) {
      setNotice({ text: 'تعذر تحديث رمز الـ PIN', type: 'error' });
    } finally {
      setIsUpdatingPin(false);
    }
  };

  const handleSetupLiveDirectSheets = async () => {
    setSettingUpLiveSheets(true);
    try {
      const res = await setupLiveDirectSheetsApi();
      if (res.success) {
        setNotice({ text: res.message || 'تمت تهيئة أوراق الشرح المباشر بنجاح!', type: 'success' });
      } else {
        setNotice({ text: res.message || 'فشلت التهيئة، تأكد من ربط الشيت', type: 'error' });
      }
    } catch (e: any) {
      setNotice({ text: e.message || 'حدث خطأ أثناء التهيئة', type: 'error' });
    } finally {
      setSettingUpLiveSheets(false);
    }
  };

  const handleSetupQuizSheets = async () => {
    setSettingUpQuizSheets(true);
    try {
      const res = await setupQuizDirectSheetsApi();
      if (res.success) {
        setNotice({ text: res.message || 'تمت تهيئة أوراق تحدي كويز بنجاح!', type: 'success' });
      } else {
        setNotice({ text: res.message || 'فشلت التهيئة، تأكد من ربط الشيت', type: 'error' });
      }
    } catch (e: any) {
      setNotice({ text: e.message || 'حدث خطأ أثناء التهيئة', type: 'error' });
    } finally {
      setSettingUpQuizSheets(false);
    }
  };

  const handleStopAllBroadcasts = async () => {
    if (!confirm('هل تريد إيقاف وتصفير كافة البثوث المباشرة وإعادتها لحالة الخمول؟')) return;
    try {
      await stopAllActiveBroadcasts();
      setNotice({ text: 'تم إيقاف وتصفير البث المباشر بنجاح! ⏹️ النظام الآن في حالة الخمول ولا يوجد بث تلقائي.', type: 'success' });
    } catch (e: any) {
      setNotice({ text: 'تعذر إيقاف البث: ' + e.message, type: 'error' });
    }
  };

  const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
  const studentUrl = `${baseUrl}/?page=live-student`;
  const smartHubDisplayUrl = `${baseUrl}/?page=display`;
  const liveTeacherUrl = `${baseUrl}/?page=live-teacher`;
  const directDisplayUrl = `${baseUrl}/?page=live-direct-display`;
  const quizArenaUrl = `${baseUrl}/?page=quiz-arena`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md" dir="rtl">
      <div className="w-full max-w-7xl h-[94vh] bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-slate-100">
        
        {/* Top Header */}
        <div className="p-4 sm:p-6 border-b border-slate-800 bg-slate-900/90 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-amber-500 to-amber-600 flex items-center justify-center text-slate-950 shadow-lg shadow-amber-500/20">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg sm:text-xl font-black text-amber-400">
                  لوحة التحكم المركزية للأنظمة التفاعلية
                </h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-400/10 text-amber-300 border border-amber-500/30">
                  3 أقسام مستقلة
                </span>
              </div>
              <p className="text-xs sm:text-sm text-slate-400">
                الحصص التفاعلية (Questions-T) • الشرح المباشر (Questions-Live) • تحدي كويز (Questions-Qui)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Live PIN Quick Pill */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs">
              <KeyRound className="w-4 h-4 text-amber-400" />
              <span className="text-slate-400">رمز الدخول PIN:</span>
              <span className="font-mono font-bold text-amber-300 tracking-wider text-sm">{currentPin}</span>
              <button
                onClick={handleGenerateNewPin}
                disabled={isUpdatingPin}
                title="توليد رمز جديد"
                className="p-1 hover:text-amber-300 text-slate-400 transition cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isUpdatingPin ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {/* Stop Broadcast Button */}
            <button
              onClick={handleStopAllBroadcasts}
              title="إيقاف وتصفير البث النشط بالكامل وإعادته لحالة الخمول لمنع البث التلقائي"
              className="px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 border border-rose-500/40 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
            >
              <Square className="w-3.5 h-3.5 fill-rose-300/30" />
              <span>إيقاف البث النشط ⏹️</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Global Notice Banner */}
        <AnimatePresence>
          {notice && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className={`px-6 py-2.5 text-xs sm:text-sm font-bold flex items-center justify-between ${
                notice.type === 'success' 
                  ? 'bg-emerald-500/20 text-emerald-300 border-b border-emerald-500/30' 
                  : 'bg-rose-500/20 text-rose-300 border-b border-rose-500/30'
              }`}
            >
              <span>{notice.text}</span>
              <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tabs Bar */}
        <div className="flex items-center gap-1 sm:gap-2 px-4 sm:px-6 pt-3 border-b border-slate-800 bg-slate-950/60 overflow-x-auto custom-scrollbar">
          {/* Tab 1: Live Video */}
          <button
            onClick={() => setActiveTab('live')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-t-2xl font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'live'
                ? 'bg-slate-900 text-amber-400 border-amber-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <Video className="w-4 h-4 text-amber-400" />
            <span>فيديو التفاعلي المباشر</span>
          </button>

          {/* Tab 2: Live Direct */}
          <button
            onClick={() => setActiveTab('live-direct')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-t-2xl font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'live-direct'
                ? 'bg-slate-900 text-amber-400 border-amber-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <Radio className="w-4 h-4 text-amber-400 animate-pulse" />
            <span>شرح مباشر</span>
          </button>

          {/* Tab 3: Quiz Challenge */}
          <button
            onClick={() => setActiveTab('quiz-challenge')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-t-2xl font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'quiz-challenge'
                ? 'bg-slate-900 text-amber-400 border-amber-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <Trophy className="w-4 h-4 text-amber-400" />
            <span>تحدي كويز</span>
          </button>

          {/* Tab 4: Broadcast & Displays */}
          <button
            onClick={() => setActiveTab('broadcast')}
            className={`px-3.5 sm:px-4 py-2.5 rounded-t-2xl font-bold text-xs sm:text-sm flex items-center gap-2 border-b-2 transition-all cursor-pointer whitespace-nowrap ${
              activeTab === 'broadcast'
                ? 'bg-slate-900 text-amber-400 border-amber-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <Monitor className="w-4 h-4 text-amber-400" />
            <span>العرض</span>
          </button>

          {/* Tab 5: Sheets & Design Settings (Icon only) */}
          <button
            onClick={() => setActiveTab('sheets-design')}
            title="الربط بالشيت وتصميم الصفحة والإعدادات"
            className={`p-2.5 px-3.5 rounded-t-2xl font-bold text-xs sm:text-sm flex items-center justify-center border-b-2 transition-all cursor-pointer ${
              activeTab === 'sheets-design'
                ? 'bg-slate-900 text-amber-400 border-amber-500 shadow-sm'
                : 'text-slate-400 hover:text-slate-200 border-transparent hover:bg-slate-900/40'
            }`}
          >
            <Settings className="w-4 h-4 text-amber-400" />
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-grow overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-slate-900">
          
          {/* TAB 1: LIVE CLASSROOM */}
          {activeTab === 'live' && (
            <div className="py-2">
              <LiveClassManager 
                onStartTeacherTheater={(lesson) => {
                  if (onStartTeacherTheater) {
                    onStartTeacherTheater(lesson);
                  }
                }}
              />
            </div>
          )}

          {/* TAB 2: LIVE DIRECT LECTURE */}
          {activeTab === 'live-direct' && (
            <div className="py-2">
              <LiveDirectManager 
                onOpenDisplayScreen={onOpenLiveDirectDisplay}
              />
            </div>
          )}

          {/* TAB 3: LIVE QUIZ CHALLENGE */}
          {activeTab === 'quiz-challenge' && (
            <div className="py-2">
              <QuizManagerPanel 
                onOpenArenaDisplay={onOpenQuizArenaDisplay || onOpenLiveDirectDisplay}
              />
            </div>
          )}

          {/* TAB 4: BROADCAST & SCREENS HUB */}
          {activeTab === 'broadcast' && (
            <div className="space-y-6 max-w-5xl mx-auto py-4">
              
              <div className="bg-slate-800/60 border border-slate-700 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <Monitor className="w-5 h-5 text-amber-400" />
                      شاشات العرض الكبرى وقنوات البث المباشر
                    </h2>
                    <p className="text-xs text-slate-400">
                      يمكنك فتح هذه الشاشات على البروجكتور أو الشاشات الكبيرة في القاعة لعرض المحتوى المباشر وتفاعل الطلاب.
                    </p>
                  </div>
                </div>

                {/* Card 0: Featured Smart Hub Display (Recommended for Projectors) */}
                <div className="mb-6 p-6 rounded-3xl bg-gradient-to-r from-amber-500/15 via-blue-500/15 to-purple-500/15 border-2 border-amber-500/50 shadow-xl relative overflow-hidden">
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[11px] uppercase tracking-wider flex items-center gap-1 shadow-sm">
                          <Sparkles className="w-3.5 h-3.5" />
                          الشاشة الرابعة الجامعة (موصى بها للبروجكتر)
                        </span>
                        <h3 className="font-black text-white text-lg sm:text-xl">
                          الشاشة الجامعة الذكية (Smart Hub Display) ⚡
                        </h3>
                      </div>
                      <p className="text-xs sm:text-sm text-slate-300 max-w-2xl leading-relaxed">
                        شاشة بروجكتر واحدة برابط موحد تجمع كافة الأقسام. تدعم <b>التحويل الذكي التلقائي (Auto-Switch)</b> لمتابعة نشاط المدرس المباشر تلقائياً، مع <b>شريط تبديل سريع</b> للتنقل اليدوي الفوري بنقرة واحدة.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-center gap-2 w-full lg:w-auto shrink-0">
                      <button
                        onClick={onOpenSmartDisplay || (() => window.open(smartHubDisplayUrl, '_blank'))}
                        className="w-full sm:w-auto px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-sm flex items-center justify-center gap-2 transition shadow-lg shadow-amber-500/20 cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        فتح الشاشة الجامعة 🖥️✨
                      </button>
                      <button
                        onClick={() => handleCopy(smartHubDisplayUrl, 'smart-hub-screen')}
                        className="w-full sm:w-auto px-4 py-3 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-bold flex items-center justify-center gap-2 transition border border-slate-700 cursor-pointer"
                      >
                        {copiedLink === 'smart-hub-screen' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copiedLink === 'smart-hub-screen' ? 'تم نسخ الرابط!' : 'نسخ رابط الشاشة'}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Card 1: Live Class Theater */}
                  <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-700/80 flex flex-col justify-between">
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-3">
                        <Tv className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-white text-base mb-1">مسرح الحصص التفاعلية</h3>
                      <p className="text-xs text-slate-400 mb-4">
                        عرض فيديو الدرس التفاعلي مع نافذة الأسئلة المنبثقة التلقائية عند التوقيت المحدد ورصد إجابات الطلاب.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={() => {
                          if (onStartTeacherTheater) {
                            onStartTeacherTheater({
                              title: 'درس تجريبي تفاعلي',
                              videoUrl: '',
                              questions: []
                            });
                          }
                        }}
                        className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <Play className="w-4 h-4" />
                        بدء المسرح التفاعلي
                      </button>
                      <button
                        onClick={() => handleCopy(liveTeacherUrl, 'teacher-screen')}
                        className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        {copiedLink === 'teacher-screen' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink === 'teacher-screen' ? 'تم نسخ الرابط!' : 'نسخ رابط المسرح'}
                      </button>
                    </div>
                  </div>

                  {/* Card 2: Live Direct Display */}
                  <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-700/80 flex flex-col justify-between">
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-3">
                        <Mic className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-white text-base mb-1">شاشة الشرح المباشر والـ PDF</h3>
                      <p className="text-xs text-slate-400 mb-4">
                        شاشة العرض المخصصة للمحاضرات المباشرة لعرض ملف الـ PDF المتزامن، السؤال والعداد، وتوزيع الإجابات.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={onOpenLiveDirectDisplay}
                        className="w-full py-2.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        فتح شاشة الشرح المباشر
                      </button>
                      <button
                        onClick={() => handleCopy(directDisplayUrl, 'direct-screen')}
                        className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        {copiedLink === 'direct-screen' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink === 'direct-screen' ? 'تم نسخ الرابط!' : 'نسخ رابط الشاشة'}
                      </button>
                    </div>
                  </div>

                  {/* Card 3: Quiz Arena Display */}
                  <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-700/80 flex flex-col justify-between">
                    <div>
                      <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-3">
                        <Trophy className="w-5 h-5" />
                      </div>
                      <h3 className="font-bold text-white text-base mb-1">ساحة تحدي كويز ومنصة التتويج</h3>
                      <p className="text-xs text-slate-400 mb-4">
                        شاشة الحلبة والتنافس الكبرى مع منصة التتويج ثلاثية الأبعاد، العدادات الحماسية وترتيب المتصدرين.
                      </p>
                    </div>
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <button
                        onClick={onOpenQuizArenaDisplay || onOpenLiveDirectDisplay}
                        className="w-full py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        <ExternalLink className="w-4 h-4" />
                        فتح ساحة التحدي Arena
                      </button>
                      <button
                        onClick={() => handleCopy(quizArenaUrl, 'quiz-screen')}
                        className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center justify-center gap-2 transition cursor-pointer"
                      >
                        {copiedLink === 'quiz-screen' ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedLink === 'quiz-screen' ? 'تم نسخ الرابط!' : 'نسخ رابط الحلبة'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Student Connection Info */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-3xl p-6">
                <h3 className="font-bold text-white text-base mb-2 flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-400" />
                  رابط ومشاركة دخول الطلاب
                </h3>
                <p className="text-xs text-slate-400 mb-4">
                  يمكن للطلاب الدخول عبر هواتفهم الذكية أو أجهزتهم اللوحية عبر الرابط أدناه مع إدخال رمز الـ PIN الموحد.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-3 bg-slate-900 p-3 rounded-2xl border border-slate-700">
                  <span className="font-mono text-xs sm:text-sm text-slate-300 truncate flex-grow px-2" dir="ltr">
                    {studentUrl}
                  </span>
                  <button
                    onClick={() => handleCopy(studentUrl, 'student-link')}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shrink-0"
                  >
                    {copiedLink === 'student-link' ? <CheckCircle2 className="w-4 h-4 text-emerald-900" /> : <Copy className="w-4 h-4" />}
                    {copiedLink === 'student-link' ? 'تم النسخ!' : 'نسخ رابط الطالب'}
                  </button>
                </div>
              </div>

            </div>
          )}

          {/* TAB 5: SHEETS & DESIGN SETTINGS */}
          {activeTab === 'sheets-design' && (
            <div className="space-y-6 max-w-5xl mx-auto py-4">
              
              {/* Sheets Status and Auto-Setup */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-3xl p-6">
                <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                  <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                      <FileSpreadsheet className="w-5 h-5 text-amber-400" />
                      أوراق Google Sheets المتصلة بالمنظومة
                    </h2>
                    <p className="text-xs text-slate-400">
                      حالة الربط والتهيئة التلقائية لأوراق العمل الخاصة بالأقسام الثلاثة المستخرجة
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Live Classroom Sheet Info */}
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-amber-400 text-sm">الحصص التفاعلية</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 font-mono">Questions-T</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      متصل بالورقتين: <br />
                      • <b>Questions-T</b>: لبيانات الدرس وأسئلته التفاعلية <br />
                      • <b>Answers-T</b>: لتسجيل حضور وإجابات الطلاب
                    </p>
                    <div className="text-[11px] text-emerald-400 flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      مدعوم تلقائياً وجاهز
                    </div>
                  </div>

                  {/* Live Direct Sheet Info */}
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-amber-400 text-sm">شرح مباشر</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">Questions-Live</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      متصل بالورقتين: <br />
                      • <b>Questions-Live</b>: لبنك أسئلة المحاضرات <br />
                      • <b>Answers-Live</b>: لنتائج وتصويتات الطلاب
                    </p>
                    <button
                      onClick={handleSetupLiveDirectSheets}
                      disabled={settingUpLiveSheets}
                      className="w-full py-2 rounded-xl bg-amber-600/30 hover:bg-amber-600 text-amber-300 hover:text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${settingUpLiveSheets ? 'animate-spin' : ''}`} />
                      {settingUpLiveSheets ? 'جارٍ التهيئة...' : 'إنشاء وتهيئة الأوراق بالشيت'}
                    </button>
                  </div>

                  {/* Quiz Challenge Sheet Info */}
                  <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-700">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-amber-400 text-sm">تحدي كويز</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-mono">Questions-Qui</span>
                    </div>
                    <p className="text-xs text-slate-400 mb-3">
                      متصل بالورقتين: <br />
                      • <b>Questions-Qui</b>: لأسئلة التحدي والبطولات <br />
                      • <b>Answers-Qui</b>: لنقاط الطلاب ومراكز المتصدرين
                    </p>
                    <button
                      onClick={handleSetupQuizSheets}
                      disabled={settingUpQuizSheets}
                      className="w-full py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${settingUpQuizSheets ? 'animate-spin' : ''}`} />
                      {settingUpQuizSheets ? 'جارٍ التهيئة...' : 'إنشاء وتهيئة أوراق التحدي'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Advanced Settings & Header Customization */}
              <div className="bg-slate-800/60 border border-slate-700 rounded-3xl p-6">
                <SettingsPanel 
                  onClose={() => setActiveTab('live')}
                  onSave={(newUrl) => {
                    setNotice({ text: 'تم حفظ إعدادات الرابط بنجاح! ⚡', type: 'success' });
                  }}
                />
              </div>

            </div>
          )}

        </div>

      </div>
    </div>
  );
}
