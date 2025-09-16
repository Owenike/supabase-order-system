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
        password
      });
      if (loginError || !data?.user) {
        setMsg('登入失敗，請確認帳號與密碼');
        return;
      }

      // 2) 由 Email 找店家
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('email', cleanedEmail)
        .maybeSingle();
      if (storeError || !storeData?.id) {
        setMsg('此帳號尚未對應到任何店家');
        return;
      }
      try { localStorage.setItem('store_id', storeData.id); } catch {}

      // 3) 檢查 store_accounts
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
      try { localStorage.setItem('store_account_id', accountData.id); } catch {}

      setMsg('✅ 登入成功，正在導向後台…');
      allowRedirect = true;
    } catch (err) {
      console.error('💥 登入流程錯誤:', err);
      setMsg('發生未知錯誤，請稍後再試');
    } finally {
      setLoading(false);
      if (allowRedirect) {
        setTimeout(() => { window.location.href = '/redirect'; }, 250);
      }
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void handleLogin();
  };

  return (
    <main className="bg-[#0B0B0B] min-h-screen flex items-center justify-center px-4">
      {/* 只作用於登入卡片：白底控件 + 黑字的 autofill 補丁 */}
      <style jsx global>{`
        .auth-card input,
        .auth-card textarea,
        .auth-card select,
        .auth-card option {
          color: #111 !important;
          background-color: #fff !important;
          -webkit-text-fill-color: #111 !important;
          caret-color: #111 !important;
        }
        .auth-card ::placeholder { color: rgba(17,17,17,.45) !important; }
        .auth-card input:-webkit-autofill {
          -webkit-text-fill-color:#111 !important;
          box-shadow: 0 0 0px 1000px #fff inset !important;
          transition: background-color 5000s ease-in-out 0s !important;
        }
      `}</style>

      {/* 登入卡片：淺色卡＋黑字＋淡邊框＋淡陰影 */}
      <div className="auth-card w-full max-w-sm rounded-2xl border border-black/10 bg-white text-gray-900 shadow-[0_6px_20px_rgba(0,0,0,.08)] p-6">
        {/* 透明 Logo（無底） */}
        <div className="flex flex-col items-center gap-4 mb-6">
          <Image
            src="/login-logo.png"   // 建議 PNG 透明底
            alt="品牌 Logo"
            width={240}
            height={96}
            priority
            className="h-auto w-auto select-none pointer-events-none"
          />
          <h1 className="text-2xl font-extrabold tracking-wide">店家登入</h1>
        </div>

        {/* 表單（白底控件 + 淺灰邊） */}
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm text-gray-700 mb-1">Email</label>
            <input
              type="email"
              className="w-full rounded px-3 py-2 bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/10"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              required
            />
          </div>

          <div>
            <label className="block text-sm text-gray-700 mb-1">密碼</label>
            <input
              type="password"
              className="w-full rounded px-3 py-2 bg-white border border-gray-300 focus:outline-none focus:ring-2 focus:ring-black/10"
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
                  ? 'text-emerald-700 bg-emerald-50 border-emerald-200'
                  : 'text-red-700 bg-red-50 border-red-200'
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
            <a href="/store/forgot-password" className="text-sm text-gray-600 hover:text-gray-800">
              忘記密碼？
            </a>
          </div>
        </form>
      </div>
    </main>
  );
}
