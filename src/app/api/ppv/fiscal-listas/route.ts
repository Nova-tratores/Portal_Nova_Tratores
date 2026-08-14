// GET /api/ppv/fiscal-listas -> listas de códigos fiscais pros dropdowns do
// Item de Orçamento (CFOP + CST ICMS/Origem/Modalidade/CST IPI/Enquadramento/
// CST PIS/CST COFINS). Tudo do banco.
import { NextRequest, NextResponse } from "next/server";
import { obterListasFiscais } from "@/lib/ppv/fiscal-listas";
import { autenticar } from "@/lib/auth/server";
import { temModuloPPV } from "@/lib/ppv/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticar(req);
  if (!auth) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!temModuloPPV(auth)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  try {
    const listas = await obterListasFiscais();
    return NextResponse.json(listas);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro interno";
    console.error(`[API fiscal-listas] ${msg}`);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
