import { supabaseVE } from "./supabase";

// Leitura das 3 fontes da tela Remessas do Visual Estoque:
//   - remessas              -> aba "Remessas"
//   - movimentacao_produtos -> aba "Demonstração" (por produto)
//   - outras_entradas       -> aba "Outras Entradas"
// Os dados já existem no mesmo Supabase (mantidos pelo sync — ver remessas-sync.ts).
// Porta buscarRemessasSupabase / buscarMovimentacaoProdutos / buscarOutrasEntradas.

async function fetchAll(tabela: string, contaFiltro: string | undefined, orderCol: string) {
  const all: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    let q = supabaseVE.from(tabela).select("*").order(orderCol, { ascending: false }).range(from, from + PAGE - 1);
    if (contaFiltro && contaFiltro !== "todas") q = q.eq("conta_omie", contaFiltro);
    const { data } = await q;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

export interface RemessaVE {
  id_remessa: number;
  numero_nfe: string;
  emissao: string;
  cfop: string;
  status: string;
  destinatario: string;
  destinatario_cnpj: string;
  total_nfe: number;
  qtd_itens: number;
  natureza: string;
  conta_omie: string;
}

export async function buscarRemessas(contaFiltro?: string): Promise<RemessaVE[]> {
  const rows = await fetchAll("remessas", contaFiltro, "emissao");
  return rows.map((r: any) => ({
    id_remessa: r.id_remessa,
    numero_nfe: r.numero_nfe || "",
    emissao: r.emissao || "",
    cfop: r.cfop || "",
    status: r.status || "Aberta",
    destinatario: r.destinatario || "",
    destinatario_cnpj: r.destinatario_cnpj || "",
    total_nfe: Number(r.total_nfe) || 0,
    qtd_itens: Number(r.qtd_itens) || 0,
    natureza: r.natureza || "",
    conta_omie: r.conta_omie || "",
  }));
}

export interface MovimentacaoVE {
  cod_produto: string;
  codigo: string;
  descricao_produto: string;
  numero_remessa: string;
  destinatario: string;
  data_saida: string;
  status: string;
  qtde: number;
  valor_unitario: number;
  conta_omie: string;
}

// Demonstração por produto. Enriquece com o código visual e filtra arquivados
// (porta buscarMovimentacaoProdutos).
export async function buscarMovimentacao(contaFiltro?: string, apenasArquivados = false): Promise<MovimentacaoVE[]> {
  const rows = await fetchAll("movimentacao_produtos", contaFiltro, "data_saida");
  const cods = [...new Set(rows.map((m: any) => m.cod_produto).filter(Boolean))];
  const codigoMap = new Map<string, string>();
  const arquivados = new Set<string>();
  for (let i = 0; i < cods.length; i += 500) {
    const batch = cods.slice(i, i + 500).map(Number).filter((n) => !isNaN(n));
    if (batch.length === 0) continue;
    const { data: prods } = await supabaseVE.from("produtos").select("codigo_produto,codigo,arquivado").in("codigo_produto", batch);
    for (const p of prods || []) {
      codigoMap.set(String(p.codigo_produto), p.codigo || "");
      if (p.arquivado) arquivados.add(String(p.codigo_produto));
    }
  }
  return rows
    .filter((m: any) => (apenasArquivados ? arquivados.has(String(m.cod_produto)) : !arquivados.has(String(m.cod_produto))))
    .map((m: any) => ({
      cod_produto: String(m.cod_produto || ""),
      codigo: codigoMap.get(String(m.cod_produto)) || "",
      descricao_produto: m.descricao_produto || "",
      numero_remessa: m.numero_remessa || "",
      destinatario: m.destinatario || "",
      data_saida: m.data_saida || "",
      status: m.status || "",
      qtde: Number(m.qtde) || 0,
      valor_unitario: Number(m.valor_unitario) || 0,
      conta_omie: m.conta_omie || "",
    }));
}

export interface OutraEntradaVE {
  id_nota_entrada: number;
  numero_nfe: string;
  data_emissao: string;
  cfop: string;
  destinatario: string;
  total_nfe: number;
  qtd_itens: number;
  conta_omie: string;
}

export async function buscarOutrasEntradas(contaFiltro?: string): Promise<OutraEntradaVE[]> {
  const rows = await fetchAll("outras_entradas", contaFiltro, "data_emissao");
  return rows.map((r: any) => ({
    id_nota_entrada: r.id_nota_entrada,
    numero_nfe: r.numero_nfe || "",
    data_emissao: r.data_emissao || "",
    cfop: r.cfop || "",
    destinatario: r.destinatario || "",
    total_nfe: Number(r.total_nfe) || 0,
    qtd_itens: Number(r.qtd_itens) || 0,
    conta_omie: r.conta_omie || "",
  }));
}
