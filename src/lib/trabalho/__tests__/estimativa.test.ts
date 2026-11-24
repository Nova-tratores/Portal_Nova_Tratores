import { describe, it, expect } from 'vitest'
import { TAMANHOS, tamanhoDe, planoDeHoras, sugerirHoras, parecido, type Feito } from '../estimativa'

describe('estimativa — tamanhos e plano', () => {
  it('tamanho mais perto das horas', () => {
    expect(tamanhoDe(1).id).toBe('rapido')
    expect(tamanhoDe(2.5).id).toBe('pequeno')
    expect(tamanhoDe(5).id).toBe('medio')
    expect(tamanhoDe(10).id).toBe('grande')
    expect(tamanhoDe(30).id).toBe('enorme')
  })
  it('horas viram dias × horas/dia sem passar de 4,5 h por dia', () => {
    expect(planoDeHoras(2, 4.5)).toEqual({ dias: 1, horasDia: 2 })
    expect(planoDeHoras(4.5, 4.5)).toEqual({ dias: 1, horasDia: 4.5 })
    expect(planoDeHoras(9, 4.5)).toEqual({ dias: 2, horasDia: 4.5 })
    expect(planoDeHoras(22, 4.5)).toEqual({ dias: 5, horasDia: 4.5 })
    for (const t of TAMANHOS) { const p = planoDeHoras(t.horas, 4.5); expect(p.horasDia).toBeLessThanOrEqual(4.5) }
  })
})

const feito = (titulo: string, extra: Partial<Feito> = {}): Feito => ({ titulo, estimado: null, real: null, ...extra })

describe('estimativa — sugestão automática', () => {
  it('sem histórico não sugere', () => {
    expect(sugerirHoras({ titulo: 'Relatório de comissões' }, [])).toBeNull()
    expect(sugerirHoras({ titulo: 'x' }, [feito('y')])).toBeNull()
  })
  it('usa os parecidos (palavras do título + quadro)', () => {
    const hist = [
      feito('Relatório de comissões de outubro', { real: 3, quadro_id: 'q1' }),
      feito('Relatório comissões setembro', { real: 4, quadro_id: 'q1' }),
      feito('Trocar impressora da recepção', { real: 0.5 }),
      feito('Configurar impressora nova', { real: 1 }),
    ]
    const s = sugerirHoras({ titulo: 'Relatório de comissões de novembro', quadro_id: 'q1' }, hist)!
    expect(s.horas).toBe(3.5)
    expect(s.tamanho.id).toBe('medio')
    expect(s.motivo).toContain('2 trabalhos parecidos')
  })
  it('sem parecidos: a mediana de tudo', () => {
    const s = sugerirHoras({ titulo: 'Algo totalmente diferente' }, [feito('aaaa bbbb', { estimado: 2 }), feito('cccc dddd', { estimado: 4 }), feito('eeee ffff', { estimado: 6 })])!
    expect(s.horas).toBe(4)
    expect(s.motivo).toContain('na média')
  })
  it('aprende o fator pessoal (real ÷ estimado)', () => {
    const hist = [1, 2, 3].map((i) => feito(`tarefa numero${i}`, { estimado: 2, real: 3 }))
    const s = sugerirHoras({ titulo: 'Outra coisa qualquer' }, [...hist, feito('nova coisa estimada', { estimado: 4 })])!
    expect(s.fator).toBe(1.5)
    expect(s.motivo).toContain('1,5×')
  })
  it('parecido dá peso ao quadro e à categoria', () => {
    expect(parecido({ titulo: 'zzzz', quadro_id: 'q', categoria: 'c' }, feito('yyyy', { quadro_id: 'q', categoria: 'c' }))).toBeCloseTo(0.4)
  })
})
