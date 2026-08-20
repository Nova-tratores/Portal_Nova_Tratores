import { NextRequest, NextResponse } from "next/server";
import { renderOS, renderPV, e } from "@/lib/omie/os-print";
import { contaOmie } from "@/lib/omie/contas";

// PDF OFICIAL do Omie (osdocs/dfedocs) — em vez da versão refeita no portal:
//   os → /servicos/osdocs/  · ObterOS       { nIdOs }  → cPdfOs
//   pv → /produtos/dfedocs/ · ObterPedVenda { nIdPed } → cPdfPed
// Se o Omie falhar (ou ?refeita=1), cai na reconstrução antiga (renderOS/renderPV).
async function pdfOficialOmie(tipo: string, cod: number, empresa: string): Promise<string | null> {
  const acc = contaOmie(empresa);
  if (!acc.key || !acc.secret) return null;
  const ep = tipo === "os" ? "/servicos/osdocs/" : "/produtos/dfedocs/";
  const call = tipo === "os" ? "ObterOS" : "ObterPedVenda";
  const param = tipo === "os" ? { nIdOs: cod } : { nIdPed: cod };
  try {
    const res = await fetch(`https://app.omie.com.br/api/v1${ep}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
    });
    const data = await res.json().catch(() => ({}));
    if (data?.faultstring || data?.status === "error") return null;
    const url = String(data?.cPdfOs || data?.cPdfPed || "");
    return url || null;
  } catch { return null; }
}

// ====================== ROUTE ======================
export async function GET(req: NextRequest) {
  const tipo = req.nextUrl.searchParams.get("tipo");
  const cod = req.nextUrl.searchParams.get("cod");
  const empresa = req.nextUrl.searchParams.get("empresa") || "Nova Tratores";
  const forcarRefeita = req.nextUrl.searchParams.get("refeita") === "1";

  if (!tipo || !cod) {
    return NextResponse.json({ error: "?tipo=os&cod=COD_OS&empresa=X ou ?tipo=pv&cod=COD_PEDIDO&empresa=X" }, { status: 400 });
  }

  // 1º: o documento OFICIAL do Omie (mesmo layout que sai de dentro do Omie)
  if (!forcarRefeita && (tipo === "os" || tipo === "pv")) {
    const oficial = await pdfOficialOmie(tipo, Number(cod), empresa);
    if (oficial) return NextResponse.redirect(oficial, 302);
  }

  // 2º (fallback): a versão reconstruída no portal
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
