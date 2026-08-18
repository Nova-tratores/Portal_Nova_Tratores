import { NextRequest, NextResponse } from "next/server";
import { renderOS, renderPV, e } from "@/lib/omie/os-print";

// ====================== ROUTE ======================
export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get("tipo");
  const cod = req.nextUrl.searchParams.get("cod");
  const empresa = req.nextUrl.searchParams.get("empresa") || "Nova Tratores";

  if (!tipo || !cod) {
    return NextResponse.json({ error: "?tipo=os&cod=COD_OS&empresa=X ou ?tipo=pv&cod=COD_PEDIDO&empresa=X" }, { status: 400 });
  }

  try {
    let html: string;
    if (tipo === "os") html = await renderOS(Number(cod), empresa);
    else if (tipo === "pv") html = await renderPV(Number(cod), empresa);
    else return NextResponse.json({ error: "tipo: os ou pv" }, { status: 400 });
    return new NextResponse(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return new NextResponse(`<h1>Erro</h1><pre>${e(msg)}</pre>`, { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } });
  }
}
