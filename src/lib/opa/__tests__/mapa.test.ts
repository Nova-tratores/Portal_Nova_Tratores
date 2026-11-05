import { describe, expect, it } from 'vitest'
import {
  andarVizinho, corDoDepartamento, COR_SEM_DEPARTAMENTO, idUnico, limitarRet, MIN_LADO, opasPorLocal,
  PALETA, retanguloNovo, validarBlocos, type Andar,
} from '../mapa'

describe('limitarRet', () => {
  it('não sai da planta e respeita o tamanho mínimo', () => {
    expect(limitarRet({ x: 95, y: -5, w: 20, h: 1 })).toEqual({ x: 80, y: 0, w: 20, h: MIN_LADO })
    expect(limitarRet({ x: 10.04, y: 10, w: 200, h: 30 }).w).toBe(100)
  })
})

describe('retanguloNovo', () => {
  it('acha o primeiro espaço livre', () => {
    const r = retanguloNovo([{ x: 0, y: 0, w: 50, h: 100 }])
    expect(r.x).toBeGreaterThanOrEqual(50)
  })
  it('planta cheia: no meio', () => {
    expect(retanguloNovo([{ x: 0, y: 0, w: 100, h: 100 }])).toMatchObject({ x: 43, y: 45 })
  })
})

describe('corDoDepartamento', () => {
  it('cor fixa pela ordem; sem departamento = cinza', () => {
    expect(corDoDepartamento('b', ['a', 'b'])).toBe(PALETA[1])
    expect(corDoDepartamento(null, ['a'])).toBe(COR_SEM_DEPARTAMENTO)
    expect(corDoDepartamento('x', ['a'])).toBe(COR_SEM_DEPARTAMENTO)
  })
})

describe('andarVizinho', () => {
  const andares: Andar[] = [
    { id: 'andar_2', nome: '2º andar', ordem: 1, blocos: [], ativo: true },
    { id: 'terreo', nome: 'Térreo', ordem: 0, blocos: [], ativo: true },
    { id: 'velho', nome: 'Velho', ordem: 2, blocos: [], ativo: false },
  ]
  it('sobe e desce pela ordem, ignora inativos', () => {
    expect(andarVizinho(andares, 'terreo', 1)?.id).toBe('andar_2')
    expect(andarVizinho(andares, 'andar_2', 1)).toBeNull()
    expect(andarVizinho(andares, 'andar_2', -1)?.id).toBe('terreo')
  })
})

describe('idUnico', () => {
  it('nome legível e sem repetir', () => {
    expect(idUnico('2º andar', [])).toBe('2_andar')
    expect(idUnico('Mezanino', ['mezanino'])).toBe('mezanino_2')
  })
})

describe('validarBlocos', () => {
  it('exige nome e limpa o retângulo', () => {
    expect(validarBlocos([{ nome: ' ', x: 1, y: 1, w: 5, h: 5 }])).toBe('Todo bloco precisa de nome.')
    const ok = validarBlocos([{ nome: 'Escritório', x: 99, y: 0, w: 10, h: 10 }, { id: 'a', nome: 'A' }, { id: 'a', nome: 'B' }])
    expect(Array.isArray(ok) && ok[0]).toMatchObject({ id: 'escritorio', x: 90 })
    expect(Array.isArray(ok) && ok[2].id).not.toBe('a')   // id repetido ganha outro
  })
})

describe('opasPorLocal', () => {
  it('agrupa e ordena do mais antigo', () => {
    const m = opasPorLocal([
      { id: '2', titulo: 'b', local: 'x', responsavel: null, created_at: '2026-11-02' },
      { id: '1', titulo: 'a', local: 'x', responsavel: null, created_at: '2026-11-01' },
      { id: '3', titulo: 'c', local: null, responsavel: null, created_at: '2026-11-01' },
    ])
    expect(m.x.map((o) => o.id)).toEqual(['1', '2'])
    expect(Object.keys(m)).toEqual(['x'])
  })
})
