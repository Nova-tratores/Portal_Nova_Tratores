import { NextRequest, NextResponse } from "next/server";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { aguardaAprovacao, artigosDaTela, normalizarTela, podeLer, validarConteudo } from "@/lib/conhecimento/artigos";
import { criar, listar, notificar, publicadosDaTela } from "@/lib/conhecimento/db";
import { editaAlgo, entrar, erroResposta, negado, podeEditarModulo, podePublicarModulo } from "@/lib/conhecimento/rota";

export const dynamic = "force-dynamic";

// GET /api/conhecimento
//   ?tela=/pos            → artigos publicados daquela tela, com corpo (botão "?")
//   ?q=&modulo=           → lista para a busca (leitor: só publicados que pode ler)
//   ?fila=1               → o que espera aprovação nos módulos que o usuário edita
export async function GET(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const sp = req.nextUrl.searchParams;
  try {
    const tela = normalizarTela(sp.get("tela"));
    if (tela) {
      const artigos = artigosDaTela((await publicadosDaTela(tela)).filter((a) => podeLer(a, s.quem)), tela);
      return NextResponse.json({ ok: true, tela, artigos, podeEditar: artigos.some((a) => podeEditarModulo(s, a.modulo)) || editaAlgo(s) });
    }

    const fila = sp.get("fila") === "1";
    const todos = await listar({ modulo: sp.get("modulo") || undefined, q: sp.get("q") || undefined });
    const artigos = todos.filter((a) => {
      const edita = podeEditarModulo(s, a.modulo);
      if (fila) return edita && a.status !== "arquivado" && (aguardaAprovacao(a) || !!a.revisao_pendente_desde);
      if (edita) return sp.get("arquivados") === "1" ? true : a.status !== "arquivado";
      return podeLer(a, s.quem);
    }).map((a) => ({ ...a, pode_editar: podeEditarModulo(s, a.modulo), pode_publicar: podePublicarModulo(s, a.modulo) }));

    return NextResponse.json({ ok: true, artigos, podeCriar: editaAlgo(s), responsaveis: s.respNomes, souResponsavelDe: Object.keys(s.resp).filter((m) => s.resp[m] === s.quem.userId) });
  } catch (err) {
    return erroResposta(err, "listar");
  }
}

// POST /api/conhecimento — cria um artigo como RASCUNHO.
export async function POST(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const modulo = typeof body.modulo === "string" ? body.modulo.trim() : "";
  if (!modulo) return NextResponse.json({ ok: false, erro: "Informe o módulo do artigo." }, { status: 400 });
  if (!podeEditarModulo(s, modulo)) return negado("Você não edita artigos deste módulo.");

  const { conteudo, erros } = validarConteudo(body);
  if (erros.length) return NextResponse.json({ ok: false, erro: erros.join(" ") }, { status: 400 });
  try {
    const artigo = await criar(conteudo, {
      modulo,
      fontes: Array.isArray(body.fontes) ? (body.fontes as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 30) : [],
      publico: Array.isArray(body.publico) ? (body.publico as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 10) : [],
      origem: body.origem === "ia" ? "ia" : "manual",
    }, s.autor);
    await registrarAuditLog({ userId: s.autor.id, userName: s.autor.nome, sistema: "conhecimento", acao: "criar", entidade: "artigo", entidadeId: artigo.id, entidadeLabel: artigo.titulo, detalhes: { modulo, origem: artigo.origem } });
    if (!podePublicarModulo(s, modulo)) {
      await notificar(s.resp[modulo], { titulo: "Artigo novo para aprovar", descricao: `${s.autor.nome} escreveu "${artigo.titulo}"`, link: `/conhecimento/editar/${artigo.id}` });
    }
    return NextResponse.json({ ok: true, artigo });
  } catch (err) {
    return erroResposta(err, "criar");
  }
}
