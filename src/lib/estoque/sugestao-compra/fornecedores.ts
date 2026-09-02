// Resolução de fornecedores do módulo de Sugestão de Compra.
//
// No Omie cliente e fornecedor são o mesmo cadastro. A tabela `Fornecedores`
// (manual, das Requisições) está quase vazia de ids Omie — NÃO serve. A fonte
// real dos fornecedores de peças é `recebimentos_nfe`, que já traz por nota o
// id_fornecedor (código Omie), o nome (fornecedor_razao/fornecedor) e o CNPJ.
//
// Chave do fornecedor no módulo = id_fornecedor (código Omie), por conta.
// conta_omie em recebimentos_nfe é MINÚSCULO (nova/castro).

import { supabase } from '@/lib/estoque/supabase';

export interface FornecedorInfo { id: number; nome: string; cnpj?: string; n_notas: number }

async function paginar<T>(monta: (off: number) => Promise<T[]>): Promise<T[]> {
  const out: T[] = []; let off = 0;
  for (;;) { const b = await monta(off); out.push(...b); if (b.length < 1000) break; off += 1000; }
  return out;
}

// Cache em memória (o processo do Railway é único; fornecedores mudam pouco).
const CACHE_MS = 30 * 60 * 1000;
const cacheLista = new Map<string, { em: number; dados: FornecedorInfo[] }>();

/** Fornecedores distintos que já emitiram nota de entrada na conta, com nome/CNPJ. */
export async function listarFornecedoresConta(conta: 'nova' | 'castro'): Promise<FornecedorInfo[]> {
  const hit = cacheLista.get(conta);
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.dados;
  const rows = await paginar(async (off) => (await supabase.from('recebimentos_nfe')
    .select('id_fornecedor, fornecedor, fornecedor_razao, fornecedor_cnpj')
    .eq('conta_omie', conta).not('id_fornecedor', 'is', null)
    .order('id_receb', { ascending: true }).range(off, off + 999)).data ?? []);
  const map = new Map<number, FornecedorInfo>();
  for (const r of rows) {
    const id = Number(r.id_fornecedor);
    const cur = map.get(id);
    if (cur) { cur.n_notas++; }
    else map.set(id, { id, nome: String(r.fornecedor_razao || r.fornecedor || `#${id}`).trim(), cnpj: r.fornecedor_cnpj || undefined, n_notas: 1 });
  }
  const dados = [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  cacheLista.set(conta, { em: Date.now(), dados });
  return dados;
}

/** Mapa id_fornecedor → nome, para resolver o nome nas telas. */
export async function mapaFornecedoresConta(conta: 'nova' | 'castro'): Promise<Map<number, string>> {
  const lista = await listarFornecedoresConta(conta);
  return new Map(lista.map((f) => [f.id, f.nome]));
}

/** Nome de um fornecedor específico (id_fornecedor Omie) numa conta. */
export async function nomeFornecedor(conta: 'nova' | 'castro', id: number): Promise<string | null> {
  const { data } = await supabase.from('recebimentos_nfe')
    .select('fornecedor, fornecedor_razao').eq('conta_omie', conta).eq('id_fornecedor', id).limit(1).maybeSingle();
  return data ? String(data.fornecedor_razao || data.fornecedor || `#${id}`) : null;
}
