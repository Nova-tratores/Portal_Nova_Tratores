'use client'
// Detalhe do ticket: responde "em que pé está?" e "com quem está a bola?" no
// topo; abaixo, a timeline imutável (o coração do sistema) e as ações.
// Usado como PÁGINA (/tickets/[id], links de notificação) e como JANELA
// (clique no cartão: TicketModal) — com onFechar, vira janela.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Send, User as UserIcon, Users, CalendarDays, Tag, Building2, Lock, Globe,
  ArrowRightLeft, BellRing, Plus, X, MessageSquare, CircleDot, PenLine, Paperclip,
  CheckCircle2, RotateCcw, Ban, Clock, Link2, Unlink, ShoppingCart, Package, ExternalLink, LayoutGrid, GanttChart,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import {
  STATUS_INFO, STATUS_FINAIS, statusDisponiveis, diasParado, prazoVencido,
  type Ticket, type TicketEvento, type TicketParticipante, type TicketStatus, type UsuarioMin,
} from '@/lib/tickets/constantes'
import StatusBadge from '@/components/tickets/StatusBadge'
import UserSelect from '@/components/tickets/UserSelect'
import CardVinculos from '@/components/tickets/CardVinculos'
import TarefasDoTicket from '@/components/tickets/TarefasDoTicket'
import type { TicketVinculoEnriquecido } from '@/lib/tickets/vinculos'
import { SC_ETAPA_INFO, SC_CONFIANCA_INFO, margemPrevista, type PayloadSC, type ScEtapa } from '@/lib/tickets/compras'
import PainelCompras from '@/components/tickets/compras/PainelCompras'

const fmtData = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR")

const EVENTO_ICONE: Record<string, React.ReactNode> = {
  criacao: <CircleDot size={14} />,
  comentario: <MessageSquare size={14} />,
  status: <CircleDot size={14} />,
  transferencia: <ArrowRightLeft size={14} />,
  participante_adicionado: <Plus size={14} />,
  participante_removido: <X size={14} />,
  pedido_atualizacao: <BellRing size={14} />,
  edicao: <PenLine size={14} />,
  anexo: <Paperclip size={14} />,
  vinculo_adicionado: <Link2 size={14} />,
  vinculo_removido: <Unlink size={14} />,
  sc_criada: <ShoppingCart size={14} />,
  qtd_alterada: <Package size={14} />,
  parecer_financeiro: <PenLine size={14} />,
  pc_emitido: <CheckCircle2 size={14} />,
}

const ROTULO_STATUS_ACAO: Partial<Record<TicketStatus, { rotulo: string; icone: React.ReactNode; destaque?: boolean }>> = {
  em_andamento: { rotulo: 'Em andamento', icone: <RotateCcw size={14} /> },
  aguardando_terceiro: { rotulo: 'Aguardando terceiro', icone: <Clock size={14} /> },
  aguardando_interno: { rotulo: 'Aguardando interno', icone: <Clock size={14} /> },
  resolvido: { rotulo: 'Marcar resolvido', icone: <CheckCircle2 size={14} />, destaque: true },
  fechado: { rotulo: 'Confirmar e fechar', icone: <CheckCircle2 size={14} />, destaque: true },
  cancelado: { rotulo: 'Cancelar ticket', icone: <Ban size={14} /> },
}

interface Props {
  id: string
  /** Modo janela: troca o "voltar" por fechar. */
  onFechar?: () => void
  /** Avisa quem abriu a janela que o ticket mudou (para recarregar a lista). */
  onMudou?: () => void
}

export default function TicketDetalhe({ id, onFechar, onMudou }: Props) {
  const router = useRouter()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const isMobile = useIsMobile()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [eventos, setEventos] = useState<TicketEvento[]>([])
  const [participantes, setParticipantes] = useState<TicketParticipante[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [vinculos, setVinculos] = useState<TicketVinculoEnriquecido[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [erroAcao, setErroAcao] = useState('')
  const [agindo, setAgindo] = useState(false)

  const [comentario, setComentario] = useState('')
  const [modalTransferir, setModalTransferir] = useState(false)
  const [novoResponsavel, setNovoResponsavel] = useState('')
  const [addParticipante, setAddParticipante] = useState(false)
  const [novoParticipante, setNovoParticipante] = useState('')
  const [editando, setEditando] = useState(false)
  const [editPrazo, setEditPrazo] = useState('')
  const [editCategoria, setEditCategoria] = useState('')
  const [editTerceiro, setEditTerceiro] = useState('')
  // Quadro do ticket (sql/tickets-quadros.sql) + escolha de quadro de destino
  const [quadro, setQuadro] = useState<{ id: string; nome: string; cor: string; colunas: { id: string; nome: string }[] } | null>(null)
  const [modalQuadro, setModalQuadro] = useState(false)
  const [opcoesQuadro, setOpcoesQuadro] = useState<{ id: string; nome: string; cor: string }[] | null>(null)
  // Cronograma ligado (sql/central-trabalho.sql)
  const [etapa, setEtapa] = useState<{ projeto_id: string; projeto_nome: string; nome: string; inicio: string | null; fim: string | null; critica: boolean; status: string } | null>(null)
  const [projetoQuadro, setProjetoQuadro] = useState<{ id: string; nome: string } | null>(null)
  const [planejando, setPlanejando] = useState(false)
  const [planDur, setPlanDur] = useState(2)
  const [planIni, setPlanIni] = useState('')

  const abrirModalQuadro = async () => {
    setModalQuadro(true)
    setOpcoesQuadro(null)
    try {
      const res = await fetch('/api/tickets/quadros', { headers: await authHeaders() })
      const json = await res.json()
      setOpcoesQuadro(((json.quadros || []) as { id: string; nome: string; cor: string; pode_trabalhar: boolean; meu?: boolean }[])
        .filter((q) => q.pode_trabalhar && q.meu))
    } catch {
      setOpcoesQuadro([])
    }
  }

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const res = await fetch(`/api/tickets/${id}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) { setErro(json.error || 'Falha ao carregar'); return }
      setTicket(json.ticket)
      setEventos(json.eventos || [])
      setParticipantes(json.participantes || [])
      setUsuarios(json.usuarios || {})
      setVinculos(json.vinculos || [])
      setQuadro(json.quadro || null)
      setEtapa(json.etapa || null)
      setProjetoQuadro(json.projetoQuadro || null)
      setErro('')
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [id])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])

  // Timeline ao vivo: qualquer evento novo neste ticket → recarrega.
  // (Se o realtime falhar, o refetch no foco da janela cobre.)
  useEffect(() => {
    if (!userProfile) return
    const channel = supabase
      .channel(`ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets_eventos', filter: `ticket_id=eq.${id}` },
        () => carregar(true))
      .subscribe()
    const onFocus = () => carregar(true)
    window.addEventListener('focus', onFocus)
    return () => { supabase.removeChannel(channel); window.removeEventListener('focus', onFocus) }
  }, [id, userProfile, carregar])

  const uid = userProfile?.id
  const souResponsavel = !!ticket && ticket.responsavel_id === uid
  const souSolicitante = !!ticket && ticket.solicitante_id === uid
  const participantesAtivos = useMemo(() => participantes.filter((p) => !p.removido_em), [participantes])
  const souParticipante = participantesAtivos.some((p) => p.user_id === uid)
  const encerrado = !!ticket && STATUS_FINAIS.includes(ticket.status)
  const ehSC = !!ticket && ticket.tipo === 'compras'
  const scPayload = (ticket?.payload || {}) as PayloadSC
  const scMargem = ehSC ? margemPrevista(scPayload.valor_unitario ?? scPayload.preco_alvo, scPayload.preco_venda_previsto) : null
  const scInfo = ehSC && ticket?.sc_etapa ? SC_ETAPA_INFO[ticket.sc_etapa as ScEtapa] : null

  const nome = useCallback((userId: string | null | undefined) => {
    if (!userId) return 'Sistema'
    return usuarios[userId]?.nome || 'Usuário'
  }, [usuarios])

  // Imagens/prints na timeline: Ctrl+V no comentário cola direto, e o
  // clipe abre o seletor de arquivos (upload no bucket público `anexos`)
  const fileRef = useRef<HTMLInputElement>(null)
  const [anexando, setAnexando] = useState(false)
  const anexarArquivos = async (lista: File[] | null) => {
    if (!lista || lista.length === 0) return
    setAnexando(true)
    try {
      for (const f of lista.slice(0, 5)) {
        if (f.size > 10 * 1024 * 1024) { setErroAcao(`"${f.name}" passa de 10MB.`); continue }
        const pasta = `tickets/${id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        const nomeArq = (f.name || 'print.png').replace(/[^a-zA-Z0-9._-]/g, '_')
        const { error: upErr } = await supabase.storage.from('anexos').upload(`${pasta}/${nomeArq}`, f)
        if (upErr) { setErroAcao(`Falha ao subir "${f.name}".`); continue }
        const url = supabase.storage.from('anexos').getPublicUrl(`${pasta}/${nomeArq}`).data.publicUrl
        await acao({ acao: 'anexar', url, nome: f.name || 'print.png' })
      }
    } finally {
      setAnexando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const poster = (endpoint: string) => async (payload: Record<string, unknown>, aposOk?: () => void) => {
    setErroAcao('')
    setAgindo(true)
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json()
      if (!res.ok) { setErroAcao(json.error || 'Falha na ação'); return }
      aposOk?.()
      await carregar(true)
      onMudou?.()
    } catch {
      setErroAcao('Falha de conexão')
    } finally {
      setAgindo(false)
    }
  }
  const acao = poster(`/api/tickets/${id}/acoes`)
  const acaoCompras = poster(`/api/tickets/${id}/compras`)
  const acaoTrabalho = poster('/api/trabalho/cronograma')

  if (carregando) {
    return <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando ticket...</div>
  }
  if (erro || !ticket) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 14 }}>{erro || 'Ticket não encontrado'}</div>
        <button onClick={() => (onFechar ? onFechar() : router.push('/tickets'))} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-secondary,#555)' }}>
          Voltar aos tickets
        </button>
      </div>
    )
  }

  const dias = diasParado(ticket.ultima_atividade_em)
  const vencido = prazoVencido(ticket.prazo, ticket.status)
  const proximosStatus = statusDisponiveis(ticket.status, souResponsavel, souSolicitante, isAdmin)
  // Em quadro, quem enxerga o quadro também comenta (entra como participante).
  const podeComentar = !encerrado && (souResponsavel || souSolicitante || souParticipante || isAdmin || ticket.visibilidade === 'publico' || !!quadro)
  const podeTransferir = !ehSC && !encerrado && (souResponsavel || souSolicitante || isAdmin)
  const podeCutucar = !encerrado && !souResponsavel && (souSolicitante || souParticipante || isAdmin)
  const podeEditar = !encerrado && (souResponsavel || souSolicitante || isAdmin)
  // Em quadro quem manda é a visibilidade do quadro — o botão some.
  // Quem pediu ou quem recebeu decide se fica privado ou compartilhado (com o bloco).
  const podeVisibilidade = souSolicitante || souResponsavel || isAdmin
  const podeMoverQuadro = !ehSC && (souSolicitante || souResponsavel || isAdmin)
  const colunaAtual = quadro ? (quadro.colunas.find((c) => c.id === ticket.quadro_coluna_id)?.id ?? quadro.colunas[0]?.id ?? '') : ''

  const cartao: React.CSSProperties = {
    background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)',
    borderRadius: 12, padding: 16,
  }
  const botaoAcao = (destaque?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8,
    fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
    border: destaque ? 'none' : '1px solid var(--portal-border,#e5e7eb)',
    background: destaque ? '#059669' : 'var(--portal-surface,#fff)',
    color: destaque ? '#fff' : 'var(--portal-text-secondary,#555)',
    opacity: agindo ? .6 : 1,
  })

  return (
    <div style={{ padding: onFechar ? 0 : isMobile ? '14px 12px' : 20, maxWidth: 1100, margin: '0 auto' }}>
      {/* Topo: em que pé está + com quem está a bola */}
      {onFechar ? (
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 10 }}>
          <a href={`/tickets/${id}`} target="_blank" rel="noopener" title="Abrir em página própria"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 600, textDecoration: 'none', border: '1px solid var(--portal-border,#e5e7eb)', color: 'var(--portal-text-muted,#888)' }}>
            <ExternalLink size={13} /> Abrir em página
          </a>
          <button onClick={onFechar} aria-label="Fechar"
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 10px', borderRadius: 8, fontSize: 12.5, fontWeight: 700, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#555)' }}>
            <X size={14} /> Fechar
          </button>
        </div>
      ) : (
      <button onClick={() => router.push(ehSC ? '/tickets/compras' : '/tickets')}
        style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-muted,#888)' }}>
        <ArrowLeft size={15} /> {ehSC ? 'Solicitações de Compras' : 'Tickets'}
      </button>
      )}

      <div style={{ ...cartao, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)', marginBottom: 4 }}>
              {ehSC ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ShoppingCart size={11} /> SC #{ticket.numero}</span> : <>TICKET #{ticket.numero}</>}
              {quadro
                ? <a href={`/tickets/quadros/${quadro.id}`} style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4, color: 'inherit', textDecoration: 'none' }} title="Abrir o bloco">
                    <span style={{ width: 8, height: 8, borderRadius: 2, background: quadro.cor }} /> <LayoutGrid size={11} /> {quadro.nome}
                  </a>
                : null}
              {ticket.visibilidade === 'privado'
                ? <span style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Lock size={11} /> privado</span>
                : <span style={{ marginLeft: 10, display: 'inline-flex', alignItems: 'center', gap: 4 }}><Globe size={11} /> {quadro ? 'compartilhado com o bloco' : 'visível a todos'}</span>}
            </div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text,#111)', margin: 0 }}>{ticket.titulo}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 8, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <UserIcon size={13} /> Bola com <strong>{nome(ticket.responsavel_id)}</strong>
              </span>
              <span>pedido por <strong>{nome(ticket.solicitante_id)}</strong></span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: dias >= 5 ? '#dc2626' : undefined, fontWeight: dias >= 5 ? 700 : undefined }}>
                <Clock size={13} /> {dias === 0 ? 'movimentado hoje' : `${dias} dia${dias > 1 ? 's' : ''} sem movimento`}
              </span>
            </div>
          </div>
          {scInfo
            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 11px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: scInfo.cor, background: scInfo.fundo, whiteSpace: 'nowrap' }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: scInfo.cor }} /> {scInfo.label}
              </span>
            : <StatusBadge status={ticket.status} tamanho={13} />}
        </div>

        {/* Ações */}
        {ehSC && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--portal-border,#f0f0f0)' }}>
            <PainelCompras ticket={ticket} uid={uid} isAdmin={isAdmin} agindo={agindo} onAcao={acaoCompras} />
          </div>
        )}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: ehSC ? 12 : 14, paddingTop: ehSC ? 0 : 14, borderTop: ehSC ? 'none' : '1px solid var(--portal-border,#f0f0f0)' }}>
          {!ehSC && proximosStatus.map((s) => {
            const cfg = ROTULO_STATUS_ACAO[s]
            if (!cfg) return null
            const rotulo = s === 'em_andamento' && ticket.status === 'resolvido' && souSolicitante && !souResponsavel
              ? 'Contestar (reabrir)' : cfg.rotulo
            return (
              <button key={s} disabled={agindo} style={botaoAcao(cfg.destaque)}
                onClick={() => {
                  if (s === 'cancelado' && !window.confirm('Cancelar este ticket? Essa ação encerra a demanda.')) return
                  acao({ acao: 'status', para: s })
                }}>
                {cfg.icone} {rotulo}
              </button>
            )
          })}
          {podeTransferir && (
            <button disabled={agindo} style={botaoAcao()} onClick={() => { setNovoResponsavel(''); setModalTransferir(true) }}>
              <ArrowRightLeft size={14} /> Transferir
            </button>
          )}
          {podeCutucar && (
            <button disabled={agindo} style={botaoAcao()}
              onClick={() => acao({ acao: 'pedir_atualizacao' })}
              title="Registra a cobrança na timeline (visível a todos) e notifica o responsável">
              <BellRing size={14} /> Pedir atualização
            </button>
          )}
          {podeVisibilidade && (
            <button disabled={agindo} style={botaoAcao()}
              onClick={() => acao({ acao: 'visibilidade', para: ticket.visibilidade === 'privado' ? 'publico' : 'privado' })}>
              {ticket.visibilidade === 'privado' ? <><Globe size={14} /> {quadro ? 'Compartilhar com o bloco' : 'Tornar visível'}</> : <><Lock size={14} /> Tornar privado</>}
            </button>
          )}
          {quadro && quadro.colunas.length > 0 && (
            <label style={{ ...botaoAcao(), cursor: 'default' }} title="Coluna do quadro (não muda o status)">
              <LayoutGrid size={14} />
              <select value={colunaAtual} disabled={agindo} aria-label="Coluna do quadro"
                onChange={(e) => acao({ acao: 'coluna', coluna_id: e.target.value })}
                style={{ border: 'none', background: 'transparent', fontSize: 12.5, fontWeight: 700, color: 'inherit', cursor: 'pointer', outline: 'none' }}>
                {quadro.colunas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            </label>
          )}
          {podeMoverQuadro && (
            <button disabled={agindo} style={botaoAcao()} onClick={abrirModalQuadro}>
              <LayoutGrid size={14} /> {quadro ? 'Trocar de bloco' : 'Pôr num bloco'}
            </button>
          )}
        </div>
        {!ehSC && <TarefasDoTicket ticketId={ticket.id} responsavelId={ticket.responsavel_id} encerrado={encerrado} onMudou={() => { carregar(true); onMudou?.() }} />}

        {erroAcao && (
          <div style={{ marginTop: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
            {erroAcao}
          </div>
        )}

        {/* Cronograma (Central de Trabalho): etapa ligada ou "Planejar" */}
        {(etapa || projetoQuadro) && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--portal-border,#f0f0f0)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
            <GanttChart size={15} color="#0369a1" />
            {etapa ? (
              <>
                <span>
                  Etapa <strong>{etapa.nome}</strong> do cronograma <strong>{etapa.projeto_nome}</strong>
                  {etapa.inicio && etapa.fim && <> · previsto {fmtData(etapa.inicio)} a {fmtData(etapa.fim)}</>}
                  {etapa.status === 'concluida' && <> · <span style={{ color: '#059669', fontWeight: 700 }}>concluída</span></>}
                  {etapa.critica && etapa.status !== 'concluida' && <> · <span style={{ color: '#dc2626', fontWeight: 700 }}>caminho crítico</span></>}
                  {etapa.fim && ticket.prazo && etapa.status !== 'concluida' && etapa.fim > ticket.prazo && <> · <span style={{ color: '#d97706', fontWeight: 700 }}>previsão passou do prazo</span></>}
                </span>
                <a href={`/cronograma/${etapa.projeto_id}`} style={{ marginLeft: 'auto', fontWeight: 700, color: '#0369a1', textDecoration: 'none' }}>Ver no cronograma</a>
              </>
            ) : planejando ? (
              <>
                <span>Planejar em <strong>{projetoQuadro!.nome}</strong>:</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>duração
                  <input id="plan-dur" type="number" min={1} max={365} value={planDur} onChange={(e) => setPlanDur(Number(e.target.value) || 1)} style={{ width: 60, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} /> dias
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>a partir de
                  <input id="plan-ini" type="date" value={planIni} onChange={(e) => setPlanIni(e.target.value)} style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} />
                </label>
                <button disabled={agindo} style={botaoAcao(true)} onClick={() => acaoTrabalho({ acao: 'planejar', ticket_id: ticket.id, duracao: planDur, inicio: planIni || null }, () => setPlanejando(false))}>Planejar</button>
                <button disabled={agindo} style={botaoAcao()} onClick={() => setPlanejando(false)}>Cancelar</button>
              </>
            ) : (
              <>
                <span>Este ticket ainda não está no cronograma <strong>{projetoQuadro!.nome}</strong>.</span>
                {(souSolicitante || souResponsavel || isAdmin) && (
                  <button disabled={agindo} style={{ ...botaoAcao(), marginLeft: 'auto' }} onClick={() => setPlanejando(true)}>
                    <GanttChart size={14} /> Planejar no cronograma
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 300px', gap: 16, alignItems: 'start' }}>
        {/* Timeline */}
        <div style={cartao}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text-secondary,#555)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: .4 }}>
            Linha do tempo
          </div>

          {/* Origem imutável */}
          <div style={{ padding: 12, borderRadius: 10, background: 'var(--portal-bg,#f9fafb)', border: '1px solid var(--portal-border,#eee)', marginBottom: 14 }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-muted,#999)', marginBottom: 4 }}>
              PEDIDO ORIGINAL — {nome(ticket.solicitante_id)}, {new Date(ticket.created_at).toLocaleString('pt-BR')}
            </div>
            <div style={{ fontSize: 13.5, color: 'var(--portal-text,#111)', whiteSpace: 'pre-wrap' }}>{ticket.descricao}</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {eventos.map((e) => {
              const ehComentario = e.tipo === 'comentario'
              const ehCobranca = e.tipo === 'pedido_atualizacao'
              let texto: React.ReactNode = null
              if (e.tipo === 'criacao') texto = <>abriu o ticket e passou a bola para <strong>{nome(String(e.payload.responsavel_id || ''))}</strong></>
              else if (e.tipo === 'status') {
                const de = STATUS_INFO[e.payload.de as TicketStatus]?.label || String(e.payload.de)
                const para = STATUS_INFO[e.payload.para as TicketStatus]?.label || String(e.payload.para)
                texto = <>mudou o status: {de} → <strong>{para}</strong>{e.payload.motivo ? <> — {String(e.payload.motivo)}</> : null}</>
              }
              else if (e.tipo === 'transferencia') texto = <>transferiu de <strong>{nome(String(e.payload.de || ''))}</strong> para <strong>{nome(String(e.payload.para || ''))}</strong></>
              else if (e.tipo === 'participante_adicionado') texto = e.payload.auto
                ? <>entrou na conversa</>
                : <>adicionou <strong>{nome(String(e.payload.user_id || ''))}</strong> como participante</>
              else if (e.tipo === 'participante_removido') texto = <>removeu <strong>{nome(String(e.payload.user_id || ''))}</strong> dos participantes</>
              else if (e.tipo === 'pedido_atualizacao') texto = <>pediu atualização{e.payload.texto ? <>: {String(e.payload.texto)}</> : null}</>
              else if (e.tipo === 'edicao') {
                if (e.payload.campo === 'visibilidade') texto = <>tornou o ticket <strong>{e.payload.para === 'publico' ? 'compartilhado' : 'privado'}</strong></>
                else if (e.payload.campo === 'quadro') texto = e.payload.para
                  ? <>colocou o ticket no bloco <strong>{String(e.payload.para)}</strong></>
                  : <>tirou o ticket do bloco{e.payload.de ? <> <strong>{String(e.payload.de)}</strong></> : null}</>
                else if (e.payload.campo === 'tarefa') texto = <>{e.payload.acao === 'criada' ? 'criou a tarefa' : e.payload.acao === 'feita' ? 'concluiu a tarefa' : e.payload.acao === 'removida' ? 'removeu a tarefa' : 'reabriu a tarefa'} <strong>{String(e.payload.titulo || '')}</strong></>
                else if (e.payload.campo === 'cronograma') texto = <>colocou o ticket no <strong>cronograma</strong></>
                else if (e.payload.campo === 'coluna') texto = <>moveu o cartão{e.payload.de ? <> de {String(e.payload.de)}</> : null} para <strong>{String(e.payload.para)}</strong></>
                else {
                  const campos = Object.keys((e.payload.mudancas as Record<string, unknown>) || {})
                  texto = <>editou {campos.map((c) => c === 'terceiro_envolvido' ? 'terceiro' : c).join(', ')}</>
                }
              }
              else if (e.tipo === 'vinculo_adicionado' || e.tipo === 'vinculo_removido') {
                const ref = String(e.payload.vinculo_ref || '')
                const label = String(e.payload.label || `#${ref}`)
                texto = (
                  <>
                    {e.tipo === 'vinculo_adicionado' ? 'vinculou' : 'desvinculou'} a requisição{' '}
                    <a href={`/requisicoes?req=${encodeURIComponent(ref)}`} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, color: 'inherit' }}>{label}</a>
                  </>
                )
              }
              // --- eventos da SC (o livro de decisões) ---
              else if (e.tipo === 'sc_criada') texto = e.payload.reenvio
                ? <>reenviou a solicitação à Diretoria</>
                : <>abriu a solicitação de compras — <strong>{String(e.payload.quantidade_solicitada ?? '')}× {String(e.payload.produto || '')}</strong>{e.payload.cliente_destino ? <> p/ {String(e.payload.cliente_destino)}</> : e.payload.destino === 'estoque' ? <> p/ estoque</> : null}</>
              else if (e.tipo === 'qtd_alterada') texto = e.payload.devolvido
                ? <>devolveu ao vendedor{e.payload.justificativa ? <> — {String(e.payload.justificativa)}</> : null}</>
                : <>definiu a quantidade: {String(e.payload.de ?? '?')} → <strong>{String(e.payload.para ?? '')}</strong>{e.payload.justificativa ? <> — {String(e.payload.justificativa)}</> : null}</>
              else if (e.tipo === 'parecer_financeiro') {
                if (e.payload.devolucao) texto = <>devolveu ao Financeiro{e.payload.texto ? <> — {String(e.payload.texto)}</> : null}</>
                else {
                  const d = String(e.payload.decisao || '')
                  const rot = d === 'reprovado' ? 'reprovou' : d === 'ressalva' ? 'aprovou com ressalva' : 'aprovou'
                  texto = <>{rot} (parecer){e.payload.texto ? <>: {String(e.payload.texto)}</> : null}{e.payload.prazo_compromisso ? <> · compromisso até {new Date(String(e.payload.prazo_compromisso) + 'T12:00:00').toLocaleDateString('pt-BR')}</> : null}</>
                }
              }
              else if (e.tipo === 'pc_emitido') texto = <>emitiu o Pedido de Compra <strong>{String(e.payload.pedido_omie_numero || '')}</strong>{e.payload.condicoes ? <> — {String(e.payload.condicoes)}</> : null}</>
              else if (e.tipo === 'anexo') {
                const urlAnexo = typeof e.payload.url === 'string' ? e.payload.url : ''
                const ehImagem = /\.(png|jpe?g|gif|webp)(\?|$)/i.test(urlAnexo)
                const nomeAnexo = String(e.payload.nome || 'um arquivo')
                // Chip com clipe + sublinhado + ícone de "abre em nova aba": deixa
                // claro que o anexo é clicável (antes era só texto em negrito).
                texto = (
                  <>
                    anexou{' '}
                    {urlAnexo
                      ? (
                        <a href={urlAnexo} target="_blank" rel="noopener noreferrer" className="ticket-anexo-link"
                          title={`Abrir "${nomeAnexo}" em nova aba`}>
                          <Paperclip size={12} />
                          <span style={{ textDecoration: 'underline', textUnderlineOffset: 2 }}>{nomeAnexo}</span>
                          <ExternalLink size={11} style={{ opacity: .75 }} />
                        </a>
                      )
                      : <strong>{nomeAnexo}</strong>}
                    {urlAnexo && ehImagem && (
                      <a href={urlAnexo} target="_blank" rel="noopener noreferrer" className="ticket-anexo-img"
                        title={`Abrir "${nomeAnexo}" em nova aba`}>
                        <img src={urlAnexo} alt={nomeAnexo} style={{ maxWidth: 240, maxHeight: 150, borderRadius: 8, display: 'block' }} />
                        <span className="ticket-anexo-img-rotulo"><ExternalLink size={11} /> Abrir</span>
                      </a>
                    )}
                  </>
                )
              }

              return (
                <div key={e.id} style={{ display: 'flex', gap: 10, padding: '7px 0' }}>
                  <span style={{
                    width: 26, height: 26, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: ehCobranca ? 'rgba(217,119,6,.14)' : 'var(--portal-bg,#f3f4f6)',
                    color: ehCobranca ? '#d97706' : 'var(--portal-text-muted,#888)',
                  }}>
                    {EVENTO_ICONE[e.tipo] || <CircleDot size={14} />}
                  </span>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    {ehComentario ? (
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#999)', marginBottom: 3 }}>
                          <strong style={{ color: 'var(--portal-text-secondary,#555)' }}>{nome(e.autor_id)}</strong> · {new Date(e.created_at).toLocaleString('pt-BR')}
                        </div>
                        <div style={{
                          padding: '9px 12px', borderRadius: 10, fontSize: 13.5, whiteSpace: 'pre-wrap',
                          background: e.autor_id === uid ? 'rgba(220,38,38,.06)' : 'var(--portal-bg,#f9fafb)',
                          border: '1px solid var(--portal-border,#eee)', color: 'var(--portal-text,#111)',
                        }}>
                          {String(e.payload.texto || '')}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 13, color: 'var(--portal-text-secondary,#555)', paddingTop: 4 }}>
                        <strong>{nome(e.autor_id)}</strong> {texto}
                        <span style={{ color: 'var(--portal-text-muted,#aaa)', fontSize: 12 }}> · {new Date(e.created_at).toLocaleString('pt-BR')}</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Comentar */}
          {podeComentar && (
            <div style={{ display: 'flex', gap: 8, marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--portal-border,#f0f0f0)' }}>
              <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                onChange={(e) => anexarArquivos(Array.from(e.target.files || []))} />
              <button
                disabled={agindo || anexando}
                onClick={() => fileRef.current?.click()}
                title="Anexar imagens/prints na timeline (ou cole com Ctrl+V no comentário) — máx 5, 10MB cada"
                style={{
                  alignSelf: 'flex-end', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 38, height: 38, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)',
                  background: 'var(--portal-bg,#fff)', color: 'var(--portal-text-secondary,#555)',
                  cursor: 'pointer', opacity: agindo || anexando ? .5 : 1, flexShrink: 0,
                }}>
                {anexando ? <Clock size={15} /> : <Paperclip size={15} />}
              </button>
              <textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && comentario.trim()) {
                    acao({ acao: 'comentar', texto: comentario.trim() }, () => setComentario(''))
                  }
                }}
                onPaste={(e) => {
                  const imagens = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
                  if (imagens.length > 0) { e.preventDefault(); anexarArquivos(imagens) }
                }}
                rows={2}
                placeholder="Escreva um comentário... (Ctrl+Enter envia · Ctrl+V cola print)"
                style={{
                  flex: 1, padding: '9px 12px', borderRadius: 10, fontSize: 13.5, resize: 'vertical', outline: 'none',
                  border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)',
                }}
              />
              <button
                disabled={agindo || !comentario.trim()}
                onClick={() => acao({ acao: 'comentar', texto: comentario.trim() }, () => setComentario(''))}
                style={{
                  alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px',
                  borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700,
                  fontSize: 13, cursor: 'pointer', opacity: agindo || !comentario.trim() ? .5 : 1,
                }}>
                <Send size={14} /> Enviar
              </button>
            </div>
          )}
          {encerrado && (
            <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--portal-border,#f0f0f0)', fontSize: 13, color: 'var(--portal-text-muted,#999)', textAlign: 'center' }}>
              Ticket encerrado — a timeline fica preservada como registro.
            </div>
          )}
        </div>

        {/* Sidebar — no celular vai pro TOPO (prazo/participantes antes da timeline longa) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, order: isMobile ? -1 : 0 }}>
          {ehSC && (
            <div style={cartao}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .4, marginBottom: 10 }}>
                <ShoppingCart size={13} /> Dados da compra
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7, fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                <span><strong style={{ color: 'var(--portal-text,#111)' }}>{scPayload.produto || '—'}</strong>{scPayload.produto_codigo ? <span style={{ color: 'var(--portal-text-muted,#999)' }}> · {scPayload.produto_codigo}</span> : null}</span>
                <span>Qtd solicitada: <strong>{scPayload.quantidade_solicitada ?? '—'}</strong>{scPayload.quantidade_aprovada != null ? <> · aprovada: <strong>{scPayload.quantidade_aprovada}</strong></> : null}</span>
                {(scPayload.marca || scPayload.modelo) && <span>{[scPayload.marca, scPayload.modelo].filter(Boolean).join(' · ')}</span>}
                {scPayload.preco_alvo != null && <span>Custo-alvo de compra: {Number(scPayload.preco_alvo).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>}
                {scPayload.preco_venda_previsto != null && <span>Venda prevista: {Number(scPayload.preco_venda_previsto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>}
                {scMargem && (
                  <span style={{ color: scMargem.valor < 0 ? '#dc2626' : undefined, fontWeight: scMargem.valor < 0 ? 700 : undefined }}>
                    Margem prevista: {scMargem.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}{scMargem.pct != null ? ` (${scMargem.pct.toFixed(1).replace('.', ',')}%)` : ''}
                  </span>
                )}
                {scPayload.valor_unitario != null && <span>Valor unitário: {Number(scPayload.valor_unitario).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>}
                {scPayload.valor_total != null && <span>Total: <strong>{Number(scPayload.valor_total).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong></span>}
                {scPayload.destino === 'estoque' && <span>Destino: <strong>compra para estoque</strong></span>}
                {scPayload.cliente_destino && <span>Cliente: {scPayload.cliente_destino}</span>}
                {scPayload.confianca && SC_CONFIANCA_INFO[scPayload.confianca] && (
                  <span>Confiança na venda:{' '}
                    <span title={SC_CONFIANCA_INFO[scPayload.confianca].dica} style={{ padding: '1px 9px', borderRadius: 999, fontWeight: 700, color: SC_CONFIANCA_INFO[scPayload.confianca].cor, background: SC_CONFIANCA_INFO[scPayload.confianca].fundo }}>
                      {SC_CONFIANCA_INFO[scPayload.confianca].label}
                    </span>
                  </span>
                )}
                {scPayload.pv_numero && <span>Pedido de venda: {scPayload.pv_numero}</span>}
                {scPayload.pedido_omie_numero && <span>Pedido de compra: <strong>{scPayload.pedido_omie_numero}</strong></span>}
                {scPayload.prazo_compromisso && <span>Compromisso até {new Date(scPayload.prazo_compromisso + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                {scPayload.bloqueio && (
                  <span style={{ display: 'flex', alignItems: 'flex-start', gap: 5, marginTop: 2, color: '#b45309', fontWeight: 600 }}>
                    <Package size={13} style={{ flexShrink: 0, marginTop: 2 }} /> Sinalizada: {scPayload.bloqueio.motivo}
                  </span>
                )}
              </div>
            </div>
          )}
          <div style={cartao}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .4 }}>Detalhes</span>
              {podeEditar && !editando && (
                <button onClick={() => {
                  setEditPrazo(ticket.prazo || ''); setEditCategoria(ticket.categoria); setEditTerceiro(ticket.terceiro_envolvido); setEditando(true)
                }} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#999)', display: 'flex' }} title="Editar prazo, categoria e terceiro">
                  <PenLine size={14} />
                </button>
              )}
            </div>
            {!editando ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <CalendarDays size={13} style={{ opacity: .6 }} />
                  {ticket.prazo
                    ? <span style={{ color: vencido ? '#dc2626' : undefined, fontWeight: vencido ? 700 : undefined }}>
                        Prazo: {new Date(ticket.prazo + 'T12:00:00').toLocaleDateString('pt-BR')}{vencido ? ' (vencido)' : ''}
                      </span>
                    : 'Sem prazo definido'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Tag size={13} style={{ opacity: .6 }} /> {ticket.categoria || 'Sem categoria'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Building2 size={13} style={{ opacity: .6 }} /> {ticket.terceiro_envolvido || 'Sem terceiro envolvido'}
                </span>
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#aaa)' }}>
                  Criado em {new Date(ticket.created_at).toLocaleString('pt-BR')}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input type="date" value={editPrazo} onChange={(e) => setEditPrazo(e.target.value)}
                  style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} />
                <input value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} placeholder="Categoria"
                  style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} />
                <input value={editTerceiro} onChange={(e) => setEditTerceiro(e.target.value)} placeholder="Terceiro envolvido"
                  style={{ padding: '7px 10px', borderRadius: 8, fontSize: 13, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={agindo}
                    onClick={() => acao({ acao: 'editar', prazo: editPrazo || null, categoria: editCategoria, terceiro_envolvido: editTerceiro }, () => setEditando(false))}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                    Salvar
                  </button>
                  <button onClick={() => setEditando(false)}
                    style={{ flex: 1, padding: '7px 0', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', fontSize: 12.5, cursor: 'pointer', color: 'var(--portal-text-secondary,#555)' }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Requisições vinculadas (+ mapa de cotações) */}
          <CardVinculos
            vinculos={vinculos}
            cartao={cartao}
            agindo={agindo}
            podeEditar={!encerrado && (souResponsavel || souSolicitante || souParticipante || isAdmin)}
            onVincular={(r) => acao({ acao: 'vincular', vinculo_tipo: 'requisicao', vinculo_ref: String(r.id) })}
            onDesvincular={(v) => {
              if (window.confirm(`Desvincular a requisição ${v.vinculo_label || '#' + v.vinculo_ref} deste ticket?`)) {
                acao({ acao: 'desvincular', vinculo_id: v.id })
              }
            }}
          />

          {/* Participantes */}
          <div style={cartao}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--portal-text-secondary,#555)', textTransform: 'uppercase', letterSpacing: .4 }}>
                <Users size={13} /> Participantes
              </span>
              {!encerrado && (souResponsavel || souSolicitante || souParticipante || isAdmin) && (
                <button onClick={() => setAddParticipante((v) => !v)} title="Adicionar participante"
                  style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#999)', display: 'flex' }}>
                  <Plus size={15} />
                </button>
              )}
            </div>
            {addParticipante && (
              <div style={{ marginBottom: 10 }}>
                <UserSelect
                  value={novoParticipante}
                  onChange={(userId) => {
                    setNovoParticipante('')
                    setAddParticipante(false)
                    acao({ acao: 'participante_add', user_id: userId })
                  }}
                  excluir={[ticket.solicitante_id, ticket.responsavel_id, ...participantesAtivos.map((p) => p.user_id)]}
                  placeholder="Adicionar pessoa..."
                />
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {participantesAtivos.map((p) => {
                const papel = p.user_id === ticket.responsavel_id ? 'responsável'
                  : p.user_id === ticket.solicitante_id ? 'solicitante' : ''
                const podeRemover = !papel && (p.user_id === uid || souSolicitante || isAdmin)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--portal-text,#111)' }}>
                    <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--portal-bg,#f3f4f6)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <UserIcon size={12} style={{ opacity: .6 }} />
                    </span>
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nome(p.user_id)}
                      {papel && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: papel === 'responsável' ? '#dc2626' : 'var(--portal-text-muted,#999)' }}>{papel}</span>}
                    </span>
                    {podeRemover && (
                      <button
                        onClick={() => {
                          const proprio = p.user_id === uid
                          if (window.confirm(proprio ? 'Sair deste ticket? Você deixará de acompanhar as atualizações.' : `Remover ${nome(p.user_id)} do ticket?`)) {
                            acao({ acao: 'participante_remover', user_id: p.user_id })
                          }
                        }}
                        title={p.user_id === uid ? 'Sair do ticket' : 'Remover participante'}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#bbb)', display: 'flex' }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Modal transferência (ADR-003: direta, sem aceite, com evento visível) */}
      {modalTransferir && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModalTransferir(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: 'var(--portal-text,#111)' }}>
              <ArrowRightLeft size={16} color="#dc2626" /> Transferir responsabilidade
            </h3>
            <p style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', margin: '0 0 14px' }}>
              A transferência é direta (sem aceite). {nome(ticket.responsavel_id)} continua como participante e não perde a visibilidade.
            </p>
            <UserSelect value={novoResponsavel} onChange={setNovoResponsavel}
              excluir={[ticket.responsavel_id]} placeholder="Novo responsável..." />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button onClick={() => setModalTransferir(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                Cancelar
              </button>
              <button disabled={!novoResponsavel || agindo}
                onClick={() => acao({ acao: 'transferir', para: novoResponsavel }, () => setModalTransferir(false))}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !novoResponsavel || agindo ? .5 : 1 }}>
                Transferir
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Escolher quadro (sql/tickets-quadros.sql) */}
      {modalQuadro && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModalQuadro(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: 'var(--portal-text,#111)' }}>
              <LayoutGrid size={16} color="#dc2626" /> {quadro ? 'Trocar de bloco' : 'Pôr num bloco'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', margin: '0 0 14px' }}>
              O ticket entra na primeira coluna. O status não muda.
            </p>
            {opcoesQuadro === null ? (
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Carregando blocos...</div>
            ) : opcoesQuadro.filter((q) => q.id !== quadro?.id).length === 0 ? (
              <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>Você não tem outro bloco. Crie um na página Quadros.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {opcoesQuadro.filter((q) => q.id !== quadro?.id).map((q) => (
                  <button key={q.id} disabled={agindo}
                    onClick={() => acao({ acao: 'quadro', quadro_id: q.id }, () => setModalQuadro(false))}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 600, textAlign: 'left', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)' }}>
                    <span style={{ width: 12, height: 12, borderRadius: 3, background: q.cor, flexShrink: 0 }} /> {q.nome}
                  </button>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
              {quadro ? (
                <button disabled={agindo} onClick={() => {
                  if (window.confirm('Tirar este ticket do bloco?')) acao({ acao: 'quadro', quadro_id: null }, () => setModalQuadro(false))
                }}
                  style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
                  Tirar do bloco
                </button>
              ) : <span />}
              <button onClick={() => setModalQuadro(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
