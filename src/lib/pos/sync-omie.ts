import { supabase } from "./supabase";
import { TBL_CLIENTES, TBL_PROJETOS_DB } from "./constants";

const OMIE_APP_KEY = process.env.OMIE_APP_KEY || "";
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET || "";
const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>): Promise<T> {
  const payload = {
    call,
    app_key: OMIE_APP_KEY,
    app_secret: OMIE_APP_SECRET,
    param: [param],
  };

  const response = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (response.status === 429) {
    console.warn("Rate limit Omie — aguardando 60s...");
    await new Promise((r) => setTimeout(r, 60000));
    return omieCall(endpoint, call, param);
  }

  const data = await response.json();
  if (data?.faultstring) {
    throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  }
  return data as T;
}

// ── Sync Clientes ──
interface OmieClienteResponse {
  pagina: number;
  total_de_paginas: number;
  clientes_cadastro: Array<{
    codigo_cliente_omie: number;
    codigo_cliente_integracao: string;
    cnpj_cpf: string;
    razao_social: string;
    nome_fantasia: string;
    email: string;
    telefone1_numero: string;
    endereco: string;
    endereco_numero: string;
    bairro: string;
    cidade: string;
    estado: string;
    cep: string;
  }>;
}

export async function syncClientes(): Promise<{ total: number; novos: number; atualizados: number }> {
  let pagina = 1;
  let totalPaginas = 1;
  let total = 0;
  let novos = 0;
  let atualizados = 0;

  while (pagina <= totalPaginas) {
    const res = await omieCall<OmieClienteResponse>(
      "/geral/clientes/",
      "ListarClientes",
      { pagina, registros_por_pagina: 50, apenas_importado_api: "N" }
    );

    totalPaginas = res.total_de_paginas;

    for (const c of res.clientes_cadastro || []) {
      const endereco = [c.endereco, c.endereco_numero].filter(Boolean).join(", ");

      const registro = {
        id_omie: String(c.codigo_cliente_omie),
        id_cliente: c.codigo_cliente_integracao || String(c.codigo_cliente_omie),
        cnpj_cpf: c.cnpj_cpf || "",
        razao_social: c.razao_social || "",
        nome_fantasia: c.nome_fantasia || "",
        email: c.email || "",
        telefone: c.telefone1_numero || "",
        endereco: endereco,
        cidade: c.cidade || "",
        estado: c.estado || "",
        cep: c.cep || "",
      };

      // Tenta achar existente pelo id_omie
      const { data: existente } = await supabase
        .from(TBL_CLIENTES)
        .select("id_omie")
        .eq("id_omie", registro.id_omie)
        .limit(1);

      if (existente && existente.length > 0) {
        await supabase.from(TBL_CLIENTES).update(registro).eq("id_omie", registro.id_omie);
        atualizados++;
      } else {
        await supabase.from(TBL_CLIENTES).insert(registro);
        novos++;
      }
      total++;
    }

    pagina++;

    // Respeitar rate limit do Omie (máx 3 req/s)
    await new Promise((r) => setTimeout(r, 400));
  }

  return { total, novos, atualizados };
}

// ── Sync Projetos ──
interface OmieProjetoResponse {
  pagina: number;
  total_de_paginas: number;
  cadastro: Array<{
    codigo: number;
    nome: string;
    descricao: string;
    status: string;
  }>;
}

export async function syncProjetos(): Promise<{ total: number; novos: number }> {
  let pagina = 1;
  let totalPaginas = 1;
  let total = 0;
  let novos = 0;

  while (pagina <= totalPaginas) {
    const res = await omieCall<OmieProjetoResponse>(
      "/geral/projetos/",
      "ListarProjetos",
      { pagina, registros_por_pagina: 50 }
    );

    totalPaginas = res.total_de_paginas;

    for (const p of res.cadastro || []) {
      // Verifica se já existe pelo nome
      const { data: existente } = await supabase
        .from(TBL_PROJETOS_DB)
        .select("Nome_Projeto")
        .eq("Nome_Projeto", p.nome)
        .limit(1);

      if (!existente || existente.length === 0) {
        await supabase.from(TBL_PROJETOS_DB).insert({
          Nome_Projeto: p.nome,
        });
        novos++;
      }
      total++;
    }

    pagina++;
    await new Promise((r) => setTimeout(r, 400));
  }

  return { total, novos };
}
