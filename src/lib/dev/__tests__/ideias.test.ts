import { describe, it, expect } from 'vitest'
import {
  validarIdeia, validarGrupo, separarPorEstagio, descricaoDoGrupo, tituloDoGrupo,
  type Ideia, type GrupoIdeias,
} from '../ideias'

const ideia = (p: Partial<Ideia> & { id: string }): Ideia => ({
  texto: 'x', autor_id: 'u1', grupo_id: null, posicao: 0, arquivada: false,
  created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z', ...p,
})
const grupo = (p: Partial<GrupoIdeias> & { id: string }): GrupoIdeias => ({
  nome: 'G', descricao: null, cor: null, ticket_id: null, criado_por: 'u1',
  created_at: '2026-10-09T10:00:00Z', updated_at: '2026-10-09T10:00:00Z', ...p,
})

describe('validarIdeia', () => {
  it('recusa vazio e espaço', () => {
    expect(validarIdeia('').ok).toBe(false)
    expect(validarIdeia('   ').ok).toBe(false)
    expect(validarIdeia(undefined).ok).toBe(false)
  })
  it('apara e aceita', () => {
    const v = validarIdeia('  trocar o cron  ')
    expect(v).toEqual({ ok: true, campos: { texto: 'trocar o cron' } })
  })
  it('recusa acima de 4000', () => {
    expect(validarIdeia('a'.repeat(4001)).ok).toBe(false)
    expect(validarIdeia('a'.repeat(4000)).ok).toBe(true)
  })
})

describe('validarGrupo', () => {
  it('nome obrigatório ao criar, opcional ao editar', () => {
    expect(validarGrupo({}, true).ok).toBe(false)
    expect(validarGrupo({}, false)).toEqual({ ok: true, campos: {} })
    expect(validarGrupo({ nome: ' Crons ' }, true)).toEqual({ ok: true, campos: { nome: 'Crons' } })
  })
  it('cor #RRGGBB ou nula', () => {
    expect(validarGrupo({ nome: 'a', cor: '#ABCDEF' }, true)).toEqual({ ok: true, campos: { nome: 'a', cor: '#abcdef' } })
    expect(validarGrupo({ nome: 'a', cor: 'red' }, true).ok).toBe(false)
    expect(validarGrupo({ cor: '' }, false)).toEqual({ ok: true, campos: { cor: null } })
  })
  it('descrição vazia vira null e tem teto', () => {
    expect(validarGrupo({ descricao: '  ' }, false)).toEqual({ ok: true, campos: { descricao: null } })
    expect(validarGrupo({ descricao: 'x'.repeat(2001) }, false).ok).toBe(false)
  })
})

describe('separarPorEstagio', () => {
  it('ideia sem grupo = captada, mais recente primeiro; arquivada fica fora', () => {
    const r = separarPorEstagio([
      ideia({ id: 'a', created_at: '2026-10-09T10:00:00Z' }),
      ideia({ id: 'b', created_at: '2026-10-09T11:00:00Z' }),
      ideia({ id: 'c', arquivada: true }),
    ], [])
    expect(r.captadas.map((i) => i.id)).toEqual(['b', 'a'])
    expect(r.agrupadas).toEqual([])
    expect(r.planejadas).toEqual([])
  })
  it('grupo sem ticket = agrupado, com ticket = planejado; ideias por posicao', () => {
    const r = separarPorEstagio([
      ideia({ id: 'a', grupo_id: 'g1', posicao: 2 }),
      ideia({ id: 'b', grupo_id: 'g1', posicao: 1 }),
      ideia({ id: 'c', grupo_id: 'g2' }),
      ideia({ id: 'd', grupo_id: 'g1', posicao: 1, created_at: '2026-10-08T10:00:00Z' }),
    ], [grupo({ id: 'g1' }), grupo({ id: 'g2', ticket_id: 't1' })])
    expect(r.agrupadas).toHaveLength(1)
    expect(r.agrupadas[0].ideias.map((i) => i.id)).toEqual(['d', 'b', 'a'])
    expect(r.planejadas).toHaveLength(1)
    expect(r.planejadas[0].grupo.id).toBe('g2')
    expect(r.planejadas[0].ideias.map((i) => i.id)).toEqual(['c'])
  })
  it('grupo vazio ainda aparece (pode receber ideias depois)', () => {
    const r = separarPorEstagio([], [grupo({ id: 'g1' })])
    expect(r.agrupadas[0].ideias).toEqual([])
  })
})

describe('descricaoDoGrupo / tituloDoGrupo', () => {
  it('monta descrição + lista de ideias com autor e data', () => {
    const txt = descricaoDoGrupo(
      { descricao: 'Arrumar os crons.' },
      [
        { texto: 'cron das 03h\nduplicando', autor_id: 'u1', created_at: '2026-10-09T10:00:00Z' },
        { texto: 'status na tela', autor_id: 'u9', created_at: 'data ruim' },
      ],
      { u1: 'Henri Irneh' },
    )
    expect(txt).toBe('Arrumar os crons.\n\nIdeias agrupadas:\n- cron das 03h duplicando (Henri, 09/10)\n- status na tela')
  })
  it('sem descrição e sem ideias devolve vazio', () => {
    expect(descricaoDoGrupo({ descricao: null }, [], {})).toBe('')
  })
  it('título apara', () => {
    expect(tituloDoGrupo({ nome: '  Crons  ' })).toBe('Crons')
  })
})
