// Gastos do pós-vendas (José, 16/10/2026): abastecimento e alimentação — leitura no banco.
// Quem é do pós-vendas (levantado em 16/10):
//  - Abastecimento no cartão-frota: abastecimentos.departamento = 'OFICINA' (motorista = técnico).
//  - Requisição "Veicular Abastecimento" do setor Oficina.
//  - Requisição "Alimentação" do setor Trator-Cliente (a que a OS abre sozinha) ou Oficina.
// O Comercial fica de fora. Requisição na lixeira/cancelada não conta.
// Alimentação ligada a uma OS JÁ entra no custo de terceiros da OS (painel-server) — `naOS` marca
// para não descontar duas vezes no resultado.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { parseValorMisto } from '@/lib/marketing/custos'
import type { Gasto } from './painel'

type Rec = Record<string, unknown>
const diaSP = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

async function paginar(montar: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Rec[]> {
  const out: Rec[] = []
  for (let de = 0; de < 100000; de += 1000) {
    const { data, error } = await montar(de, de + 999)
    if (error) throw new Error(error.message)
    const l = (data || []) as Rec[]
    out.push(...l)
    if (l.length < 1000) break
  }
  return out
}

export async function carregarGastos(de: string, ate: string, padronizar: (n: unknown) => string): Promise<Gasto[]> {
  const [cartao, reqs] = await Promise.all([
    paginar((x, y) => sb.from('abastecimentos').select('data_transacao, motorista_nome, valor_total, litros, placa, departamento')
      .eq('departamento', 'OFICINA').gte('data_transacao', `${de}T00:00:00-03:00`).lte('data_transacao', `${ate}T23:59:59-03:00`).range(x, y)),
    paginar((x, y) => sb.from('Requisicao').select('id, data, tipo, setor, solicitante, valor_despeza, status, ordem_servico, litros_combustivel')
      .in('tipo', ['Alimentação', 'Veicular Abastecimento']).gte('data', de).lte('data', ate).range(x, y)),
  ])
  const out: Gasto[] = []
  for (const a of cartao) {
    const valor = Number(a.valor_total) || 0
    if (!valor || !a.data_transacao) continue
    out.push({ data: diaSP(String(a.data_transacao)), pessoa: padronizar(a.motorista_nome) || 'Sem motorista', tipo: 'abastecimento', origem: 'cartao', valor, litros: Number(a.litros) || 0, naOS: false })
  }
  for (const r of reqs) {
    if (/lixeira|cancel/i.test(String(r.status || ''))) continue
    const setor = String(r.setor || '')
    const ok = r.tipo === 'Alimentação' ? /trator-cliente|oficina/i.test(setor) : /oficina/i.test(setor)
    if (!ok) continue
    const valor = parseValorMisto(r.valor_despeza)
    if (!valor || !r.data) continue
    out.push({
      data: String(r.data).slice(0, 10), pessoa: padronizar(r.solicitante) || 'Sem solicitante',
      tipo: r.tipo === 'Alimentação' ? 'alimentacao' : 'abastecimento', origem: 'requisicao', valor,
      litros: Number(r.litros_combustivel) || 0, naOS: !!r.ordem_servico, ref: `#${r.id}${r.ordem_servico ? ` · ${r.ordem_servico}` : ''}`,
    })
  }
  return out
}
