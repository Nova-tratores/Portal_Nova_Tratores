import { supabaseVE } from "./supabase";

// Leitura das Notas de Entrada (recebimentos de NF-e de fornecedor) para a aba
// do Visual Estoque. A FONTE `recebimentos_nfe` já é mantida pelo sync do portal
// (src/lib/estoque/recebimentos.ts + cron sync-recebimentos). Aqui só lemos uma
// visão enxuta. Porta buscarRecebimentosSupabase() do app legado.

export interface NotaEntradaVE {
  id: number;
  numero_nfe: string;
  serie_nfe: string;
  emissao_nfe: string;
  status: string;
  fornecedor: string;
  fornecedor_cnpj: string;
  total_nfe: number;
  qtd_maquinas: number;
  qtd_itens: number;
  conta_omie: string;
}

export async function buscarNotasEntrada(contaFiltro?: string): Promise<NotaEntradaVE[]> {
  let q = supabaseVE
    .from("recebimentos_nfe")
    .select("id_receb,numero_nfe,serie_nfe,emissao_nfe,status,fornecedor,fornecedor_razao,fornecedor_cnpj,total_nfe,qtd_maquinas,qtd_itens,conta_omie")
    .neq("status", "Cancelada")
    .order("emissao_nfe", { ascending: false })
    .limit(3000);
  if (contaFiltro && contaFiltro !== "todas") q = q.eq("conta_omie", contaFiltro);

  const { data } = await q;
  return (data || []).map((r: any) => ({
    id: r.id_receb,
    numero_nfe: r.numero_nfe || "",
    serie_nfe: r.serie_nfe || "",
    emissao_nfe: r.emissao_nfe || "",
    status: r.status || "",
    fornecedor: r.fornecedor_razao || r.fornecedor || "",
    fornecedor_cnpj: r.fornecedor_cnpj || "",
    total_nfe: Number(r.total_nfe) || 0,
    qtd_maquinas: Number(r.qtd_maquinas) || 0,
    qtd_itens: Number(r.qtd_itens) || 0,
    conta_omie: r.conta_omie || "",
  }));
}
