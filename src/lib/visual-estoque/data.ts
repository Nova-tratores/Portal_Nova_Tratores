import { supabaseVE } from "./supabase";
import { carregarSelicCache, calcularSelicAcumulada, calcularDiasCorridos } from "./selic";

export interface ProdutoVE {
  codigo_produto: number;
  codigo: string;
  descricao: string;
  familia_nome: string;
  marca: string;
  data_inclusao: string;
  tipo: string;
  cmc: number;
  estoque: number;
  valor_estoque: number;
  custo_capital: number;
  custo_dia: number;
  custo_capital_mes: number;
  dias_em_estoque: number;
  selic_acumulada: number;
  imagem_url: string;
  ambiente: string;
  pos_x: number;
  pos_y: number;
  img_tamanho: number;
  inativo: boolean;
  arquivado: boolean;
  conta_omie: string;
}

export interface FamiliaVE {
  nome: string;
  qtdProdutos: number;
  qtdEstoque: number;
  valorTotal: number;
  custoCapital: number;
}

async function fetchAllProdutos(contaFiltro?: string) {
  const all: any[] = [];
  let from = 0;
  const PAGE = 1000;
  let hasMore = true;
  while (hasMore) {
    let q = supabaseVE
      .from("produtos")
      .select("*")
      .eq("arquivado", false)
      .range(from, from + PAGE - 1);
    if (contaFiltro && contaFiltro !== "todas") q = q.eq("conta_omie", contaFiltro);
    const { data } = await q;
    if (data && data.length > 0) {
      all.push(...data);
      if (data.length < PAGE) hasMore = false;
      else from += PAGE;
    } else {
      hasMore = false;
    }
  }
  return all;
}

export async function buscarProdutosEnriquecidos(contaFiltro?: string): Promise<ProdutoVE[]> {
  const [rows, selicData] = await Promise.all([
    fetchAllProdutos(contaFiltro),
    carregarSelicCache(),
  ]);

  return rows.map((r: any) => {
    const dias = calcularDiasCorridos(r.data_inclusao);
    const valorEstoque = (r.estoque || 0) * (r.cmc || 0);
    const { selicAcumulada } = calcularSelicAcumulada(selicData, r.data_inclusao);
    const custoCapital = valorEstoque * selicAcumulada;
    const custoDia = dias > 0 ? custoCapital / dias : 0;

    return {
      codigo_produto: r.codigo_produto,
      codigo: r.codigo || "",
      descricao: r.descricao || "",
      familia_nome: r.familia_nome || "",
      marca: r.marca || "",
      data_inclusao: r.data_inclusao || "",
      tipo: r.tipo || "",
      cmc: r.cmc || 0,
      estoque: r.estoque || 0,
      valor_estoque: valorEstoque,
      custo_capital: custoCapital,
      custo_dia: custoDia,
      custo_capital_mes: custoDia * 30,
      dias_em_estoque: dias,
      selic_acumulada: selicAcumulada,
      imagem_url: r.imagem_url || "",
      ambiente: r.ambiente || "patio",
      pos_x: r.pos_x || 0,
      pos_y: r.pos_y || 0,
      img_tamanho: r.img_tamanho || 100,
      inativo: !!r.inativo,
      arquivado: !!r.arquivado,
      conta_omie: r.conta_omie || "",
    };
  });
}

export function agruparFamilias(produtos: ProdutoVE[]): FamiliaVE[] {
  const map = new Map<string, FamiliaVE>();
  for (const p of produtos) {
    const nome = p.familia_nome || "Sem família";
    const f = map.get(nome) || { nome, qtdProdutos: 0, qtdEstoque: 0, valorTotal: 0, custoCapital: 0 };
    f.qtdProdutos++;
    f.qtdEstoque += p.estoque;
    f.valorTotal += p.valor_estoque;
    f.custoCapital += p.custo_capital;
    map.set(nome, f);
  }
  return Array.from(map.values()).sort((a, b) => b.valorTotal - a.valorTotal);
}

export async function buscarPecasPorTipo(contaFiltro?: string) {
  const { data } = await supabaseVE.from("produto_tipo").select("*");
  const tipos = data || [];
  const produtosRaw = await fetchAllProdutos(contaFiltro);
  const produtosMap = new Map(produtosRaw.map((p: any) => [p.codigo_produto, p]));

  const porTipo = new Map<string, { tipo: string; qtd: number; unidades: number; valor: number }>();
  for (const t of tipos) {
    const p = produtosMap.get(t.codigo_produto);
    if (!p || (p.estoque || 0) <= 0) continue;
    const tipo = t.tipo || "Outros";
    const entry = porTipo.get(tipo) || { tipo, qtd: 0, unidades: 0, valor: 0 };
    entry.qtd++;
    entry.unidades += p.estoque || 0;
    entry.valor += (p.estoque || 0) * (p.cmc || 0);
    porTipo.set(tipo, entry);
  }
  return Array.from(porTipo.values()).sort((a, b) => b.valor - a.valor);
}
