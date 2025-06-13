import { createBrowserClient } from '@supabase/ssr'

export const supabase = createBrowserClient(
  'https://cdzgifdgcaeswcdewwdl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNkemdpZmRnY2Flc3djZGV3d2RsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDgyMDI3MDUsImV4cCI6MjA2Mzc3ODcwNX0.QVioMxAmy9xePpmCpq0y8GX2HJ19RHzWWbhjwIHvv5o'
)
