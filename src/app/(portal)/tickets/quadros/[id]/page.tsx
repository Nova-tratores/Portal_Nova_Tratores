'use client'
// Um quadro: colunas próprias + cartões (tickets). Clique no cartão abre a
// janela do ticket; arrastar troca a coluna. Quem criou o quadro mexe nas
// colunas, nos integrantes e nas configurações.
export const dynamic = 'force-dynamic'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Lock, Globe, Users, Settings, Plus, Search, RefreshCw, GanttChart } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import type { Ticket, UsuarioMin } from '@/lib/tickets/constantes'
import type { Quadro, QuadroColuna } from '@/lib/tickets/quadros'
import KanbanQuadro from '@/components/tickets/quadros/KanbanQuadro'
import PainelIntegrantes from '@/components/tickets/quadros/PainelIntegrantes'
import FormQuadro from '@/components/tickets/quadros/FormQuadro'
import FormTicket from '@/components/tickets/FormTicket'
import TicketModal from '@/components/tickets/TicketModal'

interface Dados {
  quadro: Quadro
  colunas: QuadroColuna[]
  membros: string[]
  tickets: Ticket[]
  usuarios: Record<string, UsuarioMin>
  pode_trabalhar: boolean
  pode_gerenciar: boolean
  etapas?: Record<string, { fim: string | null; critica: boolean; status: string }>
  projeto?: { id: string; nome: string } | null
  passos?: Record<string, { feitas: number; total: number }>
}

export default function QuadroPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const isMobile = useIsMobile()

  const [dados, setDados] = useState<Dados | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [busca, setBusca] = useState('')
  const [encerrados, setEncerrados] = useState(false)
  const [abertoId, setAbertoId] = useState<string | null>(null)
  const [novoNaColuna, setNovoNaColuna] = useState<string | null>(null)
  const [integrantes, setIntegrantes] = useState(false)
  const [config, setConfig] = useState(false)

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const res = await fetch(`/api/tickets/quadros/${id}${encerrados ? '?encerrados=1' : ''}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); return }
      setDados(json)
      setErro('')
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [id, encerrados])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])
  useEffect(() => {
    const foco = () => carregar(true)
    window.addEventListener('focus', foco)
    return () => window.removeEventListener('focus', foco)
  }, [carregar])

  const ticketsFiltrados = useMemo(() => {
    const q = busca.trim().toLowerCase()
    if (!dados || !q) return dados?.tickets || []
    return dados.tickets.filter((t) =>
      t.titulo.toLowerCase().includes(q) || String(t.numero).includes(q)
      || (dados.usuarios[t.responsavel_id]?.nome || '').toLowerCase().includes(q))
  }, [dados, busca])

  // Mover cartão: otimista, pela rota de ações do ticket (fica na linha do tempo).
  const moverCartao = async (ticketId: string, colunaId: string, ordem?: string[]) => {
    if (!dados) return
    const antes = dados
    const posNova = new Map((ordem || []).map((x, i) => [x, i]))
    setDados({ ...dados, tickets: dados.tickets.map((t) => {
      const comCol = t.id === ticketId ? { ...t, quadro_coluna_id: colunaId } : t
      return posNova.has(t.id) ? { ...comCol, quadro_posicao: posNova.get(t.id) } : comCol
    }) })
    try {
      const res = await fetch(`/api/tickets/${ticketId}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao: 'coluna', coluna_id: colunaId, ordem }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Falha ao mover')
      setErroAcao('')
    } catch (e) {
      setDados(antes)
      setErroAcao(e instanceof Error ? e.message : 'Falha ao mover')
    }
  }

  // Ações do quadro (colunas/integrantes). true = deu certo.
  const acaoQuadro = async (payload: Record<string, unknown>): Promise<boolean> => {
    try {
      const res = await fetch(`/api/tickets/quadros/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErroAcao(json.error || 'Falha na ação'); return false }
      setErroAcao('')
      await carregar(true)
      return true
    } catch {
      setErroAcao('Falha de conexão')
      return false
    }
  }

  if (carregando && !dados) return <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando quadro...</div>
  if (erro || !dados) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 14 }}>{erro || 'Quadro não encontrado'}</div>
        <button onClick={() => router.push('/tickets/quadros')} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-secondary,#555)' }}>Voltar aos quadros</button>
      </div>
    )
  }

  const { quadro, colunas, membros, usuarios } = dados
  const pessoas = [...new Set([quadro.criado_por, ...membros])]

  return (
    <div style={{ padding: isMobile ? '12px 10px' : '16px 20px' }}>
      <button onClick={() => router.push('/tickets/quadros')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-muted,#888)' }}>
        <ArrowLeft size={15} /> Quadros
      </button>

      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 12, marginBottom: 12, background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderTop: `4px solid ${quadro.cor}` }}>
        <div style={{ flex: '1 1 260px', minWidth: 0 }}>
          <h1 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 19, fontWeight: 800, margin: 0, color: 'var(--portal-text,#111)' }}>
            {quadro.nome}
            <span title={quadro.visibilidade === 'privado' ? 'Privado: só integrantes' : 'Público: todos de Tickets veem'} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>
              {quadro.visibilidade === 'privado' ? <><Lock size={12} /> privado</> : <><Globe size={12} /> público</>}
            </span>
            {quadro.arquivado && <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>arquivado</span>}
          </h1>
          {quadro.descricao && <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>{quadro.descricao}</p>}
          {dados.projeto && (
            <a href={`/cronograma/${dados.projeto.id}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 6, fontSize: 12.5, fontWeight: 700, color: '#0369a1', textDecoration: 'none' }}>
              <GanttChart size={13} /> Cronograma: {dados.projeto.nome}
            </a>
          )}
        </div>
        <button onClick={() => setIntegrantes(true)} title="Integrantes"
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-secondary,#555)' }}>
          <Users size={14} /> {pessoas.length}
        </button>
        {dados.pode_gerenciar && (
          <button onClick={() => setConfig(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 11px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-secondary,#555)' }}>
            <Settings size={14} /> Configurar
          </button>
        )}
        {dados.pode_trabalhar && (
          <button onClick={() => setNovoNaColuna(colunas[0]?.id || '')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', cursor: 'pointer', fontSize: 13.5, fontWeight: 700 }}>
            <Plus size={15} /> Novo ticket
          </button>
        )}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, flex: '1 1 220px', maxWidth: 340, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)' }}>
          <Search size={14} style={{ opacity: .5, flexShrink: 0 }} />
          <input id="busca-quadro" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no quadro..."
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: 'var(--portal-text,#111)' }} />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer' }}>
          <input type="checkbox" checked={encerrados} onChange={(e) => setEncerrados(e.target.checked)} /> Incluir encerrados
        </label>
        <button onClick={() => carregar()} title="Atualizar"
          style={{ display: 'flex', padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
          <RefreshCw size={14} />
        </button>
        {!dados.pode_trabalhar && !quadro.arquivado && (
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Você vê este quadro, mas só integrantes criam e movem cartões.</span>
        )}
      </div>

      {erroAcao && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{erroAcao}</div>}

      <KanbanQuadro
        colunas={colunas}
        tickets={ticketsFiltrados}
        usuarios={usuarios}
        cor={quadro.cor}
        meuId={userProfile?.id}
        podeTrabalhar={dados.pode_trabalhar}
        podeGerenciar={dados.pode_gerenciar && !quadro.arquivado}
        isMobile={isMobile}
        onAbrir={setAbertoId}
        onMover={moverCartao}
        onNovoTicket={(colunaId) => setNovoNaColuna(colunaId)}
        onColuna={acaoQuadro}
        etapas={dados.etapas}
        passos={dados.passos}
      />

      {abertoId && <TicketModal id={abertoId} onFechar={() => setAbertoId(null)} onMudou={() => carregar(true)} />}

      {novoNaColuna !== null && (
        <FormTicket
          quadro={{ id: quadro.id, nome: quadro.nome, colunaId: novoNaColuna || null, temCronograma: !!dados.projeto }}
          onFechar={() => setNovoNaColuna(null)}
          onCriado={(ticketId) => { setNovoNaColuna(null); carregar(true); setAbertoId(ticketId) }}
        />
      )}

      {integrantes && (
        <PainelIntegrantes membros={membros} criadoPor={quadro.criado_por} usuarios={usuarios}
          podeGerenciar={dados.pode_gerenciar || isAdmin} onFechar={() => setIntegrantes(false)} onAcao={acaoQuadro} />
      )}

      {config && (
        <FormQuadro inicial={quadro} usuarios={usuarios} onFechar={() => setConfig(false)}
          onSalvo={() => { setConfig(false); carregar(true) }} />
      )}
    </div>
  )
}
