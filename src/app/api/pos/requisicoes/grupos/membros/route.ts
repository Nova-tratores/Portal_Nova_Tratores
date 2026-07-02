import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/pos/supabase";

// Adiciona / remove uma requisição de um grupo, gravando no histórico do grupo
// (usuário + id da requisição + data/hora). body: { grupo_id, req_id, acao: 'add'|'remove', usuario }

type Hist = { acao: string; req_id?: number; usuario: string; em: string };

export async function POST(req: NextRequest) {
  try {
    const { grupo_id, req_id, acao, usuario } = await req.json();
    if (!grupo_id || !req_id) return NextResponse.json({ error: "grupo_id e req_id obrigatórios" }, { status: 400 });

    const em = new Date().toISOString();
    const remover = acao === "remove";

    if (remover) {
      const { error } = await supabase
        .from("requisicao_grupo_membros")
        .delete().eq("grupo_id", grupo_id).eq("req_id", req_id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    } else {
      const { error } = await supabase
        .from("requisicao_grupo_membros")
        .upsert([{ grupo_id, req_id, adicionado_por: usuario || null, adicionado_em: em }], { onConflict: "grupo_id,req_id", ignoreDuplicates: true });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Histórico do grupo
    const { data: g } = await supabase.from("requisicao_grupos").select("historico").eq("id", grupo_id).single();
    const historico: Hist[] = Array.isArray(g?.historico) ? (g!.historico as Hist[]) : [];
    historico.push({ acao: remover ? "removeu" : "adicionou", req_id: Number(req_id), usuario: usuario || "?", em });
    await supabase.from("requisicao_grupos").update({ historico, updated_at: em }).eq("id", grupo_id);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
