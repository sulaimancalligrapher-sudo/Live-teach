import React, { useState, useEffect } from 'react';
import {
  ShieldCheck, UserPlus, Trash2, RefreshCw, Save, Sparkles,
  Lock, Unlock, CheckCircle2, AlertCircle, Eye, EyeOff
} from 'lucide-react';
import { AdminSheetUser, AdminAccessConfig } from '../types';
import {
  setupAdminSheetApi,
  fetchAdminUsersFromSheet,
  saveAdminUsersToSheet,
  subscribeToAdminAccessConfig,
  saveAdminAccessConfig
} from '../api';

interface AdminAccessManagerPanelProps {
  onNotice?: (text: string, type: 'success' | 'error') => void;
}

export default function AdminAccessManagerPanel({ onNotice }: AdminAccessManagerPanelProps) {
  const [users, setUsers] = useState<AdminSheetUser[]>([]);
  const [requireHomeLogin, setRequireHomeLogin] = useState<boolean>(true);
  const [requireAdminLogin, setRequireAdminLogin] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [isSettingUpSheet, setIsSettingUpSheet] = useState<boolean>(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showNumbers, setShowNumbers] = useState<boolean>(false);

  useEffect(() => {
    const unsub = subscribeToAdminAccessConfig((cfg: AdminAccessConfig) => {
      setRequireHomeLogin(cfg.requireHomeLogin !== false);
      setRequireAdminLogin(cfg.requireAdminLogin !== false);
      if (cfg.users && cfg.users.length > 0) {
        setUsers(cfg.users);
      }
    });

    // Also try fetching live from Google Sheet on mount
    fetchAdminUsersFromSheet().then((res) => {
      if (res.data && res.data.length > 0) {
        setUsers(res.data);
      }
    }).catch(() => {});

    return () => unsub();
  }, []);

  const notify = (text: string, type: 'success' | 'error') => {
    setStatusMsg({ text, type });
    if (onNotice) onNotice(text, type);
    setTimeout(() => setStatusMsg(null), 5000);
  };

  const handleSetupSheet = async () => {
    setIsSettingUpSheet(true);
    try {
      const res = await setupAdminSheetApi();
      if (res.success) {
        if (res.users && res.users.length > 0) {
          setUsers(res.users);
        }
        notify(res.message || 'تم إنشاء وتهيئة ورقة (أدمن) في الشيت بنجاح! 🔐', 'success');
      } else {
        notify(res.message || 'تعذر تهيئة ورقة (أدمن)، تأكد من تحديث كود Apps Script.', 'error');
      }
    } catch (e: any) {
      notify(e?.message || 'حدث خطأ أثناء التهيئة', 'error');
    } finally {
      setIsSettingUpSheet(false);
    }
  };

  const handleFetchFromSheet = async () => {
    setIsLoading(true);
    try {
      const res = await fetchAdminUsersFromSheet();
      setUsers(res.data || []);
      if (res.success) {
        notify(
          res.source === 'sheet'
            ? `تم جلب ${res.data.length} حساب من ورقة (أدمن) في الشيت ومزامنتها ✅`
            : `تم تحميل ${res.data.length} حساب من قاعدة النظام`,
          'success'
        );
      } else {
        notify(res.message || 'تعذر القراءة من الشيت', 'error');
      }
    } catch (e: any) {
      notify(e?.message || 'فشل الجلب من الشيت', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddRow = () => {
    const newRow: AdminSheetUser = {
      id: `adm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: '',
      number: '',
      allowHome: 'نعم',
      allowAdmin: 'لا',
      status: 'نعم',
      notes: '',
    };
    setUsers((prev) => [...prev, newRow]);
  };

  const handleLoadDefaults = () => {
    const defaults: AdminSheetUser[] = [
      {
        id: 'def_admin_1',
        name: 'Admin الخطاط سليمان ادم 2026',
        number: '0980877274',
        allowHome: 'نعم',
        allowAdmin: 'نعم',
        status: 'نعم',
        notes: 'صلاحية كاملة للتحكم السريع ولوحة التحكم',
      },
      {
        id: 'def_teacher_2',
        name: 'الخطاط سليمان ادم',
        number: '0980877274',
        allowHome: 'نعم',
        allowAdmin: 'لا',
        status: 'نعم',
        notes: 'صلاحية صفحة التحكم السريع فقط',
      },
    ];
    setUsers(defaults);
    notify('تم إدراج النموذج المبدئي — اضغط «حفظ ومزامنة» لاعتماده في ورقة Admin والنظام.', 'success');
  };

  const updateRow = (idx: number, patch: Partial<AdminSheetUser>) => {
    setUsers((prev) => prev.map((u, i) => (i === idx ? { ...u, ...patch } : u)));
  };

  const removeRow = (idx: number) => {
    setUsers((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveAll = async () => {
    const valid = users.filter((u) => u.name.trim() && u.number.trim());
    if (valid.length === 0 && (requireHomeLogin || requireAdminLogin)) {
      notify('أضف حساباً واحداً على الأقل (الاسم + الرقم) قبل الحفظ حتى لا يُغلق الدخول!', 'error');
      return;
    }
    setIsSaving(true);
    try {
      const res = await saveAdminUsersToSheet(valid, {
        requireHomeLogin,
        requireAdminLogin,
      });
      setUsers(valid);
      notify(res.message, res.sheetSynced ? 'success' : 'error');
    } catch (e: any) {
      notify(e?.message || 'تعذر حفظ الحسابات', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleGateFlag = async (field: 'requireHomeLogin' | 'requireAdminLogin', nextVal: boolean) => {
    if (field === 'requireHomeLogin') setRequireHomeLogin(nextVal);
    else setRequireAdminLogin(nextVal);
    try {
      await saveAdminAccessConfig({ [field]: nextVal });
      notify('تم تحديث حالة قفل الدخول بنجاح ✅', 'success');
    } catch {
      notify('تعذر حفظ إعداد القفل', 'error');
    }
  };

  return (
    <div className="bg-slate-800/60 border border-amber-500/30 rounded-3xl p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-base sm:text-lg font-black text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-amber-400" />
            <span>إدارة صلاحيات الدخول وورقة «Admin» (التحكم السريع + لوحة التحكم)</span>
          </h3>
          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
            تتحكم هذه الورقة في من يُسمح له بالدخول بالاسم والرقم إلى صفحة <b className="text-slate-200">التحكم السريع</b> (<span className="font-mono text-amber-300" dir="ltr">?live=control</span>) وإلى <b className="text-amber-300">لوحة التحكم المركزية</b> (<span className="font-mono text-amber-300" dir="ltr">?Admin=controlroom2026</span>) بشكل مستقل مع المزامنة الثنائية بين الشيت والنظام.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleSetupSheet}
            disabled={isSettingUpSheet}
            className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 border border-amber-500/40 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <Sparkles className={`w-3.5 h-3.5 ${isSettingUpSheet ? 'animate-spin' : ''}`} />
            <span>{isSettingUpSheet ? 'جاري التهيئة...' : 'إنشاء ورقة «Admin» بالشيت'}</span>
          </button>

          <button
            type="button"
            onClick={handleFetchFromSheet}
            disabled={isLoading}
            className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>جلب من الشيت</span>
          </button>

          <button
            type="button"
            onClick={handleSaveAll}
            disabled={isSaving}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs flex items-center gap-1.5 transition shadow-md shadow-emerald-600/20 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'جاري الحفظ...' : 'حفظ ومزامنة (شيت + النظام)'}</span>
          </button>
        </div>
      </div>

      {/* Lock Toggles for Home and Admin Panel */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {requireHomeLogin ? (
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Unlock className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <div>
              <div className="text-xs font-black text-white">تسجيل دخول التحكم السريع (?live=control)</div>
              <div className="text-[11px] text-slate-400">
                طلب الاسم والرقم قبل فتح صفحة التحكم السريع للمعلم/المقدّم
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleGateFlag('requireHomeLogin', !requireHomeLogin)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
              requireHomeLogin
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {requireHomeLogin ? 'مُفعّل 🔒' : 'مفتوح 🔓'}
          </button>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {requireAdminLogin ? (
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Unlock className="w-4 h-4 text-slate-400 shrink-0" />
            )}
            <div>
              <div className="text-xs font-black text-white">تسجيل دخول لوحة التحكم المركزية</div>
              <div className="text-[11px] text-slate-400">
                طلب الاسم والرقم الخاص بالإدارة قبل فتح لوحة التحكم
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => handleToggleGateFlag('requireAdminLogin', !requireAdminLogin)}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition cursor-pointer shrink-0 ${
              requireAdminLogin
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : 'bg-slate-800 text-slate-400 border border-slate-700'
            }`}
          >
            {requireAdminLogin ? 'مُفعّل 🔒' : 'مفتوح 🔓'}
          </button>
        </div>
      </div>

      {statusMsg && (
        <div
          className={`p-3 rounded-2xl text-xs font-bold flex items-center gap-2 ${
            statusMsg.type === 'success'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/15 border border-rose-500/30 text-rose-300'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddRow}
            className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 transition cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>إضافة شخص جديد</span>
          </button>
          {users.length === 0 && (
            <button
              type="button"
              onClick={handleLoadDefaults}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-700 text-amber-300 border border-amber-500/30 font-bold text-xs cursor-pointer transition"
            >
              إدراج حسابات افتراضية (المدير + المعلم)
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setShowNumbers((v) => !v)}
          className="px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer transition"
        >
          {showNumbers ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{showNumbers ? 'إخفاء الأرقام' : 'إظهار الأرقام'}</span>
        </button>
      </div>

      {/* Users Table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-950/70">
        <table className="w-full text-right text-xs">
          <thead className="bg-slate-900 text-slate-300 border-b border-slate-800">
            <tr>
              <th className="py-2.5 px-3 font-black">الاسم (A)</th>
              <th className="py-2.5 px-3 font-black">الرقم (B)</th>
              <th className="py-2.5 px-3 font-black text-center">الصفحة الرئيسية (C)</th>
              <th className="py-2.5 px-3 font-black text-center">لوحة التحكم (D)</th>
              <th className="py-2.5 px-3 font-black text-center">الحالة (E)</th>
              <th className="py-2.5 px-3 font-black">ملاحظات (F)</th>
              <th className="py-2.5 px-3 font-black text-center">حذف</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80">
            {users.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-slate-400">
                  لا توجد حسابات مخصصة مسجلة حالياً في ورقة «أدمن». اضغط <b className="text-amber-300">«إنشاء ورقة أدمن بالشيت»</b> أو <b className="text-blue-300">«إضافة شخص جديد»</b> لتخصيص الصلاحيات.
                </td>
              </tr>
            ) : (
              users.map((u, idx) => (
                <tr key={u.id || idx} className="hover:bg-slate-900/50">
                  <td className="p-2 min-w-[140px]">
                    <input
                      type="text"
                      value={u.name}
                      onChange={(e) => updateRow(idx, { name: e.target.value })}
                      placeholder="مثال: أستاذ أحمد"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-white focus:border-amber-500 focus:outline-none text-xs"
                    />
                  </td>
                  <td className="p-2 min-w-[110px]">
                    <input
                      type={showNumbers ? 'text' : 'password'}
                      value={u.number}
                      onChange={(e) => updateRow(idx, { number: e.target.value })}
                      placeholder="1122"
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-amber-300 font-mono text-center focus:border-amber-500 focus:outline-none text-xs"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <select
                      value={u.allowHome}
                      onChange={(e) => updateRow(idx, { allowHome: e.target.value as 'نعم' | 'لا' })}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer focus:outline-none ${
                        u.allowHome === 'نعم'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
                      }`}
                    >
                      <option value="نعم" className="bg-slate-900 text-emerald-300">نعم</option>
                      <option value="لا" className="bg-slate-900 text-rose-300">لا</option>
                    </select>
                  </td>
                  <td className="p-2 text-center">
                    <select
                      value={u.allowAdmin}
                      onChange={(e) => updateRow(idx, { allowAdmin: e.target.value as 'نعم' | 'لا' })}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer focus:outline-none ${
                        u.allowAdmin === 'نعم'
                          ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400'
                      }`}
                    >
                      <option value="نعم" className="bg-slate-900 text-amber-300">نعم</option>
                      <option value="لا" className="bg-slate-900 text-slate-300">لا</option>
                    </select>
                  </td>
                  <td className="p-2 text-center">
                    <select
                      value={u.status}
                      onChange={(e) => updateRow(idx, { status: e.target.value as 'نعم' | 'لا' })}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs font-bold cursor-pointer focus:outline-none ${
                        u.status === 'نعم'
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-rose-500/20 border-rose-500/40 text-rose-300'
                      }`}
                    >
                      <option value="نعم" className="bg-slate-900 text-emerald-300">نعم</option>
                      <option value="لا" className="bg-slate-900 text-rose-300">لا</option>
                    </select>
                  </td>
                  <td className="p-2 min-w-[160px]">
                    <input
                      type="text"
                      value={u.notes || ''}
                      onChange={(e) => updateRow(idx, { notes: e.target.value })}
                      placeholder="ملاحظة اختيارية..."
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-300 focus:border-amber-500 focus:outline-none text-xs"
                    />
                  </td>
                  <td className="p-2 text-center">
                    <button
                      type="button"
                      onClick={() => removeRow(idx)}
                      className="p-1.5 rounded-lg bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 transition cursor-pointer"
                      title="حذف الحساب"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
