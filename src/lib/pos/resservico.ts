// Resserviço (José, 22/10/2026): uma OS concluída que precisou de o técnico voltar ao cliente para refazer.
//  - Na OS ORIGINAL fica o registro (`Ordem_Servico.resservico`): a OS nova, o motivo e o que o técnico fez de
//    errado. No POS ela fica VERMELHA em Concluída (as concluídas normais ficam verdes).
//  - Nasce uma OS NOVA, cópia da original (`resservico_de` = nº da original), que aparece no app dos técnicos
//    como "Resserviço da OS-xxxx". No portal ela não vira cartão: aparece só dentro da original.
//  - Na Liga, a OS com resserviço deixa de ser "OS limpa" (não dá os 5 pontos).
// Puro (sem banco) — testado em __tests__/resservico.test.ts.

export const MOTIVOS_RESSERVICO = [
  { id: 'servico_mal_feito', rotulo: 'Serviço mal feito / incompleto' },
  { id: 'peca_mal_montada', rotulo: 'Peça mal montada ou apertada' },
  { id: 'faltou_item', rotulo: 'Faltou fazer um item pedido' },
  { id: 'diagnostico_errado', rotulo: 'Diagnóstico errado' },
  { id: 'vazamento', rotulo: 'Vazamento depois do serviço' },
  { id: 'outro', rotulo: 'Outro motivo' },
] as const
export type MotivoResservico = (typeof MOTIVOS_RESSERVICO)[number]['id']

export interface RegistroResservico {
  /** Id_Ordem da OS de resserviço criada */
  os: string
  motivo: MotivoResservico
  /** o que o técnico fez de errado (obrigatório) */
  erro: string
  /** técnico(s) que fizeram o serviço original — quem errou */
  tecnicos: string[]
  /** quem vai voltar no cliente */
  tecnicoVolta: string
  por: string
  em: string
}

export function rotuloMotivo(m: string): string {
  return MOTIVOS_RESSERVICO.find((x) => x.id === m)?.rotulo || m || 'Outro motivo'
}

export interface PedidoResservico { motivo: string; erro: string; tecnicoVolta?: string; tecnicoVolta2?: string; previsao?: string }

/** Valida o pedido; devolve a mensagem de erro ou null. */
export function validarResservico(p: Partial<PedidoResservico>, os: { status: string; jaTem: boolean; ehResservico: boolean }): string | null {
  if (os.ehResservico) return 'Esta OS já é um resserviço. Registre o resserviço na OS original.'
  if (os.jaTem) return 'Esta OS já tem um resserviço registrado.'
  if (/cancel/i.test(os.status)) return 'OS cancelada não gera resserviço.'
  if (!MOTIVOS_RESSERVICO.some((m) => m.id === p.motivo)) return 'Escolha o motivo do resserviço.'
  if (String(p.erro || '').trim().length < 5) return 'Escreva o que o técnico fez de errado (é o que aparece para ele no app).'
  if (p.previsao && !/^\d{4}-\d{2}-\d{2}$/.test(p.previsao)) return 'Data prevista inválida.'
  return null
}

/** Texto da solicitação da OS de resserviço (é o que o técnico lê no app). */
export function textoSolicitacao(original: { id: string; servSolicitado: string }, p: { motivo: string; erro: string }): string {
  return [
    `RESSERVIÇO da ${original.id} — ${rotuloMotivo(p.motivo)}`,
    `O que precisa refazer: ${p.erro.trim()}`,
    '',
    `— Serviço original (${original.id}) —`,
    String(original.servSolicitado || '').trim() || '(sem descrição)',
  ].join('\n')
}

/** Cor do cartão em Concluída: verde = concluída normal; vermelho = teve resserviço. */
export function corConcluida(o: { status: string; resservico?: unknown }): 'ok' | 'resservico' | null {
  if (o.resservico) return 'resservico'
  return /^conclu/i.test(String(o.status || '')) ? 'ok' : null
}
