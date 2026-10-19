// Chamada de SISTEMA (servidor → servidor, cron, agendador interno) nas rotas
// que também são chamadas por gente logada (tema 1 da auditoria, 19/10/2026).
//
// O critério é o mesmo dos crons que já existem (Bearer CRON_SECRET ou o header
// x-cron-secret), e NADA mais: x-sync-manual / x-railway-cron qualquer um forja.
// Sem CRON_SECRET no ambiente, ninguém passa como sistema — o cron falha à vista
// em vez de a rota ficar aberta.
import { protegerRota, type OpcaoAcesso, type UsuarioRota } from '@/lib/ajustes/permissao-server'

/** Puro (testável): o par de headers carrega o segredo certo? */
export function ehChamadaInterna(headers: Headers, segredo: string = process.env.CRON_SECRET || ''): boolean {
  if (!segredo) return false
  const auth = (headers.get('authorization') || '').trim()
  if (auth === `Bearer ${segredo}`) return true
  return (headers.get('x-cron-secret') || '').trim() === segredo
}

export const USUARIO_SISTEMA: UsuarioRota = {
  id: 'sistema', nome: 'Sistema', isAdmin: false, modulos: [],
}

/** protegerRota que também aceita a chamada do sistema (user = "Sistema", interno = true). */
export async function protegerRotaOuInterna(
  req: Request,
  opcoes: OpcaoAcesso[],
): Promise<{ user: UsuarioRota; interno: boolean; resposta?: undefined } | { resposta: Response; user?: undefined; interno?: undefined }> {
  if (ehChamadaInterna(req.headers)) return { user: USUARIO_SISTEMA, interno: true }
  const g = await protegerRota(req, opcoes)
  if (g.resposta) return { resposta: g.resposta }
  return { user: g.user, interno: false }
}

/** fetch do servidor para outra rota do próprio portal, levando o segredo de sistema. */
export function fetchInterno(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const segredo = process.env.CRON_SECRET || ''
  if (segredo) headers.set('x-cron-secret', segredo)
  return fetch(url, { ...init, headers })
}
