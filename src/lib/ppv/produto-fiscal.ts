// Perfil fiscal por produto (tabela produto_fiscal) — editável NO PORTAL, antes
// de enviar ao Omie. Leitura/escrita rápidas no banco (sem bater no Omie).
// Na hora de enviar/faturar, o portal aplica esses impostos no pedido do Omie.
//
// conta_omie em MINÚSCULA (nova|castro), igual às tabelas produtos/produto_fiscal.
// Toda falha é logada com contexto.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface FiscalBlocos {
  cfop: string;
  icms: { cst: string; origem: string; modalidade: string; aliquota: number; base: number; percRedBase: number };
  icmsSt: { cst: string; modalidade: string; aliquota: number; aliqOpProp: number; base: number; margem: number; percRedBaseOp: number; percRedBaseSt: number; cest: string };
  ipi: { cst: string; enquadramento: string; aliquota: number; base: number };
  pis: { cst: string; aliquota: number; base: number };
  cofins: { cst: string; aliquota: number; base: number };
}

export interface ProdutoFiscal extends FiscalBlocos {
  existe: boolean;               // false = ainda não salvo (valores são default)
  atualizadoEm: string | null;
  atualizadoPor: string | null;
}

// Defaults observados no pedido real 7505 (peça de revenda): ICMS 60/origem 0/
// modalidade 3, IPI 53/enq 999, PIS/COFINS 04, CFOP 5.102.
export function fiscalPadrao(): FiscalBlocos {
  return {
    cfop: "5.102",
    icms: { cst: "60", origem: "0", modalidade: "3", aliquota: 0, base: 0, percRedBase: 0 },
    icmsSt: { cst: "60", modalidade: "", aliquota: 0, aliqOpProp: 0, base: 0, margem: 0, percRedBaseOp: 0, percRedBaseSt: 0, cest: "" },
    ipi: { cst: "53", enquadramento: "999", aliquota: 0, base: 0 },
    pis: { cst: "04", aliquota: 0, base: 0 },
    cofins: { cst: "04", aliquota: 0, base: 0 },
  };
}

const n = (v: unknown): number => {
  const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(x) ? x : 0;
};
const s = (v: unknown, d = ""): string => (v == null ? d : String(v));

function rowParaBlocos(r: Record<string, unknown>): FiscalBlocos {
  const d = fiscalPadrao();
  return {
    cfop: s(r.cfop, d.cfop),
    icms: { cst: s(r.icms_cst, d.icms.cst), origem: s(r.icms_origem, d.icms.origem), modalidade: s(r.icms_modalidade, d.icms.modalidade), aliquota: n(r.icms_aliquota), base: n(r.icms_base), percRedBase: n(r.icms_perc_red_base) },
    icmsSt: { cst: s(r.icmsst_cst, d.icmsSt.cst), modalidade: s(r.icmsst_modalidade), aliquota: n(r.icmsst_aliquota), aliqOpProp: n(r.icmsst_aliq_op_prop), base: n(r.icmsst_base), margem: n(r.icmsst_margem), percRedBaseOp: n(r.icmsst_perc_red_base_op), percRedBaseSt: n(r.icmsst_perc_red_base_st), cest: s(r.icmsst_cest) },
    ipi: { cst: s(r.ipi_cst, d.ipi.cst), enquadramento: s(r.ipi_enquadramento, d.ipi.enquadramento), aliquota: n(r.ipi_aliquota), base: n(r.ipi_base) },
    pis: { cst: s(r.pis_cst, d.pis.cst), aliquota: n(r.pis_aliquota), base: n(r.pis_base) },
    cofins: { cst: s(r.cofins_cst, d.cofins.cst), aliquota: n(r.cofins_aliquota), base: n(r.cofins_base) },
  };
}

function blocosParaRow(conta: string, codigoProduto: number, codigo: string, f: FiscalBlocos, por?: string) {
  return {
    conta_omie: conta.toLowerCase(),
    codigo_produto: codigoProduto,
    codigo: codigo || null,
    cfop: f.cfop || null,
    icms_cst: f.icms.cst || null, icms_origem: f.icms.origem || null, icms_modalidade: f.icms.modalidade || null,
    icms_aliquota: f.icms.aliquota, icms_base: f.icms.base, icms_perc_red_base: f.icms.percRedBase,
    icmsst_cst: f.icmsSt.cst || null, icmsst_modalidade: f.icmsSt.modalidade || null, icmsst_aliquota: f.icmsSt.aliquota,
    icmsst_aliq_op_prop: f.icmsSt.aliqOpProp, icmsst_base: f.icmsSt.base, icmsst_margem: f.icmsSt.margem,
    icmsst_perc_red_base_op: f.icmsSt.percRedBaseOp, icmsst_perc_red_base_st: f.icmsSt.percRedBaseSt, icmsst_cest: f.icmsSt.cest || null,
    ipi_cst: f.ipi.cst || null, ipi_enquadramento: f.ipi.enquadramento || null, ipi_aliquota: f.ipi.aliquota, ipi_base: f.ipi.base,
    pis_cst: f.pis.cst || null, pis_aliquota: f.pis.aliquota, pis_base: f.pis.base,
    cofins_cst: f.cofins.cst || null, cofins_aliquota: f.cofins.aliquota, cofins_base: f.cofins.base,
    atualizado_em: new Date().toISOString(),
    atualizado_por: por || null,
  };
}

// Lê o perfil fiscal do produto. Se não existir linha, devolve os defaults
// (existe:false) — assim a tela já abre com valores sensatos pra editar.
export async function obterProdutoFiscal(conta: string, codigoProduto: number): Promise<ProdutoFiscal> {
  const d = fiscalPadrao();
  try {
    const { data, error } = await supabase
      .from("produto_fiscal")
      .select("*")
      .eq("conta_omie", conta.toLowerCase())
      .eq("codigo_produto", codigoProduto)
      .limit(1);
    if (error) {
      console.error(`[produto-fiscal] ler (${codigoProduto}/${conta}) — rodou sql/produto-fiscal.sql? ${error.message}`);
      return { existe: false, ...d, atualizadoEm: null, atualizadoPor: null };
    }
    const row = data?.[0];
    if (!row) return { existe: false, ...d, atualizadoEm: null, atualizadoPor: null };
    return { existe: true, ...rowParaBlocos(row), atualizadoEm: row.atualizado_em || null, atualizadoPor: row.atualizado_por || null };
  } catch (e) {
    console.error(`[produto-fiscal] ler (${codigoProduto}/${conta}): ${(e as Error).message}`);
    return { existe: false, ...d, atualizadoEm: null, atualizadoPor: null };
  }
}

export async function salvarProdutoFiscal(
  conta: string, codigoProduto: number, codigo: string, fiscal: FiscalBlocos, por?: string,
): Promise<{ ok: boolean; erro?: string }> {
  try {
    const row = blocosParaRow(conta, codigoProduto, codigo, fiscal, por);
    const { error } = await supabase.from("produto_fiscal").upsert(row, { onConflict: "conta_omie,codigo_produto" });
    if (error) {
      console.error(`[produto-fiscal] salvar (${codigoProduto}/${conta}) FALHOU — rodou sql/produto-fiscal.sql? ${error.message}`);
      return { ok: false, erro: error.message };
    }
    console.log(`[produto-fiscal] salvo (${codigoProduto}/${conta}) por ${por || "?"}.`);
    return { ok: true };
  } catch (e) {
    const msg = (e as Error).message;
    console.error(`[produto-fiscal] salvar (${codigoProduto}/${conta}): ${msg}`);
    return { ok: false, erro: msg };
  }
}
