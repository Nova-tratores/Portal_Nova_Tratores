import { buscarProdutosEnriquecidos } from "./data";

// Análise de margem real por produto. Porta /api/margens do app legado:
//   capital_unitario = custo_capital / estoque
//   custo_total      = cmc + capital_unitario
//   margem_real      = valor_unitario - custo_total
//   margem_pct       = margem_real / valor_unitario * 100
// Só considera produtos com estoque > 0 e valor_unitario > 0.

export interface MargemVE {
  codigo: string;
  descricao: string;
  familia_nome: string;
  marca: string;
  conta_omie: string;
  estoque: number;
  dias_em_estoque: number;
  valor_unitario: number;
  cmc: number;
  custo_capital: number;
  capital_unitario: number;
  custo_total: number;
  margem_real: number;
  margem_pct: number;
  valor_estoque: number;
}

export async function buscarMargens(contaFiltro?: string): Promise<MargemVE[]> {
  const produtos = await buscarProdutosEnriquecidos(contaFiltro);
  return produtos
    .filter((p) => p.estoque > 0 && p.valor_unitario > 0)
    .map((p) => {
      const estoque = p.estoque || 1;
      const capitalUnitario = p.custo_capital / estoque;
      const custoTotal = p.cmc + capitalUnitario;
      const margemReal = p.valor_unitario - custoTotal;
      const margemPct = p.valor_unitario > 0 ? (margemReal / p.valor_unitario) * 100 : 0;
      return {
        codigo: p.codigo,
        descricao: p.descricao,
        familia_nome: p.familia_nome,
        marca: p.marca,
        conta_omie: p.conta_omie,
        estoque,
        dias_em_estoque: p.dias_em_estoque,
        valor_unitario: p.valor_unitario,
        cmc: p.cmc,
        custo_capital: p.custo_capital,
        capital_unitario: capitalUnitario,
        custo_total: custoTotal,
        margem_real: margemReal,
        margem_pct: margemPct,
        valor_estoque: p.valor_estoque,
      };
    })
    .sort((a, b) => a.margem_pct - b.margem_pct);
}
