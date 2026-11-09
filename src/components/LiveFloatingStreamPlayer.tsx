import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Volume2, VolumeX, Maximize2, Minimize2, Radio, 
  Mic, Video, Sparkles, X, Columns, Fullscreen,
  Move
} from 'lucide-react';
import { LiveStreamConfig } from '../types';
import { useLanguage } from '../translations';

interface LiveFloatingStreamPlayerProps {
  streamState?: LiveStreamConfig | null;
  isQuestionActive?: boolean;
}

export type StreamDisplayMode = 'pip' | 'split' | 'fullscreen';

export default function LiveFloatingStreamPlayer({
  streamState,
  isQuestionActive = false,
}: LiveFloatingStreamPlayerProps) {
  const { t } = useLanguage();
  
  // Display mode: 'split' (inline in page), 'pip' (floating corner), 'fullscreen' (100% screen)
  const [displayMode, setDisplayMode] = useState<StreamDisplayMode>('split');
  const [isMuted, setIsMuted] = useState(false);
  const prevQuestionActiveRef = useRef(isQuestionActive);

  // Auto-switch to 'pip' when a question becomes active so questions are never blocked!
  useEffect(() => {
    if (isQuestionActive && !prevQuestionActiveRef.current) {
      setDisplayMode('pip');
    }
    prevQuestionActiveRef.current = isQuestionActive;
  }, [isQuestionActive]);

  // If stream is inactive or no streamId, unmount completely (free WebRTC connections)
  if (!streamState || !streamState.isActive || !streamState.streamId) {
    return null;
  }

  // Construct secure, mobile-optimized VDO.Ninja URL
  // Parameters:
  // &cleanoutput: removes UI buttons
  // &autostart: auto-connects WebRTC
  // &playsinline: prevents iOS fullscreen takeover
  // &webautoplay: ensures mobile WebRTC audio/video plays automatically
  // &scale=100: responsive aspect scaling on mobile
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(streamState.streamId)}&cleanoutput&autostart&playsinline&webautoplay&transparent=0&scale=100${
    streamState.password ? `&password=${encodeURIComponent(streamState.password)}` : ''
  }${streamState.mode === 'audio' ? '&novideo' : ''}${streamState.useMeshcast ? '&meshcast' : ''}`;

  // ==========================================
  // --- AUDIO ONLY MODE ---
  // ==========================================
  if (streamState.mode === 'audio') {
    return (
      <div 
        className="w-full my-3"
        onContextMenu={(e) => e.preventDefault()}
        dir="rtl"
      >
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-2xl p-3.5 shadow-xl backdrop-blur-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-400 shadow-inner">
                <Mic className="w-5 h-5 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black text-white">
                    {t('student_stream_listening', 'بث صوتي مباشر من المعلم 🎙️')}
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white animate-pulse">
                    مباشر 🔴
                  </span>
                </div>
                {/* Audio wave visualizer simulation */}
                <div className="flex items-center gap-1 mt-1.5 h-3">
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_100ms] h-2"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_300ms] h-3"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_200ms] h-1.5"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_400ms] h-3"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_150ms] h-2.5"></span>
                  <span className="w-1 bg-indigo-400 rounded-full animate-[bounce_1s_infinite_250ms] h-1"></span>
                  <span className="text-[10px] text-indigo-300 font-bold mr-1.5">صوت عالي الدقة</span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setIsMuted(!isMuted)}
                className={`p-2 rounded-xl border transition cursor-pointer ${
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

          {/* Hidden stream iframe that processes WebRTC audio */}
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
  // --- VIDEO MODE (SINGLE PERSISTENT IFRAME WITH 3 DISPLAY MODES) ---
  // ==========================================

  // Determine container styling according to mode
  const isFullscreen = displayMode === 'fullscreen';
  const isPip = displayMode === 'pip';
  const isSplit = displayMode === 'split';

  return (
    <>
      {/* 
        CRITICAL ARCHITECTURAL DESIGN:
        We render the iframe inside a single wrapper hierarchy without ever unmounting it.
        This prevents iOS Safari / Android Chrome from killing the WebRTC PeerConnection on mode change.
      */}
      <div 
        onContextMenu={(e) => e.preventDefault()}
        dir="rtl"
        className={
          isFullscreen
            ? 'fixed inset-0 z-50 w-screen h-screen bg-black flex flex-col justify-between overflow-hidden select-none'
            : isPip
            ? 'fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-40 w-52 sm:w-72 bg-slate-950/95 border-2 border-amber-500/80 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl select-none animate-in fade-in zoom-in-95 duration-200'
            : 'w-full my-3 bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md'
        }
      >
        {/* Dynamic Control Bar */}
        <div className={`flex items-center justify-between border-b border-slate-800/80 transition-all ${
          isFullscreen 
            ? 'p-3 bg-slate-950/80 backdrop-blur-md text-white' 
            : isPip 
            ? 'px-2.5 py-1.5 bg-slate-900/90 text-white text-[11px]' 
            : 'px-4 py-2 bg-slate-950/70 text-white text-xs'
        }`}>
          {/* Status Label */}
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="font-black text-white">
              {isFullscreen ? 'بث مباشر من المعلم (ملء الشاشة)' : isPip ? 'بث المعلم' : 'بث مباشر من المعلم 🎥'}
            </span>
          </div>

          {/* 3 Mode Control Buttons: [صغير عائم] [تقسيم شاشة] [تكبير كامل الشاشة] */}
          <div className="flex items-center gap-1">
            {/* 1. PIP Mode Button (صغير عائم) */}
            <button
              type="button"
              onClick={() => setDisplayMode('pip')}
              className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                isPip 
                  ? 'bg-amber-500 text-slate-950 shadow-sm' 
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
              }`}
              title="تصغير إلى نافذة عائمة في الزاوية"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              {!isPip && <span className="hidden sm:inline">صغير عائم</span>}
            </button>

            {/* 2. Split Screen Mode Button (تقسيم شاشة) */}
            <button
              type="button"
              onClick={() => setDisplayMode('split')}
              className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                isSplit 
                  ? 'bg-amber-500 text-slate-950 shadow-sm' 
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
              }`}
              title="عرض مدمج مع الشاشة والأسئلة"
            >
              <Columns className="w-3.5 h-3.5" />
              {!isPip && <span className="hidden sm:inline">تقسيم شاشة</span>}
            </button>

            {/* 3. Fullscreen Mode Button (تكبير كامل الشاشة) */}
            <button
              type="button"
              onClick={() => setDisplayMode(isFullscreen ? 'split' : 'fullscreen')}
              className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
                isFullscreen 
                  ? 'bg-rose-600 hover:bg-rose-500 text-white' 
                  : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
              }`}
              title={isFullscreen ? 'تصغير الشاشة' : 'تكبير كامل الشاشة'}
            >
              {isFullscreen ? (
                <>
                  <X className="w-4 h-4" />
                  <span className="text-xs">تصغير ✕</span>
                </>
              ) : (
                <>
                  <Fullscreen className="w-3.5 h-3.5" />
                  {!isPip && <span className="hidden sm:inline">كامل الشاشة</span>}
                </>
              )}
            </button>
          </div>
        </div>

        {/* Video Frame: Responsive 16:9 on split/pip, full viewport on fullscreen */}
        <div className={`relative bg-black w-full flex items-center justify-center ${
          isFullscreen ? 'flex-1 h-full' : 'aspect-video'
        }`}>
          <iframe
            src={viewUrl}
            title="Teacher Live Video Stream"
            allow="camera; microphone; autoplay; playsinline; fullscreen; picture-in-picture"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </>
  );
}
