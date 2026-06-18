import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

// Busca de clientes (tabela principal) com endereço, para o SAT Digital
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json([]);

  const { data, error } = await supabase
    .from("portal_nt_clientes_PRINCIPAL")
    .select("id, cnpj_cpf, nome_fantasia, razao_social, endereco, numero, bairro, cidade, estado")
    .or(`nome_fantasia.ilike.%${q}%,razao_social.ilike.%${q}%,cnpj_cpf.ilike.%${q}%`)
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const resultado = (data || []).map((c: any) => {
    const partes = [c.endereco, c.numero].filter(Boolean).join(", ");
    const cidadeUf = [c.bairro, c.cidade].filter(Boolean).join(" - ");
    const enderecoCompleto = [partes, cidadeUf].filter(Boolean).join(", ") + (c.estado ? `/${c.estado}` : "");
    return {
      id: c.id,
      cnpj: c.cnpj_cpf || "",
      nome: c.nome_fantasia || c.razao_social || "",
      endereco: enderecoCompleto.replace(/^,\s*/, "").trim(),
      cidade: c.cidade || "",
    };
  });

  return NextResponse.json(resultado);
}
