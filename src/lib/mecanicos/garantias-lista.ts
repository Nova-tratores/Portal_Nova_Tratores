// Garantias do Centro do Pós-Vendas — a lista (antes dentro de /api/mecanicos/garantias). Guardada
// (comCache): a tela abre na hora com o último resultado e ele se refaz por trás se passou de 2 min; o robô
// do painel deixa pronta (José, 22/10/2026: "deixa ela já carregada").
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { TBL_GARANTIAS, valoresFabrica } from '@/lib/garantias/constants'
import { comCache } from '@/lib/mecanicos/cache'

const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export async function listarGarantiasPainel(): Promise<{ hoje: string; garantias: Record<string, unknown>[] }> {
  const out: Record<string, unknown>[] = []
  for (let de = 0; de < 20000; de += 1000) {
    const { data, error } = await sb.from(TBL_GARANTIAS)
      .select('id, numero, numero_externo, id_ordem, cliente, modelo, chassis, status, tecnico_nome, garantista_nome, tecnico_horas, tecnico_km, garantista_horas, garantista_km, resultado, motivo_recusa, recusado_por, valor_pago_total, enviada_fabrica_em, finalizada_em, created_at, updated_at, cobranca_status, cobranca_valor_total, cobranca_vencimento, devolucao_status, devolucao_prazo, montadora:garantia_montadoras(id, nome, cor, valor_hora, valor_km), pecas:garantia_pecas(quantidade, preco_unitario, resultado), pendencias:garantia_pendencias(status, tipo)')
      .neq('status', 'cancelada').order('created_at', { ascending: false }).range(de, de + 999)
    if (error) throw new Error(error.message)
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
  return { hoje: new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()), garantias: out }
}

export function garantiasPainelComCache(forcar = false) {
  return comCache('garantias-painel', 2 * 60_000, listarGarantiasPainel, forcar)
}
