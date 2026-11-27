// Frete fora do custo (27/11/2026). Regras PURAS sobre o kardex da Omie (MovimentoEstoque).
//
// A Omie soma o frete (CT-e) no CMC com um movimento "CTR" (Conhecimento de Transporte
// Recebido) ligado à NF-e da carga pelo idDoc, na DATA DE REGISTRO do CT-e. Dois jeitos de
// o frete não ir para o custo das peças certas (achados em 26/11/2026):
//  - estoque_zerado: o CTR caiu com o estoque do produto zerado (ou negativo) — o frete some;
//  - cte_antes_da_nf: o CTR caiu ANTES da entrada da própria NF (data de registro do CT-e
//    anterior) — o frete vai para o estoque antigo, não para as peças da carga.

export type MotivoFrete = 'estoque_zerado' | 'cte_antes_da_nf';

export interface MovKardex {
  data: string | null;
  codOrigem: string;
  numPedido: string | null;   // no CTR: nº do CT-e
  idDoc: number | string | null;
  qtdeAnterior: number | null;
  cmcAnterior: number | null;
  cmcAtual: number | null;
  cancelado?: boolean;
  raw?: { movPeriodo?: Array<{ tipo?: string; cmcTotal?: number; qtde?: number }> } | null;
}

export interface FreteForaDoCusto {
  dataMov: string;
  cteNumero: string | null;
  idDoc: number | null;
  motivo: MotivoFrete;
  qtdAntes: number | null;
  freteValor: number | null;
  cmcAntes: number | null;
  cmcDepois: number | null;
}

function totalDo(m: MovKardex, prefixo: string): number | null {
  const e = (m.raw?.movPeriodo || []).find((x) => String(x.tipo || '').trim().startsWith(prefixo));
  return e && e.cmcTotal != null ? Number(e.cmcTotal) : null;
}

/** Valor do frete do CTR: o que entrou no custo total; sem isso, a variação do total. */
export function valorDoFrete(m: MovKardex): number | null {
  const entrada = totalDo(m, '2');
  if (entrada != null && entrada > 0) return Math.round(entrada * 100) / 100;
  const antes = totalDo(m, '1');
  const depois = totalDo(m, '4');
  if (antes == null || depois == null) return null;
  return Math.round((depois - antes) * 100) / 100;
}

/** Fretes deste produto que não foram para o custo certo, na ordem do kardex. */
export function fretesForaDoCusto(movs: MovKardex[]): FreteForaDoCusto[] {
  const out: FreteForaDoCusto[] = [];
  movs.forEach((m, i) => {
    if (m.codOrigem !== 'CTR' || m.cancelado) return;
    const base = {
      dataMov: String(m.data || ''),
      cteNumero: m.numPedido ? String(m.numPedido).replace(/^0+(?=\d)/, '') : null,
      idDoc: m.idDoc != null && m.idDoc !== '' ? Number(m.idDoc) : null,
      qtdAntes: m.qtdeAnterior,
      freteValor: valorDoFrete(m),
      cmcAntes: m.cmcAnterior,
      cmcDepois: m.cmcAtual,
    };
    if (m.qtdeAnterior != null && m.qtdeAnterior <= 0) { out.push({ ...base, motivo: 'estoque_zerado' }); return; }
    const nf = movs.findIndex((x) => x.codOrigem === 'COM' && !x.cancelado && base.idDoc != null && Number(x.idDoc) === base.idDoc);
    if (nf > i) out.push({ ...base, motivo: 'cte_antes_da_nf' });
  });
  return out;
}

export const ROTULO_MOTIVO: Record<MotivoFrete, string> = {
  estoque_zerado: 'entrou com o estoque zerado (o frete sumiu do custo)',
  cte_antes_da_nf: 'entrou antes da nota da carga (foi para o estoque antigo)',
};
