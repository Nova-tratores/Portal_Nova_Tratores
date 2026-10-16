'use client'
// Modo LISTA do Opa (Ocorrências e Peças S/Estoque): tabela com o filtro e a
// ordenação A→Z / Z→A no CABEÇALHO de cada coluna, como na planilha — clica no
// título, escolhe a ordem e marca os valores que quer ver. Regras puras em
// lib/opa-pecas/lista.ts; aqui só o desenho. Filtros e ordem ficam lembrados
// neste navegador (localStorage, por tela).

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowDownAZ, ArrowUpZA, ChevronDown, Filter, LayoutGrid, List, X } from 'lucide-react'
import {
  filtrarLista, limparFiltros, opcoesDaColuna, ordenarLista,
  type ColunaLista, type FiltrosColuna, type ModoVisao, type OrdemLista,
} from '@/lib/opa-pecas/lista'

export interface ColunaTabela<T> extends ColunaLista<T> {
  titulo: string
  render: (t: T) => React.ReactNode
  direita?: boolean
  /** largura máxima da célula (texto longo corta com reticências no próprio render) */
  maxLargura?: number
  /** sem filtro de valores (ex.: foto) — só ordena, ou nada se semOrdem */
  semFiltro?: boolean
  semOrdem?: boolean
}

interface Estado { filtros: FiltrosColuna; ordem: OrdemLista | null }

function lerEstado(chave: string): Estado {
  try {
    const raw = localStorage.getItem(chave)
    if (raw) {
      const j = JSON.parse(raw) as Partial<Estado>
      return { filtros: limparFiltros(j.filtros || {}), ordem: j.ordem || null }
    }
  } catch { /* segue */ }
  return { filtros: {}, ordem: null }
}

/** Estado da lista (filtros + ordem) lembrado no navegador, e as linhas que sobram. */
export function useListaFiltrada<T>(chaveStorage: string, linhas: T[], colunas: ColunaTabela<T>[]) {
  const [estado, setEstado] = useState<Estado>({ filtros: {}, ordem: null })
  useEffect(() => { const e = lerEstado(chaveStorage); Promise.resolve().then(() => setEstado(e)) }, [chaveStorage])
  const gravar = useCallback((e: Estado) => {
    setEstado(e)
    try { localStorage.setItem(chaveStorage, JSON.stringify(e)) } catch { /* segue */ }
  }, [chaveStorage])

  const visiveis = useMemo(
    () => ordenarLista(filtrarLista(linhas, colunas, estado.filtros), colunas, estado.ordem),
    [linhas, colunas, estado],
  )
  const ativos = Object.keys(estado.filtros).length
  return {
    visiveis,
    filtros: estado.filtros,
    ordem: estado.ordem,
    ativos,
    setFiltro: (chave: string, valores: string[] | null) => gravar({ ...estado, filtros: limparFiltros({ ...estado.filtros, [chave]: valores || [] }) }),
    setOrdem: (ordem: OrdemLista | null) => gravar({ ...estado, ordem }),
    limpar: () => gravar({ filtros: {}, ordem: estado.ordem }),
  }
}

export type ListaFiltrada<T> = ReturnType<typeof useListaFiltrada<T>>

/** Botões Cards | Lista (a escolha fica lembrada pela tela que usa). */
export function SeletorVisao({ modo, onChange, cor }: { modo: ModoVisao; onChange: (m: ModoVisao) => void; cor: string }) {
  const item = (m: ModoVisao, icone: React.ReactNode, rotulo: string) => (
    <button type="button" onClick={() => onChange(m)} aria-pressed={modo === m} aria-label={`Ver em ${rotulo.toLowerCase()}`} title={`Ver em ${rotulo.toLowerCase()}`} style={{
      display: 'inline-flex', alignItems: 'center', gap: 5, height: 32, padding: '0 11px', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
      fontSize: 12.5, fontWeight: 700, background: modo === m ? cor : 'transparent', color: modo === m ? '#fefefe' : 'var(--portal-text-secondary)',
    }}>{icone} <span className="opa-seletor-rotulo">{rotulo}</span></button>
  )
  return (
    <div role="group" aria-label="Modo de visualização" className="opa-seletor-visao" style={{ display: 'inline-flex', borderRadius: 9, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', overflow: 'hidden', flexShrink: 0 }}>
      {item('cards', <LayoutGrid size={14} />, 'Cards')}
      {item('lista', <List size={14} />, 'Lista')}
      <style>{CSS_SELETOR}</style>
    </div>
  )
}

/** Lê/grava o modo de visualização de uma tela (null = a pessoa ainda não escolheu). */
export function useModoVisao(chave: string): [ModoVisao | null, (m: ModoVisao) => void] {
  const [modo, setModo] = useState<ModoVisao | null>(null)
  useEffect(() => {
    try {
      const v = localStorage.getItem(chave)
      if (v === 'cards' || v === 'lista') Promise.resolve().then(() => setModo(v))
    } catch { /* segue */ }
  }, [chave])
  const mudar = useCallback((m: ModoVisao) => {
    setModo(m)
    try { localStorage.setItem(chave, m) } catch { /* segue */ }
  }, [chave])
  return [modo, mudar]
}

export default function TabelaFiltravel<T>({ colunas, todas, lista, chaveLinha, onAbrir, cor, antes, linhaDestacada }: {
  colunas: ColunaTabela<T>[]
  /** todas as linhas (antes dos filtros do cabeçalho) — as opções do filtro saem daqui */
  todas: T[]
  lista: ListaFiltrada<T>
  chaveLinha: (t: T) => string
  onAbrir?: (t: T) => void
  cor: string
  /** coluna extra à esquerda (ex.: checkbox de marcar), sem filtro */
  antes?: { cabecalho: React.ReactNode; celula: (t: T) => React.ReactNode }
  linhaDestacada?: (t: T) => boolean
}) {
  const [aberta, setAberta] = useState<{ chave: string; x: number; y: number } | null>(null)

  return (
    <div style={{ overflowX: 'auto', borderRadius: 12, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', boxShadow: '0 1px 3px rgba(16,24,40,0.05)' }}>
      <table className="opa-tabela" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, color: 'var(--portal-text)' }}>
        <thead>
          <tr style={{ background: 'var(--portal-bg-secondary)' }}>
            {antes && <th style={{ ...TH, width: 36, paddingLeft: 12 }}>{antes.cabecalho}</th>}
            {colunas.map((c) => {
              const filtrada = !!lista.filtros[c.chave]?.length
              const ordenada = lista.ordem?.chave === c.chave ? lista.ordem : null
              const interativa = !(c.semFiltro && c.semOrdem)
              return (
                <th key={c.chave} style={{ ...TH, textAlign: c.direita ? 'right' : 'left' }}>
                  {interativa ? (
                    <button type="button" aria-haspopup="dialog" aria-expanded={aberta?.chave === c.chave}
                      title="Ordenar A→Z / Z→A e filtrar"
                      onClick={(e) => {
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
                        setAberta((a) => (a?.chave === c.chave ? null : { chave: c.chave, x: r.left, y: r.bottom + 4 }))
                      }}
                      style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px', margin: '-3px -6px', borderRadius: 6, cursor: 'pointer',
                        border: 'none', fontFamily: 'inherit', fontSize: 'inherit', fontWeight: 'inherit', letterSpacing: 'inherit', textTransform: 'inherit',
                        background: filtrada || ordenada ? `${cor}1a` : 'transparent', color: filtrada || ordenada ? cor : 'inherit',
                      }}>
                      {c.titulo}
                      {ordenada && (ordenada.asc ? <ArrowDownAZ size={13} /> : <ArrowUpZA size={13} />)}
                      {filtrada ? <Filter size={11} fill="currentColor" /> : <ChevronDown size={12} style={{ opacity: 0.6 }} />}
                    </button>
                  ) : c.titulo}
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {lista.visiveis.map((t) => (
            <tr key={chaveLinha(t)} onClick={onAbrir ? () => onAbrir(t) : undefined} className="opa-lista-linha"
              style={{ cursor: onAbrir ? 'pointer' : 'default', background: linhaDestacada?.(t) ? `${cor}14` : undefined }}>
              {antes && <td style={{ ...TD, paddingLeft: 12 }} onClick={(e) => e.stopPropagation()}>{antes.celula(t)}</td>}
              {colunas.map((c) => (
                <td key={c.chave} style={{ ...TD, textAlign: c.direita ? 'right' : 'left', maxWidth: c.maxLargura }}>{c.render(t)}</td>
              ))}
            </tr>
          ))}
          {lista.visiveis.length === 0 && (
            <tr><td colSpan={colunas.length + (antes ? 1 : 0)} style={{ ...TD, padding: 28, textAlign: 'center', color: 'var(--portal-text-muted)' }}>
              Nada com esses filtros.{' '}
              {lista.ativos > 0 && <button type="button" onClick={lista.limpar} style={{ border: 'none', background: 'none', color: cor, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit' }}>Limpar filtros</button>}
            </td></tr>
          )}
        </tbody>
      </table>
      <style>{'.opa-lista-linha { border-top: 1px solid var(--portal-border); transition: background 0.12s } .opa-lista-linha:hover { background: var(--portal-bg-hover, var(--portal-bg-secondary)) }' + CSS_CELULAR}</style>
      {aberta && (() => {
        const c = colunas.find((x) => x.chave === aberta.chave)
        return c ? <PopoverColuna coluna={c} todas={todas} colunas={colunas} lista={lista} cor={cor} x={aberta.x} y={aberta.y} onFechar={() => setAberta(null)} /> : null
      })()}
    </div>
  )
}

function PopoverColuna<T>({ coluna, todas, colunas, lista, cor, x, y, onFechar }: {
  coluna: ColunaTabela<T>; todas: T[]; colunas: ColunaTabela<T>[]; lista: ListaFiltrada<T>; cor: string; x: number; y: number; onFechar: () => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [busca, setBusca] = useState('')
  const [pos, setPos] = useState({ x, y })
  const opcoes = useMemo(() => (coluna.semFiltro ? [] : opcoesDaColuna(todas, colunas, lista.filtros, coluna.chave)), [coluna, todas, colunas, lista.filtros])
  const marcados = lista.filtros[coluna.chave] || []
  const visiveis = opcoes.filter((o) => !busca.trim() || o.valor.toLowerCase().includes(busca.trim().toLowerCase()))

  // não deixa o popover sair da tela (coluna perto da borda direita / rodapé)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const nx = Math.max(8, Math.min(x, window.innerWidth - r.width - 8))
    const ny = y + r.height > window.innerHeight - 8 ? Math.max(8, window.innerHeight - r.height - 8) : y
    if (nx !== pos.x || ny !== pos.y) setPos({ x: nx, y: ny })
  }, [x, y, pos.x, pos.y, opcoes.length])

  useEffect(() => {
    const fora = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onFechar() }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    const rolou = (e: Event) => { if (ref.current && !ref.current.contains(e.target as Node)) onFechar() }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', esc)
    window.addEventListener('scroll', rolou, true)
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', esc); window.removeEventListener('scroll', rolou, true) }
  }, [onFechar])

  // marcar = mostrar só os marcados; tudo marcado (ou nada) = sem filtro
  const alternar = (v: string) => {
    const base = marcados.length ? marcados : opcoes.map((o) => o.valor)
    const novo = base.includes(v) ? base.filter((x) => x !== v) : [...base, v]
    lista.setFiltro(coluna.chave, novo.length === opcoes.length ? null : novo.length ? novo : ['\u0000nada'])
  }
  const estaMarcado = (v: string) => !marcados.length || marcados.includes(v)
  const todosVisiveis = visiveis.every((o) => estaMarcado(o.valor))
  const alternarVisiveis = () => {
    const base = new Set(marcados.length ? marcados : opcoes.map((o) => o.valor))
    for (const o of visiveis) { if (todosVisiveis) base.delete(o.valor); else base.add(o.valor) }
    const novo = opcoes.map((o) => o.valor).filter((v) => base.has(v))
    lista.setFiltro(coluna.chave, novo.length === opcoes.length ? null : novo.length ? novo : ['\u0000nada'])
  }

  const linhaOrdem = (asc: boolean) => {
    const ativa = lista.ordem?.chave === coluna.chave && lista.ordem.asc === asc
    return (
      <button type="button" onClick={() => { lista.setOrdem(ativa ? null : { chave: coluna.chave, asc }); onFechar() }} style={{
        ...ITEM, fontWeight: ativa ? 800 : 600, color: ativa ? cor : 'var(--portal-text)', background: ativa ? `${cor}14` : 'transparent',
      }}>
        {asc ? <ArrowDownAZ size={15} /> : <ArrowUpZA size={15} />} {asc ? 'Ordenar de A a Z' : 'Ordenar de Z a A'}
        {ativa && <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 600, color: 'var(--portal-text-muted)' }}>tirar</span>}
      </button>
    )
  }

  return (
    <div ref={ref} role="dialog" aria-label={`Coluna ${coluna.titulo}`} className="opa-pop-coluna" style={{
      position: 'fixed', left: pos.x, top: pos.y, zIndex: 10050, width: 260, maxHeight: '70vh', display: 'flex', flexDirection: 'column',
      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 10, boxShadow: '0 10px 30px rgba(0,0,0,.18)',
      textTransform: 'none', letterSpacing: 0, fontSize: 13, fontWeight: 500, color: 'var(--portal-text)',
    }}>
      {!coluna.semOrdem && <div style={{ padding: 4, borderBottom: coluna.semFiltro ? 'none' : '1px solid var(--portal-border)' }}>{linhaOrdem(true)}{linhaOrdem(false)}</div>}
      {!coluna.semFiltro && (<>
        <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Procurar valor…" style={{
            width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 7, border: '1px solid var(--portal-border)',
            background: 'var(--portal-bg-card)', color: 'var(--portal-text)', fontSize: 13, fontFamily: 'inherit', outline: 'none',
          }} />
          <label style={{ ...CHECK, fontWeight: 700 }}>
            <input type="checkbox" checked={todosVisiveis} onChange={alternarVisiveis} style={{ accentColor: cor }} />
            {busca.trim() ? 'Marcar os encontrados' : 'Selecionar tudo'}
          </label>
        </div>
        <div style={{ overflowY: 'auto', padding: '0 8px 6px', flex: 1, minHeight: 0 }}>
          {visiveis.map((o) => (
            <label key={o.valor} style={CHECK}>
              <input type="checkbox" checked={estaMarcado(o.valor)} onChange={() => alternar(o.valor)} style={{ accentColor: cor }} />
              <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontStyle: o.valor === '(vazio)' ? 'italic' : 'normal', color: o.valor === '(vazio)' ? 'var(--portal-text-muted)' : 'inherit' }}>{o.valor}</span>
              <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', fontVariantNumeric: 'tabular-nums' }}>{o.n}</span>
            </label>
          ))}
          {visiveis.length === 0 && <div style={{ padding: 8, fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Nenhum valor.</div>}
        </div>
        {marcados.length > 0 && (
          <div style={{ padding: 6, borderTop: '1px solid var(--portal-border)' }}>
            <button type="button" onClick={() => lista.setFiltro(coluna.chave, null)} style={{ ...ITEM, color: '#B91C1C', fontWeight: 700 }}><X size={14} /> Limpar filtro desta coluna</button>
          </div>
        )}
      </>)}
    </div>
  )
}

/* CELULAR (≤768px): a 1ª coluna (o que identifica a linha) fica presa ao rolar de lado,
   cabeçalho legível, o filtro da coluna vira folha de baixo com alvos de dedo e o
   seletor Cards | Lista ganha altura de toque. O PC não muda. */
const CSS_CELULAR = `
@media (max-width: 768px) {
  .opa-tabela th { font-size: 11.5px !important; }
  .opa-tabela th:first-child, .opa-tabela td:first-child { position: sticky; left: 0; z-index: 1; background: var(--portal-bg-card); box-shadow: 1px 0 0 var(--portal-border); }
  .opa-tabela thead th:first-child { background: var(--portal-bg-secondary); }
  .opa-tabela th button { min-height: 32px; }
  .opa-pop-coluna { left: 0 !important; right: 0 !important; top: auto !important; bottom: 0 !important; width: auto !important; max-height: 75dvh !important; border-radius: 16px 16px 0 0 !important; padding-bottom: env(safe-area-inset-bottom); }
  .opa-pop-coluna button, .opa-pop-coluna label { min-height: 42px; }
  .opa-pop-coluna input[type=checkbox] { width: 18px; height: 18px; }
}`
// celular: só os ícones (cabe na mesma linha das abas), com alvo de dedo
const CSS_SELETOR = '@media (max-width: 768px) { .opa-seletor-visao button { height: 40px !important; min-width: 44px; justify-content: center; padding: 0 12px !important; } .opa-seletor-visao .opa-seletor-rotulo { display: none; } }'

const TH: React.CSSProperties = { padding: '10px 10px', fontSize: 10.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, color: 'var(--portal-text-muted)', whiteSpace: 'nowrap', position: 'relative' }
const TD: React.CSSProperties = { padding: '10px 10px', verticalAlign: 'middle' }
const ITEM: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13, textAlign: 'left', background: 'transparent' }
const CHECK: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, padding: '5px 2px', fontSize: 13, cursor: 'pointer' }
