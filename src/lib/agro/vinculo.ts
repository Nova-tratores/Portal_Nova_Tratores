// Tipo do vínculo CAR ↔ cliente (Score v2, item 1.4). Puro: serve ao navegador e às rotas.
// Quem compra trator costuma ser quem OPERA a área, não o dono da terra — por isso
// o vínculo diz o papel do cliente, e o mesmo imóvel pode ter mais de um.
export const TIPOS_VINCULO = ['proprietario', 'arrendatario_operador', 'parceiro', 'outro'] as const
export type TipoVinculo = (typeof TIPOS_VINCULO)[number]

export const ROTULO_TIPO_VINCULO: Record<TipoVinculo, string> = {
  proprietario: 'Proprietário',
  arrendatario_operador: 'Arrendatário / operador',
  parceiro: 'Parceiro',
  outro: 'Outro',
}

export function tipoVinculoValido(v: unknown): v is TipoVinculo {
  return typeof v === 'string' && (TIPOS_VINCULO as readonly string[]).includes(v)
}

export function rotuloTipoVinculo(v: unknown): string {
  return tipoVinculoValido(v) ? ROTULO_TIPO_VINCULO[v] : 'Tipo não informado'
}

/** Erro do PostgREST quando a função com ESSES argumentos não existe (migration do Gate 1 ainda não aplicada). */
export function assinaturaAusente(e: unknown): boolean {
  const x = e as { code?: string; message?: string } | null
  return x?.code === 'PGRST202' || /could not find the function/i.test(String(x?.message || ''))
}
