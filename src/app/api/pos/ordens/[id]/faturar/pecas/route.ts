// POST /api/pos/ordens/[id]/faturar/pecas — fatura de novo SÓ os pedidos de peças
// que falharam quando a OS foi faturada. body { ppvIds[] }. Exige ppv:faturar.
import { NextRequest, NextResponse } from "next/server";
import { faturarPecasPendentes } from "@/lib/pos/faturamento";
import { gate, erroRota } from "../comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req, true);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const ids = Array.isArray(body?.ppvIds) ? body.ppvIds.map(String) : [];
    if (!ids.length) return NextResponse.json({ error: "Informe os pedidos." }, { status: 400 });
    const r = await faturarPecasPendentes(id, ids, auth);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) { return erroRota(e, "pecas"); }
}
