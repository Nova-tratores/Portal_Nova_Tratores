// Lançamento da comissão pelo portal, com autorização do DIRETOR e espelho no RH (José, 20/10/2026) — SÓ SERVIDOR.
//  pedir     → quem pede ASSINA; grava o pedido (aguardando) com TODAS as OS do mês e avisa os diretores no sino;
//  autorizar → só diretor, ASSINA; espelha no RH: rh_comissoes do mês (aprovada) + para cada OS mexida o ajuste em
//              comissoes_os_relatorio (a mesma do painel do Omie que o RH usa) e o motivo em rh_comissao_os_log;
//  devolver  → só diretor: aponta o que mudar (valor / não pagar / conferir) SEM mexer em nada — volta para o
//              pós-vendas ajustar e pedir de novo ("o diretor informa, mas não altera nada").
// Tudo que acontece vira uma linha em posvendas_comissoes_eventos (aba Histórico). SQL: sql/diretor-comissoes.sql.
import { supabaseAdmin as sb } from '@/lib/server/supabase-admin'
import { clienteRH } from './rh-server'
import { chaveDoTecnico } from './comissao-detalhe'
import { casarNome } from './ocorrencias-painel'
import { parcelasDoDesconto, qtdParcelas, caixinhaDe, type DescontoPedido } from './descontos-tecnico'
export type { DescontoPedido } from './descontos-tecnico'

type Rec = Record<string, unknown>
export interface LinhaPedido {
  os: string; numero: string; cliente: string; calculado: number; valor: number; acao: 'pagar' | 'nao' | 'ajustar'; motivo: string
  divisao?: Record<string, number> | null; data?: string | null; grupo?: 'cliente' | 'garantia' | 'interna'; regra?: string
  descontoCliente?: { hora: number; km: number; geral: number; pecas: number } | null
}
/** O que o diretor pede para mudar numa OS (não altera nada — só informa). */
export interface Apontamento { os: string; numero: string; pedido: 'alterar' | 'nao_pagar' | 'conferir'; valor?: number | null; texto: string }
/** Dados do técnico no momento do pedido (vão para o documento). */
export interface InfoPedido { nomeRh?: string | null; cargo?: string | null; pct?: number | null; pagamento?: string | null }
export interface AssinaturaMeta { ip: string | null; ua: string | null; em: string }
export type StatusPedido = 'aguardando' | 'devolvida' | 'recusada' | 'espelhada' | 'erro_rh' | 'cancelada' | 'substituida'
export interface PedidoComissao {
  id: string; tecnico: string; mes: string; valor: number; calculado: number | null; linhas: LinhaPedido[]
  status: StatusPedido
  pedido_por: string | null; pedido_por_id?: string | null; pedido_em: string; decidido_por: string | null; decidido_em: string | null; observacao: string | null
  rh_comissao_id: string | null; rh_erro: string | null; espelhado_em: string | null
  apontamentos?: Apontamento[] | null
  descontos?: DescontoPedido[] | null
  info?: InfoPedido | null
  assinatura_pedido?: string | null; assinatura_pedido_meta?: AssinaturaMeta | null
  assinatura_diretor?: string | null; assinatura_diretor_meta?: AssinaturaMeta | null
}
export type TipoEvento = 'pedido' | 'devolvida' | 'autorizada' | 'espelhada' | 'erro_rh' | 'substituida'
export interface EventoComissao { id: string; pedido_id: string; tecnico: string; mes: string; tipo: TipoEvento; autor: string | null; em: string; valor: number | null; detalhes: Rec | null }

const falta = (e: { code?: string; message?: string } | null) => !!e && (e.code === 'PGRST205' || e.code === '42P01' || e.code === '42703' || /does not exist|could not find/i.test(e.message || ''))
export class SemTabela extends Error { constructor() { super('Falta rodar o SQL sql/diretor-comissoes.sql (papel Diretor e lançamento de comissão).') } }
const r2 = (n: number) => Math.round(n * 100) / 100
const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
/** Código do documento: AC-2026-09-1A2B3C (mês + começo do id). */
export const codigoPedido = (p: { id: string; mes: string }) => `AC-${p.mes}-${p.id.replace(/-/g, '').slice(0, 6).toUpperCase()}`
/** OS em que alguém mexeu (só essas vão para os ajustes do RH). */
export const linhaMexida = (l: LinhaPedido) => l.acao !== 'pagar' || !!l.divisao || Math.abs((l.valor || 0) - (l.calculado || 0)) > 0.005
const PNG_OK = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/
function validarAssinatura(png: unknown): string {
  const s = String(png || '')
  if (!PNG_OK.test(s)) throw new Error('Falta a assinatura')
  if (s.length > 400_000) throw new Error('Assinatura grande demais — limpe e assine de novo')
  return s
}

export async function ehDiretor(userId: string): Promise<boolean> {
  const { data, error } = await sb.from('portal_permissoes').select('is_diretor').eq('user_id', userId).maybeSingle()
  if (error) { if (falta(error)) return false; throw new Error(error.message) }
  return (data as Rec | null)?.is_diretor === true
}
async function diretores(): Promise<string[]> {
  const { data, error } = await sb.from('portal_permissoes').select('user_id').eq('is_diretor', true)
  if (error) return []
  return ((data || []) as Rec[]).map((x) => String(x.user_id))
}
async function avisar(ids: string[], titulo: string, descricao: string, link: string) {
  if (!ids.length) return
  await sb.from('portal_notificacoes').insert(ids.map((user_id) => ({ user_id, tipo: 'sistema', titulo, descricao, link }))).then(() => {}, () => {})
}
async function registrar(p: { id: string; tecnico: string; mes: string }, tipo: TipoEvento, autor: { id?: string | null; nome: string } | null, valor: number | null, detalhes?: Rec) {
  await sb.from('posvendas_comissoes_eventos').insert({ pedido_id: p.id, tecnico: p.tecnico, mes: p.mes, tipo, autor: autor?.nome || null, autor_id: autor?.id || null, valor, detalhes: detalhes || null }).then(() => {}, () => {})
}
const linkFicha = (p: { tecnico: string; mes: string }) => `/mecanicos?aba=mecanicos&tecnico=${encodeURIComponent(p.tecnico)}&secao=comissao&mes=${p.mes}`

const SEM_ASSINATURAS = 'id, tecnico, mes, valor, calculado, linhas, status, pedido_por, pedido_por_id, pedido_em, decidido_por, decidido_em, observacao, rh_comissao_id, rh_erro, espelhado_em, apontamentos, info, descontos'
export async function listarPedidos(f: { mes?: string; tecnico?: string; abertos?: boolean }): Promise<PedidoComissao[]> {
  let q = sb.from('posvendas_comissoes').select(SEM_ASSINATURAS).order('pedido_em', { ascending: false }).limit(200)
  if (f.mes) q = q.eq('mes', f.mes)
  if (f.tecnico) q = q.eq('tecnico', f.tecnico)
  if (f.abertos) q = q.eq('status', 'aguardando')
  const { data, error } = await q
  if (error) { if (falta(error)) throw new SemTabela(); throw new Error(error.message) }
  return (data || []) as unknown as PedidoComissao[]
}
export async function pedidoCompleto(id: string): Promise<PedidoComissao | null> {
  const { data, error } = await sb.from('posvendas_comissoes').select('*').eq('id', id).maybeSingle()
  if (error) { if (falta(error)) throw new SemTabela(); throw new Error(error.message) }
  return (data as PedidoComissao | null) || null
}
export async function listarEventos(f: { mes?: string; tecnico?: string; limite?: number }): Promise<EventoComissao[]> {
  let q = sb.from('posvendas_comissoes_eventos').select('*').order('em', { ascending: false }).limit(Math.min(f.limite || 300, 1000))
  if (f.mes) q = q.eq('mes', f.mes)
  if (f.tecnico) q = q.eq('tecnico', f.tecnico)
  const { data, error } = await q
  if (error) { if (falta(error)) throw new SemTabela(); throw new Error(error.message) }
  return (data || []) as EventoComissao[]
}

export async function pedirLancamento(
  p: { tecnico: string; mes: string; valor: number; calculado: number; linhas: LinhaPedido[]; assinatura: unknown; info?: InfoPedido | null; descontos?: unknown },
  autor: { id: string; nome: string }, meta: { ip: string | null; ua: string | null },
) {
  if (!p.tecnico || !/^\d{4}-\d{2}$/.test(p.mes)) throw new Error('Técnico ou mês inválido')
  if (!(p.valor >= 0)) throw new Error('Valor inválido')
  const semMotivo = p.linhas.filter((l) => linhaMexida(l) && !String(l.motivo || '').trim())
  if (semMotivo.length) throw new Error(`Falta o motivo em ${semMotivo.length} OS`)
  const assinatura = validarAssinatura(p.assinatura)
  const descontos: DescontoPedido[] = (Array.isArray(p.descontos) ? p.descontos : []).map((x: Rec) => ({
    tipo: x.tipo === 'requisicao' ? 'requisicao' as const : 'outro' as const, ref: x.ref != null ? String(x.ref) : null,
    descricao: String(x.descricao || '').trim().slice(0, 200), valor: r2(Number(x.valor)),
    parcelas: qtdParcelas(x as { parcelas?: number }), inicio: /^\d{4}-\d{2}$/.test(String(x.inicio || '')) ? String(x.inicio) : new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7),
  }))
  if (descontos.some((x) => !(x.valor > 0) || !x.descricao)) throw new Error('Cada desconto precisa de descrição e valor')
  // um pedido em aberto por vez: o anterior (aguardando) vira substituído
  const { data: velhos, error: ev } = await sb.from('posvendas_comissoes').select('id, tecnico, mes, valor').eq('tecnico', p.tecnico).eq('mes', p.mes).eq('status', 'aguardando')
  if (ev) { if (falta(ev)) throw new SemTabela(); throw new Error(ev.message) }
  for (const v of (velhos || []) as Rec[]) {
    await sb.from('posvendas_comissoes').update({ status: 'cancelada', observacao: 'substituído por um pedido novo' }).eq('id', v.id)
    await registrar({ id: String(v.id), tecnico: p.tecnico, mes: p.mes }, 'substituida', autor, Number(v.valor), { motivo: 'pedido novo antes da decisão do diretor' })
  }
  const agora = new Date().toISOString()
  const { data, error } = await sb.from('posvendas_comissoes').insert({
    tecnico: p.tecnico, mes: p.mes, valor: r2(p.valor), calculado: r2(p.calculado), linhas: p.linhas,
    status: 'aguardando', pedido_por: autor.nome, pedido_por_id: autor.id, info: p.info || null, descontos,
    assinatura_pedido: assinatura, assinatura_pedido_meta: { ...meta, em: agora },
  }).select(SEM_ASSINATURAS).single()
  if (error) { if (falta(error)) throw new SemTabela(); throw new Error(error.message) }
  const ped = data as unknown as PedidoComissao
  const mexidas = p.linhas.filter(linhaMexida)
  await registrar(ped, 'pedido', autor, r2(p.valor), { calculado: r2(p.calculado), os: p.linhas.length, mexidas: mexidas.map((l) => ({ numero: l.numero, acao: l.divisao ? 'dividir' : l.acao, valor: l.valor, calculado: l.calculado, motivo: l.motivo })), descontos })
  const ds = await diretores()
  await avisar(ds, `Comissão para autorizar: ${p.tecnico}`, `${p.mes.slice(5)}/${p.mes.slice(0, 4)} · ${brl(p.valor)}${mexidas.length ? ` · ${mexidas.length} OS com decisão` : ''} — pedido de ${autor.nome}`, '/dashboard?comissoes=1')
  return { pedido: ped, semDiretor: ds.length === 0 }
}

export async function decidirPedido(
  id: string,
  d: { acao: 'autorizar' | 'devolver'; observacao?: string; apontamentos?: Apontamento[]; assinatura?: unknown },
  autor: { id: string; nome: string }, meta: { ip: string | null; ua: string | null },
) {
  if (!(await ehDiretor(autor.id))) throw Object.assign(new Error('Só o diretor autoriza a comissão'), { status: 403 })
  const p = await pedidoCompleto(id)
  if (!p) throw new Error('Pedido não encontrado')
  if (p.status !== 'aguardando') throw new Error('Este pedido já foi decidido')
  const agora = new Date().toISOString()
  const observacao = String(d.observacao || '').trim() || null

  if (d.acao === 'devolver') {
    const apont = (Array.isArray(d.apontamentos) ? d.apontamentos : [])
      .filter((a) => a && a.os && ['alterar', 'nao_pagar', 'conferir'].includes(a.pedido))
      .map((a) => ({ os: String(a.os), numero: String(a.numero || a.os), pedido: a.pedido, valor: a.pedido === 'alterar' && Number.isFinite(Number(a.valor)) ? r2(Number(a.valor)) : null, texto: String(a.texto || '').trim() }))
    if (!apont.length && !observacao) throw new Error('Diga o que precisa mudar — numa OS ou na observação')
    if (apont.some((a) => a.pedido === 'alterar' && a.valor == null)) throw new Error('Informe o valor que você quer nas OS marcadas para alterar')
    await sb.from('posvendas_comissoes').update({ status: 'devolvida', decidido_por: autor.nome, decidido_em: agora, observacao, apontamentos: apont }).eq('id', id)
    await registrar(p, 'devolvida', autor, p.valor, { observacao, apontamentos: apont })
    if (p.pedido_por_id) await avisar([p.pedido_por_id], `Comissão devolvida para ajuste: ${p.tecnico}`, `${autor.nome}${apont.length ? ` apontou ${apont.length} OS` : ''}${observacao ? ` — ${observacao}` : ''}`, linkFicha(p))
    return { status: 'devolvida' as const }
  }

  const assinatura = validarAssinatura(d.assinatura)
  await sb.from('posvendas_comissoes').update({ decidido_por: autor.nome, decidido_em: agora, observacao, assinatura_diretor: assinatura, assinatura_diretor_meta: { ...meta, em: agora } }).eq('id', id)
  await registrar(p, 'autorizada', autor, p.valor, { observacao })
  try {
    const rhId = await espelharNoRH(p, autor.nome)
    // o que já estava espelhado deste técnico/mês fica como substituído
    const { data: antigos } = await sb.from('posvendas_comissoes').select('id, valor').eq('tecnico', p.tecnico).eq('mes', p.mes).eq('status', 'espelhada')
    for (const a of (antigos || []) as Rec[]) {
      await sb.from('posvendas_comissoes').update({ status: 'substituida' }).eq('id', a.id)
      await registrar({ id: String(a.id), tecnico: p.tecnico, mes: p.mes }, 'substituida', autor, Number(a.valor), { motivo: 'nova comissão autorizada para o mesmo mês' })
    }
    await sb.from('posvendas_comissoes').update({ status: 'espelhada', rh_comissao_id: rhId, espelhado_em: new Date().toISOString(), rh_erro: null }).eq('id', id)
    await registrar(p, 'espelhada', null, p.valor, { rh_comissao_id: rhId, os_ajustadas: p.linhas.filter(linhaMexida).length })
    if (p.pedido_por_id) await avisar([p.pedido_por_id], `Comissão autorizada: ${p.tecnico}`, `${brl(p.valor)} · lançada no RH por ${autor.nome}`, linkFicha(p))
    return { status: 'espelhada' as const }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await sb.from('posvendas_comissoes').update({ status: 'erro_rh', rh_erro: msg }).eq('id', id)
    await registrar(p, 'erro_rh', null, p.valor, { erro: msg })
    return { status: 'erro_rh' as const, erro: msg }
  }
}

/** O 1% da caixinha, igual ao RH faz ao aprovar (contribuirComissao): sem isso a comissão autorizada aqui não
 *  punha nada na caixinha e o Omie lançava 100% (José, 28/10/2026). Refaz se o valor mudou; zerada = tira. */
async function caixinhaDaComissao(c: NonNullable<ReturnType<typeof clienteRH>>, k: { id: string; funcionarioId: string; valor: number; mes: number; ano: number }) {
  if (!k.id) return
  const novo = caixinhaDe(k.valor)
  const { data: ja } = await c.from('rh_caixinha_mov').select('id, valor').eq('tipo', 'contribuicao').eq('referencia_id', k.id).maybeSingle()
  if (ja && Math.abs(Number((ja as Rec).valor) - novo) < 0.005) return
  if (ja) {
    const { error } = await c.from('rh_caixinha_mov').delete().eq('id', (ja as Rec).id)
    if (error) throw new Error(`RH (caixinha): ${error.message}`)
  }
  if (novo <= 0) { await c.from('rh_comissoes').update({ caixinha_contribuicao: null }).eq('id', k.id); return }
  const { data: ciclo, error: ec } = await c.from('rh_caixinha_ciclo').select('id').eq('status', 'aberto')
    .order('inicio_ano', { ascending: false }).order('inicio_mes', { ascending: false }).limit(1).maybeSingle()
  if (ec || !ciclo) return // sem ciclo aberto o RH também não contribui
  const { error } = await c.from('rh_caixinha_mov').insert({
    ciclo_id: (ciclo as Rec).id, funcionario_id: k.funcionarioId, tipo: 'contribuicao', valor: novo,
    competencia_mes: k.mes, competencia_ano: k.ano, referencia_id: k.id, descricao: `1% da comissão ${k.mes}/${k.ano}`, usuario_nome: 'Portal',
  })
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(`RH (caixinha): ${error.message}`)
  const { error: eu } = await c.from('rh_comissoes').update({ caixinha_contribuicao: novo }).eq('id', k.id)
  if (eu) throw new Error(`RH (caixinha): ${eu.message}`)
}

/** Espelha no RH: comissão do mês + ajustes por OS (com motivo). Devolve o id da comissão no RH. */
async function espelharNoRH(p: PedidoComissao, autor: string): Promise<string> {
  const c = clienteRH()
  if (!c) throw new Error('RH não configurado neste servidor (RH_SUPABASE_URL)')
  const { data: funs, error: e1 } = await c.from('rh_funcionarios').select('id, nome, empresa, empresa_id, status')
  if (e1) throw new Error(`RH: ${e1.message}`)
  const todos = (funs || []) as Rec[]
  const achar = (nome: string) => {
    const cand = todos.filter((f) => chaveDoTecnico(String(f.nome), nome) || casarNome(String(f.nome), [nome]) === nome)
    return cand.find((f) => f.status !== 'demitido') || cand[0]
  }
  const f = achar(p.tecnico)
  if (!f) throw new Error(`Não achei ${p.tecnico} no RH`)
  const [ano, mes] = p.mes.split('-').map(Number)
  let empresaId = f.empresa_id as string | null
  if (!empresaId) { const { data: em } = await c.from('rh_empresas').select('id').eq('codigo', f.empresa).maybeSingle(); empresaId = (em as Rec | null)?.id as string || null }
  if (!empresaId) throw new Error(`${f.nome}: sem empresa no RH`)
  const desc = `Lançada pelo portal (Centro do Pós-Vendas) — autorizada por ${autor}. ${p.linhas.filter(linhaMexida).length ? `${p.linhas.filter(linhaMexida).length} OS ajustada(s).` : 'Como calculado.'}`
  const { data: ja } = await c.from('rh_comissoes').select('id, status').eq('funcionario_id', f.id).eq('competencia_ano', ano).eq('competencia_mes', mes).not('status', 'in', '(cancelada,rejeitada)')
  const existente = ((ja || []) as Rec[])[0]
  let rhId: string
  if (existente) {
    if (['lancada_omie', 'paga'].includes(String(existente.status))) throw new Error(`A comissão de ${p.mes.slice(5)}/${ano} já está "${String(existente.status).replace('_', ' ')}" no RH — ajuste por lá`)
    if (p.valor <= 0) {
      const { error } = await c.from('rh_comissoes').update({ status: 'cancelada', cancelada_em: new Date().toISOString(), cancelada_motivo: `zerada pelo portal (autorizada por ${autor})` }).eq('id', existente.id)
      if (error) throw new Error(`RH: ${error.message}`)
    } else {
      const { error } = await c.from('rh_comissoes').update({ valor: r2(p.valor), status: 'aprovada', origem_descricao: desc, aprovado_em: new Date().toISOString() }).eq('id', existente.id)
      if (error) throw new Error(`RH: ${error.message}`)
    }
    rhId = String(existente.id)
  } else {
    if (p.valor <= 0) return ''
    const { data: nova, error } = await c.from('rh_comissoes').insert({
      funcionario_id: f.id, empresa: f.empresa, empresa_id: empresaId, competencia_mes: mes, competencia_ano: ano,
      valor: r2(p.valor), origem_tipo: 'ordem_servico', origem_descricao: desc, status: 'aprovada', aprovado_em: new Date().toISOString(),
    }).select('id').single()
    if (error) throw new Error(`RH: ${error.message}`)
    rhId = String((nova as Rec).id)
  }
  await caixinhaDaComissao(c, { id: rhId, funcionarioId: String(f.id), valor: p.valor, mes, ano })
  // descontos do técnico: viram desconto no RH (folha), como o RH faz pela tela de comissão
  if (p.descontos?.length) {
    const { data: tipo } = await c.from('rh_desconto_tipos').select('id').eq('codigo', 'outro').maybeSingle()
    if (!tipo) throw new Error('RH: tipo de desconto "outro" não encontrado')
    const { data: ja } = await c.from('rh_descontos').select('descricao, status').eq('funcionario_id', f.id).ilike('descricao', '%[Portal %')
    const jaTem = new Set(((ja || []) as Rec[]).filter((x) => x.status !== 'cancelado').map((x) => String(x.descricao || '').match(/\[Portal [A-Z]+ #[^\]]+\]/)?.[0]).filter(Boolean))
    const cod = codigoPedido(p)
    for (const [i, x] of p.descontos.entries()) {
      const tag = x.tipo === 'requisicao' && x.ref ? `[Portal REQ #${x.ref}]` : `[Portal COM #${cod}-${i + 1}]`
      if (jaTem.has(tag)) continue
      const hojeMes = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
      for (const pc of parcelasDoDesconto(x, hojeMes)) {
        const sufixo = pc.de > 1 ? ` — parcela ${pc.n}/${pc.de}` : ''
        const { error } = await c.from('rh_descontos').insert({
          funcionario_id: f.id, empresa: f.empresa, empresa_id: empresaId, tipo_id: (tipo as Rec).id, descricao: `${tag} ${x.descricao}${sufixo}`.slice(0, 300),
          valor: pc.valor, competencia_mes: Number(pc.mes.slice(5)), competencia_ano: Number(pc.mes.slice(0, 4)), status: 'pendente_aprovacao', fonte: 'funcionario',
        })
        if (error) throw new Error(`RH (desconto): ${error.message}`)
      }
    }
  }
  // ajustes por OS: o mesmo lugar que o painel do Omie e o RH usam (por técnico, valor final sem dividir)
  for (const l of p.linhas.filter(linhaMexida)) {
    const num = l.numero || l.os
    const { data: atual } = await sb.from('comissoes_os_relatorio').select('id, por_tecnico, data_ref').eq('numero_os', num).maybeSingle()
    const por: Record<string, number> = { ...(((atual as Rec | null)?.por_tecnico as Record<string, number>) || {}) }
    const valores: [string, number][] = l.divisao ? Object.entries(l.divisao) : [[p.tecnico, l.acao === 'nao' ? 0 : l.valor]]
    for (const [tec, v] of valores) {
      const fr = achar(tec)
      const chave = String(fr?.nome || tec).toUpperCase()
      for (const k of Object.keys(por)) if (chaveDoTecnico(k, tec)) delete por[k]
      por[chave] = r2(v)
    }
    if (atual) await sb.from('comissoes_os_relatorio').update({ por_tecnico: por }).eq('id', (atual as Rec).id)
    else await sb.from('comissoes_os_relatorio').insert({ numero_os: num, valor: null, data_ref: '', por_tecnico: por })
    await c.from('rh_comissao_os_log').insert({
      funcionario_id: f.id, empresa_id: empresaId, competencia_mes: mes, competencia_ano: ano, numero_os: num, campo: 'valor',
      valor_de: brl(l.calculado), valor_para: String(l.divisao ? r2(l.divisao[p.tecnico] ?? 0) : l.acao === 'nao' ? 0 : r2(l.valor)),
      motivo: `${l.acao === 'nao' ? 'Não paga' : l.divisao ? 'Dividida' : 'Ajustada'}: ${l.motivo} (portal, autorizado por ${autor})`, usuario_nome: `Portal · ${autor}`,
    }).then(() => {}, () => {})
  }
  return rhId
}

/** Requisição cobrada do técnico (para marcar na própria requisição): pedidos em andamento ou já lançados no RH
 *  com um desconto desta requisição. */
export interface DescontoNaRequisicao { pedidoId: string; tecnico: string; mes: string; status: StatusPedido; pedidoPor: string | null; pedidoEm: string; decididoPor: string | null; desconto: DescontoPedido }
export async function descontosDaRequisicao(reqId: string): Promise<DescontoNaRequisicao[]> {
  const { data, error } = await sb.from('posvendas_comissoes').select('id, tecnico, mes, status, pedido_por, pedido_em, decidido_por, descontos')
    .contains('descontos', [{ ref: String(reqId) }]).in('status', ['aguardando', 'espelhada', 'erro_rh']).order('pedido_em', { ascending: false })
  if (error) { if (falta(error)) return []; throw new Error(error.message) }
  const out: DescontoNaRequisicao[] = []
  for (const p of (data || []) as Rec[]) for (const x of ((p.descontos as DescontoPedido[]) || [])) {
    if (x.tipo === 'requisicao' && String(x.ref) === String(reqId)) out.push({ pedidoId: String(p.id), tecnico: String(p.tecnico), mes: String(p.mes), status: p.status as StatusPedido, pedidoPor: (p.pedido_por as string) || null, pedidoEm: String(p.pedido_em), decididoPor: (p.decidido_por as string) || null, desconto: x })
  }
  return out
}
