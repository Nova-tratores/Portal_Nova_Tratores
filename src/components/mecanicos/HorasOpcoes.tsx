'use client'
// Opções do bloco "Horas da equipe no mês" (José, 20/10/2026: "isso aqui tá horrível, vamos lá para
// teste, limpa ele e me dê opções"). Metas novas: BÁSICA (esperada) = 20 h por semana; IDEAL = 40 h.
// Conta das horas igual ao Painel (montarPainel do mês): feitas = faturadas + aguardando faturar.
// A meta do Painel é 8 h por dia útil (= 40 h/semana, a ideal); a básica é a metade.
import { useMemo, useState } from 'react'
import { montarPainel, osAguardandoFaturar, SEM_META, SEM_TECNICO, segundaDa, somarDias } from '@/lib/mecanicos/painel'
import { useBasePosVendas } from './useBasePosVendas'
import { useCarreira } from './useCarreira'
import { COR, brl, horas, kmFmt, useContador } from './ui'
import { useComAguardando, CaixaAguardando } from './useComAguardando'

const MUDO = 'var(--portal-text-muted, #64748b)'
const COR_AG = '#f59e0b', COR_OC = '#cbd5e1', COR_BAS = '#0f172a', COR_IDE = '#7c3aed'
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
const primeiro = (n: string) => n.split(' ')[0]
const h1 = (v: number) => `${(Math.round(v * 10) / 10).toLocaleString('pt-BR')}`

/** Metas da SEMANA por mecânico (José, 20/10/2026): básica 20 h e R$ 4 mil; ideal 40 h e R$ 8 mil. */
/** O que cada cor quer dizer (aparece ao passar o mouse). */
export const DICA = {
  faturadas: 'Faturadas: horas cobradas em OS que já foram faturadas no mês',
  aguardando: 'Aguardando faturar: horas do app em OS já preenchidas que ainda não foram faturadas (contam na meta)',
  internas: 'Internas: horas em OS internas (serviço da loja, cortesia) — não são cobradas e não contam na meta',
  basica: 'Bolinha preta: onde fica a meta básica do mês (20 h por semana)',
}
export const META_SEM = { basH: 20, basV: 4000, ideH: 40, ideV: 8000 }
export interface SemanaH { de: string; ate: string; rot: string; horas: number; valor: number; fechada: boolean; atual: boolean; uteis?: number }
export interface TecH {
  nome: string; foto?: string
  faturadas: number; aguardando: number; internas: number; ociosas: number; trabalhadas: number; km: number
  feitas: number; ideal: number; basica: number; pBas: number; pIde: number
  antFeitas: number | null; semanas: SemanaH[]
}

/** Horas do mês por técnico, com a meta básica (20 h/sem) e a ideal (40 h/sem) e as semanas do app. */
/** comAg = somar as OS ainda não faturadas (preenchidas esperando faturar) — começa desligado (José, 20/10/2026). */
export function useHorasEquipe(mes: string, comAg = false) {
  const { base } = useBasePosVendas()
  const { dados: car } = useCarreira()
  const hoje = hojeSP()
  return useMemo(() => (base ? montarHoras(base, car?.fotos || {}, mes, hoje, comAg) : null), [base, car, mes, hoje, comAg])
}

/** A conta (pura) por trás de useHorasEquipe. */
export function montarHoras(base: import('@/lib/mecanicos/painel').BaseDados, fotos: Record<string, string>, mes: string, hoje: string, comAg = false) {
  {
    const ref = hoje.startsWith(mes) ? hoje : `${mes}-15`
    const d = montarPainel(base, 'mes', ref, hoje, comAg)
    const ant = d.serie.length >= 2 ? d.serie[d.serie.length - 2] : null
    const fimMes = (() => { const [a, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}` })()
    // semanas seg–dom CORTADAS no mês (27/10/2026: a "semana de 28/09" somava 28–30/09 e as semanas davam
    // mais que o mês — Danilo 47,5 h nas semanas × 36,7 h no mês)
    const semanas: { de: string; ate: string }[] = []
    for (let s = segundaDa(`${mes}-01`); s <= fimMes; s = somarDias(s, 7)) {
      const ate = somarDias(s, 6)
      semanas.push({ de: s < `${mes}-01` ? `${mes}-01` : s, ate: ate > fimMes ? fimMes : ate })
    }
    const aguardandoOS = osAguardandoFaturar(base)
    const saiu = (t: string) => { const e = (base.equipe || []).find((x) => x.pessoa === t); return !!e?.demissao && e.demissao < mes }
    const tecs: TecH[] = d.linhas.filter((l) => l.tecnico !== SEM_TECNICO && !SEM_META.has(l.tecnico) && !saiu(l.tecnico)).map((l) => {
      const feitas = l.faturadas + (comAg ? l.aguardando : 0)
      // valor das OS preenchidas esperando faturar (só quando a caixinha está marcada), no dia do relatório
      const pend = comAg ? (base.pendencias || []).filter((p) => p.tipo === 'preenchida' && p.tecnicos.includes(l.tecnico) && p.dataRef) : []
      const a = ant?.porTecnico[l.tecnico]
      // semana: horas cobradas e R$ das OS faturadas naquela semana (divididos entre os técnicos) +
      // horas do app em OS preenchida esperando faturar (no dia do relatório) — a mesma régua do mês
      const fat = base.faturadas.filter((o) => o.tecnicos.includes(l.tecnico))
      const agu = base.diasTodos.filter((x) => x.tecnico === l.tecnico && aguardandoOS.has(x.os))
      return {
        nome: l.tecnico, foto: fotos[l.tecnico],
        faturadas: l.faturadas, aguardando: comAg ? l.aguardando : 0, internas: l.internas, ociosas: l.ociosas, trabalhadas: l.trabalhadas, km: l.km,
        feitas, ideal: l.meta, basica: l.meta / 2, pBas: l.meta > 0 ? (feitas / (l.meta / 2)) * 100 : 0, pIde: l.meta > 0 ? (feitas / l.meta) * 100 : 0,
        antFeitas: a ? a.faturadas + (comAg ? a.aguardando || 0 : 0) : null,
        semanas: semanas.map((w) => ({
          ...w, rot: `${w.de.slice(8, 10)}/${w.de.slice(5, 7)}–${w.ate.slice(8, 10)}/${w.ate.slice(5, 7)}`, fechada: w.ate < hoje, atual: w.de <= hoje && hoje <= w.ate,
          // dias úteis (seg–sex) da semana dentro do mês: a meta da semana cortada é proporcional
          uteis: (() => { let n = 0; for (let x = w.de; x <= w.ate; x = somarDias(x, 1)) { const dw = new Date(`${x}T12:00:00Z`).getUTCDay(); if (dw > 0 && dw < 6) n++ } return n })(),
          horas: fat.filter((o) => o.data >= w.de && o.data <= w.ate).reduce((s, o) => s + o.horasCobradas / Math.max(1, o.tecnicos.length), 0)
            + (comAg ? agu.filter((x) => x.data >= w.de && x.data <= w.ate).reduce((s, x) => s + x.horas, 0) : 0),
          valor: fat.filter((o) => o.data >= w.de && o.data <= w.ate).reduce((s, o) => s + o.bruto / Math.max(1, o.tecnicos.length), 0)
            + pend.filter((p) => p.dataRef! >= w.de && p.dataRef! <= w.ate).reduce((s, p) => s + p.total / Math.max(1, p.tecnicos.length), 0),
        })),
      }
    }).sort((x, y) => y.pBas - x.pBas)
    const t = d.total
    const ideal = tecs.reduce((s, x) => s + x.ideal, 0)
    // equipe = soma dos MECÂNICOS MOSTRADOS (o total do painel incluía quem não tem meta/saiu: 176,2 h × 155,4 nas semanas)
    const soma = (k: 'faturadas' | 'aguardando' | 'internas') => tecs.reduce((s, x) => s + x[k], 0)
    return {
      tecs, ideal, basica: ideal / 2, feitas: soma('faturadas') + soma('aguardando'), faturadas: soma('faturadas'), aguardando: soma('aguardando'), comAg, internas: soma('internas'),
      ociosas: t.ociosas, trabalhadas: t.trabalhadas, km: t.km, antFeitas: ant ? ant.total.faturadas + (comAg ? ant.total.aguardando || 0 : 0) : null, atual: hoje.startsWith(mes),
    }
  }
}
export type DadosHoras = ReturnType<typeof montarHoras>

function Foto({ t, tam = 36 }: { t: TecH; tam?: number }) {
  const [erro, setErro] = useState(false)
  // eslint-disable-next-line @next/next/no-img-element
  return t.foto && !erro ? <img className="ho-foto" style={{ width: tam, height: tam }} src={t.foto} alt={t.nome} onError={() => setErro(true)} /> : <span className="ho-foto ini" style={{ width: tam, height: tam, fontSize: tam * 0.36 }}>{iniciais(t.nome)}</span>
}
function Selo({ t }: { t: TecH }) {
  if (t.pIde >= 100) return <span className="ho-selo ideal"><i className="fas fa-crown" /> bateu a ideal</span>
  if (t.pBas >= 100) return <span className="ho-selo"><i className="fas fa-medal" /> bateu a básica</span>
  return null
}
function Var({ a, b }: { a: number; b: number | null }) {
  if (b == null || b <= 0) return null
  const p = Math.round(((a - b) / b) * 100)
  return <span className={`ho-var ${p >= 0 ? 'bom' : 'ruim'}`} title={`mês anterior: ${horas(b)}`}><i className={`fas fa-arrow-${p >= 0 ? 'up' : 'down'}`} /> {Math.abs(p)}%</span>
}
const corPct = (p: number) => (p >= 100 ? '#059669' : p >= 70 ? '#d97706' : '#dc2626')
function Pct({ v, cor }: { v: number; cor?: string }) { const n = useContador(v, 1000); return <b style={{ color: cor || corPct(v) }}>{Math.round(n)}%</b> }
function Hrs({ v }: { v: number }) { return <>{horas(useContador(v, 1000))}</> }

const LEGENDA = (
  <div className="ho-leg">
    <span className="ho-dica" data-dica={DICA.faturadas}><i style={{ background: COR.faturadas }} /> faturadas</span><span className="ho-dica" data-dica={DICA.aguardando}><i style={{ background: COR_AG }} /> aguardando faturar</span>
    <span className="ho-dica" data-dica={DICA.internas}><i style={{ background: COR.internas }} /> internas</span><span><u style={{ background: COR_BAS }} /> básica 20 h e R$ 4 mil por semana</span><span><u style={{ background: COR_IDE }} /> ideal 40 h e R$ 8 mil por semana</span>
  </div>
)

// ============================================================================ H1 — medidor da equipe + linhas limpas
/** H1 — Um medidor grande da equipe (básica e ideal no arco) e cada técnico numa linha limpa com a barra até a ideal. */
export function H1({ d }: { d: DadosHoras }) {
  const v = useContador(d.feitas, 1300)
  const topo = Math.max(d.ideal, d.feitas) || 1
  const R = 80, ang = (x: number) => -180 + Math.min(1, x / topo) * 180
  const pt = (a: number, r: number) => { const t = (a * Math.PI) / 180; return [100 + Math.cos(t) * r, 100 + Math.sin(t) * r] }
  const arco = (a0: number, a1: number) => { const [x0, y0] = pt(a0, R), [x1, y1] = pt(a1, R); return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}` }
  const marca = (x: number, cor: string, rot: string) => { const a = ang(x), [x0, y0] = pt(a, R - 14), [x1, y1] = pt(a, R + 12), [tx, ty] = pt(a, R + 24); return <g><line x1={x0} y1={y0} x2={x1} y2={y1} stroke={cor} strokeWidth="3" strokeLinecap="round" /><text x={tx} y={ty} fontSize="9" fontWeight="900" fill={cor} textAnchor="middle">{rot}</text></g> }
  return (
    <div className="ho h1">
      <div className="h1-topo">
        <svg viewBox="-10 -12 220 128" className="h1-med">
          <path d={arco(-180, 0)} stroke="#e2e8f0" strokeWidth="16" fill="none" strokeLinecap="round" />
          <path d={arco(-180, Math.max(-179.5, ang(v)))} stroke={d.feitas >= d.basica ? '#10b981' : '#2563eb'} strokeWidth="16" fill="none" strokeLinecap="round" />
          {marca(d.basica, COR_BAS, 'BÁSICA')}{marca(d.ideal, COR_IDE, 'IDEAL')}
          <text x="100" y="86" textAnchor="middle" fontSize="24" fontWeight="900" fill="#0f172a">{horas(v)}</text>
          <text x="100" y="102" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="#64748b">feitas pela equipe no mês</text>
        </svg>
        <div className="h1-nums">
          <div><small>Da meta básica</small><Pct v={d.basica ? (d.feitas / d.basica) * 100 : 0} /><em>{horas(d.basica)} = 20 h/semana × {d.tecs.length}</em></div>
          <div><small>Da meta ideal</small><Pct v={d.ideal ? (d.feitas / d.ideal) * 100 : 0} cor={COR_IDE} /><em>{horas(d.ideal)} = 40 h/semana × {d.tecs.length}</em></div>
          <div><small>Faturadas · aguardando</small><b className="n">{horas(d.faturadas)} · {horas(d.aguardando)}</b><em>internas {horas(d.internas)} · {kmFmt(d.km)} cobrados</em></div>
          <div><small>Contra o mês anterior</small><b className="n">{d.antFeitas != null ? horas(d.antFeitas) : '—'}</b><Var a={d.feitas} b={d.antFeitas} /></div>
        </div>
      </div>
      {LEGENDA}
      <div className="h1-lin">
        {d.tecs.map((t, i) => {
          const esc = Math.max(t.ideal, t.feitas + t.internas) * 1.04 || 1
          const w = (x: number) => `${(x / esc) * 100}%`
          return (
            <div key={t.nome} className={`h1-tec ${t.pBas >= 100 ? 'ok' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
              <Foto t={t} />
              <div className="h1-n"><b>{t.nome}</b><small>{h1(t.feitas)} de {h1(t.basica)} h</small></div>
              <div className="h1-bar">
                <i style={{ width: w(t.faturadas), background: COR.faturadas }} /><i style={{ width: w(t.aguardando), background: COR_AG }} /><i style={{ width: w(t.internas), background: COR.internas }} />
                <u style={{ left: w(t.basica), background: COR_BAS }} /><u style={{ left: w(t.ideal), background: COR_IDE }} />
              </div>
              <div className="h1-p"><Pct v={t.pBas} /><small>da básica</small></div>
              <Selo t={t} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================ H2 — cartões com rosca
/** H2 — Um cartão por técnico: rosca com faturadas / aguardando / internas contra a ideal, % da básica no meio e selo ao bater. */
export function H2({ d }: { d: DadosHoras }) {
  return (
    <div className="ho">
      {LEGENDA}
      <div className="h2-grade">
        {d.tecs.map((t, i) => {
          const R = 42, C = 2 * Math.PI * R, tot = Math.max(t.ideal, t.feitas + t.internas) || 1
          let acc = 0
          const fatia = (v: number, cor: string, k: string) => { const l = (v / tot) * C, el = <circle key={k} cx="55" cy="55" r={R} fill="none" stroke={cor} strokeWidth="12" strokeDasharray={`${l} ${C - l}`} strokeDashoffset={-acc} transform="rotate(-90 55 55)" className="h2-fat" style={{ animationDelay: `${i * 90}ms` }} />; acc += l; return el }
          const bas = (t.basica / tot) * 360 - 90, rad = (bas * Math.PI) / 180
          return (
            <div key={t.nome} className={`h2-card ${t.pBas >= 100 ? 'ok' : ''} ${t.pIde >= 100 ? 'ideal' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
              <div className="h2-cab"><Foto t={t} tam={40} /><div><b>{t.nome}</b><small>{h1(t.feitas)} h feitas · {kmFmt(t.km)}</small></div><Var a={t.feitas} b={t.antFeitas} /></div>
              <svg viewBox="0 0 110 110" className="h2-ros">
                <circle cx="55" cy="55" r={R} fill="none" stroke="#eef2f7" strokeWidth="12" />
                {fatia(t.faturadas, COR.faturadas, 'f')}{fatia(t.aguardando, COR_AG, 'a')}{fatia(t.internas, COR.internas, 'i')}
                <line x1={55 + Math.cos(rad) * 34} y1={55 + Math.sin(rad) * 34} x2={55 + Math.cos(rad) * 50} y2={55 + Math.sin(rad) * 50} stroke={COR_BAS} strokeWidth="3" strokeLinecap="round" />
                <text x="55" y="56" textAnchor="middle" fontSize="20" fontWeight="900" fill={corPct(t.pBas)}>{Math.round(t.pBas)}%</text>
                <text x="55" y="70" textAnchor="middle" fontSize="8" fontWeight="700" fill="#64748b">da básica</text>
              </svg>
              <div className="h2-nums">
                <span><i style={{ background: COR.faturadas }} />{h1(t.faturadas)} h</span><span><i style={{ background: COR_AG }} />{h1(t.aguardando)} h</span><span><i style={{ background: COR.internas }} />{h1(t.internas)} h</span>
              </div>
              <div className="h2-pe"><span>básica {h1(t.basica)} h · ideal {h1(t.ideal)} h ({Math.round(t.pIde)}%)</span><Selo t={t} /></div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================================ H3 — corrida até a meta
/** H3 — Corrida: cada técnico (com foto) avança na pista; a bandeira preta é a básica (20 h/sem) e a chegada roxa a ideal (40 h/sem). */
export function H3({ d }: { d: DadosHoras }) {
  return (
    <div className="ho h3">
      <div className="h3-pista">
        <div className="h3-marcos"><span style={{ left: '50%' }}><i className="fas fa-flag" /> básica · 20 h/sem</span><span style={{ left: '100%' }}><i className="fas fa-flag-checkered" /> ideal · 40 h/sem</span></div>
        {d.tecs.map((t, i) => {
          const pos = Math.min(100, t.pIde)
          return (
            <div key={t.nome} className="h3-raia" style={{ animationDelay: `${i * 90}ms` }}>
              <div className="h3-n"><b>{primeiro(t.nome)}</b><small>{h1(t.feitas)} h</small></div>
              <div className="h3-trilho">
                <i className="h3-rastro" style={{ width: `${pos}%`, background: t.pBas >= 100 ? 'linear-gradient(90deg, #a7f3d0, #10b981)' : 'linear-gradient(90deg, #bfdbfe, #2563eb)', animationDelay: `${i * 90}ms` }} />
                <span className="h3-corredor" style={{ left: `${pos}%`, animationDelay: `${i * 90}ms` }}><Foto t={t} tam={34} /></span>
                <u style={{ left: '50%' }} />
              </div>
              <div className="h3-p"><Pct v={t.pBas} /><small>da básica</small></div>
              <Selo t={t} />
            </div>
          )
        })}
      </div>
      <div className="h3-pe">
        <span>Equipe: <b>{horas(d.feitas)}</b> de {horas(d.basica)} (básica) · {horas(d.ideal)} (ideal)</span>
        <span>faturadas {horas(d.faturadas)} · aguardando {horas(d.aguardando)} · internas {horas(d.internas)}</span>
        <Var a={d.feitas} b={d.antFeitas} />
      </div>
    </div>
  )
}

// ============================================================================ H4 — semana a semana
/** H4 — Semana a semana: cada técnico com as semanas do mês (horas no app); a semana que passou de 20 h acende verde e a de 40 h roxo. */
export function H4({ d }: { d: DadosHoras }) {
  const sem = d.tecs[0]?.semanas || []
  return (
    <div className="ho h4">
      <div className="h4-tab" style={{ gridTemplateColumns: `220px repeat(${sem.length}, minmax(0, 1fr)) 120px` }}>
        <div className="h4-th" />{sem.map((w) => <div key={w.de} className="h4-th">semana de {w.rot}</div>)}<div className="h4-th">no mês</div>
        {d.tecs.map((t, i) => (
          <div key={t.nome} className="h4-linha" style={{ display: 'contents' }}>
            <div className="h4-n"><Foto t={t} /><div><b>{t.nome}</b><small>{h1(t.feitas)} h feitas</small></div></div>
            {t.semanas.map((w, k) => {
              const cls = w.horas >= 40 ? 'ideal' : w.horas >= 20 ? 'ok' : w.fechada ? 'baixo' : 'aberta'
              return (
                <div key={w.de} className={`h4-cel ${cls}`} style={{ animationDelay: `${(i * sem.length + k) * 30}ms` }} title={`${w.rot}: ${h1(w.horas)} h no app`}>
                  <b>{h1(w.horas)} h</b>
                  <span className="h4-bar"><i style={{ width: `${Math.min(100, (w.horas / 40) * 100)}%` }} /><u /></span>
                  <small>{cls === 'ideal' ? 'bateu 40 h' : cls === 'ok' ? 'bateu 20 h' : cls === 'aberta' ? 'em andamento' : `faltaram ${h1(20 - w.horas)} h`}</small>
                </div>
              )
            })}
            <div className="h4-tot"><Pct v={t.pBas} /><small>da básica</small><Selo t={t} /></div>
          </div>
        ))}
      </div>
      <p className="ho-nota"><i className="fas fa-circle-info" /> Semanas = horas registradas no app (segunda a sexta). O % do mês = faturadas + aguardando faturar, contra a meta básica.</p>
    </div>
  )
}

// ============================================================================ H5 — placar + tabela
/** H5 — Placar de 4 números grandes e uma tabela limpa, com a régua de cada técnico e as marcas da básica e da ideal. */
export function H5({ d }: { d: DadosHoras }) {
  const bateram = d.tecs.filter((t) => t.pBas >= 100).length
  return (
    <div className="ho h5">
      <div className="h5-placar">
        <div><small>Feitas pela equipe</small><b><Hrs v={d.feitas} /></b><Var a={d.feitas} b={d.antFeitas} /></div>
        <div><small>Meta básica (20 h/sem)</small><b>{horas(d.basica)}</b><em><Pct v={d.basica ? (d.feitas / d.basica) * 100 : 0} /> feita</em></div>
        <div><small>Meta ideal (40 h/sem)</small><b>{horas(d.ideal)}</b><em><Pct v={d.ideal ? (d.feitas / d.ideal) * 100 : 0} cor={COR_IDE} /> feita</em></div>
        <div className={bateram ? 'ok' : ''}><small>Bateram a básica</small><b>{bateram} de {d.tecs.length}</b><em>{bateram ? d.tecs.filter((t) => t.pBas >= 100).map((t) => primeiro(t.nome)).join(', ') : 'ninguém ainda'}</em></div>
      </div>
      <table className="h5-tab">
        <thead><tr><th>Técnico</th><th className="n">Faturadas</th><th className="n">Aguardando</th><th className="n">Internas</th><th>Até a meta</th><th className="n">Básica</th><th className="n">Km</th></tr></thead>
        <tbody>
          {d.tecs.map((t, i) => {
            const esc = Math.max(t.ideal, t.feitas) || 1
            return (
              <tr key={t.nome} className={t.pBas >= 100 ? 'ok' : ''} style={{ animationDelay: `${i * 60}ms` }}>
                <td><div className="h5-n"><Foto t={t} tam={32} /><b>{t.nome}</b></div></td>
                <td className="n">{horas(t.faturadas)}</td><td className="n">{horas(t.aguardando)}</td><td className="n mudo">{horas(t.internas)}</td>
                <td className="h5-reg"><span><i style={{ width: `${(t.faturadas / esc) * 100}%`, background: COR.faturadas }} /><i style={{ width: `${(t.aguardando / esc) * 100}%`, background: COR_AG }} /><u style={{ left: `${(t.basica / esc) * 100}%`, background: COR_BAS }} /><u style={{ left: `${(t.ideal / esc) * 100}%`, background: COR_IDE }} /></span></td>
                <td className="n"><Pct v={t.pBas} /> <Selo t={t} /></td>
                <td className="n mudo">{kmFmt(t.km)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {LEGENDA}
    </div>
  )
}

export const ESTILO_HO = `
@keyframes hoEntra { from { opacity: 0; transform: translateY(8px) } } @keyframes hoLarga { from { transform: scaleX(0) } } @keyframes hoPula { from { transform: scale(.6); opacity: 0 } }
.ho { display: grid; gap: 14px; background: var(--portal-bg-card, #fefefe); border-radius: 20px; padding: 18px 20px; box-shadow: 0 12px 30px rgba(15,23,42,.06); color: var(--portal-text, #0f172a) }
.ho-foto { border-radius: 50%; object-fit: cover; flex: none; border: 2px solid #fefefe; box-shadow: 0 2px 8px rgba(15,23,42,.15) } .ho-foto.ini { display: grid; place-items: center; background: linear-gradient(135deg, #2563eb, #7c3aed); color: #fefefe; font-weight: 900 }
.ho-selo { display: inline-flex; gap: 5px; align-items: center; font-size: 11.5px; font-weight: 900; color: #fefefe; background: linear-gradient(135deg, #10b981, #047857); border-radius: 99px; padding: 3px 10px; white-space: nowrap; box-shadow: 0 4px 10px rgba(16,185,129,.3); animation: hoPula .5s cubic-bezier(.2,1.6,.4,1) both }
.ho-selo.ideal { background: linear-gradient(135deg, #8b5cf6, #6d28d9); box-shadow: 0 4px 10px rgba(124,58,237,.3) }
.ho-var { display: inline-flex; gap: 4px; align-items: center; font-size: 12px; font-weight: 800; border-radius: 99px; padding: 2px 8px } .ho-var.bom { color: #047857; background: #ecfdf5 } .ho-var.ruim { color: #b91c1c; background: #fef2f2 }
.ho-leg { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: ${MUDO} } .ho-leg span { display: inline-flex; gap: 6px; align-items: center } .ho-leg i { width: 10px; height: 10px; border-radius: 3px } .ho-leg u { width: 3px; height: 12px; border-radius: 2px }
.ho-nota { margin: 0; font-size: 12px; color: ${MUDO} }
/* H1 */
.h1-topo { display: grid; grid-template-columns: 300px 1fr; gap: 20px; align-items: center } .h1-med { width: 100%; max-width: 300px }
.h1-nums { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px } .h1-nums > div { display: grid; gap: 2px; padding: 12px 14px; border-radius: 14px; background: var(--portal-bg, #f8fafc) }
.h1-nums small { font-size: 12px; font-weight: 800; color: ${MUDO} } .h1-nums b { font-size: 28px; font-weight: 900; font-variant-numeric: tabular-nums } .h1-nums b.n { font-size: 18px } .h1-nums em { font-style: normal; font-size: 11.5px; color: ${MUDO} } .h1-nums .ho-var { justify-self: start }
.h1-lin { display: grid; gap: 4px }
.h1-tec { display: grid; grid-template-columns: 36px 200px 1fr 80px 130px; gap: 14px; align-items: center; padding: 8px 10px; border-radius: 14px; animation: hoEntra .4s both; transition: background .2s } .h1-tec:hover { background: var(--portal-bg, #f8fafc) } .h1-tec.ok { background: linear-gradient(90deg, #ecfdf5, transparent) }
.h1-n { display: grid } .h1-n b { font-size: 14px } .h1-n small { font-size: 12px; color: ${MUDO} }
.h1-bar { position: relative; display: flex; height: 14px; border-radius: 99px; background: #f1f5f9 } .h1-bar i { height: 100%; transform-origin: left; animation: hoLarga .9s cubic-bezier(.2,.9,.3,1) both } .h1-bar i:first-child { border-radius: 99px 0 0 99px }
.h1-bar u { position: absolute; top: -4px; width: 3px; height: 22px; border-radius: 2px; transform: translateX(-50%) }
.h1-p { display: grid; text-align: right } .h1-p b { font-size: 20px; font-weight: 900 } .h1-p small { font-size: 11px; color: ${MUDO} }
/* H2 */
.h2-grade { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 14px }
.h2-card { display: grid; gap: 10px; justify-items: center; padding: 16px; border-radius: 18px; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg, #f8fafc); animation: hoEntra .45s both; transition: transform .2s, box-shadow .2s } .h2-card:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,23,42,.08) }
.h2-card.ok { background: linear-gradient(160deg, #ecfdf5, #fefefe); border-color: #6ee7b7; box-shadow: 0 0 0 3px rgba(16,185,129,.15) } .h2-card.ideal { background: linear-gradient(160deg, #f5f3ff, #fefefe); border-color: #c4b5fd }
.h2-cab { width: 100%; display: flex; gap: 10px; align-items: center } .h2-cab > div { flex: 1; display: grid; min-width: 0 } .h2-cab b { font-size: 14.5px } .h2-cab small { font-size: 12px; color: ${MUDO} }
.h2-ros { width: 150px; height: 150px } .h2-fat { animation: hoEntra .8s both }
.h2-nums { display: flex; gap: 12px; font-size: 12.5px; font-weight: 800 } .h2-nums span { display: inline-flex; gap: 5px; align-items: center } .h2-nums i { width: 9px; height: 9px; border-radius: 3px }
.h2-pe { display: grid; justify-items: center; gap: 6px; font-size: 11.5px; color: ${MUDO} }
/* H3 */
.h3-pista { position: relative; display: grid; gap: 10px; padding-top: 26px }
.h3-marcos { position: absolute; top: 0; left: 150px; right: 220px; height: 20px } .h3-marcos span { position: absolute; transform: translateX(-50%); font-size: 11.5px; font-weight: 900; white-space: nowrap; color: ${COR_BAS} } .h3-marcos span:last-child { color: ${COR_IDE}; transform: translateX(-100%) }
.h3-raia { display: grid; grid-template-columns: 130px 1fr 80px 120px; gap: 20px; align-items: center; animation: hoEntra .4s both } .h3-n { display: grid; text-align: right } .h3-n b { font-size: 14px } .h3-n small { font-size: 12px; color: ${MUDO} }
.h3-trilho { position: relative; height: 40px; border-radius: 99px; background: repeating-linear-gradient(90deg, #f1f5f9 0 20px, #e9eef5 20px 40px) } .h3-trilho > u { position: absolute; top: -4px; bottom: -4px; width: 3px; background: ${COR_BAS}; border-radius: 2px; transform: translateX(-50%) }
.h3-trilho::after { content: ''; position: absolute; right: 0; top: 0; bottom: 0; width: 10px; border-radius: 0 99px 99px 0; background: repeating-linear-gradient(0deg, ${COR_IDE} 0 5px, #fefefe 5px 10px) }
.h3-rastro { position: absolute; left: 0; top: 8px; bottom: 8px; border-radius: 99px; transform-origin: left; animation: hoLarga 1.4s cubic-bezier(.2,.9,.3,1) both }
.h3-corredor { position: absolute; top: 50%; transform: translate(-50%, -50%); animation: h3Corre 1.4s cubic-bezier(.2,.9,.3,1) both; filter: drop-shadow(0 4px 8px rgba(15,23,42,.25)) } @keyframes h3Corre { from { left: 0 } }
.h3-p { display: grid; text-align: right } .h3-p b { font-size: 20px; font-weight: 900 } .h3-p small { font-size: 11px; color: ${MUDO} }
.h3-pe { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; font-size: 13px; color: ${MUDO} } .h3-pe b { color: var(--portal-text, #0f172a) }
/* H4 */
.h4-tab { display: grid; gap: 8px; align-items: stretch } .h4-th { font-size: 12px; font-weight: 800; color: ${MUDO}; text-align: center; align-self: end }
.h4-n { display: flex; gap: 10px; align-items: center } .h4-n b { display: block; font-size: 14px } .h4-n small { font-size: 12px; color: ${MUDO} }
.h4-cel { display: grid; gap: 4px; padding: 8px 10px; border-radius: 12px; background: var(--portal-bg, #f8fafc); border: 1px solid var(--portal-border, #e2e8f0); animation: hoEntra .35s both; text-align: center }
.h4-cel b { font-size: 16px; font-weight: 900; font-variant-numeric: tabular-nums } .h4-cel small { font-size: 11px; color: ${MUDO} }
.h4-cel.ok { background: linear-gradient(160deg, #d1fae5, #ecfdf5); border-color: #6ee7b7 } .h4-cel.ok b, .h4-cel.ok small { color: #047857 } .h4-cel.ideal { background: linear-gradient(160deg, #ede9fe, #f5f3ff); border-color: #c4b5fd } .h4-cel.ideal b, .h4-cel.ideal small { color: #6d28d9 }
.h4-cel.baixo small { color: #b91c1c } .h4-cel.aberta { border-style: dashed }
.h4-bar { position: relative; height: 6px; border-radius: 99px; background: #e2e8f0 } .h4-bar i { display: block; height: 100%; border-radius: 99px; background: #2563eb; transform-origin: left; animation: hoLarga .8s both } .h4-cel.ok .h4-bar i { background: #10b981 } .h4-cel.ideal .h4-bar i { background: #7c3aed }
.h4-bar u { position: absolute; left: 50%; top: -3px; width: 2px; height: 12px; background: ${COR_BAS} }
.h4-tot { display: grid; justify-items: center; align-content: center; gap: 2px } .h4-tot b { font-size: 20px; font-weight: 900 } .h4-tot small { font-size: 11px; color: ${MUDO} }
/* H5 */
.h5-placar { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px } .h5-placar > div { display: grid; gap: 3px; padding: 14px 16px; border-radius: 16px; background: var(--portal-bg, #f8fafc); animation: hoEntra .4s both }
.h5-placar > div.ok { background: linear-gradient(140deg, #ecfdf5, #d1fae5) } .h5-placar small { font-size: 12px; font-weight: 800; color: ${MUDO} } .h5-placar b { font-size: 26px; font-weight: 900; font-variant-numeric: tabular-nums } .h5-placar em { font-style: normal; font-size: 12.5px; color: ${MUDO} } .h5-placar em b { font-size: 14px } .h5-placar .ho-var { justify-self: start }
.h5-tab { width: 100%; border-collapse: collapse; font-size: 13.5px } .h5-tab th { text-align: left; font-size: 12px; font-weight: 800; color: ${MUDO}; padding: 8px 10px; border-bottom: 1px solid var(--portal-border, #e2e8f0) }
.h5-tab td { padding: 10px; border-bottom: 1px solid var(--portal-border, #f1f5f9) } .h5-tab tr { animation: hoEntra .35s both } .h5-tab tr.ok { background: linear-gradient(90deg, #ecfdf5, transparent) } .h5-tab .n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums } .h5-tab .mudo { color: ${MUDO} } .h5-tab td.n b { font-size: 16px }
.h5-n { display: flex; gap: 10px; align-items: center } .h5-reg { width: 32% } .h5-reg span { position: relative; display: flex; height: 10px; border-radius: 99px; background: #f1f5f9 } .h5-reg i { height: 100%; transform-origin: left; animation: hoLarga .9s both } .h5-reg i:first-child { border-radius: 99px 0 0 99px } .h5-reg u { position: absolute; top: -4px; width: 3px; height: 18px; border-radius: 2px; transform: translateX(-50%) }
@media (max-width: 900px) { .h1-topo { grid-template-columns: 1fr } .h1-nums, .h5-placar { grid-template-columns: 1fr 1fr } .h1-tec { grid-template-columns: 36px 1fr 70px; } .h1-bar { grid-column: 1 / -1 } .h3-raia { grid-template-columns: 70px 1fr 60px } .h3-raia .ho-selo { display: none } .h3-marcos { left: 90px; right: 80px } }
`

// ============================================================================ 2ª leva: variações do cartão (H2 escolhido, 20/10)
/** Casca comum: cabeçalho com foto, nome, feitas/km e a variação contra o mês anterior; verde = bateu a básica, roxo = a ideal. */
function Casca({ t, i, children, pe }: { t: TecH; i: number; children: React.ReactNode; pe?: React.ReactNode }) {
  return (
    <div className={`h2-card hc ${t.pBas >= 100 ? 'ok' : ''} ${t.pIde >= 100 ? 'ideal' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
      <div className="h2-cab"><Foto t={t} tam={40} /><div><b>{t.nome}</b><small>{h1(t.feitas)} h feitas · {kmFmt(t.km)}</small></div><Var a={t.feitas} b={t.antFeitas} /></div>
      {children}
      {pe ?? <Chips t={t} />}
      <div className="hc-selo">{t.pIde >= 100 || t.pBas >= 100 ? <Selo t={t} /> : <span className="hc-falta">faltam {h1(Math.max(0, t.basica - t.feitas))} h para a básica</span>}</div>
    </div>
  )
}
function Grade({ d, children }: { d: DadosHoras; children: (t: TecH, i: number) => React.ReactNode }) {
  return <div className="ho">{LEGENDA}<div className="h2-grade">{d.tecs.map((t, i) => <div key={t.nome} style={{ display: 'contents' }}>{children(t, i)}</div>)}</div><Equipe d={d} /></div>
}
/** Equipe embaixo dos cartões: o mês e cada semana somando todos os mecânicos contra a meta da equipe. */
function Equipe({ d }: { d: DadosHoras }) {
  // José, 21/10/2026: "melhora isso aqui também" — cartão branco, cada semana com o % da básica e a situação escrita.
  // 27/10/2026: abre no MÊS; clicando mostra as semanas (cortadas no mês, meta proporcional aos dias úteis).
  const [verSemanas, setVerSemanas] = useState(false)
  const n = d.tecs.length
  const p = d.basica ? (d.feitas / d.basica) * 100 : 0
  const sem = (d.tecs[0]?.semanas || []).map((w, k) => ({ ...w, horas: d.tecs.reduce((s2, t) => s2 + t.semanas[k].horas, 0), valor: d.tecs.reduce((s2, t) => s2 + t.semanas[k].valor, 0) }))
  const bH = META_SEM.basH * n, bV = META_SEM.basV * n, iH = META_SEM.ideH * n, iV = META_SEM.ideV * n
  const pc = (v: number, m: number) => (m ? Math.round((v / m) * 100) : 0)
  // o mês: horas do painel; faturado = soma das semanas; metas em R$ na mesma proporção das horas (R$ 200/h)
  const valorMes = sem.reduce((s, w) => s + w.valor, 0)
  const mesBasV = d.basica * (META_SEM.basV / META_SEM.basH), mesIdeV = d.ideal * (META_SEM.ideV / META_SEM.ideH)
  const barra = (v: number, bas: number, ide: number, cor: string) => <i className="me-bar"><u style={{ width: `${Math.min(100, (v / ide) * 100)}%`, background: v >= ide ? COR_IDE : v >= bas ? '#10b981' : cor }} /><s title="básica" /></i>
  const situacao = (h: number, v: number, bh: number, bv: number, ih: number, iv: number, atual: boolean, futuro: boolean) =>
    futuro ? ['ainda não chegou', 'fut'] : h >= ih && v >= iv ? ['bateu a ideal', 'ide'] : h >= bh && v >= bv ? ['bateu a básica', 'ok'] : v >= bv ? ['faturado bateu, horas não', 'meio'] : h >= bh ? ['horas bateram, faturado não', 'meio'] : atual ? ['em andamento', 'and'] : ['abaixo da básica', 'bx']
  const stMes = situacao(d.feitas, valorMes, d.basica, mesBasV, d.ideal, mesIdeV, d.atual, false)
  return (
    <div className="me">
      <div className="me-cab">
        <span className="me-ic"><i className="fas fa-users" /></span>
        <div><b>Meta da equipe no mês</b><small>{n} mecânicos · básica {horas(d.basica)} e {brl(mesBasV)} · ideal {horas(d.ideal)} e {brl(mesIdeV)}</small></div>
        <div className="me-mes"><small>Horas no mês</small><b>{horas(d.feitas)} <span>de {horas(d.basica)}</span></b><em style={{ color: corPct(p) }}>{Math.round(p)}% da básica</em><Var a={d.feitas} b={d.antFeitas} /></div>
      </div>
      <div className="me-tab">
        <div className="me-l cab"><span>Período</span><span>Horas</span><span>Faturado</span><span>Situação</span></div>
        <button type="button" className={`me-l me-mesl ${d.atual ? 'agora' : ''}`} onClick={() => setVerSemanas((v) => !v)} title={verSemanas ? 'Esconder as semanas' : 'Ver semana a semana'}>
          <span className="me-d">No mês<em><i className={`fas fa-chevron-${verSemanas ? 'up' : 'down'}`} /> {verSemanas ? 'esconder semanas' : 'ver semanas'}</em></span>
          <span className="me-c"><span><b>{h1(d.feitas)} h</b><small>{pc(d.feitas, d.basica)}% da básica</small></span>{barra(d.feitas, d.basica, d.ideal, '#60a5fa')}</span>
          <span className="me-c"><span><b>{brl(valorMes)}</b><small>{pc(valorMes, mesBasV)}% da básica</small></span>{barra(valorMes, mesBasV, mesIdeV, '#60a5fa')}</span>
          <span><em className={`me-st ${stMes[1]}`}>{stMes[0]}</em></span>
        </button>
        {verSemanas && sem.map((w) => {
          // semana cortada no mês (ex.: 01–04/10): a meta vale pelos dias úteis dela
          const f = (w.uteis ?? 5) / 5
          const wbH = bH * f, wbV = bV * f, wiH = iH * f, wiV = iV * f
          const futuro = !w.fechada && !w.atual
          const st = situacao(w.horas, w.valor, wbH, wbV, wiH, wiV, w.atual, futuro)
          return (
            <div key={w.de} className={`me-l me-sem ${w.atual ? 'agora' : ''} ${futuro ? 'futuro' : ''}`}>
              <span className="me-d">{w.rot}{w.atual && <em>esta semana</em>}{(w.uteis ?? 5) < 5 && <em className="me-uteis">{w.uteis} dias úteis</em>}</span>
              <span className="me-c"><span><b>{h1(w.horas)} h</b><small>{pc(w.horas, wbH)}% da básica</small></span>{barra(w.horas, wbH, wiH, '#60a5fa')}</span>
              <span className="me-c"><span><b>{brl(w.valor)}</b><small>{pc(w.valor, wbV)}% da básica</small></span>{barra(w.valor, wbV, wiV, '#60a5fa')}</span>
              <span><em className={`me-st ${st[1]}`}>{st[0]}</em></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/** Semanas: horas e faturado de cada semana contra a básica (20 h · R$ 4 mil) e a ideal (40 h · R$ 8 mil), × n mecânicos. */
function SemanasLista({ semanas, n, equipe }: { semanas: SemanaH[]; n: number; equipe?: boolean }) {
  const bH = META_SEM.basH * n, bV = META_SEM.basV * n, iH = META_SEM.ideH * n, iV = META_SEM.ideV * n
  const barra = (v: number, bas: number, ide: number) => {
    const cls = v >= ide ? 'ideal' : v >= bas ? 'ok' : ''
    return <span className={`hs-bar ${cls}`}><i style={{ width: `${Math.min(100, (v / ide) * 100)}%` }} /><u title="básica" /></span>
  }
  return (
    <div className={`hs ${equipe ? 'eq' : ''}`}>
      <div className="hs-th"><span>Semana</span><span>Horas <em>básica {bH} · ideal {iH}</em></span><span>Faturado <em>básica {brl(bV)} · ideal {brl(iV)}</em></span><span /></div>
      {semanas.map((w) => {
        const okH = w.horas >= bH, okV = w.valor >= bV, ideal = w.horas >= iH && w.valor >= iV
        const st = ideal ? 'ideal' : okH && okV ? 'ok' : w.atual ? 'agora' : w.ate < semanas[0].de ? '' : !w.fechada ? 'futuro' : 'baixo'
        return (
          <div key={w.de} className={`hs-lin ${st}`}>
            <span className="hs-d">{w.rot}{w.atual && <em>esta</em>}</span>
            <span className="hs-c">{barra(w.horas, bH, iH)}<b className={okH ? 'v' : ''}>{h1(w.horas)} h</b></span>
            <span className="hs-c">{barra(w.valor, bV, iV)}<b className={okV ? 'v' : ''}>{brl(w.valor)}</b></span>
            <span className="hs-st">{ideal ? <i className="fas fa-crown" title="bateu a ideal" /> : okH && okV ? <i className="fas fa-circle-check" title="bateu a básica (horas e faturado)" /> : okH || okV ? <i className="fas fa-circle-half-stroke" title={okH ? 'bateu as horas, faltou faturado' : 'bateu o faturado, faltou horas'} /> : st === 'futuro' ? null : <i className="far fa-circle" title={w.atual ? 'em andamento' : 'não bateu'} />}</span>
          </div>
        )
      })}
    </div>
  )
}
/** Os 3 números coloridos, cada um com a explicação no mouse. */
function Chips({ t }: { t: TecH }) {
  return (
    <div className="h2-nums">
      <span className="ho-dica" data-dica={DICA.faturadas}><i style={{ background: COR.faturadas }} />{h1(t.faturadas)} h</span>
      {t.aguardando > 0 && <span className="ho-dica" data-dica={DICA.aguardando}><i style={{ background: COR_AG }} />{h1(t.aguardando)} h</span>}
      <span className="ho-dica" data-dica={DICA.internas}><i style={{ background: COR.internas }} />{h1(t.internas)} h</span>
    </div>
  )
}
/** Rosca: fatias por tipo de hora; a volta inteira = ideal; marca da básica no próprio anel. */
function Rosca({ t, i, tam = 150, centro }: { t: TecH; i: number; tam?: number; centro?: React.ReactNode }) {
  const R = 42, C = 2 * Math.PI * R, tot = Math.max(t.ideal, t.feitas + t.internas) || 1
  const partes: [number, string, string, string][] = [[t.faturadas, COR.faturadas, 'f', DICA.faturadas], [t.aguardando, COR_AG, 'a', DICA.aguardando], [t.internas, COR.internas, 'i', DICA.internas]]
  const inicios = partes.map((_, k) => partes.slice(0, k).reduce((s, x) => s + (x[0] / tot) * C, 0))
  const a = ((t.basica / tot) * 360 - 90) * (Math.PI / 180)
  const bx = 55 + Math.cos(a) * R, by = 55 + Math.sin(a) * R
  return (
    <svg viewBox="0 0 110 110" style={{ width: tam, height: tam }} className="hc-ros">
      <circle cx="55" cy="55" r={R} fill="none" stroke="#eef2f7" strokeWidth="11" />
      {partes.map(([v, cor, k, dica], n) => { const l = (v / tot) * C; return <circle key={k} data-dica={dica} cx="55" cy="55" r={R} fill="none" stroke={cor} strokeWidth="11" strokeDasharray={`${l} ${C - l}`} strokeDashoffset={-inicios[n]} transform="rotate(-90 55 55)" className="h2-fat hc-fatia" style={{ animationDelay: `${i * 90}ms` }}><title>{`${dica.split(':')[0]}: ${h1(v)} h — ${dica.split(': ')[1]}`}</title></circle> })}
      <circle cx={bx} cy={by} r="4.5" fill="#fefefe" stroke={COR_BAS} strokeWidth="2.5"><title>{`Meta básica do mês: ${h1(t.basica)} h (20 h por semana). A volta inteira é a ideal: ${h1(t.ideal)} h (40 h por semana)`}</title></circle>
      {centro ?? <><text x="55" y="56" textAnchor="middle" fontSize="20" fontWeight="900" fill={corPct(t.pBas)}>{Math.round(t.pBas)}%</text><text x="55" y="70" textAnchor="middle" fontSize="8" fontWeight="700" fill="#64748b">da básica</text></>}
    </svg>
  )
}

/** C1 — o H2 refinado: rosca com a bolinha da básica no anel e as semanas do mês em barrinhas (20 h marcado). */
export function C1({ d }: { d: DadosHoras }) {
  return (
    <Grade d={d}>{(t, i) => (
      <Casca t={t} i={i}>
        <Rosca t={t} i={i} />
        <SemanasLista semanas={t.semanas} n={1} />
      </Casca>
    )}</Grade>
  )
}

/** C2 — dois anéis: o de fora vai até a ideal (40 h/sem), o de dentro até a básica (20 h/sem); no meio as horas. */
export function C2({ d }: { d: DadosHoras }) {
  return (
    <Grade d={d}>{(t, i) => {
      const anel = (r: number, p: number, cor: string, fundo: string, w: number) => { const C = 2 * Math.PI * r, l = Math.min(1, p / 100) * C; return <><circle cx="55" cy="55" r={r} fill="none" stroke={fundo} strokeWidth={w} /><circle cx="55" cy="55" r={r} fill="none" stroke={cor} strokeWidth={w} strokeLinecap="round" strokeDasharray={`${l} ${C}`} transform="rotate(-90 55 55)" className="h2-fat" style={{ animationDelay: `${i * 90}ms` }} /></> }
      return (
        <Casca t={t} i={i}>
          <svg viewBox="0 0 110 110" style={{ width: 150, height: 150 }}>
            {anel(46, t.pIde, COR_IDE, '#f3e8ff', 9)}{anel(33, t.pBas, t.pBas >= 100 ? '#10b981' : '#2563eb', '#e0ecff', 9)}
            <text x="55" y="55" textAnchor="middle" fontSize="15" fontWeight="900" fill="#0f172a">{h1(t.feitas)} h</text>
            <text x="55" y="67" textAnchor="middle" fontSize="7.5" fontWeight="700" fill="#64748b">feitas no mês</text>
          </svg>
          <div className="hc-dois"><span><i style={{ background: t.pBas >= 100 ? '#10b981' : '#2563eb' }} /> básica <b style={{ color: corPct(t.pBas) }}>{Math.round(t.pBas)}%</b> de {h1(t.basica)} h</span><span><i style={{ background: COR_IDE }} /> ideal <b style={{ color: COR_IDE }}>{Math.round(t.pIde)}%</b> de {h1(t.ideal)} h</span></div>
        </Casca>
      )
    }}</Grade>
  )
}

/** C3 — a foto dentro da rosca: o técnico no centro do anel, o % embaixo em destaque. */
export function C3({ d }: { d: DadosHoras }) {
  return (
    <div className="ho">{LEGENDA}
      <div className="h2-grade">
        {d.tecs.map((t, i) => (
          <div key={t.nome} className={`h2-card hc hc3 ${t.pBas >= 100 ? 'ok' : ''} ${t.pIde >= 100 ? 'ideal' : ''}`} style={{ animationDelay: `${i * 90}ms` }}>
            <div className="hc3-ros"><Rosca t={t} i={i} tam={170} centro={<></>} /><span className="hc3-foto"><Foto t={t} tam={86} /></span></div>
            <b className="hc3-n">{t.nome}</b>
            <div className="hc3-p"><Pct v={t.pBas} /><small>da básica · {h1(t.feitas)} de {h1(t.basica)} h</small></div>
            <Chips t={t} />
            <div className="hc-selo">{t.pIde >= 100 || t.pBas >= 100 ? <Selo t={t} /> : <Var a={t.feitas} b={t.antFeitas} />}</div>
          </div>
        ))}
      </div>
      <Equipe d={d} />
    </div>
  )
}

/** C4 — meia-lua: arco dividido por tipo de hora até a ideal, ponteiros da básica (preto) e da ideal (roxo). */
export function C4({ d }: { d: DadosHoras }) {
  return (
    <Grade d={d}>{(t, i) => {
      const tot = Math.max(t.ideal, t.feitas + t.internas) || 1, R = 46
      const pt = (f: number, r: number) => { const a = Math.PI + f * Math.PI; return [60 + Math.cos(a) * r, 60 + Math.sin(a) * r] }
      const arco = (f0: number, f1: number) => { const [x0, y0] = pt(f0, R), [x1, y1] = pt(f1, R); return `M${x0},${y0} A${R},${R} 0 0 1 ${x1},${y1}` }
      let acc = 0
      const seg = (v: number, cor: string, k: string) => { const f0 = acc / tot, f1 = (acc + v) / tot; acc += v; return v > 0 ? <path key={k} d={arco(f0, Math.min(1, f1))} stroke={cor} strokeWidth="13" fill="none" className="h2-fat" style={{ animationDelay: `${i * 90}ms` }} /> : null }
      const ponteiro = (f: number, cor: string, rot: string) => { const [x0, y0] = pt(f, R - 11), [x1, y1] = pt(f, R + 10), [tx, ty] = pt(f, R + 19); return <g><line x1={x0} y1={y0} x2={x1} y2={y1} stroke={cor} strokeWidth="3" strokeLinecap="round" /><text x={tx} y={ty} fontSize="7" fontWeight="900" textAnchor="middle" fill={cor}>{rot}</text></g> }
      return (
        <Casca t={t} i={i}>
          <svg viewBox="-16 -18 152 88" style={{ width: 220 }}>
            <path d={arco(0, 1)} stroke="#eef2f7" strokeWidth="13" fill="none" />
            {seg(t.faturadas, COR.faturadas, 'f')}{seg(t.aguardando, COR_AG, 'a')}{seg(t.internas, COR.internas, 'i')}
            {ponteiro(t.basica / tot, COR_BAS, 'BÁSICA')}{ponteiro(Math.min(1, t.ideal / tot), COR_IDE, 'IDEAL')}
            <text x="60" y="54" textAnchor="middle" fontSize="18" fontWeight="900" fill={corPct(t.pBas)}>{Math.round(t.pBas)}%</text>
            <text x="60" y="64" textAnchor="middle" fontSize="7" fontWeight="700" fill="#64748b">da básica · {h1(t.feitas)} h</text>
          </svg>
        </Casca>
      )
    }}</Grade>
  )
}

/** C5 — rosca do mês + uma mini-rosca por semana (cada uma até 20 h): dá para ver em que semana ele bateu. */
export function C5({ d }: { d: DadosHoras }) {
  return (
    <div className="c5"><Grade d={d}>{(t, i) => (
      <Casca t={t} i={i}>
        <Rosca t={t} i={i} tam={160} />
        <div className="hc5">
          {t.semanas.map((w, k) => {
            const r = 13, C = 2 * Math.PI * r, p = Math.min(1, w.horas / 20)
            const cor = w.horas >= 40 ? COR_IDE : w.horas >= 20 ? '#10b981' : w.fechada ? '#f87171' : '#93c5fd'
            return (
              <span key={w.de} title={`semana de ${w.rot}: ${h1(w.horas)} h no app`}>
                <svg viewBox="0 0 34 34"><circle cx="17" cy="17" r={r} fill="none" stroke="#eef2f7" strokeWidth="5" /><circle cx="17" cy="17" r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round" strokeDasharray={`${p * C} ${C}`} transform="rotate(-90 17 17)" className="h2-fat" style={{ animationDelay: `${i * 90 + k * 60}ms` }} />{w.horas >= 20 && <path d="M11.5 17.5 l3.5 3.5 l7 -7.5" fill="none" stroke={cor} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />}</svg>
                <b>{h1(w.horas)} h</b><small>sem. {w.rot}</small>
              </span>
            )
          })}
        </div>
      </Casca>
    )}</Grade></div>
  )
}

/** Semanas do cartão do mecânico: escondidas (o cartão mostra o mês); um clique abre (José, 27/10/2026).
 *  Semana cortada no mês: a básica vale pelos dias úteis dela (20 h × dias/5). */
function SemanasCartao({ t }: { t: TecH }) {
  const [aberto, setAberto] = useState(false)
  return (
    <div className="c6-sem">
      <button type="button" className="c6-ver" onClick={() => setAberto((v) => !v)}>
        <i className={`fas fa-chevron-${aberto ? 'up' : 'down'}`} /> {aberto ? 'esconder as semanas' : 'ver semana a semana'}
      </button>
      {aberto && t.semanas.map((w) => {
        const f = (w.uteis ?? 5) / 5, bas = 20 * f, ide = 40 * f
        const cor = w.horas >= ide ? COR_IDE : w.horas >= bas ? '#10b981' : w.fechada ? '#f87171' : '#60a5fa'
        return (
          <div key={w.de} className={`c6-s ${w.atual ? 'agora' : ''} ${!w.fechada && !w.atual ? 'futuro' : ''}`} title={`${w.rot}: ${h1(w.horas)} h cobradas · básica ${h1(bas)} h (${w.uteis ?? 5} dias úteis)`}>
            <span>{w.rot}</span>
            <i><u style={{ width: `${bas ? Math.min(100, (w.horas / bas) * 100) : 0}%`, background: cor }} /></i>
            <b>{h1(w.horas)} h</b>
          </div>
        )
      })}
    </div>
  )
}

/** C6 — sem gráfico (José, 21/10/2026: "aplica o design aqui também, remove o gráfico do card"): o % da básica
 *  em número, as barras da básica e da ideal e cada semana numa linha com a barrinha até 20 h. */
export function C6({ d }: { d: DadosHoras }) {
  return (
    <div className="c5 c6"><Grade d={d}>{(t, i) => (
      <Casca t={t} i={i}>
        <div className="c6-top">
          <div><b style={{ color: corPct(t.pBas) }}>{Math.round(t.pBas)}%</b><small>da meta básica</small></div>
          <div className="c6-metas">
            {([['Básica', t.basica, t.pBas, '#0f766e'], ['Ideal', t.ideal, t.pIde, '#7c3aed']] as const).map(([r, m, p, cor]) => (
              <div key={r} className="c6-m" style={{ '--c': cor } as React.CSSProperties}>
                <span>{r} <small>{h1(m)} h</small></span>
                <i><u style={{ width: `${Math.min(100, p)}%` }} /></i>
                <em>{Math.round(p)}%</em>
              </div>
            ))}
          </div>
        </div>
        <SemanasCartao t={t} />
      </Casca>
    )}</Grade></div>
  )
}

export const ESTILO_HC = `
.me { display: grid; gap: 14px; background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; padding: 18px 20px; margin-top: 16px }
.me-cab { display: flex; gap: 12px; align-items: center; flex-wrap: wrap }
.me-ic { width: 40px; height: 40px; border-radius: 11px; display: grid; place-items: center; font-size: 16px; color: #2563eb; background: #eff6ff; border: 1px solid #dbeafe; flex: none }
.me-cab > div:nth-child(2) { display: grid; flex: 1; min-width: 240px } .me-cab b { font-size: 17px; font-weight: 500; color: #0f172a } .me-cab small { font-size: 13.5px; color: #475569 }
.me-mes { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap } .me-mes small { font-size: 13.5px; color: #475569 } .me-mes b span { font-size: 14px; color: #475569; font-weight: 400 } .me-mes em { font-style: normal; font-size: 14px; font-weight: 500 }
.me-tab { display: grid }
.me-l { display: grid; grid-template-columns: 120px minmax(0, 1fr) minmax(0, 1fr) 210px; gap: 18px; align-items: center; padding: 10px 8px; border-top: 1px solid #f1f5f9; border-radius: 10px }
.me-l.cab { font-size: 13px; color: #475569; border-top: 0; padding-top: 0 } .me-l.agora { background: #eff6ff } .me-l.futuro { opacity: .45 }
.me-mesl { width: 100%; border: 0; border-top: 1px solid #f1f5f9; background: transparent; text-align: left; font: inherit; cursor: pointer; transition: background .15s } .me-mesl:hover { background: #f8fafc } .me-mesl.agora:hover { background: #e0edff }
.me-sem { margin-left: 18px; border-left: 3px solid #e2e8f0; border-radius: 0 10px 10px 0 } .me-uteis { color: #64748b !important }
.me-d { display: grid; font-size: 15px; color: #0f172a } .me-d em { font-style: normal; font-size: 12px; color: #2563eb }
.me-c { display: grid; gap: 6px } .me-c > span { display: flex; align-items: baseline; justify-content: space-between; gap: 8px } .me-c b { font-size: 16px; font-weight: 500; color: #0f172a } .me-c small { font-size: 12.5px; color: #475569 }
.me-bar { position: relative; display: block; height: 8px; border-radius: 99px; background: #eef2f6 } .me-bar u { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 99px; transition: width .7s } .me-bar s { position: absolute; left: 50%; top: -3px; width: 2px; height: 14px; background: #0f172a; border-radius: 1px }
.me-st { font-style: normal; font-size: 13px; border-radius: 99px; padding: 4px 11px; white-space: nowrap }
.me-st.ide { color: #5b21b6; background: #ede9fe } .me-st.ok { color: #14532d; background: #dcfce7 } .me-st.meio { color: #78350f; background: #fef3c7 } .me-st.bx { color: #7f1d1d; background: #fee2e2 } .me-st.and { color: #1e3a8a; background: #dbeafe } .me-st.fut { color: #475569; background: #f1f5f9 }
@media (max-width: 900px) { .me-l { grid-template-columns: 80px minmax(0, 1fr) minmax(0, 1fr); } .me-l > span:last-child { grid-column: 1 / -1 } }

/* C6 — cartões de horas sem gráfico, no estilo dos cartões do Faturamento (21/10/2026) */
.c6 .h2-card { background: #fefefe; border: 1px solid #e2e8f0; border-radius: 16px; transition: transform .2s, box-shadow .2s } .c6 .h2-card:hover { transform: translateY(-2px); box-shadow: 0 12px 26px -18px rgba(15,23,42,.5) }
.c6 .h2-cab b { font-weight: 500 !important }
.c6-top { display: grid; gap: 10px; width: 100% } .c6-top > div:first-child { display: grid } .c6-top > div:first-child b { font-size: 36px; font-weight: 500; line-height: 1.1 } .c6-top > div:first-child small { font-size: 13.5px; color: #475569 }
.c6-metas { display: grid; gap: 6px }
.c6-m { display: grid; grid-template-columns: 96px minmax(0, 1fr) 42px; gap: 8px; align-items: center; font-size: 13.5px } .c6-m span { color: #0f172a } .c6-m span small { color: #475569 }
.c6-m i { height: 8px; border-radius: 99px; background: #eef2f6; overflow: hidden } .c6-m u { display: block; height: 100%; border-radius: 99px; background: var(--c); transition: width .7s }
.c6-m em { font-style: normal; text-align: right; font-weight: 500 }
.c6-sem { display: grid; gap: 4px; width: 100%; padding-top: 10px; border-top: 1px solid #f1f5f9 }
.c6-s { display: grid; grid-template-columns: 86px minmax(0, 1fr) 52px; gap: 8px; align-items: center; font-size: 13px; padding: 2px 4px; border-radius: 8px } .c6-s.agora { background: #eff6ff } .c6-s.futuro { opacity: .45 }
.c6-ver { border: 0; background: transparent; padding: 2px 4px; font: inherit; font-size: 12.5px; color: #2563eb; cursor: pointer; text-align: left } .c6-ver:hover { text-decoration: underline }
.c6-s { grid-template-columns: 110px minmax(0, 1fr) 52px !important }
.c6-s span { color: #475569 } .c6-s i { height: 6px; border-radius: 99px; background: #eef2f6; overflow: hidden } .c6-s u { display: block; height: 100% } .c6-s b { text-align: right; font-weight: 500 }
.c6 .h2-nums b, .c6 .hc-falta { font-weight: 500 !important }

.ho-dica { position: relative; cursor: help } .ho-dica:hover::after { content: attr(data-dica); position: absolute; left: 50%; bottom: calc(100% + 8px); transform: translateX(-50%); width: max-content; max-width: 260px; white-space: normal; text-align: left; background: #0f172a; color: #fefefe; font-size: 12.5px; font-weight: 600; line-height: 1.35; padding: 8px 11px; border-radius: 10px; box-shadow: 0 10px 24px rgba(15,23,42,.25); z-index: 20; pointer-events: none; animation: hoEntra .15s both }
.ho-dica:hover::before { content: ''; position: absolute; left: 50%; bottom: calc(100% + 2px); transform: translateX(-50%); border: 6px solid transparent; border-top-color: #0f172a; z-index: 20 }
.hc-fatia { cursor: help; transition: stroke-width .2s } .hc-fatia:hover { stroke-width: 15 }

/* C5 (escolhida 20/10): fontes maiores */
.c5 .ho-leg { font-size: 13.5px } .c5 .h2-cab b { font-size: 16.5px } .c5 .h2-cab small { font-size: 13.5px } .c5 .ho-var { font-size: 13px }
.c5 .hc5 { gap: 10px } .c5 .hc5 svg { width: 46px; height: 46px } .c5 .hc5 b { font-size: 14px } .c5 .hc5 small { font-size: 12px }
.c5 .h2-nums { font-size: 14.5px; gap: 14px } .c5 .h2-nums i { width: 11px; height: 11px } .c5 .hc-falta { font-size: 14px } .c5 .ho-selo { font-size: 13px; padding: 4px 12px }
.c5 .hc-eq-cab { font-size: 14.5px } .c5 .hc-eq-cab > b { font-size: 16px } .c5 .hc-eq-mes b { font-size: 15px }
.c5 .hs.eq { font-size: 14.5px } .c5 .hs.eq .hs-th { font-size: 13px } .c5 .hs.eq .hs-th em { font-size: 12.5px } .c5 .hs.eq .hs-c b { font-size: 16px } .c5 .hs.eq .hs-d { font-size: 15px } .c5 .hs.eq .hs-d em { font-size: 11.5px } .c5 .hs.eq .hs-bar { height: 10px } .c5 .hs.eq .hs-st { font-size: 18px }

.hs { width: 100%; display: grid; gap: 3px; font-size: 12px }
.hs-th { display: grid; grid-template-columns: 52px 1fr 1fr 18px; gap: 8px; font-size: 10.5px; font-weight: 800; color: ${MUDO}; padding: 0 4px } .hs-th em { display: block; font-style: normal; font-weight: 600; font-size: 9.5px }
.hs-lin { display: grid; grid-template-columns: 52px 1fr 1fr 18px; gap: 8px; align-items: center; padding: 4px; border-radius: 8px; transition: background .2s }
.hs-lin.ok { background: #ecfdf5 } .hs-lin.ideal { background: #f5f3ff } .hs-lin.agora { background: #eff6ff } .hs-lin.futuro { opacity: .45 }
.hs-d { font-weight: 800; display: grid; line-height: 1.1 } .hs-d em { font-style: normal; font-size: 9.5px; color: #2563eb; font-weight: 800 }
.hs-c { display: grid; gap: 2px } .hs-c b { font-size: 12px; font-variant-numeric: tabular-nums } .hs-c b.v { color: #047857 }
.hs-bar { position: relative; display: block; height: 6px; border-radius: 99px; background: #e2e8f0 } .hs-bar i { display: block; height: 100%; border-radius: 99px; background: #60a5fa; transform-origin: left; animation: hoLarga .8s both }
.hs-bar.ok i { background: #10b981 } .hs-bar.ideal i { background: #7c3aed } .hs-bar u { position: absolute; left: 50%; top: -3px; width: 2px; height: 12px; background: ${COR_BAS}; border-radius: 1px }
.hs-st { font-size: 13px; text-align: center } .hs-lin.ok .hs-st { color: #059669 } .hs-lin.ideal .hs-st { color: #7c3aed } .hs-st .fa-circle-half-stroke { color: #d97706 } .hs-st .fa-circle { color: #cbd5e1 }
.hs.eq { font-size: 13px } .hs.eq .hs-th, .hs.eq .hs-lin { grid-template-columns: 90px 1fr 1fr 24px; gap: 14px } .hs.eq .hs-th { font-size: 11.5px } .hs.eq .hs-th em { font-size: 11px } .hs.eq .hs-c b { font-size: 14px } .hs.eq .hs-bar { height: 9px } .hs.eq .hs-st { font-size: 16px } .hs.eq .hs-lin { padding: 6px 8px }
.hc-eq-cab { display: flex; gap: 8px 18px; align-items: baseline; flex-wrap: wrap; color: ${MUDO} } .hc-eq-cab > b { color: var(--portal-text, #0f172a); font-size: 14px } .hc-eq-cab b { color: var(--portal-text, #0f172a) } .hc-eq-mes { margin-left: auto; display: inline-flex; gap: 6px; align-items: center }

.hc { gap: 12px } .hc-selo { min-height: 24px; display: flex; align-items: center } .hc-falta { font-size: 12px; font-weight: 700; color: ${MUDO} }
.hc-sem { display: flex; gap: 8px; align-items: flex-end }
.hc-sem > span { display: grid; justify-items: center; gap: 3px }
.hc-sem-b { position: relative; width: 26px; height: 48px; border-radius: 6px; background: #eef2f7; display: flex; align-items: flex-end; overflow: visible }
.hc-sem-b i { display: block; width: 100%; border-radius: 6px 6px 3px 3px; background: linear-gradient(180deg, #93c5fd, #2563eb); transform-origin: bottom; animation: hoCresce .8s cubic-bezier(.2,.9,.3,1) both }
.hc-sem span.ok .hc-sem-b i { background: linear-gradient(180deg, #6ee7b7, #059669) } .hc-sem span.ideal .hc-sem-b i { background: linear-gradient(180deg, #c4b5fd, #6d28d9) }
.hc-sem-b u { position: absolute; left: -4px; right: -4px; bottom: 50%; height: 2px; background: ${COR_BAS} } .hc-sem small { font-size: 10px; color: ${MUDO}; font-weight: 700 }
@keyframes hoCresce { from { transform: scaleY(0) } }
.hc-sem-leg { font-size: 11px; color: ${MUDO}; margin-top: -6px }
.hc-dois { display: grid; gap: 4px; font-size: 12.5px; color: ${MUDO} } .hc-dois span { display: flex; gap: 6px; align-items: center } .hc-dois i { width: 10px; height: 10px; border-radius: 50% }
.hc3-ros { position: relative; width: 170px; height: 170px } .hc3-foto { position: absolute; inset: 0; display: grid; place-items: center } .hc3-foto .ho-foto { border-width: 4px }
.hc3-n { font-size: 15px } .hc3-p { display: grid; justify-items: center; margin-top: -6px } .hc3-p b { font-size: 30px; font-weight: 900; line-height: 1.1 } .hc3-p small { font-size: 12px; color: ${MUDO} }
.hc5 { display: flex; gap: 8px; justify-content: center; flex-wrap: wrap } .hc5 span { display: grid; justify-items: center; gap: 1px } .hc5 svg { width: 38px; height: 38px } .hc5 b { font-size: 11.5px } .hc5 small { font-size: 10px; color: ${MUDO} }
.hc-eq { display: grid; gap: 10px; padding: 14px 16px; border-radius: 14px; background: var(--portal-bg, #f8fafc); font-size: 13px; color: ${MUDO} } .hc-eq > span:first-child b { color: var(--portal-text, #0f172a); margin-right: 4px }
.hc-eq-bar { flex: 1; min-width: 160px; height: 8px; border-radius: 99px; background: #e2e8f0; overflow: hidden } .hc-eq-bar i { display: block; height: 100%; border-radius: 99px; background: linear-gradient(90deg, #60a5fa, #2563eb); transform-origin: left; animation: hoLarga 1s both } .hc-eq > b { font-size: 16px }
`

/** O bloco de horas que vai nas Ocorrências (C5 escolhida em 20/10/2026), com a caixinha das OS não faturadas. */
export function HorasEquipeCartoes({ mes, semTitulo }: { mes: string; semTitulo?: boolean }) {
  const comAg = useComAguardando()
  const d = useHorasEquipe(mes, comAg)
  return (
    <section className="hec cpv-entra">
      <style>{ESTILO_HO}</style>
      <style>{ESTILO_HC}</style>
      <style>{ESTILO_HEC}</style>
      <div className="hec-topo">
        {!semTitulo && <b><i className="fas fa-clock" /> Horas da equipe no mês</b>}
        <CaixaAguardando />
      </div>
      {!d ? <div className="hec-carr"><i className="fas fa-circle-notch fa-spin" /> carregando as horas da equipe…</div> : <div key={String(comAg)}><C6 d={d} /></div>}
    </section>
  )
}
const ESTILO_HEC = `
.hec { display: grid; gap: 10px } .hec-topo { display: flex; gap: 10px 16px; align-items: center; flex-wrap: wrap } .hec-topo > b { font-size: 16px; font-weight: 900; color: var(--portal-text, #0f172a) } .hec-topo > b i { color: #0891b2 }
.hec-ck { display: inline-flex; gap: 7px; align-items: center; font-size: 13.5px; font-weight: 800; color: var(--portal-text, #334155); background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 99px; padding: 6px 14px; cursor: pointer; transition: all .2s }
.hec-ck small { font-weight: 600; color: ${MUDO} } .hec-ck input { width: 16px; height: 16px; accent-color: #f59e0b; cursor: pointer } .hec-ck.on { background: #fffbeb; border-color: #fcd34d }
.hec-carr { padding: 30px; text-align: center; color: ${MUDO} }
`
