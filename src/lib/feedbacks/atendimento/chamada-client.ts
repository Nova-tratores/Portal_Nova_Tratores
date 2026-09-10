"use client";
// Ligação do cockpit — lado do NAVEGADOR. Iniciar/encerrar/cancelar passam
// pelas rotas (sessão validada no servidor). Só o AUTOSAVE das notas ao vivo
// vai direto pelo supabase-js (RLS authenticated), filtrando pela própria
// chamada aberta do usuário.

import { supabase } from "@/lib/supabase";
import { authHeaders } from "@/lib/auth/client";
import type { Chamada, MotivoNegativa } from "./chamada-db";
import type { PayloadEncerrar } from "./chamada";

export interface ErroApi { erro: string; codigo?: string; detalhe?: string }

async function chamar<T>(url: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(await authHeaders()), ...(init.headers || {}) },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T & ErroApi;
  if (!res.ok) {
    const e = new Error(data?.erro || `HTTP ${res.status}`) as Error & { codigo?: string; http?: number; detalhe?: string };
    e.codigo = data?.codigo;
    e.detalhe = data?.detalhe;
    e.http = res.status;
    throw e;
  }
  return data;
}

export function iniciarChamadaApi(args: { cliente_key: string; oportunidade_id?: number | null; registro_id?: number | null; telefone?: string | null }) {
  return chamar<{ chamada_id: string; feedback_id: number; reaproveitada: boolean; chamada: Chamada | null; registro_aberto_em: string | null }>("/api/feedbacks/atendimento/chamada", {
    method: "POST",
    body: JSON.stringify(args),
  });
}

export function situacaoChamadaApi(clienteKey: string) {
  return chamar<{ aberta: Chamada | null; minha: boolean; motivos: MotivoNegativa[]; registro_aberto_em: string | null }>(
    `/api/feedbacks/atendimento/chamada?cliente_key=${encodeURIComponent(clienteKey)}`
  );
}

export function encerrarChamadaApi(chamadaId: string, payload: PayloadEncerrar) {
  return chamar<{ ok: true; feedback_id: number; status_atendimento?: string; proximo_contato_em?: string | null }>(
    `/api/feedbacks/atendimento/chamada/${encodeURIComponent(chamadaId)}`,
    { method: "PATCH", body: JSON.stringify(payload) }
  );
}

export function cancelarChamadaApi(chamadaId: string) {
  return chamar<{ ok: true }>(`/api/feedbacks/atendimento/chamada/${encodeURIComponent(chamadaId)}`, { method: "DELETE" });
}

/**
 * Autosave durante a ligação. Só grava se a chamada for do usuário logado e
 * ainda estiver aberta (o UPDATE volta 0 linhas caso contrário → `false`).
 */
export async function salvarAoVivo(chamadaId: string, campos: { notas_ao_vivo?: string | null; telefone_usado?: string | null }): Promise<boolean> {
  const { data: sess } = await supabase.auth.getSession();
  const uid = sess?.session?.user?.id;
  if (!uid) throw new Error("sessão expirada");
  const { data, error } = await supabase
    .from("feedback_chamada")
    .update(campos)
    .eq("id", chamadaId)
    .eq("atendente_id", uid)
    .is("encerrada_em", null)
    .select("id");
  if (error) throw new Error(error.message);
  return (data?.length ?? 0) > 0;
}
