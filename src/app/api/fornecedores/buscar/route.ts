import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Busca de fornecedores para o seletor da integração com o Chatwoot
// (tabela Fornecedores das Requisições). Busca insensível a acento por
// nome, e por dígitos do CNPJ/CPF.
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

function normalizar(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ fornecedores: [] }, { headers: CORS });
  }

  const nq = normalizar(q);
  const digits = q.replace(/\D/g, "");

  try {
    // Tabela pequena — carrega tudo e filtra em JS (a coluna "cpf/cnpj"
    // tem barra no nome, então evitamos select por coluna).
    const { data, error } = await supabase
      .from("Fornecedores")
      .select("*")
      .order("nome", { ascending: true });
    if (error) throw new Error(error.message);

    const fornecedores = (data || [])
      .filter(f => {
        if (normalizar(f.nome).includes(nq)) return true;
        const doc = String(f["cpf/cnpj"] || "").replace(/\D/g, "");
        return digits.length >= 3 && doc.includes(digits);
      })
      .slice(0, 20)
      .map(f => ({
        id: f.id,
        nome: f.nome || "",
        cnpj: f["cpf/cnpj"] || "",
        numero: f.numero || "",
        email: f.email || "",
        cidade: f.cidade || "",
        estado: f.estado || "",
      }));

    return NextResponse.json({ fornecedores }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
