'use client'
// Tickets — visões (seção 6 do conceito):
//   Minha fila (sou responsável) · Meus pedidos (sou solicitante) ·
//   Acompanhando (sou participante) · Visão gerencial (admin: tudo aberto,
//   agrupável por responsável/status, ordenado por tempo parado).
export const dynamic = 'force-dynamic'

import { useState, useEffect, useCallback, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import AcompanhamentoPedido, { type DadosAcompanhamento } from '@/components/trabalho/AcompanhamentoPedido'
import {
  Inbox, Send, Eye, BarChart3, Plus, Search, Clock, CalendarDays, User as UserIcon, RefreshCw,
  GripVertical, ChevronUp, ChevronDown, Zap, List, Columns3,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import {
  STATUS_INFO, STATUS_ATIVOS, diasParado, prazoVencido,
  type Ticket, type TicketPlanoItem, type TicketStatus, type UsuarioMin,
} from '@/lib/tickets/constantes'
import StatusBadge from '@/components/tickets/StatusBadge'
import FormTicket from '@/components/tickets/FormTicket'
import KanbanTickets from '@/components/tickets/KanbanTickets'
import TicketModal from '@/components/tickets/TicketModal'
import { casaBusca } from '@/lib/texto'

type Visao = 'fila' | 'pedidos' | 'acompanhando' | 'gerencial'
const VISOES_VALIDAS = new Set<Visao>(['fila', 'pedidos', 'acompanhando', 'gerencial'])
type ViewMode = 'lista' | 'kanban'
type Papel = '' | 'resp' | 'sol'
const VIEW_MODE_KEY = 'tickets-view-mode'

function TicketsPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { userProfile } = useAuth()
  const { isAdmin, loading: carregandoPerm } = usePermissoes(userProfile?.id)
  const isMobile = useIsMobile()

  const abaParam = searchParams.get('aba') as Visao | null
  const visao: Visao = abaParam && VISOES_VALIDAS.has(abaParam) ? abaParam : 'fila'
  // Central de Trabalho: os tickets moram DENTRO de cada bloco (não se
  // misturam). Aqui só fica a Visão gerencial (admin); o resto vai pra Quadros.
  useEffect(() => {
    if (visao !== 'gerencial') { router.replace('/tickets/quadros'); return }
    if (!carregandoPerm && userProfile && !isAdmin) router.replace('/tickets/quadros')
  }, [visao, isAdmin, carregandoPerm, userProfile, router])
  // Filtro por pessoa vive na URL (?pessoa=<id>&papel=resp|sol) — o admin
  // copia o link e manda; trocar de aba mantém o filtro.
  const pessoa = searchParams.get('pessoa') || ''
  const papelParam = searchParams.get('papel')
  const papel: Papel = papelParam === 'resp' || papelParam === 'sol' ? papelParam : ''
  const setParams = useCallback((mudancas: Record<string, string>) => {
    const qs = new URLSearchParams(searchParams.toString())
    for (const [k, v] of Object.entries(mudancas)) { if (v) qs.set(k, v); else qs.delete(k) }
    const str = qs.toString()
    router.replace(str ? `/tickets?${str}` : '/tickets')
  }, [router, searchParams])

  const [tickets, setTickets] = useState<Ticket[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [acomp, setAcomp] = useState<Record<string, DadosAcompanhamento>>({})
  const [contadores, setContadores] = useState<Record<Visao, number> | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtroStatus, setFiltroStatus] = useState<TicketStatus | ''>('')
  const [encerrados, setEncerrados] = useState(false)
  const [modalNovo, setModalNovo] = useState(false)
  // Ticket aberto na janela (clique no cartão)
  const [abertoId, setAbertoId] = useState<string | null>(null)

  // Lista × Kanban (só desktop — DnD HTML5 não funciona em touch); escolha
  // guardada no navegador, mesmo padrão do ppv-view-mode.
  const [viewMode, setViewMode] = useState<ViewMode>('lista')
  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_MODE_KEY); if (v === 'lista' || v === 'kanban') setViewMode(v) } catch {}
  }, [])
  const trocarViewMode = useCallback((v: ViewMode) => {
    setViewMode(v)
    try { localStorage.setItem(VIEW_MODE_KEY, v) } catch {}
  }, [])
  const kanban = viewMode === 'kanban' && !isMobile

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
      setAcomp(json.acompanhamento || {})
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

  // Troca de status pelo kanban: otimista, pela mesma rota dos botões da
  // página do ticket (gera evento na timeline + notificação). Erro = rollback.
  const mudarStatus = useCallback(async (id: string, para: TicketStatus) => {
    const antes = tickets
    setTickets((lista) => lista.map((t) => (t.id === id ? { ...t, status: para } : t)))
    try {
      const res = await fetch(`/api/tickets/${id}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao: 'status', para }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Falha ao mudar o status')
      setErro('')
      carregar(true)
    } catch (e) {
      setTickets(antes)
      setErro(e instanceof Error ? e.message : 'Falha ao mudar o status')
    }
  }, [tickets, carregar])

  // Pessoas que aparecem nos tickets desta aba (responsável ou solicitante),
  // com quantos tickets cada uma toca — é daqui que sai o seletor.
  const pessoasOpcoes = useMemo(() => {
    const qtd = new Map<string, number>()
    for (const t of tickets) {
      for (const id of new Set([t.responsavel_id, t.solicitante_id])) {
        if (id) qtd.set(id, (qtd.get(id) || 0) + 1)
      }
    }
    return [...qtd.entries()]
      .map(([id, n]) => ({ id, nome: usuarios[id]?.nome || '—', n }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [tickets, usuarios])

  const porPessoa = useMemo(() => {
    if (!pessoa) return tickets
    return tickets.filter((t) => papel === 'resp' ? t.responsavel_id === pessoa
      : papel === 'sol' ? t.solicitante_id === pessoa
      : t.responsavel_id === pessoa || t.solicitante_id === pessoa)
  }, [tickets, pessoa, papel])

  const filtrados = useMemo(() => {
    let lista = porPessoa
    if (filtroStatus) lista = lista.filter((t) => t.status === filtroStatus)
    // Busca sem diferença de maiúscula/acento; "#54" ou "54" acha pelo número.
    if (busca.trim()) {
      lista = lista.filter((t) => casaBusca(busca, t.titulo, t.categoria, t.terceiro_envolvido, `#${t.numero}`,
        usuarios[t.responsavel_id]?.nome, usuarios[t.solicitante_id]?.nome))
    }
    if (visao === 'gerencial') {
      // Gerencial: o mais parado primeiro (pergunta 8 — atrasado/esquecido)
      lista = [...lista].sort((a, b) => new Date(a.ultima_atividade_em).getTime() - new Date(b.ultima_atividade_em).getTime())
    }
    return lista
  }, [porPessoa, filtroStatus, busca, visao, usuarios])

  // Reordenar uma lista filtrada é ambíguo — grip e ▲▼ só sem filtro ativo
  // (e só na Lista: no kanban o arrasto troca status, não a ordem pessoal).
  const dndAtivo = visao === 'fila' && !busca.trim() && !filtroStatus && !pessoa && !encerrados && !kanban

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
    for (const t of porPessoa) c[t.status] = (c[t.status] || 0) + 1
    return c
  }, [porPessoa])

  const abas: { id: Visao; label: string; icone: React.ReactNode }[] = [
    { id: 'fila', label: 'Minha fila', icone: <Inbox size={15} /> },
    { id: 'pedidos', label: 'Meus pedidos', icone: <Send size={15} /> },
    { id: 'acompanhando', label: 'Acompanhando', icone: <Eye size={15} /> },
    ...(isAdmin ? [{ id: 'gerencial' as Visao, label: 'Visão gerencial', icone: <BarChart3 size={15} /> }] : []),
  ]

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 20, maxWidth: kanban ? undefined : 1100, margin: '0 auto' }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
        <div style={{ display: visao === 'gerencial' ? 'none' : 'flex', gap: 6, flexWrap: 'wrap' }}>
          {abas.map((a) => {
            const qtd = contadores?.[a.id]
            const ativo = visao === a.id
            return (
              <button key={a.id} onClick={() => setParams({ aba: a.id })}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <select value={pessoa} onChange={(e) => setParams({ pessoa: e.target.value, papel: e.target.value ? papel : '' })}
            title="Filtrar por pessoa (responsável ou solicitante)"
            style={{
              padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: pessoa ? 700 : 500, cursor: 'pointer', maxWidth: 240,
              border: pessoa ? '1.5px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
              background: pessoa ? 'rgba(220,38,38,.07)' : 'var(--portal-surface,#fff)',
              color: pessoa ? '#dc2626' : 'var(--portal-text-muted,#888)',
            }}>
            <option value="">Todas as pessoas</option>
            {pessoasOpcoes.map((p) => <option key={p.id} value={p.id}>{p.nome} ({p.n})</option>)}
          </select>
          {pessoa && (
            <div style={{ display: 'flex', gap: 4 }}>
              {([['', 'Qualquer papel'], ['resp', 'Responsável'], ['sol', 'Solicitante']] as const).map(([v, rotulo]) => (
                <button key={v || 'todos'} onClick={() => setParams({ papel: v })}
                  style={{
                    padding: '5px 10px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    border: papel === v ? '1.5px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
                    background: papel === v ? 'rgba(220,38,38,.07)' : 'transparent',
                    color: papel === v ? '#dc2626' : 'var(--portal-text-muted,#888)',
                  }}>
                  {rotulo}
                </button>
              ))}
              <button onClick={() => setParams({ pessoa: '', papel: '' })} title="Limpar filtro de pessoa"
                style={{ padding: '5px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', color: 'var(--portal-text-muted,#888)' }}>
                ×
              </button>
            </div>
          )}
        </div>
        {!isMobile && (
          <div style={{ display: 'flex', marginLeft: 'auto', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 8, overflow: 'hidden' }}>
            {([['lista', 'Lista', <List key="l" size={14} />], ['kanban', 'Kanban', <Columns3 key="k" size={14} />]] as const).map(([v, rotulo, icone]) => {
              const ativo = viewMode === v
              return (
                <button key={v} onClick={() => trocarViewMode(v)} title={`Ver como ${rotulo.toLowerCase()}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                    background: ativo ? '#dc2626' : 'var(--portal-surface,#fff)',
                    color: ativo ? '#fff' : 'var(--portal-text-muted,#888)',
                  }}>
                  {icone} {rotulo}
                </button>
              )
            })}
          </div>
        )}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer', marginLeft: isMobile ? 'auto' : undefined }}>
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
            {pessoa ? `Nenhum ticket de ${usuarios[pessoa]?.nome || 'essa pessoa'} nesta aba${papel === 'resp' ? ' como responsável' : papel === 'sol' ? ' como solicitante' : ''}.` : (
              <>
                {visao === 'fila' && 'Nada na sua fila — nenhum ticket sob sua responsabilidade.'}
                {visao === 'pedidos' && 'Você ainda não abriu nenhum ticket.'}
                {visao === 'acompanhando' && 'Você não está acompanhando nenhum ticket de outras pessoas.'}
                {visao === 'gerencial' && 'Nenhum ticket em aberto na empresa.'}
              </>
            )}
          </div>
          {pessoa && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              <button onClick={() => setParams({ pessoa: '', papel: '' })}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 700, color: '#dc2626', textDecoration: 'underline' }}>
                Limpar filtro de pessoa
              </button>
            </div>
          )}
          {!pessoa && visao === 'fila' && (contadores?.pedidos || 0) > 0 && (
            <div style={{ fontSize: 13, marginTop: 8 }}>
              Os tickets que você abriu para outras pessoas estão em{' '}
              <button onClick={() => router.push('/tickets?aba=pedidos')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 700, color: '#dc2626', textDecoration: 'underline' }}>
                Meus pedidos ({contadores?.pedidos})
              </button>.
            </div>
          )}
        </div>
      ) : kanban ? (
        <KanbanTickets
          tickets={ordenados}
          usuarios={usuarios}
          visao={visao}
          encerrados={encerrados}
          meuId={userProfile?.id}
          isAdmin={isAdmin}
          atualId={atualId}
          onMarcarAtual={marcarAtual}
          onMudarStatus={mudarStatus}
          onAbrir={setAbertoId}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {ordenados.map((t, i) => {
            const dias = diasParado(t.ultima_atividade_em)
            const vencido = prazoVencido(t.prazo, t.status)
            const resp = usuarios[t.responsavel_id]
            const sol = usuarios[t.solicitante_id]
            const ehAtual = visao === 'fila' && t.id === atualId
            if (isMobile) {
              return (
                <div key={t.id} role="button" tabIndex={0}
                  onClick={() => setAbertoId(t.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter') setAbertoId(t.id) }}
                  style={{
                    display: 'flex', flexDirection: 'column', gap: 8, padding: '13px 14px', borderRadius: 12,
                    border: ehAtual ? '1.5px solid #d97706' : '1px solid var(--portal-border,#e5e7eb)',
                    background: ehAtual ? 'rgba(217,119,6,.06)' : 'var(--portal-surface,#fff)',
                    cursor: 'pointer', width: '100%',
                  }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', flexShrink: 0, marginTop: 2 }}>#{t.numero}</span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--portal-text,#111)', lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{t.titulo}</span>
                    <span style={{ flexShrink: 0 }}><StatusBadge status={t.status} /></span>
                  </div>
                  {ehAtual && (
                    <span style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 3, padding: '1px 8px', borderRadius: 999, fontSize: 11, fontWeight: 800, color: '#d97706', background: 'rgba(217,119,6,.14)' }}>
                      <Zap size={11} /> Mexendo agora
                    </span>
                  )}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><UserIcon size={12} /> {resp?.nome || '—'}</span>
                    {visao !== 'pedidos' && sol && <span>pedido por {sol.nome}</span>}
                    {visao === 'pedidos' && <AcompanhamentoPedido ticket={t as Ticket & { aceite?: string | null; aceite_motivo?: string | null }} dados={acomp[t.id]} />}
                    {t.categoria && <span>{t.categoria}</span>}
                    {t.prazo && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: vencido ? '#dc2626' : undefined, fontWeight: vencido ? 700 : undefined }}>
                        <CalendarDays size={12} /> {new Date(t.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}{vencido ? ' (vencido)' : ''}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
                    <span title="Dias sem movimento" style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: dias >= 5 ? '#dc2626' : dias >= 2 ? '#d97706' : 'var(--portal-text-muted,#999)' }}>
                      <Clock size={12} /> {dias === 0 ? 'hoje' : `${dias}d`}
                    </span>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} onClick={(e) => e.stopPropagation()}>
                      {visao === 'fila' && (
                        <button onClick={() => marcarAtual(t.id)} title={ehAtual ? 'Deixar de destacar' : 'Estou mexendo neste agora'}
                          style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: 8, cursor: 'pointer', border: ehAtual ? '1px solid #d97706' : '1px solid var(--portal-border,#e5e7eb)', background: ehAtual ? 'rgba(217,119,6,.14)' : 'transparent', color: ehAtual ? '#d97706' : 'var(--portal-text-muted,#999)' }}>
                          <Zap size={15} fill={ehAtual ? '#d97706' : 'none'} />
                        </button>
                      )}
                      {dndAtivo && (
                        <>
                          <button onClick={() => moverTicket(t.id, -1)} disabled={i === 0} title="Subir na fila"
                            style={{ display: 'flex', padding: 7, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: i === 0 ? 'default' : 'pointer', color: 'var(--portal-text-muted,#999)', opacity: i === 0 ? .3 : 1 }}>
                            <ChevronUp size={15} />
                          </button>
                          <button onClick={() => moverTicket(t.id, 1)} disabled={i === ordenados.length - 1} title="Descer na fila"
                            style={{ display: 'flex', padding: 7, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: i === ordenados.length - 1 ? 'default' : 'pointer', color: 'var(--portal-text-muted,#999)', opacity: i === ordenados.length - 1 ? .3 : 1 }}>
                            <ChevronDown size={15} />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )
            }
            return (
              <div key={t.id} role="button" tabIndex={0}
                onClick={() => setAbertoId(t.id)}
                onKeyDown={(e) => { if (e.key === 'Enter') setAbertoId(t.id) }}
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
                    {visao === 'pedidos' && <AcompanhamentoPedido ticket={t as Ticket & { aceite?: string | null; aceite_motivo?: string | null }} dados={acomp[t.id]} />}
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
          onCriado={(id) => { setModalNovo(false); carregar(true); setAbertoId(id) }}
        />
      )}

      {abertoId && (
        <TicketModal id={abertoId} onFechar={() => setAbertoId(null)} onMudou={() => carregar(true)} />
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
