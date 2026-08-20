'use client'
// Peças reutilizáveis de configuração de tabela (filtro por coluna, ordenação
// principal+desempate, seletor de colunas mostrar/ocultar/reordenar) — portadas
// de /ajustes/caracteristicas pra também servir a aba Etiquetas do PPV.
// São genéricas: recebem `labelCol` por prop (rótulo humano de cada chave de coluna).
import { useEffect, useState } from 'react'
import { Settings } from 'lucide-react'

export type Sort = { key: string; dir: number }

export function normKey(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
}

// Filtro por coluna (caixinha do cabeçalho): termo puramente numérico exige valor
// IDÊNTICO ("3" não casa com "13"/"23"); texto usa "contém" (substring). Ambos
// ignoram maiúsculas/minúsculas e espaços nas pontas.
export function casaFiltroColuna(valorCelula: string, termo: string): boolean {
  const cel = valorCelula.trim().toLowerCase()
  const f = termo.trim().toLowerCase()
  if (f === '') return true
  if (/^\d+$/.test(f)) return cel === f
  return cel.includes(f)
}

// Reconcilia uma ordem "desejada" (casing diferente / chaves inexistentes) com as
// colunas realmente disponíveis: mantém as que existem (chave REAL), na ordem
// desejada; anexa no fim as disponíveis que sobraram (colunas novas).
export function reconciliarOrdem(desejada: string[], disponiveis: string[]): string[] {
  const restantes = new Map(disponiveis.map((k) => [normKey(k), k]))
  const out: string[] = []
  for (const d of desejada) {
    const real = restantes.get(normKey(d))
    if (real !== undefined) { out.push(real); restantes.delete(normKey(d)) }
  }
  for (const k of restantes.values()) out.push(k)
  return out
}

// Telas touch/sem-hover (tablet): mostra reordenação por ▲▼ em vez de arrastar.
export function useIsTouch(): boolean {
  const [touch, setTouch] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(hover: none) and (pointer: coarse)')
    const upd = () => setTouch(mq.matches)
    upd()
    mq.addEventListener?.('change', upd)
    return () => mq.removeEventListener?.('change', upd)
  }, [])
  return touch
}

// Controle "Ordenar por": edita o MESMO estado `sorts` do clique no cabeçalho.
// Até 2 níveis (principal + desempate).
export function ControleOrdenacao({ cols, sorts, setSorts }: {
  cols: { key: string; label: string }[]
  sorts: Sort[]
  setSorts: React.Dispatch<React.SetStateAction<Sort[]>>
}) {
  const p = sorts[0]; const s = sorts[1]
  const sel: React.CSSProperties = { border: '1px solid var(--portal-border)', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }
  const setPrincipal = (key: string) => setSorts((arr) => {
    if (!key) return []
    const dir = arr[0]?.key === key ? arr[0].dir : 1
    const sec = arr[1]
    return sec && sec.key !== key ? [{ key, dir }, sec] : [{ key, dir }]
  })
  const setDirP = (dir: number) => setSorts((arr) => (arr.length ? [{ ...arr[0], dir }, ...arr.slice(1)] : arr))
  const setSecundario = (key: string) => setSorts((arr) => {
    if (!arr.length) return arr
    if (!key) return arr.slice(0, 1)
    const dir = arr[1]?.key === key ? arr[1].dir : 1
    return [arr[0], { key, dir }]
  })
  const setDirS = (dir: number) => setSorts((arr) => (arr.length > 1 ? [arr[0], { ...arr[1], dir }] : arr))
  return (
    <div>
      <label style={{ display: 'block', fontSize: '.65rem', color: 'var(--portal-text-muted)', marginBottom: 2 }}>Ordenar por</label>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <select value={p?.key || ''} onChange={(e) => setPrincipal(e.target.value)} style={sel} title="Coluna principal de ordenação">
          <option value="">— nenhuma —</option>
          {cols.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
        </select>
        <select value={p ? String(p.dir) : '1'} onChange={(e) => setDirP(Number(e.target.value))} disabled={!p} style={{ ...sel, opacity: p ? 1 : 0.5 }}>
          <option value="1">Crescente</option>
          <option value="-1">Decrescente</option>
        </select>
        {p && (
          <>
            <span style={{ fontSize: '.72rem', color: 'var(--portal-text-muted)' }}>desempate:</span>
            <select value={s?.key || ''} onChange={(e) => setSecundario(e.target.value)} style={sel} title="2º critério (desempate)">
              <option value="">— nenhum —</option>
              {cols.filter((c) => c.key !== p.key).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <select value={s ? String(s.dir) : '1'} onChange={(e) => setDirS(Number(e.target.value))} disabled={!s} style={{ ...sel, opacity: s ? 1 : 0.5 }}>
              <option value="1">Crescente</option>
              <option value="-1">Decrescente</option>
            </select>
          </>
        )}
      </div>
    </div>
  )
}

// Modal "Seletor de Colunas": ocultar/mostrar e reordenar (drag no desktop, ▲▼ no touch).
// Rascunho local — só aplica no "Aplicar"; "Cancelar" descarta.
export function SeletorColunas({ ordem, ocultas, labelCol, onAplicar, onCancelar }: {
  ordem: string[]; ocultas: string[]; labelCol: (k: string) => string
  onAplicar: (ordem: string[], ocultas: string[]) => void; onCancelar: () => void
}) {
  const [draftOrdem, setDraftOrdem] = useState<string[]>(ordem)
  const [draftOcultas, setDraftOcultas] = useState<Set<string>>(new Set(ocultas))
  const [drag, setDrag] = useState<string | null>(null)
  const isTouch = useIsTouch()
  const visiveisCount = draftOrdem.filter((k) => !draftOcultas.has(k)).length
  const moverPasso = (k: string, dir: number) => setDraftOrdem((arr) => {
    const i = arr.indexOf(k); const j = i + dir
    if (i < 0 || j < 0 || j >= arr.length) return arr
    const novo = arr.slice(); [novo[i], novo[j]] = [novo[j], novo[i]]; return novo
  })
  const toggle = (k: string) => setDraftOcultas((s) => {
    const n = new Set(s)
    if (n.has(k)) { n.delete(k); return n }
    if (visiveisCount <= 1) return s
    n.add(k); return n
  })
  const mover = (origem: string, destino: string) => {
    if (origem === destino) return
    setDraftOrdem((arr) => {
      const from = arr.indexOf(origem); if (from < 0) return arr
      const novo = arr.slice(); novo.splice(from, 1)
      const to = novo.indexOf(destino); if (to < 0) return arr
      novo.splice(to, 0, origem)
      return novo.length === arr.length && novo.every((x, i) => x === arr[i]) ? arr : novo
    })
  }
  return (
    <div onClick={onCancelar} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: 'var(--portal-bg-card)', borderRadius: 8, width: 400, maxWidth: '94vw', maxHeight: '82vh', display: 'flex', flexDirection: 'column', boxShadow: '0 12px 44px rgba(0,0,0,.28)' }}>
        <div style={{ background: '#94a3b8', color: '#fff', padding: '8px 14px', borderRadius: '8px 8px 0 0', fontWeight: 600, fontSize: '.85rem' }}>Seletor de Colunas</div>
        <div style={{ padding: '4px 14px 8px', fontSize: '.7rem', color: 'var(--portal-text-muted)' }}>{isTouch ? <>Use <b>▲▼</b> para reordenar.</> : <>Arraste o <b>⠿</b> para reordenar.</>} Toque em <b>Ocultar/Mostrar</b> para ligar/desligar a coluna.</div>
        <div style={{ overflow: 'auto', WebkitOverflowScrolling: 'touch', padding: '2px 0', flex: 1 }}>
          {draftOrdem.map((k, i) => {
            const oculta = draftOcultas.has(k)
            return (
              <div key={k} draggable={!isTouch}
                onDragStart={isTouch ? undefined : (e) => { setDrag(k); e.dataTransfer.effectAllowed = 'move' }}
                onDragEnter={isTouch ? undefined : () => { if (drag && drag !== k) mover(drag, k) }}
                onDragOver={isTouch ? undefined : (e) => e.preventDefault()}
                onDrop={isTouch ? undefined : (e) => e.preventDefault()}
                onDragEnd={isTouch ? undefined : () => setDrag(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px', borderBottom: '1px solid var(--portal-border)', background: drag === k ? 'rgba(37,99,235,.12)' : 'transparent', cursor: isTouch ? 'default' : 'grab' }}>
                {isTouch ? (
                  <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 0.9 }}>
                    <button onClick={() => moverPasso(k, -1)} disabled={i === 0} title="Subir" style={{ background: 'none', border: 'none', color: i === 0 ? '#cbd5e1' : '#64748b', cursor: 'pointer', fontSize: '.9rem', padding: '0 2px' }}>▲</button>
                    <button onClick={() => moverPasso(k, 1)} disabled={i === draftOrdem.length - 1} title="Descer" style={{ background: 'none', border: 'none', color: i === draftOrdem.length - 1 ? '#cbd5e1' : '#64748b', cursor: 'pointer', fontSize: '.9rem', padding: '0 2px' }}>▼</button>
                  </span>
                ) : (
                  <span title="Arraste para reordenar" style={{ color: '#94a3b8' }}>⠿</span>
                )}
                <button onClick={() => toggle(k)} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '.8rem', width: 62, textAlign: 'left', padding: 0 }}>
                  {oculta ? 'Mostrar' : 'Ocultar'}
                </button>
                <span style={{ fontSize: '.85rem', color: oculta ? 'var(--portal-text-muted)' : 'var(--portal-text)', textDecoration: oculta ? 'line-through' : 'none' }}>{labelCol(k)}</span>
              </div>
            )
          })}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 14px', borderTop: '1px solid var(--portal-border)' }}>
          <button onClick={() => onAplicar(draftOrdem, Array.from(draftOcultas))} style={{ padding: '6px 18px', background: '#e8730c', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', fontWeight: 700 }}>Aplicar</button>
          <button onClick={onCancelar} style={{ padding: '6px 18px', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>Cancelar</button>
        </div>
      </div>
    </div>
  )
}

// Engrenagem: menu "Colunas…" + "Restaurar ordem". Fecha ao clicar fora.
export function MenuEngrenagem({ ocultasCount, onColunas, onRestaurar }: {
  ocultasCount: number; onColunas: () => void; onRestaurar: () => void
}) {
  const [aberto, setAberto] = useState(false)
  const item: React.CSSProperties = { display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '9px 14px', fontSize: '.82rem', color: 'var(--portal-text)', cursor: 'pointer', whiteSpace: 'nowrap' }
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={() => setAberto((v) => !v)} title="Opções de colunas (mostrar/ocultar, reordenar, restaurar)"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer' }}>
        <Settings size={16} />
        {ocultasCount > 0 && <span style={{ background: '#2563eb', color: '#fff', borderRadius: 8, fontSize: '.62rem', padding: '0 5px', lineHeight: '15px' }}>{ocultasCount}</span>}
      </button>
      {aberto && (
        <>
          <div onClick={() => setAberto(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
          <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 4, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', borderRadius: 8, boxShadow: '0 8px 28px rgba(0,0,0,.18)', zIndex: 41, minWidth: 190, overflow: 'hidden' }}>
            <button style={item} onClick={() => { setAberto(false); onColunas() }}>
              Colunas{ocultasCount ? ` (${ocultasCount} oculta${ocultasCount > 1 ? 's' : ''})` : ''}…
            </button>
            <button style={{ ...item, borderTop: '1px solid var(--portal-border)' }} onClick={() => { setAberto(false); onRestaurar() }}>
              Restaurar ordem
            </button>
          </div>
        </>
      )}
    </div>
  )
}
