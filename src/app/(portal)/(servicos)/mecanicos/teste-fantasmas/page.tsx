'use client'
// Página de TESTE (José, 28/10/2026: "faz uma página teste para me apresentar 5 formas dinâmicas e fáceis de entender")
// das comparações do cartão do técnico em "Horas e km fantasmas". Dados reais; nada aqui muda a tela de Mecânicos.
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
const pc = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
const tomPc = (p: number) => (p >= 90 ? 'ok' : p >= 70 ? 'a' : 'v')
const nome2 = (n: string) => n.split(' ').slice(0, 2).join(' ')
const ini = (n: string) => n.split(' ').filter((p) => /^[A-ZÀ-Ú]/.test(p)).map((p) => p[0]).slice(0, 2).join('')

const OPCOES = [
  { n: 1, t: 'Funil', d: 'o que rodou → o que apontou → o que cobrou, e onde cada parte se perdeu' },
  { n: 2, t: 'Perguntas sim/não', d: 'uma pergunta por assunto com a resposta grande; clique para ver os números' },
  { n: 3, t: 'Anéis de aproveitamento', d: 'quantos % de cada coisa virou cobrança, como um medidor' },
  { n: 4, t: 'Caminho com ícones', d: 'o km e a hora andando de uma etapa para a outra, com o que caiu no caminho' },
  { n: 5, t: 'Contra a equipe', d: 'onde este técnico está perto dos outros mecânicos em cada ponto' },
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

  return (
    <div className="tf">
      <style>{ESTILO}</style>
      <div className="tf-cab">
        <span className="tf-selo">página de teste</span>
        <h1>Horas e km do técnico: 5 formas de mostrar</h1>
        <p>São os mesmos números do cartão em &quot;Horas e km fantasmas&quot;, com os dados reais deste mês. Troque o técnico e a opção. Onde aparece o km não cobrado, clicar abre o mapa do furo. Nada aqui muda a tela de Mecânicos.</p>
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
              {op === 1 && <Funil t={t} onFuro={() => setFuro(true)} />}
              {op === 2 && <Perguntas t={t} onFuro={() => setFuro(true)} />}
              {op === 3 && <Aneis t={t} onFuro={() => setFuro(true)} />}
              {op === 4 && <Caminho t={t} onFuro={() => setFuro(true)} />}
              {op === 5 && <Equipe t={t} todos={d.tecnicos} />}
            </div>
          )}
          {furo && t && <FuroKmJanela tecnico={t.tecnico} mes={mes} onFechar={() => setFuro(false)} />}
        </>
      )}
    </div>
  )
}

type P = { t: TecnicoFantasma; onFuro: () => void }

/* ───────── 1 · Funil ───────── */
const Degrau = ({ ic, rot, v, mx, fmt, cor, i }: { ic: string; rot: string; v: number; mx: number; fmt: (n: number) => string; cor: string; i: number }) => (
  <div className="f1-deg" style={{ '--w': `${Math.max(18, (v / mx) * 100)}%`, '--c': cor, animationDelay: `${i * 140}ms` } as React.CSSProperties}>
    <div className="f1-barra"><i className={`fas ${ic}`} /> <span>{rot}</span><b>{fmt(v)}</b></div>
  </div>
)
const Perda = ({ v, fmt, txt, onClick, i }: { v: number; fmt: (n: number) => string; txt: string; onClick?: () => void; i: number }) => v > 0.05
  ? <button type="button" className={`f1-perda ${onClick ? 'clica' : ''}`} onClick={onClick} style={{ animationDelay: `${i * 140 + 70}ms` }}><i className="fas fa-arrow-turn-down" /> <b>−{fmt(v)}</b> {txt}{onClick && <u> · ver no mapa →</u>}</button>
  : <div className="f1-perda ok" style={{ animationDelay: `${i * 140 + 70}ms` }}><i className="fas fa-check" /> nada se perdeu aqui</div>

function Funil({ t, onFuro }: P) {
  const x = t.totais
  const mxK = Math.max(x.kmCarro, x.kmRel, x.kmCobrado, 1), mxH = Math.max(x.horasRel, x.horasCobradas, 1)
  return (
    <div className="f1">
      <section>
        <h3><i className="fas fa-road" /> Quilômetros</h3>
        <Degrau i={0} ic="fa-satellite-dish" rot="o carro rodou (GPS)" v={x.kmCarro} mx={mxK} fmt={km} cor="#64748b" />
        <Perda i={0} v={Math.max(0, x.kmCarro - x.kmRel)} fmt={km} txt="rodados que não estão em nenhum relatório" onClick={onFuro} />
        <Degrau i={1} ic="fa-clipboard-list" rot="ele colocou no relatório" v={x.kmRel} mx={mxK} fmt={km} cor="#2563eb" />
        <Perda i={1} v={Math.max(0, x.kmRel - x.kmCobrado)} fmt={km} txt="do relatório que não foram cobrados na OS" />
        <Degrau i={2} ic="fa-file-invoice-dollar" rot="foi cobrado na OS" v={x.kmCobrado} mx={mxK} fmt={km} cor="#059669" />
        <p className="f1-fim">De cada 100 km que o carro rodou, <b>{pc(x.kmCobrado, x.kmCarro)}</b> foram cobrados.</p>
      </section>
      <section>
        <h3><i className="fas fa-clock" /> Horas</h3>
        <Degrau i={0} ic="fa-clipboard-list" rot="ele apontou no relatório" v={x.horasRel} mx={mxH} fmt={h} cor="#2563eb" />
        <Perda i={0} v={x.naoCobradas} fmt={h} txt="apontadas e não cobradas na OS" />
        <Degrau i={1} ic="fa-file-invoice-dollar" rot="foi cobrado na OS" v={x.horasCobradas} mx={mxH} fmt={h} cor="#059669" />
        <div className="f1-extra">
          <span><i className="fas fa-stopwatch" /> Tempário: nas OS analisadas ele levou <b>{h(x.acimaTempario)}</b> a mais do que o tempário prevê</span>
          <span><i className="fas fa-car" /> Carro ligado em dia sem OS: <b>{h(x.ligadoSemOS)}</b></span>
        </div>
        <p className="f1-fim">De cada 10 h apontadas, <b>{(Math.round((x.horasRel ? x.horasCobradas / x.horasRel : 0) * 100) / 10).toLocaleString('pt-BR')} h</b> foram cobradas.</p>
      </section>
    </div>
  )
}

/* ───────── 2 · Perguntas sim/não ───────── */
function Perguntas({ t, onFuro }: P) {
  const x = t.totais
  const [aberta, setAberta] = useState<number | null>(0)
  const qs = [
    { q: 'Cobrou todo km que o carro rodou?', ok: x.kmCobrado >= x.kmCarro * 0.95, r: x.kmCarro > x.kmCobrado ? `Não. Faltou cobrar ${km(x.kmCarro - x.kmCobrado)} (${100 - pc(x.kmCobrado, x.kmCarro)}% do que rodou)` : 'Sim', a: ['GPS', x.kmCarro, km], b: ['cobrado', x.kmCobrado, km], furo: true },
    { q: 'Todo km rodado está nos relatórios?', ok: x.kmFantasma <= x.kmCarro * 0.05, r: x.kmFantasma > 0 ? `Não. ${km(x.kmFantasma)} rodados fora dos relatórios${x.diasCarroSemOS ? `, ${x.diasCarroSemOS} dia${x.diasCarroSemOS === 1 ? '' : 's'} sem nenhuma OS` : ''}` : 'Sim', a: ['GPS', x.kmCarro, km], b: ['relatório', x.kmRel, km], furo: true },
    { q: 'Todo km do relatório foi cobrado?', ok: x.kmCobrado >= x.kmRel * 0.95, r: x.kmRel > x.kmCobrado ? `Não. ${km(x.kmRel - x.kmCobrado)} ficaram fora da OS` : 'Sim', a: ['relatório', x.kmRel, km], b: ['cobrado', x.kmCobrado, km] },
    { q: 'Cobrou todas as horas que ele apontou?', ok: x.naoCobradas <= 0.5, r: x.naoCobradas > 0.5 ? `Não. ${h(x.naoCobradas)} apontadas e não cobradas` : 'Sim', a: ['apontado', x.horasRel, h], b: ['cobrado', x.horasCobradas, h] },
    { q: 'Ficou dentro do tempário?', ok: x.acimaTempario <= 1, r: x.acimaTempario > 1 ? `Não. Levou ${h(x.acimaTempario)} a mais que o tempário nas OS analisadas` : 'Sim, dentro do tempo', a: ['apontado', x.horasRelAnalisadas, h], b: ['tempário', x.horasPrevistas, h] },
    { q: 'O carro só ficou ligado em dia de OS?', ok: x.ligadoSemOS <= 0.5, r: x.ligadoSemOS > 0.5 ? `Não. ${h(x.ligadoSemOS)} de carro ligado em dia sem OS` : 'Sim', a: ['ligado', x.ligadoH, h], b: ['ligado sem OS', x.ligadoSemOS, h] },
  ] as const
  const bons = qs.filter((q) => q.ok).length
  return (
    <div className="f2">
      <div className="f2-placar"><b>{bons} de {qs.length}</b> respostas boas</div>
      {qs.map((q, i) => {
        const [ra, va, fa] = q.a, [rb, vb, fb] = q.b
        const mx = Math.max(va as number, vb as number, 0.01)
        return (
          <button key={i} type="button" className={`f2-q ${q.ok ? 'ok' : 'nao'} ${aberta === i ? 'on' : ''}`} onClick={() => setAberta(aberta === i ? null : i)} style={{ animationDelay: `${i * 80}ms` }}>
            <span className="f2-ic"><i className={`fas ${q.ok ? 'fa-check' : 'fa-xmark'}`} /></span>
            <span className="f2-txt"><small>{q.q}</small><b>{q.r}</b></span>
            <i className={`fas fa-chevron-${aberta === i ? 'up' : 'down'} f2-seta`} />
            {aberta === i && (
              <span className="f2-det">
                {[[ra, va, fa, '#2563eb'], [rb, vb, fb, '#059669']].map(([r, v, f, c]) => (
                  <span key={r as string} className="f2-l"><small>{r as string}</small><span><i style={{ width: `${((v as number) / mx) * 100}%`, background: c as string }} /></span><b>{(f as (n: number) => string)(v as number)}</b></span>
                ))}
                {'furo' in q && !q.ok && <span className="f2-mapa" role="link" onClick={(e) => { e.stopPropagation(); onFuro() }}><i className="fas fa-map-location-dot" /> ver no mapa onde foi o furo →</span>}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/* ───────── 3 · Anéis ───────── */
function Anel({ p, rot, sub, onClick, i }: { p: number; rot: string; sub: string; onClick?: () => void; i: number }) {
  const tom = tomPc(p)
  const C = 2 * Math.PI * 42
  return (
    <button type="button" className={`f3-a ${tom} ${onClick ? 'clica' : ''}`} onClick={onClick} style={{ animationDelay: `${i * 110}ms` }}>
      <svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" className="tr" /><circle cx="50" cy="50" r="42" className="ch" style={{ strokeDasharray: `${(Math.min(100, p) / 100) * C} ${C}`, animationDelay: `${i * 110}ms` }} /></svg>
      <span className="f3-v"><b>{p}%</b></span>
      <strong>{rot}</strong><small>{sub}</small>
      {onClick && <u><i className="fas fa-map-location-dot" /> ver no mapa</u>}
    </button>
  )
}
function Aneis({ t, onFuro }: P) {
  const x = t.totais
  const dentro = x.horasRelAnalisadas ? Math.max(0, Math.round(100 - (x.acimaTempario / x.horasRelAnalisadas) * 100)) : 100
  return (
    <div className="f3">
      <div className="f3-grupo"><h3><i className="fas fa-road" /> Quilômetros</h3>
        <div className="f3-lin">
          <Anel i={0} p={pc(x.kmCobrado, x.kmCarro)} rot="do km rodado foi cobrado" sub={`${km(x.kmCobrado)} de ${km(x.kmCarro)} do GPS`} onClick={x.kmCarro > x.kmCobrado ? onFuro : undefined} />
          <Anel i={1} p={pc(x.kmRel, x.kmCarro)} rot="do km rodado está no relatório" sub={`${km(x.kmRel)} de ${km(x.kmCarro)} do GPS`} onClick={x.kmFantasma > 0 ? onFuro : undefined} />
          <Anel i={2} p={pc(x.kmCobrado, x.kmRel)} rot="do km do relatório foi cobrado" sub={`${km(x.kmCobrado)} de ${km(x.kmRel)} no relatório`} />
        </div>
      </div>
      <div className="f3-grupo"><h3><i className="fas fa-clock" /> Horas</h3>
        <div className="f3-lin">
          <Anel i={3} p={pc(x.horasCobradas, x.horasRel)} rot="das horas apontadas foram cobradas" sub={`${h(x.horasCobradas)} de ${h(x.horasRel)}`} />
          <Anel i={4} p={dentro} rot="das horas ficaram dentro do tempário" sub={`${h(x.acimaTempario)} acima, nas OS analisadas`} />
          <Anel i={5} p={pc(Math.max(0, x.ligadoH - x.ligadoSemOS), x.ligadoH)} rot="do carro ligado foi em dia de OS" sub={`${h(x.ligadoSemOS)} ligado sem OS`} />
        </div>
      </div>
      <p className="f3-leg"><span className="ok" /> 90% ou mais <span className="a" /> de 70% a 89% <span className="v" /> abaixo de 70%</p>
    </div>
  )
}

/* ───────── 4 · Caminho com ícones ───────── */
const Etapa = ({ ic, rot, v, cor, i }: { ic: string; rot: string; v: string; cor: string; i: number }) => (
  <div className="f4-e" style={{ '--c': cor, animationDelay: `${i * 160}ms` } as React.CSSProperties}><span><i className={`fas ${ic}`} /></span><b>{v}</b><small>{rot}</small></div>
)
const Seta = ({ perda, txt, onClick, i }: { perda: string | null; txt: string; onClick?: () => void; i: number }) => (
  <div className={`f4-s ${perda ? 'perde' : ''}`} style={{ animationDelay: `${i * 160 + 80}ms` }}>
    <div className="f4-fio"><i /><i /><i /></div>
    {perda ? <button type="button" className={onClick ? 'clica' : ''} onClick={onClick}><b>−{perda}</b><small>{txt}</small>{onClick && <u>ver no mapa →</u>}</button> : <span className="ok"><i className="fas fa-check" /> sem perda</span>}
  </div>
)

function Caminho({ t, onFuro }: P) {
  const x = t.totais
  const dK1 = Math.max(0, x.kmCarro - x.kmRel), dK2 = Math.max(0, x.kmRel - x.kmCobrado)
  return (
    <div className="f4">
      <section>
        <h3><i className="fas fa-road" /> O caminho do km</h3>
        <div className="f4-lin">
          <Etapa i={0} ic="fa-satellite-dish" rot="o carro rodou (GPS)" v={km(x.kmCarro)} cor="#64748b" />
          <Seta i={0} perda={dK1 > 0 ? km(dK1) : null} txt="não foram para o relatório" onClick={onFuro} />
          <Etapa i={1} ic="fa-clipboard-list" rot="no relatório do técnico" v={km(x.kmRel)} cor="#2563eb" />
          <Seta i={1} perda={dK2 > 0 ? km(dK2) : null} txt="não foram cobrados" />
          <Etapa i={2} ic="fa-file-invoice-dollar" rot="cobrado na OS" v={km(x.kmCobrado)} cor="#059669" />
        </div>
      </section>
      <section>
        <h3><i className="fas fa-clock" /> O caminho da hora</h3>
        <div className="f4-lin">
          <Etapa i={0} ic="fa-stopwatch" rot="o tempário prevê (OS analisadas)" v={h(x.horasPrevistas)} cor="#7c3aed" />
          <Seta i={0} perda={x.acimaTempario > 0.05 ? h(x.acimaTempario) : null} txt="a mais que o tempário" />
          <Etapa i={1} ic="fa-clipboard-list" rot="ele apontou no relatório" v={h(x.horasRel)} cor="#2563eb" />
          <Seta i={1} perda={x.naoCobradas > 0.05 ? h(x.naoCobradas) : null} txt="não foram cobradas" />
          <Etapa i={2} ic="fa-file-invoice-dollar" rot="cobrado na OS" v={h(x.horasCobradas)} cor="#059669" />
        </div>
        {x.ligadoSemOS > 0.05 && <p className="f4-nota"><i className="fas fa-car" /> Além disso, o carro ficou <b>{h(x.ligadoSemOS)}</b> ligado em dias sem nenhuma OS.</p>}
      </section>
    </div>
  )
}

/* ───────── 5 · Contra a equipe ───────── */
function Equipe({ t, todos }: { t: TecnicoFantasma; todos: TecnicoFantasma[] }) {
  const met = [
    { rot: '% do km rodado que foi cobrado', ic: 'fa-road', v: (y: TecnicoFantasma) => pc(y.totais.kmCobrado, y.totais.kmCarro), fmt: (n: number) => `${n}%`, max: 100, bom: 'alto' as const },
    { rot: '% das horas apontadas que foram cobradas', ic: 'fa-clock', v: (y: TecnicoFantasma) => pc(y.totais.horasCobradas, y.totais.horasRel), fmt: (n: number) => `${n}%`, max: 100, bom: 'alto' as const },
    { rot: 'horas acima do tempário', ic: 'fa-stopwatch', v: (y: TecnicoFantasma) => y.totais.acimaTempario, fmt: h, max: 0, bom: 'baixo' as const },
    { rot: 'dias com o carro rodando sem OS', ic: 'fa-calendar-xmark', v: (y: TecnicoFantasma) => y.totais.diasCarroSemOS, fmt: (n: number) => `${n} dia${n === 1 ? '' : 's'}`, max: 0, bom: 'baixo' as const },
  ]
  return (
    <div className="f5">
      {met.map((m, k) => {
        const vals = todos.map((y) => ({ y, v: m.v(y) }))
        const mx = m.max || Math.max(...vals.map((z) => z.v), 1)
        const media = vals.reduce((s, z) => s + z.v, 0) / Math.max(1, vals.length)
        const meu = m.v(t)
        const ord = [...vals].sort((a, b) => (m.bom === 'alto' ? b.v - a.v : a.v - b.v))
        const pos = ord.findIndex((z) => z.y.tecnico === t.tecnico) + 1
        const melhor = m.bom === 'alto' ? meu >= media : meu <= media
        return (
          <div key={k} className="f5-m" style={{ animationDelay: `${k * 100}ms` }}>
            <div className="f5-t"><i className={`fas ${m.ic}`} /><b>{m.rot}</b><em className={melhor ? 'ok' : 'v'}>{pos}º de {vals.length} · {melhor ? 'melhor' : 'pior'} que a média</em></div>
            <div className="f5-eixo">
              <span className="f5-media" style={{ left: `${(media / mx) * 100}%` }}><small>média {m.fmt(Math.round(media * 10) / 10)}</small></span>
              {vals.map((z) => (
                <span key={z.y.tecnico} className={`f5-p ${z.y.tecnico === t.tecnico ? 'eu' : ''}`} style={{ left: `${(z.v / mx) * 100}%` }} title={`${z.y.tecnico}: ${m.fmt(z.v)}`}>
                  {ini(z.y.tecnico)}{z.y.tecnico === t.tecnico && <b>{m.fmt(z.v)}</b>}
                </span>
              ))}
            </div>
            <div className="f5-pontas"><small>{m.bom === 'alto' ? 'pior' : 'melhor'} ←</small><small>→ {m.bom === 'alto' ? 'melhor' : 'pior'}</small></div>
          </div>
        )
      })}
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
.tf-palco { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 18px; padding: 18px 20px; display: grid; gap: 16px; animation: tfEntra .4s both }
.tf-palco-cab { display: flex; gap: 6px 12px; align-items: baseline; flex-wrap: wrap } .tf-palco-cab b { font-size: 17px; font-weight: 500 } .tf-palco-cab small { color: #475569; font-size: 13.5px } .tf-palco-cab em { margin-left: auto; font-style: normal; font-size: 12.5px; color: #1d4ed8; background: #eff6ff; border-radius: 99px; padding: 3px 10px }
.tf h3 { margin: 0 0 4px; font-size: 15px; font-weight: 500; color: #0f172a } .tf h3 i { color: #64748b; margin-right: 6px }
@keyframes tfEntra { from { opacity: 0; transform: translateY(8px) } }
@keyframes tfCresce { from { transform: scaleX(0) } }

/* 1 funil */
.f1 { display: grid; grid-template-columns: 1fr 1fr; gap: 26px } @media (max-width: 900px) { .f1 { grid-template-columns: 1fr } }
.f1 section { display: grid; gap: 6px; align-content: start }
.f1-deg { display: flex; justify-content: center; animation: tfEntra .45s both }
.f1-barra { width: var(--w); min-width: 230px; display: flex; gap: 8px; align-items: center; background: var(--c); color: #fefefe; border-radius: 12px; padding: 12px 16px; transform-origin: center; animation: f1Abre .7s cubic-bezier(.2,.8,.2,1) both; animation-delay: inherit }
@keyframes f1Abre { from { transform: scaleX(.3); opacity: 0 } }
.f1-barra span { flex: 1; font-size: 14px } .f1-barra b { font-size: 18px; font-weight: 500; font-variant-numeric: tabular-nums }
.f1-perda { justify-self: center; display: inline-flex; gap: 6px; align-items: center; border: 0; background: #fef2f2; color: #991b1b; border-radius: 99px; padding: 5px 14px; font-family: inherit; font-size: 13.5px; animation: tfEntra .45s both } .f1-perda b { font-weight: 600 }
.f1-perda.clica { cursor: pointer } .f1-perda.clica:hover { background: #fee2e2 } .f1-perda u { text-decoration: none; color: #1d4ed8 } .f1-perda.ok { background: #f0fdf4; color: #166534 }
.f1-perda > i { font-size: 11px }
.f1-extra { display: grid; gap: 6px; margin-top: 6px } .f1-extra span { font-size: 13.5px; color: #334155; background: #f8fafc; border-radius: 10px; padding: 8px 12px } .f1-extra i { color: #64748b; margin-right: 4px } .f1-extra b { font-weight: 600 }
.f1-fim { margin: 6px 0 0; text-align: center; font-size: 15px; color: #334155 } .f1-fim b { font-size: 20px; font-weight: 600; color: #0f172a }

/* 2 perguntas */
.f2 { display: grid; gap: 8px } .f2-placar { font-size: 14px; color: #334155 } .f2-placar b { font-size: 18px; font-weight: 600; color: #0f172a }
.f2-q { display: grid; grid-template-columns: 44px minmax(0, 1fr) 20px; gap: 12px; align-items: center; text-align: left; border: 1px solid #e8edf3; background: #fefefe; border-radius: 14px; padding: 12px 14px; font-family: inherit; color: inherit; cursor: pointer; animation: tfEntra .4s both; transition: border-color .2s }
.f2-q:hover { border-color: #cbd5e1 } .f2-q.nao { background: #fffafa } .f2-q.on { box-shadow: 0 10px 24px -20px rgba(15,23,42,.6) }
.f2-ic { width: 44px; height: 44px; border-radius: 50%; display: grid; place-items: center; font-size: 18px; animation: f2Pula .5s cubic-bezier(.3,1.6,.5,1) both; animation-delay: inherit } @keyframes f2Pula { from { transform: scale(.3) } }
.f2-q.ok .f2-ic { background: #dcfce7; color: #15803d } .f2-q.nao .f2-ic { background: #fee2e2; color: #b91c1c }
.f2-txt { display: grid; gap: 2px } .f2-txt small { font-size: 13px; color: #475569 } .f2-txt b { font-size: 16px; font-weight: 500 } .f2-q.nao .f2-txt b { color: #991b1b } .f2-q.ok .f2-txt b { color: #166534 }
.f2-seta { color: #94a3b8; font-size: 12px }
.f2-det { grid-column: 2 / -1; display: grid; gap: 6px; padding-top: 4px; animation: tfEntra .3s both }
.f2-l { display: grid; grid-template-columns: 110px minmax(0, 1fr) 80px; gap: 8px; align-items: center } .f2-l small { font-size: 12.5px; color: #475569 } .f2-l > span { height: 8px; background: #eef2f6; border-radius: 99px; overflow: hidden } .f2-l > span i { display: block; height: 100%; border-radius: 99px; transform-origin: left; animation: tfCresce .7s both } .f2-l b { text-align: right; font-weight: 500; font-size: 13.5px }
.f2-mapa { justify-self: start; font-size: 13px; color: #1d4ed8; cursor: pointer }

/* 3 anéis */
.f3 { display: grid; gap: 18px } .f3-lin { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px }
.f3-a { position: relative; display: grid; justify-items: center; gap: 4px; text-align: center; border: 1px solid #eef2f6; background: #fefefe; border-radius: 16px; padding: 14px 12px; font-family: inherit; color: inherit; cursor: default; animation: tfEntra .45s both }
.f3-a.clica { cursor: pointer } .f3-a.clica:hover { border-color: #cbd5e1; box-shadow: 0 10px 24px -20px rgba(15,23,42,.6) }
.f3-a svg { width: 112px; height: 112px; transform: rotate(-90deg) } .f3-a circle { fill: none; stroke-width: 9 } .f3-a .tr { stroke: #eef2f6 } .f3-a .ch { stroke-linecap: round; animation: f3Enche 1.2s cubic-bezier(.2,.8,.2,1) both } @keyframes f3Enche { from { stroke-dasharray: 0 999 } }
.f3-a.ok .ch { stroke: #10b981 } .f3-a.a .ch { stroke: #f59e0b } .f3-a.v .ch { stroke: #ef4444 }
.f3-v { position: absolute; top: 14px; height: 112px; display: grid; place-items: center } .f3-v b { font-size: 24px; font-weight: 500 } .f3-a.ok .f3-v b { color: #047857 } .f3-a.a .f3-v b { color: #b45309 } .f3-a.v .f3-v b { color: #b91c1c }
.f3-a strong { font-size: 14px; font-weight: 500 } .f3-a small { font-size: 12.5px; color: #475569 } .f3-a u { text-decoration: none; font-size: 12.5px; color: #1d4ed8 }
.f3-leg { margin: 0; display: flex; gap: 6px 14px; align-items: center; font-size: 12.5px; color: #475569 } .f3-leg span { width: 10px; height: 10px; border-radius: 3px; display: inline-block; margin-right: -8px } .f3-leg .ok { background: #10b981 } .f3-leg .a { background: #f59e0b } .f3-leg .v { background: #ef4444 }

/* 4 caminho */
.f4 { display: grid; gap: 24px } .f4 section { display: grid; gap: 10px }
.f4-lin { display: grid; grid-template-columns: minmax(130px, 1fr) minmax(150px, 1.2fr) minmax(130px, 1fr) minmax(150px, 1.2fr) minmax(130px, 1fr); align-items: center; gap: 6px }
@media (max-width: 900px) { .f4-lin { grid-template-columns: 1fr } }
.f4-e { display: grid; justify-items: center; gap: 4px; text-align: center; animation: tfEntra .45s both }
.f4-e > span { width: 58px; height: 58px; border-radius: 18px; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 12%, #fefefe); color: var(--c); font-size: 22px; box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c) 25%, transparent) }
.f4-e b { font-size: 19px; font-weight: 500; font-variant-numeric: tabular-nums } .f4-e small { font-size: 12.5px; color: #475569 }
.f4-s { display: grid; justify-items: center; gap: 6px; animation: tfEntra .45s both }
.f4-fio { position: relative; width: 100%; height: 4px; border-radius: 99px; background: #e2e8f0; overflow: hidden }
.f4-fio i { position: absolute; top: 0; width: 18px; height: 4px; border-radius: 99px; background: #2563eb; animation: f4Anda 2.4s linear infinite } .f4-fio i:nth-child(2) { animation-delay: .8s } .f4-fio i:nth-child(3) { animation-delay: 1.6s }
.f4-s.perde .f4-fio i { background: #ef4444 } @keyframes f4Anda { from { left: -20px } to { left: 100% } }
.f4-s button { display: grid; justify-items: center; border: 0; background: #fef2f2; color: #991b1b; border-radius: 12px; padding: 6px 12px; font-family: inherit; cursor: default } .f4-s button.clica { cursor: pointer } .f4-s button.clica:hover { background: #fee2e2 }
.f4-s button b { font-size: 15px; font-weight: 600 } .f4-s button small { font-size: 12px } .f4-s button u { text-decoration: none; font-size: 12px; color: #1d4ed8 }
.f4-s .ok { font-size: 12.5px; color: #166534; background: #f0fdf4; border-radius: 99px; padding: 3px 10px }
.f4-nota { margin: 0; font-size: 13.5px; color: #334155; background: #f8fafc; border-radius: 10px; padding: 8px 12px } .f4-nota i { color: #64748b; margin-right: 4px }

/* 5 equipe */
.f5 { display: grid; gap: 14px }
.f5-m { display: grid; gap: 8px; background: #f8fafc; border-radius: 14px; padding: 12px 16px 10px; animation: tfEntra .45s both }
.f5-t { display: flex; gap: 8px; align-items: center; flex-wrap: wrap } .f5-t > i { color: #64748b } .f5-t b { font-size: 14.5px; font-weight: 500 } .f5-t em { margin-left: auto; font-style: normal; font-size: 12.5px; border-radius: 99px; padding: 2px 10px } .f5-t em.ok { background: #dcfce7; color: #166534 } .f5-t em.v { background: #fee2e2; color: #991b1b }
.f5-eixo { position: relative; height: 54px; margin: 14px 18px 0; border-bottom: 2px solid #e2e8f0 }
.f5-media { position: absolute; bottom: -6px; top: -10px; border-left: 2px dashed #94a3b8 } .f5-media small { position: absolute; top: -16px; left: 4px; font-size: 11.5px; color: #475569; white-space: nowrap }
.f5-p { position: absolute; bottom: 4px; transform: translateX(-50%); width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; background: #e2e8f0; color: #334155; font-size: 11.5px; font-weight: 600; border: 2px solid #fefefe; transition: left .8s cubic-bezier(.2,.8,.2,1); animation: f5Cai .6s cubic-bezier(.3,1.5,.5,1) both }
.f5-p.eu { background: #2563eb; color: #fefefe; width: 36px; height: 36px; z-index: 2; box-shadow: 0 6px 14px -6px rgba(37,99,235,.7) } .f5-p.eu b { position: absolute; top: -22px; font-size: 12.5px; color: #1d4ed8; white-space: nowrap }
@keyframes f5Cai { from { transform: translate(-50%, -20px); opacity: 0 } }
.f5-pontas { display: flex; justify-content: space-between; padding: 0 4px } .f5-pontas small { font-size: 11.5px; color: #64748b }
`
