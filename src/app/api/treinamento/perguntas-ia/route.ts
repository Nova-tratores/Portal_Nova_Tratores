import { NextRequest, NextResponse } from "next/server";
import { obter } from "@/lib/conhecimento/db";
import { sugerirPerguntas } from "@/lib/treinamento/perguntas-ia";
import { erroResposta, gereAlgo, guardarTreinamento, negado } from "@/lib/treinamento/rota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/treinamento/perguntas-ia { artigo_id, quantas? } → sugestões (não grava nada)
export async function POST(req: NextRequest) {
  const e = await guardarTreinamento(req);
  if (e.resposta) return e.resposta;
  if (!gereAlgo(e.sessao)) return negado("Você não gere trilhas de treinamento.");
  const body = (await req.json().catch(() => ({}))) as { artigo_id?: string; quantas?: number };
  try {
    const a = body.artigo_id ? await obter(body.artigo_id) : null;
    if (!a || a.status !== "publicado") return NextResponse.json({ ok: false, erro: "Artigo não encontrado ou não publicado." }, { status: 404 });
    const perguntas = await sugerirPerguntas({ id: a.id, titulo: a.titulo, corpo: a.corpo }, Number(body.quantas) || 3);
    return NextResponse.json({ ok: true, perguntas });
  } catch (err) {
    return erroResposta(err, "perguntas por IA");
  }
}
