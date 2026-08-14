// Listas do Omie (do banco) pra aba "Informações Adicionais" do Pedido de Venda:
// Categoria, Conta Corrente e Etapa. Tabelas: categoria, conta_corrente,
// etapa_pedido (importadas do Omie).
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export interface OpcaoLista { codigo: string; descricao: string; segmentos?: string }
export interface ListasPedido { categorias: OpcaoLista[]; contasCorrentes: OpcaoLista[]; etapas: OpcaoLista[]; cenarios: OpcaoLista[] }

// Categorias de VENDA permitidas no PPV (decisão do usuário), na ordem 10 · 8 · 9.
const CATS_PPV = ["1.01.03", "1.01.99", "1.01.94"];

export async function obterListasPedido(conta: string = "NOVA"): Promise<ListasPedido> {
  const out: ListasPedido = { categorias: [], contasCorrentes: [], etapas: [], cenarios: [] };

  const { data: cat, error: eCat } = await supabase
    .from("categoria").select("codigo,descricao").in("codigo", CATS_PPV);
  if (eCat) console.error(`[listas-pedido] categoria — rodou sql/omie-listas-pedido.sql e a importação? ${eCat.message}`);
  const catMap = new Map((cat || []).map((r) => [String(r.codigo), String(r.descricao || "")]));
  out.categorias = CATS_PPV.filter((c) => catMap.has(c)).map((c) => ({ codigo: c, descricao: catMap.get(c) || "" }));

  const { data: cc, error: eCc } = await supabase
    .from("conta_corrente").select("codigo,descricao,inativo").eq("inativo", false).order("descricao");
  if (eCc) console.error(`[listas-pedido] conta_corrente: ${eCc.message}`);
  out.contasCorrentes = (cc || []).map((r) => ({ codigo: String(r.codigo), descricao: String(r.descricao || "") }));

  // Etapas: todas as fases do Pedido de Venda (menos as marcadas "<disponível>").
  const { data: et, error: eEt } = await supabase
    .from("etapa_pedido").select("codigo,descricao").order("codigo");
  if (eEt) console.error(`[listas-pedido] etapa_pedido: ${eEt.message}`);
  out.etapas = (et || [])
    .filter((r) => !/dispon[íi]vel/i.test(String(r.descricao || "")))
    .map((r) => ({ codigo: String(r.codigo), descricao: String(r.descricao || "") }));

  // Cenários fiscais da CONTA (código = codigo_cenario_impostos p/ o Omie) —
  // mesma lista do Omie (todos os ativos, sem esconder nada). Ordena por nome.
  const { data: cen, error: eCen } = await supabase
    .from("cenario_fiscal").select("codigo,nome,inativo,segmentos")
    .eq("conta_omie", conta.toLowerCase()).eq("inativo", false)
    .order("nome");
  if (eCen) console.error(`[listas-pedido] cenario_fiscal (${conta}) — rodou sql/cenario-fiscal.sql e a importação? ${eCen.message}`);
  out.cenarios = (cen || []).map((r) => ({ codigo: String(r.codigo), descricao: String(r.nome || ""), segmentos: String(r.segmentos || "") }));

  return out;
}
