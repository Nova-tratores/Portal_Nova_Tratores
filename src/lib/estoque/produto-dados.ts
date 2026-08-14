// Dados do produto para a tela "Item de Orçamento" (aba Dados do Produto) e o
// modal de detalhe — DB-FIRST. Lê tudo que já está em `produtos` (cmc, estoque,
// preço, família) e nas tabelas locais (vendas/compras). Só a "descrição
// detalhada" vem do Omie, com LAZY-FILL: busca 1x, salva em
// produtos.descricao_detalhada e reusa. NCM já vem de graça na leitura fiscal do
// pedido, mas também é persistido aqui quando buscamos o cadastro.
//
// Toda falha é logada com contexto (produto, conta, motivo).

import { supabase, filtroConta } from './supabase';
import { consultarProduto } from './omie';
import { buscarVendasLista, buscarComprasLista } from './produtos';
import { buscarCaracteristicas } from '@/lib/ppv/caracteristicas';
import type { Conta } from './conta';
import type { VendaItem, CompraItem } from './types';

const num = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

// Descrição detalhada re-buscada no Omie se estiver ausente ou mais velha que isto.
const STALE_DIAS = 7;

export interface ProdutoDados {
  codigoProduto: number;
  codigo: string;
  descricao: string;
  descricaoDetalhada: string | null;
  ncm: string | null;
  familia: string | null;
  codigoFamilia: number | null;
  cmc: number | null;
  estoque: number | null;
  valorVenda: number | null;
  valorEstoque: number | null;
  vendasQtde: number;
  vendasValor: number;
  ultimaEntrada: CompraItem | null;
  ultimaVendaValor: number | null;
  historicoVendas: VendaItem[]; // com vendedor
  caracteristicas: string;      // "Prateleira: B  •  Tipo: Filtro"
  cfopGarantia: string[] | null;
  ultimoCustoGarantia: number | null;
  encontrado: boolean;
}

export async function obterProdutoDados(
  conta: Conta,
  ident: { codigoProduto?: number; codigo?: string },
): Promise<ProdutoDados> {
  const contaBaixa = conta.toLowerCase();

  // 1) Cadastro no banco (produtos) por codigo_produto OU codigo (SKU) — cmc/
  // estoque/preço/família/ncm/descr detalhada. Resolve o codigo_produto quando
  // só temos o SKU (é o caso do clique no item do PPV).
  let q = supabase
    .from('produtos')
    .select('codigo_produto,codigo,descricao,cmc,estoque,valor_unitario,valor_estoque,familia_nome,codigo_familia,ncm,descricao_detalhada,cfop_garantia,ultimo_custo_garantia,enriquecido_em')
    .eq('conta_omie', contaBaixa);
  q = ident.codigoProduto != null ? q.eq('codigo_produto', String(ident.codigoProduto)) : q.eq('codigo', String(ident.codigo || ''));
  const { data: rows, error: errProd } = await q.limit(1);
  if (errProd) console.error(`[produto-dados] ler produtos (${ident.codigoProduto ?? ident.codigo}/${conta}): ${errProd.message}`);
  const row = rows?.[0] as Record<string, unknown> | undefined;

  const codigoProduto = Number(row?.codigo_produto ?? ident.codigoProduto ?? 0);
  const codigo = String(row?.codigo || ident.codigo || '');
  let ncm = row?.ncm != null ? String(row.ncm) : null;
  let descricaoDetalhada = row?.descricao_detalhada != null ? String(row.descricao_detalhada) : null;

  // 2) LAZY-FILL da descrição detalhada + NCM (Omie ConsultarProduto), se faltar/velho.
  const enriquecidoEm = row?.enriquecido_em ? new Date(String(row.enriquecido_em)).getTime() : 0;
  const velho = !enriquecidoEm || Date.now() - enriquecidoEm > STALE_DIAS * 86400000;
  const faltando = !descricaoDetalhada || ncm == null;
  // FIRE-AND-FORGET: buscar descrição detalhada/NCM no Omie NÃO trava a abertura.
  // Só roda se faltar no banco; persiste pra próxima vez já vir do banco (rápido).
  if (codigo && codigoProduto && (faltando || velho)) {
    void (async () => {
      try {
        const p = await consultarProduto(codigo, conta);
        if (!p || p.faultstring) {
          if (p?.faultstring) console.error(`[produto-dados] enriquecer ConsultarProduto (${codigo}/${conta}): ${p.faultstring}`);
          return;
        }
        const novoNcm = p.ncm != null ? String(p.ncm) : ncm;
        const dd = (p as unknown as { descr_detalhada?: unknown }).descr_detalhada;
        const novaDesc = dd != null && String(dd).trim() ? String(dd).trim() : descricaoDetalhada;
        const { error: errUpd } = await supabase
          .from('produtos')
          .update({ ncm: novoNcm, descricao_detalhada: novaDesc, enriquecido_em: new Date().toISOString() })
          .eq('conta_omie', contaBaixa)
          .eq('codigo_produto', String(codigoProduto));
        if (errUpd) console.error(`[produto-dados] persistir enriquecimento (${codigo}/${conta}) FALHOU — rodou sql/produto-enriquecimento.sql? ${errUpd.message}`);
      } catch (e) {
        console.error(`[produto-dados] enriquecer (${codigo}/${conta}): ${(e as Error).message}`);
      }
    })();
  }

  // 3) Vendas totais (qtde + R$) do produto — agregado do banco.
  let vendasQtde = 0;
  let vendasValor = 0;
  try {
    const { data: agg, error: errAgg } = await filtroConta(
      supabase.from('vendas_itens').select('quantidade,valor_total').eq('codigo_produto', String(codigoProduto)),
      conta,
    );
    if (errAgg) console.error(`[produto-dados] agregado vendas (${codigoProduto}/${conta}): ${errAgg.message}`);
    for (const r of (agg || []) as Array<Record<string, unknown>>) {
      vendasQtde += num(r.quantidade) || 0;
      vendasValor += num(r.valor_total) || 0;
    }
  } catch (e) {
    console.error(`[produto-dados] agregado vendas (${codigoProduto}/${conta}): ${(e as Error).message}`);
  }

  // 4) Histórico de vendas (com vendedor), última entrada (compras) e características — banco.
  const [historicoVendas, compras, caractMap] = await Promise.all([
    buscarVendasLista(codigoProduto, conta, 5).catch((e) => {
      console.error(`[produto-dados] histórico vendas (${codigoProduto}/${conta}): ${(e as Error).message}`);
      return [] as VendaItem[];
    }),
    buscarComprasLista(codigoProduto, conta, 1).catch((e) => {
      console.error(`[produto-dados] última entrada (${codigoProduto}/${conta}): ${(e as Error).message}`);
      return [] as CompraItem[];
    }),
    codigo
      ? buscarCaracteristicas([codigo]).catch((e) => {
          console.error(`[produto-dados] características (${codigo}): ${(e as Error).message}`);
          return {} as Record<string, string>;
        })
      : Promise.resolve({} as Record<string, string>),
  ]);

  return {
    codigoProduto,
    codigo,
    descricao: String(row?.descricao || ''),
    descricaoDetalhada,
    ncm,
    familia: row?.familia_nome != null ? String(row.familia_nome) : null,
    codigoFamilia: num(row?.codigo_familia),
    cmc: num(row?.cmc),
    estoque: num(row?.estoque),
    valorVenda: num(row?.valor_unitario),
    valorEstoque: num(row?.valor_estoque),
    vendasQtde,
    vendasValor,
    ultimaEntrada: compras[0] || null,
    ultimaVendaValor: historicoVendas[0]?.vu ?? null,
    historicoVendas,
    caracteristicas: caractMap[codigo] || '',
    cfopGarantia: Array.isArray(row?.cfop_garantia) ? (row.cfop_garantia as string[]) : null,
    ultimoCustoGarantia: num(row?.ultimo_custo_garantia),
    encontrado: !!row,
  };
}
