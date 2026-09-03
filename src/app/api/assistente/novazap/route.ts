// Tratorilson no NovaZap (ChatWoot): o Rails do zap manda a conversa pra cá
// e recebe a resposta pronta do modo cliente. Protegido por token simples
// (mesmo padrão do vigia): TRATORILSON_TOKEN no env ou o padrão embutido.
// O uso é registrado no tratorilson_log (tipo 'novazap:auto').
//
// FERRAMENTAS (function calling): a IA consulta dados reais do portal —
//  - buscar_trator(final_chassi): acha o trator (modelo/cliente/revisões)
//  - orcamento_revisao(modelo, horas): kit de revisão com peças e valores
import { NextRequest, NextResponse } from "next/server";
import { PERSONA_CLIENTE_WHATSAPP } from "@/lib/assistente/conhecimento";
import { chamarIA, getIA } from "@/lib/assistente/ia";
import { logTratorilson } from "@/lib/assistente/log";
import { geocodificar, rotaDaOficina } from "@/lib/pos/ors";

export const dynamic = "force-dynamic";

const TOKEN_PADRAO = "tratorilson-nt-6049";

const SB = () => process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const SK = () =>
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const HDR = () => ({ apikey: SK(), authorization: `Bearer ${SK()}` });
const rest = (caminho: string) =>
  fetch(`${SB()}/rest/v1/${caminho}`, { headers: HDR() })
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);

interface MsgEntrada {
  de?: string; // 'cliente' | 'loja'
  texto?: string;
}

// ---------- ferramentas ----------

const REV_PADRAO = ["50h", "300h", "600h", "900h", "1200h", "1500h", "1800h", "2100h", "2400h", "2700h", "3000h"];

async function buscarTrator(finalChassi: string) {
  const fim = String(finalChassi || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (fim.length < 3) return { encontrado: false, mensagem: "Final de chassi muito curto — peça pelo menos os 4 últimos caracteres." };

  // fonte normalizada (um chassi por linha)
  let achados: any[] = await rest(
    `portal_nt_projetos_chassis?select=chassis,modelo,cliente_nome_ultimo,empresa&chassis=ilike.*${encodeURIComponent(fim)}&limit=5`
  );
  // fallback: nome do projeto ("MODELO CHASSI")
  if (!achados.length) {
    const projetos: any[] = await rest(
      `portal_nt_projetos_PRINCIPAL?select=nome,cliente_nome_ultimo,empresa&nome=ilike.*${encodeURIComponent(fim)}*&limit=5`
    );
    achados = projetos.map((p) => {
      const toks = String(p.nome || "").toUpperCase().match(/[A-Z0-9-]{6,}/g) || [];
      const chassi = toks.sort((a, b) => ((b.match(/\d/g) || []).length - (a.match(/\d/g) || []).length) || b.length - a.length)[0] || "";
      return { chassis: chassi, modelo: String(p.nome || "").replace(chassi, "").trim(), cliente_nome_ultimo: p.cliente_nome_ultimo, empresa: p.empresa };
    });
  }
  if (!achados.length) return { encontrado: false, mensagem: `Nenhum trator com chassi terminando em "${fim}". Peça o chassi completo (fica na plaqueta).` };

  // controle de revisões Mahindra (última feita / próxima pendente)
  const comRevisoes = await Promise.all(
    achados.map(async (a) => {
      const tr: any[] = await rest(`tratores?select=*&Chassis=ilike.*${encodeURIComponent(String(a.chassis || "").trim())}*&limit=1`);
      const t = tr[0];
      let revisoes: any = null;
      if (t) {
        const feitas = REV_PADRAO.filter((h) => t[`${h} Data`]).map((h) => ({ rev: h, data: t[`${h} Data`], horimetro: t[`${h} Horimetro`] || null }));
        revisoes = { ultima_feita: feitas[feitas.length - 1] || null, proxima_pendente: REV_PADRAO.find((h) => !t[`${h} Data`]) || null };
      }
      return {
        chassi: a.chassis,
        final_chassi: String(a.chassis || "").slice(-6),
        modelo: a.modelo || null,
        cliente: a.cliente_nome_ultimo || null,
        revisoes,
      };
    })
  );
  return { encontrado: true, total: comRevisoes.length, tratores: comRevisoes };
}

// REGRAS DE MÃO DE OBRA das revisões (passadas pelo José, 02/09/2026):
//  - 50h: cortesia da fábrica (não cobra mão de obra)
//  - 300h/600h: 2h · 900h: cortesia da fábrica (não cobra)
//  - 1200h: 6h — inclui regulagem de válvulas, trator fica no mínimo 1 noite
//  - acima de 1200h o ciclo REPETE de 300 em 300 usando os kits de 300..1200
//    (1500=300, 1800=600, 2100=900 — SEM cortesia —, 2400=1200, 2700=300...)
//  - 3000h fecha o ciclo obrigatório; depois continua a conta (3300=300...)
const CICLO_REVISAO = [300, 600, 900, 1200];

function regraRevisao(hPedidas: number) {
  // horímetro solto (ex.: 4000) → revisão múltipla de 300 mais próxima
  let h = hPedidas === 50 ? 50 : Math.round(hPedidas / 300) * 300;
  if (h < 50) h = 50;
  const arredondada = h !== hPedidas;

  if (h === 50) {
    return {
      revisao: 50, kitDe: 50, maoObraHoras: 0, cortesia: true, arredondada,
      obs: ["A revisão de 50h é cortesia da fábrica — a mão de obra não é cobrada."],
    };
  }
  const n = h / 300;
  const kitDe = CICLO_REVISAO[(n - 1) % 4];
  const cortesia = h === 900; // só a 900 "original" (a 2100 usa o kit da 900 mas cobra)
  const maoObraHoras = cortesia ? 0 : kitDe === 1200 ? 6 : 2;
  const obs: string[] = [];
  if (cortesia) obs.push("A revisão de 900h é cortesia da fábrica — a mão de obra não é cobrada.");
  if (kitDe === 1200) obs.push("Esta revisão inclui a regulagem de válvulas — o trator precisa ficar na oficina no mínimo 1 noite.");
  if (h !== kitDe) obs.push(`A revisão de ${h}h usa o mesmo kit de peças da revisão de ${kitDe}h.`);
  return { revisao: h, kitDe, maoObraHoras, cortesia, arredondada, obs };
}

async function orcamentoRevisao(modelo: string, horas: string) {
  const hPedidas = Number((String(horas || "").match(/\d+/) || ["0"])[0]);
  if (!hPedidas) return { encontrado: false, mensagem: "Preciso das horas da revisão (ou do horímetro) em número." };
  const regra = regraRevisao(hPedidas);

  // kits inteiros (com Cod_Prod_1..30/Qtd1..30) — sem pulo HTTP interno
  const rows: any[] = await rest(`revisoes?select=*`);
  const digitsOf = (s: any): string[] => (String(s || "").toUpperCase().match(/\d{3,}/g) || []);
  const userDig = digitsOf(modelo);
  const userHoras = `${regra.kitDe}H`;
  const row = rows.find((r) => {
    const h = String(r.Horas || "").toUpperCase().replace(/\s/g, "");
    const tDig = digitsOf(r.Trator).concat(digitsOf(r.Cod_Trator));
    return h === userHoras && tDig.some((d) => userDig.includes(d));
  });
  if (!row) {
    const combos = [...new Set(rows.filter((r) => (r.tipo || "revisao") === "revisao").map((r) => `${r.Trator} (${r.Horas})`))];
    return { encontrado: false, mensagem: `Não achei kit de revisão pra "${modelo}" / ${regra.kitDe}h.`, kits_disponiveis: combos.slice(0, 30) };
  }

  // junta os códigos/quantidades do kit
  const mapa: Record<string, number> = {};
  for (let i = 1; i <= 30; i++) {
    const codigo = String(row[`Cod_Prod_${i}`] || "").trim();
    if (!codigo || codigo.toUpperCase() === "NULL" || codigo.length < 2) continue;
    const q = parseFloat(String(row[`Qtd${i}`] || 1)) || 1;
    mapa[codigo] = (mapa[codigo] || 0) + q;
  }

  // preços em paralelo na Produtos_Completos
  const itens = await Promise.all(
    Object.entries(mapa).map(async ([codigo, quantidade]) => {
      const res: any[] = await rest(`Produtos_Completos?Codigo_Produto=eq.${encodeURIComponent(codigo)}&select=*`);
      const p = res?.[0] || {};
      const descricao = String(p.Descricao_Produto ?? p.descricao ?? `Item ${codigo}`);
      const preco = parseFloat(String(p.Preco_Venda ?? p.preco ?? 0)) || 0;
      return { codigo, descricao, quantidade, preco };
    })
  );
  const totalPecas = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.preco) || 0), 0);

  const cfg: any[] = await rest(`configuracoes_pos?select=valor_hora&id=eq.1`);
  const valorHora = Number(cfg?.[0]?.valor_hora) || 193;
  const valorMaoObra = regra.maoObraHoras * valorHora;

  // escopo da revisão (o que é feito) — tabela de planos prontos.
  // O texto do plano embute o MODELO ("...300 horas 2025" = Jivo 2025,
  // "...9500S"...) — só usa o plano se ele for do modelo pedido; senão
  // devolve null e a IA resume os serviços pelas próprias peças do kit.
  const planos: any[] = await rest(
    `Revisoes_Pronta?select=DescricaoCompleta&DescricaoCompleta=ilike.*${encodeURIComponent(`de ${regra.kitDe} horas`)}*&limit=10`
  );
  const planoDoModelo = planos.find((p) =>
    userDig.some((d) => String(p.DescricaoCompleta || "").includes(d))
  )?.DescricaoCompleta || null;

  return {
    encontrado: true,
    revisao: `${regra.revisao}h`,
    kit: `${row.Trator} ${row.Horas}`,
    servicos_da_revisao: planoDoModelo,
    pecas: itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, qtd: i.quantidade, preco: i.preco })),
    total_pecas: Number(totalPecas.toFixed(2)),
    mao_de_obra: regra.cortesia
      ? { horas: 0, valor: 0, cortesia: true }
      : { horas: regra.maoObraHoras, valor_hora: valorHora, valor: Number(valorMaoObra.toFixed(2)), cortesia: false },
    total_geral_sem_deslocamento: Number((totalPecas + valorMaoObra).toFixed(2)),
    observacoes: [
      ...(regra.arredondada ? [`Pelo horímetro informado, a revisão correspondente é a de ${regra.revisao}h.`] : []),
      ...regra.obs,
      "Valores SEM deslocamento.",
    ],
  };
}

// Deslocamento REAL: rota da loja (Piraju-SP) até o cliente via
// OpenRouteService — aceita a localização do WhatsApp (Latitude/Longitude
// em texto) ou cidade/endereço escrito. Cobra ida e volta pelo valor_km.
async function calcularDeslocamento(localizacao: string) {
  const texto = String(localizacao || "").replace(/[*_`]/g, "");
  const lat = texto.match(/latitude:?\s*(-?\d+(?:\.\d+)?)/i)?.[1];
  const lon = texto.match(/longitude:?\s*(-?\d+(?:\.\d+)?)/i)?.[1];
  let destino = lat && lon ? { lat: Number(lat), lng: Number(lon) } : null;
  if (!destino) {
    const par = texto.match(/(-?\d{1,2}\.\d{3,})[,;\s]+(-?\d{1,3}\.\d{3,})/);
    if (par) destino = { lat: Number(par[1]), lng: Number(par[2]) };
  }

  // link do Google Maps (inclusive encurtado — segue o redirect pra achar
  // as coordenadas do pino)
  const link = texto.match(/https?:\/\/\S+/)?.[0];
  if (!destino && link && /google\.[^\s/]*\/maps|maps\.app\.goo\.gl|goo\.gl\/maps/i.test(link)) {
    let urlFinal = link;
    if (/maps\.app\.goo\.gl|goo\.gl\/maps/i.test(link)) {
      try {
        const r = await fetch(link, { redirect: "follow" });
        urlFinal = r.url || link;
      } catch { /* segue com o link original */ }
    }
    const m =
      urlFinal.match(/!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/) ||
      urlFinal.match(/[?&](?:q|query|ll|destination)=(-?\d{1,2}\.\d+)(?:%2C|,)\s*(-?\d{1,3}\.\d+)/i) ||
      urlFinal.match(/@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/);
    if (m) destino = { lat: Number(m[1]), lng: Number(m[2]) };
  }

  if (!destino) destino = await geocodificar(texto.replace(/https?:\/\/\S+/g, "").trim() || texto);
  if (!destino) {
    return { encontrado: false, mensagem: "Não consegui localizar esse endereço — peça a cidade com o estado (ex.: Taquarituba-SP) ou a localização do WhatsApp." };
  }

  const rota = await rotaDaOficina(destino.lat, destino.lng);
  if (!rota) return { encontrado: false, mensagem: "Não consegui calcular a rota até esse ponto." };

  const cfg: any[] = await rest(`configuracoes_pos?select=valor_km&id=eq.1`);
  const valorKm = Number(cfg?.[0]?.valor_km) || 2.8;
  const kmCobrados = Math.round(rota.distancia_km * 2 * 10) / 10; // ida e volta

  return {
    encontrado: true,
    distancia_km: rota.distancia_km,
    km_cobrados_ida_e_volta: kmCobrados,
    valor_km: valorKm,
    valor_deslocamento: Number((kmCobrados * valorKm).toFixed(2)),
    tempo_ate_o_cliente_min: rota.tempo_min,
    obs: "Deslocamento calculado da loja (Piraju-SP) até o cliente, ida e volta.",
  };
}

const FERRAMENTAS = [
  {
    type: "function",
    function: {
      name: "buscar_trator",
      description: "Busca o trator do cliente pelo FINAL do chassi (últimos 4+ caracteres). Retorna modelo, cliente e o controle de revisões (última feita / próxima pendente).",
      parameters: {
        type: "object",
        properties: { final_chassi: { type: "string", description: "Final do chassi informado pelo cliente" } },
        required: ["final_chassi"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "calcular_deslocamento",
      description: "Calcula o deslocamento REAL da loja até o cliente (km de rota, ida e volta, e o valor). Passe o texto exato da localização enviada (cidade/endereço, mensagem de localização do WhatsApp com Latitude/Longitude, ou LINK do Google Maps — inclusive encurtado). NUNCA estime km sem esta ferramenta.",
      parameters: {
        type: "object",
        properties: { localizacao: { type: "string", description: "Cidade, endereço ou o texto da localização do WhatsApp" } },
        required: ["localizacao"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "orcamento_revisao",
      description: "Monta o orçamento da revisão: kit de peças do modelo + horas (50, 300, 600...), com preços, total das peças e mão de obra. Valores sem deslocamento.",
      parameters: {
        type: "object",
        properties: {
          modelo: { type: "string", description: "Modelo do trator (ex.: 6075, 9200)" },
          horas: { type: "string", description: "Horas da revisão (ex.: 600)" },
        },
        required: ["modelo", "horas"],
      },
    },
  },
];

// ---------- rota ----------

export async function POST(req: NextRequest) {
  const token = req.headers.get("x-tratorilson-token") || "";
  const esperado = process.env.TRATORILSON_TOKEN || TOKEN_PADRAO;
  if (token !== esperado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const entrada: MsgEntrada[] = Array.isArray(body?.mensagens) ? body.mensagens : [];
  const chat = entrada
    .slice(-14)
    .map((m) => ({
      role: m.de === "cliente" ? ("user" as const) : ("assistant" as const),
      content: String(m.texto || "").slice(0, 2000),
    }))
    .filter((m) => m.content);
  if (!chat.length || chat[chat.length - 1].role !== "user") {
    // registra o caso "vazio" pra nunca haver silêncio inexplicável
    await logTratorilson({
      userName: String(body?.contato?.nome || "cliente WhatsApp"),
      tipo: "novazap:vazio",
      pergunta: JSON.stringify(entrada.slice(-4)),
      resposta: "(última mensagem não é do cliente — nada a responder)",
      modelo: getIA().model,
      tokens: 0,
    });
    return NextResponse.json({ resposta: "" });
  }

  const nome = String(body?.contato?.nome || "").slice(0, 120);
  const telefone = String(body?.contato?.telefone || "").slice(0, 30);
  const system =
    PERSONA_CLIENTE_WHATSAPP +
    (nome
      ? `\n\nO nome do contato no WhatsApp é "${nome}" (pode estar incompleto ou ser apelido — confirme o nome completo quando precisar dele).`
      : "");

  try {
    const mensagens: any[] = [{ role: "system", content: system }, ...chat];
    let resposta = "";
    let tokens = 0;
    let modelo = getIA().model;

    for (let volta = 0; volta < 4; volta++) {
      const data = await chamarIA({
        messages: mensagens,
        tools: FERRAMENTAS,
        temperature: 0.5,
        max_tokens: 700,
      });
      tokens += Number(data?.usage?.total_tokens) || 0;
      modelo = data?.model || modelo;
      const m = data?.choices?.[0]?.message;
      if (!m) break;

      const calls: any[] = m.tool_calls || [];
      if (!calls.length) {
        resposta = String(m.content || "").trim();
        break;
      }

      mensagens.push(m);
      for (const tc of calls) {
        let args: any = {};
        try { args = JSON.parse(tc.function?.arguments || "{}"); } catch { /* args vazios */ }
        let resultado: any = { erro: "ferramenta desconhecida" };
        try {
          if (tc.function?.name === "buscar_trator") resultado = await buscarTrator(args.final_chassi);
          if (tc.function?.name === "orcamento_revisao") resultado = await orcamentoRevisao(args.modelo, args.horas);
          if (tc.function?.name === "calcular_deslocamento") resultado = await calcularDeslocamento(args.localizacao);
        } catch (e) {
          resultado = { erro: e instanceof Error ? e.message : "falha na consulta" };
        }
        mensagens.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultado) });
      }
    }

    await logTratorilson({
      userName: nome || telefone || "cliente WhatsApp",
      tipo: "novazap:auto",
      pergunta: [...chat].reverse().find((m) => m.role === "user")?.content || "",
      resposta,
      modelo,
      tokens,
    });

    return NextResponse.json({ resposta });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "erro na IA";
    // erro visível no painel do Tratorilson (e consultável no tratorilson_log)
    await logTratorilson({
      userName: nome || telefone || "cliente WhatsApp",
      tipo: "novazap:erro",
      pergunta: [...chat].reverse().find((m) => m.role === "user")?.content || "",
      resposta: `ERRO: ${msg}`,
      modelo: getIA().model,
      tokens: 0,
    });
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
