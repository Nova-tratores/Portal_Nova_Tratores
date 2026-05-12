'use client'
import { useState, useMemo, useRef } from 'react'
import {
  Plus, X, Camera,
  MessageSquare, Check, ThumbsUp, ThumbsDown, Filter, AlertOctagon
} from 'lucide-react'
import { supabase } from '@/lib/supabase'

// ─── Types ───────────────────────────────────────────────────────
export interface Alerta {
  id: number; tecnico_nome: string; tipo: string; descricao: string
  referencia_id: string | null; data_inicio: string; data_fim: string | null
  mes_referencia: string; status: string; contestacao_motivo: string | null
  contestado_por: string | null; foto_url: string | null; alvo: string
  created_at: string; updated_at: string | null
}
interface Tecnico { user_id: string; tecnico_nome: string; tecnico_email: string; mecanico_role: 'tecnico' | 'observador' }
interface OrdemServico { Id_Ordem: string; Status: string; Os_Cliente: string; Cnpj_Cliente: string; Os_Tecnico: string; Os_Tecnico2: string; Previsao_Execucao: string | null; Previsao_Faturamento: string | null; Serv_Solicitado: string; Endereco_Cliente: string; Cidade_Cliente: string; Tipo_Servico: string; Qtd_HR: string | number | null }
interface RequisicaoMecanico { id: number; tecnico_nome: string; material_solicitado: string; quantidade: string; urgencia: string; id_ordem: string | null; status: string; created_at: string }
interface Ocorrencia { id: number; tecnico_nome: string; id_ordem: string | null; tipo: string; descricao: string; pontos_descontados: number; data: string }
interface Justificativa { id: number; tecnico_nome: string; id_ordem: string | null; id_ocorrencia: number | null; justificativa: string; status: string; descontar_comissao: boolean | null; avaliado_por: string | null; data_avaliacao: string | null; created_at: string }

// ─── Helpers ─────────────────────────────────────────────────────
function getMesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function calcDias(inicio: string, fim: string | null): number {
  const d1 = new Date(inicio + 'T00:00:00')
  const d2 = fim ? new Date(fim + 'T00:00:00') : new Date()
  return Math.max(0, Math.floor((d2.getTime() - d1.getTime()) / 86400000))
}
function formatDataHora(iso: string): string {
  try {
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  } catch { return iso }
}

const TIPO_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ordem_pendente: { label: 'Ordem de Serviço', color: '#1E40AF', bg: '#DBEAFE' },
  requisicao_pendente: { label: 'Requisição', color: '#92400E', bg: '#FEF3C7' },
  infraestrutura: { label: 'Infraestrutura', color: '#0E7490', bg: '#CFFAFE' },
  manual: { label: 'Manual', color: '#7C3AED', bg: '#EDE9FE' },
}

// ─── Component ───────────────────────────────────────────────────
export default function BlocoAlertas({
  tecnicos, alertas, onRecarregar, userName, ordens, reqsMecanico, justificativas, ocorrencias,
  onAprovarRequisicao, onRecusarRequisicao, onAvaliarJustificativa, onConverterOcorrencia, tipoOcorrencia,
}: {
  tecnicos: Tecnico[]; alertas: Alerta[]; onRecarregar: () => void; userName: string
  ordens: OrdemServico[]; reqsMecanico: RequisicaoMecanico[]; justificativas: Justificativa[]
  ocorrencias: Ocorrencia[]
  onAprovarRequisicao: (id: number) => void; onRecusarRequisicao: (id: number) => void
  onAvaliarJustificativa: (id: number, aprovada: boolean) => void
  onConverterOcorrencia: (alerta: Alerta, tipo: string, pontos: number) => Promise<void>
  tipoOcorrencia: Record<string, { label: string; color: string }>
}) {
  const [filtroTecnico, setFiltroTecnico] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [showNovoModal, setShowNovoModal] = useState(false)
  const [showContestarModal, setShowContestarModal] = useState<number | null>(null)
  const [contestacaoMotivo, setContestacaoMotivo] = useState('')
  const [showConverterModal, setShowConverterModal] = useState<Alerta | null>(null)
  const [converterDados, setConverterDados] = useState({ tipo: 'atraso', pontos_descontados: 5 })
  const [novoAlerta, setNovoAlerta] = useState({ tecnico_nome: '', descricao: '', tipo: 'manual', alvo: 'individual' as 'individual' | 'todos' })
  const [fotoFile, setFotoFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const tecAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')
  const mesAtual = getMesAtual()
  const reqPendentes = reqsMecanico.filter(r => r.status === 'pendente')
  const justPendentes = justificativas.filter(j => j.status === 'pendente')

  // Lookup rápido de ordens
  const ordensMap = useMemo(() => {
    const m: Record<string, OrdemServico> = {}
    ordens.forEach(o => { m[o.Id_Ordem] = o })
    return m
  }, [ordens])

  // Tipos existentes nos alertas (para o filtro)
  const tiposExistentes = useMemo(() => {
    const s = new Set<string>()
    alertas.forEach(a => s.add(a.tipo))
    return Array.from(s).sort()
  }, [alertas])

  // Filtrar alertas — só pendentes (aberto/contestado), max 5 dias
  const alertasPendentes = useMemo(() => {
    const hoje = new Date()
    let f = alertas.filter(a => {
      if (a.status !== 'aberto' && a.status !== 'contestado') return false
      // Esconder alertas com mais de 5 dias
      const criado = new Date(a.created_at)
      const diffDias = Math.floor((hoje.getTime() - criado.getTime()) / 86400000)
      if (diffDias > 5) return false
      return true
    })
    if (filtroTecnico !== 'todos') f = f.filter(a => a.tecnico_nome === filtroTecnico || a.alvo === 'todos')
    if (filtroTipo !== 'todos') f = f.filter(a => a.tipo === filtroTipo)
    return f.sort((a, b) => b.created_at.localeCompare(a.created_at))
  }, [alertas, filtroTecnico, filtroTipo])

  const totalAbertos = useMemo(() => alertasPendentes.filter(a => a.status === 'aberto').length, [alertasPendentes])
  const totalContestados = useMemo(() => alertasPendentes.filter(a => a.status === 'contestado').length, [alertasPendentes])

  // ─── Actions ─────────────────────────────────────────────────
  const criarAlertaManual = async () => {
    if (!novoAlerta.descricao) return; setUploading(true)
    let foto_url: string | null = null
    if (fotoFile) {
      const ext = fotoFile.name.split('.').pop()
      const path = `alertas/${Date.now()}.${ext}`
      const { error } = await supabase.storage.from('anexos').upload(path, fotoFile)
      if (!error) { const { data: urlData } = supabase.storage.from('anexos').getPublicUrl(path); foto_url = urlData.publicUrl }
    }
    const hoje = new Date().toISOString().split('T')[0]
    if (novoAlerta.alvo === 'todos') {
      await supabase.from('painel_alertas').insert(tecAtivos.map(tec => ({
        tecnico_nome: tec.tecnico_nome, tipo: novoAlerta.tipo, descricao: novoAlerta.descricao,
        referencia_id: null, data_inicio: hoje, data_fim: null, mes_referencia: mesAtual,
        status: 'aberto', foto_url, alvo: 'todos',
      })))
    } else {
      if (!novoAlerta.tecnico_nome) { setUploading(false); return }
      await supabase.from('painel_alertas').insert({
        tecnico_nome: novoAlerta.tecnico_nome, tipo: novoAlerta.tipo, descricao: novoAlerta.descricao,
        referencia_id: null, data_inicio: hoje, data_fim: null, mes_referencia: mesAtual,
        status: 'aberto', foto_url, alvo: 'individual',
      })
    }
    setNovoAlerta({ tecnico_nome: '', descricao: '', tipo: 'manual', alvo: 'individual' }); setFotoFile(null)
    setShowNovoModal(false); setUploading(false); onRecarregar()
  }

  const contestarAlerta = async (alertaId: number) => {
    if (!contestacaoMotivo.trim()) return
    await supabase.from('painel_alertas').update({
      status: 'contestado', contestacao_motivo: contestacaoMotivo, contestado_por: userName,
      updated_at: new Date().toISOString(),
    }).eq('id', alertaId)
    setContestacaoMotivo(''); setShowContestarModal(null); onRecarregar()
  }

  const fecharAlerta = async (alertaId: number) => {
    await supabase.from('painel_alertas').update({
      status: 'fechado', data_fim: new Date().toISOString().split('T')[0],
      updated_at: new Date().toISOString(),
    }).eq('id', alertaId)
    onRecarregar()
  }

  // ─── Estilos auxiliares ────────────────────────────────────────
  const SEL: React.CSSProperties = { padding: '7px 10px', borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 13, fontWeight: 600, background: '#fff', color: '#111', cursor: 'pointer' }

  // ─── Render ────────────────────────────────────────────────────
  return (
    <div>
      {/* ══ JUSTIFICATIVAS PENDENTES ══ */}
      {justPendentes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            Justificativas pendentes
            <span style={{ fontSize: 12, fontWeight: 700, background: '#FFFBEB', color: '#D97706', padding: '2px 8px', borderRadius: 4 }}>{justPendentes.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 1, border: '1px solid #D0D0D0', background: '#D0D0D0' }}>
            {justPendentes.map(j => {
              const oc = ocorrencias.find(o => o.id === j.id_ocorrencia)
              return (
                <div key={j.id} style={{ background: '#fff', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#111' }}>{j.tecnico_nome}</span>
                    {j.id_ordem && <span style={{ fontSize: 12, color: '#111', fontWeight: 500 }}>OS: {j.id_ordem}</span>}
                  </div>
                  {oc && (
                    <div style={{ background: '#F7F7F7', padding: '8px 10px', borderRadius: 4, marginBottom: 8, border: '1px solid #E8E8E8' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: '#111', marginBottom: 3 }}>Ocorrência</div>
                      <div style={{ fontSize: 13, color: '#111' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: `${(tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).color}18`, color: (tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).color, marginRight: 6 }}>
                          {(tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).label}
                        </span>
                        {oc.descricao}
                        <span style={{ color: '#DC2626', fontWeight: 700, marginLeft: 6 }}>-{oc.pontos_descontados}pts</span>
                      </div>
                    </div>
                  )}
                  <div style={{ background: '#FFFBEB', padding: '8px 10px', borderRadius: 4, marginBottom: 10, border: '1px solid #FEF3C7', fontSize: 13, color: '#111', lineHeight: 1.4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 3 }}>Justificativa</div>
                    {j.justificativa}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => onAvaliarJustificativa(j.id, true)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#111', color: '#fff', border: 'none', borderRadius: 4, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <ThumbsUp size={13} /> Aceitar
                    </button>
                    <button onClick={() => onAvaliarJustificativa(j.id, false)} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, background: '#fff', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 4, padding: '8px 0', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                      <ThumbsDown size={13} /> Recusar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══ REQUISIÇÕES PENDENTES ══ */}
      {reqPendentes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#111', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            Requisições de material
            <span style={{ fontSize: 12, fontWeight: 700, background: '#FFFBEB', color: '#D97706', padding: '2px 8px', borderRadius: 4 }}>{reqPendentes.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1, border: '1px solid #D0D0D0', background: '#D0D0D0' }}>
            {reqPendentes.map(req => (
              <div key={req.id} style={{ background: '#fff', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{req.tecnico_nome.split(' ').slice(0, 2).join(' ')}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: req.urgencia === 'alta' ? '#FEE2E2' : '#F0F0F0', color: req.urgencia === 'alta' ? '#DC2626' : '#111' }}>
                    {req.urgencia === 'alta' ? 'Urgente' : 'Normal'}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>{req.material_solicitado}</div>
                <div style={{ fontSize: 12, color: '#111', marginTop: 3, fontWeight: 500 }}>
                  {req.quantidade && `Qtd: ${req.quantidade} · `}{req.id_ordem && `OS: ${req.id_ordem} · `}{formatDataHora(req.created_at)}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => onAprovarRequisicao(req.id)} style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 700, background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Aprovar</button>
                  <button onClick={() => onRecusarRequisicao(req.id)} style={{ flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 700, background: '#fff', color: '#111', border: '1px solid #D0D0D0', borderRadius: 4, cursor: 'pointer' }}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ TOOLBAR + FILTROS ══ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: '#111' }}>Alertas</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 4, background: totalAbertos > 0 ? '#FEE2E2' : '#D1FAE5', color: totalAbertos > 0 ? '#DC2626' : '#065F46' }}>
            {totalAbertos} aberto(s)
          </span>
          {totalContestados > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>
              {totalContestados} contestado(s)
            </span>
          )}
          <span style={{ width: 1, height: 20, background: '#D0D0D0', margin: '0 4px' }} />
          <Filter size={14} color="#111" />
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)} style={SEL}>
            <option value="todos">Todos técnicos</option>
            {tecAtivos.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome.split(' ').slice(0, 2).join(' ')}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={SEL}>
            <option value="todos">Todos tipos</option>
            {tiposExistentes.map(t => <option key={t} value={t}>{(TIPO_LABELS[t] || { label: t }).label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowNovoModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 4, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#111', color: '#fff', border: 'none' }}>
            <Plus size={13} /> Novo Alerta
          </button>
        </div>
      </div>

      {/* ══ LISTA DE ALERTAS PENDENTES ══ */}
      {alertasPendentes.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: '#999', fontSize: 14, fontWeight: 500, border: '1px solid #E8E8E8', borderRadius: 8, background: '#FAFAFA' }}>
          Nenhum alerta pendente{filtroTecnico !== 'todos' || filtroTipo !== 'todos' ? ' (com os filtros aplicados)' : ''}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 10 }}>
          {alertasPendentes.map(a => {
            const tipoInfo = TIPO_LABELS[a.tipo] || TIPO_LABELS.manual
            const dias = calcDias(a.data_inicio, a.data_fim)
            const isContestado = a.status === 'contestado'
            const ordem = a.tipo === 'ordem_pendente' && a.referencia_id ? ordensMap[a.referencia_id] : null
            const corDias = dias >= 4 ? '#DC2626' : dias >= 2 ? '#D97706' : '#111'

            return (
              <div key={a.id} style={{
                background: '#fff', borderRadius: 10, border: '1px solid #E5E7EB',
                borderLeft: `4px solid ${isContestado ? '#F59E0B' : corDias}`,
                padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10,
              }}>
                {/* Topo: técnico + badge dias */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#111' }}>
                      {a.tecnico_nome.split(' ').slice(0, 2).join(' ')}
                    </span>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: tipoInfo.bg, color: tipoInfo.color }}>
                      {tipoInfo.label}
                    </span>
                    {isContestado && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>Contestado</span>
                    )}
                  </div>
                  <div style={{
                    fontSize: 13, fontWeight: 900, color: '#fff', borderRadius: 6,
                    background: corDias, padding: '3px 10px', minWidth: 36, textAlign: 'center',
                  }}>
                    {dias}d
                  </div>
                </div>

                {/* Descrição */}
                <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>
                  {a.tipo === 'ordem_pendente' && a.referencia_id && (
                    <span style={{ fontWeight: 700, color: '#111', marginRight: 6 }}>OS #{a.referencia_id}</span>
                  )}
                  {a.tipo === 'ordem_pendente' && ordem
                    ? <>{ordem.Os_Cliente}{ordem.Cidade_Cliente ? ` — ${ordem.Cidade_Cliente}` : ''}</>
                    : a.descricao
                  }
                </div>

                {/* Foto */}
                {a.foto_url && (
                  <img src={a.foto_url} alt="" style={{ maxWidth: 120, maxHeight: 60, borderRadius: 6, objectFit: 'cover', cursor: 'pointer' }}
                    onClick={() => window.open(a.foto_url!, '_blank')} />
                )}

                {/* Contestação */}
                {isContestado && a.contestacao_motivo && (
                  <div style={{ background: '#FFFBEB', padding: '8px 10px', borderRadius: 6, border: '1px solid #FEF3C7', fontSize: 12, color: '#92400E', lineHeight: 1.4 }}>
                    <strong>Contestação:</strong> {a.contestacao_motivo}{a.contestado_por ? ` — ${a.contestado_por}` : ''}
                  </div>
                )}

                {/* Rodapé: data + botões */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                  <span style={{ fontSize: 11, color: '#9CA3AF', fontWeight: 500 }}>
                    {formatDataHora(a.created_at)}
                  </span>
                  <div style={{ display: 'flex', gap: 5 }}>
                    {!isContestado && (
                      <button onClick={() => setShowContestarModal(a.id)} style={{
                        background: '#FEF3C7', color: '#92400E', border: 'none', borderRadius: 5,
                        padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}><MessageSquare size={11} /> Contestar</button>
                    )}
                    <button onClick={() => { setConverterDados({ tipo: 'atraso', pontos_descontados: 5 }); setShowConverterModal(a) }} style={{
                      background: '#FEE2E2', color: '#DC2626', border: 'none', borderRadius: 5,
                      padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}><AlertOctagon size={11} /> Ocorrência</button>
                    <button onClick={() => fecharAlerta(a.id)} style={{
                      background: '#D1FAE5', color: '#065F46', border: 'none', borderRadius: 5,
                      padding: '5px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}><Check size={11} /> Dispensar</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ══ MODAL NOVO ALERTA ══ */}
      {showNovoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: '100%', maxWidth: 460, border: '1px solid #D0D0D0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0 }}>Novo Alerta</h3>
              <button onClick={() => setShowNovoModal(false)} style={{ background: '#F0F0F0', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} color="#111" /></button>
            </div>

            {/* Destino */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', display: 'block', marginBottom: 5 }}>Destino</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['individual', 'todos'] as const).map(alvo => (
                  <button key={alvo} onClick={() => setNovoAlerta(p => ({ ...p, alvo }))} style={{
                    flex: 1, padding: 9, borderRadius: 4, fontSize: 13, fontWeight: 700,
                    border: `1px solid ${novoAlerta.alvo === alvo ? '#111' : '#D0D0D0'}`,
                    background: novoAlerta.alvo === alvo ? '#111' : '#fff',
                    color: novoAlerta.alvo === alvo ? '#fff' : '#111', cursor: 'pointer',
                  }}>{alvo === 'individual' ? 'Técnico específico' : 'Todos os técnicos'}</button>
                ))}
              </div>
            </div>

            {/* Técnico */}
            {novoAlerta.alvo === 'individual' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: '#111', display: 'block', marginBottom: 5 }}>Técnico</label>
                <select value={novoAlerta.tecnico_nome} onChange={e => setNovoAlerta(p => ({ ...p, tecnico_nome: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 13, background: '#fff', color: '#111' }}>
                  <option value="">Selecione...</option>
                  {tecAtivos.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>)}
                </select>
              </div>
            )}

            {/* Tipo */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', display: 'block', marginBottom: 5 }}>Tipo</label>
              <select value={novoAlerta.tipo} onChange={e => setNovoAlerta(p => ({ ...p, tipo: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 13, background: '#fff', color: '#111' }}>
                {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            {/* Descrição */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', display: 'block', marginBottom: 5 }}>Descrição</label>
              <textarea value={novoAlerta.descricao} onChange={e => setNovoAlerta(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descreva o alerta..." rows={3}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 13, resize: 'vertical', color: '#111', boxSizing: 'border-box' }} />
            </div>

            {/* Foto */}
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', display: 'block', marginBottom: 5 }}>Foto (opcional)</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => setFotoFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: '#fff', color: '#111',
                border: '1px dashed #D0D0D0', borderRadius: 4, padding: '9px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center',
              }}><Camera size={14} />{fotoFile ? fotoFile.name : 'Anexar foto'}</button>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowNovoModal(false)} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#F0F0F0', color: '#111', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarAlertaManual} disabled={uploading} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#111', color: '#fff', border: 'none', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Salvando...' : 'Criar Alerta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CONVERTER EM OCORRÊNCIA ══ */}
      {showConverterModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: '100%', maxWidth: 420, border: '1px solid #D0D0D0' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: 0 }}>Converter em Ocorrencia</h3>
              <button onClick={() => setShowConverterModal(null)} style={{ background: '#F0F0F0', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} color="#111" /></button>
            </div>

            <div style={{ background: '#F7F7F7', padding: '10px 12px', borderRadius: 6, marginBottom: 16, border: '1px solid #E8E8E8' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#555', marginBottom: 4 }}>Alerta original</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#111' }}>{showConverterModal.tecnico_nome}</div>
              <div style={{ fontSize: 13, color: '#111', marginTop: 2 }}>{showConverterModal.descricao}</div>
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', display: 'block', marginBottom: 5 }}>Tipo da Ocorrencia</label>
              <select value={converterDados.tipo} onChange={e => setConverterDados(p => ({ ...p, tipo: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 13, background: '#fff', color: '#111' }}>
                {Object.entries(tipoOcorrencia).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: '#111', display: 'block', marginBottom: 5 }}>Pontos a descontar</label>
              <input type="number" min={0} max={100} value={converterDados.pontos_descontados}
                onChange={e => setConverterDados(p => ({ ...p, pontos_descontados: Number(e.target.value) }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 13, background: '#fff', color: '#111', boxSizing: 'border-box' }} />
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowConverterModal(null)} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#F0F0F0', color: '#111', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={async () => {
                await onConverterOcorrencia(showConverterModal, converterDados.tipo, converterDados.pontos_descontados)
                setShowConverterModal(null)
              }} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Registrar Ocorrencia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ MODAL CONTESTAR ══ */}
      {showContestarModal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', borderRadius: 8, padding: 24, width: '100%', maxWidth: 400, border: '1px solid #D0D0D0' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: '#111', margin: '0 0 14px' }}>Contestar Alerta</h3>
            <textarea value={contestacaoMotivo} onChange={e => setContestacaoMotivo(e.target.value)}
              placeholder="Motivo da contestação..." rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid #D0D0D0', fontSize: 13, resize: 'vertical', marginBottom: 14, color: '#111', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowContestarModal(null); setContestacaoMotivo('') }} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#F0F0F0', color: '#111', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => contestarAlerta(showContestarModal)} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#F59E0B', color: '#fff', border: 'none', cursor: 'pointer' }}>Contestar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
