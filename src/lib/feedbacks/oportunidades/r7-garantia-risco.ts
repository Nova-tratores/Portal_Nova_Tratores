// R7 — Garantia em risco: o CHEQUE DE REVISÃO obrigatório está pra vencer.
//
// TRATORES seguem a régua do caderno de cheques da Mahindra (27/07/2026,
// digitalizada pelo usuário): cada cheque tem prazo por horas OU tempo
// CONTADO DA ENTREGA — 50h/6 meses (prazo definido pelo usuário; o caderno
// só dá horas), 300h/1 ano, 600h/2 anos, 900h/3 anos, 1200h/4 anos, e daí
// de ano em ano (1500h/5a … 3000h/10a — decisão do usuário 27/07). Sem horímetro
// corrente confiável, o motor cobra pela régua de TEMPO: o cheque mais antigo
// ainda pendente é o alvo. Depois do 1200h/4 anos não há mais cheque com
// prazo — o 5º ano de garantia não cobra revisão (a régua antiga de "12 meses
// desde a última revisão" cobrava errado aqui).
//
//  - marco satisfeito = cheque com o RÓTULO registrado no cadastro (qualquer
//    data) OU alguma evidência (outra revisão/OS do chassi/cliente) DENTRO
//    da janela daquele ano — revisão feita e não anotada conta (benefício
//    da dúvida; o atendimento confirma por telefone);
//  - marco vencido sem evidência → PERDEU a garantia (sai em formato R6
//    `perdidas`, coluna "Fora de garantia", com o cheque que faltou);
//  - marco vencendo (janela de aviso = meses_perda - meses_aviso, default 2
//    meses) → card R7 "cheque das X horas vence em DD/MM".
//
// Quem nunca registrou revisão nenhuma segue com a R1 (primeira revisão).
// Ainda na garantia por tempo (60m; CBU/L 12m); fora por tempo é a R6 clássica.
//
//   2) PULVERIZADORES (pedidos de venda): regra anual antiga (o caderno de
//      cheques é dos tratores Mahindra) — só MÁQUINA (família "Pulverizador"
//      ou "pulveriz" com valor >= `valor_minimo_pulverizador`, default
//      R$ 5.000). Garantia por `garantia_meses_pulverizador` (default 36).
//
// Prioridade: 'Urgente' quando faltam menos de 30 dias pro prazo estourar.

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

// Quem estourou o prazo vai pra coluna "Fora de garantia" (formato R6).
interface OportunidadePerdida {
  regra: "R6_fora_garantia";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: string | null;
  chassis: string | null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

export interface ResultadoR7 {
  emRisco: OportunidadeR7[];
  perdidas: OportunidadePerdida[];
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

// O orquestrador chama duas vezes na mesma recomputação (uma pro R7, outra pra
// somar as `perdidas` ao R6). Memoiza por 2 minutos pra não varrer o banco em
// dobro — tratores + índice de OS + pedidos são varreduras completas.
let memoKey = "";
let memoAt = 0;
let memoPromise: Promise<ResultadoR7> | null = null;

export function computarR7Completo(parametros: ParametrosR7 = {}): Promise<ResultadoR7> {
  const k = JSON.stringify(parametros);
  if (memoPromise && memoKey === k && Date.now() - memoAt < 120_000) return memoPromise;
  memoKey = k;
  memoAt = Date.now();
  memoPromise = computarR7Inner(parametros).catch((e) => {
    memoPromise = null; // não cachear erro
    throw e;
  });
  return memoPromise;
}

async function computarR7Inner(parametros: ParametrosR7): Promise<ResultadoR7> {
  const mesesAviso = parametros.meses_aviso ?? 10;
  const mesesPerda = parametros.meses_perda ?? 12;
  const garantiaPulv = parametros.garantia_meses_pulverizador ?? 36;
  const valorMinPulv = parametros.valor_minimo_pulverizador ?? 5000;
  const hoje = new Date();
  const emRisco: OportunidadeR7[] = [];
  const perdidas: OportunidadePerdida[] = [];

  const mapOmie = await carregarMapaClientes();
  const tratores = await lerTudo<Trator>((from, to) =>
    supabase.from("tratores").select("*").range(from, to)
  );
  const chassisConhecidos = tratores.map((t) => t.Chassis || "").filter(Boolean);
  const indiceOS = await carregarIndiceOSCompleto(chassisConhecidos);

  // Classifica pela referência: aquém do aviso = nada; entre aviso e perda =
  // "em risco" (R7); estourou = "perdida" (vira card na coluna R6).
  function montar(
    base: Omit<OportunidadeR7, "regra" | "prioridade" | "detalhes">,
    referencia: Date,
    detalhesExtras: Record<string, unknown>
  ) {
    const mesesSem = (hoje.getTime() - referencia.getTime()) / MS_MES;
    if (mesesSem < mesesAviso) return;
    const dataLimite = addMeses(referencia, mesesPerda);
    const detalhes = {
      ...detalhesExtras,
      referencia: referencia.toISOString(),
      meses_sem_revisao: Math.round(mesesSem * 10) / 10,
      data_limite: dataLimite.toISOString(),
    };
    if (dataLimite <= hoje) {
      perdidas.push({
        ...base,
        regra: "R6_fora_garantia",
        prioridade: "Normal",
        detalhes: {
          ...detalhes,
          motivo: "revisao_vencida",
          sugestao: `Perdeu a garantia por falta de revisão anual (prazo venceu em ${dataLimite.toLocaleDateString("pt-BR")}). Oferecer revisão paga, reativação ou plano de manutenção.`,
        },
      });
      return;
    }
    const urgente = dataLimite.getTime() - hoje.getTime() < 30 * 86400000;
    emRisco.push({
      ...base,
      regra: "R7_garantia_risco",
      prioridade: urgente ? "Urgente" : "Normal",
      detalhes: {
        ...detalhes,
        sugestao: `Revisão anual vence em ${dataLimite.toLocaleDateString("pt-BR")}. Agendar a revisão antes disso pra não perder a garantia.`,
      },
    });
  }

  // ===== 1) TRATORES — régua dos CHEQUES Mahindra (tempo desde a ENTREGA) =====
  // 50h em 6 meses = decisão do usuário (27/07); depois da 1200h a escada
  // segue DE ANO EM ANO até a das 3000h (rótulos do controle de revisões).
  // O loop corta em garantiaMeses: pros 60m de garantia o último cobrável é
  // o das 1500h/5 anos — os seguintes só valeriam pra lembrete de revisão
  // paga (fora da garantia), que é assunto da coluna R6.
  const CHEQUES: { rotulo: string; meses: number }[] = [
    { rotulo: "50h", meses: 6 },
    { rotulo: "300h", meses: 12 },
    { rotulo: "600h", meses: 24 },
    { rotulo: "900h", meses: 36 },
    { rotulo: "1200h", meses: 48 },
    { rotulo: "1500h", meses: 60 },
    { rotulo: "1800h", meses: 72 },
    { rotulo: "2100h", meses: 84 },
    { rotulo: "2400h", meses: 96 },
    { rotulo: "2700h", meses: 108 },
    { rotulo: "3000h", meses: 120 },
  ];
  const janelaAvisoMs = Math.max(1, mesesPerda - mesesAviso) * MS_MES; // default 2 meses

  for (const t of tratores) {
    if (!t.Entrega || !t.Cliente) continue;
    const entrega = parseDataFlex(t.Entrega);
    if (!entrega) continue;

    const garantiaMeses = temCbuOuL(t.Modelo || "") ? MESES_TRATOR_CURTO : MESES_TRATOR_LONGO;
    const fimGarantia = addMeses(entrega, garantiaMeses);
    if (fimGarantia < hoje) continue; // já saiu por tempo — a R6 clássica cobre

    const ultimaRev = ultimaRevisaoRegistrada(t);
    if (!ultimaRev) continue; // nunca fez revisão — a R1 é quem cobra a primeira

    // Rótulos registrados (data + horímetro válidos) e evidências por data
    const registradas = new Map<string, Date>();
    for (const rev of REVISOES_LISTA) {
      const d = parseDataFlex(t[`${rev} Data` as keyof Trator] as string | undefined);
      const hRaw = t[`${rev} Horimetro` as keyof Trator] as string | undefined;
      const h = hRaw ? parseFloat(hRaw) : NaN;
      if (d && !isNaN(h)) registradas.set(rev, d);
    }
    const chassi = norm(t.Chassis);
    const os = (chassi && indiceOS.porChassi.get(chassi)) || indiceOS.porCliente.get(norm(t.Cliente));
    const evidencias: Date[] = [...registradas.values()];
    if (os) evidencias.push(os.data);
    const referencia = evidencias.reduce((a, b) => (b > a ? b : a), ultimaRev.data);
    const osMaisRecente = os && os.data > ultimaRev.data ? os : null;

    const baseCard = {
      codigo_omie: mapOmie.get(norm(t.Cliente)) ?? null,
      cliente_nome: t.Cliente,
      trator: `${t.Modelo || ""} — ${t.Chassis || ""}`.trim(),
      chassis: t.Chassis || null,
    };
    const detalhesBase: Record<string, unknown> = {
      tipo: "Trator",
      fonte: "tratores",
      modelo: t.Modelo,
      cidade: t.Cidade,
      vendedor: t.Vendedor,
      entrega_data: entrega.toISOString(),
      data_venda: entrega.toISOString(), // o card R6 usa data_venda
      garantia_meses: garantiaMeses,
      fim_garantia: fimGarantia.toISOString(),
      cheques_feitos: [...registradas.keys()],
      ultima_revisao: ultimaRev.data.toISOString(),
      ultima_revisao_rotulo: ultimaRev.rotulo,
      referencia: referencia.toISOString(),
      referencia_fonte: osMaisRecente ? "os" : "revisao",
      meses_sem_revisao: Math.round(((hoje.getTime() - referencia.getTime()) / MS_MES) * 10) / 10,
      ultima_os_id: os?.id_ordem ?? null,
      ultima_os_data: os?.data.toISOString() ?? null,
      ultima_os_tipo: os?.tipo_servico ?? null,
      ultima_os_fonte: os?.fonte ?? null,
      ultima_os_empresa: os?.empresa ?? null,
    };

    // Percorre os marcos do caderno: o mais antigo pendente é o alvo.
    let mesesAnterior = 0;
    for (const { rotulo, meses } of CHEQUES) {
      if (meses > garantiaMeses) break; // além da garantia (CBU/L: 50h + 300h)
      const deadline = addMeses(entrega, meses);
      const janelaIni = addMeses(entrega, mesesAnterior);
      mesesAnterior = meses;
      const feito =
        registradas.has(rotulo) ||
        evidencias.some((e) => e > janelaIni && e <= deadline);
      if (feito) continue;

      const prazoLabel = meses < 12 ? `${meses} meses` : `${meses / 12} ano${meses > 12 ? "s" : ""}`;
      const alvo = `${rotulo.replace("h", "")} horas / ${prazoLabel}`;
      if (deadline <= hoje) {
        perdidas.push({
          ...baseCard,
          regra: "R6_fora_garantia",
          prioridade: "Normal",
          detalhes: {
            ...detalhesBase,
            motivo: "revisao_vencida",
            cheque_alvo: alvo,
            cheque_rotulo: rotulo,
            data_limite: deadline.toISOString(),
            sugestao: `Perdeu a garantia: o cheque das ${alvo} não foi feito até ${deadline.toLocaleDateString("pt-BR")}. Oferecer revisão paga, reativação ou plano de manutenção.`,
          },
        });
      } else if (deadline.getTime() - hoje.getTime() <= janelaAvisoMs) {
        const urgente = deadline.getTime() - hoje.getTime() < 30 * 86400000;
        emRisco.push({
          ...baseCard,
          regra: "R7_garantia_risco",
          prioridade: urgente ? "Urgente" : "Normal",
          detalhes: {
            ...detalhesBase,
            cheque_alvo: alvo,
            cheque_rotulo: rotulo,
            data_limite: deadline.toISOString(),
            sugestao: `Agendar o cheque das ${alvo} — vence em ${deadline.toLocaleDateString("pt-BR")}; sem ele perde a garantia (válida até ${fimGarantia.toLocaleDateString("pt-BR")}).`,
          },
        });
      }
      // pendente (vencido, vencendo ou ainda longe): não olha marcos futuros
      break;
    }
  }

  // ===== 2) PULVERIZADORES — dos pedidos de venda (só máquina) =====
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
        data_venda: dataVenda.toISOString(),
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

  console.log(`[R7] em risco: ${emRisco.length} · perdidas (→R6): ${perdidas.length}`);
  return { emRisco, perdidas };
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
