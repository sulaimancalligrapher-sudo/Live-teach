import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Mic, MicOff, Eye, EyeOff, ArrowUp, ArrowDown, ExternalLink,
  RefreshCw, Save, Sparkles, Plus, Trash2, ClipboardPaste,
  FileSpreadsheet, CheckCircle2, AlertCircle, Play, Eraser,
  BookOpen, Code2, Copy, Check, ArrowLeft, ChevronRight, ChevronLeft,
  Radio, ListFilter
} from 'lucide-react';
import { LiveSessionState, ScriptSubtitleLine } from '../types';
import {
  subscribeToLiveSession,
  subscribeToScriptSubtitles,
  getScriptSubtitles,
  saveScriptSubtitles,
  updateLiveSubtitleState,
  setActiveScriptLine,
  fetchLiveSubtitlesFromSheet,
  saveLiveSubtitlesToSheet,
  translateBatchWithAi,
} from '../api';
import { matchSpokenTranscriptToScript } from '../lib/scriptMatcher';
import { showAppConfirm } from './AppDialog';

interface ScriptPrompterPanelProps {
  isStandalone?: boolean;
  onBack?: () => void;
}

const APPS_SCRIPT_SNIPPET = `// أضف هاتين الدالتين داخل ملف Code.gs في Google Apps Script ثم انشر نسخة جديدة (New Deployment)
// اسم الورقة المطلوبة: Live_Subtitles
// الأعمدة: A: lessonTitle | B: page | C: arabic | D: th | E: en

function getLiveSubtitlesSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Live_Subtitles');
  if (!sheet) {
    sheet = ss.insertSheet('Live_Subtitles');
    sheet.appendRow(['lessonTitle', 'page', 'arabic', 'th', 'en']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function handleGetLiveSubtitles_() {
  var sheet = getLiveSubtitlesSheet_();
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) {
    var r = values[i];
    var ar = String(r[2] || '').trim();
    var th = String(r[3] || '').trim();
    var en = String(r[4] || '').trim();
    if (!ar && !th && !en) continue;
    rows.push({
      id: 'sheet_' + (i + 1),
      lessonTitle: String(r[0] || '').trim(),
      page: Number(r[1]) || 1,
      order: i - 1,
      arabic: ar,
      th: th,
      en: en
    });
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true, data: rows }))
    .setMimeType(ContentService.MimeType.JSON);
}

function handleSaveLiveSubtitles_(payload) {
  var sheet = getLiveSubtitlesSheet_();
  var lines = payload.lines || [];
  sheet.clearContents();
  sheet.appendRow(['lessonTitle', 'page', 'arabic', 'th', 'en']);
  if (lines.length > 0) {
    var rows = lines.map(function(l) {
      return [
        String(l.lessonTitle || ''),
        Number(l.page) || 1,
        String(l.arabic || ''),
        String(l.th || ''),
        String(l.en || '')
      ];
    });
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'تم حفظ ' + lines.length + ' سطر في Live_Subtitles' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// داخل doGet(e) أضف:
// if (action === 'getLiveSubtitles') return handleGetLiveSubtitles_();
// داخل doPost(e) أضف:
// if (action === 'getLiveSubtitles') return handleGetLiveSubtitles_();
// if (action === 'saveLiveSubtitles') return handleSaveLiveSubtitles_(data);`;

export default function ScriptPrompterPanel({
  isStandalone = false,
  onBack,
}: ScriptPrompterPanelProps) {
  const [subTab, setSubTab] = useState<'prompter' | 'editor'>('prompter');
  const [sessionState, setSessionState] = useState<LiveSessionState | null>(null);
  const [lines, setLines] = useState<ScriptSubtitleLine[]>([]);
  const [editorLines, setEditorLines] = useState<ScriptSubtitleLine[]>([]);
  const [hasUnsavedEdits, setHasUnsavedEdits] = useState(false);

  // Page & Lesson Linking
  const [autoFollowPdfPage, setAutoFollowPdfPage] = useState(true);
  const [manualPage, setManualPage] = useState(1);
  const [showAllPages, setShowAllPages] = useState(false);
  const [selectedLessonFilter, setSelectedLessonFilter] = useState<string>('');

  // Speech Recognition State
  const [isListening, setIsListening] = useState(false);
  const [speechError, setSpeechError] = useState<string | null>(null);
  const [lastHeardText, setLastHeardText] = useState<string>('');
  const [lastMatchedKeywords, setLastMatchedKeywords] = useState<string[]>([]);

  // Operations State
  const [isLoadingSheet, setIsLoadingSheet] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTranslatingBatch, setIsTranslatingBatch] = useState(false);
  const [notice, setNotice] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);

  // Bulk Paste Modal & Apps Script Code Toggle
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [pastePage, setPastePage] = useState(1);
  const [pasteLesson, setPasteLesson] = useState('');
  const [pasteReplaceMode, setPasteReplaceMode] = useState(false);
  const [showAppsScriptCode, setShowAppsScriptCode] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Refs for stable SpeechRecognition callbacks
  const recognitionRef = useRef<any>(null);
  const isListeningRef = useRef(false);
  const linesRef = useRef<ScriptSubtitleLine[]>([]);
  const activePageRef = useRef<number>(1);
  const activeLineIdRef = useRef<string>('');
  const activeLessonTitleRef = useRef<string>('');
  const manualOverrideLockUntilRef = useRef<number>(0);
  const interimTimerRef = useRef<number | null>(null);
  const activeRowElRef = useRef<HTMLDivElement | null>(null);

  // Determine effective active PDF page
  const effectivePage = autoFollowPdfPage ? (sessionState?.pdfPage || 1) : manualPage;
  activePageRef.current = effectivePage;
  linesRef.current = lines;
  activeLineIdRef.current = sessionState?.subtitleState?.activeLineId || '';
  activeLessonTitleRef.current = selectedLessonFilter || sessionState?.pdfTitle || '';

  const showToast = useCallback((text: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotice({ text, type });
    window.setTimeout(() => {
      setNotice((prev) => (prev?.text === text ? null : prev));
    }, 4500);
  }, []);

  // Subscribe to real-time live session + Firestore script catalog
  useEffect(() => {
    const unsubSession = subscribeToLiveSession((st) => {
      setSessionState(st);
      if (st?.pdfPage && autoFollowPdfPage) {
        setManualPage(st.pdfPage);
      }
    });

    getScriptSubtitles().then((initial) => {
      if (initial.length > 0) {
        setLines(initial);
        setEditorLines(initial);
      }
    }).catch(() => {});

    const unsubLines = subscribeToScriptSubtitles((incoming) => {
      setLines(incoming);
      if (!hasUnsavedEdits) {
        setEditorLines(incoming);
      }
    });

    return () => {
      unsubSession();
      unsubLines();
    };
  }, [autoFollowPdfPage, hasUnsavedEdits]);

  // Unique lesson titles present in script
  const availableLessons = useMemo(() => {
    const set = new Set<string>();
    lines.forEach((l) => {
      if (l.lessonTitle && l.lessonTitle.trim()) set.add(l.lessonTitle.trim());
    });
    return Array.from(set);
  }, [lines]);

  // Visible lines in Prompter for active page (or all pages if toggled)
  const visiblePrompterLines = useMemo(() => {
    let filtered = lines;
    if (selectedLessonFilter) {
      filtered = filtered.filter((l) => l.lessonTitle === selectedLessonFilter);
    }
    if (!showAllPages) {
      const onPage = filtered.filter((l) => Number(l.page) === Number(effectivePage));
      return onPage;
    }
    return filtered;
  }, [lines, selectedLessonFilter, showAllPages, effectivePage]);

  // Active line object
  const activeLineId = sessionState?.subtitleState?.activeLineId || '';
  const showToStudents = Boolean(sessionState?.subtitleState?.showToStudents);

  const activeLineIndex = useMemo(() => {
    if (!activeLineId) return -1;
    return visiblePrompterLines.findIndex((l) => l.id === activeLineId);
  }, [visiblePrompterLines, activeLineId]);

  // Auto-scroll active line into center view when changed
  useEffect(() => {
    if (activeRowElRef.current) {
      activeRowElRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activeLineId]);

  // Push line helper
  const handleActivateLine = useCallback(
    async (line: ScriptSubtitleLine | null, isManual = true) => {
      if (isManual) {
        // Brief lock so trailing speech buffer doesn't immediately bounce away from teacher's click
        manualOverrideLockUntilRef.current = Date.now() + 1800;
      }
      await setActiveScriptLine(line, {
        activePage: line ? line.page : effectivePage,
        trackingEnabled: isListeningRef.current,
      });
    },
    [effectivePage]
  );

  const handleStepLine = useCallback(
    async (direction: -1 | 1) => {
      if (visiblePrompterLines.length === 0) return;
      let targetIdx = 0;
      if (activeLineIndex === -1) {
        targetIdx = direction === 1 ? 0 : visiblePrompterLines.length - 1;
      } else {
        targetIdx = Math.max(
          0,
          Math.min(visiblePrompterLines.length - 1, activeLineIndex + direction)
        );
      }
      await handleActivateLine(visiblePrompterLines[targetIdx], true);
    },
    [visiblePrompterLines, activeLineIndex, handleActivateLine]
  );

  // Toggle visibility for students
  const handleToggleShowToStudents = async () => {
    try {
      await updateLiveSubtitleState({ showToStudents: !showToStudents });
    } catch {
      showToast('تعذر تحديث حالة الإظهار للطلاب', 'error');
    }
  };

  // Run fuzzy matching against spoken text
  const processSpokenTranscript = useCallback(
    async (transcriptText: string) => {
      if (!transcriptText.trim()) return;
      if (Date.now() < manualOverrideLockUntilRef.current) return;

      const result = matchSpokenTranscriptToScript({
        transcript: transcriptText,
        lines: linesRef.current,
        activePage: activePageRef.current,
        currentLineId: activeLineIdRef.current,
        activeLessonTitle: activeLessonTitleRef.current,
      });

      if (result.matchedLine && result.matchedLine.id !== activeLineIdRef.current) {
        setLastMatchedKeywords(result.matchedKeywords);
        await setActiveScriptLine(result.matchedLine, {
          activePage: result.matchedLine.page,
          trackingEnabled: true,
        });
      }
    },
    []
  );

  // Start / Stop Continuous Chrome Speech Recognition
  const stopSpeechTracking = useCallback(() => {
    isListeningRef.current = false;
    setIsListening(false);
    if (interimTimerRef.current) {
      window.clearTimeout(interimTimerRef.current);
      interimTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    updateLiveSubtitleState({ trackingEnabled: false }).catch(() => {});
  }, []);

  const startSpeechTracking = useCallback(() => {
    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechError('المتصفح الحالي لا يدعم التعرف التلقائي على الصوت. يرجى استخدام Google Chrome أو Edge، أو التحكم اليدوي بالأزرار.');
      return;
    }

    setSpeechError(null);
    isListeningRef.current = true;
    setIsListening(true);
    updateLiveSubtitleState({ trackingEnabled: true }).catch(() => {});

    const createAndStart = () => {
      if (!isListeningRef.current) return;
      const rec = new SpeechRec();
      rec.lang = 'ar-SA';
      rec.continuous = true;
      rec.interimResults = true;
      rec.maxAlternatives = 1;

      rec.onresult = (event: any) => {
        let combinedTail = '';
        let hasFinal = false;

        // Gather the latest recognized segments
        const startIdx = Math.max(0, event.results.length - 4);
        for (let i = startIdx; i < event.results.length; i++) {
          const res = event.results[i];
          if (res?.[0]?.transcript) {
            combinedTail += ' ' + res[0].transcript;
          }
          if (res?.isFinal && i >= event.resultIndex) {
            hasFinal = true;
          }
        }

        const cleanTail = combinedTail.trim();
        if (!cleanTail) return;
        setLastHeardText(cleanTail.slice(-110));

        if (hasFinal) {
          if (interimTimerRef.current) {
            window.clearTimeout(interimTimerRef.current);
            interimTimerRef.current = null;
          }
          processSpokenTranscript(cleanTail);
        } else {
          // Debounced interim matching so speaking 2+ keywords jumps smoothly mid-sentence
          if (interimTimerRef.current) {
            window.clearTimeout(interimTimerRef.current);
          }
          interimTimerRef.current = window.setTimeout(() => {
            processSpokenTranscript(cleanTail);
          }, 260);
        }
      };

      rec.onerror = (ev: any) => {
        if (ev?.error === 'not-allowed' || ev?.error === 'service-not-allowed') {
          setSpeechError('تم رفض إذن الميكروفون. يرجى السماح بالوصول للميكروفون من إعدادات المتصفح.');
          stopSpeechTracking();
        }
      };

      rec.onend = () => {
        // Auto-restart loop cleanly while tracking is toggled ON
        if (isListeningRef.current) {
          window.setTimeout(() => {
            if (isListeningRef.current) {
              createAndStart();
            }
          }, 220);
        }
      };

      recognitionRef.current = rec;
      try {
        rec.start();
      } catch {}
    };

    createAndStart();
  }, [processSpokenTranscript, stopSpeechTracking]);

  useEffect(() => {
    return () => {
      if (isListeningRef.current) {
        stopSpeechTracking();
      }
    };
  }, [stopSpeechTracking]);

  // Keyboard Shortcuts in Prompter view (ArrowUp, ArrowDown, Space)
  useEffect(() => {
    if (subTab !== 'prompter') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        handleStepLine(1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        handleStepLine(-1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [subTab, handleStepLine]);

  // Two-Way Sync: Fetch from Live_Subtitles Sheet -> Update Firestore + Editor
  const handlePullFromSheet = async () => {
    setIsLoadingSheet(true);
    try {
      const res = await fetchLiveSubtitlesFromSheet();
      if (res.success) {
        setLines(res.data);
        setEditorLines(res.data);
        setHasUnsavedEdits(false);
        await saveScriptSubtitles(res.data);
        showToast(`تم جلب ومزامنة ${res.data.length} سطر من ورقة Live_Subtitles بنجاح`, 'success');
      } else {
        showToast(res.message || 'تعذر جلب البيانات من الشيت (تأكد من إضافة دالة getLiveSubtitles)', 'error');
      }
    } catch (e: any) {
      showToast(e?.message || 'حدث خطأ أثناء الجلب من الشيت', 'error');
    } finally {
      setIsLoadingSheet(false);
    }
  };

  // Two-Way Sync: Save Editor Lines -> Firestore + Google Sheets
  const handleSaveAndSyncAll = async (targetLines = editorLines) => {
    setIsSaving(true);
    try {
      const normalized = targetLines
        .filter((l) => (l.arabic || l.th || l.en).trim().length > 0)
        .map((l, idx) => ({
          ...l,
          id: l.id || `sub_${Date.now()}_${idx}`,
          page: Math.max(1, Number(l.page) || 1),
          order: idx,
        }));

      await saveScriptSubtitles(normalized);
      setLines(normalized);
      setEditorLines(normalized);
      setHasUnsavedEdits(false);

      // Push to Google Sheets in parallel/sequence
      const sheetRes = await saveLiveSubtitlesToSheet(normalized);
      if (sheetRes.success) {
        showToast(`تم الحفظ والمزامنة (${normalized.length} سطر) في النظام وورقة Google Sheets بنجاح`, 'success');
      } else {
        showToast(`تم الحفظ في النظام مباشرة، ولكن تعذر التحديث بالشيت: ${sheetRes.message}`, 'info');
      }
    } catch (e: any) {
      showToast(e?.message || 'تعذر الحفظ', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  // Batch AI Translate missing Thai / English cells
  const handleAiBatchTranslateMissing = async () => {
    const missing = editorLines.filter(
      (l) => l.arabic.trim() && (!l.th.trim() || !l.en.trim())
    );
    if (missing.length === 0) {
      showToast('جميع الأسطر تحتوي على ترجمة تايلندية وإنجليزية بالفعل!', 'info');
      return;
    }

    setIsTranslatingBatch(true);
    try {
      const updated = [...editorLines];
      // Process in chunks of 15 lines
      for (let i = 0; i < missing.length; i += 15) {
        const chunk = missing.slice(i, i + 15);
        const batchInput = chunk.map((item) => ({ key: item.id, ar: item.arabic }));
        const translatedMap = await translateBatchWithAi(batchInput);

        chunk.forEach((item) => {
          const t = translatedMap[item.id];
          if (t) {
            const idx = updated.findIndex((u) => u.id === item.id);
            if (idx !== -1) {
              updated[idx] = {
                ...updated[idx],
                th: updated[idx].th.trim() ? updated[idx].th : (t.th || ''),
                en: updated[idx].en.trim() ? updated[idx].en : (t.en || ''),
              };
            }
          }
        });
      }

      setEditorLines(updated);
      setHasUnsavedEdits(true);
      showToast(`تمت ترجمة ${missing.length} سطر آلياً! يمكنك مراجعتها ثم الضغط على حفظ ومزامنة.`, 'success');
    } catch (e: any) {
      showToast(e?.message || 'تعذرت الترجمة الآلية', 'error');
    } finally {
      setIsTranslatingBatch(false);
    }
  };

  // Editor Row helpers
  const handleAddEditorRow = () => {
    const newRow: ScriptSubtitleLine = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      lessonTitle: selectedLessonFilter || sessionState?.pdfTitle || '',
      page: effectivePage,
      order: editorLines.length,
      arabic: '',
      th: '',
      en: '',
    };
    setEditorLines((prev) => [...prev, newRow]);
    setHasUnsavedEdits(true);
  };

  const handleUpdateEditorCell = (
    id: string,
    field: keyof ScriptSubtitleLine,
    value: string | number
  ) => {
    setEditorLines((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
    );
    setHasUnsavedEdits(true);
  };

  const handleDeleteEditorRow = async (id: string) => {
    const next = editorLines.filter((r) => r.id !== id);
    setEditorLines(next);
    setHasUnsavedEdits(true);
  };

  const handleClearAllEditorRows = async () => {
    const ok = await showAppConfirm(
      'هل تريد مسح جميع الأسطر من القائمة الحالية؟',
      'مسح السكربت',
      'warning',
      'نعم، مسح الكل'
    );
    if (!ok) return;
    setEditorLines([]);
    setHasUnsavedEdits(true);
  };

  // Bulk Paste Parser (supports TSV copied from Excel/Sheets OR raw multi-line Arabic paragraphs)
  const handleConfirmBulkPaste = () => {
    const rawLines = pasteText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (rawLines.length === 0) return;

    const parsed: ScriptSubtitleLine[] = rawLines.map((raw, idx) => {
      const cols = raw.split('\t').map((c) => c.trim());
      if (cols.length >= 3 && !isNaN(Number(cols[0]))) {
        // Page \t Arabic \t Thai \t English
        return {
          id: `paste_${Date.now()}_${idx}`,
          lessonTitle: pasteLesson.trim(),
          page: Math.max(1, Number(cols[0]) || pastePage),
          order: idx,
          arabic: cols[1] || '',
          th: cols[2] || '',
          en: cols[3] || '',
        };
      } else if (cols.length >= 2) {
        // Arabic \t Thai \t English
        return {
          id: `paste_${Date.now()}_${idx}`,
          lessonTitle: pasteLesson.trim(),
          page: pastePage,
          order: idx,
          arabic: cols[0] || '',
          th: cols[1] || '',
          en: cols[2] || '',
        };
      }
      // Single Arabic sentence per line
      return {
        id: `paste_${Date.now()}_${idx}`,
        lessonTitle: pasteLesson.trim(),
        page: pastePage,
        order: idx,
        arabic: raw,
        th: '',
        en: '',
      };
    });

    const next = pasteReplaceMode ? parsed : [...editorLines, ...parsed];
    setEditorLines(next);
    setHasUnsavedEdits(true);
    setShowPasteModal(false);
    setPasteText('');
    showToast(`تم استيراد ${parsed.length} سطر في المحرر السريع!`, 'success');
  };

  const handleCopySnippet = () => {
    navigator.clipboard.writeText(APPS_SCRIPT_SNIPPET);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  return (
    <div
      className={`${
        isStandalone
          ? 'min-h-screen bg-slate-950 text-slate-100 p-3 sm:p-6'
          : 'space-y-4 text-slate-100'
      }`}
      dir="rtl"
    >
      <div className={isStandalone ? 'max-w-6xl mx-auto space-y-4' : 'space-y-4'}>
        {/* Top Header Bar */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-lg flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {isStandalone && onBack && (
              <button
                type="button"
                onClick={onBack}
                className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer"
                title="العودة للوحة التحكم"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white">
                  قارئ السكربت والترجمة المتزامنة
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  {lines.length} سطر جاهز
                </span>
              </div>
              <p className="text-xs text-slate-400">
                تتبع تلقائي لصوت المحاضر مع السكربت المعد مسبقاً وربطه بصفحات الـ PDF وإرساله صوتياً ونصياً للطلاب
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Master Student Visibility Toggle */}
            <button
              type="button"
              onClick={handleToggleShowToStudents}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 border transition cursor-pointer shadow-sm ${
                showToStudents
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400 shadow-emerald-500/20'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
              }`}
            >
              {showToStudents ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
              <span>{showToStudents ? 'الترجمة ظاهرة للطلاب' : 'الترجمة مخفية عن الطلاب'}</span>
            </button>

            {/* Voice Speech Tracker Button */}
            <button
              type="button"
              onClick={() => (isListening ? stopSpeechTracking() : startSpeechTracking())}
              className={`px-3.5 py-2 rounded-xl text-xs font-black flex items-center gap-2 border transition cursor-pointer shadow-sm ${
                isListening
                  ? 'bg-rose-600 hover:bg-rose-500 text-white border-rose-400 animate-pulse'
                  : 'bg-amber-500 hover:bg-amber-400 text-slate-950 border-amber-400'
              }`}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
              <span>{isListening ? 'إيقاف تتبع الصوت' : 'تتبع الصوت التلقائي'}</span>
            </button>

            {/* Pop-out Independent Window Link (Shown when embedded) */}
            {!isStandalone && (
              <a
                href="?page=script-prompter"
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
                title="فتح قارئ السكربت في نافذة مستقلة (مثالي عند البث عبر تطبيق آخر)"
              >
                <ExternalLink className="w-3.5 h-3.5 text-amber-400" />
                <span>نافذة مستقلة</span>
              </a>
            )}
          </div>
        </div>

        {/* Notice Banner */}
        {notice && (
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between border ${
              notice.type === 'success'
                ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                : notice.type === 'error'
                ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
                : 'bg-sky-500/15 text-sky-300 border-sky-500/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {notice.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0" />
              )}
              <span>{notice.text}</span>
            </div>
            <button onClick={() => setNotice(null)} className="text-slate-400 hover:text-white cursor-pointer">✕</button>
          </div>
        )}

        {speechError && (
          <div className="px-4 py-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{speechError}</span>
          </div>
        )}

        {/* Sub-Tabs Navigation */}
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSubTab('prompter')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer border ${
                subTab === 'prompter'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800'
              }`}
            >
              <Radio className="w-4 h-4" />
              <span>قارئ السكربت المباشر</span>
            </button>

            <button
              type="button"
              onClick={() => setSubTab('editor')}
              className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition cursor-pointer border ${
                subTab === 'editor'
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md'
                  : 'bg-slate-900 text-slate-300 hover:text-white border-slate-800'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>المحرر السريع والشيت ({editorLines.length})</span>
              {hasUnsavedEdits && (
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
              )}
            </button>
          </div>

          {/* PDF Page Linker Bar */}
          <div className="flex items-center gap-2 flex-wrap bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-xl">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={autoFollowPdfPage}
                onChange={(e) => setAutoFollowPdfPage(e.target.checked)}
                className="accent-emerald-500 rounded cursor-pointer"
              />
              <span>مزامنة تلقائية مع صفحة PDF</span>
            </label>

            <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 px-2 py-1 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setAutoFollowPdfPage(false);
                  setManualPage(Math.max(1, effectivePage - 1));
                }}
                disabled={effectivePage <= 1}
                className="p-0.5 text-slate-300 hover:text-white disabled:opacity-30 cursor-pointer"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
              <span className="text-xs font-mono font-bold text-amber-300 px-1.5">
                صفحة {effectivePage}
              </span>
              <button
                type="button"
                onClick={() => {
                  setAutoFollowPdfPage(false);
                  setManualPage(effectivePage + 1);
                }}
                className="p-0.5 text-slate-300 hover:text-white cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
            </div>

            {availableLessons.length > 0 && (
              <select
                value={selectedLessonFilter}
                onChange={(e) => setSelectedLessonFilter(e.target.value)}
                className="bg-slate-950 border border-slate-800 text-slate-200 text-xs font-bold rounded-lg px-2 py-1 outline-none"
              >
                <option value="">كل الدروس / السكربتات</option>
                {availableLessons.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            )}

            <button
              type="button"
              onClick={() => setShowAllPages(!showAllPages)}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition cursor-pointer flex items-center gap-1 ${
                showAllPages
                  ? 'bg-indigo-600/30 border-indigo-500/50 text-indigo-300'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <ListFilter className="w-3 h-3" />
              <span>{showAllPages ? 'عرض كل الصفحات' : `أسطر ص ${effectivePage} فقط`}</span>
            </button>
          </div>
        </div>

        {/* ============================================================ */}
        {/* VIEW 1: LIVE SCRIPT PROMPTER                                  */}
        {/* ============================================================ */}
        {subTab === 'prompter' && (
          <div className="space-y-4">
            {/* Live Speech Recognition Monitor (Shown when Listening) */}
            {isListening && (
              <div className="p-3 rounded-2xl bg-slate-900/95 border border-rose-500/40 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-inner">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-ping shrink-0" />
                  <span className="text-xs font-bold text-rose-300 shrink-0">الاستماع نشط:</span>
                  <span className="text-xs text-slate-300 truncate">
                    {lastHeardText || 'تحدث الآن باللغة العربية ليتتبع النظام كلماتك...'}
                  </span>
                </div>
                {lastMatchedKeywords.length > 0 && (
                  <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                    <span className="text-[10px] text-slate-400">تطابق:</span>
                    {lastMatchedKeywords.slice(0, 4).map((kw, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Current Broadcasted Line Preview Card + Manual Stepper */}
            <div className="p-4 rounded-2xl bg-gradient-to-br from-slate-900 to-slate-900/90 border-2 border-emerald-500/40 shadow-xl space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      showToStudents ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'
                    }`}
                  />
                  <span className="text-xs font-black text-emerald-400">
                    {sessionState?.subtitleState?.activeArabic
                      ? 'السطر المعروض حالياً للطلاب'
                      : 'لم يتم تحديد سطر نشط بعد'}
                  </span>
                  {!showToStudents && (
                    <span className="text-[11px] text-amber-400 font-bold">
                      (ملاحظة: الترجمة مخفية حالياً عن الطلاب)
                    </span>
                  )}
                </div>

                {/* Manual Stepper Buttons */}
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => handleStepLine(-1)}
                    disabled={visiblePrompterLines.length === 0}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="السهم للأعلى (ArrowUp)"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                    <span>السابق</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStepLine(1)}
                    disabled={visiblePrompterLines.length === 0}
                    className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 text-xs font-black flex items-center gap-1 transition cursor-pointer shadow-sm"
                    title="السهم للأسفل (ArrowDown)"
                  >
                    <span>التالي</span>
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleActivateLine(null, true)}
                    className="px-2.5 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/50 text-slate-300 hover:text-rose-200 text-xs font-bold flex items-center gap-1 transition cursor-pointer"
                    title="مسح الشريط الحالي مؤقتاً"
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    <span>مسح</span>
                  </button>
                </div>
              </div>

              {sessionState?.subtitleState?.activeArabic ||
              sessionState?.subtitleState?.activeTh ||
              sessionState?.subtitleState?.activeEn ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800">
                    <div className="text-[10px] font-bold text-amber-400 mb-1">العربية (المعلم)</div>
                    <div className="text-sm font-bold text-white leading-relaxed">
                      {sessionState.subtitleState.activeArabic || '—'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800" dir="ltr">
                    <div className="text-[10px] font-bold text-emerald-400 mb-1 text-right" dir="rtl">
                      التايلندية (تظهر لطالب التايلندية)
                    </div>
                    <div className="text-sm font-bold text-emerald-200 leading-relaxed">
                      {sessionState.subtitleState.activeTh || '—'}
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800" dir="ltr">
                    <div className="text-[10px] font-bold text-sky-400 mb-1 text-right" dir="rtl">
                      الإنجليزية (تظهر لطالب الإنجليزية)
                    </div>
                    <div className="text-sm font-bold text-sky-200 leading-relaxed font-sans">
                      {sessionState.subtitleState.activeEn || '—'}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-4 text-center text-xs text-slate-400">
                  اضغط على أي سطر بالأسفل أو شغّل «تتبع الصوت التلقائي» لإرسال الترجمة الفورية للطلاب.
                </div>
              )}
            </div>

            {/* Script Queue List */}
            {visiblePrompterLines.length === 0 ? (
              <div className="p-8 rounded-2xl bg-slate-900/70 border border-slate-800 text-center space-y-3">
                <p className="text-sm font-bold text-slate-300">
                  لا توجد أسطر مسجلة للصفحة رقم ({effectivePage}) حتى الآن.
                </p>
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSubTab('editor')}
                    className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs cursor-pointer transition"
                  >
                    الانتقال إلى المحرر السريع لإضافة نصوص
                  </button>
                  <button
                    type="button"
                    onClick={handlePullFromSheet}
                    disabled={isLoadingSheet}
                    className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs cursor-pointer transition flex items-center gap-1.5"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                    <span>جلب من Google Sheet</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 max-h-[54vh] overflow-y-auto pr-1 custom-scrollbar">
                {visiblePrompterLines.map((line, idx) => {
                  const isActive = line.id === activeLineId;
                  return (
                    <div
                      key={line.id}
                      ref={isActive ? activeRowElRef : undefined}
                      onClick={() => handleActivateLine(line, true)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-start justify-between gap-3 ${
                        isActive
                          ? 'bg-emerald-950/50 border-emerald-400 shadow-lg shadow-emerald-500/10 ring-1 ring-emerald-400/50'
                          : 'bg-slate-900/80 hover:bg-slate-800/90 border-slate-800'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <div
                          className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-black font-mono shrink-0 ${
                            isActive
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div className="space-y-1.5 min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="px-2 py-0.5 rounded-md bg-slate-800 text-amber-300 text-[10px] font-mono font-bold">
                              ص {line.page}
                            </span>
                            {line.lessonTitle && (
                              <span className="text-[10px] text-slate-400 font-bold">
                                {line.lessonTitle}
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-bold text-white leading-relaxed">
                            {line.arabic}
                          </p>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-xs">
                            <div className="text-emerald-300/90" dir="ltr">
                              <span className="text-[10px] text-slate-500 mr-1 font-mono">[TH]</span>
                              {line.th || '—'}
                            </div>
                            <div className="text-sky-300/90 font-sans" dir="ltr">
                              <span className="text-[10px] text-slate-500 mr-1 font-mono">[EN]</span>
                              {line.en || '—'}
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleActivateLine(line, true);
                        }}
                        className={`p-2 rounded-xl shrink-0 transition cursor-pointer ${
                          isActive
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-slate-800 text-slate-300 hover:bg-amber-500 hover:text-slate-950'
                        }`}
                        title="عرض هذا السطر للطلاب الآن"
                      >
                        <Play className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="text-[11px] text-slate-500 flex items-center justify-between flex-wrap gap-2 px-1">
              <span>تلميح: نطق كلمتين مفتاحيتين أو أكثر من أي سطر ينقل الترجمة إليه تلقائياً فوراً.</span>
              <span>اختصارات لوحة المفاتيح: ▲ السطر السابق • ▼ السطر التالي</span>
            </div>
          </div>
        )}

        {/* ============================================================ */}
        {/* VIEW 2: QUICK EDITOR & GOOGLE SHEETS SYNC                    */}
        {/* ============================================================ */}
        {subTab === 'editor' && (
          <div className="space-y-4">
            {/* Toolbar Actions */}
            <div className="p-3.5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handlePullFromSheet}
                  disabled={isLoadingSheet}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold flex items-center gap-1.5 border border-slate-700 cursor-pointer transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${isLoadingSheet ? 'animate-spin' : ''}`} />
                  <span>جلب من Google Sheet</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveAndSyncAll(editorLines)}
                  disabled={isSaving}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-black flex items-center gap-1.5 shadow-md shadow-emerald-600/20 cursor-pointer transition"
                >
                  <Save className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                  <span>{isSaving ? 'جارٍ الحفظ...' : 'حفظ ومزامنة (شيت + النظام)'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleAiBatchTranslateMissing}
                  disabled={isTranslatingBatch}
                  className="px-3.5 py-2 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-200 border border-indigo-500/40 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Sparkles className={`w-3.5 h-3.5 text-amber-300 ${isTranslatingBatch ? 'animate-spin' : ''}`} />
                  <span>{isTranslatingBatch ? 'جارٍ الترجمة...' : 'ترجمة آلية للخلايا الفارغة'}</span>
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setPastePage(effectivePage);
                    setPasteLesson(selectedLessonFilter || sessionState?.pdfTitle || '');
                    setShowPasteModal(true);
                  }}
                  className="px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <ClipboardPaste className="w-3.5 h-3.5" />
                  <span>لصق سريع (نص أو جدول)</span>
                </button>

                <button
                  type="button"
                  onClick={handleAddEditorRow}
                  className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>إضافة سطر</span>
                </button>

                {editorLines.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAllEditorRows}
                    className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-slate-400 hover:text-rose-300 border border-slate-700 cursor-pointer transition"
                    title="مسح جميع الأسطر"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Quick Inline Table */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-x-auto custom-scrollbar">
              <table className="w-full text-right border-collapse min-w-[780px]">
                <thead>
                  <tr className="bg-slate-950/90 border-b border-slate-800 text-[11px] font-black text-slate-400">
                    <th className="p-2.5 w-12 text-center">#</th>
                    <th className="p-2.5 w-20 text-center">الصفحة</th>
                    <th className="p-2.5 w-36">عنوان الدرس</th>
                    <th className="p-2.5">النص العربي (كلام المحاضر)</th>
                    <th className="p-2.5">الترجمة التايلندية (TH)</th>
                    <th className="p-2.5">الترجمة الإنجليزية (EN)</th>
                    <th className="p-2.5 w-20 text-center">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/80 text-xs">
                  {editorLines.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400">
                        الجدول فارغ. استخدم «جلب من Google Sheet» أو «لصق سريع» أو «إضافة سطر» للبدء.
                      </td>
                    </tr>
                  ) : (
                    editorLines.map((row, idx) => (
                      <tr key={row.id} className="hover:bg-slate-800/40 align-top">
                        <td className="p-2 text-center font-mono text-slate-500 pt-3">
                          {idx + 1}
                        </td>
                        <td className="p-2">
                          <input
                            type="number"
                            min={1}
                            value={row.page}
                            onChange={(e) =>
                              handleUpdateEditorCell(row.id, 'page', Math.max(1, Number(e.target.value) || 1))
                            }
                            className="w-16 px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-amber-300 font-mono text-center focus:border-amber-400 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <input
                            type="text"
                            value={row.lessonTitle || ''}
                            onChange={(e) =>
                              handleUpdateEditorCell(row.id, 'lessonTitle', e.target.value)
                            }
                            placeholder="اختياري..."
                            className="w-full px-2 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-300 focus:border-amber-400 outline-none"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            rows={2}
                            value={row.arabic}
                            onChange={(e) =>
                              handleUpdateEditorCell(row.id, 'arabic', e.target.value)
                            }
                            placeholder="النص العربي..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-white focus:border-amber-400 outline-none resize-y"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            rows={2}
                            dir="ltr"
                            value={row.th}
                            onChange={(e) => handleUpdateEditorCell(row.id, 'th', e.target.value)}
                            placeholder="Thai translation..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-300 focus:border-emerald-400 outline-none resize-y"
                          />
                        </td>
                        <td className="p-2">
                          <textarea
                            rows={2}
                            dir="ltr"
                            value={row.en}
                            onChange={(e) => handleUpdateEditorCell(row.id, 'en', e.target.value)}
                            placeholder="English translation..."
                            className="w-full px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-sky-200 focus:border-sky-400 outline-none resize-y font-sans"
                          />
                        </td>
                        <td className="p-2 text-center">
                          <div className="flex items-center justify-center gap-1 pt-1">
                            <button
                              type="button"
                              onClick={() => {
                                handleActivateLine(row, true);
                                setSubTab('prompter');
                              }}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-emerald-600 text-slate-300 hover:text-white cursor-pointer transition"
                              title="بث هذا السطر مباشرة للطلاب"
                            >
                              <Play className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteEditorRow(row.id)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-rose-600 text-slate-400 hover:text-white cursor-pointer transition"
                              title="حذف السطر"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Google Apps Script Helper Box (Collapsible) */}
            <div className="rounded-2xl bg-slate-900/90 border border-slate-800 overflow-hidden">
              <button
                type="button"
                onClick={() => setShowAppsScriptCode(!showAppsScriptCode)}
                className="w-full px-4 py-3 flex items-center justify-between text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-amber-400" />
                  <span>كود الربط مع ورقة Google Sheets الجديدة (Live_Subtitles) في Apps Script</span>
                </span>
                <span className="text-[11px] text-amber-400">
                  {showAppsScriptCode ? 'إخفاء ▲' : 'عرض ونسخ ▼'}
                </span>
              </button>

              {showAppsScriptCode && (
                <div className="p-4 pt-0 space-y-2 border-t border-slate-800/80">
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[11px] text-slate-400">
                      أضف هذه الدوال إلى مشروع Google Apps Script المربوط معك لتفعيل القراءة والكتابة التلقائية لورقة <b className="text-amber-300">Live_Subtitles</b>.
                    </p>
                    <button
                      type="button"
                      onClick={handleCopySnippet}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      {copiedCode ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedCode ? 'تم النسخ!' : 'نسخ الكود'}</span>
                    </button>
                  </div>
                  <pre
                    dir="ltr"
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-emerald-300 font-mono overflow-x-auto max-h-60 custom-scrollbar"
                  >
                    {APPS_SCRIPT_SNIPPET}
                  </pre>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* BULK PASTE MODAL */}
      {showPasteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <ClipboardPaste className="w-5 h-5 text-amber-400" />
                <span>استيراد ولصق نصوص السكربت دفعة واحدة</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              يمكنك لصق <b>نصوص عربية فقط</b> (كل جملة في سطر) ليتم ترجمتها آلياً بضغطة زر، أو لصق <b>جدول منسوخ مباشرة من Excel / Google Sheets</b> (الأعمدة المفصولة بمسافة جدولة: <span className="font-mono text-amber-300">الصفحة | العربي | التايلندي | الإنجليزي</span>).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  رقم صفحة PDF الافتراضي:
                </label>
                <input
                  type="number"
                  min={1}
                  value={pastePage}
                  onChange={(e) => setPastePage(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-amber-300 font-mono text-sm outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-300 mb-1">
                  اسم الدرس / الملف (اختياري):
                </label>
                <input
                  type="text"
                  value={pasteLesson}
                  onChange={(e) => setPasteLesson(e.target.value)}
                  placeholder="مثال: الدرس الأول"
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs outline-none"
                />
              </div>
            </div>

            <textarea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="ألصق السطور هنا..."
              className="w-full p-3 rounded-2xl bg-slate-950 border border-slate-800 text-xs text-white focus:border-amber-400 outline-none resize-y"
            />

            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={pasteReplaceMode}
                onChange={(e) => setPasteReplaceMode(e.target.checked)}
                className="accent-rose-500 rounded"
              />
              <span>استبدال الجدول الحالي بالكامل (بدلاً من الإضافة فوقه)</span>
            </label>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-bold cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmBulkPaste}
                disabled={!pasteText.trim()}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-black text-xs cursor-pointer"
              >
                استيراد للجدول
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
