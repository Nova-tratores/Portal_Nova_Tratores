// Categoria da despesa: `finan_pagar.omie_categoria` guarda só o CÓDIGO Omie
// ('2.08.01'), que não diz nada a ninguém. O nome vem da tabela de cache
// `omie_cache` (tipo='categorias'), que em 21/08/2026 tinha 177 categorias das
// duas empresas — cobertura suficiente pra traduzir tudo que aparece.
//
// O mesmo código existe nas DUAS contas Omie e pode ter descrição diferente,
// então a chave do dicionário é empresa+código, com fallback pro código sozinho
// (despesa sem `omie_empresa` preenchida ainda consegue um nome).
//
// A cascata nunca "some" com dinheiro: sem nome vira o próprio código, sem
// código vira 'Sem categoria', que é uma fatia legítima do gráfico.

import type { DespesaRow, OrigemCategoria } from './tipos'

export const SEM_CATEGORIA = 'Sem categoria'

export interface LinhaCache {
  empresa: string | null
  codigo: string | null
  descricao: string | null
}

/** Dicionário de tradução; chaves 'EMPRESA|CODIGO' e 'CODIGO'. */
export type DicionarioCategorias = Map<string, string>

const chave = (empresa: unknown, codigo: unknown) =>
  `${String(empresa ?? '').trim().toUpperCase()}|${String(codigo ?? '').trim()}`

export function montarDicionario(linhas: LinhaCache[]): DicionarioCategorias {
  const dic: DicionarioCategorias = new Map()
  for (const l of linhas) {
    const cod = String(l.codigo || '').trim()
    const desc = String(l.descricao || '').trim()
    if (!cod || !desc) continue
    dic.set(chave(l.empresa, cod), desc)
    // fallback por código: a primeira empresa a registrar vence — só é usado
    // quando a despesa não diz de qual empresa é
    if (!dic.has(cod)) dic.set(cod, desc)
  }
  return dic
}

export function resolverCategoria(
  row: Pick<DespesaRow, 'omie_categoria' | 'omie_empresa'>,
  dic: DicionarioCategorias,
): { categoria: string; origem: OrigemCategoria } {
  const cod = String(row.omie_categoria || '').trim()
  if (!cod) return { categoria: SEM_CATEGORIA, origem: 'nenhuma' }
  const nome = dic.get(chave(row.omie_empresa, cod)) || dic.get(cod)
  if (nome) return { categoria: nome, origem: 'cache' }
  return { categoria: cod, origem: 'codigo' }
}
