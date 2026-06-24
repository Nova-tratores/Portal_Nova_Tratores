import { NextRequest, NextResponse } from "next/server";
import { buscarImagensBing } from "@/lib/visual-estoque/bing";

export const runtime = "nodejs";

// Busca até 5 imagens no Bing para um termo. Porta /api/buscar-imagem.
export async function GET(req: NextRequest) {
  const termo = req.nextUrl.searchParams.get("termo");
  if (!termo) return NextResponse.json({ ok: false, imagens: [] });
  try {
    const imagens = await buscarImagensBing(termo, 5);
    return NextResponse.json({ ok: imagens.length > 0, imagens });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, imagens: [], erro: msg });
  }
}
