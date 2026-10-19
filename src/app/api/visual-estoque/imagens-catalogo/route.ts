import { NextRequest, NextResponse } from "next/server";
import { backfillImagensCatalogo } from "@/lib/visual-estoque/catalogo-crm";
import { protegerRota } from "@/lib/ajustes/permissao-server";

export const runtime = "nodejs";
export const maxDuration = 120;

// Preenche imagens VAZIAS de máquinas com as fotos do catálogo do CRM
// (catalogo_produtos + Equipamentos). Não sobrescreve imagens já definidas.
export async function POST(req: NextRequest) {
  // Botão da tela Pátio: pode('consulta-estoque', 'patio').
  const g = await protegerRota(req, [{ modulo: "consulta-estoque", acao: "patio" }]);
  if (g.resposta) return g.resposta;
  try {
    const body = await req.json().catch(() => ({}));
    const conta = body?.conta || undefined;
    const sobrescrever = body?.sobrescrever === true;
    const r = await backfillImagensCatalogo(conta, sobrescrever);
    if (!r.ok) return NextResponse.json({ erro: r.mensagem || "Falha" }, { status: 500 });
    return NextResponse.json(r);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ erro: msg }, { status: 500 });
  }
}
