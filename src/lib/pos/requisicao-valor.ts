// Valor da requisição na OS do Omie = o "valor cobrado do cliente", o mesmo que a tela da OS mostra e soma.
//  • VAZIO (ninguém preencheu no portal): a requisição NÃO vai para o Omie (José, 23/10/2026, OS-0824: "se não
//    foi atualizado no portal, não precisa enviar"). Antes ia pelo custo e a nota saía maior que a tela.
//  • 0 preenchido: vai com 0,01 — o Omie não aceita 0 e no serviço "div." recusa 0,000001 ("Uncaught Error",
//    OS-0684). O centavo cabe na tolerância da conferência.
// Puro.
import { parseValorMisto } from "@/lib/marketing/custos";

export const VALOR_SIMBOLICO = 0.01;

const vazio = (v: unknown) => v === null || v === undefined || String(v).trim() === "";

/** null = não manda a requisição para o Omie */
export function valorRequisicaoOmie(cobrado: unknown): number | null {
  if (vazio(cobrado)) return null;
  const v = parseValorMisto(cobrado);
  return v > 0 ? v : VALOR_SIMBOLICO;
}
