// Alertas de FATURAMENTO para o T.I. (José, 22/10/2026: "sempre que der um erro na hora de faturar algum tipo de
// nota, notificar os usuários do T.I."). T.I. = financeiro_usu ativo com função "T.I." (Henri, José Ortiz).
// Também usado pelo vigia dos pedidos marcados como faturados sem NF-e (lib/ppv/vigia-faturados.ts).
// Nunca derruba o faturamento: qualquer falha aqui é engolida.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'

const FUNCAO_TI = /^(t\.?\s*i\.?|ti|tecnologia)/i
/** mesma mensagem em menos de 10 min não repete (clique duplo, rotas que tentam de novo) */
const JANELA_MS = 10 * 60 * 1000
const recentes = new Map<string, number>()

async function usuariosPorFuncao(teste: (funcao: string) => boolean): Promise<string[]> {
  const { data } = await sb.from('financeiro_usu').select('id, funcao, ativo').eq('ativo', true)
  return ((data || []) as Array<{ id: string; funcao: string | null }>).filter((u) => teste(String(u.funcao || '').trim())).map((u) => u.id)
}

export const usuariosTI = () => usuariosPorFuncao((f) => FUNCAO_TI.test(f))
export const usuariosPosVendas = () => usuariosPorFuncao((f) => /p[oó]s[\s-]*vendas?/i.test(f))

export async function notificarUsuarios(ids: string[], n: { titulo: string; descricao: string; link: string }) {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return 0
  const { error } = await sb.from('portal_notificacoes').insert(unicos.map((user_id) => ({ user_id, tipo: 'pos', titulo: n.titulo.slice(0, 200), descricao: n.descricao.slice(0, 1000), link: n.link })))
  if (error) console.warn('[alerta-ti] notificar:', error.message)
  return error ? 0 : unicos.length
}

/** erro ao faturar → sino do T.I. Ex.: avisarTI('PPV-0505', 'pedido de peças', 'O Omie recusou…', '/ppv?id=PPV-0505') */
export async function avisarTI(doc: string, oque: string, erro: string, link: string): Promise<void> {
  try {
    const msg = String(erro || '').trim()
    if (!msg || /^Antes de faturar|^Escolha a forma|não tem permissão|já existe um faturamento/i.test(msg)) return // trava/uso normal, não é erro
    const chave = `${doc}|${msg.slice(0, 120)}`
    const agora = Date.now()
    if ((recentes.get(chave) || 0) > agora - JANELA_MS) return
    recentes.set(chave, agora)
    if (recentes.size > 500) for (const [k, t] of recentes) if (t < agora - JANELA_MS) recentes.delete(k)
    await notificarUsuarios(await usuariosTI(), { titulo: `Erro ao faturar ${oque} — ${doc}`, descricao: msg, link })
  } catch (e) {
    console.warn('[alerta-ti]', e instanceof Error ? e.message : e)
  }
}
