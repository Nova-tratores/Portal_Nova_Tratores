import { describe, it, expect } from 'vitest'
import { TAMANHOS, tamanhoDe, planoDeHoras, sugerirHoras, parecido, horasUteisEntre, type Feito } from '../estimativa'

describe('estimativa — tamanhos e plano', () => {
  it('tamanho mais perto das horas', () => {
    expect(tamanhoDe(0.25).id).toBe('15min')
    expect(tamanhoDe(1).id).toBe('1h')
    expect(tamanhoDe(2).id).toBe('meio')
    expect(tamanhoDe(5).id).toBe('dia')
    expect(tamanhoDe(14).id).toBe('3dias')
  })
  it('horas viram dias × horas/dia sem passar de 4,5 h por dia', () => {
    expect(planoDeHoras(2, 4.5)).toEqual({ dias: 1, horasDia: 2 })
    expect(planoDeHoras(4.5, 4.5)).toEqual({ dias: 1, horasDia: 4.5 })
    expect(planoDeHoras(9, 4.5)).toEqual({ dias: 2, horasDia: 4.5 })
    expect(planoDeHoras(13.5, 4.5)).toEqual({ dias: 3, horasDia: 4.5 })
    expect(planoDeHoras(0.25, 4.5)).toEqual({ dias: 1, horasDia: 0.25 })
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
    expect(s.tamanho.id).toBe('dia')
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

describe('estimativa — horas úteis entre dois momentos', () => {
  it('conta só seg–sex 07:30–17:30', () => {
    // ter 24/11 08:00 → ter 24/11 10:30 = 2,5 h
    expect(horasUteisEntre('2026-11-24T08:00:00-03:00', '2026-11-24T10:30:00-03:00')).toBe(2.5)
    // ter 17:00 → qua 08:00 = 0,5 h (ter) + 0,5 h (qua)
    expect(horasUteisEntre('2026-11-24T17:00:00-03:00', '2026-11-25T08:00:00-03:00')).toBe(1)
    // sex 16:30 → seg 08:30 = 1 h (sex) + 1 h (seg); sábado e domingo não contam
    expect(horasUteisEntre('2026-11-27T16:30:00-03:00', '2026-11-30T08:30:00-03:00')).toBe(2)
    expect(horasUteisEntre('2026-11-24T10:00:00-03:00', '2026-11-24T09:00:00-03:00')).toBe(0)
  })
})
