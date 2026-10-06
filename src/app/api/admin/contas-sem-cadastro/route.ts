// Logins (Supabase Auth) que NÃO têm cadastro no Portal (financeiro_usu).
// Conseguem autenticar mas não aparecem na Administração — esta rota as mostra
// para o admin ficar por dentro e decidir (cadastrar ou apagar o login).
// O mesmo Auth é usado pelo CRM (vendedores/supervisores): essas contas vêm
// marcadas e o banco recusa apagá-las (FK).
// GET    /api/admin/contas-sem-cadastro
// DELETE /api/admin/contas-sem-cadastro { user_id }
import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

interface ContaAuth { id: string; email?: string; created_at: string; last_sign_in_at?: string | null }

async function todasAsContas(): Promise<ContaAuth[]> {
  const out: ContaAuth[] = []
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    out.push(...(data.users as ContaAuth[]))
    if (data.users.length < 200) break
  }
  return out
}

async function usoNoCrm(ids: string[]): Promise<Map<string, string>> {
  const uso = new Map<string, string>()
  if (!ids.length) return uso
  for (const [tabela, papel] of [['vendedores', 'vendedor'], ['supervisores', 'supervisor']] as const) {
    const { data } = await supabaseAdmin.from(tabela).select('auth_uid, nome, ativo').in('auth_uid', ids)
    for (const r of data || []) uso.set(r.auth_uid, `CRM: ${papel} "${r.nome}"${r.ativo === false ? ' (inativo)' : ''}`)
  }
  return uso
}

export async function GET(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  try {
    const [contas, { data: perfis }] = await Promise.all([todasAsContas(), supabaseAdmin.from('financeiro_usu').select('id')])
    const comPerfil = new Set((perfis || []).map((p) => p.id))
    const sem = contas.filter((c) => !comPerfil.has(c.id))
    const crm = await usoNoCrm(sem.map((c) => c.id))
    return NextResponse.json({
      contas: sem
        .map((c) => ({ id: c.id, email: c.email || '', criado_em: c.created_at, ultimo_acesso: c.last_sign_in_at || null, uso: crm.get(c.id) || null }))
        .sort((a, b) => b.criado_em.localeCompare(a.criado_em)),
    })
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const userId = String(body.user_id || '')
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return NextResponse.json({ error: 'user_id inválido' }, { status: 400 })
  if (userId === auth.userId) return NextResponse.json({ error: 'Não pode apagar a própria conta' }, { status: 400 })
  // Só conta SEM cadastro no Portal (quem tem cadastro se inativa, não se apaga)
  const { data: perfil } = await supabaseAdmin.from('financeiro_usu').select('id').eq('id', userId).maybeSingle()
  if (perfil) return NextResponse.json({ error: 'Esta conta tem cadastro no Portal — use Inativar.' }, { status: 400 })
  const crm = await usoNoCrm([userId])
  if (crm.has(userId)) return NextResponse.json({ error: `Este login é usado no ${crm.get(userId)}. Tire-o do CRM antes de apagar.` }, { status: 409 })
  await supabaseAdmin.from('portal_permissoes').delete().eq('user_id', userId)
  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId)
  if (error) return NextResponse.json({ error: error.message.includes('foreign key') ? 'Este login está ligado a outro sistema e não pode ser apagado.' : error.message }, { status: 409 })
  return NextResponse.json({ ok: true })
}
