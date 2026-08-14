// GET /api/ppv/departamentos -> departamentos ativos do Omie (do banco) pra aba
// "Departamentos" do Pedido de Venda.
import { NextRequest, NextResponse } from "next/server";
import { obterDepartamentos } from "@/lib/ppv/departamentos";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const departamentos = await obterDepartamentos();
    return NextResponse.json({ departamentos });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API departamentos] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
