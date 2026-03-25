import { supabase } from "./supabase";
import { TBL_CLIENTES, TBL_PROJETOS_DB } from "./constants";

const TBL_PRODUTOS = "Produtos_Completos";

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

interface OmieAccount {
  name: string;
  key: string;
  secret: string;
}

const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", key: "2729522270475", secret: "113d785bb86c48d064889d4d73348131" },
  { name: "Castro Peças", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628" },
];

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, acc?: OmieAccount): Promise<T> {
  const account = acc || OMIE_ACCOUNTS[0];
  const payload = {
    call,
    app_key: account.key,
    app_secret: account.secret,
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
    return omieCall(endpoint, call, param, acc);
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

    const registros = (res.clientes_cadastro || []).map((c) => {
      const endereco = [c.endereco, c.endereco_numero].filter(Boolean).join(", ");
      return {
        id_omie: String(c.codigo_cliente_omie),
        id_cliente: c.codigo_cliente_integracao || String(c.codigo_cliente_omie),
        cnpj_cpf: c.cnpj_cpf || "",
        razao_social: c.razao_social || "",
        nome_fantasia: c.nome_fantasia || "",
        email: c.email || "",
        telefone: c.telefone1_numero || "",
        endereco,
        cidade: c.cidade || "",
        estado: c.estado || "",
        cep: c.cep || "",
      };
    });

    if (registros.length > 0) {
      // Busca existentes de uma vez
      const ids = registros.map((r) => r.id_omie);
      const { data: existentes } = await supabase
        .from(TBL_CLIENTES)
        .select("id_omie")
        .in("id_omie", ids);
      const existentesSet = new Set((existentes || []).map((e) => e.id_omie));

      const paraInserir = registros.filter((r) => !existentesSet.has(r.id_omie));
      const paraAtualizar = registros.filter((r) => existentesSet.has(r.id_omie));

      // Batch insert
      if (paraInserir.length > 0) {
        await supabase.from(TBL_CLIENTES).insert(paraInserir);
        novos += paraInserir.length;
      }

      // Batch update via upsert (onConflict on id_omie)
      if (paraAtualizar.length > 0) {
        await supabase.from(TBL_CLIENTES).upsert(paraAtualizar, { onConflict: "id_omie" });
        atualizados += paraAtualizar.length;
      }

      total += registros.length;
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

    const projetosPagina = res.cadastro || [];
    if (projetosPagina.length > 0) {
      const nomes = projetosPagina.map((p) => p.nome);
      const { data: existentes } = await supabase
        .from(TBL_PROJETOS_DB)
        .select("Nome_Projeto")
        .in("Nome_Projeto", nomes);
      const existentesSet = new Set((existentes || []).map((e) => e.Nome_Projeto));

      const novosProj = projetosPagina
        .filter((p) => !existentesSet.has(p.nome))
        .map((p) => ({ Nome_Projeto: p.nome }));

      if (novosProj.length > 0) {
        await supabase.from(TBL_PROJETOS_DB).insert(novosProj);
        novos += novosProj.length;
      }
      total += projetosPagina.length;
    }

    pagina++;
    await new Promise((r) => setTimeout(r, 400));
  }

  return { total, novos };
}

// ── Sync Produtos (todas as contas Omie) ──
interface OmieProdutoResponse {
  pagina: number;
  total_de_paginas: number;
  produto_servico_cadastro: Array<{
    codigo_produto: number;
    codigo_produto_integracao: string;
    codigo: string;
    descricao: string;
    valor_unitario: number;
    preco_venda?: number;
    cmc?: number;
  }>;
}

export async function syncProdutos(): Promise<{ total: number; novos: number; atualizados: number }> {
  let total = 0;
  let novos = 0;
  let atualizados = 0;

  for (const acc of OMIE_ACCOUNTS) {
    let pagina = 1;
    let totalPaginas = 1;

    while (pagina <= totalPaginas) {
      const res = await omieCall<OmieProdutoResponse>(
        "/geral/produtos/",
        "ListarProdutos",
        { pagina, registros_por_pagina: 50, apenas_importado_api: "N", filtrar_apenas_omiepdv: "N" },
        acc
      );

      totalPaginas = res.total_de_paginas;

      const registros = (res.produto_servico_cadastro || []).map((p) => ({
        id_omie: p.codigo_produto,
        Codigo_Produto: p.codigo || p.codigo_produto_integracao || String(p.codigo_produto),
        Descricao_Produto: p.descricao || "",
        Preco_Unit: p.valor_unitario || 0,
        Preco_Venda: p.preco_venda ?? p.valor_unitario ?? 0,
        CMC: p.cmc ?? null,
        Empresa: acc.name,
      }));

      if (registros.length > 0) {
        const ids = registros.map((r) => String(r.id_omie));
        const { data: existentes } = await supabase
          .from(TBL_PRODUTOS)
          .select("id_omie")
          .in("id_omie", ids)
          .eq("Empresa", acc.name);
        const existentesSet = new Set((existentes || []).map((e) => String(e.id_omie)));

        const paraInserir = registros.filter((r) => !existentesSet.has(String(r.id_omie)));
        const paraAtualizar = registros.filter((r) => existentesSet.has(String(r.id_omie)));

        if (paraInserir.length > 0) {
          await supabase.from(TBL_PRODUTOS).insert(paraInserir);
          novos += paraInserir.length;
        }

        if (paraAtualizar.length > 0) {
          for (const prod of paraAtualizar) {
            await supabase.from(TBL_PRODUTOS)
              .update({
                Codigo_Produto: prod.Codigo_Produto,
                Descricao_Produto: prod.Descricao_Produto,
                Preco_Unit: prod.Preco_Unit,
                Preco_Venda: prod.Preco_Venda,
                CMC: prod.CMC,
              })
              .eq("id_omie", prod.id_omie)
              .eq("Empresa", acc.name);
          }
          atualizados += paraAtualizar.length;
        }

        total += registros.length;
      }

      pagina++;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return { total, novos, atualizados };
}
