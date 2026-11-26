// Admin → celular (WhatsApp) do usuário (José, 24/11/2026). É o número usado nos avisos pelo Chatwoot
// (pedido de autorização, convite de reunião). POST { user_id, celular } — celular vazio apaga.
import { NextRequest, NextResponse } from 'next/server'
import { exigirAdmin } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { normalizarCelular } from '@/lib/reunioes/convite'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const auth = await exigirAdmin(req)
  if (!auth) return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  const body = await req.json().catch(() => ({}))
  const userId = String(body.user_id || '').trim()
  if (!userId) return NextResponse.json({ error: 'user_id obrigatório' }, { status: 400 })
  const bruto = String(body.celular || '').trim()
  const celular = bruto ? normalizarCelular(bruto) : null
  if (bruto && !celular) return NextResponse.json({ error: 'Celular inválido. Use DDD + número, ex.: (15) 99999-1234.' }, { status: 400 })
  const { error } = await supabaseAdmin.from('financeiro_usu').update({ celular }).eq('id', userId)
  if (error) return NextResponse.json({ error: /celular/.test(error.message) ? 'Falta rodar sql/reunioes-convite.sql no Supabase.' : error.message }, { status: 500 })
  try {
    await supabaseAdmin.from('audit_log').insert([{ user_id: auth.userId, user_nome: auth.email, sistema: 'admin', acao: 'trocar_celular', entidade: 'financeiro_usu', entidade_id: userId, entidade_label: celular || '(apagado)' }])
  } catch { /* log é best-effort */ }
  return NextResponse.json({ ok: true, celular })
}
