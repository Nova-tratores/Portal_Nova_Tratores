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
  GripVertical, ChevronUp, ChevronDown, Zap,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { authHeaders } from '@/lib/auth/client'
import {
  STATUS_INFO, STATUS_ATIVOS, diasParado, prazoVencido,
  type Ticket, type TicketPlanoItem, type TicketStatus, type UsuarioMin,
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

  // Fila pessoal: ordem planejada (ticket_id → posição) + "mexendo agora".
  const [plano, setPlano] = useState<Record<string, number>>({})
  const [atualId, setAtualId] = useState<string | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const aplicarPlanoLocal = useCallback((itens: TicketPlanoItem[]) => {
    const mapa: Record<string, number> = {}
    let atual: string | null = null
    for (const p of itens) {
      mapa[p.ticket_id] = p.posicao
      if (p.atual) atual = p.ticket_id
    }
    setPlano(mapa)
    setAtualId(atual)
  }, [])

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
      aplicarPlanoLocal(json.plano || [])
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [visao, encerrados, aplicarPlanoLocal])

  // Persiste o plano pessoal (otimista, com rollback). Não é atividade do
  // ticket: não gera evento na timeline nem notificação.
  const salvarPlano = useCallback(async (payload: { ordem?: string[]; atual?: string | null }) => {
    const planoAntes = plano
    const atualAntes = atualId
    if (payload.ordem) {
      const mapa: Record<string, number> = {}
      payload.ordem.forEach((id, i) => { mapa[id] = i })
      setPlano(mapa)
    }
    if ('atual' in payload) setAtualId(payload.atual ?? null)
    try {
      const res = await fetch('/api/tickets/plano', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Falha ao salvar a ordem')
      aplicarPlanoLocal(json.plano || [])
    } catch (e) {
      setPlano(planoAntes)
      setAtualId(atualAntes)
      setErro(e instanceof Error ? e.message : 'Falha ao salvar a ordem')
    }
  }, [plano, atualId, aplicarPlanoLocal])

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

  // Reordenar uma lista filtrada é ambíguo — grip e ▲▼ só sem filtro ativo.
  const dndAtivo = visao === 'fila' && !busca.trim() && !filtroStatus && !encerrados

  // Fila: "mexendo agora" no topo → depois a ordem planejada → depois o resto
  // na ordem da API (última atividade). Itens sem posição vão para o fim.
  const ordenados = useMemo(() => {
    if (visao !== 'fila') return filtrados
    const idxApi = new Map(filtrados.map((t, i) => [t.id, i]))
    return [...filtrados].sort((a, b) => {
      if (a.id === atualId) return -1
      if (b.id === atualId) return 1
      const pa = plano[a.id]
      const pb = plano[b.id]
      if (pa !== undefined && pb !== undefined) return pa - pb
      if (pa !== undefined) return -1
      if (pb !== undefined) return 1
      return (idxApi.get(a.id) || 0) - (idxApi.get(b.id) || 0)
    })
  }, [filtrados, visao, plano, atualId])

  // ▲▼ (caminho mobile — DnD HTML5 não funciona em touch).
  const moverTicket = (id: string, delta: -1 | 1) => {
    const ids = ordenados.map((t) => t.id)
    const i = ids.indexOf(id)
    const j = i + delta
    if (i < 0 || j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j], ids[i]]
    salvarPlano({ ordem: ids })
  }

  const soltarSobre = (targetId: string) => {
    const origem = dragId
    setDragId(null)
    setOverId(null)
    if (!origem || origem === targetId) return
    const ids = ordenados.map((t) => t.id)
    const de = ids.indexOf(origem)
    const para = ids.indexOf(targetId)
    if (de < 0 || para < 0) return
    ids.splice(de, 1)
    ids.splice(para, 0, origem)
    salvarPlano({ ordem: ids })
  }

  const marcarAtual = (id: string) => {
    salvarPlano({ atual: atualId === id ? null : id })
  }

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
          {ordenados.map((t, i) => {
            const dias = diasParado(t.ultima_atividade_em)
            const vencido = prazoVencido(t.prazo, t.status)
            const resp = usuarios[t.responsavel_id]
            const sol = usuarios[t.solicitante_id]
            const ehAtual = visao === 'fila' && t.id === atualId
            return (
              <div key={t.id} role="button" tabIndex={0}
                onClick={() => router.push(`/tickets/${t.id}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') router.push(`/tickets/${t.id}`) }}
                draggable={dndAtivo}
                onDragStart={(e) => {
                  setDragId(t.id)
                  e.dataTransfer.setData('text/plain', t.id) // Firefox exige
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overId !== t.id) setOverId(t.id) } }}
                onDrop={(e) => { e.preventDefault(); soltarSobre(t.id) }}
                onDragEnd={() => { setDragId(null); setOverId(null) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '13px 16px', borderRadius: 12,
                  border: ehAtual ? '1.5px solid #d97706' : '1px solid var(--portal-border,#e5e7eb)',
                  background: ehAtual ? 'rgba(217,119,6,.06)' : 'var(--portal-surface,#fff)',
                  cursor: 'pointer', textAlign: 'left', width: '100%',
                  opacity: dragId === t.id ? .5 : 1,
                  boxShadow: dragId && overId === t.id && dragId !== t.id ? '0 -2px 0 0 #dc2626' : undefined,
                }}>
                {dndAtivo && (
                  <span onClick={(e) => e.stopPropagation()}
                    style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0, color: 'var(--portal-text-muted,#999)' }}>
                    <button onClick={() => moverTicket(t.id, -1)} disabled={i === 0} title="Mover para cima"
                      style={{ border: 'none', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', padding: 2, color: 'inherit', opacity: i === 0 ? .25 : .8 }}>
                      <ChevronUp size={14} />
                    </button>
                    <GripVertical size={14} style={{ opacity: .4, cursor: 'grab' }} />
                    <button onClick={() => moverTicket(t.id, 1)} disabled={i === ordenados.length - 1} title="Mover para baixo"
                      style={{ border: 'none', background: 'transparent', cursor: i === ordenados.length - 1 ? 'default' : 'pointer', padding: 2, color: 'inherit', opacity: i === ordenados.length - 1 ? .25 : .8 }}>
                      <ChevronDown size={14} />
                    </button>
                  </span>
                )}
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', flexShrink: 0, width: 46 }}>
                  #{t.numero}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text,#111)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.titulo}
                    </span>
                    {ehAtual && (
                      <span style={{
                        display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, padding: '1px 8px', borderRadius: 999,
                        fontSize: 11, fontWeight: 800, color: '#d97706', background: 'rgba(217,119,6,.14)',
                      }}>
                        <Zap size={11} /> Mexendo agora
                      </span>
                    )}
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
                {visao === 'fila' && (
                  <button onClick={(e) => { e.stopPropagation(); marcarAtual(t.id) }}
                    title={ehAtual ? 'Deixar de destacar este ticket' : 'Estou mexendo neste agora'}
                    style={{
                      display: 'flex', alignItems: 'center', padding: 6, borderRadius: 8, flexShrink: 0, cursor: 'pointer',
                      border: ehAtual ? '1px solid #d97706' : '1px solid var(--portal-border,#e5e7eb)',
                      background: ehAtual ? 'rgba(217,119,6,.14)' : 'transparent',
                      color: ehAtual ? '#d97706' : 'var(--portal-text-muted,#999)',
                    }}>
                    <Zap size={14} fill={ehAtual ? '#d97706' : 'none'} />
                  </button>
                )}
                <span title="Dias sem movimento"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, flexShrink: 0,
                    color: dias >= 5 ? '#dc2626' : dias >= 2 ? '#d97706' : 'var(--portal-text-muted,#999)',
                  }}>
                  <Clock size={12} /> {dias === 0 ? 'hoje' : `${dias}d`}
                </span>
                <StatusBadge status={t.status} />
              </div>
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
