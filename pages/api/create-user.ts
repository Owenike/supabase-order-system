// pages/api/create-user.ts

import { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cdzgifdgcaeswcdewwdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkemdpZmRnY2Flc3djZGV3d2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwMjcwNSwiZXhwIjoyMDYzNzc4NzA1fQ.ZpUE0ZAcaq8C3fQDVkGd4rxfP2my9EmhRNlTpXfZSfY'
)

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Only POST method allowed' })
  }

  const { email, password } = req.body

  if (!email || !password) {
    return res.status(400).json({ error: 'Missing email or password' })
  }

  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    })

    if (error) {
      return res.status(500).json({ error: error.message })
    }

    return res.status(200).json({ message: 'User created', user: data.user })
  } catch {
    return res.status(500).json({ error: 'Unexpected server error' })
  }
}
