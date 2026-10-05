import { NextRequest, NextResponse } from "next/server";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { podeLer, validarConteudo } from "@/lib/conhecimento/artigos";
import {
  atualizarMeta, descartarRascunho, mudarStatus, notificar, obter, publicar, registrarFeedback, registrarLeitura, salvarRascunho, versoes,
  type TipoFeedbackKb,
} from "@/lib/conhecimento/db";
import { entrar, erroResposta, negado, podeEditarModulo, podePublicarModulo } from "@/lib/conhecimento/rota";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/conhecimento/<id ou slug>
export async function GET(req: NextRequest, ctx: Ctx) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  try {
    const artigo = await obter(decodeURIComponent((await ctx.params).id));
    if (!artigo) return NextResponse.json({ ok: false, erro: "Artigo não encontrado" }, { status: 404 });
    const edita = podeEditarModulo(s, artigo.modulo);
    if (!edita && !podeLer(artigo, s.quem)) return NextResponse.json({ ok: false, erro: "Artigo não encontrado" }, { status: 404 });
    // leitor nunca recebe a edição pendente
    const paraLeitor = edita ? artigo : { ...artigo, rascunho: null, rascunho_por: null, rascunho_em: null };
    return NextResponse.json({
      ok: true,
      artigo: paraLeitor,
      podeEditar: edita,
      podePublicar: podePublicarModulo(s, artigo.modulo),
      responsavel: s.respNomes[artigo.modulo] || null,
      versoes: edita ? await versoes(artigo.id) : [],
    });
  } catch (err) {
    return erroResposta(err, "obter");
  }
}

// PATCH /api/conhecimento/<id> { acao: salvar | publicar | descartar | arquivar | reabrir | meta, ... }
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(body.acao || "");
  try {
    const artigo = await obter(decodeURIComponent((await ctx.params).id));
    if (!artigo) return NextResponse.json({ ok: false, erro: "Artigo não encontrado" }, { status: 404 });
    if (!podeEditarModulo(s, artigo.modulo)) return negado("Você não edita artigos deste módulo.");
    const podePub = podePublicarModulo(s, artigo.modulo);
    const audit = (a: string, detalhes: Record<string, unknown> = {}) =>
      registrarAuditLog({ userId: s.autor.id, userName: s.autor.nome, sistema: "conhecimento", acao: a, entidade: "artigo", entidadeId: artigo.id, entidadeLabel: artigo.titulo, detalhes: { modulo: artigo.modulo, ...detalhes } });

    if (acao === "salvar" || acao === "publicar") {
      let atual = artigo;
      if (body.titulo !== undefined || body.corpo !== undefined) {
        const { conteudo, erros } = validarConteudo(body);
        if (erros.length) return NextResponse.json({ ok: false, erro: erros.join(" ") }, { status: 400 });
        atual = await salvarRascunho(artigo, conteudo, s.autor);
      }
      if (acao === "salvar") {
        await audit("salvar_rascunho");
        if (!podePub) await notificar(s.resp[artigo.modulo], { titulo: "Artigo editado para aprovar", descricao: `${s.autor.nome} editou "${atual.titulo}"`, link: `/conhecimento/editar/${artigo.id}` });
        return NextResponse.json({ ok: true, artigo: atual });
      }
      if (!podePub) return negado("Só o responsável do módulo publica. Seu rascunho foi salvo e ele foi avisado.");
      const publicado = await publicar(atual, {
        resumo_mudanca: typeof body.resumo_mudanca === "string" ? body.resumo_mudanca.trim().slice(0, 400) : null,
        relevante: body.relevante === true,
      }, s.autor);
      await audit("publicar", { versao: publicado.versao, relevante: body.relevante === true });
      return NextResponse.json({ ok: true, artigo: publicado });
    }

    if (acao === "descartar") {
      const r = await descartarRascunho(artigo);
      await audit("descartar_rascunho");
      return NextResponse.json({ ok: true, artigo: r });
    }
    if (acao === "arquivar" || acao === "reabrir") {
      if (!podePub) return negado("Só o responsável do módulo arquiva ou reabre.");
      const r = await mudarStatus(artigo, acao === "arquivar" ? "arquivado" : "reabrir");
      await audit(acao);
      return NextResponse.json({ ok: true, artigo: r });
    }
    if (acao === "meta") {
      if (!podePub) return negado();
      const modulo = typeof body.modulo === "string" && body.modulo.trim() ? body.modulo.trim() : undefined;
      if (modulo && !podePublicarModulo(s, modulo)) return negado("Você não publica no módulo de destino.");
      const lista = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean).slice(0, 30) : undefined);
      await atualizarMeta(artigo.id, { modulo, fontes: lista(body.fontes), publico: lista(body.publico) });
      await audit("meta", { modulo });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ ok: false, erro: "acao inválida" }, { status: 400 });
  } catch (err) {
    return erroResposta(err, `acao ${acao}`);
  }
}

// POST /api/conhecimento/<id> { tipo: leitura | ajudou | nao_ajudou | desatualizado, comentario?, tela? }
export async function POST(req: NextRequest, ctx: Ctx) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const body = (await req.json().catch(() => ({}))) as { tipo?: string; comentario?: string; tela?: string };
  try {
    const artigo = await obter(decodeURIComponent((await ctx.params).id));
    if (!artigo || !(podeLer(artigo, s.quem) || podeEditarModulo(s, artigo.modulo))) return NextResponse.json({ ok: false, erro: "Artigo não encontrado" }, { status: 404 });
    if (body.tipo === "leitura") {
      await registrarLeitura(artigo, s.quem.userId, body.tela);
      return NextResponse.json({ ok: true });
    }
    if (body.tipo !== "ajudou" && body.tipo !== "nao_ajudou" && body.tipo !== "desatualizado") return NextResponse.json({ ok: false, erro: "tipo inválido" }, { status: 400 });
    await registrarFeedback(artigo, s.autor, { tipo: body.tipo as TipoFeedbackKb, comentario: body.comentario, tela: body.tela });
    if (body.tipo !== "ajudou") {
      await notificar(s.resp[artigo.modulo], {
        titulo: body.tipo === "desatualizado" ? "Artigo marcado como desatualizado" : "Artigo não ajudou",
        descricao: `${s.autor.nome} em "${artigo.titulo}"${body.comentario ? `: ${String(body.comentario).slice(0, 120)}` : ""}`,
        link: `/conhecimento/editar/${artigo.id}`,
      });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return erroResposta(err, "retorno do leitor");
  }
}
