'use client'
// Tickets — visões (seção 6 do conceito):
//   Minha fila (sou responsável) · Meus pedidos (sou solicitante) ·
//   Acompanhando (sou participante) · Visão gerencial (admin: tudo aberto,
//   agrupável por responsável/status, ordenado por tempo parado).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Inbox, Send, Eye, BarChart3, Plus, Search, Clock, CalendarDays, User as UserIcon, RefreshCw,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import {
  STATUS_INFO, STATUS_ATIVOS, diasParado, prazoVencido,
  type Ticket, type TicketStatus, type UsuarioMin,
} from '@/lib/tickets/constantes'
import StatusBadge from '@/components/tickets/StatusBadge'
import FormTicket from '@/components/tickets/FormTicket'

type Visao = 'fila' | 'pedidos' | 'acompanhando' | 'gerencial'
const VISOES_VALIDAS = new Set<Visao>(['fila', 'pedidos', 'acompanhando', 'gerencial'])

function TicketsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)

  const abaParam = searchParams.get('aba') as Visao | null
  const visao: Visao = abaParam && VISOES_VALIDAS.has(abaParam) ? abaParam : 'fila'

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [contadores, setContadores] = useState<Record<Visao, number> | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<TicketStatus | ''>('')
  const [encerrados, setEncerrados] = useState(false)
  const [modalNovo, setModalNovo] = useState(false)

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    setErro('')
    try {
      const res = await fetch(`/api/tickets?visao=${visao}${encerrados ? '&encerrados=1' : ''}`, {
        headers: await authHeaders(),
      })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); setTickets([]); return }
      setTickets(json.tickets || [])
      setUsuarios(json.usuarios || {})
      if (json.contadores) setContadores(json.contadores)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [visao, encerrados])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  const filtrados = useMemo(() => {
    let lista = tickets
    if (filtroStatus) lista = lista.filter((t) => t.status === filtroStatus)
    const q = busca.trim().toLowerCase()
    if (q) {
      lista = lista.filter((t) =>
        t.titulo.toLowerCase().includes(q)
        || t.categoria.toLowerCase().includes(q)
        || t.terceiro_envolvido.toLowerCase().includes(q)
        || String(t.numero).includes(q)
        || (usuarios[t.responsavel_id]?.nome || '').toLowerCase().includes(q)
        || (usuarios[t.solicitante_id]?.nome || '').toLowerCase().includes(q))
    }
    if (visao === 'gerencial') {
      // Gerencial: o mais parado primeiro (pergunta 8 — atrasado/esquecido)
      lista = [...lista].sort((a, b) => new Date(a.ultima_atividade_em).getTime() - new Date(b.ultima_atividade_em).getTime())
    }
    return lista
  }, [tickets, filtroStatus, busca, visao, usuarios])

  const contagemStatus = useMemo(() => {
    const c: Partial<Record<TicketStatus, number>> = {}
    for (const t of tickets) c[t.status] = (c[t.status] || 0) + 1
    return c
  }, [tickets])

  const abas: { id: Visao; label: string; icone: React.ReactNode }[] = [
    { id: 'fila', label: 'Minha fila', icone: <Inbox size={15} /> },
    { id: 'pedidos', label: 'Meus pedidos', icone: <Send size={15} /> },
    { id: 'acompanhando', label: 'Acompanhando', icone: <Eye size={15} /> },
    ...(isAdmin ? [{ id: 'gerencial' as Visao, label: 'Visão gerencial', icone: <BarChart3 size={15} /> }] : []),
  ]

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {abas.map((a) => {
            const qtd = contadores?.[a.id]
            const ativo = visao === a.id
            return (
              <button key={a.id} onClick={() => router.push(`/tickets?aba=${a.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
                  fontSize: 13, fontWeight: 700, cursor: 'pointer',
                  border: ativo ? '1.5px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
                  background: ativo ? 'rgba(220,38,38,.07)' : 'var(--portal-surface,#fff)',
                  color: ativo ? '#dc2626' : 'var(--portal-text-secondary,#555)',
                }}>
                {a.icone} {a.label}
                {typeof qtd === 'number' && qtd > 0 && (
                  <span style={{
                    minWidth: 18, padding: '1px 6px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                    background: ativo ? '#dc2626' : 'var(--portal-bg,#f3f4f6)',
                    color: ativo ? '#fff' : 'var(--portal-text-muted,#888)',
                  }}>
                    {qtd}
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button onClick={() => setModalNovo(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8,
            border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer',
          }}>
          <Plus size={16} /> Novo Ticket
        </button>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, flex: '1 1 220px', maxWidth: 340,
          border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)',
        }}>
          <Search size={14} style={{ opacity: .5, flexShrink: 0 }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por título, nº, pessoa, categoria..."
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: 'var(--portal-text,#111)' }} />
        </div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {STATUS_ATIVOS.map((s) => (
            <button key={s} onClick={() => setFiltroStatus(filtroStatus === s ? '' : s)}
              style={{
                padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                border: filtroStatus === s ? `1.5px solid ${STATUS_INFO[s].cor}` : '1px solid var(--portal-border,#e5e7eb)',
                background: filtroStatus === s ? STATUS_INFO[s].fundo : 'transparent',
                color: filtroStatus === s ? STATUS_INFO[s].cor : 'var(--portal-text-muted,#888)',
              }}>
              {STATUS_INFO[s].label}{contagemStatus[s] ? ` · ${contagemStatus[s]}` : ''}
            </button>
          ))}
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer', marginLeft: 'auto' }}>
          <input type="checkbox" checked={encerrados} onChange={(e) => setEncerrados(e.target.checked)} />
          Incluir encerrados
        </label>
        <button onClick={() => carregar()} title="Atualizar"
          style={{ display: 'flex', alignItems: 'center', padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      {erro && (
        <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
          {erro}
        </div>
      )}

      {/* Lista */}
      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)', fontSize: 14 }}>Carregando tickets...</div>
      ) : filtrados.length === 0 ? (
        <div style={{
          padding: '60px 20px', textAlign: 'center', borderRadius: 12,
          border: '1px dashed var(--portal-border,#ddd)', color: 'var(--portal-text-muted,#888)',
        }}>
          <Inbox size={32} style={{ opacity: .35, marginBottom: 10 }} />
          <div style={{ fontSize: 14, fontWeight: 600 }}>
            {visao === 'fila' && 'Nada na sua fila — nenhum ticket sob sua responsabilidade.'}
            {visao === 'pedidos' && 'Você ainda não abriu nenhum ticket.'}
            {visao === 'acompanhando' && 'Você não está acompanhando nenhum ticket de outras pessoas.'}
            {visao === 'gerencial' && 'Nenhum ticket em aberto na empresa.'}
          </div>
          {visao === 'fila' && (contadores?.pedidos || 0) > 0 && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              Os tickets que você abriu para outras pessoas estão em{' '}
              <button onClick={() => router.push('/tickets?aba=pedidos')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 700, color: '#dc2626', textDecoration: 'underline' }}>
                Meus pedidos ({contadores?.pedidos})
              </button>.
            </div>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtrados.map((t) => {
            const dias = diasParado(t.ultima_atividade_em)
            const vencido = prazoVencido(t.prazo, t.status)
            const resp = usuarios[t.responsavel_id]
            const sol = usuarios[t.solicitante_id]
            return (
              <button key={t.id} onClick={() => router.push(`/tickets/${t.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 12,
                  border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                }}>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', flexShrink: 0, width: 46 }}>
                  #{t.numero}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text,#111)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {t.titulo}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 3, fontSize: 12, color: 'var(--portal-text-muted,#888)', flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <UserIcon size={12} /> {resp?.nome || '—'}
                    </span>
                    {visao !== 'pedidos' && sol && <span>pedido por {sol.nome}</span>}
                    {t.categoria && <span>{t.categoria}</span>}
                    {t.prazo && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: vencido ? '#dc2626' : undefined, fontWeight: vencido ? 700 : undefined }}>
                        <CalendarDays size={12} /> {new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}{vencido ? ' (vencido)' : ''}
                      </span>
                    )}
                  </div>
                </div>
                <span title="Dias sem movimento"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, flexShrink: 0,
                    color: dias >= 5 ? '#dc2626' : dias >= 2 ? '#d97706' : 'var(--portal-text-muted,#999)',
                  }}>
                  <Clock size={12} /> {dias === 0 ? 'hoje' : `${dias}d`}
                </span>
                <StatusBadge status={t.status} />
              </button>
            )
          })}
        </div>
      )}

      {modalNovo && (
        <FormTicket
          onFechar={() => setModalNovo(false)}
          onCriado={(id) => { setModalNovo(false); router.push(`/tickets/${id}`) }}
        />
      )}
    </div>
  )
}

export default function TicketsPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>}>
      <TicketsPageInner />
    </Suspense>
  )
}
