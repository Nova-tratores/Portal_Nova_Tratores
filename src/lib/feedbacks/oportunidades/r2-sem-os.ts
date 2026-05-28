// R2 — Cliente sem contato recente (nem OS, nem feedback).
//
// Qualquer cliente nosso (com pelo menos 1 trator vendido pela Nova) cujo
// último contato — última OS na oficina OU último feedback registrado —
// foi há ≥ M dias (default 90 = 3 meses).
//
// Considera qualquer Tipo_Servico (manutenção, revisão, etc) como contato.
// Considera qualquer feedback_registros (CRM ou RFM) com data_contato como
// contato.
//
// Prioridade: 'Urgente' se nunca teve atividade nos últimos 2 anos OU se
// ≥ urgente_a_partir_de equipamentos.

import { supabase } from "@/lib/supabase";
import { lerTudo } from "./_paginar";

interface ParametrosR2 {
  min_dias_sem_os?: number;      // default 90 (3 meses)
  urgente_a_partir_de?: number;  // default 5 equipamentos → Urgente
}

interface OportunidadeR2 {
  regra: "R2_sem_os";
  codigo_omie: string | null;
  cliente_nome: string;
  trator: null;
  chassis: null;
  detalhes: Record<string, unknown>;
  prioridade: "Urgente" | "Normal";
}

function norm(s: string | null | undefined): string {
  return (s || "").trim().toUpperCase();
}

export async function computarR2(parametros: ParametrosR2 = {}): Promise<OportunidadeR2[]> {
  const minDias = parametros.min_dias_sem_os ?? 90;
  const urgenteAt = parametros.urgente_a_partir_de ?? 5;
  const hoje = Date.now();
  console.log(`[R2] start — minDias=${minDias} urgenteAt=${urgenteAt} hoje=${new Date(hoje).toISOString()}`);

  // 1) tratores por cliente (todo cliente com pelo menos 1 trator entra).
  // Trazemos Modelo/Chassis/Entrega tambem pra usar como referencia de
  // "ultima interacao" quando o cliente nao tem OS nem feedback registrado.
  const tratores = await lerTudo<{
    Cliente: string;
    Modelo: string | null;
    Chassis: string | null;
    Entrega: string | null;
  }>((from, to) =>
    supabase.from("tratores").select("Cliente, Modelo, Chassis, Entrega").range(from, to)
  );
  console.log(`[R2] tratores carregados: ${tratores.length}`);

  interface TratorMaisRecente {
    modelo: string | null;
    chassis: string | null;
    entrega: string | null;
  }
  const countByCliente = new Map<string, number>();
  const nomeOriginal = new Map<string, string>();
  const tratorMaisRecente = new Map<string, TratorMaisRecente>();
  for (const t of tratores) {
    const key = norm(t.Cliente);
    if (!key) continue;
    countByCliente.set(key, (countByCliente.get(key) || 0) + 1);
    if (!nomeOriginal.has(key)) nomeOriginal.set(key, t.Cliente);

    const atual = tratorMaisRecente.get(key);
    const entregaAtual = atual?.entrega || "";
    const entregaNovo = t.Entrega || "";
    if (!atual || entregaNovo > entregaAtual) {
      tratorMaisRecente.set(key, { modelo: t.Modelo, chassis: t.Chassis, entrega: t.Entrega });
    }
  }
  console.log(`[R2] clientes unicos em tratores: ${countByCliente.size}`);

  // 2) última OS por cliente (qualquer Tipo_Servico, qualquer Status)
  //
  // Usa `Data` (abertura) como filtro principal porque muitas OSs no banco
  // têm `Data_Fim_Servico` NULL (oficina não preenche sempre).
  const limite2anos = new Date(hoje - 2 * 365 * 86400000).toISOString();
  const ordens = await lerTudo<{
    Id_Ordem: string | null;
    Os_Cliente: string | null;
    Data: string | null;
    Data_Fim_Servico: string | null;
    Tipo_Servico: string | null;
  }>((from, to) =>
    supabase
      .from("Ordem_Servico")
      .select("Id_Ordem, Os_Cliente, Data, Data_Fim_Servico, Tipo_Servico")
      .gte("Data", limite2anos)
      .range(from, to)
  );

  console.log(`[R2] OSs carregadas (Data >= 2 anos): ${ordens.length}`);

  interface UltimaOSInfo {
    data: string;
    id_ordem: string | null;
    tipo_servico: string | null;
  }
  const ultimaOSByCliente = new Map<string, UltimaOSInfo>();
  for (const o of ordens) {
    const key = norm(o.Os_Cliente);
    if (!key) continue;
    const dataEfetiva = o.Data_Fim_Servico || o.Data;
    if (!dataEfetiva) continue;
    const atual = ultimaOSByCliente.get(key);
    if (!atual || dataEfetiva > atual.data) {
      ultimaOSByCliente.set(key, { data: dataEfetiva, id_ordem: o.Id_Ordem, tipo_servico: o.Tipo_Servico });
    }
  }
  console.log(`[R2] clientes unicos com OS: ${ultimaOSByCliente.size}`);

  // 3) último feedback (CRM ou RFM) por cliente — também conta como contato
  const feedbacks = await lerTudo<{
    nome: string | null;
    data_contato: string | null;
    data_servico: string | null;
    ultimo_servico: string | null;
    criado_em: string;
  }>((from, to) =>
    supabase
      .from("feedback_registros")
      .select("nome, data_contato, data_servico, ultimo_servico, criado_em")
      .range(from, to)
  );

  console.log(`[R2] feedbacks carregados: ${feedbacks.length}`);

  const ultimoContatoByCliente = new Map<string, string>();
  for (const f of feedbacks) {
    const key = norm(f.nome);
    if (!key) continue;
    const dRef = f.data_contato || f.data_servico || f.ultimo_servico || f.criado_em.slice(0, 10);
    if (!dRef) continue;
    const atual = ultimoContatoByCliente.get(key);
    if (!atual || dRef > atual) ultimoContatoByCliente.set(key, dRef);
  }

  const mapOmie = await carregarMapaClientes();
  console.log(`[R2] Clientes (mapa omie): ${mapOmie.size}`);

  let pulouRecente = 0;
  let semAtividadeCount = 0;
  let comAtividadeAntiga = 0;

  const out: OportunidadeR2[] = [];
  for (const [keyNorm, count] of countByCliente.entries()) {
    const ultimaOS = ultimaOSByCliente.get(keyNorm);
    const ultimoFeedback = ultimoContatoByCliente.get(keyNorm);

    // Última atividade = a mais recente entre OS e feedback (comparação explícita)
    let ultimaAtividade: string | undefined;
    let ultimaAtividadeOrigem: "os" | "feedback" | undefined;
    if (ultimaOS && ultimoFeedback) {
      if (ultimaOS.data > ultimoFeedback) {
        ultimaAtividade = ultimaOS.data;
        ultimaAtividadeOrigem = "os";
      } else {
        ultimaAtividade = ultimoFeedback;
        ultimaAtividadeOrigem = "feedback";
      }
    } else if (ultimaOS) {
      ultimaAtividade = ultimaOS.data;
      ultimaAtividadeOrigem = "os";
    } else if (ultimoFeedback) {
      ultimaAtividade = ultimoFeedback;
      ultimaAtividadeOrigem = "feedback";
    }

    let diasDesde: number | null = null;
    if (ultimaAtividade) {
      diasDesde = Math.floor((hoje - new Date(ultimaAtividade).getTime()) / 86400000);
      if (diasDesde < minDias) {
        pulouRecente++;
        continue;  // teve atividade recente — pula
      }
      comAtividadeAntiga++;
    } else {
      semAtividadeCount++;
    }

    const semAtividade = !ultimaAtividade;
    const prioridade: "Urgente" | "Normal" =
      semAtividade || count >= urgenteAt ? "Urgente" : "Normal";

    const trec = tratorMaisRecente.get(keyNorm);

    out.push({
      regra: "R2_sem_os",
      codigo_omie: mapOmie.get(keyNorm) ?? null,
      cliente_nome: nomeOriginal.get(keyNorm) || keyNorm,
      trator: null,
      chassis: null,
      prioridade,
      detalhes: {
        total_equipamentos: count,
        ultima_os_data: ultimaOS?.data ?? null,
        ultima_os_id: ultimaOS?.id_ordem ?? null,
        ultima_os_tipo: ultimaOS?.tipo_servico ?? null,
        ultimo_feedback: ultimoFeedback ?? null,
        ultima_atividade: ultimaAtividade ?? null,
        ultima_atividade_origem: ultimaAtividadeOrigem ?? null,
        dias_sem_atividade: diasDesde,
        // Fallback quando nao ha OS nem feedback — usar trator mais recente entregue
        entrega_data: trec?.entrega ?? null,
        entrega_trator: trec ? `${trec.modelo || ""} — ${trec.chassis || ""}`.trim() : null,
        sugestao: semAtividade
          ? `Cliente com ${count} equipamento(s) e SEM OS/feedback nos últimos 2 anos`
          : `${count} equipamento(s) · ${diasDesde} dias sem qualquer contato (OS ou feedback)`,
      },
    });
  }
  console.log(`[R2] resultado: pulou_recente=${pulouRecente} sem_atividade=${semAtividadeCount} com_atividade_antiga=${comAtividadeAntiga} oportunidades=${out.length}`);
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
      .from("Clientes")
      .select("id_omie, nome_fantasia, razao_social")
      .range(from, to)
  );
  for (const c of clientes) {
    if (c.nome_fantasia) m.set(c.nome_fantasia.trim().toUpperCase(), c.id_omie);
    if (c.razao_social)  m.set(c.razao_social.trim().toUpperCase(),  c.id_omie);
  }
  return m;
}
