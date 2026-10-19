import { NextRequest, NextResponse } from "next/server";
import { corsChatwoot } from "@/lib/chatwoot/cors";
import { guardarNovazap, comCors } from "@/lib/chatwoot/proxy";
import { infoPastaCliente } from "@/lib/clientes/info-pasta";

// "Informações Pasta Cliente" (etiquetas, observação e lembretes do POS) de um
// cliente — pela pasta do portal e pela ficha do contato no NovaZap. Mesmo
// esquema de /api/clientes/detalhe e /maquinas (CORS só pro NovaZap).
export const dynamic = "force-dynamic";

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsChatwoot(req, "GET, OPTIONS") });
}

export async function GET(req: NextRequest) {
  const CORS = corsChatwoot(req, "GET, OPTIONS");
  // NovaZap via servidor (x-novazap-token) ou login do portal — NovaZap; no portal, a Pasta Clientes.
  const acesso = await guardarNovazap(req, [{ modulo: "clientes" }]);
  if (acesso.resposta) return comCors(acesso.resposta, CORS);
  const sp = req.nextUrl.searchParams;
  const cnpj = sp.get("cnpj");
  const cod = sp.get("cod");
  if (!cnpj && !cod) return NextResponse.json({ error: "informe cnpj ou cod" }, { status: 400, headers: CORS });
  try {
    const info = await infoPastaCliente({ cnpj, cod, empresa: sp.get("empresa") });
    return NextResponse.json(info, { headers: { ...CORS, "Cache-Control": "no-store" } });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500, headers: CORS });
  }
}
