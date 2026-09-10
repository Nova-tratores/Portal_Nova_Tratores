// Ligação do cockpit — acesso ao banco (SERVIDOR, service role). Chama as RPCs
// de sql/create-feedback-chamada.sql com o atendente vindo da sessão validada
// pela rota (exigirPermissao). Nunca confia em atendente do body.

import { supabaseAdmin as sb } from "@/lib/server/supabase-admin";
import { mapearErroRpc, type Desfecho, type ErroRpc, type PayloadEncerrar } from "./chamada";

export interface Chamada {
  id: string;
  feedback_id: number;
  oportunidade_id: number | null;
  cliente_key: string;
  atendente_id: string;
  atendente_nome: string;
  iniciada_em: string;
  encerrada_em: string | null;
  duracao_seg: number | null;
  telefone_usado: string | null;
  notas_ao_vivo: string | null;
  status_anterior: string | null;
  desfecho: Desfecho | null;
  motivo_negativa_id: number | null;
  motivo_negativa_obs: string | null;
  proximo_contato_em: string | null;
  servico_previsto_em: string | null;
  notas_encerramento: string | null;
  humor_cliente: number | null;
  qualidade_conversa: number | null;
}

export interface Atendente { id: string; nome: string }

export class RpcError extends Error {
  erro: ErroRpc;
  constructor(erro: ErroRpc) {
    super(erro.mensagem);
    this.erro = erro;
  }
}

function lancar(error: { message?: string } | null): never {
  throw new RpcError(mapearErroRpc(error?.message));
}

export async function iniciarChamada(
  atendente: Atendente,
  args: { cliente_key: string; oportunidade_id?: number | null; registro_id?: number | null; telefone?: string | null }
): Promise<{ chamada_id: string; feedback_id: number; reaproveitada: boolean }> {
  const { data, error } = await sb.rpc("feedback_iniciar_chamada", {
    p_cliente_key: args.cliente_key,
    p_atendente_id: atendente.id,
    p_atendente_nome: atendente.nome,
    p_oportunidade_id: args.oportunidade_id ?? null,
    p_registro_id: args.registro_id ?? null,
    p_telefone: args.telefone ?? null,
  });
  if (error) lancar(error);
  return data as { chamada_id: string; feedback_id: number; reaproveitada: boolean };
}

export async function encerrarChamada(
  atendente: Atendente,
  chamadaId: string,
  payload: PayloadEncerrar
): Promise<{ ok: true; feedback_id: number; status_atendimento?: string; proximo_contato_em?: string | null; ja_encerrada?: boolean }> {
  const { data, error } = await sb.rpc("feedback_encerrar_chamada", {
    p_chamada_id: chamadaId,
    p_atendente_id: atendente.id,
    p_payload: payload,
  });
  if (error) lancar(error);
  return data as { ok: true; feedback_id: number };
}

export async function cancelarChamada(atendente: Atendente, chamadaId: string): Promise<{ ok: true; feedback_id?: number; ja_removida?: boolean }> {
  const { data, error } = await sb.rpc("feedback_cancelar_chamada", { p_chamada_id: chamadaId, p_atendente_id: atendente.id });
  if (error) lancar(error);
  return data as { ok: true };
}

/** Chamada ABERTA do cliente (de qualquer atendente) — para retomar ou avisar "em atendimento por". */
export async function chamadaAbertaDoCliente(clienteKey: string): Promise<Chamada | null> {
  const { data, error } = await sb
    .from("feedback_chamada")
    .select("*")
    .eq("cliente_key", clienteKey)
    .is("encerrada_em", null)
    .order("iniciada_em", { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);
  return ((data || [])[0] as Chamada) ?? null;
}

export async function buscarChamada(chamadaId: string): Promise<Chamada | null> {
  const { data, error } = await sb.from("feedback_chamada").select("*").eq("id", chamadaId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Chamada) ?? null;
}

/** aberto_em do registro ligado à chamada (a UI usa para prever a regra das 24 h). */
export async function abertoEmDoRegistro(feedbackId: number | null | undefined): Promise<string | null> {
  if (!feedbackId) return null;
  const { data } = await sb.from("feedback_registros").select("aberto_em").eq("id", feedbackId).maybeSingle();
  return (data as { aberto_em?: string | null } | null)?.aberto_em ?? null;
}

export interface MotivoNegativa { id: number; nome: string }

export async function listarMotivosNegativa(): Promise<MotivoNegativa[]> {
  const { data, error } = await sb
    .from("oportunidade_motivo")
    .select("id, nome, ativo, aplica_a")
    .eq("ativo", true)
    .contains("aplica_a", ["feedbacks"])
    .order("id");
  if (error) throw new Error(error.message);
  return (data || []).map((m) => ({ id: Number((m as { id: number }).id), nome: String((m as { nome: string }).nome) }));
}
