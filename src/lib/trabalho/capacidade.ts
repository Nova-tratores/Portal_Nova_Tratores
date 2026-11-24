// CAPACIDADE da Fila de Trabalho — um lugar só (Fase 0 · I, 24/11/2026).
//
// Ninguém produz 9 h por dia em demanda: com reunião, atendimento e interrupção, o real
// fica perto de 6 h. Desse dia, uma RESERVA DE ROTINA fixa cobre suporte, atendimento e
// os tickets "contínuos" (antes cada contínuo comia 1 h/dia para sempre, e 7 deles
// travavam a fila inteira). O que sobra é o que a fila usa.
//
// TODO fase 2: virar a tabela capacidade_pessoa (cada pessoa ajusta a sua; decisão do
// José em 24/11/2026). Até lá, vale para todo mundo.

/** Horas de trabalho por dia, já descontando reunião e interrupção. */
export const HORAS_DIA_PADRAO = 6

/** Reserva fixa por dia para rotina (suporte, atendimento, contínuos). */
export const RESERVA_ROTINA = 1.5

/** O que sobra por dia para a fila: 6 − 1,5 = 4,5 h. */
export const CAPACIDADE_FILA = HORAS_DIA_PADRAO - RESERVA_ROTINA

/** No máximo N pedidos "em andamento" por pessoa (melhorias 2.3). Começar o próximo pede para
 *  pausar um. Por setor: LIMITE_FAZENDO_POR_SETOR['Peças'] = 3, por exemplo. */
export const LIMITE_FAZENDO = 2
export const LIMITE_FAZENDO_POR_SETOR: Record<string, number> = {}
