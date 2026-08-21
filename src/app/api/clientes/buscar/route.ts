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

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ clientes: [] });

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
    return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ clientes: data || [] });
}
