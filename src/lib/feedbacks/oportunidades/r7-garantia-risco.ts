// R7 — Garantia em risco: última revisão feita há 10+ meses.
//
// A garantia (Mahindra e afins) é CONDICIONADA à revisão anual: quem fez a
// última revisão há mais de `meses_aviso` (default 10) meses está a caminho de
// estourar o prazo de `meses_perda` (default 12) e perder a garantia — mesmo
// que o prazo total (5 anos etc.) ainda esteja de pé. É o alerta pra ligar e
// agendar ANTES de vencer. Se enquadram tratores e pulverizadores:
//
//   1) TRATORES (tabela `tratores`): só quem JÁ FEZ pelo menos uma revisão
//      registrada (50h, 300h...). Referência = a mais recente entre a revisão
//      registrada e a última OS do chassi/cliente (revisão feita mas não
//      anotada no cadastro conta). Ainda na garantia por tempo (60m; CBU/L 12m
//      — mesma régua da R6); quem já saiu é assunto da R6.
//   2) PULVERIZADORES (pedidos de venda): só MÁQUINA — família "Pulverizador"
//      ou item "pulveriz" com valor >= `valor_minimo_pulverizador` (default
//      R$ 5.000). Peças de pulverizador (bico, trava, tubo… R$ 15–380) NÃO
//      contam — validado no banco: máquinas custam R$ 19,5k+. Sem revisões
//      anotadas, a referência é a última OS do cliente (ou a própria venda).
//      Garantia por `garantia_meses_pulverizador` (default 36, ajustável).
//
// Prioridade: 'Urgente' quando o prazo de 12 meses já estourou (ou estoura em
// 30 dias); 'Normal' na janela de aviso.

import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";
import { REVISOES_LISTA, type Trator } from "@/lib/revisoes/types";
import { lerTudo } from "./_paginar";
import { parseDataBR } from "./_pedidos";
import { carregarIndiceOSCompleto } from "./_os";

interface ParametrosR7 {
  meses_aviso?: number;                 // default 10 — começa a avisar
  meses_perda?: number;                 // default 12 — prazo da revisão anual
  garantia_meses_pulverizador?: number; // default 36
  valor_minimo_pulverizador?: number;   // default 5000 — abaixo disso é peça
}

interface OportunidadeR7 {
  regra: "R7_garantia_risco";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

interface ItemEnriquecido { familia?: string | null; descricao?: string | null; valor_unitario?: number | null }
interface PedidoRow {
  numero_venda: string; empresa: string | null; cliente: string | null;
  data_abertura: string | null; data_emissao: string | null;
  etapa: string | null; cancelada: string | null; categoria: string | null;
  nome_projeto: string | null; itens_enriquecidos: ItemEnriquecido[] | null;
}

const MESES_TRATOR_LONGO = 60; // 5 anos (mesma régua da R6)
const MESES_TRATOR_CURTO = 12; // variantes CBU / "L"
const MS_MES = 30.44 * 86400000;

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
function temCbuOuL(texto: string): boolean {
  const t = (texto || "").toUpperCase();
  return /CBU/.test(t) || /\bL\b/.test(t);
}

// Última revisão REGISTRADA no cadastro (data + horímetro válidos), com rótulo.
function ultimaRevisaoRegistrada(t: Trator): { data: Date; rotulo: string } | null {
  let out: { data: Date; rotulo: string } | null = null;
  for (const rev of REVISOES_LISTA) {
    const d = parseDataFlex(t[`${rev} Data` as keyof Trator] as string | undefined);
    const hRaw = t[`${rev} Horimetro` as keyof Trator] as string | undefined;
    const h = hRaw ? parseFloat(hRaw) : NaN;
    if (d && !isNaN(h) && (!out || d > out.data)) out = { data: d, rotulo: rev };
  }
  return out;
}

export async function computarR7(parametros: ParametrosR7 = {}): Promise<OportunidadeR7[]> {
  const mesesAviso = parametros.meses_aviso ?? 10;
  const mesesPerda = parametros.meses_perda ?? 12;
  const garantiaPulv = parametros.garantia_meses_pulverizador ?? 36;
  const valorMinPulv = parametros.valor_minimo_pulverizador ?? 5000;
  const hoje = new Date();
  const out: OportunidadeR7[] = [];

  const mapOmie = await carregarMapaClientes();
  const tratores = await lerTudo<Trator>((from, to) =>
    supabase.from("tratores").select("*").range(from, to)
  );
  const chassisConhecidos = tratores.map((t) => t.Chassis || "").filter(Boolean);
  const indiceOS = await carregarIndiceOSCompleto(chassisConhecidos);

  function montar(
    base: Omit<OportunidadeR7, "prioridade" | "detalhes">,
    referencia: Date,
    detalhesExtras: Record<string, unknown>
  ) {
    const mesesSem = (hoje.getTime() - referencia.getTime()) / MS_MES;
    if (mesesSem < mesesAviso) return;
    const dataLimite = addMeses(referencia, mesesPerda);
    const estourado = dataLimite <= hoje;
    const urgente = estourado || dataLimite.getTime() - hoje.getTime() < 30 * 86400000;
    out.push({
      ...base,
      prioridade: urgente ? "Urgente" : "Normal",
      detalhes: {
        ...detalhesExtras,
        referencia: referencia.toISOString(),
        meses_sem_revisao: Math.round(mesesSem * 10) / 10,
        data_limite: dataLimite.toISOString(),
        prazo_estourado: estourado,
        sugestao: estourado
          ? `Prazo da revisão anual ESTOUROU em ${dataLimite.toLocaleDateString("pt-BR")} — ligar já e agendar a revisão pra tentar preservar a garantia.`
          : `Revisão anual vence em ${dataLimite.toLocaleDateString("pt-BR")}. Agendar a revisão antes disso pra não perder a garantia.`,
      },
    });
  }

  // ===== 1) TRATORES — só quem já fez pelo menos uma revisão =====
  for (const t of tratores) {
    if (!t.Entrega || !t.Cliente) continue;
    const entrega = parseDataFlex(t.Entrega);
    if (!entrega) continue;

    const garantiaMeses = temCbuOuL(t.Modelo || "") ? MESES_TRATOR_CURTO : MESES_TRATOR_LONGO;
    const fimGarantia = addMeses(entrega, garantiaMeses);
    if (fimGarantia < hoje) continue; // já saiu da garantia — assunto da R6

    const ultimaRev = ultimaRevisaoRegistrada(t);
    if (!ultimaRev) continue; // nunca fez revisão — a R1 é quem cobra a primeira

    // Revisão feita mas não anotada no cadastro: a OS mais recente conta
    const chassi = norm(t.Chassis);
    const os = (chassi && indiceOS.porChassi.get(chassi)) || indiceOS.porCliente.get(norm(t.Cliente));
    const osMaisRecente = os && os.data > ultimaRev.data ? os : null;
    const referencia = osMaisRecente ? osMaisRecente.data : ultimaRev.data;

    montar(
      {
        regra: "R7_garantia_risco",
        codigo_omie: mapOmie.get(norm(t.Cliente)) ?? null,
        cliente_nome: t.Cliente,
        trator: `${t.Modelo || ""} — ${t.Chassis || ""}`.trim(),
        chassis: t.Chassis || null,
      },
      referencia,
      {
        tipo: "Trator",
        fonte: "tratores",
        modelo: t.Modelo,
        cidade: t.Cidade,
        vendedor: t.Vendedor,
        entrega_data: entrega.toISOString(),
        garantia_meses: garantiaMeses,
        fim_garantia: fimGarantia.toISOString(),
        ultima_revisao: ultimaRev.data.toISOString(),
        ultima_revisao_rotulo: ultimaRev.rotulo,
        referencia_fonte: osMaisRecente ? "os" : "revisao",
        ultima_os_id: os?.id_ordem ?? null,
        ultima_os_data: os?.data.toISOString() ?? null,
        ultima_os_tipo: os?.tipo_servico ?? null,
        ultima_os_fonte: os?.fonte ?? null,
        ultima_os_empresa: os?.empresa ?? null,
      }
    );
  }

  // ===== 2) PULVERIZADORES — dos pedidos de venda (item/projeto "pulveriz") =====
  const pedidos = await lerTudo<PedidoRow>((from, to) =>
    supabase
      .from("pedidos_venda_relatorio")
      .select("numero_venda, empresa, cliente, data_abertura, data_emissao, etapa, cancelada, categoria, nome_projeto, itens_enriquecidos")
      .range(from, to)
  );
  // dedup por cliente+equipamento, mantendo a venda mais recente
  const best = new Map<string, { p: PedidoRow; dataVenda: Date; desc: string }>();
  for (const p of pedidos) {
    if (!p.cliente) continue;
    if (norm(p.cancelada) === "SIM") continue;
    if (norm(p.etapa).includes("ORCAMENTO") || norm(p.etapa).includes("ORÇAMENTO")) continue;
    const itens = Array.isArray(p.itens_enriquecidos) ? p.itens_enriquecidos : [];
    // MÁQUINA de pulverizar, não peça: família "Pulverizador", ou descrição
    // "pulveriz" com valor de máquina (peças custam R$ 15–380)
    const itemPulv = itens.find(
      (i) =>
        norm(i.familia) === "PULVERIZADOR" ||
        (/pulveriz/i.test(i.descricao || "") && (Number(i.valor_unitario) || 0) >= valorMinPulv)
    );
    if (!itemPulv) continue;
    const dataVenda = parseDataFlex(p.data_abertura || p.data_emissao);
    if (!dataVenda) continue;
    const desc = (itemPulv?.descricao || p.nome_projeto || "Pulverizador").trim();
    const chave = `${norm(p.cliente)}|${norm(p.nome_projeto || desc)}`;
    const atual = best.get(chave);
    if (!atual || dataVenda > atual.dataVenda) best.set(chave, { p, dataVenda, desc });
  }
  for (const { p, dataVenda, desc } of best.values()) {
    const fimGarantia = addMeses(dataVenda, garantiaPulv);
    if (fimGarantia < hoje) continue;

    const os = indiceOS.porCliente.get(norm(p.cliente));
    const osMaisRecente = os && os.data > dataVenda ? os : null;
    const referencia = osMaisRecente ? osMaisRecente.data : dataVenda;

    montar(
      {
        regra: "R7_garantia_risco",
        codigo_omie: mapOmie.get(norm(p.cliente)) ?? null,
        cliente_nome: p.cliente as string,
        trator: desc.slice(0, 90),
        chassis: null,
      },
      referencia,
      {
        tipo: "Pulverizador",
        fonte: "pedido",
        garantia_meses: garantiaPulv,
        fim_garantia: fimGarantia.toISOString(),
        referencia_fonte: osMaisRecente ? "os" : "venda",
        ultimo_pedido_numero: p.numero_venda,
        ultimo_pedido: dataVenda.toISOString(),
        ultimo_pedido_empresa: p.empresa, // badge de origem "Omie NOVA/CASTRO"
        projeto: p.nome_projeto,
        ultima_os_id: osMaisRecente?.id_ordem ?? null,
        ultima_os_data: osMaisRecente?.data.toISOString() ?? null,
        ultima_os_tipo: osMaisRecente?.tipo_servico ?? null,
        ultima_os_fonte: osMaisRecente?.fonte ?? null,
        ultima_os_empresa: osMaisRecente?.empresa ?? null,
      }
    );
  }

  console.log(`[R7] oportunidades geradas: ${out.length}`);
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
