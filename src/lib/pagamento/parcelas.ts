// Parcelas a partir da forma de pagamento combinada com o cliente — parte PURA.
// Usada no faturamento da OS (AlterarOS com parcelamento manual, cCodParc "999").
//
// Regras:
//  - vencimentos contam do DIA DO FATURAMENTO (decisão do José, 10/10/2026), no
//    fuso de São Paulo — o servidor roda em UTC e depois das 21h já seria "amanhã";
//  - Σ valores = total exato (centavos que sobram vão na ÚLTIMA parcela);
//  - Σ percentuais = 100,00 (mesma regra do resto);
//  - "À vista" = 1 parcela vencendo no próprio dia.
import { normalizarPagamento, type OpcaoPagamento } from '@/lib/pos/cobranca';

export interface Parcela {
  nParcela: number;
  nDias: number;
  dDtVenc: string; // dd/mm/aaaa
  nValor: number;
  nPercentual: number;
}

export interface PlanoParcelas {
  forma: OpcaoPagamento;
  cCodParc: '999';
  nQtdeParc: number;
  parcelas: Parcela[];
}

/** Dias de cada parcela: "30/60/90" → [30, 60, 90]; "À vista" → [0]. */
export function diasDaForma(forma: OpcaoPagamento): number[] {
  if (forma === 'À vista') return [0];
  if (forma === '30 dias') return [30];
  return forma.split('/').map((d) => Number(d));
}

/** Hoje (YYYY-MM-DD) no fuso de São Paulo. */
export function hojeSaoPaulo(agora: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
}

/** YYYY-MM-DD + N dias → dd/mm/aaaa (aritmética em UTC puro, sem fuso). */
export function somarDiasBR(isoDia: string, dias: number): string {
  const [a, m, d] = isoDia.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + dias));
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${dt.getUTCFullYear()}`;
}

const centavos = (v: number) => Math.round(v * 100);

/**
 * Monta as parcelas. `total` em reais (o nValorTotal da OS no Omie — nunca o
 * valor do portal, que pode divergir). Devolve null se a forma não for reconhecida
 * ou o total não for positivo.
 */
export function parcelasDoPagamento(formaBruta: unknown, total: number, hojeISO: string): PlanoParcelas | null {
  const forma = normalizarPagamento(formaBruta);
  if (!forma || !(total > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(hojeISO)) return null;
  const dias = diasDaForma(forma);
  const n = dias.length;

  const totalC = centavos(total);
  const baseC = Math.floor(totalC / n);
  const basePct = Math.floor(10000 / n); // centésimos de %
  const parcelas = dias.map((nDias, i) => {
    const ultima = i === n - 1;
    const valorC = ultima ? totalC - baseC * (n - 1) : baseC;
    const pctC = ultima ? 10000 - basePct * (n - 1) : basePct;
    return {
      nParcela: i + 1,
      nDias,
      dDtVenc: somarDiasBR(hojeISO, nDias),
      nValor: valorC / 100,
      nPercentual: pctC / 100,
    };
  });
  return { forma, cCodParc: '999', nQtdeParc: n, parcelas };
}

/** Confere parcelas lidas de volta do Omie contra as esperadas. null = confere. */
export function conferirParcelas(
  esperado: PlanoParcelas,
  lidas: Array<{ nValor?: number | string; dDtVenc?: string }> | undefined | null,
): string | null {
  if (!Array.isArray(lidas) || !lidas.length) return 'o Omie não devolveu as parcelas gravadas';
  if (lidas.length !== esperado.nQtdeParc) return `o Omie gravou ${lidas.length} parcela(s), esperado ${esperado.nQtdeParc}`;
  const somaLida = lidas.reduce((s, p) => s + centavos(Number(p.nValor || 0)), 0);
  const somaEsp = esperado.parcelas.reduce((s, p) => s + centavos(p.nValor), 0);
  if (somaLida !== somaEsp) return `soma das parcelas no Omie (R$ ${(somaLida / 100).toFixed(2)}) difere da esperada (R$ ${(somaEsp / 100).toFixed(2)})`;
  return null;
}
