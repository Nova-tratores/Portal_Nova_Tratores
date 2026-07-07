// R6 — Equipamento fora de garantia (baseado na DATA / tempo, não em horímetro).
//
// Duas fontes COMPLEMENTARES (os pedidos de venda só têm histórico recente ~2024+,
// então os tratores antigos que vencem a garantia de 5 anos AGORA estão no
// cadastro `tratores`, que tem Entrega desde 2019):
//
//   1) tratores  → TRATORES (Mahindra). Garantia por Entrega:
//        - modelo SEM "CBU" e SEM "L" isolado → 5 anos (60 meses)
//        - modelo com "CBU"/"L"               → 1 ano (12 meses)
//   2) pedidos_venda_relatorio → IMPLEMENTOS (vendas faturadas). 1 ano por data da venda.
//      (tratores vêm da fonte 1, então aqui pegamos só implementos — sem duplicar.)
//
// Fora de garantia quando data + prazo já passou. Lista todos.

import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";
import { lerTudo } from "./_paginar";
import { parseDataBR } from "./_pedidos";
import type { Trator } from "@/lib/revisoes/types";

const MESES_TRATOR_LONGO = 60; // 5 anos
const MESES_PADRAO = 12;       // 1 ano (implementos e tratores CBU/L)
const CATEGORIAS_EQUIP = ["Venda de Tratores", "Venda de Implementos", "Venda de Mercadoria Fabricadas"];

interface ItemEnriquecido { familia?: string | null; descricao?: string | null }
interface PedidoRow {
  numero_venda: string; empresa: string | null; cliente: string | null;
  data_abertura: string | null; data_emissao: string | null;
  etapa: string | null; cancelada: string | null; categoria: string | null;
  nome_projeto: string | null; itens_enriquecidos: ItemEnriquecido[] | null;
}

interface OportunidadeR6 {
  regra: "R6_fora_garantia";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}
function parseDataFlex(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) { const d = new Date(s); return isNaN(d.getTime()) ? null : d; }
  return parseDataBR(s);
}
function addMeses(d: Date, meses: number): Date {
  const x = new Date(d); x.setMonth(x.getMonth() + meses); return x;
}
// "CBU" (texto) ou "L" isolado (palavra) → variantes com garantia de 1 ano.
function temCbuOuL(texto: string): boolean {
  const t = (texto || "").toUpperCase();
  return /CBU/.test(t) || /\bL\b/.test(t);
}
function familiaMaquina(f: string | null | undefined): boolean {
  const x = (f || "").trim();
  return !!x && !/^pe(ç|c)as$/i.test(x) && !/inativo|requisi|kit\s*revis/i.test(x);
}
function ehTratorFamilia(f: string | null | undefined): boolean {
  return /^trator/i.test((f || "").trim());
}

export async function computarR6(): Promise<OportunidadeR6[]> {
  const hoje = new Date();
  const mapOmie = await carregarMapaClientes();
  const out: OportunidadeR6[] = [];

  // ===== 1) TRATORES (Mahindra) — por Entrega =====
  const tratores = await lerTudo<Trator>((from, to) =>
    supabase.from("tratores").select("*").range(from, to)
  );
  for (const t of tratores) {
    if (!t.Entrega || !t.Cliente) continue;
    const entrega = parseDataFlex(t.Entrega);
    if (!entrega) continue;
    const meses = temCbuOuL(t.Modelo || "") ? MESES_PADRAO : MESES_TRATOR_LONGO;
    const fim = addMeses(entrega, meses);
    if (fim >= hoje) continue; // ainda na garantia
    out.push({
      regra: "R6_fora_garantia",
      codigo_omie: mapOmie.get(norm(t.Cliente)) ?? null,
      cliente_nome: t.Cliente,
      trator: `${t.Modelo || ""} ${t.Chassis || ""}`.trim() || "Trator",
      chassis: t.Chassis || null,
      prioridade: "Normal",
      detalhes: {
        tipo: "Trator",
        fonte: "tratores",
        data_venda: entrega.toISOString(),
        garantia_meses: meses,
        fim_garantia: fim.toISOString(),
        modelo: t.Modelo,
        cidade: t.Cidade,
        vendedor: t.Vendedor,
        sugestao: "Trator fora de garantia. Oferecer revisão paga, garantia estendida ou contrato de manutenção.",
      },
    });
  }

  // ===== 2) IMPLEMENTOS — dos pedidos de venda (faturados), por data da venda =====
  const pedidos = await lerTudo<PedidoRow>((from, to) =>
    supabase
      .from("pedidos_venda_relatorio")
      .select("numero_venda, empresa, cliente, data_abertura, data_emissao, etapa, cancelada, categoria, nome_projeto, itens_enriquecidos")
      .in("categoria", CATEGORIAS_EQUIP)
      .range(from, to)
  );
  // dedup por cliente+equipamento, mantendo a venda mais antiga
  const best = new Map<string, { p: PedidoRow; dataVenda: Date; desc: string }>();
  for (const p of pedidos) {
    if (!p.cliente) continue;
    if (norm(p.cancelada) === "SIM") continue;
    if (norm(p.etapa).includes("ORCAMENTO") || norm(p.etapa).includes("ORÇAMENTO")) continue;
    const dataVenda = parseDataFlex(p.data_abertura || p.data_emissao);
    if (!dataVenda) continue;
    const itens = Array.isArray(p.itens_enriquecidos) ? p.itens_enriquecidos : [];
    const itensMaq = itens.filter((i) => familiaMaquina(i.familia));
    // tratores já vêm da fonte 1 — aqui ignoramos vendas de trator
    const ehTrator = itensMaq.some((i) => ehTratorFamilia(i.familia)) || p.categoria === "Venda de Tratores";
    if (ehTrator) continue;
    const desc = (itensMaq[0]?.descricao || p.nome_projeto || p.categoria || "Implemento").trim();
    const projetoKey = p.nome_projeto && !/^n\/?d$/i.test(p.nome_projeto.trim()) ? p.nome_projeto : desc;
    const chave = `${norm(p.cliente)}|${norm(projetoKey)}`;
    const atual = best.get(chave);
    if (!atual || dataVenda < atual.dataVenda) best.set(chave, { p, dataVenda, desc });
  }
  for (const { p, dataVenda, desc } of best.values()) {
    const fim = addMeses(dataVenda, MESES_PADRAO);
    if (fim >= hoje) continue;
    out.push({
      regra: "R6_fora_garantia",
      codigo_omie: mapOmie.get(norm(p.cliente)) ?? null,
      cliente_nome: p.cliente as string,
      trator: desc.slice(0, 90),
      chassis: null,
      prioridade: "Normal",
      detalhes: {
        tipo: "Implemento",
        fonte: "pedido",
        data_venda: dataVenda.toISOString(),
        garantia_meses: MESES_PADRAO,
        fim_garantia: fim.toISOString(),
        numero_venda: p.numero_venda,
        projeto: p.nome_projeto,
        ultimo_pedido_empresa: p.empresa, // badge de origem "Omie NOVA/CASTRO"
        sugestao: "Implemento fora de garantia. Oferecer revisão paga, garantia estendida ou contrato de manutenção.",
      },
    });
  }

  console.log(`[R6] oportunidades geradas: ${out.length}`);
  return out;
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
