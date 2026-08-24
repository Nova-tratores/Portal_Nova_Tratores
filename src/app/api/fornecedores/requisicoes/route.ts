import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Requisições de um fornecedor, para a integração com o Chatwoot:
// lista com valor/status/anexos (nota, recibo, boleto) pra ver e baixar
// os PDFs por lá. As requisições vinculam o fornecedor pelo NOME.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
);

const CHATWOOT_ORIGIN =
  process.env.CHATWOOT_URL || "https://chatwoot-production-e3ef.up.railway.app";
const CORS = {
  "Access-Control-Allow-Origin": CHATWOOT_ORIGIN,
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const nome = (req.nextUrl.searchParams.get("nome") || "").trim();
  if (!nome) {
    return NextResponse.json({ requisicoes: [] }, { headers: CORS });
  }

  try {
    const { data, error } = await supabase
      .from("Requisicao")
      .select(
        "id, titulo, valor_despeza, solicitante, created_at, numero_nota, status, foto_nf, recibo_fornecedor, boleto_fornecedor"
      )
      .ilike("fornecedor", nome)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);

    return NextResponse.json({ requisicoes: data || [] }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
