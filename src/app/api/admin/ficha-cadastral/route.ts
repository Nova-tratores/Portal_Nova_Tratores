import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autenticar } from '@/lib/auth/server'
import { semSensiveis, manterSensiveis, type Dados } from '@/lib/admin/ficha-cadastral'
import { lerRH, completarComRH, enviarAoRH } from '@/lib/admin/ficha-rh-server'

// Ficha cadastral do colaborador (José, 09/11/2026). Três níveis:
//  - Dev: vê e edita tudo, inclusive salário/comissão do RH;
//  - Admin (não Dev): vê e edita só o que não é sensível (sem documentos,
//    saúde e banco) — os sensíveis salvos ficam intactos;
//  - a própria pessoa (?eu=1, em Configurações → Minha ficha): preenche a
//    ficha inteira dela, mas não vê salário.
// Tudo que é salvo também vai para o RH (rh_funcionarios) quando há cadastro lá.
// A tabela não tem política de RLS: só este servidor lê e grava.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

const SEM_TABELA = 'A tabela da ficha ainda não existe: rode sql/ficha-cadastral.sql no Supabase do portal.'
const semTabela = (msg?: string) => !!msg && /usuario_ficha_cadastral/.test(msg) && /(does not exist|schema cache|not find)/i.test(msg)

type Nivel = 'total' | 'parcial' | 'proprio'

async function quem(req: NextRequest, alvo: string | null, eu: boolean) {
  const auth = await autenticar(req)
  if (!auth) return { erro: 'Faça login de novo', status: 401 as const }
  if (eu || !alvo || alvo === auth.userId) return { auth, userId: auth.userId, nivel: (auth.isDev ? 'total' : 'proprio') as Nivel }
  if (!auth.isAdmin) return { erro: 'Sem permissão', status: 403 as const }
  return { auth, userId: alvo, nivel: (auth.isDev ? 'total' : 'parcial') as Nivel }
}

async function emailDe(userId: string) {
  const { data } = await supabase.from('financeiro_usu').select('email').eq('id', userId).maybeSingle()
  return (data?.email as string) || null
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = await quem(req, sp.get('user_id'), sp.get('eu') === '1')
  if ('erro' in q) return NextResponse.json({ error: q.erro }, { status: q.status })

  const { data, error } = await supabase
    .from('usuario_ficha_cadastral')
    .select('dados, atualizado_em, atualizado_por_nome')
    .eq('user_id', q.userId)
    .maybeSingle()
  if (error) return NextResponse.json({ error: semTabela(error.message) ? SEM_TABELA : error.message }, { status: 500 })

  const { resumo, sugestao } = await lerRH(q.userId, await emailDe(q.userId), q.nivel === 'total')
  let dados: Dados = completarComRH(data?.dados || {}, sugestao)
  if (q.nivel === 'parcial') dados = semSensiveis(dados)
  return NextResponse.json({
    dados, nivel: q.nivel, rh: resumo,
    atualizado_em: data?.atualizado_em || null, atualizado_por_nome: data?.atualizado_por_nome || null,
  })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const q = await quem(req, body.user_id ? String(body.user_id) : null, body.eu === true)
  if ('erro' in q) return NextResponse.json({ error: q.erro }, { status: q.status })
  let dados = body.dados
  if (!dados || typeof dados !== 'object' || Array.isArray(dados)) return NextResponse.json({ error: 'dados inválidos' }, { status: 400 })
  if (JSON.stringify(dados).length > 80_000) return NextResponse.json({ error: 'ficha grande demais' }, { status: 400 })

  if (q.nivel === 'parcial') {
    const { data: atual } = await supabase.from('usuario_ficha_cadastral').select('dados').eq('user_id', q.userId).maybeSingle()
    dados = manterSensiveis(dados, atual?.dados || {})
  }

  const { data: eu } = await supabase.from('financeiro_usu').select('nome').eq('id', q.auth.userId).maybeSingle()
  const agora = new Date().toISOString()
  const { error } = await supabase.from('usuario_ficha_cadastral').upsert({
    user_id: q.userId,
    dados,
    atualizado_em: agora,
    atualizado_por: q.auth.userId,
    atualizado_por_nome: eu?.nome || null,
  }, { onConflict: 'user_id' })
  if (error) return NextResponse.json({ error: semTabela(error.message) ? SEM_TABELA : error.message }, { status: 500 })

  // espelha no RH (não derruba o salvamento se o RH falhar)
  const rh = await enviarAoRH(q.userId, await emailDe(q.userId), dados).catch((e) => ({ ok: false, campos: [] as string[], motivo: String(e?.message || e) }))
  return NextResponse.json({ ok: true, atualizado_em: agora, atualizado_por_nome: eu?.nome || null, rh })
}
