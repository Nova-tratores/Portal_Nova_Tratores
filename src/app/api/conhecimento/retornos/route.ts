import { NextRequest, NextResponse } from "next/server";
import { feedbackAberto, resolverFeedback } from "@/lib/conhecimento/db";
import { editaAlgo, entrar, erroResposta, negado, podeEditarModulo } from "@/lib/conhecimento/rota";

export const dynamic = "force-dynamic";

// Retornos dos leitores ainda sem resposta ("não ajudou" e "está desatualizado"),
// só dos módulos que o usuário edita.
export async function GET(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  if (!editaAlgo(e.sessao)) return NextResponse.json({ ok: true, retornos: [] });
  try {
    const todos = await feedbackAberto();
    const retornos = todos.filter((r) => {
      const art = Array.isArray(r.kb_artigos) ? r.kb_artigos[0] : r.kb_artigos;
      return art && podeEditarModulo(e.sessao, art.modulo);
    }).map((r) => ({ ...r, artigo: Array.isArray(r.kb_artigos) ? r.kb_artigos[0] : r.kb_artigos, kb_artigos: undefined }));
    return NextResponse.json({ ok: true, retornos });
  } catch (err) {
    return erroResposta(err, "retornos");
  }
}

// PATCH { id } → marca o retorno como resolvido.
export async function PATCH(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  if (!editaAlgo(e.sessao)) return negado();
  const { id } = (await req.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });
  try {
    await resolverFeedback(id, e.sessao.autor.nome);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return erroResposta(err, "resolver retorno");
  }
}
