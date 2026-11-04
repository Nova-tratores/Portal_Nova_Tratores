// POPs — ROTEIROS na OS (SERVER-ONLY). Regras puras em ./roteiros.ts.
// Liberar a próxima etapa é idempotente: só quem consegue o UPDATE condicional
// 'pendente' → 'liberada' cria a execução (dois cliques / rota + agendador não duplicam).
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { camposDoStatus, carregarTicket, notificarTicket, registrarEvento } from '@/lib/tickets/server'
import { refExecucaoDaOS } from './regras'
import { rpc } from './server'
import {
  etapaPeloTicket, prazoDaEtapa, proximaEtapa, roteiroTerminou,
  type EtapaOS, type RoteiroEntrada, type RoteiroOS, type StatusRoteiroOS,
} from './roteiros'

export class ErroRoteiro extends Error {
  constructor(msg: string, public status = 400) { super(msg) }
}

const hojeSP = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' })

interface OSInfo { Id_Ordem: string; Projeto: string | null; Os_Cliente: string | null; Status: string | null }
async function carregarOS(osId: string): Promise<OSInfo | null> {
  const { data } = await supabaseAdmin.from('Ordem_Servico').select('Id_Ordem, Projeto, Os_Cliente, Status')
    .eq('Id_Ordem', osId).maybeSingle()
  return (data as OSInfo) || null
}

// ---------------------------------------------------------------------------
// Modelos
// ---------------------------------------------------------------------------
export async function listarModelos(incluirInativos = false) {
  let q = supabaseAdmin.from('pops_roteiros').select('*').order('nome').limit(300)
  if (!incluirInativos) q = q.eq('ativo', true)
  const { data: rs, error } = await q
  if (error) throw error
  const ids = (rs || []).map((r) => r.id as string)
  const { data: es, error: e2 } = ids.length
    ? await supabaseAdmin.from('pops_roteiro_etapas').select('*').in('roteiro_id', ids).order('ordem')
    : { data: [], error: null }
  if (e2) throw e2
  return (rs || []).map((r) => ({ ...r, etapas: (es || []).filter((e) => e.roteiro_id === r.id) }))
}

/** POPs das etapas precisam existir, não ser modelo do sistema e ter versão publicada. */
async function conferirPops(popIds: string[]) {
  const ids = [...new Set(popIds)]
  const { data: pops } = await supabaseAdmin.from('pops').select('id, codigo, arquivado, template_tipo').in('id', ids)
  const { data: pub } = await supabaseAdmin.from('pops_versoes').select('pop_id').in('pop_id', ids).eq('estado', 'publicado')
  const publicados = new Set((pub || []).map((v) => v.pop_id as string))
  for (const id of ids) {
    const p = (pops || []).find((x) => x.id === id)
    if (!p) throw new ErroRoteiro('POP de uma etapa não existe.')
    if (p.arquivado) throw new ErroRoteiro(`${p.codigo} está arquivado.`)
    if (p.template_tipo === 'sistema') throw new ErroRoteiro(`${p.codigo} é modelo do sistema — duplique para a sua área.`)
    if (!publicados.has(id)) throw new ErroRoteiro(`${p.codigo} ainda não tem versão publicada.`)
  }
}

export async function salvarModelo(dados: RoteiroEntrada, autor: string, id?: string) {
  await conferirPops(dados.etapas.map((e) => e.pop_id))
  let roteiroId = id
  const base = { nome: dados.nome, descricao: dados.descricao, area_id: dados.area_id, atualizado_em: new Date().toISOString() }
  if (roteiroId) {
    const { error } = await supabaseAdmin.from('pops_roteiros').update(base).eq('id', roteiroId)
    if (error) throw error
    const { error: eDel } = await supabaseAdmin.from('pops_roteiro_etapas').delete().eq('roteiro_id', roteiroId)
    if (eDel) throw eDel
  } else {
    const { data, error } = await supabaseAdmin.from('pops_roteiros').insert({ ...base, criado_por: autor }).select('id').single()
    if (error) throw error
    roteiroId = data.id as string
  }
  const { error: eIns } = await supabaseAdmin.from('pops_roteiro_etapas').insert(
    dados.etapas.map((e, i) => ({ roteiro_id: roteiroId, ordem: i + 1, ...e })))
  if (eIns) throw eIns
  return roteiroId!
}

export async function ativarModelo(id: string, ativo: boolean) {
  const { error } = await supabaseAdmin.from('pops_roteiros').update({ ativo, atualizado_em: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Roteiros da OS
// ---------------------------------------------------------------------------
type RoteiroOSRow = { id: string; os_id: string; roteiro_id: string | null; nome: string; mkt_acao_id: string | null; status: StatusRoteiroOS; criado_por: string | null; criado_em: string }

async function etapasDe(osRoteiroIds: string[]): Promise<(EtapaOS & { os_roteiro_id: string })[]> {
  if (!osRoteiroIds.length) return []
  const { data, error } = await supabaseAdmin.from('pops_os_etapas').select('*').in('os_roteiro_id', osRoteiroIds).order('ordem')
  if (error) throw error
  return (data || []) as (EtapaOS & { os_roteiro_id: string })[]
}

/** Roteiros da OS com etapas, execuções (nº, status, fora da faixa) e nomes. */
export async function roteirosDaOS(osId: string) {
  const { data: rs, error } = await supabaseAdmin.from('pops_os_roteiros').select('*').eq('os_id', osId).order('criado_em')
  if (error) throw error
  const roteiros = (rs || []) as RoteiroOSRow[]
  const etapas = await etapasDe(roteiros.map((r) => r.id))
  const tickets = etapas.map((e) => e.ticket_id).filter(Boolean) as string[]
  const [{ data: ts }, { data: fora }, { data: pops }] = await Promise.all([
    tickets.length ? supabaseAdmin.from('tickets').select('id, numero, status, prazo, responsavel_id, resolvido_em').in('id', tickets) : Promise.resolve({ data: [] }),
    tickets.length ? supabaseAdmin.from('pops_execucao_respostas').select('ticket_id').in('ticket_id', tickets).eq('fora_faixa', true) : Promise.resolve({ data: [] }),
    etapas.length ? supabaseAdmin.from('pops').select('id, codigo, titulo').in('id', [...new Set(etapas.map((e) => e.pop_id))]) : Promise.resolve({ data: [] }),
  ])
  const foraPorTicket = new Map<string, number>()
  for (const f of (fora || []) as { ticket_id: string }[]) foraPorTicket.set(f.ticket_id, (foraPorTicket.get(f.ticket_id) || 0) + 1)
  // Execuções avulsas ou de gatilho ligadas à OS (fora de roteiro) também aparecem.
  const { data: avulsas } = await supabaseAdmin.from('pops_execucoes').select('ticket_id, pop_id, criado_em').eq('os_id', osId)
  const ticketsRoteiro = new Set(tickets)
  const soltas = ((avulsas || []) as { ticket_id: string; pop_id: string; criado_em: string }[]).filter((a) => !ticketsRoteiro.has(a.ticket_id))
  const extraT = soltas.length ? (await supabaseAdmin.from('tickets').select('id, numero, status, prazo, responsavel_id, resolvido_em').in('id', soltas.map((s) => s.ticket_id))).data || [] : []
  const extraP = soltas.length ? (await supabaseAdmin.from('pops').select('id, codigo, titulo').in('id', [...new Set(soltas.map((s) => s.pop_id))])).data || [] : []
  const tPorId = new Map([...(ts || []), ...extraT].map((t) => [t.id as string, t]))
  const pPorId = new Map([...(pops || []), ...extraP].map((p) => [p.id as string, p]))
  return {
    roteiros: roteiros.map((r) => ({
      ...r,
      etapas: etapas.filter((e) => e.os_roteiro_id === r.id).map((e) => ({
        ...e,
        pop: pPorId.get(e.pop_id) || null,
        ticket: e.ticket_id ? tPorId.get(e.ticket_id) || null : null,
        fora_faixa: e.ticket_id ? foraPorTicket.get(e.ticket_id) || 0 : 0,
      })),
    })),
    avulsas: soltas.map((s) => ({ ...s, pop: pPorId.get(s.pop_id) || null, ticket: tPorId.get(s.ticket_id) || null })),
  }
}

export async function anexarRoteiro(p: { osId: string; roteiroId: string; responsaveis: Record<number, string>; mktAcaoId: string | null; autor: string }) {
  const os = await carregarOS(p.osId)
  if (!os) throw new ErroRoteiro('OS não encontrada.', 404)
  if (os.Status === 'Cancelada' || os.Status === 'Concluída') throw new ErroRoteiro(`A OS está ${os.Status}.`, 409)
  const [modelo] = (await listarModelos(true)).filter((r) => r.id === p.roteiroId)
  if (!modelo || !modelo.ativo) throw new ErroRoteiro('Roteiro não encontrado.', 404)
  const etapas = modelo.etapas as { ordem: number; nome: string; pop_id: string; responsavel_padrao_id: string | null; prazo_dias: number | null }[]
  if (!etapas.length) throw new ErroRoteiro('Este roteiro não tem etapas.')
  await conferirPops(etapas.map((e) => e.pop_id))
  const linhas = etapas.map((e) => {
    const resp = p.responsaveis[e.ordem] || e.responsavel_padrao_id
    if (!resp) throw new ErroRoteiro(`Escolha quem faz a etapa "${e.nome}".`)
    return { ordem: e.ordem, nome: e.nome, pop_id: e.pop_id, responsavel_id: resp, prazo_dias: e.prazo_dias }
  })
  const { data: r, error } = await supabaseAdmin.from('pops_os_roteiros').insert({
    os_id: p.osId, roteiro_id: modelo.id, nome: modelo.nome, mkt_acao_id: p.mktAcaoId, criado_por: p.autor,
  }).select('id').single()
  if (error) throw error
  const { error: e2 } = await supabaseAdmin.from('pops_os_etapas').insert(linhas.map((l) => ({ ...l, os_roteiro_id: r.id })))
  if (e2) { await supabaseAdmin.from('pops_os_roteiros').delete().eq('id', r.id); throw e2 }
  await avancar(r.id as string, p.autor)
  return r.id as string
}

async function carregarRoteiroOS(id: string): Promise<RoteiroOSRow | null> {
  const { data } = await supabaseAdmin.from('pops_os_roteiros').select('*').eq('id', id).maybeSingle()
  return (data as RoteiroOSRow) || null
}

/**
 * Coração do roteiro: lê o ticket da etapa em andamento (feito → conclui), libera
 * a próxima (cria a execução e avisa o responsável) e fecha o roteiro no fim.
 */
export async function avancar(osRoteiroId: string, autor: string | null): Promise<{ liberada: string | null; terminou: boolean }> {
  const r = await carregarRoteiroOS(osRoteiroId)
  if (!r || r.status !== 'ativo') return { liberada: null, terminou: r?.status === 'concluido' }
  let etapas = await etapasDe([r.id])

  for (const e of etapas.filter((x) => x.status === 'liberada' && x.ticket_id)) {
    const { data: t } = await supabaseAdmin.from('tickets').select('status, resolvido_em').eq('id', e.ticket_id!).maybeSingle()
    if (etapaPeloTicket(t?.status ?? null) === 'concluir') {
      await supabaseAdmin.from('pops_os_etapas')
        .update({ status: 'concluida', concluida_em: t?.resolvido_em || new Date().toISOString() })
        .eq('id', e.id).eq('status', 'liberada')
    }
  }
  etapas = await etapasDe([r.id])

  const prox = proximaEtapa(etapas)
  let liberada: string | null = null
  if (prox) {
    // Só uma chamada passa daqui com a mesma etapa.
    const { data: peguei } = await supabaseAdmin.from('pops_os_etapas')
      .update({ status: 'liberada', liberada_em: new Date().toISOString() })
      .eq('id', prox.id).eq('status', 'pendente').select('id')
    if (peguei?.length) {
      try {
        await criarExecucaoDaEtapa(r, prox, autor)
        liberada = prox.id
      } catch (err) {
        await supabaseAdmin.from('pops_os_etapas').update({ status: 'pendente', liberada_em: null }).eq('id', prox.id)
        throw err
      }
    }
  }
  etapas = await etapasDe([r.id])
  const terminou = roteiroTerminou(etapas)
  if (terminou) await supabaseAdmin.from('pops_os_roteiros').update({ status: 'concluido' }).eq('id', r.id).eq('status', 'ativo')
  return { liberada, terminou }
}

async function criarExecucaoDaEtapa(r: RoteiroOSRow, e: EtapaOS, autor: string | null) {
  const os = await carregarOS(r.os_id)
  const { data: pop } = await supabaseAdmin.from('pops').select('id, codigo, titulo, dono_id').eq('id', e.pop_id).single()
  // "Saída da loja · OS-0852 · <chassi>": o nome da etapa no título e o chassi para achar o histórico.
  const ref = `${e.nome} · ${refExecucaoDaOS(r.os_id, os?.Projeto)}`
  const ticketId = await rpc<string | null>('pops_criar_execucao', {
    p_pop: e.pop_id, p_solicitante: r.criado_por || autor || pop!.dono_id, p_responsavel: e.responsavel_id,
    p_prazo: prazoDaEtapa(hojeSP(), e.prazo_dias), p_ref_externa: ref.slice(0, 80),
    p_agendamento: null, p_data_referencia: null, p_visibilidade: 'privado',
  })
  if (!ticketId) throw new ErroRoteiro('Não consegui criar a execução da etapa.', 500)
  await supabaseAdmin.from('pops_os_etapas').update({ ticket_id: ticketId }).eq('id', e.id)
  await supabaseAdmin.from('pops_execucoes').update({ os_id: r.os_id }).eq('ticket_id', ticketId)
  const t = await carregarTicket(ticketId)
  if (t) await notificarTicket(t.ticket, [e.responsavel_id], autor,
    `${e.nome} — OS ${r.os_id}`, `${r.nome} · ${pop!.codigo} ${pop!.titulo}${os?.Os_Cliente ? ` · ${os.Os_Cliente}` : ''}. Preencha pelo celular.`, 'tarefa_nova')
}

/** Chamado quando uma execução é encerrada: se ela é etapa de roteiro, libera a próxima. */
export async function aoConcluirExecucao(ticketId: string, autor: string | null) {
  try {
    const { data } = await supabaseAdmin.from('pops_os_etapas').select('os_roteiro_id').eq('ticket_id', ticketId).maybeSingle()
    if (data?.os_roteiro_id) await avancar(data.os_roteiro_id as string, autor)
  } catch (e) {
    console.error('[pops/roteiros] aoConcluirExecucao:', (e as Error).message)   // o agendador tenta de novo
  }
}

/** Rede de segurança do agendador: etapas em andamento cujo ticket já terminou. */
export async function varrerRoteiros(): Promise<{ verificados: number; liberadas: number; erros: string[] }> {
  const out = { verificados: 0, liberadas: 0, erros: [] as string[] }
  const { data, error } = await supabaseAdmin.from('pops_os_etapas').select('os_roteiro_id').eq('status', 'liberada').limit(1000)
  if (error) { if (/pops_os_etapas/.test(error.message)) return out; throw error }
  for (const id of [...new Set((data || []).map((d) => d.os_roteiro_id as string))]) {
    out.verificados++
    try { if ((await avancar(id, null)).liberada) out.liberadas++ } catch (e) { out.erros.push(`${id}: ${(e as Error).message}`) }
  }
  return out
}

async function etapaComRoteiro(etapaId: string) {
  const { data: e } = await supabaseAdmin.from('pops_os_etapas').select('*').eq('id', etapaId).maybeSingle()
  if (!e) throw new ErroRoteiro('Etapa não encontrada.', 404)
  const r = await carregarRoteiroOS(e.os_roteiro_id as string)
  if (!r) throw new ErroRoteiro('Roteiro não encontrado.', 404)
  if (r.status !== 'ativo') throw new ErroRoteiro('Este roteiro não está mais ativo.', 409)
  return { e: e as EtapaOS & { os_roteiro_id: string }, r }
}

async function cancelarTicket(ticketId: string, autor: string, motivo: string) {
  const { data: t } = await supabaseAdmin.from('tickets').select('status').eq('id', ticketId).maybeSingle()
  if (!t || ['resolvido', 'fechado', 'cancelado'].includes(t.status as string)) return
  await supabaseAdmin.from('tickets').update(camposDoStatus('cancelado')).eq('id', ticketId)
  await registrarEvento(ticketId, autor, 'status', { de: t.status, para: 'cancelado', motivo })
}

/** Pular uma etapa (pendente ou em andamento) com motivo; a seguinte é liberada. */
export async function pularEtapa(etapaId: string, motivo: string, autor: string) {
  const m = motivo.trim()
  if (!m) throw new ErroRoteiro('Diga por que a etapa foi pulada.')
  const { e, r } = await etapaComRoteiro(etapaId)
  if (e.status === 'concluida' || e.status === 'pulada') throw new ErroRoteiro('Esta etapa já terminou.', 409)
  if (e.ticket_id) await cancelarTicket(e.ticket_id, autor, `Etapa pulada: ${m}`)
  await supabaseAdmin.from('pops_os_etapas').update({ status: 'pulada', motivo_pulo: m.slice(0, 500), pulada_por: autor, concluida_em: new Date().toISOString() }).eq('id', e.id)
  return avancar(r.id, autor)
}

/** Trocar quem faz uma etapa que ainda não começou. */
export async function trocarResponsavel(etapaId: string, responsavel: string) {
  const { e } = await etapaComRoteiro(etapaId)
  if (e.status !== 'pendente') throw new ErroRoteiro('Só dá para trocar quem faz antes de a etapa começar. Na etapa em andamento, transfira a execução.', 409)
  await supabaseAdmin.from('pops_os_etapas').update({ responsavel_id: responsavel }).eq('id', e.id)
}

/** Etapa em andamento cuja execução foi cancelada: cria uma execução nova para ela. */
export async function liberarDeNovo(etapaId: string, autor: string) {
  const { e, r } = await etapaComRoteiro(etapaId)
  if (e.status !== 'liberada') throw new ErroRoteiro('Só a etapa em andamento pode ser liberada de novo.', 409)
  if (e.ticket_id) {
    const { data: t } = await supabaseAdmin.from('tickets').select('status').eq('id', e.ticket_id).maybeSingle()
    if (etapaPeloTicket((t?.status as string) ?? null) !== 'cancelada') throw new ErroRoteiro('A execução desta etapa ainda está valendo.', 409)
  }
  await criarExecucaoDaEtapa(r, e, autor)
}

/** Cancelar o roteiro inteiro (a execução em andamento é cancelada junto). */
export async function cancelarRoteiro(osRoteiroId: string, autor: string) {
  const r = await carregarRoteiroOS(osRoteiroId)
  if (!r) throw new ErroRoteiro('Roteiro não encontrado.', 404)
  if (r.status !== 'ativo') throw new ErroRoteiro('Este roteiro não está ativo.', 409)
  for (const e of await etapasDe([r.id])) {
    if (e.status === 'liberada' && e.ticket_id) await cancelarTicket(e.ticket_id, autor, 'Roteiro cancelado na OS')
  }
  await supabaseAdmin.from('pops_os_roteiros').update({ status: 'cancelado' }).eq('id', r.id)
}

/** OS dona de uma etapa ou de um roteiro (a rota confere que é a OS da URL). */
export async function osDe(p: { etapaId?: string; roteiroOsId?: string }): Promise<string | null> {
  let rid = p.roteiroOsId || null
  if (p.etapaId) {
    const { data } = await supabaseAdmin.from('pops_os_etapas').select('os_roteiro_id').eq('id', p.etapaId).maybeSingle()
    rid = (data?.os_roteiro_id as string) || null
  }
  if (!rid) return null
  const { data } = await supabaseAdmin.from('pops_os_roteiros').select('os_id').eq('id', rid).maybeSingle()
  return (data?.os_id as string) || null
}

export type { RoteiroOS }
