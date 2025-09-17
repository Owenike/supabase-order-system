// pages/store/forgot-password.tsx
'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSend = async () => {
    if (loading) return;
    setMsg('');
    setErr('');

    const cleaned = email.trim().toLowerCase();
    if (!cleaned) {
      setErr('請輸入註冊 Email');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(cleaned, {
        redirectTo: `${window.location.origin}/store/reset-password`,
      });

      if (error) {
        setErr('寄送失敗，請確認 Email 是否存在或稍後再試');
      } else {
        setMsg('✅ 重設連結已寄出，請至信箱查收');
      }
    } catch (e) {
      console.error('resetPassword error', e);
      setErr('系統忙碌，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleSend();
  };

  return (
    <>
      {/* 覆蓋式全螢幕背景：把外層共用面板完全遮住 */}
      <div className="fixed inset-0 bg-[#0B0B0B] z-40" aria-hidden />

      {/* 置中卡片容器（永遠在最上層） */}
      <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
        {/* 只作用於登入/認證卡片：深色半透明 + Autofill 視覺修正（與 /pages/login.tsx 相同） */}
        <style jsx global>{`
          .auth-card input,
          .auth-card textarea,
          .auth-card select,
          .auth-card option {
            color: #fff !important;
            background-color: rgba(255, 255, 255, 0.06) !important; /* 與 bg-white/5 對應 */
            -webkit-text-fill-color: #fff !important;
            caret-color: #fff !important;
          }
          .auth-card ::placeholder {
            color: rgba(255, 255, 255, 0.5) !important;
          }
          .auth-card input:-webkit-autofill {
            -webkit-text-fill-color: #fff !important;
            box-shadow: 0 0 0px 1000px rgba(255, 255, 255, 0.06) inset !important;
            transition: background-color 5000s ease-in-out 0s !important;
            caret-color: #fff !important;
          }
        `}</style>

        {/* 卡片：半透明灰框 + 玻璃感（與登入頁一致） */}
        <div className="auth-card w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 backdrop-blur-xl text-gray-100 shadow-[0_12px_40px_rgba(0,0,0,.35)] p-6">
          {/* Logo + 標題 */}
          <div className="flex flex-col items-center gap-4 mb-6">
            <Image
              src="/login-logo.png"
              alt="品牌 Logo"
              width={240}
              height={96}
              priority
              className="h-auto w-auto select-none pointer-events-none"
            />
            <h1 className="text-2xl font-extrabold tracking-wide">忘記密碼</h1>
            <p className="text-sm text-gray-400 text-center">
              輸入註冊 Email，我們會寄送重設密碼連結。
            </p>
          </div>

          {/* 表單 */}
          <form className="space-y-3" onSubmit={onSubmit}>
            <div>
              <label className="block text-sm text-gray-300 mb-1">Email</label>
              <input
                type="email"
                className="w-full rounded-lg px-3 py-2 bg-white/5 border border-white/15 text-white placeholder-white/50 focus:outline-none focus:ring-2 focus:ring-amber-400/40 focus:border-amber-300/40"
                placeholder="請輸入註冊 Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </div>

            {/* 訊息區（與登入頁相同的樣式規則） */}
            {(msg || err) && (
              <div
                className={`text-sm text-center rounded-lg px-3 py-2 border ${
                  msg
                    ? 'text-emerald-200 bg-emerald-600/20 border-emerald-400/30'
                    : 'text-red-200 bg-red-600/20 border-red-400/30'
                }`}
              >
                {msg || err}
              </div>
            )}

            {/* 主要按鈕（Amber 主色） */}
            <button
              type="submit"
              className="w-full py-2.5 rounded-xl bg-amber-400 text-black font-semibold shadow-[0_6px_20px_rgba(255,193,7,.25)] hover:bg-amber-500 hover:shadow-[0_8px_24px_rgba(255,193,7,.35)] focus:outline-none focus:ring-2 focus:ring-amber-300 disabled:opacity-60 disabled:cursor-not-allowed transition"
              disabled={loading}
            >
              {loading ? '寄送中…' : '寄送重設密碼連結'}
            </button>

            {/* 底部小連結：返回登入 */}
            <div className="text-center">
              <a href="/login" className="text-sm text-gray-400 hover:text-white">
                返回登入
              </a>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
