// Vigia de revisões — uso pela tela.
//   GET  → lista as OS marcadas com pendência Mahindra (sem recalcular).
//   POST → roda a varredura agora (quem pode enviar revisões).
import { NextRequest, NextResponse } from "next/server";
import { exigirAcessoModulo, exigirPermissao } from "@/lib/ajustes/permissao-server";
import { listarPendencias, varrerRevisoes } from "@/lib/pos/vigia-revisoes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: NextRequest) {
  try {
    await exigirAcessoModulo(req, "revisoes");
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : "não autenticado" }, { status: st });
  }
  try {
    const itens = await listarPendencias();
    return NextResponse.json({ itens });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    await exigirPermissao(req, "revisoes", "enviar");
  } catch (e) {
    const st = (e as { http?: number })?.http || 401;
    return NextResponse.json({ error: e instanceof Error ? e.message : "não autenticado" }, { status: st });
  }
  try {
    const body = await req.json().catch(() => ({}));
    const dias = Number(body?.dias) || undefined;
    const resultado = await varrerRevisoes({ dias });
    return NextResponse.json(resultado);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
