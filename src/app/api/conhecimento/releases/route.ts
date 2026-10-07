import { NextRequest, NextResponse } from "next/server";
import { lerPayloadRelease } from "@/lib/conhecimento/releases";
import { registrarRelease, ultimasReleases } from "@/lib/conhecimento/releases-db";
import { editaAlgo, entrar, erroResposta, negado } from "@/lib/conhecimento/rota";
import { registrarAuditLog } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CRON_SECRET = process.env.CRON_SECRET || "";

function autorizado(req: NextRequest): boolean {
  const auth = req.headers.get("authorization") || "";
  const alt = req.headers.get("x-cron-secret") || "";
  return !!CRON_SECRET && (auth === `Bearer ${CRON_SECRET}` || alt === CRON_SECRET);
}

// POST /api/conhecimento/releases — chamado pelo workflow release-registrar.yml a
// cada push na main. Corpo: { sha, sha_anterior, commits:[{sha,titulo,autor,data,arquivos[]}] }.
// Idempotente por sha. Autenticação por CRON_SECRET, fail-closed.
export async function POST(req: NextRequest) {
  if (!autorizado(req)) return NextResponse.json({ ok: false, erro: "Unauthorized" }, { status: 401 });
  const payload = lerPayloadRelease(await req.json().catch(() => null));
  if (!payload) return NextResponse.json({ ok: false, erro: "payload inválido (sha obrigatório)" }, { status: 400 });
  try {
    const r = await registrarRelease(payload);
    if (!r.jaRegistrada) {
      await registrarAuditLog({ userName: "release-registrar", sistema: "conhecimento", acao: "release", entidade: "release", entidadeId: r.sha, entidadeLabel: r.sha.slice(0, 8), detalhes: { modulos: r.modulos, artigos: r.artigosAfetados, novidades: r.novidades, commits: payload.commits.length } });
    }
    return NextResponse.json({ ok: true, ...r });
  } catch (err) {
    return erroResposta(err, "registrar release");
  }
}

// GET — últimas versões registradas (para quem edita a base conferir que o registro está funcionando).
export async function GET(req: NextRequest) {
  const e = await entrar(req);
  if (e.resposta) return e.resposta;
  if (!editaAlgo(e.sessao)) return negado();
  try {
    return NextResponse.json({ ok: true, releases: await ultimasReleases() });
  } catch (err) {
    return erroResposta(err, "listar releases");
  }
}
