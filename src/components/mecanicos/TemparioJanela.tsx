'use client'
// Tempário Mahindra para consulta, nos atalhos do Centro (José, 28/10/2026: "coloca o tempário lá nos ícones lá em
// cima"). Busca por palavra nas 1.170 atividades e mostra o tempo de cada uma. A tabela (170 KB) só carrega quando
// a janela abre.
import { useEffect, useMemo, useState } from 'react'
import { Janela } from './JanelasInfo'

interface Ativ { codigo: string | null; acao: string | null; sistema: string | null; subsistema: string | null; atividade: string; minutos: number | null }

const semAcento = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// "EixoDianteiro" → "Eixo dianteiro"; os sistemas do PDF vêm grudados
const bonito = (t: string | null) => {
  if (!t) return 'Outros'
  const s = t.replace(/([a-zçãéí])([A-Z0-9])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const tempo = (m: number) => { const h = Math.floor(m / 60), mm = Math.round(m % 60); return h ? `${h} h${mm ? ` ${String(mm).padStart(2, '0')} min` : ''}` : `${mm} min` }

export default function TemparioJanela({ onFechar }: { onFechar: () => void }) {
  const [lista, setLista] = useState<Ativ[] | null>(null)
  const [q, setQ] = useState('')
  const [sis, setSis] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    import('@/lib/mecanicos/dados/tempario-mahindra-v1.json').then((m) => { if (vivo) setLista((m.default as Ativ[]).filter((a) => a.atividade)) })
    return () => { vivo = false }
  }, [])
  const sistemas = useMemo(() => {
    const c = new Map<string, number>()
    for (const a of lista || []) { const k = bonito(a.sistema); c.set(k, (c.get(k) || 0) + 1) }
    return [...c.entries()].filter(([k, n]) => k !== 'Outros' && k !== 'Cod' && n >= 5).sort((a, b) => b[1] - a[1]).slice(0, 14)
  }, [lista])
  const achados = useMemo(() => {
    const termos = semAcento(q).split(/\s+/).filter((w) => w.length >= 2)
    return (lista || []).filter((a) => {
      if (sis && bonito(a.sistema) !== sis) return false
      if (!termos.length) return true
      const txt = semAcento(`${a.atividade} ${a.sistema || ''} ${a.subsistema || ''} ${a.codigo || ''}`)
      return termos.every((w) => txt.includes(w))
    })
  }, [lista, q, sis])
  const mostrar = achados.slice(0, 150)
  return (
    <Janela titulo="Tempário Mahindra" sub="quanto tempo cada serviço deve levar" ic="fa-stopwatch" cor="#0f766e" onFechar={onFechar}>
      <style>{ESTILO_TP}</style>
      <div className="tp-busca">
        <i className="fas fa-magnifying-glass" />
        <input autoFocus placeholder="busque o serviço: embreagem, retentor, bomba injetora, ar-condicionado…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" onClick={() => setQ('')} aria-label="limpar"><i className="fas fa-xmark" /></button>}
      </div>
      <div className="tp-sis">
        <button type="button" className={!sis ? 'on' : ''} onClick={() => setSis(null)}>Todos</button>
        {sistemas.map(([k, n]) => <button key={k} type="button" className={sis === k ? 'on' : ''} onClick={() => setSis(sis === k ? null : k)}>{k} <small>{n}</small></button>)}
      </div>
      {!lista ? <p className="ji-mudo"><i className="fas fa-circle-notch fa-spin" /> carregando o tempário…</p> : (
        <>
          <small className="tp-cont">{achados.length} atividade{achados.length === 1 ? '' : 's'}{achados.length > mostrar.length ? ` · mostrando ${mostrar.length}; refine a busca` : ''}</small>
          <div className="tp-lista">
            {mostrar.map((a, i) => (
              <div key={`${a.codigo}-${i}`} className="tp-l">
                <div><b>{a.atividade}</b><small>{[bonito(a.sistema), a.subsistema && bonito(a.subsistema), a.codigo].filter(Boolean).join(' · ')}</small></div>
                {a.minutos != null ? <em><i className="fas fa-stopwatch" /> {tempo(a.minutos)}</em> : <em className="sem">sem tempo</em>}
              </div>
            ))}
            {!achados.length && <p className="ji-mudo">Nada no tempário com essa busca.</p>}
          </div>
        </>
      )}
    </Janela>
  )
}

const ESTILO_TP = `
.tp-busca { display: flex; align-items: center; gap: 10px; border: 1px solid #cbd5e1; border-radius: 99px; padding: 8px 14px; background: #fefefe } .tp-busca > i { color: #0f766e }
.tp-busca input { flex: 1; border: 0; outline: none; font-family: inherit; font-size: 15px; background: transparent; color: #0f172a; min-width: 0 } .tp-busca button { border: 0; background: none; color: #64748b; cursor: pointer }
.tp-sis { display: flex; gap: 6px; flex-wrap: wrap } .tp-sis button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer } .tp-sis button small { color: #94a3b8; margin-left: 2px }
.tp-sis button:hover { border-color: #0f766e } .tp-sis button.on { background: #0f766e; border-color: #0f766e; color: #fefefe } .tp-sis button.on small { color: #ccfbf1 }
.tp-cont { font-size: 12.5px; color: #475569 }
.tp-lista { display: grid; border: 1px solid #eef2f7; border-radius: 12px; overflow: hidden; max-height: 56vh; overflow-y: auto }
.tp-l { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 14px; align-items: center; padding: 9px 14px } .tp-l + .tp-l { border-top: 1px solid #f1f5f9 } .tp-l:hover { background: #f8fafc }
.tp-l b { display: block; font-size: 14px; font-weight: 500; color: #0f172a } .tp-l small { font-size: 12.5px; color: #64748b }
.tp-l em { font-style: normal; white-space: nowrap; font-size: 14px; font-weight: 600; color: #0f766e; background: #f0fdfa; border-radius: 99px; padding: 4px 11px; font-variant-numeric: tabular-nums } .tp-l em i { font-size: 11px; margin-right: 3px }
.tp-l em.sem { font-weight: 400; color: #94a3b8; background: #f1f5f9 }
`
