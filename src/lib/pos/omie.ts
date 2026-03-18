import { supabase } from "./supabase";
import { TBL_OS, TBL_CLIENTES, TBL_ITENS, TBL_PEDIDOS, TBL_LOGS_PPV, VALOR_HORA, VALOR_KM } from "./constants";

// --- Credenciais ---
const OMIE_APP_KEY = process.env.OMIE_APP_KEY || "";
const OMIE_APP_SECRET = process.env.OMIE_APP_SECRET || "";
const OMIE_BASE_URL = "https://app.omie.com.br/api/v1";

// --- Constantes Omie ---
const OMIE_ETAPA_EXECUTADA = "30";
const OMIE_COD_CATEG = "1.01.02";
const OMIE_COD_CATEG_VENDA = "1.01.03";
const OMIE_COD_CC = 1969919780; // Banco do Brasil
const OMIE_NCODSERV_HORA = 1979758762; // Hora Trabalhada (R$193/h)
const OMIE_NCODSERV_KM = 1975974257; // KM Deslocamento (R$2,80/km)
const OMIE_NCODSERV_SOL = 2209673817; // Solicitação de Serviço (sol.aber.os)

// Mapa: código Omie (ex: "rev6075.2400") → nCodServ
const REVISAO_OMIE: Record<string, number> = {
  "rev2025.50": 1975765598, "rev2025.300": 1975809873, "rev2025.600": 1979659454,
  "rev2025.900": 1979659456, "rev2025.1200": 1979659458, "rev2025.1500": 1979659460,
  "rev2025.1800": 1979659462, "rev2025.2100": 1979659464, "rev2025.2400": 1979659466,
  "rev2025.2700": 1979659468, "rev2025.3000": 1979659470,
  "rev5050.50": 1995487664, "rev5050.300": 1995487673, "rev5050.600": 1995487682,
  "rev5050.900": 1995487684, "rev5050.1200": 1995487686, "rev5050.1500": 1995487689,
  "rev5050.1800": 1995487692, "rev5050.2100": 1995487695, "rev5050.2400": 1995487697,
  "rev5050.2700": 1995487699, "rev5050.3000": 1995487701,
  "rev6060.50": 1979738298, "rev6060.300": 1979738300, "rev6060.600": 1979738302,
  "rev6060.900": 1979738304, "rev6060.1200": 1979738306, "rev6060.1500": 1979738308,
  "rev6060.1800": 1979738310, "rev6060.2100": 1979738312, "rev6060.2400": 1979738316,
  "rev6060.2700": 1979738321, "rev6060.3000": 1979738323,
  "rev6065.50": 1995487703, "rev6065.300": 1995487705, "rev6065.600": 1995487713,
  "rev6065.900": 1995487716, "rev6065.1200": 1995487719, "rev6065.1500": 1995487722,
  "rev6065.1800": 1995487725, "rev6065.2100": 1995487728, "rev6065.2400": 1995487730,
  "rev6065.2700": 1995487732, "rev6065.3000": 1995487734,
  "rev6075.50": 1979723306, "rev6075.300": 1979723309, "rev6075.600": 1979723311,
  "rev6075.900": 1979723313, "rev6075.1200": 1979723315, "rev6075.1500": 1979723317,
  "rev6075.1800": 1979723320, "rev6075.2100": 1979723327, "rev6075.2400": 1979723329,
  "rev6075.2700": 1979723333, "rev6075.3000": 1979723335,
  "rev8000.50": 1995487736, "rev8000.300": 1995487741, "rev8000.600": 1995487745,
  "rev8000.900": 1995487747, "rev8000.1200": 1995487749, "rev8000.1500": 1995487751,
  "rev8000.1800": 1995487754, "rev8000.2100": 1995487756, "rev8000.2400": 1995487758,
  "rev8000.2700": 1995487760, "rev8000.3000": 1995487762,
  "rev9200.50": 1995487765, "rev9200.300": 1995487767, "rev9200.600": 1995487770,
  "rev9200.900": 1995487773, "rev9200.1200": 1995487777, "rev9200.1500": 1995487780,
  "rev9200.1800": 1995487783, "rev9200.2100": 1995487785, "rev9200.2400": 1995487787,
  "rev9200.2700": 1995487789, "rev9200.3000": 1995487791,
  "rev9500.50": 1979723337, "rev9500.300": 1979723339, "rev9500.600": 1979723341,
  "rev9500.900": 1979723343, "rev9500.1200": 1979723345, "rev9500.1500": 1979723347,
  "rev9500.1800": 1979723349, "rev9500.2100": 1979723351, "rev9500.2400": 1979723353,
  "rev9500.2700": 1979723355, "rev9500.3000": 1979723357,
  "rev86110.100": 1995487793, "rev86110.300": 1995487796, "rev86110.600": 1995487798,
  "rev86110.900": 1995487800, "rev86110.1200": 1995487803, "rev86110.1500": 1995487805,
  "rev86110.1800": 1995487808,
};

// Modelos conhecidos (em ordem de especificidade para match)
const MODELOS_CONHECIDOS = ["86-110", "9500", "9200", "8000", "6075", "6065", "6060", "5050"];

/** Extrai horas e modelo da descrição de revisão e retorna o nCodServ do Omie */
function buscarServicoRevisao(revisao: string, projeto: string): number | null {
  // Extrai horas: "Revisão de 2400 horas ..." → 2400
  const matchHoras = revisao.match(/(\d+)\s*horas/i);
  if (!matchHoras) return null;
  const horas = matchHoras[1];

  // Tenta achar modelo na revisão ou no projeto
  const textoCompleto = `${revisao} ${projeto}`.toLowerCase();
  let modelo = "";
  for (const m of MODELOS_CONHECIDOS) {
    if (textoCompleto.includes(m.toLowerCase())) { modelo = m; break; }
  }

  // Se não achou modelo específico, usa "2025" (genérico)
  if (!modelo) modelo = "2025";

  // Monta chave e busca: ex "rev6075.2400"
  const chave = `rev${modelo}.${horas}`;
  return REVISAO_OMIE[chave] || null;
}

// --- Tipos ---
interface ServicoItem {
  nCodServico: number;
  nQtde: number;
  nValUnit: number;
  nValorDesconto?: number;
  cDescServ?: string;
}

interface OmieOSResponse {
  cNumOS: string;
  nCodOS: number;
  cStatus: string;
}

// --- Client genérico ---
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

  const data = await response.json();

  if (data?.faultstring) {
    throw new Error(`Omie [${data.faultcode}]: ${data.faultstring}`);
  }

  if (response.status === 429) {
    console.warn("Rate limit Omie — aguardando 60s...");
    await new Promise((r) => setTimeout(r, 60000));
    return omieCall(endpoint, call, param);
  }

  return data as T;
}

// --- Helpers ---
function normalizarCnpj(cnpj: string): string {
  return cnpj.replace(/\D/g, "");
}

function formatarDataOmie(dataIso: string): string {
  // "2026-01-14" → "14/01/2026"
  const [ano, mes, dia] = dataIso.split("T")[0].split("-");
  return `${dia}/${mes}/${ano}`;
}

function toNum(val: unknown, fallback = 0): number {
  if (!val) return fallback;
  const n = parseFloat(String(val));
  return isNaN(n) ? fallback : n;
}

// --- Lookup de cliente ---
const cacheClientes = new Map<string, number>();

async function buscarNcodCli(cnpj: string): Promise<{ nCodCli: number; email: string }> {
  const cnpjNorm = normalizarCnpj(cnpj);

  // Tenta buscar na tabela Clientes do Supabase (campo id_omie + email)
  const { data } = await supabase
    .from(TBL_CLIENTES)
    .select("id_omie, cnpj_cpf, email")
    .ilike("cnpj_cpf", `%${cnpjNorm.substring(0, 8)}%`)
    .limit(1);

  if (data && data.length > 0 && data[0].id_omie) {
    return { nCodCli: data[0].id_omie, email: data[0].email || "" };
  }

  // Fallback: busca direto na API Omie
  const result = await omieCall<{ clientes_cadastro?: Array<{ codigo_cliente_omie: number; email?: string }> }>(
    "/geral/clientes/",
    "ListarClientes",
    { pagina: 1, registros_por_pagina: 1, clientesFiltro: { cnpj_cpf: cnpj } }
  );

  const cliente = result?.clientes_cadastro?.[0];
  if (!cliente?.codigo_cliente_omie) {
    throw new Error(`Cliente não encontrado no Omie para CNPJ: ${cnpj}`);
  }

  return { nCodCli: cliente.codigo_cliente_omie, email: cliente.email || "" };
}

// --- Lookup de projeto ---
const cacheProjetos = new Map<string, number>();

async function buscarNcodProj(projeto: string): Promise<number> {
  if (!projeto) return 0;
  const projetoNorm = projeto.trim();
  if (cacheProjetos.has(projetoNorm)) return cacheProjetos.get(projetoNorm)!;

  // Busca na API Omie pelo nome do projeto
  // Busca paginada — percorre até achar match por nome
  let pagina = 1;
  const porPagina = 50;
  let totalPaginas = 1;

  while (pagina <= totalPaginas) {
    const result = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string }>;
      total_de_paginas?: number;
    }>("/geral/projetos/", "ListarProjetos", {
      pagina,
      registros_por_pagina: porPagina,
    });

    if (pagina === 1 && result.total_de_paginas) {
      totalPaginas = result.total_de_paginas;
    }

    const projetos = result.cadastro || [];
    for (const p of projetos) {
      if (
        p.nome === projetoNorm ||
        p.nome.includes(projetoNorm) ||
        projetoNorm.includes(p.nome)
      ) {
        cacheProjetos.set(projetoNorm, p.codigo);
        return p.codigo;
      }
    }
    pagina++;
  }

  console.warn(`[Omie] Projeto não encontrado: ${projetoNorm}`);
  return 0;
}

// --- Lookup de vendedor (técnico) ---
const cacheVendedores = new Map<string, number>();
let listaVendedores: Array<{ codigo: number; nome: string }> | null = null;

async function carregarVendedores(): Promise<Array<{ codigo: number; nome: string }>> {
  if (listaVendedores) return listaVendedores;
  listaVendedores = [];
  let pagina = 1;
  let totalPaginas = 1;
  while (pagina <= totalPaginas) {
    const result = await omieCall<{
      cadastro?: Array<{ codigo: number; nome: string; inativo: string }>;
      total_de_paginas?: number;
    }>("/geral/vendedores/", "ListarVendedores", {
      pagina,
      registros_por_pagina: 50,
    });
    if (pagina === 1 && result.total_de_paginas) totalPaginas = result.total_de_paginas;
    for (const v of result.cadastro || []) {
      if (v.inativo !== "S") listaVendedores.push({ codigo: v.codigo, nome: v.nome });
    }
    pagina++;
  }
  return listaVendedores;
}

async function buscarNcodVend(tecnico1: string, tecnico2: string): Promise<number> {
  const t1 = (tecnico1 || "").trim();
  const t2 = (tecnico2 || "").trim();
  if (!t1) return 0;

  const chave = t2 ? `${t1}|${t2}` : t1;
  if (cacheVendedores.has(chave)) return cacheVendedores.get(chave)!;

  const vendedores = await carregarVendedores();

  // Normaliza para comparação
  const norm = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const n1 = norm(t1);
  const n2 = t2 ? norm(t2) : "";

  for (const v of vendedores) {
    const nv = norm(v.nome);
    if (t2) {
      // Dois técnicos: busca combinação que contenha ambos os nomes
      if (nv.includes(n1) && nv.includes(n2)) {
        cacheVendedores.set(chave, v.codigo);
        return v.codigo;
      }
    } else {
      // Um técnico: busca que contenha o nome (e não seja combinação)
      if (nv.includes(n1) && !nv.includes("//") && !nv.includes("///")) {
        cacheVendedores.set(chave, v.codigo);
        return v.codigo;
      }
    }
  }

  // Fallback: busca parcial para um técnico (aceita combinação também)
  if (!t2) {
    for (const v of vendedores) {
      if (norm(v.nome).includes(n1)) {
        cacheVendedores.set(chave, v.codigo);
        return v.codigo;
      }
    }
  }

  console.warn(`[Omie] Vendedor não encontrado para: ${chave}`);
  return 0;
}

// --- Montar payload da OS ---
function montarServicos(os: Record<string, unknown>): ServicoItem[] {
  const servicos: ServicoItem[] = [];
  const qtdHR = toNum(os.Qtd_HR);
  const valorHR = toNum(os.Valor_HR, VALOR_HORA);
  const descontoHora = toNum(os.Desconto_Hora);
  const descontoKm = toNum(os.Desconto_KM);
  const qtdKM = toNum(os.Qtd_KM);
  const valorKM = toNum(os.Valor_KM, VALOR_KM);
  const tipoServico = String(os.Tipo_Servico || "");
  const descricao = String(os.Serv_Solicitado || "").substring(0, 500);

  // 1. Solicitação de Serviço (sempre — com descrição do Serv_Solicitado)
  servicos.push({
    nCodServico: OMIE_NCODSERV_SOL,
    nQtde: 1,
    nValUnit: 0.000001,
    cDescServ: descricao || undefined,
  });

  // 2. Serviço de revisão (somente quando tipo = Revisão)
  if (tipoServico === "Revisão") {
    const revisao = String(os.Revisao || "");
    const projeto = String(os.Projeto || "");
    if (revisao) {
      const nCodRevisao = buscarServicoRevisao(revisao, projeto);
      if (nCodRevisao) {
        servicos.push({ nCodServico: nCodRevisao, nQtde: 1, nValUnit: 0.01 });
      }
    }
  }

  // 3. Hora Trabalhada
  if (qtdHR > 0) {
    const item: ServicoItem = { nCodServico: OMIE_NCODSERV_HORA, nQtde: qtdHR, nValUnit: valorHR };
    if (descontoHora > 0) item.nValorDesconto = descontoHora;
    servicos.push(item);
  }

  // 4. KM Deslocamento
  if (qtdKM > 0) {
    const item: ServicoItem = { nCodServico: OMIE_NCODSERV_KM, nQtde: qtdKM, nValUnit: valorKM };
    if (descontoKm > 0) item.nValorDesconto = descontoKm;
    servicos.push(item);
  }

  return servicos;
}

function montarDadosAdic(os: Record<string, unknown>): string {
  const partes: string[] = [];
  if (os.ID_PPV) partes.push(`PPV: ${os.ID_PPV}`);
  if (os.Projeto) partes.push(`Chassis/Projeto: ${os.Projeto}`);
  if (os.Id_Req) partes.push(`Req: ${os.Id_Req}`);
  return partes.join(" | ").substring(0, 500);
}

function montarObsOS(os: Record<string, unknown>): string {
  const partes: string[] = [];
  if (os.Serv_Realizado) partes.push(String(os.Serv_Realizado).trim());
  if (os.Causa) partes.push(`Causa: ${String(os.Causa).trim()}`);
  if (os.Revisao) partes.push(`Revisão: ${String(os.Revisao).trim()}`);
  return partes.join("\n\n").substring(0, 2000);
}

// --- Função principal: criar OS no Omie ---
export async function criarOSNoOmie(idOrdem: string): Promise<{ sucesso: boolean; nCodOS?: number; cNumOS?: string; erro?: string; pedidoVenda?: string; pedidoVendaErro?: string }> {
  if (!OMIE_APP_KEY || !OMIE_APP_SECRET) {
    return { sucesso: false, erro: "Credenciais Omie não configuradas" };
  }

  // Busca a OS no Supabase
  const { data: res } = await supabase.from(TBL_OS).select("*").eq("Id_Ordem", idOrdem).limit(1);
  if (!res || !res.length) {
    return { sucesso: false, erro: "OS não encontrada" };
  }

  const os = res[0];

  // Já foi enviada?
  if (os.Ordem_Omie) {
    return { sucesso: false, erro: `OS já possui Ordem Omie: ${os.Ordem_Omie}` };
  }

  // Validações
  if (!os.Cnpj_Cliente) {
    return { sucesso: false, erro: "CNPJ/CPF do cliente não informado" };
  }
  if (!os.Data) {
    return { sucesso: false, erro: "Data da OS não informada" };
  }

  try {
    const { nCodCli, email: emailCliente } = await buscarNcodCli(os.Cnpj_Cliente);
    const nCodProj = await buscarNcodProj(String(os.Projeto || ""));
    const nCodVend = await buscarNcodVend(String(os.Os_Tecnico || ""), String(os.Os_Tecnico2 || ""));

    const payload = {
      Cabecalho: {
        cCodIntOS: os.Id_Ordem,
        cEtapa: OMIE_ETAPA_EXECUTADA,
        dDtPrevisao: formatarDataOmie(os.Data),
        nCodCli,
        nCodVend: nCodVend || undefined,
        nQtdeParc: 1,
      },
      InformacoesAdicionais: {
        cCodCateg: OMIE_COD_CATEG,
        nCodCC: OMIE_COD_CC,
        nCodProj: nCodProj || undefined,
        cDadosAdicNF: montarDadosAdic(os) || undefined,
      },
      Observacoes: {
        cObsOS: montarObsOS(os) || undefined,
      },
      ServicosPrestados: montarServicos(os),
      Email: {
        cEnvBoleto: "N",
        cEnvLink: "N",
        cEnviarPara: emailCliente,
      },
    };

    const resposta = await omieCall<OmieOSResponse>(
      "/servicos/os/",
      "IncluirOS",
      payload as unknown as Record<string, unknown>
    );

    // Grava número da OS Omie e o código interno (id_omie)
    await supabase
      .from(TBL_OS)
      .update({
        Ordem_Omie: resposta.cNumOS || String(resposta.nCodOS),
        id_omie: resposta.cNumOS || String(resposta.nCodOS),
      })
      .eq("Id_Ordem", idOrdem);

    console.log(`[Omie] ✓ ${idOrdem} → OS nº ${resposta.cNumOS} (ID: ${resposta.nCodOS})`);

    // Se existem PPVs vinculados, cria Pedido de Venda e fecha PPVs
    const ppvIds = String(os.ID_PPV || "").split(",").map((s: string) => s.trim()).filter(Boolean);
    let pedidoVendaInfo: { numero?: string; erro?: string } = {};
    if (ppvIds.length > 0) {
      pedidoVendaInfo = await criarPedidoVendaNoOmie(idOrdem, ppvIds, nCodCli, nCodProj, nCodVend);
      // Fecha PPVs vinculados
      await fecharPPVsVinculados(ppvIds, idOrdem);
    }

    return {
      sucesso: true, nCodOS: resposta.nCodOS, cNumOS: resposta.cNumOS,
      pedidoVenda: pedidoVendaInfo.numero, pedidoVendaErro: pedidoVendaInfo.erro,
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Omie] ✗ ${idOrdem}: ${msg}`);
    return { sucesso: false, erro: msg };
  }
}

// --- Lookup de produto no Omie (código interno → codigo_produto) ---
const cacheProdutos = new Map<string, number>();

async function buscarCodigoProdutoOmie(codigoInterno: string): Promise<number> {
  if (cacheProdutos.has(codigoInterno)) return cacheProdutos.get(codigoInterno)!;

  const result = await omieCall<{ codigo_produto?: number; codigo?: string }>(
    "/produtos/produto/",
    "ConsultarProduto",
    { codigo: codigoInterno }
  );

  const codProd = result?.codigo_produto;
  if (!codProd) {
    throw new Error(`Produto não encontrado no Omie: ${codigoInterno}`);
  }

  cacheProdutos.set(codigoInterno, codProd);
  return codProd;
}

// --- Criar Pedido de Venda no Omie a partir dos produtos do PPV ---
async function criarPedidoVendaNoOmie(
  idOrdem: string,
  ppvIds: string[],
  nCodCli: number,
  nCodProj: number,
  nCodVend: number,
): Promise<{ numero?: string; erro?: string }> {
  try {
    // Busca produtos de todos os PPVs vinculados
    const { data: items } = await supabase
      .from(TBL_ITENS)
      .select("*")
      .in("Id_PPV", ppvIds);

    if (!items || items.length === 0) {
      console.log(`[Omie PV] Sem produtos nos PPVs ${ppvIds.join(",")}, pulando pedido de venda`);
      return {};
    }

    // Agrupa por CodProduto (net de devoluções)
    const resumo: Record<string, { descricao: string; qtde: number; preco: number }> = {};
    for (const item of items) {
      const cod = String(item.CodProduto || "");
      const desc = String(item.Descricao || "");
      const preco = parseFloat(String(item.Preco || 0));
      let qtd = Math.abs(parseFloat(String(item.Qtde || 0)));
      if (String(item.TipoMovimento || "").toLowerCase().includes("devolu")) qtd = -qtd;
      if (!resumo[cod]) resumo[cod] = { descricao: desc, qtde: 0, preco };
      resumo[cod].qtde += qtd;
    }

    // Filtra produtos com quantidade positiva
    const produtosFinais = Object.entries(resumo).filter(([, p]) => p.qtde > 0);
    if (produtosFinais.length === 0) {
      console.log(`[Omie PV] Todos os produtos foram devolvidos, pulando pedido de venda`);
      return {};
    }

    // Monta os itens do pedido (busca codigo_produto no Omie)
    const det: Array<{ ide: { codigo_item_integracao: string }; produto: { codigo_produto: number; quantidade: number; valor_unitario: number } }> = [];
    for (let i = 0; i < produtosFinais.length; i++) {
      const [cod, prod] = produtosFinais[i];
      const codigoProdutoOmie = await buscarCodigoProdutoOmie(cod);
      det.push({
        ide: { codigo_item_integracao: `${idOrdem}-${i + 1}` },
        produto: {
          codigo_produto: codigoProdutoOmie,
          quantidade: prod.qtde,
          valor_unitario: prod.preco,
        },
      });
    }

    const payload = {
      cabecalho: {
        codigo_pedido_integracao: `PV-${idOrdem}`,
        codigo_cliente: nCodCli,
        data_previsao: formatarDataOmie(new Date().toISOString()),
        etapa: "10", // Aprovado
        quantidade_itens: det.length,
      },
      informacoes_adicionais: {
        codigo_categoria: OMIE_COD_CATEG_VENDA,
        codigo_conta_corrente: OMIE_COD_CC,
        codVend: nCodVend || undefined,
        codProj: nCodProj || undefined,
        numero_contrato: idOrdem, // Cross-reference: OS → Pedido
      },
      det,
    };

    const resposta = await omieCall<{ numero_pedido?: string; codigo_pedido?: number }>(
      "/produtos/pedido/",
      "IncluirPedido",
      payload as unknown as Record<string, unknown>
    );

    const numPedido = resposta.numero_pedido || String(resposta.codigo_pedido || "");
    console.log(`[Omie PV] ✓ ${idOrdem} → Pedido de Venda nº ${numPedido}`);

    // Salva o número do pedido de venda nos PPVs
    for (const ppvId of ppvIds) {
      await supabase
        .from(TBL_PEDIDOS)
        .update({ pedido_omie: numPedido })
        .eq("id_pedido", ppvId);
    }

    return { numero: numPedido };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Omie PV] ✗ ${idOrdem}: ${msg}`);
    return { erro: msg };
  }
}

// --- Fecha PPVs vinculados quando OS é enviada para Omie ---
async function fecharPPVsVinculados(ppvIds: string[], idOrdem: string): Promise<void> {
  for (const ppvId of ppvIds) {
    const { data: ppv } = await supabase
      .from(TBL_PEDIDOS)
      .select("status")
      .eq("id_pedido", ppvId)
      .limit(1);

    const statusAtual = ppv?.[0]?.status;
    if (!statusAtual || statusAtual === "Fechado" || statusAtual === "Cancelado") continue;

    await supabase
      .from(TBL_PEDIDOS)
      .update({ status: "Fechado" })
      .eq("id_pedido", ppvId);

    await supabase.from(TBL_LOGS_PPV).insert({
      id_ppv: ppvId,
      data_hora: new Date().toISOString(),
      acao: `PPV fechado (OS ${idOrdem} enviada para Omie)`,
      usuario_email: "admin.sistema@novatratores.com",
    });

    console.log(`[PPV] ✓ ${ppvId} fechado (OS ${idOrdem} enviada para Omie)`);
  }
}
