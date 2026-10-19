// Guarda das rotas que o NovaZap (fork do Chatwoot) usa (tema 1 da auditoria, lote 3).
//
// O NovaZap NÃO chama mais estas rotas do navegador: o servidor dele repassa a
// chamada (rota /api/v1/accounts/:id/portal/... do fork), com o segredo
// NOVAZAP_PROXY_TOKEN no header x-novazap-token e o e-mail do atendente logado
// lá em x-novazap-usuario. O segredo nunca vai para o navegador.
//
// As telas do próprio portal que usam as mesmas rotas mandam o login de sempre
// (authHeaders) e passam pelo protegerRota com as opções da tela.
import { timingSafeEqual } from 'node:crypto'
import { protegerRota, type OpcaoAcesso, type UsuarioRota } from '@/lib/ajustes/permissao-server'
import { autenticar } from '@/lib/auth/server'

/** Puro (testável): o header traz o segredo certo? Sem segredo no ambiente, ninguém passa. */
export function segredoNovazapConfere(recebido: string | null | undefined, segredo: string = process.env.NOVAZAP_PROXY_TOKEN || ''): boolean {
  if (!segredo || !recebido) return false
  const a = Buffer.from(recebido)
  const b = Buffer.from(segredo)
  return a.length === b.length && timingSafeEqual(a, b)
}

export type AcessoNovazap =
  | { user: UsuarioRota; viaNovazap: boolean; resposta?: undefined }
  | { resposta: Response; user?: undefined; viaNovazap?: undefined }

/**
 * `portal` = quem do portal pode usar a rota: as opções do protegerRota, ou
 * 'login' quando a tela que chama é aberta a qualquer logado.
 */
export async function guardarNovazap(req: Request, portal: OpcaoAcesso[] | 'login'): Promise<AcessoNovazap> {
  if (segredoNovazapConfere(req.headers.get('x-novazap-token'))) {
    const email = (req.headers.get('x-novazap-usuario') || '').trim().slice(0, 200)
    return { user: { id: 'novazap', nome: `NovaZap${email ? ` · ${email}` : ''}`, email: email || undefined, isAdmin: false, modulos: [] }, viaNovazap: true }
  }
  if (portal === 'login') {
    const auth = await autenticar(req)
    if (!auth) {
      return { resposta: new Response(JSON.stringify({ ok: false, erro: 'nao autenticado', error: 'nao autenticado' }), { status: 401, headers: { 'Content-Type': 'application/json' } }) }
    }
    return { user: { id: auth.userId, email: auth.email ?? undefined, isAdmin: auth.isAdmin, modulos: auth.modulos }, viaNovazap: false }
  }
  const g = await protegerRota(req, portal)
  if (g.resposta) return { resposta: g.resposta }
  return { user: g.user, viaNovazap: false }
}

/** Copia a resposta de erro da guarda acrescentando os headers de CORS da rota. */
export function comCors(resposta: Response, cors: Record<string, string>): Response {
  const h = new Headers(resposta.headers)
  for (const [k, v] of Object.entries(cors)) h.set(k, v)
  return new Response(resposta.body, { status: resposta.status, headers: h })
}
