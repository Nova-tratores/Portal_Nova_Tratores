// =============================================
// INTEGRAÇÃO OMIE — PEDIDO DE VENDA (PPV)
// Suporte a múltiplas contas Omie por empresa
// =============================================

import { supabaseFetch } from "./supabase";
import { TBL_PEDIDOS, TBL_ITENS, TBL_CLIENTES, TBL_LOGS, TBL_PRODUTOS, TBL_OS } from "./constants";
import { buscarPPVPorId, registrarLog } from "./queries";
import { contaOmie } from "@/lib/omie/contas";

// A OS vinculada é interna? (usado pra mandar o PPV como Remessa automaticamente)
async function osEhInterna(osId: string): Promise<boolean> {
  if (!osId) return false;
  try {
    const res = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_OS}?Id_Ordem=eq.${encodeURIComponent(osId)}&select=Servico_Interno&limit=1`
    );
    return !!(res && res.length > 0 && res[0].Servico_Interno);
  } catch { return false; }
}


// --- Contas Omie ---
interface OmieAccount {
  name: string;
  key: string;
  secret: string;
  codCC?: number; // codigo_conta_corrente (específico por conta)
  cenarioRemessa?: number; // codigo_cenario_impostos da operação de Remessa (não fatura)
}

const OMIE_ACCOUNTS: OmieAccount[] = [
  // cenarioRemessa: preencher com o código do Cenário Fiscal de "Remessa" de cada conta no Omie
  { name: "Nova Tratores", ...contaOmie("Nova Tratores"), codCC: 1969919780 },
  { name: "Castro Peças", ...contaOmie("Castro Peças"), codCC: 5335855842 },
];

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";
// Base do portal, pra montar os links de acesso na observação do pedido no Omie.
const PORTAL_BASE = (process.env.NEXT_PUBLIC_SITE_URL || "https://portalnovatratores-production.up.railway.app").replace(/\/$/, "");

// Links de acesso (POS da OS vinculada, este PPV e as requisições da OS).
async function montarLinksPPV(idPPV: string, osId: string): Promise<string> {
  const links: string[] = [`PPV ${idPPV}: ${PORTAL_BASE}/ppv?id=${encodeURIComponent(idPPV)}`];
  if (osId) {
    links.push(`OS ${osId}: ${PORTAL_BASE}/pos?id=${encodeURIComponent(osId)}`);
    try {
      const reqs = await supabaseFetch<{ id: string | number; status?: string }[]>(
        `Requisicao?ordem_servico=eq.${encodeURIComponent(osId)}&select=id,status`
      );
      for (const r of reqs || []) {
        if (/lixeira|cancel/i.test(String(r.status || ""))) continue;
        links.push(`Requisição ${r.id}: ${PORTAL_BASE}/requisicoes?req=${encodeURIComponent(String(r.id))}`);
      }
    } catch { /* segue sem os links de requisição */ }
  }
  return "Acesso no portal:\n" + links.join("\n");
}

// --- Constantes Omie ---
const OMIE_COD_CATEG_VENDA = "1.01.03";
// Etapa "50" = Faturar (TrocarEtapaPedido → emite a NF-e). Fica num só lugar
// caso alguma conta use um código diferente no pipeline.
const OMIE_ETAPA_FATURAR = "50";

// --- Client genérico Omie (aceita credenciais) ---
async function omieCall<T>(
  endpoint: string,
  call: string,
  param: Record<string, unknown>,
  appKey: string,
  appSecret: string
): Promise<T> {
  const payload = {
    call,
    app_key: appKey,
    app_secret: appSecret,
    param: [param],
  };

  const response = await fetch(`${OMIE_BASE_URL}${endpoint}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json();

  if (data?.faultstring) {
    throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  }

  if (response.status === 429) {
    console.warn("[Omie] Rate limit — aguardando 60s...");
    await new Promise((r) => setTimeout(r, 60000));
    return omieCall(endpoint, call, param, appKey, appSecret);
  }

  return data as T;
}

// --- Helpers ---
function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function formatarDataOmie(): string {
  const d = new Date();
  const dia = String(d.getDate()).padStart(2, "0");
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const ano = d.getFullYear();
  return `${dia}/${mes}/${ano}`;
}

function getAccount(empresa: string): OmieAccount {
  const acc = OMIE_ACCOUNTS.find(
    (a) => a.name.toLowerCase() === (empresa || "").toLowerCase()
  );
  return acc || OMIE_ACCOUNTS[0]; // fallback para Nova Tratores
}

// --- Lookup de cliente pelo CNPJ (por conta) ---
const cacheClientes = new Map<string, number>();

async function buscarNcodCli(cnpjOriginal: string, acc: OmieAccount): Promise<number> {
  const cacheKey = `${acc.name}:${normalizarCnpj(cnpjOriginal)}`;
  if (cacheClientes.has(cacheKey)) return cacheClientes.get(cacheKey)!;

  // Sempre busca direto na API Omie da conta correta (evita usar id_omie do Supabase que pode ser de outra empresa)
  console.log(`[Omie ${acc.name}] Buscando cliente por CNPJ: ${cnpjOriginal}`);
  const result = await omieCall<{ clientes_cadastro?: Array<{ codigo_cliente_omie: number }> }>(
    "/geral/clientes/",
    "ListarClientes",
    { pagina: 1, registros_por_pagina: 1, clientesFiltro: { cnpj_cpf: cnpjOriginal } },
    acc.key,
    acc.secret
  );

  const nCodCli = result?.clientes_cadastro?.[0]?.codigo_cliente_omie;
  if (!nCodCli) {
    throw new Error(`Cliente não encontrado no Omie (${acc.name}) para CNPJ: ${cnpjOriginal}`);
  }

  console.log(`[Omie ${acc.name}] Cliente encontrado: codigo_cliente_omie = ${nCodCli}`);
  cacheClientes.set(cacheKey, nCodCli);
  return nCodCli;
}

// --- Lookup de vendedor (técnico, por conta) ---
const cacheVendedoresPorConta = new Map<string, Array<{ codigo: number; nome: string }>>();
const cacheVendedores = new Map<string, number>();

async function carregarVendedores(acc: OmieAccount): Promise<Array<{ codigo: number; nome: string }>> {
  if (cacheVendedoresPorConta.has(acc.name)) return cacheVendedoresPorConta.get(acc.name)!;

  const lista: Array<{ codigo: number; nome: string }> = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const result = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string; inativo: string }>;
      total_de_paginas?: number;
    }>("/geral/vendedores/", "ListarVendedores", {
      pagina,
      registros_por_pagina: 50,
    }, acc.key, acc.secret);
    if (pagina === 1 && result.total_de_paginas) totalPaginas = result.total_de_paginas;
    for (const v of result.cadastro || []) {
      if (v.inativo !== "S") lista.push({ codigo: v.codigo, nome: v.nome });
    }
    pagina++;
    if (pagina > 1) await new Promise((r) => setTimeout(r, 400));
  }

  cacheVendedoresPorConta.set(acc.name, lista);
  return lista;
}

async function buscarNcodVend(tecnico: string, acc: OmieAccount): Promise<number> {
  const t = (tecnico || "").trim();
  if (!t) return 0;
  const cacheKey = `${acc.name}:${t}`;
  if (cacheVendedores.has(cacheKey)) return cacheVendedores.get(cacheKey)!;

  const vendedores = await carregarVendedores(acc);
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const nt = norm(t);

  for (const v of vendedores) {
    if (norm(v.nome).includes(nt)) {
      cacheVendedores.set(cacheKey, v.codigo);
      return v.codigo;
    }
  }

  console.warn(`[Omie ${acc.name}] Vendedor não encontrado para: ${t}`);
  return 0;
}

// --- Lookup de produto no Omie (por conta) ---
const cacheProdutos = new Map<string, number>();

async function buscarCodigoProdutoOmie(codigoInterno: string, acc: OmieAccount): Promise<number> {
  const cacheKey = `${acc.name}:${codigoInterno}`;
  if (cacheProdutos.has(cacheKey)) return cacheProdutos.get(cacheKey)!;

  // Tenta por código de integração
  try {
    const r1 = await omieCall<{ codigo_produto?: number }>(
      "/geral/produtos/",
      "ConsultarProduto",
      { codigo_produto_integracao: codigoInterno },
      acc.key,
      acc.secret
    );
    if (r1?.codigo_produto) {
      cacheProdutos.set(cacheKey, r1.codigo_produto);
      return r1.codigo_produto;
    }
  } catch { /* tenta próximo método */ }

  // Tenta pelo campo "codigo" (código do produto no Omie)
  try {
    const r2 = await omieCall<{ codigo_produto?: number }>(
      "/geral/produtos/",
      "ConsultarProduto",
      { codigo: codigoInterno },
      acc.key,
      acc.secret
    );
    if (r2?.codigo_produto) {
      cacheProdutos.set(cacheKey, r2.codigo_produto);
      return r2.codigo_produto;
    }
  } catch { /* tenta próximo método */ }

  throw new Error(`Produto "${codigoInterno}" não encontrado no Omie (${acc.name})`);
}

// --- Buscar empresa dos produtos via Supabase (trata duplicatas) ---
async function buscarEmpresasProdutos(codigos: string[]): Promise<Record<string, string[]>> {
  const empresaMap: Record<string, string[]> = {};
  if (codigos.length === 0) return empresaMap;

  try {
    const filter = codigos.map((c) => `Codigo_Produto.eq.${encodeURIComponent(c)}`).join(",");
    const res = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PRODUTOS}?or=(${filter})&select=Codigo_Produto,Empresa`
    );
    if (res) {
      res.forEach((p) => {
        const cod = String(p.Codigo_Produto || "").trim();
        const emp = String(p.Empresa || "").trim();
        if (cod && emp) {
          if (!empresaMap[cod]) empresaMap[cod] = [];
          if (!empresaMap[cod].includes(emp)) empresaMap[cod].push(emp);
        }
      });
    }
  } catch { /* não crítico */ }

  return empresaMap;
}

// =============================================
// FUNÇÃO PRINCIPAL: Enviar PPV para Omie
// Agrupa produtos por empresa e cria um pedido por empresa
// =============================================
export async function enviarPPVParaOmie(idPPV: string, opcoes?: { remessa?: boolean }): Promise<{ sucesso: boolean; numeroPedido?: string; erro?: string }> {
  // 1. Busca detalhes do PPV
  const detalhes = await buscarPPVPorId(idPPV);
  if (!detalhes) {
    return { sucesso: false, erro: "PPV não encontrado" };
  }

  // Decide se vai como Remessa: o chamador (POS) pode forçar; senão detecta automático
  // pelo tipo do pedido (Remessa) ou se a OS vinculada é interna.
  let isRemessa: boolean;
  if (opcoes?.remessa !== undefined) {
    isRemessa = !!opcoes.remessa;
  } else {
    isRemessa = detalhes.tipoPedido === "Remessa" || (await osEhInterna(detalhes.osId));
  }

  // 2. Validações — permite faturar em qualquer status (igual ao card do POS)
  if (detalhes.pedidoOmie) {
    return { sucesso: false, erro: `PPV já possui pedido Omie: ${detalhes.pedidoOmie}` };
  }

  if (!detalhes.cliente) {
    return { sucesso: false, erro: "Cliente não informado" };
  }

  // 3. CNPJ/CPF do cliente.
  // PRIORIDADE: o documento gravado no pedido. Buscar pelo NOME é furado — há clientes
  // HOMÔNIMOS com CNPJs diferentes (um ativo, um inativo) e o `limit=1` pegava o primeiro,
  // mandando o pedido pro cliente ERRADO no Omie.
  let cnpjCliente = String(detalhes.clienteDocumento || "").trim();
  if (!cnpjCliente) {
    try {
      const res = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_CLIENTES}?or=(nome_fantasia.eq.${encodeURIComponent(detalhes.cliente)},razao_social.eq.${encodeURIComponent(detalhes.cliente)})&select=cnpj_cpf&limit=1`
      );
      if (res && res.length > 0) {
        cnpjCliente = String(res[0].cnpj_cpf || "").trim();
      }
    } catch { /* continua */ }
  }

  if (!cnpjCliente) {
    try {
      const query = encodeURIComponent(detalhes.cliente.replace(/ /g, "%"));
      const res = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_CLIENTES}?or=(nome_fantasia.ilike.*${query}*,razao_social.ilike.*${query}*)&select=cnpj_cpf&limit=1`
      );
      if (res && res.length > 0) {
        cnpjCliente = String(res[0].cnpj_cpf || "").trim();
      }
    } catch { /* continua */ }
  }

  if (!cnpjCliente) {
    return { sucesso: false, erro: `CNPJ/CPF não encontrado para o cliente "${detalhes.cliente}"` };
  }

  // 4. Agrega produtos (saídas - devoluções)
  const resumo: Record<string, { descricao: string; qtde: number; preco: number; empresa?: string }> = {};
  for (const p of detalhes.produtos) {
    if (!resumo[p.codigo]) resumo[p.codigo] = { descricao: p.descricao, qtde: 0, preco: p.preco, empresa: p.empresa };
    resumo[p.codigo].qtde += p.quantidade;
  }
  for (const d of detalhes.devolucoes) {
    if (resumo[d.codigo]) resumo[d.codigo].qtde -= d.quantidade;
  }

  const produtosFinais = Object.entries(resumo).filter(([, p]) => p.qtde > 0);
  if (produtosFinais.length === 0) {
    return { sucesso: false, erro: "Todos os produtos foram devolvidos, nada para faturar" };
  }

  // 5. Buscar empresa dos produtos que não têm empresa definida
  const codigosSemEmpresa = produtosFinais.filter(([, p]) => !p.empresa).map(([cod]) => cod);
  if (codigosSemEmpresa.length > 0) {
    const empresasProd = await buscarEmpresasProdutos(codigosSemEmpresa);
    for (const [cod, prod] of produtosFinais) {
      if (!prod.empresa && empresasProd[cod]) {
        // Se o produto existe em múltiplas empresas, será resolvido abaixo
        prod.empresa = empresasProd[cod].length === 1 ? empresasProd[cod][0] : undefined;
      }
    }
  }

  // 6. Determinar empresa majoritária (ignora produtos que existem em ambas)
  const contEmpresa: Record<string, number> = {};
  for (const [, prod] of produtosFinais) {
    if (prod.empresa) {
      contEmpresa[prod.empresa] = (contEmpresa[prod.empresa] || 0) + 1;
    }
  }
  const empresaMajoritaria = Object.entries(contEmpresa).sort((a, b) => b[1] - a[1])[0]?.[0] || "Nova Tratores";

  // Verificar se há REALMENTE produtos exclusivos de empresas diferentes
  // (produtos que existem em ambas empresas NÃO são conflito)
  const empresasExclusivas = new Set<string>();
  for (const [, prod] of produtosFinais) {
    if (prod.empresa) {
      empresasExclusivas.add(prod.empresa);
    }
    // Se não tem empresa definida, é porque existe em ambas — sem conflito
  }

  if (empresasExclusivas.size > 1) {
    // Há produtos exclusivos de empresas diferentes — bloqueia.
    // Mostra os CÓDIGOS (e descrição) de cada empresa pra saber o que separar.
    const detalhesEmpresas = Array.from(empresasExclusivas).map((e) => {
      const itens = produtosFinais
        .filter(([, p]) => p.empresa === e)
        .map(([cod, p]) => `${cod}${p.descricao ? ` (${p.descricao})` : ""}`);
      return `${e}: ${itens.join(", ")}`;
    }).join(" | ");
    return {
      sucesso: false,
      erro: `Produtos de empresas diferentes (o Omie não aceita num pedido só) → ${detalhesEmpresas}. Separe em PPVs distintos por empresa antes de enviar.`,
    };
  }

  // Atribuir empresa majoritária aos produtos sem empresa definida (duplicatas)
  for (const [, prod] of produtosFinais) {
    if (!prod.empresa) prod.empresa = empresaMajoritaria;
  }

  // 7. Criar pedido na conta correta
  const empresaNome = empresaMajoritaria;
  const acc = getAccount(empresaNome);
  console.log(`[Omie PPV] ${idPPV} → Empresa: ${empresaNome} (${acc.name}), ${produtosFinais.length} produto(s)`);
  const produtos = produtosFinais;

  try {
    const nCodCli = await buscarNcodCli(cnpjCliente, acc);
    const nCodVend = await buscarNcodVend(detalhes.tecnico, acc);

    // Monta itens do pedido
    const det: Array<{
      ide: { codigo_item_integracao: string };
      produto: { codigo_produto: number; quantidade: number; valor_unitario: number };
    }> = [];

    for (let i = 0; i < produtos.length; i++) {
      const [cod, prod] = produtos[i];
      const codigoProdutoOmie = await buscarCodigoProdutoOmie(cod, acc);
      det.push({
        ide: { codigo_item_integracao: `${idPPV}-${i + 1}` },
        produto: {
          codigo_produto: codigoProdutoOmie,
          quantidade: prod.qtde,
          valor_unitario: prod.preco,
        },
      });
    }

    // Remessa e Pedido de Venda ficam AMBOS na área de Pedidos do Omie (IncluirPedido).
    // A diferença é só o Cenário Fiscal: a remessa usa um cenário de remessa (não fatura).
    const prefixoIntegracao = isRemessa ? `RM-${idPPV}` : `PV-${idPPV}`;
    const tipoLabel = isRemessa ? "Remessa" : "Pedido de Venda";
    const obsVenda = await montarLinksPPV(idPPV, String(detalhes.osId || ""));

    const payload = {
      cabecalho: {
        codigo_pedido_integracao: prefixoIntegracao,
        codigo_cliente: nCodCli,
        data_previsao: formatarDataOmie(),
        etapa: "10",
        quantidade_itens: det.length,
        ...(isRemessa && acc.cenarioRemessa ? { codigo_cenario_impostos: acc.cenarioRemessa } : {}),
      },
      informacoes_adicionais: {
        codigo_categoria: OMIE_COD_CATEG_VENDA,
        ...(acc.codCC ? { codigo_conta_corrente: acc.codCC } : {}),
        codVend: nCodVend || undefined,
        numero_contrato: idPPV,
      },
      // Links de acesso no portal (POS da OS, PPV e requisições).
      observacoes: { obs_venda: obsVenda },
      det,
    };

    const resposta = await omieCall<{ numero_pedido?: string; codigo_pedido?: number }>(
      "/produtos/pedido/",
      "IncluirPedido",
      payload as unknown as Record<string, unknown>,
      acc.key,
      acc.secret
    );

    const numPedido = (resposta.numero_pedido || String(resposta.codigo_pedido || "")).trim();
    console.log(`[Omie PPV] ${idPPV} → ${tipoLabel} nº ${numPedido} (${acc.name})`);

    // Atualiza PPV: salva pedido_omie + empresa da conta Omie + muda status
    // (omie_empresa evita re-descobrir a conta na hora de faturar)
    await supabaseFetch(
      `${TBL_PEDIDOS}?id_pedido=eq.${idPPV}`,
      "PATCH",
      { pedido_omie: numPedido, omie_empresa: empresaNome, status: "Concluída" }
    );

    await registrarLog(idPPV, `${tipoLabel} Omie nº ${numPedido} criado (${acc.name}). PPV fechado.`);

    return { sucesso: true, numeroPedido: numPedido };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Omie PPV] ${idPPV}: ${msg}`);
    return { sucesso: false, erro: msg };
  }
}

// =============================================
// FATURAMENTO DO PEDIDO DE VENDA (NF-e)
// Faturar = TrocarEtapaPedido → etapa "50", que emite a NF-e no Omie.
// O pedido é achado por codigo_pedido_integracao = "PV-{idPPV}" (gravado no
// envio). A categoria (regra fiscal) é escolhida pelo usuário e aplicada via
// AlterarPedidoVenda antes de faturar.
// =============================================

interface OmiePedidoConsulta {
  cabecalho?: { codigo_pedido?: number; numero_pedido?: string; etapa?: string; codigo_pedido_integracao?: string };
  total_pedido?: { valor_total_pedido?: number; valor_mercadorias?: number };
  informacoes_adicionais?: { codigo_categoria?: string };
  det?: Array<{ produto?: { descricao?: string; quantidade?: number; valor_unitario?: number; valor_total?: number } }>;
}

const codIntPV = (idPPV: string) => `PV-${idPPV}`;

// Consulta o Pedido de Venda no Omie por código de integração. Devolve null se
// não existir naquela conta (a Omie responde faultstring nesse caso).
async function consultarPedidoOmie(codInt: string, acc: OmieAccount): Promise<OmiePedidoConsulta | null> {
  try {
    const r = await omieCall<{ pedido_venda_produto?: OmiePedidoConsulta }>(
      "/produtos/pedido/",
      "ConsultarPedido",
      { codigo_pedido_integracao: codInt },
      acc.key,
      acc.secret,
    );
    return r?.pedido_venda_produto || null;
  } catch {
    return null;
  }
}

// Descobre em qual conta Omie o pedido do PPV vive. Usa omie_empresa (gravado no
// envio) e, como fallback pra pedidos antigos, sonda as duas contas.
async function resolverContaDoPedido(
  idPPV: string,
  empresaSalva?: string | null,
): Promise<{ acc: OmieAccount; pedido: OmiePedidoConsulta } | null> {
  const codInt = codIntPV(idPPV);
  if (empresaSalva) {
    const acc = getAccount(empresaSalva);
    const pedido = await consultarPedidoOmie(codInt, acc);
    if (pedido) return { acc, pedido };
  }
  for (const acc of OMIE_ACCOUNTS) {
    if (empresaSalva && acc.name.toLowerCase() === String(empresaSalva).toLowerCase()) continue;
    const pedido = await consultarPedidoOmie(codInt, acc);
    if (pedido) return { acc, pedido };
  }
  return null;
}

// Lê o pedido do PPV no Supabase (id_pedido, pedido_omie, omie_empresa, faturado).
async function lerCabecalhoPPV(idPPV: string): Promise<Record<string, unknown> | null> {
  const res = await supabaseFetch<Record<string, unknown>[]>(
    `${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}&select=id_pedido,pedido_omie,omie_empresa,faturado_omie_em,Tipo_Pedido&limit=1`,
  );
  return res && res.length ? res[0] : null;
}

export interface PrevisaoFaturamento {
  ok: boolean;
  erro?: string;
  jaFaturado?: boolean;
  etapaAtual?: string;
  categoriaAtual?: string | null;
  total?: number;
  empresa?: string;
  itens?: Array<{ descricao: string; quantidade: number; valorUnitario: number; valorTotal: number }>;
}

// Preview seguro (NÃO emite nada): consulta o pedido no Omie e devolve itens,
// total, etapa atual e categoria atual, pra confirmação antes de faturar.
export async function simularFaturamentoPPV(idPPV: string): Promise<PrevisaoFaturamento> {
  const cab = await lerCabecalhoPPV(idPPV);
  if (!cab) return { ok: false, erro: "PPV não encontrado." };
  if (!cab.pedido_omie) return { ok: false, erro: "Este PPV ainda não foi enviado ao Omie." };
  if (String(cab.Tipo_Pedido || "Pedido") === "Remessa") return { ok: false, erro: "Remessa não é faturada." };

  const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
  if (!achado) return { ok: false, erro: "Pedido não encontrado no Omie (ConsultarPedido)." };

  const { acc, pedido } = achado;
  const etapa = String(pedido.cabecalho?.etapa || "");
  const jaFaturado = !!cab.faturado_omie_em || (Number(etapa) >= Number(OMIE_ETAPA_FATURAR));
  const itens = (pedido.det || []).map((d) => ({
    descricao: String(d.produto?.descricao || ""),
    quantidade: Number(d.produto?.quantidade || 0),
    valorUnitario: Number(d.produto?.valor_unitario || 0),
    valorTotal: Number(d.produto?.valor_total || (Number(d.produto?.quantidade || 0) * Number(d.produto?.valor_unitario || 0))),
  }));
  return {
    ok: true,
    jaFaturado,
    etapaAtual: etapa,
    categoriaAtual: pedido.informacoes_adicionais?.codigo_categoria || null,
    total: Number(pedido.total_pedido?.valor_total_pedido || 0),
    empresa: acc.name,
    itens,
  };
}

export interface ResultadoFaturamentoPPV {
  sucesso: boolean;
  erro?: string;
  jaFaturado?: boolean;
  numeroPedido?: string;
  nfNumero?: string | null;
  etapa?: string;
  empresa?: string;
}

// Fatura o Pedido de Venda no Omie: (opcional) troca a categoria e avança a
// etapa pra "50" (emite a NF-e). Idempotente/anti-duplicidade via etapa atual.
export async function faturarPPVNoOmie(
  idPPV: string,
  opts: { categoria?: string } = {},
): Promise<ResultadoFaturamentoPPV> {
  const cab = await lerCabecalhoPPV(idPPV);
  if (!cab) return { sucesso: false, erro: "PPV não encontrado." };
  if (!cab.pedido_omie) return { sucesso: false, erro: "Este PPV ainda não foi enviado ao Omie." };
  if (String(cab.Tipo_Pedido || "Pedido") === "Remessa") return { sucesso: false, erro: "Remessa não é faturada." };
  if (cab.faturado_omie_em) return { sucesso: false, jaFaturado: true, erro: "Este pedido já foi faturado." };

  const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
  if (!achado) return { sucesso: false, erro: "Pedido não encontrado no Omie (ConsultarPedido)." };
  const { acc, pedido } = achado;
  const codInt = codIntPV(idPPV);

  // Anti-duplicidade: se o pedido já está numa etapa de faturamento, não refatura.
  const etapaAtual = String(pedido.cabecalho?.etapa || "");
  if (Number(etapaAtual) >= Number(OMIE_ETAPA_FATURAR)) {
    await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}`, "PATCH", {
      faturado_omie_em: new Date().toISOString(),
    });
    return { sucesso: false, jaFaturado: true, erro: `Pedido já está na etapa ${etapaAtual} (faturado).`, empresa: acc.name };
  }

  try {
    // 1) Troca a categoria (regra fiscal) se veio uma diferente da atual.
    const categoria = String(opts.categoria || "").trim();
    if (categoria && categoria !== (pedido.informacoes_adicionais?.codigo_categoria || "")) {
      await omieCall(
        "/produtos/pedido/",
        "AlterarPedidoVenda",
        { cabecalho: { codigo_pedido_integracao: codInt }, informacoes_adicionais: { codigo_categoria: categoria } },
        acc.key,
        acc.secret,
      );
    }

    // 2) Fatura: avança pra etapa "50" (emite a NF-e).
    await omieCall(
      "/produtos/pedido/",
      "TrocarEtapaPedido",
      { codigo_pedido_integracao: codInt, etapa: OMIE_ETAPA_FATURAR },
      acc.key,
      acc.secret,
    );

    // 3) Reconsulta pra registrar a nova etapa e (best-effort) o nº da NF.
    const depois = await consultarPedidoOmie(codInt, acc);
    const etapaDepois = String(depois?.cabecalho?.etapa || OMIE_ETAPA_FATURAR);
    const numeroPedido = String(depois?.cabecalho?.numero_pedido || cab.pedido_omie || "");

    await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}`, "PATCH", {
      faturado_omie_em: new Date().toISOString(),
      categoria_faturamento: categoria || (pedido.informacoes_adicionais?.codigo_categoria || null),
      omie_empresa: acc.name,
    });
    await registrarLog(idPPV, `Faturado no Omie (etapa ${etapaDepois}${categoria ? `, categoria ${categoria}` : ""}) — pedido nº ${numeroPedido} (${acc.name}).`);

    return { sucesso: true, numeroPedido, etapa: etapaDepois, empresa: acc.name, nfNumero: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Omie PPV faturar] ${idPPV}: ${msg}`);
    return { sucesso: false, erro: msg, empresa: acc.name };
  }
}
