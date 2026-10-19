import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ajustes/permissao-server', () => ({ protegerRota: vi.fn() }))
vi.mock('@/lib/auth/server', () => ({ autenticar: vi.fn() }))

import { segredoNovazapConfere } from '../proxy'

describe('segredoNovazapConfere', () => {
  it('sem segredo no ambiente ninguém passa', () => {
    expect(segredoNovazapConfere('qualquer', '')).toBe(false)
    expect(segredoNovazapConfere('', '')).toBe(false)
  })
  it('confere o segredo exato', () => {
    expect(segredoNovazapConfere('s3gr3d0-longo', 's3gr3d0-longo')).toBe(true)
  })
  it('recusa vazio, errado e prefixo', () => {
    expect(segredoNovazapConfere(null, 's3gr3d0-longo')).toBe(false)
    expect(segredoNovazapConfere('s3gr3d0', 's3gr3d0-longo')).toBe(false)
    expect(segredoNovazapConfere('s3gr3d0-longX', 's3gr3d0-longo')).toBe(false)
  })
})
