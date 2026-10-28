// Regras puras do backfill de CMC (vendas_itens sem custo → PosicaoEstoque na data).
// O item em que a Omie devolve custo 0 não se resolve repetindo a pergunta na mesma
// noite: cada par produto+data é tentado UMA vez por rodada e, se vier 0, espera
// 1, 7 e 30 dias; na 4ª falha desiste ("sem_custo_omie"). Erro de chamada não conta.

export const ESPERAS_DIAS = [1, 7, 30];
export const MAX_TENTATIVAS = ESPERAS_DIAS.length + 1;
const DIA_MS = 24 * 3600 * 1000;

export interface Tentativa {
  tentativas: number;
  proxima_em: string | null;
  ultimo_resultado: string | null;
}

export interface Par {
  codigo_produto: string;
  data_pedido: string;
}

export const chavePar = (p: Par) => p.codigo_produto + ':' + p.data_pedido;

/** "DD/MM/YYYY" → número ordenável (YYYYMMDD); outro formato vai pro fim. */
export function dataOrdenavel(d: string): number {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(d || '');
  return m ? Number(m[3] + m[2] + m[1]) : 0;
}

/** Pares únicos, sem os que ainda estão esperando ou já desistidos; mais recentes primeiro. */
export function paresParaTentar(
  linhas: Par[],
  tentativas: Map<string, Tentativa>,
  agora: Date,
): { pares: Par[]; adiados: number; desistidos: number } {
  const vistos = new Set<string>();
  const pares: Par[] = [];
  let adiados = 0;
  let desistidos = 0;
  for (const l of linhas) {
    const k = chavePar(l);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const t = tentativas.get(k);
    if (t) {
      if (!t.proxima_em) { desistidos++; continue; }
      if (new Date(t.proxima_em).getTime() > agora.getTime()) { adiados++; continue; }
    }
    pares.push(l);
  }
  pares.sort((a, b) => dataOrdenavel(b.data_pedido) - dataOrdenavel(a.data_pedido));
  return { pares, adiados, desistidos };
}

/** Próximo estado depois de uma consulta sem custo (`sem_custo`) ou com erro (`erro`). */
export function proximaTentativa(
  anterior: Tentativa | undefined,
  resultado: 'sem_custo' | 'erro',
  agora: Date,
): Tentativa {
  const feitas = anterior?.tentativas ?? 0;
  if (resultado === 'erro') {
    return { tentativas: feitas, proxima_em: new Date(agora.getTime() + DIA_MS).toISOString(), ultimo_resultado: 'erro' };
  }
  const tentativas = feitas + 1;
  if (tentativas >= MAX_TENTATIVAS) return { tentativas, proxima_em: null, ultimo_resultado: 'sem_custo_omie' };
  const dias = ESPERAS_DIAS[tentativas - 1];
  return { tentativas, proxima_em: new Date(agora.getTime() + dias * DIA_MS).toISOString(), ultimo_resultado: 'sem_custo' };
}
