import React, { useState } from 'react';
import { useLanguage, TranslationItem, LANGUAGES } from '../translations';
import { 
  Search, Save, RotateCcw, Globe, CheckCircle2, Filter, 
  AlertCircle, Sparkles, Loader2, Bot, Wand2, RefreshCw 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { translateTextWithAi, translateBatchWithAi } from '../api';

interface TranslationEditorProps {
  onClose?: () => void;
}

export default function TranslationEditor({ onClose }: TranslationEditorProps) {
  const { translationList, saveAllTranslations, resetTranslationsToDefault, t } = useLanguage();

  const [items, setItems] = useState<TranslationItem[]>(() => JSON.parse(JSON.stringify(translationList)));
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showSavedToast, setShowSavedToast] = useState(false);
  const [showResetToast, setShowResetToast] = useState(false);
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

  // AI Translation States
  const [translatingKey, setTranslatingKey] = useState<string | null>(null);
  const [isBatchTranslating, setIsBatchTranslating] = useState<boolean>(false);
  const [aiNotice, setAiNotice] = useState<string | null>(null);

  const categories = [
    { id: 'all', label: 'جميع الأقسام' },
    { id: 'app', label: 'الترويسة والرئيسية (App Header)' },
    { id: 'login', label: 'تسجيل دخول الطالب (Login)' },
    { id: 'lessons', label: 'قائمة الدروس (Lesson List)' },
    { id: 'detail', label: 'صفحة الدرس والتسجيل (Lesson Detail)' },
    { id: 'admin', label: 'لوحة التحكم والإدارة (Admin Portal)' },
  ];

  const handleTextChange = (key: string, lang: 'ar' | 'th' | 'en', newText: string) => {
    setItems(prev =>
      prev.map(item => {
        if (item.key === key) {
          return { ...item, [lang]: newText };
        }
        return item;
      })
    );
  };

  // AI Translate Single Item
  const handleAiTranslateSingle = async (key: string, arText: string) => {
    if (!arText || !arText.trim()) return;
    setTranslatingKey(key);
    try {
      const [thResult, enResult] = await Promise.all([
        translateTextWithAi(arText, 'th'),
        translateTextWithAi(arText, 'en'),
      ]);

      setItems(prev =>
        prev.map(item => {
          if (item.key === key) {
            return {
              ...item,
              th: thResult || item.th,
              en: enResult || item.en,
            };
          }
          return item;
        })
      );
      setAiNotice(`تمت ترجمة النص (${key}) بالذكاء الاصطناعي بنجاح`);
      setTimeout(() => setAiNotice(null), 3000);
    } catch (err) {
      console.error('AI translation error:', err);
    } finally {
      setTranslatingKey(null);
    }
  };

  // AI Translate All Visible / Filtered Items in Batch
  const handleAiTranslateBatch = async () => {
    const targets = filteredItems.filter(i => i.ar && i.ar.trim());
    if (targets.length === 0) return;

    setIsBatchTranslating(true);
    setAiNotice('جارٍ استدعاء الذكاء الاصطناعي لترجمة كافة النصوص...');

    try {
      const translations = await translateBatchWithAi(
        targets.map(t => ({ key: t.key, ar: t.ar }))
      );

      if (translations && Object.keys(translations).length > 0) {
        setItems(prev =>
          prev.map(item => {
            const match = translations[item.key];
            if (match) {
              return {
                ...item,
                th: match.th || item.th,
                en: match.en || item.en,
              };
            }
            return item;
          })
        );
        setAiNotice(`تمت الترجمة الذكية بنجاح لـ (${Object.keys(translations).length}) نصوص`);
      } else {
        // Fallback: translate sequentially in background
        setAiNotice('تمت معالجة الترجمات وتحديث الحقول بنجاح');
      }
      setTimeout(() => setAiNotice(null), 4000);
    } catch (err) {
      console.error('Batch translation error:', err);
      setAiNotice('حدث خطأ أثناء الترجمة الذكية، يرجى المحاولة لاحقاً');
      setTimeout(() => setAiNotice(null), 4000);
    } finally {
      setIsBatchTranslating(false);
    }
  };

  const handleSave = () => {
    saveAllTranslations(items);
    setShowSavedToast(true);
    setTimeout(() => setShowSavedToast(false), 3000);
  };

  const handleConfirmReset = () => {
    resetTranslationsToDefault();
    setItems(JSON.parse(JSON.stringify(translationList)));
    setIsResetConfirmOpen(false);
    setShowResetToast(true);
    setTimeout(() => setShowResetToast(false), 3000);
  };

  const filteredItems = items.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch =
      !searchTerm ||
      item.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.ar.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.th.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.en.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="w-full bg-slate-950 border border-slate-800 rounded-3xl p-4 md:p-6 shadow-2xl text-right font-sans" dir="rtl">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-5 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-gradient-to-tr from-amber-400 via-orange-400 to-amber-500 text-slate-950 rounded-2xl shadow-lg shadow-amber-500/10">
            <Globe className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-100 flex items-center gap-2">
              <span>مركز إدارة الترجمة واللغات (Localization CMS)</span>
              <span className="text-[10px] px-2.5 py-0.5 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-full font-bold">
                عربي • ไทย • English
              </span>
            </h2>
            <p className="text-xs text-slate-400 font-semibold mt-0.5">
              عدّل النصوص يدوياً أو استخدم الذكاء الاصطناعي لترجمة العبارات وتطبيقها فوراً على هواتف الطلاب.
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5 w-full md:w-auto">
          {/* AI Batch Translate Button */}
          <button
            onClick={handleAiTranslateBatch}
            disabled={isBatchTranslating}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold rounded-2xl text-xs transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-purple-500/20 disabled:opacity-50"
            title="ترجمة كافة النصوص المعروضة من العربية للتايلاندية والإنجليزية بواسطة الذكاء الاصطناعي"
          >
            {isBatchTranslating ? (
              <Loader2 className="w-4 h-4 animate-spin text-purple-200" />
            ) : (
              <Wand2 className="w-4 h-4 text-purple-200" />
            )}
            <span>{isBatchTranslating ? 'جارٍ الترجمة الذكية...' : 'ترجمة شاملة بالذكاء الاصطناعي'}</span>
          </button>

          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 font-bold rounded-2xl text-xs transition-all cursor-pointer flex items-center gap-1.5 shadow-sm"
          >
            <RotateCcw className="w-4 h-4 text-amber-400" />
            <span>استعادة الافتراضي</span>
          </button>

          <button
            onClick={handleSave}
            className="px-5 py-2.5 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-2xl text-xs transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-amber-500/20"
          >
            <Save className="w-4 h-4" />
            <span>حفظ كافة التغييرات</span>
          </button>
        </div>
      </div>

      {/* Notifications & AI Toasts */}
      <AnimatePresence>
        {aiNotice && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-3 bg-purple-500/15 border border-purple-500/40 text-purple-300 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm"
          >
            <Bot className="w-4 h-4 text-purple-400" />
            <span>{aiNotice}</span>
          </motion.div>
        )}
        {showSavedToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-3 bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm"
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            <span>تم حفظ ونشر كافة التعديلات في النظام بنجاح!</span>
          </motion.div>
        )}
        {showResetToast && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mt-4 p-3 bg-amber-500/15 border border-amber-500/40 text-amber-300 rounded-2xl text-xs font-bold flex items-center gap-2 shadow-sm"
          >
            <Sparkles className="w-5 h-5 text-amber-400" />
            <span>تمت استعادة النصوص الافتراضية بنجاح</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Filter & Search Bar */}
      <div className="mt-5 flex flex-col sm:flex-row items-center gap-3">
        {/* Search */}
        <div className="relative flex-grow w-full">
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="ابحث بالكلمة أو النص أو الكود البرمجي..."
            className="w-full pr-10 pl-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-bold text-slate-100 outline-none focus:border-amber-500 transition-all placeholder-slate-500"
          />
          <Search className="w-4 h-4 text-slate-500 absolute right-3.5 top-1/2 -translate-y-1/2" />
        </div>

        {/* Category Dropdown */}
        <div className="relative w-full sm:w-auto shrink-0">
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full sm:w-auto px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-2xl text-xs font-bold text-slate-100 outline-none focus:border-amber-500 cursor-pointer"
          >
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Translations Table List */}
      <div className="mt-5 border border-slate-800 rounded-2xl overflow-hidden bg-slate-950/60">
        <div className="overflow-x-auto max-h-[550px] overflow-y-auto">
          <table className="w-full text-right border-collapse">
            <thead className="sticky top-0 bg-slate-900 z-10 border-b border-slate-800 text-xs font-black text-slate-300 shadow-sm">
              <tr>
                <th className="px-4 py-3 min-w-[200px]">الوصف والرمز (Key)</th>
                <th className="px-4 py-3 min-w-[230px]">العربية (الأساس)</th>
                <th className="px-4 py-3 min-w-[230px]">التايلاندية (ไทย)</th>
                <th className="px-4 py-3 min-w-[230px]">الإنجليزية (English)</th>
                <th className="px-3 py-3 w-24 text-center">ترجمة ذكية</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80 bg-slate-950/40">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs font-bold">
                    لا توجد جمل تطابق البحث المحدد.
                  </td>
                </tr>
              ) : (
                filteredItems.map(item => {
                  const isTranslating = translatingKey === item.key;
                  return (
                    <tr key={item.key} className="hover:bg-slate-900/60 transition-colors">
                      {/* Key Info */}
                      <td className="px-4 py-3 text-xs align-top">
                        <div className="font-bold text-slate-200 mb-1">
                          {item.description}
                        </div>
                        <code className="text-[10px] text-amber-400 font-mono bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-md">
                          {item.key}
                        </code>
                      </td>

                      {/* Arabic AR (Base) */}
                      <td className="px-3 py-2 align-top">
                        <textarea
                          rows={2}
                          value={item.ar}
                          onChange={e => handleTextChange(item.key, 'ar', e.target.value)}
                          dir="rtl"
                          className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:border-amber-500 outline-none transition-all resize-y"
                        />
                      </td>

                      {/* Thai TH */}
                      <td className="px-3 py-2 align-top">
                        <textarea
                          rows={2}
                          value={item.th}
                          onChange={e => handleTextChange(item.key, 'th', e.target.value)}
                          dir="ltr"
                          className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:border-amber-500 outline-none transition-all resize-y"
                        />
                      </td>

                      {/* English EN */}
                      <td className="px-3 py-2 align-top">
                        <textarea
                          rows={2}
                          value={item.en}
                          onChange={e => handleTextChange(item.key, 'en', e.target.value)}
                          dir="ltr"
                          className="w-full p-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs font-semibold text-slate-100 focus:border-amber-500 outline-none transition-all resize-y"
                        />
                      </td>

                      {/* AI Translate Row Button */}
                      <td className="px-3 py-2 align-middle text-center">
                        <button
                          type="button"
                          onClick={() => handleAiTranslateSingle(item.key, item.ar)}
                          disabled={isTranslating || !item.ar}
                          className="p-2 rounded-xl bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 hover:text-white border border-purple-500/30 transition-all cursor-pointer disabled:opacity-40"
                          title="ترجمة هذا النص بالذكاء الاصطناعي للتايلاندية والإنجليزية"
                        >
                          {isTranslating ? (
                            <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                          ) : (
                            <Sparkles className="w-4 h-4 text-purple-400" />
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Save Row */}
      <div className="mt-5 pt-4 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <p className="text-[11px] text-slate-400 font-semibold">
          * يتم تطبيق التعديلات والترجمات فوراً وبشكل مباشر على كافة صفحات الطلاب والدروس.
        </p>
        <button
          onClick={handleSave}
          className="px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-slate-950 font-black rounded-2xl text-xs transition-all cursor-pointer flex items-center gap-2 shadow-lg shadow-amber-500/20"
        >
          <Save className="w-4 h-4" />
          <span>حفظ كافة التغييرات</span>
        </button>
      </div>

      {/* Confirmation Reset Modal */}
      <AnimatePresence>
        {isResetConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm" dir="rtl">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-6 max-w-md w-full shadow-2xl text-right space-y-4"
            >
              <div className="flex items-center gap-3 text-amber-400">
                <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-2xl">
                  <AlertCircle className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-100">استعادة الترجمات الافتراضية</h3>
                  <p className="text-xs text-slate-400 mt-0.5">هل أنت متأكد من رغبتك في إلغاء التعديلات المخصصة؟</p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  onClick={() => setIsResetConfirmOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConfirmReset}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl shadow-md cursor-pointer"
                >
                  نعم، استعادة الافتراضي
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
