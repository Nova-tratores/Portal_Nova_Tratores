'use client'
// Seletor de requisição pra vincular a um ticket. Molde do UserSelect, mas a
// busca é no SERVIDOR (/api/tickets/vinculos/buscar) com debounce: número
// (com ou sem #) acha por id; texto filtra título/fornecedor; vazio = recentes.
import { useState, useEffect, useRef } from 'react'
import { Search, ClipboardList } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { formatarBRL, statusReqInfo, type RequisicaoResumo } from '@/lib/tickets/vinculos'

interface Props {
  onEscolher: (r: RequisicaoResumo) => void
  excluir?: string[]          // ids (texto) já vinculados
  placeholder?: string
  autoFocus?: boolean
}

export default function RequisicaoSelect({ onEscolher, excluir = [], placeholder = 'Nº ou título da requisição...', autoFocus }: Props) {
  const [busca, setBusca] = useState('')
  const [itens, setItens] = useState<RequisicaoResumo[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const raiz = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelado = false
    const t = setTimeout(async () => {
      setCarregando(true)
      setErro('')
      try {
        const res = await fetch(`/api/tickets/vinculos/buscar?tipo=requisicao&q=${encodeURIComponent(busca)}`, { headers: await authHeaders() })
        const json = await res.json()
        if (cancelado) return
        if (!res.ok) { setErro(json.error || 'Falha na busca'); setItens([]); return }
        setItens(json.itens || [])
      } catch {
        if (!cancelado) setErro('Falha de conexão')
      } finally {
        if (!cancelado) setCarregando(false)
      }
    }, busca ? 300 : 0)
    return () => { cancelado = true; clearTimeout(t) }
  }, [busca])

  const filtrados = itens.filter((r) => !excluir.includes(String(r.id)))

  return (
    <div ref={raiz} style={{
      background: 'var(--portal-surface, #fff)', border: '1px solid var(--portal-border, #e5e7eb)',
      borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)', overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: '1px solid var(--portal-border, #eee)' }}>
        <Search size={14} style={{ opacity: .5 }} />
        <input
          autoFocus={autoFocus ?? true}
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder={placeholder}
          style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: 'var(--portal-text, #111)' }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto' }}>
        {erro && <div style={{ padding: 12, fontSize: 12.5, color: '#dc2626' }}>{erro}</div>}
        {!erro && carregando && filtrados.length === 0 && (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--portal-text-muted, #888)' }}>Buscando...</div>
        )}
        {!erro && !carregando && filtrados.length === 0 && (
          <div style={{ padding: 12, fontSize: 13, color: 'var(--portal-text-muted, #888)' }}>
            {busca ? 'Nenhuma requisição encontrada' : 'Nenhuma requisição recente'}
          </div>
        )}
        {filtrados.map((r) => {
          const st = statusReqInfo(r.status)
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onEscolher(r)}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8, width: '100%', padding: '8px 12px',
                border: 'none', borderBottom: '1px solid var(--portal-border, #f3f4f6)', cursor: 'pointer',
                fontSize: 13, textAlign: 'left', background: 'transparent', color: 'var(--portal-text, #111)',
              }}
            >
              <ClipboardList size={14} style={{ flexShrink: 0, marginTop: 2, opacity: .55 }} />
              <span style={{ minWidth: 0, flex: 1 }}>
                <span style={{ display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  <strong>#{r.id}</strong> · {r.titulo}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--portal-text-muted, #888)', marginTop: 2, flexWrap: 'wrap' }}>
                  {r.fornecedor && <span>{r.fornecedor}</span>}
                  <span>{formatarBRL(r.valor, r.valor_cru)}</span>
                  {r.data && <span>{new Date(r.data + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                  <span style={{ padding: '1px 7px', borderRadius: 999, fontWeight: 700, fontSize: 10.5, color: st.cor, background: st.fundo }}>{st.label}</span>
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
