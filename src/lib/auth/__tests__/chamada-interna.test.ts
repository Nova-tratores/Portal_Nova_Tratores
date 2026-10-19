import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/ajustes/permissao-server', () => ({ protegerRota: vi.fn() }))

import { ehChamadaInterna } from '../chamada-interna'

const h = (o: Record<string, string>) => new Headers(o)

describe('ehChamadaInterna', () => {
  it('sem segredo configurado ninguém passa', () => {
    expect(ehChamadaInterna(h({ authorization: 'Bearer ' }), '')).toBe(false)
    expect(ehChamadaInterna(h({ 'x-cron-secret': '' }), '')).toBe(false)
  })
  it('aceita Bearer e x-cron-secret com o segredo certo', () => {
    expect(ehChamadaInterna(h({ authorization: 'Bearer s3gr3d0' }), 's3gr3d0')).toBe(true)
    expect(ehChamadaInterna(h({ 'x-cron-secret': 's3gr3d0' }), 's3gr3d0')).toBe(true)
  })
  it('recusa segredo errado e token de usuário', () => {
    expect(ehChamadaInterna(h({ authorization: 'Bearer outro' }), 's3gr3d0')).toBe(false)
    expect(ehChamadaInterna(h({ authorization: 'Bearer eyJhbGciOi...' }), 's3gr3d0')).toBe(false)
  })
  it('headers forjáveis sozinhos não valem', () => {
    expect(ehChamadaInterna(h({ 'x-sync-manual': '1', 'x-railway-cron': '1' }), 's3gr3d0')).toBe(false)
  })
})
