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
const restPost = (tabela: string, corpo: unknown) =>
  fetch(`${SB()}/rest/v1/${tabela}`, {
    method: "POST",
    headers: { ...HDR(), "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify(corpo),
  })
    .then((r) => r.ok)
    .catch(() => false);

interface MsgEntrada {
  de?: string; // 'cliente' | 'loja'
  texto?: string;
  imagens?: string[]; // fotos do cliente (horímetro, chassi...) — URLs do zap
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
  // Horímetro solto → arredonda PRA BAIXO (430→300, 700→600); só sobe pra
  // próxima revisão se estiver coladinho nela (a até 50h — ex.: 881→900).
  let h: number;
  if (hPedidas <= 65) {
    h = 50;
  } else {
    const base = Math.floor(hPedidas / 300) * 300;
    const proxima = base + 300;
    h = proxima - hPedidas <= 50 ? proxima : base;
    if (h < 300) h = 50;
  }
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

// monta as peças de um kit (linha da tabela `revisoes`) com os preços
async function montarPecasDoKit(row: any) {
  const mapa: Record<string, number> = {};
  for (let i = 1; i <= 30; i++) {
    const codigo = String(row[`Cod_Prod_${i}`] || "").trim();
    if (!codigo || codigo.toUpperCase() === "NULL" || codigo.length < 2) continue;
    const q = parseFloat(String(row[`Qtd${i}`] || 1)) || 1;
    mapa[codigo] = (mapa[codigo] || 0) + q;
  }
  const itens = await Promise.all(
    Object.entries(mapa).map(async ([codigo, quantidade]) => {
      let res: any[] = await rest(`Produtos_Completos?Codigo_Produto=eq.${encodeURIComponent(codigo)}&select=*`);
      // kits de quadriciclo guardam o nº do ITEM do fornecedor, que no
      // cadastro vive na DESCRIÇÃO ("ITEM: 35223 - OIL FILTER...")
      if (!res?.length) {
        res = await rest(`Produtos_Completos?Descricao_Produto=ilike.*${encodeURIComponent(`ITEM: ${codigo} `)}*&select=*&limit=1`);
      }
      if (!res?.length) {
        res = await rest(`Produtos_Completos?Descricao_Produto=ilike.*${encodeURIComponent(codigo)}*&select=*&limit=1`);
      }
      const p = res?.[0] || {};
      const descricao = String(p.Descricao_Produto ?? p.descricao ?? `Item ${codigo}`);
      const preco = parseFloat(String(p.Preco_Venda ?? p.preco ?? 0)) || 0;
      return { codigo: String(p.Codigo_Produto ?? codigo), descricao, quantidade, preco };
    })
  );
  const totalPecas = itens.reduce((s, i) => s + (Number(i.quantidade) || 0) * (Number(i.preco) || 0), 0);
  return { itens, totalPecas };
}

// Revisão de QUADRICICLO: só precisa do MODELO (kits tipo 'quadriciclo');
// mão de obra fixa de 2h em toda revisão de quadri (regra do José, 03/09).
async function orcamentoQuadriciclo(modelo: string) {
  const norm = (s: any) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const alvo = norm(modelo);
  if (alvo.length < 2) return { encontrado: false, mensagem: "Preciso do modelo do quadriciclo (ex.: M550, TBOSS 550, LANDFORCE 650)." };

  const rows: any[] = await rest(`revisoes?select=*`);
  const quadris = rows.filter((r) => String(r.tipo || "") === "quadriciclo");
  const candidatos = quadris.filter((r) => {
    const t = norm(r.Trator);
    const c = norm(r.Cod_Trator);
    return (t && (t.includes(alvo) || alvo.includes(t))) || (c && (c.includes(alvo) || alvo.includes(c)));
  });
  if (!candidatos.length) {
    return { encontrado: false, mensagem: `Não achei kit de quadriciclo pra "${modelo}".`, modelos_disponiveis: [...new Set(quadris.map((r) => r.Trator))] };
  }
  const modelosDistintos = [...new Set(candidatos.map((r) => String(r.Trator)))];
  if (modelosDistintos.length > 1) {
    return { encontrado: false, mensagem: "Mais de um modelo combina — pergunte ao cliente qual é.", modelos_possiveis: modelosDistintos };
  }

  const row = candidatos[0];
  const { itens, totalPecas } = await montarPecasDoKit(row);
  const cfg: any[] = await rest(`configuracoes_pos?select=valor_hora&id=eq.1`);
  const valorHora = Number(cfg?.[0]?.valor_hora) || 193;
  const maoObra = 2 * valorHora;

  return {
    encontrado: true,
    modelo: row.Trator,
    kit: `${row.Trator} ${row.Horas || ""}`.trim(),
    pecas: itens.map((i) => ({ codigo: i.codigo, descricao: i.descricao, qtd: i.quantidade, preco: i.preco })),
    total_pecas: Number(totalPecas.toFixed(2)),
    mao_de_obra: { horas: 2, valor_hora: valorHora, valor: Number(maoObra.toFixed(2)), cortesia: false },
    total_geral_sem_deslocamento: Number((totalPecas + maoObra).toFixed(2)),
    observacoes: ["Valores SEM deslocamento."],
  };
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

  const { itens, totalPecas } = await montarPecasDoKit(row);

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
      name: "registrar_solicitacao",
      description: "Registra a solicitação CONFIRMADA pelo cliente no painel da equipe do portal. Chame SOMENTE quando o cliente confirmar o orçamento/pedido (depois do 'Posso confirmar?'). Inclua nos extras qualquer peça/serviço que ele adicionou além do kit, e SEMPRE passe as peças/horas/km do orçamento confirmado (a equipe usa pra gerar o orçamento no sistema com um clique).",
      parameters: {
        type: "object",
        properties: {
          tipo: { type: "string", enum: ["revisao", "quadriciclo", "assistencia", "pecas", "outro"] },
          resumo: { type: "string", description: "O que o cliente quer, curto (ex.: 'Revisão de 600h do 6075, total R$2.731,00 com deslocamento de Taquarituba')" },
          extras: { type: "string", description: "Peças/serviços ADICIONADOS a mais pelo cliente (vazio se nenhum)" },
          total: { type: "number", description: "Total confirmado em reais, se houver" },
          pecas: {
            type: "array",
            description: "Peças do orçamento confirmado (as do kit, menos as removidas), exatamente como vieram das ferramentas",
            items: {
              type: "object",
              properties: {
                codigo: { type: "string" },
                descricao: { type: "string" },
                qtd: { type: "number" },
                preco: { type: "number" },
              },
              required: ["codigo", "qtd"],
            },
          },
          modelo: { type: "string", description: "Modelo do trator/quadriciclo" },
          revisao: { type: "string", description: "Revisão confirmada (ex.: '600h')" },
          mao_obra_horas: { type: "number", description: "Horas de mão de obra do orçamento (0 se cortesia)" },
          deslocamento_km: { type: "number", description: "Km cobrados de deslocamento (ida e volta), se calculado" },
          localizacao: { type: "string", description: "Localização do cliente usada no deslocamento" },
        },
        required: ["tipo", "resumo"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "orcamento_quadriciclo",
      description: "Monta o orçamento da revisão de QUADRICICLO só pelo modelo (M550, TBOSS 550, LANDFORCE 650...): kit de peças com preços + mão de obra fixa de 2h. Valores sem deslocamento.",
      parameters: {
        type: "object",
        properties: { modelo: { type: "string", description: "Modelo do quadriciclo" } },
        required: ["modelo"],
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
  const recorte = entrada.slice(-14);
  const chat = recorte
    .map((m, i) => {
      const texto = String(m.texto || "").slice(0, 2000);
      const role = m.de === "cliente" ? ("user" as const) : ("assistant" as const);
      // fotos: só das 3 mensagens mais recentes (os links do zap expiram) e
      // só do cliente — a IA lê horímetro/plaqueta direto da imagem
      const recente = i >= recorte.length - 3;
      const fotos = role === "user" && recente && Array.isArray(m.imagens) ? m.imagens.slice(0, 3) : [];
      if (fotos.length) {
        return {
          role,
          content: [
            { type: "text", text: texto || "O cliente enviou esta(s) foto(s)." },
            ...fotos.map((u) => ({ type: "image_url", image_url: { url: String(u), detail: "auto" } })),
          ],
        };
      }
      return { role, content: texto };
    })
    .filter((m) => (typeof m.content === "string" ? m.content : true));
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
  const ultimaPergunta = (() => {
    const m = [...chat].reverse().find((x) => x.role === "user");
    if (!m) return "";
    if (typeof m.content === "string") return m.content;
    const t = (m.content as any[]).find((c) => c.type === "text")?.text || "";
    return `${t} [com foto]`.trim();
  })();

  // vínculo do contato no NovaZap (cliente do portal + localização salva)
  const vinculo = {
    cliente: String(body?.contato?.cliente || "").slice(0, 160),
    cod: String(body?.contato?.cliente_cod || "").slice(0, 20),
    endereco: String(body?.contato?.cliente_endereco || "").slice(0, 240),
    localizacao: String(body?.contato?.localizacao || "").slice(0, 300),
    cnpj: "",
  };
  if (vinculo.cod) {
    const cad: any[] = await rest(
      `portal_nt_clientes_cadastro_omie?cod_cli=eq.${encodeURIComponent(vinculo.cod)}&select=razao_social,nome_fantasia,cnpj_cpf,endereco,bairro,cidade,estado&limit=1`
    );
    const c = cad?.[0];
    if (c) {
      vinculo.cnpj = String(c.cnpj_cpf || "");
      if (!vinculo.cliente) vinculo.cliente = String(c.nome_fantasia || c.razao_social || "");
      if (!vinculo.endereco) vinculo.endereco = [c.endereco, c.bairro, c.cidade && `${c.cidade}/${c.estado || ""}`].filter(Boolean).join(", ");
    }
  }

  let system =
    PERSONA_CLIENTE_WHATSAPP +
    (nome
      ? `\n\nO nome do contato no WhatsApp é "${nome}" (pode estar incompleto ou ser apelido — confirme o nome completo quando precisar dele).`
      : "");
  if (vinculo.cliente || vinculo.localizacao) {
    system += `\n\nDADOS JÁ CADASTRADOS DESTE CONTATO (use pra AGILIZAR — logo depois que ele disser o que quer, CONFIRME em vez de pedir de novo):`;
    if (vinculo.cliente) {
      system += `\n- CLIENTE VINCULADO: ${vinculo.cliente}${vinculo.cnpj ? ` — CNPJ/CPF ${vinculo.cnpj}` : ""}${vinculo.endereco ? ` — ${vinculo.endereco}` : ""}. Pergunte: "É para esse cliente?" mostrando nome, CNPJ e endereço. Se disser que é outro, colete os dados do certo.`;
    }
    if (vinculo.localizacao) {
      system += `\n- LOCALIZAÇÃO CADASTRADA: ${vinculo.localizacao}. Pergunte se o atendimento é nessa localização; SE CONFIRMAR, use calcular_deslocamento com ela; se não for, peça a nova.`;
    }
  }

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
          if (tc.function?.name === "orcamento_quadriciclo") resultado = await orcamentoQuadriciclo(args.modelo);
          if (tc.function?.name === "calcular_deslocamento") resultado = await calcularDeslocamento(args.localizacao);
          if (tc.function?.name === "registrar_solicitacao") {
            const pecas = Array.isArray(args.pecas)
              ? args.pecas.slice(0, 40).map((p: any) => ({
                  codigo: String(p.codigo || "").slice(0, 60),
                  descricao: String(p.descricao || "").slice(0, 200),
                  qtd: Number(p.qtd) || 1,
                  preco: Number(p.preco) || 0,
                }))
              : [];
            const ok = await restPost("tratorilson_solicitacoes", {
              contato_nome: nome || null,
              contato_telefone: telefone || null,
              cliente_nome: vinculo.cliente || null,
              cliente_cod: vinculo.cod || null,
              cliente_cnpj: vinculo.cnpj || null,
              tipo: String(args.tipo || "outro"),
              resumo: String(args.resumo || "").slice(0, 1000),
              extras: String(args.extras || "").slice(0, 1000) || null,
              total: Number(args.total) || null,
              detalhes: {
                pecas,
                modelo: String(args.modelo || "").slice(0, 60) || null,
                revisao: String(args.revisao || "").slice(0, 20) || null,
                mao_obra_horas: Number(args.mao_obra_horas) || 0,
                deslocamento_km: Number(args.deslocamento_km) || 0,
                localizacao: String(args.localizacao || "").slice(0, 300) || null,
              },
            });
            resultado = ok
              ? { ok: true, mensagem: "Solicitação registrada — a equipe já vê no portal." }
              : { ok: false, mensagem: "Não consegui registrar agora, mas siga normalmente — a equipe acompanha pela conversa." };
          }
        } catch (e) {
          resultado = { erro: e instanceof Error ? e.message : "falha na consulta" };
        }
        mensagens.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(resultado) });
      }
    }

    await logTratorilson({
      userName: nome || telefone || "cliente WhatsApp",
      tipo: "novazap:auto",
      pergunta: ultimaPergunta,
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
      pergunta: ultimaPergunta,
      resposta: `ERRO: ${msg}`,
      modelo: getIA().model,
      tokens: 0,
    });
    return NextResponse.json({ erro: msg }, { status: 502 });
  }
}
