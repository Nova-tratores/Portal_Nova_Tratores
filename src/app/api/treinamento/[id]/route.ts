import { NextRequest, NextResponse } from "next/server";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { validarPergunta, validarTrilha } from "@/lib/treinamento/regras";
import {
  atribuicoesDoUsuario, atribuir, atribuirPeloPublico, atualizarTrilha, concluirEtapa, concluirSemProva, gravarPerguntas, mudarStatusTrilha, obterTrilha, reabrirAtribuicao, responderProva, situacaoDaPessoa, usuariosParaAtribuir, vigente,
} from "@/lib/treinamento/server";
import { erroResposta, gereModulo, guardarTreinamento, negado } from "@/lib/treinamento/rota";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ id: string }> };

// GET /api/treinamento/<id> → trilha + etapas + artigos + minha situação (+ gabarito e pessoas se eu giro)
export async function GET(req: NextRequest, ctx: Ctx) {
  const e = await guardarTreinamento(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  try {
    const d = await obterTrilha((await ctx.params).id);
    if (!d) return NextResponse.json({ ok: false, erro: "Trilha não encontrada" }, { status: 404 });
    const gere = gereModulo(s, d.trilha.modulo);
    const a = vigente(await atribuicoesDoUsuario(s.userId), d.trilha.id);
    if (!gere && !a) return NextResponse.json({ ok: false, erro: "Esta trilha não foi atribuída a você." }, { status: 404 });
    const minha = a ? await situacaoDaPessoa(d, a) : null;
    return NextResponse.json({
      ok: true, trilha: d.trilha, etapas: d.etapas, artigos: d.artigos, minha, podeGerir: gere,
      perguntas: gere ? d.perguntas : undefined,
      pessoas: gere && req.nextUrl.searchParams.get("pessoas") === "1" ? await usuariosParaAtribuir() : undefined,
    });
  } catch (err) {
    return erroResposta(err, "obter trilha");
  }
}

// PATCH /api/treinamento/<id> { acao: salvar | perguntas | ativar | arquivar | rascunho, ... } — quem gere
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const e = await guardarTreinamento(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(body.acao || "");
  try {
    const d = await obterTrilha((await ctx.params).id);
    if (!d) return NextResponse.json({ ok: false, erro: "Trilha não encontrada" }, { status: 404 });
    if (!gereModulo(s, d.trilha.modulo)) return negado("Você não gere trilhas deste módulo.");
    const audit = (a: string, det: Record<string, unknown> = {}) => registrarAuditLog({ userId: s.userId, userName: s.autor.nome, sistema: "treinamento", acao: a, entidade: "trilha", entidadeId: d.trilha.id, entidadeLabel: d.trilha.titulo, detalhes: det });

    if (acao === "salvar") {
      const { trilha, erros } = validarTrilha({ ...body, modulo: body.modulo ?? d.trilha.modulo });
      if (erros.length) return NextResponse.json({ ok: false, erro: erros.join(" ") }, { status: 400 });
      if (!gereModulo(s, trilha.modulo)) return negado("Você não gere trilhas do módulo de destino.");
      const t = await atualizarTrilha(d.trilha.id, trilha);
      if (t.status === "ativa") await atribuirPeloPublico(t); // público novo → pessoas novas recebem
      await audit("salvar");
      return NextResponse.json({ ok: true, trilha: t });
    }
    if (acao === "perguntas") {
      const lista = Array.isArray(body.perguntas) ? body.perguntas : [];
      const validas = [];
      for (const p of lista) {
        const { pergunta, erros } = validarPergunta(p);
        if (erros.length) return NextResponse.json({ ok: false, erro: `Pergunta ${validas.length + 1}: ${erros.join(" ")}` }, { status: 400 });
        validas.push({ ...pergunta, id: typeof (p as { id?: unknown }).id === "string" ? (p as { id: string }).id : undefined });
      }
      await gravarPerguntas(d.trilha.id, validas);
      await audit("perguntas", { quantas: validas.length });
      return NextResponse.json({ ok: true });
    }
    if (acao === "ativar") {
      if (d.etapas.length === 0) return NextResponse.json({ ok: false, erro: "A trilha precisa de pelo menos um artigo." }, { status: 400 });
      if (d.etapas.some((et) => d.artigos[et.artigo_id]?.status !== "publicado")) return NextResponse.json({ ok: false, erro: "Há artigo da trilha que não está publicado." }, { status: 400 });
      const t = await mudarStatusTrilha(d.trilha.id, "ativa");
      const n = await atribuirPeloPublico(t);
      await audit("ativar", { atribuidas: n });
      return NextResponse.json({ ok: true, trilha: t, atribuidas: n });
    }
    if (acao === "arquivar" || acao === "rascunho") {
      const t = await mudarStatusTrilha(d.trilha.id, acao === "arquivar" ? "arquivada" : "rascunho");
      await audit(acao);
      return NextResponse.json({ ok: true, trilha: t });
    }
    return NextResponse.json({ ok: false, erro: "acao inválida" }, { status: 400 });
  } catch (err) {
    return erroResposta(err, `trilha ${acao}`);
  }
}

// POST /api/treinamento/<id> { acao: li | prova | atribuir | reabrir, ... }
export async function POST(req: NextRequest, ctx: Ctx) {
  const e = await guardarTreinamento(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const acao = String(body.acao || "");
  try {
    const d = await obterTrilha((await ctx.params).id);
    if (!d) return NextResponse.json({ ok: false, erro: "Trilha não encontrada" }, { status: 404 });
    const gere = gereModulo(s, d.trilha.modulo);

    if (acao === "atribuir") {
      if (!gere) return negado("Você não gere trilhas deste módulo.");
      if (d.trilha.status !== "ativa") return NextResponse.json({ ok: false, erro: "Ative a trilha antes de atribuir." }, { status: 400 });
      const ids = (Array.isArray(body.user_ids) ? body.user_ids : []).filter((x): x is string => typeof x === "string");
      const pessoas = (await usuariosParaAtribuir()).filter((u) => ids.includes(u.id));
      const n = await atribuir(d.trilha, pessoas, "manual", s.autor.nome);
      await registrarAuditLog({ userId: s.userId, userName: s.autor.nome, sistema: "treinamento", acao: "atribuir", entidade: "trilha", entidadeId: d.trilha.id, entidadeLabel: d.trilha.titulo, detalhes: { pessoas: pessoas.map((p) => p.nome), novas: n } });
      return NextResponse.json({ ok: true, atribuidas: n });
    }
    if (acao === "reabrir") {
      if (!gere) return negado();
      const id = String(body.atribuicao_id || "");
      if (!id) return NextResponse.json({ ok: false, erro: "atribuicao_id obrigatório" }, { status: 400 });
      await reabrirAtribuicao(id);
      return NextResponse.json({ ok: true });
    }

    // ações da própria pessoa
    const a = vigente(await atribuicoesDoUsuario(s.userId), d.trilha.id);
    if (!a) return NextResponse.json({ ok: false, erro: "Esta trilha não foi atribuída a você." }, { status: 404 });
    if (acao === "li") {
      const sit = await situacaoDaPessoa(d, a);
      const etapa = sit.etapas.find((x) => x.id === body.etapa_id);
      if (!etapa) return NextResponse.json({ ok: false, erro: "Etapa inválida" }, { status: 400 });
      await concluirEtapa(a, etapa, d.artigos[etapa.artigo_id]?.versao ?? 0);
      const depois = await situacaoDaPessoa(d, { ...a, situacao: a.situacao === "pendente" ? "em_andamento" : a.situacao });
      if (!depois.prova.perguntas.length && depois.progresso.lidas === depois.progresso.total) await concluirSemProva(a);
      return NextResponse.json({ ok: true, minha: await situacaoDaPessoa(d, { ...a, situacao: "em_andamento" }) });
    }
    if (acao === "prova") {
      const sit = await situacaoDaPessoa(d, a);
      if (!sit.prova.podeFazer) return NextResponse.json({ ok: false, erro: "Leia todos os artigos antes da prova." }, { status: 400 });
      if (sit.prova.aprovado) return NextResponse.json({ ok: false, erro: "Você já passou nesta prova." }, { status: 400 });
      const r = await responderProva(d, a, (body.respostas && typeof body.respostas === "object" ? body.respostas : {}) as Record<string, unknown>);
      await registrarAuditLog({ userId: s.userId, userName: s.autor.nome, sistema: "treinamento", acao: r.aprovado ? "prova_aprovada" : "prova_reprovada", entidade: "trilha", entidadeId: d.trilha.id, entidadeLabel: d.trilha.titulo, detalhes: { nota: r.nota, acertos: r.acertos, total: r.total, tentativa: a.tentativas + 1 } });
      return NextResponse.json({ ok: true, resultado: r });
    }
    return NextResponse.json({ ok: false, erro: "acao inválida" }, { status: 400 });
  } catch (err) {
    return erroResposta(err, `acao ${acao}`);
  }
}
