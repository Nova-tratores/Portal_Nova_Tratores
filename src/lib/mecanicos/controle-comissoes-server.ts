// Controle das comissões (José, 04/11/2026: "um controle de comissão, para vermos se já foi enviada e de qual mês
// e tudo mais") — SÓ SERVIDOR. Junta, pessoa × mês, o pedido ao diretor (posvendas_comissoes) e o lançamento no RH
// (rh_comissoes): enviada? autorizada? está no RH? já foi paga? Quem entra: quem teve comissão no RH ou pedido
// nos meses pedidos.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { clienteRH } from './rh-server'
import { casarNome } from './ocorrencias-painel'

export type EtapaControle = 'paga' | 'no_rh' | 'rh_falta_aprovar' | 'rh_rascunho' | 'com_diretor' | 'devolvida' | 'erro_rh' | 'nao_enviada' | 'em_andamento'
export interface CelulaControle {
  etapa: EtapaControle
  valor: number | null
  /** pedido ao diretor (o mais novo que vale) */
  pedido: { valor: number; status: string; por: string | null; em: string; decididoPor: string | null; decididoEm: string | null; observacao: string | null } | null
  /** lançamento no RH */
  rh: { valor: number; status: string; pagoEm: string | null; aprovadoEm: string | null; origem: string | null } | null
  /** lançada direto no RH, sem passar pelo pedido do portal */
  diretoNoRH: boolean
}
export interface LinhaControle { nome: string; cargo: string | null; ativo: boolean; meses: Record<string, CelulaControle> }

type Rec = Record<string, unknown>
const VALE = ['aguardando', 'devolvida', 'erro_rh', 'espelhada']

export async function controleComissoes(meses: string[], hojeMes: string): Promise<{ meses: string[]; linhas: LinhaControle[]; semRH: boolean }> {
  const ord = [...meses].sort()
  const de = ord[0], ate = ord[ord.length - 1]
  const c = clienteRH()
  const { data: peds } = await sb.from('posvendas_comissoes').select('tecnico, mes, valor, status, pedido_por, pedido_em, decidido_por, decidido_em, observacao')
    .gte('mes', de).lte('mes', ate).in('status', VALE).order('pedido_em', { ascending: false })
  const pedidos = (peds || []) as Rec[]
  let fun: Rec[] = [], rhs: Rec[] = []
  if (c) {
    fun = ((await c.from('rh_funcionarios').select('id, nome, cargo, departamento, status')).data || []) as Rec[]
    const anos = [...new Set(ord.map((m) => Number(m.slice(0, 4))))]
    rhs = ((await c.from('rh_comissoes').select('funcionario_id, competencia_mes, competencia_ano, valor, status, pago_em, aprovado_em, origem_descricao')
      .in('competencia_ano', anos).not('status', 'in', '(cancelada,rejeitada)')).data || []) as Rec[]
  }
  const chaveRH = (r: Rec) => `${r.competencia_ano}-${String(r.competencia_mes).padStart(2, '0')}`
  rhs = rhs.filter((r) => ord.includes(chaveRH(r)))
  const comRH = new Set(rhs.map((r) => String(r.funcionario_id)))
  // só quem teve comissão no RH no período (ou pedido, abaixo): quem nunca recebe não vira "não enviada"
  const gente = fun.filter((f) => comRH.has(String(f.id)) && /p[óo]s.?vendas/i.test(String(f.departamento || '')))
  const nomesRH = gente.map((f) => String(f.nome))
  // pedido do portal com o nome do portal → pessoa do RH
  const donoPedido = new Map<string, string>()
  for (const n of new Set(pedidos.map((p) => String(p.tecnico)))) donoPedido.set(n, casarNome(n, nomesRH) || n)
  const linhas: LinhaControle[] = []
  const todas = [...new Set([...nomesRH, ...donoPedido.values()])]
  for (const nome of todas) {
    const f = gente.find((x) => x.nome === nome)
    const ms: Record<string, CelulaControle> = {}
    for (const m of ord) {
      const p = pedidos.find((x) => donoPedido.get(String(x.tecnico)) === nome && x.mes === m) || null
      const doMes = f ? rhs.filter((x) => String(x.funcionario_id) === String(f.id) && chaveRH(x) === m) : []
      const r = doMes.find((x) => x.status === 'paga') || doMes[0] || null
      const pedido = p ? { valor: Number(p.valor) || 0, status: String(p.status), por: (p.pedido_por as string) || null, em: String(p.pedido_em), decididoPor: (p.decidido_por as string) || null, decididoEm: (p.decidido_em as string) || null, observacao: (p.observacao as string) || null } : null
      const rh = r ? { valor: Number(r.valor) || 0, status: String(r.status), pagoEm: (r.pago_em as string) || null, aprovadoEm: (r.aprovado_em as string) || null, origem: (r.origem_descricao as string) || null } : null
      let etapa: EtapaControle
      if (rh?.status === 'paga') etapa = 'paga'
      else if (pedido?.status === 'aguardando') etapa = 'com_diretor'
      else if (pedido?.status === 'devolvida') etapa = 'devolvida'
      else if (pedido?.status === 'erro_rh') etapa = 'erro_rh'
      else if (rh?.status === 'aprovada') etapa = 'no_rh'
      else if (rh?.status === 'pendente_aprovacao') etapa = 'rh_falta_aprovar'
      else if (rh) etapa = 'rh_rascunho'
      else etapa = m >= hojeMes ? 'em_andamento' : 'nao_enviada'
      ms[m] = { etapa, valor: rh ? rh.valor : pedido ? pedido.valor : null, pedido, rh, diretoNoRH: !!rh && pedido?.status !== 'espelhada' }
    }
    linhas.push({ nome, cargo: (f?.cargo as string) || null, ativo: !!f && f.status !== 'desligado', meses: ms })
  }
  linhas.sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome))
  return { meses: ord, linhas, semRH: !c }
}
