// POST /api/ppv/pedidos/faturar/simular — preview do faturamento (NÃO emite).
// Consulta o pedido no Omie e devolve itens/total/etapa/categoria atual pra
// confirmação na UI antes de faturar de verdade.
import { NextRequest, NextResponse } from "next/server";
import { simularFaturamentoPPV } from "@/lib/ppv/omie";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const id = body?.id;
    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID do PPV obrigatório" }, { status: 400 });
    }
    const prev = await simularFaturamentoPPV(id);
    if (!prev.ok) return NextResponse.json({ error: prev.erro }, { status: 400 });
    return NextResponse.json(prev);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API pedidos/faturar/simular]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
