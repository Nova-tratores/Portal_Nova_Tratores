// Departamentos do Omie (tabela `departamento`, importada). Usados na aba
// "Departamentos" do Pedido de Venda pra distribuir o valor do pedido.
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface Departamento { codigo: string; estrutura: string; descricao: string }

export async function obterDepartamentos(): Promise<Departamento[]> {
  const { data, error } = await supabase
    .from("departamento").select("codigo,estrutura,descricao,inativo")
    .eq("inativo", false).order("estrutura");
  if (error) {
    console.error(`[departamentos] ler — rodou sql/departamentos.sql e a importação? ${error.message}`);
    return [];
  }
  return (data || []).map((r) => ({ codigo: String(r.codigo), estrutura: String(r.estrutura || ""), descricao: String(r.descricao || "") }));
}
