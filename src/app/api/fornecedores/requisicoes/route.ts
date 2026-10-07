import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { corsChatwoot } from "@/lib/chatwoot/cors";

// Requisições de um fornecedor, para a integração com o Chatwoot:
// lista com valor/status/anexos (nota, recibo, boleto) pra ver e baixar
// os PDFs por lá. As requisições vinculam o fornecedor pelo NOME.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
);


export async function OPTIONS(req: Request) {
  const CORS = corsChatwoot(req, "GET, OPTIONS");
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const CORS = corsChatwoot(req, "GET, OPTIONS");
  const nome = (req.nextUrl.searchParams.get("nome") || "").trim();
  if (!nome) {
    return NextResponse.json({ requisicoes: [] }, { headers: CORS });
  }

  try {
    const { data, error } = await supabase
      .from("Requisicao")
      .select(
        "id, titulo, valor_despeza, solicitante, created_at, numero_nota, status, foto_nf, foto_nf2, foto_nf3, foto_nf4, foto_nf5, recibo_fornecedor, boleto_fornecedor"
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
