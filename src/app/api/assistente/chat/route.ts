import { NextRequest, NextResponse } from "next/server";
import { TRATORINO_PERSONA, TRATORINO_CONHECIMENTO } from "@/lib/assistente/conhecimento";

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

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
      description: "Monta uma PROPOSTA de Ordem de Serviço (OS) — não cria ainda. Use quando o usuário pedir para CRIAR/ABRIR uma OS. Informe o cliente e o serviço solicitado; técnico e tipo são opcionais. O usuário confirma num botão.",
      parameters: {
        type: "object",
        properties: {
          cliente: { type: "string", description: "Nome ou CNPJ do cliente" },
          servico: { type: "string", description: "Serviço solicitado / descrição do problema" },
          tecnico: { type: "string", description: "Técnico responsável (opcional)" },
          tipoServico: { type: "string", description: "Tipo de serviço, ex.: Revisão, Garantia, Manutenção (opcional)" },
        },
        required: ["cliente", "servico"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "propor_requisicao",
      description: "Monta uma PROPOSTA de Requisição — não cria ainda. Use quando o usuário pedir para CRIAR/FAZER uma requisição. Informe o título/descrição; tipo, setor e solicitante são opcionais. O usuário confirma num botão.",
      parameters: {
        type: "object",
        properties: {
          titulo: { type: "string", description: "Título/descrição da requisição, ex.: Compra de filtros para o 6065" },
          tipo: { type: "string", description: "Tipo da requisição (opcional)" },
          setor: { type: "string", description: "Setor (opcional)" },
          solicitante: { type: "string", description: "Quem está solicitando (opcional)" },
        },
        required: ["titulo"],
      },
    },
  },
];

async function execTool(origin: string, name: string, args: any) {
  try {
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
    if (name === "buscar_pecas") {
      const q = ((args.consulta || "") + (args.modelo ? " " + args.modelo : "")).trim();
      const r = await fetch(`${origin}/api/catalogo?acao=robo&q=${encodeURIComponent(q)}`);
      const d = r.ok ? await r.json() : { grupos: [] };
      const grupos = (d.grupos || []).slice(0, 15).map((g: any) => ({ codigo: g.code, nome: g.name, qtd: g.qtd, tratores: (g.tratores || []).map((t: any) => t.modelo) }));
      return { total: grupos.length, pecas: grupos };
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
      const dados = {
        nomeCliente: cliente.nome, cpfCliente: cliente.documento || "", enderecoCliente: cliente.endereco || "", cidadeCliente: cliente.cidade || "",
        tecnicoResponsavel: args.tecnico || "", tipoServico: args.tipoServico || "Serviço", servicoSolicitado: args.servico,
      };
      const resumo = [
        { label: "Cliente", valor: cliente.nome },
        { label: "Técnico", valor: args.tecnico || "(a definir)" },
        { label: "Tipo", valor: dados.tipoServico },
        { label: "Serviço", valor: args.servico },
      ];
      return { proposta: { tipo: "os", titulo: `OS para ${cliente.nome}`, resumo, dados } };
    }
    if (name === "propor_requisicao") {
      if (!args.titulo) return { precisa: "titulo", mensagem: "Qual o título/descrição da requisição?" };
      const hoje = new Date().toISOString().split("T")[0];
      const dados = { titulo: String(args.titulo).toUpperCase(), tipo: args.tipo || "Compra", setor: args.setor || "", solicitante: args.solicitante || "", data: hoje, status: "pedido" };
      const resumo = [
        { label: "Título", valor: dados.titulo },
        { label: "Tipo", valor: dados.tipo },
        { label: "Setor", valor: dados.setor || "(não informado)" },
        { label: "Solicitante", valor: dados.solicitante || "(não informado)" },
      ];
      return { proposta: { tipo: "requisicao", titulo: dados.titulo, resumo, dados } };
    }
  } catch (e: any) {
    return { erro: e?.message || "falha na ferramenta" };
  }
  return { erro: "ferramenta desconhecida" };
}

async function groq(key: string, body: any) {
  const r = await fetch(GROQ_URL, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error("groq " + r.status + " " + (await r.text()).slice(0, 200));
  return r.json();
}

export async function POST(req: NextRequest) {
  const key = process.env.GROQ_API_KEY;
  let messages: { role: string; content: string }[] = [];
  try { const b = await req.json(); messages = Array.isArray(b.messages) ? b.messages : []; } catch {}

  if (!key) {
    return NextResponse.json({ reply: "Opa! Ainda não estou ligado na IA — falta configurar a chave do Groq (GROQ_API_KEY). Avisa o pessoal do TI." });
  }

  const sys = TRATORINO_PERSONA + "\n\n" + TRATORINO_CONHECIMENTO +
    "\n\nVOCÊ TEM FERRAMENTAS para consultar dados reais do portal (kit de revisão e busca de peças no catálogo). " +
    "Quando der pra responder com dados, USE a ferramenta e traga a informação pronta (liste as peças, etc.) — não mande o usuário fazer manualmente. " +
    "Ao listar peças, mostre código, descrição e quantidade de forma organizada.";

  const limpos = messages
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 2000) }));

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const convo: any[] = [{ role: "system", content: sys }, ...limpos];

  try {
    for (let step = 0; step < 3; step++) {
      const j = await groq(key, { model, temperature: 0.3, max_tokens: 900, messages: convo, tools: TOOLS, tool_choice: "auto" });
      const m = j?.choices?.[0]?.message;
      if (m?.tool_calls?.length) {
        convo.push(m);
        let proposta: any = null;
        for (const tc of m.tool_calls) {
          let args: any = {};
          try { args = JSON.parse(tc.function?.arguments || "{}"); } catch {}
          const result = await execTool(req.nextUrl.origin, tc.function?.name, args);
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
    const fim = await groq(key, { model, temperature: 0.3, max_tokens: 900, messages: convo });
    return NextResponse.json({ reply: (fim?.choices?.[0]?.message?.content || "").trim() || "Não consegui finalizar. Tenta reformular?" });
  } catch (e: any) {
    return NextResponse.json({ reply: "Tive um problema pra responder agora. Tenta de novo daqui a pouco?", erro: e?.message });
  }
}
