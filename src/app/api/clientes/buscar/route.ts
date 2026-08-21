import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Busca de clientes para o seletor da integração com o Chatwoot.
// Busca insensível a acento e maiúscula: como o ilike do Postgres não ignora
// acento, carregamos a lista (com cache) e filtramos em JS normalizando.
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

type Cliente = {
  cod_cli: number;
  empresa: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  cnpj_cpf: string | null;
  cidade: string | null;
  estado: string | null;
  telefone: string | null;
  email: string | null;
};

function normalizar(s: string | null | undefined): string {
  return (s || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

// Cache em memória (o portal roda como processo longo no Railway).
const TTL = 5 * 60_000;
let cache: { at: number; rows: Cliente[] } | null = null;

async function carregarClientes(): Promise<Cliente[]> {
  if (cache && Date.now() - cache.at < TTL) return cache.rows;

  const rows: Cliente[] = [];
  const PAGE = 1000;
  let from = 0;
  let hasMore = true;
  while (hasMore) {
    const { data } = await supabase
      .from("portal_nt_clientes_cadastro_omie")
      .select(
        "cod_cli, empresa, razao_social, nome_fantasia, cnpj_cpf, cidade, estado, telefone, email"
      )
      .range(from, from + PAGE - 1);
    if (data && data.length > 0) {
      rows.push(...(data as Cliente[]));
      if (data.length < PAGE) hasMore = false;
      else from += PAGE;
    } else {
      hasMore = false;
    }
  }
  cache = { at: Date.now(), rows };
  return rows;
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) {
    return NextResponse.json({ clientes: [] }, { headers: CORS });
  }

  const nq = normalizar(q);
  const digits = q.replace(/\D/g, "");

  try {
    const todos = await carregarClientes();
    const clientes = todos
      .filter(c => {
        const nome = normalizar(c.nome_fantasia) + " " + normalizar(c.razao_social);
        if (nome.includes(nq)) return true;
        const doc = (c.cnpj_cpf || "").replace(/\D/g, "");
        return digits.length >= 3 && doc.includes(digits);
      })
      .slice(0, 20);

    return NextResponse.json({ clientes }, { headers: CORS });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "erro";
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS });
  }
}
