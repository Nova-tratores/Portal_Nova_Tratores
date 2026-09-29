// Token assinado que libera o Dashboard Agro externo (Railway) só para quem
// abriu a guia dentro do portal. SERVIDOR APENAS: usa o segredo do ambiente.
//
// Formato: <expira_em_segundos>.<id_do_usuario>.<assinatura>
// A assinatura é HMAC-SHA256 de "<expira>.<usuario>" com o segredo
// DASHBOARD_AGRO_TOKEN_SECRET, que existe com o MESMO valor no Railway do portal
// e no Railway do app externo. O servidor do app externo (server.js do repo
// dashboard-agro-sp) refaz a conta — qualquer mudança aqui precisa ir pra lá.
import { createHmac, timingSafeEqual } from 'crypto'

export const VALIDADE_TOKEN_SEGUNDOS = 5 * 60
export const URL_DASHBOARD_AGRO = 'https://dashboard-agro-sp-production.up.railway.app/'

function assinar(segredo: string, texto: string): string {
  return createHmac('sha256', segredo).update(texto).digest('base64url')
}

/** Só letras, dígitos e hífen: o id entra no token separado por ponto. */
function idLimpo(usuarioId: string): string {
  return String(usuarioId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 64) || 'anon'
}

export function gerarTokenDashboard(segredo: string, usuarioId: string, agoraMs: number = Date.now()): string {
  if (!segredo) throw new Error('segredo do token não configurado')
  const expira = Math.floor(agoraMs / 1000) + VALIDADE_TOKEN_SEGUNDOS
  const corpo = `${expira}.${idLimpo(usuarioId)}`
  return `${corpo}.${assinar(segredo, corpo)}`
}

export type ResultadoToken = { ok: true; usuarioId: string; expira: number } | { ok: false; motivo: 'formato' | 'assinatura' | 'expirado' }

export function validarTokenDashboard(segredo: string, token: string, agoraMs: number = Date.now()): ResultadoToken {
  const partes = String(token || '').split('.')
  if (!segredo || partes.length !== 3) return { ok: false, motivo: 'formato' }
  const [expTxt, usuarioId, assinatura] = partes
  if (!/^\d{9,12}$/.test(expTxt) || !usuarioId || !assinatura) return { ok: false, motivo: 'formato' }
  const esperada = Buffer.from(assinar(segredo, `${expTxt}.${usuarioId}`))
  const recebida = Buffer.from(assinatura)
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return { ok: false, motivo: 'assinatura' }
  const expira = Number(expTxt)
  if (expira * 1000 < agoraMs) return { ok: false, motivo: 'expirado' }
  return { ok: true, usuarioId, expira }
}

/** Endereço que a guia carrega. Sem segredo configurado, devolve o endereço puro. */
export function urlDashboardComToken(segredo: string | undefined, usuarioId: string, agoraMs: number = Date.now()): { url: string; protegido: boolean } {
  if (!segredo) return { url: URL_DASHBOARD_AGRO, protegido: false }
  return { url: `${URL_DASHBOARD_AGRO}?t=${encodeURIComponent(gerarTokenDashboard(segredo, usuarioId, agoraMs))}`, protegido: true }
}
