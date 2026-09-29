import { describe, expect, it } from 'vitest'
import { createHmac } from 'crypto'
import { gerarTokenDashboard, urlDashboardComToken, validarTokenDashboard, VALIDADE_TOKEN_SEGUNDOS, URL_DASHBOARD_AGRO } from '../dashboard-token'

const SEGREDO = 'segredo-de-teste-com-32-caracteres!!'
const AGORA = Date.UTC(2026, 8, 29, 12, 0, 0)
const USUARIO = '3f2b1c9e-0a4d-4c55-9b1e-7d2a6f8e1c00'

describe('token do Dashboard Agro', () => {
  it('gera e valida dentro do prazo', () => {
    const t = gerarTokenDashboard(SEGREDO, USUARIO, AGORA)
    const r = validarTokenDashboard(SEGREDO, t, AGORA + 60_000)
    expect(r).toEqual({ ok: true, usuarioId: USUARIO, expira: Math.floor(AGORA / 1000) + VALIDADE_TOKEN_SEGUNDOS })
  })

  it('recusa depois do prazo', () => {
    const t = gerarTokenDashboard(SEGREDO, USUARIO, AGORA)
    expect(validarTokenDashboard(SEGREDO, t, AGORA + (VALIDADE_TOKEN_SEGUNDOS + 1) * 1000)).toEqual({ ok: false, motivo: 'expirado' })
  })

  it('recusa assinatura de outro segredo', () => {
    const t = gerarTokenDashboard('outro-segredo', USUARIO, AGORA)
    expect(validarTokenDashboard(SEGREDO, t, AGORA)).toEqual({ ok: false, motivo: 'assinatura' })
  })

  it('recusa prazo adulterado', () => {
    const [exp, uid, sig] = gerarTokenDashboard(SEGREDO, USUARIO, AGORA).split('.')
    const adulterado = `${Number(exp) + 86400}.${uid}.${sig}`
    expect(validarTokenDashboard(SEGREDO, adulterado, AGORA)).toEqual({ ok: false, motivo: 'assinatura' })
  })

  it('recusa formato inválido e segredo vazio', () => {
    expect(validarTokenDashboard(SEGREDO, '', AGORA).ok).toBe(false)
    expect(validarTokenDashboard(SEGREDO, 'a.b', AGORA).ok).toBe(false)
    expect(validarTokenDashboard(SEGREDO, 'abc.def.ghi', AGORA).ok).toBe(false)
    expect(validarTokenDashboard('', gerarTokenDashboard(SEGREDO, USUARIO, AGORA), AGORA).ok).toBe(false)
    expect(() => gerarTokenDashboard('', USUARIO, AGORA)).toThrow()
  })

  it('usa a mesma conta que o servidor do app externo (HMAC-SHA256 em base64url de "expira.usuario")', () => {
    const [exp, uid, sig] = gerarTokenDashboard(SEGREDO, USUARIO, AGORA).split('.')
    expect(sig).toBe(createHmac('sha256', SEGREDO).update(`${exp}.${uid}`).digest('base64url'))
  })

  it('limpa caracteres que quebrariam o formato', () => {
    const t = gerarTokenDashboard(SEGREDO, 'a.b c/d', AGORA)
    expect(t.split('.')).toHaveLength(3)
    expect(validarTokenDashboard(SEGREDO, t, AGORA)).toMatchObject({ ok: true, usuarioId: 'abcd' })
  })

  it('sem segredo devolve o endereço puro, marcado como não protegido', () => {
    expect(urlDashboardComToken(undefined, USUARIO, AGORA)).toEqual({ url: URL_DASHBOARD_AGRO, protegido: false })
    const r = urlDashboardComToken(SEGREDO, USUARIO, AGORA)
    expect(r.protegido).toBe(true)
    expect(r.url.startsWith(`${URL_DASHBOARD_AGRO}?t=`)).toBe(true)
  })
})
