// Garantia SÓ DE PEÇAS (sem OS) — regras puras, sem banco.
//
// Pedido de 24/11/2026: às vezes a garantia é só para a fábrica repor peças
// (peça do nosso estoque que veio com defeito, tinta, peça de terceiro…). Não há
// serviço, horas nem km, então não faz sentido abrir uma OS. A garantia nasce
// sem `id_ordem`, com cliente e trator OPCIONAIS e as peças buscadas no
// cadastro ou digitadas à mão.

export interface PecaSoPecasEntrada {
  cod_produto?: string | null;
  descricao?: string | null;
  quantidade?: number | string | null;
  preco_unitario?: number | string | null;
}

export interface PecaSoPecas {
  cod_produto: string | null;
  descricao: string;
  quantidade: number;
  preco_unitario: number;
}

export interface NovaGarantiaSoPecasEntrada {
  motivo?: string | null;
  cliente?: string | null;
  chassis?: string | null;
  modelo?: string | null;
  pecas?: PecaSoPecasEntrada[] | null;
}

export interface NovaGarantiaSoPecas {
  motivo: string;
  cliente: string | null;
  chassis: string | null;
  modelo: string | null;
  pecas: PecaSoPecas[];
}

/** "1.290,50" | "1290.5" | 1290.5 → 1290.5 (NaN vira 0) */
export function numeroBR(v: unknown): number {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v ?? '').trim().replace(/[R$\s]/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

const texto = (v: unknown, max: number) => {
  const s = String(v ?? '').trim().replace(/\s+/g, ' ');
  return s ? s.slice(0, max) : null;
};

/** Normaliza uma peça; null quando não tem descrição nem código. */
export function normalizarPeca(p: PecaSoPecasEntrada): PecaSoPecas | null {
  const cod = texto(p.cod_produto, 60);
  const desc = texto(p.descricao, 300) || cod;
  if (!desc) return null;
  const qtd = numeroBR(p.quantidade);
  const preco = numeroBR(p.preco_unitario);
  return {
    cod_produto: cod,
    descricao: desc,
    quantidade: qtd > 0 ? Math.round(qtd * 100) / 100 : 1,
    preco_unitario: preco > 0 ? Math.round(preco * 100) / 100 : 0,
  };
}

/** Valida e normaliza o pedido de garantia só de peças. */
export function validarNovaGarantiaSoPecas(
  e: NovaGarantiaSoPecasEntrada,
): { ok: true; valor: NovaGarantiaSoPecas } | { ok: false; erro: string } {
  const motivo = texto(e.motivo, 2000);
  if (!motivo) return { ok: false, erro: 'Descreva o defeito / motivo da garantia.' };
  const pecas = (e.pecas || []).map(normalizarPeca).filter((p): p is PecaSoPecas => !!p);
  if (pecas.length === 0) return { ok: false, erro: 'Inclua pelo menos uma peça.' };
  if (pecas.length > 100) return { ok: false, erro: 'No máximo 100 peças por garantia.' };
  return {
    ok: true,
    valor: {
      motivo,
      cliente: texto(e.cliente, 200),
      chassis: texto(e.chassis, 60)?.toUpperCase() || null,
      modelo: texto(e.modelo, 120),
      pecas,
    },
  };
}

/** Garantia sem OS = só de peças. */
export function ehSoPecas(g: { id_ordem?: string | null; so_pecas?: boolean | null }): boolean {
  return !!g.so_pecas || !String(g.id_ordem || '').trim();
}

/** Como citar a garantia em avisos/textos: "OS OS-0123" ou "só peças (sem OS)". */
export function refOS(g: { id_ordem?: string | null }): string {
  const os = String(g.id_ordem || '').trim();
  return os ? `OS ${os}` : 'só peças (sem OS)';
}

/** Valor total das peças pedidas. */
export function totalPecas(pecas: { quantidade: number; preco_unitario: number }[]): number {
  return Math.round(pecas.reduce((s, p) => s + (Number(p.quantidade) || 0) * (Number(p.preco_unitario) || 0), 0) * 100) / 100;
}
