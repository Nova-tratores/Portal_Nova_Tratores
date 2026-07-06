import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { contaOmie } from "@/lib/omie/contas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || "",
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ""
);

const OMIE_BASE = "https://app.omie.com.br/api/v1";

interface OmieAccount {
  name: string;
  key: string;
  secret: string;
}

const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Nova Tratores", ...contaOmie("Nova Tratores") },
  { name: "Castro Pecas", ...contaOmie("Castro Pecas") },
];

async function omieCall<T>(endpoint: string, call: string, param: Record<string, unknown>, acc: OmieAccount): Promise<T> {
  const res = await fetch(`${OMIE_BASE}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ call, app_key: acc.key, app_secret: acc.secret, param: [param] }),
  });
  if (res.status === 429) {
    console.warn(`[clientes-sync ${acc.name}] Rate limit (${call}) — aguardando 60s`);
    await new Promise((r) => setTimeout(r, 60000));
    return omieCall(endpoint, call, param, acc);
  }
  const data = await res.json().catch(() => ({}));
  if (data?.faultstring) {
    if (data.faultstring.includes("Não existem registros") || data.faultstring.includes("Nao existem registros")) {
      return {} as T;
    }
    throw new Error(`Omie [${acc.name}]: ${data.faultstring}`);
  }
  return data as T;
}

function parseData(d: string): string | null {
  if (!d) return null;
  const [dia, mes, ano] = d.split("/");
  if (!dia || !mes || !ano) return null;
  return `${ano}-${mes}-${dia}`;
}

const ETAPA_LABEL: Record<string, string> = {
  "10": "Em Aberto", "20": "Parcial", "30": "Executada",
  "50": "Faturando", "60": "Faturada",
};

const ETAPA_PV_LABEL: Record<string, string> = {
  "10": "Em Aberto", "20": "Faturar", "30": "Faturado parcial",
  "40": "Devolução parcial", "50": "Faturado", "60": "Faturado",
  "70": "Devolução total",
};

// ================ SYNC PROJETOS (cache + salvar no banco) ================
async function carregarProjetos(acc: OmieAccount): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const rows: { codigo: number; empresa: string; nome: string; inativo: string }[] = [];
  let pag = 1, totPag = 1;

  while (pag <= totPag) {
    const r = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string; inativo?: string }>;
      total_de_paginas?: number;
    }>("/geral/projetos/", "ListarProjetos", {
      pagina: pag, registros_por_pagina: 200,
    }, acc);
    if (pag === 1) totPag = r?.total_de_paginas || 1;
    for (const p of r?.cadastro || []) {
      map.set(p.codigo, p.nome);
      rows.push({ codigo: p.codigo, empresa: acc.name, nome: p.nome, inativo: p.inativo || "N" });
    }
    pag++;
    if (pag <= totPag) await new Promise((r) => setTimeout(r, 300));
  }

  // Salvar todos os projetos no banco
  for (let i = 0; i < rows.length; i += 200) {
    const batch = rows.slice(i, i + 200);
    await supabase.from("portal_nt_projetos_PRINCIPAL").upsert(
      batch.map(r => ({ ...r, updated_at: new Date().toISOString() })),
      { onConflict: "codigo,empresa" }
    );
  }

  console.log(`[clientes-sync] ${acc.name}: ${map.size} projetos carregados`);
  return map;
}

// ================ SYNC VENDEDORES (cache) ================
async function carregarVendedores(acc: OmieAccount): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  let pag = 1, totPag = 1;

  while (pag <= totPag) {
    const r = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string; inativo?: string }>;
      total_de_paginas?: number;
    }>("/geral/vendedores/", "ListarVendedores", {
      pagina: pag, registros_por_pagina: 200,
    }, acc);
    if (pag === 1) totPag = r?.total_de_paginas || 1;
    for (const v of r?.cadastro || []) {
      map.set(v.codigo, v.nome);
    }
    pag++;
    if (pag <= totPag) await new Promise((r) => setTimeout(r, 300));
  }

  return map;
}

// ================ SYNC CLIENTES ================
async function syncClientes(acc: OmieAccount) {
  const clientes: Record<string, unknown>[] = [];
  let pag = 1, totPag = 1;

  while (pag <= totPag) {
    const r = await omieCall<{
      clientes_cadastro?: Array<Record<string, any>>;
      total_de_paginas?: number;
    }>("/geral/clientes/", "ListarClientes", {
      pagina: pag,
      registros_por_pagina: 200,
      apenas_importado_api: "N",
    }, acc);

    if (pag === 1) totPag = r?.total_de_paginas || 1;

    for (const c of r?.clientes_cadastro || []) {
      clientes.push({
        cod_cli: c.codigo_cliente_omie,
        empresa: acc.name,
        razao_social: c.razao_social || "",
        nome_fantasia: c.nome_fantasia || "",
        cnpj_cpf: c.cnpj_cpf || "",
        email: c.email || "",
        telefone: c.telefone1_numero ? `(${c.telefone1_ddd || ""}) ${c.telefone1_numero}` : "",
        cidade: c.cidade || "",
        estado: c.estado || "",
        endereco: c.endereco || "",
        bairro: c.bairro || "",
        cep: c.cep || "",
        inscricao_estadual: c.inscricao_estadual || "",
        inativo: c.inativo || "N",
        tags: c.tags || "",
        updated_at: new Date().toISOString(),
      });
    }

    pag++;
    if (pag <= totPag) await new Promise((r) => setTimeout(r, 350));
  }

  for (let i = 0; i < clientes.length; i += 200) {
    const batch = clientes.slice(i, i + 200);
    const { error } = await supabase
      .from("portal_nt_clientes_cadastro_omie")
      .upsert(batch, { onConflict: "cod_cli,empresa" });
    if (error) throw new Error(`Erro upsert clientes ${acc.name}: ${error.message}`);
  }

  return clientes.length;
}

// ================ SYNC OS ================
async function syncOS(
  acc: OmieAccount,
  ano: string,
  projetoMap: Map<number, string>,
  vendedorMap: Map<number, string>,
) {
  const rows: Record<string, unknown>[] = [];
  let pag = 1, totPag = 1;

  while (pag <= totPag) {
    const r = await omieCall<{
      osCadastro?: Array<{
        Cabecalho: {
          cNumOS: string; nCodOS: number; cCodIntOS: string; cEtapa: string;
          dDtPrevisao: string; nCodCli: number; nCodVend: number; nValorTotal: number;
          cNumPedCli?: string;
        };
        InfoCadastro: {
          dDtInc: string; dDtFat: string; cCancelada: string; cFaturada: string;
          // Campos de NFS-e que podem vir na resposta
          nNumNFSe?: number; cSerieNFSe?: string; cStatusNFSe?: string;
          dDtNFSe?: string; nNumRPS?: number;
        };
        InformacoesAdicionais: {
          cDadosAdicNF?: string; cCidPrestServ?: string;
          cNumContrato?: string; cNumPedido?: string;
          nCodProj?: number; cCodCateg?: string;
        };
        Observacoes: { cObsOS?: string };
        ServicosPrestados: Array<{
          nCodServico: number; nQtde: number; nValUnit: number;
          cDescServ?: string; cNaoGerarFinanceiro?: string;
        }>;
      }>;
      total_de_paginas?: number;
    }>("/servicos/os/", "ListarOS", {
      pagina: pag,
      registros_por_pagina: 500,
      filtrar_por_data_de: `01/01/${ano}`,
      filtrar_por_data_ate: `31/12/${ano}`,
      filtrar_apenas_inclusao: "S",
    }, acc);

    if (pag === 1) totPag = r?.total_de_paginas || 1;

    for (const os of r?.osCadastro || []) {
      const cab = os.Cabecalho;
      const info = os.InfoCadastro;
      const adicional = os.InformacoesAdicionais;
      const servs = os.ServicosPrestados || [];

      let status = ETAPA_LABEL[cab.cEtapa] || cab.cEtapa;
      if (info.cCancelada === "S") status = "Cancelada";

      const numPedidoCli = cab.cNumPedCli || adicional?.cNumPedido || adicional?.cNumContrato || "";

      // Projeto
      const codProj = adicional?.nCodProj || null;
      const projetoNome = codProj ? (projetoMap.get(codProj) || `Proj #${codProj}`) : "";

      // Vendedor
      const vendedorNome = vendedorMap.get(cab.nCodVend) || "";

      // NFS-e (pode vir direto na resposta)
      const numNFSe = info.nNumNFSe ? String(info.nNumNFSe) : "";

      rows.push({
        num_os: cab.cNumOS,
        cod_os: cab.nCodOS,
        empresa: acc.name,
        cod_cli: cab.nCodCli,
        etapa: cab.cEtapa,
        data_previsao: parseData(cab.dDtPrevisao),
        data_inclusao: parseData(info.dDtInc),
        data_faturamento: parseData(info.dDtFat || "") || null,
        valor_total: cab.nValorTotal,
        status,
        cancelada: info.cCancelada === "S",
        faturada: info.cFaturada === "S",
        num_pedido_cli: numPedidoCli,
        vendedor: vendedorNome,
        cod_vendedor: cab.nCodVend,
        cidade: adicional?.cCidPrestServ || "",
        contrato: adicional?.cNumContrato || "",
        projeto: projetoNome,
        num_nf: numNFSe,
        descricao: servs.find(s => s.cDescServ)?.cDescServ || "",
        servicos: JSON.stringify(servs.map(s => ({
          cod: s.nCodServico, qtd: s.nQtde, valor: s.nValUnit, desc: s.cDescServ || "",
        }))),
        obs: os.Observacoes?.cObsOS || "",
        dados_adic: adicional?.cDadosAdicNF || "",
        updated_at: new Date().toISOString(),
      });
    }

    pag++;
    if (pag <= totPag) await new Promise((r) => setTimeout(r, 350));
  }

  // Dedup
  const dedupMap = new Map<string, Record<string, unknown>>();
  for (const r of rows) dedupMap.set(`${r.num_os}|${r.empresa}`, r);
  const dedupRows = Array.from(dedupMap.values());

  for (let i = 0; i < dedupRows.length; i += 200) {
    const batch = dedupRows.slice(i, i + 200);
    const { error } = await supabase
      .from("portal_nt_clientes_os")
      .upsert(batch, { onConflict: "num_os,empresa" });
    if (error) throw new Error(`Erro upsert OS ${acc.name}: ${error.message}`);
  }

  return dedupRows.length;
}

// ================ SYNC NFS-e (notas da OS via StatusOS) ================
async function syncNFSe(acc: OmieAccount) {
  let count = 0;
  const BUCKET = "clientes-docs";

  // Buscar OS faturadas sem link_nf
  const { data: osFaturadas } = await supabase
    .from("portal_nt_clientes_os")
    .select("num_os, cod_os")
    .eq("empresa", acc.name)
    .eq("faturada", true)
    .eq("cancelada", false)
    .or("link_nf.is.null,link_nf.eq.")
    .limit(500);

  for (const os of osFaturadas || []) {
    try {
      const r: any = await omieCall("/servicos/os/", "StatusOS", { nCodOS: os.cod_os }, acc);
      const nfseList: any[] = r?.ListaRpsNfse || [];

      if (nfseList.length > 0) {
        const nfse = nfseList[0];
        const numNFSe = nfse.nNfse || "";
        const danfeUrl = nfse.danfe || nfse.cUrlNfse || "";

        if (numNFSe || danfeUrl) {
          let finalUrl = danfeUrl;

          // Tentar baixar e salvar no Supabase Storage
          if (danfeUrl) {
            try {
              const pdfRes = await fetch(danfeUrl);
              if (pdfRes.ok) {
                const buffer = Buffer.from(await pdfRes.arrayBuffer());
                if (buffer.length > 100) {
                  const contentType = pdfRes.headers.get("content-type") || "application/pdf";
                  const path = `${acc.name.replace(/ /g, "_")}/os_${os.num_os}/nfse_${numNFSe || os.num_os}.pdf`;
                  const { error: upErr } = await supabase.storage
                    .from(BUCKET).upload(path, buffer, { contentType, upsert: true });
                  if (!upErr) {
                    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
                    finalUrl = pub.publicUrl;
                  }
                }
              }
            } catch {
              // Se falhar download, manter a URL original do Omie
            }
          }

          const updates: Record<string, string> = {};
          if (numNFSe) updates.num_nf = numNFSe;
          if (finalUrl) updates.link_nf = finalUrl;

          await supabase.from("portal_nt_clientes_os").update(updates)
            .eq("num_os", os.num_os).eq("empresa", acc.name);
          count++;
        }
      }

      await new Promise((r) => setTimeout(r, 350));
    } catch {
      // Ignorar erros individuais
    }
  }

  console.log(`[clientes-sync] NFS-e ${acc.name}: ${count} encontradas via StatusOS`);
  return count;
}

// ================ SYNC NF-e (notas do PV via StatusPedido) ================
async function syncNFePV(acc: OmieAccount) {
  let count = 0;
  const BUCKET = "clientes-docs";

  // Buscar PVs faturados sem link_nf
  const { data: pvsFaturados } = await supabase
    .from("portal_nt_clientes_pv")
    .select("num_pedido, cod_pedido")
    .eq("empresa", acc.name)
    .eq("faturado", true)
    .eq("cancelado", false)
    .or("link_nf.is.null,link_nf.eq.")
    .limit(500);

  for (const pv of pvsFaturados || []) {
    try {
      const r: any = await omieCall("/produtos/pedido/", "StatusPedido", {
        codigo_pedido: pv.cod_pedido,
      }, acc);

      const nfeList: any[] = r?.ListaNfe || [];

      if (nfeList.length > 0) {
        const nfe = nfeList[0];
        const numNFe = nfe.numero_nfe || "";
        const danfeUrl = nfe.danfe || "";

        if (numNFe || danfeUrl) {
          let finalUrl = danfeUrl;

          // Tentar baixar e salvar no Supabase Storage
          if (danfeUrl) {
            try {
              const pdfRes = await fetch(danfeUrl);
              if (pdfRes.ok) {
                const buffer = Buffer.from(await pdfRes.arrayBuffer());
                if (buffer.length > 100) {
                  const contentType = pdfRes.headers.get("content-type") || "application/pdf";
                  const path = `${acc.name.replace(/ /g, "_")}/pv_${pv.num_pedido}/danfe_${numNFe || pv.num_pedido}.pdf`;
                  const { error: upErr } = await supabase.storage
                    .from(BUCKET).upload(path, buffer, { contentType, upsert: true });
                  if (!upErr) {
                    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
                    finalUrl = pub.publicUrl;
                  }
                }
              }
            } catch {
              // Se falhar download, manter a URL original do Omie
            }
          }

          const updates: Record<string, string> = {};
          if (numNFe) updates.numero_nf = numNFe;
          if (finalUrl) updates.link_nf = finalUrl;

          await supabase.from("portal_nt_clientes_pv").update(updates)
            .eq("num_pedido", pv.num_pedido).eq("empresa", acc.name);
          count++;
        }
      }

      await new Promise((r) => setTimeout(r, 350));
    } catch {
      // Ignorar erros individuais
    }
  }

  console.log(`[clientes-sync] NF-e PV ${acc.name}: ${count} encontradas via StatusPedido`);
  return count;
}

// ================ SYNC PV ================
async function syncPV(acc: OmieAccount, ano: string) {
  const rows: Record<string, unknown>[] = [];
  let pag = 1, totPag = 1;

  while (pag <= totPag) {
    const r = await omieCall<{
      pedido_venda_produto?: Array<{
        cabecalho: {
          codigo_pedido: number; numero_pedido: string;
          codigo_cliente: number; data_previsao: string;
          etapa: string; quantidade_itens: number;
          codigo_pedido_integracao?: string;
          numero_pedido_compra?: string;
        };
        total_pedido: { valor_mercadorias: number; valor_total_pedido: number };
        infoCadastro: {
          dInc: string; dAlt: string;
          cancelado: string; faturado: string;
        };
        det?: Array<{
          ide: { codigo_item_integracao?: string };
          produto: {
            codigo_produto: number; codigo?: string;
            descricao: string; quantidade: number;
            valor_unitario: number; valor_total: number;
          };
          inf_adic?: { numero_pedido_compra?: string; nfRelacionada?: string };
        }>;
        observacoes?: { obs_venda?: string };
        frete?: { numero_nota_fiscal?: string };
        // NF-e pode vir aqui em algumas versões da API
        nfRelacionada?: { cChaveNFe?: string; nNF?: number };
        lista_nfe?: Array<{ numero_nfe?: string; chave_nfe?: string }>;
      }>;
      total_de_paginas?: number;
    }>("/produtos/pedido/", "ListarPedidos", {
      pagina: pag,
      registros_por_pagina: 200,
      filtrar_por_data_de: `01/01/${ano}`,
      filtrar_por_data_ate: `31/12/${ano}`,
    }, acc);

    if (pag === 1) totPag = r?.total_de_paginas || 1;

    for (const pv of r?.pedido_venda_produto || []) {
      const cab = pv.cabecalho;
      const info = pv.infoCadastro;

      const itens = (pv.det || []).map(d => ({
        codigo: d.produto.codigo || "",
        descricao: d.produto.descricao,
        quantidade: d.produto.quantidade,
        valor_unitario: d.produto.valor_unitario,
        valor_total: d.produto.valor_total,
      }));

      // NF — tentar vários locais possíveis
      let numNF = pv.frete?.numero_nota_fiscal || "";
      if (!numNF && pv.nfRelacionada?.nNF) numNF = String(pv.nfRelacionada.nNF);
      if (!numNF && pv.lista_nfe?.[0]?.numero_nfe) numNF = pv.lista_nfe[0].numero_nfe;

      rows.push({
        num_pedido: cab.numero_pedido,
        cod_pedido: cab.codigo_pedido,
        empresa: acc.name,
        cod_cli: cab.codigo_cliente,
        data_previsao: parseData(cab.data_previsao),
        data_inclusao: parseData(info.dInc),
        etapa: ETAPA_PV_LABEL[cab.etapa] || cab.etapa,
        valor_total: pv.total_pedido?.valor_total_pedido || 0,
        cancelado: info.cancelado === "S",
        faturado: info.faturado === "S",
        numero_nf: numNF,
        itens: JSON.stringify(itens),
        observacoes: pv.observacoes?.obs_venda || "",
        updated_at: new Date().toISOString(),
      });
    }

    pag++;
    if (pag <= totPag) await new Promise((r) => setTimeout(r, 350));
  }

  // Dedup
  const dedupMap = new Map<string, Record<string, unknown>>();
  for (const r of rows) dedupMap.set(`${r.num_pedido}|${r.empresa}`, r);
  const dedupRows = Array.from(dedupMap.values());

  for (let i = 0; i < dedupRows.length; i += 200) {
    const batch = dedupRows.slice(i, i + 200);
    const { error } = await supabase
      .from("portal_nt_clientes_pv")
      .upsert(batch, { onConflict: "num_pedido,empresa" });
    if (error) throw new Error(`Erro upsert PV ${acc.name}: ${error.message}`);
  }

  return dedupRows.length;
}

// ================ ENRIQUECER NOMES ================
async function enriquecerNomes(acc: OmieAccount) {
  // OS sem nome
  const { data: osSemNome } = await supabase
    .from("portal_nt_clientes_os")
    .select("num_os, cod_cli")
    .eq("empresa", acc.name)
    .is("cliente_nome", null)
    .limit(5000);

  if (osSemNome && osSemNome.length > 0) {
    const codClis = [...new Set(osSemNome.map(o => o.cod_cli).filter(Boolean))];
    if (codClis.length > 0) {
      const { data: clientes } = await supabase
        .from("portal_nt_clientes_cadastro_omie")
        .select("cod_cli, razao_social, nome_fantasia")
        .eq("empresa", acc.name)
        .in("cod_cli", codClis);
      const nomeMap = new Map<number, string>();
      for (const c of clientes || []) nomeMap.set(c.cod_cli, c.nome_fantasia || c.razao_social || "");
      for (const os of osSemNome) {
        const nome = nomeMap.get(os.cod_cli);
        if (nome) {
          await supabase.from("portal_nt_clientes_os").update({ cliente_nome: nome })
            .eq("num_os", os.num_os).eq("empresa", acc.name);
        }
      }
    }
  }

  // PV sem nome
  const { data: pvSemNome } = await supabase
    .from("portal_nt_clientes_pv")
    .select("num_pedido, cod_cli")
    .eq("empresa", acc.name)
    .is("cliente_nome", null)
    .limit(5000);

  if (pvSemNome && pvSemNome.length > 0) {
    const codClis = [...new Set(pvSemNome.map(p => p.cod_cli).filter(Boolean))];
    if (codClis.length > 0) {
      const { data: clientes } = await supabase
        .from("portal_nt_clientes_cadastro_omie")
        .select("cod_cli, razao_social, nome_fantasia")
        .eq("empresa", acc.name)
        .in("cod_cli", codClis);
      const nomeMap = new Map<number, string>();
      for (const c of clientes || []) nomeMap.set(c.cod_cli, c.nome_fantasia || c.razao_social || "");
      for (const pv of pvSemNome) {
        const nome = nomeMap.get(pv.cod_cli);
        if (nome) {
          await supabase.from("portal_nt_clientes_pv").update({ cliente_nome: nome })
            .eq("num_pedido", pv.num_pedido).eq("empresa", acc.name);
        }
      }
    }
  }
}

// ================ ROUTE ================
const BUCKET_DOCS = "clientes-docs";

async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets?.find(b => b.name === BUCKET_DOCS)) {
    await supabase.storage.createBucket(BUCKET_DOCS, { public: true });
  }
}

// ================ VINCULAR PROJETOS AO ULTIMO CLIENTE ================
async function vincularProjetosAoUltimoCliente(acc: OmieAccount) {
  // Para cada projeto, achar a OS mais recente e pegar o cod_cli/cnpj
  const { data: projetos } = await supabase
    .from("portal_nt_projetos_PRINCIPAL")
    .select("codigo, nome")
    .eq("empresa", acc.name);

  if (!projetos || projetos.length === 0) return;

  // Buscar todas OS com projeto preenchido dessa empresa
  const PAGE = 1000;
  let from = 0;
  let hasMore = true;
  const osComProjeto: { projeto: string; cod_cli: number; data_previsao: string | null }[] = [];
  while (hasMore) {
    const { data } = await supabase
      .from("portal_nt_clientes_os")
      .select("projeto, cod_cli, data_previsao")
      .eq("empresa", acc.name)
      .not("projeto", "is", null)
      .not("projeto", "eq", "")
      .range(from, from + PAGE - 1);
    if (data && data.length > 0) {
      osComProjeto.push(...data);
      if (data.length < PAGE) hasMore = false;
      else from += PAGE;
    } else hasMore = false;
  }

  // Mapa: nome do projeto -> ultimo cod_cli (pela data mais recente)
  const ultimoCliente = new Map<string, { cod_cli: number; data: string }>();
  for (const os of osComProjeto) {
    if (!os.projeto) continue;
    const existing = ultimoCliente.get(os.projeto);
    const dt = os.data_previsao || "0000-00-00";
    if (!existing || dt > existing.data) {
      ultimoCliente.set(os.projeto, { cod_cli: os.cod_cli, data: dt });
    }
  }

  // Buscar cnpj_cpf e nome dos clientes
  const codClis = [...new Set(Array.from(ultimoCliente.values()).map(v => v.cod_cli))];
  const cliMap = new Map<number, { cnpj_cpf: string; nome: string }>();
  for (let i = 0; i < codClis.length; i += 200) {
    const batch = codClis.slice(i, i + 200);
    const { data: clis } = await supabase
      .from("portal_nt_clientes_cadastro_omie")
      .select("cod_cli, cnpj_cpf, nome_fantasia, razao_social")
      .eq("empresa", acc.name)
      .in("cod_cli", batch);
    for (const c of clis || []) {
      cliMap.set(c.cod_cli, { cnpj_cpf: c.cnpj_cpf || "", nome: c.nome_fantasia || c.razao_social || "" });
    }
  }

  // Atualizar projetos com ultimo cliente
  for (const proj of projetos) {
    const ultimo = ultimoCliente.get(proj.nome);
    if (ultimo) {
      const cli = cliMap.get(ultimo.cod_cli);
      await supabase.from("portal_nt_projetos_PRINCIPAL").update({
        cod_cli_ultimo: ultimo.cod_cli,
        cnpj_cpf_ultimo: cli?.cnpj_cpf || "",
        cliente_nome_ultimo: cli?.nome || "",
        updated_at: new Date().toISOString(),
      }).eq("codigo", proj.codigo).eq("empresa", acc.name);
    }
  }

  console.log(`[clientes-sync] Projetos ${acc.name}: ${projetos.length} projetos, ${ultimoCliente.size} com cliente vinculado`);
}

export async function POST(req: NextRequest) {
  // ?anoInicio=2020 para forçar desde um ano específico
  const anoAtual = new Date().getFullYear();
  const anoInicioParam = req.nextUrl.searchParams.get("anoInicio");

  try {
    await ensureBucket();
    // Verificar se já tem dados antigos sincronizados
    const { data: oldest } = await supabase
      .from("portal_nt_clientes_os")
      .select("data_inclusao")
      .not("data_inclusao", "is", null)
      .order("data_inclusao", { ascending: true })
      .limit(1);

    const jaTemHistorico = oldest && oldest.length > 0;

    // Se forçou anoInicio, usa ele. Senão, se já tem histórico, sync só ano atual.
    // Se nunca sincronizou, puxa desde 2018 (ou o ano que a empresa começou).
    const ANO_INICIO_PADRAO = 2018;
    let anoInicio: number;

    if (anoInicioParam) {
      anoInicio = parseInt(anoInicioParam);
    } else if (jaTemHistorico) {
      // Já tem dados — só atualizar ano atual
      anoInicio = anoAtual;
    } else {
      // Primeira vez — puxar tudo desde o início
      anoInicio = ANO_INICIO_PADRAO;
    }

    const anos: number[] = [];
    for (let a = anoInicio; a <= anoAtual; a++) anos.push(a);

    const resultado: Record<string, { clientes: number; os: number; pv: number; nfse: number }> = {};

    for (const acc of OMIE_ACCOUNTS) {
      console.log(`[clientes-sync] Iniciando ${acc.name} (${anos[0]}–${anos[anos.length - 1]})...`);

      const projetoMap = await carregarProjetos(acc);
      const vendedorMap = await carregarVendedores(acc);

      const nClientes = await syncClientes(acc);
      console.log(`[clientes-sync] ${acc.name}: ${nClientes} clientes`);

      let totalOS = 0, totalPV = 0, totalNFSe = 0;

      for (const ano of anos) {
        const anoStr = String(ano);
        console.log(`[clientes-sync] ${acc.name}: sincronizando ${anoStr}...`);

        const nOS = await syncOS(acc, anoStr, projetoMap, vendedorMap);
        totalOS += nOS;

        const nPV = await syncPV(acc, anoStr);
        totalPV += nPV;

        console.log(`[clientes-sync] ${acc.name} ${anoStr}: ${nOS} OS, ${nPV} PV`);
      }

      // Após sincronizar OS e PV, buscar NFs via StatusOS/StatusPedido
      console.log(`[clientes-sync] ${acc.name}: buscando NFS-e e DANFE...`);
      const nNFSe = await syncNFSe(acc);
      totalNFSe += nNFSe;

      const nNFePV = await syncNFePV(acc);
      totalNFSe += nNFePV;

      await enriquecerNomes(acc);
      await vincularProjetosAoUltimoCliente(acc);

      resultado[acc.name] = { clientes: nClientes, os: totalOS, pv: totalPV, nfse: totalNFSe };
    }

    return NextResponse.json({
      sucesso: true,
      periodo: `${anos[0]}–${anos[anos.length - 1]}`,
      resultado,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[clientes-sync]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
