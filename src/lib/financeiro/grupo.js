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
export async function juntarCards(pai, filhos) {
  const soma = (filhos || []).reduce((s, f) => s + (parseValorNum(f.valor_servico) || 0), 0)
  const totalPai = (parseValorNum(pai.valor_servico) || 0) + soma
  for (const f of filhos || []) {
    const { error } = await supabase.from('Chamado_NF').update({
      grupo_pai_id: pai.id,
      grupo_valor_original: parseValorNum(f.valor_servico) || 0,
      valor_servico: 0,
      status: pai.status,
      tarefa: pai.tarefa || f.tarefa,
    }).eq('id', f.id)
    if (error) throw error
    await supabase.from('Chamado_NF').update({ grupo_pai_id: pai.id }).eq('grupo_pai_id', f.id)
  }
  const { error } = await supabase.from('Chamado_NF').update({ valor_servico: totalPai }).eq('id', pai.id)
  if (error) throw error
  return totalPai
}

// Desfaz: o filho volta pro kanban em Gerar Boleto com o valor original,
// e o pai devolve esse valor do total.
export async function removerDoGrupo(filho) {
  const orig = parseValorNum(filho.grupo_valor_original) || 0
  const { data: pai } = await supabase.from('Chamado_NF')
    .select('id, valor_servico').eq('id', filho.grupo_pai_id).maybeSingle()
  const { error } = await supabase.from('Chamado_NF').update({
    grupo_pai_id: null,
    grupo_valor_original: null,
    valor_servico: orig,
    status: 'gerar_boleto',
    tarefa: 'Gerar Boleto',
  }).eq('id', filho.id)
  if (error) throw error
  if (pai) {
    const novo = Math.max(0, (parseValorNum(pai.valor_servico) || 0) - orig)
    await supabase.from('Chamado_NF').update({ valor_servico: novo }).eq('id', pai.id)
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
