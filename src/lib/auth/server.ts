// Autenticação/autorização no SERVIDOR.
//
// O portal não tinha checagem de identidade nas rotas de API — a autorização
// era feita só no frontend (usePermissoes), o que é contornável chamando a rota
// direto. Este helper valida o JWT do Supabase enviado no header Authorization e
// resolve as permissões (is_admin/is_dev) a partir de portal_permissoes.
//
// Uso numa rota:
//   const auth = await autenticar(req)
//   if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
//   if (!auth.isAdmin) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

// Cliente com service role (ignora RLS) para ler permissões e validar o token.
function adminClient() {
  return createClient(URL, SERVICE_KEY || ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export interface Autenticado {
  userId: string
  email: string | null
  isAdmin: boolean
  isDev: boolean
  categoria: string | null
  modulos: string[]
}

function extrairToken(req: Request): string {
  const h = req.headers.get('authorization') || req.headers.get('Authorization') || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

// Valida o token do chamador e devolve identidade + flags de permissão.
// Devolve null se não houver token válido.
export async function autenticar(req: Request): Promise<Autenticado | null> {
  const token = extrairToken(req)
  if (!token) return null

  const supa = adminClient()
  const { data, error } = await supa.auth.getUser(token)
  if (error || !data?.user) return null
  const userId = data.user.id

  const { data: perm } = await supa
    .from('portal_permissoes')
    .select('is_admin, is_dev, categoria, modulos_permitidos')
    .eq('user_id', userId)
    .maybeSingle()

  const isDev = perm?.is_dev === true
  const isAdmin = perm?.is_admin === true || isDev
  return {
    userId,
    email: data.user.email ?? null,
    isAdmin,
    isDev,
    categoria: perm?.categoria ?? null,
    modulos: Array.isArray(perm?.modulos_permitidos) ? perm.modulos_permitidos : [],
  }
}

// Igual a autenticar, mas devolve null se o chamador não for admin.
export async function exigirAdmin(req: Request): Promise<Autenticado | null> {
  const auth = await autenticar(req)
  if (!auth || !auth.isAdmin) return null
  return auth
}
