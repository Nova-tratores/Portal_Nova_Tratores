// Faturamento da OS (emite NFS-e no Omie) — molde do PPV (/api/ppv/pedidos/faturar).
// GET  → situação do faturamento desta OS (botão/selos do drawer); ?reconciliar=1 confere no Omie antes.
// POST → fatura. body { forma, ppvIds[], totalConfirmado }. Ato fiscal: permissão
//        explícita pos:faturar, trava no banco, sem reenvio automático ao Omie.
import { NextRequest, NextResponse } from "next/server";
import { estadoFaturamento, faturamentoHabilitado, faturarOSNoOmie, reconciliarFaturamentoOS } from "@/lib/pos/faturamento";
import { gate, erroRota } from "./comum";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const conferidas = new Map<string, number>();

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req, false);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    // conferir no Omie ao abrir a OS: no máximo 1x a cada 2 min por OS (custo/limite do Omie)
    const ultima = conferidas.get(id) || 0;
    const forcar = req.nextUrl.searchParams.get("forcar") === "1";
    if (req.nextUrl.searchParams.get("reconciliar") === "1" && faturamentoHabilitado(auth) && (forcar || Date.now() - ultima > 120_000)) {
      conferidas.set(id, Date.now());
      try { await reconciliarFaturamentoOS(id); } catch (e) { console.warn(`[pos/faturar] reconciliar ${id}:`, e instanceof Error ? e.message : e); }
    }
    return NextResponse.json(await estadoFaturamento(id, auth));
  } catch (e) { return erroRota(e, "GET"); }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req, true);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const r = await faturarOSNoOmie(id, {
      forma: typeof body?.forma === "string" ? body.forma : null,
      ppvIds: Array.isArray(body?.ppvIds) ? body.ppvIds.map(String) : [],
      totalConfirmado: Number(body?.totalConfirmado) || 0,
      impostos: body?.impostos && typeof body.impostos === "object" ? {
        modeloId: typeof body.impostos.modeloId === "string" ? body.impostos.modeloId : null,
        campos: body.impostos.campos,
        salvarParaCliente: body.impostos.salvarParaCliente === true,
      } : null,
    }, auth);
    return NextResponse.json({ success: r.ok, tipo: r.tipo, mensagem: r.mensagem, nfseNumero: r.nfseNumero ?? null, pecas: r.pecas ?? [] }, { status: r.status });
  } catch (e) { return erroRota(e, "POST"); }
}
