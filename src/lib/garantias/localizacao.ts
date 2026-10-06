// ============================================================================
// Localização física da peça de garantia nas estantes da oficina.
//
// Esquema combinado com o usuário (foto das estantes, 06/10/2026): cada
// estante leva o nome da montadora + número (há 2 da Mahindra) e as
// prateleiras são contadas DE CIMA PRA BAIXO. O código gravado no banco é
// compacto ("MA1-P2"); o rótulo humano ("MAHINDRA 1 · Prateleira 2") sai no
// drawer, na timeline e na impressão do QR colado na caixa.
//
// O campo `garantias.localizacao` é TEXT livre: se um dia aparecer uma
// estante nova fora da lista, um código desconhecido continua sendo exibido
// como foi digitado (rotuloLocalizacao devolve o texto cru).
// ============================================================================

export interface Estante {
  cod: string;
  rotulo: string;
}

export const ESTANTES: Estante[] = [
  { cod: 'MA1', rotulo: 'MAHINDRA 1' },
  { cod: 'MA2', rotulo: 'MAHINDRA 2' },
  { cod: 'VE1', rotulo: 'VENTURA' },
  { cod: 'KU1', rotulo: 'KUHN' },
  { cod: 'OU1', rotulo: 'OUTRAS' },
];

/** Prateleiras por estante, contadas de cima pra baixo. */
export const PRATELEIRAS = [1, 2, 3, 4, 5, 6];

/** Monta o código gravado no banco: ("MA1", 2) → "MA1-P2". */
export function montarLocalizacao(estante: string, prateleira: number): string {
  return `${estante.trim().toUpperCase()}-P${prateleira}`;
}

/** Decompõe "MA1-P2" → { estante: 'MA1', prateleira: 2 }; texto fora do padrão → null. */
export function partesLocalizacao(cod: string | null | undefined): { estante: string; prateleira: number } | null {
  const m = String(cod || '').trim().toUpperCase().match(/^([A-Z]{2}\d)-P(\d{1,2})$/);
  if (!m) return null;
  return { estante: m[1], prateleira: Number(m[2]) };
}

/**
 * Rótulo humano: "MA1-P2" → "MAHINDRA 1 · Prateleira 2".
 * Código de estante desconhecido mantém o código ("XX9 · Prateleira 1");
 * texto fora do padrão volta como está (campo é livre de propósito).
 */
export function rotuloLocalizacao(cod: string | null | undefined): string {
  const bruto = String(cod || '').trim();
  if (!bruto) return '';
  const partes = partesLocalizacao(bruto);
  if (!partes) return bruto;
  const estante = ESTANTES.find((e) => e.cod === partes.estante);
  return `${estante ? estante.rotulo : partes.estante} · Prateleira ${partes.prateleira}`;
}
