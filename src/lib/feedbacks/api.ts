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
export async function buscarClientesOmie(q: string): Promise<ClienteOmie[]> {
  if (!q || q.trim().length < 2) return [];
  const termo = q.trim();
  const { data, error } = await supabase
    .from("Clientes")
    .select("id_omie, razao_social, nome_fantasia, cnpj_cpf, telefone")
    .or(
      `razao_social.ilike.%${termo}%,nome_fantasia.ilike.%${termo}%,cnpj_cpf.ilike.%${termo}%`
    )
    .limit(20);
  if (error) throw wrapErr(error);
  return (data || []) as ClienteOmie[];
}

export async function buscarProjetosOmie(q: string): Promise<ProjetoOmie[]> {
  if (!q || q.trim().length < 2) return [];
  const { data, error } = await supabase
    .from("Projeto")
    .select("id_omie, Nome_Projeto, Nome_Cliente, Codigo_Cliente")
    .ilike("Nome_Projeto", `%${q.trim()}%`)
    .limit(20);
  if (error) throw wrapErr(error);
  return (data || []) as ProjetoOmie[];
}

export async function listarTecnicos(): Promise<string[]> {
  const res = await fetch("/api/pos/tecnicos");
  if (!res.ok) return [];
  return res.json();
}
