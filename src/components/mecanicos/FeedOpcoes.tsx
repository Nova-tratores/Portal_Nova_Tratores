'use client'
// Opções do bloco "Últimos faturamentos" (José, 17/10/2026: "o que podemos fazer nesse bloco para
// deixar tão bonito…" + "coloca a foto do técnico, valor hr, km e peças e requisições se tiver, almoço
// também"). Página de teste. Clicar na OS abre o PDF; clicar numa requisição abre a requisição —
// sempre numa janela, sem sair da página.
import { useEffect, useState } from 'react'
import type { OSFaturada } from '@/lib/mecanicos/painel'
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento'
import type { ReqDaOS } from './FaturamentoVivo'
import { brl, horas, kmFmt } from './ui'

export type ExtrasFeed = Record<string, { reqs: ReqDaOS[]; almoco: ReqDaOS[] }>
interface PropsFeed { ultimos: OSFaturada[]; agora: string; extras?: ExtrasFeed; fotos?: Record<string, string> }

const MUDO = 'var(--portal-text-muted, #64748b)'
const CORES = ['#2563eb', '#8b5cf6', '#10b981', '#f59e0b', '#ec4899', '#06b6d4', '#ef4444']
const corDe = (n: string) => CORES[[...n].reduce((s, c) => s + c.charCodeAt(0), 0) % CORES.length]
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }) : '')
function quando(o: OSFaturada, agora: string) {
  if (o.em) {
    const min = Math.round((Date.parse(agora) - Date.parse(o.em)) / 60_000)
    if (min < 1) return 'agora'
    if (min < 60) return `há ${min} min`
    if (o.data === agora.slice(0, 10)) return `hoje ${hora(o.em)}`
  }
  return `${o.data.slice(8)}/${o.data.slice(5, 7)}${o.em ? ` ${hora(o.em)}` : ''}`
}
const grupoDia = (o: OSFaturada, agora: string) => {
  const hoje = agora.slice(0, 10)
  const ontem = new Date(`${hoje}T12:00:00Z`); ontem.setUTCDate(ontem.getUTCDate() - 1)
  return o.data === hoje ? 'Hoje' : o.data === ontem.toISOString().slice(0, 10) ? 'Ontem' : `${o.data.slice(8)}/${o.data.slice(5, 7)}`
}

/** Janelas (PDF da OS e requisição), com animação — compartilhadas pelas opções. */
function useJanelas() {
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null)
  const [req, setReq] = useState<ReqDaOS | null>(null)
  const [verNota, setVerNota] = useState(false)
  const abrirOS = (o: OSFaturada) => { if (!o.os.startsWith('OMIE')) setDoc({ titulo: `${o.os} · ${o.cliente || ''}`, url: `/api/pos/ordens/${encodeURIComponent(o.os)}/print`, nome: o.os }) }
  const abrirReq = (r: ReqDaOS) => { setVerNota(false); setReq(r) }
  const janelas = (
    <>
      {doc && <div className="fo-doc"><VisualizadorDocumento key={doc.url} doc={doc} onClose={() => setDoc(null)} /></div>}
      {req && (
        <div className="fo-req-fundo" onClick={() => setReq(null)}>
          <div className="fo-req-jan" onClick={(e) => e.stopPropagation()}>
            <div className="fo-req-cab">
              <b>Requisição #{req.id} · {brl(req.valor)}</b><span>{req.tipo} · {req.titulo} · {req.cobrado > 0 ? `cobrada do cliente ${brl(req.cobrado)}` : 'não cobrada do cliente'}</span>
              {req.nota && <button type="button" onClick={() => setVerNota((v) => !v)}>{verNota ? 'ver requisição' : 'ver nota'}</button>}
              <button type="button" onClick={() => setReq(null)} aria-label="Fechar"><i className="fas fa-xmark" /></button>
            </div>
            <iframe key={`${req.id}:${verNota}`} src={verNota && req.nota ? req.nota : `/requisicoes/imprimir/${req.id}`} title={`Requisição ${req.id}`} />
          </div>
        </div>
      )}
    </>
  )
  return { abrirOS, abrirReq, janelas }
}

/** Foto do técnico (ou iniciais); com dois técnicos, as duas fotos sobrepostas. */
function Fotos({ o, fotos, tam = 36 }: { o: OSFaturada; fotos?: Record<string, string>; tam?: number }) {
  const ts = o.tecnicos.length ? o.tecnicos.slice(0, 2) : ['Omie']
  return (
    <span className="fo-fotos" style={{ width: tam + (ts.length - 1) * tam * 0.55, height: tam }} title={o.tecnicos.join(' + ') || 'sem técnico'}>
      {ts.map((t, i) => <Foto key={t} nome={t} url={fotos?.[t]} tam={tam} esq={i * tam * 0.55} />)}
    </span>
  )
}
function Foto({ nome, url, tam, esq }: { nome: string; url?: string; tam: number; esq: number }) {
  const [erro, setErro] = useState(false)
  return (
    <span className="fo-foto" style={{ width: tam, height: tam, left: esq, background: corDe(nome), fontSize: tam * 0.34 }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- foto do storage do portal, pequena */}
      {url && !erro ? <img src={url} alt={nome} onError={() => setErro(true)} /> : iniciais(nome)}
    </span>
  )
}

/** Os números da OS: horas, km, peças, requisições e almoço. */
function Numeros({ o, ex, onReq, compacto = false }: { o: OSFaturada; ex?: { reqs: ReqDaOS[]; almoco: ReqDaOS[] }; onReq: (r: ReqDaOS) => void; compacto?: boolean }) {
  const reqs = ex?.reqs || [], almoco = ex?.almoco || []
  const totReq = reqs.reduce((s, r) => s + r.valor, 0), totAlm = almoco.reduce((s, r) => s + r.valor, 0)
  return (
    <div className={`fo-num ${compacto ? 'compacto' : ''}`}>
      <span title="Mão de obra cobrada"><i className="fas fa-clock" style={{ color: '#2563eb' }} /><b>{brl(o.servico)}</b><small>{horas(o.horasCobradas)}</small></span>
      <span title="Deslocamento cobrado"><i className="fas fa-road" style={{ color: '#10b981' }} /><b>{brl(o.kmValor)}</b><small>{kmFmt(o.km)}</small></span>
      <span title="Peças da OS"><i className="fas fa-gears" style={{ color: '#f59e0b' }} /><b>{brl(o.pecas)}</b><small>peças</small></span>
      {reqs.length > 0 && <span className="clicavel" title={reqs.map((r) => `#${r.id} ${r.tipo} ${brl(r.valor)}${r.cobrado > 0 ? ' (cobrada)' : ' (não cobrada)'}`).join('\n')} onClick={(e) => { e.stopPropagation(); onReq(reqs[0]) }}><i className="fas fa-receipt" style={{ color: '#ef4444' }} /><b>{brl(totReq)}</b><small>{reqs.length} requisição{reqs.length > 1 ? 'ões' : ''}</small></span>}
      {almoco.length > 0 && <span className="clicavel" title={almoco.map((r) => `#${r.id} ${brl(r.valor)}`).join('\n')} onClick={(e) => { e.stopPropagation(); onReq(almoco[0]) }}><i className="fas fa-utensils" style={{ color: '#ca8a04' }} /><b>{brl(totAlm)}</b><small>almoço{almoco.length > 1 ? ` (${almoco.length})` : ''}</small></span>}
    </div>
  )
}

/** F1 — Linha do tempo: agrupada por dia; cada OS com foto, hora, cliente e os números. */
export function FeedLinhaTempo({ ultimos, agora, extras, fotos }: PropsFeed) {
  const { abrirOS, abrirReq, janelas } = useJanelas()
  const [vez, setVez] = useState(0)
  useEffect(() => { const t = setInterval(() => setVez((v) => v + 1), 3000); return () => clearInterval(t) }, [])
  const lista = ultimos.slice(0, 10)
  const ativo = lista.length ? vez % lista.length : -1
  const grupos = lista.map((o) => grupoDia(o, agora))
  return (
    <div className="fo-caixa">
      <style>{ESTILO_FO}</style>
      <div className="fo-cab"><span className="fo-vivo" /> <b>Últimos faturamentos</b><small>clique na OS para ver o PDF</small></div>
      <div className="fo-tl">
        {lista.map((o, i) => (
          <div key={o.os}>
            {(i === 0 || grupos[i] !== grupos[i - 1]) && <div className="fo-tl-dia">{grupos[i]}</div>}
            <div role="button" tabIndex={0} className={`fo-tl-item ${i === ativo ? 'ativo' : ''} ${i === 0 ? 'novo' : ''}`} style={{ animationDelay: `${i * 70}ms`, ['--c' as string]: corDe(o.tecnicos[0] || 'Omie') }} onClick={() => abrirOS(o)}>
              <span className="fo-tl-ponto" />
              <Fotos o={o} fotos={fotos} tam={34} />
              <span className="fo-tl-txt">
                <span className="fo-tl-l1"><b>{o.os}</b><small>{quando(o, agora)}</small><b className="fo-val">{brl(o.bruto)}</b></span>
                <small className="fo-cli">{o.cliente || 'Omie'} · {o.tecnicos.join(' + ') || 'sem técnico'}</small>
                <Numeros o={o} ex={extras?.[o.os]} onReq={abrirReq} compacto />
              </span>
            </div>
          </div>
        ))}
      </div>
      {janelas}
    </div>
  )
}

/** F2 — Barras de valor: resumo no topo; cada OS com barra do tamanho do valor e os números sempre à vista. */
export function FeedBarras({ ultimos, agora, extras, fotos }: PropsFeed) {
  const { abrirOS, abrirReq, janelas } = useJanelas()
  const lista = ultimos.slice(0, 8)
  const max = Math.max(1, ...lista.map((o) => o.bruto))
  const total = lista.reduce((s, o) => s + o.bruto, 0)
  return (
    <div className="fo-caixa">
      <style>{ESTILO_FO}</style>
      <div className="fo-cab"><span className="fo-vivo" /> <b>Últimos faturamentos</b></div>
      <div className="fo-resumo"><div><small>últimas {lista.length}</small><b>{brl(total)}</b></div><div><small>maior</small><b>{brl(max)}</b></div><div><small>média</small><b>{brl(lista.length ? total / lista.length : 0)}</b></div></div>
      <div className="fo-barras">
        {lista.map((o, i) => (
          <div key={o.os} role="button" tabIndex={0} className="fo-bl" style={{ animationDelay: `${i * 70}ms`, ['--c' as string]: corDe(o.tecnicos[0] || 'Omie') }} onClick={() => abrirOS(o)}>
            <span className="fo-bl-fundo" style={{ width: `${(o.bruto / max) * 100}%`, animationDelay: `${200 + i * 70}ms` }} />
            <Fotos o={o} fotos={fotos} tam={32} />
            <span className="fo-bl-txt"><b>{o.os}</b><small className="fo-cli">{o.cliente || 'Omie'}</small></span>
            <span className="fo-bl-dir"><b>{brl(o.bruto)}</b><small>{quando(o, agora)}</small></span>
            <span className="fo-bl-nums"><Numeros o={o} ex={extras?.[o.os]} onReq={abrirReq} compacto /></span>
          </div>
        ))}
      </div>
      {janelas}
    </div>
  )
}

/** F3 — Fila rolando: o de hoje em destaque e os cartões das OS subindo sem parar (para com o mouse). */
export function FeedRolando({ ultimos, agora, extras, fotos }: PropsFeed) {
  const { abrirOS, abrirReq, janelas } = useJanelas()
  const lista = ultimos.slice(0, 10)
  const fita = [...lista, ...lista]
  const hojeL = ultimos.filter((o) => o.data === agora.slice(0, 10))
  return (
    <div className="fo-caixa">
      <style>{ESTILO_FO}</style>
      <div className="fo-cab"><span className="fo-vivo" /> <b>Últimos faturamentos</b></div>
      <div className="fo-hoje"><small>Hoje</small><b>{brl(hojeL.reduce((s, o) => s + o.bruto, 0))}</b><span>{hojeL.length} OS</span></div>
      <div className="fo-rola">
        <div className="fo-rola-fita" style={{ animationDuration: `${Math.max(18, lista.length * 4)}s` }}>
          {fita.map((o, i) => (
            <div key={`${o.os}-${i}`} role="button" tabIndex={0} className="fo-rc" style={{ ['--c' as string]: corDe(o.tecnicos[0] || 'Omie') }} onClick={() => abrirOS(o)}>
              <div className="fo-rc-l1"><Fotos o={o} fotos={fotos} tam={34} /><span style={{ minWidth: 0, flex: 1 }}><b>{o.os}</b><small className="fo-cli">{o.tecnicos.join(' + ') || 'sem técnico'}</small></span><small>{quando(o, agora)}</small></div>
              <b className="fo-rc-val">{brl(o.bruto)}</b>
              <small className="fo-cli">{o.cliente || 'Omie'}</small>
              <Numeros o={o} ex={extras?.[o.os]} onReq={abrirReq} />
            </div>
          ))}
        </div>
      </div>
      {janelas}
    </div>
  )
}

const ESTILO_FO = `
.fo-caixa { position: relative; height: 100%; min-height: 360px; display: flex; flex-direction: column; gap: 8px; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e5e7eb); border-radius: 18px; padding: 14px; overflow: hidden }
.fo-cab { display: flex; align-items: center; gap: 8px; font-size: 13px } .fo-cab b { text-transform: uppercase; letter-spacing: .6px; font-size: 12px } .fo-cab small { margin-left: auto; color: ${MUDO}; font-size: 11px }
.fo-vivo { width: 9px; height: 9px; border-radius: 50%; background: #16a34a; animation: foVivo 1.6s infinite; flex-shrink: 0 } @keyframes foVivo { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.6) } 70% { box-shadow: 0 0 0 8px rgba(22,163,74,0) } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0) } }
.fo-fotos { position: relative; display: inline-block; flex-shrink: 0 }
.fo-foto { position: absolute; top: 0; border-radius: 50%; color: #fefefe; font-weight: 900; display: flex; align-items: center; justify-content: center; overflow: hidden; border: 2px solid var(--portal-bg-card, #fefefe); box-shadow: 0 2px 6px rgba(15,23,42,.18) }
.fo-foto img { width: 100%; height: 100%; object-fit: cover }
.fo-cli { display: block; font-size: 11.5px; color: ${MUDO}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0 }
.fo-num { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px }
.fo-num > span { display: inline-flex; align-items: center; gap: 4px; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 8px; padding: 3px 7px; font-size: 11.5px; line-height: 1.2 }
.fo-num i { font-size: 11px } .fo-num b { font-variant-numeric: tabular-nums } .fo-num small { color: ${MUDO}; font-size: 10.5px }
.fo-num.compacto > span { padding: 2px 6px; font-size: 11px }
.fo-num .clicavel { cursor: pointer; transition: background .15s, transform .15s } .fo-num .clicavel:hover { background: #fee2e2; transform: translateY(-1px) }
.fo-doc { position: fixed; inset: 0; z-index: 100080; animation: foDoc .4s cubic-bezier(.2,1.1,.3,1) both } @keyframes foDoc { from { opacity: 0; transform: scale(.94) } }
.fo-req-fundo { position: fixed; inset: 0; z-index: 100080; background: rgba(15,23,42,.55); display: flex; align-items: center; justify-content: center; padding: 16px; animation: foFade .2s both } @keyframes foFade { from { opacity: 0 } }
.fo-req-jan { width: min(1100px, 100%); height: 92vh; display: flex; flex-direction: column; background: var(--portal-bg-card, #fefefe); border-radius: 18px; overflow: hidden; animation: foDoc .45s cubic-bezier(.2,1.15,.3,1) both }
.fo-req-cab { display: flex; gap: 10px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--portal-border, #e5e7eb); flex-wrap: wrap } .fo-req-cab b { font-size: 16px } .fo-req-cab span { flex: 1; font-size: 13px; color: ${MUDO} }
.fo-req-cab button { border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-secondary, #f1f5f9); border-radius: 10px; padding: 6px 10px; font-family: inherit; font-weight: 800; cursor: pointer }
.fo-req-jan iframe { flex: 1; width: 100%; border: none; background: #fefefe }
/* F1 */
.fo-tl { position: relative; overflow-y: auto; display: grid; gap: 2px; padding-left: 10px }
.fo-tl::before { content: ''; position: absolute; left: 14px; top: 6px; bottom: 6px; width: 2px; background: linear-gradient(180deg, #2563eb, transparent) }
.fo-tl-dia { position: relative; font-size: 10.5px; font-weight: 900; text-transform: uppercase; letter-spacing: 1px; color: ${MUDO}; margin: 6px 0 2px 18px }
.fo-tl-item { --c: #2563eb; position: relative; display: flex; gap: 10px; align-items: flex-start; border: 1px solid transparent; border-radius: 12px; padding: 8px 8px 8px 20px; cursor: pointer; animation: foEntra .45s cubic-bezier(.2,.9,.3,1) both; transition: background .25s, border-color .25s, transform .25s }
@keyframes foEntra { from { opacity: 0; transform: translateX(14px) } }
.fo-tl-item:hover, .fo-tl-item.ativo { background: color-mix(in srgb, var(--c) 8%, transparent); border-color: color-mix(in srgb, var(--c) 30%, transparent) } .fo-tl-item.ativo { transform: translateX(3px) }
.fo-tl-ponto { position: absolute; left: 0; top: 18px; width: 10px; height: 10px; border-radius: 50%; background: var(--c); box-shadow: 0 0 0 3px var(--portal-bg-card, #fefefe) } .fo-tl-item.novo .fo-tl-ponto { animation: foVivo 1.6s infinite }
.fo-tl-txt { flex: 1; min-width: 0; display: grid } .fo-tl-l1 { display: flex; gap: 6px; align-items: baseline } .fo-tl-l1 b { font-size: 13.5px } .fo-tl-l1 small { font-size: 11px; color: ${MUDO}; white-space: nowrap }
.fo-val { margin-left: auto; font-size: 14px !important; font-variant-numeric: tabular-nums; white-space: nowrap; color: var(--c) }
/* F2 */
.fo-resumo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px } .fo-resumo div { background: var(--portal-bg-secondary, #f8fafc); border-radius: 10px; padding: 6px 8px; display: grid } .fo-resumo small { font-size: 10px; color: ${MUDO}; text-transform: uppercase; font-weight: 800 } .fo-resumo b { font-size: 14px; font-variant-numeric: tabular-nums }
.fo-barras { display: grid; gap: 6px; overflow-y: auto }
.fo-bl { --c: #2563eb; position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; gap: 4px 8px; align-items: center; border-radius: 12px; padding: 7px 9px; cursor: pointer; overflow: hidden; animation: foEntra .45s both; transition: transform .2s } .fo-bl:hover { transform: translateX(2px) }
.fo-bl-fundo { position: absolute; left: 0; top: 0; bottom: 0; background: linear-gradient(90deg, color-mix(in srgb, var(--c) 18%, transparent), color-mix(in srgb, var(--c) 5%, transparent)); border-radius: 12px; transform-origin: left; animation: foCresce .9s cubic-bezier(.2,.8,.2,1) both } @keyframes foCresce { from { transform: scaleX(0) } }
.fo-bl > *:not(.fo-bl-fundo) { position: relative } .fo-bl-txt { min-width: 0; display: grid } .fo-bl-txt b { font-size: 13px }
.fo-bl-dir { display: grid; justify-items: end } .fo-bl-dir b { font-size: 14px; font-variant-numeric: tabular-nums } .fo-bl-dir small { font-size: 10.5px; color: ${MUDO}; white-space: nowrap }
.fo-bl-nums { grid-column: 1 / -1 } .fo-bl-nums .fo-num { margin-top: 0 } .fo-bl-nums .fo-num > span { background: rgba(255,255,255,.7) }
/* F3 */
.fo-hoje { display: flex; align-items: baseline; gap: 8px; background: linear-gradient(135deg, #2563eb, #0ea5e9); color: #fefefe; border-radius: 12px; padding: 8px 12px } .fo-hoje small { font-size: 11px; font-weight: 900; text-transform: uppercase; opacity: .85 } .fo-hoje b { font-size: 20px } .fo-hoje span { margin-left: auto; font-size: 12px; opacity: .9 }
.fo-rola { position: relative; flex: 1; overflow: hidden; mask-image: linear-gradient(180deg, transparent, #000 6%, #000 94%, transparent) }
.fo-rola-fita { display: grid; gap: 8px; animation: foRola linear infinite } .fo-rola:hover .fo-rola-fita { animation-play-state: paused }
@keyframes foRola { from { transform: translateY(0) } to { transform: translateY(-50%) } }
.fo-rc { --c: #2563eb; display: grid; gap: 3px; border: 1px solid var(--portal-border, #e5e7eb); border-left: 4px solid var(--c); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 9px 11px; cursor: pointer; transition: transform .2s, box-shadow .2s } .fo-rc:hover { transform: scale(1.02); box-shadow: 0 6px 16px rgba(15,23,42,.1) }
.fo-rc-l1 { display: flex; align-items: center; gap: 8px } .fo-rc-l1 b { font-size: 13.5px } .fo-rc-l1 > small { font-size: 10.5px; color: ${MUDO}; white-space: nowrap }
.fo-rc-val { font-size: 20px; font-weight: 900; color: var(--c); font-variant-numeric: tabular-nums }
`
