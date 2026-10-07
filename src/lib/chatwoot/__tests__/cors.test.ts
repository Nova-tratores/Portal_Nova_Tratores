import { describe, it, expect } from 'vitest'
import { corsChatwoot, origemPermitida } from '../cors'

describe('CORS do NovaZap', () => {
  it('devolve a origem de quem chamou quando é um endereço do Chatwoot', () => {
    expect(origemPermitida('https://novazap.novatratores.com')).toBe('https://novazap.novatratores.com')
    expect(origemPermitida('https://chatwoot-production-e3ef.up.railway.app')).toBe('https://chatwoot-production-e3ef.up.railway.app')
  })
  it('origem estranha não é liberada', () => {
    expect(origemPermitida('https://site-qualquer.com')).not.toBe('https://site-qualquer.com')
    expect(origemPermitida(null)).not.toBe('')
  })
  it('monta os headers com Vary: Origin', () => {
    const req = new Request('https://portal/api/clientes/buscar', { headers: { origin: 'https://novazap.novatratores.com' } })
    expect(corsChatwoot(req)).toEqual({
      'Access-Control-Allow-Origin': 'https://novazap.novatratores.com',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      Vary: 'Origin',
    })
  })
})
