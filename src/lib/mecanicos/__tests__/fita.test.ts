import { describe, it, expect } from 'vitest'
import { barrasFita, nivelDa, semanasDoMes, somar, trilha, type PorDia } from '../fita'

const porDia: PorDia = { '2026-10-13': [1000, 4, 1], '2026-10-16': [500, 2, 1], '2026-09-30': [300, 1, 1], '2025-03-10': [200, 1, 1] }

describe('fita do tempo', () => {
  it('nível mostra os filhos do escolhido', () => {
    expect(nivelDa('ano', false)).toBe('meses')
    expect(nivelDa('semana', false)).toBe('dias')
    expect(nivelDa('dia', true)).toBe('anos')
  })

  it('soma e barras por nível', () => {
    expect(somar(porDia, '2026-10-01', '2026-10-31')).toEqual({ bruto: 1500, horas: 6, os: 2 })
    const anos = barrasFita('anos', '2026-10-16', porDia, '2026-10-16', 2025)
    expect(anos.map((a) => [a.curto, a.bruto])).toEqual([['2025', 200], ['2026', 1800]])
    const meses = barrasFita('meses', '2026-10-16', porDia, '2026-10-16', 2025)
    expect(meses).toHaveLength(12)
    expect(meses[9]).toMatchObject({ curto: 'out', bruto: 1500, escala: 'mes', futuro: false })
    expect(meses[10].futuro).toBe(true)
    const dias = barrasFita('dias', '2026-10-16', porDia, '2026-10-16', 2025)
    expect(dias).toHaveLength(31)
    expect(dias[12]).toMatchObject({ curto: '13', bruto: 1000, escala: 'dia' })
    expect(dias[16].futuro).toBe(true)
    expect(dias[3].fimDeSemana).toBe(true) // 04/10/2026 = domingo
  })

  it('semanas do mês e trilha', () => {
    const dias = barrasFita('dias', '2026-10-16', porDia, '2026-10-16', 2025)
    const s = semanasDoMes(dias)
    expect(s[0]).toMatchObject({ de: '2026-09-28', ini: 0, fim: 3 }) // 01–04/10
    expect(s[2]).toMatchObject({ de: '2026-10-12', rotulo: '12/10–18/10', ini: 11, fim: 17 })
    expect(trilha('dia', '2026-10-16').map((p) => p.rotulo)).toEqual(['Anos', '2026', 'outubro', 'semana 12/10–18/10', 'sex 16/10'])
    expect(trilha('ano', '2026-10-16').map((p) => p.rotulo)).toEqual(['Anos', '2026'])
  })
})

describe('leitura rápida', () => {
  it('semana, mês e o mesmo trecho do mês anterior', async () => {
    const { leituraRapida } = await import('../fita')
    const r = leituraRapida({ '2026-10-13': [1000, 4, 1], '2026-10-02': [500, 1, 1], '2026-09-10': [2000, 3, 1], '2026-09-25': [9000, 9, 1] }, '2026-10-16')
    expect(r.variacao).toBe(-25) // out 1–16 = 1.500 × set 1–16 = 2.000
    expect(r.texto).toContain('Esta semana: R$')
    expect(r.texto).toContain('Outubro até hoje')
    expect(r.texto).toContain('▼ 25%')
  })
})
