'use client'
// QUADRO DA LOUSA — inspirado no quadro branco da oficina (foto do José, 20/10/2026):
// linhas = técnicos, colunas = segunda a sábado, cartões = OS (e lançamentos da Lousa),
// FAIXA VERMELHA = embaixo dela ficam as OS PENDENTES (sem dia marcado).
// Arrastar o cartão para outro dia/técnico muda a OS; arrastar para baixo da faixa deixa pendente.
// Nesta versão de TESTE o arrastar é só SIMULADO: mostra o que aconteceria e não grava nada.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Info, MapPin, Wrench } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { addDias, localDe, diaDaSemana } from '@/lib/salas/regras'
import type { ItemAgenda, Pessoa } from '@/lib/agenda/regras'

export type VarianteQuadro = 'parede' | 'semana' | 'lousa'

interface Pendente { id: string; cliente: string | null; tecnico: string | null; status: string | null; cidade: string | null; oficina: boolean; solicitacao: string | null; criadaEm: string | null }
interface Dados { pessoas: Pessoa[]; itens: ItemAgenda[]; pendentes: Pendente[]; avisos?: string[]; agora: { dia: string } }

/** o que foi arrastado (simulado): dias novos (null = pendente) e técnico novo */
interface Mudanca { dias: string[] | null; pessoa?: string }
interface Aviso { id: number; texto: string }

const NOMES_DIA = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO']
const segundaDe = (dia: string) => { const w = diaDaSemana(dia); return addDias(dia, w === 0 ? -6 : 1 - w) }
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const curtoDia = (dia: string) => `${NOMES_DIA[diaDaSemana(dia)].slice(0, 3).toLowerCase()} ${ddmm(dia)}`
const semZeros = (id: string) => id.replace(/^OS-?/i, '').replace(/^0+(?=\d)/, '')

/** dias (YYYY-MM-DD) que o item ocupa, sem domingo */
function diasDoItem(i: ItemAgenda): string[] {
  const ini = localDe(i.inicio).dia
  if (!i.diaInteiro) return [ini]
  const fim = addDias(localDe(i.fim).dia, -1)
  const out: string[] = []
  for (let d = ini; d <= fim && out.length < 40; d = addDias(d, 1)) if (diaDaSemana(d) !== 0) out.push(d)
  return out.length ? out : [ini]
}
function deslocar(dias: string[], delta: number): string[] {
  return dias.map((d) => { let n = addDias(d, delta); if (diaDaSemana(n) === 0) n = addDias(n, delta >= 0 ? 1 : -1); return n })
}

export default function QuadroLousa({ variante }: { variante: VarianteQuadro }) {
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [ini, setIni] = useState<string | null>(null)
  const [mudancas, setMudancas] = useState<Record<string, Mudanca>>({})
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [sobre, setSobre] = useState<string | null>(null) // célula com o cartão por cima (arrastando)

  const semanas = variante === 'parede' ? 2 : 1
  useEffect(() => { void Promise.resolve().then(() => setIni((x) => x || segundaDe(localDe(new Date().toISOString()).dia))) }, [])

  useEffect(() => {
    if (!ini) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/lousa/quadro?de=${ini}&ate=${addDias(ini, 13)}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.error || 'Não deu para carregar o quadro.'); return }
        setErro(''); setDados(j)
      } catch { if (vivo) setErro('Sem conexão.') }
    })()
    return () => { vivo = false }
  }, [ini])

  const avisar = useCallback((texto: string) => {
    const id = Date.now() + Math.random()
    setAvisos((l) => [{ id, texto }, ...l].slice(0, 4))
    setTimeout(() => setAvisos((l) => l.filter((a) => a.id !== id)), 7000)
  }, [])

  const hoje = dados?.agora.dia || ''
  const colunas = useMemo(() => {
    if (!ini) return [] as string[][]
    return Array.from({ length: semanas }, (_, s) => Array.from({ length: 6 }, (_, d) => addDias(ini, s * 7 + d)))
  }, [ini, semanas])

  const pessoasPorId = useMemo(() => new Map((dados?.pessoas || []).map((p) => [p.id, p])), [dados])
  const nomeCurto = (id?: string) => (id ? (pessoasPorId.get(id)?.tecnicoNome || pessoasPorId.get(id)?.nome || '').split(' ')[0] : '')

  // onde cada cartão está (com as mudanças simuladas aplicadas)
  const { celulas, pendentesSim } = useMemo(() => {
    const cel = new Map<string, { item: ItemAgenda; n: number; total: number }[]>()
    const pend: ItemAgenda[] = []
    for (const it of dados?.itens || []) {
      const m = mudancas[it.id]
      if (m && m.dias === null) { pend.push(it); continue }
      const dias = m?.dias || diasDoItem(it)
      const pessoas = m?.pessoa ? [m.pessoa] : it.pessoas
      dias.forEach((d, n) => pessoas.forEach((p) => {
        const k = `${p}|${d}`
        cel.set(k, [...(cel.get(k) || []), { item: it, n, total: dias.length }])
      }))
    }
    return { celulas: cel, pendentesSim: pend }
  }, [dados, mudancas])

  // pendentes reais que foram arrastadas para um dia (simulado)
  const pendentesMovidas = useMemo(() => Object.entries(mudancas).filter(([k, m]) => k.startsWith('pend:') && m.dias), [mudancas])
  const linhas = useMemo(() => {
    const ps = (dados?.pessoas || []).filter((p) => p.tecnico)
    return ps.filter((p) => p.id !== 'sem-tecnico' || [...celulas.keys()].some((k) => k.startsWith('sem-tecnico|')))
  }, [dados, celulas])

  // ---------- arrastar (simulado)
  const soltar = (e: React.DragEvent, alvo: { pessoa: string; dia: string } | 'pendente') => {
    e.preventDefault(); setSobre(null)
    let d: { tipo: 'item' | 'pend'; id: string; dia?: string }
    try { d = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
    if (d.tipo === 'pend') {
      const p = dados?.pendentes.find((x) => x.id === d.id)
      if (!p || alvo === 'pendente') return
      setMudancas((m) => ({ ...m, ['pend:' + d.id]: { dias: [alvo.dia], pessoa: alvo.pessoa } }))
      avisar(`A ${p.id} (${p.cliente || 'cliente'}) ganharia o dia ${curtoDia(alvo.dia)} com ${nomeCurto(alvo.pessoa) || 'esse técnico'} — e sairia das pendentes.`)
      return
    }
    const it = dados?.itens.find((x) => x.id === d.id)
    if (!it) return
    const os = it.fonte === 'os'
    const nome = os ? `A ${it.ref}` : 'O lançamento da Lousa'
    if (alvo === 'pendente') {
      setMudancas((m) => ({ ...m, [it.id]: { dias: null } }))
      avisar(`${nome} ficaria PENDENTE (sem dia marcado)${os ? ' — a data de execução sairia da OS' : ''}.`)
      return
    }
    const atual = mudancas[it.id]?.dias || diasDoItem(it)
    const origem = d.dia || atual[0]
    const delta = Math.round((new Date(alvo.dia + 'T12:00:00Z').getTime() - new Date(origem + 'T12:00:00Z').getTime()) / 86_400_000)
    const novos = delta ? deslocar(atual, delta) : atual
    const pessoaAntes = mudancas[it.id]?.pessoa || it.pessoas[0]
    const trocouTecnico = alvo.pessoa !== pessoaAntes
    if (!delta && !trocouTecnico) return
    setMudancas((m) => ({ ...m, [it.id]: { dias: novos, pessoa: alvo.pessoa } }))
    const partes: string[] = []
    if (delta) partes.push(novos.length > 1 ? `de ${curtoDia(atual[0])}–${curtoDia(atual[atual.length - 1])} para ${curtoDia(novos[0])}–${curtoDia(novos[novos.length - 1])}` : `de ${curtoDia(atual[0])} para ${curtoDia(novos[0])}`)
    if (trocouTecnico) partes.push(`do ${nomeCurto(pessoaAntes) || 'sem técnico'} para o ${nomeCurto(alvo.pessoa) || 'sem técnico'}`)
    avisar(`${nome} passaria ${partes.join(' e ')}${os ? ' — a data também mudaria na OS.' : '.'}`)
  }
  const arrastar = (e: React.DragEvent, d: { tipo: 'item' | 'pend'; id: string; dia?: string }) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(d)); e.dataTransfer.effectAllowed = 'move'
  }

  if (!ini) return null
  const mudou = Object.keys(mudancas).length > 0
  const fimJanela = addDias(ini, semanas * 7 - 2)
  const titulo = `${ddmm(ini)} a ${ddmm(fimJanela)}`

  const cartaoItem = (c: { item: ItemAgenda; n: number; total: number }, dia: string) => {
    const it = c.item
    const os = it.fonte === 'os'
    const tipo = (it.extra as { tipo?: string } | undefined)?.tipo
    if (!os && (tipo === 'feriado' || tipo === 'faltou' || tipo === 'saida')) {
      return (
        <div key={it.id + dia} className="ql-ausente" draggable onDragStart={(e) => arrastar(e, { tipo: 'item', id: it.id, dia })} title={it.titulo}>
          <span className="ql-traco" style={{ background: it.cor || '#dc2626' }} /><small>{it.titulo}</small>
        </div>
      )
    }
    const situacao = it.detalhes?.find((x) => x[0] === 'Situação')?.[1]
    return (
      <div key={it.id + dia} className={`ql-card ${os ? 'os' : 'lousa'} ${it.esmaecido ? 'apagado' : ''} ${mudancas[it.id] ? 'mexido' : ''}`}
        draggable onDragStart={(e) => arrastar(e, { tipo: 'item', id: it.id, dia })}
        title={[it.titulo, it.descricao, situacao].filter(Boolean).join('\n')}>
        <div className="ql-card-topo">
          <b>{os ? `OS ${semZeros(it.ref)}` : 'Lousa'}</b>
          {c.total > 1 && <span className="ql-dias">{c.n + 1}/{c.total}</span>}
        </div>
        <div className="ql-cli">{os ? it.titulo.replace(/^[^·]*·\s*/, '') : it.titulo}</div>
        {variante !== 'parede' && it.descricao && <div className="ql-desc">{it.descricao}</div>}
        {it.local && <div className="ql-local">{/oficina/i.test(it.local) ? <Wrench size={10} /> : <MapPin size={10} />} {it.local}</div>}
      </div>
    )
  }

  return (
    <div className={`ql ql-${variante}`}>
      <style>{CSS_QUADRO}</style>
      <div className="ql-barra">
        <button className="ql-nav" onClick={() => setIni(addDias(ini, -7))} title="Semana anterior"><ChevronLeft size={18} /></button>
        <button className="ql-hoje" onClick={() => setIni(segundaDe(hoje || ini))}>Hoje</button>
        <button className="ql-nav" onClick={() => setIni(addDias(ini, 7))} title="Próxima semana"><ChevronRight size={18} /></button>
        <b className="ql-titulo">{titulo}</b>
        <span className="ql-teste"><Info size={13} /> Teste: arrastar mostra o que mudaria na OS, mas ainda não grava.</span>
        {mudou && <button className="ql-reset" onClick={() => setMudancas({})}><RotateCcw size={13} /> Desfazer tudo</button>}
      </div>
      {erro && <div className="ql-erro">{erro}</div>}
      {!dados && !erro && <div className="ql-carregando">Carregando o quadro…</div>}

      {dados && (
        <div className="ql-moldura">
          <div className="ql-grade" style={{ gridTemplateColumns: Array.from({ length: semanas }, () => 'minmax(110px, auto) repeat(6, minmax(0, 1fr))').join(' ') }}>
            {/* cabeçalho */}
            {colunas.map((dias, s) => [
              <div key={`h${s}`} className={`ql-cab ql-cab-sem ${s > 0 ? 'ql-div' : ''}`}><small>{ddmm(dias[0])} a {ddmm(dias[5])}</small></div>,
              ...dias.map((d) => (
                <div key={`h${d}`} className={`ql-cab ${d === hoje ? 'hoje' : ''}`}><small>{ddmm(d)}</small><b>{NOMES_DIA[diaDaSemana(d)]}</b></div>
              )),
            ])}
            {/* linhas dos técnicos */}
            {linhas.map((p) => colunas.map((dias, s) => [
              <div key={`n${p.id}${s}`} className={`ql-nome ${s > 0 ? 'ql-div' : ''}`}>{p.id === 'sem-tecnico' ? 'SEM TÉCNICO' : (p.tecnicoNome || p.nome).split(' ')[0].toUpperCase()}</div>,
              ...dias.map((d) => {
                const k = `${p.id}|${d}`
                const pend = pendentesMovidas.filter(([, m]) => m.pessoa === p.id && m.dias?.[0] === d)
                return (
                  <div key={k} className={`ql-cel ${d === hoje ? 'hoje' : ''} ${sobre === k ? 'sobre' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); if (sobre !== k) setSobre(k) }} onDragLeave={() => setSobre((x) => (x === k ? null : x))}
                    onDrop={(e) => soltar(e, { pessoa: p.id, dia: d })}>
                    {(celulas.get(k) || []).map((c) => cartaoItem(c, d))}
                    {pend.map(([key]) => {
                      const pe = dados.pendentes.find((x) => 'pend:' + x.id === key)!
                      return <div key={key} className="ql-card os mexido"><div className="ql-card-topo"><b>OS {semZeros(pe.id)}</b></div><div className="ql-cli">{pe.cliente}</div></div>
                    })}
                  </div>
                )
              }),
            ]))}
          </div>

          {/* FAIXA VERMELHA + pendentes */}
          <div className="ql-faixa"><span>PENDENTES — arraste para cá o que ainda não tem dia</span></div>
          <div className={`ql-pendentes ${sobre === 'pend' ? 'sobre' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (sobre !== 'pend') setSobre('pend') }} onDragLeave={() => setSobre((x) => (x === 'pend' ? null : x))}
            onDrop={(e) => soltar(e, 'pendente')}>
            {dados.pendentes.filter((p) => !mudancas['pend:' + p.id]).map((p) => (
              <div key={p.id} className="ql-card os pend" draggable onDragStart={(e) => arrastar(e, { tipo: 'pend', id: p.id })}
                title={[p.cliente, p.solicitacao, p.status].filter(Boolean).join('\n')}>
                <div className="ql-card-topo"><b>OS {semZeros(p.id)}</b>{p.tecnico && <span className="ql-dias">{p.tecnico.split(' ')[0]}</span>}</div>
                <div className="ql-cli">{p.cliente}</div>
                {variante !== 'parede' && p.solicitacao && <div className="ql-desc">{p.solicitacao}</div>}
                <div className="ql-local">{p.oficina ? <><Wrench size={10} /> Oficina</> : p.cidade ? <><MapPin size={10} /> {p.cidade}</> : p.status}</div>
              </div>
            ))}
            {pendentesSim.map((it) => (
              <div key={it.id} className="ql-card os pend mexido" draggable onDragStart={(e) => arrastar(e, { tipo: 'item', id: it.id })}>
                <div className="ql-card-topo"><b>{it.fonte === 'os' ? `OS ${semZeros(it.ref)}` : 'Lousa'}</b></div>
                <div className="ql-cli">{it.fonte === 'os' ? it.titulo.replace(/^[^·]*·\s*/, '') : it.titulo}</div>
              </div>
            ))}
            {!dados.pendentes.length && !pendentesSim.length && <div className="ql-vazio">Nenhuma OS sem dia marcado. Arraste um cartão para cá para deixá-lo pendente.</div>}
          </div>
        </div>
      )}

      <div className="ql-avisos">
        {avisos.map((a) => <div key={a.id} className="ql-aviso"><Info size={14} /> {a.texto}</div>)}
      </div>
    </div>
  )
}

const CSS_QUADRO = `
@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap');
.ql { --ql-linha: var(--portal-border); --ql-azul: #1e3a8a; --ql-fundo: var(--portal-bg-card); --ql-cel: var(--portal-bg-card); display: grid; gap: 12px; color: var(--portal-text); }
.ql-barra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ql-nav, .ql-hoje, .ql-reset { display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 10px; border-radius: 9px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); font-family: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
.ql-titulo { font-size: 17px; margin: 0 6px; }
.ql-teste { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 5px 10px; border-radius: 999px; }
.ql-reset { color: #b91c1c; }
.ql-erro { padding: 12px; border-radius: 10px; background: #fef2f2; color: #b91c1c; font-weight: 600; }
.ql-carregando { padding: 30px; text-align: center; color: var(--portal-text-muted); }
.ql-moldura { background: var(--ql-fundo); border: 1px solid var(--portal-border); border-radius: 14px; overflow: hidden; }
.ql-grade { display: grid; }
.ql-cab { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; border-bottom: 2px solid var(--ql-azul); border-right: 1px solid var(--ql-linha); }
.ql-cab small { font-size: 11px; color: var(--portal-text-muted); font-weight: 700; }
.ql-cab b { font-size: 14px; font-weight: 900; color: var(--ql-azul); letter-spacing: .3px; }
.ql-cab.hoje { background: color-mix(in srgb, #2563eb 8%, transparent); }
.ql-cab.hoje b::after { content: ' • hoje'; font-size: 10px; color: #2563eb; }
.ql-cab-sem { min-width: 110px; }
.ql-cab-sem small { color: var(--ql-azul); font-size: 12px; }
.ql-nome { display: flex; align-items: center; padding: 8px 12px; font-weight: 900; font-size: 15px; color: var(--ql-azul); border-bottom: 1px solid var(--ql-linha); border-right: 2px solid var(--ql-azul); min-width: 110px; }
.ql-div { border-left: 3px solid #dc2626; }
.ql-cel { min-height: 74px; padding: 5px; display: flex; flex-direction: column; gap: 5px; border-bottom: 1px solid var(--ql-linha); border-right: 1px solid var(--ql-linha); background: var(--ql-cel); transition: background .15s; min-width: 0; }
.ql-cel.hoje { background: color-mix(in srgb, #2563eb 4%, var(--ql-cel)); }
.ql-cel.sobre, .ql-pendentes.sobre { background: color-mix(in srgb, #2563eb 14%, var(--ql-cel)); box-shadow: inset 0 0 0 2px #2563eb; }
.ql-card { position: relative; padding: 6px 8px; border-radius: 8px; background: var(--portal-bg-card); border: 1px solid var(--portal-border); border-left: 3px solid #2563eb; box-shadow: 0 1px 2px rgba(0,0,0,.06); cursor: grab; font-size: 11.5px; line-height: 1.3; min-width: 0; transition: transform .15s, box-shadow .15s; }
.ql-card:hover { transform: translateY(-1px); box-shadow: 0 4px 10px rgba(0,0,0,.1); }
.ql-card:active { cursor: grabbing; }
.ql-card.lousa { border-left-color: #0d9488; border-style: dashed; border-left-style: solid; }
.ql-card.apagado { opacity: .55; }
.ql-card.mexido { box-shadow: 0 0 0 2px #f59e0b; }
.ql-card.pend { border-left-color: #dc2626; width: 190px; }
.ql-card-topo { display: flex; align-items: center; justify-content: space-between; gap: 4px; }
.ql-card-topo b { font-size: 11.5px; font-weight: 900; }
.ql-dias { font-size: 9.5px; font-weight: 800; padding: 0 5px; border-radius: 99px; background: var(--portal-bg-secondary); color: var(--portal-text-secondary); white-space: nowrap; }
.ql-cli { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ql-desc { color: var(--portal-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 1px; }
.ql-local { display: flex; align-items: center; gap: 3px; color: var(--portal-text-muted); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
.ql-ausente { display: flex; align-items: center; gap: 6px; cursor: grab; }
.ql-traco { width: 26px; height: 3px; border-radius: 3px; }
.ql-ausente small { font-size: 10.5px; color: #b91c1c; font-weight: 700; }
.ql-faixa { height: 12px; background: #dc2626; position: relative; }
.ql-faixa span { position: absolute; left: 12px; top: -1px; font-size: 9.5px; line-height: 14px; font-weight: 800; letter-spacing: .5px; color: #fefefe; }
.ql-pendentes { min-height: 90px; padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start; transition: background .15s; }
.ql-vazio { color: var(--portal-text-muted); font-size: 13px; padding: 14px 4px; }
.ql-avisos { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 9500; display: grid; gap: 8px; width: min(560px, calc(100vw - 32px)); pointer-events: none; }
.ql-aviso { display: flex; align-items: flex-start; gap: 8px; padding: 11px 14px; border-radius: 12px; background: #0f172a; color: #fefefe; font-size: 13px; line-height: 1.4; box-shadow: 0 12px 30px rgba(15,23,42,.3); animation: qlAviso .35s cubic-bezier(.34,1.4,.5,1); }
@keyframes qlAviso { from { opacity: 0; transform: translateY(14px) } }

/* opção 2 — uma semana, cartões maiores */
.ql-semana .ql-cel { min-height: 104px; padding: 7px; gap: 6px; }
.ql-semana .ql-card { font-size: 12.5px; padding: 8px 10px; }
.ql-semana .ql-card-topo b { font-size: 12.5px; }

/* opção 3 — lousa de verdade: quadro branco, fita azul, letra de pincel */
.ql-lousa { --ql-linha: #2f5fbf; --ql-azul: #1e3a8a; --ql-fundo: #fbfbf8; --ql-cel: #fbfbf8; }
.ql-lousa .ql-moldura { border: 8px solid #c9ccd1; border-radius: 6px; box-shadow: inset 0 0 0 1px #9aa0a6, 0 6px 18px rgba(0,0,0,.12); color: #111; }
.ql-lousa .ql-cab, .ql-lousa .ql-nome { border-color: #2f5fbf; }
.ql-lousa .ql-cel { border-right: 3px solid #2f5fbf; border-bottom: 3px solid #2f5fbf; }
.ql-lousa .ql-cab { border-right: 3px solid #2f5fbf; border-bottom: 3px solid #2f5fbf; }
.ql-lousa .ql-nome { border-bottom: 3px solid #2f5fbf; border-right: 3px solid #2f5fbf; font-size: 17px; }
.ql-lousa .ql-div { border-left: 5px solid #dc2626; }
.ql-lousa .ql-card { background: transparent; border: none; box-shadow: none; padding: 2px 3px; font-family: 'Kalam', cursive; font-size: 13px; color: #1f2937; border-radius: 4px; }
.ql-lousa .ql-card:hover { background: rgba(37,99,235,.06); transform: none; }
.ql-lousa .ql-card-topo b { font-family: 'Kalam', cursive; font-size: 13.5px; text-decoration: underline; color: #111; }
.ql-lousa .ql-card.lousa { color: #0f766e; }
.ql-lousa .ql-card.pend { color: #b91c1c; width: 170px; }
.ql-lousa .ql-card.mexido { background: rgba(245,158,11,.14); }
.ql-lousa .ql-desc, .ql-lousa .ql-local { color: #374151; }
.ql-lousa .ql-dias { background: transparent; color: #b91c1c; font-family: 'Kalam', cursive; }
.ql-lousa .ql-faixa { height: 16px; }
.ql-lousa .ql-pendentes { background: #fbfbf8; }
@media (max-width: 900px) { .ql-moldura { overflow-x: auto; } .ql-grade { min-width: 860px; } }
`
