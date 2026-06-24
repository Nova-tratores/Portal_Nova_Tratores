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
  valor_unitario: number;
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
  // Campos extras presentes apenas em máquinas de demonstração:
  destinatario?: string;
  data_saida?: string;
  numero_remessa?: string;
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
      valor_unitario: r.valor_unitario || 0,
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

// Distribui posições automáticas (grid 12 colunas) para máquinas sem pos_x/pos_y
// salvos no banco. Porta autoDistribuir() do app legado (server.js ~301-317).
export function autoDistribuir<T extends { pos_x: number; pos_y: number }>(produtos: T[]): T[] {
  const cols = 12;
  const marginX = 5, marginY = 8;
  const stepX = (90 - marginX) / cols;
  const stepY = 14;
  let i = 0;
  for (const p of produtos) {
    if (p.pos_x == null || p.pos_y == null || (p.pos_x === 0 && p.pos_y === 0)) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      p.pos_x = marginX + col * stepX;
      p.pos_y = marginY + row * stepY;
      i++;
    }
  }
  return produtos;
}

// Máquinas em demonstração = remessas pendentes em `movimentacao_produtos`.
// Porta a lógica de server.js ~319-394: lê pendentes, junta com `produtos` em
// lotes, exclui arquivados, calcula Selic/custo de capital pela data de saída e
// marca ambiente='demonstracao'. O contaFiltro filtra pelo produto correspondente.
export async function buscarMaquinasDemonstracao(contaFiltro?: string): Promise<ProdutoVE[]> {
  const { data: pendentes } = await supabaseVE
    .from("movimentacao_produtos")
    .select("*")
    .eq("status", "Pendente");
  if (!pendentes || pendentes.length === 0) return [];

  // Join com produtos em lotes de 500 (limite do filtro .in).
  const cods = [...new Set(pendentes.map((m: any) => m.cod_produto).filter(Boolean))];
  const produtosMap = new Map<string, any>();
  const arquivados = new Set<string>();
  for (let i = 0; i < cods.length; i += 500) {
    const batch = cods.slice(i, i + 500).map(Number).filter((n) => !isNaN(n));
    if (batch.length === 0) continue;
    const { data: prods } = await supabaseVE.from("produtos").select("*").in("codigo_produto", batch);
    for (const p of prods || []) {
      produtosMap.set(String(p.codigo_produto), p);
      if (p.arquivado) arquivados.add(String(p.codigo_produto));
    }
  }

  const selicData = await carregarSelicCache();

  const maquinas: ProdutoVE[] = [];
  for (const m of pendentes) {
    const codStr = String(m.cod_produto);
    if (arquivados.has(codStr)) continue;
    const prod = produtosMap.get(codStr) || {};
    if (contaFiltro && contaFiltro !== "todas") {
      if ((prod.conta_omie || "") !== contaFiltro) continue;
    }

    const valorRemessa = Number(m.valor_unitario) || 0;
    const cmcProd = Number(prod.cmc) || 0;
    const valor = valorRemessa > 0 ? valorRemessa : cmcProd;
    const dias = calcularDiasCorridos(m.data_saida);
    const { selicAcumulada } = calcularSelicAcumulada(selicData, m.data_saida || "");
    const custoCapital = valor * selicAcumulada;

    maquinas.push({
      codigo_produto: m.cod_produto,
      codigo: m.codigo || prod.codigo || "",
      descricao: m.descricao_produto || prod.descricao || "",
      familia_nome: prod.familia_nome || "",
      marca: prod.marca || "",
      data_inclusao: m.data_saida || "",
      tipo: prod.tipo || "",
      cmc: cmcProd,
      estoque: Number(m.qtde) || 1,
      valor_unitario: Number(prod.valor_unitario) || 0,
      valor_estoque: valor,
      custo_capital: custoCapital,
      custo_dia: dias > 0 ? custoCapital / dias : 0,
      custo_capital_mes: (dias > 0 ? custoCapital / dias : 0) * 30,
      dias_em_estoque: dias,
      selic_acumulada: selicAcumulada,
      imagem_url: prod.imagem_url || "",
      ambiente: "demonstracao",
      pos_x: prod.pos_x || 0,
      pos_y: prod.pos_y || 0,
      img_tamanho: prod.img_tamanho || 80,
      inativo: false,
      arquivado: false,
      conta_omie: prod.conta_omie || "",
      destinatario: m.destinatario || "",
      data_saida: m.data_saida || "",
      numero_remessa: m.numero_remessa || "",
    });
  }
  return maquinas;
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
