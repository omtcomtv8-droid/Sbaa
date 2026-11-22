import React, { useState, useEffect } from 'react';
import { ShieldAlert, Lock, User, Key, AlertCircle, Eye, EyeOff, X, ArrowRight } from 'lucide-react';
import { useLanguage } from '../../i18n/LanguageContext';
import { safeFetchJson } from '../../lib/safeFetchJson';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (token: string, mustChangePassword: boolean) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const { isRTL } = useLanguage();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setPassword('');
      setShowPassword(false);
      setError(null);
      setIsLoading(false);
    } else {
      setUsername('admin');
      setPassword('');
      setShowPassword(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError(isRTL ? 'يرجى إدخال اسم المستخدم وكلمة المرور' : 'Username and password required');
      return;
    }

    setIsLoading(true);
    setError(null);

    const cleanPassword = password
      .replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, '')
      .trim();

    try {
      const result = await safeFetchJson<any>('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password: cleanPassword }),
        retryOnRateLimit: true,
        maxRetries: 2,
      });

      const data = result.data;
      setIsLoading(false);

      if (!result.ok || !data?.success || !data?.token) {
        setError(data?.error || result.errorMessage || (isRTL ? 'فشل تسجيل الدخول كمسؤول' : 'Admin login failed'));
        return;
      }

      onSuccess(data.token, Boolean(data.mustChangePassword));
    } catch (err: any) {
      setIsLoading(false);
      setError(err?.message || (isRTL ? 'خطأ في الاتصال بالخادم' : 'Server connection error'));
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-200" dir={isRTL ? 'rtl' : 'ltr'}>
      <div className="relative w-full max-w-md sabaa-panel-gold rounded-2xl p-6 sm:p-7 overflow-hidden">
        {/* Top bar */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 rounded-xl bg-amber-500/12 text-amber-400 border border-amber-500/35">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-black text-slate-50">{isRTL ? 'بوابة إدارة النظام (Admin)' : 'Administrator Portal'}</h3>
              <p className="text-[11px] text-slate-400">{isRTL ? 'منطقة مخصصة للمشرف المعتمد فقط' : 'Restricted to authorized system administrators'}</p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg hover:bg-white/[0.06] transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-xl bg-rose-500/12 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              {isRTL ? 'اسم المستخدم:' : 'Username:'}
            </label>
            <div className="relative">
              <User className={`w-4 h-4 text-slate-500 absolute top-3.5 ${isRTL ? 'right-3.5' : 'left-3.5'}`} />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={isRTL ? 'اسم المشرف' : 'Admin username'}
                className={`w-full py-2.5 sabaa-well rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-amber-400 transition-all font-mono ${
                  isRTL ? 'pr-10 pl-3' : 'pl-10 pr-3'
                }`}
                autoComplete="username"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-300 mb-1.5">
              {isRTL ? 'كلمة المرور المشفرة:' : 'Password:'}
            </label>
            <div className="relative">
              <Lock className={`w-4 h-4 text-slate-500 absolute top-3.5 ${isRTL ? 'right-3.5' : 'left-3.5'}`} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full py-2.5 sabaa-well rounded-xl text-xs sm:text-sm text-slate-100 focus:outline-none focus:border-amber-400 transition-all font-mono ${
                  isRTL ? 'pr-10 pl-10' : 'pl-10 pr-10'
                }`}
                autoComplete="off"
                autoFocus
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className={`absolute top-2.5 p-1 text-slate-400 hover:text-slate-100 cursor-pointer ${
                  isRTL ? 'left-2.5' : 'right-2.5'
                }`}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="sabaa-btn-gold w-full mt-2 py-3 px-4 rounded-xl text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Key className="w-4 h-4" />
                <span>{isRTL ? 'تسجيل دخول الإدارة' : 'Authenticate Administrator'}</span>
                <ArrowRight className={`w-4 h-4 ${isRTL ? 'rotate-180' : ''}`} />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  );
};
