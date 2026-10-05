import { NextRequest, NextResponse } from "next/server";
import { mdParaBlocos } from "@/lib/conhecimento/blocos";
import { rascunharComIA } from "@/lib/conhecimento/rascunho-ia";
import { editaAlgo, entrar, erroResposta, negado } from "@/lib/conhecimento/rota";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/conhecimento/rascunho
//   { modo: "ia", material, titulo?, tela?, instrucao? } → a IA redige o artigo a partir do material
//   { modo: "converter", material }                      → só converte markdown/texto em blocos (sem IA)
// Não grava nada: devolve o conteúdo para o editor, que salva como rascunho.
export async function POST(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  if (!editaAlgo(e.sessao)) return negado("Você não edita artigos da base de conhecimento.");
  const body = (await req.json().catch(() => ({}))) as { modo?: string; material?: string; titulo?: string; tela?: string; instrucao?: string };
  try {
    if (body.modo === "converter") {
      return NextResponse.json({ ok: true, corpo: mdParaBlocos(String(body.material || "").slice(0, 60000)) });
    }
    const { conteudo, erros } = await rascunharComIA({ material: String(body.material || ""), titulo: body.titulo, tela: body.tela, instrucao: body.instrucao });
    if (erros.length) return NextResponse.json({ ok: false, erro: `A IA devolveu um rascunho incompleto. ${erros.join(" ")}` }, { status: 502 });
    return NextResponse.json({ ok: true, titulo: conteudo.titulo, resumo: conteudo.resumo, corpo: conteudo.corpo });
  } catch (err) {
    return erroResposta(err, "rascunho por IA");
  }
}
