// Solicitações confirmadas no Tratorilson do NovaZap — alimentam o painel
// do ícone do zap no header. GET lista (auth), PATCH marca como atendida.
// A INSERÇÃO acontece na rota /api/assistente/novazap (ferramenta
// registrar_solicitacao, service role).
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const sb = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    { auth: { persistSession: false, autoRefreshToken: false } }
  );

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  try {
    const { data, error } = await sb()
      .from("tratorilson_solicitacoes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw error;
    const novas = (data || []).filter((s) => (s.fase || (s.status === "atendida" ? "concluida" : "nova")) === "nova").length;
    return NextResponse.json(
      { solicitacoes: data || [], novas },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch {
    // tabela ainda não criada → painel vazio, sem quebrar
    return NextResponse.json({ solicitacoes: [], novas: 0, aviso: "tabela tratorilson_solicitacoes não encontrada — rode sql/tratorilson-solicitacoes.sql" });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const id = Number(body?.id);
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

  const FASES = ["nova", "orcamento", "aguardando_data", "agendado", "execucao", "concluida"];
  const mudanca: Record<string, unknown> = {};
  if (typeof body?.fase === "string" && FASES.includes(body.fase)) {
    mudanca.fase = body.fase;
    if (body.fase === "concluida") {
      mudanca.status = "atendida";
      mudanca.atendida_por = auth.email || auth.userId || "portal";
      mudanca.atendida_em = new Date().toISOString();
    }
  }
  if (body?.data_servico === null || typeof body?.data_servico === "string") {
    mudanca.data_servico = body.data_servico || null;
  }
  if (!Object.keys(mudanca).length) return NextResponse.json({ error: "nada pra mudar" }, { status: 400 });

  const { error } = await sb().from("tratorilson_solicitacoes").update(mudanca).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
