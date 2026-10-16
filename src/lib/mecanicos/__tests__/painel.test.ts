import { describe, expect, it } from 'vitest'
import { agregar, diasUteis, pesosPorOS, segundaDa, ultimasSemanas, ultimosMeses, SEM_TECNICO, type DiaRegistrado, type OSFaturada } from '../painel'

const os = (p: Partial<OSFaturada>): OSFaturada => ({
  os: 'OS-1', numeroOmie: '1', cliente: 'C', data: '2026-10-13', em: null, tecnicos: ['Ana'], horasCobradas: 4, km: 100,
  servico: 800, kmValor: 360, pecas: 500, outros: 0, bruto: 1660, custo: 200, ...p,
})

describe('painel do pós-vendas', () => {
  it('semana = segunda a sexta (40 h)', () => {
    expect(segundaDa('2026-10-16')).toBe('2026-10-12')
    expect(segundaDa('2026-10-18')).toBe('2026-10-12') // domingo
    expect(diasUteis('2026-10-12', '2026-10-18')).toBe(5)
    expect(ultimasSemanas('2026-10-16', 2)).toEqual([
      { rotulo: '05/10', de: '2026-10-05', ate: '2026-10-11' },
      { rotulo: '12/10', de: '2026-10-12', ate: '2026-10-18' },
    ])
    expect(ultimosMeses('2026-01-10', 2).map((b) => b.rotulo)).toEqual(['dez/25', 'jan/26'])
  })

  it('horas: internas, cliente, extras (sábado) e ociosas contra 40 h', () => {
    const dias: DiaRegistrado[] = [
      { os: 'OS-1', data: '2026-10-13', tecnico: 'Ana', horas: 6, interna: false },
      { os: 'OS-2', data: '2026-10-14', tecnico: 'Ana', horas: 10, interna: true },
      { os: 'OS-3', data: '2026-10-17', tecnico: 'Ana', horas: 4, interna: false }, // sábado
    ]
    const { linhas } = agregar('2026-10-12', '2026-10-16', ['Ana', 'Bia'], dias, [os({})])
    const ana = linhas.find((l) => l.tecnico === 'Ana')!
    expect(ana).toMatchObject({ trabalhadas: 16, cliente: 6, internas: 10, extras: 0, faturadas: 4, meta: 40, ociosas: 26 })
    expect(ana).toMatchObject({ bruto: 1660, custo: 200, liquido: 1460, servico: 800, kmValor: 360, pecas: 500, km: 100, os: 1 })
    const bia = linhas.find((l) => l.tecnico === 'Bia')!
    expect(bia).toMatchObject({ trabalhadas: 0, ociosas: 40, bruto: 0 }) // aparece zerada
  })

  it('OS com 2 técnicos: valor e km meio a meio; horas cobradas pelo registrado', () => {
    const dias: DiaRegistrado[] = [
      { os: 'OS-1', data: '2026-10-13', tecnico: 'Ana', horas: 3, interna: false },
      { os: 'OS-1', data: '2026-10-13', tecnico: 'Bia', horas: 1, interna: false },
    ]
    const { linhas, total } = agregar('2026-10-12', '2026-10-16', [], dias, [os({ tecnicos: ['Ana', 'Bia'] })], pesosPorOS(dias))
    const ana = linhas.find((l) => l.tecnico === 'Ana')!, bia = linhas.find((l) => l.tecnico === 'Bia')!
    expect(ana.faturadas).toBe(3); expect(bia.faturadas).toBe(1)
    expect(ana.bruto).toBe(830); expect(bia.km).toBe(50)
    expect(total.bruto).toBe(1660); expect(total.meta).toBe(80)
  })

  it('OS sem técnico vai para "Sem técnico" e fica fora da meta', () => {
    const { linhas, total } = agregar('2026-10-12', '2026-10-16', ['Ana'], [], [os({ tecnicos: [] })])
    expect(linhas.find((l) => l.tecnico === SEM_TECNICO)).toMatchObject({ bruto: 1660, ociosas: 0, meta: 40 })
    expect(total.meta).toBe(40) // só a Ana tem meta
  })
})
