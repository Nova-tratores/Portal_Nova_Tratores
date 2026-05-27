// R3 — Cliente com 1 único trator há ≥ X meses, sem nova compra.
//
// Sugestão: up-sell de implemento. Cliente que comprou um trator há mais de
// um ano e nunca voltou pode estar precisando de implemento (plantadeira,
// pulverizador, etc).

import { supabase } from "@/lib/supabase";

interface ParametrosR3 {
  meses_minimo?: number;  // default 12
}

interface OportunidadeR3 {
  regra: "R3_upsell";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Normal";
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

interface TratorRow {
  Cliente: string;
  Modelo: string;
  Chassis: string;
  Entrega: string;
  Cidade?: string;
  Vendedor?: string;
}

export async function computarR3(parametros: ParametrosR3 = {}): Promise<OportunidadeR3[]> {
  const mesesMin = parametros.meses_minimo ?? 12;
  const limiteData = new Date();
  limiteData.setMonth(limiteData.getMonth() - mesesMin);

  const { data, error } = await supabase
    .from("tratores")
    .select("Cliente, Modelo, Chassis, Entrega, Cidade, Vendedor");
  if (error) throw new Error(`R3 — falha ao ler tratores: ${error.message}`);

  const tratores = (data || []) as TratorRow[];

  // agrupar por cliente
  const porCliente = new Map<string, TratorRow[]>();
  const nomeOriginal = new Map<string, string>();
  for (const t of tratores) {
    const key = norm(t.Cliente);
    if (!key) continue;
    if (!porCliente.has(key)) porCliente.set(key, []);
    porCliente.get(key)!.push(t);
    if (!nomeOriginal.has(key)) nomeOriginal.set(key, t.Cliente);
  }

  const mapOmie = await carregarMapaClientes();

  const out: OportunidadeR3[] = [];
  for (const [keyNorm, ts] of porCliente.entries()) {
    if (ts.length !== 1) continue;
    const t = ts[0];
    if (!t.Entrega) continue;
    const entrega = new Date(t.Entrega);
    if (isNaN(entrega.getTime()) || entrega > limiteData) continue;

    const mesesDesde = Math.floor((Date.now() - entrega.getTime()) / (30 * 86400000));

    out.push({
      regra: "R3_upsell",
      codigo_omie: mapOmie.get(keyNorm) ?? null,
      cliente_nome: nomeOriginal.get(keyNorm) || keyNorm,
      trator: `${t.Modelo || ""} — ${t.Chassis || ""}`.trim(),
      chassis: t.Chassis || null,
      prioridade: "Normal",
      detalhes: {
        modelo: t.Modelo,
        entrega: t.Entrega,
        meses_desde_compra: mesesDesde,
        cidade: t.Cidade,
        vendedor: t.Vendedor,
        sugestao: `Cliente com 1 equipamento há ${mesesDesde} meses — possível up-sell de implemento`,
      },
    });
  }
  return out;
}

async function carregarMapaClientes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data } = await supabase
    .from("Clientes")
    .select("id_omie, nome_fantasia, razao_social");
  for (const c of (data || []) as Array<{ id_omie: string; nome_fantasia: string | null; razao_social: string | null }>) {
    if (c.nome_fantasia) m.set(c.nome_fantasia.trim().toUpperCase(), c.id_omie);
    if (c.razao_social)  m.set(c.razao_social.trim().toUpperCase(),  c.id_omie);
  }
  return m;
}
