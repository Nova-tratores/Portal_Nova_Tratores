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
import { omieRequest, sleep } from './omie';
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

// Colunas lidas de `produtos` (mantidas em sincronia entre as buscas).
const COLS_PRODUTO = 'codigo_produto, codigo, descricao, codigo_familia, familia_nome';

interface RowProduto {
  codigo_produto: number | string;
  codigo: string | null;
  descricao: string | null;
  codigo_familia: number | null;
  familia_nome: string | null;
}
function mapProduto(p: RowProduto): ProdutoFamilia {
  return {
    codigo_produto: Number(p.codigo_produto),
    codigo: String(p.codigo || ''),
    descricao: String(p.descricao || ''),
    codigo_familia: p.codigo_familia != null ? Number(p.codigo_familia) : null,
    familia_nome: String(p.familia_nome || ''),
  };
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
    .select(COLS_PRODUTO)
    .eq('conta_omie', contaLow(conta))
    .eq('arquivado', false)
    .or(`codigo.ilike.%${esc}%,descricao.ilike.%${esc}%`)
    .order('descricao')
    .limit(limite);
  if (error) throw new Error('produtos: ' + error.message);
  return (data || []).map(mapProduto);
}

interface OmieProdCad {
  codigo_produto?: number;
  codigo?: string;
  descricao?: string;
  codigo_familia?: number;
  inativo?: string;
  bloqueado?: string;
}

// Cache em memória do resultado do scan (por conta). A varredura da Omie leva
// ~1–2 min (CASTRO ~55 págs), então guardamos p/ as próximas cargas serem
// instantâneas. Reinicia no redeploy; TTL curto p/ não ficar muito stale.
const cacheSemFam = new Map<Conta, { at: number; itens: ProdutoFamilia[] }>();
const CACHE_TTL_MS = 15 * 60 * 1000;

/** Lista TODOS os produtos SEM família da conta, direto da **Omie** (fonte da
 *  verdade). "Sem família" = codigo_familia ausente/0 no cadastro Omie.
 *
 *  Por que a Omie e não o master local `produtos`: o sync do master EXCLUI os
 *  sem-família (FAMILIAS_OCULTAS inclui 'Sem família') e ainda é incompleto —
 *  então esses produtos (que aparecem como "#N/D" nas vendas) não estão lá. A
 *  Omie tem o codigo_familia real. Ignora inativos. Resultado em cache (15 min);
 *  `force` refaz a varredura. `maxPaginas` é teto de segurança. */
export async function listarSemFamilia(
  conta: Conta,
  opts: { force?: boolean; maxPaginas?: number } = {},
): Promise<ProdutoFamilia[]> {
  const maxPaginas = opts.maxPaginas ?? 150;
  const cache = cacheSemFam.get(conta);
  if (!opts.force && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.itens;

  const out: ProdutoFamilia[] = [];
  let pagina = 1;
  let totalPaginas = 1;
  do {
    const data = await omieRequest(
      '/geral/produtos/',
      'ListarProdutos',
      { pagina, registros_por_pagina: 500, apenas_importado_api: 'N', filtrar_apenas_omiepdv: 'N' },
      conta,
    );
    totalPaginas = Number(data?.total_de_paginas) || 1;
    const lista: OmieProdCad[] = data?.produto_servico_cadastro || [];
    for (const p of lista) {
      if (p.inativo === 'S') continue;
      if (p.codigo_familia) continue; // já tem família
      out.push({
        codigo_produto: Number(p.codigo_produto),
        codigo: String(p.codigo || ''),
        descricao: String(p.descricao || ''),
        codigo_familia: null,
        familia_nome: '',
      });
    }
    pagina++;
    if (pagina <= totalPaginas && pagina <= maxPaginas) await sleep(150);
  } while (pagina <= totalPaginas && pagina <= maxPaginas);
  if (totalPaginas > maxPaginas) {
    console.warn(`[familias] listarSemFamilia ${conta}: parei em ${maxPaginas}/${totalPaginas} páginas (teto).`);
  }
  cacheSemFam.set(conta, { at: Date.now(), itens: out });
  return out;
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

  // Tira do cache de "sem família" (já foi classificado).
  const cache = cacheSemFam.get(conta);
  if (cache) cache.itens = cache.itens.filter((p) => p.codigo_produto !== cp);

  return { ok: true, codigo_familia: cf, familia_nome: familiaNome };
}
