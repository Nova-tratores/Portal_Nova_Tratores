'use client'
// Busca por MÓDULO na Administração (José, 04/11/2026: "ao lado de procurar o usuário, adicionar para procurar os
// módulos; quando clicamos em um módulo, vemos qual usuário tem acesso a ele"). Mesma regra de acesso da tela:
// admin vê tudo; o módulo em modulos_permitidos libera ele inteiro; "modulo:acao" libera só aquela ação.
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LayoutGrid, Search, X } from 'lucide-react'

type Modulo = { id: string; label: string; color: string }
type Usuario = { id: string; nome: string; email: string; funcao: string; ativo?: boolean }
type Perm = { is_admin: boolean; is_dev?: boolean; modulos_permitidos: string[] }

const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()

export default function BuscaModulo({ modulos, usuarios, permissoes, onVerUsuario }: {
  modulos: Modulo[]; usuarios: Usuario[]; permissoes: Record<string, Perm>; onVerUsuario: (nome: string) => void
}) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const [mod, setMod] = useState<Modulo | null>(null)
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!aberto) return
    const f = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', f)
    return () => document.removeEventListener('mousedown', f)
  }, [aberto])
  useEffect(() => {
    if (!mod) return
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') setMod(null) }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [mod])

  const ativos = useMemo(() => usuarios.filter((u) => u.ativo !== false), [usuarios])
  // quantas pessoas têm cada módulo (para mostrar na lista)
  const quem = useMemo(() => {
    const m = new Map<string, { admins: Usuario[]; inteiro: Usuario[]; acoes: { u: Usuario; acoes: string[] }[] }>()
    for (const md of modulos) m.set(md.id, { admins: [], inteiro: [], acoes: [] })
    for (const u of ativos) {
      const p = permissoes[u.id]
      if (!p) continue
      const lista = p.modulos_permitidos || []
      for (const md of modulos) {
        const x = m.get(md.id)!
        if (p.is_admin || p.is_dev) { x.admins.push(u); continue }
        if (lista.includes(md.id)) { x.inteiro.push(u); continue }
        const acoes = lista.filter((l) => l.startsWith(`${md.id}:`)).map((l) => l.slice(md.id.length + 1))
        if (acoes.length) x.acoes.push({ u, acoes })
      }
    }
    return m
  }, [modulos, ativos, permissoes])
  const achados = modulos.filter((m) => !q.trim() || sem(`${m.label} ${m.id}`).includes(sem(q.trim())))
  const dele = mod ? quem.get(mod.id) : null

  return (
    <div ref={caixa} style={{ position: 'relative', width: 320, maxWidth: '100%' }}>
      <LayoutGrid size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
      <input type="text" placeholder="Buscar módulo..." value={q} onChange={(e) => { setQ(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' && achados[0]) { setMod(achados[0]); setAberto(false) } if (e.key === 'Escape') setAberto(false) }}
        style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 12, background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)', color: 'var(--portal-text)', fontSize: 14, outline: 'none', fontFamily: 'Inter', boxSizing: 'border-box' }} />
      {aberto && (
        <div role="listbox" style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 40, maxHeight: 360, overflowY: 'auto', background: 'var(--portal-bg-card, #fefefe)', border: '1px solid var(--portal-border, #e5e7eb)', borderRadius: 12, boxShadow: '0 12px 32px rgba(15,23,42,.14)', padding: 4 }}>
          {achados.length === 0 && <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>Nenhum módulo com esse nome.</div>}
          {achados.map((m) => {
            const x = quem.get(m.id)
            const n = (x?.inteiro.length || 0) + (x?.acoes.length || 0)
            return (
              <button key={m.id} type="button" role="option" aria-selected={false} onClick={() => { setMod(m); setAberto(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 0, background: 'none', padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left', font: 'inherit', fontSize: 13.5, color: 'var(--portal-text)' }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover, #f1f5f9)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: m.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                <span style={{ fontSize: 12, color: '#64748b', whiteSpace: 'nowrap' }}>{n} pessoa{n === 1 ? '' : 's'}</span>
              </button>
            )
          })}
        </div>
      )}

      {mod && dele && typeof document !== 'undefined' && createPortal(
        <div role="presentation" onClick={() => setMod(null)} style={{ position: 'fixed', inset: 0, zIndex: 50000, background: 'rgba(0,0,0,.45)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div role="dialog" aria-modal="true" aria-label={`Quem acessa ${mod.label}`} onClick={(e) => e.stopPropagation()}
            style={{ width: 'min(620px, 100%)', maxHeight: 'calc(100vh - 32px)', overflowY: 'auto', background: 'var(--portal-bg-card, #fefefe)', color: 'var(--portal-text)', borderRadius: 20, padding: '22px 24px', boxShadow: '0 25px 60px rgba(0,0,0,.18)', borderTop: `5px solid ${mod.color}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12, color: '#64748b' }}>Quem acessa o módulo</div>
                <div style={{ fontSize: 20, fontWeight: 800 }}>{mod.label}</div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 2 }}>{dele.inteiro.length} com o módulo inteiro · {dele.acoes.length} só com algumas ações · {dele.admins.length} administrador{dele.admins.length === 1 ? '' : 'es'} (veem tudo)</div>
              </div>
              <button type="button" onClick={() => setMod(null)} aria-label="Fechar" style={{ background: '#f1f5f9', border: 0, borderRadius: 10, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#64748b' }}><X size={18} /></button>
            </div>
            <Grupo titulo="Com o módulo liberado" vazio="Ninguém tem o módulo inteiro." itens={dele.inteiro.map((u) => ({ u }))} cor={mod.color} onVer={(n) => { onVerUsuario(n); setMod(null) }} />
            <Grupo titulo="Só com algumas ações" vazio="" itens={dele.acoes.map(({ u, acoes }) => ({ u, extra: acoes.join(', ') }))} cor="#d97706" onVer={(n) => { onVerUsuario(n); setMod(null) }} />
            <Grupo titulo="Administradores (acessam tudo)" vazio="" itens={dele.admins.map((u) => ({ u, extra: permissoes[u.id]?.is_dev ? 'dev' : 'admin' }))} cor="#64748b" onVer={(n) => { onVerUsuario(n); setMod(null) }} />
            <p style={{ margin: '12px 0 0', fontSize: 12, color: '#94a3b8', display: 'flex', gap: 6, alignItems: 'center' }}><Search size={12} /> Clique numa pessoa para achá-la na lista e mudar os acessos dela.</p>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}

function Grupo({ titulo, vazio, itens, cor, onVer }: { titulo: string; vazio: string; itens: { u: Usuario; extra?: string }[]; cor: string; onVer: (nome: string) => void }) {
  if (!itens.length && !vazio) return null
  return (
    <section style={{ marginTop: 12 }}>
      <h4 style={{ margin: '0 0 6px', fontSize: 13, fontWeight: 700, color: '#475569' }}>{titulo} <span style={{ fontWeight: 500, color: '#94a3b8' }}>{itens.length}</span></h4>
      {!itens.length ? <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>{vazio}</p> : (
        <div style={{ display: 'grid', gap: 2 }}>
          {[...itens].sort((a, b) => a.u.nome.localeCompare(b.u.nome, 'pt-BR')).map(({ u, extra }) => (
            <button key={u.id} type="button" onClick={() => onVer(u.nome)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, border: 0, background: 'none', padding: '7px 8px', borderRadius: 10, cursor: 'pointer', textAlign: 'left', font: 'inherit', color: 'inherit' }}
              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--portal-bg-hover, #f1f5f9)' }} onMouseLeave={(e) => { e.currentTarget.style.background = 'none' }}>
              <span style={{ width: 32, height: 32, borderRadius: '50%', background: `${cor}1f`, color: cor, display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{iniciais(u.nome)}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <b style={{ display: 'block', fontSize: 14, fontWeight: 600 }}>{u.nome}</b>
                <small style={{ display: 'block', fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{[u.funcao, u.email].filter(Boolean).join(' · ')}</small>
              </span>
              {extra && <span style={{ fontSize: 11.5, color: '#92400e', background: '#fef3c7', borderRadius: 99, padding: '2px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={extra}>{extra}</span>}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
