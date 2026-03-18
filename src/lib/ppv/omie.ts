// =============================================
// INTEGRAÇÃO OMIE — PEDIDO DE VENDA (PPV)
// Suporte a múltiplas contas Omie por empresa
// =============================================

import { supabaseFetch } from "./supabase";
import { TBL_PEDIDOS, TBL_ITENS, TBL_CLIENTES, TBL_LOGS, TBL_PRODUTOS } from "./constants";
import { buscarPPVPorId, registrarLog } from "./queries";

// --- Contas Omie ---
interface OmieAccount {
  name: string;
  key: string;
  secret: string;
  codCC?: number; // codigo_conta_corrente (específico por conta)
}

const OMIE_ACCOUNTS: OmieAccount[] = [
  { name: "Principal", key: "2729522270475", secret: "113d785bb86c48d064889d4d73348131", codCC: 1969919780 },   // Nova Tratores - BB
  { name: "Secundario", key: "2730028269969", secret: "dc270bf5348b40d3ed1398ef70beb628", codCC: 5335855842 }, // Castro Peças - BB
];

const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

// --- Constantes Omie ---
const OMIE_COD_CATEG_VENDA = "1.01.03";

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
  return acc || OMIE_ACCOUNTS[0]; // fallback para Principal
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
export async function enviarPPVParaOmie(idPPV: string): Promise<{ sucesso: boolean; numeroPedido?: string; erro?: string }> {
  // 1. Busca detalhes do PPV
  const detalhes = await buscarPPVPorId(idPPV);
  if (!detalhes) {
    return { sucesso: false, erro: "PPV não encontrado" };
  }

  // 2. Validações
  if (detalhes.status !== "Aguardando Para Faturar") {
    return { sucesso: false, erro: `Status inválido: "${detalhes.status}". Precisa estar "Aguardando Para Faturar"` };
  }

  if (detalhes.pedidoOmie) {
    return { sucesso: false, erro: `PPV já possui pedido Omie: ${detalhes.pedidoOmie}` };
  }

  if (!detalhes.cliente) {
    return { sucesso: false, erro: "Cliente não informado" };
  }

  // 3. Busca CNPJ do cliente
  let cnpjCliente = "";
  try {
    const res = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_CLIENTES}?or=(nome_fantasia.eq.${encodeURIComponent(detalhes.cliente)},razao_social.eq.${encodeURIComponent(detalhes.cliente)})&select=cnpj_cpf&limit=1`
    );
    if (res && res.length > 0) {
      cnpjCliente = String(res[0].cnpj_cpf || "").trim();
    }
  } catch { /* continua */ }

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
  const empresaMajoritaria = Object.entries(contEmpresa).sort((a, b) => b[1] - a[1])[0]?.[0] || "Principal";

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
    // Há produtos exclusivos de empresas diferentes — bloqueia
    const detalhesEmpresas = Array.from(empresasExclusivas).map((e) => {
      const count = produtosFinais.filter(([, p]) => p.empresa === e).length;
      return `${e}: ${count} produto(s)`;
    }).join(", ");
    return {
      sucesso: false,
      erro: `PPV contém produtos de empresas diferentes (${detalhesEmpresas}). Separe os produtos em PPVs distintos por empresa antes de enviar para o Omie.`,
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

    // Cria Pedido de Venda
    const payload = {
      cabecalho: {
        codigo_pedido_integracao: `PV-${idPPV}`,
        codigo_cliente: nCodCli,
        data_previsao: formatarDataOmie(),
        etapa: "10",
        quantidade_itens: det.length,
      },
      informacoes_adicionais: {
        codigo_categoria: OMIE_COD_CATEG_VENDA,
        ...(acc.codCC ? { codigo_conta_corrente: acc.codCC } : {}),
        codVend: nCodVend || undefined,
        numero_contrato: idPPV,
      },
      det,
    };

    const resposta = await omieCall<{ numero_pedido?: string; codigo_pedido?: number }>(
      "/produtos/pedido/",
      "IncluirPedido",
      payload as unknown as Record<string, unknown>,
      acc.key,
      acc.secret
    );

    const numPedido = resposta.numero_pedido || String(resposta.codigo_pedido || "");
    console.log(`[Omie PPV] ${idPPV} → Pedido nº ${numPedido} (${acc.name})`);

    // Atualiza PPV: salva pedido_omie + muda status para Fechado
    await supabaseFetch(
      `${TBL_PEDIDOS}?id_pedido=eq.${idPPV}`,
      "PATCH",
      { pedido_omie: numPedido, status: "Fechado" }
    );

    await registrarLog(idPPV, `Pedido de Venda Omie nº ${numPedido} criado (${acc.name}). PPV fechado.`);

    return { sucesso: true, numeroPedido: numPedido };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Omie PPV] ${idPPV}: ${msg}`);
    return { sucesso: false, erro: msg };
  }
}
