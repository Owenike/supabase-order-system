// pages/login.tsx
'use client';

import { useState } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  let allowRedirect = false;

  const handleLogin = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    console.log('📥 點擊登入');

    try {
      // 清掉舊的本機識別
      localStorage.removeItem('store_id');
      localStorage.removeItem('store_account_id');

      const cleanedEmail = email.trim().toLowerCase();
      console.log('🧹 清理並準備登入:', cleanedEmail);

      // Supabase Auth 登入
      const { data, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanedEmail,
        password,
      });

      if (loginError || !data.user) {
        console.warn('❌ 登入失敗:', loginError?.message);
        setError('登入失敗，請確認帳號與密碼');
        return;
      }

      console.log('✅ Supabase 登入成功:', data.user.id);

      // 查 stores 取得 store_id
      const { data: storeData, error: storeError } = await supabase
        .from('stores')
        .select('id')
        .eq('email', cleanedEmail)
        .maybeSingle();

      console.log('🏪 查詢 stores 結果:', storeData);
      if (storeError || !storeData?.id) {
        console.warn('❌ 查無對應店家');
        setError('此帳號尚未對應到任何店家');
        return;
      }

      localStorage.setItem('store_id', storeData.id);
      console.log('📦 寫入 store_id:', storeData.id);

      // 查 store_accounts 取得 store_account_id
      const { data: accountData, error: accountError } = await supabase
        .from('store_accounts')
        .select('id')
        .eq('store_id', storeData.id)
        .limit(1)
        .maybeSingle();

      console.log('🧾 查詢 store_accounts 結果:', accountData);
      if (accountError || !accountData?.id) {
        console.warn('❌ 查無對應 store_account');
        setError('此店家尚未啟用登入帳號');
        return;
      }

      localStorage.setItem('store_account_id', accountData.id);
      console.log('📥 寫入 store_account_id:', accountData.id);

      setError('✅ 登入成功，正在導向後台...');
      allowRedirect = true;
    } catch (err) {
      console.error('💥 登入流程錯誤:', err);
      setError('發生未知錯誤，請稍後再試');
    } finally {
      setLoading(false);

      if (allowRedirect) {
        console.log('🚀 跳轉中...');
        setTimeout(() => {
          window.location.href = '/redirect';
        }, 200);
      }
    }
  };

  // 允許按 Enter 提交
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleLogin();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="p-8 w-80 space-y-4">
        {/* 登入框上方的 Logo 圖
            1) 請先把圖片放在 /public 例如：/public/login-logo.png
            2) 若你的檔名不同，改下面 src 即可（例如 src="/晨芯login.png"）
        */}
        <div className="flex justify-center mb-2">
          <Image
            src="/login-logo.png"
            alt="晨芯 Logo"
            width={240}       // ⬅️ 調整大小（px）
            height={240}
            priority
            className="rounded"
          />
        </div>

        <h2 className="text-xl font-bold text-center">店家登入</h2>

        <form className="space-y-4" onSubmit={onSubmit}>
          <input
            type="email"
            className="w-full border px-3 py-2 rounded"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <input
            type="password"
            className="w-full border px-3 py-2 rounded"
            placeholder="密碼"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />

          {error && (
            <p
              className={`text-sm text-center ${
                error.startsWith('✅') ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700 transition disabled:opacity-50"
            disabled={loading}
          >
            {loading ? '登入中...' : '登入'}
          </button>
        </form>
      </div>
    </div>
  );
}
