// Garantias para o Centro do Pós-Vendas (José, 19/10/2026: "opções melhores para entender as garantias,
// pegando direto do módulo de garantia"). Só leitura das tabelas do módulo (garantias + peças + pendências
// + montadora). Valor esperado = peças + horas × valor/h da fábrica + km × valor/km da fábrica.
// GET → { hoje, garantias: [...] }
import { NextRequest, NextResponse } from 'next/server'
import { protegerRota } from '@/lib/ajustes/permissao-server'
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_GARANTIAS, valoresFabrica } from '@/lib/garantias/constants'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export async function GET(req: NextRequest) {
  const guarda = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }, { modulo: 'garantias' }])
  if (guarda.resposta) return guarda.resposta
  const out: Record<string, unknown>[] = []
  for (let de = 0; de < 20000; de += 1000) {
    const { data, error } = await sb.from(TBL_GARANTIAS)
      .select('id, numero, numero_externo, id_ordem, cliente, modelo, chassis, status, tecnico_nome, garantista_nome, tecnico_horas, tecnico_km, garantista_horas, garantista_km, resultado, motivo_recusa, recusado_por, valor_pago_total, enviada_fabrica_em, finalizada_em, created_at, updated_at, cobranca_status, cobranca_valor_total, cobranca_vencimento, devolucao_status, devolucao_prazo, montadora:garantia_montadoras(id, nome, cor, valor_hora, valor_km), pecas:garantia_pecas(quantidade, preco_unitario, resultado), pendencias:garantia_pendencias(status, tipo)')
      .neq('status', 'cancelada').order('created_at', { ascending: false }).range(de, de + 999)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const g of data || []) {
      const m = g.montadora as unknown as { id: string; nome: string; cor: string | null; valor_hora: number | null; valor_km: number | null } | null
      const vf = valoresFabrica(m)
      const horas = g.garantista_horas != null ? n(g.garantista_horas) : n(g.tecnico_horas)
      const km = g.garantista_km != null ? n(g.garantista_km) : n(g.tecnico_km)
      const pecas = ((g.pecas || []) as { quantidade: number; preco_unitario: number }[]).reduce((s, p) => s + n(p.quantidade) * n(p.preco_unitario), 0)
      const pend = ((g.pendencias || []) as { status: string; tipo: string }[]).filter((p) => p.status === 'aberta')
      out.push({
        id: g.id, numero: g.numero, numeroExterno: g.numero_externo, os: g.id_ordem, cliente: g.cliente, modelo: g.modelo, chassis: g.chassis,
        status: g.status, tecnico: g.tecnico_nome, garantista: g.garantista_nome, recusadoPor: g.recusado_por, motivo: g.motivo_recusa,
        montadora: m ? { nome: m.nome, cor: m.cor } : null,
        horas, km, valorPecas: Math.round(pecas * 100) / 100, valorServico: Math.round((horas * vf.hora + km * vf.km) * 100) / 100,
        esperado: Math.round((pecas + horas * vf.hora + km * vf.km) * 100) / 100, pago: n(g.valor_pago_total),
        criadaEm: g.created_at, enviadaEm: g.enviada_fabrica_em, finalizadaEm: g.finalizada_em, mexidaEm: g.updated_at,
        cobranca: { status: g.cobranca_status, valor: n(g.cobranca_valor_total), vencimento: g.cobranca_vencimento },
        devolucao: { status: g.devolucao_status, prazo: g.devolucao_prazo },
        pendencias: pend.length, pendenciaTipos: pend.map((p) => p.tipo),
      })
    }
    if ((data || []).length < 1000) break
  }
  return NextResponse.json({ hoje: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), garantias: out })
}
