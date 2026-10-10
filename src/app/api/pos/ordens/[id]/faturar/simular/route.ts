// POST /api/pos/ordens/[id]/faturar/simular — prévia (NÃO emite): OS no Omie,
// total, serviços, ValidarOS (em cache), forma de pagamento e pedidos de peças.
import { NextRequest, NextResponse } from "next/server";
import { simularFaturamentoOS } from "@/lib/pos/faturamento";
import { gate, erroRota } from "../comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req, true);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const r = await simularFaturamentoOS(id, auth);
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) { return erroRota(e, "simular"); }
}
