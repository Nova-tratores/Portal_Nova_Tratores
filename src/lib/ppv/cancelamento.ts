// Regras PURAS do cancelamento do PPV (sem banco, sem Omie).
// Caso da auditoria de 30/10/2026: o portal marcava "Cancelada" mesmo quando a
// Omie recusava (o CancelarPedidoVenda responde 200 com cCodStatus ≠ "0" no
// corpo) e aceitava cancelar pedido já faturado, que só se desfaz cancelando a NF-e.

export const ETAPA_FATURADO = 60;

const ehCancelada = (s: unknown) => /^cancelad[ao]$/i.test(String(s ?? '').trim());

/** Motivo para NÃO cancelar o pedido (null = pode cancelar). */
export function bloqueioCancelamento(p: { faturadoEm?: string | null; etapaOmie?: string | number | null }): string | null {
  if (p.faturadoEm) return 'Este pedido já foi faturado (tem NF-e). Para desfazer, cancele a NF-e no Omie primeiro.';
  if (Number(p.etapaOmie || 0) >= ETAPA_FATURADO) return 'No Omie este pedido já está faturado. Para desfazer, cancele a NF-e no Omie primeiro.';
  return null;
}

/** A resposta do CancelarPedidoVenda: a Omie responde 200 mesmo quando recusa. */
export function falhaNaResposta(resp: { cCodStatus?: unknown; cDescStatus?: unknown } | null | undefined): string | null {
  const cod = String(resp?.cCodStatus ?? '').trim();
  if (!cod || cod === '0') return null;
  return String(resp?.cDescStatus || '').trim() || `código ${cod}`;
}

/**
 * Salvar a ficha (PATCH) não pode cancelar um pedido que está no Omie: ficaria
 * "Cancelada" no portal e vivo lá. Esse caminho é o botão Cancelar (cancela lá primeiro).
 */
export function cancelarPeloSalvar(p: { statusAntes: string | null; statusNovo: string; pedidoOmie?: string | null }): string | null {
  if (!ehCancelada(p.statusNovo) || ehCancelada(p.statusAntes)) return null;
  if (!String(p.pedidoOmie ?? '').trim()) return null;
  return 'Este pedido está no Omie: use "Cancelar pedido" (pede o motivo e cancela no Omie primeiro).';
}
