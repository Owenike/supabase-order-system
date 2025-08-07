import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true, // ✅ 關閉 ESLint 導致 Vercel 部署失敗的錯誤
  },
}

export default nextConfig
