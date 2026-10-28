'use client'
// Tempário Mahindra nos atalhos do Centro (José, 28/10/2026: "coloca o tempário lá nos ícones lá em cima").
// Busca nas atividades com o tempo de cada uma; a equipe pode AJUSTAR o tempo de uma atividade ou INCLUIR uma nova a
// partir de uma parecida (José: "deixar o usuário atualizar o tempário… ou incluir coisas de algo parecido que já
// tem"). Aberto a partir de uma OS com alerta (`os`), mostra antes o que o técnico escreveu e as atividades que o
// Tratorilson casou — dali dá para ajustar ou incluir. Salvar refaz a previsão da OS.
// O tempário (170 KB) só carrega quando a janela abre.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import type { AjusteTempario, AtividadeTempario } from '@/lib/mecanicos/tempario'
import type { PrevisaoOS } from '@/lib/mecanicos/previsao-os-server'
import { Janela } from './JanelasInfo'

type Ativ = AtividadeTempario & { i: number; ajuste?: AjusteTempario; nova?: boolean }
interface Rel { motivo: string | null; servico: string | null; horas: string | null; tecnico: string | null; modelo: string | null; tipo: string | null }
interface Rascunho { titulo: string; base_i: number | null; baseado_em: number | null; atividade: string; minutos: string; sistema: string | null; subsistema: string | null; motivo: string }

const semAcento = (t: string) => t.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
// "EixoDianteiro" → "Eixo dianteiro"; os sistemas do PDF vêm grudados
const bonito = (t: string | null) => {
  if (!t) return 'Outros'
  const s = t.replace(/([a-zçãéí])([A-Z0-9])/g, '$1 $2').toLowerCase()
  return s.charAt(0).toUpperCase() + s.slice(1)
}
const tempo = (m: number) => { const h = Math.floor(m / 60), mm = Math.round(m % 60); return h ? `${h} h${mm ? ` ${String(mm).padStart(2, '0')} min` : ''}` : `${mm} min` }
const dataBR = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
const horasNum = (t: string | null) => { const n = Number(String(t || '').replace(',', '.').replace(/[^\d.]/g, '')); return Number.isFinite(n) ? n : 0 }

export default function TemparioJanela({ onFechar, os, onMudou }: { onFechar: () => void; os?: string; onMudou?: () => void }) {
  const [base, setBase] = useState<{ lista: (AtividadeTempario & { i: number })[]; aplicar: (b: (AtividadeTempario & { i: number })[], a: AjusteTempario[]) => Ativ[] } | null>(null)
  const [ajustes, setAjustes] = useState<AjusteTempario[]>([])
  const [semTabela, setSemTabela] = useState(false)
  const [q, setQ] = useState('')
  const [sis, setSis] = useState<string | null>(null)
  const [ras, setRas] = useState<Rascunho | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const [osDados, setOsDados] = useState<{ previsao: PrevisaoOS | null; relatorio: Rel | null } | null>(null)

  const lerAjustes = useCallback(async () => {
    try {
      const r = await fetch('/api/mecanicos/tempario', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      setAjustes(Array.isArray(j.ajustes) ? j.ajustes : [])
      setSemTabela(!!j.semTabela)
    } catch { /* fica com o base */ }
  }, [])
  const lerOS = useCallback(async (refazer = false) => {
    if (!os) return
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(os)}/previsao?relatorio=1${refazer ? '&refazer=1' : ''}`, { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      setOsDados({ previsao: j.previsao || null, relatorio: j.relatorio || null })
    } catch { setOsDados({ previsao: null, relatorio: null }) }
  }, [os])
  useEffect(() => {
    let vivo = true
    import('@/lib/mecanicos/tempario').then((m) => { if (vivo) setBase({ lista: m.TEMPARIO, aplicar: m.aplicarAjustes }) })
    void Promise.resolve().then(() => { void lerAjustes(); void lerOS() })
    return () => { vivo = false }
  }, [lerAjustes, lerOS])

  const lista = useMemo<Ativ[] | null>(() => (base ? base.aplicar(base.lista, ajustes).filter((a) => a.atividade) : null), [base, ajustes])
  const porI = useMemo(() => new Map((lista || []).map((a) => [a.i, a])), [lista])
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
    }).sort((a, b) => Number(!!b.nova) - Number(!!a.nova))
  }, [lista, q, sis])
  const mostrar = achados.slice(0, 150)

  const ajustar = (a: Ativ) => setRas({ titulo: `Ajustar: ${a.atividade}`, base_i: a.nova ? null : a.i, baseado_em: null, atividade: a.atividade, minutos: a.minutos ? String(a.minutos) : '', sistema: a.sistema, subsistema: a.subsistema, motivo: '' })
  const parecida = (a: Ativ, texto?: string, min?: number) => setRas({ titulo: `Nova atividade, parecida com: ${a.atividade}`, base_i: null, baseado_em: a.nova ? null : a.i, atividade: texto || a.atividade, minutos: min ? String(Math.round(min)) : a.minutos ? String(a.minutos) : '', sistema: a.sistema, subsistema: a.subsistema, motivo: '' })
  const nova = (texto = '', min?: number) => setRas({ titulo: 'Nova atividade no tempário', base_i: null, baseado_em: null, atividade: texto, minutos: min ? String(Math.round(min)) : '', sistema: null, subsistema: null, motivo: '' })

  const salvar = async () => {
    if (!ras) return
    setErro('')
    if (!ras.atividade.trim()) return setErro('Descreva a atividade.')
    if (!(Number(ras.minutos) > 0)) return setErro('Informe o tempo em minutos.')
    if (!ras.motivo.trim()) return setErro('Diga o motivo da mudança — fica registrado.')
    setSalvando(true)
    try {
      const r = await fetch('/api/mecanicos/tempario', { method: 'POST', headers: { ...(await authHeaders()), 'Content-Type': 'application/json' }, body: JSON.stringify({ ...ras, minutos: Number(ras.minutos), os_origem: os || null }) })
      const j = await r.json()
      if (!r.ok) { setErro(j.semTabela ? 'Falta rodar o SQL sql/tempario-ajustes.sql no Supabase.' : j.error || 'Não foi possível salvar'); setSalvando(false); return }
      setRas(null)
      await lerAjustes()
      if (os) await lerOS(true)
      onMudou?.()
    } catch { setErro('Sem conexão — tente de novo') }
    setSalvando(false)
  }
  const desfazer = async (a: AjusteTempario) => {
    if (!confirm(`Desfazer o ajuste de ${a.criado_por} (${dataBR(a.criado_em)})?`)) return
    await fetch(`/api/mecanicos/tempario?id=${a.id}`, { method: 'DELETE', headers: await authHeaders() }).catch(() => {})
    await lerAjustes()
    if (os) await lerOS(true)
    onMudou?.()
  }

  const prev = osDados?.previsao, rel = osDados?.relatorio
  const hRel = prev?.horasRelatorio ?? horasNum(rel?.horas ?? null)
  return (
    <Janela titulo={os ? `Tempário · ${os}` : 'Tempário Mahindra'} sub={os ? 'o que o técnico fez × o que o tempário prevê' : 'quanto tempo cada serviço deve levar · ajuste ou inclua atividades'} ic="fa-stopwatch" cor="#0f766e" onFechar={onFechar}>
      <style>{ESTILO_TP}</style>
      {semTabela && <p className="tp-aviso">Para ajustar ou incluir atividades falta rodar o SQL <b>sql/tempario-ajustes.sql</b> no Supabase. A consulta funciona normal.</p>}

      {os && (
        <section className="tp-os">
          {!osDados ? <p className="ji-mudo"><i className="fas fa-circle-notch fa-spin" /> lendo o relatório da OS…</p> : (
            <>
              <div className="tp-os-cab">
                <div><b>{os}</b><small>{[rel?.tecnico, rel?.modelo, rel?.tipo].filter(Boolean).join(' · ') || 'relatório do técnico'}</small></div>
                <div className="tp-os-n"><span><small>levou</small><b>{tempo(hRel * 60)}</b></span><span><small>tempário prevê</small><b>{prev?.minutosPrevistos ? tempo(prev.minutosPrevistos) : '—'}</b></span></div>
              </div>
              <div className="tp-rel">
                <small>O que o técnico escreveu</small>
                {rel?.motivo && <p><b>Diagnóstico:</b> {rel.motivo}</p>}
                {rel?.servico ? <p><b>Serviço realizado:</b> {rel.servico}</p> : <p className="ji-mudo">Sem relatório do técnico.</p>}
              </div>
              <div className="tp-casou">
                <small>{prev?.atividades.length ? 'Atividades do tempário que o Tratorilson achou no relatório' : 'Nenhuma atividade do tempário bateu com o relatório'}</small>
                {prev?.atividades.map((a) => {
                  const atual = porI.get(a.i)
                  return (
                    <div key={a.i} className="tp-l casada">
                      <div><b>{atual?.atividade || a.atividade}{a.qtd > 1 ? ` × ${a.qtd}` : ''}</b><small>{a.porque ? `“${a.porque}”` : ''}</small></div>
                      <em><i className="fas fa-stopwatch" /> {tempo((atual?.minutos ?? a.minutos) * a.qtd)}</em>
                      {atual && <span className="tp-acoes"><button type="button" onClick={() => ajustar(atual)}><i className="fas fa-pen" /> ajustar tempo</button><button type="button" onClick={() => parecida(atual, rel?.servico?.slice(0, 200) || undefined, hRel * 60)}><i className="fas fa-clone" /> incluir parecida</button></span>}
                    </div>
                  )
                })}
                {prev?.observacao && <p className="tp-obs"><i className="fas fa-robot" /> {prev.observacao}</p>}
                <button type="button" className="tp-novo" onClick={() => nova(rel?.servico?.slice(0, 200) || '', hRel ? hRel * 60 : undefined)}><i className="fas fa-plus" /> Incluir no tempário o que ele fez</button>
              </div>
            </>
          )}
        </section>
      )}

      {ras && (
        <section className="tp-form">
          <b>{ras.titulo}</b>
          <label>Atividade<textarea rows={2} value={ras.atividade} onChange={(e) => setRas({ ...ras, atividade: e.target.value })} /></label>
          <div className="tp-form-l">
            <label>Tempo (minutos)<input inputMode="numeric" value={ras.minutos} onChange={(e) => setRas({ ...ras, minutos: e.target.value.replace(/\D/g, '') })} />{Number(ras.minutos) > 0 && <small>= {tempo(Number(ras.minutos))}</small>}</label>
            <label>Sistema<input value={ras.sistema || ''} placeholder="ex.: Hidraulico" onChange={(e) => setRas({ ...ras, sistema: e.target.value || null })} /></label>
          </div>
          <label>Motivo (fica registrado)<input value={ras.motivo} placeholder={os ? `ex.: ${os} mostrou que leva mais com…` : 'por que mudar?'} onChange={(e) => setRas({ ...ras, motivo: e.target.value })} /></label>
          {erro && <p className="tp-erro">{erro}</p>}
          <div className="tp-form-b"><button type="button" className="tp-volta" onClick={() => { setRas(null); setErro('') }}>cancelar</button><button type="button" className="tp-pri" disabled={salvando} onClick={() => void salvar()}>{salvando ? 'Salvando…' : 'Salvar no tempário'}</button></div>
        </section>
      )}

      <div className="tp-busca">
        <i className="fas fa-magnifying-glass" />
        <input autoFocus={!os} placeholder="busque o serviço: embreagem, retentor, bomba injetora, ar-condicionado…" value={q} onChange={(e) => setQ(e.target.value)} />
        {q && <button type="button" onClick={() => setQ('')} aria-label="limpar"><i className="fas fa-xmark" /></button>}
      </div>
      <div className="tp-sis">
        <button type="button" className={!sis ? 'on' : ''} onClick={() => setSis(null)}>Todos</button>
        {sistemas.map(([k, n]) => <button key={k} type="button" className={sis === k ? 'on' : ''} onClick={() => setSis(sis === k ? null : k)}>{k} <small>{n}</small></button>)}
        {!os && <button type="button" className="tp-sis-novo" onClick={() => nova(q)}><i className="fas fa-plus" /> nova atividade</button>}
      </div>
      {!lista ? <p className="ji-mudo"><i className="fas fa-circle-notch fa-spin" /> carregando o tempário…</p> : (
        <>
          <small className="tp-cont">{achados.length} atividade{achados.length === 1 ? '' : 's'}{achados.length > mostrar.length ? ` · mostrando ${mostrar.length}; refine a busca` : ''}{ajustes.length ? ` · ${ajustes.length} ajuste${ajustes.length === 1 ? '' : 's'} da equipe` : ''}</small>
          <div className="tp-lista">
            {mostrar.map((a) => (
              <div key={a.i} className={`tp-l ${a.ajuste ? 'aj' : ''}`}>
                <div>
                  <b>{a.atividade}{a.nova && <span className="tp-selo novo">nova</span>}{a.ajuste && !a.nova && <span className="tp-selo">ajustada</span>}</b>
                  <small>{[bonito(a.sistema), a.subsistema && bonito(a.subsistema), a.codigo].filter(Boolean).join(' · ')}</small>
                  {a.ajuste && <small className="tp-quem">{a.nova ? 'incluída' : 'ajustada'} por {a.ajuste.criado_por} em {dataBR(a.ajuste.criado_em)}{a.ajuste.os_origem ? ` (${a.ajuste.os_origem})` : ''}: “{a.ajuste.motivo}” <button type="button" onClick={() => void desfazer(a.ajuste!)}>desfazer</button></small>}
                </div>
                {a.minutos != null ? <em><i className="fas fa-stopwatch" /> {tempo(a.minutos)}</em> : <em className="sem">sem tempo</em>}
                <span className="tp-acoes">
                  {!a.nova && <button type="button" title="mudar o tempo ou a descrição desta atividade" onClick={() => ajustar(a)}><i className="fas fa-pen" /></button>}
                  <button type="button" title="incluir uma atividade nova a partir desta" onClick={() => parecida(a)}><i className="fas fa-clone" /></button>
                </span>
              </div>
            ))}
            {!achados.length && <p className="ji-mudo">Nada no tempário com essa busca. <button type="button" className="tp-link" onClick={() => nova(q)}>Incluir “{q}”</button></p>}
          </div>
        </>
      )}
    </Janela>
  )
}

const ESTILO_TP = `
.tp-aviso { margin: 0; font-size: 13.5px; color: #92400e; background: #fffbeb; border: 1px solid #fde68a; border-radius: 10px; padding: 8px 12px }
.tp-os { display: grid; gap: 10px; border: 1px solid #ccfbf1; background: #f0fdfa; border-radius: 14px; padding: 12px 14px }
.tp-os-cab { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; align-items: center } .tp-os-cab > div:first-child { display: grid } .tp-os-cab b { font-size: 16px; font-weight: 600; color: #0f172a } .tp-os-cab small { font-size: 13px; color: #475569 }
.tp-os-n { display: flex; gap: 8px } .tp-os-n span { display: grid; background: #fefefe; border-radius: 10px; padding: 6px 12px; text-align: right } .tp-os-n small { font-size: 12px; color: #475569 } .tp-os-n b { font-size: 16px; font-weight: 500 }
.tp-rel { display: grid; gap: 4px; background: #fefefe; border-radius: 10px; padding: 10px 12px } .tp-rel > small, .tp-casou > small { font-size: 12.5px; color: #0f766e; font-weight: 500 } .tp-rel p { margin: 0; font-size: 14px; color: #0f172a; line-height: 1.45 } .tp-rel p b { font-weight: 500; color: #475569 }
.tp-casou { display: grid; gap: 6px } .tp-obs { margin: 0; font-size: 13px; color: #334155 } .tp-obs i { color: #0f766e }
.tp-novo { justify-self: start; border: 1px dashed #0f766e; background: #fefefe; color: #0f766e; border-radius: 99px; padding: 7px 14px; font-family: inherit; font-size: 13.5px; cursor: pointer } .tp-novo:hover { background: #ccfbf1 }
.tp-form { display: grid; gap: 8px; border: 1px solid #93c5fd; background: #eff6ff; border-radius: 14px; padding: 12px 14px } .tp-form > b { font-size: 14.5px; font-weight: 500 }
.tp-form label { display: grid; gap: 4px; font-size: 13px; color: #334155 } .tp-form textarea, .tp-form input { border: 1px solid #cbd5e1; border-radius: 10px; padding: 8px 10px; font-family: inherit; font-size: 14px; background: #fefefe; color: #0f172a; resize: vertical }
.tp-form-l { display: grid; grid-template-columns: 200px minmax(0, 1fr); gap: 10px } .tp-form-l small { font-size: 12px; color: #1d4ed8 }
.tp-form-b { display: flex; justify-content: flex-end; gap: 10px; align-items: center } .tp-volta { border: 0; background: none; color: #475569; font-family: inherit; cursor: pointer }
.tp-pri { border: 0; background: #0f172a; color: #fefefe; border-radius: 99px; padding: 9px 18px; font-family: inherit; font-size: 14px; cursor: pointer } .tp-pri:hover:not(:disabled) { background: #0f766e } .tp-pri:disabled { opacity: .5 }
.tp-erro { margin: 0; font-size: 13px; color: #991b1b }
.tp-busca { display: flex; align-items: center; gap: 10px; border: 1px solid #cbd5e1; border-radius: 99px; padding: 8px 14px; background: #fefefe } .tp-busca > i { color: #0f766e }
.tp-busca input { flex: 1; border: 0; outline: none; font-family: inherit; font-size: 15px; background: transparent; color: #0f172a; min-width: 0 } .tp-busca button { border: 0; background: none; color: #64748b; cursor: pointer }
.tp-sis { display: flex; gap: 6px; flex-wrap: wrap } .tp-sis button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 5px 12px; font-family: inherit; font-size: 13px; color: #334155; cursor: pointer } .tp-sis button small { color: #94a3b8; margin-left: 2px }
.tp-sis button:hover { border-color: #0f766e } .tp-sis button.on { background: #0f766e; border-color: #0f766e; color: #fefefe } .tp-sis button.on small { color: #ccfbf1 } .tp-sis .tp-sis-novo { border-style: dashed; color: #0f766e }
.tp-cont { font-size: 12.5px; color: #475569 }
.tp-lista { display: grid; border: 1px solid #eef2f7; border-radius: 12px; overflow: hidden; max-height: 52vh; overflow-y: auto }
.tp-l { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 12px; align-items: center; padding: 9px 14px } .tp-l + .tp-l { border-top: 1px solid #f1f5f9 } .tp-l:hover { background: #f8fafc } .tp-l.aj { background: #fffdf5 }
.tp-l.casada { background: #fefefe; border: 1px solid #ccfbf1; border-radius: 10px }
.tp-l b { display: block; font-size: 14px; font-weight: 500; color: #0f172a } .tp-l small { display: block; font-size: 12.5px; color: #64748b } .tp-quem { color: #92400e !important } .tp-quem button { border: 0; background: none; color: #1d4ed8; cursor: pointer; font-family: inherit; font-size: 12.5px; text-decoration: underline }
.tp-selo { display: inline-block; margin-left: 6px; font-size: 11px; font-weight: 500; color: #92400e; background: #fef3c7; border-radius: 99px; padding: 1px 7px; vertical-align: 1px } .tp-selo.novo { color: #1d4ed8; background: #dbeafe }
.tp-l em { font-style: normal; white-space: nowrap; font-size: 14px; font-weight: 600; color: #0f766e; background: #f0fdfa; border-radius: 99px; padding: 4px 11px; font-variant-numeric: tabular-nums } .tp-l em i { font-size: 11px; margin-right: 3px }
.tp-l em.sem { font-weight: 400; color: #94a3b8; background: #f1f5f9 }
.tp-acoes { display: inline-flex; gap: 4px } .tp-acoes button { border: 1px solid #e2e8f0; background: #fefefe; border-radius: 99px; padding: 5px 10px; font-family: inherit; font-size: 12.5px; color: #334155; cursor: pointer; white-space: nowrap } .tp-acoes button:hover { border-color: #0f766e; color: #0f766e }
.tp-link { border: 0; background: none; color: #1d4ed8; cursor: pointer; font-family: inherit; text-decoration: underline }
@media (max-width: 700px) { .tp-l { grid-template-columns: 1fr auto } .tp-acoes { grid-column: 1 / -1 } .tp-form-l { grid-template-columns: 1fr } }
`
