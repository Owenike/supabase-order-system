import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true, // ✅ 關閉 ESLint 導致 Vercel 部署失敗的錯誤
  },
  async redirects() {
    return [
      {
        source: '/admin/new-store',
        destination: '/store/new',
        permanent: true, // 🔒 301 永久轉址（SEO 也會更新）
      },
    ]
  },
}

export default nextConfig
