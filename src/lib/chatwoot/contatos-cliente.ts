// Contatos do WhatsApp (NovaZap) de um cliente do portal, com o resumo da
// última conversa de cada um. Só LEITURA — nada é gravado no Chatwoot.
//
// Como acha os contatos: uma busca por código Omie do cliente com
// `q=<cod>:` — o `:` faz o ILIKE do fork casar quase só `cliente_ref`
// ("123:Nova Tratores") e não telefone/CNPJ/endereço. Falsos positivos por
// sufixo ("4123:") caem no filtro exato de parsers.ts.
//
// Limitação conhecida: contato vinculado antes de existir `cliente_ref` (só
// `cliente_cod`) não é encontrado pela busca. A rota /api/chatwoot/vincular
// sempre grava `cliente_ref`, então isso só afeta vínculos muito antigos.
//
// Servidor apenas (token de conta). Nunca lança: devolve `SecaoWhatsapp`.

import { chatwootConfigurado } from "./config";
import {
  buscarContatosPorTexto,
  listarConversasContato,
  listarInboxes,
  type ChatwootHttpError,
  type ContatoBruto,
  type ConversaBruta,
} from "./cliente";
import { filtrarContatosDoCliente, ordenarPorCargo, paraContatoWhatsapp, type SecaoWhatsapp } from "./parsers";

export const MAX_CODIGOS = 5;
export const MAX_CONTATOS = 8;
export const PAGINAS_POR_CODIGO = 2; // 15 por página no fork
const TIMEOUT_SECAO_MS = 8000;
const CACHE_MS = 5 * 60 * 1000;

const cache = new Map<string, { em: number; dados: SecaoWhatsapp }>();
let avisouSemConfig = false;

export async function buscarWhatsappDoCliente(codigosOmie: string[]): Promise<SecaoWhatsapp> {
  const codigos = [...new Set(codigosOmie.map((c) => String(c ?? "").trim()).filter(Boolean))];
  if (!chatwootConfigurado()) {
    if (!avisouSemConfig) {
      avisouSemConfig = true;
      console.warn("[chatwoot] CHATWOOT_URL/ACCOUNT_ID/API_TOKEN ausentes — seção WhatsApp desligada");
    }
    return { estado: "nao_configurado" };
  }
  if (codigos.length === 0) return { estado: "sem_contatos", codigos_consultados: [] };

  const chave = [...codigos].sort().join(",");
  const hit = cache.get(chave);
  if (hit && Date.now() - hit.em < CACHE_MS) return hit.dados;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_SECAO_MS);
  try {
    const dados = await montar(codigos, ctrl.signal);
    // só cacheia resultado bom; indisponível volta a tentar na próxima abertura
    if (dados.estado !== "indisponivel") cache.set(chave, { em: Date.now(), dados });
    return dados;
  } finally {
    clearTimeout(timer);
  }
}

async function montar(codigos: string[], signal: AbortSignal): Promise<SecaoWhatsapp> {
  const usados = codigos.slice(0, MAX_CODIGOS);
  if (codigos.length > MAX_CODIGOS) {
    console.warn(`[chatwoot] cliente com ${codigos.length} códigos Omie; consultando só ${MAX_CODIGOS}`);
  }

  // 1) busca por código (página 2 só se a 1ª veio cheia)
  const buscas = await Promise.allSettled(usados.map((cod) => buscarPaginas(`${cod}:`, signal)));
  const brutos: ContatoBruto[] = [];
  let falhas = 0;
  let ultimoErro = "";
  for (const b of buscas) {
    if (b.status === "fulfilled") brutos.push(...b.value);
    else {
      falhas++;
      ultimoErro = (b.reason as Error)?.message || String(b.reason);
    }
  }
  if (falhas === buscas.length) return { estado: "indisponivel", motivo: ultimoErro || "falha na busca" };

  // 2) filtro exato + ordem + corte
  const doCliente = filtrarContatosDoCliente(brutos, usados);
  if (doCliente.length === 0) return { estado: "sem_contatos", codigos_consultados: usados };

  const parciais = ordenarPorCargo(doCliente.map((c) => paraContatoWhatsapp(c, null)));
  const mantidos = parciais.slice(0, MAX_CONTATOS);
  const brutoPorId = new Map(doCliente.map((c) => [c.id, c] as const));

  // 3) última conversa de cada um (falha individual → null)
  let inboxes = new Map<number, string>();
  try {
    inboxes = await listarInboxes(signal);
  } catch {
    /* sem nome de caixa */
  }
  const conversas = await Promise.allSettled(mantidos.map((c) => listarConversasContato(c.id, signal)));
  const contatos = mantidos.map((c, i) => {
    const r = conversas[i];
    const ultima: ConversaBruta | null = r.status === "fulfilled" && r.value.length > 0 ? r.value[0] : null;
    return paraContatoWhatsapp(brutoPorId.get(c.id)!, ultima, inboxes);
  });

  return {
    estado: "ok",
    contatos,
    truncado: parciais.length > mantidos.length,
    total: parciais.length,
    consultado_em: new Date().toISOString(),
  };
}

async function buscarPaginas(q: string, signal: AbortSignal): Promise<ContatoBruto[]> {
  const out: ContatoBruto[] = [];
  for (let page = 1; page <= PAGINAS_POR_CODIGO; page++) {
    let lote: ContatoBruto[];
    try {
      lote = await buscarContatosPorTexto(q, page, signal);
    } catch (e) {
      // 429/5xx/timeout na 1ª página = falha da busca; nas seguintes, fica com o que veio
      if (page === 1) throw e;
      const http = (e as ChatwootHttpError).http;
      console.warn(`[chatwoot] página ${page} de "${q}" falhou (${http ?? "?"}); seguindo com ${out.length} contatos`);
      break;
    }
    out.push(...lote);
    if (lote.length < 15) break;
  }
  return out;
}
