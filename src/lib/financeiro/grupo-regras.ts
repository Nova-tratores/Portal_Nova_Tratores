// Regras PURAS do agrupamento de cards de cobrança (Chamado_NF) — sem banco.
// Usadas pela UI (GrupoDoCardBox / AgruparCardsModal), por grupo.js e espelhadas
// nas funções SQL de sql/financeiro-grupo-rpc.sql (mesma trava de fase).
//
// Por que a trava: depois que o pai saiu de Gerar Boleto / Validar Pix, o boleto
// (com o TOTAL do grupo) já foi gerado/enviado. Tirar um filho nessa hora fazia o
// filho voltar pra Gerar Boleto com o valor original → cobrança em DOBRO.

/** Fases em que ainda dá pra juntar/tirar cards do grupo (nada foi cobrado ainda). */
export const FASES_GRUPO_EDITAVEL = ['gerar_boleto', 'validar_pix'] as const;

const ROTULO_FASE: Record<string, string> = {
  gerar_boleto: 'Gerar Boleto',
  validar_pix: 'Validar Pix',
  enviar_cliente: 'Enviar para o Cliente',
  aguardando_vencimento: 'Aguardando Cliente',
  pago: 'Pago',
  vencido: 'Vencido',
  concluido: 'Concluído',
  sem_boleto: 'Cliente Sem Boleto',
  excluido: 'Excluído',
};

export function rotuloFase(status: unknown): string {
  const s = String(status ?? '').trim();
  return ROTULO_FASE[s] || s || '(sem fase)';
}

export function podeMexerNoGrupo(status: unknown): boolean {
  return (FASES_GRUPO_EDITAVEL as readonly string[]).includes(String(status ?? '').trim());
}

/**
 * Mensagem de bloqueio (ou null se pode). `acao`: 'remover' (tirar um card do
 * grupo) ou 'juntar' (montar/ampliar o grupo).
 */
export function motivoGrupoTravado(
  status: unknown,
  acao: 'remover' | 'juntar',
  cardId?: number | string | null,
): string | null {
  if (podeMexerNoGrupo(status)) return null;
  const card = cardId != null && cardId !== '' ? `#${cardId} ` : '';
  const fase = rotuloFase(status);
  if (acao === 'remover') {
    return `Não dá pra tirar cards deste grupo: o card principal ${card}está em "${fase}" e o boleto com o valor TOTAL do grupo já foi gerado/enviado. ` +
      'Se o card sair agora, ele volta pra cobrança com o valor dele e o cliente é cobrado em dobro. ' +
      'Para separar, cancele/substitua o boleto e devolva o card principal para "Gerar Boleto" primeiro.';
  }
  return `Não dá pra juntar: o card ${card}está em "${fase}". Só é possível juntar cards em "Gerar Boleto" ou "Validar Pix" (antes de gerar o boleto).`;
}

/** Erro do supabase-js dizendo que a função RPC ainda não existe (migration não aplicada). */
export function ehRpcAusente(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: unknown; message?: unknown };
  const code = String(e.code ?? '');
  if (code === 'PGRST202' || code === '42883') return true;
  return /could not find the function/i.test(String(e.message ?? ''));
}

/** Normaliza o nome do cliente para comparar (mesma regra do modal de juntar). */
export function normCliente(s: unknown): string {
  return String(s ?? '').trim().toUpperCase();
}
