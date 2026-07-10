'use client'
// Seletor de usuário do portal (financeiro_usu ativos) com busca.
// Usado para escolher responsável (criação/transferência) e adicionar participantes.
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { Search, User as UserIcon } from 'lucide-react'
import type { UsuarioMin } from '@/lib/tickets/constantes'

interface Props {
  value: string
  onChange: (userId: string) => void
  excluir?: string[]          // ids que não devem aparecer
  placeholder?: string
  autoFocus?: boolean
}

export default function UserSelect({ value, onChange, excluir = [], placeholder = 'Buscar usuário...', autoFocus }: Props) {
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
                onClick={() => { onChange(u.id); setAberto(false); setBusca('') }}
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
