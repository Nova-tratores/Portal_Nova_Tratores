import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Busca leve de clientes para o seletor da integração com o Chatwoot.
// Filtra por razão social, nome fantasia ou CNPJ/CPF (ilike) e devolve até 20.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    ""
);

// Libera o front do Chatwoot (outro domínio) a consultar este endpoint.
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
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2)
    return NextResponse.json({ clientes: [] }, { headers: CORS });

  // vírgula/parênteses/percent quebram a sintaxe do .or() do PostgREST
  const term = q.replace(/[,()%]/g, " ").trim();
  const like = `%${term}%`;

  const { data, error } = await supabase
    .from("portal_nt_clientes_cadastro_omie")
    .select(
      "cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, cidade, estado, telefone, email"
    )
    .or(
      `razao_social.ilike.${like},nome_fantasia.ilike.${like},cnpj_cpf.ilike.${like}`
    )
    .limit(20);

  if (error)
    return NextResponse.json(
      { error: error.message },
      { status: 500, headers: CORS }
    );

  return NextResponse.json({ clientes: data || [] }, { headers: CORS });
}
