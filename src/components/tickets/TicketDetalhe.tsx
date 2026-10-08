'use client'
// Detalhe do ticket. Organizado para responder de cara, nesta ordem:
//   1. O QUE É e EM QUE PÉ ESTÁ — título, situação, quem faz, quem pediu, prazo.
//   2. O PRÓXIMO PASSO — botões de situação (o principal em verde).
//   3. O PEDIDO, as TAREFAS e a CONVERSA (coluna larga).
//   4. Bloco, detalhes, pessoas e requisições (coluna lateral).
// Usado como PÁGINA (/tickets/[id], links de notificação) e como JANELA
// (clique no cartão: TicketModal) — com onFechar, vira janela.
//
// Agilidade: reabrir mostra na hora o que já foi carregado (cache em memória)
// e atualiza por trás; comentário e mudança de situação aparecem antes da
// resposta do servidor (voltam atrás se der erro); recargas em sequência
// (ação + realtime + foco) viram uma só.
import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Send, Users, CalendarDays, Tag, Building2, Lock, Globe,
  ArrowRightLeft, BellRing, Plus, X, MessageSquare, CircleDot, PenLine, Paperclip,
  CheckCircle2, RotateCcw, Ban, Clock, Link2, Unlink, ShoppingCart, Package, ExternalLink, LayoutGrid, GanttChart,
  Infinity as InfinityIcon, History,
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
import SeletorDataAgenda from '@/components/trabalho/SeletorDataAgenda'
import { fimDeSemana } from '@/lib/trabalho/agenda'

const fmtData = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("pt-BR")
const fmtQuando = (d: string) => new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

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

// O que conta como "conversa" (o resto é histórico de mudanças).
const TIPOS_CONVERSA = new Set(['comentario', 'anexo', 'pedido_atualizacao'])

const ROTULO_STATUS_ACAO: Partial<Record<TicketStatus, { rotulo: string; icone: React.ReactNode; destaque?: boolean }>> = {
  aberto: { rotulo: 'Voltar para aberto', icone: <RotateCcw size={15} /> },
  em_andamento: { rotulo: 'Em andamento', icone: <RotateCcw size={15} /> },
  aguardando_terceiro: { rotulo: 'Aguardando terceiro', icone: <Clock size={15} /> },
  aguardando_interno: { rotulo: 'Aguardando interno', icone: <Clock size={15} /> },
  resolvido: { rotulo: 'Marcar resolvido', icone: <CheckCircle2 size={15} />, destaque: true },
  fechado: { rotulo: 'Confirmar e fechar', icone: <CheckCircle2 size={15} />, destaque: true },
  cancelado: { rotulo: 'Cancelar ticket', icone: <Ban size={15} /> },
}

interface Dados {
  ticket: Ticket
  eventos: TicketEvento[]
  participantes: TicketParticipante[]
  usuarios: Record<string, UsuarioMin>
  vinculos: TicketVinculoEnriquecido[]
  quadro: { id: string; nome: string; cor: string; colunas: { id: string; nome: string }[] } | null
  etapa: { projeto_id: string; projeto_nome: string; nome: string; inicio: string | null; fim: string | null; critica: boolean; status: string } | null
  projetoQuadro: { id: string; nome: string } | null
}

// Último carregamento de cada ticket: reabrir a janela é instantâneo.
const cache = new Map<string, Dados>()

interface Props {
  id: string
  /** Modo janela: troca o "voltar" por fechar. */
  onFechar?: () => void
  /** Avisa quem abriu a janela que o ticket mudou (para recarregar a lista). */
  onMudou?: () => void
}

function Avatar({ u, tamanho = 28 }: { u?: UsuarioMin; tamanho?: number }) {
  const ini = (u?.nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase()
  if (u?.avatar_url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={u.avatar_url} alt="" style={{ width: tamanho, height: tamanho, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
  }
  return (
    <span style={{ width: tamanho, height: tamanho, borderRadius: '50%', flexShrink: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: tamanho * .38, fontWeight: 800, background: 'rgba(220,38,38,.1)', color: '#b91c1c' }}>{ini}</span>
  )
}

export default function TicketDetalhe({ id, onFechar, onMudou }: Props) {
  const router = useRouter()
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const isMobile = useIsMobile()

  const inicial = cache.get(id) || null
  const [dados, setDados] = useState<Dados | null>(inicial)
  const [carregando, setCarregando] = useState(!inicial)
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
  const [editTitulo, setEditTitulo] = useState('')
  const [editInicio, setEditInicio] = useState('')
  const [editDias, setEditDias] = useState('')
  const [editHoras, setEditHoras] = useState('')
  const [modalQuadro, setModalQuadro] = useState(false)
  const [opcoesQuadro, setOpcoesQuadro] = useState<{ id: string; nome: string; cor: string }[] | null>(null)
  const [planejando, setPlanejando] = useState(false)
  const [planDur, setPlanDur] = useState(2)
  const [planIni, setPlanIni] = useState('')
  // Linha do tempo: só a conversa (padrão) ou tudo, lembrado no navegador.
  const [verTudo, setVerTudo] = useState(false)
  useEffect(() => {
    try { setVerTudo(localStorage.getItem('ticket-timeline-tudo') === '1') } catch { /* sem storage */ }
  }, [])
  const trocarVerTudo = (v: boolean) => { setVerTudo(v); try { localStorage.setItem('ticket-timeline-tudo', v ? '1' : '0') } catch { /* sem storage */ } }

  const ticket = dados?.ticket ?? null
  const eventos = useMemo(() => dados?.eventos ?? [], [dados])
  const participantes = useMemo(() => dados?.participantes ?? [], [dados])
  const usuarios = useMemo(() => dados?.usuarios ?? {}, [dados])
  const vinculos = dados?.vinculos ?? []
  const quadro = dados?.quadro ?? null
  const etapa = dados?.etapa ?? null
  const projetoQuadro = dados?.projetoQuadro ?? null

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

  const ultimaCarga = useRef(0)
  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const res = await fetch(`/api/tickets/${id}`, { headers: await authHeaders() })
      const json = await res.json()
      if (!res.ok) {
        // Recarga por trás que falha não derruba a tela já carregada (nem o comentário digitado).
        if (silencioso && cache.get(id)) setErroAcao(json.error || 'Não deu para atualizar agora — tente de novo.')
        else setErro(json.error || 'Falha ao carregar')
        return
      }
      const novo: Dados = {
        ticket: json.ticket, eventos: json.eventos || [], participantes: json.participantes || [],
        usuarios: json.usuarios || {}, vinculos: json.vinculos || [], quadro: json.quadro || null,
        etapa: json.etapa || null, projetoQuadro: json.projetoQuadro || null,
      }
      cache.set(id, novo)
      setDados(novo)
      setErro('')
      ultimaCarga.current = Date.now()
    } catch {
      if (!silencioso) setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [id])

  // Várias recargas pedidas juntas (ação + realtime + foco) viram uma só.
  const tmrRecarga = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recarregarLogo = useCallback((minimoMs = 0) => {
    if (Date.now() - ultimaCarga.current < minimoMs) return
    if (tmrRecarga.current) clearTimeout(tmrRecarga.current)
    tmrRecarga.current = setTimeout(() => carregar(true), 250)
  }, [carregar])

  useEffect(() => { if (userProfile) carregar(!!cache.get(id)) }, [carregar, userProfile, id])

  // Timeline ao vivo: evento novo neste ticket → recarrega (ignora o eco da
  // própria ação, que já recarregou). Foco da janela só se faz tempo.
  useEffect(() => {
    if (!userProfile) return
    const channel = supabase
      .channel(`ticket-${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'tickets_eventos', filter: `ticket_id=eq.${id}` },
        () => recarregarLogo(1200))
      .subscribe()
    const onFocus = () => recarregarLogo(30_000)
    window.addEventListener('focus', onFocus)
    return () => {
      supabase.removeChannel(channel)
      window.removeEventListener('focus', onFocus)
      if (tmrRecarga.current) clearTimeout(tmrRecarga.current)
    }
  }, [id, userProfile, recarregarLogo])

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

  // Mexe nos dados da tela já (otimista) e devolve como desfazer.
  const mexer = (f: (d: Dados) => Dados): (() => void) => {
    const antes = dados
    setDados((d) => (d ? f(d) : d))
    return () => setDados(antes)
  }

  const poster = (endpoint: string) => async (
    payload: Record<string, unknown>,
    aposOk?: () => void,
    opts?: { otimista?: () => () => void; semTravar?: boolean },
  ): Promise<boolean> => {
    setErroAcao('')
    if (!opts?.semTravar) setAgindo(true)
    const desfazer = opts?.otimista?.()
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify(payload),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { desfazer?.(); setErroAcao(json.error || 'Falha na ação'); return false }
      aposOk?.()
      await carregar(true)
      onMudou?.()
      return true
    } catch {
      desfazer?.()
      setErroAcao('Falha de conexão')
      return false
    } finally {
      if (!opts?.semTravar) setAgindo(false)
    }
  }
  const acao = poster(`/api/tickets/${id}/acoes`)
  const acaoCompras = poster(`/api/tickets/${id}/compras`)
  const acaoTrabalho = poster('/api/trabalho/cronograma')

  // Comentário aparece na hora; volta para a caixa se o envio falhar.
  const enviarComentario = async () => {
    const texto = comentario.trim()
    if (!texto || !uid) return
    setComentario('')
    const ok = await acao({ acao: 'comentar', texto }, undefined, {
      semTravar: true,
      otimista: () => mexer((d) => ({
        ...d,
        eventos: [...d.eventos, { id: `tmp-${Date.now()}`, ticket_id: id, autor_id: uid, tipo: 'comentario', payload: { texto }, created_at: new Date().toISOString() } as TicketEvento],
      })),
    })
    if (!ok) setComentario(texto)
  }

  const mudarStatus = (para: TicketStatus) => acao({ acao: 'status', para }, undefined, {
    otimista: () => mexer((d) => ({ ...d, ticket: { ...d.ticket, status: para } })),
  })

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
        await acao({ acao: 'anexar', url, nome: f.name || 'print.png' }, undefined, { semTravar: true })
      }
    } finally {
      setAnexando(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const eventosVisiveis = useMemo(() => verTudo ? eventos : eventos.filter((e) => TIPOS_CONVERSA.has(e.tipo)), [eventos, verTudo])
  const nHistorico = eventos.length - eventos.filter((e) => TIPOS_CONVERSA.has(e.tipo)).length

  if (carregando && !dados) {
    return <Esqueleto janela={!!onFechar} onFechar={onFechar} />
  }
  if (erro || !ticket) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <div style={{ color: '#dc2626', fontWeight: 700, marginBottom: 14 }}>{erro || 'Ticket não encontrado'}</div>
        <button onClick={() => (onFechar ? onFechar() : router.push('/tickets/quadros'))} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid var(--portal-border,#ddd)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-secondary,#555)' }}>
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
  // Quem pediu ou quem recebeu decide se fica privado ou compartilhado (com o bloco).
  const podeVisibilidade = souSolicitante || souResponsavel || isAdmin
  const podeMoverQuadro = !ehSC && (souSolicitante || souResponsavel || isAdmin)
  const podeMexerPessoas = !encerrado && (souResponsavel || souSolicitante || souParticipante || isAdmin)
  // Quem pediu para outra pessoa vê a agenda (Fila) dela: quando o pedido sai.
  const verAgenda = !ehSC && !encerrado && souSolicitante && !souResponsavel
  // Sem bloco o ticket não anda (mesma regra do servidor): quem pediu ainda
  // confirma/contesta o resolvido e todos podem cancelar.
  const semBlocoPode = (s: TicketStatus) => s === 'fechado' || (souSolicitante && ticket.status === 'resolvido')
  const statusBotoes = ehSC ? [] : proximosStatus.filter((s) => s !== 'cancelado' && ROTULO_STATUS_ACAO[s] && (!!quadro || semBlocoPode(s)))
    .sort((a, b) => Number(!!ROTULO_STATUS_ACAO[b]?.destaque) - Number(!!ROTULO_STATUS_ACAO[a]?.destaque))
  const podeCancelar = !ehSC && proximosStatus.includes('cancelado')
  const continuo = !ticket.prazo
  // Planejamento guardado no payload (Fila/Cronograma): 1º dia, dias e horas/dia.
  const plano = (ticket.payload || {}) as { inicio?: string | null; dias?: number; horas_dia?: number }
  const rotuloCampo: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }
  const campoEdit: React.CSSProperties = {
    display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 3, padding: '7px 10px', borderRadius: 8, fontSize: 13,
    border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)',
  }

  const cartao: React.CSSProperties = {
    background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)',
    borderRadius: 12, padding: 16,
  }
  const tituloCartao: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 800, color: 'var(--portal-text-secondary,#555)',
    textTransform: 'uppercase', letterSpacing: .4,
  }
  const botaoAcao = (destaque?: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: destaque ? '9px 16px' : '8px 13px', borderRadius: 9,
    fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: destaque ? 'none' : '1px solid var(--portal-border,#e5e7eb)',
    background: destaque ? '#059669' : 'var(--portal-surface,#fff)',
    color: destaque ? '#fff' : 'var(--portal-text,#333)',
    opacity: agindo ? .6 : 1,
  })
  const botaoMini: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: 'pointer',
    border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#555)',
  }
  const fato = (rotulo: string, conteudo: React.ReactNode, cor?: string) => (
    <div style={{ minWidth: 0, padding: '9px 12px', borderRadius: 10, background: 'var(--portal-bg,#f8f9fa)', border: '1px solid var(--portal-border,#eee)' }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: .5, textTransform: 'uppercase', color: 'var(--portal-text-muted,#999)', marginBottom: 4 }}>{rotulo}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13.5, fontWeight: 700, color: cor || 'var(--portal-text,#111)', minWidth: 0 }}>{conteudo}</div>
    </div>
  )

  return (
    <div style={{ padding: onFechar ? 0 : isMobile ? '14px 12px' : 20, maxWidth: 1100, margin: '0 auto' }}>
      {!onFechar && (
        <button onClick={() => router.push(ehSC ? '/tickets/compras' : '/tickets/quadros')}
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 14, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: 'var(--portal-text-muted,#888)' }}>
          <ArrowLeft size={15} /> {ehSC ? 'Solicitações de Compras' : 'Quadros'}
        </button>
      )}

      {/* ── 1. O que é e em que pé está ── */}
      <div style={{ ...cartao, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
          <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#999)' }}>
            {ehSC ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><ShoppingCart size={11} /> SC #{ticket.numero}</span> : <>#{ticket.numero}</>}
          </span>
          {quadro && (
            <a href={`/tickets/quadros/${quadro.id}`} title="Abrir o bloco"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 999, fontSize: 12, fontWeight: 700, textDecoration: 'none', color: 'var(--portal-text,#111)', background: quadro.cor + '1f', border: `1px solid ${quadro.cor}55` }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: quadro.cor }} /> {quadro.nome}
            </a>
          )}
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--portal-text-muted,#999)' }}>
            {ticket.visibilidade === 'privado' ? <><Lock size={11} /> privado</> : <><Globe size={11} /> {quadro ? 'compartilhado com o bloco' : 'visível a todos'}</>}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            {scInfo
              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 11px', borderRadius: 999, fontSize: 13, fontWeight: 700, color: scInfo.cor, background: scInfo.fundo, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: scInfo.cor }} /> {scInfo.label}
                </span>
              : <StatusBadge status={ticket.status} tamanho={13} />}
            {onFechar && (
              <>
                <a href={`/tickets/${id}`} target="_blank" rel="noopener" title="Abrir em página própria" aria-label="Abrir em página própria"
                  style={{ display: 'flex', padding: isMobile ? 9 : 6, borderRadius: 8, color: 'var(--portal-text-muted,#888)', border: '1px solid var(--portal-border,#e5e7eb)' }}>
                  <ExternalLink size={15} />
                </a>
                <button onClick={onFechar} aria-label="Fechar" title="Fechar (Esc)"
                  style={{ display: 'flex', padding: isMobile ? 9 : 6, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#555)' }}>
                  <X size={15} />
                </button>
              </>
            )}
          </span>
        </div>
        <h1 style={{ fontSize: 21, fontWeight: 800, color: 'var(--portal-text,#111)', margin: '0 0 12px', lineHeight: 1.25 }}>{ticket.titulo}</h1>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {fato('Quem faz', <><Avatar u={usuarios[ticket.responsavel_id]} tamanho={22} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome(ticket.responsavel_id)}</span></>)}
          {fato('Pedido por', <><Avatar u={usuarios[ticket.solicitante_id]} tamanho={22} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome(ticket.solicitante_id)}</span></>)}
          {fato('Prazo',
            continuo
              ? <><InfinityIcon size={15} /> Contínuo (dias úteis)</>
              : <><CalendarDays size={14} /> {fmtData(ticket.prazo!)}{vencido && ' · vencido'}</>,
            vencido ? '#dc2626' : continuo ? '#0369a1' : undefined)}
          {fato('Movimento',
            <><Clock size={14} /> {dias === 0 ? 'hoje' : `${dias} dia${dias > 1 ? 's' : ''} parado`}</>,
            dias >= 5 && !encerrado ? '#dc2626' : undefined)}
        </div>

        {ehSC && (
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--portal-border,#f0f0f0)' }}>
            <PainelCompras ticket={ticket} uid={uid} isAdmin={isAdmin} agindo={agindo} onAcao={acaoCompras} />
          </div>
        )}

        {/* Todo ticket precisa estar num bloco antes de andar */}
        {!ehSC && !quadro && !encerrado && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 12, padding: '10px 12px', borderRadius: 10, background: 'rgba(217,119,6,.1)', color: '#b45309', fontSize: 13, fontWeight: 600 }}>
            <LayoutGrid size={15} />
            <span style={{ flex: 1, minWidth: 200 }}>
              {souResponsavel ? 'Este ticket ainda não está em nenhum bloco. Escolha um para poder trabalhar nele.' : 'Esperando quem recebeu escolher o bloco.'}
            </span>
            {podeMoverQuadro && (
              <button disabled={agindo} onClick={abrirModalQuadro}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', background: '#d97706', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                <LayoutGrid size={14} /> Escolher bloco
              </button>
            )}
          </div>
        )}

        {/* ── 2. Próximo passo ── */}
        {(statusBotoes.length > 0 || podeCutucar || podeCancelar) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--portal-border,#f0f0f0)' }}>
            {statusBotoes.map((s) => {
              const cfg = ROTULO_STATUS_ACAO[s]!
              const voltando = ticket.status === 'resolvido' || encerrado
              const rotulo = s === 'em_andamento' && ticket.status === 'resolvido' && souSolicitante && !souResponsavel
                ? 'Contestar (reabrir)'
                : s === 'em_andamento' ? (encerrado ? 'Reabrir' : ticket.status === 'aberto' ? 'Começar' : 'Voltar para em andamento')
                : s === 'aberto' && encerrado ? 'Reabrir'
                : voltando && s.startsWith('aguardando') ? `Voltar: ${cfg.rotulo.toLowerCase()}` : cfg.rotulo
              return (
                <button key={s} disabled={agindo} style={botaoAcao(cfg.destaque)} onClick={() => mudarStatus(s)}>
                  {cfg.icone} {rotulo}
                </button>
              )
            })}
            {podeCutucar && (
              <button disabled={agindo} style={{ ...botaoAcao(), color: '#b45309', borderColor: 'rgba(217,119,6,.45)' }}
                onClick={() => acao({ acao: 'pedir_atualizacao' })}
                title="Registra a cobrança na conversa (visível a todos) e avisa quem faz">
                <BellRing size={15} /> Pedir atualização
              </button>
            )}
            {podeCancelar && (
              <button disabled={agindo}
                style={{ ...botaoAcao(), marginLeft: 'auto', border: 'none', background: 'transparent', color: '#dc2626', fontWeight: 600 }}
                onClick={() => { if (window.confirm('Cancelar este ticket? Essa ação encerra a demanda.')) mudarStatus('cancelado') }}>
                <Ban size={14} /> Cancelar ticket
              </button>
            )}
          </div>
        )}

        {erroAcao && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, padding: '9px 12px', borderRadius: 8, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
            <span style={{ flex: 1 }}>{erroAcao}</span>
            <button onClick={() => setErroAcao('')} aria-label="Fechar aviso" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={14} /></button>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0, 1fr) 300px', gap: 14, alignItems: 'start' }}>
        {/* ── 3. Pedido · tarefas · conversa ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          <div style={cartao}>
            <div style={{ ...tituloCartao, marginBottom: 8 }}>O que foi pedido</div>
            <div style={{ fontSize: 14, lineHeight: 1.55, color: 'var(--portal-text,#111)', whiteSpace: 'pre-wrap' }}>{ticket.descricao}</div>
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--portal-text-muted,#999)' }}>
              {nome(ticket.solicitante_id)} · {new Date(ticket.created_at).toLocaleString('pt-BR')}
            </div>
          </div>

          {!ehSC && (
            // A caixa verde das tarefas já tem moldura própria (e margem de 14 em cima).
            <div style={{ marginTop: -14 }}>
              <TarefasDoTicket ticketId={ticket.id} responsavelId={ticket.responsavel_id} encerrado={encerrado} onMudou={() => { recarregarLogo(); onMudou?.() }} />
            </div>
          )}

          <div style={cartao}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
              <span style={tituloCartao}>{verTudo ? 'Conversa e histórico' : 'Conversa'}</span>
              <div role="group" aria-label="O que mostrar" style={{ marginLeft: 'auto', display: 'flex', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', overflow: 'hidden' }}>
                {([[false, 'Conversa', <MessageSquare key="c" size={13} />], [true, `Tudo${nHistorico ? ` (+${nHistorico})` : ''}`, <History key="h" size={13} />]] as [boolean, string, React.ReactNode][]).map(([v, rot, ic]) => (
                  <button key={rot} aria-pressed={verTudo === v} onClick={() => trocarVerTudo(v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: isMobile ? '9px 12px' : '5px 10px', border: 'none', fontSize: 12, fontWeight: 700, cursor: 'pointer',
                      background: verTudo === v ? 'rgba(220,38,38,.1)' : 'transparent', color: verTudo === v ? '#dc2626' : 'var(--portal-text-muted,#777)' }}>
                    {ic} {rot}
                  </button>
                ))}
              </div>
            </div>

            {eventosVisiveis.length === 0 ? (
              <div style={{ padding: '14px 0', fontSize: 13, color: 'var(--portal-text-muted,#999)', textAlign: 'center' }}>
                Ninguém escreveu ainda.{!verTudo && nHistorico > 0 && <> <button onClick={() => trocarVerTudo(true)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: '#dc2626', fontWeight: 700, fontSize: 13 }}>Ver o histórico</button></>}
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {eventosVisiveis.map((e) => <LinhaEvento key={e.id} e={e} uid={uid} nome={nome} usuarios={usuarios} />)}
              </div>
            )}

            {/* Comentar */}
            {podeComentar && (
              <div style={{ display: 'flex', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--portal-border,#f0f0f0)' }}>
                <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: 'none' }}
                  onChange={(e) => anexarArquivos(Array.from(e.target.files || []))} />
                <button
                  disabled={anexando}
                  onClick={() => fileRef.current?.click()}
                  title="Anexar imagens/prints (ou cole com Ctrl+V na caixa) — máx 5, 10MB cada"
                  aria-label="Anexar imagem"
                  style={{
                    alignSelf: 'flex-end', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    width: 40, height: 40, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)',
                    background: 'var(--portal-bg,#fff)', color: 'var(--portal-text-secondary,#555)',
                    cursor: 'pointer', opacity: anexando ? .5 : 1, flexShrink: 0,
                  }}>
                  {anexando ? <Clock size={15} /> : <Paperclip size={15} />}
                </button>
                <textarea
                  value={comentario}
                  onChange={(e) => setComentario(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); enviarComentario() } }}
                  onPaste={(e) => {
                    const imagens = Array.from(e.clipboardData?.files || []).filter((f) => f.type.startsWith('image/'))
                    if (imagens.length > 0) { e.preventDefault(); anexarArquivos(imagens) }
                  }}
                  rows={2}
                  placeholder="Escreva aqui... (Ctrl+Enter envia · Ctrl+V cola print)"
                  style={{
                    flex: 1, padding: '10px 12px', borderRadius: 10, fontSize: 14, resize: 'vertical', outline: 'none', minWidth: 0,
                    border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)',
                  }}
                />
                <button
                  disabled={!comentario.trim()}
                  onClick={enviarComentario}
                  style={{
                    alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                    borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 700,
                    fontSize: 13, cursor: 'pointer', opacity: !comentario.trim() ? .5 : 1,
                  }}>
                  <Send size={14} /> Enviar
                </button>
              </div>
            )}
            {encerrado && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--portal-border,#f0f0f0)', fontSize: 13, color: 'var(--portal-text-muted,#999)', textAlign: 'center' }}>
                Ticket encerrado — a conversa fica guardada como registro.
              </div>
            )}
          </div>
        </div>

        {/* ── 4. Lateral: bloco · detalhes · pessoas · requisições ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
          {ehSC && (
            <div style={cartao}>
              <div style={{ ...tituloCartao, marginBottom: 10 }}><ShoppingCart size={13} /> Dados da compra</div>
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

          {/* Bloco e privacidade */}
          {!ehSC && (
            <div style={cartao}>
              <div style={{ ...tituloCartao, marginBottom: 10 }}><LayoutGrid size={13} /> Bloco</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {quadro ? (
                  <a href={`/tickets/quadros/${quadro.id}`} title="Abrir o bloco"
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, fontSize: 13.5, fontWeight: 800, textDecoration: 'none',
                      color: 'var(--portal-text,#111)', background: quadro.cor + '1f', border: `1px solid ${quadro.cor}55` }}>
                    <span style={{ width: 11, height: 11, borderRadius: 3, background: quadro.cor }} /> {quadro.nome}
                  </a>
                ) : <span style={{ fontSize: 13, color: '#b45309', fontWeight: 600 }}>Sem bloco</span>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {podeMoverQuadro && (
                    <button disabled={agindo} style={botaoMini} onClick={abrirModalQuadro}>
                      <LayoutGrid size={12} /> {quadro ? 'Trocar' : 'Escolher'}
                    </button>
                  )}
                  {podeVisibilidade && (
                    <button disabled={agindo} style={botaoMini}
                      onClick={() => acao({ acao: 'visibilidade', para: ticket.visibilidade === 'privado' ? 'publico' : 'privado' })}>
                      {ticket.visibilidade === 'privado' ? <><Globe size={12} /> {quadro ? 'Compartilhar com o bloco' : 'Tornar visível'}</> : <><Lock size={12} /> Tornar privado</>}
                    </button>
                  )}
                </div>
                {/* Cronograma (Central de Trabalho): etapa ligada ou "Planejar" */}
                {(etapa || projetoQuadro) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, paddingTop: 8, borderTop: '1px solid var(--portal-border,#f0f0f0)', fontSize: 12.5, color: 'var(--portal-text-secondary,#555)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontWeight: 700 }}><GanttChart size={13} color="#0369a1" /> Cronograma</span>
                    {etapa ? (
                      <>
                        <span>
                          Etapa <strong>{etapa.nome}</strong> de <strong>{etapa.projeto_nome}</strong>
                          {etapa.inicio && etapa.fim && <> · {fmtData(etapa.inicio)} a {fmtData(etapa.fim)}</>}
                          {etapa.status === 'concluida' && <> · <span style={{ color: '#059669', fontWeight: 700 }}>concluída</span></>}
                          {etapa.critica && etapa.status !== 'concluida' && <> · <span style={{ color: '#dc2626', fontWeight: 700 }}>caminho crítico</span></>}
                          {etapa.fim && ticket.prazo && etapa.status !== 'concluida' && etapa.fim > ticket.prazo && <> · <span style={{ color: '#d97706', fontWeight: 700 }}>previsão passou do prazo</span></>}
                        </span>
                        <a href={`/cronograma/${etapa.projeto_id}`} style={{ fontWeight: 700, color: '#0369a1', textDecoration: 'none' }}>Ver no cronograma</a>
                      </>
                    ) : planejando ? (
                      <>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>duração
                          <input type="number" min={1} max={365} value={planDur} onChange={(e) => setPlanDur(Number(e.target.value) || 1)} style={{ width: 56, padding: '4px 7px', borderRadius: 7, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} /> dias
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 5 }}>a partir de
                          <input type="date" value={planIni} onChange={(e) => setPlanIni(e.target.value)} style={{ padding: '4px 7px', borderRadius: 7, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} />
                        </label>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button disabled={agindo} style={{ ...botaoMini, border: 'none', background: '#059669', color: '#fff' }} onClick={() => acaoTrabalho({ acao: 'planejar', ticket_id: ticket.id, duracao: planDur, inicio: planIni || null }, () => setPlanejando(false))}>Planejar</button>
                          <button disabled={agindo} style={botaoMini} onClick={() => setPlanejando(false)}>Cancelar</button>
                        </div>
                      </>
                    ) : (
                      <>
                        <span>Ainda não está em <strong>{projetoQuadro!.nome}</strong>.</span>
                        {(souSolicitante || souResponsavel || isAdmin) && (
                          <button disabled={agindo} style={{ ...botaoMini, alignSelf: 'flex-start' }} onClick={() => setPlanejando(true)}>
                            <GanttChart size={12} /> Planejar
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Detalhes */}
          <div style={cartao}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={tituloCartao}>Detalhes</span>
              {podeEditar && !editando && (
                <button onClick={() => {
                  setEditPrazo(ticket.prazo || ''); setEditCategoria(ticket.categoria); setEditTerceiro(ticket.terceiro_envolvido)
                  setEditTitulo(ticket.titulo); setEditInicio(plano.inicio || '')
                  setEditDias(plano.dias ? String(plano.dias) : ''); setEditHoras(plano.horas_dia ? String(plano.horas_dia) : '')
                  setEditando(true)
                }} style={botaoMini} title="Editar título, datas, tempo de trabalho, categoria e terceiro">
                  <PenLine size={12} /> Editar
                </button>
              )}
            </div>
            {!editando ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9, fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <CalendarDays size={13} style={{ opacity: .6 }} />
                  {ticket.prazo
                    ? <span style={{ color: vencido ? '#dc2626' : undefined, fontWeight: vencido ? 700 : undefined }}>
                        Prazo {fmtData(ticket.prazo)}{vencido ? ' (vencido)' : ''}
                      </span>
                    : 'Sem prazo — contínuo'}
                </span>
                {plano.inicio && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <CalendarDays size={13} style={{ opacity: .6 }} /> Começa {fmtData(plano.inicio)}
                  </span>
                )}
                {(plano.dias || plano.horas_dia) && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <Clock size={13} style={{ opacity: .6 }} />
                    {[plano.dias && `${plano.dias} dia${plano.dias > 1 ? 's' : ''} de trabalho`, plano.horas_dia && `${String(plano.horas_dia).replace('.', ',')} h/dia`].filter(Boolean).join(' · ')}
                  </span>
                )}
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Tag size={13} style={{ opacity: .6 }} /> {ticket.categoria || 'Sem categoria'}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <Building2 size={13} style={{ opacity: .6 }} /> {ticket.terceiro_envolvido || 'Sem terceiro envolvido'}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={rotuloCampo}>Título
                  <input value={editTitulo} onChange={(e) => setEditTitulo(e.target.value)} style={campoEdit} />
                </label>
                <SeletorDataAgenda diasUteis rotulo="Começa em (opcional)" value={editInicio} onChange={setEditInicio}
                  userId={ticket.responsavel_id} permitirVazio textoVazio="Sem data de início" ignorar={ticket.titulo} />
                <SeletorDataAgenda diasUteis rotulo="Prazo (vazio = contínuo)" value={editPrazo} onChange={setEditPrazo}
                  userId={ticket.responsavel_id} min={editInicio || undefined} permitirVazio textoVazio="Contínuo (sem prazo)" ignorar={ticket.titulo} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <label style={{ ...rotuloCampo, flex: 1 }}>Dias de trabalho
                    <input type="number" min={1} max={120} value={editDias} onChange={(e) => setEditDias(e.target.value)} placeholder="—" style={campoEdit} />
                  </label>
                  <label style={{ ...rotuloCampo, flex: 1 }}>Horas por dia
                    <input type="number" min={0.5} max={12} step={0.5} value={editHoras} onChange={(e) => setEditHoras(e.target.value)} placeholder="—" style={campoEdit} />
                  </label>
                </div>
                <label style={rotuloCampo}>Categoria
                  <input value={editCategoria} onChange={(e) => setEditCategoria(e.target.value)} style={campoEdit} />
                </label>
                <label style={rotuloCampo}>Terceiro envolvido
                  <input value={editTerceiro} onChange={(e) => setEditTerceiro(e.target.value)} style={campoEdit} />
                </label>
                {editInicio && editPrazo && editInicio > editPrazo && (
                  <div style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>O início está depois do prazo.</div>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted,#999)' }}>Quem participa do ticket é avisado do que mudar.</div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button disabled={agindo || !editTitulo.trim() || (!!editInicio && !!editPrazo && editInicio > editPrazo) || (editPrazo !== (ticket.prazo || '') && !!editPrazo && fimDeSemana(editPrazo)) || (editInicio !== (plano.inicio || '') && !!editInicio && fimDeSemana(editInicio))}
                    onClick={() => {
                      const corpo: Record<string, unknown> = {
                        acao: 'editar', titulo: editTitulo, prazo: editPrazo || null, categoria: editCategoria,
                        terceiro_envolvido: editTerceiro, inicio: editInicio || null,
                      }
                      if (editDias) corpo.dias = Number(editDias)
                      if (editHoras) corpo.horas_dia = Number(editHoras.replace(',', '.'))
                      acao(corpo, () => setEditando(false))
                    }}
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

          {/* Pessoas */}
          <div style={cartao}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={tituloCartao}><Users size={13} /> Pessoas</span>
              {podeMexerPessoas && (
                <button onClick={() => setAddParticipante((v) => !v)} style={botaoMini} title="Adicionar alguém para acompanhar">
                  <Plus size={12} /> Adicionar
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              {[...participantesAtivos].sort((a, b) => {
                const peso = (p: TicketParticipante) => p.user_id === ticket.responsavel_id ? 0 : p.user_id === ticket.solicitante_id ? 1 : 2
                return peso(a) - peso(b)
              }).map((p) => {
                const papel = p.user_id === ticket.responsavel_id ? 'faz' : p.user_id === ticket.solicitante_id ? 'pediu' : ''
                const podeRemover = !papel && (p.user_id === uid || souSolicitante || isAdmin)
                return (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--portal-text,#111)' }}>
                    <Avatar u={usuarios[p.user_id]} tamanho={24} />
                    <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {nome(p.user_id)}
                      {papel && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 700, color: papel === 'faz' ? '#dc2626' : 'var(--portal-text-muted,#999)' }}>{papel}</span>}
                    </span>
                    {podeRemover && (
                      <button
                        onClick={() => {
                          const proprio = p.user_id === uid
                          if (window.confirm(proprio ? 'Sair deste ticket? Você deixará de acompanhar as atualizações.' : `Remover ${nome(p.user_id)} do ticket?`)) {
                            acao({ acao: 'participante_remover', user_id: p.user_id })
                          }
                        }}
                        title={p.user_id === uid ? 'Sair do ticket' : 'Remover'}
                        aria-label={p.user_id === uid ? 'Sair do ticket' : `Remover ${nome(p.user_id)}`}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text-muted,#bbb)', display: 'flex' }}>
                        <X size={13} />
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
            {(podeTransferir || verAgenda) && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--portal-border,#f0f0f0)' }}>
                {podeTransferir && (
                  <button disabled={agindo} style={botaoMini} onClick={() => { setNovoResponsavel(''); setModalTransferir(true) }}>
                    <ArrowRightLeft size={12} /> Passar para outra pessoa
                  </button>
                )}
                {verAgenda && (
                  <a href={`/cronograma?fila=${ticket.responsavel_id}`} style={{ ...botaoMini, textDecoration: 'none' }}
                    title="Ver a fila de trabalho dessa pessoa e a previsão do seu pedido">
                    <CalendarDays size={12} /> Agenda de {nome(ticket.responsavel_id).split(' ')[0]}
                  </a>
                )}
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
        </div>
      </div>

      {/* Modal transferência (ADR-003: direta, sem aceite, com evento visível) */}
      {modalTransferir && (
        <div data-janela-interna style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModalTransferir(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: 'var(--portal-text,#111)' }}>
              <ArrowRightLeft size={16} color="#dc2626" /> Passar para outra pessoa
            </h3>
            <p style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', margin: '0 0 14px' }}>
              Passa na hora (sem aceite). {nome(ticket.responsavel_id)} continua acompanhando o ticket.
            </p>
            <UserSelect value={novoResponsavel} onChange={setNovoResponsavel}
              excluir={[ticket.responsavel_id]} placeholder="Quem vai fazer..." />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
              <button onClick={() => setModalTransferir(false)}
                style={{ padding: '8px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                Cancelar
              </button>
              <button disabled={!novoResponsavel || agindo}
                onClick={() => acao({ acao: 'transferir', para: novoResponsavel }, () => setModalTransferir(false))}
                style={{ padding: '8px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: !novoResponsavel || agindo ? .5 : 1 }}>
                Passar
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Escolher quadro (sql/tickets-quadros.sql) */}
      {modalQuadro && (
        <div data-janela-interna style={{ position: 'fixed', inset: 0, zIndex: 1100, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={() => setModalQuadro(false)}>
          <div onClick={(e) => e.stopPropagation()}
            style={{ width: '100%', maxWidth: 420, maxHeight: '80vh', overflowY: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, margin: '0 0 6px', color: 'var(--portal-text,#111)' }}>
              <LayoutGrid size={16} color="#dc2626" /> {quadro ? 'Trocar de bloco' : 'Pôr num bloco'}
            </h3>
            <p style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', margin: '0 0 14px' }}>
              A situação do ticket não muda.
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
              {/* Todo ticket fica num bloco: dá para trocar, não para tirar. */}
              <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)', alignSelf: 'center' }}>Todo ticket fica num bloco.</span>
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

// Enquanto carrega pela 1ª vez: o formato da janela, sem texto solto.
function Esqueleto({ janela, onFechar }: { janela: boolean; onFechar?: () => void }) {
  const barra = (w: string | number, h = 12): React.CSSProperties => ({ width: w, height: h, borderRadius: 6, background: 'var(--portal-border,#e5e7eb)', opacity: .7 })
  const cartao: React.CSSProperties = { background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)', borderRadius: 12, padding: 16 }
  return (
    <div style={{ padding: janela ? 0 : 20, maxWidth: 1100, margin: '0 auto' }} aria-busy="true" aria-label="Carregando ticket">
      <div style={{ ...cartao, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={barra(60)} /><div style={barra(90)} />
          {onFechar && (
            <button onClick={onFechar} aria-label="Fechar" style={{ marginLeft: 'auto', display: 'flex', padding: 6, borderRadius: 8, cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text-secondary,#555)' }}><X size={15} /></button>
          )}
        </div>
        <div style={{ ...barra('55%', 20), marginBottom: 14 }} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0,1fr))', gap: 8 }}>
          {[0, 1, 2, 3].map((i) => <div key={i} style={{ height: 52, borderRadius: 10, background: 'var(--portal-bg,#f3f4f6)' }} />)}
        </div>
      </div>
      <div style={{ ...cartao, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={barra('30%')} /><div style={barra('90%')} /><div style={barra('70%')} />
      </div>
    </div>
  )
}

function LinhaEvento({ e, uid, nome, usuarios }: {
  e: TicketEvento; uid?: string; nome: (id: string | null | undefined) => string; usuarios: Record<string, UsuarioMin>
}) {
  const ehComentario = e.tipo === 'comentario'
  const ehCobranca = e.tipo === 'pedido_atualizacao'
  const pendente = String(e.id).startsWith('tmp-')
  let texto: React.ReactNode = null
  if (e.tipo === 'criacao') texto = <>abriu o ticket para <strong>{nome(String(e.payload.responsavel_id || ''))}</strong></>
  else if (e.tipo === 'status') {
    const de = STATUS_INFO[e.payload.de as TicketStatus]?.label || String(e.payload.de)
    const para = STATUS_INFO[e.payload.para as TicketStatus]?.label || String(e.payload.para)
    texto = <>mudou a situação: {de} → <strong>{para}</strong>{e.payload.motivo ? <> — {String(e.payload.motivo)}</> : null}</>
  }
  else if (e.tipo === 'transferencia') texto = <>passou de <strong>{nome(String(e.payload.de || ''))}</strong> para <strong>{nome(String(e.payload.para || ''))}</strong></>
  else if (e.tipo === 'participante_adicionado') texto = e.payload.auto
    ? <>entrou na conversa</>
    : <>adicionou <strong>{nome(String(e.payload.user_id || ''))}</strong></>
  else if (e.tipo === 'participante_removido') texto = <>removeu <strong>{nome(String(e.payload.user_id || ''))}</strong></>
  else if (e.tipo === 'pedido_atualizacao') texto = <>pediu atualização{e.payload.texto ? <>: {String(e.payload.texto)}</> : null}</>
  else if (e.tipo === 'edicao') {
    if (e.payload.campo === 'visibilidade') texto = <>tornou o ticket <strong>{e.payload.para === 'publico' ? 'compartilhado' : 'privado'}</strong></>
    else if (e.payload.campo === 'quadro') texto = e.payload.para
      ? <>colocou no bloco <strong>{String(e.payload.para)}</strong></>
      : <>tirou do bloco{e.payload.de ? <> <strong>{String(e.payload.de)}</strong></> : null}</>
    else if (e.payload.campo === 'tarefa' && e.payload.acao === 'editada') texto = <>editou a tarefa <strong>{String(e.payload.titulo || '')}</strong>{Array.isArray(e.payload.mudou) && e.payload.mudou.length ? <> ({(e.payload.mudou as string[]).join(', ')})</> : null}</>
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
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={urlAnexo} alt={nomeAnexo} style={{ maxWidth: 'min(240px, 100%)', maxHeight: 150, borderRadius: 8, display: 'block' }} />
            <span className="ticket-anexo-img-rotulo"><ExternalLink size={11} /> Abrir</span>
          </a>
        )}
      </>
    )
  }

  if (ehComentario) {
    const meu = e.autor_id === uid
    return (
      <div style={{ display: 'flex', gap: 10, padding: '7px 0', opacity: pendente ? .6 : 1 }}>
        <Avatar u={e.autor_id ? usuarios[e.autor_id] : undefined} tamanho={28} />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#999)', marginBottom: 3 }}>
            <strong style={{ color: 'var(--portal-text-secondary,#555)' }}>{nome(e.autor_id)}</strong> · {pendente ? 'enviando…' : fmtQuando(e.created_at)}
          </div>
          <div style={{
            padding: '9px 12px', borderRadius: 10, fontSize: 14, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            background: meu ? 'rgba(220,38,38,.06)' : 'var(--portal-bg,#f9fafb)',
            border: '1px solid var(--portal-border,#eee)', color: 'var(--portal-text,#111)',
          }}>
            {String(e.payload.texto || '')}
          </div>
        </div>
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', gap: 10, padding: '5px 0', alignItems: 'flex-start' }}>
      <span style={{
        width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: ehCobranca ? 'rgba(217,119,6,.14)' : 'var(--portal-bg,#f3f4f6)',
        color: ehCobranca ? '#d97706' : 'var(--portal-text-muted,#888)',
      }}>
        {EVENTO_ICONE[e.tipo] || <CircleDot size={14} />}
      </span>
      <div style={{ minWidth: 0, flex: 1, fontSize: 13, color: 'var(--portal-text-secondary,#555)', paddingTop: 5 }}>
        <strong>{nome(e.autor_id)}</strong> {texto}
        <span style={{ color: 'var(--portal-text-muted,#aaa)', fontSize: 12 }}> · {fmtQuando(e.created_at)}</span>
      </div>
    </div>
  )
}
