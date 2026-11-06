import React, { useState, useEffect } from 'react';
import { MessageSquare, ArrowLeft, X, ExternalLink, ShieldCheck } from 'lucide-react';
import { 
  subscribeToLiveSession, 
  replyToStudentMessage, 
  deleteStudentMessage, 
  clearAllStudentMessages, 
  toggleShowChatInRoom,
  sendTeacherBroadcastMessage
} from '../api';
import { LiveSessionState } from '../types';
import LiveChatModal from './LiveChatModal';

interface StandaloneChatRoomProps {
  onBack?: () => void;
}

export default function StandaloneChatRoom({ onBack }: StandaloneChatRoomProps) {
  const [sessionState, setSessionState] = useState<LiveSessionState | null>(null);

  useEffect(() => {
    const unsub = subscribeToLiveSession((state) => {
      setSessionState(state);
    });
    return () => unsub();
  }, []);

  const handleClose = () => {
    if (typeof window !== 'undefined' && window.opener) {
      window.close();
    } else if (onBack) {
      onBack();
    } else {
      window.location.href = window.location.origin + window.location.pathname;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans" dir="rtl">
      {/* Standalone Header */}
      <header className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 flex items-center justify-center">
            <MessageSquare className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-black text-slate-100 flex items-center gap-2">
              <span>غرفة المحادثة والتواصل المباشر مع الطلاب</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-bold">
                نافذة مستقلة
              </span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              {(sessionState?.messages || []).length} رسائل مسجلة • {(sessionState?.connectedStudents || []).length} طلاب متصلون
            </p>
          </div>
        </div>

        <button
          onClick={handleClose}
          className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
          <span>إغلاق النافذة</span>
        </button>
      </header>

      {/* Main Chat Body */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col">
        <div className="flex-1 bg-slate-900/80 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
          <LiveChatModal
            isOpen={true}
            onClose={handleClose}
            messages={sessionState?.messages || []}
            connectedStudents={sessionState?.connectedStudents || []}
            onReply={async (messageId, replyText, replyType) => {
              await replyToStudentMessage(messageId, replyText, replyType);
            }}
            onDeleteMessage={async (messageId) => {
              await deleteStudentMessage(messageId);
            }}
            onClearAll={async () => {
              await clearAllStudentMessages();
            }}
            showChatInRoom={sessionState?.showChatInRoom || false}
            onToggleShowInRoom={async (show) => {
              await toggleShowChatInRoom(show);
            }}
            isTeacher={true}
            onSendTeacherBroadcast={async (text, recipientStudent, recipientSheet) => {
              await sendTeacherBroadcastMessage({ text, recipientStudent, recipientSheet });
            }}
          />
        </div>
      </main>
    </div>
  );
}
