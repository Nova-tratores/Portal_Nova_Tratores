// Reclassificar a FAMÍLIA de um produto (usado por /ajustes/familias).
//
// Hoje a família é só-leitura no portal: vem do cadastro do produto na Omie
// (sincronizada para produtos.codigo_familia / familia_nome) e alimenta quase
// toda a analítica (classificarGrupo -> máquina/peça, dashboards, DRE). A Omie
// suporta a escrita: AlterarProduto aceita codigo_familia (numérico) e altera
// APENAS os campos enviados, identificando o produto por codigo_produto.
//
// Fluxo de alterarFamiliaProduto:
//   1) escreve na Omie (fonte da verdade — sobrevive ao próximo sync);
//   2) faz mirror OTIMISTA no Supabase (produtos + produto_tipo) p/ a UI já
//      refletir antes do próximo sincronizarProdutos.
// A auditoria (quem/de->para) é gravada no cliente via useAuditLog (identidade
// não-forjável, do token) — as rotas /api/ajustes/* não autenticam por request.

import { supabase } from './supabase';
import { omieRequest } from './omie';
import type { Conta } from './conta';

// produtos/familias usam conta_omie em MINÚSCULAS ('nova'/'castro').
const contaLow = (c: Conta): string => c.toLowerCase();

export interface FamiliaOpcao {
  codigo_familia: number;
  nome: string;
}

export interface ProdutoFamilia {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  codigo_familia: number | null;
  familia_nome: string;
}

/** Famílias cadastradas da conta (tem o codigo_familia numérico, ao contrário
 *  do produto_tipo). Ordenadas por nome, para o <select>. */
export async function listarFamilias(conta: Conta): Promise<FamiliaOpcao[]> {
  const { data, error } = await supabase
    .from('familias')
    .select('codigo_familia, nome')
    .eq('conta_omie', contaLow(conta))
    .order('nome');
  if (error) throw new Error('familias: ' + error.message);
  return (data || [])
    .filter((f) => f.codigo_familia != null)
    .map((f) => ({ codigo_familia: Number(f.codigo_familia), nome: String(f.nome || '') }));
}

/** Busca produtos por SKU (codigo) ou descrição. Filtra a conta e produtos não
 *  arquivados. Sem termo, devolve vazio (evita puxar o catálogo inteiro). */
export async function buscarProdutos(conta: Conta, q: string, limite = 200): Promise<ProdutoFamilia[]> {
  const termo = (q || '').trim();
  if (!termo) return [];
  // Escapa caracteres que quebram a sintaxe do .or() do PostgREST (% e ,).
  const esc = termo.replace(/[%,]/g, ' ');
  const { data, error } = await supabase
    .from('produtos')
    .select('codigo_produto, codigo, descricao, codigo_familia, familia_nome')
    .eq('conta_omie', contaLow(conta))
    .eq('arquivado', false)
    .or(`codigo.ilike.%${esc}%,descricao.ilike.%${esc}%`)
    .order('descricao')
    .limit(limite);
  if (error) throw new Error('produtos: ' + error.message);
  return (data || []).map((p) => ({
    codigo_produto: Number(p.codigo_produto),
    codigo: String(p.codigo || ''),
    descricao: String(p.descricao || ''),
    codigo_familia: p.codigo_familia != null ? Number(p.codigo_familia) : null,
    familia_nome: String(p.familia_nome || ''),
  }));
}

/** Altera a família de UM produto: grava na Omie e reflete no Supabase.
 *  Retorna a família aplicada (código + nome) para o cliente atualizar a linha. */
export async function alterarFamiliaProduto(
  conta: Conta,
  codigoProduto: number,
  codigoFamilia: number,
): Promise<{ ok: true; codigo_familia: number; familia_nome: string }> {
  const cp = Number(codigoProduto);
  const cf = Number(codigoFamilia);
  if (!cp) throw new Error('codigo_produto inválido');
  if (!cf) throw new Error('codigo_familia inválido');

  // Nome da família (para o mirror e o retorno). Se não achar, ainda gravamos
  // na Omie — o nome real virá no próximo sync.
  const { data: fam } = await supabase
    .from('familias')
    .select('nome')
    .eq('conta_omie', contaLow(conta))
    .eq('codigo_familia', cf)
    .maybeSingle();
  const familiaNome = String(fam?.nome || '').trim() || 'Sem família';

  // 1) Escreve na Omie (fonte da verdade). AlterarProduto altera só o que é
  //    enviado — mandamos apenas codigo_produto + codigo_familia.
  await omieRequest('/geral/produtos/', 'AlterarProduto', { codigo_produto: cp, codigo_familia: cf }, conta);

  // 2) Mirror otimista no Supabase. produtos é a fonte da UI desta tela e da
  //    analítica; produto_tipo.familia (texto) alimenta o filtro de /omie-massa
  //    e o cruzamento-familia. codigo_produto no produto_tipo é TEXT.
  await supabase
    .from('produtos')
    .update({ codigo_familia: cf, familia_nome: familiaNome })
    .eq('codigo_produto', cp)
    .eq('conta_omie', contaLow(conta));
  // best-effort: se não houver linha em produto_tipo, o update não afeta nada.
  await supabase
    .from('produto_tipo')
    .update({ familia: familiaNome })
    .eq('codigo_produto', String(cp))
    .ilike('conta_omie', conta); // case-insensitive: produto_tipo ora usa 'NOVA', ora 'nova'

  return { ok: true, codigo_familia: cf, familia_nome: familiaNome };
}
