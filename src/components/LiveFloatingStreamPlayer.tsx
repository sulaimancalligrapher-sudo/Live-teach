import React, { useState, useEffect, useRef } from 'react';
import { 
  Volume2, VolumeX, Maximize2, Minimize2, Radio, 
  Mic, Video, Sparkles, X, Columns, Fullscreen,
  PanelTop, ChevronDown, RotateCw, RefreshCw
} from 'lucide-react';
import { LiveStreamConfig } from '../types';
import { useLanguage } from '../translations';

interface LiveFloatingStreamPlayerProps {
  streamState?: LiveStreamConfig | null;
  isQuestionActive?: boolean;
  isRevealed?: boolean;
  sessionStatus?: string;
}

export type StreamDisplayMode = 'banner' | 'split' | 'fullscreen';

export default function LiveFloatingStreamPlayer({
  streamState,
  isQuestionActive = false,
  isRevealed = false,
  sessionStatus,
}: LiveFloatingStreamPlayerProps) {
  const { t } = useLanguage();
  
  // Display modes:
  // - 'banner': compact top docked strip (leaves 100% of question & choices clearly visible below it)
  // - 'split': normal inline player in page
  // - 'fullscreen': 100% full screen video
  const [displayMode, setDisplayMode] = useState<StreamDisplayMode>('split');
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isLandscapeRotate, setIsLandscapeRotate] = useState(false);
  const [studentAudioOnly, setStudentAudioOnly] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  // Time ticker to auto-fade caption after 5.5s of silence
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const isCaptionFresh = Boolean(
    streamState?.liveCaption &&
    streamState?.liveCaptionUpdatedAt &&
    (now - streamState.liveCaptionUpdatedAt) < 5500
  );

  // Remember previous mode before question started to restore it automatically afterwards
  const previousModeRef = useRef<StreamDisplayMode>('split');
  const currentModeRef = useRef<StreamDisplayMode>('split');
  currentModeRef.current = displayMode;
  const hadQuestionActiveRef = useRef(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close dropdown menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsModeMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Question round is active during BOTH question_active AND revealed states
  const isQuestionRoundActive = Boolean(isQuestionActive || isRevealed);

  // Auto-switch to 'banner' when question triggers, and restore previous mode ONLY when returning to explanation!
  useEffect(() => {
    if (isQuestionRoundActive) {
      if (!hadQuestionActiveRef.current) {
        hadQuestionActiveRef.current = true;
        // Save current mode (e.g. 'fullscreen' or 'split') before docking
        if (currentModeRef.current !== 'banner') {
          previousModeRef.current = currentModeRef.current;
        }
        setDisplayMode('banner');
      }
    } else {
      if (hadQuestionActiveRef.current) {
        hadQuestionActiveRef.current = false;
        // When question round is completely finished (teacher clicked "العودة إلى الشرح"):
        // Automatically restore the mode the student was previously enjoying (e.g. fullscreen)!
        const targetMode = previousModeRef.current !== 'banner' ? previousModeRef.current : 'split';
        setDisplayMode(targetMode);
        // CRITICAL NOTE: We do NOT call window.screen.orientation.lock() automatically here!
        // Automated orientation locks without user touch event throw DOMExceptions and freeze the
        // mobile Android GPU WebRTC hardware decoder surface.
        // Pure CSS zero-margin transform handles horizontal full bleed reliably.
      }
    }
  }, [isQuestionRoundActive]);

  const handleSelectMode = (mode: StreamDisplayMode) => {
    setIsModeMenuOpen(false);
    if (mode === 'fullscreen') {
      previousModeRef.current = displayMode;
      setDisplayMode('fullscreen');
    } else {
      previousModeRef.current = mode;
      setIsLandscapeRotate(false);
      setDisplayMode(mode);
    }
  };

  const handleExitFullscreen = () => {
    setIsLandscapeRotate(false);
    const target = isQuestionRoundActive 
      ? 'banner' 
      : (previousModeRef.current !== 'fullscreen' ? previousModeRef.current : 'split');
    setDisplayMode(target);
  };

  // If stream is inactive or no streamId, unmount completely (free WebRTC connections)
  if (!streamState || !streamState.isActive || !streamState.streamId) {
    return null;
  }

  const isAudioModeEffective = streamState.mode === 'audio' || studentAudioOnly;

  // Construct secure, mobile-optimized VDO.Ninja URL
  // KEY STABILITY RULES:
  // 1. &cover: Eliminates side/edge margins completely, filling 100% of the mobile display like object-fit: cover.
  // 2. &closedcaptions: Always included! When subtitles are toggled, the student iframe URL NEVER changes,
  //    preventing black screen reloads and WebRTC teardown.
  // 3. &cleanoutput &playsinline &webautoplay: Pristine distraction-free playback on mobile.
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(streamState.streamId)}&cleanoutput&autostart&playsinline&webautoplay&transparent=0&cover&scale=100&closedcaptions${
    streamState.password ? `&password=${encodeURIComponent(streamState.password)}` : ''
  }${isAudioModeEffective ? '&novideo' : ''}${streamState.useMeshcast ? '&meshcast' : ''}${
    reloadKey > 0 ? `&_r=${reloadKey}` : ''
  }`;

  // ==========================================
  // --- AUDIO ONLY MODE ---
  // ==========================================
  if (isAudioModeEffective) {
    return (
      <div 
        className="w-full my-2.5"
        onContextMenu={(e) => e.preventDefault()}
        dir="rtl"
      >
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-2xl p-2.5 sm:p-3.5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
                <Mic className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50"></span>
                  <span className="text-xs font-bold text-slate-300">
                    {studentAudioOnly ? 'وضع توفير البطارية (صوت فقط)' : 'بث صوتي مباشر'}
                  </span>
                </div>
                {/* Audio wave visualizer */}
                <div className="flex items-center gap-1 mt-1 h-2.5">
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_100ms] h-2"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_300ms] h-2.5"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_200ms] h-1.5"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_400ms] h-2.5"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_150ms] h-2"></span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5">
              {streamState.mode !== 'audio' && (
                <button
                  type="button"
                  onClick={() => setStudentAudioOnly(false)}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-[11px] font-bold transition flex items-center gap-1 cursor-pointer"
                  title="إعادة تشغيل الفيديو"
                >
                  <Video className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">تشغيل الفيديو</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`p-1.5 sm:p-2 rounded-xl border transition cursor-pointer ${
                  isMuted 
                    ? 'bg-rose-500/20 border-rose-500/40 text-rose-300' 
                    : 'bg-slate-800/80 border-slate-700 text-slate-300 hover:text-white'
                }`}
                title={isMuted ? 'إلغاء كتم الصوت' : 'كتم الصوت'}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Hidden stream iframe processing WebRTC audio */}
          <div className="w-0 h-0 overflow-hidden opacity-0 pointer-events-none">
            <iframe
              src={viewUrl}
              title="Teacher Live Audio Stream"
              allow="autoplay; microphone"
              className="w-1 h-1"
            />
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // --- FULLSCREEN MODE (ABSOLUTE 100% FULL-BLEED ZERO-MARGIN OVERLAY) ---
  // ==========================================
  if (displayMode === 'fullscreen') {
    return (
      <div 
        onContextMenu={(e) => e.preventDefault()}
        dir="rtl"
        className="fixed inset-0 z-50 w-screen h-screen bg-black overflow-hidden select-none"
      >
        {/* Floating Top Controls Overlay - No height push, zero wasted margin */}
        <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between pointer-events-none">
          {/* Pulsing Live Dot Badge */}
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 pointer-events-auto shadow-lg">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50"></span>
            <span className="text-[11px] font-bold text-white/90">مباشر</span>
          </div>

          {/* Overlay Action Buttons */}
          <div className="flex items-center gap-1.5 pointer-events-auto">
            {/* Rotate Button for Horizontal / Landscape View (Zero Margin Geometrical Fit) */}
            <button
              type="button"
              onClick={() => setIsLandscapeRotate(!isLandscapeRotate)}
              className={`p-2 rounded-xl backdrop-blur-md border text-xs font-bold transition flex items-center gap-1 cursor-pointer shadow-lg ${
                isLandscapeRotate 
                  ? 'bg-amber-500 text-slate-950 border-amber-400' 
                  : 'bg-black/60 text-slate-300 hover:text-white border-white/10'
              }`}
              title={isLandscapeRotate ? 'العودة للوضع الرأسي' : 'تدوير الشاشة أفقياً (كامل الشاشة)'}
            >
              <RotateCw className="w-4 h-4" />
            </button>

            {/* Quick Unfreeze / Reload Button */}
            <button
              type="button"
              onClick={() => setReloadKey(k => k + 1)}
              className="p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer shadow-lg"
              title="إنعاش البث في حال تجمد الصورة على الجوال"
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Battery Saver: Audio-only toggle */}
            <button
              type="button"
              onClick={() => setStudentAudioOnly(true)}
              className="p-2 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer shadow-lg"
              title="توفير البطارية (صوت فقط 🎙️)"
            >
              <Mic className="w-4 h-4 text-indigo-400" />
            </button>

            {/* Exit Fullscreen */}
            <button
              type="button"
              onClick={handleExitFullscreen}
              className="p-2 rounded-xl bg-rose-600/90 hover:bg-rose-500 text-white text-xs font-bold transition cursor-pointer shadow-lg"
              title="تصغير الشاشة"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 
          Video Frame Container:
          - If isLandscapeRotate is false: 100% full screen w-full h-full absolute inset-0
          - If isLandscapeRotate is true: exact geometrical cover w-[100vh] h-[100vw] rotate-90 origin-center
            matching mobile height and width with zero side margins!
        */}
        <div className="absolute inset-0 w-full h-full bg-black flex items-center justify-center overflow-hidden">
          <div className={
            isLandscapeRotate
              ? 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[100vh] h-[100vw] rotate-90 origin-center bg-black'
              : 'w-full h-full'
          }>
            <iframe
              key={`stream-iframe-${reloadKey}`}
              src={viewUrl}
              title="Teacher Live Video Stream Fullscreen"
              allow="camera; microphone; autoplay; playsinline; fullscreen; picture-in-picture"
              className="w-full h-full border-0 block"
            />
          </div>
        </div>

        {/* Continuous Arabic Live Subtitles Overlay in Fullscreen */}
        {streamState?.enableSubtitles && streamState?.liveCaption && isCaptionFresh && (
          <div className="absolute bottom-6 sm:bottom-8 left-4 right-4 z-40 flex justify-center pointer-events-none">
            <div className="max-w-[90%] bg-black/85 backdrop-blur-md text-amber-300 font-bold px-4 py-2 rounded-2xl border border-amber-500/40 text-xs sm:text-sm shadow-2xl text-center leading-relaxed animate-in fade-in zoom-in-95 duration-150">
              <span className="text-amber-400 font-black ml-1.5">🎙️</span>
              <span>{streamState.liveCaption}</span>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ==========================================
  // --- INLINE MODES: BANNER (DOCKED TOP) & SPLIT ---
  // ==========================================
  const isBanner = displayMode === 'banner';
  const isSplit = displayMode === 'split';

  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      dir="rtl"
      className={
        isBanner
          ? 'w-full mb-2 bg-slate-900/95 border border-amber-500/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md'
          : 'w-full my-3 bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md'
      }
    >
      {/* Control Header Bar: Minimalist with NO TEXT - Only Pulsing Dot and Single Dropdown Button */}
      <div className={`flex items-center justify-between border-b border-slate-800/80 ${
        isBanner 
          ? 'px-2 py-1 bg-slate-950/80 text-white' 
          : 'px-3 py-1.5 bg-slate-950/70 text-white'
      }`}>
        {/* Pulsing Live Dot Only */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse shadow-sm shadow-rose-500/50"></span>
        </div>

        {/* Action Controls & Single Dropdown Mode Selector */}
        <div className="flex items-center gap-1.5 relative" ref={menuRef}>
          {/* Quick Refresh if needed */}
          <button
            type="button"
            onClick={() => setReloadKey(k => k + 1)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
            title="إنعاش البث"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          {/* Student Battery Saver: Audio-only toggle */}
          <button
            type="button"
            onClick={() => setStudentAudioOnly(true)}
            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition cursor-pointer"
            title="توفير البطارية والبيانات (صوت فقط 🎙️)"
          >
            <Mic className="w-3.5 h-3.5 text-indigo-400" />
          </button>

          {/* SINGLE DROPDOWN BUTTON FOR DISPLAY MODES */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
              className="p-1.5 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-400 hover:text-amber-300 text-xs font-bold transition flex items-center gap-1 border border-slate-700/80 cursor-pointer shadow-sm"
              title="تغيير وضع العرض"
            >
              {isBanner ? (
                <PanelTop className="w-3.5 h-3.5" />
              ) : (
                <Columns className="w-3.5 h-3.5" />
              )}
              <ChevronDown className="w-3 h-3 text-slate-400" />
            </button>

            {/* Floating Popup Menu */}
            {isModeMenuOpen && (
              <div className="absolute left-0 mt-1.5 w-36 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl py-1 z-50 text-xs text-right animate-in fade-in zoom-in-95 duration-150">
                <button
                  type="button"
                  onClick={() => handleSelectMode('banner')}
                  className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-800 transition cursor-pointer ${
                    isBanner ? 'text-amber-400 font-bold bg-amber-400/10' : 'text-slate-300'
                  }`}
                >
                  <PanelTop className="w-3.5 h-3.5" />
                  <span>شريط علوي</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('split')}
                  className={`w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-800 transition cursor-pointer ${
                    isSplit ? 'text-amber-400 font-bold bg-amber-400/10' : 'text-slate-300'
                  }`}
                >
                  <Columns className="w-3.5 h-3.5" />
                  <span>عرض مدمج</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectMode('fullscreen')}
                  className="w-full px-3 py-2 flex items-center gap-2 hover:bg-slate-800 transition cursor-pointer text-slate-300"
                >
                  <Fullscreen className="w-3.5 h-3.5" />
                  <span>كامل الشاشة</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 
        Video Frame:
        - Banner: Fixed height container (h-20 sm:h-28 md:h-36).
          Inner container is h-full aspect-video mx-auto, so the ENTIRE 16:9 frame scales down completely
          WITHOUT ANY CROPPING of top or bottom!
        - Split: aspect-video w-full
      */}
      <div className={`relative bg-slate-950 w-full flex items-center justify-center overflow-hidden ${
        isBanner 
          ? 'h-20 sm:h-28 md:h-36 py-1 px-2' 
          : 'aspect-video'
      }`}>
        <div className={
          isBanner 
            ? 'h-full aspect-video rounded-xl overflow-hidden shadow-lg border border-slate-800 bg-black flex items-center justify-center' 
            : 'w-full h-full'
        }>
          <iframe
            key={`stream-iframe-${reloadKey}`}
            src={viewUrl}
            title="Teacher Live Video Stream"
            allow="camera; microphone; autoplay; playsinline; fullscreen; picture-in-picture"
            className="w-full h-full border-0 block"
          />
        </div>

        {/* Continuous Arabic Live Subtitles Overlay (Docked Banner & Split) */}
        {streamState?.enableSubtitles && streamState?.liveCaption && isCaptionFresh && (
          <div className="absolute bottom-2 left-2 right-2 z-30 flex justify-center pointer-events-none">
            <div className="max-w-[95%] bg-black/85 backdrop-blur-md text-amber-300 font-bold px-3 py-1 rounded-xl border border-amber-500/40 text-[11px] sm:text-xs shadow-xl text-center truncate animate-in fade-in duration-150">
              <span className="text-amber-400 font-black ml-1">🎙️</span>
              <span>{streamState.liveCaption}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

