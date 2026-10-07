import { NextRequest, NextResponse } from "next/server";
import { registrarAuditLog } from "@/lib/server/audit-notify";
import { temModulo } from "@/lib/conhecimento/artigos";
import { atualizarNovidade, criarNovidade, idsLidos, marcarLidas, novidadesPublicadas, novidadesRascunho, obterNovidade } from "@/lib/conhecimento/releases-db";
import { editaAlgo, entrar, erroResposta, negado, podePublicarModulo } from "@/lib/conhecimento/rota";

export const dynamic = "force-dynamic";

/** Novidade mais velha que isto não vira aviso para quem ainda não leu (usuário novo não recebe enxurrada). */
const JANELA_AVISO_MS = 30 * 24 * 60 * 60 * 1000;

// GET /api/conhecimento/novidades
//   ?pendentes=1 → só as publicadas nos últimos 30 dias, dos módulos do usuário, que ele ainda não leu (aviso)
//   sem parâmetro → histórico dos módulos do usuário (+ rascunhos dos módulos em que ele publica)
export async function GET(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  try {
    const minhas = (await novidadesPublicadas()).filter((n) => temModulo(s.quem, n.modulo));
    const lidas = await idsLidos(s.quem.userId, minhas.map((n) => n.id));
    if (req.nextUrl.searchParams.get("pendentes") === "1") {
      const corte = Date.now() - JANELA_AVISO_MS;
      const pendentes = minhas.filter((n) => !lidas.has(n.id) && n.publicado_em && new Date(n.publicado_em).getTime() >= corte);
      return NextResponse.json({ ok: true, pendentes });
    }
    const rascunhos = editaAlgo(s) ? (await novidadesRascunho()).filter((n) => podePublicarModulo(s, n.modulo)) : [];
    return NextResponse.json({
      ok: true,
      historico: minhas.map((n) => ({ ...n, lida: lidas.has(n.id) })),
      rascunhos,
      podePublicarEm: Object.keys(s.resp).filter((m) => podePublicarModulo(s, m)),
      admin: s.quem.isAdmin,
    });
  } catch (err) {
    return erroResposta(err, "novidades");
  }
}

// POST { ids: [] } → marca como lidas.  POST { criar: { modulo, titulo, texto } } → rascunho manual.
export async function POST(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const body = (await req.json().catch(() => ({}))) as { ids?: unknown; criar?: { modulo?: string; titulo?: string; texto?: string } };
  try {
    if (body.criar) {
      const modulo = String(body.criar.modulo || "").trim(), titulo = String(body.criar.titulo || "").trim().slice(0, 120), texto = String(body.criar.texto || "").trim().slice(0, 6000);
      if (!modulo || titulo.length < 3 || !texto) return NextResponse.json({ ok: false, erro: "Informe módulo, título e texto." }, { status: 400 });
      if (!podePublicarModulo(s, modulo)) return negado("Você não publica novidades deste módulo.");
      return NextResponse.json({ ok: true, novidade: await criarNovidade({ modulo, titulo, texto }) });
    }
    const ids = (Array.isArray(body.ids) ? body.ids : []).filter((x): x is string => typeof x === "string").slice(0, 200);
    await marcarLidas(s.quem.userId, ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return erroResposta(err, "novidades (POST)");
  }
}

// PATCH { id, acao: salvar | publicar | descartar, titulo?, texto? }
export async function PATCH(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  const s = e.sessao;
  const body = (await req.json().catch(() => ({}))) as { id?: string; acao?: string; titulo?: string; texto?: string };
  if (!body.id) return NextResponse.json({ ok: false, erro: "id obrigatório" }, { status: 400 });
  try {
    const n = await obterNovidade(body.id);
    if (!n) return NextResponse.json({ ok: false, erro: "Novidade não encontrada" }, { status: 404 });
    if (!podePublicarModulo(s, n.modulo)) return negado("Só o responsável do módulo aprova a novidade.");
    const patch: { titulo?: string; texto?: string; status?: "publicado" | "descartado" } = {};
    if (typeof body.titulo === "string") patch.titulo = body.titulo.trim().slice(0, 120);
    if (typeof body.texto === "string") patch.texto = body.texto.trim().slice(0, 6000);
    if (patch.titulo !== undefined && patch.titulo.length < 3) return NextResponse.json({ ok: false, erro: "Título muito curto." }, { status: 400 });
    if (body.acao === "publicar") {
      if (!(patch.texto ?? n.texto).trim()) return NextResponse.json({ ok: false, erro: "A novidade está sem texto." }, { status: 400 });
      patch.status = "publicado";
    } else if (body.acao === "descartar") patch.status = "descartado";
    else if (body.acao !== "salvar") return NextResponse.json({ ok: false, erro: "acao inválida" }, { status: 400 });
    const novidade = await atualizarNovidade(n.id, patch, s.autor);
    await registrarAuditLog({ userId: s.autor.id, userName: s.autor.nome, sistema: "conhecimento", acao: `novidade_${body.acao}`, entidade: "novidade", entidadeId: n.id, entidadeLabel: novidade.titulo, detalhes: { modulo: n.modulo } });
    return NextResponse.json({ ok: true, novidade });
  } catch (err) {
    return erroResposta(err, "novidades (PATCH)");
  }
}
