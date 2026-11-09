import React, { useState, useEffect, useRef } from 'react';
import { 
  Volume2, VolumeX, Maximize2, Minimize2, Radio, 
  Mic, Video, Sparkles, X, Columns, Fullscreen,
  PanelTopClose, PanelTop
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
  // - 'split': normal inline 16:9 player in page
  // - 'fullscreen': 100% full screen video
  const [displayMode, setDisplayMode] = useState<StreamDisplayMode>('split');
  const [isMuted, setIsMuted] = useState(false);
  
  // Remember previous mode before question started to restore it automatically afterwards
  const previousModeRef = useRef<StreamDisplayMode>('split');
  const hadQuestionActiveRef = useRef(false);

  // Auto-switch to 'banner' when question triggers, and restore previous mode when question ends!
  useEffect(() => {
    if (isQuestionActive) {
      if (!hadQuestionActiveRef.current) {
        hadQuestionActiveRef.current = true;
        // Save current mode (e.g. 'fullscreen' or 'split') before docking
        if (displayMode !== 'banner') {
          previousModeRef.current = displayMode;
        }
        setDisplayMode('banner');
      }
    } else {
      if (hadQuestionActiveRef.current) {
        hadQuestionActiveRef.current = false;
        // When question is completed (and answer reveal is finished), return to lesson explanation:
        // Automatically restore the mode the student was previously enjoying (e.g. fullscreen)!
        if (previousModeRef.current && previousModeRef.current !== 'banner') {
          setDisplayMode(previousModeRef.current);
        } else {
          setDisplayMode('split');
        }
      }
    }
  }, [isQuestionActive, displayMode]);

  // If stream is inactive or no streamId, unmount completely (free WebRTC connections)
  if (!streamState || !streamState.isActive || !streamState.streamId) {
    return null;
  }

  // Construct secure, mobile-optimized VDO.Ninja URL
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
  // --- VIDEO MODE (PERSISTENT IFRAME: BANNER, SPLIT, FULLSCREEN) ---
  // ==========================================
  const isFullscreen = displayMode === 'fullscreen';
  const isBanner = displayMode === 'banner';
  const isSplit = displayMode === 'split';

  return (
    <div 
      onContextMenu={(e) => e.preventDefault()}
      dir="rtl"
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 w-screen h-screen bg-black flex flex-col justify-between overflow-hidden select-none'
          : isBanner
          ? 'w-full mb-3 bg-slate-900/95 border border-amber-500/60 rounded-2xl overflow-hidden shadow-xl backdrop-blur-md transition-all duration-300'
          : 'w-full my-3 bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md transition-all duration-300'
      }
    >
      {/* Control Header */}
      <div className={`flex items-center justify-between border-b border-slate-800/80 transition-all ${
        isFullscreen 
          ? 'p-3 bg-slate-950/80 backdrop-blur-md text-white' 
          : isBanner 
          ? 'px-3 py-1.5 bg-slate-950/80 text-white text-[11px]' 
          : 'px-4 py-2 bg-slate-950/70 text-white text-xs'
      }`}>
        {/* Status Label */}
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
          <span className="font-black text-white">
            {isFullscreen 
              ? 'بث مباشر من المعلم (ملء الشاشة)' 
              : isBanner 
              ? 'بث المعلم (شريط علوي مع السؤال) 🎥' 
              : 'بث مباشر من المعلم 🎥'}
          </span>
        </div>

        {/* 3 Display Mode Buttons: [شريط علوي] [تقسيم شاشة] [كامل الشاشة] */}
        <div className="flex items-center gap-1">
          {/* 1. Banner Strip Button (شريط علوي) */}
          <button
            type="button"
            onClick={() => {
              previousModeRef.current = displayMode;
              setDisplayMode('banner');
            }}
            className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              isBanner 
                ? 'bg-amber-500 text-slate-950 shadow-sm' 
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
            title="تصغير إلى شريط علوي صغير لتسهيل إجابة السؤال"
          >
            <PanelTop className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">شريط علوي</span>
          </button>

          {/* 2. Split Screen Button (تقسيم شاشة) */}
          <button
            type="button"
            onClick={() => {
              previousModeRef.current = displayMode;
              setDisplayMode('split');
            }}
            className={`p-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer ${
              isSplit 
                ? 'bg-amber-500 text-slate-950 shadow-sm' 
                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
            title="عرض مدمج بحجم عادي"
          >
            <Columns className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">تقسيم شاشة</span>
          </button>

          {/* 3. Fullscreen Button (كامل الشاشة) */}
          <button
            type="button"
            onClick={() => {
              if (isFullscreen) {
                setDisplayMode(isQuestionActive ? 'banner' : 'split');
              } else {
                previousModeRef.current = displayMode;
                setDisplayMode('fullscreen');
              }
            }}
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
                <span className="hidden sm:inline">كامل الشاشة</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 
        Video Frame:
        - Fullscreen: flex-1 h-full
        - Banner: compact height h-32 sm:h-44 md:h-52 w-full (Leaves entire bottom area for question & options!)
        - Split: aspect-video w-full
      */}
      <div className={`relative bg-black w-full flex items-center justify-center ${
        isFullscreen 
          ? 'flex-1 h-full' 
          : isBanner 
          ? 'h-32 sm:h-44 md:h-52' 
          : 'aspect-video'
      }`}>
        <iframe
          src={viewUrl}
          title="Teacher Live Video Stream"
          allow="camera; microphone; autoplay; playsinline; fullscreen; picture-in-picture"
          className="w-full h-full border-0"
        />
      </div>
    </div>
  );
}
