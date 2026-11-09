import React, { useState, useEffect, useRef } from 'react';
import { 
  Video, Mic, Radio, Copy, Check, ExternalLink, 
  ShieldCheck, Sliders, Play, Square, Users, Sparkles, 
  Eye, VolumeX, AlertCircle
} from 'lucide-react';
import { LiveSessionState, LiveStreamConfig } from '../types';
import { 
  updateLiveStreamState, 
  toggleLiveStream, 
  generateStreamToken, 
  updateLiveCaption,
  translateLiveCaption,
  defaultLiveStreamConfig, 
  subscribeToLiveSession 
} from '../api';

interface LiveCameraManagerProps {
  onClose?: () => void;
}

export default function LiveCameraManager({ onClose }: LiveCameraManagerProps) {
  const [sessionState, setSessionState] = useState<LiveSessionState | null>(null);
  const [streamConfig, setStreamConfig] = useState<LiveStreamConfig>(defaultLiveStreamConfig);
  const [isUpdating, setIsUpdating] = useState(false);
  const [copiedLink, setCopiedLink] = useState<string | null>(null);
  const [activeBroadcastMethod, setActiveBroadcastMethod] = useState<'browser' | 'obs'>('browser');
  const [showInPagePreview, setShowInPagePreview] = useState(false);
  const [elapsedTime, setElapsedTime] = useState('00:00');
  const [liveTranscriptPreview, setLiveTranscriptPreview] = useState<string>('');
  const [liveTranslations, setLiveTranslations] = useState<{ th: string; en: string }>({ th: '', en: '' });
  const speechRecognitionRef = useRef<any>(null);
  const isSpeechActiveRef = useRef<boolean>(false);

  // Sync with Firestore sessionState
  useEffect(() => {
    const unsub = subscribeToLiveSession((state) => {
      setSessionState(state);
      if (state.streamState) {
        setStreamConfig(state.streamState);
      }
    });
    return () => unsub();
  }, []);

  // Elapsed time counter when stream is active
  useEffect(() => {
    if (!streamConfig.isActive || !streamConfig.startedAt) {
      setElapsedTime('00:00');
      return;
    }

    const interval = setInterval(() => {
      const diffSec = Math.max(0, Math.floor((Date.now() - (streamConfig.startedAt || Date.now())) / 1000));
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      setElapsedTime(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
    }, 1000);

    return () => clearInterval(interval);
  }, [streamConfig.isActive, streamConfig.startedAt]);

  // Continuous Arabic Speech Recognition Engine with Auto-Restart Loop
  // Directly bypasses Chrome's 60-second limit and silence timeout!
  useEffect(() => {
    isSpeechActiveRef.current = Boolean(streamConfig.enableSubtitles);

    if (!streamConfig.enableSubtitles) {
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
        speechRecognitionRef.current = null;
      }
      setLiveTranscriptPreview('');
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      return;
    }

    let isDestroyed = false;
    let pushTimer: any = null;

    const initRecognition = () => {
      if (isDestroyed || !isSpeechActiveRef.current) return;

      try {
        const recognition = new SpeechRecognition();
        recognition.lang = 'ar-SA';
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.maxAlternatives = 1;

        recognition.onresult = (event: any) => {
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; i++) {
            text += event.results[i][0].transcript;
          }
          const cleanText = text.trim();
          if (cleanText) {
            setLiveTranscriptPreview(cleanText);
            clearTimeout(pushTimer);
            pushTimer = setTimeout(async () => {
              // 1. Immediately push Arabic caption so students see it with 0 latency
              updateLiveCaption(cleanText);
              // 2. Simultaneously translate to Thai and English via Gemini
              try {
                const trans = await translateLiveCaption(cleanText);
                if (trans.th || trans.en) {
                  setLiveTranslations({ th: trans.th, en: trans.en });
                  // Push updated translations to Firestore
                  updateLiveCaption(cleanText, { th: trans.th, en: trans.en });
                }
              } catch (e) {
                console.warn('Real-time caption translation error:', e);
              }
            }, 80);
          }
        };

        recognition.onerror = () => {
          // Silence or network hiccup; onend will automatically recover
        };

        // AUTO-RESTART LOOP: Whenever Chrome's 60-second server limit is reached,
        // onend triggers. We instantly restart SpeechRecognition in an endless loop!
        recognition.onend = () => {
          if (!isDestroyed && isSpeechActiveRef.current) {
            setTimeout(() => {
              if (!isDestroyed && isSpeechActiveRef.current) {
                initRecognition();
              }
            }, 50);
          }
        };

        recognition.start();
        speechRecognitionRef.current = recognition;
      } catch {
        setTimeout(() => {
          if (!isDestroyed && isSpeechActiveRef.current) {
            initRecognition();
          }
        }, 500);
      }
    };

    initRecognition();

    return () => {
      isDestroyed = true;
      clearTimeout(pushTimer);
      if (speechRecognitionRef.current) {
        try { speechRecognitionRef.current.stop(); } catch {}
        speechRecognitionRef.current = null;
      }
    };
  }, [streamConfig.enableSubtitles]);

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(key);
    setTimeout(() => setCopiedLink(null), 2500);
  };

  const handleToggleStream = async () => {
    setIsUpdating(true);
    try {
      const nextActive = !streamConfig.isActive;
      await toggleLiveStream(nextActive);
      setStreamConfig(prev => ({
        ...prev,
        isActive: nextActive,
        startedAt: nextActive ? Date.now() : 0,
      }));
      if (nextActive) {
        setShowInPagePreview(true);
      }
    } catch (err: any) {
      console.error('فشل تغيير حالة البث:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleModeChange = async (mode: 'video' | 'audio') => {
    setIsUpdating(true);
    try {
      await updateLiveStreamState({ mode });
      setStreamConfig(prev => ({ ...prev, mode }));
    } catch (err: any) {
      console.error('فشل تغيير نوع البث:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleGenerateNewToken = async () => {
    const newToken = generateStreamToken();
    setIsUpdating(true);
    try {
      await updateLiveStreamState({ password: newToken });
      setStreamConfig(prev => ({ ...prev, password: newToken }));
    } catch (err: any) {
      console.error('فشل توليد رمز سري جديد:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleUpdateStreamId = async (newId: string) => {
    const cleanId = newId.trim().replace(/[^a-zA-Z0-9_-]/g, '') || 'room_live_teacher';
    setIsUpdating(true);
    try {
      await updateLiveStreamState({ streamId: cleanId });
      setStreamConfig(prev => ({ ...prev, streamId: cleanId }));
    } catch (err: any) {
      console.error('فشل تحديث معرف البث:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleToggleMeshcast = async () => {
    const nextMeshcast = !streamConfig.useMeshcast;
    setIsUpdating(true);
    try {
      await updateLiveStreamState({ useMeshcast: nextMeshcast });
      setStreamConfig(prev => ({ ...prev, useMeshcast: nextMeshcast }));
    } catch (err: any) {
      console.error('فشل تعديل خاصية Meshcast:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  const [subtitleNotice, setSubtitleNotice] = useState<string | null>(null);

  const handleToggleSubtitles = async () => {
    const nextSubtitles = !streamConfig.enableSubtitles;
    setIsUpdating(true);
    try {
      await updateLiveStreamState({ enableSubtitles: nextSubtitles });
      setStreamConfig(prev => ({ ...prev, enableSubtitles: nextSubtitles }));
      if (nextSubtitles) {
        setSubtitleNotice('تم تفعيل ميزة الترجمة التلقائية! 💡 ملاحظة مهمة: يتم التعرف الصوتي عبر متصفح Google Chrome أو Edge. إذا كانت نافذة الكاميرا مفتوحة مسبقاً، يرجى إغلاقها وإعادة فتحها بالزر أدناه لتبدأ الكاميرا بنقل صوتك وكتابته للطلاب.');
      } else {
        setSubtitleNotice(null);
      }
    } catch (err: any) {
      console.error('فشل تعديل خاصية الترجمة المباشرة:', err);
    } finally {
      setIsUpdating(false);
    }
  };

  // Base VDO.Ninja Push Link for Teacher
  // Using &transcribe=ar-SA to activate Chrome Speech Recognition in Arabic
  const teacherPushUrl = `https://vdo.ninja/?push=${encodeURIComponent(streamConfig.streamId)}&autostart&webcam${
    streamConfig.password ? `&password=${encodeURIComponent(streamConfig.password)}` : ''
  }${streamConfig.mode === 'audio' ? '&novideo' : ''}${streamConfig.enableSubtitles ? '&transcribe=ar-SA' : ''}`;

  // Teacher In-Page Preview URL (Crucial: Muted to prevent echo / hearing own voice!)
  const teacherMutedPreviewUrl = `${teacherPushUrl}&mute=1&noaudio=1`;

  // VDO.Ninja View Link for Students (includes &cover for zero margins and &closedcaptions for subtitles)
  const studentViewUrl = `https://vdo.ninja/?view=${encodeURIComponent(streamConfig.streamId)}&cleanoutput&autostart&playsinline&transparent=0&cover&scale=100&closedcaptions${
    streamConfig.password ? `&password=${encodeURIComponent(streamConfig.password)}` : ''
  }${streamConfig.mode === 'audio' ? '&novideo' : ''}${streamConfig.useMeshcast ? '&meshcast' : ''}`;

  const connectedStudentsCount = sessionState?.connectedStudents?.length || 0;

  return (
    <div className="space-y-6" dir="rtl">
      {/* Top Banner & Status Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 border border-slate-700/80 rounded-3xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className={`w-13 h-13 rounded-2xl flex items-center justify-center shadow-lg transition-all ${
              streamConfig.isActive 
                ? 'bg-rose-500 text-white shadow-rose-500/30 animate-pulse' 
                : 'bg-slate-800 text-slate-400'
            }`}>
              {streamConfig.mode === 'audio' ? (
                <Mic className="w-7 h-7" />
              ) : (
                <Video className="w-7 h-7" />
              )}
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  كاميرا وبث مباشر للمعلم
                </h2>
                {streamConfig.isActive ? (
                  <span className="px-3 py-1 rounded-full text-xs font-black bg-rose-500/20 text-rose-300 border border-rose-500/40 flex items-center gap-1.5 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-400"></span>
                    مباشر الآن • {elapsedTime}
                  </span>
                ) : (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-800 text-slate-400 border border-slate-700">
                    البث متوقف ⏹️
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-slate-400 mt-1">
                بث فيديو وشاشة المعلم أو صوت مباشر فائق السرعة للطلاب بنقرة واحدة عبر تقنية WebRTC السحابية.
              </p>
            </div>
          </div>

          {/* Quick Active Metrics & Master Toggle */}
          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="bg-slate-950/60 border border-slate-800 px-4 py-2.5 rounded-2xl flex items-center gap-2.5">
              <Users className="w-4 h-4 text-emerald-400" />
              <div className="text-right">
                <div className="text-[11px] text-slate-400 font-bold">الطلاب المتصلين</div>
                <div className="text-sm font-black text-white">{connectedStudentsCount} طالب</div>
              </div>
            </div>

            {/* Master Start / Stop Button */}
            <button
              onClick={handleToggleStream}
              disabled={isUpdating}
              className={`flex-1 md:flex-initial px-6 py-3.5 rounded-2xl font-black text-sm flex items-center justify-center gap-2.5 transition-all shadow-xl cursor-pointer ${
                streamConfig.isActive
                  ? 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white shadow-rose-600/30'
                  : 'bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 shadow-emerald-500/25'
              }`}
            >
              {streamConfig.isActive ? (
                <>
                  <Square className="w-4 h-4 fill-white" />
                  <span>إيقاف البث ⏹️</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  <span>بدء البث المباشر 🟢</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Control Grid: Stream Mode & Connection Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        
        {/* Card 1: Stream Type & Transmission Mode */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-black text-white">نوع وطريقة البث</h3>
            </div>
            <span className="text-[11px] text-slate-400">بضغطة واحدة</span>
          </div>

          {/* Mode Switcher Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => handleModeChange('video')}
              disabled={isUpdating}
              className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-2 ${
                streamConfig.mode === 'video'
                  ? 'bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-md shadow-amber-500/10'
                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
              }`}
            >
              <Video className="w-6 h-6" />
              <div className="font-black text-xs">فيديو + صوت 🎥</div>
              <div className="text-[10px] text-slate-400">كاميرا المعلم أو شاشة الحاسوب</div>
            </button>

            <button
              type="button"
              onClick={() => handleModeChange('audio')}
              disabled={isUpdating}
              className={`p-3.5 rounded-2xl border text-center transition-all cursor-pointer flex flex-col items-center gap-2 ${
                streamConfig.mode === 'audio'
                  ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-300 shadow-md shadow-indigo-500/10'
                  : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:bg-slate-800/40'
              }`}
            >
              <Mic className="w-6 h-6" />
              <div className="font-black text-xs">صوت مباشر فقط 🎙️</div>
              <div className="text-[10px] text-slate-400">بدقة عالية وتوفير كامل لبيانات النت</div>
            </button>
          </div>

          {/* Meshcast Relay Distribution Switch */}
          <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-1.5">
                <span>توزيع البث عبر السحابة (Meshcast)</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">موصى به</span>
              </div>
              <div className="text-[11px] text-slate-400">يمنع ثقل النت على المعلم عند دخول مئات الطلاب</div>
            </div>
            <button
              type="button"
              onClick={handleToggleMeshcast}
              className={`w-12 h-6.5 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                streamConfig.useMeshcast ? 'bg-emerald-500' : 'bg-slate-800'
              }`}
            >
              <div className={`w-5.5 h-5.5 rounded-full bg-white transition-transform ${
                streamConfig.useMeshcast ? '-translate-x-5.5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* Live Subtitles / Closed Captions Switch */}
          <div className="pt-2 border-t border-slate-800/60 space-y-2.5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>الترجمة والكتابة التلقائية المباشرة (Live Subtitles)</span>
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/10 text-indigo-400 border border-indigo-500/30">جديد 📝</span>
                </div>
                <div className="text-[11px] text-slate-400">يظهر كلام المعلم مكتوباً تلقائياً في شريط أسفل شاشات الطلاب</div>
              </div>
              <button
                type="button"
                onClick={handleToggleSubtitles}
                className={`w-12 h-6.5 rounded-full transition-colors relative p-0.5 cursor-pointer ${
                  streamConfig.enableSubtitles ? 'bg-indigo-500' : 'bg-slate-800'
                }`}
              >
                <div className={`w-5.5 h-5.5 rounded-full bg-white transition-transform ${
                  streamConfig.enableSubtitles ? '-translate-x-5.5' : 'translate-x-0'
                }`} />
              </button>
            </div>

            {/* Subtitles Guidance & Continuous Engine Status */}
            {streamConfig.enableSubtitles && (
              <div className="bg-indigo-950/40 border border-indigo-500/30 rounded-2xl p-3 text-xs text-indigo-200 space-y-2.5">
                <div className="flex items-start gap-2">
                  <Sparkles className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    <b className="text-white">الترجمة المستمرة المباشرة (بدون حد الـ 60 ثانية) 🟢:</b>
                    <div className="text-slate-300 mt-0.5">
                      تم دمج محرك تكرار تلقائي (Auto-Restart Loop) يتجاوز قيود متصفح Chrome السابقة؛ سيتعرف المايك على كلامك بالعربية ويرسله تلقائياً لشاشات الطلاب باستمرار طوال الحصة.
                    </div>
                  </div>
                </div>

                {/* Live Speech & Translation Preview */}
                {liveTranscriptPreview ? (
                  <div className="bg-black/60 border border-indigo-400/40 rounded-xl p-3 text-xs space-y-2">
                    <div className="text-[10px] text-indigo-300 font-bold flex items-center justify-between border-b border-indigo-500/20 pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                        <span>الترجمة الفورية المباشرة (عربي + تايلاندي + إنجليزي):</span>
                      </div>
                      <span className="text-[10px] text-emerald-400 font-mono">Gemini AI ✨</span>
                    </div>

                    {/* Arabic original */}
                    <div>
                      <div className="text-[10px] text-slate-400 font-bold mb-0.5">🇸🇦 النص العربي المنطوق:</div>
                      <div className="text-amber-300 font-bold font-sans text-sm">
                        "{liveTranscriptPreview}"
                      </div>
                    </div>

                    {/* Thai translation */}
                    {liveTranslations.th && (
                      <div className="pt-1.5 border-t border-slate-800">
                        <div className="text-[10px] text-indigo-300 font-bold mb-0.5">🇹🇭 ภาษาไทย (التايلاندية للطلاب):</div>
                        <div className="text-emerald-300 font-bold text-xs leading-relaxed">
                          {liveTranslations.th}
                        </div>
                      </div>
                    )}

                    {/* English translation */}
                    {liveTranslations.en && (
                      <div className="pt-1.5 border-t border-slate-800">
                        <div className="text-[10px] text-blue-300 font-bold mb-0.5">🇬🇧 English (الإنجليزية للطلاب):</div>
                        <div className="text-blue-200 font-bold text-xs leading-relaxed">
                          {liveTranslations.en}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-[11px] text-slate-400 italic bg-black/30 rounded-xl p-2.5 text-center leading-relaxed">
                    تحدّث في الميكروفون ليتم تحويل صوتك العربي إلى كتابة وترجمتها تلقائياً للتايلاندية والإنجليزية للطلاب...
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setShowInPagePreview(false);
                    window.open(teacherPushUrl, 'vdo_ninja_push', 'width=1000,height=750,menubar=no,toolbar=no,location=no');
                  }}
                  className="w-full py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer shadow-md"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>فتح نافذة الكاميرا المنبثقة ↗️</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Stream Security & Keys */}
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black text-white">معرّف البث والأمان</h3>
            </div>
            <span className="text-[11px] text-slate-400">حماية من الدخول غير المصرح</span>
          </div>

          {/* Stream ID Input */}
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              معرّف البث (Stream ID)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={streamConfig.streamId}
                onChange={(e) => setStreamConfig(prev => ({ ...prev, streamId: e.target.value }))}
                onBlur={(e) => handleUpdateStreamId(e.target.value)}
                placeholder="room_live_teacher"
                className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
              />
              <button
                type="button"
                onClick={() => handleUpdateStreamId('live_' + Math.random().toString(36).substring(2, 8))}
                className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                title="توليد معرف عشوائي"
              >
                تغيير 🔄
              </button>
            </div>
          </div>

          {/* Password / Session Token */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-300">
                الرمز السري للجلسة (Session Password)
              </label>
              <button
                type="button"
                onClick={handleGenerateNewToken}
                className="text-[11px] font-bold text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
              >
                <Sparkles className="w-3 h-3" />
                <span>توليد رمز جديد للحصة</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={streamConfig.password || ''}
                  onChange={(e) => setStreamConfig(prev => ({ ...prev, password: e.target.value }))}
                  onBlur={(e) => updateLiveStreamState({ password: e.target.value.trim() })}
                  placeholder="لا يوجد رمز حماية (عام)"
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-xs font-mono text-white focus:outline-none focus:border-amber-400"
                />
              </div>
              {streamConfig.password && (
                <button
                  type="button"
                  onClick={() => updateLiveStreamState({ password: '' })}
                  className="px-3 py-2 bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  title="إلغاء الرمز السري"
                >
                  إلغاء
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Broadcast Launch Options: Browser vs OBS Studio */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <Radio className="w-5 h-5 text-amber-400 animate-pulse" />
            <h3 className="text-base font-black text-white">طريقة بث المعلم (اختر ما يناسبك)</h3>
          </div>

          {/* Method selector toggle */}
          <div className="flex items-center bg-slate-950 p-1 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => setActiveBroadcastMethod('browser')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeBroadcastMethod === 'browser'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              بث مباشر من المتصفح 🚀
            </button>
            <button
              type="button"
              onClick={() => setActiveBroadcastMethod('obs')}
              className={`px-4 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                activeBroadcastMethod === 'obs'
                  ? 'bg-amber-500 text-slate-950 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              برنامج خارجي (OBS Studio) 📡
            </button>
          </div>
        </div>

        {/* METHOD 1: Direct Browser Broadcast (In-Page or Pop-up) */}
        {activeBroadcastMethod === 'browser' && (
          <div className="space-y-4">
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-xs text-amber-200 leading-relaxed flex items-start gap-3">
              <Sparkles className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">البث المباشر بدون برامج:</span> يمكنك فتح كاميرا الحاسوب أو كاميرا الهاتف أو مشاركة شاشتك مباشرة بنقرة زر واحدة دون الحاجة لتثبيت أي برامج على جهازك!
                <div className="mt-1 text-slate-300">
                  💡 <b>تنبيه لتفادي تعارض البث:</b> يمكنك البث إما عبر <b>النافذة المنبثقة المستقلة</b> (الموصى بها) أو عبر <b>المعاينة المدمجة هنا</b>. اختر أحدهما فقط حتى لا يظهر لك تنبيه أن المعرف قيد الاستخدام.
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  setShowInPagePreview(false);
                  window.open(teacherPushUrl, 'vdo_ninja_push', 'width=1000,height=750,menubar=no,toolbar=no,location=no');
                }}
                className="px-5 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>فتح نافذة البث المباشر المنبثقة ↗️</span>
              </button>

              <button
                type="button"
                onClick={() => setShowInPagePreview(!showInPagePreview)}
                className="px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Eye className="w-4 h-4 text-slate-400" />
                <span>{showInPagePreview ? 'إخفاء المعاينة المدمجة' : 'عرض نافذة الكاميرا هنا'}</span>
              </button>

              <button
                type="button"
                onClick={() => copyToClipboard(teacherPushUrl, 'push_link')}
                className="px-4 py-3 rounded-2xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-300 font-bold text-xs flex items-center gap-2 transition cursor-pointer"
              >
                {copiedLink === 'push_link' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400">تم نسخ رابط البث!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 text-slate-400" />
                    <span>نسخ رابط بث المعلم</span>
                  </>
                )}
              </button>
            </div>

            {/* Embedded Live Push Window (Muted to eliminate echo!) */}
            {showInPagePreview && (
              <div className="rounded-2xl overflow-hidden border border-slate-700 bg-black aspect-video relative shadow-2xl mt-4">
                <div className="absolute top-2 left-2 z-10 bg-slate-950/80 px-2.5 py-1 rounded-lg text-[11px] text-amber-300 flex items-center gap-1.5 border border-slate-800">
                  <VolumeX className="w-3.5 h-3.5 text-amber-400" />
                  <span>معاينة صامتة تلقائياً لمنع صدى الصوت</span>
                </div>
                <iframe
                  src={teacherMutedPreviewUrl}
                  title="Teacher Live Stream Broadcast"
                  allow="camera; microphone; display-capture; autoplay"
                  className="w-full h-full border-0"
                />
              </div>
            )}
          </div>
        )}

        {/* METHOD 2: OBS Studio or External Mixer */}
        {activeBroadcastMethod === 'obs' && (
          <div className="space-y-4">
            <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-xs text-slate-300 leading-relaxed space-y-2">
              <div className="font-bold text-amber-400 flex items-center gap-1.5 text-sm">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <span>طريقة الربط المعتمدة والأسهل مع OBS Studio (بدون مشاكل أذونات):</span>
              </div>
              <p className="text-slate-300">
                برنامج OBS يمنع أذونات الكاميرا داخل الـ Browser Source افتراضياً، لذلك <b>الطريقة الصحيحة والاحترافية</b> هي استخدام ميزة الكاميرا الافتراضية بنقرة واحدة:
              </p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-300 pr-2">
                <li>افتح برنامج <span className="text-amber-400 font-mono">OBS Studio</span> وجهّز الكاميرا والمايك والمشاهد كالمعتاد.</li>
                <li>في أسفل يمين شاشة OBS، انقر على زر: <span className="text-emerald-400 font-bold bg-slate-900 px-2 py-0.5 rounded border border-slate-700">Start Virtual Camera (بدء الكاميرا الافتراضية)</span>.</li>
                <li>عد هنا وانقر على <span className="text-amber-400 font-bold">"فتح نافذة البث المباشر المنبثقة"</span>، وستجد كاميرا OBS ظاهرة فوراً كخيار كاميرا رئيسي!</li>
                <li>سيبث النظام مخرجات OBS كاملة بدقة فائقة وبدون أي تعقيد.</li>
              </ol>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 mb-1.5">
                رابط البث الخارجي المباشر لـ OBS (في حال استخدام إضافات OBS Ninja)
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={teacherPushUrl}
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-mono text-amber-300 select-all focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => copyToClipboard(teacherPushUrl, 'obs_push')}
                  className="px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-2 transition cursor-pointer"
                >
                  {copiedLink === 'obs_push' ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>تم النسخ!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>نسخ الرابط</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Student View Link Verification */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <Eye className="w-4 h-4 text-slate-400" />
          <span className="text-slate-400">رابط مشغل الطلاب (يظهر تلقائياً في صفحة الطالب عند نقر "بدء البث"):</span>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="text"
            readOnly
            value={studentViewUrl}
            className="flex-1 sm:w-80 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-400 select-all"
          />
          <button
            type="button"
            onClick={() => copyToClipboard(studentViewUrl, 'student_url')}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
            title="نسخ رابط الطلاب"
          >
            {copiedLink === 'student_url' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          <a
            href={studentViewUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg cursor-pointer"
            title="معاينة في تبويب جديد"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
