import { NextRequest, NextResponse } from "next/server";
import { enviarPPVParaOmie } from "@/lib/ppv/omie";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const id = body?.id;

    if (!id || typeof id !== "string") {
      return NextResponse.json({ error: "ID do PPV obrigatório" }, { status: 400 });
    }

    const resultado = await enviarPPVParaOmie(id);

    if (!resultado.sucesso) {
      return NextResponse.json({ error: resultado.erro }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      numeroPedido: resultado.numeroPedido,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API pedidos/omie]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
