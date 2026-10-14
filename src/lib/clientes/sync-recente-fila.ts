// Fila das notas que ainda não chegaram (sync-recente da Pasta do cliente).
// Antes, toda rodada (a cada 5 min) consultava na Omie até 80 OS e 80 pedidos
// faturados sem nota — muitos NUNCA terão PDF (NFS-e sem cPdfNFSe, NF-e rejeitada) —
// e a rodada levava ~4,5 min. Agora cada item que não trouxe a nota espera cada vez
// mais para ser consultado de novo: 5, 10, 20, 40 min… até 6 h. Nota nova continua
// sendo pega em minutos; a que nunca vem deixa de custar.
// Estado em memória do processo: depois de um deploy a fila recomeça (uma rodada).

export const ESPERA_INICIAL_MS = 5 * 60_000;
export const ESPERA_MAX_MS = 6 * 60 * 60_000;
// 5 por empresa e por tipo: as notas de HOJE vêm primeiro (a rodada atualiza as OS/PV do dia,
// que sobem na ordem por updated_at); o estoque de notas antigas anda aos poucos até a espera
// de cada uma chegar a 6 h. Com 20, a rodada levava ~1,5 min percorrendo esse estoque.
export const MAX_POR_RODADA = 5;

/** Espera depois de `tentativas` consultas sem a nota (1 → 5 min, 2 → 10 min…). */
export function esperaDepois(tentativas: number): number {
  if (tentativas <= 0) return 0;
  return Math.min(ESPERA_INICIAL_MS * 2 ** (tentativas - 1), ESPERA_MAX_MS);
}

interface Registro { tentativas: number; proxima: number }

const G = globalThis as unknown as { __filaNotasPasta?: Map<string, Registro> };
const fila = () => (G.__filaNotasPasta ??= new Map());

/** Pode consultar este item agora? */
export function podeConsultar(chave: string, agora = Date.now()): boolean {
  const r = fila().get(chave);
  return !r || agora >= r.proxima;
}

/** Registra o resultado: achou a nota → sai da fila; não achou → espera mais. */
export function registrarConsulta(chave: string, achou: boolean, agora = Date.now()): void {
  const f = fila();
  if (achou) { f.delete(chave); return; }
  const tentativas = (f.get(chave)?.tentativas ?? 0) + 1;
  f.set(chave, { tentativas, proxima: agora + esperaDepois(tentativas) });
}

/** Dos candidatos (mais recentes primeiro), os que podem ser consultados nesta rodada. */
export function escolherDaVez<T>(itens: T[], chaveDe: (x: T) => string, agora = Date.now(), max = MAX_POR_RODADA): T[] {
  const out: T[] = [];
  for (const x of itens) {
    if (out.length >= max) break;
    if (podeConsultar(chaveDe(x), agora)) out.push(x);
  }
  return out;
}

/** Só para testes. */
export function _limparFila(): void {
  fila().clear();
}
