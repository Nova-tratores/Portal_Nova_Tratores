// Salvar as decisões da comissão de um técnico no mês (José, 05/11/2026: "toda vez que fazemos alguma alteração na
// comissão ela não está salvando"). A ficha grava sozinha a cada mudança: pagar / não pagar / ajustar de cada OS e os
// descontos ainda não pedidos. Tabela: sql/posvendas-comissao-decisoes.sql (projeto do portal).
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { esquecer } from '@/lib/mecanicos/cache'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const SEM_TABELA = 'Falta rodar o SQL sql/posvendas-comissao-decisoes.sql no Supabase do portal.'
const semTabela = (m: string) => /posvendas_comissao_decisoes|relation .* does not exist|PGRST205/i.test(m)
const ACOES = new Set(['pagar', 'nao', 'ajustar'])

export async function POST(req: NextRequest) {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const b = await req.json().catch(() => ({}))
  const mes = String(b.mes || ''), tecnico = String(b.tecnico || '')
  if (!/^\d{4}-\d{2}$/.test(mes) || !tecnico) return NextResponse.json({ error: 'Dados incompletos' }, { status: 400 })
  // só o que foge do "pagar como calculado"
  const decisoes: Record<string, { acao: string; motivo: string; valor?: number }> = {}
  for (const [k, v] of Object.entries((b.decisoes || {}) as Record<string, { acao?: string; motivo?: string; valor?: unknown }>)) {
    const acao = String(v?.acao || 'pagar'), motivo = String(v?.motivo || '').slice(0, 300)
    if (!ACOES.has(acao) || (acao === 'pagar' && !motivo.trim())) continue
    decisoes[String(k).slice(0, 80)] = { acao, motivo, ...(acao === 'ajustar' ? { valor: Math.round((Number(v.valor) || 0) * 100) / 100 } : {}) }
  }
  const descontos = Array.isArray(b.descontos) ? b.descontos.slice(0, 50) : []
  const { data, error } = await sb.from('posvendas_comissao_decisoes').upsert({
    mes, tecnico, decisoes, descontos, salvo_por: g.user.email || g.user.id, salvo_por_id: g.user.id, atualizado_em: new Date().toISOString(),
  }, { onConflict: 'mes,tecnico' }).select('atualizado_em').single()
  if (error) return NextResponse.json({ error: semTabela(error.message) ? SEM_TABELA : error.message, semTabela: semTabela(error.message) }, { status: semTabela(error.message) ? 503 : 500 })
  await esquecer([`ficha13:${tecnico}:`]).catch(() => {})
  return NextResponse.json({ ok: true, em: (data as { atualizado_em: string }).atualizado_em })
}
