// Levantamento dos impostos usados nas últimas OS faturadas com NFS-e (só LEITURA na Omie).
// GET  → situação + resultado (em memória do processo)
// POST → dispara { limite? = 1000 } em segundo plano. Permissão pos:modelos_fiscais.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeGerenciarModelos } from "@/lib/pos/faturamento";
import { estadoLevantamento, iniciarLevantamento } from "@/lib/pos/levantamento-fiscal-server";
import { registrarAuditLog } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeGerenciarModelos(auth)) return NextResponse.json({ error: "Você não tem a permissão \"Modelos fiscais\"." }, { status: 403 });
  return NextResponse.json(estadoLevantamento());
}

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeGerenciarModelos(auth)) return NextResponse.json({ error: "Você não tem a permissão \"Modelos fiscais\"." }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const e = iniciarLevantamento(Number(body?.limite) || 1000, auth.email || "Sistema");
  await registrarAuditLog({ userName: auth.email || "Sistema", sistema: "pos", acao: "modelo_fiscal_levantamento", entidade: "modelo_fiscal", detalhes: { limite: Number(body?.limite) || 1000 } }).catch(() => {});
  return NextResponse.json(e);
}
