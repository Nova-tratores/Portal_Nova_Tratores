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
      .from("Projeto")
      .select("id_omie, Nome_Projeto, Nome_Cliente, Codigo_Cliente")
      .ilike("Nome_Projeto", `%${termo}%`)
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
    id_omie: string;
    Nome_Projeto: string;
    Nome_Cliente?: string | null;
    Codigo_Cliente?: string | null;
  }>).map((p) => ({ ...p, fonte: "omie" as const }));

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
