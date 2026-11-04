// Regras PURAS de vencimento dos cards do Financeiro (Chamado_NF).
//
// Usadas pela tela Vencidos, pela home do Financeiro e pelo Kanban — antes cada
// tela tinha a sua cópia e elas divergiam (29/10/2026).
//
// Fuso: `new Date('2026-10-29')` é meia-noite UTC = 21h do dia ANTERIOR em
// Brasília. Por isso toda data 'AAAA-MM-DD' é lida como meia-noite LOCAL.

export type CardVenc = {
  status?: string | null;
  forma_pagamento?: string | null;
  vencimento_boleto?: string | null;
  datas_parcelas?: string | null;
  qtd_parcelas?: number | string | null;
  comprovante_pagamento?: string | null;
  grupo_pai_id?: number | string | null;
  [k: string]: unknown;
};

/** 'AAAA-MM-DD' (ou ISO com hora) → Date à meia-noite LOCAL; inválida/vazia → null. */
export function dataLocal(s: unknown): Date | null {
  if (!s) return null;
  const m = String(s).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

/** Hoje à meia-noite local. */
export function hojeLocal(agora: Date = new Date()): Date {
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
}

/** Dias inteiros entre o vencimento e hoje (0 = vence hoje; negativo = ainda vai vencer). */
export function diasEntre(venc: Date | null, hoje: Date): number {
  if (!venc) return 0;
  // Math.round absorve a hora a mais/a menos de horário de verão
  return Math.round((hoje.getTime() - venc.getTime()) / 86400000);
}

const forma = (c: CardVenc) => String(c.forma_pagamento || '').trim();
export const ehPixCartaoCheque = (f: unknown) => /pix|cart[aã]o|cheque/i.test(String(f || ''));
export const ehBoleto30 = (f: unknown) => /^boleto\s*30\s*dias$/i.test(String(f || '').trim());
export const ehParcelado = (f: unknown) => /parcelado/i.test(String(f || ''));

/** Datas das parcelas: [vencimento_boleto, ...datas_parcelas] (corrige o registro antigo que repetia a p1). */
export function datasDasParcelas(c: CardVenc): (string | null)[] {
  const raw = String(c.datas_parcelas || '').split(/[\s,]+/).filter(d => d.includes('-'));
  if (raw.length > 0 && raw[0] === c.vencimento_boleto) raw.shift();
  return [c.vencimento_boleto || null, ...raw];
}

/** Comprovante da parcela n (1 = primeira; a 1ª aceita o campo antigo comprovante_pagamento). */
export function comprovanteDaParcela(c: CardVenc, n: number): unknown {
  return n === 1 ? (c.comprovante_pagamento_p1 || c.comprovante_pagamento) : c[`comprovante_pagamento_p${n}`];
}

/** 1ª parcela com data passada e SEM comprovante; null se nenhuma. */
export function parcelaVencidaSemComprovante(c: CardVenc, hoje: Date): { num: number; data: string } | null {
  const qtd = Math.max(1, parseInt(String(c.qtd_parcelas || 1), 10) || 1);
  const datas = datasDasParcelas(c);
  for (let i = 1; i <= qtd; i++) {
    const ds = datas[i - 1];
    const d = dataLocal(ds);
    if (d && d < hoje && !comprovanteDaParcela(c, i)) return { num: i, data: String(ds) };
  }
  return null;
}

/**
 * Entra na tela Vencidos?
 * - status 'vencido' → sim (card agrupado num principal fica de fora: quem cobra é o principal);
 * - 'aguardando_vencimento' com data passada → sim, EXCETO:
 *   PIX/cartão/cheque (data só combinada), Boleto 30 dias (o servidor move p/ Pago)
 *   e parcelado cuja parcela vencida já tem comprovante.
 */
export function entraEmVencidos(c: CardVenc, hoje: Date): boolean {
  if (c.grupo_pai_id) return false;
  if (c.status === 'vencido') return true;
  if (c.status !== 'aguardando_vencimento') return false;
  const f = forma(c);
  if (ehPixCartaoCheque(f) || ehBoleto30(f)) return false;
  if (ehParcelado(f)) return !!parcelaVencidaSemComprovante(c, hoje);
  const venc = dataLocal(c.vencimento_boleto);
  return !!venc && venc < hoje;
}

/** Data que conta o atraso: no parcelado, a da parcela vencida sem comprovante. */
export function vencimentoDeReferencia(c: CardVenc, hoje: Date): string | null {
  if (ehParcelado(forma(c))) {
    const p = parcelaVencidaSemComprovante(c, hoje);
    if (p) return p.data;
  }
  return c.vencimento_boleto || null;
}

/** Dias de atraso (nunca negativo). */
export function diasDeAtraso(c: CardVenc, hoje: Date): number {
  return Math.max(0, diasEntre(dataLocal(vencimentoDeReferencia(c, hoje)), hoje));
}

/** 'AAAA-MM-DD' (local) de N dias atrás — corte de concluídos no Kanban. */
export function dataDiasAtras(dias: number, agora: Date = new Date()): string {
  const d = hojeLocal(agora);
  d.setDate(d.getDate() - dias);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Contagens do dashboard: 'excluido' (apagado) não conta em nada. */
export function resumoDashboard<T extends { status?: string | null; grupo_pai_id?: unknown; valor_servico?: unknown }>(linhas: T[]) {
  const validos = linhas.filter(b => !b.grupo_pai_id && b.status !== 'excluido');
  const statusCount: Record<string, number> = {};
  validos.forEach(b => { const s = String(b.status); statusCount[s] = (statusCount[s] || 0) + 1; });
  const pagos = validos.filter(b => b.status === 'pago' || b.status === 'concluido');
  return {
    validos,
    totalBoletos: validos.length,
    boletosEmAberto: validos.filter(b => b.status !== 'concluido').length,
    boletosAtrasados: validos.filter(b => b.status === 'vencido').length,
    boletosConfirmados: pagos.length,
    totalFaturado: pagos.reduce((acc, b) => acc + (parseFloat(String(b.valor_servico)) || 0), 0),
    statusCount,
  };
}
