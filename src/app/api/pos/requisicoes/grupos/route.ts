import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// Grupos (coletivos) de requisições. Uma req pode estar em vários grupos.
// GET   → lista grupos + os req_ids de cada um
// POST  → cria grupo { nome, criado_por }
// PATCH → renomeia / muda status { id, nome?, status?, usuario } (grava no histórico)

type Hist = { acao: string; req_id?: number; usuario: string; em: string; detalhe?: string };

export async function GET() {
  try {
    const { data: grupos, error } = await supabase
      .from("requisicao_grupos")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const { data: membros } = await supabase
      .from("requisicao_grupo_membros")
      .select("grupo_id, req_id");

    const porGrupo: Record<string, number[]> = {};
    for (const m of membros || []) {
      const k = String(m.grupo_id);
      (porGrupo[k] ||= []).push(Number(m.req_id));
    }

    const result = (grupos || []).map((g: Record<string, unknown>) => ({
      ...g,
      membros: porGrupo[String(g.id)] || [],
    }));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { nome, criado_por } = await req.json();
    if (!nome?.trim()) return NextResponse.json({ error: "Informe o nome do grupo" }, { status: 400 });
    const em = new Date().toISOString();
    const historico: Hist[] = [{ acao: "criou", usuario: criado_por || "?", em }];
    const { data, error } = await supabase
      .from("requisicao_grupos")
      .insert([{ nome: nome.trim(), criado_por: criado_por || null, historico }])
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ...data, membros: [] });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, nome, status, usuario } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });

    const { data: g } = await supabase.from("requisicao_grupos").select("historico").eq("id", id).single();
    const historico: Hist[] = Array.isArray(g?.historico) ? (g!.historico as Hist[]) : [];
    const em = new Date().toISOString();
    const upd: Record<string, unknown> = { updated_at: em };

    if (typeof nome === "string" && nome.trim()) {
      upd.nome = nome.trim();
      historico.push({ acao: "renomeou", usuario: usuario || "?", em, detalhe: nome.trim() });
    }
    if (typeof status === "string" && status) {
      upd.status = status;
      historico.push({
        acao: status === "concluido" ? "concluiu" : status === "cancelado" ? "cancelou" : "reabriu",
        usuario: usuario || "?", em,
      });
    }
    upd.historico = historico;

    const { error } = await supabase.from("requisicao_grupos").update(upd).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
