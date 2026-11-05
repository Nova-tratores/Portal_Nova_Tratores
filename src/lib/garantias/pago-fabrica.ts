// Horas e km que a fábrica PAGOU × o que pedimos (regras puras).
// Pedidas = garantista (senão técnico). Pagas = o que foi gravado à mão
// (fabrica_horas_pagas/km) ou, sem isso, o valor pago ÷ taxa da montadora.

export interface QtdPaga {
  pedidas: number;
  pagas: number;
  recusadas: number;
  /** true = digitado (DRVG); false = deduzido do valor pago */
  informado: boolean;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number.isFinite(Number(v)) ? Number(v) : null);

export function qtdPaga(pedida: unknown, gravada: unknown, valorPago: unknown, taxa: number): QtdPaga {
  const pedidas = num(pedida) ?? 0;
  const g = num(gravada);
  const pagas = g != null ? g : taxa > 0 ? r2((num(valorPago) ?? 0) / taxa) : 0;
  return { pedidas, pagas, recusadas: r2(Math.max(0, pedidas - pagas)), informado: g != null };
}

export function pagoDaGarantia(
  g: {
    garantista_horas?: unknown; tecnico_horas?: unknown; garantista_km?: unknown; tecnico_km?: unknown;
    fabrica_horas_pagas?: unknown; fabrica_km_pagos?: unknown; valor_pago_horas?: unknown; valor_pago_km?: unknown;
  },
  taxa: { hora: number; km: number },
): { horas: QtdPaga; km: QtdPaga } {
  return {
    horas: qtdPaga(g.garantista_horas ?? g.tecnico_horas, g.fabrica_horas_pagas, g.valor_pago_horas, taxa.hora),
    km: qtdPaga(g.garantista_km ?? g.tecnico_km, g.fabrica_km_pagos, g.valor_pago_km, taxa.km),
  };
}

/** novos valores ao trocar as quantidades pagas (o total mantém as peças) */
export function novosValoresPagos(
  atual: { valor_pago_horas?: unknown; valor_pago_km?: unknown; valor_pago_total?: unknown },
  horas: number, km: number, taxa: { hora: number; km: number },
): { valor_pago_horas: number; valor_pago_km: number; valor_pago_total: number } {
  const vh = r2(horas * taxa.hora);
  const vk = r2(km * taxa.km);
  const resto = (num(atual.valor_pago_total) ?? 0) - (num(atual.valor_pago_horas) ?? 0) - (num(atual.valor_pago_km) ?? 0);
  return { valor_pago_horas: vh, valor_pago_km: vk, valor_pago_total: r2(resto + vh + vk) };
}

/** "1:30", "1,5", "0:20" → horas decimais (null = inválido) */
export function lerHoras(txt: string): number | null {
  const s = String(txt || '').trim();
  if (!s) return null;
  const m = s.match(/^(\d+):([0-5]?\d)$/);
  if (m) return r2(Number(m[1]) + Number(m[2]) / 60);
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
