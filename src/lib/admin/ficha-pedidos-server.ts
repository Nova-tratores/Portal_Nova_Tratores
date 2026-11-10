// Mudanças na ficha cadastral passam pelo Diretor (José, 09/11/2026: "quando alguém
// atualizar… chega uma notificação para o Diretor, explicando o que está mudando e
// quem está fazendo… após ele autorizar, aí muda, no mesmo esquema de autorizar a
// comissão"). SÓ SERVIDOR.
//
// Quem edita gera UM pedido pendente por pessoa (editar de novo atualiza o mesmo).
// O Diretor recebe aviso no sino (+ push) e o modal no portal; ao autorizar, a ficha
// é gravada e o que o RH tem vai para o RH. O próprio Diretor não precisa pedir a si mesmo.
import { createClient } from '@supabase/supabase-js'
import { listarMudancas, resumoMudancas, type Dados, type Mudanca } from './ficha-cadastral'
import { enviarAoRH } from './ficha-rh-server'

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  { auth: { persistSession: false, autoRefreshToken: false } }
)

export const SEM_TABELA_PEDIDOS = 'Falta rodar sql/ficha-cadastral-pedidos.sql no Supabase do portal.'
const faltaTabela = (m?: string) => !!m && /usuario_ficha_pedidos/.test(m) && /(does not exist|schema cache|not find)/i.test(m)
const erro = (m: string, status = 500) => Object.assign(new Error(faltaTabela(m) ? SEM_TABELA_PEDIDOS : m), { status })

export interface Pessoa { id: string; nome: string }

export async function ehDiretor(userId: string): Promise<boolean> {
  const { data, error } = await sb.from('portal_permissoes').select('is_diretor').eq('user_id', userId).maybeSingle()
  if (error) return false
  return (data as any)?.is_diretor === true
}
async function diretores(): Promise<string[]> {
  const { data } = await sb.from('portal_permissoes').select('user_id').eq('is_diretor', true)
  return ((data || []) as any[]).map((x) => String(x.user_id))
}
async function avisar(ids: string[], titulo: string, descricao: string, link: string) {
  const unicos = [...new Set(ids.filter(Boolean))]
  if (!unicos.length) return
  await sb.from('portal_notificacoes').insert(unicos.map((user_id) => ({ user_id, tipo: 'sistema', titulo: titulo.slice(0, 200), descricao: descricao.slice(0, 500), link }))).then(() => {}, () => {})
}
export async function nomeDe(userId: string): Promise<{ nome: string; email: string | null }> {
  const { data } = await sb.from('financeiro_usu').select('nome, email').eq('id', userId).maybeSingle()
  return { nome: (data as any)?.nome || 'Alguém', email: (data as any)?.email || null }
}
const primeiro = (n?: string | null) => String(n || '').trim().split(' ')[0] || 'Alguém'

export async function fichaAprovada(userId: string): Promise<{ dados: Dados; atualizado_em: string | null; atualizado_por_nome: string | null }> {
  const { data, error } = await sb.from('usuario_ficha_cadastral').select('dados, atualizado_em, atualizado_por_nome').eq('user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  return { dados: (data as any)?.dados || {}, atualizado_em: (data as any)?.atualizado_em || null, atualizado_por_nome: (data as any)?.atualizado_por_nome || null }
}

export async function pedidoPendente(userId: string) {
  const { data, error } = await sb.from('usuario_ficha_pedidos').select('*').eq('user_id', userId).eq('status', 'pendente').maybeSingle()
  if (error) { if (faltaTabela(error.message)) return null; throw erro(error.message) }
  return data as any | null
}

/** grava a ficha de vez e manda ao RH */
async function aplicar(userId: string, dados: Dados, autor: Pessoa) {
  const agora = new Date().toISOString()
  const { error } = await sb.from('usuario_ficha_cadastral').upsert({ user_id: userId, dados, atualizado_em: agora, atualizado_por: autor.id, atualizado_por_nome: autor.nome }, { onConflict: 'user_id' })
  if (error) throw erro(error.message)
  const { email } = await nomeDe(userId)
  const rh = await enviarAoRH(userId, email, dados).catch((e) => ({ ok: false, campos: [] as string[], motivo: String(e?.message || e) }))
  return { agora, rh }
}

/**
 * Pede a mudança. `dados` = a ficha inteira como deve ficar.
 * Diretor: aplica na hora. Outros: cria/atualiza o pedido pendente e avisa o Diretor.
 */
export async function pedirMudanca(userId: string, dados: Dados, autor: Pessoa) {
  const { dados: atual } = await fichaAprovada(userId)
  const mudancas = listarMudancas(atual, dados)
  const pend = await pedidoPendente(userId)
  const dono = await nomeDe(userId)

  if (!mudancas.length) {
    if (pend) await sb.from('usuario_ficha_pedidos').update({ status: 'recusado', motivo: 'Cancelado: ficou igual à ficha atual', decidido_em: new Date().toISOString(), decidido_por: autor.id, decidido_por_nome: autor.nome }).eq('id', pend.id)
    return { situacao: 'sem_mudanca' as const }
  }

  if (await ehDiretor(autor.id)) {
    const { agora, rh } = await aplicar(userId, dados, autor)
    if (pend) await sb.from('usuario_ficha_pedidos').update({ status: 'aprovado', dados, mudancas, decidido_por: autor.id, decidido_por_nome: autor.nome, decidido_em: agora, rh, atualizado_em: agora }).eq('id', pend.id)
    return { situacao: 'aplicado' as const, mudancas: mudancas.length, rh, atualizado_em: agora }
  }

  const agora = new Date().toISOString()
  const linha = { user_id: userId, user_nome: dono.nome, dados, mudancas, pedido_por: autor.id, pedido_por_nome: autor.nome, atualizado_em: agora }
  let id: number
  if (pend) {
    const { error } = await sb.from('usuario_ficha_pedidos').update(linha).eq('id', pend.id)
    if (error) throw erro(error.message)
    id = pend.id
  } else {
    const { data, error } = await sb.from('usuario_ficha_pedidos').insert({ ...linha, criado_em: agora }).select('id').single()
    if (error) throw erro(error.message)
    id = (data as any).id
  }
  const proprio = autor.id === userId
  await avisar(
    (await diretores()).filter((d) => d !== autor.id),
    `Ficha de ${primeiro(dono.nome)} para autorizar`,
    `${proprio ? `${primeiro(autor.nome)} atualizou a própria ficha` : `${primeiro(autor.nome)} mudou a ficha de ${primeiro(dono.nome)}`} — ${resumoMudancas(mudancas)}. Só muda depois que você autorizar.`,
    '/dashboard?fichas=1',
  )
  return { situacao: 'pendente' as const, id, mudancas: mudancas.length }
}

/** o que o Diretor (ou quem pediu) vê de cada mudança: sensível sem valor, a não ser para Dev */
export function mascarar(ms: Mudanca[], verSensiveis: boolean): Mudanca[] {
  return ms.map((m) => (m.sens && !verSensiveis ? { ...m, de: m.de ? 'dado protegido' : '', para: m.para ? 'dado protegido' : '' } : m))
}

export async function pendentesParaDiretor(verSensiveis: boolean) {
  const { data, error } = await sb.from('usuario_ficha_pedidos').select('id, user_id, user_nome, pedido_por, pedido_por_nome, mudancas, criado_em, atualizado_em').eq('status', 'pendente').order('criado_em')
  if (error) { if (faltaTabela(error.message)) return []; throw erro(error.message) }
  return ((data || []) as any[]).map((p) => ({ ...p, mudancas: mascarar(p.mudancas || [], verSensiveis) }))
}

export async function decidir(id: number, acao: 'autorizar' | 'recusar' | 'cancelar', motivo: string, autor: Pessoa, autorEhAdmin: boolean) {
  const { data: p, error } = await sb.from('usuario_ficha_pedidos').select('*').eq('id', id).maybeSingle()
  if (error) throw erro(error.message)
  if (!p) throw erro('Pedido não encontrado', 404)
  if ((p as any).status !== 'pendente') throw erro('Este pedido já foi decidido', 409)
  const ped = p as any
  const agora = new Date().toISOString()

  if (acao === 'cancelar') {
    if (ped.pedido_por !== autor.id && ped.user_id !== autor.id && !autorEhAdmin) throw erro('Só quem pediu pode cancelar', 403)
    await sb.from('usuario_ficha_pedidos').update({ status: 'recusado', motivo: `Cancelado por ${autor.nome}`, decidido_por: autor.id, decidido_por_nome: autor.nome, decidido_em: agora }).eq('id', id)
    return { ok: true }
  }
  if (!(await ehDiretor(autor.id))) throw erro('Só o Diretor autoriza mudança na ficha cadastral', 403)

  if (acao === 'recusar') {
    await sb.from('usuario_ficha_pedidos').update({ status: 'recusado', motivo: motivo || null, decidido_por: autor.id, decidido_por_nome: autor.nome, decidido_em: agora }).eq('id', id)
    await avisar([ped.pedido_por, ped.user_id], `Mudança na ficha de ${primeiro(ped.user_nome)} não autorizada`,
      `${primeiro(autor.nome)} não autorizou${motivo ? `: "${motivo}"` : '.'} A ficha continua como estava.`, ped.user_id === ped.pedido_por ? '/dashboard' : '/admin')
    return { ok: true }
  }

  const { rh } = await aplicar(ped.user_id, ped.dados, autor)
  await sb.from('usuario_ficha_pedidos').update({ status: 'aprovado', motivo: motivo || null, decidido_por: autor.id, decidido_por_nome: autor.nome, decidido_em: agora, rh }).eq('id', id)
  await avisar([ped.pedido_por, ped.user_id], `Ficha de ${primeiro(ped.user_nome)} atualizada`,
    `${primeiro(autor.nome)} autorizou ${resumoMudancas(ped.mudancas || [])}.${rh.ok && rh.campos.length ? ' Também foi para o RH.' : ''}`, ped.user_id === ped.pedido_por ? '/dashboard' : '/admin')
  return { ok: true, rh }
}
