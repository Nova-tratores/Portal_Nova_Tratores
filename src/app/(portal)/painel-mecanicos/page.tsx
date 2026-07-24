'use client'
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import SemPermissao from '@/components/SemPermissao'
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui'
import { supabase } from '@/lib/supabase'
import { filtrarDestinatarios } from '@/lib/notif/prefs'
import BlocoVisaoGeral from '@/components/painel-mecanicos/BlocoVisaoGeral'
import BlocoAgenda from '@/components/painel-mecanicos/BlocoAgenda'
import BlocoAlertas, { type Alerta } from '@/components/painel-mecanicos/BlocoAlertas'
import BlocoRelatorioMensal from '@/components/painel-mecanicos/BlocoRelatorioMensal'
import BlocoOcorrencias from '@/components/painel-mecanicos/BlocoOcorrencias'
import OcorrenciaFormModal from '@/components/ocorrencias/OcorrenciaFormModal'
import { LEGADO_TIPOS } from '@/lib/ocorrencias/catalogo'
import {
  AlertTriangle, RefreshCw,
  AlertOctagon, X, Calendar, Radar, BarChart3,
  ChevronLeft, ChevronRight
} from 'lucide-react'

interface Tecnico { user_id: string; tecnico_nome: string; tecnico_email: string; mecanico_role: 'tecnico' | 'observador' }
interface OrdemServico { Id_Ordem: string; Status: string; Os_Cliente: string; Cnpj_Cliente: string; Os_Tecnico: string; Os_Tecnico2: string; Previsao_Execucao: string | null; Previsao_Faturamento: string | null; Serv_Solicitado: string; Endereco_Cliente: string; Cidade_Cliente: string; Tipo_Servico: string; Qtd_HR: string | number | null }
interface Caminho { id: number; tecnico_nome: string; destino: string; cidade: string; motivo: string; data_saida: string; status: string }
interface Execucao { id: number; tecnico_nome: string; id_ordem: string; servico_realizado: string; data_execucao: string; status: string }
interface RequisicaoMecanico { id: number; tecnico_nome: string; material_solicitado: string; quantidade: string; urgencia: string; id_ordem: string | null; status: string; created_at: string }
interface Ocorrencia { id: number; tecnico_nome: string; id_ordem: string | null; tipo: string; descricao: string; pontos_descontados: number; data: string }
interface Justificativa { id: number; tecnico_nome: string; id_ordem: string | null; id_ocorrencia: number | null; justificativa: string; status: string; descontar_comissao: boolean | null; avaliado_por: string | null; data_avaliacao: string | null; created_at: string }
interface OpaResolvida { id: string; titulo: string; resolvido_por_nome: string | null; resolvido_at: string | null }

function normalizarNome(nome: string): string[] { return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(p => p.length > 2) }
function nomesBatem(a: string, b: string): boolean { if (!a || !b) return false; const pA = normalizarNome(a), pB = normalizarNome(b); if (!pA.length || !pB.length || pA[0] !== pB[0]) return false; if (pA.length === 1 || pB.length === 1) return true; const s = new Set(pA.slice(1)); return pB.slice(1).some(p => s.has(p)) }

// Tipos LEGADOS (linhas antigas) — o catálogo novo vive em lib/ocorrencias.
const TIPO_OCORRENCIA = LEGADO_TIPOS

type Bloco = 'visao' | 'ordens' | 'alertas' | 'ocorrencias' | 'relatorio'

export default function PainelMecanicosWrapper() {
  const { userProfile } = useAuth()
  const { temAcesso, loading: loadingPerm } = usePermissoes(userProfile?.id)
  if (!loadingPerm && userProfile && !temAcesso('painel-mecanicos')) return <SemPermissao />
  return <PainelMecanicosPage />
}

function PainelMecanicosPage() {
  const { userProfile } = useAuth()
  const { pode } = usePermissoes(userProfile?.id)
  const podeCriarOc = pode('painel-mecanicos', 'criar_ocorrencia')
  const podeAprovar = pode('painel-mecanicos', 'aprovar_requisicao')
  const podeRecusar = pode('painel-mecanicos', 'recusar_requisicao')
  const podeConverter = pode('painel-mecanicos', 'converter_alerta')
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([])
  const [ordens, setOrdens] = useState<OrdemServico[]>([])
  const [alertas, setAlertas] = useState<Alerta[]>([])
  const [caminhos, setCaminhos] = useState<Caminho[]>([])
  const [execucoesRecentes, setExecucoesRecentes] = useState<Execucao[]>([])
  const [reqsMecanico, setReqsMecanico] = useState<RequisicaoMecanico[]>([])
  const [ocorrencias, setOcorrencias] = useState<Ocorrencia[]>([])
  const [opasResolvidas, setOpasResolvidas] = useState<OpaResolvida[]>([])
  const [justificativas, setJustificativas] = useState<Justificativa[]>([])
  const [loading, setLoading] = useState(true)
  const [blocoAtivo, setBlocoAtivo] = useState<Bloco>('visao')
  const [showOcorrenciaModal, setShowOcorrenciaModal] = useState(false)
  const [semanaOffset, setSemanaOffset] = useState(0)

  const carregar = useCallback(async () => {
    setLoading(true)
    const [{ data: tecs }, { data: usus }, { data: ords }, { data: alerts }, { data: cams }, { data: execs }, { data: reqsMec }, { data: ocors }, { data: justs }, { data: opas }] = await Promise.all([
      supabase.from('portal_permissoes').select('user_id, mecanico_role, mecanico_tecnico_nome').not('mecanico_role', 'is', null).not('mecanico_tecnico_nome', 'is', null),
      supabase.from('financeiro_usu').select('id, nome, email, ativo'),
      supabase.from('Ordem_Servico').select('*').order('Previsao_Execucao', { ascending: true }),
      supabase.from('painel_alertas').select('*').order('created_at', { ascending: false }),
      supabase.from('tecnico_caminhos').select('*').order('created_at', { ascending: false }).limit(50),
      supabase.from('os_tecnico_execucao').select('*').order('created_at', { ascending: false }).limit(500),
      supabase.from('mecanico_requisicoes').select('*').order('created_at', { ascending: false }).limit(100),
      supabase.from('tecnico_ocorrencias').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('tecnico_justificativas').select('*').order('created_at', { ascending: false }).limit(200),
      supabase.from('portal_opas').select('id, titulo, resolvido_por_nome, resolvido_at').eq('status', 'resolvido').eq('resolvido_por_tipo', 'tecnico').order('resolvido_at', { ascending: false }).limit(300),
    ])
    const emailMap: Record<string, string> = {}
    const inativoSet = new Set<string>()
    ;((usus || []) as any[]).forEach(u => { emailMap[u.id] = u.email || ''; if (u.ativo === false) inativoSet.add(u.id) })
    setTecnicos(((tecs || []) as any[]).filter(t => !inativoSet.has(t.user_id)).map(t => ({ user_id: t.user_id, tecnico_nome: t.mecanico_tecnico_nome, tecnico_email: emailMap[t.user_id] || '', mecanico_role: t.mecanico_role })).sort((a: Tecnico, b: Tecnico) => a.tecnico_nome.localeCompare(b.tecnico_nome)))
    setOrdens((ords as OrdemServico[]) || [])
    setAlertas((alerts as Alerta[]) || [])
    setCaminhos((cams as Caminho[]) || [])
    setExecucoesRecentes((execs as Execucao[]) || [])
    setReqsMecanico((reqsMec as RequisicaoMecanico[]) || [])
    setOcorrencias((ocors as Ocorrencia[]) || [])
    setOpasResolvidas((opas as OpaResolvida[]) || [])
    setJustificativas((justs as Justificativa[]) || [])
    setLoading(false)
  }, [])

  useEffect(() => {
    carregar()
    // Verificar atrasos automaticamente ao abrir o painel
    fetch('/api/painel-mecanicos/verificar-atrasos', { method: 'POST' }).catch(() => {})
  }, [carregar])

  useEffect(() => {
    const channels = [
      supabase.channel('painel_os').on('postgres_changes', { event: '*', schema: 'public', table: 'Ordem_Servico' }, () => carregar()).subscribe(),
      supabase.channel('painel_alertas').on('postgres_changes', { event: '*', schema: 'public', table: 'painel_alertas' }, () => carregar()).subscribe(),
      supabase.channel('painel_exec').on('postgres_changes', { event: '*', schema: 'public', table: 'os_tecnico_execucao' }, () => carregar()).subscribe(),
      supabase.channel('painel_req_m').on('postgres_changes', { event: '*', schema: 'public', table: 'mecanico_requisicoes' }, () => carregar()).subscribe(),
      supabase.channel('painel_just').on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_justificativas' }, () => carregar()).subscribe(),
      supabase.channel('painel_cam').on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_caminhos' }, () => carregar()).subscribe(),
      supabase.channel('painel_agenda_visao').on('postgres_changes', { event: '*', schema: 'public', table: 'agenda_visao' }, () => carregar()).subscribe(),
      supabase.channel('painel_ocorr').on('postgres_changes', { event: '*', schema: 'public', table: 'tecnico_ocorrencias' }, () => carregar()).subscribe(),
      supabase.channel('painel_opas').on('postgres_changes', { event: '*', schema: 'public', table: 'portal_opas' }, () => carregar()).subscribe(),
    ]
    return () => { channels.forEach(c => supabase.removeChannel(c)) }
  }, [carregar])

  const tecnicosAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')
  const ordensAtivasCount = useMemo(() => ordens.filter(o => o.Status !== 'Concluída' && o.Status !== 'Cancelada').length, [ordens])
  const alertasAbertosCount = useMemo(() => alertas.filter(a => a.status === 'aberto').length, [alertas])
  const pontuacaoTecnico = useMemo(() => { const m: Record<string, number> = {}; tecnicos.forEach(t => { m[t.tecnico_nome] = 100 }); ocorrencias.forEach(o => { if (m[o.tecnico_nome] !== undefined) { const j = justificativas.find(j => j.id_ocorrencia === o.id && j.status === 'aprovada' && j.descontar_comissao === false); if (!j) m[o.tecnico_nome] = Math.max(0, (m[o.tecnico_nome] || 100) - o.pontos_descontados) } }); return m }, [tecnicos, ocorrencias, justificativas])
  const ordensAtrasoPorTecnico = useMemo(() => { const m: Record<string, OrdemServico[]> = {}; const hoje = new Date(); tecnicos.forEach(tec => { const o = ordens.filter(o => o.Status !== 'Concluída' && o.Status !== 'Cancelada' && (nomesBatem(tec.tecnico_nome, o.Os_Tecnico) || nomesBatem(tec.tecnico_nome, o.Os_Tecnico2))); const a = o.filter(o => o.Previsao_Execucao && new Date(o.Previsao_Execucao + 'T23:59:59') < hoje); if (a.length > 0) m[tec.tecnico_nome] = a }); return m }, [tecnicos, ordens])
  const ordensPorTecnico = useMemo(() => { const m: Record<string, OrdemServico[]> = {}; tecnicos.forEach(tec => { m[tec.tecnico_nome] = ordens.filter(o => o.Status !== 'Concluída' && o.Status !== 'Cancelada' && (nomesBatem(tec.tecnico_nome, o.Os_Tecnico) || nomesBatem(tec.tecnico_nome, o.Os_Tecnico2))) }); return m }, [tecnicos, ordens])

  const notificarAdmins = async (tipo: string, titulo: string, descricao?: string, link?: string) => {
    try { const { data: admins } = await supabase.from('portal_permissoes').select('user_id, categoria, notif_silenciado').eq('is_admin', true); if (!admins || admins.length === 0) return; const ids = filtrarDestinatarios(tipo, admins); if (ids.length === 0) return; await supabase.from('portal_notificacoes').insert(ids.map((user_id) => ({ user_id, tipo, titulo, descricao: descricao || null, link: link || '/painel-mecanicos' }))) } catch { }
  }
  const aprovarRequisicao = async (reqId: number) => { if (!podeAprovar) return; await supabase.from('mecanico_requisicoes').update({ status: 'aprovada', data_aprovacao: new Date().toISOString() }).eq('id', reqId); const req = reqsMecanico.find(r => r.id === reqId); if (req) { await supabase.from('mecanico_notificacoes').insert({ tecnico_nome: req.tecnico_nome, tipo: 'requisicao', titulo: 'Requisição aprovada', descricao: `Sua requisição "${req.material_solicitado}" foi aprovada.`, link: '', lida: false }); await notificarAdmins('pos', `Requisição aprovada - ${req.tecnico_nome}`, `Material: ${req.material_solicitado}`) }; carregar() }
  const recusarRequisicao = async (reqId: number) => { if (!podeRecusar) return; if (!confirm('Recusar esta requisição?')) return; const req = reqsMecanico.find(r => r.id === reqId); await supabase.from('mecanico_requisicoes').update({ status: 'recusada' }).eq('id', reqId); if (req) { await supabase.from('mecanico_notificacoes').insert({ tecnico_nome: req.tecnico_nome, tipo: 'requisicao', titulo: 'Requisição recusada', descricao: `Sua requisição "${req.material_solicitado}" foi recusada.`, link: '', lida: false }) }; carregar() }
  const converterAlertaEmOcorrencia = async (alerta: Alerta, tipo: string, pontos: number) => {
    if (!podeConverter) return
    // 1) Criar ocorrencia
    await supabase.from('tecnico_ocorrencias').insert({
      tecnico_nome: alerta.tecnico_nome,
      id_ordem: alerta.referencia_id || null,
      tipo,
      descricao: alerta.descricao,
      pontos_descontados: pontos,
      data: new Date().toISOString().split('T')[0],
    })
    // 2) Fechar o alerta
    await supabase.from('painel_alertas').update({
      status: 'fechado', data_fim: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    }).eq('id', alerta.id)
    // 3) Notificações
    const tipoLabel = (TIPO_OCORRENCIA[tipo] || TIPO_OCORRENCIA.outros).label
    await notificarAdmins('pos', `Alerta virou ocorrencia - ${alerta.tecnico_nome}`, `${tipoLabel}: ${alerta.descricao} | -${pontos} pts`)
    await supabase.from('mecanico_notificacoes').insert({
      tecnico_nome: alerta.tecnico_nome, tipo: 'execucao',
      titulo: `Ocorrencia registrada: ${tipoLabel}`,
      descricao: `${alerta.descricao} (-${pontos} pts)`,
      link: '', lida: false,
    })
    carregar()
  }

  // Avaliação de justificativa REMOVIDA do painel (decisão 24/07): aprovar/
  // recusar defesa agora é SÓ pela ficha do funcionário no RH.

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 80, color: 'var(--portal-text-muted)', gap: 10 }}>
      <RefreshCw size={16} style={{ animation: 'spin 1s linear infinite' }} />
      <span style={{ fontSize: 14 }}>Carregando...</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )

  const TABS: { id: Bloco; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: 'visao', label: 'Dashboard', icon: <Radar size={14} /> },
    { id: 'ordens', label: 'Agenda', icon: <Calendar size={14} /> },
    { id: 'alertas', label: 'Alertas', icon: <AlertTriangle size={14} />, count: alertasAbertosCount },
    { id: 'ocorrencias', label: 'Ocorrencias', icon: <AlertOctagon size={14} />, count: (() => { const ma = `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2,'0')}`; const c = ocorrencias.filter(o => o.data?.startsWith(ma)).length; return c > 0 ? c : undefined })() },
    { id: 'relatorio', label: 'Relatorio', icon: <BarChart3 size={14} /> },
  ]

  const INP: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 8, border: '1px solid var(--portal-border)', fontSize: 13, boxSizing: 'border-box', background: 'var(--portal-bg-secondary)', outline: 'none', color: 'var(--portal-text)' }
  const MLBL: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--portal-text-secondary)', display: 'block', marginBottom: 5 }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', minHeight: 'calc(100vh - 84px)', position: 'relative' }}>
      {/* ══ CONTEUDO PRINCIPAL ══ */}
      <div style={{ padding: '16px 20px', overflow: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Painel Mecanicos</h1>
            {/* Tabs de navegação */}
            <div style={{ display: 'flex', gap: 2 }}>
              {TABS.map(t => {
                const active = blocoAtivo === t.id
                return (
                  <button key={t.id} onClick={() => setBlocoAtivo(t.id)} style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                    background: active ? '#111827' : 'transparent',
                    color: active ? '#fff' : 'var(--portal-text-muted)',
                    fontSize: 12, fontWeight: active ? 600 : 500, transition: 'all .15s',
                  }}>
                    {t.icon}
                    {t.label}
                    {(t.count !== undefined && t.count > 0) && (
                      <span style={{ fontSize: 10, fontWeight: 700, background: active ? 'rgba(255,255,255,.2)' : 'var(--portal-bg-secondary)', color: active ? '#fff' : 'var(--portal-text-muted)', padding: '0 5px', borderRadius: 4, lineHeight: '16px' }}>{t.count}</span>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Setas semana (só na Agenda) */}
            {blocoAtivo === 'ordens' && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 4 }}>
                <button onClick={() => setSemanaOffset(p => p - 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <ChevronLeft size={14} color="#555" />
                </button>
                <button onClick={() => setSemanaOffset(p => p + 1)} style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                  <ChevronRight size={14} color="#555" />
                </button>
                {semanaOffset !== 0 && (
                  <button onClick={() => setSemanaOffset(0)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-text)', background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer' }}>Hoje</button>
                )}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button onClick={() => setShowOcorrenciaModal(true)} {...gateBtn(podeCriarOc)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: '#111827', color: '#fff', border: 'none', borderRadius: 6, padding: '6px 12px', fontSize: 12, fontWeight: 500, cursor: 'pointer', ...estiloSemPermissao(podeCriarOc) }}>
              <AlertOctagon size={12} /> Ocorrencia
            </button>
            <button onClick={carregar} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer' }}>
              <RefreshCw size={12} /> Atualizar
            </button>
            <a href="/tv-painel" target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', borderRadius: 6, padding: '6px 12px', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}>TV</a>
          </div>
        </div>

        {blocoAtivo === 'visao' && <BlocoVisaoGeral tecnicos={tecnicos} ordens={ordens} caminhos={caminhos} />}
        {blocoAtivo === 'ordens' && <BlocoAgenda tecnicos={tecnicos} ordens={ordens} semanaOffset={semanaOffset} />}
        {blocoAtivo === 'alertas' && <BlocoAlertas tecnicos={tecnicos} alertas={alertas} onRecarregar={carregar} userName={userProfile?.nome || ''} ordens={ordens} reqsMecanico={reqsMecanico} justificativas={justificativas} ocorrencias={ocorrencias} onAprovarRequisicao={aprovarRequisicao} onRecusarRequisicao={recusarRequisicao} onConverterOcorrencia={converterAlertaEmOcorrencia} tipoOcorrencia={TIPO_OCORRENCIA} podeAprovar={podeAprovar} podeRecusar={podeRecusar} podeConverter={podeConverter} />}
        {blocoAtivo === 'ocorrencias' && <BlocoOcorrencias tecnicos={tecnicos} ocorrencias={ocorrencias} justificativas={justificativas} opasResolvidas={opasResolvidas} tipoOcorrencia={TIPO_OCORRENCIA} onRecarregar={carregar} criadoPor={userProfile?.nome || undefined} />}
        {blocoAtivo === 'relatorio' && <BlocoRelatorioMensal tecnicos={tecnicos} />}
      </div>


      {/* ══ MODAL OCORRENCIA (compartilhado — catálogo + anexos) ══ */}
      <OcorrenciaFormModal
        aberto={showOcorrenciaModal}
        onFechar={() => setShowOcorrenciaModal(false)}
        onRegistrada={carregar}
        tecnicos={tecnicos.map(t => t.tecnico_nome)}
        criadoPor={userProfile?.nome || undefined}
      />
    </div>
  )
}
