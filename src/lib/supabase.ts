import { createClient } from '@supabase/supabase-js'

// Public project URL and publishable key — safe in the browser; row-level security protects the data.
const URL = 'https://lsvzudrcmjxeerarfevw.supabase.co'
const KEY = 'sb_publishable_z_jlpq7Ox_UXZWcQ0xNE8w_qg19YKP6'

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'planet:auth' },
})
