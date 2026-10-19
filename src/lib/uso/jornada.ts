// Monitor de uso — JORNADA no navegador (PURA, sem DOM nem banco).
//
// Para achar onde a pessoa "monta quebra-cabeça" (passa por várias telas para
// juntar as informações de UM caso), cada troca de página vira uma TRANSIÇÃO
// de → para com: tempo na tela anterior, se era o MESMO caso (cliente/OS/
// chassi/requisição…) e se foi uma ida-e-volta A→B→A.
//
// "Mesmo caso" é decidido NO NAVEGADOR comparando impressões (hash FNV-1a) dos
// identificadores da URL. Os hashes ficam só no sessionStorage da aba; ao
// servidor vai apenas o booleano — CNPJ, nome ou número nunca são gravados.
import { normalizarRota } from './rota';

/** Chaves de query que identificam um caso. Fora daqui, a query é ignorada. */
export const CHAVES_ALVO = ['id', 'cod', 'doc', 'os', 'pv', 'ppv', 'req', 'chassi', 'chassis', 'placa', 'cnpj', 'cliente', 'clientekey', 'nf', 'ticket'];

/** Intervalo máximo entre duas telas para contar como transição. */
export const GAP_MAX_S = 30 * 60;
/** Janela da ida-e-volta (A→B→A). */
export const VOLTA_MAX_S = 5 * 60;

export interface EstadoJornada {
  rota: string;       // rota normalizada atual
  anterior: string;   // rota antes da atual ('' se não há)
  em: number;         // ms em que entrou na rota atual
  anteriorEm: number; // ms em que entrou na anterior
  alvos: string[];    // hashes dos identificadores da rota atual
}

export interface Transicao {
  de: string;
  para: string;
  gapS: number;
  mesmoAlvo: boolean;
  volta: boolean;
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
          const v = normalizarValor('', bruto);
          if (v) out.add(fnv1a(v));
        }
      }
    }
  }
  let sp: URLSearchParams | null = null;
  try { sp = new URLSearchParams(search || ''); } catch { sp = null; }
  if (sp) {
    sp.forEach((valor, k) => {
      const chave = k.toLowerCase();
      if (!CHAVES_ALVO.includes(chave)) return;
      for (const parte of valor.split(',')) {
        const v = normalizarValor(chave, parte);
        if (v) out.add(fnv1a(v));
      }
    });
  }
  return Array.from(out).slice(0, 12);
}

/**
 * Avança a jornada para a rota nova. Devolve a transição (ou null quando não
 * conta: mesma rota, rota que não se mede, primeira tela, intervalo > 30 min)
 * e o novo estado para guardar no sessionStorage.
 */
export function proximoPasso(
  anterior: EstadoJornada | null,
  pathname: string,
  alvos: string[],
  agora: number,
): { transicao: Transicao | null; estado: EstadoJornada | null } {
  const rota = normalizarRota(pathname);
  if (!rota || rota.startsWith('/api/')) return { transicao: null, estado: anterior };
  if (!anterior || !anterior.rota) {
    return { transicao: null, estado: { rota, anterior: '', em: agora, anteriorEm: 0, alvos } };
  }
  if (anterior.rota === rota) {
    // Mesma tela (outro registro/refresh): soma os alvos, não gera transição.
    const juntos = Array.from(new Set([...anterior.alvos, ...alvos])).slice(0, 12);
    return { transicao: null, estado: { ...anterior, alvos: juntos } };
  }
  const gapS = Math.max(0, Math.round((agora - anterior.em) / 1000));
  const estado: EstadoJornada = { rota, anterior: anterior.rota, em: agora, anteriorEm: anterior.em, alvos };
  if (gapS > GAP_MAX_S) return { transicao: null, estado };
  const conj = new Set(anterior.alvos);
  const mesmoAlvo = alvos.some((a) => conj.has(a));
  const volta = anterior.anterior === rota && anterior.anteriorEm > 0 && (agora - anterior.anteriorEm) / 1000 <= VOLTA_MAX_S;
  return { transicao: { de: anterior.rota, para: rota, gapS, mesmoAlvo, volta }, estado };
}

/** Lê o estado do sessionStorage sem confiar no formato. */
export function lerEstado(bruto: string | null): EstadoJornada | null {
  if (!bruto) return null;
  try {
    const o = JSON.parse(bruto);
    if (!o || typeof o.rota !== 'string' || typeof o.em !== 'number') return null;
    return {
      rota: o.rota, anterior: typeof o.anterior === 'string' ? o.anterior : '',
      em: o.em, anteriorEm: typeof o.anteriorEm === 'number' ? o.anteriorEm : 0,
      alvos: Array.isArray(o.alvos) ? o.alvos.filter((a: unknown) => typeof a === 'string').slice(0, 12) : [],
    };
  } catch { return null; }
}
