import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Volume2, BookOpen, Loader2, Captions } from 'lucide-react';
import { LiveSubtitleState, LiveStreamConfig } from '../types';
import { useLanguage, Language } from '../translations';
import { fetchTtsAudio } from '../api';

interface LiveSubtitleBarProps {
  subtitleState?: LiveSubtitleState | null;
  streamState?: LiveStreamConfig | null;
  variant?: 'card' | 'fullscreen-overlay' | 'inline-video';
  compact?: boolean;
  suspendAudio?: boolean;
  className?: string;
}

const AUDIO_PREF_KEY = 'student_subtitle_audio_enabled';
const AUDIO_SYNC_EVENT = 'student-subtitle-audio-pref-changed';

const BAR_LABELS: Record<Language, {
  readMode: string;
  listenMode: string;
  speaking: string;
  loadingVoice: string;
  liveTranslation: string;
}> = {
  ar: {
    readMode: 'قراءة فقط',
    listenMode: 'سماع الصوت',
    speaking: 'جاري القراءة الصوتية...',
    loadingVoice: 'تحضير الصوت...',
    liveTranslation: 'الترجمة المباشرة',
  },
  th: {
    readMode: 'อ่านอย่างเดียว',
    listenMode: 'ฟังเสียงแปล',
    speaking: 'กำลังอ่านเสียง...',
    loadingVoice: 'กำลังเตรียมเสียง...',
    liveTranslation: 'คำแปลสด',
  },
  en: {
    readMode: 'Read Only',
    listenMode: 'Listen Voice',
    speaking: 'Speaking...',
    loadingVoice: 'Loading audio...',
    liveTranslation: 'Live Subtitle',
  },
};

export default function LiveSubtitleBar({
  subtitleState,
  streamState,
  variant = 'card',
  compact = false,
  suspendAudio = false,
  className = '',
}: LiveSubtitleBarProps) {
  const { language } = useLanguage();
  const activeLang: Language = language || 'ar';
  const labels = BAR_LABELS[activeLang] || BAR_LABELS.ar;

  const [audioEnabled, setAudioEnabled] = useState<boolean>(() => {
    try {
      return localStorage.getItem(AUDIO_PREF_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [isLoadingAudio, setIsLoadingAudio] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const playbackSeqRef = useRef(0);
  const lastSpokenSignatureRef = useRef<string>('');

  // Keep preference synchronized between standard bar & fullscreen overlay instance
  useEffect(() => {
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') {
        setAudioEnabled(detail);
      }
    };
    window.addEventListener(AUDIO_SYNC_EVENT, onSync);
    return () => window.removeEventListener(AUDIO_SYNC_EVENT, onSync);
  }, []);

  // Time ticker to expire legacy ad-hoc ASR captions after 6s (script lines stay until teacher moves/clears)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!streamState?.enableSubtitles || subtitleState?.showToStudents) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [streamState?.enableSubtitles, subtitleState?.showToStudents]);

  // Resolve primary single-language subtitle text
  let displayText = '';
  let sourceId = '';

  const hasScriptActive = Boolean(
    subtitleState?.showToStudents &&
      (subtitleState?.activeArabic || subtitleState?.activeTh || subtitleState?.activeEn)
  );

  if (hasScriptActive && subtitleState) {
    sourceId = subtitleState.activeLineId || `${subtitleState.updatedAt || ''}`;
    if (activeLang === 'th') {
      displayText = (subtitleState.activeTh || subtitleState.activeEn || subtitleState.activeArabic || '').trim();
    } else if (activeLang === 'en') {
      displayText = (subtitleState.activeEn || subtitleState.activeTh || subtitleState.activeArabic || '').trim();
    } else {
      displayText = (subtitleState.activeArabic || '').trim();
    }
  } else if (
    streamState?.enableSubtitles &&
    streamState?.liveCaption &&
    streamState?.liveCaptionUpdatedAt &&
    now - streamState.liveCaptionUpdatedAt < 6500
  ) {
    sourceId = `asr_${streamState.liveCaptionUpdatedAt}`;
    if (activeLang === 'th') {
      displayText = (streamState.liveCaptionTh || streamState.liveCaption || '').trim();
    } else if (activeLang === 'en') {
      displayText = (streamState.liveCaptionEn || streamState.liveCaption || '').trim();
    } else {
      displayText = (streamState.liveCaption || '').trim();
    }
  }

  const stopAllAudio = useCallback(() => {
    playbackSeqRef.current += 1;
    if (audioElRef.current) {
      try {
        audioElRef.current.pause();
        audioElRef.current.currentTime = 0;
      } catch {}
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    setIsLoadingAudio(false);
    setIsSpeaking(false);
  }, []);

  const speakWithBrowserFallback = useCallback((text: string, lang: Language, seq: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setIsSpeaking(false);
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance(text);
      utter.lang = lang === 'th' ? 'th-TH' : lang === 'en' ? 'en-US' : 'ar-SA';
      utter.rate = 0.96;
      utter.onstart = () => {
        if (playbackSeqRef.current === seq) setIsSpeaking(true);
      };
      utter.onend = () => {
        if (playbackSeqRef.current === seq) setIsSpeaking(false);
      };
      utter.onerror = () => {
        if (playbackSeqRef.current === seq) setIsSpeaking(false);
      };
      window.speechSynthesis.speak(utter);
    } catch {
      setIsSpeaking(false);
    }
  }, []);

  const playSubtitleVoice = useCallback(
    async (textToSpeak: string, lang: Language) => {
      if (!textToSpeak || suspendAudio) return;

      stopAllAudio();
      const seq = playbackSeqRef.current;
      setIsLoadingAudio(true);

      // Prepare shared audio element
      if (!audioElRef.current) {
        audioElRef.current = new Audio();
      }

      const res = await fetchTtsAudio(textToSpeak, lang);
      if (playbackSeqRef.current !== seq) {
        setIsLoadingAudio(false);
        return;
      }
      setIsLoadingAudio(false);

      if (res.success && res.audioDataUrl && audioElRef.current) {
        try {
          const el = audioElRef.current;
          el.pause();
          el.src = res.audioDataUrl;
          el.onended = () => {
            if (playbackSeqRef.current === seq) setIsSpeaking(false);
          };
          el.onerror = () => {
            if (playbackSeqRef.current === seq) {
              speakWithBrowserFallback(textToSpeak, lang, seq);
            }
          };
          setIsSpeaking(true);
          await el.play();
          return;
        } catch {
          // If HTML5 Audio autoplay blocked or failed, fallback safely
        }
      }

      if (playbackSeqRef.current === seq) {
        speakWithBrowserFallback(textToSpeak, lang, seq);
      }
    },
    [suspendAudio, stopAllAudio, speakWithBrowserFallback]
  );

  // Trigger TTS automatically on new subtitle line when audio mode is active
  useEffect(() => {
    if (!audioEnabled || !displayText || suspendAudio) {
      if (!audioEnabled || suspendAudio) {
        stopAllAudio();
      }
      return;
    }

    const sig = `${activeLang}::${sourceId}::${displayText}`;
    if (lastSpokenSignatureRef.current === sig) return;
    lastSpokenSignatureRef.current = sig;

    playSubtitleVoice(displayText, activeLang);
  }, [audioEnabled, displayText, activeLang, sourceId, suspendAudio, playSubtitleVoice, stopAllAudio]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllAudio();
    };
  }, [stopAllAudio]);

  const handleToggleAudioMode = () => {
    const next = !audioEnabled;
    setAudioEnabled(next);
    try {
      localStorage.setItem(AUDIO_PREF_KEY, next ? 'true' : 'false');
    } catch {}
    window.dispatchEvent(new CustomEvent(AUDIO_SYNC_EVENT, { detail: next }));

    if (next) {
      // Unlock audio element synchronously inside user click gesture (iOS/Android requirement)
      try {
        if (!audioElRef.current) {
          audioElRef.current = new Audio();
        }
        // Tiny silent WAV unlock frame
        audioElRef.current.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        audioElRef.current.play().catch(() => {});
      } catch {}

      if (displayText && !suspendAudio) {
        lastSpokenSignatureRef.current = `${activeLang}::${sourceId}::${displayText}`;
        playSubtitleVoice(displayText, activeLang);
      }
    } else {
      lastSpokenSignatureRef.current = '';
      stopAllAudio();
    }
  };

  if (!displayText) {
    return null;
  }

  const textDir = activeLang === 'ar' ? 'rtl' : 'ltr';
  const langColorClass =
    activeLang === 'th'
      ? 'text-emerald-300'
      : activeLang === 'en'
      ? 'text-sky-200 font-sans'
      : 'text-amber-300';

  if (variant === 'fullscreen-overlay') {
    return (
      <div
        className={`flex flex-col items-center gap-1.5 pointer-events-none ${className}`}
        dir={textDir}
      >
        <div className="max-w-[92%] bg-black/85 backdrop-blur-md px-4 py-2 rounded-2xl border border-amber-500/40 shadow-2xl text-center leading-relaxed">
          <div className={`font-bold text-sm sm:text-base ${langColorClass}`}>
            {displayText}
          </div>
        </div>

        <button
          type="button"
          onClick={handleToggleAudioMode}
          className={`pointer-events-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold border backdrop-blur-md transition cursor-pointer shadow-lg ${
            audioEnabled
              ? 'bg-emerald-500 text-slate-950 border-emerald-300'
              : 'bg-black/75 text-slate-200 border-white/15 hover:bg-black/90'
          }`}
        >
          {isLoadingAudio ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : audioEnabled ? (
            <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse' : ''}`} />
          ) : (
            <BookOpen className="w-3.5 h-3.5" />
          )}
          <span>{audioEnabled ? labels.listenMode : labels.readMode}</span>
        </button>
      </div>
    );
  }

  if (variant === 'inline-video') {
    return (
      <div className={`flex flex-col items-center gap-1 pointer-events-none ${className}`} dir={textDir}>
        <div className="max-w-[96%] bg-black/85 backdrop-blur-md px-3 py-1.5 rounded-xl border border-amber-500/40 shadow-xl text-center">
          <div className={`font-bold ${compact ? 'text-xs truncate' : 'text-xs sm:text-sm'} ${langColorClass}`}>
            {displayText}
          </div>
        </div>
        {!compact && (
          <button
            type="button"
            onClick={handleToggleAudioMode}
            className={`pointer-events-auto inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition cursor-pointer ${
              audioEnabled
                ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                : 'bg-black/80 text-slate-300 border-white/15'
            }`}
          >
            {audioEnabled ? <Volume2 className="w-3 h-3" /> : <BookOpen className="w-3 h-3" />}
            <span>{audioEnabled ? labels.listenMode : labels.readMode}</span>
          </button>
        )}
      </div>
    );
  }

  // Default: Independent Student Screen Card (Works with or without video stream)
  return (
    <div
      className={`w-full mb-3 rounded-2xl bg-gradient-to-br from-slate-900/95 via-slate-900/95 to-emerald-950/50 border border-emerald-500/40 shadow-xl shadow-black/30 backdrop-blur-md p-3 sm:p-4 transition-all ${className}`}
      dir={textDir}
    >
      <div className="flex items-center justify-between gap-2 mb-2 pb-2 border-b border-slate-800/80">
        <div className="flex items-center gap-2 text-[11px] font-bold text-slate-400">
          <Captions className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{labels.liveTranslation}</span>
          {audioEnabled && (isLoadingAudio || isSpeaking) && (
            <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 font-bold">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
              <span>{isLoadingAudio ? labels.loadingVoice : labels.speaking}</span>
            </span>
          )}
        </div>

        {/* Single-Tap Student Choice: Read Only vs Automated Audio */}
        <button
          type="button"
          onClick={handleToggleAudioMode}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[11px] font-black border transition-all cursor-pointer active:scale-95 ${
            audioEnabled
              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-md shadow-emerald-500/20'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border-slate-700'
          }`}
        >
          {isLoadingAudio ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : audioEnabled ? (
            <Volume2 className={`w-3.5 h-3.5 ${isSpeaking ? 'animate-pulse' : ''}`} />
          ) : (
            <BookOpen className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span>{audioEnabled ? labels.listenMode : labels.readMode}</span>
        </button>
      </div>

      {/* Single-language subtitle text only (strictly matching student's selected language) */}
      <p
        className={`text-sm sm:text-lg font-extrabold leading-relaxed text-center py-1 break-words ${langColorClass}`}
      >
        {displayText}
      </p>
    </div>
  );
}
