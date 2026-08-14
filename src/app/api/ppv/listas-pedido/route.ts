// GET /api/ppv/listas-pedido -> categorias, contas correntes e etapas (do banco)
// pra aba "Informações Adicionais" do Pedido de Venda.
import { NextRequest, NextResponse } from "next/server";
import { obterListasPedido } from "@/lib/ppv/listas-pedido";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const conta = req.nextUrl.searchParams.get("conta") || "NOVA";
    const listas = await obterListasPedido(conta);
    return NextResponse.json(listas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API listas-pedido] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
