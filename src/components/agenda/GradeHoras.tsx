'use client'
// AGENDA — grade de horas estilo Google Agenda (Dia · Semana · Pessoas lado a lado).
// Coluna = um dia (Dia/Semana) ou uma pessoa num dia (Pessoas). Faixa "dia inteiro" no topo,
// linha vermelha do agora, eventos sobrepostos lado a lado. Clique/arraste no vazio = criar;
// arrastar evento = mover (inclusive para outra coluna); puxar a borda de baixo = duração.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  localDe, minutos, hhmm, tocaDia, noTopo, organizarColunas, empilharTopo, horaCurta, textoSobre, DIAS_CURTOS, diaDaSemana,
  type ItemAgenda, type Pessoa,
} from '@/lib/agenda/regras'

export interface Coluna { key: string; dia: string; pessoa?: Pessoa }
export const HORA_PX = 48
const PASSO = 15
const LINHA_TOPO = 22
const MAX_LINHAS_TOPO = 3

interface Props {
  colunas: Coluna[]
  itens: ItemAgenda[]
  hoje: string
  agoraHora: string
  corDe: (it: ItemAgenda, col?: Coluna) => string
  podeArrastar: (it: ItemAgenda) => boolean
  onAbrir: (it: ItemAgenda, rect: DOMRect) => void
  onCriar: (col: Coluna, ini: number, fim: number, rect: DOMRect) => void
  onCriarDiaInteiro: (col: Coluna, rect: DOMRect) => void
  onMover: (it: ItemAgenda, col: Coluna, ini: number, fim: number) => void
  onIrParaDia?: (dia: string) => void
  /** fantasma da criação em andamento (popover aberto) */
  rascunho?: { colKey: string; ini: number; fim: number } | null
}

type Arraste =
  | { tipo: 'criar'; col: number; a: number; b: number }
  | { tipo: 'mover'; it: ItemAgenda; col0: number; col: number; ini: number; dur: number; offset: number; mexeu: boolean; x0: number; y0: number }
  | { tipo: 'esticar'; it: ItemAgenda; col: number; ini: number; fim: number }

const minDoItem = (it: ItemAgenda, dia: string) => {
  const a = localDe(it.inicio), z = localDe(it.fim)
  return { ini: a.dia < dia ? 0 : minutos(a.hora), fim: z.dia > dia ? 24 * 60 : minutos(z.hora) }
}
const cabe = (it: ItemAgenda, c: Coluna) => tocaDia(it, c.dia) && (!c.pessoa || it.pessoas.includes(c.pessoa.id))

export default function GradeHoras(p: Props) {
  const { colunas, itens, hoje, agoraHora, corDe } = p
  const rolagem = useRef<HTMLDivElement>(null)
  const corpo = useRef<HTMLDivElement>(null)
  const [arr, setArr] = useState<Arraste | null>(null)
  const arrRef = useRef<Arraste | null>(null)
  const [topoAberto, setTopoAberto] = useState(false)
  const set = (a: Arraste | null) => { arrRef.current = a; setArr(a) }

  // Largura da barra de rolagem: o cabeçalho reserva o mesmo espaço e as colunas alinham.
  const [barra, setBarra] = useState(0)
  useLayoutEffect(() => {
    const medir = () => { const r = rolagem.current; if (r) setBarra(r.offsetWidth - r.clientWidth) }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [colunas.length])

  // Abre já na manhã (07:00), como o Google.
  useEffect(() => { if (rolagem.current) rolagem.current.scrollTop = 7 * HORA_PX - 8 }, [])

  // ---------- faixa "dia inteiro": barras contínuas por sequência de colunas
  const topo = useMemo(() => {
    const barras: { id: string; it: ItemAgenda; c0: number; c1: number; continuaAntes: boolean; continuaDepois: boolean }[] = []
    for (const it of itens) {
      if (!noTopo(it)) continue
      let ini = -1
      colunas.forEach((c, i) => {
        const dentro = cabe(it, c)
        if (dentro && ini < 0) ini = i
        const ultimo = i === colunas.length - 1
        if ((!dentro || ultimo) && ini >= 0) {
          const fim = dentro ? i : i - 1
          barras.push({ id: `${it.id}#${ini}`, it, c0: ini, c1: fim, continuaAntes: localDe(it.inicio).dia < colunas[ini].dia, continuaDepois: false })
          ini = -1
        }
      })
    }
    const pad = (n: number) => String(n).padStart(3, '0')
    const linhas = empilharTopo(barras.map((b) => ({ id: b.id, ini: pad(b.c0), fim: pad(b.c1) })))
    const total = barras.length ? Math.max(...barras.map((b) => linhas.get(b.id)!)) + 1 : 0
    return { barras: barras.map((b) => ({ ...b, linha: linhas.get(b.id)! })), total }
  }, [itens, colunas])
  const linhasVisiveis = topoAberto ? topo.total : Math.min(topo.total, MAX_LINHAS_TOPO)
  const escondidasPorCol = (ci: number) => topo.barras.filter((b) => b.linha >= linhasVisiveis && b.c0 <= ci && b.c1 >= ci).length

  // ---------- itens com hora por coluna, já encaixados lado a lado
  const porColuna = useMemo(() => colunas.map((c) => {
    const lista = itens.filter((it) => !noTopo(it) && cabe(it, c)).map((it) => ({ it, ...minDoItem(it, c.dia) }))
    const lay = organizarColunas(lista.map((x) => ({ id: x.it.id, ini: x.ini, fim: Math.max(x.fim, x.ini + 20) })))
    return lista.map((x) => ({ ...x, ...lay.get(x.it.id)! }))
  }), [itens, colunas])

  // ---------- ponteiro → coluna/minuto
  const posicao = (e: { clientX: number; clientY: number }) => {
    const r = corpo.current!.getBoundingClientRect()
    const col = Math.max(0, Math.min(colunas.length - 1, Math.floor(((e.clientX - r.left) / r.width) * colunas.length)))
    const min = Math.max(0, Math.min(24 * 60 - PASSO, Math.floor((((e.clientY - r.top) / HORA_PX) * 60) / PASSO) * PASSO))
    return { col, min }
  }

  useEffect(() => {
    if (!arr) return
    const mover = (e: PointerEvent) => {
      const a = arrRef.current
      if (!a) return
      const { col, min } = posicao(e)
      if (a.tipo === 'criar') set({ ...a, col: a.col, b: min })
      else if (a.tipo === 'esticar') set({ ...a, fim: Math.max(a.ini + PASSO, Math.min(24 * 60, min + PASSO)) })
      else {
        if (!p.podeArrastar(a.it)) return // só clique (abre o detalhe)
        const mexeu = a.mexeu || Math.abs(e.clientX - a.x0) + Math.abs(e.clientY - a.y0) > 5
        const ini = Math.max(0, Math.min(24 * 60 - a.dur, Math.round((min - a.offset) / PASSO) * PASSO))
        set({ ...a, col, ini, mexeu })
      }
    }
    const soltar = (e: PointerEvent) => {
      const a = arrRef.current
      set(null)
      if (!a) return
      if (a.tipo === 'criar') {
        const ini = Math.min(a.a, a.b), fim = Math.max(a.a, a.b) + PASSO
        const r = new DOMRect(e.clientX, e.clientY, 1, 1)
        // clique simples = 1 h (Google: 30 min; aqui 1 h, como a Sala)
        p.onCriar(colunas[a.col], ini, a.a === a.b ? Math.min(ini + 60, 24 * 60) : fim, r)
      } else if (a.tipo === 'esticar') {
        if (a.fim !== minDoItem(a.it, colunas[a.col].dia).fim) p.onMover(a.it, colunas[a.col], a.ini, a.fim)
      } else if (!a.mexeu) {
        const el = document.querySelector(`[data-item="${CSS.escape(a.it.id)}"]`)
        p.onAbrir(a.it, el ? el.getBoundingClientRect() : new DOMRect(e.clientX, e.clientY, 1, 1))
      } else if (a.col !== a.col0 || a.ini !== minDoItem(a.it, colunas[a.col0].dia).ini) {
        p.onMover(a.it, colunas[a.col], a.ini, a.ini + a.dur)
      }
    }
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar, { once: true })
    return () => { window.removeEventListener('pointermove', mover); window.removeEventListener('pointerup', soltar) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [arr === null])

  const MIN_COL = colunas.length > 7 ? 120 : 0
  const largCols = `repeat(${colunas.length}, minmax(${MIN_COL}px, 1fr))`
  const agoraMin = minutos(agoraHora)

  return (
    <div className="gc-grade" style={{ ['--gc-barra' as string]: `${barra}px` }}>
      <div className="gc-grade-in" style={{ minWidth: MIN_COL ? 64 + colunas.length * MIN_COL + barra : undefined }}>
      {/* Cabeçalho: dias ou pessoas */}
      <div className="gc-cab" style={{ gridTemplateColumns: `64px ${largCols}` }}>
        <div className="gc-fuso">GMT-03</div>
        {colunas.map((c) => {
          const ehHoje = c.dia === hoje
          return c.pessoa ? (
            <div key={c.key} className="gc-cab-col gc-cab-pessoa" title={c.pessoa.nome}>
              <span className="gc-avatar" style={{ background: c.pessoa.cor, color: textoSobre(c.pessoa.cor) }}>
                {c.pessoa.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={c.pessoa.avatar_url} alt="" />
                  : c.pessoa.nome.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <span className="gc-cab-nome">{c.pessoa.nome.split(' ').slice(0, 2).join(' ')}</span>
              <span className="gc-cab-setor">{c.pessoa.setor}</span>
            </div>
          ) : (
            <button key={c.key} className={`gc-cab-col${ehHoje ? ' gc-hoje' : ''}`} onClick={() => p.onIrParaDia?.(c.dia)}>
              <span className="gc-cab-sem">{DIAS_CURTOS[diaDaSemana(c.dia)]}</span>
              <span className="gc-cab-num">{Number(c.dia.slice(8, 10))}</span>
            </button>
          )
        })}
      </div>

      {/* Faixa "dia inteiro" */}
      <div className="gc-topo" style={{ gridTemplateColumns: `64px ${largCols}` }}>
        <div className="gc-topo-gutter">
          {topo.total > MAX_LINHAS_TOPO && (
            <button className="gc-topo-mais" onClick={() => setTopoAberto((v) => !v)} title={topoAberto ? 'Recolher' : 'Mostrar tudo'}>{topoAberto ? '▴' : '▾'}</button>
          )}
        </div>
        <div className="gc-topo-area" style={{ gridColumn: `2 / span ${colunas.length}`, height: Math.max(1, linhasVisiveis + (topo.total > linhasVisiveis ? 1 : 0)) * LINHA_TOPO + 6 }}>
          {colunas.map((c, i) => (
            <div key={c.key} className="gc-topo-cel" style={{ left: `${(i / colunas.length) * 100}%`, width: `${100 / colunas.length}%` }}
              onClick={(e) => p.onCriarDiaInteiro(c, (e.currentTarget as HTMLElement).getBoundingClientRect())}>
              {!topoAberto && escondidasPorCol(i) > 0 && (
                <button className="gc-topo-esc" style={{ top: linhasVisiveis * LINHA_TOPO + 2 }} onClick={(e) => { e.stopPropagation(); setTopoAberto(true) }}>
                  +{escondidasPorCol(i)} mais
                </button>
              )}
            </div>
          ))}
          {topo.barras.filter((b) => b.linha < linhasVisiveis).map((b) => {
            const cor = corDe(b.it, colunas[b.c0])
            return (
              <button key={b.id} data-item={b.it.id} className={`gc-barra${b.it.esmaecido ? ' gc-esmaecido' : ''}${b.continuaAntes ? ' gc-cont-antes' : ''}`}
                style={{ left: `calc(${(b.c0 / colunas.length) * 100}% + 2px)`, width: `calc(${((b.c1 - b.c0 + 1) / colunas.length) * 100}% - 6px)`, top: b.linha * LINHA_TOPO + 2, background: cor, color: textoSobre(cor) }}
                onClick={(e) => { e.stopPropagation(); p.onAbrir(b.it, e.currentTarget.getBoundingClientRect()) }}>
                {!b.it.diaInteiro && <span className="gc-barra-hora">{horaCurta(localDe(b.it.inicio).hora)}</span>}
                {b.it.titulo}
              </button>
            )
          })}
        </div>
      </div>

      {/* Horas */}
      <div className="gc-rolagem" ref={rolagem}>
        <div className="gc-corpo" style={{ gridTemplateColumns: `64px ${largCols}` }}>
          <div className="gc-horas">
            {Array.from({ length: 24 }, (_, h) => <div key={h} className="gc-hora" style={{ height: HORA_PX }}>{h ? `${h}h` : ''}</div>)}
          </div>
          <div ref={corpo} className="gc-cols" style={{ gridColumn: `2 / span ${colunas.length}`, gridTemplateColumns: largCols, height: 24 * HORA_PX }}>
            {colunas.map((c, ci) => {
              const ghost = arr?.tipo === 'criar' && arr.col === ci ? { ini: Math.min(arr.a, arr.b), fim: Math.max(arr.a, arr.b) + PASSO }
                : p.rascunho && p.rascunho.colKey === c.key ? { ini: p.rascunho.ini, fim: p.rascunho.fim } : null
              return (
                <div key={c.key} className={`gc-col${c.dia === hoje && !c.pessoa ? ' gc-col-hoje' : ''}`}
                  onPointerDown={(e) => {
                    if (e.button !== 0 || (e.target as HTMLElement).closest('[data-item]')) return
                    e.preventDefault()
                    const { min } = posicao(e)
                    set({ tipo: 'criar', col: ci, a: min, b: min })
                  }}>
                  {Array.from({ length: 24 }, (_, h) => <div key={h} className="gc-linha" style={{ top: h * HORA_PX }} />)}
                  {c.dia === hoje && (
                    <div className="gc-agora" style={{ top: (agoraMin / 60) * HORA_PX }}><span /></div>
                  )}
                  {ghost && (
                    <div className="gc-ghost" style={{ top: (ghost.ini / 60) * HORA_PX, height: Math.max(((ghost.fim - ghost.ini) / 60) * HORA_PX - 2, 14) }}>
                      <b>(Sem título)</b><span>{hhmm(ghost.ini)} – {hhmm(Math.min(ghost.fim, 1439))}</span>
                    </div>
                  )}
                  {porColuna[ci].map(({ it, ini, fim, col, total }) => {
                    const movendo = arr && arr.tipo !== 'criar' && arr.it.id === it.id && (arr.tipo === 'esticar' || arr.mexeu)
                    if (movendo && arr.tipo === 'mover' && arr.col !== ci) return null
                    const top = movendo && arr.tipo === 'mover' ? arr.ini : ini
                    const bottom = movendo ? (arr.tipo === 'mover' ? arr.ini + arr.dur : arr.fim) : fim
                    const alt = Math.max(((bottom - top) / 60) * HORA_PX - 2, 18)
                    const cor = corDe(it, c)
                    const arrastavel = p.podeArrastar(it)
                    const larg = 100 / total
                    const curto = alt < 34
                    return (
                      <div key={it.id} data-item={it.id} role="button" tabIndex={0}
                        className={`gc-ev${it.esmaecido ? ' gc-esmaecido' : ''}${movendo ? ' gc-ev-movendo' : ''}`}
                        style={{
                          top: (top / 60) * HORA_PX, height: alt, background: cor, color: textoSobre(cor),
                          left: `calc(${col * larg}% + 1px)`, width: movendo ? 'calc(100% - 8px)' : `calc(${total > 1 && col < total - 1 ? larg * 1.6 : larg}% - ${total > 1 ? 3 : 8}px)`,
                          zIndex: movendo ? 30 : 2 + col, cursor: arrastavel ? 'grab' : 'pointer',
                        }}
                        onKeyDown={(e) => { if (e.key === 'Enter') p.onAbrir(it, e.currentTarget.getBoundingClientRect()) }}
                        onPointerDown={(e) => {
                          if (e.button !== 0) return
                          e.stopPropagation()
                          if (!arrastavel) { set({ tipo: 'mover', it, col0: ci, col: ci, ini, dur: fim - ini, offset: 0, mexeu: false, x0: e.clientX, y0: e.clientY }); return }
                          const { min } = posicao(e)
                          set({ tipo: 'mover', it, col0: ci, col: ci, ini, dur: Math.max(PASSO, fim - ini), offset: min - ini, mexeu: false, x0: e.clientX, y0: e.clientY })
                        }}>
                        {curto
                          ? <span className="gc-ev-linha"><b>{it.titulo}</b>, {hhmm(top)}</span>
                          : <>
                            <b className="gc-ev-tit">{it.titulo}</b>
                            <span className="gc-ev-hora">{hhmm(top)} – {hhmm(Math.min(bottom, 1439))}</span>
                            {it.local && alt > 60 && <span className="gc-ev-hora">{it.local}</span>}
                          </>}
                        {arrastavel && (
                          <span className="gc-ev-alca" onPointerDown={(e) => { e.stopPropagation(); if (e.button === 0) set({ tipo: 'esticar', it, col: ci, ini, fim }) }} />
                        )}
                      </div>
                    )
                  })}
                  {/* item sendo arrastado vindo de outra coluna */}
                  {arr?.tipo === 'mover' && arr.mexeu && arr.col === ci && arr.col0 !== ci && (() => {
                    const cor = corDe(arr.it, c)
                    return (
                      <div className="gc-ev gc-ev-movendo" style={{ top: (arr.ini / 60) * HORA_PX, height: Math.max((arr.dur / 60) * HORA_PX - 2, 18), left: 1, width: 'calc(100% - 8px)', background: cor, color: textoSobre(cor), zIndex: 30 }}>
                        <b className="gc-ev-tit">{arr.it.titulo}</b><span className="gc-ev-hora">{hhmm(arr.ini)} – {hhmm(arr.ini + arr.dur)}</span>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}
