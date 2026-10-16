import { describe, expect, it } from 'vitest'
import { acharConflitos, textoConflito } from '../conflitos'
import type { ItemAgenda } from '../regras'

const item = (p: Partial<ItemAgenda>): ItemAgenda => ({
  id: 'x', ref: 'r1', fonte: 'evento', titulo: 'Visita', inicio: '2026-10-17T09:00:00-03:00', fim: '2026-10-17T10:00:00-03:00',
  diaInteiro: false, pessoas: ['ana'], ...p,
})
const nomes = new Map([['ana', 'Ana'], ['bia', 'Bia']])
const j = (ini: string, fim: string) => [{ inicio: `2026-10-17T${ini}:00-03:00`, fim: `2026-10-17T${fim}:00-03:00` }]

describe('conflito de horário na agenda', () => {
  it('bloqueia a mesma pessoa no mesmo horário', () => {
    const c = acharConflitos(j('09:30', '11:00'), ['ana'], null, [item({})], { nomes })
    expect(c).toHaveLength(1)
    expect(textoConflito(c[0])).toBe('Ana já tem “Visita” em 17/10, 09:00–10:00.')
  })
  it('encostar (um termina quando o outro começa) não é conflito', () => {
    expect(acharConflitos(j('10:00', '11:00'), ['ana'], null, [item({})], { nomes })).toEqual([])
  })
  it('outra pessoa e outro local não conflitam', () => {
    expect(acharConflitos(j('09:00', '10:00'), ['bia'], 'Sala Pós Vendas', [item({ local: 'Sala de Reunião' })], { nomes })).toEqual([])
  })
  it('mesmo local ocupado bloqueia, mesmo com outras pessoas', () => {
    const c = acharConflitos(j('09:00', '10:00'), ['bia'], 'sala de reuniao', [item({ local: 'Sala de Reunião' })], { nomes })
    expect(c.map(textoConflito)).toEqual(['Sala de Reunião já está ocupada por “Visita” em 17/10, 09:00–10:00.'])
  })
  it('ignora o próprio compromisso (editar) e itens de dia inteiro / OS', () => {
    expect(acharConflitos(j('09:00', '10:00'), ['ana'], null, [item({})], { nomes, ignorarRef: 'r1' })).toEqual([])
    expect(acharConflitos(j('09:00', '10:00'), ['ana'], null, [item({ diaInteiro: true }), item({ id: 'y', fonte: 'os' })], { nomes })).toEqual([])
  })
})
