// GET  /api/ppv/nf-sefaz?id=...&refresh=1  → comunicação com a SEFAZ (NF-e) do PPV.
// GET  /api/ppv/nf-sefaz?id=...&danfe=1     → URL temporária do DANFE (PDF).
// Cache-first (pedidos.nf_sefaz); refresh=1 força reconsulta no Omie.
import { NextRequest, NextResponse } from "next/server";
import { obterComunicacaoSefaz, obterUrlDanfePPV, obterPdfPedidoOmie, sincronizarFaturamentoPPV } from "@/lib/ppv/omie";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "ID do PPV obrigatório" }, { status: 400 });

  try {
    if (searchParams.get("danfe")) {
      const r = await obterUrlDanfePPV(id);
      if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: 400 });
      return NextResponse.json(r);
    }
    if (searchParams.get("pdfpedido")) {
      const r = await obterPdfPedidoOmie(id);
      if ("erro" in r) return NextResponse.json({ error: r.erro }, { status: 400 });
      return NextResponse.json(r);
    }
    if (searchParams.get("sync")) {
      // Detecta faturamento feito no Omie e marca "Faturado" no portal.
      return NextResponse.json(await sincronizarFaturamentoPPV(id));
    }
    const refresh = !!searchParams.get("refresh");
    const com = await obterComunicacaoSefaz(id, { refresh });
    return NextResponse.json(com);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error("[API ppv/nf-sefaz]", id, msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
