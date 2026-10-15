// POST → cancela a OS ainda NÃO faturada no Omie e no portal (motivo obrigatório).
// body { motivo, cancelarPedidos }. Permissão: a mesma de faturar (pos:faturar).
import { NextRequest, NextResponse } from "next/server";
import { gate, erroRota } from "../faturar/comum";
import { cancelarOSNaoFaturada } from "@/lib/pos/cancelar-os";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await gate(req, true);
  if (auth instanceof NextResponse) return auth;
  const { id } = await params;
  try {
    const body = await req.json().catch(() => ({}));
    const usuario = auth.email || "Portal";
    const r = await cancelarOSNaoFaturada(id, { motivo: String(body?.motivo || ""), cancelarPedidos: body?.cancelarPedidos !== false, usuario });
    if (r.ok) {
      await logAndNotify({
        userName: usuario, sistema: "pos", acao: "cancelar_os_omie", entidade: "ordem_servico", entidadeId: id, entidadeLabel: `OS ${id}`,
        detalhes: { motivo: body?.motivo, pedidos: r.pedidosCancelados, avisos: r.avisos },
        notifTitulo: `OS ${id} cancelada`, notifDescricao: `${usuario} cancelou a OS ${id}. Motivo: ${body?.motivo || ""}`, notifLink: `/pos?id=${id}`,
      }).catch(() => {});
    }
    return NextResponse.json(r, { status: r.ok ? 200 : 400 });
  } catch (e) { return erroRota(e, "cancelar-omie"); }
}
