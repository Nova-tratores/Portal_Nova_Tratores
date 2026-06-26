import { NextRequest, NextResponse } from "next/server";
import { TRATORINO_PERSONA, TRATORINO_CONHECIMENTO } from "@/lib/assistente/conhecimento";
import { getIA, chamarIA } from "@/lib/assistente/ia";
import { geocodificar, rotaDaOficina } from "@/lib/pos/ors";

// Extrai coordenadas (lat,lng) de um link do Google Maps ou texto. Resolve links encurtados (segue o redirect).
async function coordsDoLink(texto: string): Promise<{ lat: number; lng: number } | null> {
  const t = String(texto || "").trim();
  const re = /(-?\d{1,3}\.\d{3,}),\s*(-?\d{1,3}\.\d{3,})/; // lat,lng com pelo menos 3 casas decimais
  const m1 = t.match(re);
  if (m1) return { lat: parseFloat(m1[1]), lng: parseFloat(m1[2]) };
  if (/^https?:\/\//i.test(t)) {
    try {
      const res = await fetch(t, { redirect: "follow" });
      const body = await res.text().catch(() => "");
      const hay = (res.url || "") + " " + body.slice(0, 8000);
      const m2 = hay.match(re);
      if (m2) return { lat: parseFloat(m2[1]), lng: parseFloat(m2[2]) };
    } catch {}
  }
  return null;
}

// Rótulos dos módulos do portal (iguais aos de /admin) — pra dizer ao usuário o que ele acessa
const MOD_LABELS: Record<string, string> = {
  avisos: "Avisos", clientes: "Clientes", "visual-estoque": "Consulta Omie", revisoes: "Controle de Revisões",
  "dashboard-agro": "Dashboard Agro", dre: "DRE Financeiro", estoque: "Visual Estoque", feedbacks: "Feedbacks & CRM",
  financeiro: "Financeiro", "fotos-tecnicos": "Fotos Técnicos", garantias: "Garantias", mecanicos: "Janela Mecânicos",
  mapa: "Mapeamento Técnico", opa: "Opa (Ocorrências)", orcamentos: "Orçamentos", "painel-mecanicos": "Painel Mecânicos",
  ppv: "Peças (PPV)", pos: "Pós-Vendas (OS)", propostas: "Proposta Comercial", requisicoes: "Requisições",
  sat: "SAT Digital", "supervisor-vendas": "Supervisor Vendas", tarefas: "Tarefas", tratorilson: "Tratorilson (Chat IA)",
};

// Ferramentas que o Tratorilson pode chamar
const TOOLS = [
  {
    type: "function",
    function: {
      name: "kit_revisao",
      description: "Retorna a LISTA DE PEÇAS do kit de revisão de um trator para um intervalo de horas (ex.: 50, 250, 500). Use sempre que perguntarem quais peças vão na revisão de X horas de um trator.",
      parameters: {
        type: "object",
        properties: {
          modelo: { type: "string", description: "Nome do trator, ex.: Jivo 2025, 6065 P2, 6075L" },
          horas: { type: "string", description: "Intervalo de horas da revisão, ex.: 50, 250, 500" },
        },
        required: ["modelo", "horas"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_plano_revisao",
      description: "Busca os PLANOS DE REVISÃO prontos do POS — o ESCOPO/descrição do que cada revisão inclui (ex.: 'Revisão de 600 horas - troca de óleo do motor, filtros...'). Use quando perguntarem o que vai/o que tem numa revisão de X horas, ou pra preencher o Plano de Revisão de uma OS. Para a LISTA DE PEÇAS com códigos/preços do kit, use kit_revisao. Informe o termo (ex.: '600 horas', '50h', '9500S 3000').",
      parameters: {
        type: "object",
        properties: {
          termo: { type: "string", description: "Termo de busca do plano, ex.: '600 horas', '50', '9500S 3000'." },
        },
        required: ["termo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "buscar_pecas",
      description: "Busca peças no catálogo por nome/descrição ou por código, e mostra em quais tratores cada peça aparece. Use quando perguntarem sobre uma peça específica ou um código.",
      parameters: {
        type: "object",
        properties: {
          consulta: { type: "string", description: "Nome/descrição da peça ou código" },
          modelo: { type: "string", description: "Trator (opcional), pra filtrar" },
        },
        required: ["consulta"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "historico_cliente",
      description: "Mostra o histórico de um cliente: últimos serviços (OS), PPVs, requisições e NF, SEPARADOS por fazenda (CNPJ). Use quando perguntarem o que foi feito para um cliente, último serviço, etc. Se o cliente tiver fazendas (CNPJs) diferentes, mostra cada uma. Inclui links (PDF da OS, NF, pasta do cliente).",
      parameters: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome do cliente" },
          cnpj: { type: "string", description: "CNPJ específico de uma fazenda (opcional, pra filtrar uma fazenda)" },
        },
        required: ["nome"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_orcamento",
      description: "Monta uma PROPOSTA de orçamento (não cria ainda). Use quando o usuário pedir para CRIAR/FAZER um orçamento. Informe o cliente e os itens. O sistema mostra um resumo e o usuário confirma num botão.",
      parameters: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nome ou CNPJ do cliente" },
          itens: { type: "array", description: "Lista de itens", items: { type: "object", properties: { codigo: { type: "string" }, descricao: { type: "string" }, quantidade: { type: "number" } } } },
        },
        required: ["cliente", "itens"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_ppv",
      description: "Monta uma PROPOSTA de PPV (pedido de venda de peças) — não cria ainda. Use quando o usuário pedir para CRIAR/FAZER um PPV. Igual ao orçamento: cliente + itens; o usuário confirma num botão.",
      parameters: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nome ou CNPJ do cliente" },
          itens: { type: "array", description: "Lista de itens", items: { type: "object", properties: { codigo: { type: "string" }, descricao: { type: "string" }, quantidade: { type: "number" } } } },
        },
        required: ["cliente", "itens"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_os",
      description: "Monta uma PROPOSTA de Ordem de Serviço (OS) — não cria ainda. Use quando o usuário pedir para CRIAR/ABRIR uma OS. Informe o cliente e o serviço. Técnico, tipo, horas e km são opcionais. Se o serviço envolver PEÇAS, passe a lista em 'pecas' — será gerado automaticamente um PPV de peças VINCULADO à OS. Sem peças, sai só a OS (mão de obra/visita). O usuário confirma num botão.",
      parameters: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nome ou CNPJ do cliente" },
          servico: { type: "string", description: "A solicitação de serviço — SÓ o que o cliente pediu (ex.: 'troca da bucha do pivô'). Se o usuário puser o serviço ENTRE ASPAS, use EXATAMENTE o texto entre aspas, sem o nome do cliente/técnico. NÃO escreva o modelo da descrição — o sistema coloca isso no campo 'Solicitação do cliente' do template padrão." },
          tecnico: { type: "string", description: "Técnico responsável — só o nome (ex.: Danilo). É casado com a lista real de técnicos do POS. Opcional." },
          projeto: { type: "string", description: "Projeto/equipamento existente — pode ser só o FINAL do chassi, o modelo ou o número. É casado com um projeto do banco. Opcional." },
          tipoServico: { type: "string", description: "Tipo de serviço, ex.: Revisão, Garantia, Manutenção (opcional)" },
          revisao_horas: { type: "number", description: "Número de HORAS da revisão que o usuário falou (50, 300, 600, 900, 1200, 2400...). Em revisão, passe SEMPRE este número — o sistema busca o plano certo e importa o kit por ele. Não confie só no texto." },
          revisao: { type: "string", description: "Texto do plano de revisão (opcional — o sistema já busca pelo nº de horas). Use só se o usuário ditar um plano específico." },
          trator: { type: "string", description: "Modelo do trator (ex.: 6075, 9500S, Jivo 2025). Em revisão, o sistema usa isso + as horas pra IMPORTAR o kit de peças automaticamente." },
          horas: { type: "number", description: "Horas de mão de obra (opcional — em revisão é preenchido automaticamente pela regra da casa)" },
          km: { type: "number", description: "Km de deslocamento (opcional — se mandarem a localização, é calculado automaticamente)" },
          localizacao: { type: "string", description: "Link de localização do Google Maps (ou 'lat,lng', ou endereço). O sistema calcula o km de IDA E VOLTA da oficina (Piraju) até o local e preenche o deslocamento. Opcional." },
          data: { type: "string", description: "Data de execução no formato AAAA-MM-DD. SÓ informe se o usuário DISSER uma data (ex.: 'amanhã', 'dia 25') — converta pra AAAA-MM-DD. Se ele não falar data, NÃO mande este campo (o sistema usa a data de hoje)." },
          pecas: { type: "array", description: "Peças do serviço — se houver, gera um PPV vinculado à OS. Opcional.", items: { type: "object", properties: { codigo: { type: "string" }, descricao: { type: "string" }, quantidade: { type: "number" } } } },
        },
        required: ["cliente", "servico"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_requisicao",
      description: "Monta uma PROPOSTA de Requisição — não cria ainda. Use quando o usuário pedir para CRIAR/FAZER uma requisição. NÃO invente valores: tipo e setor têm opções fixas (escolha a que mais se encaixa); solicitante deve ser o nome de uma pessoa real (será conferido na lista). Se a peça quebrou/é para o trator de um cliente, use setor 'Trator-Cliente' e informe a 'ordem' (a OS traz cliente e chassis sozinha). Conforme o tipo, alguns campos a mais: Ferramenta → 'quem_ferramenta' (Uso Pessoal/Geral); Abastecimento (Trator/Quadri/Veicular) → 'litros'; Veicular → 'veiculo' (placa). Campos OBRIGATÓRIOS base: titulo, tipo, setor, solicitante e obs. A ferramenta avisa o que faltar (mostrando as opções) — NÃO crie sem eles.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título/descrição curta da requisição, ex.: Parafuso para o M250" },
          tipo: { type: "string", enum: ["Peças", "Alimentação", "Serviço de Terceiros", "Almoxarifado", "Ferramenta", "Insumo Infra", "Veicular Abastecimento", "Veicular Manutenção", "Trator Abastecimento", "Quadri Abastecimento", "Hospedagem"], description: "Tipo — escolha a opção que mais se encaixa. Peça de máquina = 'Peças'. OBRIGATÓRIO." },
          setor: { type: "string", enum: ["Trator-Loja", "Trator-Cliente", "Oficina", "Comercial"], description: "Setor destino. Trator do cliente = 'Trator-Cliente'; trator da loja = 'Trator-Loja'. OBRIGATÓRIO." },
          solicitante: { type: "string", description: "Quem pediu (primeiro nome basta, ex.: Nicolas). Será casado com a lista de usuários. OBRIGATÓRIO." },
          obs: { type: "string", description: "Motivo/explicação da requisição — POR QUE precisa (ex.: quebrou com o cliente usando). OBRIGATÓRIO." },
          ordem: { type: "string", description: "Número da OS a vincular, quando a requisição é para um serviço/cliente. A OS traz o cliente e o chassis automaticamente." },
          cliente: { type: "string", description: "Nome do cliente, quando for Trator-Cliente e NÃO houver OS pra vincular." },
          projeto: { type: "string", description: "Projeto/equipamento (final do chassi, modelo ou número) — casado com projeto existente. Opcional." },
          cobrar_cliente: { type: "boolean", description: "true se for para cobrar do cliente." },
          custo: { type: "number", description: "Custo real da peça/serviço (R$). Em Trator-Cliente é OBRIGATÓRIO — o valor cobrado do cliente é calculado como custo + 20% (× 1,20)." },
          valor_cliente: { type: "number", description: "Valor cobrado do cliente (R$) já pronto — use só se o usuário der o valor final direto (senão informe 'custo' que o sistema calcula custo + 20%)." },
          quem_ferramenta: { type: "string", enum: ["Uso Pessoal", "Geral"], description: "Só p/ tipo Ferramenta: destinação (Uso Pessoal ou Geral)." },
          litros: { type: "number", description: "Só p/ tipos de Abastecimento: litros de combustível." },
          veiculo: { type: "string", description: "Só p/ tipos Veicular: a placa do veículo (casada com a lista de placas)." },
          hodometro: { type: "string", description: "Hodômetro/horímetro (opcional, p/ veicular ou trator-loja)." },
        },
        required: ["titulo", "tipo", "setor", "solicitante", "obs"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "explorar_catalogo",
      description: "Explora a ESTRUTURA dos catálogos de peças dos tratores Mahindra. Use pra saber quais TRATORES existem no catálogo, quais SISTEMAS/seções um trator tem (Motor, Transmissão, Hidráulico, Eixo...), e quais FIGURAS (vistas explodidas) há em cada sistema. Para achar uma PEÇA específica por nome/código, use buscar_pecas. acao=tratores (lista todos), acao=sistemas (precisa de modelo), acao=figuras (precisa de modelo; sistema é opcional).",
      parameters: {
        type: "object",
        properties: {
          acao: { type: "string", enum: ["tratores", "sistemas", "figuras"], description: "tratores = lista os tratores; sistemas = seções de um trator; figuras = figuras de um trator/sistema." },
          modelo: { type: "string", description: "Nome do trator, ex.: 6065 P2, 6075L, Jivo 2025." },
          sistema: { type: "string", description: "Nome do sistema/seção, ex.: Motor, Transmissão (para acao=figuras)." },
        },
        required: ["acao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_projeto",
      description: "Consulta os PROJETOS e já cruza com o CONTROLE DE REVISÕES do trator. Cada projeto é uma máquina/trator vendido, identificado por modelo + número de CHASSI (ex.: '6075 MDI07502AN0002581'), ligado ao CLIENTE pelo CPF/CNPJ do último FATURAMENTO. O retorno traz, por projeto, o cliente E as revisões (quais já foram feitas, a última e a próxima pendente). Use pra: descobrir de QUEM é um projeto/chassi, LISTAR os projetos/máquinas de um cliente, ou ver as revisões de um trator. Informe 'projeto' (nome ou chassi) OU 'cliente' (nome ou CPF/CNPJ).",
      parameters: {
        type: "object",
        properties: {
          projeto: { type: "string", description: "Nome ou número de chassi do projeto a buscar." },
          cliente: { type: "string", description: "Nome ou CPF/CNPJ do cliente, pra listar os projetos/máquinas dele." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "usuarios_portal",
      description: "(Somente administradores) Informações sobre os usuários do portal. Use quando perguntarem QUANTOS usuários existem, QUEM são, suas funções, ou o HISTÓRICO de ações de um usuário. acao=contar (total/ativos/inativos), acao=listar (lista com nome e função), acao=historico (últimas ações de um usuário, exige o nome).",
      parameters: {
        type: "object",
        properties: {
          acao: { type: "string", enum: ["contar", "listar", "historico"], description: "contar = totais; listar = lista de usuários; historico = ações recentes de um usuário." },
          nome: { type: "string", description: "Nome do usuário (obrigatório quando acao=historico)." },
        },
        required: ["acao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "consultar_financeiro",
      description: "Consulta dados REAIS do módulo Financeiro (chamados de NF / boletos — tabela Chamado_NF). Use para perguntas como 'quantos chamados estão em aguardando vencimento', 'tem algo vencido/atrasado?', 'resumo do financeiro', 'quais chamados do cliente X'. acao=resumo (contagem por fase e por setor + vencidos + valor total em aberto); acao=por_status (informe o status); acao=vencidos (boletos vencidos ou atrasados); acao=por_cliente (informe o nome do cliente). Pode filtrar por setor: 'oficina' (Pós-Vendas) ou 'pecas' (Peças).",
      parameters: {
        type: "object",
        properties: {
          acao: { type: "string", enum: ["resumo", "por_status", "vencidos", "por_cliente"], description: "resumo = visão geral; por_status = filtra por fase; vencidos = atrasados; por_cliente = de um cliente." },
          status: { type: "string", enum: ["gerar_boleto", "enviar_cliente", "aguardando_vencimento", "pago", "vencido", "sem_boleto", "concluido"], description: "Fase (obrigatório quando acao=por_status)." },
          cliente: { type: "string", description: "Nome do cliente (obrigatório quando acao=por_cliente)." },
          setor: { type: "string", enum: ["oficina", "pecas"], description: "Filtro opcional por setor." },
        },
        required: ["acao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "ensinar",
      description: "(Só administradores) GUARDA uma regra/fato novo na MEMÓRIA do Tratorilson. Use quando o usuário ENSINAR algo pra você lembrar sempre (ex.: 'lembre que spray vai em Insumo Infra', 'a revisão de 50h é cortesia', 'o cliente X paga só por boleto'). Guarde a regra de forma clara e curta. Depois de guardar, confirme.",
      parameters: { type: "object", properties: { conteudo: { type: "string", description: "A regra/fato a guardar, claro e direto." } }, required: ["conteudo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "listar_memoria",
      description: "Lista o que o Tratorilson já APRENDEU (as regras guardadas na memória, com o número de cada uma). Use quando perguntarem 'o que você sabe/aprendeu', ou antes de alterar/esquecer uma regra (pra achar o número dela).",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "atualizar_memoria",
      description: "(Só administradores) ALTERA uma regra já guardada na memória. Informe o número (id) OU um termo de busca pra achar a regra, e o novo conteúdo. Se não tiver o id, use 'busca' com palavras da regra.",
      parameters: { type: "object", properties: { id: { type: "number", description: "Número da regra (de listar_memoria)." }, busca: { type: "string", description: "Termo pra achar a regra, se não tiver o id." }, conteudo: { type: "string", description: "O novo conteúdo da regra." } }, required: ["conteudo"] },
    },
  },
  {
    type: "function",
    function: {
      name: "esquecer_memoria",
      description: "(Só administradores) REMOVE (desativa) uma regra da memória. Informe o número (id) OU um termo de busca pra achar a regra.",
      parameters: { type: "object", properties: { id: { type: "number", description: "Número da regra." }, busca: { type: "string", description: "Termo pra achar a regra, se não tiver o id." } } },
    },
  },
];

async function execTool(origin: string, name: string, args: any, ctx?: { isAdmin?: boolean; pode?: (m: string) => boolean; userName?: string }) {
  try {
    // Gate de acesso: cada ferramenta exige o módulo correspondente (admin passa em tudo)
    const pode = typeof ctx?.pode === "function" ? ctx.pode : () => true;
    const isAdmin = ctx?.isAdmin === true;
    const REQ_MOD: Record<string, string[]> = {
      kit_revisao: ["ppv", "orcamentos"], buscar_pecas: ["ppv", "orcamentos"], explorar_catalogo: ["ppv", "orcamentos"],
      buscar_plano_revisao: ["pos", "ppv", "orcamentos", "revisoes"],
      historico_cliente: ["clientes", "pos", "ppv"], consultar_projeto: ["clientes", "pos", "ppv", "orcamentos", "revisoes"],
      propor_orcamento: ["orcamentos"], propor_ppv: ["ppv"], propor_os: ["pos"], propor_requisicao: ["requisicoes"],
      consultar_financeiro: ["financeiro"],
    };
    const need = REQ_MOD[name];
    if (need && !need.some((mod) => pode(mod))) {
      return { sem_acesso: true, mensagem: `O usuário não tem acesso ao módulo necessário pra isso (${need.map((m) => MOD_LABELS[m] || m).join(" ou ")}). Diga, de forma educada, que ele não tem acesso e que fale com um administrador.` };
    }
    if (name === "usuarios_portal" && !isAdmin) {
      return { sem_acesso: true, mensagem: "Apenas administradores podem ver informações de usuários do portal. Diga isso ao usuário, com gentileza." };
    }

    if (name === "kit_revisao") {
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const rc = await fetch(`${SB}/rest/v1/revisoes?select=Trator,Cod_Trator,Horas`, { headers: { apikey: SK, authorization: `Bearer ${SK}` } });
      const rows: any[] = rc.ok ? await rc.json() : [];
      const digitsOf = (s: any): string[] => (String(s || "").toUpperCase().match(/\d{3,}/g) || []);
      const userDig = digitsOf(args.modelo);
      const hNum = (String(args.horas || "").match(/\d+/) || [""])[0];
      const userHoras = hNum ? hNum + "H" : "";
      // casa pelas horas (normalizadas) + número do modelo em comum
      const row = rows.find((r) => {
        const h = String(r.Horas || "").toUpperCase().replace(/\s/g, "");
        const tDig = digitsOf(r.Trator).concat(digitsOf(r.Cod_Trator));
        return h === userHoras && tDig.some((d: string) => userDig.includes(d));
      });
      if (!row) {
        const combos = [...new Set(rows.map((r) => `${r.Trator} (${r.Horas})`))];
        return { encontrado: false, mensagem: `Não achei kit pra "${args.modelo}" / ${args.horas}h.`, kits_disponiveis: combos };
      }
      const r = await fetch(`${origin}/api/ppv/revisoes?trator=${encodeURIComponent(row.Trator)}&horas=${encodeURIComponent(row.Horas)}`);
      const itens: any[] = r.ok ? await r.json() : [];
      return { encontrado: true, modelo: args.modelo, kit: `${row.Trator} ${row.Horas}`, total: itens.length, pecas: itens.map((i: any) => ({ codigo: i.codigo, descricao: i.descricao, qtd: i.quantidade, preco: i.preco })) };
    }
    if (name === "buscar_plano_revisao") {
      const termo = String(args.termo || "").trim();
      const r = await fetch(`${origin}/api/pos/buscas/revisoes?termo=${encodeURIComponent(termo)}`);
      const d: any[] = r.ok ? await r.json() : [];
      if (!d.length) return { encontrado: false, mensagem: `Não achei plano de revisão pra "${termo}". Tenta só o número de horas (ex.: 600).` };
      return { encontrado: true, total: d.length, planos: d.slice(0, 8).map((p) => ({ id: p.id, plano: p.descricao })) };
    }
    if (name === "buscar_pecas") {
      const q = ((args.consulta || "") + (args.modelo ? " " + args.modelo : "")).trim();
      const r = await fetch(`${origin}/api/catalogo?acao=robo&q=${encodeURIComponent(q)}`);
      const d = r.ok ? await r.json() : { grupos: [] };
      const grupos = (d.grupos || []).slice(0, 10).map((g: any) => ({ codigo: g.code, nome: g.name, qtd: g.qtd, tratores: (g.tratores || []).map((t: any) => t.modelo) }));
      return { total: grupos.length, pecas: grupos };
    }
    if (name === "explorar_catalogo") {
      const acao = String(args.acao || "tratores");
      if (acao === "tratores") {
        const d: any[] = await fetch(`${origin}/api/catalogo?acao=modelos`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        return { total: d.length, tratores: d.map((m) => ({ modelo: m.nome, figuras: m.figuras })) };
      }
      if (acao === "sistemas") {
        if (!args.modelo) return { precisa: "modelo", mensagem: "De qual trator você quer os sistemas?" };
        const d: any[] = await fetch(`${origin}/api/catalogo?acao=secoes&modelo=${encodeURIComponent(args.modelo)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        if (!d.length) return { encontrado: false, mensagem: `Não achei o trator "${args.modelo}" no catálogo.` };
        return { modelo: args.modelo, total: d.length, sistemas: d.map((s) => ({ sistema: s.secao, figuras: s.figuras })) };
      }
      if (acao === "figuras") {
        if (!args.modelo) return { precisa: "modelo", mensagem: "De qual trator?" };
        let url = `${origin}/api/catalogo?acao=figuras&modelo=${encodeURIComponent(args.modelo)}`;
        if (args.sistema) url += `&secao=${encodeURIComponent(args.sistema)}`;
        const d: any[] = await fetch(url).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        return { modelo: args.modelo, sistema: args.sistema || null, total: d.length, figuras: d.slice(0, 60).map((f) => ({ code: f.code, nome: f.name, sistema: f.secao })) };
      }
      return { erro: "ação inválida" };
    }
    if (name === "historico_cliente") {
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const H = { apikey: SK, authorization: `Bearer ${SK}` };
      const nome = String(args.nome || "").replace(/[%,()*]/g, " ").trim();
      let url = `${SB}/rest/v1/Ordem_Servico?select=Id_Ordem,Os_Cliente,Cnpj_Cliente,Endereco_Cliente,Serv_Solicitado,Status,Data,Ordem_Omie,ID_PPV,Id_Req&order=Data.desc&limit=40`;
      if (args.cnpj) url += `&Cnpj_Cliente=eq.${encodeURIComponent(args.cnpj)}`;
      else if (nome) url += `&Os_Cliente=ilike.*${encodeURIComponent(nome)}*`;
      const os: any[] = await fetch(url, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
      if (!os.length) return { encontrado: false, mensagem: `Não achei serviços (OS) para "${args.nome}".` };

      // NF da pasta do cliente (por Ordem_Omie)
      const omies = [...new Set(os.map((o) => o.Ordem_Omie).filter(Boolean))];
      const nfMap: Record<string, any> = {};
      if (omies.length) {
        const inList = omies.map((x) => `"${x}"`).join(",");
        const nfs: any[] = await fetch(`${SB}/rest/v1/portal_nt_clientes_os?select=num_os,cod_os,link_nf,num_nf&or=(num_os.in.(${inList}),cod_os.in.(${inList}))`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        for (const n of nfs) { if (n.num_os) nfMap[n.num_os] = n; if (n.cod_os) nfMap[n.cod_os] = n; }
      }

      // agrupa por CNPJ (fazenda)
      const fazendas: Record<string, any> = {};
      for (const o of os) {
        const cnpj = o.Cnpj_Cliente || "sem-cnpj";
        if (!fazendas[cnpj]) fazendas[cnpj] = { cnpj, cliente: o.Os_Cliente, endereco: o.Endereco_Cliente || "", ordens: [] };
        if (fazendas[cnpj].ordens.length >= 6) continue;
        const nf = o.Ordem_Omie ? nfMap[o.Ordem_Omie] : null;
        fazendas[cnpj].ordens.push({
          os: o.Id_Ordem, servico: o.Serv_Solicitado, status: o.Status, data: o.Data,
          link_pdf_os: `/api/pos/ordens/${o.Id_Ordem}/print`,
          ppv: o.ID_PPV || null, link_ppv: o.ID_PPV ? `/ppv?id=${encodeURIComponent(String(o.ID_PPV).split(",")[0])}` : null,
          requisicao: o.Id_Req || null, link_requisicao: o.Id_Req ? `/requisicoes/imprimir/${String(o.Id_Req).split(",")[0]}` : null,
          nf: nf?.num_nf || null, link_nf: nf?.link_nf || null,
        });
      }
      return { encontrado: true, cliente: args.nome, total_os: os.length, fazendas: Object.values(fazendas), pasta_cliente: "/clientes" };
    }
    if (name === "consultar_projeto") {
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const H = { apikey: SK, authorization: `Bearer ${SK}` };
      const lp = (s: any) => String(s || "").replace(/[%,()*]/g, " ").trim();
      const SELP = "codigo,nome,empresa,cnpj_cpf_ultimo,cliente_nome_ultimo";
      const get = (u: string) => fetch(u, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);

      // Controle de revisões (tabela "tratores") — cruza pelo CHASSI que está no nome do projeto
      const REV = ["50h", "300h", "600h", "900h", "1200h", "1500h", "1800h", "2100h", "2400h", "2700h", "3000h"];
      const extrairChassi = (nome: string) => {
        const toks = String(nome || "").toUpperCase().match(/[A-Z0-9]{6,}/g) || [];
        return toks.sort((a, b) => ((b.match(/\d/g) || []).length - (a.match(/\d/g) || []).length) || (b.length - a.length))[0] || "";
      };
      const resumoRev = (t: any) => {
        const feitas = REV.filter((h) => t[h + " Data"]).map((h) => ({ rev: h, data: t[h + " Data"], horimetro: t[h + " Horimetro"] || null }));
        const proxima = REV.find((h) => !t[h + " Data"]) || null;
        return { entrega: t.Entrega || null, inspecao: t["Inspecao Data"] || null, total_feitas: feitas.length, ultima_feita: feitas[feitas.length - 1] || null, proxima_pendente: proxima, feitas };
      };
      const cruzarRevisoes = async (projetos: any[]) => {
        const chassisDe: Record<string, string> = {};
        for (const p of projetos) chassisDe[p.codigo] = extrairChassi(p.nome);
        const lista = [...new Set(Object.values(chassisDe).filter(Boolean))];
        const revMap: Record<string, any> = {};
        if (lista.length) {
          // ilike (tolera espaços no fim do chassi); chave normalizada (trim + upper)
          const orQ = lista.map((c) => `Chassis.ilike.*${encodeURIComponent(c)}*`).join(",");
          const tr: any[] = await get(`${SB}/rest/v1/tratores?select=*&or=(${orQ})`);
          for (const t of tr) revMap[String(t.Chassis || "").trim().toUpperCase()] = t;
        }
        return projetos.map((p) => {
          const ch = chassisDe[p.codigo];
          const t = ch ? revMap[ch] : null;
          return { ...p, chassi: ch || null, revisoes: t ? resumoRev(t) : null };
        });
      };

      // Buscar por projeto/chassi → de quem é + controle de revisões
      if (args.projeto) {
        const q = lp(args.projeto);
        const r: any[] = await get(`${SB}/rest/v1/portal_nt_projetos_PRINCIPAL?select=${SELP}&nome=ilike.*${encodeURIComponent(q)}*&limit=12`);
        if (!r.length) return { encontrado: false, mensagem: `Não achei nenhum projeto/chassi parecido com "${args.projeto}".` };
        const base = r.map((p) => ({ projeto: p.nome, codigo: p.codigo, empresa: p.empresa, cliente: p.cliente_nome_ultimo || null, cnpj_cpf: p.cnpj_cpf_ultimo || null, faturado: !!p.cnpj_cpf_ultimo, pasta_cliente: "/clientes" }));
        return { encontrado: true, total: r.length, projetos: await cruzarRevisoes(base) };
      }
      // Buscar por cliente → quais projetos/máquinas são dele (+ revisões)
      if (args.cliente) {
        const q = lp(args.cliente);
        const r: any[] = await get(`${SB}/rest/v1/portal_nt_projetos_PRINCIPAL?select=${SELP}&or=(cliente_nome_ultimo.ilike.*${encodeURIComponent(q)}*,cnpj_cpf_ultimo.ilike.*${encodeURIComponent(q)}*)&limit=30`);
        if (!r.length) return { encontrado: false, mensagem: `Não achei projetos faturados para "${args.cliente}".` };
        const base = r.map((p) => ({ projeto: p.nome, codigo: p.codigo, empresa: p.empresa, cnpj_cpf: p.cnpj_cpf_ultimo || null }));
        return { encontrado: true, cliente: r[0].cliente_nome_ultimo || args.cliente, total: r.length, projetos: await cruzarRevisoes(base), pasta_cliente: "/clientes" };
      }
      // Sem filtro → total
      const rc = await fetch(`${SB}/rest/v1/portal_nt_projetos_PRINCIPAL?select=codigo`, { headers: { ...H, Prefer: "count=exact" }, method: "HEAD" });
      const total = (rc.headers.get("content-range") || "/?").split("/")[1];
      const comCli = await fetch(`${SB}/rest/v1/portal_nt_projetos_PRINCIPAL?select=codigo&cnpj_cpf_ultimo=not.is.null`, { headers: { ...H, Prefer: "count=exact" }, method: "HEAD" });
      const totalCli = (comCli.headers.get("content-range") || "/?").split("/")[1];
      return { total_projetos: total, com_cliente_vinculado: totalCli, mensagem: "Me diz um projeto/chassi ou um cliente que eu busco. Cada projeto é ligado ao cliente pelo CPF/CNPJ do último faturamento." };
    }
    if (name === "propor_orcamento" || name === "propor_ppv") {
      const tipo = name === "propor_ppv" ? "ppv" : "orcamento";
      let cliente: any = null;
      if (args.cliente) {
        const rc = await fetch(`${origin}/api/ppv/clientes?termo=${encodeURIComponent(args.cliente)}`);
        const cls = rc.ok ? await rc.json() : [];
        cliente = Array.isArray(cls) ? cls[0] : null;
      }
      if (!cliente) return { precisa: "cliente", mensagem: `Não achei o cliente "${args.cliente}". Pode confirmar o nome exato ou o CNPJ?` };
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const itens: any[] = [];
      for (const it of (args.itens || [])) {
        let codigo = String(it.codigo || "").trim();
        let descricao = it.descricao || "";
        if (!codigo && descricao) {
          const rs = await fetch(`${origin}/api/catalogo?acao=busca&q=${encodeURIComponent(descricao)}`);
          const ds = rs.ok ? await rs.json() : [];
          if (ds[0]) { codigo = ds[0].code; descricao = ds[0].name; }
        }
        if (!codigo) continue;
        let preco = 0;
        try {
          const rp = await fetch(`${SB}/rest/v1/Produtos_Completos?Codigo_Produto=eq.${encodeURIComponent(codigo)}&select=Descricao_Produto,Preco_Venda&limit=1`, { headers: { apikey: SK, authorization: `Bearer ${SK}` } });
          const pp = rp.ok ? await rp.json() : [];
          if (pp[0]) { preco = parseFloat(String(pp[0].Preco_Venda || 0)) || 0; if (pp[0].Descricao_Produto) descricao = pp[0].Descricao_Produto; }
        } catch {}
        itens.push({ codigo, descricao: descricao || codigo, quantidade: Number(it.quantidade) || 1, preco });
      }
      if (itens.length === 0) return { precisa: "itens", mensagem: "Não consegui identificar os itens. Me passa os códigos ou as descrições das peças?" };
      const total = itens.reduce((s, i) => s + i.quantidade * i.preco, 0);
      return { proposta: { tipo, cliente: { nome: cliente.nome, documento: cliente.documento, endereco: cliente.endereco, cidade: cliente.cidade }, itens, total } };
    }
    if (name === "propor_os") {
      let cliente: any = null;
      if (args.cliente) {
        const rc = await fetch(`${origin}/api/ppv/clientes?termo=${encodeURIComponent(args.cliente)}`);
        const cls = rc.ok ? await rc.json() : [];
        cliente = Array.isArray(cls) ? cls[0] : null;
      }
      if (!cliente) return { precisa: "cliente", mensagem: `Não achei o cliente "${args.cliente}". Confirma o nome exato ou o CNPJ?` };
      if (!args.servico) return { precisa: "servico", mensagem: "Qual o serviço solicitado dessa OS?" };

      const normT = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

      // TÉCNICO: casa com a lista real de técnicos do POS (mesmo dropdown do POS/PPV)
      let tecnicoMatch = "";
      if (args.tecnico) {
        try {
          const rt = await fetch(`${origin}/api/pos/tecnicos`);
          const tecs: string[] = rt.ok ? await rt.json() : [];
          const q = normT(args.tecnico);
          tecnicoMatch = tecs.find((t) => normT(t) === q)
            || tecs.find((t) => normT(t).includes(q))
            || tecs.find((t) => q.split(/\s+/).some((p) => p.length >= 3 && normT(t).includes(p)))
            || "";
        } catch {}
        if (!tecnicoMatch) tecnicoMatch = String(args.tecnico); // fallback: usa o nome dito
      }

      // PROJETO/EQUIPAMENTO: casa com um projeto existente (pelo final do chassi, modelo ou número)
      let projetoNome = "", modeloProj = "", chassisProj = "";
      if (args.projeto) {
        try {
          const rp = await fetch(`${origin}/api/pos/buscas/projetos?termo=${encodeURIComponent(String(args.projeto))}`);
          const projs: any[] = rp.ok ? await rp.json() : [];
          if (projs[0]) {
            projetoNome = projs[0].nome || "";
            const partes = projetoNome.trim().split(/\s+/);
            modeloProj = partes[0] || "";
            chassisProj = partes.slice(1).join(" ") || "";
          }
        } catch {}
        if (!projetoNome) return { precisa: "projeto", mensagem: `Não achei um projeto/equipamento com "${args.projeto}". Confirma o final do chassi ou o modelo?` };
      }

      // Resolve peças (código/descrição/preço). Se houver, a OS gera um PPV vinculado.
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const pecas: any[] = [];
      for (const it of (args.pecas || [])) {
        let codigo = String(it.codigo || "").trim();
        let descricao = it.descricao || "";
        if (!codigo && descricao) {
          const rs = await fetch(`${origin}/api/catalogo?acao=busca&q=${encodeURIComponent(descricao)}`);
          const ds = rs.ok ? await rs.json() : [];
          if (ds[0]) { codigo = ds[0].code; descricao = ds[0].name; }
        }
        if (!codigo) continue;
        let preco = 0;
        try {
          const rp = await fetch(`${SB}/rest/v1/Produtos_Completos?Codigo_Produto=eq.${encodeURIComponent(codigo)}&select=Descricao_Produto,Preco_Venda&limit=1`, { headers: { apikey: SK, authorization: `Bearer ${SK}` } });
          const pp = rp.ok ? await rp.json() : [];
          if (pp[0]) { preco = parseFloat(String(pp[0].Preco_Venda || 0)) || 0; if (pp[0].Descricao_Produto) descricao = pp[0].Descricao_Produto; }
        } catch {}
        pecas.push({ codigo, descricao: descricao || codigo, quantidade: Number(it.quantidade) || 1, preco });
      }

      let km = Number(args.km) || 0;
      // LOCALIZAÇÃO: link do Maps / coords / endereço → calcula km de IDA E VOLTA (oficina → local → oficina)
      let kmCalculado = false;
      if (args.localizacao) {
        try {
          let coords = await coordsDoLink(String(args.localizacao));
          if (!coords) coords = await geocodificar(String(args.localizacao) + ", Brasil");
          if (coords) {
            const rota = await rotaDaOficina(coords.lat, coords.lng);
            if (rota) { km = Math.round(rota.distancia_km * 2 * 10) / 10; kmCalculado = true; }
          }
        } catch {}
      }
      const trator = String(args.trator || "").trim();
      const revisaoHorasArg = parseInt(String(args.revisao_horas || "").replace(/\D/g, "") || "0", 10);
      let planoRevisao = String(args.revisao || "").trim();
      // Horas da revisão: prioriza o NÚMERO informado; só cai no texto do plano se não vier.
      const hrev = revisaoHorasArg || (planoRevisao ? parseInt((planoRevisao.match(/(\d{2,4})\s*horas?/i) || [])[1] || "0", 10) : 0);
      const ehRevisao = !!(revisaoHorasArg || planoRevisao || /revis/i.test(String(args.tipoServico || "")));

      // REVISÃO: busca o PLANO certo pelas HORAS (e trator), pra não depender do texto que o modelo escolheu
      if (ehRevisao && hrev) {
        try {
          const rpl = await fetch(`${origin}/api/pos/buscas/revisoes?termo=${encodeURIComponent(`${hrev} horas`)}`);
          let planos: any[] = rpl.ok ? await rpl.json() : [];
          planos = planos.filter((p) => parseInt((String(p.descricao || "").match(/(\d{2,4})\s*horas?/i) || [])[1] || "0", 10) === hrev);
          const digitsT = (String(trator).toUpperCase().match(/\d{3,}/g) || []);
          const escolhido = planos.find((p) => digitsT.some((d) => String(p.descricao || "").includes(d))) || planos[0];
          if (escolhido?.descricao) planoRevisao = escolhido.descricao;
        } catch {}
      }

      // REVISÃO: importa o KIT DE PEÇAS automaticamente pelo trator + horas (mesma lógica do kit_revisao)
      if (ehRevisao && trator && hrev) {
        try {
          const rc = await fetch(`${SB}/rest/v1/revisoes?select=Trator,Cod_Trator,Horas`, { headers: { apikey: SK, authorization: `Bearer ${SK}` } });
          const rows: any[] = rc.ok ? await rc.json() : [];
          const digitsOf = (s: any): string[] => (String(s || "").toUpperCase().match(/\d{3,}/g) || []);
          const userDig = digitsOf(trator);
          const alvoH = `${hrev}H`;
          const row = rows.find((r) => {
            const h = String(r.Horas || "").toUpperCase().replace(/\s/g, "");
            const tDig = digitsOf(r.Trator).concat(digitsOf(r.Cod_Trator));
            return h === alvoH && tDig.some((d: string) => userDig.includes(d));
          });
          if (row) {
            const rk = await fetch(`${origin}/api/ppv/revisoes?trator=${encodeURIComponent(row.Trator)}&horas=${encodeURIComponent(row.Horas)}`);
            const kit: any[] = rk.ok ? await rk.json() : [];
            for (const k of (Array.isArray(kit) ? kit : [])) {
              const cod = String(k.codigo || "").trim();
              if (!cod || pecas.some((p) => p.codigo === cod)) continue;
              pecas.push({ codigo: cod, descricao: k.descricao || cod, quantidade: Number(k.quantidade) || 1, preco: Number(k.preco) || 0 });
            }
          }
        } catch {}
      }
      // Revisão sem trator e sem peças → pede o trator pra importar o kit
      if (ehRevisao && !trator && pecas.length === 0) {
        return { precisa: "trator", mensagem: "Qual o modelo do trator? Preciso dele pra importar o kit de peças da revisão (ex.: 6075, 9500S, Jivo 2025)." };
      }

      // Regra da casa para HORAS de serviço por revisão (quando não vier horas explícitas):
      //  - 50h e 900h  → 2h, MAS com desconto de 2h (cortesia de fábrica, não cobra mão de obra)
      //  - 1200h e 2400h → 6h
      //  - demais revisões → 3h
      let horas = Number(args.horas) || 0;
      let descontoHoraValor = 0;
      let cortesia = false;
      if (ehRevisao && !horas) {
        if (hrev === 50 || hrev === 900) { horas = 2; cortesia = true; }
        else if (hrev === 1200 || hrev === 2400) horas = 6;
        else horas = 3;
        if (cortesia) {
          let valorHora = 0;
          try {
            const rc = await fetch(`${SB}/rest/v1/configuracoes_pos?id=eq.1&select=valor_hora`, { headers: { apikey: SK, authorization: `Bearer ${SK}` } });
            const cc = rc.ok ? await rc.json() : [];
            valorHora = parseFloat(String(cc[0]?.valor_hora || 0)) || 0;
          } catch {}
          descontoHoraValor = 2 * valorHora; // desconta as 2h
        }
      }

      // Descrição no MODELO padrão do POS — não reescreve tudo: o serviço pedido entra após "Solicitação do cliente".
      // Modelo/Chassis vêm do projeto (igual o POS faz ao escolher o equipamento); se não houver projeto, usa o trator.
      const modeloDesc = modeloProj || trator || "";
      const servicoSolicitado = `Modelo: ${modeloDesc}\nChassis: ${chassisProj}\nHorimetro: \n\nSolicitação do cliente: ${args.servico}\nServiço Realizado: `;

      // Data/hora de execução = data e hora de CRIAÇÃO (só troca a data se o usuário informar)
      const agoraOS = new Date();
      const hojeISO = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agoraOS); // AAAA-MM-DD
      const horaNow = agoraOS.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
      const dataExec = /^\d{4}-\d{2}-\d{2}$/.test(String(args.data || "")) ? String(args.data) : hojeISO;

      const dados: any = {
        nomeCliente: cliente.nome, cpfCliente: cliente.documento || "", enderecoCliente: cliente.endereco || "", cidadeCliente: cliente.cidade || "",
        tecnicoResponsavel: tecnicoMatch, tipoServico: args.tipoServico || (ehRevisao ? "Revisão" : "Serviço"), servicoSolicitado,
        projeto: projetoNome, revisao: planoRevisao, qtdHoras: horas, qtdKm: km, descontoHora: descontoHoraValor, gerarPPV: pecas.length > 0,
        previsaoExecucao: dataExec, horaInicioExec: horaNow,
      };
      const totalPecas = pecas.reduce((s, p) => s + p.quantidade * p.preco, 0);
      const resumo: any[] = [
        { label: "Cliente", valor: cliente.nome },
        { label: "Técnico", valor: tecnicoMatch || "(a definir)" },
        { label: "Tipo", valor: dados.tipoServico },
        { label: "Serviço", valor: args.servico },
      ];
      if (projetoNome) resumo.push({ label: "Projeto", valor: projetoNome });
      if (ehRevisao) resumo.push({ label: "Plano revisão", valor: planoRevisao });
      if (trator) resumo.push({ label: "Trator", valor: trator });
      if (horas) resumo.push({ label: "Mão de obra", valor: `${horas}h${cortesia ? " (cortesia de fábrica — não cobra)" : ""}` });
      if (descontoHoraValor) resumo.push({ label: "Desconto", valor: `-R$ ${descontoHoraValor.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (2h cortesia)` });
      if (km) resumo.push({ label: "Deslocamento", valor: `${km} km${kmCalculado ? " (ida e volta, via Maps)" : ""}` });
      resumo.push({ label: "Data execução", valor: `${dataExec.split("-").reverse().join("/")} ${horaNow}` });
      if (pecas.length) {
        resumo.push({ label: "Peças", valor: `${pecas.length} ${pecas.length === 1 ? "item" : "itens"} — R$ ${totalPecas.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` });
        resumo.push({ label: "PPV", valor: "será gerado vinculado à OS" });
      }
      return { proposta: { tipo: "os", titulo: `OS para ${cliente.nome}`, resumo, dados, pecas } };
    }
    if (name === "propor_requisicao") {
      if (!args.titulo) return { precisa: "titulo", mensagem: "Qual o título/descrição da requisição?" };
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const H = { apikey: SK, authorization: `Bearer ${SK}` };
      const hoje = new Date().toISOString().split("T")[0];
      const norm = (s: any) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

      // Opções fixas dos dropdowns (iguais ao FormReq) — o assistente NÃO inventa, casa com a mais próxima
      const TIPOS_REQ = ["Peças", "Alimentação", "Serviço de Terceiros", "Almoxarifado", "Ferramenta", "Insumo Infra", "Veicular Abastecimento", "Veicular Manutenção", "Trator Abastecimento", "Quadri Abastecimento", "Hospedagem"];
      const SETORES_REQ = ["Trator-Loja", "Trator-Cliente", "Oficina", "Comercial"];
      const casa = (val: any, opts: string[]) => {
        const v = norm(val);
        if (!v) return "";
        return opts.find((o) => norm(o) === v) || opts.find((o) => norm(o).includes(v) || v.includes(norm(o))) || "";
      };
      const tipo = casa(args.tipo, TIPOS_REQ);
      let setor = casa(args.setor, SETORES_REQ);

      // Solicitante: tem que bater com um usuário real (financeiro_usu ativo). Não inventa.
      let solicitante = "";
      if (args.solicitante) {
        const us: any[] = await fetch(`${SB}/rest/v1/financeiro_usu?select=nome,funcao&ativo=eq.true&order=nome`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        const q = norm(args.solicitante);
        const u = us.find((x) => norm(x.nome) === q)
          || us.find((x) => norm(x.nome).includes(q))
          || us.find((x) => q.split(/\s+/).some((p) => p.length >= 3 && norm(x.nome).includes(p)));
        if (u) solicitante = u.nome;
        else return { precisa: "solicitante", mensagem: `Não achei "${args.solicitante}" na lista de solicitantes. Quem é? Opções: ${us.map((x) => x.nome).join(", ")}` };
      }

      // Ordem de Serviço: vincula e PUXA cliente + CNPJ + chassis da própria OS.
      // Id_Ordem é string tipo "OS-0470" — tenta o valor cru, depois OS-#### com zero à esquerda, depois ilike pelos dígitos.
      let cliente = "", cliente_cnpj = "", ordem_servico = "", Chassis_Modelo = "";
      if (args.ordem) {
        const raw = String(args.ordem).trim().toUpperCase();
        const dig = (raw.match(/\d+/) || [""])[0];
        const candidatos = [...new Set([raw, dig ? `OS-${dig.padStart(4, "0")}` : "", dig ? `OS-${dig}` : ""].filter(Boolean))];
        let o: any[] = [];
        for (const v of candidatos) {
          o = await fetch(`${SB}/rest/v1/Ordem_Servico?Id_Ordem=eq.${encodeURIComponent(v)}&select=Id_Ordem,Os_Cliente,Cnpj_Cliente&limit=1`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
          if (o[0]) break;
        }
        if (!o[0] && dig) {
          o = await fetch(`${SB}/rest/v1/Ordem_Servico?Id_Ordem=ilike.*${encodeURIComponent(dig)}&select=Id_Ordem,Os_Cliente,Cnpj_Cliente&order=Id_Ordem.desc&limit=1`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        }
        if (!o[0]) return { precisa: "ordem", mensagem: `Não achei a OS "${args.ordem}". Confirma o número?` };
        ordem_servico = String(o[0].Id_Ordem);
        cliente = o[0].Os_Cliente || "";
        cliente_cnpj = o[0].Cnpj_Cliente || "";
        const ch: any[] = await fetch(`${SB}/rest/v1/Ordem_Servico_Tecnicos?Ordem_Servico=eq.${encodeURIComponent(ordem_servico)}&select=Chassis&limit=1`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        if (ch[0]?.Chassis && ch[0].Chassis !== "0000") Chassis_Modelo = ch[0].Chassis;
        if (!setor) setor = "Trator-Cliente"; // vinculou cliente via OS → setor padrão
      }
      // Cliente informado direto (Trator-Cliente sem OS)
      if (!cliente && args.cliente) {
        const rc = await fetch(`${origin}/api/ppv/clientes?termo=${encodeURIComponent(args.cliente)}`).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        const c = Array.isArray(rc) ? rc[0] : null;
        if (c) { cliente = c.nome; cliente_cnpj = c.documento || ""; }
        else cliente = String(args.cliente).toUpperCase();
      }

      // Ferramenta: destinação (Uso Pessoal / Geral)
      let quemFerramenta = "";
      if (tipo === "Ferramenta") {
        const qf = norm(args.quem_ferramenta);
        if (qf.includes("pessoal")) quemFerramenta = "Uso Pessoal";
        else if (qf.includes("geral")) quemFerramenta = "Geral";
      }

      // Abastecimento: litros de combustível; hodômetro (opcional)
      const ehAbastecimento = ["Trator Abastecimento", "Quadri Abastecimento", "Veicular Abastecimento"].includes(tipo);
      const litros = (args.litros != null && String(args.litros).trim() !== "") ? String(args.litros).trim() : "";
      const hodometro = String(args.hodometro || "").trim();

      // Veicular: casa a placa na lista (SupaPlacas)
      const ehVeicular = ["Veicular Abastecimento", "Veicular Manutenção"].includes(tipo);
      let veiculoId = "", veiculoPlaca = "", placasLista: string[] = [];
      if (ehVeicular) {
        const vs: any[] = await fetch(`${SB}/rest/v1/SupaPlacas?select=IdPlaca,NumPlaca&order=NumPlaca`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        placasLista = vs.map((v) => v.NumPlaca);
        if (args.veiculo) {
          const q = norm(args.veiculo).replace(/[^a-z0-9]/g, "");
          const v = vs.find((x) => norm(x.NumPlaca).replace(/[^a-z0-9]/g, "") === q) || vs.find((x) => norm(x.NumPlaca).replace(/[^a-z0-9]/g, "").includes(q));
          if (v) { veiculoId = String(v.IdPlaca); veiculoPlaca = v.NumPlaca; }
        }
      }

      // Projeto/Chassis direto (casa com projeto existente; se não achar, vira texto livre do chassi/modelo)
      let projeto_codigo = "", projeto_nome = "";
      if (args.projeto) {
        const q = String(args.projeto).replace(/[%,()*]/g, " ").trim();
        const pr: any[] = await fetch(`${SB}/rest/v1/portal_nt_projetos_PRINCIPAL?select=codigo,nome&nome=ilike.*${encodeURIComponent(q)}*&limit=1`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        if (pr[0]) { projeto_codigo = String(pr[0].codigo); projeto_nome = pr[0].nome; if (!Chassis_Modelo) Chassis_Modelo = pr[0].nome; }
        else if (!Chassis_Modelo) Chassis_Modelo = String(args.projeto).toUpperCase();
      }

      // Valor cobrado do cliente = custo real + 20% (× 1,20). Se vier o valor final direto, usa ele.
      const custoReal = (args.custo != null && String(args.custo).trim() !== "") ? parseFloat(String(args.custo).replace(",", ".").replace(/[^\d.]/g, "")) : NaN;
      const temCusto = !isNaN(custoReal) && custoReal > 0;
      let valorCliente = "";
      if (temCusto) valorCliente = (Math.round(custoReal * 1.2 * 100) / 100).toFixed(2);
      else if (args.valor_cliente != null && String(args.valor_cliente).trim() !== "") valorCliente = String(args.valor_cliente).trim();

      // GATE de campos obrigatórios — PERGUNTA tudo que falta ANTES de criar, mostrando as opções REAIS
      const motivo = String(args.obs || "").trim();
      const faltam: string[] = [];
      if (!tipo) faltam.push(`o **tipo** — escolha uma destas opções: ${TIPOS_REQ.join(", ")}`);
      if (!setor) faltam.push(`o **setor destino** — escolha uma: ${SETORES_REQ.join(", ")}`);
      if (!solicitante) {
        const us: any[] = await fetch(`${SB}/rest/v1/financeiro_usu?select=nome&ativo=eq.true&order=nome`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        faltam.push(`quem é o **solicitante** — tem que ser um destes: ${us.map((u) => u.nome).join(", ")}`);
      }
      if (!motivo) faltam.push("o **motivo** (observações) — por que essa requisição é necessária");
      // Trator-Cliente: cliente, OS, projeto/chassi e custo (p/ calcular o valor cobrado = custo + 20%) são OBRIGATÓRIOS
      if (setor === "Trator-Cliente") {
        if (!cliente) faltam.push("o **cliente** (ou o número da **OS**, que já traz o cliente)");
        if (!ordem_servico) faltam.push("a **ordem de serviço (OS)**");
        if (!Chassis_Modelo && !projeto_codigo) faltam.push("o **projeto/chassi** do trator");
        if (!temCusto) faltam.push("o **custo real** da peça (o valor cobrado do cliente = custo + 20%)");
      }
      // Trator-Loja: só o chassi e modelo
      if (setor === "Trator-Loja" && !Chassis_Modelo) faltam.push("o **chassi e modelo** do trator");
      if (tipo === "Ferramenta" && !quemFerramenta) faltam.push("a **destinação da ferramenta** — Uso Pessoal ou Geral");
      if (ehAbastecimento && !litros) faltam.push("os **litros de combustível**");
      if (ehVeicular && !veiculoId) faltam.push(`o **veículo/placa**${placasLista.length ? ` — opções: ${placasLista.join(", ")}` : ""}`);
      if (faltam.length) {
        return {
          precisa: "campos",
          faltam,
          mensagem: `Antes de criar a requisição preciso confirmar alguns campos (só escolha entre as opções que já existem, não invente):\n- ${faltam.join("\n- ")}\n\nMe passa esses dados, por favor.`,
        };
      }

      const obs = (args.cobrar_cliente || valorCliente) ? `COBRAR DO CLIENTE — ${motivo}` : motivo;

      const dados: any = { titulo: String(args.titulo).toUpperCase(), tipo, setor, solicitante, data: hoje, status: "pedido", empresa: "NOVA TRATORES MÁQUINAS AGRÍCOLAS LTDA", endereco_empr: "AVENIDA SÃO SEBASTIÃO, 1065 | Piraju - SP" };
      if (ordem_servico) dados.ordem_servico = ordem_servico;
      if (cliente) dados.cliente = cliente;
      if (cliente_cnpj) dados.cliente_cnpj = cliente_cnpj;
      if (Chassis_Modelo) dados.Chassis_Modelo = Chassis_Modelo;
      if (projeto_codigo) { dados.projeto_codigo = projeto_codigo; dados.projeto_nome = projeto_nome; }
      if (quemFerramenta) dados.quem_ferramenta = quemFerramenta;
      if (litros) dados.litros_combustivel = litros;
      if (veiculoId) dados.veiculo = veiculoId;
      if (hodometro) dados.hodometro = hodometro;
      if (valorCliente) dados.valor_cobrado_cliente = valorCliente;
      if (obs) dados.obs = obs;

      const resumo = [
        { label: "Título", valor: dados.titulo },
        { label: "Data", valor: hoje.split("-").reverse().join("/") },
        { label: "Tipo", valor: dados.tipo },
        { label: "Setor", valor: dados.setor || "(não informado)" },
        { label: "Solicitante", valor: dados.solicitante || "(não informado)" },
      ];
      if (cliente) resumo.push({ label: "Cliente", valor: cliente });
      if (ordem_servico) resumo.push({ label: "OS", valor: ordem_servico });
      if (projeto_nome) resumo.push({ label: "Projeto", valor: projeto_nome });
      if (Chassis_Modelo && !projeto_nome) resumo.push({ label: "Chassis", valor: Chassis_Modelo });
      if (quemFerramenta) resumo.push({ label: "Destinação", valor: quemFerramenta });
      if (veiculoPlaca) resumo.push({ label: "Veículo", valor: veiculoPlaca });
      if (hodometro) resumo.push({ label: "Hodômetro", valor: hodometro });
      if (litros) resumo.push({ label: "Litros", valor: litros });
      if (temCusto) resumo.push({ label: "Custo real", valor: `R$ ${custoReal.toFixed(2)}` });
      if (valorCliente) resumo.push({ label: "Valor cobrado", valor: `R$ ${valorCliente}${temCusto ? " (custo + 20%)" : ""}` });
      if (obs) resumo.push({ label: "Motivo", valor: obs });
      return { proposta: { tipo: "requisicao", titulo: dados.titulo, resumo, dados } };
    }
    if (name === "usuarios_portal") {
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const H = { apikey: SK, authorization: `Bearer ${SK}` };
      const acao = String(args.acao || "contar");
      if (acao === "contar") {
        const all: any[] = await fetch(`${SB}/rest/v1/financeiro_usu?select=ativo`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        const ativos = all.filter((u) => u.ativo !== false).length;
        return { total: all.length, ativos, inativos: all.length - ativos };
      }
      if (acao === "listar") {
        const us: any[] = await fetch(`${SB}/rest/v1/financeiro_usu?select=nome,funcao,ativo&order=nome`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        return { total: us.length, usuarios: us.map((u) => ({ nome: u.nome, funcao: u.funcao || "", ativo: u.ativo !== false })) };
      }
      if (acao === "historico") {
        const nome = String(args.nome || "").replace(/[%,()*]/g, " ").trim();
        if (!nome) return { precisa: "nome", mensagem: "De qual usuário você quer o histórico?" };
        const us: any[] = await fetch(`${SB}/rest/v1/financeiro_usu?select=id,nome,funcao&nome=ilike.*${encodeURIComponent(nome)}*&limit=1`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        if (!us[0]) return { encontrado: false, mensagem: `Não achei usuário "${args.nome}".` };
        const logs: any[] = await fetch(`${SB}/rest/v1/audit_log?user_id=eq.${us[0].id}&select=created_at,sistema,acao,entidade_label&order=created_at.desc&limit=15`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []);
        return { encontrado: true, usuario: { nome: us[0].nome, funcao: us[0].funcao || "" }, total_acoes: logs.length, acoes: logs.map((l) => ({ quando: l.created_at, sistema: l.sistema, acao: l.acao, item: l.entidade_label })) };
      }
      return { erro: "ação inválida" };
    }

    if (name === "consultar_financeiro") {
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const H = { apikey: SK, authorization: `Bearer ${SK}` };
      const STATUS_LABEL: Record<string, string> = { gerar_boleto: "Gerar Boleto", enviar_cliente: "Enviar ao Cliente", aguardando_vencimento: "Aguardando Vencimento", pago: "Pago", vencido: "Vencido", sem_boleto: "Cliente Sem Boleto", validar_pix: "Validar Recebimento", concluido: "Concluído" };
      const setorLabel = (s: any) => (s === "pecas" ? "Peças" : "Oficina");
      const hoje = new Date().toISOString().slice(0, 10);
      const setorFiltro = args.setor === "pecas" ? "&setor_destino=eq.pecas" : args.setor === "oficina" ? "&setor_destino=not.eq.pecas" : "";
      const sel = "select=id,nom_cliente,status,setor_destino,valor_servico,vencimento_boleto,num_nf_servico,num_nf_peca,forma_pagamento";
      const get = (q: string) => fetch(`${SB}/rest/v1/Chamado_NF?${q}`, { headers: H }).then((r) => (r.ok ? r.json() : [])).catch(() => []) as Promise<any[]>;

      if (args.acao === "resumo") {
        const rows = await get(`${sel}&status=neq.concluido${setorFiltro}&limit=5000`);
        const porStatus: Record<string, number> = {};
        const porSetor = { oficina: 0, pecas: 0 };
        let valorTotal = 0;
        for (const r of rows) {
          porStatus[r.status] = (porStatus[r.status] || 0) + 1;
          porSetor[r.setor_destino === "pecas" ? "pecas" : "oficina"]++;
          valorTotal += Number(r.valor_servico || 0);
        }
        const vencidos = rows.filter((r) => r.status === "vencido" || (r.status === "aguardando_vencimento" && r.vencimento_boleto && r.vencimento_boleto < hoje)).length;
        return {
          total_abertos: rows.length,
          por_fase: Object.entries(porStatus).map(([s, n]) => ({ fase: STATUS_LABEL[s] || s, quantidade: n })),
          por_setor: { Oficina: porSetor.oficina, Pecas: porSetor.pecas },
          vencidos_ou_atrasados: vencidos,
          valor_total_aberto: valorTotal,
        };
      }
      if (args.acao === "por_status") {
        if (!args.status) return { precisa: "status", mensagem: "De qual fase? (ex.: aguardando_vencimento, vencido, pago)" };
        const rows = await get(`${sel}&status=eq.${args.status}${setorFiltro}&order=id.desc&limit=200`);
        return { fase: STATUS_LABEL[args.status] || args.status, total: rows.length, exemplos: rows.slice(0, 8).map((r) => ({ id: r.id, cliente: r.nom_cliente, setor: setorLabel(r.setor_destino), valor: r.valor_servico, vencimento: r.vencimento_boleto })) };
      }
      if (args.acao === "vencidos") {
        const venc = await get(`${sel}&status=eq.vencido${setorFiltro}&order=vencimento_boleto.asc&limit=200`);
        const atras = await get(`${sel}&status=eq.aguardando_vencimento&vencimento_boleto=lt.${hoje}${setorFiltro}&order=vencimento_boleto.asc&limit=200`);
        const all = [...venc, ...atras];
        return { total: all.length, itens: all.slice(0, 10).map((r) => ({ id: r.id, cliente: r.nom_cliente, setor: setorLabel(r.setor_destino), valor: r.valor_servico, vencimento: r.vencimento_boleto, fase: STATUS_LABEL[r.status] || r.status })) };
      }
      if (args.acao === "por_cliente") {
        const cli = String(args.cliente || "").replace(/[%,()*]/g, " ").trim();
        if (!cli) return { precisa: "cliente", mensagem: "De qual cliente?" };
        const rows = await get(`${sel}&nom_cliente=ilike.*${encodeURIComponent(cli)}*${setorFiltro}&order=id.desc&limit=100`);
        return { cliente: args.cliente, total: rows.length, chamados: rows.slice(0, 12).map((r) => ({ id: r.id, cliente: r.nom_cliente, fase: STATUS_LABEL[r.status] || r.status, setor: setorLabel(r.setor_destino), valor: r.valor_servico, vencimento: r.vencimento_boleto, nf: [r.num_nf_servico && `S ${r.num_nf_servico}`, r.num_nf_peca && `P ${r.num_nf_peca}`].filter(Boolean).join(" / ") })) };
      }
      return { erro: "ação inválida" };
    }
    // ===== MEMÓRIA APRENDIDA =====
    if (name === "ensinar" || name === "atualizar_memoria" || name === "esquecer_memoria" || name === "listar_memoria") {
      const SB = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
      const SK = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
      const H = { apikey: SK, authorization: `Bearer ${SK}`, "Content-Type": "application/json" } as Record<string, string>;
      const TBL = `${SB}/rest/v1/tratorilson_memoria`;
      const semTabela = "A memória ainda não foi configurada no banco (falta rodar o SQL create-tratorilson-memoria.sql). Avise o TI.";

      // Escritas são só para administradores
      if (name !== "listar_memoria" && !isAdmin) {
        return { sem_acesso: true, mensagem: "Só administradores podem ensinar/alterar a memória do Tratorilson. Diga isso ao usuário, com gentileza." };
      }

      const acharPorBusca = async (busca: string): Promise<any | null> => {
        const q = String(busca || "").replace(/[%,()*]/g, " ").trim();
        if (!q) return null;
        const r = await fetch(`${TBL}?ativo=eq.true&conteudo=ilike.*${encodeURIComponent(q)}*&select=id,conteudo&limit=1`, { headers: H });
        if (!r.ok) return null;
        const d = await r.json().catch(() => []);
        return d[0] || null;
      };

      if (name === "listar_memoria") {
        const r = await fetch(`${TBL}?ativo=eq.true&select=id,conteudo&order=id.asc`, { headers: H });
        if (!r.ok) return { erro: semTabela };
        const d: any[] = await r.json().catch(() => []);
        return { total: d.length, memoria: d.map((m) => ({ id: m.id, regra: m.conteudo })) };
      }

      if (name === "ensinar") {
        const conteudo = String(args.conteudo || "").trim();
        if (!conteudo) return { precisa: "conteudo", mensagem: "O que você quer que eu guarde na memória?" };
        const r = await fetch(TBL, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify({ conteudo, criado_por: ctx?.userName || "" }) });
        if (!r.ok) return { erro: semTabela };
        const d = await r.json().catch(() => []);
        return { ok: true, id: d?.[0]?.id, mensagem: "Regra guardada na memória. Vou seguir isso a partir de agora." };
      }

      if (name === "atualizar_memoria") {
        const conteudo = String(args.conteudo || "").trim();
        if (!conteudo) return { precisa: "conteudo", mensagem: "Qual o novo conteúdo da regra?" };
        let id = args.id;
        if (!id && args.busca) { const m = await acharPorBusca(args.busca); if (m) id = m.id; }
        if (!id) return { precisa: "id", mensagem: "Não achei qual regra alterar. Me diz o número (use listar_memoria) ou descreve melhor." };
        const r = await fetch(`${TBL}?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", headers: H, body: JSON.stringify({ conteudo, updated_at: new Date().toISOString() }) });
        if (!r.ok) return { erro: semTabela };
        return { ok: true, id, mensagem: "Regra atualizada na memória." };
      }

      if (name === "esquecer_memoria") {
        let id = args.id;
        if (!id && args.busca) { const m = await acharPorBusca(args.busca); if (m) id = m.id; }
        if (!id) return { precisa: "id", mensagem: "Qual regra você quer que eu esqueça? Diz o número (listar_memoria) ou descreve." };
        const r = await fetch(`${TBL}?id=eq.${encodeURIComponent(String(id))}`, { method: "PATCH", headers: H, body: JSON.stringify({ ativo: false, updated_at: new Date().toISOString() }) });
        if (!r.ok) return { erro: semTabela };
        return { ok: true, id, mensagem: "Esqueci essa regra (removida da memória)." };
      }
    }
  } catch (e: any) {
    return { erro: e?.message || "falha na ferramenta" };
  }
  return { erro: "ferramenta desconhecida" };
}

// Moderação: termos claramente impróprios (sexuais/ofensivos) que não aparecem no dia a dia de peças/tratores.
// Conservador de propósito pra não bloquear conversa normal. Tira acento antes de testar.
const REGEX_IMPROPRIO = /\b(sexo|sexual|sexuais|transar|transando|nudes?|pelado|pelada|pornografia|porno|porno|porn|buceta|boceta|xoxota|piroca|caralho|punheta|punhetinha|gozada|gozando|tesao|putaria|siririca|vagina|penis|orgasmo|ninfeta|gostosa|gostoso|safadeza|cantada|puta|viado|corno|masturb\w*|fod\w*|fud\w*|tarad\w*)\b/;
function mensagemImpropria(texto: string): boolean {
  const t = String(texto || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return REGEX_IMPROPRIO.test(t);
}
const AVISO_IMPROPRIO = "Opa, não posso falar sobre isso e apaguei sua mensagem. Por favor, não escreva esse tipo de coisa aqui — este é o chat de trabalho da Nova Tratores. Se precisar de algo do portal, é só pedir.";

export async function POST(req: NextRequest) {
  const ia = getIA();
  let messages: { role: string; content: string }[] = [];
  let userName = "", userId = "", isAdmin = false, modulos: string[] = [];
  try {
    const b = await req.json();
    messages = Array.isArray(b.messages) ? b.messages : [];
    userName = String(b.userName || "");
    userId = String(b.userId || "");
    isAdmin = b.isAdmin === true;
    modulos = Array.isArray(b.modulos) ? b.modulos : [];
  } catch {}

  // Moderação: se a ÚLTIMA mensagem do usuário for imprópria, bloqueia na hora (sem chamar a IA)
  // e sinaliza pra UI apagar a mensagem.
  const ultimaUser = [...messages].reverse().find((m) => m.role === "user");
  if (ultimaUser && mensagemImpropria(ultimaUser.content)) {
    return NextResponse.json({ bloqueado: true, reply: AVISO_IMPROPRIO });
  }

  if (!ia.key) {
    return NextResponse.json({ reply: "Opa! Ainda não estou ligado na IA — falta configurar a chave (OPENAI_API_KEY). Avisa o pessoal do TI." });
  }

  // Contexto de permissões — Tratorilson só fala dos módulos que a pessoa tem acesso
  const pode = (mod: string) => isAdmin || modulos.includes(mod);
  const ctx = { isAdmin, pode, userName };
  const modsAcesso = isAdmin
    ? "TODOS os módulos (é administrador)"
    : (modulos.length ? modulos.map((m) => MOD_LABELS[m] || m).join(", ") : "nenhum módulo específico");

  const agora = new Date();
  const dataHoje = agora.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric", timeZone: "America/Sao_Paulo" });
  const horaAgora = agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });

  const sys = `Hoje é ${dataHoje}, e agora são ${horaAgora} (horário de Brasília). Use isso se perguntarem a data/hora.\n\n` +
    TRATORINO_PERSONA + "\n\n" + TRATORINO_CONHECIMENTO +
    "\n\nVOCÊ TEM FERRAMENTAS para consultar dados reais do portal: explorar a estrutura dos catálogos dos tratores (tratores, sistemas e figuras), buscar peças, kit de revisão, histórico de cliente, consultar projetos (cada projeto é uma máquina/chassi, ligada ao cliente do último faturamento), informações de usuários (admin) e propor criação de orçamento/PPV/OS/requisição. " +
    "Sobre PROJETOS: se perguntarem de quem é um projeto/chassi, ou quais máquinas/projetos são de um cliente, USE consultar_projeto — ele já traz junto o CONTROLE DE REVISÕES do trator (revisões feitas, a última e a PRÓXIMA pendente). Informe as revisões também quando fizer sentido. O vínculo projeto→cliente é pelo CPF/CNPJ do último faturamento; se um projeto ainda não foi faturado, ele não tem cliente vinculado (diga isso, não invente). Se o chassi não estiver no controle de revisões, diga que não há registro de revisões. " +
    "Você conhece o catálogo de TODOS os tratores: se perguntarem o que tem no catálogo de um trator, quais sistemas ou figuras ele tem, USE explorar_catalogo. " +
    "FINANCEIRO: se perguntarem sobre chamados de NF/boletos, quantidades por fase, o que está vencido/atrasado, valores em aberto, ou os chamados de um cliente, USE consultar_financeiro (acao=resumo, por_status, vencidos ou por_cliente; dá pra filtrar por setor oficina ou pecas). Apresente valores em reais e de forma organizada. " +
    "Quando der pra responder com dados, USE a ferramenta e traga a informação pronta — não mande o usuário fazer manualmente. " +
    "FORMATO DAS RESPOSTAS: seja claro, organizado e enxuto. Use **negrito** pra destacar (códigos, nomes, totais), listas com '- ' quando ajudar, e frases curtas. Comece com uma frase curta de contexto, não com uma parede de texto. " +
    "AO LISTAR PEÇAS: mostre no máximo 6 a 8 itens MAIS RELEVANTES, um por linha no formato '- `código` — Nome (preço, se houver)'. DESCARTE itens claramente fora do contexto (numa busca de 'motor', ignore coisas como 'motor do limpa-vidros', 'etiqueta', 'chicote'); foque na peça que a pessoa quer. Se vierem muitos resultados, diga quantos achou no total, mostre só os principais e PERGUNTE como filtrar (qual peça específica, ou qual sistema). Nunca despeje uma lista grande e crua. " +
    "No HISTÓRICO de cliente: separe por FAZENDA (cada CNPJ é uma fazenda) e mostre o endereço de cada uma; destaque o serviço mais recente; e SEMPRE apresente os links (PDF da OS, NF, PPV, requisição, pasta do cliente) como links clicáveis no formato markdown [texto](url).\n\n" +
    "REVISÕES: existem PLANOS DE REVISÃO prontos (o escopo de cada revisão — 50h, 300h, 600h...). Se perguntarem o que tem/o que vai numa revisão de X horas, USE buscar_plano_revisao (escopo) e, se quiserem as peças com código/preço, kit_revisao. Ao ABRIR UMA OS DE REVISÃO: chame propor_os passando 'revisao_horas' (o NÚMERO de horas que o usuário falou, ex.: 900), 'trator' (o modelo) e 'servico'. O SISTEMA busca o plano CERTO por essas horas e importa o kit de peças sozinho (gerando o PPV vinculado) — NÃO precisa montar 'pecas' à mão, nem chamar buscar_plano_revisao/kit_revisao pra criar a OS. NUNCA troque as horas que o usuário pediu (900 é 900, não 600). Se o usuário não disser o trator, pergunte (é obrigatório pra importar o kit). HORAS DE SERVIÇO da revisão (o sistema já preenche sozinho, não precisa informar): revisão de 50h e 900h = 2h mas com desconto de 2h (cortesia da fábrica, não cobra mão de obra); 1200h e 2400h = 6h; todas as outras = 3h.\n\n" +
    "AO ABRIR OS (Ordem de Serviço): se o serviço envolve TROCA/USO DE PEÇAS, inclua as peças em 'pecas' no propor_os — isso já gera um PPV de peças VINCULADO à OS automaticamente. Se for só mão de obra/visita, abra a OS sem peças. Para um pedido só de peças (sem serviço), use propor_ppv (PPV avulso). TÉCNICO: passe só o primeiro nome (ex.: 'Danilo') — o sistema casa com o técnico real. PROJETO/EQUIPAMENTO: se o usuário citar (mesmo só o final do chassi), passe em 'projeto' — o sistema casa com o projeto existente e preenche modelo/chassis. DESCRIÇÃO: NUNCA reescreva o texto todo — passe em 'servico' APENAS o que o cliente pediu; o sistema encaixa no campo 'Solicitação do cliente' do modelo padrão. O que o usuário colocar ENTRE ASPAS é exatamente a solicitação de serviço (ex.: faça uma OS pro cliente X, técnico Danilo, \"troca da bucha do pivô\" → servico = \"troca da bucha do pivô\"). LOCALIZAÇÃO: se o usuário mandar um link de localização do Google Maps (ou um endereço), passe em 'localizacao' — o sistema calcula sozinho o km de IDA E VOLTA da oficina até o local e preenche o deslocamento. DATA: a data/hora de execução já fica a de hoje automaticamente — só passe 'data' (AAAA-MM-DD) se o usuário falar outra data. Depois de criar, aparece o botão 'Abrir / Imprimir' que já abre a OS pronta pra impressão.\n\n" +
    "AO CRIAR REQUISIÇÃO: EXTRAIA da frase do usuário tudo que der e JÁ CHAME propor_requisicao — NÃO fique perguntando o que dá pra deduzir. A própria ferramenta avisa o que faltar. Como interpretar a frase: o que vão COMPRAR/precisa = título + tipo (peça de máquina → 'Peças'; consumível/material de oficina ou infra — tinta, spray, lixa, cola, material de limpeza, EPI, etc. → 'Insumo Infra'); 'para o FULANO' / 'o FULANO pediu' = solicitante; 'do cliente X' / 'do trator do X' = cliente (e setor 'Trator-Cliente'); 'trator NNNN' / chassi = projeto; 'porque/pois ...' = motivo (obs). Ex.: 'requisição pra comprar uma bomba hidráulica pro trator 6118 do José Adilson, que queimou, para o Gabriel' → titulo='Bomba hidráulica trator 6118', tipo='Peças', setor='Trator-Cliente', cliente='José Adilson', projeto='6118', solicitante='Gabriel', obs='a bomba hidráulica queimou'. Por SETOR: Trator-Cliente exige cliente, OS, projeto/chassi e o CUSTO REAL da peça (passe em 'custo' — o valor cobrado do cliente é calculado sozinho como custo + 20%); Trator-Loja exige o chassi e modelo (passe em 'projeto'); Oficina e Comercial são simples (só os campos base). Só PERGUNTE (mostrando as opções válidas que a ferramenta retornar) quando ela disser que falta algo obrigatório. Tipo/setor/solicitante são dropdowns — sempre um valor que JÁ EXISTE, nunca invente. \n\n" +
    "LIBERDADE: pode raciocinar e fazer suposições razoáveis a partir do contexto e dos dados das ferramentas — quando for suposição, deixe claro (ex.: 'provavelmente', 'imagino que'). Antes de dizer que não sabe algo do portal, TENTE usar uma ferramenta para descobrir. Mas dados concretos (números, códigos, preços, nomes, quantidades) só com base nas ferramentas/dados reais; nunca invente.\n\n" +
    `CONTROLE DE ACESSO: o usuário atual é "${userName || "sem nome"}" e tem acesso aos módulos: ${modsAcesso}. Você só pode ajudar e falar sobre os módulos a que ele tem acesso. Se ele perguntar sobre um módulo que NÃO está nessa lista, diga educadamente que ele não tem acesso a esse módulo e que fale com um administrador — não dê a informação nem ensine a usar. ` +
    (isAdmin
      ? "Ele é ADMINISTRADOR: pode ver dados administrativos, incluindo quantidade, lista e histórico de usuários do portal."
      : "Ele NÃO é administrador: NÃO forneça dados administrativos (lista de usuários, permissões, histórico de outros usuários) — diga que isso é só para administradores.");

  // Memória aprendida — instrução fixa + as regras que a equipe ensinou (injetadas no prompt)
  const memInstr = "\n\nMEMÓRIA: você pode ser ENSINADO. Quando um ADMIN te ensinar uma regra/fato pra lembrar sempre ('lembre que...', 'de agora em diante...', 'a regra é...'), use a ferramenta 'ensinar' pra guardar (e confirme). Pra ver o que já sabe use 'listar_memoria'; pra mudar uma regra, 'atualizar_memoria'; pra remover, 'esquecer_memoria'. SIGA sempre as regras da memória abaixo.";
  let memTexto = "";
  try {
    const SBm = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
    const SKm = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
    const rm = await fetch(`${SBm}/rest/v1/tratorilson_memoria?ativo=eq.true&select=id,conteudo&order=id.asc`, { headers: { apikey: SKm, authorization: `Bearer ${SKm}` } });
    if (rm.ok) {
      const ms: any[] = await rm.json().catch(() => []);
      if (ms.length) memTexto = "\n\nREGRAS APRENDIDAS (siga-as):\n" + ms.map((m) => `- [#${m.id}] ${m.conteudo}`).join("\n");
    }
  } catch {}

  const limpos = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-8)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 1500) }));

  const convo: any[] = [{ role: "system", content: sys + memInstr + memTexto }, ...limpos];

  try {
    for (let step = 0; step < 3; step++) {
      const j = await chamarIA({ temperature: 0.3, max_tokens: 600, messages: convo, tools: TOOLS, tool_choice: "auto" });
      const m = j?.choices?.[0]?.message;
      if (m?.tool_calls?.length) {
        convo.push(m);
        let proposta: any = null;
        for (const tc of m.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
          const result = await execTool(req.nextUrl.origin, tc.function?.name, args, ctx);
          if (result?.proposta) proposta = result.proposta;
          convo.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(result) });
        }
        if (proposta) {
          return NextResponse.json({ reply: "Montei a proposta abaixo. Confere o cliente e os itens — se estiver certo, clica em Confirmar e criar.", proposta });
        }
        continue;
      }
      return NextResponse.json({ reply: (m?.content || "").trim() || "Não consegui formular a resposta. Pode reformular?" });
    }
    // se ainda quis ferramenta no último passo, força uma resposta final
    const fim = await chamarIA({ temperature: 0.3, max_tokens: 600, messages: convo });
    return NextResponse.json({ reply: (fim?.choices?.[0]?.message?.content || "").trim() || "Não consegui finalizar. Tenta reformular?" });
  } catch (e: any) {
    const msg = String(e?.message || "");
    if (msg.includes(" 429") || msg.toLowerCase().includes("rate limit") || msg.toLowerCase().includes("quota")) {
      const porDia = msg.includes("per day") || msg.includes("TPD");
      return NextResponse.json({
        reply: porDia
          ? "Puxa, atingi meu limite diário de uso da IA por hoje. Ele renova automaticamente amanhã. Se precisar de mais, o pessoal do TI pode aumentar o plano da OpenAI."
          : "Estou recebendo muitas mensagens ao mesmo tempo. Espera uns segundinhos e manda de novo, por favor.",
        erro: msg,
      });
    }
    return NextResponse.json({ reply: "Tive um problema pra responder agora. Tenta de novo daqui a pouco?", erro: msg });
  }
}
