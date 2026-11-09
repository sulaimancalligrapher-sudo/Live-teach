import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Volume2, VolumeX, Maximize2, Minimize2, Radio, 
  Mic, Video, Sparkles, ChevronDown, ChevronUp, X
} from 'lucide-react';
import { LiveStreamConfig } from '../types';
import { useLanguage } from '../translations';

interface LiveFloatingStreamPlayerProps {
  streamState?: LiveStreamConfig | null;
  isQuestionActive?: boolean;
}

export default function LiveFloatingStreamPlayer({
  streamState,
  isQuestionActive = false,
}: LiveFloatingStreamPlayerProps) {
  const { t } = useLanguage();
  const [isManualPip, setIsManualPip] = useState<boolean | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState<number>(1.0);
  const [isAudioCardCollapsed, setIsAudioCardCollapsed] = useState(false);

  // If stream is inactive or no streamId, unmount completely (free WebRTC connections)
  if (!streamState || !streamState.isActive || !streamState.streamId) {
    return null;
  }

  // Determine effective PIP mode:
  // If user explicitly chose PIP or Expand, use that; otherwise auto-PIP when question is active
  const isPip = isManualPip !== null ? isManualPip : Boolean(isQuestionActive);

  // Construct secure VDO.Ninja URL
  const viewUrl = `https://vdo.ninja/?view=${encodeURIComponent(streamState.streamId)}&cleanoutput&autostart&playsinline&transparent=0${
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
  // --- VIDEO MODE: NORMAL VS FLOATING PIP ---
  // ==========================================

  // 1. FLOATING PICTURE-IN-PICTURE (PIP) MODE
  if (isPip) {
    return (
      <motion.div
        drag
        dragConstraints={{ left: -250, right: 250, top: -400, bottom: 200 }}
        initial={{ scale: 0.8, opacity: 0, y: 30 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.8, opacity: 0, y: 30 }}
        className="fixed bottom-20 right-3 sm:bottom-6 sm:right-6 z-40 w-44 sm:w-64 bg-slate-950/95 border-2 border-amber-500/60 rounded-2xl shadow-2xl overflow-hidden backdrop-blur-xl group select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        {/* PIP Mini Header */}
        <div className="bg-slate-900/90 px-2.5 py-1.5 flex items-center justify-between border-b border-slate-800 text-[10px] cursor-grab active:cursor-grabbing">
          <div className="flex items-center gap-1.5 font-bold text-white">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse"></span>
            <span>بث المعلم</span>
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setIsManualPip(false)}
              className="p-1 hover:bg-slate-800 text-slate-300 hover:text-white rounded transition cursor-pointer"
              title="تكبير المشغل"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Video Container */}
        <div className="aspect-video w-full bg-black relative">
          <iframe
            src={viewUrl}
            title="Teacher Live Video Stream PIP"
            allow="autoplay; fullscreen"
            className="w-full h-full border-0"
          />
        </div>
      </motion.div>
    );
  }

  // 2. NORMAL EMBEDDED MODE
  return (
    <div 
      className="w-full my-3"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="bg-slate-900/90 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl backdrop-blur-md">
        {/* Top Control Bar */}
        <div className="px-4 py-2 bg-slate-950/70 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span>
            <span className="text-xs font-black text-white">بث مباشر من المعلم 🎥</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setIsManualPip(true)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              title="تصغير إلى نافذة عائمة"
            >
              <Minimize2 className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">تصغير عائم</span>
            </button>
          </div>
        </div>

        {/* Video Frame */}
        <div className="aspect-video w-full bg-black relative">
          <iframe
            src={viewUrl}
            title="Teacher Live Video Stream"
            allow="autoplay; fullscreen"
            className="w-full h-full border-0"
          />
        </div>
      </div>
    </div>
  );
}
