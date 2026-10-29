'use client'
// Autorizações de comissão (José, 20/10/2026): a comissão é lançada pelo portal, mas antes o DIRETOR
// (papel marcado na Administração) autoriza assinando → o portal espelha no RH e gera o documento com as duas
// assinaturas. Ou devolve para ajuste apontando o que mudar (sem mudar nada). Tudo fica na aba Histórico.
import { useEffect, useRef, useSyncExternalStore, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { PedidoComissao, LinhaPedido, Apontamento, EventoComissao, TipoEvento } from '@/lib/mecanicos/lancamento-comissao-server'
import CanvasAssinatura, { type CanvasAssinaturaRef } from '@/components/assinatura/CanvasAssinatura'
import { Janela } from './JanelasInfo'
import { brl2 } from './ui'
import { contaDoPagamento, PCT_CAIXINHA } from '@/lib/mecanicos/descontos-tecnico'

// ---------------------------------------------------------------- loja: pedidos + se quem vê é diretor
let estado: { pedidos: PedidoComissao[] | null; diretor: boolean; semTabela: boolean } = { pedidos: null, diretor: false, semTabela: false }
let lendo: Promise<void> | null = null
const ouvintes = new Set<() => void>()
const assinar = (f: () => void) => { ouvintes.add(f); return () => { ouvintes.delete(f) } }
export function recarregarAutorizacoes() {
  lendo = (async () => {
    try {
      const r = await fetch('/api/mecanicos/lancamento-comissao', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      estado = { pedidos: Array.isArray(j.pedidos) ? j.pedidos : [], diretor: !!j.diretor, semTabela: !!j.semTabela }
    } catch { estado = { ...estado, pedidos: estado.pedidos || [] } }
    ouvintes.forEach((f) => f())
  })()
  return lendo
}
export function useAutorizacoes() {
  const s = useSyncExternalStore(assinar, () => estado, () => estado)
  useEffect(() => {
    if (!lendo) void recarregarAutorizacoes()
    const f = () => { void recarregarAutorizacoes() }
    window.addEventListener('comissao-decidida', f)
    return () => window.removeEventListener('comissao-decidida', f)
  }, [])
  return { ...s, abertos: (s.pedidos || []).filter((p) => p.status === 'aguardando') }
}


/** Abre o documento (HTML A4 com as assinaturas) numa aba — com o login, por isso via blob. */
export async function abrirDocumento(id: string) {
  const aba = window.open('', '_blank')
  try {
    const r = await fetch(`/api/mecanicos/lancamento-comissao/documento?id=${id}`, { headers: await authHeaders() })
    const html = await r.text()
    const url = URL.createObjectURL(new Blob([r.ok ? html : `<p style="font-family:Arial">${html}</p>`], { type: 'text/html' }))
    if (aba) aba.location.href = url; else window.open(url, '_blank')
  } catch { aba?.close() }
}

const mesBR = (m: string) => { const n = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][Number(m.slice(5, 7)) - 1]; return `${n} de ${m.slice(0, 4)}` }
const quando = (s: string | null) => s ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''
const mexida = (l: LinhaPedido) => l.acao !== 'pagar' || !!l.divisao || Math.abs((l.valor || 0) - (l.calculado || 0)) > 0.005
const decisao = (l: LinhaPedido) => l.acao === 'nao' ? 'não paga' : l.divisao ? `dividida (${Object.entries(l.divisao).map(([k, v]) => `${k.split(' ')[0]} ${brl2(v)}`).join(', ')})` : mexida(l) ? 'ajustada' : ''
const ROT_EV: Record<TipoEvento, string> = { pedido: 'Pediu autorização', devolvida: 'Devolveu para ajuste', autorizada: 'Autorizou', espelhada: 'Lançada no RH', erro_rh: 'Erro ao lançar no RH', substituida: 'Substituída' }

export function AutorizacoesJanela({ onFechar }: { onFechar?: () => void } = {}) {
  const a = useAutorizacoes()
  return <AutorizacoesVista pedidos={a.pedidos} diretor={a.diretor} semTabela={a.semTabela} onFechar={onFechar} />
}

/** O conteúdo da janela (separado da leitura para dar para ver com dados de exemplo). */
export function AutorizacoesVista({ pedidos, diretor, semTabela, eventosIniciais, abaInicial, onFechar }: { pedidos: PedidoComissao[] | null; diretor: boolean; semTabela: boolean; eventosIniciais?: EventoComissao[]; abaInicial?: 'pedidos' | 'historico'; onFechar?: () => void }) {
  const [aba, setAba] = useState<'pedidos' | 'historico'>(abaInicial || 'pedidos')
  const abertos = (pedidos || []).filter((p) => p.status === 'aguardando')
  return (
    <Janela titulo="Autorizações de comissão" sub={diretor ? 'você é o diretor: autorize ou devolva para ajuste' : 'pedidos esperando o diretor'} ic="fa-signature" cor="#1d4ed8" onFechar={onFechar}>
      <style>{ESTILO_AU}</style>
      <div className="au-abas">
        <button type="button" className={aba === 'pedidos' ? 'on' : ''} onClick={() => setAba('pedidos')}>Para autorizar{abertos.length > 0 && <span className="au-n">{abertos.length}</span>}</button>
        <button type="button" className={aba === 'historico' ? 'on' : ''} onClick={() => setAba('historico')}>Histórico</button>
      </div>
      {semTabela && <p className="au-aviso">Falta rodar o SQL <b>sql/diretor-comissoes.sql</b> no Supabase.</p>}
      {aba === 'pedidos' ? <>
        <p className="ji-intro">O pós-vendas monta a comissão na ficha do mecânico, <b>assina</b> e pede. O diretor <b>autoriza assinando</b> — aí o portal grava no RH e gera o documento com as duas assinaturas — ou <b>devolve para ajuste</b> dizendo o que mudar. Devolver não altera nada: quem muda é o pós-vendas.</p>
        {!semTabela && pedidos && !diretor && <p className="au-aviso">Só quem está marcado como <b>Diretor</b> na Administração pode autorizar.</p>}
        {!pedidos ? <p className="ji-mudo">carregando…</p> : !abertos.length ? <p className="ji-mudo">Nenhum pedido esperando.</p> : abertos.map((p) => <Pedido key={p.id} p={p} diretor={diretor} />)}
      </> : <Historico iniciais={eventosIniciais} />}
    </Janela>
  )
}

type Marca = { pedido: Apontamento['pedido']; valor: string; texto: string }

function Pedido({ p, diretor }: { p: PedidoComissao; diretor: boolean }) {
  const [obs, setObs] = useState('')
  const [modo, setModo] = useState<'ver' | 'devolver' | 'assinar'>('ver')
  const [marcas, setMarcas] = useState<Record<string, Marca>>({})
  const [indo, setIndo] = useState(false)
  const [erro, setErro] = useState('')
  const [assinou, setAssinou] = useState(false)
  const assRef = useRef<CanvasAssinaturaRef>(null)
  const [verTodas, setVerTodas] = useState(false)
  const dif = p.calculado == null ? 0 : p.valor - p.calculado
  const nMex = p.linhas.filter(mexida).length
  const lista = verTodas || modo === 'devolver' ? p.linhas : p.linhas.filter(mexida)
  const marcar = (os: string, x: Partial<Marca> | null) => setMarcas((m) => { const n = { ...m }; if (!x) delete n[os]; else n[os] = { ...(m[os] || { pedido: 'alterar', valor: '', texto: '' }), ...x }; return n })
  const enviar = async (acao: 'autorizar' | 'devolver') => {
    setErro('')
    const apontamentos = Object.entries(marcas).map(([os, m]) => ({ os, numero: p.linhas.find((l) => l.os === os)?.numero || os, pedido: m.pedido, valor: m.pedido === 'alterar' ? Number(m.valor.replace(',', '.')) : null, texto: m.texto }))
    if (acao === 'devolver' && !apontamentos.length && !obs.trim()) { setErro('Marque o que mudar numa OS ou escreva na observação.'); return }
    setIndo(true)
    try {
      const r = await fetch('/api/mecanicos/lancamento-comissao', { method: 'PATCH', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id, acao, observacao: obs.trim(), apontamentos, assinatura: acao === 'autorizar' ? assRef.current?.png() : undefined }) })
      const j = await r.json()
      if (!r.ok) setErro(j.error || 'Não foi possível gravar')
      else { if (j.status === 'erro_rh') setErro(`Autorizada, mas o RH não aceitou: ${j.erro}`); window.dispatchEvent(new Event('comissao-decidida')) }
    } catch { setErro('Sem conexão — tente de novo') }
    setIndo(false)
  }
  return (
    <div className="au-p">
      <div className="au-p-cab">
        <div><b>{p.tecnico}</b><small>comissão de {mesBR(p.mes)} · pedido e assinado por {p.pedido_por || '—'} em {quando(p.pedido_em)}</small></div>
        <div className="au-p-v"><b>{brl2(p.valor)}</b>{p.calculado != null && <small>{Math.abs(dif) > 0.01 ? <>pela regra {brl2(p.calculado)} · <em className={dif > 0 ? 'mais' : 'menos'}>{dif > 0 ? '+' : '−'}{brl2(Math.abs(dif))}</em></> : 'igual ao calculado pela regra'}</small>}</div>
      </div>
      <ContaPagamento p={p} />
      <div className="au-sub">
        <span>{p.linhas.length} OS · {nMex ? `${nMex} com decisão do pós-vendas` : 'todas pela regra'}</span>
        {modo !== 'devolver' && p.linhas.length > nMex && <button type="button" onClick={() => setVerTodas((v) => !v)}>{verTodas ? 'só as com decisão' : 'ver todas as OS'}</button>}
        <button type="button" onClick={() => { void abrirDocumento(p.id) }}>ver documento</button>
      </div>
      {lista.length > 0 && (
        <div className={`au-lin ${modo === 'devolver' ? 'dev' : ''}`}>
          <div className="au-th"><span>OS</span><span>Cliente</span><span className="n">Regra</span><span className="n">A pagar</span><span>Decisão do pós-vendas</span>{modo === 'devolver' && <span>O que mudar</span>}</div>
          {lista.map((l) => {
            const m = marcas[l.os]
            return (
              <div key={l.os} className={`au-tr ${mexida(l) ? 'mex' : ''} ${m ? 'marcada' : ''}`}>
                <span>{l.numero}</span><span>{l.cliente || '—'}</span>
                <span className="n">{brl2(l.calculado)}</span><span className="n">{brl2(l.valor)}</span>
                <span className="au-dec-pv">{decisao(l)}{l.motivo && mexida(l) ? ` — ${l.motivo}` : ''}</span>
                {modo === 'devolver' && (
                  <span className="au-marca">
                    <select value={m?.pedido || ''} onChange={(e) => marcar(l.os, e.target.value ? { pedido: e.target.value as Marca['pedido'] } : null)}>
                      <option value="">manter</option><option value="alterar">alterar valor</option><option value="nao_pagar">não pagar</option><option value="conferir">conferir</option>
                    </select>
                    {m?.pedido === 'alterar' && <label>R$<input inputMode="decimal" value={m.valor} onChange={(e) => marcar(l.os, { valor: e.target.value })} placeholder="0,00" /></label>}
                    {m && <input className="au-mtx" placeholder="por quê" value={m.texto} onChange={(e) => marcar(l.os, { texto: e.target.value })} />}
                  </span>
                )}
              </div>
            )
          })}
        </div>
      )}
      {diretor && modo === 'ver' && (
        <div className="au-dec">
          <button type="button" className="au-sec" onClick={() => setModo('devolver')}>Devolver para ajuste</button>
          <button type="button" className="au-pri" onClick={() => setModo('assinar')}>Autorizar<span className="seta"><i className="fas fa-arrow-right" /></span></button>
        </div>
      )}
      {diretor && modo === 'devolver' && (
        <div className="au-box">
          <b>Devolver para o pós-vendas</b>
          <small>Marque nas OS acima o que você quer diferente. Nada muda agora — o pós-vendas recebe o aviso, ajusta e pede de novo.</small>
          <input placeholder="observação geral (opcional se marcou alguma OS)" value={obs} onChange={(e) => setObs(e.target.value)} />
          <div className="au-dec"><button type="button" className="au-volta" onClick={() => { setModo('ver'); setMarcas({}) }}>voltar</button><button type="button" className="au-pri ambar" disabled={indo} onClick={() => void enviar('devolver')}>{indo ? 'Enviando…' : `Devolver${Object.keys(marcas).length ? ` com ${Object.keys(marcas).length} OS apontada(s)` : ''}`}</button></div>
        </div>
      )}
      {diretor && modo === 'assinar' && (
        <div className="au-box">
          <b>Autorizar {brl2(p.valor)} para {p.tecnico}</b>
          <small>Assinando, a comissão vai para o RH como aprovada, {PCT_CAIXINHA}% ({brl2(contaDoPagamento(p.valor, p.descontos).caixinha)}) vai para a caixinha dos técnicos e o documento sai com a sua assinatura e a de {p.pedido_por || 'quem pediu'}.</small>
          <div className="au-ass"><CanvasAssinatura ref={assRef} temTraco={assinou} onTraco={setAssinou} altura={140} />{assinou && <button type="button" className="au-volta" onClick={() => assRef.current?.limpar()}>limpar</button>}</div>
          <input placeholder="observação (opcional)" value={obs} onChange={(e) => setObs(e.target.value)} />
          <div className="au-dec"><button type="button" className="au-volta" onClick={() => setModo('ver')}>voltar</button><button type="button" className="au-pri" disabled={indo || !assinou} onClick={() => void enviar('autorizar')}>{indo ? 'Gravando no RH…' : 'Assinar e autorizar'}<span className="seta"><i className="fas fa-check" /></span></button></div>
        </div>
      )}
      {erro && <p className="au-erro">{erro}</p>}
    </div>
  )
}

/** O que o técnico recebe: comissão − descontos em folha (1ª parcela) − caixinha = líquido (igual ao documento). */
function ContaPagamento({ p }: { p: PedidoComissao }) {
  const c = contaDoPagamento(p.valor, p.descontos)
  return (
    <div className="au-conta">
      <span><small>Comissão</small><b>{brl2(c.comissao)}</b></span>
      {c.descontos > 0 && <span className="neg"><small>Descontos em folha</small><b>− {brl2(c.descontos)}</b></span>}
      <span className="cx"><small><i className="fas fa-piggy-bank" /> Caixinha {PCT_CAIXINHA}%</small><b>− {brl2(c.caixinha)}</b></span>
      <span className="liq"><small>Líquido para o técnico</small><b>{brl2(c.liquido)}</b></span>
      {/* deixa claro onde o 1% aparece (José, 29/10/2026) */}
      <small className="au-cx-nota"><i className="fas fa-circle-info" /> No RH a comissão fica com {brl2(c.comissao)}; o 1% ({brl2(c.caixinha)}) vai para a caixinha dos técnicos e o RH lança no Omie {brl2(c.comissao - c.caixinha)} (99%). No fim do ciclo a empresa dobra a caixinha e divide entre os técnicos.</small>
    </div>
  )
}

function Historico({ iniciais }: { iniciais?: EventoComissao[] }) {
  const [eventos, setEventos] = useState<EventoComissao[] | null>(iniciais || null)
  const [tec, setTec] = useState('')
  useEffect(() => {
    if (iniciais) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/mecanicos/lancamento-comissao?eventos=1', { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (vivo) setEventos(Array.isArray(j.eventos) ? j.eventos : [])
      } catch { if (vivo) setEventos([]) }
    })()
    return () => { vivo = false }
  }, [iniciais])
  if (!eventos) return <p className="ji-mudo">carregando o histórico…</p>
  const tecnicos = [...new Set(eventos.map((e) => e.tecnico))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const lista = eventos.filter((e) => !tec || e.tecnico === tec)
  const dias = new Map<string, EventoComissao[]>()
  for (const e of lista) { const k = new Date(e.em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', weekday: 'long', day: '2-digit', month: 'long' }); dias.set(k, [...(dias.get(k) || []), e]) }
  return (
    <div className="au-hist">
      <div className="au-hist-topo">
        <span className="ji-mudo">Tudo que aconteceu com as comissões: cada pedido, devolução, autorização e lançamento no RH.</span>
        <select value={tec} onChange={(e) => setTec(e.target.value)}><option value="">todos os mecânicos</option>{tecnicos.map((t) => <option key={t}>{t}</option>)}</select>
      </div>
      {!lista.length && <p className="ji-mudo">Nada registrado ainda.</p>}
      {[...dias.entries()].map(([dia, evs]) => (
        <div key={dia} className="au-dia">
          <small className="au-dia-t">{dia}</small>
          {evs.map((e) => <LinhaEvento key={e.id} e={e} />)}
        </div>
      ))}
    </div>
  )
}

function LinhaEvento({ e }: { e: EventoComissao }) {
  const det = (e.detalhes || {}) as { observacao?: string | null; apontamentos?: Apontamento[]; mexidas?: { numero: string; acao: string; valor: number; calculado: number; motivo: string }[]; erro?: string; motivo?: string; calculado?: number }
  const hora = new Date(e.em).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return (
    <div className={`au-ev ${e.tipo}`}>
      <span className="au-ev-h">{hora}</span>
      <span className="au-ev-pt" />
      <div className="au-ev-c">
        <div className="au-ev-l1"><b>{ROT_EV[e.tipo] || e.tipo}</b><span>{e.tecnico} · {mesBR(e.mes)}</span>{e.valor != null && <span className="au-ev-v">{brl2(Number(e.valor))}</span>}</div>
        <div className="au-ev-l2">
          {e.autor && <span>por {e.autor}</span>}
          {e.tipo === 'pedido' && det.mexidas && <span>{det.mexidas.length ? `${det.mexidas.length} OS com decisão` : 'todas pela regra'}{det.calculado != null && Math.abs(Number(e.valor) - det.calculado) > 0.01 ? ` · pela regra ${brl2(det.calculado)}` : ''}</span>}
          {det.observacao && <span>“{det.observacao}”</span>}
          {det.erro && <span className="au-ev-erro">{det.erro}</span>}
          {det.motivo && <span>{det.motivo}</span>}
        </div>
        {!!det.apontamentos?.length && <ul className="au-ev-lst">{det.apontamentos.map((a) => <li key={a.os}>OS {a.numero}: {a.pedido === 'nao_pagar' ? 'não pagar' : a.pedido === 'alterar' ? `pagar ${brl2(Number(a.valor) || 0)}` : 'conferir'}{a.texto ? ` — ${a.texto}` : ''}</li>)}</ul>}
        {e.tipo === 'pedido' && !!det.mexidas?.length && <ul className="au-ev-lst">{det.mexidas.map((m) => <li key={m.numero}>OS {m.numero}: {m.acao === 'nao' ? 'não paga' : m.acao === 'dividir' ? 'dividida' : 'ajustada'} {brl2(m.calculado)} → {brl2(m.valor)} — {m.motivo}</li>)}</ul>}
      </div>
    </div>
  )
}

const ESTILO_AU = `
.au-abas { display: inline-flex; gap: 4px; background: #f1f5f9; border-radius: 99px; padding: 4px; justify-self: start }
.au-abas button { border: none; background: none; border-radius: 99px; padding: 8px 18px; font-family: inherit; font-size: 14px; color: #475569; cursor: pointer; display: inline-flex; align-items: center; gap: 6px } .au-abas button.on { background: #fefefe; color: #0f172a; box-shadow: 0 1px 3px rgba(15,23,42,.12) }
.au-aviso { margin: 0; font-size: 13.5px; color: #5b21b6; background: #f5f3ff; border-radius: 10px; padding: 9px 12px }
.au-n { display: inline-grid; place-items: center; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px; background: #f59e0b; color: #fefefe; font-size: 11.5px }
.au-p { border: 1px solid var(--portal-border, #e2e8f0); border-radius: 14px; padding: 14px 16px; display: grid; gap: 10px; background: var(--portal-bg-card, #fefefe) }
.au-p-cab { display: flex; gap: 14px; justify-content: space-between; align-items: flex-start; flex-wrap: wrap }
.au-p-cab > div:first-child { display: grid; gap: 2px } .au-p-cab b { font-size: 17px; font-weight: 600; color: #0f172a } .au-p-cab small { font-size: 13px; color: var(--portal-text-muted, #64748b) }
.au-p-v { display: grid; justify-items: end; gap: 2px } .au-p-v b { font-size: 22px; font-weight: 500; font-variant-numeric: tabular-nums } .au-p-v em { font-style: normal } .au-p-v em.mais { color: #047857 } .au-p-v em.menos { color: #b91c1c }
.au-cx-nota { flex-basis: 100%; display: block; font-size: 12px; color: #475569; line-height: 1.45; margin-top: 4px } .au-cx-nota i { color: #047857; margin-right: 4px }
.au-conta { display: flex; flex-wrap: wrap; gap: 6px 22px; align-items: flex-end; background: #f8fafc; border-radius: 12px; padding: 10px 14px }
.au-conta span { display: grid; gap: 1px } .au-conta small { font-size: 12px; color: #64748b } .au-conta b { font-size: 15.5px; font-weight: 500; font-variant-numeric: tabular-nums; color: #0f172a }
.au-conta .neg b { color: #b91c1c } .au-conta .cx small { color: #047857 } .au-conta .cx b { color: #047857 } .au-conta .liq { margin-left: auto; text-align: right } .au-conta .liq b { font-size: 18px; font-weight: 600 }
.au-sub { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 13px; color: #475569 } .au-sub button { border: none; background: none; padding: 0; font-family: inherit; font-size: 13px; color: #1d4ed8; cursor: pointer; text-decoration: underline; text-underline-offset: 3px }
.au-lin { display: grid; font-size: 13.5px; color: #0f172a; border: 1px solid var(--portal-border, #eef2f7); border-radius: 10px; overflow: hidden }
.au-th, .au-tr { display: grid; grid-template-columns: 64px minmax(130px, 1.3fr) 90px 90px minmax(160px, 1.6fr); gap: 10px; padding: 7px 12px; align-items: center }
.au-lin.dev .au-th, .au-lin.dev .au-tr { grid-template-columns: 64px minmax(110px, 1fr) 84px 84px minmax(120px, 1.1fr) minmax(250px, 1.6fr) }
.au-th { background: #f8fafc; font-size: 12px; color: var(--portal-text-muted, #64748b) } .au-tr + .au-tr { border-top: 1px solid var(--portal-border, #eef2f7) }
.au-tr.mex { background: #fffbeb } .au-tr.marcada { background: #eff6ff }
.au-th .n, .au-tr .n { text-align: right; font-variant-numeric: tabular-nums } .au-dec-pv { font-size: 12.5px; color: #92400e }
.au-marca { display: flex; gap: 6px; align-items: center; flex-wrap: wrap } .au-marca select, .au-marca input { border: 1px solid #cbd5e1; border-radius: 8px; padding: 5px 8px; font-family: inherit; font-size: 13px; background: #fefefe; color: #0f172a }
.au-marca label { display: inline-flex; align-items: center; gap: 4px; font-size: 12.5px; color: #475569 } .au-marca label input { width: 84px } .au-mtx { flex: 1; min-width: 100px }
.au-dec { display: flex; gap: 8px; align-items: center; justify-content: flex-end; flex-wrap: wrap }
.au-pri { display: inline-flex; align-items: center; gap: 10px; border: none; background: #0f172a; color: #fefefe; border-radius: 99px; padding: 10px 12px 10px 20px; font-family: inherit; font-size: 14px; cursor: pointer; transition: background .2s } .au-pri:hover:not(:disabled) { background: #1d4ed8 } .au-pri:disabled { background: #e2e8f0; color: #94a3b8; cursor: not-allowed }
.au-pri.ambar { padding: 10px 20px; background: #b45309 } .au-pri.ambar:hover:not(:disabled) { background: #92400e }
.au-pri .seta { width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.16); font-size: 11px }
.au-sec { border: 1px solid #fcd34d; background: #fffbeb; color: #92400e; border-radius: 99px; padding: 9px 18px; font-family: inherit; font-size: 14px; cursor: pointer } .au-sec:hover { background: #fef3c7 }
.au-volta { border: none; background: none; color: var(--portal-text-muted, #64748b); font-family: inherit; font-size: 13.5px; cursor: pointer }
.au-box { display: grid; gap: 8px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px 14px } .au-box > b { font-weight: 600; font-size: 15px } .au-box > small { font-size: 13px; color: #475569 }
.au-box > input { border: 1px solid #cbd5e1; border-radius: 99px; padding: 9px 14px; font-family: inherit; font-size: 14px; background: #fefefe; color: #0f172a }
.au-ass { display: grid; gap: 6px } .au-ass > button { justify-self: start }
.au-erro { margin: 0; font-size: 13px; color: #991b1b; background: #fef2f2; border-radius: 10px; padding: 8px 12px }
.au-hist { display: grid; gap: 14px } .au-hist-topo { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap }
.au-hist-topo select { border: 1px solid #cbd5e1; border-radius: 99px; padding: 7px 12px; font-family: inherit; font-size: 13.5px; background: #fefefe; color: #0f172a }
.au-dia { display: grid; gap: 2px } .au-dia-t { font-size: 12px; color: var(--portal-text-muted, #64748b); text-transform: capitalize; margin-bottom: 4px }
.au-ev { --ec: #64748b; display: grid; grid-template-columns: 44px 14px 1fr; gap: 10px; padding: 6px 0; position: relative }
.au-ev.pedido { --ec: #1d4ed8 } .au-ev.devolvida { --ec: #d97706 } .au-ev.autorizada, .au-ev.espelhada { --ec: #059669 } .au-ev.erro_rh { --ec: #dc2626 } .au-ev.substituida { --ec: #94a3b8 }
.au-ev-h { font-size: 12.5px; color: #64748b; font-variant-numeric: tabular-nums; padding-top: 1px } .au-ev-pt { width: 10px; height: 10px; border-radius: 50%; background: var(--ec); margin-top: 5px; box-shadow: 0 0 0 3px color-mix(in srgb, var(--ec) 18%, transparent) }
.au-ev-c { display: grid; gap: 2px } .au-ev-l1 { display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; font-size: 14px; color: #0f172a } .au-ev-l1 b { font-weight: 600; color: var(--ec) } .au-ev-v { margin-left: auto; font-variant-numeric: tabular-nums }
.au-ev-l2 { display: flex; gap: 10px; flex-wrap: wrap; font-size: 12.5px; color: #475569 } .au-ev-erro { color: #b91c1c }
.au-ev-lst { margin: 2px 0 0; padding-left: 16px; font-size: 12.5px; color: #334155; display: grid; gap: 1px }
@media (max-width: 800px) { .au-th { display: none } .au-tr, .au-lin.dev .au-tr { grid-template-columns: 1fr 1fr } }
`
