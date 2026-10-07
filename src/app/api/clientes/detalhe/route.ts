import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { corsChatwoot } from "@/lib/chatwoot/cors";

// Detalhe de um cliente por código Omie, para o popover do Chatwoot
// (nome fantasia, endereço, telefone, e-mail). Cobre contatos vinculados
// antes de o seletor passar a gravar esses campos no contato.
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
  const cod = (req.nextUrl.searchParams.get("cod") || "").trim();
  const empresa = (req.nextUrl.searchParams.get("empresa") || "").trim();
  if (!cod) {
    return NextResponse.json({ cliente: null }, { headers: CORS });
  }

  try {
    let query = supabase
      .from("portal_nt_clientes_cadastro_omie")
      .select(
        "cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, endereco, bairro, cep, cidade, estado, telefone, email"
      )
      .eq("cod_cli", cod)
      .limit(1);
    // O mesmo cod_cli pode existir em mais de uma conta Omie — a empresa
    // (guardada no cliente_ref do contato) desempata.
    if (empresa) query = query.eq("empresa", empresa);

    const { data, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);

    return NextResponse.json({ cliente: data || null }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
