'use client'
// Página de TESTE (José, 28/10/2026) das comparações do cartão do técnico em "Horas e km fantasmas".
// 1ª rodada: funil, perguntas, anéis, caminho, equipe → ele gostou do "caminho com ícones": "apaga essas e me vê mais 5 assim".
// Pedido: "os dados claramente cruzados, simples, bonito e fácil de ver qual é o erro". Tempário: "em desenvolvimento".
// Dados reais; nada aqui muda a tela de Mecânicos.
import { useEffect, useState } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { authHeaders } from '@/lib/auth/client'
import type { Fantasmas, TecnicoFantasma } from '@/lib/mecanicos/fantasmas-server'
import FuroKmJanela from '@/components/mecanicos/FuroKmJanela'

const mesSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
const h = (v: number) => `${String(Math.round(v * 10) / 10).replace('.', ',')} h`
const km = (v: number) => `${Math.round(v).toLocaleString('pt-BR')} km`
const nome2 = (n: string) => n.split(' ').slice(0, 2).join(' ')
const ini = (n: string) => n.split(' ').filter((p) => /^[A-ZÀ-Ú]/.test(p)).map((p) => p[0]).slice(0, 2).join('')

/** Os dois caminhos cruzados de um técnico: cada etapa, quanto caiu entre elas e o porquê. */
type Etapa = { ic: string; rot: string; v: number | null; cor: string }
type Queda = { v: number; txt: string; mapa?: boolean }
type Caminho = { titulo: string; ic: string; fmt: (n: number) => string; etapas: Etapa[]; quedas: (Queda | null)[]; aviso?: string }
function caminhos(t: TecnicoFantasma): Caminho[] {
  const x = t.totais
  const temCarro = t.placas.length > 0 && x.kmCarro > 0
  return [
    {
      titulo: 'O caminho do km', ic: 'fa-road', fmt: km,
      etapas: [
        { ic: 'fa-satellite-dish', rot: 'o carro rodou (GPS)', v: temCarro ? x.kmCarro : null, cor: '#64748b' },
        { ic: 'fa-clipboard-list', rot: 'ele colocou no relatório', v: x.kmRel, cor: '#2563eb' },
        { ic: 'fa-file-invoice-dollar', rot: 'foi cobrado na OS', v: x.kmCobrado, cor: '#059669' },
      ],
      quedas: [
        temCarro ? { v: Math.max(0, x.kmCarro - x.kmRel), txt: 'rodou e não pôs no relatório', mapa: true } : null,
        { v: Math.max(0, x.kmRel - x.kmCobrado), txt: 'estava no relatório e não foi cobrado' },
      ],
      aviso: temCarro ? (x.diasCarroSemOS ? `${x.diasCarroSemOS} dia${x.diasCarroSemOS === 1 ? '' : 's'} com o carro rodando e nenhuma OS (${km(x.kmSemOS)})` : undefined) : 'Sem carro vinculado: não dá para conferir com o GPS.',
    },
    {
      titulo: 'O caminho da hora', ic: 'fa-clock', fmt: h,
      etapas: [
        { ic: 'fa-stopwatch', rot: 'tempário', v: null, cor: '#7c3aed' },
        { ic: 'fa-clipboard-list', rot: 'ele apontou no relatório', v: x.horasRel, cor: '#2563eb' },
        { ic: 'fa-file-invoice-dollar', rot: 'foi cobrado na OS', v: x.horasCobradas, cor: '#059669' },
      ],
      quedas: [null, { v: x.naoCobradas, txt: 'apontou e não foi cobrado' }],
      aviso: x.ligadoSemOS > 0.05 ? `Carro ligado ${h(x.ligadoSemOS)} em dias sem nenhuma OS` : undefined,
    },
  ]
}
// a 1ª etapa da hora é o tempário: em desenvolvimento (José, 28/10/2026)
const emDesenv = (c: Caminho, i: number) => c.ic === 'fa-clock' && i === 0

const OPCOES = [
  { n: 1, t: 'Cano com vazamento', d: 'as etapas ligadas por um cano; o que se perdeu pinga num balde vermelho embaixo' },
  { n: 2, t: 'Linha de metrô', d: 'estações de cima para baixo; o que saiu do trilho fica num desvio vermelho ao lado' },
  { n: 3, t: 'Rio que se divide', d: 'uma faixa que vai afinando; cada parte perdida se separa e cai em vermelho' },
  { n: 4, t: 'Conferência entre etapas', d: 'entre uma etapa e outra uma pergunta: confere? ✓ ou ✗ com o quanto faltou' },
  { n: 5, t: 'Régua do total', d: 'uma barra só do total, dividida no que foi cobrado e em cada erro, com ícones' },
] as const

export default function TesteFantasmasPage() {
  const { userProfile } = useAuth()
  const { temAcesso, loading } = usePermissoes(userProfile?.id)
  const [d, setD] = useState<Fantasmas | null>(null)
  const [erro, setErro] = useState('')
  const [tec, setTec] = useState<string | null>(null)
  const [op, setOp] = useState(1)
  const [furo, setFuro] = useState(false)
  const mes = mesSP()
  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch(`/api/mecanicos/fantasmas?mes=${mes}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!r.ok) throw new Error(j.error || 'Falha')
        setD(j); setTec((j as Fantasmas).tecnicos[0]?.tecnico || null)
      } catch (e) { setErro(e instanceof Error ? e.message : 'Falha') }
    })()
  }, [mes])
  if (!loading && userProfile && !temAcesso('mecanicos')) return <SemPermissao />
  const t = d?.tecnicos.find((x) => x.tecnico === tec) || null
  const P = { onMapa: () => setFuro(true) }

  return (
    <div className="tf">
      <style>{ESTILO}</style>
      <div className="tf-cab">
        <span className="tf-selo">página de teste · rodada 2</span>
        <h1>O caminho do km e da hora: 5 formas</h1>
        <p>Tudo no estilo do &quot;caminho&quot;: cada etapa cruzada com a próxima e o erro em vermelho. Dados reais deste mês. Clicar no km que não foi para o relatório abre o mapa. O tempário está em desenvolvimento. Nada aqui muda a tela de Mecânicos.</p>
      </div>
      {erro && <div className="tf-erro">{erro}</div>}
      {!d && !erro && <div className="tf-carr"><i className="fas fa-circle-notch fa-spin" /> carregando os dados do mês…</div>}
      {d && (
        <>
          <div className="tf-tecs">
            {d.tecnicos.map((x) => <button key={x.tecnico} type="button" className={x.tecnico === tec ? 'on' : ''} onClick={() => setTec(x.tecnico)}><span>{ini(x.tecnico)}</span>{nome2(x.tecnico)}</button>)}
          </div>
          <div className="tf-ops">
            {OPCOES.map((o) => (
              <button key={o.n} type="button" className={op === o.n ? 'on' : ''} onClick={() => setOp(o.n)}>
                <b>{o.n}</b><span><strong>{o.t}</strong><small>{o.d}</small></span>
              </button>
            ))}
          </div>
          {t && (
            <div className="tf-palco" key={`${op}-${t.tecnico}`}>
              <div className="tf-palco-cab"><b>{t.tecnico}</b><small>{t.os.length} OS no mês · {t.placas.length ? `carro ${t.placas.join(', ')}` : 'sem carro identificado'}</small><em>Opção {op} · {OPCOES[op - 1].t}</em></div>
              {caminhos(t).map((c) => (
                <section key={c.titulo} className="tf-sec">
                  <h3><i className={`fas ${c.ic}`} /> {c.titulo}</h3>
                  {op === 1 && <Cano c={c} {...P} />}
                  {op === 2 && <Metro c={c} {...P} />}
                  {op === 3 && <Rio c={c} {...P} />}
                  {op === 4 && <Conferencia c={c} {...P} />}
                  {op === 5 && <Regua c={c} {...P} />}
                  {c.aviso && <p className="tf-aviso"><i className="fas fa-circle-info" /> {c.aviso}</p>}
                </section>
              ))}
            </div>
          )}
          {furo && t && <FuroKmJanela tecnico={t.tecnico} mes={mes} onFechar={() => setFuro(false)} />}
        </>
      )}
    </div>
  )
}

type PP = { c: Caminho; onMapa: () => void }
const Valor = ({ e, c, i }: { e: Etapa; c: Caminho; i: number }) => emDesenv(c, i) ? <em className="tf-dev">em desenvolvimento</em> : e.v == null ? <em className="tf-dev">sem carro</em> : <b>{c.fmt(e.v)}</b>
const MapaLink = ({ q, onMapa }: { q: Queda; onMapa: () => void }) => q.mapa && q.v > 0.05 ? <span role="link" className="tf-mapa" onClick={(ev) => { ev.stopPropagation(); onMapa() }}><i className="fas fa-map-location-dot" /> ver no mapa</span> : null

/* ───────── 1 · Cano com vazamento ───────── */
function Cano({ c, onMapa }: PP) {
  return (
    <div className="o1">
      {c.etapas.map((e, i) => (
        <div key={i} className="o1-par" style={{ animationDelay: `${i * 160}ms` }}>
          <div className={`o1-e ${emDesenv(c, i) || e.v == null ? 'off' : ''}`} style={{ '--c': e.cor } as React.CSSProperties}>
            <span><i className={`fas ${e.ic}`} /></span><Valor e={e} c={c} i={i} /><small>{e.rot}</small>
          </div>
          {i < c.etapas.length - 1 && (() => {
            const q = c.quedas[i]
            const vaza = !!q && q.v > 0.05
            return (
              <div className={`o1-cano ${vaza ? 'vaza' : ''} ${!q ? 'off' : ''}`}>
                <div className="o1-tubo"><i /><i /><i /></div>
                {vaza && <div className="o1-gota"><i /><i /></div>}
                {vaza ? (
                  <button type="button" className="o1-balde" onClick={q.mapa ? onMapa : undefined}>
                    <b>−{c.fmt(q.v)}</b><small>{q.txt}</small><MapaLink q={q} onMapa={onMapa} />
                  </button>
                ) : q ? <span className="o1-ok"><i className="fas fa-check" /> bateu</span> : <span className="o1-na">—</span>}
              </div>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

/* ───────── 2 · Linha de metrô ───────── */
function Metro({ c, onMapa }: PP) {
  return (
    <div className="o2">
      {c.etapas.map((e, i) => {
        const q = i < c.etapas.length - 1 ? c.quedas[i] : null
        const vaza = !!q && q.v > 0.05
        const off = emDesenv(c, i) || e.v == null
        return (
          <div key={i} className="o2-bloco" style={{ animationDelay: `${i * 150}ms` }}>
            <div className={`o2-est ${off ? 'off' : ''}`} style={{ '--c': e.cor } as React.CSSProperties}>
              <span className="o2-bola"><i className={`fas ${e.ic}`} /></span>
              <div><Valor e={e} c={c} i={i} /><small>{e.rot}</small></div>
            </div>
            {i < c.etapas.length - 1 && (
              <div className={`o2-trilho ${vaza ? 'vaza' : ''}`}>
                <i className="o2-linha" />
                {vaza ? (
                  <button type="button" className="o2-desvio" onClick={q!.mapa ? onMapa : undefined}>
                    <i className="o2-ramal" /><span><b>−{c.fmt(q!.v)}</b> {q!.txt}</span><MapaLink q={q!} onMapa={onMapa} />
                  </button>
                ) : q ? <span className="o2-ok"><i className="fas fa-check" /> tudo seguiu</span> : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ───────── 3 · Rio que se divide ───────── */
function Rio({ c, onMapa }: PP) {
  const vals = c.etapas.map((e, i) => (emDesenv(c, i) ? null : e.v))
  const mx = Math.max(...vals.map((v) => v || 0), 0.01)
  const W = 900, Hh = 150, col = W / c.etapas.length
  const alt = (v: number | null) => (v == null ? 0 : Math.max(10, (v / mx) * 110))
  return (
    <div className="o3">
      <svg viewBox={`0 0 ${W} ${Hh}`} preserveAspectRatio="none" className="o3-svg">
        {c.etapas.slice(0, -1).map((e, i) => {
          const a = vals[i], b = vals[i + 1]
          if (a == null || b == null) return null
          const x1 = i * col + col * 0.62, x2 = (i + 1) * col + col * 0.38
          const ha = alt(a), hb = alt(b), q = c.quedas[i]
          const perda = q && q.v > 0.05 ? alt(q.v) : 0
          const y = 20
          return (
            <g key={i} className="o3-g" style={{ animationDelay: `${i * 200}ms` }}>
              <path d={`M ${x1} ${y} C ${(x1 + x2) / 2} ${y}, ${(x1 + x2) / 2} ${y}, ${x2} ${y} L ${x2} ${y + hb} C ${(x1 + x2) / 2} ${y + hb}, ${(x1 + x2) / 2} ${y + ha - perda}, ${x1} ${y + ha - perda} Z`} fill={c.etapas[i + 1].cor} opacity=".28" />
              {perda > 0 && <path d={`M ${x1} ${y + ha - perda} C ${x1 + 60} ${y + ha - perda}, ${x1 + 70} ${Hh - 4}, ${x1 + 120} ${Hh - 4} L ${x1 + 120} ${Hh} C ${x1 + 60} ${Hh}, ${x1 + 40} ${y + ha}, ${x1} ${y + ha} Z`} fill="#ef4444" opacity=".55" className="o3-perda" />}
            </g>
          )
        })}
        {c.etapas.map((e, i) => <rect key={i} x={i * col + col * 0.38} y={20} width={col * 0.24} height={Math.max(4, alt(vals[i]))} rx="6" fill={vals[i] == null ? '#e2e8f0' : e.cor} className="o3-col" style={{ animationDelay: `${i * 160}ms` }} />)}
      </svg>
      <div className="o3-rot" style={{ gridTemplateColumns: `repeat(${c.etapas.length}, 1fr)` }}>
        {c.etapas.map((e, i) => <div key={i}><span style={{ color: e.cor }}><i className={`fas ${e.ic}`} /></span><Valor e={e} c={c} i={i} /><small>{e.rot}</small></div>)}
      </div>
      <div className="o3-perdas">
        {c.quedas.map((q, i) => q && q.v > 0.05 ? (
          <button key={i} type="button" onClick={q.mapa ? onMapa : undefined}><i className="fas fa-droplet" /> <b>−{c.fmt(q.v)}</b> {q.txt}<MapaLink q={q} onMapa={onMapa} /></button>
        ) : q ? <span key={i} className="ok"><i className="fas fa-check" /> {c.etapas[i].rot} → {c.etapas[i + 1].rot}: bateu</span> : null)}
      </div>
    </div>
  )
}

/* ───────── 4 · Conferência entre etapas ───────── */
function Conferencia({ c, onMapa }: PP) {
  const PERG = c.ic === 'fa-road' ? ['O que rodou está no relatório?', 'O relatório foi todo cobrado?'] : ['', 'O que apontou foi todo cobrado?']
  return (
    <div className="o4">
      {c.etapas.map((e, i) => (
        <div key={i} className="o4-par" style={{ animationDelay: `${i * 150}ms` }}>
          <div className={`o4-e ${emDesenv(c, i) || e.v == null ? 'off' : ''}`} style={{ '--c': e.cor } as React.CSSProperties}>
            <span><i className={`fas ${e.ic}`} /></span><div><Valor e={e} c={c} i={i} /><small>{e.rot}</small></div>
          </div>
          {i < c.etapas.length - 1 && (() => {
            const q = c.quedas[i]
            if (!q) return <div className="o4-q na"><i className="fas fa-arrow-right" /></div>
            const ok = q.v <= 0.05
            return (
              <button type="button" className={`o4-q ${ok ? 'ok' : 'nao'}`} onClick={!ok && q.mapa ? onMapa : undefined}>
                <small>{PERG[i]}</small>
                <span className="o4-sel"><i className={`fas ${ok ? 'fa-check' : 'fa-xmark'}`} /></span>
                <b>{ok ? 'Sim' : `Não: faltou ${c.fmt(q.v)}`}</b>
                {!ok && <MapaLink q={q} onMapa={onMapa} />}
              </button>
            )
          })()}
        </div>
      ))}
    </div>
  )
}

/* ───────── 5 · Régua do total ───────── */
function Regua({ c, onMapa }: PP) {
  const base = c.etapas.map((e, i) => (emDesenv(c, i) ? null : e.v)).find((v) => v != null) ?? 0
  const ultimo = c.etapas[c.etapas.length - 1]
  const partes = [
    { v: ultimo.v || 0, cor: ultimo.cor, ic: ultimo.ic, rot: ultimo.rot, ok: true as const, q: null as Queda | null },
    ...c.quedas.map((q, i) => q && q.v > 0.05 ? { v: q.v, cor: i === 0 && c.ic === 'fa-road' ? '#ef4444' : '#f59e0b', ic: 'fa-triangle-exclamation', rot: q.txt, ok: false as const, q } : null).filter((p): p is NonNullable<typeof p> => !!p),
  ]
  const tot = Math.max(base, partes.reduce((s, p) => s + p.v, 0), 0.01)
  return (
    <div className="o5">
      <div className="o5-topo"><span>{c.etapas.filter((e, i) => !emDesenv(c, i) && e.v != null)[0]?.rot || ''}</span><b>{c.fmt(base)}</b></div>
      <div className="o5-barra">
        {partes.map((p, i) => (
          <button key={i} type="button" className={`o5-p ${p.ok ? 'ok' : ''}`} onClick={p.q?.mapa ? onMapa : undefined} style={{ width: `${(p.v / tot) * 100}%`, '--c': p.cor, animationDelay: `${i * 180}ms` } as React.CSSProperties} title={`${p.rot}: ${c.fmt(p.v)}`}>
            {(p.v / tot) > 0.12 && <><i className={`fas ${p.ic}`} /> {c.fmt(p.v)}</>}
          </button>
        ))}
      </div>
      <div className="o5-leg">
        {partes.map((p, i) => (
          <button key={i} type="button" onClick={p.q?.mapa ? onMapa : undefined} className={p.ok ? 'ok' : 'erro'} style={{ '--c': p.cor } as React.CSSProperties}>
            <span><i className={`fas ${p.ic}`} /></span><b>{c.fmt(p.v)}</b><small>{p.rot}</small>{p.q && <MapaLink q={p.q} onMapa={onMapa} />}
          </button>
        ))}
      </div>
    </div>
  )
}

const ESTILO = `
.tf { padding: clamp(14px, 2vw, 24px) clamp(12px, 2vw, 28px); background: var(--portal-bg, #f8fafc); min-height: 100vh; color: #0f172a; display: grid; gap: 16px; align-content: start }
.tf-cab { display: grid; gap: 6px } .tf-cab h1 { margin: 0; font-size: 22px; font-weight: 600 } .tf-cab p { margin: 0; font-size: 14.5px; color: #334155; max-width: 1000px; line-height: 1.5 }
.tf-selo { justify-self: start; font-size: 12.5px; font-weight: 600; color: #7c3aed; background: #f5f3ff; border: 1px dashed #c4b5fd; border-radius: 99px; padding: 3px 10px }
.tf-erro { background: #fef2f2; color: #b91c1c; border-radius: 12px; padding: 12px } .tf-carr { padding: 40px; text-align: center; color: #475569 }
.tf-tecs { display: flex; gap: 8px; flex-wrap: wrap } .tf-tecs button { display: inline-flex; gap: 8px; align-items: center; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 5px 14px 5px 5px; font-family: inherit; font-size: 14px; cursor: pointer; color: #0f172a }
.tf-tecs button span { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; background: #f1f5f9; font-size: 12px; font-weight: 600 } .tf-tecs button.on { background: #0f172a; color: #fefefe; border-color: #0f172a } .tf-tecs button.on span { background: #fefefe; color: #0f172a }
.tf-ops { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px }
.tf-ops button { display: grid; grid-template-columns: 32px 1fr; gap: 10px; text-align: left; align-items: start; border: 1px solid #e2e8f0; background: #fefefe; border-radius: 14px; padding: 10px 12px; font-family: inherit; cursor: pointer; color: #0f172a; transition: border-color .2s, box-shadow .2s }
.tf-ops button > b { width: 32px; height: 32px; border-radius: 10px; display: grid; place-items: center; background: #f1f5f9; font-weight: 600 } .tf-ops button span { display: grid; gap: 2px } .tf-ops strong { font-size: 14px; font-weight: 500 } .tf-ops small { font-size: 12.5px; color: #475569; line-height: 1.35 }
.tf-ops button.on { border-color: #2563eb; box-shadow: inset 0 0 0 1px #2563eb } .tf-ops button.on > b { background: #2563eb; color: #fefefe }
.tf-palco { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px 20px; display: grid; gap: 22px; animation: tfEntra .4s both }
.tf-palco-cab { display: flex; gap: 6px 12px; align-items: baseline; flex-wrap: wrap } .tf-palco-cab b { font-size: 17px; font-weight: 500 } .tf-palco-cab small { color: #475569; font-size: 13.5px } .tf-palco-cab em { margin-left: auto; font-style: normal; font-size: 12.5px; color: #1d4ed8; background: #eff6ff; border-radius: 99px; padding: 3px 10px }
.tf-sec { display: grid; gap: 12px }
.tf h3 { margin: 0; font-size: 15.5px; font-weight: 500; color: #0f172a } .tf h3 i { color: #64748b; margin-right: 6px }
.tf-aviso { margin: 0; justify-self: start; font-size: 13.5px; color: #334155; background: #f8fafc; border-radius: 10px; padding: 7px 12px } .tf-aviso i { color: #64748b; margin-right: 4px }
.tf-dev { font-style: normal; font-size: 12.5px; color: #64748b; background: #f1f5f9; border: 1px dashed #cbd5e1; border-radius: 99px; padding: 2px 10px; white-space: nowrap }
.tf-mapa { display: inline-flex; gap: 4px; align-items: center; font-size: 12.5px; color: #1d4ed8; cursor: pointer; white-space: nowrap } .tf-mapa:hover { text-decoration: underline }
@keyframes tfEntra { from { opacity: 0; transform: translateY(8px) } }

/* 1 cano */
.o1 { display: grid; grid-template-columns: auto 1fr auto 1fr auto; align-items: start }
.o1-par { display: contents }
.o1-e { display: grid; justify-items: center; gap: 4px; text-align: center; min-width: 150px; animation: tfEntra .45s both }
.o1-e > span { width: 62px; height: 62px; border-radius: 20px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 12%, #fefefe); color: var(--c); font-size: 24px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 25%, transparent) }
.o1-e > b { font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums } .o1-e small { font-size: 12.5px; color: #475569 } .o1-e.off > span { filter: grayscale(1); opacity: .5 }
.o1-cano { display: grid; justify-items: center; padding-top: 26px; gap: 0 }
.o1-tubo { position: relative; width: 100%; height: 10px; border-radius: 99px; background: #e2e8f0; overflow: hidden } .o1-tubo i { position: absolute; top: 3px; width: 14px; height: 4px; border-radius: 99px; background: #60a5fa; animation: o1Anda 2.2s linear infinite } .o1-tubo i:nth-child(2) { animation-delay: .73s } .o1-tubo i:nth-child(3) { animation-delay: 1.46s }
.o1-cano.off .o1-tubo { background: repeating-linear-gradient(90deg, #e2e8f0 0 8px, transparent 8px 14px) } .o1-cano.off .o1-tubo i { display: none }
@keyframes o1Anda { from { left: -16px } to { left: 100% } }
.o1-gota { position: relative; width: 10px; height: 34px } .o1-gota i { position: absolute; left: 2px; width: 7px; height: 9px; border-radius: 50% 50% 50% 50% / 60% 60% 40% 40%; background: #ef4444; animation: o1Pinga 1.4s ease-in infinite } .o1-gota i:nth-child(2) { animation-delay: .7s }
@keyframes o1Pinga { 0% { top: 0; opacity: 0 } 20% { opacity: 1 } 100% { top: 30px; opacity: 0 } }
.o1-balde { display: grid; justify-items: center; gap: 2px; border: 0; background: #fef2f2; border-radius: 6px 6px 16px 16px; padding: 8px 14px; font-family: inherit; color: #991b1b; cursor: default; box-shadow: inset 0 -3px 0 #fecaca } .o1-balde b { font-size: 16px; font-weight: 600 } .o1-balde small { font-size: 12.5px }
.o1-ok { margin-top: 10px; font-size: 12.5px; color: #166534; background: #f0fdf4; border-radius: 99px; padding: 3px 10px } .o1-na { margin-top: 10px; color: #94a3b8 }
@media (max-width: 900px) { .o1 { grid-template-columns: 1fr } .o1-cano { padding: 6px 0 } }

/* 2 metrô */
.o2 { display: grid; max-width: 720px }
.o2-bloco { display: grid; animation: tfEntra .45s both }
.o2-est { display: grid; grid-template-columns: 46px 1fr; gap: 14px; align-items: center }
.o2-bola { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; background: var(--c); color: #fefefe; font-size: 17px; box-shadow: 0 0 0 5px color-mix(in srgb, var(--c) 18%, #fefefe) } .o2-est.off .o2-bola { background: #cbd5e1; box-shadow: 0 0 0 5px #f1f5f9 }
.o2-est div { display: grid } .o2-est b { font-size: 20px; font-weight: 500; font-variant-numeric: tabular-nums } .o2-est small { font-size: 13px; color: #475569 }
.o2-trilho { position: relative; display: grid; grid-template-columns: 46px 1fr; gap: 14px; min-height: 58px; align-items: center }
.o2-linha { grid-column: 1; justify-self: center; width: 6px; height: 100%; border-radius: 3px; background: linear-gradient(#cbd5e1, #cbd5e1) }
.o2-trilho.vaza .o2-linha { background: linear-gradient(#94a3b8, #fca5a5) }
.o2-desvio { grid-column: 2; display: flex; gap: 6px 10px; align-items: center; flex-wrap: wrap; border: 0; background: #fef2f2; color: #991b1b; border-radius: 12px; padding: 8px 14px; font-family: inherit; font-size: 14px; text-align: left; cursor: default; position: relative }
.o2-ramal { position: absolute; left: -38px; top: 50%; width: 38px; height: 4px; background: #fca5a5; border-radius: 2px }
.o2-desvio b { font-weight: 600; font-size: 15px }
.o2-ok { grid-column: 2; justify-self: start; font-size: 12.5px; color: #166534; background: #f0fdf4; border-radius: 99px; padding: 3px 10px }

/* 3 rio */
.o3 { display: grid; gap: 8px }
.o3-svg { width: 100%; height: 150px } .o3-col { transform-box: fill-box; transform-origin: top; animation: o3Desce .7s cubic-bezier(.2,.8,.2,1) both } @keyframes o3Desce { from { transform: scaleY(0) } }
.o3-g { animation: tfEntra .6s both } .o3-perda { animation: o3Cai 1s .4s both } @keyframes o3Cai { from { opacity: 0 } }
.o3-rot { display: grid; text-align: center } .o3-rot > div { display: grid; justify-items: center; gap: 2px } .o3-rot span { font-size: 18px } .o3-rot b { font-size: 19px; font-weight: 500 } .o3-rot small { font-size: 12.5px; color: #475569 }
.o3-perdas { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center } .o3-perdas button { display: inline-flex; gap: 6px; align-items: center; border: 0; background: #fef2f2; color: #991b1b; border-radius: 99px; padding: 6px 14px; font-family: inherit; font-size: 13.5px; cursor: default } .o3-perdas b { font-weight: 600 } .o3-perdas .ok { font-size: 13px; color: #166534; background: #f0fdf4; border-radius: 99px; padding: 6px 14px }

/* 4 conferência */
.o4 { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(170px, 1fr) minmax(150px, 1fr) minmax(170px, 1fr) minmax(150px, 1fr); gap: 8px; align-items: center }
.o4-par { display: contents }
.o4-e { display: grid; grid-template-columns: 46px 1fr; gap: 10px; align-items: center; background: #f8fafc; border-radius: 14px; padding: 12px; animation: tfEntra .45s both } .o4-e > span { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 12%, #fefefe); color: var(--c); font-size: 18px } .o4-e.off > span { filter: grayscale(1); opacity: .5 }
.o4-e div { display: grid } .o4-e b { font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums } .o4-e small { font-size: 12.5px; color: #475569 }
.o4-q { position: relative; display: grid; justify-items: center; gap: 4px; text-align: center; border: 0; background: transparent; font-family: inherit; color: inherit; padding: 6px; cursor: default }
.o4-q::before { content: ''; position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: #e2e8f0; z-index: 0 }
.o4-q > * { position: relative; z-index: 1 } .o4-q small { font-size: 12.5px; color: #334155; background: #fefefe; padding: 0 4px }
.o4-sel { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; font-size: 17px; border: 3px solid #fefefe; animation: o4Pula .5s .3s cubic-bezier(.3,1.6,.5,1) both } @keyframes o4Pula { from { transform: scale(0) } }
.o4-q.ok .o4-sel { background: #22c55e; color: #fefefe } .o4-q.nao .o4-sel { background: #ef4444; color: #fefefe }
.o4-q b { font-size: 13.5px; font-weight: 600; background: #fefefe; padding: 0 4px } .o4-q.ok b { color: #166534 } .o4-q.nao b { color: #b91c1c }
.o4-q.na { color: #cbd5e1; font-size: 18px; justify-items: center } .o4-q.na::before { display: none }
@media (max-width: 900px) { .o4 { grid-template-columns: 1fr } }

/* 5 régua */
.o5 { display: grid; gap: 10px }
.o5-topo { display: flex; justify-content: space-between; align-items: baseline } .o5-topo span { font-size: 13px; color: #475569 } .o5-topo b { font-size: 18px; font-weight: 500 }
.o5-barra { display: flex; height: 44px; border-radius: 14px; overflow: hidden; background: #f1f5f9; gap: 3px }
.o5-p { border: 0; background: var(--c); color: #fefefe; font-family: inherit; font-size: 14px; font-weight: 500; display: flex; gap: 6px; align-items: center; justify-content: center; white-space: nowrap; overflow: hidden; transform-origin: left; animation: o5Abre .8s cubic-bezier(.2,.8,.2,1) both; cursor: default }
.o5-p:not(.ok) { background: repeating-linear-gradient(135deg, var(--c) 0 10px, color-mix(in srgb, var(--c) 80%, #fefefe) 10px 20px) }
@keyframes o5Abre { from { transform: scaleX(0) } }
.o5-leg { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px }
.o5-leg button { display: grid; grid-template-columns: 34px 1fr; column-gap: 10px; align-items: center; text-align: left; border: 1px solid #eef2f6; background: #fefefe; border-radius: 12px; padding: 8px 12px; font-family: inherit; color: inherit; cursor: default }
.o5-leg span { grid-row: span 3; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 14%, #fefefe); color: var(--c) }
.o5-leg b { font-size: 16px; font-weight: 500 } .o5-leg .erro b { color: #b91c1c } .o5-leg small { font-size: 12.5px; color: #475569 }
`
