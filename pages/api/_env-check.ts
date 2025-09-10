import type { NextApiRequest, NextApiResponse } from 'next'
export default function handler(_req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    hasSecret: !!process.env.LINE_CHANNEL_SECRET,
    hasToken:  !!process.env.LINE_CHANNEL_ACCESS_TOKEN,
    liffId:    process.env.NEXT_PUBLIC_LIFF_ID ? 'present' : 'missing'
  })
}
