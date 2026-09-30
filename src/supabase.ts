import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://djnvqoautxjyecfjuwhd.supabase.co'
const supabaseKey = 'sb_publishable_kBgEq9htfHu_1_2Eon_3nQ_ZbNzIlqo'

export const supabase = createClient(supabaseUrl, supabaseKey)
