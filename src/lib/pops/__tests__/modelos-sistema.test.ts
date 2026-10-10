// Os modelos do sistema (modelos-sistema.json) passam pela MESMA validação das
// rotas (normalizarPassos) — conteúdo torto não chega ao banco pelo seed.
import { describe, expect, it } from 'vitest'
import dados from '../modelos-sistema.json'
import { normalizarPassos } from '../regras'

const AREAS_SEED = ['OFI', 'PEC', 'VEN', 'FIS', 'FIN', 'RH', 'ADM', 'FRO']

describe('modelos do sistema', () => {
  it('são de 8 a 10, com títulos únicos e áreas do seed', () => {
    expect(dados.modelos.length).toBeGreaterThanOrEqual(8)
    expect(dados.modelos.length).toBeLessThanOrEqual(10)
    expect(new Set(dados.modelos.map((m) => m.titulo)).size).toBe(dados.modelos.length)
    for (const m of dados.modelos) expect(AREAS_SEED).toContain(m.area)
  })

  for (const m of dados.modelos) {
    describe(m.titulo, () => {
      it('passos válidos pela regra das rotas e sem nada descartado na normalização', () => {
        const r = normalizarPassos(m.passos)
        expect('erro' in r ? r.erro : '').toBe('')
        if ('passos' in r) {
          expect(r.passos.map((p) => p.titulo)).toEqual(m.passos.map((p) => p.titulo))
          // seleção: nenhuma opção perdida (duplicada ou vazia)
          r.passos.forEach((p, i) => {
            const orig = (m.passos[i] as { config?: { opcoes?: string[] } }).config?.opcoes
            if (orig) expect(p.config?.opcoes).toEqual(orig)
          })
        }
      })
      it('cabe numa folha OPL (até 12 passos) e tem ao menos um passo com resposta', () => {
        expect(m.passos.length).toBeLessThanOrEqual(12)
        expect(m.passos.some((p) => p.tipo !== 'instrucao')).toBe(true)
      })
      it('cabeçalho completo', () => {
        expect(m.objetivo.trim()).not.toBe('')
        expect(m.escopo.trim()).not.toBe('')
      })
    })
  }

  it('dado técnico/fiscal aparece como [VALIDAR: …], nunca como valor inventado', () => {
    const texto = JSON.stringify(dados)
    // Nenhuma faixa numérica "técnica" preenchida: só 0 (contagem/diferença) é permitido.
    for (const m of dados.modelos) for (const p of m.passos) {
      const c = (p as { config?: { min?: number; max?: number } }).config
      if (c?.min !== undefined) expect(c.min).toBe(0)
      if (c?.max !== undefined) expect(c.max).toBe(0)
    }
    expect((texto.match(/\[VALIDAR:/g) || []).length).toBeGreaterThanOrEqual(15)
  })
})
