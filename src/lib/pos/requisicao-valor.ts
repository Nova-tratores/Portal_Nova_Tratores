// Valor da requisição na OS do Omie (23/10/2026, OS-0684): "valor cobrado do cliente"
// PREENCHIDO vale, mesmo 0 — é o que a tela da OS mostra e soma. O custo
// (valor_despeza) só entra quando o cobrado está vazio (ainda não precificado).
// Antes o 0 caía no custo: a tela somava R$ 802,19 e a nota saía R$ 829,19.
// Linha sem valor vai com 0,000001 (igual à solicitação): o Omie não aceita 0,
// e assim a nota fecha com a tela. Puro (sem banco, sem Omie).
import { parseValorMisto } from "@/lib/marketing/custos";

export const VALOR_SIMBOLICO = 0.000001;

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

export function valorRequisicaoOmie(cobrado: unknown, despeza: unknown): number {
  const v = vazio(cobrado) ? parseValorMisto(despeza) : parseValorMisto(cobrado);
  return v > 0 ? v : VALOR_SIMBOLICO;
}
