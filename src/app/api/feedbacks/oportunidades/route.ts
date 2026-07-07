// GET    /api/feedbacks/oportunidades?status=aberta  → lista de oportunidades
// PATCH  /api/feedbacks/oportunidades?id=N           → muda status / vincula feedback_id

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/server/supabase-admin";
import type { StatusOportunidade } from "@/lib/feedbacks/types";

const STATUS_VALIDOS: StatusOportunidade[] = ["aberta", "atendida", "dispensada", "expirada"];

export async function GET(req: NextRequest) {
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
  atendida_por?: string;
  feedback_id?: number | null;
  dispensada_motivo?: string;
}

export async function PATCH(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!id) return NextResponse.json({ erro: "id obrigatório" }, { status: 400 });

  const body = (await req.json()) as PatchPayload;
  if (body.status && !STATUS_VALIDOS.includes(body.status)) {
    return NextResponse.json({ erro: "status inválido" }, { status: 400 });
  }

  const update: Record<string, unknown> = { ...body };
  if (body.status === "atendida" && !body.atendida_por) {
    return NextResponse.json({ erro: "atendida_por obrigatório quando status='atendida'" }, { status: 400 });
  }
  if (body.status === "atendida") {
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
