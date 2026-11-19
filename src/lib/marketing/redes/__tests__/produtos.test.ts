import { describe, expect, it } from 'vitest'
import { limparDados, metaDe, produtoNovo, slugDe } from '../produtos'

describe('máquinas editáveis', () => {
  it('slug como o do site', () => {
    expect(slugDe('Plantadeira Kuhn PG 7/9', 'implementos')).toBe('plantadeira-kuhn-pg-7-9')
    expect(slugDe('Mahindra 6075 Cabinado', 'tratores')).toBe('trator-mahindra-6075-cabinado')
    expect(slugDe('Trator Mahindra 2025', 'tratores')).toBe('trator-mahindra-2025')
  })
  it('limpa e confere campos', () => {
    const l = limparDados({ titulo: '  Roçadeira  X ', potencia_cv: '45', pontos: ['a', '', ' b '], specs: [['Peso', '300 kg'], ['', 'x']], fotos: [{ src: 'https://x.supabase.co/a.jpg', alt: 'A' }], lixo: 1 })
    expect(l).toEqual({ ok: true, dados: { titulo: 'Roçadeira X', potencia_cv: 45, pontos: ['a', 'b'], specs: { Peso: '300 kg' }, fotos: [{ src: 'https://x.supabase.co/a.jpg', alt: 'A' }] } })
    expect(limparDados({ titulo: '' }).ok).toBe(false)
    expect(limparDados({ potencia_cv: 2000 }).ok).toBe(false)
    expect(limparDados({ fotos: [{ src: 'javascript:alert(1)' }] }).ok).toBe(false)
    expect(limparDados({ fotos: [{ src: 'trator-mahindra-6075/principal.png', alt: '' }] }).ok).toBe(true)
  })
  it('máquina nova completa o que falta', () => {
    const p = produtoNovo('rocadeira-x', { categoria: 'implementos', titulo: 'Roçadeira X', fotos: [{ src: 'https://a/b.jpg', alt: '' }], descricao_site: 'Boa.' })
    expect(p).toMatchObject({ slug: 'rocadeira-x', modelo: 'Roçadeira X', publicar: true, meta_description: 'Boa.', fotos: [{ alt: 'Roçadeira X' }] })
    expect(metaDe('x'.repeat(200), 'n').length).toBeLessThanOrEqual(156)
  })
})
