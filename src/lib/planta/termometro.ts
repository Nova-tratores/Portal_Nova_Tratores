// ============================================================================
// Planta Viva — termômetros (PURO, sem banco). Pedido de 21/10/2026: cada número
// comparado com a média da semana, do mês e do ano e com uma meta manual.
//
// Decisões do usuário: só admin define meta; UMA meta por número, que vale para a
// visão "Todas" (NOVA/CASTRO separadas mostram só as médias); histórico começa do
// zero — a média só aparece quando a janela tem dias suficientes.
// ============================================================================

/** Medida do número: R$ quando ele tem valor; senão a contagem. */
export function medida(l: { valor: number | null; contagem: number }): number {
  return l.valor != null ? Number(l.valor) : Number(l.contagem) || 0;
}

/** Qual lado é bom. `neutro` = não tem lado certo (ex.: a receber hoje); seta sem cor. */
export type Sentido = 'menor' | 'maior' | 'neutro';
export const SENTIDO: Record<string, Sentido> = {
  pagar_vencido: 'menor', receber_vencido: 'menor', fila_financeiro: 'menor',
  pagar_hoje: 'neutro', pagar_7d: 'neutro', receber_hoje: 'neutro', receber_7d: 'neutro',
  fluxo_30d: 'maior',
  maq_pedido_fabrica: 'neutro', maq_em_transito: 'neutro', maq_recebida_sem_faturar: 'menor', maq_receb_esquecido: 'menor',
  ppv_aberto: 'neutro', os_por_fase: 'neutro', os_atrasada: 'menor', os_sem_faturar: 'menor',
  pecas_a_alocar: 'menor', estoque_negativo: 'menor',
};

export type Janela = 'semana' | 'mes' | 'ano';
export const JANELAS: Array<{ id: Janela; dias: number; minimo: number; rotulo: string }> = [
  { id: 'semana', dias: 7, minimo: 5, rotulo: 'Média da semana' },
  { id: 'mes', dias: 30, minimo: 21, rotulo: 'Média do mês' },
  { id: 'ano', dias: 365, minimo: 256, rotulo: 'Média do ano' },
];
export interface MediaJanela { media: number | null; dias: number }
export type Medias = Partial<Record<Janela, MediaJanela>>;

const somaDias = (iso: string, n: number) => new Date(new Date(iso + 'T12:00:00Z').getTime() + n * 86400_000).toISOString().slice(0, 10);
const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Médias dos dias FECHADOS (antes de hoje) de um número, a partir das linhas diárias
 * {dia, valor, contagem}. Janela com menos dias que o mínimo devolve media null
 * ("juntando histórico") e quantos dias já tem.
 */
export function calcularMedias(dias: Array<{ dia: string; valor: number | null; contagem: number }>, hoje: string): Medias {
  const out: Medias = {};
  for (const j of JANELAS) {
    const desde = somaDias(hoje, -j.dias);
    const xs = dias.filter((d) => d.dia >= desde && d.dia < hoje).map((d) => medida({ valor: d.valor == null ? null : Number(d.valor), contagem: Number(d.contagem) }));
    out[j.id] = { media: xs.length >= j.minimo ? r2(xs.reduce((s, v) => s + v, 0) / xs.length) : null, dias: xs.length };
  }
  return out;
}

export type Situacao = 'verde' | 'amarelo' | 'vermelho';
/**
 * Situação contra a meta. `tolerancia` em % da meta: dentro dela fica amarelo.
 * menor é melhor: ≤ meta verde · até meta + tol amarelo · acima vermelho.
 * maior é melhor: ≥ meta verde · até meta − tol amarelo · abaixo vermelho.
 * neutro (alvo): até tol de distância verde · até 2× tol amarelo · além vermelho.
 */
export function situacaoMeta(atual: number, meta: number, tolerancia: number, sentido: Sentido): Situacao {
  const folga = Math.abs(meta) * (tolerancia / 100);
  if (sentido === 'menor') return atual <= meta ? 'verde' : atual <= meta + folga ? 'amarelo' : 'vermelho';
  if (sentido === 'maior') return atual >= meta ? 'verde' : atual >= meta - folga ? 'amarelo' : 'vermelho';
  const dist = Math.abs(atual - meta);
  return dist <= folga ? 'verde' : dist <= 2 * folga ? 'amarelo' : 'vermelho';
}

/** Variação em % contra a média; `bom` só quando o número tem lado certo. */
export function comparar(atual: number, media: number | null, sentido: Sentido): { delta_pct: number | null; bom: boolean | null } {
  if (media == null) return { delta_pct: null, bom: null };
  if (media === 0) return { delta_pct: atual === 0 ? 0 : null, bom: atual === 0 ? null : sentido === 'neutro' ? null : sentido === 'menor' ? atual < 0 : atual > 0 };
  const d = r2(((atual - media) / Math.abs(media)) * 100);
  return { delta_pct: d, bom: sentido === 'neutro' || d === 0 ? null : sentido === 'menor' ? d < 0 : d > 0 };
}

export interface Meta { meta: number; tolerancia_pct: number }
export interface Termometro {
  atual: number;
  sentido: Sentido;
  janelas: Array<{ id: Janela; rotulo: string; media: number | null; dias: number; minimo: number; delta_pct: number | null; bom: boolean | null }>;
  meta: (Meta & { situacao: Situacao }) | null;
  meta_so_todas: boolean;   // há meta, mas a visão é NOVA/CASTRO (a meta vale para "Todas")
}

/** Termômetro de uma linha: médias (gravadas pelo worker) + meta (só na linha "Todas"). */
export function montarTermometro(
  l: { kpi_id: string; conta: string; valor: number | null; contagem: number; medias?: Medias | null },
  meta: Meta | null,
): Termometro {
  const atual = medida(l);
  const sentido = SENTIDO[l.kpi_id] || 'neutro';
  const ms = l.medias || {};
  const janelas = JANELAS.map((j) => {
    const m = ms[j.id] || { media: null, dias: 0 };
    return { id: j.id, rotulo: j.rotulo, media: m.media, dias: m.dias, minimo: j.minimo, ...comparar(atual, m.media, sentido) };
  });
  const vale = meta && l.conta === 'TODAS';
  return {
    atual, sentido, janelas,
    meta: vale ? { ...meta!, situacao: situacaoMeta(atual, meta!.meta, meta!.tolerancia_pct, sentido) } : null,
    meta_so_todas: !!meta && l.conta !== 'TODAS',
  };
}
