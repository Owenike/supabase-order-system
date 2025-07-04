import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://cdzgifdgcaeswcdewwdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkemdpZmRnY2Flc3djZGV3d2RsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0ODIwMjcwNSwiZXhwIjoyMDYzNzc4NzA1fQ.ZpUE0ZAcaq8C3fQDVkGd4rxfP2my9EmhRNlTpXfZSfY'
)

async function createStoreUser() {
  const { data, error } = await supabase.auth.admin.createUser({
    email: 'store100@example.com',
    password: 'store100pw',
    email_confirm: true
  })

  if (error) {
    console.error('❌ 建立失敗:', error.message)
    return
  }

  console.log('✅ 新帳號已建立，user.id =', data.user?.id)
}

createStoreUser()
