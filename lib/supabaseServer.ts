// lib/supabaseServer.ts
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import type { NextApiRequest, NextApiResponse } from 'next';
import { serialize } from 'cookie';

/**
 * 在 Next.js Pages Router 的 API Route 中建立可讀寫 Cookie 的 Supabase Server Client
 * - 正確序列化 Set-Cookie（不會覆蓋既有 header）
 * - 依環境帶入 Secure/SameSite
 */
export function createServerSupabaseClient(req: NextApiRequest, res: NextApiResponse) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_URL');
  if (!anon) throw new Error('Missing env: NEXT_PUBLIC_SUPABASE_ANON_KEY');

  const isProd = process.env.NODE_ENV === 'production';

  // 便捷方法：將新的 Set-Cookie 追加到回應，而不是覆蓋
  const appendSetCookie = (cookieStr: string) => {
    const current = res.getHeader('Set-Cookie');
    if (!current) {
      res.setHeader('Set-Cookie', cookieStr);
    } else if (Array.isArray(current)) {
      res.setHeader('Set-Cookie', [...current, cookieStr]);
    } else {
      res.setHeader('Set-Cookie', [current.toString(), cookieStr]);
    }
  };

  return createServerClient(url, anon, {
    cookies: {
      get(name: string) {
        return req.cookies?.[name];
      },
      set(name: string, value: string, options?: CookieOptions) {
        const cookie = serialize(name, value, {
          path: options?.path ?? '/',
          httpOnly: options?.httpOnly ?? true,
          sameSite: (options?.sameSite as any) ?? (isProd ? 'lax' : 'lax'),
          secure: options?.secure ?? isProd,
          maxAge: options?.maxAge,
          expires: options?.expires,
          domain: options?.domain,
        });
        appendSetCookie(cookie);
      },
      remove(name: string, options?: CookieOptions) {
        const cookie = serialize(name, '', {
          path: options?.path ?? '/',
          domain: options?.domain,
          expires: new Date(0),
          maxAge: 0,
        });
        appendSetCookie(cookie);
      },
    },
  });
}
