// Cobrança da OS pelo Tratorilson — parte PURA (sem banco, sem chatwoot).
// Depois da mensagem-modelo e dos PDFs, a cobrança manda:
//   1) o LINK DE ASSINATURA com a explicação certa (revisão → vai pra fábrica;
//      manutenção → só precisamos da assinatura);
//   2) a pergunta da forma de pagamento escolhida no card.
import type { ResumoOS } from './assinatura-cliente';

/** Opções de faturamento que a equipe escolhe no card (ordem = ordem na tela). */
export const OPCOES_PAGAMENTO = ['30 dias', '30/60', '30/60/90', '30/60/90/120', 'À vista'] as const;
export type OpcaoPagamento = (typeof OPCOES_PAGAMENTO)[number];

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Normaliza o que veio (digitado ou salvo no NovaZap) pra uma das opções; null = não reconhecida. */
export function normalizarPagamento(v: unknown): OpcaoPagamento | null {
  const t = semAcento(String(v ?? ''));
  if (!t) return null;
  if (/^a\s*vista$/.test(t) || t === 'avista') return 'À vista';
  if (/^30\s*(dias|d)?$/.test(t)) return '30 dias';
  const parcelas = t.replace(/\s+/g, '').replace(/dias?$/, '');
  for (const o of OPCOES_PAGAMENTO) {
    if (o.includes('/') && parcelas === o) return o;
  }
  return null;
}

/** "Posso fechar o serviço para 30 dias?" / "…à vista?" */
export function perguntaPagamento(opcao: string): string {
  const o = normalizarPagamento(opcao) ?? String(opcao || '').trim();
  if (!o) return '';
  if (o === 'À vista') return 'Posso fechar o serviço à vista?';
  const texto = o.includes('/') ? `${o} dias` : o;
  return `Posso fechar o serviço para ${texto}?`;
}

/**
 * Mensagem com o link de assinatura, enviada na cobrança.
 * Revisão: explica que o cheque de revisão vai pra fábrica (Mahindra).
 * Manutenção/outros: só diz que precisamos da assinatura na OS.
 */
export function mensagemAssinaturaCobranca(r: Pick<ResumoOS, 'revisaoHoras' | 'numero' | 'trator'>, link: string): string {
  const fecho = `É só abrir o link e assinar na tela do celular: ${link}`;
  if (r.revisaoHoras) {
    return `Como foi uma revisão de ${r.revisaoHoras} horas, precisamos também da sua assinatura no cheque de revisão${r.trator ? ` do ${r.trator}` : ''} — ele é enviado para a fábrica (Mahindra) como comprovante de que a revisão foi feita. ${fecho}`;
  }
  return `Precisamos também da sua assinatura na ordem de serviço${r.numero ? ` nº ${r.numero}` : ''} pra fechar o atendimento. ${fecho}`;
}

/** As mensagens da cobrança que servem de ÂNCORA pra achar a resposta do cliente na conversa. */
export function ehMensagemDeCobranca(texto: string): boolean {
  return /Segue o orçamento|Valor Total:|^Posso fechar (o serviço )?(para|à vista)|assinar na tela do celular/i.test(String(texto || ''));
}
