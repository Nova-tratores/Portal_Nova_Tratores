// Leitura das contas a pagar do Omie (espelho) de uma área de blocos, pelo vencimento no mês (06/11/2026).
// Usada pelas rotas /api/dre-financeiro/pessoas e /api/dre-financeiro/contas-do-mes.
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'
import { aplicarConta } from '@/lib/dre-financeiro/calc'
import { hoje, statusDerivado } from '@/lib/dre-financeiro/dates'
import { blocoDe, type BlocoModulo, type ContaModulo } from './modulosContas'

export const mesValido = (m: string | null) => (m && /^\d{4}-\d{2}$/.test(m) ? m : null)
export const mesDeHoje = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 7)
export const fimDoMes = (m: string) => { const [a, n] = m.split('-').map(Number); return `${m}-${String(new Date(Date.UTC(a, n, 0)).getUTCDate()).padStart(2, '0')}` }

export async function lerContasModulo(blocos: BlocoModulo[], mes: string, conta: 'nova' | 'castro'): Promise<ContaModulo[]> {
  if (!supabase) throw new Error('Supabase nao configurado')
  const { data, error } = await aplicarConta(
    supabase.from('contas_pagar')
      .select('codigo_lancamento, nome_fornecedor, descricao_categoria, numero_documento, observacao, data_vencimento, data_pagamento, valor_documento, valor_pago, status_titulo')
      .gte('data_vencimento', `${mes}-01`).lte('data_vencimento', fimDoMes(mes))
      .in('descricao_categoria', blocos.flatMap((b) => b.categorias))
      .neq('status_titulo', 'CANCELADO')
      .order('data_vencimento', { ascending: true })
      .limit(5000),
    conta,
  )
  if (error) throw new Error(error.message)
  const ref = hoje()
  return (data || []).map((r: Record<string, unknown>) => ({
    codigo_lancamento: Number(r.codigo_lancamento),
    nome: (r.nome_fornecedor as string) || null,
    categoria: String(r.descricao_categoria),
    bloco: blocoDe(blocos, r.descricao_categoria as string, r.nome_fornecedor as string)!,
    numero_documento: (r.numero_documento as string) || null,
    observacao: (r.observacao as string) || null,
    data_vencimento: String(r.data_vencimento),
    data_pagamento: (r.data_pagamento as string) || null,
    valor_documento: Number(r.valor_documento) || 0,
    valor_pago: Number(r.valor_pago) || 0,
    status: statusDerivado(r, ref),
  }))
}
