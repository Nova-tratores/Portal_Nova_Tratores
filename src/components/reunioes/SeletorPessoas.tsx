'use client'
// Escolher VÁRIAS pessoas (José, 17/11/2026: "o filtro de pesquisa embaixo é sacanagem, só seleciona um
// usuário e fecha o dropdown"). Digita no próprio campo, marca quantas quiser — a lista fica aberta;
// fecha no "Pronto", no Esc ou clicando fora. As escolhidas aparecem dentro do campo com o rosto.
import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Search, X } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import { casaBusca } from '@/lib/texto'

const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()

const CSS = `
.sp{position:relative}
.sp *{box-sizing:border-box}
.sp-campo{display:flex;flex-wrap:wrap;align-items:center;gap:6px;min-height:44px;padding:5px 8px;border-radius:10px;border:1px solid var(--portal-border,#e5e7eb);background:var(--portal-bg,#fefefe);cursor:text}
.sp-campo.on{border-color:#2563eb;box-shadow:0 0 0 3px color-mix(in srgb,#2563eb 14%,transparent)}
.sp-tag{display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 6px 0 3px;border-radius:999px;font-size:13px;background:color-mix(in srgb,#2563eb 9%,var(--portal-surface,#fefefe));color:var(--portal-text,#0f172a)}
.sp-tag button{border:none;background:transparent;cursor:pointer;display:grid;place-items:center;width:20px;height:20px;border-radius:50%;color:var(--portal-text-muted,#64748b);padding:0}
.sp-tag button:hover{background:rgba(15,23,42,.08)}
.sp-in{flex:1;min-width:150px;height:32px;border:none;outline:none;background:transparent;font-size:14px;color:var(--portal-text,#111111);font-family:inherit}
.sp-av{width:24px;height:24px;border-radius:50%;display:inline-grid;place-items:center;font-size:10px;color:#fefefe;background:#64748b;overflow:hidden;flex:none}
.sp-av img{width:100%;height:100%;object-fit:cover}
.sp-lista{position:absolute;left:0;right:0;top:calc(100% + 6px);z-index:20;background:var(--portal-surface,#fefefe);border:1px solid var(--portal-border,#e2e8f0);border-radius:14px;box-shadow:0 18px 40px -18px rgba(15,23,42,.45);overflow:hidden}
.sp-itens{max-height:280px;overflow-y:auto;padding:6px}
.sp-it{display:flex;align-items:center;gap:10px;width:100%;min-height:42px;padding:6px 10px;border-radius:10px;border:none;background:transparent;cursor:pointer;text-align:left;font-size:14px;color:var(--portal-text,#0f172a);font-family:inherit}
.sp-it:hover,.sp-it.foco{background:var(--portal-bg-secondary,#f1f5f9)}
.sp-ck{width:20px;height:20px;border-radius:6px;border:1.5px solid var(--portal-border,#cbd5e1);display:grid;place-items:center;flex:none;color:#fefefe}
.sp-it.sel .sp-ck{background:#2563eb;border-color:#2563eb}
.sp-rod{display:flex;align-items:center;gap:8px;padding:8px 10px;border-top:1px solid var(--portal-border,#e2e8f0);font-size:13px;color:var(--portal-text-muted,#64748b)}
.sp-ok{margin-left:auto;height:34px;padding:0 14px;border-radius:10px;border:none;background:#2563eb;color:#fefefe;font-size:13.5px;font-weight:500;cursor:pointer;font-family:inherit}
`

function Av({ u }: { u?: UsuarioMin }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="sp-av">{u?.avatar_url ? <img src={u.avatar_url} alt="" /> : iniciais(u?.nome || '?')}</span>
}

export default function SeletorPessoas({ valor, onChange, excluir = [], placeholder = 'Digite o nome…', fixos = [] }: {
  valor: string[]
  onChange: (ids: string[], usuarios: Record<string, UsuarioMin>) => void
  /** não aparecem na lista (ex.: o condutor) */
  excluir?: string[]
  placeholder?: string
  /** aparecem no campo como já incluídos, sem X (ex.: padrão da série) */
  fixos?: string[]
}) {
  const [usuarios, setUsuarios] = useState<UsuarioMin[]>([])
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const [foco, setFoco] = useState(0)
  const raiz = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.from('financeiro_usu').select('id, nome, avatar_url, ativo').order('nome').then(({ data }) => {
      setUsuarios(((data || []) as (UsuarioMin & { ativo?: boolean })[]).filter((u) => u.ativo !== false))
    })
  }, [])
  useEffect(() => {
    const fora = (e: MouseEvent) => { if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const porId = useMemo(() => Object.fromEntries(usuarios.map((u) => [u.id, u])), [usuarios])
  const lista = useMemo(() => usuarios.filter((u) => !excluir.includes(u.id) && !fixos.includes(u.id) && (!busca.trim() || casaBusca(u.nome, busca))), [usuarios, excluir, fixos, busca])

  const alternar = (id: string) => {
    const novo = valor.includes(id) ? valor.filter((x) => x !== id) : [...valor, id]
    onChange(novo, porId)
    setBusca(''); input.current?.focus()
  }

  return (
    <div className="sp" ref={raiz}>
      <style>{CSS}</style>
      <div className={`sp-campo${aberto ? ' on' : ''}`} onClick={() => { setAberto(true); input.current?.focus() }}>
        {fixos.map((id) => <span key={id} className="sp-tag" title="Vem da série" style={{ paddingRight: 10, opacity: .75 }}><Av u={porId[id]} /> {porId[id]?.nome.split(' ')[0] || '…'}</span>)}
        {valor.map((id) => (
          <span key={id} className="sp-tag"><Av u={porId[id]} /> {porId[id]?.nome.split(' ').slice(0, 2).join(' ') || '…'}
            <button aria-label="Tirar" onClick={(e) => { e.stopPropagation(); onChange(valor.filter((x) => x !== id), porId) }}><X size={12} /></button>
          </span>
        ))}
        <Search size={15} style={{ color: 'var(--portal-text-muted,#94a3b8)', marginLeft: 4 }} />
        <input ref={input} className="sp-in" value={busca} placeholder={valor.length ? 'Mais alguém?' : placeholder}
          onFocus={() => setAberto(true)}
          onChange={(e) => { setBusca(e.target.value); setAberto(true); setFoco(0) }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') { setAberto(false); return }
            if (e.key === 'ArrowDown') { e.preventDefault(); setFoco((f) => Math.min(f + 1, lista.length - 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setFoco((f) => Math.max(f - 1, 0)) }
            if (e.key === 'Enter') { e.preventDefault(); if (lista[foco]) alternar(lista[foco].id) }
            if (e.key === 'Backspace' && !busca && valor.length) onChange(valor.slice(0, -1), porId)
          }} />
      </div>
      {aberto && (
        <div className="sp-lista">
          <div className="sp-itens">
            {lista.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Ninguém com esse nome.</div>}
            {lista.map((u, i) => {
              const sel = valor.includes(u.id)
              return (
                <button key={u.id} className={`sp-it${sel ? ' sel' : ''}${i === foco ? ' foco' : ''}`} onMouseDown={(e) => e.preventDefault()} onClick={() => alternar(u.id)}>
                  <span className="sp-ck">{sel && <Check size={13} />}</span>
                  <Av u={u} /> {u.nome}
                </button>
              )
            })}
          </div>
          <div className="sp-rod">
            {valor.length ? `${valor.length} ${valor.length === 1 ? 'pessoa escolhida' : 'pessoas escolhidas'}` : 'Marque quantas quiser'}
            <button className="sp-ok" onClick={() => setAberto(false)}>Pronto</button>
          </div>
        </div>
      )}
    </div>
  )
}
