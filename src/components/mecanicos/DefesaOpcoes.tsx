'use client'
// Tribunal de defesas + linha do tempo de Ocorrências — opções da página de teste (José, 19/10/2026:
// "isso aqui tem que aparecer de uma outra forma"). Dados reais de /api/mecanicos/ocorrencias-painel.
// Na página de teste os botões Aceitar/Recusar NÃO julgam (só mostram como ficaria).
import { useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { Cat, OcorrenciaPainel } from '@/lib/mecanicos/ocorrencias-painel'

const MUDO = 'var(--portal-text-muted, #64748b)'
export const COR_CAT: Record<Cat, string> = { os: '#0c63e4', pv: '#7c3aed', rh: '#d97706', frota: '#0d9488', legado: '#71717a' }
export const NOME_CAT: Record<Cat, string> = { os: 'OS', pv: 'PV', rh: 'RH', frota: 'Frota', legado: 'Antigas' }
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const br = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const haQuanto = (iso: string | null) => { if (!iso) return ''; const d = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias` }
const css = (c: string) => ({ '--c': c } as React.CSSProperties)
const ehImg = (a: { tipo: string; url: string }) => /image/.test(a.tipo) || /\.(jpe?g|png|webp|gif)$/i.test(a.url)

export type DadosOc = { mes: string; periodo: { de: string; ate: string }; ocorrencias: OcorrenciaPainel[]; pendentes: OcorrenciaPainel[] }
export function useOcorrencias() {
  const [d, setD] = useState<DadosOc | null>(null)
  const [erro, setErro] = useState('')
  useEffect(() => {
    let ativo = true
    ;(async () => {
      try {
        const m = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
        const r = await fetch(`/api/mecanicos/ocorrencias-painel?mes=${m}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!ativo) return
        if (!r.ok) setErro(j.error || `Erro ${r.status}`); else setD(j)
      } catch (e) { if (ativo) setErro(e instanceof Error ? e.message : 'Falha') }
    })()
    return () => { ativo = false }
  }, [])
  return { d, erro }
}

/** Botões de julgar (na página de teste só avisam). */
function Julgar({ o, grande }: { o: OcorrenciaPainel; grande?: boolean }) {
  const [msg, setMsg] = useState('')
  return (
    <div className={`df-julgar ${grande ? 'grande' : ''}`}>
      <button type="button" className="ok" onClick={() => setMsg('Aceitaria a defesa (na página de teste não julga)')}><i className="fas fa-check" /> Aceitar · anula {o.pontos} pts</button>
      <button type="button" className="nao" onClick={() => setMsg('Recusaria a defesa (na página de teste não julga)')}><i className="fas fa-xmark" /> Recusar</button>
      {msg && <small>{msg}</small>}
    </div>
  )
}
function Defesa({ o }: { o: OcorrenciaPainel }) {
  const def = o.defesas.find((x) => x.status === 'pendente') || o.defesas[0]
  if (!def) return null
  return (
    <div className="df-fala">
      <i className="fas fa-quote-left" />
      <p>{def.texto || 'sem texto'}</p>
      <small>defesa enviada {haQuanto(def.criadaEm)}{def.anexos.length ? ` · ${def.anexos.length} anexo(s)` : ''}</small>
      {def.anexos.length > 0 && (
        <div className="df-anexos">{def.anexos.map((a, i) => ehImg(a)
          // eslint-disable-next-line @next/next/no-img-element
          ? <a key={i} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt="" /></a>
          : <a key={i} href={a.url} target="_blank" rel="noreferrer" className="arq"><i className="fas fa-paperclip" /> {a.nome || 'arquivo'}</a>)}</div>
      )}
    </div>
  )
}

// ============================================================================
/** T1 — Caixa de entrada: a lista das defesas à esquerda e a escolhida aberta à direita, com os botões grandes. */
export function T1({ d }: { d: DadosOc }) {
  const [sel, setSel] = useState(d.pendentes[0]?.id ?? null)
  const o = d.pendentes.find((x) => x.id === sel) || null
  return (
    <div className="df-caixa">
      <div className="df-tit"><b><i className="fas fa-scale-balanced" /> Defesas para julgar</b><em>{d.pendentes.length}</em></div>
      {!d.pendentes.length ? <p className="df-vazio">Nenhuma defesa esperando. 🎉</p> : (
        <div className="t1">
          <div className="t1-lista">
            {d.pendentes.map((x, i) => (
              <button key={x.id} type="button" className={sel === x.id ? 'on' : ''} style={{ ...css(COR_CAT[x.categoria]), animationDelay: `${i * 50}ms` }} onClick={() => setSel(x.id)}>
                <span className="df-av">{iniciais(x.tecnico)}</span>
                <div><b>{x.tecnico}</b><small>{x.rotulo} · {br(x.data)}</small></div>
                <strong>−{x.pontos}</strong>
              </button>
            ))}
          </div>
          {o && (
            <div className="t1-abre" key={o.id} style={css(COR_CAT[o.categoria])}>
              <div className="t1-cab"><span className="df-av g">{iniciais(o.tecnico)}</span><div><b>{o.tecnico}</b><small><span className="df-cat">{NOME_CAT[o.categoria]}</span> {o.rotulo} · {br(o.data)}{o.idOrdem ? ` · ${o.idOrdem}` : ''}</small></div><strong>−{o.pontos} pts</strong></div>
              {o.descricao && <p className="t1-desc"><small>O que aconteceu</small>{o.descricao}</p>}
              <Defesa o={o} />
              <Julgar o={o} grande />
            </div>
          )}
        </div>
      )}
      <Faixa d={d} />
    </div>
  )
}

// ============================================================================
/** T2 — Uma defesa por vez, grande, com setas; embaixo o calendário do mês com as ocorrências de cada dia. */
export function T2({ d }: { d: DadosOc }) {
  const [i, setI] = useState(0)
  const [dir, setDir] = useState(1)
  const o = d.pendentes[i]
  const ir = (n: number) => { setDir(n); setI((x) => (x + n + d.pendentes.length) % d.pendentes.length) }
  return (
    <div className="df-caixa">
      <div className="df-tit"><b><i className="fas fa-scale-balanced" /> Defesas para julgar</b><em>{d.pendentes.length}</em></div>
      {!o ? <p className="df-vazio">Nenhuma defesa esperando. 🎉</p> : (
        <div className="t2">
          <button type="button" className="t2-seta" onClick={() => ir(-1)}><i className="fas fa-chevron-left" /></button>
          <div className="t2-carta" key={o.id} style={{ ...css(COR_CAT[o.categoria]), '--d': `${dir * 40}px` } as React.CSSProperties}>
            <div className="t2-topo"><span className="df-av g">{iniciais(o.tecnico)}</span><div><b>{o.tecnico}</b><small>{o.rotulo} · {br(o.data)}{o.idOrdem ? ` · ${o.idOrdem}` : ''}</small></div><strong>−{o.pontos}</strong></div>
            <Defesa o={o} />
            <Julgar o={o} grande />
            <small className="t2-pos">{i + 1} de {d.pendentes.length}</small>
          </div>
          <button type="button" className="t2-seta" onClick={() => ir(1)}><i className="fas fa-chevron-right" /></button>
        </div>
      )}
      <Calendario d={d} />
    </div>
  )
}

// ============================================================================
/** T3 — Por técnico: uma coluna por pessoa com as ocorrências dela; as que têm defesa esperando ficam em cima, acesas. */
export function T3({ d }: { d: DadosOc }) {
  const pessoas = useMemo(() => {
    const m = new Map<string, OcorrenciaPainel[]>()
    for (const o of d.ocorrencias) m.set(o.tecnico, [...(m.get(o.tecnico) || []), o])
    return [...m.entries()].map(([t, l]) => ({ t, l: [...l].sort((a, b) => Number(d.pendentes.some((p) => p.id === b.id)) - Number(d.pendentes.some((p) => p.id === a.id)) || b.data.localeCompare(a.data)), pts: l.filter((x) => x.vale).reduce((s, x) => s + x.pontos, 0), pend: l.filter((x) => d.pendentes.some((p) => p.id === x.id)).length }))
      .sort((a, b) => b.pend - a.pend || b.pts - a.pts)
  }, [d])
  const [aberta, setAberta] = useState<number | null>(null)
  return (
    <div className="df-caixa">
      <div className="df-tit"><b><i className="fas fa-users" /> Ocorrências do mês por técnico</b><em>{d.pendentes.length} para julgar</em></div>
      <div className="t3">
        {pessoas.map((p, k) => (
          <div key={p.t} className="t3-col" style={{ animationDelay: `${k * 70}ms` }}>
            <div className="t3-cab"><span className="df-av">{iniciais(p.t)}</span><div><b>{p.t}</b><small>{p.l.length} ocorrências · −{p.pts} pts</small></div>{p.pend > 0 && <em>{p.pend}</em>}</div>
            {p.l.map((o) => {
              const pend = d.pendentes.some((x) => x.id === o.id)
              return (
                <div key={o.id} className={`t3-oc ${pend ? 'pend' : ''} ${o.vale ? '' : 'anulada'}`} style={css(COR_CAT[o.categoria])}>
                  <button type="button" onClick={() => setAberta(aberta === o.id ? null : o.id)}>
                    <span className="df-cat">{NOME_CAT[o.categoria]}</span><b>{o.rotulo}</b><small>{br(o.data)}</small><strong>{o.vale ? `−${o.pontos}` : 'anulada'}</strong>
                  </button>
                  {pend && <span className="t3-pend"><i className="fas fa-gavel" /> defesa esperando</span>}
                  {aberta === o.id && <div className="t3-det">{o.descricao && <p>{o.descricao}</p>}{o.defesas.length > 0 && <Defesa o={o} />}{pend && <Julgar o={o} />}</div>}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

// ============================================================================
/** T4 — Linha do tempo horizontal do mês: cada ocorrência é um marcador no dia; as com defesa pulsam. Clique abre embaixo. */
export function T4({ d }: { d: DadosOc }) {
  const [sel, setSel] = useState<number | null>(d.pendentes[0]?.id ?? null)
  const [filtro, setFiltro] = useState<Cat | 'todas'>('todas')
  const dias = Number(d.periodo.ate.slice(8, 10)) || 31
  const lista = d.ocorrencias.filter((o) => filtro === 'todas' || o.categoria === filtro)
  const porDia = new Map<number, OcorrenciaPainel[]>()
  for (const o of lista) { const k = Number(o.data.slice(8, 10)); porDia.set(k, [...(porDia.get(k) || []), o]) }
  const o = d.ocorrencias.find((x) => x.id === sel) || null
  const cats = (Object.keys(NOME_CAT) as Cat[]).filter((c) => d.ocorrencias.some((x) => x.categoria === c))
  return (
    <div className="df-caixa">
      <div className="df-tit"><b><i className="fas fa-timeline" /> O mês das ocorrências</b><em>{d.ocorrencias.length} · {d.pendentes.length} defesas</em></div>
      <div className="t4-chips">
        <button type="button" className={filtro === 'todas' ? 'on' : ''} onClick={() => setFiltro('todas')}>Todas</button>
        {cats.map((c) => <button key={c} type="button" className={filtro === c ? 'on' : ''} style={css(COR_CAT[c])} onClick={() => setFiltro(c)}><i />{NOME_CAT[c]} {d.ocorrencias.filter((x) => x.categoria === c).length}</button>)}
      </div>
      <div className="t4-eixo">
        {Array.from({ length: dias }, (_, k) => k + 1).map((dia) => (
          <div key={dia} className="t4-dia">
            <div className="t4-pilha">{(porDia.get(dia) || []).map((x, j) => {
              const pend = d.pendentes.some((p) => p.id === x.id)
              return <button key={x.id} type="button" title={`${x.tecnico} · ${x.rotulo} · −${x.pontos}`} className={`${pend ? 'pend' : ''} ${sel === x.id ? 'on' : ''} ${x.vale ? '' : 'anulada'}`} style={{ ...css(COR_CAT[x.categoria]), animationDelay: `${(dia * 20 + j * 40)}ms` }} onClick={() => setSel(x.id)}>{iniciais(x.tecnico)}</button>
            })}</div>
            <small>{dia}</small>
          </div>
        ))}
      </div>
      <div className="t4-leg"><span><i className="pulsa" /> com defesa esperando</span><span><i className="vaz" /> anulada</span><span>a sigla é o técnico · clique abre embaixo</span></div>
      {o && (
        <div className="t4-det" key={o.id} style={css(COR_CAT[o.categoria])}>
          <div className="t1-cab"><span className="df-av g">{iniciais(o.tecnico)}</span><div><b>{o.tecnico}</b><small><span className="df-cat">{NOME_CAT[o.categoria]}</span> {o.rotulo} · {br(o.data)}{o.idOrdem ? ` · ${o.idOrdem}` : ''} · {o.origem}</small></div><strong>{o.vale ? `−${o.pontos} pts` : 'anulada'}</strong></div>
          {o.descricao && <p className="t1-desc"><small>O que aconteceu</small>{o.descricao}</p>}
          {o.defesas.length > 0 && <Defesa o={o} />}
          {d.pendentes.some((p) => p.id === o.id) && <Julgar o={o} />}
        </div>
      )}
    </div>
  )
}

/** Faixa compacta das ocorrências do mês (usada na T1). */
function Faixa({ d }: { d: DadosOc }) {
  return (
    <div className="df-faixa">
      <small>Ocorrências do mês:</small>
      {d.ocorrencias.slice(0, 14).map((o) => <span key={o.id} style={css(COR_CAT[o.categoria])} title={`${o.tecnico} · ${o.rotulo}`} className={o.vale ? '' : 'anulada'}><i />{br(o.data)} {o.tecnico.split(' ')[0]} <b>{o.vale ? `−${o.pontos}` : '0'}</b></span>)}
    </div>
  )
}
/** Calendário do mês com bolinhas por dia (usado na T2). */
function Calendario({ d }: { d: DadosOc }) {
  const ini = new Date(`${d.periodo.de}T12:00:00Z`).getUTCDay()
  const dias = Number(d.periodo.ate.slice(8, 10)) || 31
  const [dia, setDia] = useState<number | null>(null)
  const do_ = (k: number) => d.ocorrencias.filter((o) => Number(o.data.slice(8, 10)) === k)
  return (
    <div className="df-cal">
      <div className="df-cal-g">
        {['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'].map((x) => <small key={x}>{x}</small>)}
        {Array.from({ length: ini }, (_, k) => <span key={`v${k}`} />)}
        {Array.from({ length: dias }, (_, k) => k + 1).map((k) => {
          const l = do_(k)
          return <button key={k} type="button" className={`${l.length ? 'tem' : ''} ${dia === k ? 'on' : ''}`} onClick={() => setDia(dia === k ? null : k)}><b>{k}</b><span>{l.slice(0, 4).map((o) => <i key={o.id} style={{ background: COR_CAT[o.categoria] }} />)}</span></button>
        })}
      </div>
      <div className="df-cal-lista">
        {dia == null ? <small>Clique num dia para ver as ocorrências dele.</small> : do_(dia).length ? do_(dia).map((o) => <div key={o.id} style={css(COR_CAT[o.categoria])}><span className="df-cat">{NOME_CAT[o.categoria]}</span><b>{o.tecnico}</b><span>{o.rotulo}</span><strong>{o.vale ? `−${o.pontos}` : 'anulada'}</strong></div>) : <small>Nada neste dia.</small>}
      </div>
    </div>
  )
}

export const ESTILO_DF = `
@keyframes dfEntra { from { opacity: 0; transform: translateY(8px) } } @keyframes dfDesliza { from { opacity: 0; transform: translateX(var(--d)) } } @keyframes dfPulso { 0% { box-shadow: 0 0 0 0 rgba(217,119,6,.55) } 70% { box-shadow: 0 0 0 7px rgba(217,119,6,0) } 100% { box-shadow: none } }
.df-caixa { display: grid; gap: 12px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 16px 18px }
.df-tit { display: flex; gap: 8px; align-items: center } .df-tit b { font-size: 16px; color: var(--portal-text, #0f172a) } .df-tit b i { color: #d97706; margin-right: 4px } .df-tit em { font-style: normal; font-size: 12px; font-weight: 900; color: #fefefe; background: #d97706; border-radius: 99px; padding: 2px 9px }
.df-vazio { margin: 0; color: ${MUDO}; font-size: 13.5px }
.df-av { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; flex-shrink: 0; font-size: 12px; font-weight: 900; color: var(--c, #0f172a); background: color-mix(in srgb, var(--c, #64748b) 14%, transparent) } .df-av.g { width: 44px; height: 44px; font-size: 15px; background: var(--c); color: #fefefe }
.df-cat { display: inline-block; font-size: 10.5px; font-weight: 900; color: #fefefe; background: var(--c); border-radius: 6px; padding: 1px 6px; margin-right: 4px }
.df-fala { position: relative; background: var(--portal-bg-secondary, #f8fafc); border-radius: 14px; padding: 12px 14px 10px 36px } .df-fala > i { position: absolute; left: 12px; top: 12px; color: var(--c, #94a3b8); opacity: .6 } .df-fala p { margin: 0; font-size: 14.5px; font-style: italic; line-height: 1.45; color: var(--portal-text, #0f172a) } .df-fala small { font-size: 11.5px; color: ${MUDO} }
.df-anexos { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px } .df-anexos img { width: 70px; height: 54px; object-fit: cover; border-radius: 8px } .df-anexos .arq { font-size: 12px; font-weight: 700; color: #0369a1 }
.df-julgar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap } .df-julgar button { border-radius: 99px; padding: 7px 14px; font-family: inherit; font-weight: 800; font-size: 13px; cursor: pointer; border: 1px solid; transition: all .2s }
.df-julgar .ok { color: #047857; border-color: #a7f3d0; background: #ecfdf5 } .df-julgar .ok:hover { background: #047857; color: #fefefe } .df-julgar .nao { color: #b91c1c; border-color: #fecaca; background: #fef2f2 } .df-julgar .nao:hover { background: #b91c1c; color: #fefefe }
.df-julgar.grande button { padding: 10px 18px; font-size: 14px } .df-julgar small { font-size: 12px; color: ${MUDO}; animation: dfEntra .3s both }
.t1 { display: grid; grid-template-columns: minmax(240px, 320px) 1fr; gap: 12px; min-height: 280px } @media (max-width: 800px) { .t1 { grid-template-columns: 1fr } }
.t1-lista { display: grid; gap: 4px; align-content: start; max-height: 420px; overflow-y: auto }
.t1-lista button { display: flex; gap: 10px; align-items: center; border: 1px solid transparent; background: transparent; border-radius: 12px; padding: 8px 10px; font-family: inherit; text-align: left; cursor: pointer; animation: dfEntra .35s both; transition: background .2s }
.t1-lista button:hover { background: var(--portal-bg-secondary, #f8fafc) } .t1-lista button.on { background: color-mix(in srgb, var(--c) 9%, var(--portal-bg-card, #fefefe)); border-color: color-mix(in srgb, var(--c) 30%, transparent) }
.t1-lista button > div { flex: 1; min-width: 0; display: grid } .t1-lista b { font-size: 13.5px } .t1-lista small { font-size: 12px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .t1-lista strong { color: #dc2626; font-size: 14px }
.t1-abre, .t4-det { display: grid; gap: 10px; align-content: start; background: color-mix(in srgb, var(--c) 4%, var(--portal-bg-card, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 20%, transparent); border-radius: 16px; padding: 14px 16px; animation: dfEntra .35s both }
.t1-cab { display: flex; gap: 12px; align-items: center } .t1-cab > div { flex: 1; min-width: 0; display: grid } .t1-cab b { font-size: 16px } .t1-cab small { font-size: 12.5px; color: ${MUDO} } .t1-cab strong { font-size: 20px; color: #dc2626 }
.t1-desc { margin: 0; font-size: 13.5px; color: var(--portal-text, #334155) } .t1-desc small { display: block; font-size: 11px; font-weight: 900; text-transform: uppercase; color: ${MUDO} }
.df-faixa { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 10px } .df-faixa > small { font-size: 12px; font-weight: 800; color: ${MUDO} }
.df-faixa span { display: inline-flex; gap: 5px; align-items: center; font-size: 12px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 99px; padding: 3px 9px } .df-faixa span i { width: 7px; height: 7px; border-radius: 50%; background: var(--c) } .df-faixa b { color: #dc2626 } .df-faixa .anulada { opacity: .5 }
.t2 { display: grid; grid-template-columns: 44px 1fr 44px; gap: 10px; align-items: center }
.t2-seta { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); cursor: pointer; color: ${MUDO} } .t2-seta:hover { color: #0f172a; border-color: #94a3b8 }
.t2-carta { display: grid; gap: 12px; border-radius: 20px; padding: 18px 20px; background: linear-gradient(160deg, color-mix(in srgb, var(--c) 8%, var(--portal-bg-card, #fefefe)), var(--portal-bg-card, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); box-shadow: 0 12px 28px rgba(15,23,42,.08); animation: dfDesliza .4s cubic-bezier(.2,.8,.2,1) both }
.t2-topo { display: flex; gap: 12px; align-items: center } .t2-topo > div { flex: 1; display: grid } .t2-topo b { font-size: 17px } .t2-topo small { font-size: 12.5px; color: ${MUDO} } .t2-topo strong { font-size: 26px; color: #dc2626 } .t2-pos { justify-self: center; font-size: 12px; font-weight: 800; color: ${MUDO} }
.df-cal { display: grid; grid-template-columns: minmax(280px, 380px) 1fr; gap: 14px; border-top: 1px dashed var(--portal-border, #e5e7eb); padding-top: 12px } @media (max-width: 800px) { .df-cal { grid-template-columns: 1fr } }
.df-cal-g { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px } .df-cal-g small { font-size: 10.5px; font-weight: 800; color: ${MUDO}; text-align: center }
.df-cal-g button { aspect-ratio: 1; border: 1px solid transparent; background: var(--portal-bg-secondary, #f8fafc); border-radius: 9px; display: grid; place-items: center; align-content: center; gap: 2px; font-family: inherit; cursor: pointer; transition: transform .15s } .df-cal-g button b { font-size: 12px; color: ${MUDO} } .df-cal-g button.tem b { color: var(--portal-text, #0f172a) }
.df-cal-g button span { display: flex; gap: 2px } .df-cal-g button i { width: 6px; height: 6px; border-radius: 50% } .df-cal-g button:hover { transform: scale(1.08) } .df-cal-g button.on { border-color: #0f172a }
.df-cal-lista { display: grid; gap: 6px; align-content: start } .df-cal-lista small { color: ${MUDO}; font-size: 12.5px } .df-cal-lista > div { display: grid; grid-template-columns: auto auto 1fr auto; gap: 8px; align-items: center; font-size: 13px; animation: dfEntra .3s both } .df-cal-lista strong { color: #dc2626 }
.t3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 10px; align-items: start }
.t3-col { display: grid; gap: 6px; background: var(--portal-bg-secondary, #f8fafc); border-radius: 16px; padding: 10px; animation: dfEntra .4s both }
.t3-cab { display: flex; gap: 8px; align-items: center; padding: 2px 2px 6px } .t3-cab > div { flex: 1; min-width: 0; display: grid } .t3-cab b { font-size: 13.5px } .t3-cab small { font-size: 11.5px; color: ${MUDO} } .t3-cab em { font-style: normal; min-width: 22px; height: 22px; border-radius: 99px; display: grid; place-items: center; background: #d97706; color: #fefefe; font-size: 11.5px; font-weight: 900 }
.t3-oc { background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 12px; overflow: hidden } .t3-oc.pend { border-color: #fbbf24; box-shadow: 0 0 0 2px rgba(251,191,36,.25) } .t3-oc.anulada { opacity: .55 }
.t3-oc > button { width: 100%; display: grid; grid-template-columns: auto 1fr auto auto; gap: 6px; align-items: center; border: none; background: transparent; padding: 8px 10px; font-family: inherit; text-align: left; cursor: pointer; font-size: 12.5px } .t3-oc > button b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis } .t3-oc > button small { color: ${MUDO} } .t3-oc > button strong { color: #dc2626 }
.t3-pend { display: block; font-size: 11px; font-weight: 800; color: #b45309; padding: 0 10px 6px }
.t3-det { display: grid; gap: 8px; padding: 0 10px 10px; animation: dfEntra .3s both } .t3-det > p { margin: 0; font-size: 12.5px; color: var(--portal-text, #334155) }
.t4-chips { display: flex; gap: 6px; flex-wrap: wrap } .t4-chips button { --c: #0f172a; display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 800; cursor: pointer } .t4-chips button i { width: 8px; height: 8px; border-radius: 50%; background: var(--c) } .t4-chips button.on { background: var(--c); color: #fefefe; border-color: var(--c) } .t4-chips button.on i { background: #fefefe }
.t4-eixo { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(26px, 1fr); gap: 2px; overflow-x: auto; border-bottom: 2px solid var(--portal-border, #e2e8f0); padding-bottom: 2px }
.t4-dia { display: grid; grid-template-rows: 1fr auto; justify-items: center; min-height: 120px } .t4-dia small { font-size: 10.5px; color: ${MUDO} }
.t4-pilha { display: flex; flex-direction: column-reverse; gap: 3px; align-items: center; justify-content: flex-start }
.t4-pilha button { width: 26px; height: 26px; border-radius: 50%; border: 2px solid var(--c); background: var(--c); color: #fefefe; font-family: inherit; font-size: 9.5px; font-weight: 900; cursor: pointer; animation: dfEntra .35s both; transition: transform .2s } .t4-pilha button:hover { transform: scale(1.2) }
.t4-pilha button.anulada { background: var(--portal-bg-card, #fefefe); color: var(--c) } .t4-pilha button.pend { animation: dfEntra .35s both, dfPulso 1.8s 1s infinite; border-color: #f59e0b } .t4-pilha button.on { transform: scale(1.22); box-shadow: 0 0 0 3px rgba(15,23,42,.25) }
.t4-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: ${MUDO} } .t4-leg i { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 5px; vertical-align: -1px } .t4-leg i.pulsa { background: #f59e0b } .t4-leg i.vaz { border: 2px solid #94a3b8 }
`
