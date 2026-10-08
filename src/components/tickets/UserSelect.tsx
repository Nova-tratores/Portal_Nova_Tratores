'use client'
// Seletor de usuário do portal (financeiro_usu ativos) com busca.
// Usado para escolher responsável (criação/transferência) e adicionar participantes.
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, User as UserIcon } from 'lucide-react'
import type { UsuarioMin } from '@/lib/tickets/constantes'

interface Props {
  value: string
  onChange: (userId: string, usuario?: UsuarioMin) => void
  excluir?: string[]          // ids que não devem aparecer
  placeholder?: string
  autoFocus?: boolean
  /** Barra de pesquisa sempre à mostra (digita e escolhe), em vez do botão. */
  barraBusca?: boolean
}

export default function UserSelect({ value, onChange, excluir = [], placeholder = 'Buscar usuário...', autoFocus, barraBusca }: Props) {
  const [usuarios, setUsuarios] = useState<UsuarioMin[]>([])
  const [busca, setBusca] = useState('')
  const [aberto, setAberto] = useState(false)
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const carregar = async () => {
      const { data } = await supabase
        .from('financeiro_usu')
        .select('id, nome, avatar_url, ativo')
        .order('nome')
      setUsuarios(((data || []) as (UsuarioMin & { ativo?: boolean })[]).filter((u) => u.ativo !== false))
    }
    carregar()
  }, [])

  useEffect(() => {
    const fora = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [])

  const selecionado = usuarios.find((u) => u.id === value)
  const filtrados = usuarios
    .filter((u) => !excluir.includes(u.id))
    .filter((u) => u.nome?.toLowerCase().includes(busca.toLowerCase()))

  const avatar = (u: UsuarioMin, tam = 22) => u.avatar_url
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={u.avatar_url} alt="" style={{ width: tam, height: tam, borderRadius: '50%', objectFit: 'cover', flex: 'none' }} />
    : <span style={{ width: tam, height: tam, flex: 'none', borderRadius: '50%', background: 'var(--portal-border, #e5e7eb)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><UserIcon size={tam * .55} /></span>

  if (barraBusca) {
    // Escolhido: cartão com foto + "trocar". Senão: campo de busca com a lista embaixo.
    if (selecionado && !aberto) {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 10, border: '1.5px solid #dc2626', background: 'rgba(220,38,38,.05)' }}>
          {avatar(selecionado, 30)}
          <span style={{ flex: 1, fontSize: 15, fontWeight: 700, color: 'var(--portal-text, #111)' }}>{selecionado.nome}</span>
          <button type="button" onClick={() => { setAberto(true); setBusca('') }}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 700, color: '#dc2626' }}>Trocar</button>
        </div>
      )
    }
    return (
      <div ref={raiz} style={{ position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)' }}>
          <Search size={17} style={{ opacity: .55, flex: 'none' }} />
          <input autoFocus={autoFocus} value={busca} placeholder={placeholder}
            onChange={(e) => { setBusca(e.target.value); setAberto(true) }} onFocus={() => setAberto(true)}
            onKeyDown={(e) => { if (e.key === 'Enter' && filtrados[0]) { e.preventDefault(); onChange(filtrados[0].id, filtrados[0]); setAberto(false); setBusca('') } }}
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 15, width: '100%', color: 'var(--portal-text, #111)' }} />
        </div>
        {aberto && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4, maxHeight: 260, overflowY: 'auto',
            background: 'var(--portal-surface, #fff)', border: '1px solid var(--portal-border, #e5e7eb)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)' }}>
            {filtrados.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--portal-text-muted, #888)' }}>Ninguém encontrado</div>}
            {filtrados.map((u) => (
              <button key={u.id} type="button" onClick={() => { onChange(u.id, u); setAberto(false); setBusca('') }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 12px', border: 'none', cursor: 'pointer', fontSize: 14, textAlign: 'left',
                  background: u.id === value ? 'rgba(220,38,38,.08)' : 'transparent', color: 'var(--portal-text, #111)' }}>
                {avatar(u, 26)} {u.nome}
              </button>
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div ref={raiz} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setAberto((a) => !a)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '9px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, textAlign: 'left',
          border: '1px solid var(--portal-border, #e5e7eb)', background: 'var(--portal-bg, #fff)',
          color: selecionado ? 'var(--portal-text, #111)' : 'var(--portal-text-muted, #9ca3af)',
        }}
      >
        <UserIcon size={15} style={{ flexShrink: 0, opacity: .6 }} />
        {selecionado ? selecionado.nome : placeholder}
      </button>
      {aberto && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, marginTop: 4,
          background: 'var(--portal-surface, #fff)', border: '1px solid var(--portal-border, #e5e7eb)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)', overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--portal-border, #eee)' }}>
            <Search size={14} style={{ opacity: .5 }} />
            <input
              autoFocus={autoFocus ?? true}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite para filtrar"
              style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: 'var(--portal-text, #111)' }}
            />
          </div>
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {filtrados.length === 0 && (
              <div style={{ padding: 12, fontSize: 13, color: 'var(--portal-text-muted, #888)' }}>Ninguém encontrado</div>
            )}
            {filtrados.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onChange(u.id, u); setAberto(false); setBusca('') }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px',
                  border: 'none', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                  background: u.id === value ? 'rgba(220,38,38,.08)' : 'transparent',
                  color: 'var(--portal-text, #111)',
                }}
              >
                {u.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={u.avatar_url} alt="" style={{ width: 22, height: 22, borderRadius: '50%', objectFit: 'cover' }} />
                  : <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--portal-border, #e5e7eb)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}><UserIcon size={12} /></span>}
                {u.nome}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
