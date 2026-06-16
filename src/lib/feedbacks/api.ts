// Wrappers Supabase para o módulo Feedbacks. Cobre as 4 tabelas do schema
// e os lookups que o módulo faz nas tabelas existentes do Portal
// (Clientes, Projeto, Tecnicos_Appsheet).

import { supabase } from "@/lib/supabase";
import type {
  ClienteInfo,
  ClienteOmie,
  ConfigRegra,
  FeedbackRegistro,
  Oportunidade,
  ProjetoOmie,
  RegraOportunidade,
  StatusOportunidade,
  TipoFeedback,
} from "./types";

// Transforma PostgrestError do Supabase (que não é instanceof Error) em Error
// nativo com mensagem legível. Sem isso, "throw error" + String(e) vira
// "[object Object]".
function wrapErr(e: unknown): Error {
  if (e instanceof Error) return e;
  if (e && typeof e === "object") {
    const obj = e as { message?: string; details?: string; hint?: string; code?: string };
    const partes = [obj.message, obj.details, obj.hint, obj.code ? `(${obj.code})` : null].filter(Boolean);
    return new Error(partes.join(" — ") || JSON.stringify(e));
  }
  return new Error(String(e));
}

// -----------------------------------------------------------------------------
// feedback_registros
// -----------------------------------------------------------------------------
export async function listarRegistros(tipo?: TipoFeedback): Promise<FeedbackRegistro[]> {
  let q = supabase
    .from("feedback_registros")
    .select("*")
    .order("criado_em", { ascending: false });
  if (tipo) q = q.eq("tipo", tipo);
  const { data, error } = await q;
  if (error) throw wrapErr(error);
  return (data || []) as FeedbackRegistro[];
}

export async function inserirRegistro(
  payload: Partial<FeedbackRegistro>
): Promise<FeedbackRegistro> {
  const { data, error } = await supabase
    .from("feedback_registros")
    .insert(payload)
    .select()
    .single();
  if (error) throw wrapErr(error);
  return data as FeedbackRegistro;
}

export async function atualizarRegistro(
  id: number,
  payload: Partial<FeedbackRegistro>
): Promise<FeedbackRegistro> {
  const { data, error } = await supabase
    .from("feedback_registros")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw wrapErr(error);
  return data as FeedbackRegistro;
}

export async function deletarRegistro(id: number): Promise<void> {
  const { error } = await supabase.from("feedback_registros").delete().eq("id", id);
  if (error) throw wrapErr(error);
}

// -----------------------------------------------------------------------------
// Última OS (oficina) por cliente — pra mostrar nos cards de CRM/RFM quem foi o
// último técnico que fez serviço e quando. Usa Ordem_Servico (Portal interno),
// única fonte com nome de técnico (Os_Tecnico). Match por nome do cliente
// (exato, trim) — best-effort, mesma convenção do resto do módulo.
// -----------------------------------------------------------------------------
export interface UltimaOS {
  tecnico: string | null;
  data: string | null;   // string original (ISO ou DD/MM/YYYY)
  tipo: string | null;
}

function tsData(s: string | null | undefined): number {
  if (!s) return 0;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})(?:[ T](\d{2}):(\d{2}))?/);
  if (!m) return 0;
  const [, dd, mm, yyyy, hh = "0", min = "0"] = m;
  return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh), Number(min)).getTime();
}

export async function buscarUltimasOSPorCliente(nomes: string[]): Promise<Record<string, UltimaOS>> {
  const unicos = Array.from(new Set(nomes.map((n) => (n || "").trim()).filter(Boolean)));
  if (!unicos.length) return {};
  const acc: Record<string, { ts: number; os: UltimaOS }> = {};
  // Em lotes pra não estourar o tamanho da URL do filtro `in`.
  const LOTE = 50;
  for (let i = 0; i < unicos.length; i += LOTE) {
    const lote = unicos.slice(i, i + LOTE);
    const { data, error } = await supabase
      .from("Ordem_Servico")
      .select("Os_Cliente, Os_Tecnico, Os_Tecnico2, Data, Data_Fim_Servico, Tipo_Servico")
      .in("Os_Cliente", lote);
    if (error) throw wrapErr(error);
    for (const o of (data || []) as Array<Record<string, string | null>>) {
      const cli = (o.Os_Cliente || "").trim();
      if (!cli) continue;
      const ts = Math.max(tsData(o.Data_Fim_Servico), tsData(o.Data));
      const atual = acc[cli];
      if (!atual || ts > atual.ts) {
        acc[cli] = {
          ts,
          os: {
            tecnico: o.Os_Tecnico || o.Os_Tecnico2 || null,
            data: o.Data_Fim_Servico || o.Data || null,
            tipo: o.Tipo_Servico || null,
          },
        };
      }
    }
  }
  const out: Record<string, UltimaOS> = {};
  for (const k of Object.keys(acc)) out[k] = acc[k].os;
  return out;
}

// -----------------------------------------------------------------------------
// Histórico do cliente — agrega OS, Pedidos de Venda e Requisições do banco.
// OS/PV: tabelas por cliente (cod_cli = código Omie). Requisições: por nome.
// Best-effort: cada fonte falha de forma isolada (não derruba as outras).
// -----------------------------------------------------------------------------
export interface HistOS {
  num_os: string | null; empresa: string | null; data_inclusao: string | null;
  data_faturamento: string | null; etapa: string | null; status: string | null;
  valor_total: number | null; descricao: string | null; servicos: string | null; num_nf: string | null;
}
export interface HistPV {
  num_pedido: string | null; empresa: string | null; data_inclusao: string | null;
  etapa: string | null; valor_total: number | null; faturado: string | null; numero_nf: string | null;
}
export interface HistReq {
  id: number; titulo: string | null; tipo: string | null; data: string | null;
  status: string | null; fornecedor: string | null; valor_despeza: number | null; ordem_servico: string | null;
}
export interface HistoricoCliente { os: HistOS[]; pv: HistPV[]; requisicoes: HistReq[] }

export async function buscarHistoricoCliente(codigoOmie: string | null, nome: string): Promise<HistoricoCliente> {
  const out: HistoricoCliente = { os: [], pv: [], requisicoes: [] };
  const tarefas: PromiseLike<unknown>[] = [];
  if (codigoOmie) {
    tarefas.push(
      supabase.from("portal_nt_clientes_os")
        .select("num_os, empresa, data_inclusao, data_faturamento, etapa, status, valor_total, descricao, servicos, num_nf")
        .eq("cod_cli", codigoOmie).order("data_inclusao", { ascending: false }).limit(100)
        .then(({ data }) => { out.os = (data || []) as HistOS[]; })
    );
    tarefas.push(
      supabase.from("portal_nt_clientes_pv")
        .select("num_pedido, empresa, data_inclusao, etapa, valor_total, faturado, numero_nf")
        .eq("cod_cli", codigoOmie).order("data_inclusao", { ascending: false }).limit(100)
        .then(({ data }) => { out.pv = (data || []) as HistPV[]; })
    );
  }
  if (nome && nome.trim().length >= 3) {
    tarefas.push(
      supabase.from("Requisicao")
        .select("id, titulo, tipo, data, status, fornecedor, valor_despeza, ordem_servico")
        .ilike("cliente", `%${nome.trim()}%`).order("id", { ascending: false }).limit(100)
        .then(({ data }) => { out.requisicoes = (data || []) as HistReq[]; })
    );
  }
  await Promise.allSettled(tarefas);
  return out;
}

// -----------------------------------------------------------------------------
// feedback_clientes_info
// -----------------------------------------------------------------------------
export async function listarClientesInfo(): Promise<ClienteInfo[]> {
  const { data, error } = await supabase
    .from("feedback_clientes_info")
    .select("*")
    .order("atualizado_em", { ascending: false });
  if (error) throw wrapErr(error);
  return (data || []) as ClienteInfo[];
}

export async function buscarClienteInfo(clienteKey: string): Promise<ClienteInfo | null> {
  const { data, error } = await supabase
    .from("feedback_clientes_info")
    .select("*")
    .eq("cliente_key", clienteKey)
    .maybeSingle();
  if (error) throw wrapErr(error);
  return (data as ClienteInfo | null) ?? null;
}

export async function upsertClienteInfo(
  payload: Partial<ClienteInfo> & { cliente_key: string }
): Promise<ClienteInfo> {
  const { data, error } = await supabase
    .from("feedback_clientes_info")
    .upsert(payload, { onConflict: "cliente_key" })
    .select()
    .single();
  if (error) throw wrapErr(error);
  return data as ClienteInfo;
}

// -----------------------------------------------------------------------------
// feedback_oportunidades
// -----------------------------------------------------------------------------
export async function listarOportunidades(
  status: StatusOportunidade | "todas" = "aberta"
): Promise<Oportunidade[]> {
  let q = supabase
    .from("feedback_oportunidades")
    .select("*")
    .order("prioridade", { ascending: false })
    .order("computado_em", { ascending: false });
  if (status !== "todas") q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw wrapErr(error);
  return (data || []) as Oportunidade[];
}

export async function atualizarOportunidade(
  id: number,
  payload: Partial<Oportunidade>
): Promise<Oportunidade> {
  const { data, error } = await supabase
    .from("feedback_oportunidades")
    .update(payload)
    .eq("id", id)
    .select()
    .single();
  if (error) throw wrapErr(error);
  return data as Oportunidade;
}

// -----------------------------------------------------------------------------
// feedback_config_regras
// -----------------------------------------------------------------------------
export async function listarConfigRegras(): Promise<ConfigRegra[]> {
  const { data, error } = await supabase.from("feedback_config_regras").select("*");
  if (error) throw wrapErr(error);
  return (data || []) as ConfigRegra[];
}

export async function salvarConfigRegra(
  regra: RegraOportunidade,
  parametros: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase
    .from("feedback_config_regras")
    .upsert({ regra, parametros }, { onConflict: "regra" });
  if (error) throw wrapErr(error);
}

// -----------------------------------------------------------------------------
// Lookups nas tabelas existentes do Portal (Clientes, Projeto, Tecnicos)
// -----------------------------------------------------------------------------
// Lookup direto por id_omie — usado quando atendemos uma oportunidade pra
// puxar telefone, email e outros contatos.
export async function buscarClientePorOmieId(idOmie: string): Promise<ClienteOmie | null> {
  if (!idOmie) return null;
  const { data, error } = await supabase
    .from("portal_nt_clientes_PRINCIPAL")
    .select("id_omie, razao_social, nome_fantasia, cnpj_cpf, telefone, email")
    .eq("id_omie", idOmie)
    .maybeSingle();
  if (error) throw wrapErr(error);
  return (data as ClienteOmie | null) ?? null;
}

export async function buscarClientesOmie(q: string): Promise<ClienteOmie[]> {
  if (!q || q.trim().length < 2) return [];
  const termo = q.trim();
  const { data, error } = await supabase
    .from("portal_nt_clientes_PRINCIPAL")
    .select("id_omie, razao_social, nome_fantasia, cnpj_cpf, telefone, email")
    .or(
      `razao_social.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%,cnpj_cpf.ilike.%${termo}%`
    )
    .limit(20);
  if (error) throw wrapErr(error);
  return (data || []) as ClienteOmie[];
}

// Busca em DUAS fontes em paralelo e mescla:
//   1. `Projeto` — sync Omie de projetos (id_omie real)
//   2. `tratores` — controle interno do Portal (tratores que nem sempre estão
//      cadastrados como projeto no Omie, mas existem no banco)
// Deduplica por chassi quando aparece em ambos.
export async function buscarProjetosOmie(q: string): Promise<ProjetoOmie[]> {
  if (!q || q.trim().length < 2) return [];
  const termo = q.trim();

  const [omieRes, tratoresRes] = await Promise.all([
    supabase
      .from("portal_nt_projetos_PRINCIPAL")
      .select("codigo, nome, cliente_nome_ultimo, cod_cli_ultimo")
      .ilike("nome", `%${termo}%`)
      .limit(10),
    supabase
      .from("tratores")
      .select(`"ID", "Modelo", "Chassis", "Cliente"`)
      .or(`Chassis.ilike.%${termo}%,Modelo.ilike.%${termo}%`)
      .limit(10),
  ]);

  if (omieRes.error) throw wrapErr(omieRes.error);
  // erro em tratores é tolerado (best-effort) — não bloqueia a busca

  const omieList: ProjetoOmie[] = ((omieRes.data || []) as Array<{
    codigo: number;
    nome: string;
    cliente_nome_ultimo?: string | null;
    cod_cli_ultimo?: number | null;
  }>).map((p) => ({
    id_omie: String(p.codigo),
    Nome_Projeto: p.nome,
    Nome_Cliente: p.cliente_nome_ultimo || null,
    Codigo_Cliente: p.cod_cli_ultimo ? String(p.cod_cli_ultimo) : null,
    fonte: "omie" as const,
  }));

  const tratoresList: ProjetoOmie[] = ((tratoresRes.data || []) as Array<{
    ID: string | number | null;
    Modelo: string | null;
    Chassis: string | null;
    Cliente: string | null;
  }>).map((t) => ({
    id_omie: `tratores-${String(t.ID ?? "")}`,
    Nome_Projeto: `${t.Modelo || ""} ${t.Chassis || ""}`.trim(),
    Nome_Cliente: t.Cliente,
    fonte: "portal" as const,
  }));

  // Deduplica: se o chassi do trator já aparece em algum Nome_Projeto Omie, pula.
  const projetosUpper = omieList.map((p) => p.Nome_Projeto.toUpperCase());
  const merged: ProjetoOmie[] = [...omieList];
  for (const p of tratoresList) {
    const chassi = (p.Nome_Projeto.split(/\s+/).pop() || "").toUpperCase();
    const jaTem = chassi && projetosUpper.some((v) => v.includes(chassi));
    if (!jaTem) merged.push(p);
  }

  return merged.slice(0, 20);
}

export async function listarTecnicos(): Promise<string[]> {
  const res = await fetch("/api/pos/tecnicos");
  if (!res.ok) return [];
  return res.json();
}
