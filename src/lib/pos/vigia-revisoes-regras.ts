// Vigia de revisões — REGRAS PURAS (sem banco), testáveis.
//
// Pergunta que o vigia responde para cada OS de revisão Mahindra:
// "a revisão foi FATURADA e o cheque de revisão NÃO foi enviado?"
// Fonte da verdade do envio: revisao_emails (envio real ou registro manual).
// Regra (José, 28/09/2026): só conta como faltando quando a OS da revisão foi
// faturada (tem número de OS no Omie) e não existe envio do cheque daquelas
// horas para aquele chassi. OS em aberto, cortesia sem faturar, cancelada ou
// que não é de revisão → sem pendência. Inspeção de pré-entrega e revisões
// anteriores NÃO entram (cada OS responde só pela própria revisão).
import { REVISOES_LISTA } from '@/lib/revisoes/types';

export const JANELA_PADRAO_DIAS = 60;

export const HORAS_REVISOES: number[] = REVISOES_LISTA.map((h) => Number(h.replace('h', '')));

export interface OSVigia {
  id: string;
  status: string;
  /** OS faturada = tem número de OS no Omie (`Ordem_Omie` / `id_omie`). */
  faturada: boolean;
  /** Data de abertura (YYYY-MM-DD). */
  data?: string | null;
  /** Fim do serviço (YYYY-MM-DD), quando registrado. */
  dataFim?: string | null;
}

export interface PendenciaVigia {
  motivo: string;
  detalhes: string[];
  chassis: string;
}

/** Aproxima um horímetro/pedido solto à revisão do plano mais próxima (ex.: 1000 → 900). */
export function normalizarHorasRevisao(h: number | null | undefined): number | null {
  if (!h || !Number.isFinite(h) || h <= 0) return null;
  if (HORAS_REVISOES.includes(h)) return h;
  let melhor = HORAS_REVISOES[0];
  for (const r of HORAS_REVISOES) if (Math.abs(r - h) < Math.abs(melhor - h)) melhor = r;
  // fora do plano (ex.: 5000h) não vira revisão conhecida
  return Math.abs(melhor - h) <= 200 ? melhor : null;
}

/** Aceita "YYYY-MM-DD" (OS) e "DD/MM/YYYY" (tabela tratores, legado AppSheet). */
export function parseData(d: string | null | undefined): Date | null {
  if (!d) return null;
  const s = String(d).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]), 12, 0, 0);
  return null;
}

export function diasDesde(d: string | null | undefined, hoje: Date): number | null {
  const dt = parseData(d);
  if (!dt) return null;
  const h0 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate(), 12, 0, 0);
  return Math.floor((h0.getTime() - dt.getTime()) / 86_400_000);
}

/** Tem número de OS do Omie? ("000000000005069", 5069, "4506"...) */
export function osFaturada(ordemOmie: unknown, idOmie?: unknown): boolean {
  const v = String(ordemOmie ?? '').trim();
  if (v && /[1-9]/.test(v)) return true;
  const n = Number(idOmie);
  return Number.isFinite(n) && n > 0;
}

export interface AvaliacaoEntrada {
  os: OSVigia;
  chassis: string;
  /** Revisão pedida na OS (já normalizada ao plano), ou null se a OS não é de revisão. */
  horas: number | null;
  /** Horas das revisões deste chassi já enviadas (revisao_emails). */
  enviadas: Set<number>;
  hoje: Date;
}

/** Devolve a pendência da OS, ou null quando está tudo em ordem. */
export function avaliarOS(e: AvaliacaoEntrada): PendenciaVigia | null {
  const { os, chassis, horas, enviadas, hoje } = e;
  if (os.status === 'Cancelada') return null;
  if (!horas) return null;
  if (!os.faturada) return null;
  if (enviadas.has(horas)) return null;

  const dias = diasDesde(os.dataFim || os.data, hoje);
  const quando = dias === null ? '' : ` — serviço concluído há ${dias} dias`;
  return {
    motivo: 'OS com pendências Mahindra',
    detalhes: [`Cheque de revisão ${horas}h não enviado (OS faturada${quando})`],
    chassis,
  };
}

const semContador = (d: string) => d.replace(/\s*— serviço concluído há \d+ dias/, '');

/** Itens que existem na nova pendência e não existiam na anterior (base da notificação). */
export function detalhesNovos(anterior: PendenciaVigia | null | undefined, nova: PendenciaVigia | null): string[] {
  if (!nova) return [];
  const antes = new Set((anterior?.detalhes || []).map(semContador));
  return nova.detalhes.filter((d) => !antes.has(semContador(d)));
}

/** Duas pendências dizem a mesma coisa? (ignora só o contador de dias) */
export function mesmaPendencia(a: PendenciaVigia | null | undefined, b: PendenciaVigia | null): boolean {
  const norm = (p: PendenciaVigia | null | undefined) => (p ? p.detalhes.map(semContador).join('|') : '');
  return norm(a) === norm(b);
}

/** Data YYYY-MM-DD de N dias atrás (limite da janela de varredura). */
export function dataLimite(hoje: Date, dias: number): string {
  const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - dias, 12, 0, 0);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
