// CENTRAL DE TRABALHO — "pede para Fulano abrir um ticket novo".
// POST /api/trabalho/pedir-ticket { para: uuid, texto: string }
// Usado na Nova tarefa quando nenhum ticket em comum é do assunto: em vez de
// enfiar a tarefa num ticket que não tem nada a ver, quem pediu avisa a outra
// pessoa, que recebe no sino um link que abre o "Novo ticket" já preenchido.
import { NextRequest, NextResponse } from 'next/server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { temModuloTickets } from '@/lib/tickets/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await autenticar(req)
  if (!auth) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  if (!temModuloTickets(auth)) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const para = String(body.para || '')
  const texto = String(body.texto || '').trim().slice(0, 300)
  if (!/^[0-9a-f-]{36}$/i.test(para)) return NextResponse.json({ error: 'Escolha a pessoa' }, { status: 400 })
  if (para === auth.userId) return NextResponse.json({ error: 'Para você mesmo, abra o ticket direto.' }, { status: 400 })
  if (!texto) return NextResponse.json({ error: 'Diga do que se trata' }, { status: 400 })

  const [{ data: dest }, { data: autor }] = await Promise.all([
    supabaseAdmin.from('financeiro_usu').select('id, ativo').eq('id', para).maybeSingle(),
    supabaseAdmin.from('financeiro_usu').select('nome').eq('id', auth.userId).maybeSingle(),
  ])
  if (!dest || dest.ativo === false) return NextResponse.json({ error: 'Pessoa inválida ou inativa' }, { status: 400 })

  const nome = autor?.nome || 'Alguém'
  const q = new URLSearchParams({ novoTicket: '1', titulo: texto, pedidoDe: nome })
  const { error } = await supabaseAdmin.from('portal_notificacoes').insert({
    user_id: para,
    tipo: 'tickets',
    titulo: `${nome} pediu para você abrir um ticket`,
    descricao: texto,
    link: `/tickets/quadros?${q.toString()}`,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
