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
// CFOP dos itens de REMESSA (Remessa em Bonificação, Doação ou Brinde).
const OMIE_CFOP_REMESSA = "5.910";
// Faturar no Omie é um caminho de DUAS etapas (o Omie recusa pular direto p/ a
// final): primeiro move pra "50" (Faturar), depois pra "60" (Faturado) — e é ao
// ENTRAR na 60 que o faturador roda e EMITE a NF-e (confirmado: arrastar p/
// "Faturado" no Omie gera a nota; pular 10→60 direto é rejeitado e volta p/ 10).
const OMIE_ETAPA_FATURAR = "50";   // intermediária "Faturar"
const OMIE_ETAPA_FATURADO = "60";  // final "Faturado" (dispara a emissão)

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

// "2026-10-15" -> "15/10/2026" (formato do Omie). Vazio -> hoje.
function isoParaBR(iso?: string): string {
  const s = String(iso || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatarDataOmie();
  return `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
}
function baseMaisDiasBR(previsaoISO: string, dias: number): string {
  const s = String(previsaoISO || "").slice(0, 10);
  const base = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + "T00:00:00") : new Date();
  base.setDate(base.getDate() + dias);
  const dd = String(base.getDate()).padStart(2, "0"), mm = String(base.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${base.getFullYear()}`;
}
// Parcelamento -> bloco de parcelas do Omie (igual ao que o portal mostra).
const COND_DIAS_OMIE: Record<string, number[]> = {
  "À vista (PIX ou Cartão)": [0], "30 dias": [30], "30/60 dias": [30, 60], "30/60/90 dias": [30, 60, 90],
};
function montarParcelasOmie(numParcelas: string, previsaoISO: string, total: number): { codigo_parcela: string; qtde_parcelas: number; lista_parcelas?: { parcela: Record<string, unknown>[] } } {
  const dias = COND_DIAS_OMIE[numParcelas] || [30];
  const n = dias.length;
  if (n === 1 && dias[0] === 0) return { codigo_parcela: "000", qtde_parcelas: 1 }; // à vista
  const base = Math.floor((total / n) * 100) / 100;
  const parcela = dias.map((d, i) => {
    const ultima = i === n - 1;
    const valor = ultima ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
    const percentual = total > 0 ? Math.round((valor / total) * 10000) / 100 : Math.round((100 / n) * 100) / 100;
    return { numero_parcela: i + 1, data_vencimento: baseMaisDiasBR(previsaoISO, d), quantidade_dias: d, percentual, valor };
  });
  return { codigo_parcela: "999", qtde_parcelas: n, lista_parcelas: { parcela } };
}
// Bloco fiscal do item a partir do perfil salvo (produto_fiscal). null = deixa o
// Omie calcular pelo Cenário Fiscal (não força nada).
async function impostoDoProdutoFiscal(conta: string, codigoProduto: number): Promise<{ cfop?: string; imposto?: Record<string, Record<string, unknown>> } | null> {
  try {
    const rows = await supabaseFetch<Record<string, unknown>[]>(
      `produto_fiscal?conta_omie=eq.${conta.toLowerCase()}&codigo_produto=eq.${codigoProduto}&limit=1`,
    );
    const r = rows?.[0];
    if (!r) return null;
    const nn = (v: unknown) => { const x = parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) ? x : 0; };
    const ss = (v: unknown) => (v == null ? undefined : String(v));
    return {
      cfop: ss(r.cfop),
      imposto: {
        icms: { cod_sit_trib_icms: ss(r.icms_cst), origem_icms: ss(r.icms_origem), modalidade_icms: ss(r.icms_modalidade), aliq_icms: nn(r.icms_aliquota), base_icms: nn(r.icms_base), perc_red_base_icms: nn(r.icms_perc_red_base) },
        icms_st: { cod_sit_trib_icms_st: ss(r.icmsst_cst), modalidade_icms_st: ss(r.icmsst_modalidade), aliq_icms_st: nn(r.icmsst_aliquota), aliq_icms_opprop: nn(r.icmsst_aliq_op_prop), base_icms_st: nn(r.icmsst_base), margem_icms_st: nn(r.icmsst_margem), perc_red_base_icms_op: nn(r.icmsst_perc_red_base_op), perc_red_base_icms_st: nn(r.icmsst_perc_red_base_st), cest: ss(r.icmsst_cest) },
        ipi: { cod_sit_trib_ipi: ss(r.ipi_cst), enquadramento_ipi: ss(r.ipi_enquadramento), aliq_ipi: nn(r.ipi_aliquota), base_ipi: nn(r.ipi_base) },
        pis_padrao: { cod_sit_trib_pis: ss(r.pis_cst), aliq_pis: nn(r.pis_aliquota), base_pis: nn(r.pis_base) },
        cofins_padrao: { cod_sit_trib_cofins: ss(r.cofins_cst), aliq_cofins: nn(r.cofins_aliquota), base_cofins: nn(r.cofins_base) },
      },
    };
  } catch (e) {
    console.error(`[Omie envio] impostoDoProdutoFiscal (${codigoProduto}/${conta}): ${(e as Error).message}`);
    return null;
  }
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

  // Tira o prefixo "Técnico(s): / Motorista:" pra comparar só o nome.
  const limpar = (nome: string) => norm(nome).replace(/^t[e]cnicos?:\s*/, "").replace(/^motorista:\s*/, "").trim();
  const combinado = (nome: string) => /\/\/|\se\s/.test(norm(nome)); // "Fulano // Beltrano" / "Fulano e Beltrano"

  // Prioridade: (1) EXATO de um técnico só (sem "//"); (2) substring de um técnico
  // só; (3) qualquer substring. Assim "Danilo de Souza" pega "Técnico: Danilo de
  // Souza" e NÃO "Técnicos: Danilo de Souza // Fernando Leonel".
  const achado =
    vendedores.find((v) => !combinado(v.nome) && limpar(v.nome) === nt) ||
    vendedores.find((v) => !combinado(v.nome) && limpar(v.nome).includes(nt)) ||
    vendedores.find((v) => norm(v.nome).includes(nt));

  if (achado) {
    cacheVendedores.set(cacheKey, achado.codigo);
    console.log(`[Omie ${acc.name}] Vendedor "${t}" -> "${achado.nome}" (${achado.codigo})`);
    return achado.codigo;
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

    // Resolve o código Omie + o fiscal de cada produto (compartilhado pelos dois fluxos).
    const totalPedido = produtos.reduce((s, [, p]) => s + p.qtde * p.preco, 0);
    const itens: Array<{ codInt: string; codigoProdutoOmie: number; qtde: number; preco: number; fiscal: { cfop?: string; imposto?: Record<string, Record<string, unknown>> } | null }> = [];
    for (let i = 0; i < produtos.length; i++) {
      const [cod, prod] = produtos[i];
      const codigoProdutoOmie = await buscarCodigoProdutoOmie(cod, acc);
      const contaProd = /castro|primari/i.test(prod.empresa || "") ? "castro" : "nova";
      const fiscal = await impostoDoProdutoFiscal(contaProd, codigoProdutoOmie);
      itens.push({ codInt: `${idPPV}-${i + 1}`, codigoProdutoOmie, qtde: prod.qtde, preco: prod.preco, fiscal });
    }

    const tipoLabel = isRemessa ? "Remessa" : "Pedido de Venda";
    const linksBase = await montarLinksPPV(idPPV, String(detalhes.osId || ""));
    const obsVenda = detalhes.dadosNF ? `${detalhes.dadosNF}\n\n${linksBase}` : linksBase;
    const dataPrevisao = isoParaBR(detalhes.previsaoFaturamento);

    let numPedido = "";
    if (isRemessa) {
      // ── REMESSA de verdade (/produtos/remessa/ IncluirRemessa) ──
      // Itens de remessa vão com CFOP 5.910 (Remessa em Bonificação/Doação/Brinde).
      const remessaPayload: Record<string, unknown> = {
        cabec: {
          cCodIntRem: `RM-${idPPV}`,
          dPrevisao: dataPrevisao,
          nCodCli,
          ...(nCodVend ? { nCodVend: String(nCodVend) } : {}),
        },
        infAdic: {
          cCodCateg: detalhes.categoriaPedido || OMIE_COD_CATEG_VENDA,
          cConsFinal: detalhes.consumoFinal ? "S" : "N",
          cNumCtr: detalhes.numContrato || idPPV,
          ...(detalhes.osId ? { cPedido: String(detalhes.osId) } : {}),
          ...(detalhes.contato ? { cContato: detalhes.contato } : {}),
          ...(detalhes.dadosNF ? { cDadosAdic: detalhes.dadosNF } : {}),
        },
        obs: { cObs: obsVenda },
        produtos: itens.map((it) => ({
          cCodItInt: it.codInt,
          nCodProd: it.codigoProdutoOmie,
          nQtde: it.qtde,
          nValUnit: it.preco,
          cCFOP: OMIE_CFOP_REMESSA,
        })),
      };
      const resp = await omieCall<Record<string, unknown>>("/produtos/remessa/", "IncluirRemessa", remessaPayload, acc.key, acc.secret);
      console.log(`[Omie PPV] ${idPPV} → IncluirRemessa resp:`, JSON.stringify(resp).slice(0, 200));
      // A resposta traz só { nCodRem, cCodIntRem }. Consulta pra pegar o número amigável.
      const nCodRem = Number(resp.nCodRem) || 0;
      numPedido = String(nCodRem || "");
      if (nCodRem) {
        try {
          const cr = await omieCall<Record<string, unknown>>("/produtos/remessa/", "ConsultarRemessa", { nCodRem }, acc.key, acc.secret);
          const cab = (cr?.cabec || cr?.cabecalho || {}) as Record<string, unknown>;
          const num = cab.nNumero || cab.numero || cab.cNumero;
          if (num) numPedido = String(num);
          console.log(`[Omie PPV] ${idPPV} → ConsultarRemessa cabec:`, JSON.stringify(cab).slice(0, 220));
        } catch (e) { console.warn(`[Omie PPV] ${idPPV} → ConsultarRemessa falhou: ${(e as Error).message}`); }
      }
    } else {
      // ── PEDIDO DE VENDA (/produtos/pedido/ IncluirPedido) ──
      const det = itens.map((it) => {
        const produtoObj: Record<string, unknown> = { codigo_produto: it.codigoProdutoOmie, quantidade: it.qtde, valor_unitario: it.preco };
        if (it.fiscal?.cfop) produtoObj.cfop = it.fiscal.cfop;
        return { ide: { codigo_item_integracao: it.codInt }, produto: produtoObj, ...(it.fiscal?.imposto ? { imposto: it.fiscal.imposto } : {}) };
      });
      const parc = montarParcelasOmie(detalhes.numParcelas || "30 dias", detalhes.previsaoFaturamento || "", totalPedido);
      const dep = detalhes.departamentos || [];
      const payload: Record<string, unknown> = {
        cabecalho: {
          codigo_pedido_integracao: `PV-${idPPV}`,
          codigo_cliente: nCodCli,
          data_previsao: dataPrevisao,
          etapa: "10",
          quantidade_itens: det.length,
          codigo_parcela: parc.codigo_parcela,
          qtde_parcelas: parc.qtde_parcelas,
          ...(detalhes.cenarioFiscal ? { codigo_cenario_impostos: detalhes.cenarioFiscal } : {}),
        },
        informacoes_adicionais: {
          codigo_categoria: detalhes.categoriaPedido || OMIE_COD_CATEG_VENDA,
          codigo_conta_corrente: detalhes.contaCorrente ? Number(detalhes.contaCorrente) : (acc.codCC || undefined),
          codVend: nCodVend || undefined,
          numero_contrato: detalhes.numContrato || idPPV,
          ...(detalhes.osId ? { numero_pedido_cliente: String(detalhes.osId) } : {}),
          consumidor_final: detalhes.consumoFinal ? "S" : "N",
          ...(detalhes.contato ? { contato: detalhes.contato } : {}),
        },
        observacoes: { obs_venda: obsVenda },
        det,
        ...(parc.lista_parcelas ? { lista_parcelas: parc.lista_parcelas } : {}),
        ...(dep.length > 0
          ? { departamentos: dep.map((d) => ({ cCodDepto: String(d.codigo), nPerc: d.perc, nValor: Math.round(totalPedido * d.perc) / 100, nValorFixo: "N" })) }
          : {}),
      };
      const resposta = await omieCall<{ numero_pedido?: string; codigo_pedido?: number }>(
        "/produtos/pedido/", "IncluirPedido", payload, acc.key, acc.secret,
      );
      numPedido = (resposta.numero_pedido || String(resposta.codigo_pedido || "")).trim();
    }

    console.log(`[Omie PPV] ${idPPV} → ${tipoLabel} nº ${numPedido} (${acc.name})`);

    // Atualiza PPV: salva pedido_omie + empresa + move pra fase "Enviado Omie".
    // Só vira "Concluída" depois de FATURADO (ver faturarPPVNoOmie). Não sobrescreve
    // se já estiver Concluída/Cancelada (evita "voltar" a fase por um reenvio).
    // Foi como remessa (OS interna)? O PPV VIRA "Remessa" no portal também —
    // é esse campo que as travas de faturamento leem ("Remessa não é faturada").
    const statusAtual = String(detalhes.status || "");
    const manter = ["Concluída", "Cancelada"].includes(statusAtual);
    await supabaseFetch(
      `${TBL_PEDIDOS}?id_pedido=eq.${idPPV}`,
      "PATCH",
      {
        pedido_omie: numPedido,
        omie_empresa: empresaNome,
        ...(isRemessa ? { Tipo_Pedido: "Remessa" } : {}),
        ...(manter ? {} : { status: "Enviado Omie" }),
      }
    );

    await registrarLog(idPPV, `${tipoLabel} Omie nº ${numPedido} criado (${acc.name}). Aguardando faturamento.`);

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

interface OmieDetItem {
  ide?: { codigo_item?: number; codigo_item_integracao?: string; simples_nacional?: string };
  produto?: {
    codigo_produto?: number; codigo?: string; descricao?: string; cfop?: string; ncm?: string;
    quantidade?: number; valor_unitario?: number; valor_total?: number; unidade?: string;
  };
  // Bloco fiscal cru do Omie (mantido inteiro pra reenviar sem perder campos).
  imposto?: Record<string, Record<string, unknown>>;
}

interface OmiePedidoConsulta {
  cabecalho?: { codigo_pedido?: number; numero_pedido?: string; etapa?: string; codigo_pedido_integracao?: string; codigo_cliente?: number };
  total_pedido?: { valor_total_pedido?: number; valor_mercadorias?: number };
  informacoes_adicionais?: { codigo_categoria?: string };
  det?: OmieDetItem[];
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
  const jaFaturado = !!cab.faturado_omie_em || (Number(etapa) >= Number(OMIE_ETAPA_FATURADO));
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
  pendente?: boolean; // faturamento acionado no Omie, mas NF-e ainda não autorizada
  aguardandoSefaz?: boolean; // faturado (Concluída), NF-e ainda em autorização na SEFAZ
  numeroPedido?: string;
  nfNumero?: string | null;
  etapa?: string;
  empresa?: string;
}

// Nº "limpo" da NF a partir do bloco ide da NF (sem zeros à esquerda).
function numeroNfDe(nf: Record<string, unknown> | null): string | undefined {
  const ide = (nf?.ide || {}) as Record<string, string>;
  const n = String(ide.nNF || "").replace(/^0+/, "");
  return n || (ide.nNF ? String(ide.nNF) : undefined);
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

  // Anti-duplicidade: se o pedido já está na etapa de faturamento (50), só é
  // "faturado" DE VERDADE se a NF-e existir. Etapa 50 SEM NF = emissão falhou /
  // pendente — NÃO marca faturado (era esse o bug: marcava sem checar a NF).
  const etapaAtual = String(pedido.cabecalho?.etapa || "");
  if (Number(etapaAtual) >= Number(OMIE_ETAPA_FATURADO)) {
    const nfExist = await buscarNFdoPedido(acc, Number(pedido.cabecalho?.codigo_pedido) || 0, Number(pedido.cabecalho?.codigo_cliente) || undefined, String(cab.faturado_omie_em || "") || undefined);
    if (nfExist) {
      const numeroNf = numeroNfDe(nfExist);
      await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}`, "PATCH", {
        faturado_omie_em: new Date().toISOString(), status: "Concluída", omie_empresa: acc.name, nf_numero: numeroNf || null,
      });
      return { sucesso: true, jaFaturado: true, numeroPedido: String(pedido.cabecalho?.numero_pedido || cab.pedido_omie || ""), etapa: etapaAtual, empresa: acc.name, nfNumero: numeroNf || null };
    }
    console.error(`[Omie PPV faturar] ${idPPV}: etapa ${etapaAtual} SEM NF-e — não marco faturado.`);
    return { sucesso: false, pendente: true, empresa: acc.name, erro: `O pedido está na etapa ${etapaAtual} (faturamento) no Omie, mas a NF-e não foi autorizada. Verifique o erro fiscal no Omie e reemita (ou volte o pedido pra etapa anterior e refature).` };
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

    // 2) FATURA de verdade: FaturarPedidoVenda no endpoint /produtos/pedidovendafat/.
    //    É ESTE método que roda o faturador e EMITE a NF-e (o TrocarEtapaPedido só
    //    mudava a fase, sem emitir). Precisa do nCodPed (código interno do pedido).
    const nCodPed = Number(pedido.cabecalho?.codigo_pedido) || 0;
    if (!nCodPed) return { sucesso: false, erro: "Não consegui o código interno do pedido no Omie (nCodPed) pra faturar.", empresa: acc.name };
    try {
      const resp = await omieCall<Record<string, unknown>>(
        "/produtos/pedidovendafat/", "FaturarPedidoVenda",
        { cCodIntPed: codInt, nCodPed }, acc.key, acc.secret,
      );
      console.log(`[Omie PPV faturar] ${idPPV}: FaturarPedidoVenda ->`, JSON.stringify(resp).slice(0, 250));
    } catch (e) {
      // Erro do faturador (fiscal, etc.) — devolve a mensagem crua do Omie.
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Omie PPV faturar] ${idPPV}: FaturarPedidoVenda FALHOU: ${msg}`);
      return { sucesso: false, empresa: acc.name, erro: `O Omie recusou o faturamento: ${msg}` };
    }

    // 3) FaturarPedidoVenda foi ACEITO → o Omie está emitindo. Marca "Concluída"
    //    JÁ (otimista) e tenta pegar o nº da NF numa consulta rápida (SEM poll
    //    longo, pra fechar o modal na hora). Se a SEFAZ ainda não devolveu o nº,
    //    fica "aguardando" e o número/DANFE são preenchidos depois (aba SEFAZ /
    //    botão Atualizar).
    const numeroPedido = String(pedido.cabecalho?.numero_pedido || cab.pedido_omie || "");
    const codigoClienteInterno = Number(pedido.cabecalho?.codigo_cliente) || undefined;
    const nf = await buscarNFdoPedido(acc, nCodPed, codigoClienteInterno); // 1 tentativa rápida
    const numeroNf = nf ? numeroNfDe(nf) : undefined;

    await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}`, "PATCH", {
      faturado_omie_em: new Date().toISOString(),
      status: "Concluída", // faturado = concluído (o auto-sync respeita "Concluída")
      categoria_faturamento: categoria || (pedido.informacoes_adicionais?.codigo_categoria || null),
      omie_empresa: acc.name,
      ...(numeroNf ? { nf_numero: numeroNf } : {}),
    });
    await registrarLog(idPPV, `Faturado no Omie (FaturarPedidoVenda) — pedido nº ${numeroPedido}${numeroNf ? `, NF-e ${numeroNf}` : " (NF-e em autorização na SEFAZ)"} (${acc.name}). PPV concluída.`);

    return { sucesso: true, numeroPedido, etapa: OMIE_ETAPA_FATURADO, empresa: acc.name, nfNumero: numeroNf || null, aguardandoSefaz: !numeroNf };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Omie PPV faturar] ${idPPV}: ${msg}`);
    return { sucesso: false, erro: msg, empresa: acc.name };
  }
}

// =============================================
// CANCELAMENTO DO PEDIDO DE VENDA
// Cancela o pedido no Omie (CancelarPedidoVenda no /produtos/pedidovendafat/) e
// marca a PPV como "Cancelada" com o motivo. Se o PPV nunca foi enviado ao Omie,
// só marca no portal. O motivo é obrigatório (pedido antes de tudo na UI).
// =============================================
export async function cancelarPedidoVendaOmie(
  idPPV: string, motivo: string, userName?: string,
): Promise<{ sucesso: boolean; erro?: string; empresa?: string }> {
  const mot = String(motivo || "").trim();
  if (!mot) return { sucesso: false, erro: "Informe o motivo do cancelamento." };

  const cab = await lerCabecalhoPPV(idPPV);
  if (!cab) return { sucesso: false, erro: "PPV não encontrado." };

  let empresa: string | undefined;
  // Se já existe no Omie, cancela lá primeiro (se falhar, NÃO marca cancelado aqui).
  if (cab.pedido_omie) {
    const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
    if (!achado) return { sucesso: false, erro: "Pedido não encontrado no Omie (ConsultarPedido)." };
    const { acc, pedido } = achado;
    empresa = acc.name;
    const nCodPed = Number(pedido.cabecalho?.codigo_pedido) || 0;
    if (!nCodPed) return { sucesso: false, empresa, erro: "Não consegui o código interno do pedido no Omie (nCodPed)." };
    try {
      const resp = await omieCall<Record<string, unknown>>(
        "/produtos/pedidovendafat/", "CancelarPedidoVenda",
        { cCodIntPed: codIntPV(idPPV), nCodPed }, acc.key, acc.secret,
      );
      console.log(`[Omie PPV cancelar] ${idPPV}: CancelarPedidoVenda ->`, JSON.stringify(resp).slice(0, 200));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[Omie PPV cancelar] ${idPPV}: CancelarPedidoVenda FALHOU: ${msg}`);
      return { sucesso: false, empresa, erro: `O Omie recusou o cancelamento: ${msg}` };
    }
  }

  // Marca a PPV como Cancelada no portal (com o motivo).
  await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}`, "PATCH", {
    status: "Cancelada", motivo_cancelamento: mot,
  });
  await registrarLog(idPPV, `Pedido cancelado${cab.pedido_omie ? " no Omie" : ""} — motivo: ${mot} (${userName || "?"}).`);
  return { sucesso: true, empresa };
}

// =============================================
// COMUNICAÇÃO COM A SEFAZ (aba do pedido faturado)
// A API do Omie NÃO expõe o log literal "Comunicação com a SEFAZ" da tela dele.
// O que dá pra ler é a NF-e via /produtos/nfconsultar/ ListarNF: nº, série,
// chave de acesso, emissão, ambiente, id interno (p/ DANFE) e a ligação com o
// pedido (compl.nIdPedido = cabecalho.codigo_pedido). A partir disso montamos
// uma linha do tempo de eventos no mesmo estilo do Omie. Cacheamos em
// pedidos.nf_sefaz (jsonb) pra não bater no Omie toda vez que a aba abre.
// =============================================

export interface EventoSefaz { data: string; hora: string; descricao: string; usuario: string; ok: boolean }
export interface ComunicacaoSefaz {
  faturado: boolean;
  semNF?: boolean;
  numero?: string; serie?: string; modelo?: string; chave?: string;
  nCodNF?: number; nIdPedido?: number; ambiente?: "producao" | "homologacao";
  emitidaEm?: string; canceladaEm?: string; denegada?: boolean;
  empresa?: string;
  eventos: EventoSefaz[];
  atualizadoEm?: string;
  erro?: string;
}

// Data DD/MM/YYYY a partir de uma referência ISO (ou agora) + offset em dias.
function brDataOffset(refISO: string | undefined, dias: number): string {
  const base = refISO ? new Date(refISO) : new Date();
  const d = new Date(base.getTime() + dias * 86400000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

// Acha a NF-e do pedido (por compl.nIdPedido). ATENÇÃO: o ListarNF devolve da NF
// mais ANTIGA pra mais nova — sem filtro, a página 1 traz notas de anos atrás.
// Por isso filtramos por uma JANELA de data (ao redor do faturamento) + cliente.
async function buscarNFdoPedido(acc: OmieAccount, codigoPedido: number, codigoCliente?: number, refDataISO?: string): Promise<Record<string, unknown> | null> {
  const param: Record<string, unknown> = {
    pagina: 1, registros_por_pagina: 100, tpNF: 1, apenas_importado_api: "N",
    dEmiInicial: brDataOffset(refDataISO, -7), dEmiFinal: brDataOffset(refDataISO, +3),
  };
  if (codigoCliente) param.nIdCliente = codigoCliente; // filtra pelo cliente (bem menos NFs)
  try {
    const r = await omieCall<Record<string, unknown>>("/produtos/nfconsultar/", "ListarNF", param, acc.key, acc.secret);
    const lista = (r?.nfCadastro || r?.nf_cadastro || r?.nota_fiscal || r?.lista || r?.cadastros || []) as Record<string, unknown>[];
    const achada = lista.find((nf) => Number((nf?.compl as Record<string, unknown>)?.nIdPedido) === Number(codigoPedido));
    return achada || null;
  } catch (e) {
    console.error(`[Omie SEFAZ] ListarNF (${acc.name}, pedido ${codigoPedido}): ${(e as Error).message}`);
    return null;
  }
}

function montarComunicacao(nf: Record<string, unknown>, empresa: string): ComunicacaoSefaz {
  const ide = (nf.ide || {}) as Record<string, string>;
  const compl = (nf.compl || {}) as Record<string, unknown>;
  const info = (nf.info || {}) as Record<string, string>;
  const numero = String(ide.nNF || "").replace(/^0+/, "") || String(ide.nNF || "");
  const serie = String(ide.serie || "");
  const chave = String(compl.cChaveNFe || "");
  const denegada = String(ide.cDeneg || "N") === "S";
  const ambiente: "producao" | "homologacao" = String(ide.tpAmb) === "1" ? "producao" : "homologacao";
  const usuario = "Integração";
  const eventos: EventoSefaz[] = [];

  // Emissão da NF-e
  if (ide.dEmi) eventos.push({ data: ide.dEmi, hora: ide.hEmi || "", descricao: `NF-e ${numero} emitida (série ${serie}, modelo ${ide.mod || "55"}).`, usuario, ok: true });
  // Autorização (implícita: tem chave de acesso e não foi denegada)
  if (chave && !denegada) eventos.push({ data: ide.dReg || info.dInc || ide.dEmi || "", hora: info.hInc || ide.hEmi || "", descricao: `NF-e ${numero} autorizada. Chave: ${chave}`, usuario, ok: true });
  if (denegada) eventos.push({ data: ide.dReg || ide.dEmi || "", hora: ide.hEmi || "", descricao: `NF-e ${numero} DENEGADA pela SEFAZ.`, usuario, ok: false });
  // Cancelamento (só quando há indício real de cancelamento)
  const cancelada = String(ide.dCan || "") && String(nf.nfStatus || "").toUpperCase().includes("CANCEL");
  if (cancelada) eventos.push({ data: String(ide.dCan), hora: "", descricao: `NF-e ${numero} cancelada.`, usuario, ok: false });
  // Aviso de ambiente de teste (homologação não vale fiscalmente)
  if (ambiente === "homologacao") eventos.push({ data: ide.dEmi || "", hora: ide.hEmi || "", descricao: "Emitida em ambiente de HOMOLOGAÇÃO (teste — sem valor fiscal).", usuario, ok: false });

  // Ordena por data+hora desc (mais recente no topo, como o Omie)
  const chaveOrd = (e: EventoSefaz) => {
    const [d, m, a] = (e.data || "").split("/");
    return `${a || "0000"}${m || "00"}${d || "00"}${(e.hora || "").replace(/\D/g, "")}`;
  };
  eventos.sort((x, y) => chaveOrd(y).localeCompare(chaveOrd(x)));

  return {
    faturado: true,
    numero, serie, modelo: String(ide.mod || "55"), chave,
    nCodNF: Number(compl.nIdNF) || undefined, nIdPedido: Number(compl.nIdPedido) || undefined,
    ambiente, emitidaEm: ide.dEmi ? `${ide.dEmi} ${ide.hEmi || ""}`.trim() : undefined,
    canceladaEm: cancelada ? String(ide.dCan) : undefined, denegada,
    empresa, eventos, atualizadoEm: new Date().toISOString(),
  };
}

// Retorna a comunicação com a SEFAZ do PPV. Cache-first (pedidos.nf_sefaz);
// com refresh=true (ou sem cache) consulta o Omie e regrava o cache.
export async function obterComunicacaoSefaz(idPPV: string, opts: { refresh?: boolean } = {}): Promise<ComunicacaoSefaz> {
  // Cache-first. Se a coluna nf_sefaz ainda não existe (SQL não rodado), o select
  // com nf_sefaz dá 400 — nesse caso refaz SEM a coluna e segue (sem cache).
  const base = `id_pedido,pedido_omie,omie_empresa,faturado_omie_em,Tipo_Pedido`;
  let temColunaCache = true;
  let rows: Record<string, unknown>[] | null = null;
  try {
    rows = await supabaseFetch<Record<string, unknown>[]>(
      `${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}&select=${base},nf_sefaz&limit=1`,
    );
  } catch (e) {
    if (/nf_sefaz/.test((e as Error).message)) {
      temColunaCache = false;
      console.warn(`[Omie SEFAZ] coluna nf_sefaz ausente — rode sql/ppv-nf-sefaz.sql (segue sem cache).`);
      rows = await supabaseFetch<Record<string, unknown>[]>(
        `${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}&select=${base}&limit=1`,
      );
    } else { throw e; }
  }
  const cab = rows?.[0];
  if (!cab) return { faturado: false, eventos: [], erro: "PPV não encontrado." };
  if (!cab.pedido_omie) return { faturado: false, eventos: [], erro: "Este PPV ainda não foi enviado ao Omie." };

  if (!opts.refresh && cab.nf_sefaz && typeof cab.nf_sefaz === "object") {
    return cab.nf_sefaz as unknown as ComunicacaoSefaz;
  }

  const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
  if (!achado) return { faturado: false, eventos: [], erro: "Pedido não encontrado no Omie (ConsultarPedido)." };
  const { acc, pedido } = achado;
  const etapa = String(pedido.cabecalho?.etapa || "");
  const faturado = Number(etapa) >= Number(OMIE_ETAPA_FATURADO) || !!cab.faturado_omie_em;
  const codigoPedido = Number(pedido.cabecalho?.codigo_pedido) || 0;
  const codigoCliente = Number(pedido.cabecalho?.codigo_cliente) || undefined;

  if (!faturado) return { faturado: false, semNF: true, empresa: acc.name, eventos: [] };

  const nf = codigoPedido ? await buscarNFdoPedido(acc, codigoPedido, codigoCliente, String(cab.faturado_omie_em || "") || undefined) : null;
  if (!nf) {
    const semNF: ComunicacaoSefaz = { faturado: true, semNF: true, empresa: acc.name, eventos: [], atualizadoEm: new Date().toISOString(), erro: "Faturado, mas não localizei a NF-e no Omie (ListarNF)." };
    return semNF;
  }

  const com = montarComunicacao(nf, acc.name);
  // Cacheia — best-effort. Se a coluna nf_sefaz não existe, grava só o nf_numero.
  try {
    await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}`, "PATCH",
      temColunaCache ? { nf_sefaz: com, nf_numero: com.numero || null } : { nf_numero: com.numero || null },
    );
  } catch (e) {
    console.error(`[Omie SEFAZ] cache nf_sefaz (${idPPV}): ${(e as Error).message}`);
  }
  return com;
}

// URL temporária do DANFE (PDF) a partir do nCodNF (compl.nIdNF).
export async function obterUrlDanfePPV(idPPV: string): Promise<{ url: string } | { erro: string }> {
  const com = await obterComunicacaoSefaz(idPPV);
  if (!com.nCodNF) return { erro: com.erro || "Sem NF-e para gerar o DANFE." };
  const achado = await resolverContaDoPedido(idPPV, com.empresa || null);
  if (!achado) return { erro: "Pedido não encontrado no Omie." };
  try {
    const r = await omieCall<Record<string, unknown>>("/produtos/notafiscalutil/", "GetUrlDanfe", { nCodNF: com.nCodNF }, achado.acc.key, achado.acc.secret);
    const url = (r?.cUrlDanfe || r?.cUrlDANFE || r?.url) as string | undefined;
    if (!url) return { erro: "Omie não retornou a URL do DANFE." };
    return { url: String(url) };
  } catch (e) {
    console.error(`[Omie SEFAZ] GetUrlDanfe (${idPPV}): ${(e as Error).message}`);
    return { erro: (e as Error).message };
  }
}

// Detecta se o pedido já foi FATURADO no Omie (etapa >= 60), mesmo que o
// faturamento tenha sido feito direto no Omie (fora do portal). Se sim, marca a
// PPV como "Concluída" + grava a NF. Usado ao abrir um pedido "Enviado Omie".
export async function sincronizarFaturamentoPPV(idPPV: string): Promise<{ faturado: boolean; numero?: string }> {
  const cab = await lerCabecalhoPPV(idPPV);
  if (!cab || !cab.pedido_omie) return { faturado: false };
  if (cab.faturado_omie_em) return { faturado: true };
  if (String(cab.Tipo_Pedido || "") === "Remessa") return { faturado: false };
  const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
  if (!achado) return { faturado: false };
  const etapa = String(achado.pedido.cabecalho?.etapa || "");
  if (Number(etapa) < Number(OMIE_ETAPA_FATURADO)) return { faturado: false }; // ainda não faturado
  const codPed = Number(achado.pedido.cabecalho?.codigo_pedido) || 0;
  const codCli = Number(achado.pedido.cabecalho?.codigo_cliente) || undefined;
  const nf = codPed ? await buscarNFdoPedido(achado.acc, codPed, codCli) : null;
  const numeroNf = nf ? numeroNfDe(nf) : undefined;
  await supabaseFetch(`${TBL_PEDIDOS}?id_pedido=eq.${encodeURIComponent(idPPV)}`, "PATCH", {
    faturado_omie_em: new Date().toISOString(), status: "Concluída", omie_empresa: achado.acc.name,
    ...(numeroNf ? { nf_numero: numeroNf } : {}),
  });
  await registrarLog(idPPV, `Faturamento detectado no Omie (etapa ${etapa}${numeroNf ? `, NF-e ${numeroNf}` : ""}) — marcado como Faturado.`);
  return { faturado: true, numero: numeroNf };
}

// PDF do PEDIDO DE VENDA no Omie (o documento do pedido, não a NF-e).
// /produtos/dfedocs/ ObterPedVenda { nIdPed } → cPdfPed.
export async function obterPdfPedidoOmie(idPPV: string): Promise<{ url: string } | { erro: string }> {
  const cab = await lerCabecalhoPPV(idPPV);
  if (!cab) return { erro: "PPV não encontrado." };
  if (!cab.pedido_omie) return { erro: "Este PPV ainda não foi enviado ao Omie." };
  const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
  if (!achado) return { erro: "Pedido não encontrado no Omie (ConsultarPedido)." };
  const nIdPed = Number(achado.pedido.cabecalho?.codigo_pedido) || 0;
  if (!nIdPed) return { erro: "Não consegui o código interno do pedido (nIdPed)." };
  try {
    const r = await omieCall<Record<string, unknown>>("/produtos/dfedocs/", "ObterPedVenda", { nIdPed }, achado.acc.key, achado.acc.secret);
    const url = String(r?.cPdfPed || "");
    if (!url) return { erro: "O Omie não retornou o PDF do pedido de venda." };
    return { url };
  } catch (e) {
    console.error(`[Omie PDF pedido] ${idPPV}: ${(e as Error).message}`);
    return { erro: (e as Error).message };
  }
}

// =============================================
// EDITOR FISCAL POR ITEM ("Item de Orçamento")
// Lê (ConsultarPedido) e escreve (AlterarPedidoVenda) o bloco `imposto` de cada
// item do Pedido de Venda. Os nomes dos campos foram confirmados contra um
// pedido real do Omie (PV 7505): ICMS cod_sit_trib_icms/origem_icms/..., IPI
// cod_sit_trib_ipi/enquadramento_ipi, PIS pis_padrao.*, COFINS cofins_padrao.*.
// A escrita só é permitida ANTES de faturar (etapa < 50) — depois o Omie trava.
// =============================================

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};
const str = (v: unknown): string => (v == null ? "" : String(v));

// Um bloco fiscal do item, normalizado pro que a tela edita (nomes amigáveis).
export interface ItemFiscal {
  codigoItem: number;              // ide.codigo_item (id Omie do item)
  codigoItemIntegracao: string;    // ide.codigo_item_integracao (ex: PPV-0385-1)
  codigoProduto: number;
  codigo: string;                  // SKU
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
  cfop: string;
  ncm: string;
  unidade: string;
  icms: { cst: string; origem: string; modalidade: string; aliquota: number; base: number; percRedBase: number; valor: number };
  icmsSt: { cst: string; modalidade: string; aliquota: number; aliqOpProp: number; base: number; margem: number; percRedBaseOp: number; percRedBaseSt: number; cest: string; valor: number };
  ipi: { cst: string; enquadramento: string; aliquota: number; base: number; valor: number };
  pis: { cst: string; aliquota: number; base: number; valor: number };
  cofins: { cst: string; aliquota: number; base: number; valor: number };
}

function mapImpostoParaItem(d: OmieDetItem): ItemFiscal {
  const imp = d.imposto || {};
  const icms = imp.icms || {};
  const icmsSt = imp.icms_st || {};
  const ipi = imp.ipi || {};
  const pis = imp.pis_padrao || {};
  const cofins = imp.cofins_padrao || {};
  const p = d.produto || {};
  return {
    codigoItem: num(d.ide?.codigo_item),
    codigoItemIntegracao: str(d.ide?.codigo_item_integracao),
    codigoProduto: num(p.codigo_produto),
    codigo: str(p.codigo),
    descricao: str(p.descricao),
    quantidade: num(p.quantidade),
    valorUnitario: num(p.valor_unitario),
    valorTotal: num(p.valor_total),
    cfop: str(p.cfop),
    ncm: str(p.ncm),
    unidade: str(p.unidade),
    icms: {
      cst: str(icms.cod_sit_trib_icms), origem: str(icms.origem_icms), modalidade: str(icms.modalidade_icms),
      aliquota: num(icms.aliq_icms), base: num(icms.base_icms), percRedBase: num(icms.perc_red_base_icms), valor: num(icms.valor_icms),
    },
    icmsSt: {
      cst: str(icmsSt.cod_sit_trib_icms_st), modalidade: str(icmsSt.modalidade_icms_st), aliquota: num(icmsSt.aliq_icms_st),
      aliqOpProp: num(icmsSt.aliq_icms_opprop), base: num(icmsSt.base_icms_st), margem: num(icmsSt.margem_icms_st),
      percRedBaseOp: num(icmsSt.perc_red_base_icms_op), percRedBaseSt: num(icmsSt.perc_red_base_icms_st), cest: str(icmsSt.cest), valor: num(icmsSt.valor_icms_st),
    },
    ipi: { cst: str(ipi.cod_sit_trib_ipi), enquadramento: str(ipi.enquadramento_ipi), aliquota: num(ipi.aliq_ipi), base: num(ipi.base_ipi), valor: num(ipi.valor_ipi) },
    pis: { cst: str(pis.cod_sit_trib_pis), aliquota: num(pis.aliq_pis), base: num(pis.base_pis), valor: num(pis.valor_pis) },
    cofins: { cst: str(cofins.cod_sit_trib_cofins), aliquota: num(cofins.aliq_cofins), base: num(cofins.base_cofins), valor: num(cofins.valor_cofins) },
  };
}

export interface ConsultaItensFiscais {
  ok: boolean;
  erro?: string;
  empresa?: string;
  etapa?: string;
  jaFaturado?: boolean;
  itens?: ItemFiscal[];
}

// LEITURA (segura, não altera nada): itens + bloco fiscal de cada um.
export async function consultarItensFiscaisPPV(idPPV: string): Promise<ConsultaItensFiscais> {
  const cab = await lerCabecalhoPPV(idPPV);
  if (!cab) return { ok: false, erro: "PPV não encontrado." };
  if (!cab.pedido_omie) return { ok: false, erro: "Este PPV ainda não foi enviado ao Omie (envie antes de editar os impostos)." };

  const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
  if (!achado) {
    console.error(`[Omie fiscal] ${idPPV}: pedido não encontrado no Omie (ConsultarPedido) — empresa salva: ${cab.omie_empresa || "?"}`);
    return { ok: false, erro: "Pedido não encontrado no Omie (ConsultarPedido)." };
  }
  const { acc, pedido } = achado;
  const etapa = str(pedido.cabecalho?.etapa);
  const jaFaturado = !!cab.faturado_omie_em || (Number(etapa) >= Number(OMIE_ETAPA_FATURADO));
  const itens = (pedido.det || []).map(mapImpostoParaItem);
  console.log(`[Omie fiscal] ${idPPV}: ${itens.length} item(ns) lido(s) da conta ${acc.name}, etapa ${etapa}${jaFaturado ? " (já faturado)" : ""}.`);
  return { ok: true, empresa: acc.name, etapa, jaFaturado, itens };
}

// Patch fiscal vindo da tela (nomes amigáveis; só o que mudou).
export interface PatchFiscalItem {
  cfop?: string;
  icms?: Partial<{ cst: string; origem: string; modalidade: string; aliquota: number; base: number; percRedBase: number }>;
  icmsSt?: Partial<{ cst: string; modalidade: string; aliquota: number; aliqOpProp: number; base: number; margem: number; percRedBaseOp: number; percRedBaseSt: number; cest: string }>;
  ipi?: Partial<{ cst: string; enquadramento: string; aliquota: number; base: number }>;
  pis?: Partial<{ cst: string; aliquota: number; base: number }>;
  cofins?: Partial<{ cst: string; aliquota: number; base: number }>;
}

// Aplica o patch (nomes amigáveis) sobre o bloco `imposto` CRU do Omie, sem
// perder nenhum campo que já existia (só sobrescreve os editados).
function aplicarPatchNoImpostoCru(impostoCru: Record<string, Record<string, unknown>>, patch: PatchFiscalItem): Record<string, Record<string, unknown>> {
  const imp: Record<string, Record<string, unknown>> = { ...impostoCru };
  const setar = (bloco: string, campo: string, valor: unknown) => {
    if (valor === undefined) return;
    imp[bloco] = { ...(imp[bloco] || {}), [campo]: valor };
  };
  if (patch.icms) {
    setar("icms", "cod_sit_trib_icms", patch.icms.cst);
    setar("icms", "origem_icms", patch.icms.origem);
    setar("icms", "modalidade_icms", patch.icms.modalidade);
    setar("icms", "aliq_icms", patch.icms.aliquota);
    setar("icms", "base_icms", patch.icms.base);
    setar("icms", "perc_red_base_icms", patch.icms.percRedBase);
  }
  if (patch.icmsSt) {
    setar("icms_st", "cod_sit_trib_icms_st", patch.icmsSt.cst);
    setar("icms_st", "modalidade_icms_st", patch.icmsSt.modalidade);
    setar("icms_st", "aliq_icms_st", patch.icmsSt.aliquota);
    setar("icms_st", "aliq_icms_opprop", patch.icmsSt.aliqOpProp);
    setar("icms_st", "base_icms_st", patch.icmsSt.base);
    setar("icms_st", "margem_icms_st", patch.icmsSt.margem);
    setar("icms_st", "perc_red_base_icms_op", patch.icmsSt.percRedBaseOp);
    setar("icms_st", "perc_red_base_icms_st", patch.icmsSt.percRedBaseSt);
    setar("icms_st", "cest", patch.icmsSt.cest);
  }
  if (patch.ipi) {
    setar("ipi", "cod_sit_trib_ipi", patch.ipi.cst);
    setar("ipi", "enquadramento_ipi", patch.ipi.enquadramento);
    setar("ipi", "aliq_ipi", patch.ipi.aliquota);
    setar("ipi", "base_ipi", patch.ipi.base);
  }
  if (patch.pis) {
    setar("pis_padrao", "cod_sit_trib_pis", patch.pis.cst);
    setar("pis_padrao", "aliq_pis", patch.pis.aliquota);
    setar("pis_padrao", "base_pis", patch.pis.base);
  }
  if (patch.cofins) {
    setar("cofins_padrao", "cod_sit_trib_cofins", patch.cofins.cst);
    setar("cofins_padrao", "aliq_cofins", patch.cofins.aliquota);
    setar("cofins_padrao", "base_cofins", patch.cofins.base);
  }
  return imp;
}

export interface ResultadoAlterarFiscal { ok: boolean; erro?: string; empresa?: string }

// ESCRITA: altera o bloco fiscal de UM item, preservando todos os outros itens e
// todos os campos não editados. Reenvia o `det` INTEIRO (cada item com ide +
// produto + imposto cru) pra AlterarPedidoVenda não apagar itens.
// ⚠️ SÓ funciona antes de faturar (etapa < 50). Emite log detalhado em cada passo.
export async function alterarItemFiscalPPV(
  idPPV: string,
  codigoItemIntegracao: string,
  patch: PatchFiscalItem,
): Promise<ResultadoAlterarFiscal> {
  const cab = await lerCabecalhoPPV(idPPV);
  if (!cab) return { ok: false, erro: "PPV não encontrado." };
  if (!cab.pedido_omie) return { ok: false, erro: "Este PPV ainda não foi enviado ao Omie." };
  if (cab.faturado_omie_em) return { ok: false, erro: "Pedido já faturado — impostos não podem mais ser alterados." };

  const achado = await resolverContaDoPedido(idPPV, cab.omie_empresa as string | null);
  if (!achado) return { ok: false, erro: "Pedido não encontrado no Omie (ConsultarPedido)." };
  const { acc, pedido } = achado;
  const codInt = codIntPV(idPPV);

  const etapa = str(pedido.cabecalho?.etapa);
  if (Number(etapa) >= Number(OMIE_ETAPA_FATURADO)) {
    console.error(`[Omie fiscal alterar] ${idPPV}: pedido na etapa ${etapa} (faturado) — bloqueado.`);
    return { ok: false, erro: `Pedido já está na etapa ${etapa} (faturado). Impostos não podem ser alterados.`, empresa: acc.name };
  }

  const det = pedido.det || [];
  // Casa por código de integração, id do item, OU código (SKU) do produto — assim
  // dá pra empurrar a alteração passando só o SKU (fluxo do produto_fiscal).
  const idAlvo = codigoItemIntegracao.trim().toUpperCase();
  const alvo = det.find((d) =>
    str(d.ide?.codigo_item_integracao) === codigoItemIntegracao ||
    String(d.ide?.codigo_item) === codigoItemIntegracao ||
    str(d.produto?.codigo).trim().toUpperCase() === idAlvo,
  );
  if (!alvo) {
    console.error(`[Omie fiscal alterar] ${idPPV}: item "${codigoItemIntegracao}" não encontrado no pedido (${det.length} itens).`);
    return { ok: false, erro: `Item ${codigoItemIntegracao} não encontrado no pedido.`, empresa: acc.name };
  }

  // Reconstrói o det inteiro: item alvo com o patch aplicado no imposto cru; os
  // demais com o imposto cru original. Mantém ide + produto de todos.
  const detNovo = det.map((d) => {
    const ehAlvo = d === alvo;
    const impostoCru = d.imposto || {};
    const imposto = ehAlvo ? aplicarPatchNoImpostoCru(impostoCru, patch) : impostoCru;
    const produto: Record<string, unknown> = {
      codigo_produto: d.produto?.codigo_produto,
      quantidade: d.produto?.quantidade,
      valor_unitario: d.produto?.valor_unitario,
    };
    if (ehAlvo && patch.cfop !== undefined) produto.cfop = patch.cfop;
    else if (d.produto?.cfop) produto.cfop = d.produto.cfop;
    return {
      ide: { codigo_item_integracao: str(d.ide?.codigo_item_integracao) || undefined, codigo_item: d.ide?.codigo_item },
      produto,
      imposto,
    };
  });

  try {
    console.log(`[Omie fiscal alterar] ${idPPV}: alterando item "${codigoItemIntegracao}" (${acc.name}). Campos: ${JSON.stringify(patch)}`);
    await omieCall(
      "/produtos/pedido/",
      "AlterarPedidoVenda",
      { cabecalho: { codigo_pedido_integracao: codInt }, det: detNovo },
      acc.key,
      acc.secret,
    );
    await registrarLog(idPPV, `Impostos do item ${codigoItemIntegracao} alterados no Omie (${acc.name}).`);
    console.log(`[Omie fiscal alterar] ${idPPV}: item "${codigoItemIntegracao}" alterado com sucesso.`);
    return { ok: true, empresa: acc.name };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Omie fiscal alterar] ${idPPV}: FALHA ao alterar item "${codigoItemIntegracao}" — ${msg}`);
    return { ok: false, erro: msg, empresa: acc.name };
  }
}
