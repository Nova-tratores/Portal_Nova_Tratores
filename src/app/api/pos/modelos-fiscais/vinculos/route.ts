// POST /api/pos/modelos-fiscais/vinculos — { documento, modeloId|null, clienteNome? }
// Vincula (ou tira, com modeloId null) o modelo fiscal de um cliente. pos:modelos_fiscais.
import { NextRequest, NextResponse } from "next/server";
import { autenticar } from "@/lib/auth/server";
import { podeGerenciarModelos } from "@/lib/pos/faturamento";
import { vincularCliente, ModelosFiscaisFaltando } from "@/lib/pos/modelos-fiscais-db";
import { registrarAuditLog } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!podeGerenciarModelos(auth)) return NextResponse.json({ error: "Você não tem a permissão \"Modelos fiscais\"." }, { status: 403 });
  try {
    const body = await req.json().catch(() => ({}));
    const msg = await vincularCliente(String(body?.documento || ""), body?.modeloId ? String(body.modeloId) : null, body?.clienteNome ? String(body.clienteNome) : null, auth.email || "Sistema");
    if (msg) return NextResponse.json({ error: msg }, { status: 400 });
    await registrarAuditLog({ userName: auth.email || "Sistema", sistema: "pos", acao: body?.modeloId ? "modelo_fiscal_vincular" : "modelo_fiscal_desvincular", entidade: "cliente", entidadeId: String(body?.documento || ""), entidadeLabel: body?.clienteNome || undefined, detalhes: { modeloId: body?.modeloId || null } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof ModelosFiscaisFaltando) return NextResponse.json({ error: e.message, migracaoFaltando: true }, { status: 503 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erro interno" }, { status: 500 });
  }
}
