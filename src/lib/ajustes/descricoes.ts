// Editar a DESCRIÇÃO de um produto (usado por /ajustes/descricoes).
//
// Duas descrições no cadastro Omie: `descricao` (resumida) e `descr_detalhada`
// (detalhada). A resumida está no master local `produtos` (mas CRUA/escapada); a
// detalhada NÃO está no master → vem da Omie (ConsultarProduto), lazy por linha.
//
// ⚠️ GOTCHA CRÍTICO (ver memória omie-alteracao-massa-scripts): a API Omie
// devolve texto HTML-escapado na SAÍDA (12" -> 12&quot;, O'RING -> O&apos;RING)
// mas armazena/espera texto PURO na ENTRADA. Então:
//   - exibir/editar: sempre decodeOmie()
//   - gravar: enviar o texto LIMPO (nunca reenviar o escapado → duplo-escape polui)

import { supabase } from './supabase';
import { omieRequest } from './omie';
import type { Conta } from './conta';

// produtos usa conta_omie em MINÚSCULAS ('nova'/'castro').
const contaLow = (c: Conta): string => c.toLowerCase();

/** Decodifica as entidades HTML que a Omie devolve nos textos. `&amp;` por
 *  último, senão reintroduz as outras entidades. */
export function decodeOmie(s: unknown): string {
  return String(s ?? '')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"').replace(/&#34;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export interface ProdutoDescricao {
  codigo_produto: number;
  codigo: string;
  descricao: string; // resumida, já decodificada
}

interface RowProduto {
  codigo_produto: number | string;
  codigo: string | null;
  descricao: string | null;
}

/** Busca produtos por SKU (codigo) ou descrição no master local. Filtra a conta
 *  e não arquivados. Sem termo, devolve vazio. `descricao` vem decodificada. */
export async function buscarProdutos(conta: Conta, q: string, limite = 200): Promise<ProdutoDescricao[]> {
  const termo = (q || '').trim();
  if (!termo) return [];
  // Escapa caracteres que quebram a sintaxe do .or() do PostgREST (% e ,).
  const esc = termo.replace(/[%,]/g, ' ');
  const { data, error } = await supabase
    .from('produtos')
    .select('codigo_produto, codigo, descricao')
    .eq('conta_omie', contaLow(conta))
    .eq('arquivado', false)
    .or(`codigo.ilike.%${esc}%,descricao.ilike.%${esc}%`)
    .order('descricao')
    .limit(limite);
  if (error) throw new Error('produtos: ' + error.message);
  return (data || []).map((p: RowProduto) => ({
    codigo_produto: Number(p.codigo_produto),
    codigo: String(p.codigo || ''),
    descricao: decodeOmie(p.descricao),
  }));
}

/** Busca as descrições ATUAIS do produto na Omie (ConsultarProduto). A detalhada
 *  não está no master. Devolve ambas decodificadas. */
export async function obterDetalhe(
  conta: Conta,
  codigoProduto: number,
): Promise<{ descricao: string; descr_detalhada: string }> {
  const cp = Number(codigoProduto);
  if (!cp) throw new Error('codigo_produto inválido');
  const d = await omieRequest('/geral/produtos/', 'ConsultarProduto', { codigo_produto: cp }, conta);
  // campo da detalhada é `descr_detalhada`; fallbacks defensivos p/ variações.
  const detalhada = d?.descr_detalhada ?? d?.descricao_detalhada ?? d?.obs ?? '';
  return { descricao: decodeOmie(d?.descricao), descr_detalhada: decodeOmie(detalhada) };
}

/** Altera a descrição RESUMIDA de um produto: grava na Omie (texto limpo) e
 *  reflete no master. Devolve a descrição aplicada. */
export async function alterarDescricao(
  conta: Conta,
  codigoProduto: number,
  descricao: string,
): Promise<{ ok: true; descricao: string }> {
  const cp = Number(codigoProduto);
  if (!cp) throw new Error('codigo_produto inválido');
  const texto = String(descricao ?? '').trim();
  if (!texto) throw new Error('descrição vazia');

  // 1) Grava na Omie (fonte da verdade). AlterarProduto altera só o enviado.
  //    Envia texto LIMPO — a Omie escapa na saída sozinha.
  await omieRequest('/geral/produtos/', 'AlterarProduto', { codigo_produto: cp, descricao: texto }, conta);

  // 2) Mirror otimista no master (guarda o texto limpo; a tela decodifica ao
  //    exibir, então fica consistente com o que o sync grava depois).
  await supabase
    .from('produtos')
    .update({ descricao: texto })
    .eq('codigo_produto', cp)
    .eq('conta_omie', contaLow(conta));

  return { ok: true, descricao: texto };
}
