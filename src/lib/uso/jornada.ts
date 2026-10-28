// Monitor de uso — JORNADA no navegador (PURA, sem DOM nem banco).
//
// Para achar onde a pessoa "monta quebra-cabeça" (passa por várias telas para
// juntar as informações de UM caso), cada troca de página vira uma TRANSIÇÃO
// de → para com: tempo na tela anterior, se era o MESMO caso (cliente/OS/
// chassi/requisição…) e se foi uma ida-e-volta A→B→A.
//
// "Mesmo caso" é decidido NO NAVEGADOR comparando impressões (hash FNV-1a) dos
// identificadores do caso. Os hashes ficam só no sessionStorage da aba; ao
// servidor vai apenas o booleano — CNPJ, nome ou número nunca são gravados.
//
// O caso vem de dois lugares: (1) a URL (segmentos `[id]` e a query da lista
// abaixo) e (2) as telas que abrem o registro numa janela sem mudar a URL
// (OS no POS, pedido no PPV, pasta do cliente…), que chamam `marcarCaso`
// (lib/uso/caso.ts). Como o caso da tela de destino costuma aparecer DEPOIS de
// entrar nela, a transição sem caso em comum fica PENDENTE no estado e só é
// enviada quando o caso casa, na próxima troca de tela ou ao fechar a aba.
import { normalizarRota } from './rota';

/** Chave de query → tipo do identificador ('' = sem tipo, casa com segmento `[id]`). */
export const TIPO_POR_CHAVE: Record<string, string> = {
  id: '', os: 'os', pv: 'pv', ppv: 'ppv', req: 'req',
  chassi: 'chassi', chassis: 'chassi', placa: 'placa',
  cnpj: 'doc', doc: 'doc', cod: 'cliente', cliente: 'cliente', clientekey: 'cliente',
  nf: 'nf', ticket: 'ticket',
};
/** Chaves de query que identificam um caso. Fora daqui, a query é ignorada. */
export const CHAVES_ALVO = Object.keys(TIPO_POR_CHAVE);

/** Intervalo máximo entre duas telas para contar como transição. */
export const GAP_MAX_S = 30 * 60;
/** Janela da ida-e-volta (A→B→A). */
export const VOLTA_MAX_S = 5 * 60;
const MAX_ALVOS = 16;

export interface Transicao {
  de: string;
  para: string;
  gapS: number;
  mesmoAlvo: boolean;
  volta: boolean;
}

/** Transição ainda sem caso em comum, com os alvos da tela de origem. */
export interface Pendente extends Transicao {
  alvosDe: string[];
}

export interface EstadoJornada {
  rota: string;       // rota normalizada atual
  anterior: string;   // rota antes da atual ('' se não há)
  em: number;         // ms em que entrou na rota atual
  anteriorEm: number; // ms em que entrou na anterior
  alvos: string[];    // hashes dos identificadores da rota atual
  pendente?: Pendente | null;
  /** Caso marcado por uma tela antes de a jornada registrar a entrada nela. */
  adiantado?: { rota: string; alvos: string[] } | null;
}

/** FNV-1a 32 bits em base36 — impressão curta, irreversível para o propósito. */
export function fnv1a(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Normaliza o valor de um identificador para casar entre telas diferentes. */
export function normalizarValor(chave: string, valor: string): string {
  let v = String(valor || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  // OS-0777 / PPV-0505 / REQ-12 → só o número
  v = v.replace(/^(OS|PPV|PV|REQ|NF|SC)(?=\d)/, '');
  if (/^\d+$/.test(v)) v = v.replace(/^0+(?=\d)/, '');
  // chassi: o final de 7 é o que todas as telas compartilham
  if ((chave === 'chassi' || chave === 'chassis') && v.length > 7) v = v.slice(-7);
  if (v.length < 2) return '';
  return v;
}

/** Impressão de um identificador; com tipo, OS 12 e PPV 12 não se confundem. */
export function impressao(tipo: string, valor: string): string {
  const v = normalizarValor(tipo, valor);
  if (!v) return '';
  return fnv1a(tipo ? `${tipo}:${v}` : v);
}

/** Chassis citados num texto livre ("6075E MDI07513V50005756"): palavras de 8+ com letra e dígito, ou 8+ dígitos. */
export function chassisDoTexto(texto: string): string[] {
  const out: string[] = [];
  for (const p of String(texto || '').toUpperCase().split(/[^A-Z0-9]+/)) {
    if (p.length >= 8 && /\d/.test(p)) out.push(p);
  }
  return out;
}

type ValorCaso = string | number | null | undefined;
export type Caso = Partial<Record<'os' | 'pv' | 'ppv' | 'req' | 'chassi' | 'placa' | 'doc' | 'cliente' | 'nf' | 'ticket', ValorCaso | ValorCaso[]>> & {
  /** Texto livre onde pode haver chassi (ex.: o "projeto" da OS). */
  textoChassi?: string | null;
};

/** Hashes de um caso aberto numa tela. */
export function alvosDoCaso(caso: Caso): string[] {
  const out = new Set<string>();
  for (const [tipo, bruto] of Object.entries(caso)) {
    if (tipo === 'textoChassi') continue;
    for (const v of Array.isArray(bruto) ? bruto : [bruto]) {
      if (v == null || v === '') continue;
      const h = impressao(tipo, String(v));
      if (h) out.add(h);
    }
  }
  for (const c of chassisDoTexto(caso.textoChassi || '')) {
    const h = impressao('chassi', c);
    if (h) out.add(h);
  }
  return Array.from(out).slice(0, MAX_ALVOS);
}

/** Hashes dos identificadores do caso que a URL carrega (segmentos dinâmicos + query da lista). */
export function extrairAlvos(pathname: string, search: string): string[] {
  const out = new Set<string>();
  const p = String(pathname || '').split('?')[0];
  const norm = normalizarRota(p);
  if (norm) {
    const crus = p.replace(/\/+$/, '').split('/');
    const marcados = norm.split('/');
    if (crus.length === marcados.length) {
      for (let i = 1; i < crus.length; i++) {
        if (marcados[i].startsWith('[') && !crus[i].startsWith('[')) {
          let bruto = crus[i];
          try { bruto = decodeURIComponent(bruto); } catch { /* fica cru */ }
          const h = impressao('', bruto);
          if (h) out.add(h);
        }
      }
    }
  }
  let sp: URLSearchParams | null = null;
  try { sp = new URLSearchParams(search || ''); } catch { sp = null; }
  if (sp) {
    sp.forEach((valor, k) => {
      const chave = k.toLowerCase();
      if (!(chave in TIPO_POR_CHAVE)) return;
      for (const parte of valor.split(',')) {
        const h = impressao(TIPO_POR_CHAVE[chave], parte);
        if (h) out.add(h);
      }
    });
  }
  return Array.from(out).slice(0, MAX_ALVOS);
}

function unir(a: string[], b: string[]): string[] {
  return Array.from(new Set([...a, ...b])).slice(0, MAX_ALVOS);
}

function semPendente(p: Pendente): Transicao {
  return { de: p.de, para: p.para, gapS: p.gapS, mesmoAlvo: p.mesmoAlvo, volta: p.volta };
}

/**
 * Avança a jornada para a rota nova. `transicao` = a transição calculada (ou
 * null quando não conta: mesma rota, rota que não se mede, primeira tela,
 * intervalo > 30 min). `enviar` = o que mandar ao servidor AGORA: a pendente
 * da tela anterior (o caso dela não apareceu) e a nova, se já casou o caso.
 * Sem caso em comum, a nova fica em `estado.pendente`.
 */
export function proximoPasso(
  anterior: EstadoJornada | null,
  pathname: string,
  alvosUrl: string[],
  agora: number,
): { transicao: Transicao | null; estado: EstadoJornada | null; enviar: Transicao[] } {
  const rota = normalizarRota(pathname);
  if (!rota || rota.startsWith('/api/')) return { transicao: null, estado: anterior, enviar: [] };
  const adiantado = anterior?.adiantado && anterior.adiantado.rota === rota ? anterior.adiantado.alvos : [];
  const alvos = unir(alvosUrl, adiantado);
  if (!anterior || !anterior.rota) {
    return { transicao: null, estado: { rota, anterior: '', em: agora, anteriorEm: 0, alvos, pendente: null, adiantado: null }, enviar: [] };
  }
  if (anterior.rota === rota) {
    // Mesma tela (outro registro/refresh): soma os alvos, não gera transição.
    return { transicao: null, estado: { ...anterior, alvos: unir(anterior.alvos, alvos), adiantado: null }, enviar: [] };
  }
  const enviar: Transicao[] = anterior.pendente ? [semPendente(anterior.pendente)] : [];
  const gapS = Math.max(0, Math.round((agora - anterior.em) / 1000));
  const estado: EstadoJornada = { rota, anterior: anterior.rota, em: agora, anteriorEm: anterior.em, alvos, pendente: null, adiantado: null };
  if (gapS > GAP_MAX_S) return { transicao: null, estado, enviar };
  const conj = new Set(anterior.alvos);
  const mesmoAlvo = alvos.some((a) => conj.has(a));
  const volta = anterior.anterior === rota && anterior.anteriorEm > 0 && (agora - anterior.anteriorEm) / 1000 <= VOLTA_MAX_S;
  const transicao: Transicao = { de: anterior.rota, para: rota, gapS, mesmoAlvo, volta };
  if (mesmoAlvo) enviar.push(transicao);
  else estado.pendente = { ...transicao, alvosDe: anterior.alvos };
  return { transicao, estado, enviar };
}

/**
 * Uma tela marcou o caso que está aberto. Soma aos alvos da rota atual e, se
 * casar com a tela de origem da transição pendente, devolve-a com mesmo caso
 * para enviar. Se a jornada ainda não registrou a entrada nesta rota, guarda
 * o caso como "adiantado" para o próximo passo.
 */
export function marcarNoEstado(
  estado: EstadoJornada | null,
  pathname: string,
  novos: string[],
): { estado: EstadoJornada | null; enviar: Transicao | null } {
  const rota = normalizarRota(pathname);
  if (!rota || !novos.length) return { estado, enviar: null };
  if (!estado || estado.rota !== rota) {
    const base: EstadoJornada = estado ?? { rota: '', anterior: '', em: 0, anteriorEm: 0, alvos: [] };
    const ja = base.adiantado && base.adiantado.rota === rota ? base.adiantado.alvos : [];
    return { estado: { ...base, adiantado: { rota, alvos: unir(ja, novos) } }, enviar: null };
  }
  const alvos = unir(estado.alvos, novos);
  const p = estado.pendente;
  if (p && p.para === rota && novos.some((a) => p.alvosDe.includes(a))) {
    return { estado: { ...estado, alvos, pendente: null }, enviar: { ...semPendente(p), mesmoAlvo: true } };
  }
  return { estado: { ...estado, alvos }, enviar: null };
}

/** Ao fechar/sair da aba: tira a pendente do estado para enviar como está. */
export function descarregarPendente(estado: EstadoJornada | null): { estado: EstadoJornada | null; enviar: Transicao | null } {
  if (!estado?.pendente) return { estado, enviar: null };
  return { estado: { ...estado, pendente: null }, enviar: semPendente(estado.pendente) };
}

function lerLista(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((a): a is string => typeof a === 'string').slice(0, MAX_ALVOS) : [];
}

function lerPendente(o: unknown): Pendente | null {
  if (!o || typeof o !== 'object') return null;
  const p = o as Record<string, unknown>;
  if (typeof p.de !== 'string' || typeof p.para !== 'string') return null;
  return { de: p.de, para: p.para, gapS: Number(p.gapS) || 0, mesmoAlvo: p.mesmoAlvo === true, volta: p.volta === true, alvosDe: lerLista(p.alvosDe) };
}

/** Lê o estado do sessionStorage sem confiar no formato. */
export function lerEstado(bruto: string | null): EstadoJornada | null {
  if (!bruto) return null;
  try {
    const o = JSON.parse(bruto);
    if (!o || typeof o.rota !== 'string' || typeof o.em !== 'number') return null;
    const ad = o.adiantado && typeof o.adiantado.rota === 'string' ? { rota: o.adiantado.rota, alvos: lerLista(o.adiantado.alvos) } : null;
    return {
      rota: o.rota, anterior: typeof o.anterior === 'string' ? o.anterior : '',
      em: o.em, anteriorEm: typeof o.anteriorEm === 'number' ? o.anteriorEm : 0,
      alvos: lerLista(o.alvos), pendente: lerPendente(o.pendente), adiantado: ad,
    };
  } catch { return null; }
}
