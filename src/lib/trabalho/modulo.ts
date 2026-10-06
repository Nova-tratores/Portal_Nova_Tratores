// CENTRAL DE TRABALHO — Tarefas, Tickets e Cronograma viraram UM módulo.
// Quem tinha qualquer um dos três abre a Central inteira (ninguém perde acesso).
export const MODULOS_CENTRAL = ['tickets', 'tarefas', 'cronograma'] as const

export function temCentral(modulos: readonly string[]): boolean {
  return MODULOS_CENTRAL.some((m) => modulos.includes(m) || modulos.some((p) => p.startsWith(m + ':')))
}

export function ehModuloCentral(modulo: string): boolean {
  return (MODULOS_CENTRAL as readonly string[]).includes(modulo)
}
