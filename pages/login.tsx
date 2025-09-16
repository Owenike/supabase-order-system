// pages/login.tsx
'use client';

import { useState, type FormEvent } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (loading) return;
    setMsg('');
    setLoading(true);
    let allowRedirect = false;

    try {
      // 清掉舊的本機識別
      try {
        localStorage.removeItem('store_id');
        localStorage.removeItem('store_account_id');
      } catch {}

      const cleanedEmail = email.trim().toLowerCase();

      // 1) Supabase Auth 登入
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      });

      if (loginError || !data?.user) {
        setMsg('登入失敗，請確認帳號與密碼');
        return;
      }

      // 2) 依 Email 找對應店家
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('email', cleanedEmail)
        .maybeSingle();

      if (storeError || !storeData?.id) {
        setMsg('此帳號尚未對應到任何店家');
        return;
      }
      try {
        localStorage.setItem('store_id', storeData.id);
      } catch {}

      // 3) store_accounts 存在性檢查
      const { data: accountData, error: accountError } = await supabase
        .from('store_accounts')
        .select('id')
        .eq('store_id', storeData.id)
        .limit(1)
        .maybeSingle();

      if (accountError || !accountData?.id) {
        setMsg('此店家尚未啟用登入帳號');
        return;
      }
      try {
        localStorage.setItem('store_account_id', accountData.id);
      } catch {}

      setMsg('✅ 登入成功，正在導向後台…');
      allowRedirect = true;
    } catch (err) {
      console.error('💥 登入流程錯誤:', err);
      setMsg('發生未知錯誤，請稍後再試');
    } finally {
      setLoading(false);
      if (allowRedirect) {
        setTimeout(() => {
          window.location.href = '/redirect';
        }, 250);
      }
    }
  };

  // 允許 Enter 提交
  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleLogin();
  };

  return (
    <main className="bg-[#111] min-h-screen flex items-center justify-center px-4">
      {/* Autofill & 控件白字補丁（僅作用於登入卡片） */}
      <style jsx global>{`
        .auth-card input,
        .auth-card textarea,
        .auth-card select,
        .auth-card option {
          color: #fff !important;
          background-color: #1f1f1f !important;
          -webkit-text-fill-color: #fff !important;
          caret-color: #fff !important;
        }
        .auth-card ::placeholder { color: rgba(255,255,255,.4) !important; }
        .auth-card input:-webkit-autofill {
          -webkit-text-fill-color:#fff !important;
          box-shadow: 0 0 0px 1000px #1f1f1f inset !important;
          transition: background-color 5000s ease-in-out 0s !important;
        }
      `}</style>

      {/* 登入卡片（深色） */}
      <div className="auth-card w-full max-w-sm bg-[#2B2B2B] text-white rounded-xl border border-white/10 shadow p-6">
        {/* Logo：去白底、放大；加一點柔和的淺色 drop-shadow 以提升可讀性（不會有白底塊） */}
        <div className="flex flex-col items-center gap-3 mb-6">
          <Image
            src="/login-logo.png"   // ← 你的 Logo 圖（黑字/彩色）
            alt="品牌 Logo"
            width={220}             // 放大
            height={88}
            priority
            className="h-auto w-auto select-none pointer-events-none"
            style={{ filter: 'drop-shadow(0 1px 1px rgba(255,255,255,.12)) drop-shadow(0 6px 18px rgba(0,0,0,.35))' }}
          />
          <h1 className="text-xl font-bold text-white">店家登入</h1> {/* 字變大 */}
        </div>

        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm text-white/80 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded px-3 py-2 bg-[#1F1F1F] border border-white/15 focus:outline-none focus:ring-2 focus:ring-white/30"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-white/80 mb-1">密碼</label>
            <input
              type="password"
              className="w-full rounded px-3 py-2 bg-[#1F1F1F] border border-white/15 focus:outline-none focus:ring-2 focus:ring-white/30"
              placeholder="密碼"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {msg && (
            <div
              className={`text-sm text-center rounded px-3 py-2 border ${
                msg.startsWith('✅')
                  ? 'text-emerald-200 bg-emerald-500/15 border-emerald-400/30'
                  : 'text-red-200 bg-red-500/15 border-red-300/30'
              }`}
            >
              {msg}
            </div>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 hover:ring-2 hover:ring-blue-400/40 transition disabled:opacity-50"
            disabled={loading}
          >
            {loading ? '登入中…' : '登入'}
          </button>

          <div className="text-center">
            <a href="/store/forgot-password" className="text-sm text-white/70 hover:text-white">
              忘記密碼？
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
