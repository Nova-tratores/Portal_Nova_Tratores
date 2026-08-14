// Listas de códigos fiscais pros dropdowns do "Item de Orçamento".
// CFOP vem da tabela `cfop` (importada do Omie); os demais da `codigo_fiscal`
// (listas nacionais fixas). Tudo do banco — rápido.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface OpcaoFiscal { codigo: string; descricao: string }
export interface ListasFiscais {
  cfop: OpcaoFiscal[];
  origem_icms: OpcaoFiscal[];
  cst_icms: OpcaoFiscal[];
  mod_bc_icms: OpcaoFiscal[];
  cst_ipi: OpcaoFiscal[];
  enq_ipi: OpcaoFiscal[];
  cst_pis: OpcaoFiscal[];
  cst_cofins: OpcaoFiscal[];
}

export async function obterListasFiscais(): Promise<ListasFiscais> {
  const vazio: ListasFiscais = { cfop: [], origem_icms: [], cst_icms: [], mod_bc_icms: [], cst_ipi: [], enq_ipi: [], cst_pis: [], cst_cofins: [] };

  // CFOP de saída (venda): 5.xxx/6.xxx/7.xxx
  const { data: cfopRows, error: errCfop } = await supabase
    .from("cfop").select("codigo,descricao,tipo").eq("tipo", "S").order("codigo");
  if (errCfop) console.error(`[fiscal-listas] cfop — rodou sql/tabelas-fiscais.sql e a importação? ${errCfop.message}`);
  vazio.cfop = (cfopRows || []).map((r) => ({ codigo: String(r.codigo), descricao: String(r.descricao || "") }));

  const { data: cfRows, error: errCf } = await supabase
    .from("codigo_fiscal").select("tipo,codigo,descricao,ordem").order("tipo").order("ordem");
  if (errCf) console.error(`[fiscal-listas] codigo_fiscal: ${errCf.message}`);
  for (const r of (cfRows || []) as Array<{ tipo: string; codigo: string; descricao: string }>) {
    const arr = (vazio as unknown as Record<string, OpcaoFiscal[]>)[r.tipo];
    if (arr) arr.push({ codigo: String(r.codigo), descricao: String(r.descricao || "") });
  }
  return vazio;
}
