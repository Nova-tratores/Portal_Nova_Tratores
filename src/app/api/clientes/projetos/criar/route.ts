import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

const OMIE_ACCOUNTS: Record<string, { key: string; secret: string }> = {
  "Nova Tratores": { key: "2729522270475", secret: "113d785bb86c48d064889d4d73348131" },
  "Castro Peças": { key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
};

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, empresa: string, tentativa = 1): Promise<T> {
  const acc = OMIE_ACCOUNTS[empresa];
  if (!acc) throw new Error(`Empresa desconhecida: ${empresa}`);

  const payload = {
    call,
    app_key: acc.key,
    app_secret: acc.secret,
    param: [param],
  };

  // Timeout pra não pendurar a requisição se o Omie travar a resposta.
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25000);
  let response: Response;
  try {
    response = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
  } catch (e: any) {
    if (e?.name === "AbortError") throw new Error("O Omie demorou demais para responder (timeout de 25s). Tente novamente.");
    throw e;
  } finally {
    clearTimeout(timer);
  }

  // Rate limit do Omie: tenta de novo poucas vezes, com espera curta.
  if (response.status === 429 && tentativa < 3) {
    await new Promise((r) => setTimeout(r, tentativa * 8000));
    return omieCall(endpoint, call, param, empresa, tentativa + 1);
  }

  const data = await response.json();
  if (data?.faultstring) {
    throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  }
  return data as T;
}

interface OmieIncluirProjetoResponse {
  codigo: number;
  descricao: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { nome, empresa } = body;

    if (!nome?.trim()) {
      return NextResponse.json({ error: "Nome do projeto é obrigatório" }, { status: 400 });
    }
    if (!empresa || !OMIE_ACCOUNTS[empresa]) {
      return NextResponse.json({ error: "Empresa inválida. Use 'Nova Tratores' ou 'Castro Peças'" }, { status: 400 });
    }

    // Omie exige um código de integração único (codInt), máx. 20 caracteres.
    // Slug curto do nome + timestamp em base36 (compacto) pra não colidir.
    const slug = (nome.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 10)) || "PROJ";
    const codInt = `${slug}-${Date.now().toString(36).toUpperCase()}`.slice(0, 20);

    const res = await omieCall<OmieIncluirProjetoResponse>(
      "/geral/projetos/",
      "IncluirProjeto",
      { codInt, nome: nome.trim(), inativo: "N" },
      empresa
    );

    const codigo = res.codigo;

    const { error: dbError } = await supabase
      .from("portal_nt_projetos_PRINCIPAL")
      .insert({
        codigo,
        empresa,
        nome: nome.trim(),
        inativo: "N",
        updated_at: new Date().toISOString(),
      });

    if (dbError) {
      console.error("Projeto criado no Omie mas falhou no Supabase:", dbError.message);
      return NextResponse.json({
        codigo,
        nome: nome.trim(),
        empresa,
        aviso: "Projeto criado no Omie mas falhou ao salvar localmente. Execute sync para corrigir.",
      });
    }

    return NextResponse.json({ codigo, nome: nome.trim(), empresa, ok: true });
  } catch (err: any) {
    console.error("Erro ao criar projeto:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
