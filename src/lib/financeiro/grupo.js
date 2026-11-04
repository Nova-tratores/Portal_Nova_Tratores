// Agrupamento de cards de cobrança (Chamado_NF): um card PRINCIPAL acumula as
// NFs e o VALOR de outros cards do MESMO cliente, pra gerar/anexar UM boleto só.
//
// Modelo (migration sql/chamado-nf-agrupar.sql):
//  - filho ganha grupo_pai_id + guarda o valor em grupo_valor_original e fica
//    com valor_servico = 0 — o pai passa a carregar o total do grupo, então
//    dashboard, e-mail de cobrança e rateio de parcelas somam certo sem mudar.
//  - filhos NÃO aparecem nos kanbans/painéis (filtrar com ehFilhoDeGrupo);
//    o status deles espelha o do pai (sincronizarFilhosComPai no carregarDados).
import { supabase } from '@/lib/supabase'
import { parseValorNum } from '@/lib/financeiro/parcelas'
import { motivoGrupoTravado, ehRpcAusente, normCliente } from '@/lib/financeiro/grupo-regras'

export { FASES_GRUPO_EDITAVEL, podeMexerNoGrupo, motivoGrupoTravado } from '@/lib/financeiro/grupo-regras'

export const ehFilhoDeGrupo = (card) => !!card?.grupo_pai_id

// Anota cada card principal com grupo_filhos (lista dos cards juntados nele).
// Usar sobre a lista completa, ANTES de esconder os filhos.
export function anotarGrupos(lista) {
  const porPai = new Map()
  for (const c of lista || []) {
    if (!c?.grupo_pai_id) continue
    if (!porPai.has(c.grupo_pai_id)) porPai.set(c.grupo_pai_id, [])
    porPai.get(c.grupo_pai_id).push(c)
  }
  if (porPai.size === 0) return lista || []
  return (lista || []).map(c => (porPai.has(c.id) ? { ...c, grupo_filhos: porPai.get(c.id) } : c))
}

// "S 123 / P 456 · S 789" — NFs de vários cards numa linha (card, e-mail, WhatsApp)
export function nfsLabel(cards) {
  return (cards || [])
    .map(c => [c?.num_nf_servico && `S ${c.num_nf_servico}`, c?.num_nf_peca && `P ${c.num_nf_peca}`].filter(Boolean).join(' / '))
    .filter(Boolean)
    .join(' · ')
}

// Filhos direto do banco (pro envio de boleto, que recebe só o card pai)
export async function buscarFilhos(paiId) {
  if (!paiId) return []
  const { data } = await supabase.from('Chamado_NF').select('*').eq('grupo_pai_id', paiId)
  return data || []
}

// Junta os filhos no pai: valor migra pro pai (original guardado no filho) e o
// status do filho espelha o do pai. Se um filho já era pai de outros, os netos
// passam a apontar pro novo pai (grupo nunca encadeia).
//
// TRAVA (cobrança em dobro): só junta enquanto TODOS os cards estão em Gerar
// Boleto / Validar Pix. Caminho principal = RPC chamado_nf_juntar (uma transação
// só, sql/financeiro-grupo-rpc.sql); sem a migration cai no caminho antigo
// (vários updates), agora relendo do banco e checando o erro de cada um.
export async function juntarCards(pai, filhos) {
  const lista = (filhos || []).filter(f => f && f.id != null && f.id !== pai?.id)
  if (!pai?.id || lista.length === 0) throw new Error('Escolha o card principal e pelo menos mais um card.')
  const travaPai = motivoGrupoTravado(pai.status, 'juntar', pai.id)
  if (travaPai) throw new Error(travaPai)
  for (const f of lista) {
    const t = motivoGrupoTravado(f.status, 'juntar', f.id)
    if (t) throw new Error(t)
  }

  const { data: rpc, error: rpcErr } = await supabase.rpc('chamado_nf_juntar', {
    p_pai_id: pai.id, p_filhos_ids: lista.map(f => f.id),
  })
  if (!rpcErr) return Number(rpc?.total ?? 0)
  if (!ehRpcAusente(rpcErr)) throw new Error(rpcErr.message || String(rpcErr))

  // ── fallback (migration ainda não aplicada) ──
  const ids = [pai.id, ...lista.map(f => f.id)]
  const { data: atuais, error: errLer } = await supabase.from('Chamado_NF')
    .select('id, status, tarefa, valor_servico, grupo_pai_id, nom_cliente').in('id', ids)
  if (errLer) throw errLer
  const porId = new Map((atuais || []).map(c => [c.id, c]))
  const paiAtual = porId.get(pai.id)
  if (!paiAtual) throw new Error(`O card principal #${pai.id} não existe mais.`)
  if (paiAtual.grupo_pai_id) throw new Error(`O card #${pai.id} já está dentro de outro grupo (#${paiAtual.grupo_pai_id}).`)
  const tPai = motivoGrupoTravado(paiAtual.status, 'juntar', pai.id)
  if (tPai) throw new Error(tPai)
  const filhosAtuais = []
  for (const f of lista) {
    const fa = porId.get(f.id)
    if (!fa) throw new Error(`O card #${f.id} não existe mais.`)
    const t = motivoGrupoTravado(fa.status, 'juntar', f.id)
    if (t) throw new Error(t)
    if (fa.grupo_pai_id && fa.grupo_pai_id !== pai.id) throw new Error(`O card #${f.id} já está dentro do grupo #${fa.grupo_pai_id}.`)
    if (normCliente(fa.nom_cliente) !== normCliente(paiAtual.nom_cliente)) throw new Error(`O card #${f.id} é de outro cliente — só dá pra juntar cards do mesmo cliente.`)
    filhosAtuais.push(fa)
  }

  const soma = filhosAtuais.reduce((s, f) => s + (parseValorNum(f.valor_servico) || 0), 0)
  const totalPai = (parseValorNum(paiAtual.valor_servico) || 0) + soma
  for (const f of filhosAtuais) {
    const { error } = await supabase.from('Chamado_NF').update({
      grupo_pai_id: pai.id,
      grupo_valor_original: parseValorNum(f.valor_servico) || 0,
      valor_servico: 0,
      status: paiAtual.status,
      tarefa: paiAtual.tarefa || f.tarefa,
    }).eq('id', f.id)
    if (error) throw error
    const { error: errNetos } = await supabase.from('Chamado_NF').update({ grupo_pai_id: pai.id }).eq('grupo_pai_id', f.id)
    if (errNetos) throw errNetos
  }
  const { error } = await supabase.from('Chamado_NF').update({ valor_servico: totalPai }).eq('id', pai.id)
  if (error) throw error
  return totalPai
}

// Desfaz: o filho volta pro kanban na fase do pai (Gerar Boleto / Validar Pix)
// com o valor original, e o pai devolve esse valor do total.
// TRAVA: só enquanto o pai está em Gerar Boleto / Validar Pix — depois disso o
// boleto com o total já saiu e tirar o filho cobraria em dobro.
export async function removerDoGrupo(filho) {
  if (!filho?.id) throw new Error('Card inválido.')
  const { error: rpcErr } = await supabase.rpc('chamado_nf_remover_do_grupo', { p_filho_id: filho.id })
  if (!rpcErr) return
  if (!ehRpcAusente(rpcErr)) throw new Error(rpcErr.message || String(rpcErr))

  // ── fallback (migration ainda não aplicada) ──
  const { data: atual, error: errFilho } = await supabase.from('Chamado_NF')
    .select('id, grupo_pai_id, grupo_valor_original').eq('id', filho.id).maybeSingle()
  if (errFilho) throw errFilho
  if (!atual) throw new Error(`O card #${filho.id} não existe mais.`)
  if (!atual.grupo_pai_id) throw new Error(`O card #${filho.id} não está em nenhum grupo.`)
  const { data: pai, error: errPai } = await supabase.from('Chamado_NF')
    .select('id, valor_servico, status, tarefa').eq('id', atual.grupo_pai_id).maybeSingle()
  if (errPai) throw errPai
  // pai sumido ou excluído: nada foi/será cobrado por ele — libera o filho
  const paiValido = pai && pai.status !== 'excluido'
  if (paiValido) {
    const t = motivoGrupoTravado(pai.status, 'remover', pai.id)
    if (t) throw new Error(t)
  }
  const orig = parseValorNum(atual.grupo_valor_original) || 0
  const volta = paiValido ? { status: pai.status, tarefa: pai.tarefa || 'Gerar Boleto' } : { status: 'gerar_boleto', tarefa: 'Gerar Boleto' }
  const { error } = await supabase.from('Chamado_NF').update({
    grupo_pai_id: null,
    grupo_valor_original: null,
    valor_servico: orig,
    ...volta,
  }).eq('id', filho.id)
  if (error) throw error
  if (pai) {
    const novo = Math.max(0, (parseValorNum(pai.valor_servico) || 0) - orig)
    const { error: errTotal } = await supabase.from('Chamado_NF').update({ valor_servico: novo }).eq('id', pai.id)
    if (errTotal) throw errTotal
  }
}

// Espelha o status do pai nos filhos (chamar no carregarDados dos kanbans, logo
// após o select). Corrige a lista em memória e persiste no banco — assim o pai
// pode ser movido em QUALQUER tela que os filhos acompanham no load seguinte.
export async function sincronizarFilhosComPai(data) {
  const lista = data || []
  const filhos = lista.filter(c => c.grupo_pai_id)
  if (filhos.length === 0) return
  const porId = new Map(lista.map(c => [c.id, c]))
  const faltando = [...new Set(filhos.map(f => f.grupo_pai_id).filter(id => !porId.has(id)))]
  if (faltando.length) {
    const { data: pais } = await supabase.from('Chamado_NF')
      .select('id, status, tarefa, setor').in('id', faltando)
    for (const p of pais || []) porId.set(p.id, p)
  }
  const updates = []
  for (const f of filhos) {
    const pai = porId.get(f.grupo_pai_id)
    if (!pai?.status || f.status === pai.status) continue
    const patch = { status: pai.status, tarefa: pai.tarefa || f.tarefa, setor: pai.setor || f.setor }
    updates.push(supabase.from('Chamado_NF').update(patch).eq('id', f.id))
    const idx = lista.findIndex(c => c.id === f.id)
    if (idx !== -1) lista[idx] = { ...lista[idx], ...patch }
  }
  if (updates.length) await Promise.all(updates)
}
