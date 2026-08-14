// POST /api/ppv/pedidos/cancelar — cancela o Pedido de Venda no Omie
// (CancelarPedidoVenda) e marca a PPV como "Cancelada" com o motivo.
// EXIGE login + módulo PPV. O motivo é obrigatório.
import { NextRequest, NextResponse } from "next/server";
import { cancelarPedidoVendaOmie } from "@/lib/ppv/omie";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";
import { logAndNotify } from "@/lib/server/audit-notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  try {
    const body = await req.json();
    const id = body?.id;
    const motivo = String(body?.motivo || "").trim();
    const userName = body?.userName || auth.email || "Sistema";
    if (!id || typeof id !== "string") return NextResponse.json({ error: "ID do PPV obrigatório" }, { status: 400 });
    if (!motivo) return NextResponse.json({ error: "Informe o motivo do cancelamento." }, { status: 400 });

    const r = await cancelarPedidoVendaOmie(id, motivo, userName);
    if (!r.sucesso) return NextResponse.json({ error: r.erro }, { status: 400 });

    await logAndNotify({
      userName, sistema: "ppv", acao: "cancelar",
      entidade: "pedido", entidadeId: id, entidadeLabel: `PPV ${id}`,
      detalhes: { motivo, empresa: r.empresa },
      notifTitulo: `PPV ${id} cancelada`,
      notifDescricao: `${userName} cancelou a PPV ${id}${r.empresa ? ` no Omie (${r.empresa})` : ""}. Motivo: ${motivo}`,
      notifLink: `/ppv?id=${id}`,
    });

    return NextResponse.json({ success: true, empresa: r.empresa });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API pedidos/cancelar]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
