'use client'
// Um BLOCO = um assunto (pasta da pessoa). Dentro, os tickets por SITUAÇÃO
// (Aberto, Em andamento, Aguardando…, Resolvido) — o bloco não tem andamento
// próprio, para não confundir com a situação. Arrastar muda a situação;
// clique abre a janela do ticket. Quem criou mexe nos integrantes e no nome/cor.
export const dynamic = 'force-dynamic'

import { use, useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Users, Settings, Search, RefreshCw } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import type { Ticket, TicketStatus, UsuarioMin } from '@/lib/tickets/constantes'
import type { Quadro, QuadroColuna } from '@/lib/tickets/quadros'
import KanbanTickets from '@/components/tickets/KanbanTickets'
import PainelIntegrantes from '@/components/tickets/quadros/PainelIntegrantes'
import FormQuadro from '@/components/tickets/quadros/FormQuadro'
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
  const [integrantes, setIntegrantes] = useState(false)
  const [config, setConfig] = useState(false)
  // Filtro de quem faz / quem pediu.
  const [quem, setQuem] = useState<'tudo' | 'faco' | 'pedi'>('tudo')

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
    const eu = userProfile?.id
    return (dados?.tickets || []).filter((t) => {
      if (quem === 'faco' && t.responsavel_id !== eu) return false
      if (quem === 'pedi' && t.solicitante_id !== eu) return false
      return !q || t.titulo.toLowerCase().includes(q) || String(t.numero).includes(q)
        || (dados!.usuarios[t.responsavel_id]?.nome || '').toLowerCase().includes(q)
    })
  }, [dados, busca, quem, userProfile?.id])

  // Arrastar troca a situação (mesma rota dos botões do ticket).
  const mudarStatus = async (ticketId: string, para: TicketStatus) => {
    try {
      const res = await fetch(`/api/tickets/${ticketId}/acoes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao: 'status', para }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error || 'Falha ao mudar a situação')
      setErroAcao('')
    } catch (e) {
      setErroAcao(e instanceof Error ? e.message : 'Falha ao mudar a situação')
    }
    carregar(true)
  }

  // Ações do bloco (integrantes). true = deu certo.
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

  const { quadro, membros, usuarios } = dados
  const pessoas = [...new Set([quadro.criado_por, ...membros])]

  return (
    <div style={{ padding: isMobile ? '12px 10px' : '16px 20px' }}>
      <button onClick={() => router.push('/tickets/quadros')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-muted,#888)' }}>
        <ArrowLeft size={15} /> Quadros
      </button>

      {quadro.arquivado && <div style={{ marginBottom: 10, fontSize: 12.5, fontWeight: 700, color: '#b45309' }}>Este bloco está arquivado.</div>}

      {/* Filtros */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, flex: '1 1 220px', maxWidth: 340, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)' }}>
          <Search size={14} style={{ opacity: .5, flexShrink: 0 }} />
          <input id="busca-quadro" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar no bloco..."
            style={{ border: 'none', outline: 'none', background: 'transparent', fontSize: 13, width: '100%', color: 'var(--portal-text,#111)' }} />
        </div>
        {([['tudo', 'Tudo'], ['faco', 'Que eu faço'], ['pedi', 'Que eu pedi']] as const).map(([v, l]) => (
          <button key={v} onClick={() => setQuem(v)}
            style={{ padding: '6px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
              border: quem === v ? '1.5px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)',
              background: quem === v ? 'rgba(220,38,38,.08)' : 'var(--portal-surface,#fff)', color: quem === v ? '#dc2626' : 'var(--portal-text-secondary,#555)' }}>{l}</button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer' }}>
          <input type="checkbox" checked={encerrados} onChange={(e) => setEncerrados(e.target.checked)} /> Incluir encerrados
        </label>
        <button onClick={() => carregar()} title="Atualizar"
          style={{ display: 'flex', padding: 8, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
          <RefreshCw size={14} />
        </button>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
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
        </span>
        {!dados.pode_trabalhar && !quadro.arquivado && (
          <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>Você vê este bloco, mas só integrantes mexem nos tickets.</span>
        )}
      </div>

      {erroAcao && <div style={{ padding: '10px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginBottom: 10 }}>{erroAcao}</div>}

      <KanbanTickets tickets={ticketsFiltrados} usuarios={usuarios} visao="acompanhando" encerrados={encerrados}
        meuId={userProfile?.id} isAdmin={isAdmin} atualId={null} onMarcarAtual={() => {}}
        onMudarStatus={mudarStatus} onAbrir={setAbertoId} />

      {abertoId && <TicketModal id={abertoId} onFechar={() => setAbertoId(null)} onMudou={() => carregar(true)} />}

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
