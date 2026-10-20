// % de comissão da OS (José, 20/10/2026): o pós-vendas muda a % daquele serviço e, se for diferente da % dos
// técnicos, diz por quê. GET = situação + % de cada técnico + histórico · PUT {pct|null, motivo}.
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { carregarPctComissao } from '@/lib/mecanicos/gastos-server'
import { padronizadorOcorrencias } from '@/lib/mecanicos/ocorrencias-server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
type Rec = Record<string, unknown>
const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || /does not exist|could not find/i.test(e.message || ''))
const SEM_SQL = 'Falta rodar o SQL sql/posvendas-comissao-os.sql'

async function tecnicosDaOS(id: string) {
  const { data } = await sb.from('Ordem_Servico').select('Os_Tecnico, Os_Tecnico2').eq('Id_Ordem', id).maybeSingle()
  const { padronizar } = await padronizadorOcorrencias()
  const nomes = [...new Set([(data as Rec | null)?.Os_Tecnico, (data as Rec | null)?.Os_Tecnico2].map(padronizar).filter(Boolean))] as string[]
  const pct = await carregarPctComissao(padronizar, new Set(nomes)).catch(() => ({} as Record<string, number>))
  return nomes.map((nome) => ({ nome, pct: pct[nome] ?? null }))
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  const tecnicos = await tecnicosDaOS(id)
  const { data, error } = await sb.from('posvendas_comissao_os').select('pct, motivo, alterado_por, alterado_em').eq('id_ordem', id).maybeSingle()
  if (error && falta(error)) return NextResponse.json({ semTabela: true, erro: SEM_SQL, tecnicos })
  const { data: log } = await sb.from('posvendas_comissao_os_log').select('pct_de, pct_para, motivo, autor, em').eq('id_ordem', id).order('em', { ascending: false }).limit(20)
  return NextResponse.json({ atual: data || null, tecnicos, log: log || [] })
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const g = await protegerRota(req, [{ modulo: 'pos' }, { modulo: 'mecanicos' }])
  if (g.resposta) return g.resposta
  const { id } = await ctx.params
  const b = await req.json().catch(() => ({}))
  const motivo = String(b.motivo || '').trim()
  const pct = b.pct == null || b.pct === '' ? null : Math.round(Number(String(b.pct).replace(',', '.')) * 100) / 100
  if (pct != null && !(pct >= 0 && pct <= 100)) return NextResponse.json({ erro: 'A % tem que ficar entre 0 e 100' }, { status: 400 })
  const tecnicos = await tecnicosDaOS(id)
  const diferente = pct != null && tecnicos.some((t) => t.pct == null || Math.abs(t.pct - pct) > 0.001)
  if ((diferente || pct == null) && !motivo) return NextResponse.json({ erro: pct == null ? 'Diga por que voltou para a % de cada técnico' : 'A % é diferente da dos técnicos — diga por quê' }, { status: 400 })
  const { data: antes, error: e0 } = await sb.from('posvendas_comissao_os').select('pct').eq('id_ordem', id).maybeSingle()
  if (e0 && falta(e0)) return NextResponse.json({ erro: SEM_SQL, semTabela: true }, { status: 503 })
  const autor = autorDe(g.user!)
  if (pct == null) {
    const { error } = await sb.from('posvendas_comissao_os').delete().eq('id_ordem', id)
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  } else {
    const { error } = await sb.from('posvendas_comissao_os').upsert({ id_ordem: id, pct, motivo: motivo || 'igual à % dos técnicos', alterado_por: autor, alterado_por_id: g.user!.id, alterado_em: new Date().toISOString() })
    if (error) return NextResponse.json({ erro: error.message }, { status: 500 })
  }
  await sb.from('posvendas_comissao_os_log').insert({ id_ordem: id, pct_de: (antes as Rec | null)?.pct ?? null, pct_para: pct, motivo: motivo || null, autor, autor_id: g.user!.id }).then(() => {}, () => {})
  return NextResponse.json({ ok: true })
}
