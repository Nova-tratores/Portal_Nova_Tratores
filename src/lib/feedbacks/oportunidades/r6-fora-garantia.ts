// R6 — Equipamento fora de garantia.
//
// Marca o equipamento como fora de garantia quando passou do prazo da garantia
// da MARCA (em meses) OU bateu nas horas de garantia. A marca não dá pra
// detectar automaticamente, então duas tabelas são preenchidas manualmente:
//   - garantia_marcas         (marca → garantia_meses, garantia_horas)
//   - garantia_modelo_marca   (modelo → marca)
//
// Padrões de exemplo (preenchidos pelo usuário):
//   Mahindra: 60 meses / 3000h · Kuhn: 12 / 1500 · Ventura: 12 / 300 · ...
//
// Horímetro "atual" é estimado pelo maior horímetro já registrado no trator
// (revisões + inspeção). Lista TODOS os que estão fora de garantia.

import { supabase } from "@/lib/supabase";
import { lerTudo } from "./_paginar";
import { REVISOES_LISTA, type Trator } from "@/lib/revisoes/types";

interface OportunidadeR6 {
  regra: "R6_fora_garantia";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

interface GarantiaMarca { meses: number; horas: number; }

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

// Entrega vem em DD/MM/YYYY (controle interno) ou ISO. Devolve Date ou null.
function parseDataFlex(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  return isNaN(d.getTime()) ? null : d;
}

// Maior horímetro já registrado (revisões + inspeção) — melhor estimativa do uso atual.
function maxHorimetro(t: Trator): number {
  let max = 0;
  const campos = [...REVISOES_LISTA.map((r) => `${r} Horimetro`), "Inspecao Horimetro"];
  for (const c of campos) {
    const v = parseFloat(t[c as keyof Trator] as string);
    if (!isNaN(v) && v > max) max = v;
  }
  return max;
}

export async function computarR6(): Promise<OportunidadeR6[]> {
  const hoje = new Date();

  const marcas = await carregarMarcas();
  const modeloMarca = await carregarModeloMarca();
  // Sem configuração preenchida ainda → nenhuma oportunidade (silencioso).
  if (marcas.size === 0 || modeloMarca.size === 0) {
    console.log("[R6] sem config de garantia (garantia_marcas/garantia_modelo_marca vazias) — pulando");
    return [];
  }

  const tratores = await lerTudo<Trator>((from, to) =>
    supabase.from("tratores").select("*").range(from, to)
  );
  const mapClienteOmie = await carregarMapaClientes();

  const out: OportunidadeR6[] = [];
  for (const t of tratores) {
    if (!t.Entrega || !t.Cliente || !t.Modelo) continue;

    const marca = modeloMarca.get(norm(t.Modelo));
    if (!marca) continue;                 // modelo sem marca cadastrada
    const g = marcas.get(marca);
    if (!g) continue;                      // marca sem garantia cadastrada

    const entrega = parseDataFlex(t.Entrega);
    if (!entrega) continue;

    const fimGarantia = new Date(entrega);
    fimGarantia.setMonth(fimGarantia.getMonth() + g.meses);
    const foraPorTempo = fimGarantia < hoje;

    const horimetro = maxHorimetro(t);
    const foraPorHoras = g.horas > 0 && horimetro >= g.horas;

    if (!foraPorTempo && !foraPorHoras) continue;

    const codigoOmie = mapClienteOmie.get(norm(t.Cliente)) ?? null;
    const foraPor = foraPorTempo && foraPorHoras ? "tempo+horas" : foraPorTempo ? "tempo" : "horas";

    out.push({
      regra: "R6_fora_garantia",
      codigo_omie: codigoOmie,
      cliente_nome: t.Cliente,
      trator: `${t.Modelo || ""} — ${t.Chassis || ""}`.trim(),
      chassis: t.Chassis || null,
      prioridade: "Normal",
      detalhes: {
        marca,
        garantia_meses: g.meses,
        garantia_horas: g.horas,
        entrega_data: t.Entrega,
        fim_garantia: fimGarantia.toISOString(),
        horimetro_atual: horimetro || null,
        fora_por: foraPor,
        modelo: t.Modelo,
        cidade: t.Cidade,
        vendedor: t.Vendedor,
        sugestao: `Equipamento ${marca} fora de garantia (${foraPor}). Oferecer revisão paga, garantia estendida ou contrato de manutenção.`,
      },
    });
  }
  console.log(`[R6] oportunidades geradas: ${out.length}`);
  return out;
}

async function carregarMarcas(): Promise<Map<string, GarantiaMarca>> {
  const m = new Map<string, GarantiaMarca>();
  const { data, error } = await supabase
    .from("garantia_marcas")
    .select("marca, garantia_meses, garantia_horas");
  if (error || !data) return m; // tabela ainda não criada → vazio
  for (const r of data as Array<{ marca: string | null; garantia_meses: number | null; garantia_horas: number | null }>) {
    if (r.marca) m.set(norm(r.marca), { meses: Number(r.garantia_meses) || 0, horas: Number(r.garantia_horas) || 0 });
  }
  return m;
}

async function carregarModeloMarca(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const { data, error } = await supabase
    .from("garantia_modelo_marca")
    .select("modelo, marca");
  if (error || !data) return m; // tabela ainda não criada → vazio
  for (const r of data as Array<{ modelo: string | null; marca: string | null }>) {
    if (r.modelo && r.marca) m.set(norm(r.modelo), norm(r.marca));
  }
  return m;
}

async function carregarMapaClientes(): Promise<Map<string, string>> {
  const m = new Map<string, string>();
  const clientes = await lerTudo<{
    id_omie: string;
    nome_fantasia: string | null;
    razao_social: string | null;
  }>((from, to) =>
    supabase
      .from("portal_nt_clientes_PRINCIPAL")
      .select("id_omie, nome_fantasia, razao_social")
      .range(from, to)
  );
  for (const c of clientes) {
    if (c.nome_fantasia) m.set(norm(c.nome_fantasia), c.id_omie);
    if (c.razao_social) m.set(norm(c.razao_social), c.id_omie);
  }
  return m;
}
