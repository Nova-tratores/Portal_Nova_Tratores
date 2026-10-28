// Guarda das rotas da autorização de comissão — SÓ SERVIDOR. Entra quem tem Janela Mecânicos/POS OU é DIRETOR:
// o diretor autoriza pelo aviso que aparece em qualquer tela, sem precisar do módulo (José, 28/10/2026).
import { protegerRota, autorDe } from '@/lib/ajustes/permissao-server'
import { autenticar } from '@/lib/auth/server'
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { ehDiretor } from './lancamento-comissao-server'

export async function guardarComissao(req: Request): Promise<{ user: { id: string; nome: string }; resposta?: undefined } | { resposta: Response; user?: undefined }> {
  const g = await protegerRota(req, [{ modulo: 'mecanicos' }, { modulo: 'pos' }])
  if (!g.resposta) return { user: { id: g.user.id, nome: autorDe(g.user) } }
  const a = await autenticar(req)
  if (!a || !(await ehDiretor(a.userId).catch(() => false))) return { resposta: g.resposta }
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', a.userId).maybeSingle()
  return { user: { id: a.userId, nome: (data as { nome?: string } | null)?.nome || a.email || a.userId } }
}
