// AGENDA COLETIVA — banco (SERVIDOR, service role). Regras puras em ./regras.ts.
// Lê cada fonte da sua própria tabela e devolve tudo no formato ItemAgenda.
// Cada fonte falha sozinha: se uma tabela não existe (migration pendente) ou dá erro,
// as outras continuam e a tela recebe um aviso.
import { supabaseAdmin } from '@/lib/server/supabase-admin'
import { migrationFaltou } from '@/lib/marketing/erros'
import { registrarAuditLog } from '@/lib/server/audit-notify'
import type { Autenticado } from '@/lib/auth/server'
import { TBL_LOUSA, TBL_OS } from '@/lib/pos/constants'
import {
  addDias, isoDe, localDe, diasEntre, ocorrencias, setorDe, coresPorPessoa, normTexto, diasDaOS, faixasDeDias,
  osCancelada, osEmAberto, solicitacaoDaOS, PERIODOS, periodoLousa, tipoLousa, TIPOS_LOUSA, ordemSetor,
  type Fonte, type ItemAgenda, type Pessoa, type NovoEvento, type Resposta, type Freq,
} from './regras'

export { migrationFaltou }
export const MSG_MIGRATION_AGENDA = 'Os compromissos da agenda ainda não foram ativados no banco. Rode sql/agenda-coletiva.sql no SQL Editor do Supabase. O resto da agenda (reuniões, sala, tickets, OS, Lousa) já aparece.'
export const SEM_TECNICO = 'sem-tecnico'

function ok<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw Object.assign(new Error(res.error.message), { code: res.error.code })
  return res.data as T
}

export const podeLousa = (auth: Autenticado) =>
  auth.isAdmin || auth.modulos.some((m) => m === 'lousa' || m.startsWith('lousa:'))

// ------------------------------------------------------------------ pessoas
export interface Diretorio {
  pessoas: Pessoa[]
  /** nome normalizado (cadastro OU nome de técnico) → id */
  porNome: Map<string, string>
}

export async function carregarDiretorio(): Promise<Diretorio> {
  const [us, ps] = await Promise.all([
    supabaseAdmin.from('financeiro_usu').select('id, nome, funcao, avatar_url, ativo').eq('ativo', true).limit(1000),
    supabaseAdmin.from('portal_permissoes').select('user_id, mecanico_role, mecanico_tecnico_nome').limit(1000),
  ])
  const perm = new Map(((ps.data || []) as { user_id: string; mecanico_role: string | null; mecanico_tecnico_nome: string | null }[]).map((p) => [p.user_id, p]))
  const base: Omit<Pessoa, 'cor'>[] = []
  const porNome = new Map<string, string>()
  for (const u of (ok(us) || []) as { id: string; nome: string | null; funcao: string | null; avatar_url: string | null }[]) {
    const p = perm.get(u.id)
    const tecnico = p?.mecanico_role === 'tecnico'
    const setor = setorDe(u.funcao, tecnico)
    if (!setor || !u.nome?.trim()) continue
    base.push({ id: u.id, nome: u.nome.trim(), setor, avatar_url: u.avatar_url, tecnico, tecnicoNome: tecnico ? p?.mecanico_tecnico_nome || null : null })
    porNome.set(normTexto(u.nome), u.id)
    if (p?.mecanico_tecnico_nome) porNome.set(normTexto(p.mecanico_tecnico_nome), u.id)
  }
  const cores = coresPorPessoa(base)
  const pessoas = base.map((p) => ({ ...p, cor: cores.get(p.id)! }))
    .sort((a, b) => ordemSetor(a.setor, b.setor) || a.nome.localeCompare(b.nome, 'pt-BR'))
  return { pessoas, porNome }
}

// ------------------------------------------------------------------ fontes
type Ctx = { auth: Autenticado; de: string; ate: string; dir: Diretorio; ids: Set<string> }
const deTs = (c: Ctx) => isoDe(c.de, '00:00')
const ateTs = (c: Ctx) => isoDe(addDias(c.ate, 1), '00:00')
const nomeDe = (c: Ctx, id: string) => c.dir.pessoas.find((p) => p.id === id)?.nome || '—'

async function fonteEventos(c: Ctx): Promise<ItemAgenda[]> {
  // únicos que tocam a janela + todas as séries (expandidas aqui)
  const [unicos, series] = await Promise.all([
    supabaseAdmin.from('agenda_eventos').select('*').is('cancelado_em', null).is('recorrencia', null)
      .lt('inicio', ateTs(c)).gt('fim', deTs(c)).order('inicio').limit(2000),
    supabaseAdmin.from('agenda_eventos').select('*').is('cancelado_em', null).not('recorrencia', 'is', null)
      .lt('inicio', ateTs(c)).limit(500),
  ])
  const evs = [...ok(unicos) as EventoDb[], ...ok(series) as EventoDb[]]
  if (!evs.length) return []
  const parts = ok(await supabaseAdmin.from('agenda_participantes').select('evento_id, user_id, resposta').in('evento_id', evs.map((e) => e.id))) as { evento_id: string; user_id: string; resposta: Resposta }[]
  const porEvento = new Map<string, { user_id: string; resposta: Resposta }[]>()
  for (const p of parts) porEvento.set(p.evento_id, [...(porEvento.get(p.evento_id) || []), p])
  const out: ItemAgenda[] = []
  for (const e of evs) {
    const ps = porEvento.get(e.id) || []
    const respostas: Record<string, Resposta> = Object.fromEntries(ps.map((p) => [p.user_id, p.resposta]))
    const pessoas = [...new Set([e.criado_por, ...ps.filter((p) => p.resposta !== 'nao').map((p) => p.user_id)])].filter((id) => c.ids.has(id))
    const base: Omit<ItemAgenda, 'id' | 'inicio' | 'fim' | 'ocorrencia'> = {
      ref: e.id, fonte: 'evento', titulo: e.titulo, diaInteiro: e.dia_inteiro, pessoas, cor: e.cor, local: e.local, descricao: e.descricao,
      podeEditar: c.auth.isAdmin || e.criado_por === c.auth.userId, criadoPor: e.criado_por, respostas,
      serie: e.recorrencia ? { freq: e.recorrencia.freq, ate: e.recorrencia.ate ?? null } : null,
      detalhes: [['Organizador', nomeDe(c, e.criado_por)]],
    }
    if (!e.recorrencia) { out.push({ ...base, id: `evento:${e.id}`, inicio: e.inicio, fim: e.fim }); continue }
    const ini = localDe(e.inicio), fim = localDe(e.fim)
    const dur = diasEntre(ini.dia, fim.dia)
    for (const d of ocorrencias(ini.dia, e.recorrencia.freq, e.recorrencia.ate ?? null, e.excecoes || [], c.de, c.ate, dur)) {
      out.push({ ...base, id: `evento:${e.id}:${d}`, ocorrencia: d, inicio: isoDe(d, ini.hora), fim: isoDe(addDias(d, dur), fim.hora) })
    }
  }
  return out
}

async function fonteReunioes(c: Ctx): Promise<ItemAgenda[]> {
  const ts = ok(await supabaseAdmin.from('tickets').select('id, numero, titulo, reuniao_inicio, reuniao_etapa, payload, visibilidade, solicitante_id, responsavel_id')
    .eq('tipo', 'reuniao').neq('reuniao_etapa', 'cancelada').gte('reuniao_inicio', deTs(c)).lt('reuniao_inicio', ateTs(c)).limit(500)) as {
      id: string; numero: number; titulo: string; reuniao_inicio: string; reuniao_etapa: string; payload: { duracao_min?: number } | null
      visibilidade: string; solicitante_id: string; responsavel_id: string
    }[]
  if (!ts.length) return []
  const parts = ok(await supabaseAdmin.from('tickets_participantes').select('ticket_id, user_id').in('ticket_id', ts.map((t) => t.id)).is('removido_em', null)) as { ticket_id: string; user_id: string }[]
  const salas = await supabaseAdmin.from('salas_reservas').select('reuniao_id, salas(nome)').in('reuniao_id', ts.map((t) => t.id)).eq('status', 'ativa')
  const salaDe = new Map(((salas.data || []) as unknown as { reuniao_id: string; salas: { nome: string } | null }[]).map((s) => [s.reuniao_id, s.salas?.nome || null]))
  return ts.map((t) => {
    const envolvidos = [...new Set([t.responsavel_id, t.solicitante_id, ...parts.filter((p) => p.ticket_id === t.id).map((p) => p.user_id)])]
    // Reunião privada continua privada fora do módulo: quem não está nela vê só o horário ocupado.
    const ve = t.visibilidade !== 'privado' || c.auth.isAdmin || envolvidos.includes(c.auth.userId)
    const dur = Math.max(5, Number(t.payload?.duracao_min) || 30)
    return {
      id: `reuniao:${t.id}`, ref: t.id, fonte: 'reuniao' as Fonte, titulo: ve ? t.titulo : 'Reunião (privada)',
      inicio: t.reuniao_inicio, fim: new Date(new Date(t.reuniao_inicio).getTime() + dur * 60_000).toISOString(), diaInteiro: false,
      pessoas: envolvidos.filter((id) => c.ids.has(id)), local: ve ? salaDe.get(t.id) || null : null, link: ve ? `/reunioes/${t.id}` : null,
      detalhes: ve ? [['Reunião', `#${t.numero}`], ['Conduz', nomeDe(c, t.responsavel_id)]] : [],
    }
  })
}

async function fonteSala(c: Ctx): Promise<ItemAgenda[]> {
  const rs = ok(await supabaseAdmin.from('salas_reservas').select('id, inicio, fim, titulo, descricao, responsavel_id, salas(nome)')
    .eq('status', 'ativa').is('reuniao_id', null).lt('inicio', ateTs(c)).gt('fim', deTs(c)).limit(1000)) as unknown as {
      id: string; inicio: string; fim: string; titulo: string; descricao: string | null; responsavel_id: string; salas: { nome: string } | null
    }[]
  return rs.map((r) => ({
    id: `sala:${r.id}`, ref: r.id, fonte: 'sala' as Fonte, titulo: r.titulo, inicio: r.inicio, fim: r.fim, diaInteiro: false,
    pessoas: c.ids.has(r.responsavel_id) ? [r.responsavel_id] : [], local: r.salas?.nome || 'Sala de reunião', descricao: r.descricao,
    link: '/salas', detalhes: [['Reservou', nomeDe(c, r.responsavel_id)]],
  }))
}

async function fonteTickets(c: Ctx): Promise<ItemAgenda[]> {
  const ts = ok(await supabaseAdmin.from('tickets').select('id, numero, titulo, prazo, status, visibilidade, solicitante_id, responsavel_id')
    .eq('tipo', 'generico').not('status', 'in', '(resolvido,fechado,cancelado)').gte('prazo', c.de).lte('prazo', c.ate).limit(1000)) as {
      id: string; numero: number; titulo: string; prazo: string; status: string; visibilidade: string; solicitante_id: string; responsavel_id: string
    }[]
  return ts.filter((t) => c.ids.has(t.responsavel_id)).map((t) => {
    const ve = t.visibilidade !== 'privado' || c.auth.isAdmin || t.responsavel_id === c.auth.userId || t.solicitante_id === c.auth.userId
    return {
      id: `ticket:${t.id}`, ref: t.id, fonte: 'ticket' as Fonte, titulo: ve ? `Prazo: #${t.numero} ${t.titulo}` : 'Prazo de ticket (privado)',
      inicio: isoDe(t.prazo, '00:00'), fim: isoDe(addDias(t.prazo, 1), '00:00'), diaInteiro: true, pessoas: [t.responsavel_id],
      link: ve ? `/tickets/${t.id}` : null, extra: ve ? { ticketId: t.id } : undefined,
      detalhes: ve ? [['Pedido por', nomeDe(c, t.solicitante_id)], ['Situação', t.status.replace(/_/g, ' ')]] : [],
    }
  })
}

async function fonteOS(c: Ctx): Promise<ItemAgenda[]> {
  // A OS é criada antes de ser executada: busca as abertas recentes e calcula os dias no JS.
  const desde = addDias(c.de, -60)
  const os = ok(await supabaseAdmin.from(TBL_OS)
    .select('Id_Ordem, Os_Cliente, Os_Tecnico, Os_Tecnico2, Status, Data, Previsao_Execucao, Dias_Execucao, Cidade_Cliente, Serv_Solicitado, Tipo_Servico, Servico_Oficina, Hora_Inicio_Exec')
    .lte('Data', c.ate).or(`Data.gte.${desde},Previsao_Execucao.gte.${desde}`).limit(3000)) as {
      Id_Ordem: string; Os_Cliente: string | null; Os_Tecnico: string | null; Os_Tecnico2: string | null; Status: string | null; Data: string | null
      Previsao_Execucao: string | null; Dias_Execucao: string | null; Cidade_Cliente: string | null; Serv_Solicitado: string | null
      Tipo_Servico: string | null; Servico_Oficina: boolean | null; Hora_Inicio_Exec: string | null
    }[]
  const out: ItemAgenda[] = []
  for (const o of os) {
    if (osCancelada(o.Status)) continue
    let pessoas = [...new Set([o.Os_Tecnico, o.Os_Tecnico2].map((n) => c.dir.porNome.get(normTexto(n))).filter((x): x is string => !!x && c.ids.has(x)))]
    // técnico da OS que não é usuário marcado como técnico (ou OS sem técnico): na Lousa
    // vai para "Sem técnico" em vez de sumir (16/10/2026)
    const tecnicoEscrito = [o.Os_Tecnico, o.Os_Tecnico2].filter((n) => String(n || '').trim()).join(' + ')
    if (!pessoas.length && c.ids.has(SEM_TECNICO)) pessoas = [SEM_TECNICO]
    if (!pessoas.length) continue
    const sol = solicitacaoDaOS(o.Serv_Solicitado)
    for (const [ini, fim] of faixasDeDias(diasDaOS(o))) {
      if (fim < c.de || ini > c.ate) continue
      out.push({
        id: `os:${o.Id_Ordem}:${ini}`, ref: o.Id_Ordem, fonte: 'os', titulo: `${o.Id_Ordem} · ${o.Os_Cliente || 'Cliente'}`,
        inicio: isoDe(ini, '00:00'), fim: isoDe(addDias(fim, 1), '00:00'), diaInteiro: true, pessoas,
        local: o.Servico_Oficina ? 'Oficina' : o.Cidade_Cliente, descricao: sol || null, esmaecido: !osEmAberto(o.Status),
        link: `/pos?id=${encodeURIComponent(o.Id_Ordem)}`,
        detalhes: [['Situação', o.Status || '—'], ...(o.Tipo_Servico ? [['Tipo', o.Tipo_Servico] as [string, string]] : []), ['Técnico', pessoas[0] === SEM_TECNICO ? (tecnicoEscrito ? `${tecnicoEscrito} (não é técnico do portal)` : 'sem técnico na OS') : pessoas.map((p) => nomeDe(c, p)).join(' + ')]],
      })
    }
  }
  return out
}

async function fonteLousa(c: Ctx, tecnicos: Pessoa[], comSemTecnico: boolean): Promise<ItemAgenda[]> {
  const ls = ok(await supabaseAdmin.from(TBL_LOUSA).select('*').gte('data', c.de).lte('data', c.ate).limit(2000)) as {
    id: string; data: string; tipo: string | null; cliente_nome: string | null; cliente_cnpj: string | null; descricao: string | null
    tecnico_nome: string | null; tecnico_acompanhante: string | null; periodo: string | null; criado_por_nome: string | null
  }[]
  const editar = podeLousa(c.auth)
  return ls.flatMap((e) => {
    const tipo = tipoLousa(e.tipo)
    const per = periodoLousa(e.periodo)
    let pessoas = [e.tecnico_nome, e.tecnico_acompanhante].map((n) => (n ? c.dir.porNome.get(normTexto(n)) : undefined)).filter((x): x is string => !!x && c.ids.has(x))
    if (!e.tecnico_nome && tipo === 'feriado') pessoas = tecnicos.map((t) => t.id)
    if (!pessoas.length) { if (!comSemTecnico || e.tecnico_nome) return []; pessoas = [SEM_TECNICO] }
    const titulo = tipo === 'servico' ? (e.cliente_nome || 'Serviço') : `${TIPOS_LOUSA[tipo].rotulo}${e.descricao ? ` · ${e.descricao}` : ''}`
    return [{
      id: `lousa:${e.id}`, ref: e.id, fonte: 'lousa' as Fonte, titulo, inicio: isoDe(e.data, PERIODOS[per].ini), fim: isoDe(e.data, PERIODOS[per].fim),
      diaInteiro: false, pessoas, cor: tipo === 'servico' ? null : TIPOS_LOUSA[tipo].cor, descricao: tipo === 'servico' ? e.descricao : null,
      podeEditar: editar, link: '/lousa',
      detalhes: [['Lousa', `${TIPOS_LOUSA[tipo].rotulo} · ${PERIODOS[per].rotulo}`], ...(e.tecnico_acompanhante ? [['Acompanhante', e.tecnico_acompanhante] as [string, string]] : []), ...(e.criado_por_nome ? [['Lançado por', e.criado_por_nome.trim()] as [string, string]] : [])],
      extra: { tipo, periodo: per, tecnico_nome: e.tecnico_nome, tecnico_acompanhante: e.tecnico_acompanhante, cliente_nome: e.cliente_nome, cliente_cnpj: e.cliente_cnpj, descricao: e.descricao, data: e.data },
    }]
  })
}

export type Modo = 'coletiva' | 'tecnicos'

export async function carregarAgenda(auth: Autenticado, de: string, ate: string, modo: Modo) {
  const dir = await carregarDiretorio()
  let pessoas = dir.pessoas
  if (modo === 'tecnicos') {
    pessoas = pessoas.filter((p) => p.tecnico)
    pessoas = [...pessoas, { id: SEM_TECNICO, nome: 'Sem técnico', setor: 'Técnicos', tecnico: true, cor: '#9aa0a6', avatar_url: null }]
  }
  const c: Ctx = { auth, de, ate, dir, ids: new Set(pessoas.map((p) => p.id)) }
  const tecnicos = dir.pessoas.filter((p) => p.tecnico)
  const fontes: [Fonte, () => Promise<ItemAgenda[]>][] = modo === 'tecnicos'
    ? [['lousa', () => fonteLousa(c, tecnicos, true)], ['os', () => fonteOS(c)], ['evento', () => fonteEventos(c)]]
    : [['evento', () => fonteEventos(c)], ['reuniao', () => fonteReunioes(c)], ['sala', () => fonteSala(c)], ['ticket', () => fonteTickets(c)], ['os', () => fonteOS(c)], ['lousa', () => fonteLousa(c, tecnicos, false)]]
  const avisos: string[] = []
  let migracaoFaltando = false
  const res = await Promise.all(fontes.map(async ([f, fn]) => {
    try { return await fn() } catch (e) {
      if (f === 'evento' && migrationFaltou(e)) { migracaoFaltando = true; return [] }
      console.error(`[agenda] fonte ${f}`, e)
      avisos.push(`Não deu para carregar: ${f === 'os' ? 'OS dos técnicos' : f === 'lousa' ? 'Lousa' : f === 'ticket' ? 'prazos de tickets' : f === 'sala' ? 'reservas da sala' : f === 'reuniao' ? 'reuniões' : 'compromissos'}.`)
      return []
    }
  }))
  // usado pela tela p/ esconder quem não está no modo (técnicos na Lousa)
  const itens = res.flat().map((i) => ({ ...i, pessoas: i.pessoas.filter((p) => c.ids.has(p)) })).filter((i) => i.pessoas.length)
  return { pessoas, itens, avisos, migracaoFaltando, podeLousa: podeLousa(auth) }
}

// ------------------------------------------------------------------ escrita (compromissos)
export interface EventoDb {
  id: string; titulo: string; descricao: string | null; local: string | null; inicio: string; fim: string; dia_inteiro: boolean
  cor: string | null; recorrencia: { freq: Freq; ate?: string | null } | null; excecoes: string[] | null; criado_por: string
  cancelado_em: string | null
}

export async function carregarEvento(id: string): Promise<EventoDb | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  return ok(await supabaseAdmin.from('agenda_eventos').select('*').eq('id', id).is('cancelado_em', null).maybeSingle()) as EventoDb | null
}

async function nomeUsuario(id: string) {
  const { data } = await supabaseAdmin.from('financeiro_usu').select('nome').eq('id', id).maybeSingle()
  return ((data as { nome?: string } | null)?.nome || 'Alguém').trim()
}

async function notificar(destinos: string[], autor: string, titulo: string, descricao: string, eventoId: string) {
  const alvo = [...new Set(destinos)].filter((d) => d && d !== autor)
  if (!alvo.length) return
  await supabaseAdmin.from('portal_notificacoes').insert(alvo.map((user_id) => ({
    user_id, tipo: 'agenda', titulo, descricao, link: `/agenda?evento=${eventoId}`, icone: null,
  }))).then(({ error }) => { if (error) console.error('[agenda] notificar', error.message) })
}

const quando = (n: Pick<NovoEvento, 'inicio' | 'diaInteiro'>) => {
  const l = localDe(n.inicio)
  return `${l.dia.slice(8, 10)}/${l.dia.slice(5, 7)}${n.diaInteiro ? '' : ` às ${l.hora}`}`
}

export async function criarEvento(auth: Autenticado, n: NovoEvento): Promise<EventoDb> {
  const e = ok(await supabaseAdmin.from('agenda_eventos').insert({
    titulo: n.titulo, descricao: n.descricao, local: n.local, inicio: n.inicio, fim: n.fim, dia_inteiro: n.diaInteiro,
    cor: n.cor, recorrencia: n.recorrencia, criado_por: auth.userId,
  }).select('*').single()) as EventoDb
  const convidados = n.participantes.filter((p) => p !== auth.userId)
  if (convidados.length) {
    ok(await supabaseAdmin.from('agenda_participantes').insert(convidados.map((user_id) => ({ evento_id: e.id, user_id }))).select('evento_id'))
    const autor = await nomeUsuario(auth.userId)
    await notificar(convidados, auth.userId, `${autor.split(' ')[0]} te convidou: ${n.titulo}`, quando(n), e.id)
  }
  await registrarAuditLog({ userId: auth.userId, userName: await nomeUsuario(auth.userId), sistema: 'agenda', acao: 'criar', entidade: 'evento', entidadeId: e.id, entidadeLabel: e.titulo, detalhes: { inicio: e.inicio, convidados: convidados.length } }).catch(() => {})
  return e
}

export async function editarEvento(auth: Autenticado, atual: EventoDb, n: NovoEvento): Promise<EventoDb> {
  const e = ok(await supabaseAdmin.from('agenda_eventos').update({
    titulo: n.titulo, descricao: n.descricao, local: n.local, inicio: n.inicio, fim: n.fim, dia_inteiro: n.diaInteiro,
    cor: n.cor, recorrencia: n.recorrencia, updated_at: new Date().toISOString(),
  }).eq('id', atual.id).select('*').single()) as EventoDb
  const antes = (ok(await supabaseAdmin.from('agenda_participantes').select('user_id').eq('evento_id', atual.id)) as { user_id: string }[]).map((p) => p.user_id)
  const depois = n.participantes.filter((p) => p !== atual.criado_por)
  const sair = antes.filter((p) => !depois.includes(p)), entrar = depois.filter((p) => !antes.includes(p))
  if (sair.length) ok(await supabaseAdmin.from('agenda_participantes').delete().eq('evento_id', atual.id).in('user_id', sair).select('evento_id'))
  if (entrar.length) ok(await supabaseAdmin.from('agenda_participantes').insert(entrar.map((user_id) => ({ evento_id: atual.id, user_id }))).select('evento_id'))
  const autor = (await nomeUsuario(auth.userId)).split(' ')[0]
  if (entrar.length) await notificar(entrar, auth.userId, `${autor} te convidou: ${n.titulo}`, quando(n), e.id)
  const mudouHora = atual.inicio !== e.inicio || atual.fim !== e.fim
  const ficam = depois.filter((p) => antes.includes(p))
  if (mudouHora && ficam.length) await notificar(ficam, auth.userId, `${autor} mudou o horário: ${n.titulo}`, `Agora ${quando(n)}`, e.id)
  await registrarAuditLog({ userId: auth.userId, userName: autor, sistema: 'agenda', acao: 'editar', entidade: 'evento', entidadeId: e.id, entidadeLabel: e.titulo, detalhes: { de: { inicio: atual.inicio, fim: atual.fim }, para: { inicio: e.inicio, fim: e.fim } } }).catch(() => {})
  return e
}

/** Arrastar/redimensionar na grade: só muda início/fim (série inteira se for repetida). */
export async function moverEvento(auth: Autenticado, atual: EventoDb, inicio: string, fim: string): Promise<EventoDb> {
  const parts = (ok(await supabaseAdmin.from('agenda_participantes').select('user_id').eq('evento_id', atual.id)) as { user_id: string }[]).map((p) => p.user_id)
  return editarEvento(auth, atual, {
    titulo: atual.titulo, descricao: atual.descricao, local: atual.local, diaInteiro: atual.dia_inteiro, inicio, fim, participantes: parts,
    recorrencia: atual.recorrencia ? { freq: atual.recorrencia.freq, ate: atual.recorrencia.ate ?? null } : null, cor: atual.cor,
  })
}

export async function responderEvento(auth: Autenticado, ev: EventoDb, resposta: Resposta) {
  const r = ok(await supabaseAdmin.from('agenda_participantes').update({ resposta }).eq('evento_id', ev.id).eq('user_id', auth.userId).select('evento_id')) as unknown[]
  if (!r.length) throw Object.assign(new Error('Você não é convidado deste compromisso.'), { code: 'NAO_CONVIDADO' })
  if (resposta !== 'pendente') {
    const quem = (await nomeUsuario(auth.userId)).split(' ')[0]
    const txt = resposta === 'sim' ? 'vai' : resposta === 'nao' ? 'não vai' : 'talvez vá'
    await notificar([ev.criado_por], auth.userId, `${quem} ${txt}: ${ev.titulo}`, quando({ inicio: ev.inicio, diaInteiro: ev.dia_inteiro }), ev.id)
  }
}

export async function excluirEvento(auth: Autenticado, ev: EventoDb, soDia?: string | null) {
  if (soDia && ev.recorrencia) {
    ok(await supabaseAdmin.from('agenda_eventos').update({ excecoes: [...new Set([...(ev.excecoes || []), soDia])], updated_at: new Date().toISOString() }).eq('id', ev.id).select('id'))
  } else {
    ok(await supabaseAdmin.from('agenda_eventos').update({ cancelado_em: new Date().toISOString() }).eq('id', ev.id).select('id'))
    const parts = (ok(await supabaseAdmin.from('agenda_participantes').select('user_id, resposta').eq('evento_id', ev.id)) as { user_id: string; resposta: string }[])
    const autor = (await nomeUsuario(auth.userId)).split(' ')[0]
    await notificar(parts.filter((p) => p.resposta !== 'nao').map((p) => p.user_id), auth.userId, `${autor} cancelou: ${ev.titulo}`, quando({ inicio: ev.inicio, diaInteiro: ev.dia_inteiro }), ev.id)
  }
  await registrarAuditLog({ userId: auth.userId, userName: await nomeUsuario(auth.userId), sistema: 'agenda', acao: soDia ? 'excluir_ocorrencia' : 'excluir', entidade: 'evento', entidadeId: ev.id, entidadeLabel: ev.titulo, detalhes: soDia ? { dia: soDia } : {} }).catch(() => {})
}
