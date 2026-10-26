// Leitura do cadastro (Omie/PPV) para o Opa Peças — SÓ NO SERVIDOR (service role:
// o navegador não lê `produtos`/`produtos_caracteristicas` inteiros).
// Usado pela Relação (todas as peças) e pela consulta de UM código
// (campo "Código existente" / "Código correto" das telas).

import { supabaseAdmin } from '@/lib/server/supabase-admin'
import {
  acharCadastros, indexarCadastros, ordenarParecidos, padraoParecido, variantesCodigo,
  type Cadastro, type Parecido, type CaracteristicaCadastro, type ProdutoCadastro,
} from './relacao'

const LOTE = 150

async function emLotes<T>(codigos: string[], buscar: (lote: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []
  for (let i = 0; i < codigos.length; i += LOTE) out.push(...(await buscar(codigos.slice(i, i + LOTE))))
  return out
}

/** Todas as grafias a procurar: como foi digitado + MAIÚSCULAS com/sem "RP-" (o `in` é sensível a caixa). */
export function grafiasParaBusca(codigos: (string | null | undefined)[]): string[] {
  return [...new Set(codigos.flatMap((c) => {
    const bruto = String(c ?? '').trim()
    return bruto ? [bruto, ...variantesCodigo(bruto)] : []
  }))]
}

/** Lê produtos + características das grafias pedidas. */
export async function lerCadastros(grafias: string[]): Promise<{ produtos: ProdutoCadastro[]; caracteristicas: CaracteristicaCadastro[] }> {
  const [produtos, caracteristicas] = await Promise.all([
    emLotes<ProdutoCadastro>(grafias, async (lote) => {
      const { data, error } = await supabaseAdmin
        .from('produtos')
        .select('conta_omie, codigo, descricao, estoque, valor_unitario, marca, familia_nome, inativo')
        .in('codigo', lote)
      if (error) throw error
      return (data || []) as ProdutoCadastro[]
    }),
    emLotes<CaracteristicaCadastro>(grafias, async (lote) => {
      const { data, error } = await supabaseAdmin
        .from('produtos_caracteristicas')
        .select('conta_omie, codigo, descricao, caracteristicas')
        .in('codigo', lote)
      if (error) throw error
      return (data || []) as CaracteristicaCadastro[]
    }),
  ])
  return { produtos, caracteristicas }
}

/**
 * Código exato não existe: produtos cujo código CONTÉM o digitado (caso real
 * 26/10/2026: "348U1" é RP-006034348U1 na Nova e 006034348U1MHI na Castro).
 * A pessoa escolhe; nada é trocado sozinho.
 */
export async function parecidosDoCodigo(codigo: string): Promise<Parecido[]> {
  const padrao = padraoParecido(codigo)
  if (!padrao) return []
  const { data, error } = await supabaseAdmin
    .from('produtos')
    .select('conta_omie, codigo, descricao, inativo')
    .ilike('codigo', padrao)
    .limit(40)
  if (error) throw error
  return ordenarParecidos((data || []).map((p) => ({
    empresa: String(p.conta_omie || '').toUpperCase() === 'CASTRO' ? 'CASTRO' as const : 'NOVA' as const,
    codigo: String(p.codigo || ''),
    descricao: p.descricao ? String(p.descricao) : null,
    inativo: p.inativo === true,
  })))
}

/** Cadastros (NOVA/CASTRO) de UM código. Vazio = não cadastrado. */
export async function cadastrosDoCodigo(codigo: string): Promise<Cadastro[]> {
  const grafias = grafiasParaBusca([codigo])
  if (!grafias.length) return []
  const { produtos, caracteristicas } = await lerCadastros(grafias)
  return acharCadastros(indexarCadastros(produtos, caracteristicas), codigo)
}
