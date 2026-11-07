import React, { useState, useRef, useEffect } from 'react';
import { useLanguage, LANGUAGES, Language } from '../translations';
import { ChevronDown, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LanguageSelectorProps {
  variant?: 'compact' | 'full' | 'dropdown';
  className?: string;
  align?: 'left' | 'right';
  iconOnly?: boolean;
}

export default function LanguageSelector({ 
  className = '',
  align = 'right',
  iconOnly = false
}: LanguageSelectorProps) {
  const { language, setLanguage } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentInfo = LANGUAGES[language] || LANGUAGES['ar'];

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelectLanguage = (langKey: Language, e?: React.SyntheticEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    setLanguage(langKey);
    setIsOpen(false);
  };

  const toggleDropdown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOpen(prev => !prev);
  };

  return (
    <div className={`relative inline-block text-right ${className}`} ref={dropdownRef} dir="rtl">
      {/* الزر الرئيسي الموحد لتبديل اللغة */}
      <button
        type="button"
        onClick={toggleDropdown}
        className={iconOnly
          ? "w-9 h-9 bg-slate-800/90 hover:bg-slate-700 text-slate-100 hover:text-amber-400 border border-slate-700/80 hover:border-amber-500/60 rounded-xl cursor-pointer transition-all active:scale-95 shadow-sm flex items-center justify-center text-sm font-black select-none z-10 relative"
          : "px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-100 hover:text-amber-400 border border-slate-700 hover:border-amber-500/60 rounded-xl cursor-pointer transition-all active:scale-95 shadow-sm flex items-center gap-2 text-xs font-black select-none z-10 relative"
        }
        title="تغيير اللغة / Change Language"
      >
        <span className="text-base leading-none">{currentInfo.flag}</span>
        {!iconOnly && <span className="font-extrabold text-xs">{currentInfo.nativeName}</span>}
        {!iconOnly && <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-amber-400' : ''}`} />}
      </button>

      {/* القائمة المنسدلة بدون نصوص إرشادية طويلة */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* خلفية شفافة لإغلاق القائمة عند النقر خارجها دون أي تضارب */}
            <div 
              className="fixed inset-0 z-[99990] bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                setIsOpen(false);
              }}
            />

            <motion.div
              initial={{ opacity: 0, y: 6, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 6, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className={`absolute ${align === 'left' ? 'left-0' : 'right-0'} mt-1.5 w-36 bg-slate-900 border border-slate-700/90 rounded-2xl shadow-2xl z-[99999] p-1 overflow-hidden backdrop-blur-xl`}
            >
              {(Object.keys(LANGUAGES) as Language[]).map((langKey) => {
                const info = LANGUAGES[langKey];
                const isActive = language === langKey;
                return (
                  <button
                    type="button"
                    key={langKey}
                    onMouseDown={(e) => handleSelectLanguage(langKey, e)}
                    onClick={(e) => handleSelectLanguage(langKey, e)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer my-0.5 select-none ${
                      isActive
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-base leading-none">{info.flag}</span>
                      <span className="text-xs">{info.nativeName}</span>
                    </div>
                    {isActive && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                  </button>
                );
              })}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
