// Carrega as fontes do histórico de UMA máquina (SERVIDOR, service role) e
// entrega para `montarLinhaDoTempo` (pura). Cada fonte falha isolada: a que
// cair vira lista vazia + entrada em `erros`; tabela do CRM ausente idem.

import { supabaseAdmin } from "@/lib/server/supabase-admin";
import type { Trator } from "@/lib/revisoes/types";
import type { HistOS, HistPV } from "@/lib/feedbacks/historico-cliente";
import { digitos, norm, separarModeloChassi, type MaquinaCrm, type OSPortalBruta, type PPVBruto } from "./puro";
import {
  montarLinhaDoTempo, type ChequeBruto, type ChequeEmailBruto, type GarantiaBruta, type LinhaDoTempo, type ObservacaoBruta,
  type OSTecnicoBruta, type RegistroBruto, type RequisicaoBruta, type VisitaBruta,
} from "./maquina";

const sb = supabaseAdmin;

export interface HistoricoMaquina extends LinhaDoTempo {
  chassi: string;
  projetos: { nome: string; empresa: string }[];
  erros: Record<string, string>;
  gerado_em: string;
}

const SEL_OS_PORTAL = "Id_Ordem, Os_Cliente, Cnpj_Cliente, Os_Tecnico, Os_Tecnico2, Data, Data_Fim_Servico, Serv_Solicitado, Serv_Realizado, Status, Tipo_Servico, Valor_Total, Projeto, Ordem_Omie, id_omie, ID_PPV, Revisao";
const SEL_OS_OMIE = "num_os, empresa, data_inclusao, data_faturamento, etapa, status, valor_total, descricao, servicos, num_nf, cod_os, num_pedido_cli, projeto, link_nf";
const SEL_PV = "num_pedido, empresa, data_inclusao, etapa, valor_total, faturado, numero_nf, cod_pedido, link_nf";
const SEL_PPV = "id_pedido, data, cliente, status, valor_total, pedido_omie, Id_Os, Projeto, tecnico, Tipo_Pedido, nf_numero, faturado_omie_em, omie_empresa";

/** Chassi válido: 6+ caracteres alfanuméricos (com hífen), sem curingas. */
export function chassiValido(s: string): boolean {
  return /^[A-Z0-9-]{6,25}$/i.test(s);
}

export async function montarHistoricoMaquina(chassiIn: string, projetoIn?: string | null, empresaIn?: string | null): Promise<HistoricoMaquina> {
  const chassi = norm(chassiIn);
  const final7 = chassi.slice(-7);
  const final6 = chassi.slice(-6);
  const erros: Record<string, string> = {};
  const guarda = <T,>(chave: string, p: PromiseLike<{ data: unknown; error: { message: string } | null }>, vazio: T): Promise<T> =>
    Promise.resolve(p).then(({ data, error }) => { if (error) { erros[chave] = error.message; return vazio; } return (data as T) ?? vazio; }, (e) => { erros[chave] = (e as Error)?.message || String(e); return vazio; });

  // 1) trator (exato → final-7 único) e projetos Omie da máquina
  const [tratExato, tratFinal, projRows] = await Promise.all([
    guarda<Trator[]>("tratores", sb.from("tratores").select("*").ilike("Chassis", chassi).limit(2), []),
    guarda<Trator[]>("tratores", sb.from("tratores").select("*").ilike("Chassis", `%${final7}`).limit(3), []),
    guarda<{ nome: string; empresa: string }[]>("projetos", sb.from("portal_nt_projetos_PRINCIPAL").select("nome, empresa").ilike("nome", `%${final7}%`).limit(10), []),
  ]);
  const trator = tratExato[0] ?? (tratFinal.length === 1 ? tratFinal[0] : null);
  const projetos = new Map<string, { nome: string; empresa: string }>();
  if (projetoIn) projetos.set(`${projetoIn}|${empresaIn || ""}`, { nome: projetoIn, empresa: empresaIn || "Nova Tratores" });
  for (const p of projRows) if (separarModeloChassi(p.nome).chassi && norm(separarModeloChassi(p.nome).chassi).endsWith(final7)) projetos.set(`${p.nome}|${p.empresa}`, p);
  const nomesProj = [...projetos.values()].map((p) => p.nome);

  // 2) OS do portal (Projeto/Serv_Solicitado) + relatórios do técnico (chassi digitado lá)
  const [osA, tecB] = await Promise.all([
    guarda<OSPortalBruta[]>("os_portal", sb.from("Ordem_Servico").select(SEL_OS_PORTAL).or(`Projeto.ilike.%${final7}%,Serv_Solicitado.ilike.%${final7}%`).limit(200), []),
    guarda<OSTecnicoBruta[]>("os_tecnicos", sb.from("Ordem_Servico_Tecnicos").select("Ordem_Servico, Horimetro, DataFinal, Chassis").ilike("Chassis", `%${final7}%`).limit(200), []),
  ]);
  const osPortal = new Map<string, OSPortalBruta>();
  for (const o of osA) osPortal.set(String(o.Id_Ordem), o);
  const extraIds = [...new Set(tecB.map((t) => String(t.Ordem_Servico || "")).filter((id) => id && !osPortal.has(id)))];
  if (extraIds.length) {
    const osB = await guarda<OSPortalBruta[]>("os_portal", sb.from("Ordem_Servico").select(SEL_OS_PORTAL).in("Id_Ordem", extraIds.slice(0, 100)), []);
    for (const o of osB) osPortal.set(String(o.Id_Ordem), o);
  }
  const osIds = [...osPortal.keys()];
  const tecnicos = osIds.length
    ? await guarda<OSTecnicoBruta[]>("os_tecnicos", sb.from("Ordem_Servico_Tecnicos").select("Ordem_Servico, Horimetro, DataFinal, Chassis").in("Ordem_Servico", osIds.slice(0, 200)), [])
    : [];

  // 3) OS Omie (projeto ou cabeçalho do serviço), PPV, demais fontes — em paralelo
  const osOmieBuscas: PromiseLike<HistOS[]>[] = [
    guarda<HistOS[]>("os_omie", sb.from("portal_nt_clientes_os").select(SEL_OS_OMIE).ilike("servicos", `%${final7}%`).order("data_inclusao", { ascending: false }).limit(200), []),
  ];
  if (nomesProj.length) osOmieBuscas.push(guarda<HistOS[]>("os_omie", sb.from("portal_nt_clientes_os").select(SEL_OS_OMIE).in("projeto", nomesProj).order("data_inclusao", { ascending: false }).limit(200), []));

  const ppvBuscas: PromiseLike<PPVBruto[]>[] = [
    guarda<PPVBruto[]>("ppv", sb.from("pedidos").select(SEL_PPV).ilike("Projeto", `%${final7}%`).limit(100), []),
  ];
  if (osIds.length) ppvBuscas.push(guarda<PPVBruto[]>("ppv", sb.from("pedidos").select(SEL_PPV).in("Id_Os", osIds.slice(0, 100)).limit(200), []));

  const [osOmieListas, ppvListas, chequesEmail, cheques, garantias, requisicoes, registros, observacoes, crmRows] = await Promise.all([
    Promise.all(osOmieBuscas),
    Promise.all(ppvBuscas),
    guarda<ChequeEmailBruto[]>("revisao_emails", sb.from("revisao_emails").select("id, chassis, horas, enviado_em, registro_manual, pdf_url, cliente").ilike("chassis", `%${final7}`).limit(50), []),
    guarda<ChequeBruto[]>("revisao_cheques", sb.from("revisao_cheques").select("id, os_id, horas, assinado_em, assinado_nome, created_at, atrasado, token").ilike("chassis", `%${final7}`).limit(50), []),
    guarda<GarantiaBruta[]>("garantias", sb.from("garantias").select("id, numero, id_ordem, status, resultado, created_at, finalizada_em, tecnico_nome, valor_pago_total").ilike("chassis", `%${final7}`).limit(50), []),
    guarda<RequisicaoBruta[]>("requisicoes", sb.from("Requisicao").select("id, titulo, tipo, status, valor_despeza, created_at, data, solicitante, fornecedor, Chassis_Modelo").or(`Chassis_Modelo.ilike.%${final6}%,obs.ilike.%${final6}%,titulo.ilike.%${final6}%`).order("id", { ascending: false }).limit(50), []),
    guarda<RegistroBruto[]>("atendimentos", sb.from("feedback_registros").select("id, tipo, data_contato, data_servico, ultimo_servico, criado_em, feedback, acao, motivo, atendente_nome, nome, status_atendimento").ilike("trator", `%${final6}%`).order("criado_em", { ascending: false }).limit(50), []),
    guarda<ObservacaoBruta[]>("observacoes", sb.from("trator_observacoes").select("id, tipo, texto, status, criado_por_nome, created_at").ilike("chassis", `%${final7}`).limit(50), []),
    guarda<MaquinaCrm[]>("crm", sb.from("maquinas").select("id, tipo, marca, modelo, ano, numero_serie, horimetro, estado, observacoes").ilike("numero_serie", `%${final7}`).limit(3), []),
  ]);
  // tabela do CRM ausente não é erro do cockpit
  if (erros.crm && /does not exist|schema cache|not find/i.test(erros.crm)) delete erros.crm;

  const osOmie = new Map<string, HistOS>();
  for (const lista of osOmieListas) for (const o of lista) osOmie.set(`${o.empresa}|${o.num_os}`, o);
  const ppvs = new Map<string, PPVBruto>();
  for (const lista of ppvListas) for (const p of lista) ppvs.set(p.id_pedido, p);

  // PVs citados nas OS Omie (num_pedido_cli) e nos PPVs (pedido_omie)
  const pvNums = new Set<string>();
  for (const o of osOmie.values()) { const d = digitos(o.num_pedido_cli); if (d) pvNums.add(d); }
  for (const p of ppvs.values()) { const d = digitos(p.pedido_omie).replace(/^0+/, ""); if (d) pvNums.add(d); }
  const pvs = pvNums.size
    ? await guarda<HistPV[]>("pv", sb.from("portal_nt_clientes_pv").select(SEL_PV).in("num_pedido", [...pvNums].slice(0, 100)).limit(200), [])
    : [];

  const crm = crmRows[0] ?? null;
  let visitas: VisitaBruta[] = [];
  if (crm) {
    visitas = await guarda<VisitaBruta[]>("visitas", sb.from("vw_visitas_detalhadas").select("id, data_visita, tipo, resumo, proximos_passos, vendedor_nome").contains("maquina_ids", [crm.id]).is("deleted_at", null).limit(50), []);
  }

  const linha = montarLinhaDoTempo({
    chassi, trator, osPortal: [...osPortal.values()], tecnicos, osOmie: [...osOmie.values()], pvs, ppvs: [...ppvs.values()],
    chequesEmail, cheques, garantias, requisicoes, registros, observacoes, crm, visitas,
  });
  return { ...linha, chassi, projetos: [...projetos.values()], erros, gerado_em: new Date().toISOString() };
}
