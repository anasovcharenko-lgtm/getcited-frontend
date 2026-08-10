import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://lagtrarcdihidlmhncwt.supabase.co'
const supabaseKey = 'sb_publishable_-bElDcDBKYlSmaiDrl8hOw_Ts0YsR5f'

export const supabase = createClient(supabaseUrl, supabaseKey)
