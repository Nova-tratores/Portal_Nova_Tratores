import { supabase } from "./supabase";
import { TBL_CLIENTES, TBL_PROJETOS_DB } from "./constants";
import { contaOmie } from "@/lib/omie/contas";

const TBL_PRODUTOS = "Produtos_Completos";

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

interface OmieAccount {
  name: string;
  key: string;
  secret: string;
}

const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", ...contaOmie("Nova Tratores") },
  { name: "Castro Peças", ...contaOmie("Castro Peças") },
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
    inscricao_estadual?: string;
  }>;
}

export async function syncClientes(): Promise<{ total: number; novos: number; atualizados: number }> {
  let total = 0;
  const novos = 0;
  let atualizados = 0;

  for (const acc of OMIE_ACCOUNTS) {
    let pagina = 1;
    let totalPaginas = 1;

    while (pagina <= totalPaginas) {
      const res = await omieCall<OmieClienteResponse>(
        "/geral/clientes/",
        "ListarClientes",
        { pagina, registros_por_pagina: 500, apenas_importado_api: "N" },
        acc
      );

      totalPaginas = res.total_de_paginas;

      const brutos = (res.clientes_cadastro || []).map((c) => {
        const endereco = [c.endereco, c.endereco_numero].filter(Boolean).join(", ");
        return {
          id_omie: String(c.codigo_cliente_omie),
          cnpj_cpf: c.cnpj_cpf || "",
          razao_social: c.razao_social || "",
          nome_fantasia: c.nome_fantasia || "",
          email: c.email || "",
          telefone: c.telefone1_numero || "",
          endereco,
          bairro: c.bairro || "",
          cidade: c.cidade || "",
          estado: c.estado || "",
          cep: c.cep || "",
          inscricao_estadual: c.inscricao_estadual || "",
        };
      });

      // Remove duplicatas dentro da mesma página (Omie às vezes retorna repetidos)
      const dedupMap = new Map<string, typeof brutos[number]>();
      for (const r of brutos) dedupMap.set(r.id_omie, r);
      const registros = Array.from(dedupMap.values());

      if (registros.length > 0) {
        // Upsert único — evita erros silenciosos de insert com chave duplicada
        const { error } = await supabase
          .from(TBL_CLIENTES)
          .upsert(registros, { onConflict: "id_omie" });

        if (error) {
          console.error(`Erro upsert clientes [${acc.name}] pág ${pagina}:`, error.message);
          throw new Error(`Falha ao salvar clientes da pág ${pagina} (${acc.name}): ${error.message}`);
        }

        total += registros.length;
        atualizados += registros.length;
      }

      console.log(`[Sync Clientes ${acc.name}] Pág ${pagina}/${totalPaginas}`);
      pagina++;
      await new Promise((r) => setTimeout(r, 400));
    }
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
  let total = 0;
  let novos = 0;

  for (const acc of OMIE_ACCOUNTS) {
    let pagina = 1;
    let totalPaginas = 1;

    while (pagina <= totalPaginas) {
      const res = await omieCall<OmieProjetoResponse>(
        "/geral/projetos/",
        "ListarProjetos",
        { pagina, registros_por_pagina: 500 },
        acc
      );

      totalPaginas = res.total_de_paginas;

      const projetosPagina = res.cadastro || [];
      if (projetosPagina.length > 0) {
        const rows = projetosPagina.map((p) => ({
          codigo: p.codigo,
          empresa: acc.name,
          nome: p.nome,
          inativo: (p.status === "I" || p.status === "S") ? "S" : "N",
          updated_at: new Date().toISOString(),
        }));

        const { data: existentes } = await supabase
          .from(TBL_PROJETOS_DB)
          .select("codigo")
          .eq("empresa", acc.name)
          .in("codigo", rows.map(r => r.codigo));
        const existSet = new Set((existentes || []).map((e) => e.codigo));

        const novosProj = rows.filter((r) => !existSet.has(r.codigo));
        if (novosProj.length > 0) {
          const { error: insertErr } = await supabase.from(TBL_PROJETOS_DB).insert(novosProj);
          if (insertErr) {
            console.error(`Erro insert projetos [${acc.name}] pág ${pagina}:`, insertErr.message);
          } else {
            novos += novosProj.length;
          }
        }
        total += projetosPagina.length;
      }

      console.log(`[Sync Projetos ${acc.name}] Pág ${pagina}/${totalPaginas} (${projetosPagina.length} registros)`);
      pagina++;
      await new Promise((r) => setTimeout(r, 400));
    }
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
        { pagina, registros_por_pagina: 500, apenas_importado_api: "N", filtrar_apenas_omiepdv: "N" },
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
        // Upsert em lote (merge duplicatas por id_omie) — muito mais rápido
        const { data, error } = await supabase
          .from(TBL_PRODUTOS)
          .upsert(registros, { onConflict: "id_omie" });

        if (error) {
          console.error(`Erro upsert produtos [${acc.name}] pág ${pagina}:`, error.message);
        }

        total += registros.length;
      }

      console.log(`[Sync Produtos ${acc.name}] Pág ${pagina}/${totalPaginas} (${registros.length} registros)`);
      pagina++;
      await new Promise((r) => setTimeout(r, 400));
    }
  }

  return { total, novos, atualizados };
}
