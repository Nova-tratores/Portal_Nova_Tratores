import { createClient } from '@supabase/supabase-js'
import { comMidia } from '@/lib/midia';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = comMidia(createClient(supabaseUrl, supabaseKey))
