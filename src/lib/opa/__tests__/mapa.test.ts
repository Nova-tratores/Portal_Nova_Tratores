import { describe, expect, it } from 'vitest'
import {
  andarVizinho, corDoDepartamento, COR_SEM_DEPARTAMENTO, idUnico, limitarRet, MIN_LADO, opasPorLocal,
  PALETA, redimensionar, retanguloNovo, validarBlocos, type Andar,
} from '../mapa'

describe('limitarRet', () => {
  it('não sai da planta e respeita o tamanho mínimo', () => {
    expect(limitarRet({ x: 95, y: -5, w: 20, h: 1 })).toEqual({ x: 80, y: 0, w: 20, h: MIN_LADO })
    expect(limitarRet({ x: 10.04, y: 10, w: 200, h: 30 }).w).toBe(100)
  })
})

describe('redimensionar', () => {
  const o = { x: 40, y: 30, w: 40, h: 60 }
  it('lado direito muda só a largura', () => expect(redimensionar(o, 'l', 10, 99)).toEqual({ x: 40, y: 30, w: 50, h: 60 }))
  it('lado esquerdo segura a parede da direita', () => expect(redimensionar(o, 'o', -10, 0)).toEqual({ x: 30, y: 30, w: 50, h: 60 }))
  it('lado de cima segura o de baixo', () => expect(redimensionar(o, 'n', 0, 10)).toEqual({ x: 40, y: 40, w: 40, h: 50 }))
  it('não passa da planta nem do mínimo', () => {
    expect(redimensionar(o, 'l', 50, 0).w).toBe(60)
    expect(redimensionar(o, 'o', 80, 0)).toMatchObject({ x: 80 - MIN_LADO, w: MIN_LADO })
    expect(redimensionar(o, 'mover', 90, 0).x).toBe(60)
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

describe('formas e estrutura (06/11)', () => {
  it('arrasto vira a caixa; clique sem arrastar usa o tamanho padrão no meio', async () => {
    const { retanguloDoArrasto } = await import('../mapa')
    expect(retanguloDoArrasto(40, 30, 20, 50, { w: 10, h: 10 })).toEqual({ x: 20, y: 30, w: 20, h: 20 })
    expect(retanguloDoArrasto(50, 50, 50.5, 50.2, { w: 10, h: 8 })).toEqual({ x: 45, y: 46, w: 10, h: 8 })
  })
  it('pontos da forma livre ficam em % da própria caixa', async () => {
    const { caixaDosPontos } = await import('../mapa')
    expect(caixaDosPontos([{ x: 10, y: 10 }, { x: 30, y: 10 }])).toBeNull()
    const c = caixaDosPontos([{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 20, y: 30 }])!
    expect(c.ret).toEqual({ x: 10, y: 10, w: 20, h: 20 })
    expect(c.pontos).toEqual([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 50, y: 100 }])
  })
  it('área no ponto = a menor área que contém (estrutura não conta)', async () => {
    const { areaNoPonto } = await import('../mapa')
    const blocos = [
      { id: 'oficina', nome: 'Oficina', x: 0, y: 0, w: 50, h: 50 },
      { id: 'pecas', nome: 'Peças', x: 10, y: 10, w: 10, h: 10 },
      { id: 'parede', nome: 'Parede', tipo: 'parede' as const, x: 12, y: 12, w: 2, h: 1 },
    ]
    expect(areaNoPonto(blocos, 12.5, 12.5)?.id).toBe('pecas')
    expect(areaNoPonto(blocos, 40, 40)?.id).toBe('oficina')
    expect(areaNoPonto(blocos, 80, 80)).toBeNull()
  })
  it('validarBlocos guarda o tipo e deixa a parede fininha', () => {
    const r = validarBlocos([{ nome: 'Parede', tipo: 'parede', x: 10, y: 10, w: 20, h: 0.8 }, { nome: 'X', tipo: 'invasor', x: 0, y: 0, w: 10, h: 10 }])
    if (typeof r === 'string') throw new Error(r)
    expect(r[0]).toMatchObject({ tipo: 'parede', h: 0.8 })
    expect(r[1].tipo).toBe('area')
  })
  it('forma personalizada sem 3 pontos volta a retângulo', async () => {
    const { validarForma } = await import('../mapa')
    expect(validarForma('personalizada', [{ x: 1, y: 1 }])).toEqual({ forma: 'retangulo', pontos: null })
    expect(validarForma('circulo', null)).toEqual({ forma: 'circulo', pontos: null })
    expect(validarForma('hack', null).forma).toBe('retangulo')
  })
})

describe('cor do bloco (06/11)', () => {
  it('guarda cor #RRGGBB e descarta o resto', () => {
    const r = validarBlocos([
      { nome: 'Oficina', x: 0, y: 0, w: 10, h: 10, cor: '#2563eb' },
      { nome: 'Peças', x: 20, y: 0, w: 10, h: 10, cor: 'red; background:url(x)' },
    ])
    if (typeof r === 'string') throw new Error(r)
    expect(r[0].cor).toBe('#2563EB')
    expect(r[1].cor).toBeUndefined()
  })
})
