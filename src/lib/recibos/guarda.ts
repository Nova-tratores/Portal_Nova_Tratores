// Quem pode emitir e ver recibos: Financeiro, POS ou PPV (o recibo também sai de dentro da OS/PPV), admin e dev.
import { autenticar, type Autenticado } from '@/lib/auth/server'

const MODULOS = ['financeiro', 'pos', 'ppv']

export function podeRecibos(a: Pick<Autenticado, 'isAdmin' | 'modulos'>): boolean {
  return a.isAdmin || a.modulos.some((m) => MODULOS.some((p) => m === p || m.startsWith(`${p}:`)))
}

/** Usuário logado com acesso a recibos, ou a resposta 401/403 pronta. */
export async function guardarRecibos(req: Request): Promise<{ auth: Autenticado; resposta?: undefined } | { resposta: Response; auth?: undefined }> {
  const auth = await autenticar(req)
  if (!auth) return { resposta: Response.json({ erro: 'Faça login de novo' }, { status: 401 }) }
  if (!podeRecibos(auth)) return { resposta: Response.json({ erro: 'Sem permissão para recibos' }, { status: 403 }) }
  return { auth }
}
