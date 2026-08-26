/* eslint-disable @typescript-eslint/no-explicit-any */
// ============================================================================
// Busca dos titulos que alimentam a VISAO LISTA do Calendario DRE.
// Extraido de src/app/api/dre-financeiro/calendario-lista/route.ts para ser
// reutilizado tanto pela rota (tela) quanto pelo cron do relatorio semanal,
// evitando divergencia entre o que aparece na tela e o que vai no email.
// ============================================================================
import {
  tabelaPorTipo,
  colunaNomePorTipo,
  aplicarConta,
  aplicarFiltrosExtras,
  filtraPorStatus,
  escondeVencidoAntigo,
} from '@/lib/dre-financeiro/calc'
import { hoje, statusDerivado } from '@/lib/dre-financeiro/dates'
// @ts-ignore - modulo CommonJS sem tipos
import { supabaseAdmin as supabase } from '@/lib/dre-financeiro/supabase'

export type EixoLista = 'vencimento' | 'emissao' | 'inclusao'

export interface BuscarTitulosListaArgs {
  conta: string            // 'nova' | 'castro' | 'todas'
  tipo: string             // 'pagar' | 'receber' | 'ambos'
  de: string               // YYYY-MM-DD
  ate: string              // YYYY-MM-DD
  eixo?: EixoLista         // default 'vencimento'
  q?: Record<string, string>
}

export interface TituloLista {
  tipo: string
  codigo_lancamento: any
  conta_omie: any
  nome_contraparte: any
  numero_documento: any
  numero_documento_fiscal: any
  numero_parcela: any
  data_emissao: any
  data_inclusao: any
  data_vencimento: any
  data_pagamento: any
  valor_documento: number
  valor_pago: number
  status_titulo: any
  status_derivado: string
  grupo_categoria: any
  descricao_categoria: any
  descricao_departamento: any
}

const COLS =
  'codigo_lancamento,conta_omie,numero_documento,numero_documento_fiscal,' +
  'numero_parcela,data_emissao,data_inclusao,data_vencimento,data_pagamento,valor_documento,' +
  'valor_pago,status_titulo,grupo_categoria,descricao_categoria,descricao_departamento'

/** Nome amigavel da empresa a partir de conta_omie (NOVA/CASTRO). */
export function empresaLabel(c: unknown): string {
  const s = String(c || '').toUpperCase()
  if (s === 'NOVA') return 'Nova'
  if (s === 'CASTRO') return 'Castro'
  return String(c || '—')
}

/**
 * Busca os titulos da visao Lista, paginando (PostgREST corta em 1000) e
 * filtrando por status/lixo do mesmo jeito que a tela. Filtra pela data do
 * eixo escolhido (vencimento/emissao/inclusao).
 */
export async function buscarTitulosLista({
  conta,
  tipo,
  de,
  ate,
  eixo = 'vencimento',
  q = {},
}: BuscarTitulosListaArgs): Promise<TituloLista[]> {
  if (!supabase) throw new Error('Supabase nao configurado')

  const campoData =
    eixo === 'emissao' ? 'data_emissao' : eixo === 'inclusao' ? 'data_inclusao' : 'data_vencimento'
  // data_inclusao e timestamp: estende o limite superior ate o fim do dia.
  const ateQ = eixo === 'inclusao' ? `${ate} 23:59:59` : ate

  const tipos = tipo === 'ambos' ? ['pagar', 'receber'] : [tipo]
  const ref = hoje()

  const todas: any[] = []
  for (const t of tipos) {
    const tabela = tabelaPorTipo(t)
    const colNome = colunaNomePorTipo(t)
    const PAGINA = 1000
    let off = 0
    for (;;) {
      let query = supabase
        .from(tabela)
        .select(`${COLS},${colNome}`)
        .gte(campoData, de)
        .lte(campoData, ateQ)
        .order('codigo_lancamento', { ascending: true })
        .range(off, off + PAGINA - 1)
      query = aplicarConta(query, conta)
      query = aplicarFiltrosExtras(query, q)
      const { data, error } = await query
      if (error) throw new Error(error.message)
      const lote = data || []
      lote.forEach((r: any) => todas.push({ ...r, _tipo: t, _nome: r[colNome] || null }))
      if (lote.length < PAGINA) break
      off += PAGINA
    }
  }

  // escondeVencidoAntigo (por data_vencimento) so se aplica ao eixo vencimento;
  // nos eixos emissao/inclusao a janela ja e por aquela coluna.
  const semLixo = eixo === 'vencimento' ? escondeVencidoAntigo(todas, ref) : todas
  const filtradas = filtraPorStatus(semLixo, q.status)
  return filtradas.map((r: any) => ({
    tipo: r._tipo,
    codigo_lancamento: r.codigo_lancamento,
    conta_omie: r.conta_omie,
    nome_contraparte: r._nome,
    numero_documento: r.numero_documento,
    numero_documento_fiscal: r.numero_documento_fiscal,
    numero_parcela: r.numero_parcela,
    data_emissao: r.data_emissao,
    data_inclusao: r.data_inclusao,
    data_vencimento: r.data_vencimento,
    data_pagamento: r.data_pagamento,
    valor_documento: Number(r.valor_documento) || 0,
    valor_pago: Number(r.valor_pago) || 0,
    status_titulo: r.status_titulo,
    status_derivado: statusDerivado(r, ref),
    grupo_categoria: r.grupo_categoria,
    descricao_categoria: r.descricao_categoria,
    descricao_departamento: r.descricao_departamento,
  }))
}
