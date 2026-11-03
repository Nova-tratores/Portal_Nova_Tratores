'use client'
// Contas recorrentes não lançadas (José, 03/11/2026 — opção 1: aviso pelo atraso costumeiro de cada conta).
// Estilo POS NewPortal (docs/estilo-pos-newportal.md). Regras em lib/financeiro/recorrentes.ts.
import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import {
  AlertTriangle, Clock, CheckCircle2, Repeat, Search, X, Bell, HelpCircle, ChevronDown, Undo2, CalendarX, Ban, Check,
} from 'lucide-react'

const brl = (v) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const dataBR = (d) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}` : '—')
const NOMES_MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const mesBR = (m) => `${NOMES_MES[Number(m.slice(5, 7)) - 1]}/${m.slice(2, 4)}`
const EMPRESA = { NOVA: 'Nova', CASTRO: 'Castro' }

const SIT = {
  faltando: { rotulo: 'Faltando lançar', cor: '#dc2626', Icone: AlertTriangle },
  aguardando: { rotulo: 'Dentro do prazo', cor: '#d97706', Icone: Clock },
  marcada: { rotulo: 'Resolvida à mão', cor: '#7c3aed', Icone: Check },
  vizinho: { rotulo: 'Lançada no mês vizinho', cor: '#0891b2', Icone: Repeat },
  lancada: { rotulo: 'Lançada', cor: '#16a34a', Icone: CheckCircle2 },
}
const DECISAO = { ja_lancei: 'Já lancei', pular_mes: 'Não vai ter este mês', nao_recorrente: 'Não é recorrente' }

const CSS = `
.rc { padding: 20px clamp(12px, 2vw, 28px) 40px; color: var(--portal-text, #0f172a); font-weight: 400 }
.rc * { box-sizing: border-box }
.rc-topo { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(210px, 100%), 1fr)); gap: 12px; margin-bottom: 16px }
.rc-card { background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); border-radius: 16px; padding: 16px 18px 14px;
  transition: box-shadow .25s, transform .25s, border-color .25s; animation: rcEntra .4s ease both }
.rc-card.clic { cursor: pointer }
.rc-card.clic:hover { transform: translateY(-2px); box-shadow: 0 14px 28px -20px rgba(15,23,42,.55); border-color: color-mix(in srgb, var(--c) 35%, var(--border, #e2e8f0)) }
.rc-card.ativo { border-color: var(--c); background: color-mix(in srgb, var(--c) 6%, var(--surface, #fefefe)) }
.rc-ico { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; flex: none; color: var(--c);
  background: color-mix(in srgb, var(--c) 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 18%, transparent) }
.rc-ico.p { width: 32px; height: 32px; border-radius: 9px }
.rc-num { font-size: 22px; font-weight: 500; letter-spacing: -.01em; font-variant-numeric: tabular-nums; margin-top: 8px }
.rc-sub { font-size: 13px; color: var(--portal-text-secondary, #475569); margin-top: 2px }
.rc-rot { display: flex; align-items: center; gap: 10px; font-size: 14px; color: var(--portal-text-secondary, #475569) }
.rc-barra { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin-bottom: 14px }
.rc-chip { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 12px; border-radius: 999px; font-size: 13px; cursor: pointer;
  border: 1px solid color-mix(in srgb, var(--c, #475569) 25%, var(--border, #e2e8f0)); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a) }
.rc-chip .q { font-size: 12px; padding: 1px 8px; border-radius: 999px; color: var(--c, #475569); background: color-mix(in srgb, var(--c, #475569) 12%, transparent); font-variant-numeric: tabular-nums }
.rc-chip.on { background: color-mix(in srgb, var(--c, #475569) 9%, var(--surface, #fefefe)); border-color: var(--c, #475569) }
.rc-chip.on .q { background: var(--c, #475569); color: #fefefe }
.rc-busca { display: flex; align-items: center; gap: 8px; height: 38px; padding: 0 12px; border: 1px solid var(--border, #e2e8f0); border-radius: 10px;
  background: var(--surface, #fefefe); min-width: min(260px, 100%); flex: 1; max-width: 420px }
.rc-busca input { border: 0; outline: 0; flex: 1; background: transparent; font-size: 14px; color: inherit; min-width: 0 }
.rc-lista { display: flex; flex-direction: column; gap: 10px }
.rc-linha { display: grid; grid-template-columns: minmax(240px, 2.2fr) minmax(150px, 1fr) minmax(130px, .9fr) minmax(170px, 1.1fr) auto; gap: 14px; align-items: center;
  padding: 14px 16px; cursor: pointer }
.rc-forn { font-size: 16px; font-weight: 500; line-height: 1.25 }
.rc-meta { font-size: 12.5px; color: var(--portal-text-muted, #64748b); margin-top: 3px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center }
.rc-pill { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; padding: 3px 9px; border-radius: 999px; white-space: nowrap;
  color: var(--c, #475569); background: color-mix(in srgb, var(--c, #475569) 10%, transparent) }
.rc-valor { font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums; letter-spacing: -.01em }
.rc-bolas { display: flex; gap: 4px; margin-top: 6px }
.rc-bola { width: 14px; height: 14px; border-radius: 50%; background: var(--border, #e2e8f0) }
.rc-bola.tem { background: #16a34a }
.rc-bola.atual { outline: 2px solid var(--c); outline-offset: 1px }
.rc-bola.atual:not(.tem) { background: color-mix(in srgb, var(--c) 30%, transparent) }
.rc-acoes { display: flex; gap: 6px; justify-content: flex-end; flex-wrap: wrap }
.rc-btn { height: 34px; padding: 0 11px; border-radius: 10px; font-size: 13px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px;
  border: 1px solid var(--border, #e2e8f0); background: var(--surface, #fefefe); color: var(--portal-text, #0f172a); white-space: nowrap }
.rc-btn:hover { border-color: var(--c, #2563eb); color: var(--c, #2563eb) }
.rc-btn:disabled { opacity: .5; cursor: wait }
.rc-vazio { text-align: center; padding: 50px 20px; color: var(--portal-text-muted, #64748b); font-size: 14px }
.rc-sino { display: flex; gap: 12px; align-items: flex-start; padding: 14px 16px; margin-bottom: 14px }
.rc-sino-item { font-size: 13.5px; padding: 8px 10px; border-radius: 10px; background: var(--portal-bg-secondary, #f8fafc); margin-top: 6px }
.rc-ajuda { padding: 12px 16px; margin-bottom: 14px; font-size: 13.5px; color: var(--portal-text-secondary, #475569); line-height: 1.55 }
.rc-ajuda summary { cursor: pointer; display: flex; align-items: center; gap: 8px; color: var(--portal-text, #0f172a); list-style: none }
.rc-ajuda ul { margin: 10px 0 0; padding-left: 18px }
.rc-fundo { position: fixed; inset: 0; background: rgba(15,23,42,.45); backdrop-filter: blur(6px); z-index: 9000; display: flex; justify-content: flex-end }
.rc-gaveta { width: min(560px, 100%); height: 100%; overflow: auto; background: var(--portal-bg-secondary, #f8fafc); padding: 20px; display: flex; flex-direction: column; gap: 12px;
  animation: rcGaveta .25s ease both }
.rc-tit { display: flex; align-items: center; gap: 10px; font-size: 16px; font-weight: 500; margin: 0 0 10px }
.rc-tab { width: 100%; border-collapse: collapse; font-size: 13px }
.rc-tab th { text-align: left; font-weight: 400; color: var(--portal-text-secondary, #475569); padding: 6px 8px; background: var(--portal-bg-secondary, #f1f5f9) }
.rc-tab td { padding: 7px 8px; border-top: 1px solid var(--border, #e2e8f0); font-variant-numeric: tabular-nums }
.rc-erro { padding: 12px 14px; border-radius: 12px; font-size: 13px; margin-bottom: 14px; color: #92400e;
  background: color-mix(in srgb, #d97706 9%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #d97706 22%, transparent) }
@keyframes rcEntra { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: none } }
@keyframes rcGaveta { from { transform: translateX(30px); opacity: 0 } to { transform: none; opacity: 1 } }
@media (prefers-reduced-motion: reduce) { .rc-card, .rc-gaveta { animation: none } .rc-card.clic:hover { transform: none } }
@media (max-width: 900px) {
  .rc-linha { grid-template-columns: 1fr auto; }
  .rc-linha .col-hist, .rc-linha .col-prazo { grid-column: 1 / -1 }
  .rc-acoes { grid-column: 1 / -1; justify-content: flex-start }
  .rc-busca { max-width: none }
}
`

function Contador({ valor, dinheiro }) {
  const [v, setV] = useState(0)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) { setV(valor); return }
    let raf; const ini = performance.now()
    const passo = (t) => { const p = Math.min(1, (t - ini) / 700); setV(valor * (1 - (1 - p) ** 3)); if (p < 1) raf = requestAnimationFrame(passo) }
    raf = requestAnimationFrame(passo)
    return () => cancelAnimationFrame(raf)
  }, [valor])
  return dinheiro ? brl(v) : Math.round(v).toLocaleString('pt-BR')
}

function textoPrazo(it) {
  if (it.situacao === 'faltando') return { forte: `${it.dias_passados} dia${it.dias_passados === 1 ? '' : 's'} além do prazo`, fraco: `prazo era ${dataBR(it.prazo)}` }
  if (it.situacao === 'aguardando') return { forte: `avisa em ${dataBR(it.prazo)}`, fraco: it.atraso_costumeiro ? `costuma entrar ${it.atraso_costumeiro} dias após vencer` : 'costuma entrar antes de vencer' }
  if (it.situacao === 'lancada') return { forte: `lançada (${it.titulos_mes.length})`, fraco: it.titulos_mes.map((t) => `vence ${dataBR(t.vencimento)}`).join(' · ') }
  if (it.situacao === 'vizinho') return { forte: 'mês vizinho com conta a mais', fraco: 'provavelmente lançada com outro vencimento' }
  return { forte: DECISAO[it.decisao?.tipo] || 'resolvida', fraco: it.decisao?.criado_por_nome ? `por ${it.decisao.criado_por_nome}` : '' }
}

export default function RecorrentesNovo() {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState('faltando')
  const [empresa, setEmpresa] = useState('todas')
  const [mes, setMes] = useState('todos')
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(null)
  const [salvando, setSalvando] = useState('')

  const carregar = async () => {
    try {
      const r = await fetch('/api/financeiro/recorrentes', { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Erro ao carregar')
      setDados(j); setErro('')
    } catch (e) { setErro(e.message) }
  }
  useEffect(() => { carregar() }, [])

  const itens = dados?.itens || []
  const meses = useMemo(() => [...new Set(itens.map((i) => i.mes))].sort(), [itens])
  const base = useMemo(() => itens.filter((i) => (empresa === 'todas' || i.empresa === empresa) && (mes === 'todos' || i.mes === mes)
    && (!busca || `${i.fornecedor} ${i.categoria}`.toLowerCase().includes(busca.toLowerCase()))), [itens, empresa, mes, busca])
  const por = (s) => base.filter((i) => (Array.isArray(s) ? s.includes(i.situacao) : i.situacao === s))
  const faltando = por('faltando'), aguardando = por('aguardando'), ok = por(['lancada', 'vizinho', 'marcada'])
  const fixas = new Set(base.map((i) => `${i.empresa}|${i.fornecedor_codigo}|${i.codigo_categoria}`)).size
  const lista = filtro === 'todas' ? base : filtro === 'ok' ? ok : por(filtro)

  const decidir = async (it, tipo) => {
    setSalvando(it.chave + tipo)
    try {
      const r = await fetch('/api/financeiro/recorrentes', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ empresa: it.empresa, fornecedor_codigo: it.fornecedor_codigo, categoria: it.codigo_categoria, fornecedor_nome: it.fornecedor, tipo, mes: it.mes }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error)
      await carregar(); setAberto(null)
    } catch (e) { alert(`Não salvou: ${e.message}`) }
    setSalvando('')
  }
  const desfazer = async (it) => {
    setSalvando(it.chave + 'x')
    try {
      const r = await fetch(`/api/financeiro/recorrentes?id=${it.decisao.id}`, { method: 'DELETE', headers: await authHeaders() })
      if (!r.ok) throw new Error((await r.json()).error)
      await carregar(); setAberto(null)
    } catch (e) { alert(`Não desfez: ${e.message}`) }
    setSalvando('')
  }

  const CARDS = [
    { id: 'faltando', rotulo: 'Faltando lançar', Icone: AlertTriangle, cor: '#dc2626', lista: faltando, sub: 'passou do prazo costumeiro' },
    { id: 'aguardando', rotulo: 'Dentro do prazo', Icone: Clock, cor: '#d97706', lista: aguardando, sub: 'ainda costuma entrar' },
    { id: 'ok', rotulo: 'Lançadas ou resolvidas', Icone: CheckCircle2, cor: '#16a34a', lista: ok, sub: 'nada a fazer' },
    { id: 'todas', rotulo: 'Contas fixas acompanhadas', Icone: Repeat, cor: '#2563eb', lista: base, sub: `${fixas} fornecedores · ${meses.length} meses`, contagem: fixas },
  ]

  const Acoes = ({ it }) => (it.situacao === 'faltando' || it.situacao === 'aguardando') ? (
    <div className="rc-acoes" onClick={(e) => e.stopPropagation()}>
      <button className="rc-btn" style={{ '--c': '#16a34a' }} disabled={!!salvando || !dados?.decisoesAtivas} onClick={() => decidir(it, 'ja_lancei')}><Check size={14} /> Já lancei</button>
      <button className="rc-btn" style={{ '--c': '#7c3aed' }} disabled={!!salvando || !dados?.decisoesAtivas} onClick={() => decidir(it, 'pular_mes')}><CalendarX size={14} /> Não vai ter</button>
      <button className="rc-btn" style={{ '--c': '#64748b' }} disabled={!!salvando || !dados?.decisoesAtivas} onClick={() => decidir(it, 'nao_recorrente')}><Ban size={14} /> Não é recorrente</button>
    </div>
  ) : it.situacao === 'marcada' ? (
    <div className="rc-acoes" onClick={(e) => e.stopPropagation()}>
      <button className="rc-btn" disabled={!!salvando} onClick={() => desfazer(it)}><Undo2 size={14} /> Desfazer</button>
    </div>
  ) : <div />

  return (
    <div className="rc">
      <style>{CSS}</style>

      {erro && <div className="rc-erro">{erro}</div>}
      {dados && !dados.decisoesAtivas && (
        <div className="rc-erro">Os botões "Já lancei / Não vai ter / Não é recorrente" ficam desligados até rodar o SQL <b style={{ fontWeight: 500 }}>sql/finan-recorrentes-decisoes.sql</b>.</div>
      )}

      <details className="rc-card rc-ajuda">
        <summary><HelpCircle size={16} color="#2563eb" /> Como ler esta tela <ChevronDown size={14} style={{ marginLeft: 'auto' }} /></summary>
        <ul>
          <li>O portal olha as contas a pagar do Omie e acha as que <b style={{ fontWeight: 500 }}>se repetem todo mês</b>: mesmo fornecedor e categoria em 5 dos últimos 6 meses. Compra de peça, frete, posto e manutenção ficam de fora.</li>
          <li>Muitas contas entram no Omie <b style={{ fontWeight: 500 }}>depois</b> de vencer (salário, comissão, FGTS…). Por isso cada conta tem o seu prazo: <b style={{ fontWeight: 500 }}>dia que costuma vencer + quantos dias ela costuma demorar para entrar + 7 dias de folga</b>.</li>
          <li><span style={{ color: '#dc2626' }}>Faltando lançar</span>: passou desse prazo e não tem conta no mês. É isso que vai para o sino.</li>
          <li><span style={{ color: '#d97706' }}>Dentro do prazo</span>: ainda não tem conta, mas ainda é normal. A tela mostra o dia em que vai avisar.</li>
          <li>As bolinhas são os 6 meses anteriores + o mês do aviso (verde = teve conta). Clique na linha para ver o histórico.</li>
          <li>Se uma conta veio com outro vencimento (2 num mês e nenhuma no outro), ela aparece como <span style={{ color: '#0891b2' }}>mês vizinho</span> e não avisa.</li>
        </ul>
      </details>

      <div className="rc-topo">
        {CARDS.map((c, i) => (
          <div key={c.id} className={`rc-card clic ${filtro === c.id ? 'ativo' : ''}`} style={{ '--c': c.cor, animationDelay: `${i * 60}ms` }} onClick={() => setFiltro(c.id)}>
            <div className="rc-rot"><span className="rc-ico"><c.Icone size={18} /></span>{c.rotulo}</div>
            <div className="rc-num">{dados ? <Contador valor={c.contagem ?? c.lista.length} /> : '…'}</div>
            <div className="rc-sub">
              {c.id === 'todas' || c.id === 'ok' ? c.sub : <>{dados ? <Contador valor={c.lista.reduce((s, x) => s + x.valor_costumeiro, 0)} dinheiro /> : '…'} · {c.sub}</>}
            </div>
          </div>
        ))}
      </div>

      {faltando.length > 0 && filtro === 'faltando' && (
        <div className="rc-card rc-sino" style={{ '--c': '#dc2626' }}>
          <span className="rc-ico p"><Bell size={16} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14 }}>Assim vai aparecer no sino do {dados?.responsavel || 'responsável'} (prévia, ainda não manda nada)</div>
            {faltando.slice(0, 3).map((it) => (
              <div key={it.chave} className="rc-sino-item">
                <b style={{ fontWeight: 500 }}>{it.fornecedor}</b> ({EMPRESA[it.empresa] || it.empresa}) ainda não foi lançada em {mesBR(it.mes)}.
                Costuma vencer dia {it.dia}, uns {brl(it.valor_costumeiro)}.
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rc-barra">
        {[['todas', 'Todas as empresas'], ['NOVA', 'Nova Tratores'], ['CASTRO', 'Castro Peças']].map(([v, r]) => (
          <button key={v} className={`rc-chip ${empresa === v ? 'on' : ''}`} style={{ '--c': '#2563eb' }} onClick={() => setEmpresa(v)}>{r}</button>
        ))}
        <span style={{ width: 8 }} />
        {['todos', ...meses].map((m) => (
          <button key={m} className={`rc-chip ${mes === m ? 'on' : ''}`} style={{ '--c': '#0f766e' }} onClick={() => setMes(m)}>
            {m === 'todos' ? 'Todos os meses' : mesBR(m)}
            {m !== 'todos' && <span className="q">{itens.filter((i) => i.mes === m && i.situacao === 'faltando' && (empresa === 'todas' || i.empresa === empresa)).length}</span>}
          </button>
        ))}
        <div className="rc-busca"><Search size={15} color="#64748b" /><input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Fornecedor ou categoria" />
          {busca && <X size={15} style={{ cursor: 'pointer' }} onClick={() => setBusca('')} />}</div>
      </div>

      {!dados && !erro && <div className="rc-vazio">Lendo as contas a pagar do Omie…</div>}
      {dados && !lista.length && <div className="rc-vazio">Nada aqui. {filtro === 'faltando' ? 'Nenhuma conta fixa esquecida.' : ''}</div>}

      <div className="rc-lista">
        {lista.map((it, i) => {
          const s = SIT[it.situacao]; const p = textoPrazo(it)
          return (
            <div key={it.chave} className="rc-card rc-linha clic" style={{ '--c': s.cor, animationDelay: `${Math.min(i, 12) * 30}ms` }} onClick={() => setAberto(it)}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                <span className="rc-ico"><s.Icone size={18} /></span>
                <div style={{ minWidth: 0 }}>
                  <div className="rc-forn">{it.fornecedor}</div>
                  <div className="rc-meta">
                    <span className="rc-pill" style={{ '--c': it.empresa === 'NOVA' ? '#2563eb' : '#0f766e' }}>{EMPRESA[it.empresa] || it.empresa}</span>
                    <span>{it.categoria}</span>
                    {it.quem_lanca && <span>· costuma lançar: {it.quem_lanca}</span>}
                  </div>
                </div>
              </div>
              <div className="col-hist">
                <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}>{mesBR(it.mes)} · {it.meses_com_conta} de 6 meses</div>
                <div className="rc-bolas">
                  {it.historico.map((h, j) => (
                    <span key={h.mes} title={`${mesBR(h.mes)}: ${h.qtd ? `${h.qtd} conta(s), ${brl(h.valor)}` : 'sem conta'}`}
                      className={`rc-bola ${h.qtd ? 'tem' : ''} ${j === it.historico.length - 1 ? 'atual' : ''}`} />
                  ))}
                </div>
              </div>
              <div>
                <div className="rc-valor">{brl(it.valor_costumeiro)}</div>
                <div className="rc-sub" style={{ fontSize: 12.5 }}>vence dia {it.dia}{it.variacao > 25 ? ` · varia ±${it.variacao}%` : ''}</div>
              </div>
              <div className="col-prazo">
                <span className="rc-pill" style={{ '--c': s.cor }}>{p.forte}</span>
                <div className="rc-sub" style={{ fontSize: 12.5, marginTop: 5 }}>{p.fraco}</div>
              </div>
              <Acoes it={it} />
            </div>
          )
        })}
      </div>

      {dados && (
        <div className="rc-sub" style={{ marginTop: 16, fontSize: 12 }}>
          Responsável: {dados.responsavel} · {dados.titulosLidos.toLocaleString('pt-BR')} títulos lidos do Omie · última sincronização {dados.ultimoSync ? new Date(dados.ultimoSync).toLocaleString('pt-BR') : '—'}
        </div>
      )}

      {aberto && (
        <div className="rc-fundo" onClick={() => setAberto(null)}>
          <div className="rc-gaveta" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span className="rc-ico" style={{ '--c': SIT[aberto.situacao].cor }}>{(() => { const I = SIT[aberto.situacao].Icone; return <I size={18} /> })()}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="rc-forn">{aberto.fornecedor}</div>
                <div className="rc-meta">{EMPRESA[aberto.empresa]} · {aberto.categoria} · {mesBR(aberto.mes)}</div>
              </div>
              <button className="rc-btn" onClick={() => setAberto(null)}><X size={15} /></button>
            </div>

            <div className="rc-card">
              <div className="rc-tit"><span className="rc-ico p" style={{ '--c': '#2563eb' }}><Clock size={15} /></span>Prazo deste mês</div>
              <table className="rc-tab"><tbody>
                <tr><td>Costuma vencer</td><td style={{ textAlign: 'right' }}>dia {aberto.dia} ({dataBR(aberto.vencimento_esperado)})</td></tr>
                <tr><td>Costuma entrar no Omie</td><td style={{ textAlign: 'right' }}>{aberto.atraso_costumeiro ? `${aberto.atraso_costumeiro} dias depois de vencer` : 'antes de vencer'}</td></tr>
                <tr><td>Folga</td><td style={{ textAlign: 'right' }}>7 dias</td></tr>
                <tr><td>Avisa a partir de</td><td style={{ textAlign: 'right' }}>{dataBR(aberto.prazo)}</td></tr>
                <tr><td>Valor costumeiro</td><td style={{ textAlign: 'right' }}>{brl(aberto.valor_costumeiro)}{aberto.variacao ? ` (±${aberto.variacao}%)` : ''}</td></tr>
                <tr><td>Quem costuma lançar</td><td style={{ textAlign: 'right' }}>{aberto.quem_lanca || '—'}</td></tr>
              </tbody></table>
            </div>

            <div className="rc-card">
              <div className="rc-tit"><span className="rc-ico p" style={{ '--c': '#16a34a' }}><Repeat size={15} /></span>Últimos meses</div>
              <table className="rc-tab">
                <thead><tr><th>Mês</th><th style={{ textAlign: 'right' }}>Contas</th><th style={{ textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>{aberto.historico.map((h) => (
                  <tr key={h.mes} style={h.mes === aberto.mes ? { background: 'color-mix(in srgb, #2563eb 6%, transparent)' } : undefined}>
                    <td>{mesBR(h.mes)}{h.mes === aberto.mes ? ' (este aviso)' : ''}</td>
                    <td style={{ textAlign: 'right', color: h.qtd ? undefined : '#dc2626' }}>{h.qtd || 'nenhuma'}</td>
                    <td style={{ textAlign: 'right' }}>{h.qtd ? brl(h.valor) : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>

            {aberto.decisao && (
              <div className="rc-card" style={{ fontSize: 13.5 }}>
                Marcado como <b style={{ fontWeight: 500 }}>{DECISAO[aberto.decisao.tipo]}</b>
                {aberto.decisao.criado_por_nome ? ` por ${aberto.decisao.criado_por_nome}` : ''} em {new Date(aberto.decisao.criado_em).toLocaleDateString('pt-BR')}.
              </div>
            )}
            <Acoes it={aberto} />
          </div>
        </div>
      )}
    </div>
  )
}
