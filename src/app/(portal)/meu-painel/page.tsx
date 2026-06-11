'use client'
import { useEffect, useState, useMemo } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { supabase } from '@/lib/supabase'
import {
  Calendar, Package, Clock, Navigation, MapPin,
  Plus, X, Send, FileText, AlertTriangle, ChevronRight, ChevronLeft,
  AlertOctagon, Check, Truck, MessageSquare, Star, ChevronDown, ChevronUp,
  Megaphone, Download
} from 'lucide-react'
import MinhasGarantias from '@/components/meu-painel/MinhasGarantias'

interface AgendaItem {
  id: number
  tecnico_nome: string
  id_ordem: string | null
  data_agendada: string
  turno: string | null
  hora_inicio: string | null
  hora_fim: string | null
  descricao: string | null
  endereco: string | null
  cliente: string | null
  status: string
}

interface OrdemServico {
  Id_Ordem: string
  Status: string
  Os_Cliente: string
  Os_Tecnico: string
  Os_Tecnico2: string
  Previsao_Execucao: string | null
  Serv_Solicitado: string
  Endereco_Cliente: string
  Cidade_Cliente: string
  Tipo_Servico: string
}

interface Caminho {
  id: number
  tecnico_nome: string
  destino: string
  cidade: string
  motivo: string
  data_saida: string
  status: string
  adesao_id: number | null
  placa: string | null
}

interface Execucao {
  id: number
  id_ordem: string
  data_execucao: string
  status: string
  servico_realizado: string | null
  created_at: string
}

interface Requisicao {
  id: number
  id_ordem: string | null
  material_solicitado: string
  quantidade: string | null
  urgencia: string
  status: string
  atualizada_pelo_tecnico: boolean
  created_at: string
}

interface Ocorrencia {
  id: number
  tipo: string
  descricao: string
  data: string
  pontos_descontados: number
  id_ordem: string | null
}

interface Justificativa {
  id: number
  id_ocorrencia: number | null
  justificativa: string
  status: string
}

function getWeekDays(date: Date): Date[] {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const monday = new Date(d.setDate(diff))
  monday.setHours(0, 0, 0, 0)
  return Array.from({ length: 7 }, (_, i) => {
    const dd = new Date(monday)
    dd.setDate(monday.getDate() + i)
    return dd
  })
}

function formatDate(d: Date) {
  return d.toISOString().split('T')[0]
}

function formatDateBR(d: string) {
  const [, m, day] = d.split('-')
  return `${day}/${m}`
}

const DIAS_SEMANA = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']

const TIPO_OCORRENCIA: Record<string, { label: string; color: string; icon: string }> = {
  atraso: { label: 'Atraso', color: '#F59E0B', icon: '⏱' },
  erro: { label: 'Erro', color: '#EF4444', icon: '✕' },
  retrabalho: { label: 'Retrabalho', color: '#DC2626', icon: '↺' },
  falta_material: { label: 'Falta Material', color: '#8B5CF6', icon: '📦' },
  outros: { label: 'Outros', color: '#6B7280', icon: '•' },
}

export default function MeuPainelPage() {
  const { userProfile } = useAuth()
  const [tecnicoNome, setTecnicoNome] = useState<string | null>(null)
  const [agendaHoje, setAgendaHoje] = useState<AgendaItem[]>([])
  const [ordensHoje, setOrdensHoje] = useState<OrdemServico[]>([])
  const [caminhoAtivo, setCaminhoAtivo] = useState<Caminho | null>(null)
  const [caminhos, setCaminhos] = useState<Caminho[]>([])
  const [execucoes, setExecucoes] = useState<Execucao[]>([])
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([])
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [justificativas, setJustificativas] = useState<Justificativa[]>([])
  const [loading, setLoading] = useState(true)
  const [showCaminhoForm, setShowCaminhoForm] = useState(false)
  const [novoCaminho, setNovoCaminho] = useState({ destino: '', cidade: '', motivo: '', adesao_id: '', placa: '' })
  const [veiculosDisponiveis, setVeiculosDisponiveis] = useState<{ id: number; placa: string; descricao: string }[]>([])
  const [loadingVeiculos, setLoadingVeiculos] = useState(false)
  const [showJustForm, setShowJustForm] = useState<number | null>(null)
  const [justTexto, setJustTexto] = useState('')
  const [semanaRef, setSemanaRef] = useState(new Date())
  const [ordensSemana, setOrdensSemana] = useState<OrdemServico[]>([])
  const [agendaAberta, setAgendaAberta] = useState(false)
  const [secaoAtiva, setSecaoAtiva] = useState<string | null>(null)
  const [avisosAtivos, setAvisosAtivos] = useState<{ id: string; titulo: string; conteudo: string; prioridade: string; created_at: string; criado_por_nome: string; anexos: { id: string; nome_arquivo: string; url: string }[] }[]>([])
  const [avisosExpandido, setAvisosExpandido] = useState<string | null>(null)

  const hoje = new Date().toISOString().split('T')[0]
  const weekDays = useMemo(() => getWeekDays(semanaRef), [semanaRef])
  const weekStart = formatDate(weekDays[0])
  const weekEnd = formatDate(weekDays[6])

  // Identificar técnico pelo portal_permissoes
  useEffect(() => {
    if (!userProfile?.id) return
    const buscarTecnico = async () => {
      const { data } = await supabase
        .from('portal_permissoes')
        .select('mecanico_tecnico_nome')
        .eq('user_id', userProfile.id)
        .single()
      if (data?.mecanico_tecnico_nome) setTecnicoNome(data.mecanico_tecnico_nome)
      else setTecnicoNome(userProfile.nome)
    }
    buscarTecnico()
  }, [userProfile?.id, userProfile?.nome])

  const carregar = async () => {
    if (!tecnicoNome) return
    setLoading(true)

    const [
      { data: agenda },
      { data: ordens },
      { data: ordsSemana },
      { data: cams },
      { data: execs },
      { data: reqs },
      { data: ocors },
      { data: justs },
    ] = await Promise.all([
      supabase.from('agenda_tecnico').select('*').eq('tecnico_nome', tecnicoNome).eq('data_agendada', hoje).order('hora_inicio'),
      supabase.from('Ordem_Servico').select('*')
        .or(`Os_Tecnico.eq.${tecnicoNome},Os_Tecnico2.eq.${tecnicoNome}`)
        .not('Status', 'in', '("Concluída","Cancelada")')
        .order('Previsao_Execucao', { ascending: true }),
      supabase.from('Ordem_Servico').select('*')
        .or(`Os_Tecnico.eq.${tecnicoNome},Os_Tecnico2.eq.${tecnicoNome}`)
        .not('Previsao_Execucao', 'is', null)
        .gte('Previsao_Execucao', weekStart)
        .lte('Previsao_Execucao', weekEnd)
        .order('Previsao_Execucao', { ascending: true }),
      supabase.from('tecnico_caminhos').select('*').eq('tecnico_nome', tecnicoNome).order('created_at', { ascending: false }).limit(10),
      supabase.from('os_tecnico_execucao').select('*').eq('tecnico_nome', tecnicoNome).order('created_at', { ascending: false }).limit(20),
      supabase.from('mecanico_requisicoes').select('*').eq('tecnico_nome', tecnicoNome).order('created_at', { ascending: false }).limit(20),
      supabase.from('tecnico_ocorrencias').select('*').eq('tecnico_nome', tecnicoNome).order('created_at', { ascending: false }).limit(20),
      supabase.from('tecnico_justificativas').select('*').eq('tecnico_nome', tecnicoNome).order('created_at', { ascending: false }).limit(20),
    ])

    setAgendaHoje((agenda as AgendaItem[]) || [])
    const todasOrdens = (ordens as OrdemServico[]) || []
    setOrdensHoje(todasOrdens.filter(o => o.Previsao_Execucao === hoje))
    setOrdensSemana((ordsSemana as OrdemServico[]) || [])
    setCaminhos((cams as Caminho[]) || [])
    setCaminhoAtivo(((cams as Caminho[]) || []).find(c => c.status === 'em_transito') || null)
    setExecucoes((execs as Execucao[]) || [])
    setRequisicoes((reqs as Requisicao[]) || [])
    setOcorrencias((ocors as Ocorrencia[]) || [])
    setJustificativas((justs as Justificativa[]) || [])
    setLoading(false)
  }

  useEffect(() => { if (tecnicoNome) carregar() }, [tecnicoNome, weekStart, weekEnd])

  // Carregar avisos ativos
  useEffect(() => {
    const carregarAvisos = async () => {
      const { data } = await supabase
        .from('portal_avisos')
        .select('id, titulo, conteudo, prioridade, created_at, criado_por_nome')
        .eq('ativo', true)
        .order('created_at', { ascending: false })
        .limit(10)
      if (!data) return
      const ids = data.map(a => a.id)
      const { data: anexos } = ids.length > 0
        ? await supabase.from('portal_avisos_anexos').select('id, aviso_id, nome_arquivo, url').in('aviso_id', ids)
        : { data: [] }
      const anexosMap: Record<string, { id: string; nome_arquivo: string; url: string }[]> = {}
      ;(anexos || []).forEach((a: any) => {
        if (!anexosMap[a.aviso_id]) anexosMap[a.aviso_id] = []
        anexosMap[a.aviso_id].push(a)
      })
      setAvisosAtivos(data.map(a => ({ ...a, anexos: anexosMap[a.id] || [] })))
      // Marcar como lido
      if (userProfile?.id && ids.length > 0) {
        const rows = ids.map(aviso_id => ({ aviso_id, user_id: userProfile.id }))
        await supabase.from('portal_avisos_lidos').upsert(rows, { onConflict: 'aviso_id,user_id' }).select()
      }
    }
    carregarAvisos()
    const ch = supabase.channel('meu_avisos').on('postgres_changes', { event: '*', schema: 'public', table: 'portal_avisos' }, () => carregarAvisos()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userProfile?.id])

  // Realtime
  useEffect(() => {
    if (!tecnicoNome) return
    const channels = [
      supabase.channel('meu_agenda').on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_tecnico' }, () => carregar()).subscribe(),
      supabase.channel('meu_cam').on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_caminhos' }, () => carregar()).subscribe(),
      supabase.channel('meu_ocor').on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_ocorrencias' }, () => carregar()).subscribe(),
      supabase.channel('meu_just').on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_justificativas' }, () => carregar()).subscribe(),
    ]
    return () => { channels.forEach(c => supabase.removeChannel(c)) }
  }, [tecnicoNome])

  // ─── Notificar admins ─────────────────────────────────────────
  const notificarAdmins = async (tipo: string, titulo: string, descricao?: string) => {
    try {
      const { data: admins } = await supabase.from('portal_permissoes').select('user_id').eq('is_admin', true)
      if (!admins || admins.length === 0) return
      await supabase.from('portal_notificacoes').insert(
        admins.map((a: { user_id: string }) => ({
          user_id: a.user_id, tipo, titulo,
          descricao: descricao || null,
          link: '/painel-mecanicos',
        }))
      )
    } catch (err) { console.error('[MeuPainel] Erro ao notificar:', err) }
  }

  // ─── Actions ──────────────────────────────────────────────────
  const carregarVeiculos = async () => {
    if (veiculosDisponiveis.length > 0) return
    setLoadingVeiculos(true)
    try {
      const res = await fetch('/api/pos/rastreamento?acao=veiculos')
      if (res.ok) {
        const data = await res.json()
        setVeiculosDisponiveis(data)
      }
    } catch (e) { console.error('Erro ao carregar veículos:', e) }
    setLoadingVeiculos(false)
  }

  const salvarCaminho = async () => {
    if (!tecnicoNome || !novoCaminho.destino || !novoCaminho.cidade) return
    await supabase.from('tecnico_caminhos').insert({
      tecnico_nome: tecnicoNome,
      destino: novoCaminho.destino,
      cidade: novoCaminho.cidade,
      motivo: novoCaminho.motivo,
      adesao_id: novoCaminho.adesao_id ? Number(novoCaminho.adesao_id) : null,
      placa: novoCaminho.placa || null,
      data_saida: new Date().toISOString(),
      status: 'em_transito',
    })
    await notificarAdmins(
      'pos',
      `${tecnicoNome} - Novo caminho`,
      `Indo para ${novoCaminho.destino} (${novoCaminho.cidade})${novoCaminho.placa ? ` | ${novoCaminho.placa}` : ''}${novoCaminho.motivo ? ` - ${novoCaminho.motivo}` : ''}`
    )
    setNovoCaminho({ destino: '', cidade: '', motivo: '', adesao_id: '', placa: '' })
    setShowCaminhoForm(false)
    carregar()
  }

  const finalizarCaminho = async (id: number) => {
    const cam = caminhos.find(c => c.id === id)
    await supabase.from('tecnico_caminhos').update({ status: 'chegou' }).eq('id', id)
    if (cam) {
      await notificarAdmins('pos', `${tecnicoNome} chegou ao destino`, `${cam.destino} (${cam.cidade})`)
    }
    carregar()
  }

  const enviarJustificativa = async (ocorrenciaId: number) => {
    if (!tecnicoNome || !justTexto.trim()) return
    const oc = ocorrencias.find(o => o.id === ocorrenciaId)
    await supabase.from('tecnico_justificativas').insert({
      tecnico_nome: tecnicoNome,
      id_ordem: oc?.id_ordem || null,
      id_ocorrencia: ocorrenciaId,
      justificativa: justTexto.trim(),
      status: 'pendente',
    })
    await notificarAdmins(
      'pos',
      `Nova justificativa - ${tecnicoNome}`,
      `${justTexto.trim().substring(0, 100)}${oc?.id_ordem ? ` (OS: ${oc.id_ordem})` : ''}`
    )
    setJustTexto('')
    setShowJustForm(null)
    carregar()
  }

  // ─── Computed ─────────────────────────────────────────────────
  const pontuacao = useMemo(() => {
    let pts = 100
    ocorrencias.forEach(o => {
      const justAprovada = justificativas.find(j => j.id_ocorrencia === o.id && j.status === 'aprovada')
      if (!justAprovada) pts = Math.max(0, pts - o.pontos_descontados)
    })
    return pts
  }, [ocorrencias, justificativas])

  const pontosColor = pontuacao >= 80 ? '#10B981' : pontuacao >= 50 ? '#F59E0B' : '#EF4444'

  const reqPendentes = requisicoes.filter(r => r.status === 'aprovada' && !r.atualizada_pelo_tecnico)
  const ocorrenciasSemJust = ocorrencias.filter(o => !justificativas.some(j => j.id_ocorrencia === o.id))
  const totalPendencias = reqPendentes.length + ocorrenciasSemJust.length

  const servicosHoje = useMemo(() => {
    const items: { id: string; ordem: string; cliente: string; endereco: string; cidade: string; tipo: string; hora?: string; solicitacao: string }[] = []
    agendaHoje.forEach(a => {
      items.push({
        id: `ag-${a.id}`, ordem: a.id_ordem || '', cliente: a.cliente || '',
        endereco: a.endereco || '', cidade: '', tipo: '', hora: a.hora_inicio || undefined, solicitacao: a.descricao || '',
      })
    })
    ordensHoje.forEach(o => {
      if (!items.some(it => it.ordem === o.Id_Ordem)) {
        let solicitacao = ''
        if (o.Serv_Solicitado) {
          const match = o.Serv_Solicitado.match(/Solicitação do cliente:\s*([\s\S]*?)(?:\nServiço Realizado:|$)/i)
          solicitacao = match ? match[1].trim() : o.Serv_Solicitado.substring(0, 120)
        }
        items.push({
          id: `os-${o.Id_Ordem}`, ordem: o.Id_Ordem, cliente: o.Os_Cliente,
          endereco: o.Endereco_Cliente, cidade: o.Cidade_Cliente || '', tipo: o.Tipo_Servico, solicitacao,
        })
      }
    })
    return items
  }, [agendaHoje, ordensHoje])

  if (loading && !tecnicoNome) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#F8FAFC' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, border: '3px solid #E2E8F0', borderTopColor: '#1E3A5F', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: '#94A3B8', fontSize: 13, letterSpacing: 2 }}>CARREGANDO...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    )
  }

  const avatarUrl = userProfile?.avatar_url
  const primeiroNome = (tecnicoNome || userProfile?.nome || '').split(' ')[0]
  const hojeLabel = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 0 40px', background: '#F8FAFC', minHeight: '100vh' }}>

      {/* ════════════ HEADER ════════════ */}
      <div style={{
        background: 'linear-gradient(135deg, #1E3A5F 0%, #0F2439 100%)',
        padding: '24px 20px 28px', borderRadius: '0 0 28px 28px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* Decoração sutil */}
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 16, overflow: 'hidden',
              border: '2px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.1)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                <span style={{ fontSize: 22, fontWeight: 700, color: '#fff' }}>
                  {primeiroNome.charAt(0)}
                </span>
              )}
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 2 }}>
                Bem-vindo
              </div>
              <div style={{ fontSize: 20, fontWeight: 700, color: '#fff' }}>
                {primeiroNome}
              </div>
            </div>
          </div>

          {/* Pontuação */}
          <div style={{
            background: `${pontosColor}20`, borderRadius: 14, padding: '8px 14px',
            display: 'flex', alignItems: 'center', gap: 6, border: `1px solid ${pontosColor}40`,
          }}>
            <Star size={16} color={pontosColor} fill={pontosColor} />
            <span style={{ fontSize: 20, fontWeight: 800, color: pontosColor }}>{pontuacao}</span>
          </div>
        </div>

        {/* Data */}
        <div style={{
          marginTop: 16, fontSize: 13, color: 'rgba(255,255,255,0.6)', fontWeight: 500,
          position: 'relative', zIndex: 1, textTransform: 'capitalize',
        }}>
          {hojeLabel}
        </div>

        {/* Stats rápidos */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
          marginTop: 16, position: 'relative', zIndex: 1,
        }}>
          {[
            { label: 'Hoje', value: servicosHoje.length, color: '#3B82F6' },
            { label: 'Pendências', value: totalPendencias, color: totalPendencias > 0 ? '#F59E0B' : '#10B981' },
            { label: 'Ocorrências', value: ocorrenciasSemJust.length, color: ocorrenciasSemJust.length > 0 ? '#EF4444' : '#10B981' },
          ].map((s, i) => (
            <div key={i} style={{
              background: 'rgba(255,255,255,0.08)', borderRadius: 12, padding: '10px 12px',
              textAlign: 'center',
            }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 600, letterSpacing: 0.5 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>

        {/* ════════════ AVISOS ════════════ */}
        {avisosAtivos.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <Megaphone size={16} color="#DC2626" />
              <span style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>Avisos</span>
              <span style={{ fontSize: 11, fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '2px 8px', borderRadius: 8 }}>{avisosAtivos.length}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {avisosAtivos.map(aviso => {
                const prioColors: Record<string, string> = { urgente: '#DC2626', alta: '#D97706', normal: '#3B82F6', baixa: '#10B981' }
                const cor = prioColors[aviso.prioridade] || '#3B82F6'
                const isOpen = avisosExpandido === aviso.id
                return (
                  <div key={aviso.id} onClick={() => setAvisosExpandido(isOpen ? null : aviso.id)} style={{
                    background: '#fff', borderRadius: 14, padding: '14px 16px',
                    border: '1px solid #F1F5F9', position: 'relative', overflow: 'hidden', cursor: 'pointer',
                  }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: cor }} />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: isOpen ? 8 : 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {aviso.titulo}
                        </div>
                        {!isOpen && (
                          <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                            {aviso.criado_por_nome} - {new Date(aviso.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                          </div>
                        )}
                      </div>
                      {aviso.prioridade === 'urgente' && (
                        <AlertTriangle size={14} color="#DC2626" />
                      )}
                      {isOpen ? <ChevronUp size={16} color="#94A3B8" /> : <ChevronDown size={16} color="#94A3B8" />}
                    </div>
                    {isOpen && (
                      <div>
                        <div style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: aviso.anexos.length > 0 ? 10 : 0 }}>
                          {aviso.conteudo}
                        </div>
                        {aviso.anexos.length > 0 && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {aviso.anexos.map(anx => (
                              <a key={anx.id} href={anx.url} target="_blank" rel="noopener noreferrer"
                                onClick={e => e.stopPropagation()}
                                style={{
                                  display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                                  borderRadius: 8, background: '#F8FAFC', border: '1px solid #E2E8F0',
                                  textDecoration: 'none', color: '#334155', fontSize: 12, fontWeight: 600,
                                }}>
                                <FileText size={14} color="#DC2626" />
                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{anx.nome_arquivo}</span>
                                <Download size={13} color="#94A3B8" />
                              </a>
                            ))}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 8 }}>
                          {aviso.criado_por_nome} - {new Date(aviso.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ════════════ CAMINHO ATIVO ════════════ */}
        {caminhoAtivo && (
          <div style={{
            background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', borderRadius: 16,
            padding: 18, marginBottom: 16, position: 'relative', overflow: 'hidden',
          }}>
            <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, position: 'relative', zIndex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <Truck size={16} color="#fff" />
              </div>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.7)', letterSpacing: 1, textTransform: 'uppercase' }}>
                Em trânsito
              </span>
            </div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#fff', marginBottom: 4, position: 'relative', zIndex: 1 }}>
              {caminhoAtivo.destino}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, position: 'relative', zIndex: 1 }}>
              <MapPin size={12} /> {caminhoAtivo.cidade}
            </div>
            {caminhoAtivo.placa && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.9)', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4, position: 'relative', zIndex: 1, background: 'rgba(255,255,255,0.15)', padding: '3px 10px', borderRadius: 6, width: 'fit-content' }}>
                <Truck size={11} /> {caminhoAtivo.placa}
              </div>
            )}
            {caminhoAtivo.motivo && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginBottom: 12, position: 'relative', zIndex: 1 }}>{caminhoAtivo.motivo}</div>
            )}
            <button onClick={() => finalizarCaminho(caminhoAtivo.id)} style={{
              width: '100%', padding: '12px 0', borderRadius: 12, border: 'none',
              background: '#fff', color: '#7C3AED', fontSize: 14, fontWeight: 700,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              position: 'relative', zIndex: 1,
            }}>
              <Check size={16} /> Cheguei no destino
            </button>
          </div>
        )}

        {/* ════════════ SERVIÇOS DE HOJE ════════════ */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>
              Serviços de hoje
            </h2>
            {servicosHoje.length > 0 && (
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#3B82F6', background: '#EFF6FF',
                padding: '4px 10px', borderRadius: 20,
              }}>
                {servicosHoje.length} {servicosHoje.length === 1 ? 'serviço' : 'serviços'}
              </span>
            )}
          </div>

          {servicosHoje.length === 0 ? (
            <div style={{
              background: '#fff', borderRadius: 16, padding: '32px 20px', textAlign: 'center',
              border: '1px solid #F1F5F9',
            }}>
              <Calendar size={28} color="#CBD5E1" style={{ marginBottom: 8 }} />
              <p style={{ fontSize: 14, color: '#94A3B8', fontWeight: 500, margin: 0 }}>Nenhum serviço agendado para hoje</p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {servicosHoje.map(s => (
                <div key={s.id} style={{
                  background: '#fff', borderRadius: 14, padding: '14px 16px',
                  border: '1px solid #F1F5F9', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{
                    position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
                    background: '#3B82F6', borderRadius: '14px 0 0 14px',
                  }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#1E293B' }}>
                      {s.cliente || 'Cliente não informado'}
                    </div>
                    {s.hora && (
                      <span style={{
                        fontSize: 11, fontWeight: 600, color: '#3B82F6', background: '#EFF6FF',
                        padding: '2px 8px', borderRadius: 6, whiteSpace: 'nowrap',
                      }}>
                        {s.hora}
                      </span>
                    )}
                  </div>
                  {s.cidade && (
                    <div style={{ fontSize: 12, color: '#64748B', display: 'flex', alignItems: 'center', gap: 4, marginBottom: 4 }}>
                      <MapPin size={11} /> {s.cidade}
                    </div>
                  )}
                  {s.solicitacao && (
                    <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.4, marginTop: 4 }}>
                      {s.solicitacao.substring(0, 120)}{s.solicitacao.length > 120 ? '...' : ''}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {s.ordem && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
                        OS {s.ordem}
                      </span>
                    )}
                    {s.tipo && (
                      <span style={{ fontSize: 10, fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '2px 8px', borderRadius: 4 }}>
                        {s.tipo}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ════════════ REGISTRAR CAMINHO ════════════ */}
        {!showCaminhoForm ? (
          <button onClick={() => { setShowCaminhoForm(true); carregarVeiculos() }} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '14px 0', borderRadius: 14, border: 'none',
            background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer', marginBottom: 16,
            boxShadow: '0 4px 14px rgba(124,58,237,0.3)',
          }}>
            <Navigation size={16} /> {caminhoAtivo ? 'Novo Destino' : 'Registrar Caminho'}
          </button>
        ) : (
          <div style={{
            background: '#fff', borderRadius: 16, padding: 18, marginBottom: 16,
            border: '2px solid #C4B5FD',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 15, fontWeight: 700, color: '#7C3AED' }}>Novo Caminho</span>
              <button onClick={() => setShowCaminhoForm(false)} style={{
                background: '#F1F5F9', border: 'none', cursor: 'pointer', color: '#94A3B8',
                width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <X size={16} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <input
                type="text" placeholder="Destino (ex: Fazenda São João)"
                value={novoCaminho.destino}
                onChange={e => setNovoCaminho({ ...novoCaminho, destino: e.target.value })}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
                  fontSize: 14, boxSizing: 'border-box', background: '#F8FAFC', outline: 'none',
                }}
              />
              <input
                type="text" placeholder="Cidade"
                value={novoCaminho.cidade}
                onChange={e => setNovoCaminho({ ...novoCaminho, cidade: e.target.value })}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
                  fontSize: 14, boxSizing: 'border-box', background: '#F8FAFC', outline: 'none',
                }}
              />
              <input
                type="text" placeholder="Motivo (opcional)"
                value={novoCaminho.motivo}
                onChange={e => setNovoCaminho({ ...novoCaminho, motivo: e.target.value })}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
                  fontSize: 14, boxSizing: 'border-box', background: '#F8FAFC', outline: 'none',
                }}
              />
              <select
                value={novoCaminho.adesao_id}
                onChange={e => {
                  const vei = veiculosDisponiveis.find(v => String(v.id) === e.target.value)
                  setNovoCaminho({ ...novoCaminho, adesao_id: e.target.value, placa: vei?.placa || '' })
                }}
                style={{
                  width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
                  fontSize: 14, boxSizing: 'border-box', background: '#F8FAFC', outline: 'none',
                  color: novoCaminho.adesao_id ? '#1E293B' : '#94A3B8',
                }}
              >
                <option value="">Qual carro vai usar?</option>
                {loadingVeiculos && <option disabled>Carregando...</option>}
                {veiculosDisponiveis.map(v => (
                  <option key={v.id} value={v.id}>{v.placa} - {v.descricao || 'Sem descrição'}</option>
                ))}
              </select>
              <button onClick={salvarCaminho} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
                background: 'linear-gradient(135deg, #7C3AED, #6D28D9)', color: '#fff',
                fontSize: 14, fontWeight: 700, cursor: 'pointer',
              }}>
                <Send size={16} /> Registrar
              </button>
            </div>
          </div>
        )}

        {/* ════════════ AGENDA SEMANAL (Colapsável) ════════════ */}
        <div style={{ marginBottom: 16 }}>
          <button
            onClick={() => setAgendaAberta(!agendaAberta)}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              width: '100%', padding: '14px 16px', borderRadius: agendaAberta ? '14px 14px 0 0' : 14,
              border: '1px solid #F1F5F9', background: '#fff',
              cursor: 'pointer', fontSize: 15, fontWeight: 700, color: '#1E293B',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Calendar size={18} color="#3B82F6" />
              Agenda Semanal
            </div>
            {agendaAberta ? <ChevronUp size={18} color="#94A3B8" /> : <ChevronDown size={18} color="#94A3B8" />}
          </button>

          {agendaAberta && (
            <div style={{
              background: '#fff', borderRadius: '0 0 14px 14px', padding: '12px 12px 16px',
              border: '1px solid #F1F5F9', borderTop: 'none',
            }}>
              {/* Navegação semana */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <button onClick={() => { const d = new Date(semanaRef); d.setDate(d.getDate() - 7); setSemanaRef(d) }} style={{
                  background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                }}>
                  <ChevronLeft size={16} color="#64748B" />
                </button>
                <div style={{ textAlign: 'center' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                    {formatDateBR(weekStart)} - {formatDateBR(weekEnd)}
                  </span>
                  <button onClick={() => setSemanaRef(new Date())} style={{
                    background: 'none', border: 'none', color: '#3B82F6', fontSize: 11,
                    fontWeight: 600, cursor: 'pointer', display: 'block', margin: '2px auto 0',
                  }}>
                    Semana atual
                  </button>
                </div>
                <button onClick={() => { const d = new Date(semanaRef); d.setDate(d.getDate() + 7); setSemanaRef(d) }} style={{
                  background: '#F1F5F9', border: 'none', borderRadius: 8, padding: '6px 10px', cursor: 'pointer',
                }}>
                  <ChevronRight size={16} color="#64748B" />
                </button>
              </div>

              {/* Grid semanal */}
              <div style={{ overflowX: 'auto' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 1, minWidth: 560 }}>
                  {weekDays.map((d, i) => {
                    const isHoje = formatDate(d) === hoje
                    return (
                      <div key={i} style={{
                        padding: '8px 4px', textAlign: 'center',
                        background: isHoje ? '#3B82F6' : '#1E293B',
                        color: '#fff', fontSize: 11, fontWeight: 700,
                        borderRadius: i === 0 ? '8px 0 0 0' : i === 6 ? '0 8px 0 0' : undefined,
                      }}>
                        <div>{DIAS_SEMANA[i]}</div>
                        <div style={{ fontSize: 16, marginTop: 2 }}>{d.getDate()}</div>
                      </div>
                    )
                  })}

                  {weekDays.map((d, dayIdx) => {
                    const dateStr = formatDate(d)
                    const isHoje = dateStr === hoje
                    const isPast = d < new Date(hoje)
                    const ordensNoDia = ordensSemana.filter(o => o.Previsao_Execucao === dateStr)
                    const caminhosNoDia = caminhos.filter(c => c.data_saida.split('T')[0] === dateStr)

                    return (
                      <div key={dayIdx} style={{
                        padding: 4, background: isHoje ? '#EFF6FF' : isPast ? '#FAFAFA' : '#fff',
                        border: `1px solid ${isHoje ? '#BFDBFE' : '#F1F5F9'}`,
                        minHeight: 80, fontSize: 10, display: 'flex', flexDirection: 'column', gap: 3,
                      }}>
                        {ordensNoDia.map(o => {
                          const cidade = o.Cidade_Cliente?.trim() || ''
                          const isConcluida = o.Status === 'Concluída'
                          const isCancelada = o.Status === 'Cancelada'
                          const isExecucao = o.Status.includes('Execução') || o.Status.includes('Aguardando ordem')
                          const bgColor = isConcluida ? '#F0FDF4' : isCancelada ? '#F5F5F5' : isExecucao ? '#EFF6FF' : '#FFFBEB'
                          const borderColor = isConcluida ? '#10B981' : isCancelada ? '#9CA3AF' : isExecucao ? '#3B82F6' : '#F59E0B'
                          const clienteNome = o.Os_Cliente ? o.Os_Cliente.split(' ').slice(0, 2).join(' ') : ''
                          let solicitacao = ''
                          if (o.Serv_Solicitado) {
                            const match = o.Serv_Solicitado.match(/Solicitação do cliente:\s*([\s\S]*?)(?:\nServiço Realizado:|$)/i)
                            solicitacao = match ? match[1].trim() : o.Serv_Solicitado.substring(0, 80)
                          }
                          return (
                            <div key={o.Id_Ordem} style={{
                              background: bgColor, borderRadius: 5, padding: '4px 6px',
                              borderLeft: `3px solid ${borderColor}`,
                              opacity: isCancelada ? 0.5 : 1,
                            }}>
                              <div style={{ fontWeight: 700, color: '#1E293B', fontSize: 10, marginBottom: 1 }}>
                                {clienteNome}{cidade ? ` - ${cidade}` : ''}
                                {isConcluida && (
                                  <span style={{ fontSize: 7, fontWeight: 700, color: '#065F46', background: '#D1FAE5', padding: '0px 3px', borderRadius: 3, marginLeft: 3 }}>OK</span>
                                )}
                              </div>
                              {solicitacao && (
                                <div style={{ color: '#64748B', fontSize: 9, lineHeight: 1.3 }}>
                                  {solicitacao.substring(0, 60)}
                                </div>
                              )}
                            </div>
                          )
                        })}
                        {caminhosNoDia.map(cam => (
                          <div key={cam.id} style={{
                            background: '#EDE9FE', borderRadius: 5, padding: '4px 6px',
                            borderLeft: '3px solid #8B5CF6',
                          }}>
                            <div style={{ fontWeight: 700, color: '#7C3AED', fontSize: 10 }}>
                              {cam.destino}
                            </div>
                            <div style={{ fontSize: 9, color: '#64748B' }}>{cam.cidade}</div>
                          </div>
                        ))}
                        {ordensNoDia.length === 0 && caminhosNoDia.length === 0 && (
                          <div style={{ color: '#E2E8F0', fontSize: 9, textAlign: 'center', paddingTop: 24 }}>—</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ════════════ PENDÊNCIAS ════════════ */}
        {totalPendencias > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1E293B', margin: 0 }}>Pendências</h2>
              <span style={{
                fontSize: 11, fontWeight: 700, color: '#F59E0B', background: '#FFFBEB',
                padding: '3px 10px', borderRadius: 20, border: '1px solid #FEF3C7',
              }}>
                {totalPendencias}
              </span>
            </div>

            {/* Requisições aprovadas */}
            {reqPendentes.map(req => (
              <div key={req.id} style={{
                background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 8,
                border: '1px solid #F1F5F9', position: 'relative', overflow: 'hidden',
              }}>
                <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: '#F59E0B' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Package size={14} color="#F59E0B" />
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#F59E0B', letterSpacing: 0.5 }}>REQUISIÇÃO APROVADA</span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#1E293B' }}>{req.material_solicitado}</div>
                <div style={{ fontSize: 12, color: '#94A3B8', marginTop: 2 }}>
                  {req.quantidade && `Qtd: ${req.quantidade}`}
                  {req.id_ordem && ` • OS: ${req.id_ordem}`}
                </div>
              </div>
            ))}

            {/* Ocorrências sem justificativa */}
            {ocorrenciasSemJust.map(oc => {
              const tipoInfo = TIPO_OCORRENCIA[oc.tipo] || TIPO_OCORRENCIA.outros
              const isFormOpen = showJustForm === oc.id
              return (
                <div key={oc.id} style={{
                  background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 8,
                  border: '1px solid #F1F5F9', position: 'relative', overflow: 'hidden',
                }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, background: tipoInfo.color }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                        background: `${tipoInfo.color}15`, color: tipoInfo.color,
                      }}>
                        {tipoInfo.icon} {tipoInfo.label}
                      </span>
                      {oc.id_ordem && <span style={{ fontSize: 11, color: '#94A3B8' }}>OS: {oc.id_ordem}</span>}
                    </div>
                    <span style={{
                      fontSize: 12, fontWeight: 800, color: '#EF4444',
                      background: '#FEF2F2', padding: '2px 8px', borderRadius: 6,
                    }}>
                      -{oc.pontos_descontados}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#475569', marginBottom: 4, lineHeight: 1.4 }}>{oc.descricao}</div>
                  <div style={{ fontSize: 11, color: '#CBD5E1', marginBottom: 10 }}>
                    {new Date(oc.data).toLocaleDateString('pt-BR')}
                  </div>

                  {!isFormOpen ? (
                    <button onClick={() => setShowJustForm(oc.id)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      width: '100%', padding: '10px 0', borderRadius: 10, border: 'none',
                      background: '#1E3A5F', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    }}>
                      <MessageSquare size={14} /> Enviar Justificativa
                    </button>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <textarea
                        value={justTexto}
                        onChange={e => setJustTexto(e.target.value)}
                        placeholder="Explique o que aconteceu..."
                        rows={3}
                        style={{
                          width: '100%', padding: '12px 14px', borderRadius: 10, border: '1px solid #E2E8F0',
                          fontSize: 13, resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box',
                          background: '#F8FAFC', outline: 'none',
                        }}
                      />
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => enviarJustificativa(oc.id)} style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          background: '#1E3A5F', color: '#fff', border: 'none', borderRadius: 10,
                          padding: '11px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        }}>
                          <Send size={14} /> Enviar
                        </button>
                        <button onClick={() => { setShowJustForm(null); setJustTexto('') }} style={{
                          padding: '11px 16px', background: '#F1F5F9', color: '#64748B', border: 'none',
                          borderRadius: 10, fontSize: 13, fontWeight: 600, cursor: 'pointer',
                        }}>
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}

        {/* Sem pendências */}
        {totalPendencias === 0 && (
          <div style={{
            background: '#fff', borderRadius: 16, padding: '28px 20px', textAlign: 'center',
            border: '1px solid #F1F5F9', marginBottom: 16,
          }}>
            <Check size={28} color="#10B981" style={{ marginBottom: 8 }} />
            <p style={{ fontSize: 14, color: '#94A3B8', fontWeight: 500, margin: 0 }}>Tudo em dia! Nenhuma pendência.</p>
          </div>
        )}

        {/* ════════════ MINHAS GARANTIAS ════════════ */}
        {tecnicoNome && <MinhasGarantias tecnicoNome={tecnicoNome} />}

      </div>
    </div>
  )
}
