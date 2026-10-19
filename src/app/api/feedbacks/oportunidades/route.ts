// GET    /api/feedbacks/oportunidades?status=aberta  → lista de oportunidades
// PATCH  /api/feedbacks/oportunidades?id=N           → muda status / vincula feedback_id

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";
import type { StatusOportunidade } from "@/lib/feedbacks/types";
import { protegerRota } from "@/lib/ajustes/permissao-server";

const STATUS_VALIDOS: StatusOportunidade[] = ["aberta", "atendida", "dispensada", "expirada"];

// Aba /feedbacks/oportunidades (FeedbackTabs): pode('feedbacks', 'oportunidades').
const ACESSO = [{ modulo: "feedbacks", acao: "oportunidades" }];

export async function GET(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const { searchParams } = new URL(req.url);
  const status = (searchParams.get("status") || "aberta") as StatusOportunidade | "todas";

  let q = supabase
    .from("feedback_oportunidades")
    .select("*")
    .order("prioridade", { ascending: false })
    .order("computado_em", { ascending: false });
  if (status !== "todas") q = q.eq("status", status);

  const { data, error } = await q;
  if (error) {
    return NextResponse.json({ erro: error.message }, { status: 500 });
  }
  return NextResponse.json(data || []);
}

interface PatchPayload {
  status?: StatusOportunidade;
  feedback_id?: number | null;
  dispensada_motivo?: string;
}

export async function PATCH(req: NextRequest) {
  const g = await protegerRota(req, ACESSO);
  if (g.resposta) return g.resposta;
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const body = (await req.json()) as PatchPayload;
  if (body.status && !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ erro: "status inválido" }, { status: 400 });
  }

  // Só os campos que a tela edita (Atender / Dispensar). `atendida_por` vem do
  // login (mesmo formato que a tela mandava: o user.id), nunca do corpo.
  const update: Record<string, unknown> = {};
  if (body.status !== undefined) update.status = body.status;
  if (body.feedback_id !== undefined) update.feedback_id = body.feedback_id;
  if (body.dispensada_motivo !== undefined) update.dispensada_motivo = body.dispensada_motivo;
  if (Object.keys(update).length === 0) {
    return NextResponse.json({ erro: "nada para atualizar" }, { status: 400 });
  }
  if (body.status === "atendida") {
    update.atendida_por = g.user.id;
    update.atendida_em = new Date().toISOString();
  }

  const { data, error } = await supabase
    .from("feedback_oportunidades")
    .update(update)
    .eq("id", id)
    .select()
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 500 });
  return NextResponse.json(data);
}
