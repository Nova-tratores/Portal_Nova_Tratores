import { createClient } from '@supabase/supabase-js'
// Client service-role (ignora RLS). No navegador degrada pra anon (a service key
// nao existe no bundle do browser), entao e seguro importar em qualquer lugar.
export const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)
