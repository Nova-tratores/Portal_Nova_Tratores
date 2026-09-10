import { NextRequest, NextResponse } from "next/server";
import { exigirPermissao } from "@/lib/ajustes/permissao-server";
import { montarContexto } from "@/lib/feedbacks/atendimento/contexto";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Contexto do cockpit de atendimento (/feedbacks/atendimento/[clienteKey]):
// identidade, motivos da fila, máquinas, serviços, pedidos, pasta,
// atendimentos anteriores e contatos do WhatsApp — cada seção falha isolada.
// Autor/permissão vêm da sessão (Bearer do Supabase), nunca do body/query.
export type { ContextoAtendimento } from "@/lib/feedbacks/atendimento/contexto";

export async function GET(req: NextRequest) {
  try {
    await exigirPermissao(req, "feedbacks", "atendimento");
  } catch (e) {
    const err = e as { message?: string; http?: number };
    return NextResponse.json({ erro: err.message || "não autorizado" }, { status: err.http ?? 401 });
  }
  const clienteKey = (req.nextUrl.searchParams.get("cliente_key") || "").trim();
  try {
    const ctx = await montarContexto(clienteKey);
    if ("erro" in ctx) return NextResponse.json(ctx, { status: 400 });
    return NextResponse.json(ctx);
  } catch (e) {
    console.error("[atendimento/contexto]", e);
    return NextResponse.json({ erro: (e as Error)?.message || "falha ao montar a ficha" }, { status: 500 });
  }
}
