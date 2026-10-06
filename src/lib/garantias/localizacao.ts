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

/**
 * Monta o código gravado no banco:
 *   ("MA1", 2)                 → "MA1-P2"            (peça solta na prateleira)
 *   ("MA1", 2, true)           → "MA1-P2-CX"         (dentro de caixa, sem identificação)
 *   ("MA1", 2, true, "AZUL")   → "MA1-P2-CX:AZUL"    (dentro da caixa AZUL)
 */
export function montarLocalizacao(estante: string, prateleira: number, emCaixa?: boolean, caixaId?: string): string {
  const base = `${estante.trim().toUpperCase()}-P${prateleira}`;
  if (!emCaixa) return base;
  const id = String(caixaId || '').trim();
  return id ? `${base}-CX:${id}` : `${base}-CX`;
}

export interface PartesLocalizacao {
  estante: string;
  prateleira: number;
  /** true quando a peça está dentro de uma caixa na prateleira */
  emCaixa: boolean;
  /** identificação da caixa ("AZUL", "C3"...) ou null */
  caixa: string | null;
}

/** Decompõe "MA1-P2-CX:AZUL" → partes; texto fora do padrão → null. */
export function partesLocalizacao(cod: string | null | undefined): PartesLocalizacao | null {
  const m = String(cod || '').trim().match(/^([A-Za-z]{2}\d)-[Pp](\d{1,2})(-[Cc][Xx](?::(.+))?)?$/);
  if (!m) return null;
  return {
    estante: m[1].toUpperCase(),
    prateleira: Number(m[2]),
    emCaixa: !!m[3],
    caixa: m[4]?.trim() || null,
  };
}

/**
 * Rótulo humano: "MA1-P2-CX:AZUL" → "MAHINDRA 1 · Prateleira 2 · Caixa AZUL".
 * Sem o sufixo de caixa não acrescenta nada (peça solta na prateleira).
 * Código de estante desconhecido mantém o código ("XX9 · Prateleira 1");
 * texto fora do padrão volta como está (campo é livre de propósito).
 */
export function rotuloLocalizacao(cod: string | null | undefined): string {
  const bruto = String(cod || '').trim();
  if (!bruto) return '';
  const partes = partesLocalizacao(bruto);
  if (!partes) return bruto;
  const estante = ESTANTES.find((e) => e.cod === partes.estante);
  const base = `${estante ? estante.rotulo : partes.estante} · Prateleira ${partes.prateleira}`;
  if (!partes.emCaixa) return base;
  return `${base} · ${partes.caixa ? `Caixa ${partes.caixa}` : 'Em caixa'}`;
}
