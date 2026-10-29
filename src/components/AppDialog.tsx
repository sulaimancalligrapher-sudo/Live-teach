import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, CheckCircle2, HelpCircle, Info, X, AlertTriangle } from 'lucide-react';

export type DialogType = 'info' | 'success' | 'warning' | 'danger';

export interface DialogOptions {
  title?: string;
  message: string;
  type?: DialogType;
  confirmText?: string;
  cancelText?: string;
  isConfirm?: boolean;
}

interface ActiveDialog extends DialogOptions {
  id: string;
  resolve: (value: boolean) => void;
}

// Global dispatcher without needing deeply nested props
type DialogListener = (dialog: ActiveDialog | null) => void;
let globalListener: DialogListener | null = null;

export function showAppAlert(
  message: string,
  title?: string,
  type: DialogType = 'info'
): Promise<void> {
  return new Promise((resolve) => {
    if (!globalListener) {
      // Fallback if not mounted
      window.alert(`${title ? title + '\n\n' : ''}${message}`);
      resolve();
      return;
    }
    globalListener({
      id: Math.random().toString(),
      title: title || (type === 'success' ? 'تمت العملية بنجاح' : type === 'danger' ? 'تنبيه خطأ' : 'تنبيه'),
      message,
      type,
      confirmText: 'حسناً',
      isConfirm: false,
      resolve: () => resolve(),
    });
  });
}

export function showAppConfirm(
  message: string,
  title?: string,
  type: DialogType = 'warning',
  confirmText = 'نعم، استمرار',
  cancelText = 'إلغاء'
): Promise<boolean> {
  return new Promise((resolve) => {
    if (!globalListener) {
      // Fallback if not mounted
      const res = window.confirm(`${title ? title + '\n\n' : ''}${message}`);
      resolve(res);
      return;
    }
    globalListener({
      id: Math.random().toString(),
      title: title || 'تأكيد الإجراء',
      message,
      type,
      confirmText,
      cancelText,
      isConfirm: true,
      resolve,
    });
  });
}

export default function AppDialogContainer() {
  const [currentDialog, setCurrentDialog] = useState<ActiveDialog | null>(null);

  useEffect(() => {
    globalListener = (dialog) => {
      setCurrentDialog(dialog);
    };
    return () => {
      globalListener = null;
    };
  }, []);

  const handleClose = (value: boolean) => {
    if (currentDialog) {
      currentDialog.resolve(value);
      setCurrentDialog(null);
    }
  };

  if (!currentDialog) return null;

  const isDanger = currentDialog.type === 'danger';
  const isWarning = currentDialog.type === 'warning';
  const isSuccess = currentDialog.type === 'success';

  return (
    <AnimatePresence>
      <div 
        className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-sm"
        dir="rtl"
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            handleClose(false);
          }
        }}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 15 }}
          transition={{ type: 'spring', damping: 25, stiffness: 320 }}
          className="w-full max-w-md bg-slate-900 border border-slate-700/80 rounded-3xl p-6 shadow-2xl relative overflow-hidden text-right"
        >
          {/* Top highlight bar */}
          <div
            className={`absolute top-0 right-0 left-0 h-1.5 ${
              isDanger
                ? 'bg-rose-500'
                : isWarning
                ? 'bg-amber-500'
                : isSuccess
                ? 'bg-emerald-500'
                : 'bg-indigo-500'
            }`}
          />

          <div className="flex items-start gap-4 mb-4">
            {/* Icon */}
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-inner ${
                isDanger
                  ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                  : isWarning
                  ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                  : isSuccess
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                  : 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30'
              }`}
            >
              {isDanger ? (
                <AlertCircle className="w-6 h-6" />
              ) : isWarning ? (
                <AlertTriangle className="w-6 h-6" />
              ) : isSuccess ? (
                <CheckCircle2 className="w-6 h-6" />
              ) : (
                <Info className="w-6 h-6" />
              )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0 pt-0.5">
              <h3 className="text-base font-black text-slate-100 leading-snug">
                {currentDialog.title}
              </h3>
              <p className="text-xs sm:text-sm text-slate-300 font-semibold mt-2 leading-relaxed whitespace-pre-line">
                {currentDialog.message}
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2.5 pt-3 border-t border-slate-800">
            <button
              type="button"
              autoFocus
              onClick={() => handleClose(true)}
              className={`flex-1 py-3 px-4 rounded-xl font-black text-xs sm:text-sm transition-all shadow-lg cursor-pointer flex items-center justify-center gap-2 active:scale-95 ${
                isDanger
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-rose-600/30'
                  : isWarning
                  ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-amber-500/30'
                  : isSuccess
                  ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-600/30'
                  : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
              }`}
            >
              <span>{currentDialog.confirmText || 'حسناً'}</span>
            </button>

            {currentDialog.isConfirm && (
              <button
                type="button"
                onClick={() => handleClose(false)}
                className="px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 hover:text-white font-bold text-xs sm:text-sm transition-all cursor-pointer border border-slate-700 active:scale-95"
              >
                <span>{currentDialog.cancelText || 'إلغاء'}</span>
              </button>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
