'use client'
// Garantias no Centro do Pós-Vendas — opções da página de teste (José, 19/10/2026: "opções melhores para
// entender as garantias, pegando direto do módulo de garantia"). Dados: /api/mecanicos/garantias (tabelas do
// módulo). Valor esperado = peças + horas × valor/h da fábrica + km × valor/km da fábrica.
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import { STATUS_LABEL, STATUS_COR } from '@/lib/garantias/constants'
import type { GarantiaStatus } from '@/lib/garantias/types'
import { brl, Numero } from './ui'
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'
import type { GarantiaDetalhe } from '@/lib/garantias/types'
import { agruparPorDestino, andar, dentro, destinoRejeicao, DESTINOS, diaBR, ehAtual, janela, ROTULO_COBRANCA, trocarEscala, valorNoDestino, type Escala, type Janela } from '@/lib/mecanicos/garantias-painel'

const MUDO = 'var(--portal-text-muted, #64748b)'
export type Gar = {
  id: string; numero: string; numeroExterno: string | null; os: string; cliente: string | null; modelo: string | null; chassis: string | null
  status: GarantiaStatus; tecnico: string; garantista: string | null; recusadoPor: string | null; motivo: string | null
  montadora: { nome: string; cor: string | null } | null
  horas: number; km: number; valorPecas: number; valorServico: number; esperado: number; pago: number
  criadaEm: string; enviadaEm: string | null; finalizadaEm: string | null; mexidaEm: string
  cobranca: { status: string; valor: number; vencimento: string | null }; devolucao: { status: string; prazo: string | null }
  pendencias: number; pendenciaTipos: string[]
}
/** Período do bloco (22/10/2026): Dia · Mês · Ano com setas, pela data de fechamento (lib/mecanicos/garantias-painel). */
export type Periodo = Janela
const FINAIS: GarantiaStatus[] = ['aprovada', 'rejeitada']
const FASES: GarantiaStatus[] = ['aberta', 'em_analise', 'bo_tecnico', 'enviada', 'info_pendente', 'aguardando_servico', 'ressarcimento_fabrica']
const dias = (de: string | null, hoje: string) => (de ? Math.max(0, Math.round((Date.parse(`${hoje}T12:00:00Z`) - Date.parse(de)) / 86_400_000)) : 0)
const corSt = (s: GarantiaStatus) => STATUS_COR[s] || '#64748b'
const css = (c: string) => ({ '--c': c } as React.CSSProperties)

/** Busca as garantias uma vez (todas as opções usam a mesma lista). */
export function useGarantias() {
  const [dados, setDados] = useState<{ hoje: string; garantias: Gar[] } | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let ativo = true
    ;(async () => {
      // abre na hora com a última lista guardada no navegador; a nova chega por trás
      try { const t = localStorage.getItem('cpv-garantias-v1'); if (t && ativo) setDados(JSON.parse(t)) } catch { /* nada guardado */ }
      try {
        const r = await fetch('/api/mecanicos/garantias', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!ativo) return
        if (!r.ok) setErro(j.error || `Erro ${r.status}`)
        else { setDados(j); try { localStorage.setItem('cpv-garantias-v1', JSON.stringify(j)) } catch { /* sem espaço */ } }
      } catch (e) { if (ativo) setErro(e instanceof Error ? e.message : 'Falha') }
    })()
    return () => { ativo = false }
  }, [])
  return { dados, erro }
}

/** Contas comuns: abertas, finalizadas no período, dinheiro em jogo/recebido/perdido, tempos. */
function useConta(lista: Gar[], hoje: string, periodo: Periodo) {
  return useMemo(() => {
    const desde = periodo.de
    const abertas = lista.filter((g) => !FINAIS.includes(g.status))
    const fin = lista.filter((g) => FINAIS.includes(g.status) && dentro(diaBR(g.finalizadaEm || g.mexidaEm), periodo))
    const aprov = fin.filter((g) => g.status === 'aprovada'), rej = fin.filter((g) => g.status === 'rejeitada')
    const soma = (l: Gar[], f: (g: Gar) => number) => l.reduce((s, g) => s + f(g), 0)
    const tempos = fin.filter((g) => g.enviadaEm && g.finalizadaEm).map((g) => (Date.parse(g.finalizadaEm!) - Date.parse(g.enviadaEm!)) / 86_400_000).filter((x) => x >= 0)
    return {
      abertas, fin, aprov, rej, desde,
      emJogo: soma(abertas, (g) => g.esperado), recebido: soma(fin, (g) => g.pago), perdido: soma(rej, (g) => Math.max(0, g.esperado - g.pago)),
      taxa: aprov.length + rej.length ? aprov.length / (aprov.length + rej.length) : null,
      tempoFabrica: tempos.length ? tempos.reduce((s, x) => s + x, 0) / tempos.length : null,
      clienteReceber: soma(lista.filter((g) => g.cobranca.status === 'cobrada'), (g) => g.cobranca.valor),
      clienteRecuperado: soma(lista.filter((g) => g.cobranca.status === 'paga' && dentro(diaBR(g.finalizadaEm), periodo)), (g) => g.cobranca.valor),
    }
  }, [lista, periodo])
}

/** Janela com uma lista de garantias (cada linha abre a garantia no módulo). */
function Lista({ titulo, itens, hoje, onFechar, valor, rotuloValor, detalhe }: {
  titulo: string; itens: Gar[]; hoje: string; onFechar: () => void
  /** R$ de cada linha (padrão = esperado) e o nome dele no cabeçalho; `detalhe` = texto extra na linha. */
  valor?: (g: Gar) => number; rotuloValor?: string; detalhe?: (g: Gar) => string
}) {
  const [aberta, setAberta] = useState<Gar | null>(null)
  const v = valor || ((g: Gar) => g.esperado)
  // Esc fecha a lista (a janela da garantia por cima trata o próprio Esc)
  useEffect(() => {
    if (aberta) return
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [aberta, onFechar])
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="gx-fundo" onClick={onFechar}>
      <div className="gx-jan" onClick={(e) => e.stopPropagation()}>
        <div className="gx-jan-cab"><div><b>{titulo}</b><small>{itens.length} garantias · {brl(itens.reduce((s, g) => s + v(g), 0))} {rotuloValor || 'esperados'} · clique numa para ver tudo</small></div><button type="button" onClick={onFechar}><i className="fas fa-xmark" /></button></div>
        <div className="gx-jan-lista">
          {itens.map((g, i) => (
            <button type="button" key={g.id} onClick={() => setAberta(g)} className="gx-li" style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
              <span className="gx-st" style={{ background: corSt(g.status) }}>{STATUS_LABEL[g.status]}</span>
              <div><b>{g.numero} · {g.os}</b><small>{g.cliente || '—'} · {g.modelo || ''} · {g.tecnico}{g.montadora ? ` · ${g.montadora.nome}` : ''}{detalhe ? ` · ${detalhe(g)}` : ''}</small></div>
              <em>{dias(g.criadaEm, hoje)} d</em>
              <strong>{brl(v(g))}</strong>
            </button>
          ))}
          {!itens.length && <small style={{ color: MUDO, padding: 20, textAlign: 'center' }}>Nada aqui.</small>}
        </div>
      </div>
      {aberta && <JanelaGarantia g={aberta} hoje={hoje} onFechar={() => setAberta(null)} />}
    </div>,
    document.body,
  )
}

// ============================================================================
/** G1 — Funil: cada fase do processo com quantas garantias, quanto dinheiro e a mais antiga; no fim, o resultado. */
export function GarantiaFunil({ lista, hoje, periodo }: { lista: Gar[]; hoje: string; periodo: Periodo }) {
  const c = useConta(lista, hoje, periodo)
  const [ver, setVer] = useState<{ t: string; l: Gar[] } | null>(null)
  const fases = FASES.map((f) => ({ f, l: c.abertas.filter((g) => g.status === f) })).filter((x) => x.l.length)
  const max = Math.max(1, ...fases.map((x) => x.l.reduce((s, g) => s + g.esperado, 0)))
  return (
    <div className="gx-caixa">
      <Cab c={c} />
      <div className="gx-funil">
        {fases.map((x, i) => {
          const v = x.l.reduce((s, g) => s + g.esperado, 0), velha = Math.max(...x.l.map((g) => dias(g.criadaEm, hoje)))
          return (
            <button key={x.f} type="button" className="gx-fase" style={{ ...css(corSt(x.f)), animationDelay: `${i * 80}ms` }} onClick={() => setVer({ t: STATUS_LABEL[x.f], l: x.l })}>
              <small>{STATUS_LABEL[x.f]}</small>
              <b>{x.l.length}</b>
              <span>{brl(v)}</span>
              <i className="gx-fase-barra"><i style={{ width: `${(v / max) * 100}%` }} /></i>
              <em>mais antiga: {velha} dias</em>
              {i < fases.length - 1 && <u className="gx-seta"><i className="fas fa-chevron-right" /></u>}
            </button>
          )
        })}
        <div className="gx-fim">
          <button type="button" className="gx-fim-a" onClick={() => setVer({ t: 'Aprovadas no período', l: c.aprov })}><i className="fas fa-circle-check" /><b>{c.aprov.length}</b><span>aprovadas · {brl(c.recebido)}</span></button>
          <button type="button" className="gx-fim-r" onClick={() => setVer({ t: 'Rejeitadas no período', l: c.rej })}><i className="fas fa-circle-xmark" /><b>{c.rej.length}</b><span>rejeitadas · {brl(c.perdido)} perdidos</span></button>
        </div>
      </div>
      <p className="gx-leg">Da esquerda para a direita é o caminho da garantia; clique numa fase para ver as garantias dela. Aprovadas e rejeitadas contam só o período escolhido.</p>
      {ver && <Lista titulo={ver.t} itens={ver.l} hoje={hoje} onFechar={() => setVer(null)} />}
    </div>
  )
}

// ============================================================================
/** G2 — Placar do dinheiro: em jogo, recebido, perdido e o que o cliente deve; taxa de aprovação e tempo na fábrica; por montadora. */
export function GarantiaPlacar({ lista, hoje, periodo }: { lista: Gar[]; hoje: string; periodo: Periodo }) {
  const c = useConta(lista, hoje, periodo)
  const [ver, setVer] = useState<{ t: string; l: Gar[]; valor?: (g: Gar) => number; rotuloValor?: string; detalhe?: (g: Gar) => string } | null>(null)
  const destinos = useMemo(() => agruparPorDestino(c.rej), [c.rej])
  const porMont = useMemo(() => {
    const m = new Map<string, { nome: string; cor: string; ap: number; rj: number; ab: number; jogo: number }>()
    for (const g of [...c.abertas, ...c.fin]) {
      const k = g.montadora?.nome || 'Sem montadora'
      const x = m.get(k) || { nome: k, cor: g.montadora?.cor || '#64748b', ap: 0, rj: 0, ab: 0, jogo: 0 }
      if (g.status === 'aprovada') x.ap++; else if (g.status === 'rejeitada') x.rj++; else { x.ab++; x.jogo += g.esperado }
      m.set(k, x)
    }
    return [...m.values()].sort((a, b) => b.jogo - a.jogo)
  }, [c])
  const maxM = Math.max(1, ...porMont.map((m) => m.ap + m.rj + m.ab))
  const tiles = [
    { r: 'Em jogo (abertas)', v: c.emJogo, sub: `${c.abertas.length} garantias esperando`, cor: '#2563eb', ic: 'fa-hourglass-half', l: c.abertas },
    { r: 'Recebido da fábrica', v: c.recebido, sub: `${c.aprov.length} aprovadas no período`, cor: '#047857', ic: 'fa-sack-dollar', l: c.aprov },
    { r: 'Perdido (rejeitadas)', v: c.perdido, sub: `${c.rej.length} rejeitadas no período`, cor: '#dc2626', ic: 'fa-circle-xmark', l: c.rej },
    { r: 'Cliente deve (rejeitadas cobradas)', v: c.clienteReceber, sub: `recuperado no período: ${brl(c.clienteRecuperado)}`, cor: '#d97706', ic: 'fa-hand-holding-dollar', l: lista.filter((g) => g.cobranca.status === 'cobrada') },
  ]
  const taxa = c.taxa == null ? null : Math.round(c.taxa * 100)
  const pc = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null)
  const respondidas = c.fin.filter((g) => g.enviadaEm && g.finalizadaEm)
  const rapidas = respondidas.filter((g) => (Date.parse(g.finalizadaEm!) - Date.parse(g.enviadaEm!)) / 86_400_000 <= 30)
  const naFabrica = c.abertas.filter((g) => g.enviadaEm)
  const atrasadas = naFabrica.filter((g) => dias(g.enviadaEm, hoje) > 30)
  const pedidoFin = c.fin.reduce((s2, g) => s2 + g.esperado, 0)
  const rejNossa = c.rej.filter((g) => g.recusadoPor === 'garantista').length
  const voltouCliente = c.rej.reduce((s2, g) => s2 + (['paga', 'cobrada'].includes(g.cobranca.status) ? g.cobranca.valor : 0), 0)
  const pecasJogo = c.abertas.reduce((s2, g) => s2 + g.valorPecas, 0)
  const pT = taxa, pV = pc(c.recebido, pedidoFin), pR = pc(rapidas.length, respondidas.length), pA = pc(atrasadas.length, naFabrica.length), pC = pc(voltouCliente, c.perdido), pN = pc(rejNossa, c.rej.length), pP = pc(pecasJogo, c.emJogo)
  // clicar no anel abre as garantias por trás dele (José, 28/10/2026)
  const diasResp = (g: Gar) => Math.round((Date.parse(g.finalizadaEm!) - Date.parse(g.enviadaEm!)) / 86_400_000)
  type Ver = { t: string; l: Gar[]; valor?: (g: Gar) => number; rotuloValor?: string; detalhe?: (g: Gar) => string }
  const aneis: { rot: string; pct: number | null; cor: string; txt: string; ver: Ver }[] = [
    { rot: 'Aprovadas', pct: pT, cor: '#047857', txt: `De cada 10 garantias que a fábrica respondeu, ${Math.round((pT ?? 0) / 10)} foram aprovadas${c.tempoFabrica != null ? `; ela leva em média ${Math.round(c.tempoFabrica)} dias` : ''}.`, ver: { t: 'Respondidas pela fábrica no período', l: [...c.aprov, ...c.rej], detalhe: (g) => STATUS_LABEL[g.status] } },
    { rot: 'Do valor pedido, recebemos', pct: pV, cor: '#2563eb', txt: `De cada R$ 100 pedidos nas garantias finalizadas, a fábrica pagou R$ ${pV ?? 0} (${brl(c.recebido)} de ${brl(pedidoFin)}).`, ver: { t: 'Finalizadas: quanto a fábrica pagou', l: c.fin, valor: (g) => g.pago, rotuloValor: 'recebidos', detalhe: (g) => `pedido ${brl(g.esperado)}` } },
    { rot: 'Respondidas em até 30 dias', pct: pR, cor: '#0891b2', txt: `${rapidas.length} de ${respondidas.length} garantias tiveram resposta da fábrica em até 30 dias depois de enviadas.`, ver: { t: 'Tempo de resposta da fábrica', l: [...respondidas].sort((a, b) => diasResp(b) - diasResp(a)), detalhe: (g) => `respondida em ${diasResp(g)} dias` } },
    { rot: 'Na fábrica há mais de 30 dias', pct: pA, cor: '#dc2626', txt: `${atrasadas.length} das ${naFabrica.length} garantias que estão na fábrica passaram de 30 dias sem resposta: cobrar a montadora.`, ver: { t: 'Na fábrica há mais de 30 dias: cobrar a montadora', l: [...atrasadas].sort((a, b) => dias(b.enviadaEm, hoje) - dias(a.enviadaEm, hoje)), detalhe: (g) => `na fábrica há ${dias(g.enviadaEm, hoje)} dias` } },
    { rot: 'Rejeitadas que voltaram do cliente', pct: pC, cor: '#d97706', txt: `Do que a fábrica negou (${brl(c.perdido)}), ${brl(voltouCliente)} foi cobrado do cliente (pago ou a receber).`, ver: { t: 'Rejeitadas: o que foi cobrado do cliente', l: c.rej, valor: (g) => (['paga', 'cobrada'].includes(g.cobranca.status) ? g.cobranca.valor : 0), rotuloValor: 'cobrados do cliente', detalhe: (g) => ROTULO_COBRANCA[g.cobranca.status] || g.cobranca.status } },
    { rot: 'Rejeitadas por erro nosso', pct: pN, cor: '#7c3aed', txt: `${rejNossa} das ${c.rej.length} rejeitadas foram barradas pelo nosso garantista, antes de ir para a fábrica; as outras a fábrica negou.`, ver: { t: 'Rejeitadas: quem barrou', l: [...c.rej].sort((a, b) => Number(b.recusadoPor === 'garantista') - Number(a.recusadoPor === 'garantista')), detalhe: (g) => (g.recusadoPor === 'garantista' ? 'barrada pelo nosso garantista' : 'negada pela fábrica') } },
    { rot: 'Em jogo que é peça', pct: pP, cor: '#ea580c', txt: `Das garantias abertas (${brl(c.emJogo)}), ${brl(pecasJogo)} são peças; o resto é hora e km do serviço.`, ver: { t: 'Abertas: quanto é peça', l: [...c.abertas].sort((a, b) => b.valorPecas - a.valorPecas), valor: (g) => g.valorPecas, rotuloValor: 'em peças', detalhe: (g) => `total ${brl(g.esperado)}` } },
  ]
  return (
    <div className="gx-caixa">
      <Cab c={c} />
      <div className="gx-tiles">
        {tiles.map((t, i) => (
          <button key={t.r} type="button" className="gx-tile" style={{ ...css(t.cor), animationDelay: `${i * 70}ms` }} onClick={() => setVer({ t: t.r, l: t.l })}>
            <small><i className={`fas ${t.ic} gx-ic`} />{t.r}</small><b><Numero valor={t.v} formato={brl} /></b><span>{t.sub}</span>
          </button>
        ))}
      </div>
      <div className="gx-aneis">
        {aneis.map((x, i) => (
          <button type="button" key={x.rot} className="gx-anel2 abre" style={{ ...css(x.cor), animationDelay: `${i * 90}ms` }} title={`${x.txt} Clique para ver as garantias.`} onClick={() => setVer(x.ver)}>
            <AnelPct pct={x.pct} cor={x.cor} atraso={i * 90} />
            <div><b>{x.rot}</b><p>{x.pct == null ? 'sem dados no período' : x.txt}</p><u className="gx-anel-ver">ver as {x.ver.l.length} garantias <i className="fas fa-arrow-right" /></u></div>
          </button>
        ))}
      </div>
      <DestinoRejeitadas d={destinos} rotulo={periodo.rotulo} onVer={(t, l) => setVer({ t, l, valor: valorNoDestino, rotuloValor: 'no destino', detalhe: (g) => ROTULO_COBRANCA[g.cobranca.status] || g.cobranca.status })} />
      <div className="gx-duo gx-so-mont">
        <div className="gx-mont">
          <small>Por montadora (abertas + finalizadas no período)</small>
          {porMont.map((m, i) => {
            const tot = m.ap + m.rj + m.ab
            return (
              <button type="button" key={m.nome} className="gx-mont-l" style={{ animationDelay: `${i * 60}ms` }} onClick={() => setVer({ t: m.nome, l: [...c.abertas, ...c.fin].filter((g) => (g.montadora?.nome || 'Sem montadora') === m.nome) })} title="ver as garantias desta marca">
                <b style={{ color: m.cor }}>{m.nome}</b>
                <div style={{ width: `${(tot / maxM) * 100}%` }}><i style={{ flexGrow: m.ap, background: '#047857' }} title={`${m.ap} aprovadas`} /><i style={{ flexGrow: m.rj, background: '#dc2626' }} title={`${m.rj} rejeitadas`} /><i style={{ flexGrow: m.ab, background: '#93c5fd' }} title={`${m.ab} abertas`} /></div>
                <span>{m.ap} ✓ · {m.rj} ✗ · {m.ab} abertas · {brl(m.jogo)} em jogo <u>ver garantias</u></span>
              </button>
            )
          })}
        </div>
      </div>
      {ver && <Lista titulo={ver.t} itens={ver.l} hoje={hoje} onFechar={() => setVer(null)} valor={ver.valor} rotuloValor={ver.rotuloValor} detalhe={ver.detalhe} />}
    </div>
  )
}

/** O que aconteceu com as rejeitadas do período (José, 22/10/2026): cobrado do cliente (pago / a receber),
 *  ficou como despesa da loja ou sem definição — barra empilhada + legenda, cada pedaço abre as garantias. */
function DestinoRejeitadas({ d, rotulo, onVer }: { d: ReturnType<typeof agruparPorDestino<Gar>>; rotulo: string; onVer: (t: string, l: Gar[]) => void }) {
  const [foco, setFoco] = useState<string | null>(null)
  const cobrado = d.fatias.filter((f) => f.k === 'pago' || f.k === 'a_receber')
  const nCob = cobrado.reduce((s, f) => s + f.n, 0), vCob = cobrado.reduce((s, f) => s + f.valor, 0)
  return (
    <div className="gx-dest">
      <div className="gx-dest-cab">
        <span className="gx-ic" style={css('#dc2626')}><i className="fas fa-circle-xmark" /></span>
        <div><b>O que aconteceu com as rejeitadas</b><small>{d.n ? `${d.n} rejeitada${d.n > 1 ? 's' : ''} em ${rotulo} · ${brl(d.total)}` : `nenhuma rejeitada em ${rotulo}`}</small></div>
      </div>
      {d.n > 0 && <>
        <div className="gx-dest-barra" role="img" aria-label="rejeitadas por destino">
          {d.fatias.filter((f) => f.n > 0).map((f) => (
            <button key={f.k} type="button" title={`${f.rotulo}: ${f.n} · ${brl(f.valor)}`} className={foco && foco !== f.k ? 'apaga' : ''}
              style={{ flexGrow: d.total > 0 ? Math.max(f.valor, d.total * 0.04) : f.n, background: f.cor }}
              onMouseEnter={() => setFoco(f.k)} onMouseLeave={() => setFoco(null)} onClick={() => onVer(f.rotulo, f.itens)} />
          ))}
        </div>
        <div className="gx-dest-leg">
          {d.fatias.map((f) => (
            <button key={f.k} type="button" disabled={!f.n} className={foco && foco !== f.k ? 'apaga' : ''} onMouseEnter={() => setFoco(f.k)} onMouseLeave={() => setFoco(null)} onClick={() => onVer(f.rotulo, f.itens)}>
              <i style={{ background: f.cor }} />
              <span><b>{f.rotulo}</b><small>{f.sub}</small></span>
              <em>{f.n}</em>
              <strong>{brl(f.valor)}</strong>
            </button>
          ))}
        </div>
        <p className="gx-dest-nota">
          Voltou do cliente: {nCob} de {d.n} ({brl(vCob)}).
          {d.naoCobrado > 0 && <> Nas cobradas, {brl(d.naoCobrado)} do que a fábrica negou ficou de fora da cobrança.</>}
          {' '}Vem da cobrança ao cliente que o garantista marca no módulo Garantias.
        </p>
      </>}
    </div>
  )
}

// ============================================================================
/** G3 — O que fazer agora: as garantias que precisam de alguém, agrupadas pelo tipo de ação. */
export function GarantiaAcoes({ lista, hoje, periodo }: { lista: Gar[]; hoje: string; periodo: Periodo }) {
  const c = useConta(lista, hoje, periodo)
  const grupos = [
    { k: 'tec', t: 'Com o técnico (B.O.)', d: 'o garantista devolveu: falta o técnico completar', ic: 'fa-user-gear', cor: '#dc2626', l: c.abertas.filter((g) => g.status === 'bo_tecnico') },
    { k: 'info', t: 'Fábrica pediu informação', d: 'responder a fábrica para a garantia andar', ic: 'fa-circle-question', cor: '#d97706', l: c.abertas.filter((g) => g.status === 'info_pendente' || g.pendencias > 0) },
    { k: 'prep', t: 'Ainda não foi para a fábrica', d: 'solicitada ou em análise do garantista', ic: 'fa-file-pen', cor: '#2563eb', l: c.abertas.filter((g) => g.status === 'aberta' || g.status === 'em_analise') },
    { k: 'fab', t: 'Na fábrica há mais de 30 dias', d: 'vale cobrar retorno da montadora', ic: 'fa-industry', cor: '#7c3aed', l: c.abertas.filter((g) => ['enviada', 'ressarcimento_fabrica'].includes(g.status) && dias(g.enviadaEm, hoje) > 30) },
    { k: 'serv', t: 'Peças aprovadas, falta o serviço', d: 'fazer o serviço para pedir o ressarcimento', ic: 'fa-screwdriver-wrench', cor: '#0891b2', l: c.abertas.filter((g) => g.status === 'aguardando_servico') },
    { k: 'dev', t: 'Devolver peças à fábrica', d: 'aprovada com devolução pendente', ic: 'fa-box', cor: '#ea580c', l: lista.filter((g) => g.devolucao.status === 'pendente') },
    { k: 'cob', t: 'Cobrar o cliente', d: 'rejeitada: cobrança pendente ou vencida', ic: 'fa-hand-holding-dollar', cor: '#b91c1c', l: lista.filter((g) => g.cobranca.status === 'pendente' || (g.cobranca.status === 'cobrada' && g.cobranca.vencimento && g.cobranca.vencimento < hoje)) },
  ].filter((x) => x.l.length)
  const [aberto, setAberto] = useState<string | null>(grupos[0]?.k || null)
  return (
    <div className="gx-caixa">
      <Cab c={c} />
      {!grupos.length && <p className="gx-leg">Nada pendente agora. 🎉</p>}
      <div className="gx-acoes">
        {grupos.map((g, i) => {
          const on = aberto === g.k
          return (
            <div key={g.k} className={`gx-ac ${on ? 'on' : ''}`} style={{ ...css(g.cor), animationDelay: `${i * 60}ms` }}>
              <button type="button" className="gx-ac-cab" onClick={() => setAberto(on ? null : g.k)}>
                <span className="gx-ac-ic"><i className={`fas ${g.ic}`} /></span>
                <div><b>{g.t}</b><small>{g.d}</small></div>
                <em>{g.l.length}</em><strong>{brl(g.l.reduce((s, x) => s + (g.k === 'cob' ? x.cobranca.valor || x.esperado : x.esperado), 0))}</strong>
                <i className="fas fa-chevron-down gx-ac-seta" />
              </button>
              {on && (
                <div className="gx-ac-lista">
                  {[...g.l].sort((a, b) => dias(b.criadaEm, hoje) - dias(a.criadaEm, hoje)).map((x, k) => (
                    <a key={x.id} href={`/garantias?id=${x.id}`} target="_blank" rel="noreferrer" style={{ animationDelay: `${k * 30}ms` }}>
                      <em>{g.k === 'fab' ? dias(x.enviadaEm, hoje) : dias(x.criadaEm, hoje)} d</em>
                      <b>{x.numero} · {x.os}</b><span>{x.cliente || '—'} · {x.tecnico}{x.montadora ? ` · ${x.montadora.nome}` : ''}</span>
                      <strong>{brl(g.k === 'cob' ? x.cobranca.valor || x.esperado : x.esperado)}</strong>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================
/** G4 — Linha do tempo: cada garantia aberta é uma barra; azul = preparando aqui, roxo = esperando a fábrica. */
export function GarantiaTempo({ lista, hoje, periodo }: { lista: Gar[]; hoje: string; periodo: Periodo }) {
  const c = useConta(lista, hoje, periodo)
  const [foco, setFoco] = useState<string | null>(null)
  const linhas = c.abertas.map((g) => ({ g, total: dias(g.criadaEm, hoje), prep: g.enviadaEm ? Math.max(0, Math.round((Date.parse(g.enviadaEm) - Date.parse(g.criadaEm)) / 86_400_000)) : dias(g.criadaEm, hoje) }))
    .sort((a, b) => b.total - a.total).slice(0, 25)
  const max = Math.max(30, ...linhas.map((x) => x.total))
  const marcas = [30, 60, 90, 180].filter((m) => m < max)
  return (
    <div className="gx-caixa">
      <Cab c={c} />
      <div className="gx-leg"><span><i style={{ background: '#2563eb' }} /> preparando aqui (até enviar à fábrica)</span><span><i style={{ background: '#7c3aed' }} /> esperando a fábrica</span><span>as 25 abertas mais antigas · clique abre a garantia</span></div>
      <div className="gx-tempo">
        {marcas.map((m) => <i key={m} className="gx-marca" style={{ left: `calc(220px + (100% - 300px) * ${m / max})` }}><span>{m} d</span></i>)}
        {linhas.map(({ g, total, prep }, i) => (
          <a key={g.id} href={`/garantias?id=${g.id}`} target="_blank" rel="noreferrer" className={`gx-tl ${foco && foco !== g.id ? 'apaga' : ''}`} onMouseEnter={() => setFoco(g.id)} onMouseLeave={() => setFoco(null)} style={{ animationDelay: `${i * 30}ms` }}>
            <span className="gx-tl-n"><b>{g.numero}</b><small>{g.cliente || g.os}</small></span>
            <span className="gx-tl-barra" style={{ width: `calc((100% - 300px) * ${total / max})` }}>
              <i style={{ width: `${total ? (Math.min(prep, total) / total) * 100 : 100}%`, background: '#2563eb' }} />
              <i style={{ flex: 1, background: '#7c3aed' }} />
            </span>
            <em>{total} d · {STATUS_LABEL[g.status]}</em>
          </a>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
/** G5 — Cartões por garantia aberta, estilo mural: fase, dias, montadora, valor e o que falta. */
export function GarantiaMural({ lista, hoje, periodo }: { lista: Gar[]; hoje: string; periodo: Periodo }) {
  const c = useConta(lista, hoje, periodo)
  const [fase, setFase] = useState<GarantiaStatus | 'todas'>('todas')
  const fases = FASES.filter((f) => c.abertas.some((g) => g.status === f))
  const itens = c.abertas.filter((g) => fase === 'todas' || g.status === fase).sort((a, b) => b.esperado - a.esperado)
  return (
    <div className="gx-caixa">
      <Cab c={c} />
      <div className="gx-chips">
        <button type="button" className={fase === 'todas' ? 'on' : ''} onClick={() => setFase('todas')}>Todas <em>{c.abertas.length}</em></button>
        {fases.map((f) => <button key={f} type="button" className={fase === f ? 'on' : ''} style={css(corSt(f))} onClick={() => setFase(f)}><i />{STATUS_LABEL[f]} <em>{c.abertas.filter((g) => g.status === f).length}</em></button>)}
      </div>
      <div className="gx-mural" key={fase}>
        {itens.map((g, i) => {
          const d = dias(g.criadaEm, hoje)
          return (
            <a key={g.id} href={`/garantias?id=${g.id}`} target="_blank" rel="noreferrer" className="gx-mc" style={{ ...css(corSt(g.status)), animationDelay: `${Math.min(i, 24) * 35}ms` }}>
              <div className="gx-mc-top"><span className="gx-st" style={{ background: corSt(g.status) }}>{STATUS_LABEL[g.status]}</span><em className={d > 60 ? 'velha' : ''}>{d} dias</em></div>
              <b>{g.cliente || '—'}</b>
              <small>{g.numero} · {g.os} · {g.modelo || 'modelo?'}</small>
              <div className="gx-mc-val"><strong>{brl(g.esperado)}</strong><span>peças {brl(g.valorPecas)} · serviço {brl(g.valorServico)}</span></div>
              <div className="gx-mc-pe">
                {g.montadora && <span style={{ color: g.montadora.cor || MUDO }}><i className="fas fa-industry" /> {g.montadora.nome}</span>}
                <span><i className="fas fa-user-gear" /> {g.tecnico}</span>
                {g.pendencias > 0 && <span className="pend"><i className="fas fa-circle-exclamation" /> {g.pendencias} pendência(s)</span>}
              </div>
            </a>
          )
        })}
      </div>
    </div>
  )
}

/** Janela de uma garantia (José, 22/10/2026: "mais informações lá do módulo de garantia quando a gente clicar em
 *  um caso, mostrando as fotos e tudo que está preenchido lá"): situação, destino da rejeição, valores, datas,
 *  checklist, relatos, peças, pendências, fotos/anexos (tela cheia com setas e Esc), histórico e a OS em PDF.
 *  Lê /api/mecanicos/garantias/[id] (só leitura, mesma guarda do painel). */
function JanelaGarantia({ g, hoje, onFechar }: { g: Gar; hoje: string; onFechar: () => void }) {
  const [det, setDet] = useState<GarantiaDetalhe | null>(null)
  const [erro, setErro] = useState('')
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null)
  const [fotoIdx, setFotoIdx] = useState<number | null>(null)
  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const r2 = await fetch(`/api/mecanicos/garantias/${g.id}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r2.json()
        if (!ativo) return
        if (!r2.ok) setErro(j.error || `Erro ${r2.status}`); else setDet(j.garantia || j)
      } catch (e) { if (ativo) setErro(e instanceof Error ? e.message : 'Falha') }
    })()
    return () => { ativo = false }
  }, [g.id])
  const ehImg = (a: { url: string; content_type: string | null; nome_arquivo: string | null }) => /^image\//.test(a.content_type || '') || /\.(jpe?g|png|webp|gif|heic)$/i.test(a.nome_arquivo || a.url)
  const ehPdf = (a: { url: string; content_type: string | null; nome_arquivo: string | null }) => /pdf/i.test(a.content_type || '') || /\.pdf$/i.test(a.nome_arquivo || a.url)
  const fotos = useMemo(() => (det?.anexos || []).filter(ehImg), [det])
  // teclado: na foto, setas andam e Esc fecha a foto; sem foto, Esc fecha a janela
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (doc) return
      if (fotoIdx != null) {
        if (e.key === 'Escape') setFotoIdx(null)
        else if (e.key === 'ArrowRight') setFotoIdx((i) => (i == null ? i : (i + 1) % fotos.length))
        else if (e.key === 'ArrowLeft') setFotoIdx((i) => (i == null ? i : (i - 1 + fotos.length) % fotos.length))
        else return
        e.preventDefault()
      } else if (e.key === 'Escape') onFechar()
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [fotoIdx, fotos.length, doc, onFechar])
  const cor = corSt(g.status)
  const CAT: Record<string, string> = { tecnico: 'do técnico', garantista: 'do garantista', foto_garantista: 'foto do garantista', envio_fabrica: 'enviado à fábrica', retorno_fabrica: 'retorno da fábrica', pendencia_pedido: 'pedido de pendência', pendencia_resposta: 'resposta de pendência', nf_venda: 'NF de venda', relatorio_at: 'relatório de assistência', devolucao_pecas: 'devolução de peças', guarda_pecas: 'onde a peça está guardada', descarte_pecas: 'descarte das peças' }
  const dt = (s: string | null | undefined) => { const d = diaBR(s); return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : null }
  const num = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
  const rejeitada = g.status === 'rejeitada'
  const dest = rejeitada ? DESTINOS.find((x) => x.k === destinoRejeicao(det?.cobranca_status ?? g.cobranca.status))! : null
  const pecasAprov = (det?.pecas || []).filter((x) => x.resultado === 'aprovada').reduce((s, x) => s + num(x.quantidade) * num(x.preco_unitario), 0)
  const datas: [string, string | null][] = [
    ['Aberta', dt(g.criadaEm)], ['Enviada à fábrica', dt(det?.enviada_fabrica_em ?? g.enviadaEm)], ['Peças voltaram', dt(det?.pecas_retorno_em)],
    ['Ressarcimento pedido', dt(det?.ressarcimento_enviado_em)], ['Resposta / fechada', dt(det?.finalizada_em ?? g.finalizadaEm)],
  ]
  const check = (det?.checklist_snapshot || []).filter((c) => c.tipo !== 'file')
  const resp = (det?.checklist_respostas || {}) as Record<string, unknown>
  const textoResp = (v: unknown) => (v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Sim' : 'Não') : Array.isArray(v) ? v.join(', ') : String(v))
  if (typeof document === 'undefined') return null
  const foto = fotoIdx != null ? fotos[fotoIdx] : null
  return createPortal(
    <div className="gj-fundo" onClick={onFechar}>
      <div className="gj" style={css(cor)} onClick={(e) => e.stopPropagation()}>
        <div className="gj-cab">
          <span className="gx-st" style={{ background: cor }}>{STATUS_LABEL[g.status]}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3>{g.numero}{g.numeroExterno ? <small> · nº fábrica {g.numeroExterno}</small> : null}</h3>
            <span>{g.cliente || '—'} · {g.modelo || 'modelo?'}{g.chassis ? ` · chassi ${g.chassis}` : ''} · {g.montadora?.nome || 'sem montadora'} · OS {g.os} · aberta há {dias(g.criadaEm, hoje)} dias</span>
          </div>
          <strong>{brl(g.esperado)}</strong>
          <button type="button" className="gj-x" onClick={onFechar} title="Fechar (Esc)"><i className="fas fa-xmark" /></button>
        </div>
        <div className="gj-corpo">
          {dest && (
            <div className="gj-dest" style={css(dest.cor)}>
              <span className="gx-ic"><i className={`fas ${dest.k === 'despesa' ? 'fa-store' : dest.k === 'sem_definicao' ? 'fa-circle-question' : 'fa-hand-holding-dollar'}`} /></span>
              <div>
                <b>{dest.rotulo}</b>
                <small>Cobrança ao cliente: {ROTULO_COBRANCA[det?.cobranca_status ?? g.cobranca.status] || g.cobranca.status}
                  {num(det?.cobranca_valor_total ?? g.cobranca.valor) > 0 ? ` · ${brl(num(det?.cobranca_valor_total ?? g.cobranca.valor))}` : ''}
                  {det?.cobranca_vencimento ? ` · vence ${dt(det.cobranca_vencimento)}` : ''}
                  {det?.cobranca_cobrada_em ? ` · cobrada em ${dt(det.cobranca_cobrada_em)}` : ''}
                  {det?.cobranca_pago_em ? ` · paga em ${dt(det.cobranca_pago_em)}` : ''}
                  {det?.cobranca_baixada_em ? ` · baixada em ${dt(det.cobranca_baixada_em)}` : ''}</small>
                {det?.cobranca_obs && <p>{det.cobranca_obs}</p>}
              </div>
              <strong>{brl(valorNoDestino(g))}</strong>
            </div>
          )}
          {g.motivo && <div className="gj-motivo"><i className="fas fa-circle-xmark" /> Motivo da recusa{g.recusadoPor ? ` (${g.recusadoPor === 'garantista' ? 'nosso garantista' : 'fábrica'})` : ''}: {g.motivo}</div>}
          <div className="gj-vals">
            <div><small>Pedido à fábrica</small><b>{brl(g.esperado)}</b><span>peças + serviço</span></div>
            <div><small>Peças</small><b>{brl(g.valorPecas)}</b>{det && <span>aprovadas {brl(pecasAprov)}</span>}</div>
            <div><small>Serviço (hora + km)</small><b>{brl(g.valorServico)}</b><span>{g.horas} h · {g.km} km</span></div>
            <div><small>Pago pela fábrica</small><b style={{ color: g.pago > 0 ? '#047857' : undefined }}>{brl(g.pago)}</b>
              {det && (det.valor_pago_pecas != null || det.valor_pago_horas != null || det.valor_pago_km != null) && <span>peças {brl(num(det.valor_pago_pecas))} · MO {brl(num(det.valor_pago_horas))} · km {brl(num(det.valor_pago_km))}</span>}</div>
          </div>
          <div className="gj-datas">
            {datas.map(([r, d]) => <span key={r} className={d ? '' : 'vazio'}><small>{r}</small>{d || '—'}</span>)}
          </div>
          <div className="gj-info">
            <span><small>Técnico</small>{g.tecnico || '—'}{det ? ` · ${num(det.tecnico_horas)} h · ${num(det.tecnico_km)} km` : ''}</span>
            <span><small>Garantista</small>{g.garantista || '—'}{det && (det.garantista_horas != null || det.garantista_km != null) ? ` · ${num(det.garantista_horas)} h · ${num(det.garantista_km)} km` : ''}</span>
            {det?.localizacao && <span><small>Peça guardada em</small>{det.localizacao}</span>}
            {g.devolucao.status !== 'nao_aplicavel' && <span><small>Devolução de peças</small>{g.devolucao.status}{g.devolucao.prazo ? ` até ${dt(g.devolucao.prazo)}` : ''}{det?.devolucao_nf ? ` · NF ${det.devolucao_nf}` : ''}</span>}
            {det?.guarda_status && det.guarda_status !== 'nao_aplicavel' && <span><small>Guarda de peças</small>{det.guarda_status}{det.guarda_prazo ? ` · pode descartar a partir de ${dt(det.guarda_prazo)}` : ''}</span>}
            {!rejeitada && g.cobranca.status !== 'nao_aplicavel' && <span><small>Cobrança ao cliente</small>{ROTULO_COBRANCA[g.cobranca.status] || g.cobranca.status}{g.cobranca.valor ? ` · ${brl(g.cobranca.valor)}` : ''}</span>}
          </div>
          {!det && !erro && <div className="gj-carr"><i className="fas fa-circle-notch fa-spin" /> carregando o pedido…</div>}
          {erro && <div className="gj-erro">{erro}</div>}
          {det && <>
            {(det.tecnico_obs || det.garantista_obs) && (
              <div className="gj-txt">
                {det.tecnico_obs && <div><small>Relato do técnico</small><p>{det.tecnico_obs}</p></div>}
                {det.garantista_obs && <div><small>Observação do garantista</small><p>{det.garantista_obs}</p></div>}
              </div>
            )}
            {check.length > 0 && (
              <div className="gj-bloco">
                <b><i className="fas fa-list-check" /> Checklist da montadora</b>
                <div className="gj-check">
                  {check.map((c) => c.tipo === 'secao'
                    ? <em key={c.id}>{c.label}</em>
                    : <span key={c.id}><small>{c.label}</small>{textoResp(resp[c.id])}</span>)}
                </div>
              </div>
            )}
            <div className="gj-bloco">
              <b><i className="fas fa-gears" /> Peças pedidas ({det.pecas.length})</b>
              {det.pecas.length ? det.pecas.map((x) => (
                <div key={x.id} className="gj-peca"><code>{x.cod_produto || '—'}</code><span>{x.descricao}</span><small>{x.quantidade} × {brl(Number(x.preco_unitario) || 0)}</small><em className={x.resultado}>{x.resultado}</em><b>{brl((Number(x.quantidade) || 0) * (Number(x.preco_unitario) || 0))}</b></div>
              )) : <small className="gj-nada">só mão de obra e deslocamento</small>}
            </div>
            {det.pendencias.length > 0 && (
              <div className="gj-bloco">
                <b><i className="fas fa-circle-question" /> Pendências ({det.pendencias.length})</b>
                {det.pendencias.map((x) => <div key={x.id} className={`gj-pend ${x.status}`}><em>{x.status === 'aberta' ? 'aberta' : 'respondida'}</em><span>{x.descricao}{x.resposta_texto ? <small> → {x.resposta_texto}</small> : null}</span></div>)}
              </div>
            )}
            <div className="gj-bloco">
              <b><i className="fas fa-camera" /> Fotos e anexos ({det.anexos.length})</b>
              {det.anexos.length ? (
                <div className="gj-anexos">
                  {det.anexos.map((a) => ehImg(a)
                    ? <button key={a.id} type="button" className="gj-foto" onClick={() => setFotoIdx(fotos.indexOf(a))} title={a.nome_arquivo || ''}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={a.url} alt="" loading="lazy" /><small>{CAT[a.categoria] || a.categoria}</small></button>
                    : ehPdf(a)
                      ? <button key={a.id} type="button" className="gj-arq" onClick={() => setDoc({ titulo: a.nome_arquivo || 'Anexo', url: a.url, nome: a.nome_arquivo || 'anexo' })}><i className="fas fa-file-pdf" /><span>{a.nome_arquivo || 'arquivo'}</span><small>{CAT[a.categoria] || a.categoria}</small></button>
                      : <a key={a.id} className="gj-arq" href={a.url} target="_blank" rel="noreferrer"><i className="fas fa-file-arrow-down" style={{ color: '#2563eb' }} /><span>{a.nome_arquivo || 'arquivo'}</span><small>{CAT[a.categoria] || a.categoria}</small></a>)}
                </div>
              ) : <small className="gj-nada">nenhum anexo</small>}
            </div>
            {det.eventos.length > 0 && (
              <div className="gj-bloco">
                <b><i className="fas fa-clock-rotate-left" /> Histórico</b>
                <div className="gj-hist">{det.eventos.slice(0, 25).map((e) => <div key={e.id}><em>{dt(e.created_at)?.slice(0, 5)}</em><span>{e.status_novo ? `→ ${STATUS_LABEL[e.status_novo as GarantiaStatus] || e.status_novo}` : e.tipo}{e.detalhe ? ` · ${e.detalhe}` : ''}</span><small>{e.ator || ''}</small></div>)}</div>
              </div>
            )}
          </>}
        </div>
        <div className="gj-rodape">
          <button type="button" onClick={() => setDoc({ titulo: `${g.os} · ${g.cliente || ''}`, url: `/api/pos/ordens/${encodeURIComponent(g.os)}/print`, nome: g.os })}><i className="fas fa-file-lines" /> Ver a OS</button>
          {det?.retorno_fabrica_url && <a href={det.retorno_fabrica_url} target="_blank" rel="noreferrer"><i className="fas fa-industry" /> Retorno da fábrica</a>}
          <a href={`/garantias?id=${g.id}`} target="_blank" rel="noreferrer"><i className="fas fa-arrow-up-right-from-square" /> Abrir no módulo Garantias</a>
        </div>
      </div>
      {foto && (
        <div className="gj-zoom" onClick={(e) => { e.stopPropagation(); setFotoIdx(null) }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={foto.url} alt="" onClick={(e) => e.stopPropagation()} />
          <span className="gj-zoom-leg">{fotoIdx! + 1} de {fotos.length} · {CAT[foto.categoria] || foto.categoria}{foto.nome_arquivo ? ` · ${foto.nome_arquivo}` : ''}</span>
          <button type="button" className="gj-zoom-x" onClick={(e) => { e.stopPropagation(); setFotoIdx(null) }} title="Fechar (Esc)"><i className="fas fa-xmark" /></button>
          {fotos.length > 1 && <>
            <button type="button" className="gj-zoom-s esq" onClick={(e) => { e.stopPropagation(); setFotoIdx((fotoIdx! - 1 + fotos.length) % fotos.length) }} title="anterior (←)"><i className="fas fa-chevron-left" /></button>
            <button type="button" className="gj-zoom-s dir" onClick={(e) => { e.stopPropagation(); setFotoIdx((fotoIdx! + 1) % fotos.length) }} title="seguinte (→)"><i className="fas fa-chevron-right" /></button>
          </>}
        </div>
      )}
      {doc && <div className="gj-doc" onClick={(e) => e.stopPropagation()}><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>}
    </div>,
    document.body,
  )
}

/** Anel de % com o número subindo. */
function AnelPct({ pct, cor, atraso }: { pct: number | null; cor: string; atraso: number }) {
  const v = Math.max(0, Math.min(100, pct ?? 0))
  return (
    <span className="gx-ap">
      <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="50" className="f" style={{ stroke: `color-mix(in srgb, ${cor} 14%, transparent)` }} /><circle cx="60" cy="60" r="50" className="v" style={{ stroke: cor, strokeDasharray: `${v * 3.1416} 314.16`, animationDelay: `${atraso}ms` }} /></svg>
      <b style={{ color: cor }}><Numero valor={v} formato={(x) => (pct == null ? '—' : `${Math.round(x)}%`)} /></b>
    </span>
  )
}

/** Garantias no Painel (G2 escolhida na página de teste, 19/10): Placar com o período das finalizadas. */
export function GarantiasNoPainel() {
  const { dados, erro } = useGarantias()
  // José, 22/10/2026: "por dia, mês e ano" — padrão = mês de hoje; setas andam um dia/mês/ano
  const [per, setPer] = useState<Janela | null>(null)
  if (erro) return <div className="gx-caixa" style={{ color: '#b91c1c' }}>{erro}</div>
  if (!dados) return <div className="gx-caixa" style={{ color: MUDO }}><span><i className="fas fa-circle-notch fa-spin" /> carregando as garantias…</span></div>
  const periodo = per || janela('mes', dados.hoje)
  const atual = ehAtual(periodo, dados.hoje)
  return (
    <div className="gx-painel">
      <div className="gx-per">
        <small>Aprovadas e rejeitadas fechadas em</small>
        <span className="gx-per-esc">
          {([['dia', 'Dia'], ['mes', 'Mês'], ['ano', 'Ano']] as [Escala, string][]).map(([k, r]) => <button key={k} type="button" className={periodo.escala === k ? 'on' : ''} onClick={() => setPer(trocarEscala(periodo, k, dados.hoje))}>{r}</button>)}
        </span>
        <span className="gx-per-nav">
          <button type="button" onClick={() => setPer(andar(periodo, -1))} title="anterior" aria-label="período anterior"><i className="fas fa-chevron-left" /></button>
          <b>{periodo.rotulo}</b>
          <button type="button" onClick={() => setPer(andar(periodo, 1))} disabled={atual} title="seguinte" aria-label="período seguinte"><i className="fas fa-chevron-right" /></button>
        </span>
        {!atual && <button type="button" className="gx-per-hoje" onClick={() => setPer(janela(periodo.escala, dados.hoje))}>voltar para hoje</button>}
      </div>
      <GarantiaPlacar key={`${periodo.escala}|${periodo.de}`} lista={dados.garantias} hoje={dados.hoje} periodo={periodo} />
      <p className="gx-per-nota">Aprovadas, rejeitadas, recebido e o que voltou do cliente seguem o período, pela data em que a garantia foi fechada. &quot;Esperando&quot; e &quot;cliente deve&quot; são a situação de hoje.</p>
    </div>
  )
}

/** Cabeçalho comum: a frase do resumo. */
function Cab({ c }: { c: ReturnType<typeof useConta> }) {
  return (
    <div className="gx-cab">
      <small><i className="fas fa-shield-heart" /> Garantias · direto do módulo</small>
      <h3><b><Numero valor={c.emJogo} formato={brl} /></b> em {c.abertas.length} garantias esperando · {c.taxa == null ? 'sem respostas no período' : <><b style={{ color: '#047857' }}>{Math.round(c.taxa * 100)}%</b> aprovadas no período</>}</h3>
    </div>
  )
}

export const ESTILO_GX = `
.gx-painel { display: grid; gap: 8px; margin-bottom: 14px } .gx-per { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; justify-content: flex-end } .gx-per small { font-size: 12px; font-weight: 800; color: ${MUDO}; margin-right: 4px }
.gx-per button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-weight: 800; font-size: 12.5px; color: var(--portal-text, #334155); cursor: pointer } .gx-per button.on { background: #7c3aed; border-color: #7c3aed; color: #fefefe }
@keyframes gxEntra { from { opacity: 0; transform: translateY(8px) } } @keyframes gxLado { from { transform: scaleX(0) } } @keyframes gxPop { from { opacity: 0; transform: scale(.9) } }
.gx-caixa { display: grid; gap: 14px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px 18px; min-width: 0 }
.gx-cab small { font-size: 12px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: ${MUDO} } .gx-cab small i { color: #7c3aed } .gx-cab h3 { margin: 2px 0 0; font-size: 20px; font-weight: 700; color: var(--portal-text, #0f172a) } .gx-cab h3 b { color: #2563eb }
.gx-leg { margin: 0; display: flex; gap: 14px; flex-wrap: wrap; font-size: 12.5px; color: ${MUDO} } .gx-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px }
.gx-st { display: inline-block; font-size: 11px; font-weight: 800; color: #fefefe; border-radius: 99px; padding: 2px 9px; white-space: nowrap }
.gx-funil { display: flex; gap: 10px; overflow-x: auto; padding-bottom: 4px; align-items: stretch }
.gx-fase { position: relative; flex: 1 0 150px; display: grid; gap: 3px; text-align: left; font-family: inherit; border: 1px solid var(--portal-border, #e5e7eb); background: color-mix(in srgb, var(--c) 6%, var(--portal-bg-card, #fefefe)); border-radius: 16px; padding: 12px 14px; cursor: pointer; animation: gxEntra .45s both; transition: transform .2s, box-shadow .2s } .gx-fase:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(15,23,42,.1) }
.gx-fase small { font-size: 12px; font-weight: 900; color: var(--c) } .gx-fase b { font-size: 28px; line-height: 1.1; color: var(--portal-text, #0f172a) } .gx-fase span { font-size: 14px; font-weight: 800; font-variant-numeric: tabular-nums }
.gx-fase-barra { display: block; height: 6px; border-radius: 99px; background: rgba(15,23,42,.06); overflow: hidden } .gx-fase-barra i { display: block; height: 100%; background: var(--c); transform-origin: left; animation: gxLado .8s both }
.gx-fase em { font-style: normal; font-size: 11.5px; color: ${MUDO} }
.gx-seta { position: absolute; right: -12px; top: 50%; transform: translateY(-50%); z-index: 1; width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); color: ${MUDO}; font-size: 10px; text-decoration: none }
.gx-fim { flex: 0 0 190px; display: grid; gap: 8px }
.gx-fim button { display: grid; grid-template-columns: auto auto 1fr; gap: 8px; align-items: center; border: none; border-radius: 14px; padding: 10px 12px; font-family: inherit; text-align: left; cursor: pointer; animation: gxEntra .45s .5s both } .gx-fim b { font-size: 22px } .gx-fim span { font-size: 12px; font-weight: 700 }
.gx-fim-a { background: #ecfdf5; color: #047857 } .gx-fim-r { background: #fef2f2; color: #b91c1c }
/* bloco 4 no estilo dos cartões do Faturamento por período (José, 21/10/2026): ícone no quadradinho, sem negrito */
.gx-painel .gx-tile { gap: 6px; padding: 14px 16px; transition: transform .2s, box-shadow .2s, border-color .2s }
.gx-painel .gx-tile:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--c) 40%, #e2e8f0); box-shadow: 0 12px 26px -18px rgba(15,23,42,.5) }
.gx-painel .gx-tile small { display: inline-flex; align-items: center; gap: 10px; font-size: 15.5px; font-weight: 500; color: #0f172a }
.gx-ic { width: 38px; height: 38px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: var(--c); background: color-mix(in srgb, var(--c) 12%, #fefefe); border: 1px solid color-mix(in srgb, var(--c) 22%, #fefefe); flex: none }
.gx-painel .gx-tile b { font-size: 28px; font-weight: 500; margin-top: 4px } .gx-painel .gx-tile span { font-size: 13px; color: #475569 }
.gx-painel .gx-anel2 { border-radius: 16px; padding: 12px 16px; transition: transform .2s, box-shadow .2s } .gx-painel .gx-anel2:hover { transform: translateY(-2px); box-shadow: 0 12px 26px -18px rgba(15,23,42,.5) }
.gx-painel .gx-anel2 > div b { font-size: 15.5px; font-weight: 500 } .gx-painel .gx-anel2 p { font-size: 13px; color: #475569 }
.gx-tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 10px }
.gx-tile { display: grid; gap: 2px; text-align: left; font-family: inherit; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 16px; padding: 12px 14px; cursor: pointer; animation: gxEntra .45s both; transition: transform .2s, box-shadow .2s } .gx-tile:hover { transform: translateY(-3px); box-shadow: 0 10px 22px rgba(15,23,42,.1) }
.gx-tile small { font-size: 12px; font-weight: 900; color: var(--c) } .gx-tile b { font-size: 22px; font-variant-numeric: tabular-nums; color: var(--portal-text, #0f172a) } .gx-tile span { font-size: 12.5px; color: ${MUDO} }
.gx-aneis { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px }
button.gx-anel2 { font-family: inherit; text-align: left; cursor: pointer; color: inherit; width: 100% } .gx-anel2.abre:hover { border-color: color-mix(in srgb, var(--c) 45%, #e5e7eb) }
.gx-anel-ver { display: inline-flex; gap: 5px; align-items: center; margin-top: 4px; font-size: 12.5px; text-decoration: none; color: color-mix(in srgb, var(--c) 85%, #0f172a) } .gx-anel-ver i { font-size: 10px; transition: transform .2s } .gx-anel2.abre:hover .gx-anel-ver i { transform: translateX(3px) }
.gx-anel2 { display: flex; gap: 12px; align-items: center; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 10px 14px; background: var(--portal-bg-card, #fefefe); animation: gxEntra .45s both; transition: transform .2s, box-shadow .2s } .gx-anel2:hover { transform: translateY(-2px); box-shadow: 0 10px 22px rgba(15,23,42,.08) }
.gx-ap { position: relative; width: 78px; height: 78px; flex-shrink: 0 } .gx-ap svg { width: 78px; height: 78px; transform: rotate(-90deg) } .gx-ap circle { fill: none; stroke-width: 11 } .gx-ap .v { stroke-linecap: round; animation: gxRoda2 1.2s cubic-bezier(.2,.8,.2,1) both } @keyframes gxRoda2 { from { stroke-dasharray: 0 314.16 } }
.gx-ap > b { position: absolute; inset: 0; display: grid; place-items: center; font-size: 18px; font-weight: 900 }
.gx-anel2 > div { min-width: 0 } .gx-anel2 > div b { display: block; font-size: 13.5px; color: var(--portal-text, #0f172a) } .gx-anel2 p { margin: 2px 0 0; font-size: 12.5px; line-height: 1.4; color: ${MUDO} }
.gx-so-mont { grid-template-columns: 1fr }
.gx-duo { display: grid; grid-template-columns: minmax(260px, 340px) 1fr; gap: 18px; align-items: start } @media (max-width: 800px) { .gx-duo { grid-template-columns: 1fr } }
.gx-anel { display: grid; grid-template-columns: 120px 1fr; gap: 12px; align-items: center; position: relative } .gx-anel svg { width: 120px; height: 120px; transform: rotate(-90deg) } .gx-anel circle { fill: none; stroke-width: 12 } .gx-anel .f { stroke: #fee2e2 } .gx-anel .v { stroke: #047857; stroke-linecap: round; animation: gxRoda 1.2s cubic-bezier(.2,.8,.2,1) both } @keyframes gxRoda { from { stroke-dasharray: 0 301.6 } }
.gx-anel > div { position: absolute; left: 0; top: 0; width: 120px; height: 120px; display: grid; place-content: center; text-align: center } .gx-anel > div b { font-size: 24px; color: #047857 } .gx-anel > div small { font-size: 11px; font-weight: 800; color: ${MUDO} }
.gx-anel p { margin: 0; font-size: 13.5px; line-height: 1.5; color: var(--portal-text, #334155) }
.gx-mont { display: grid; gap: 8px } .gx-mont > small { font-size: 11.5px; font-weight: 900; text-transform: uppercase; color: ${MUDO} }
.gx-mont-l { display: grid; gap: 3px; animation: gxEntra .4s both } .gx-mont-l b { font-size: 13.5px } .gx-mont-l > div { display: flex; height: 12px; border-radius: 99px; overflow: hidden; transform-origin: left; animation: gxLado .8s both } .gx-mont-l > div i { display: block; flex-basis: 0 } .gx-mont-l span { font-size: 12px; color: ${MUDO} }
.gx-acoes { display: grid; gap: 8px }
.gx-ac { border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; overflow: hidden; animation: gxEntra .4s both; transition: box-shadow .25s } .gx-ac.on { box-shadow: 0 0 0 2px color-mix(in srgb, var(--c) 30%, transparent) }
.gx-ac-cab { width: 100%; display: flex; gap: 12px; align-items: center; border: none; background: var(--portal-bg-card, #fefefe); padding: 12px 14px; font-family: inherit; text-align: left; cursor: pointer } .gx-ac-cab:hover { background: color-mix(in srgb, var(--c) 5%, var(--portal-bg-card, #fefefe)) }
.gx-ac-ic { width: 36px; height: 36px; border-radius: 11px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 12%, transparent); color: var(--c); flex-shrink: 0 }
.gx-ac-cab > div { flex: 1; min-width: 0; display: grid } .gx-ac-cab b { font-size: 14.5px } .gx-ac-cab small { font-size: 12.5px; color: ${MUDO} }
.gx-ac-cab > em { font-style: normal; min-width: 28px; height: 28px; border-radius: 99px; display: grid; place-items: center; background: var(--c); color: #fefefe; font-weight: 900; font-size: 13px; padding: 0 8px } .gx-ac-cab > strong { font-size: 14.5px; font-variant-numeric: tabular-nums; min-width: 100px; text-align: right }
.gx-ac-seta { color: ${MUDO}; transition: transform .3s } .gx-ac.on .gx-ac-seta { transform: rotate(180deg) }
.gx-ac-lista { display: grid; border-top: 1px solid var(--portal-border, #f1f5f9) }
.gx-ac-lista a { display: grid; grid-template-columns: 50px auto minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 8px 14px; text-decoration: none; color: inherit; font-size: 13px; border-bottom: 1px solid var(--portal-border, #f8fafc); animation: gxEntra .3s both } .gx-ac-lista a:hover { background: var(--portal-bg-secondary, #f8fafc) }
.gx-ac-lista em { font-style: normal; font-weight: 900; color: var(--c) } .gx-ac-lista span { color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .gx-ac-lista strong { font-variant-numeric: tabular-nums }
.gx-tempo { position: relative; display: grid; gap: 6px; padding-top: 18px }
.gx-marca { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--portal-border, #e2e8f0); border-left: 1px dashed var(--portal-border, #cbd5e1) } .gx-marca span { position: absolute; top: 0; left: 4px; font-size: 10.5px; font-weight: 800; color: ${MUDO}; font-style: normal }
.gx-tl { position: relative; display: grid; grid-template-columns: 210px auto 1fr; gap: 10px; align-items: center; text-decoration: none; color: inherit; animation: gxEntra .35s both; transition: opacity .2s } .gx-tl.apaga { opacity: .3 }
.gx-tl-n { display: grid; min-width: 0 } .gx-tl-n b { font-size: 12.5px } .gx-tl-n small { font-size: 11.5px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
.gx-tl-barra { display: flex; height: 16px; border-radius: 99px; overflow: hidden; min-width: 6px; transform-origin: left; animation: gxLado .8s cubic-bezier(.2,.8,.2,1) both } .gx-tl-barra i { display: block; height: 100% }
.gx-tl em { font-style: normal; font-size: 12px; font-weight: 700; color: ${MUDO}; white-space: nowrap }
.gx-chips { display: flex; gap: 6px; flex-wrap: wrap }
.gx-chips button { --c: #0f172a; display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; color: var(--portal-text, #334155); cursor: pointer } .gx-chips button i { width: 8px; height: 8px; border-radius: 50%; background: var(--c) } .gx-chips button em { font-style: normal; color: ${MUDO} }
.gx-chips button.on { background: var(--c); border-color: var(--c); color: #fefefe } .gx-chips button.on i { background: #fefefe } .gx-chips button.on em { color: #fefefe }
.gx-mural { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px }
.gx-mc { display: grid; gap: 4px; text-decoration: none; color: inherit; border: 1px solid var(--portal-border, #e5e7eb); border-radius: 16px; padding: 12px 14px; background: var(--portal-bg-card, #fefefe); animation: gxPop .35s both; transition: transform .2s, box-shadow .2s } .gx-mc:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,23,42,.1); border-color: color-mix(in srgb, var(--c) 40%, transparent) }
.gx-mc-top { display: flex; justify-content: space-between; align-items: center } .gx-mc-top em { font-style: normal; font-size: 12px; font-weight: 900; color: ${MUDO} } .gx-mc-top em.velha { color: #dc2626 }
.gx-mc > b { font-size: 14.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .gx-mc > small { font-size: 12px; color: ${MUDO} }
.gx-mc-val { display: grid } .gx-mc-val strong { font-size: 19px; font-variant-numeric: tabular-nums } .gx-mc-val span { font-size: 11.5px; color: ${MUDO} }
.gx-mc-pe { display: flex; gap: 4px 10px; flex-wrap: wrap; font-size: 12px; color: ${MUDO} } .gx-mc-pe .pend { color: #d97706; font-weight: 800 }
.gx-fundo { position: fixed; inset: 0; z-index: 100050; background: rgba(15,23,42,.45); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: gxEntra .2s both }
.gx-jan { width: min(860px, 100%); max-height: 86vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; animation: gxPop .35s cubic-bezier(.2,1.15,.3,1) both }
.gx-jan-cab { display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--portal-border, #e5e7eb) } .gx-jan-cab b { display: block; font-size: 17px } .gx-jan-cab small { font-size: 12.5px; color: ${MUDO} } .gx-jan-cab button { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; cursor: pointer; color: ${MUDO} }
.gx-jan-lista { overflow-y: auto; padding: 10px 18px 18px; display: grid; gap: 6px }
.gx-li { display: grid; grid-template-columns: 150px minmax(0, 1fr) 50px 100px; gap: 10px; align-items: center; text-decoration: none; color: inherit; border: 1px solid var(--portal-border, #eef2f7); border-radius: 12px; padding: 8px 12px; animation: gxEntra .3s both } .gx-li:hover { background: var(--portal-bg-secondary, #f8fafc) }
.gx-li > div { min-width: 0 } .gx-li b { font-size: 13.5px } .gx-li small { display: block; font-size: 12px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .gx-li em { font-style: normal; font-size: 12px; font-weight: 800; color: ${MUDO} } .gx-li strong { text-align: right; font-variant-numeric: tabular-nums }
button.gx-li { width: 100%; background: var(--portal-bg-card, #fefefe); font-family: inherit; text-align: left; cursor: pointer }
button.gx-mont-l { border: none; background: transparent; font-family: inherit; text-align: left; cursor: pointer; border-radius: 10px; padding: 4px 6px; margin: 0 -6px } button.gx-mont-l:hover { background: var(--portal-bg-secondary, #f8fafc) } .gx-mont-l u { text-decoration: none; color: #2563eb; font-weight: 800; margin-left: 6px; opacity: 0; transition: opacity .2s } button.gx-mont-l:hover u { opacity: 1 }
.gj-fundo { position: fixed; inset: 0; z-index: 100060; background: rgba(15,23,42,.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: gxEntra .2s both }
.gj { width: min(1020px, 100%); max-height: 92vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 20px; box-shadow: 0 30px 80px rgba(15,23,42,.35); overflow: hidden; border-top: 5px solid var(--c); animation: gxPop .4s cubic-bezier(.2,1.15,.3,1) both }
.gj-cab { display: flex; gap: 12px; align-items: center; padding: 14px 18px; border-bottom: 1px solid var(--portal-border, #e5e7eb); background: linear-gradient(100deg, color-mix(in srgb, var(--c) 8%, transparent), transparent 60%) }
.gj-cab h3 { margin: 0; font-size: 19px; color: var(--portal-text, #0f172a) } .gj-cab h3 small { font-size: 12.5px; font-weight: 700; color: ${MUDO} } .gj-cab > div > span { font-size: 12.5px; color: ${MUDO} } .gj-cab > strong { font-size: 21px; font-variant-numeric: tabular-nums; white-space: nowrap }
.gj-x { width: 36px; height: 36px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: transparent; cursor: pointer; color: ${MUDO}; flex-shrink: 0 }
.gj-corpo { overflow-y: auto; padding: 14px 18px; display: grid; gap: 14px }
.gj-vals { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px } @media (max-width: 760px) { .gj-vals { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
.gj-vals > div { display: grid; background: var(--portal-bg-secondary, #f8fafc); border-radius: 14px; padding: 10px 12px; animation: gxEntra .4s both } .gj-vals small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .gj-vals b { font-size: 18px; font-variant-numeric: tabular-nums } .gj-vals span { font-size: 12px; color: ${MUDO} }
.gj-info { display: flex; gap: 8px 20px; flex-wrap: wrap } .gj-info span { display: grid; font-size: 13.5px; font-weight: 700 } .gj-info small { font-size: 11px; font-weight: 800; text-transform: uppercase; color: ${MUDO} }
.gj-motivo { font-size: 13.5px; color: #b91c1c; background: #fef2f2; border-radius: 12px; padding: 8px 12px }
.gj-carr, .gj-nada { color: ${MUDO}; font-size: 13px } .gj-erro { color: #b91c1c; background: #fef2f2; border-radius: 10px; padding: 8px 12px; font-size: 13px }
.gj-txt { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px } .gj-txt > div { border: 1px solid var(--portal-border, #eef2f7); border-radius: 12px; padding: 8px 12px } .gj-txt small { font-size: 11px; font-weight: 900; text-transform: uppercase; color: ${MUDO} } .gj-txt p { margin: 3px 0 0; font-size: 13.5px; white-space: pre-wrap; max-height: 140px; overflow-y: auto }
.gj-bloco { display: grid; gap: 6px } .gj-bloco > b { font-size: 14.5px } .gj-bloco > b i { color: var(--c) }
.gj-peca { display: grid; grid-template-columns: 130px minmax(0, 1fr) 110px 80px 100px; gap: 10px; align-items: center; padding: 6px 10px; border-radius: 10px; background: var(--portal-bg-secondary, #f8fafc); font-size: 13px; animation: gxEntra .3s both }
.gj-peca code { font-size: 12px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .gj-peca span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .gj-peca small { color: ${MUDO}; text-align: right } .gj-peca b { text-align: right; font-variant-numeric: tabular-nums }
.gj-peca em { font-style: normal; font-size: 11px; font-weight: 800; border-radius: 99px; padding: 1px 8px; text-align: center; background: var(--portal-bg-card, #fefefe); color: ${MUDO} } .gj-peca em.aprovada { background: #ecfdf5; color: #047857 } .gj-peca em.rejeitada { background: #fef2f2; color: #b91c1c }
@media (max-width: 760px) { .gj-peca { grid-template-columns: minmax(0, 1fr) 90px } .gj-peca code, .gj-peca small, .gj-peca em { display: none } }
.gj-pend { display: flex; gap: 8px; align-items: baseline; font-size: 13px } .gj-pend em { font-style: normal; font-size: 11px; font-weight: 800; border-radius: 99px; padding: 1px 8px; background: #fffbeb; color: #b45309 } .gj-pend.respondida em { background: #ecfdf5; color: #047857 } .gj-pend small { color: ${MUDO} }
.gj-anexos { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 8px }
.gj-foto, .gj-arq { display: grid; gap: 4px; border: 1px solid var(--portal-border, #e5e7eb); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 4px; font-family: inherit; cursor: pointer; overflow: hidden; transition: transform .2s, box-shadow .2s; animation: gxPop .3s both } .gj-foto:hover, .gj-arq:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(15,23,42,.12) }
.gj-foto img { width: 100%; height: 90px; object-fit: cover; border-radius: 9px } .gj-foto small, .gj-arq small { font-size: 10.5px; color: ${MUDO}; text-align: center }
.gj-arq { place-items: center; padding: 10px 6px; text-align: center } .gj-arq i { font-size: 26px; color: #dc2626 } .gj-arq span { font-size: 11.5px; font-weight: 700; word-break: break-word; max-height: 32px; overflow: hidden }
.gj-hist { display: grid; gap: 4px } .gj-hist > div { display: grid; grid-template-columns: 50px minmax(0, 1fr) auto; gap: 8px; font-size: 12.5px } .gj-hist em { font-style: normal; font-weight: 800; color: ${MUDO} } .gj-hist small { color: ${MUDO} }
.gj-rodape { display: flex; gap: 8px; justify-content: flex-end; padding: 12px 18px; border-top: 1px solid var(--portal-border, #e5e7eb) }
.gj-rodape button, .gj-rodape a { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 7px 14px; font-family: inherit; font-weight: 800; font-size: 13px; color: var(--portal-text, #334155); cursor: pointer; text-decoration: none } .gj-rodape button:hover, .gj-rodape a:hover { border-color: #2563eb; color: #2563eb }
.gj-zoom { position: fixed; inset: 0; z-index: 100090; background: rgba(15,23,42,.85); display: grid; place-items: center; padding: 20px; cursor: zoom-out; animation: gxEntra .2s both } .gj-zoom img { max-width: 100%; max-height: 100%; border-radius: 12px }
.gj-doc { position: fixed; inset: 0; z-index: 100090 }
/* 22/10/2026: período Dia · Mês · Ano, destino das rejeitadas e janela completa do caso (estilo POS NewPortal: sem negrito, sem caixa alta) */
.gx-per { justify-content: flex-start; gap: 10px } .gx-per small { font-weight: 400; font-size: 13px }
.gx-per-esc { display: inline-flex; gap: 4px } .gx-per-esc button { font-weight: 500 }
.gx-per-nav { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 2px 4px }
.gx-per-nav b { font-weight: 500; font-size: 13.5px; min-width: 130px; text-align: center; color: var(--portal-text, #0f172a); text-transform: none }
.gx-per .gx-per-nav button { border: none; background: transparent; width: 28px; height: 28px; padding: 0; border-radius: 50%; color: ${MUDO} } .gx-per .gx-per-nav button:hover:not(:disabled) { background: var(--portal-bg-secondary, #f1f5f9); color: var(--portal-text, #0f172a) } .gx-per .gx-per-nav button:disabled { opacity: .35; cursor: default }
.gx-per .gx-per-hoje { border: none; background: transparent; color: #2563eb; font-weight: 400; padding: 4px 6px }
.gx-per-nota { margin: 0; font-size: 12.5px; color: ${MUDO} }
.gx-dest { display: grid; gap: 12px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 16px; padding: 14px 16px; animation: gxEntra .45s both }
.gx-dest-cab { display: flex; gap: 10px; align-items: center } .gx-dest-cab > div { display: grid } .gx-dest-cab b { font-size: 15.5px; font-weight: 500; color: var(--portal-text, #0f172a) } .gx-dest-cab small { font-size: 13px; color: ${MUDO} }
.gx-dest-barra { display: flex; gap: 3px; height: 22px; border-radius: 8px; overflow: hidden; transform-origin: left; animation: gxLado .8s cubic-bezier(.2,.8,.2,1) both }
.gx-dest-barra button { flex-basis: 0; min-width: 8px; border: none; padding: 0; cursor: pointer; transition: opacity .2s } .gx-dest-barra button.apaga, .gx-dest-leg button.apaga { opacity: .35 }
.gx-dest-leg { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 8px }
.gx-dest-leg button { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto auto; gap: 10px; align-items: center; border: 1px solid var(--portal-border, #eef2f7); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 8px 12px; font-family: inherit; text-align: left; cursor: pointer; color: var(--portal-text, #0f172a); transition: opacity .2s, border-color .2s }
.gx-dest-leg button:hover:not(:disabled) { border-color: #94a3b8 } .gx-dest-leg button:disabled { cursor: default; opacity: .5 }
.gx-dest-leg i { width: 12px; height: 12px; border-radius: 4px } .gx-dest-leg span { display: grid; min-width: 0 } .gx-dest-leg span b { font-size: 13.5px; font-weight: 500 } .gx-dest-leg span small { font-size: 12px; color: ${MUDO} }
.gx-dest-leg em { font-style: normal; font-size: 13px; color: ${MUDO} } .gx-dest-leg strong { font-weight: 500; font-size: 14.5px; font-variant-numeric: tabular-nums }
.gx-dest-nota { margin: 0; font-size: 12.5px; color: ${MUDO} }
.gj-dest { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 12px; align-items: center; border-radius: 14px; padding: 10px 14px; background: color-mix(in srgb, var(--c) 7%, var(--portal-bg-card, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 22%, transparent) }
.gj-dest > div { display: grid; gap: 2px } .gj-dest b { font-size: 15px; font-weight: 500; color: var(--c) } .gj-dest small { font-size: 12.5px; color: ${MUDO} } .gj-dest p { margin: 2px 0 0; font-size: 13px; white-space: pre-wrap } .gj-dest > strong { font-weight: 500; font-size: 18px; font-variant-numeric: tabular-nums }
.gj-datas { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px }
.gj-datas span { display: grid; font-size: 14px; border: 1px solid var(--portal-border, #eef2f7); border-radius: 12px; padding: 6px 10px; font-variant-numeric: tabular-nums } .gj-datas span.vazio { color: ${MUDO} } .gj-datas small, .gj-check small { font-size: 12px; color: ${MUDO}; text-transform: none; font-weight: 400 }
.gj-check { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 6px 14px } .gj-check span { display: grid; font-size: 13.5px } .gj-check em { grid-column: 1 / -1; font-style: normal; font-size: 13px; color: var(--c); margin-top: 4px }
a.gj-arq { text-decoration: none; color: inherit }
.gj-zoom { cursor: default } .gj-zoom img { max-height: calc(100vh - 90px); cursor: default }
.gj-zoom-leg { position: absolute; bottom: 14px; left: 50%; transform: translateX(-50%); color: #fefefe; font-size: 13px; background: rgba(15,23,42,.6); border-radius: 99px; padding: 4px 12px; white-space: nowrap; max-width: 90vw; overflow: hidden; text-overflow: ellipsis }
.gj-zoom-x, .gj-zoom-s { position: absolute; width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(254,254,254,.35); background: rgba(15,23,42,.55); color: #fefefe; cursor: pointer; display: grid; place-items: center; font-size: 16px }
.gj-zoom-x { top: 14px; right: 14px } .gj-zoom-s { top: 50%; transform: translateY(-50%) } .gj-zoom-s.esq { left: 14px } .gj-zoom-s.dir { right: 14px } .gj-zoom-x:hover, .gj-zoom-s:hover { background: rgba(15,23,42,.8) }
.gj-motivo { font-weight: 400 }
`
