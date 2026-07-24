'use client'
import { useState, useMemo, useRef } from 'react'
import {
  Plus, X, Camera,
  MessageSquare, Check, Filter, AlertOctagon,
  ChevronDown, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { gateBtn, estiloSemPermissao } from '@/lib/permissoes/ui'

// --- Types ---
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

// --- Helpers ---
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
function extrairSolicitacao(serv: string): string {
  if (!serv) return ''
  const idx = serv.indexOf('Solicitacao do cliente:')
  if (idx === -1) {
    const idx2 = serv.indexOf('Solicitação do cliente:')
    if (idx2 === -1) return serv.substring(0, 120)
    const after = serv.substring(idx2 + 'Solicitação do cliente:'.length)
    const fim = after.indexOf('Serviço Realizado')
    return (fim > -1 ? after.substring(0, fim) : after).replace(/\n/g, ' ').trim().substring(0, 120)
  }
  const after = serv.substring(idx + 'Solicitacao do cliente:'.length)
  const fim = after.indexOf('Servico Realizado')
  return (fim > -1 ? after.substring(0, fim) : after).replace(/\n/g, ' ').trim().substring(0, 120)
}

const TIPO_LABELS: Record<string, { label: string; color: string; bg: string }> = {
  ordem_pendente: { label: 'OS Pendente', color: '#1E40AF', bg: '#DBEAFE' },
  requisicao_pendente: { label: 'Requisicao', color: '#92400E', bg: '#FEF3C7' },
  infraestrutura: { label: 'Infraestrutura', color: '#0E7490', bg: '#CFFAFE' },
  manual: { label: 'Manual', color: '#7C3AED', bg: '#EDE9FE' },
}

type SortCol = 'tecnico' | 'tipo' | 'dias' | 'descricao'
type SortDir = 'asc' | 'desc'

// --- Component ---
export default function BlocoAlertas({
  tecnicos, alertas, onRecarregar, userName, ordens, reqsMecanico, justificativas, ocorrencias,
  onAprovarRequisicao, onRecusarRequisicao, onConverterOcorrencia, tipoOcorrencia,
  podeAprovar = true, podeRecusar = true, podeConverter = true,
}: {
  tecnicos: Tecnico[]; alertas: Alerta[]; onRecarregar: () => void; userName: string
  ordens: OrdemServico[]; reqsMecanico: RequisicaoMecanico[]; justificativas: Justificativa[]
  ocorrencias: Ocorrencia[]
  onAprovarRequisicao: (id: number) => void; onRecusarRequisicao: (id: number) => void
  onConverterOcorrencia: (alerta: Alerta, tipo: string, pontos: number) => Promise<void>
  tipoOcorrencia: Record<string, { label: string; color: string }>
  podeAprovar?: boolean; podeRecusar?: boolean; podeConverter?: boolean
}) {
  const [filtroTecnico, setFiltroTecnico] = useState('todos')
  const [filtroTipo, setFiltroTipo] = useState('todos')
  const [sortCol, setSortCol] = useState<SortCol>('dias')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [expandedId, setExpandedId] = useState<number | null>(null)
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

  const ordensMap = useMemo(() => {
    const m: Record<string, OrdemServico> = {}
    ordens.forEach(o => { m[o.Id_Ordem] = o })
    return m
  }, [ordens])

  const tiposExistentes = useMemo(() => {
    const s = new Set<string>()
    alertas.forEach(a => s.add(a.tipo))
    return Array.from(s).sort()
  }, [alertas])

  // Filtrar alertas — so pendentes (aberto/contestado), criados a partir de hoje
  const alertasFiltrados = useMemo(() => {
    const hojeStr = new Date().toISOString().split('T')[0]
    let f = alertas.filter(a => {
      if (a.status !== 'aberto' && a.status !== 'contestado') return false
      // So mostrar alertas criados a partir de hoje
      const criadoStr = a.created_at ? a.created_at.split('T')[0] : a.data_inicio
      if (criadoStr < hojeStr) return false
      return true
    })
    if (filtroTecnico !== 'todos') f = f.filter(a => a.tecnico_nome === filtroTecnico || a.alvo === 'todos')
    if (filtroTipo !== 'todos') f = f.filter(a => a.tipo === filtroTipo)

    // Sorting
    f.sort((a, b) => {
      let cmp = 0
      if (sortCol === 'tecnico') cmp = a.tecnico_nome.localeCompare(b.tecnico_nome)
      else if (sortCol === 'tipo') cmp = a.tipo.localeCompare(b.tipo)
      else if (sortCol === 'dias') cmp = calcDias(a.data_inicio, a.data_fim) - calcDias(b.data_inicio, b.data_fim)
      else if (sortCol === 'descricao') cmp = a.descricao.localeCompare(b.descricao)
      return sortDir === 'asc' ? cmp : -cmp
    })
    return f
  }, [alertas, filtroTecnico, filtroTipo, sortCol, sortDir])

  const totalAbertos = useMemo(() => alertasFiltrados.filter(a => a.status === 'aberto').length, [alertasFiltrados])
  const totalContestados = useMemo(() => alertasFiltrados.filter(a => a.status === 'contestado').length, [alertasFiltrados])

  const toggleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) return <ArrowUpDown size={12} style={{ opacity: 0.3 }} />
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />
  }

  // --- Actions ---
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

  const SEL: React.CSSProperties = { padding: '7px 10px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, fontWeight: 600, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer' }

  const corDias = (dias: number) => dias >= 4 ? '#DC2626' : dias >= 2 ? '#D97706' : '#065F46'
  const bgDias = (dias: number) => dias >= 4 ? '#FEE2E2' : dias >= 2 ? '#FEF3C7' : '#D1FAE5'

  return (
    <div>
      {/* == JUSTIFICATIVAS PENDENTES == */}
      {justPendentes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            Justificativas pendentes
            <span style={{ fontSize: 13, fontWeight: 700, background: '#FFFBEB', color: '#D97706', padding: '3px 10px', borderRadius: 4 }}>{justPendentes.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: 1, border: '1px solid var(--portal-border)', background: 'var(--portal-border)' }}>
            {justPendentes.map(j => {
              const oc = ocorrencias.find(o => o.id === j.id_ocorrencia)
              return (
                <div key={j.id} style={{ background: 'var(--portal-bg-card)', padding: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{j.tecnico_nome}</span>
                    {j.id_ordem && <span style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 500 }}>OS: {j.id_ordem}</span>}
                  </div>
                  {oc && (
                    <div style={{ background: 'var(--portal-bg-secondary)', padding: '8px 10px', borderRadius: 4, marginBottom: 8, border: '1px solid var(--portal-border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-text)', marginBottom: 3 }}>Ocorrencia</div>
                      <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                        <span style={{ fontSize: 11, fontWeight: 700, padding: '1px 6px', borderRadius: 3, background: `${(tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).color}18`, color: (tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).color, marginRight: 6 }}>
                          {(tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).label}
                        </span>
                        {oc.descricao}
                        <span style={{ color: '#DC2626', fontWeight: 700, marginLeft: 6 }}>-{oc.pontos_descontados}pts</span>
                      </div>
                    </div>
                  )}
                  <div style={{ background: '#FFFBEB', padding: '8px 10px', borderRadius: 4, marginBottom: 10, border: '1px solid #FEF3C7', fontSize: 13, color: 'var(--portal-text)', lineHeight: 1.4 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#92400E', marginBottom: 3 }}>Justificativa</div>
                    {j.justificativa}
                  </div>
                  {/* Decisão do usuário (24/07): aprovar/recusar é SÓ pelo RH
                      (ficha do funcionário → aba Ocorrências) — aqui só exibe */}
                  <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', background: 'var(--portal-bg-secondary)', border: '1px dashed var(--portal-border)', borderRadius: 4, padding: '7px 10px' }}>
                    A avaliação desta defesa é feita pelo RH (ficha do funcionário → aba Ocorrências).
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* == REQUISICOES PENDENTES == */}
      {reqPendentes.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
            Requisicoes de material
            <span style={{ fontSize: 13, fontWeight: 700, background: '#FFFBEB', color: '#D97706', padding: '3px 10px', borderRadius: 4 }}>{reqPendentes.length}</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 1, border: '1px solid var(--portal-border)', background: 'var(--portal-border)' }}>
            {reqPendentes.map(req => (
              <div key={req.id} style={{ background: 'var(--portal-bg-card)', padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>{req.tecnico_nome.split(' ').slice(0, 2).join(' ')}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: req.urgencia === 'alta' ? '#FEE2E2' : 'var(--portal-bg-secondary)', color: req.urgencia === 'alta' ? '#DC2626' : 'var(--portal-text)' }}>
                    {req.urgencia === 'alta' ? 'Urgente' : 'Normal'}
                  </span>
                </div>
                <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--portal-text)' }}>{req.material_solicitado}</div>
                <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 3, fontWeight: 500 }}>
                  {req.quantidade && `Qtd: ${req.quantidade} · `}{req.id_ordem && `OS: ${req.id_ordem} · `}{formatDataHora(req.created_at)}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                  <button onClick={() => onAprovarRequisicao(req.id)} {...gateBtn(podeAprovar)} style={{ flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 700, background: '#111', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', ...estiloSemPermissao(podeAprovar) }}>Aprovar</button>
                  <button onClick={() => onRecusarRequisicao(req.id)} {...gateBtn(podeRecusar)} style={{ flex: 1, padding: '7px 0', fontSize: 13, fontWeight: 700, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', border: '1px solid var(--portal-border)', borderRadius: 4, cursor: 'pointer', ...estiloSemPermissao(podeRecusar) }}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* == TOOLBAR + FILTROS == */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--portal-text)' }}>Alertas</span>
          <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 4, background: totalAbertos > 0 ? '#FEE2E2' : '#D1FAE5', color: totalAbertos > 0 ? '#DC2626' : '#065F46' }}>
            {totalAbertos} aberto(s)
          </span>
          {totalContestados > 0 && (
            <span style={{ fontSize: 13, fontWeight: 700, padding: '4px 12px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>
              {totalContestados} contestado(s)
            </span>
          )}
          <span style={{ width: 1, height: 20, background: 'var(--portal-border)', margin: '0 4px' }} />
          <Filter size={14} color="var(--portal-text-secondary)" />
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)} style={SEL}>
            <option value="todos">Todos tecnicos</option>
            {tecAtivos.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome.split(' ').slice(0, 2).join(' ')}</option>)}
          </select>
          <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} style={SEL}>
            <option value="todos">Todos tipos</option>
            {tiposExistentes.map(t => <option key={t} value={t}>{(TIPO_LABELS[t] || { label: t }).label}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={() => setShowNovoModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 4, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', background: '#111', color: '#fff', border: 'none' }}>
            <Plus size={14} /> Novo Alerta
          </button>
        </div>
      </div>

      {/* == TABELA DE ALERTAS == */}
      {alertasFiltrados.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 15, fontWeight: 500, border: '1px solid var(--portal-border)', borderRadius: 8, background: 'var(--portal-bg-secondary)' }}>
          Nenhum alerta pendente{filtroTecnico !== 'todos' || filtroTipo !== 'todos' ? ' (com os filtros aplicados)' : ''}
        </div>
      ) : (
        <div style={{ border: '1px solid var(--portal-border)', borderRadius: 8, overflow: 'hidden', background: 'var(--portal-bg-card)' }}>
          {/* Header da tabela */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '180px 130px 1fr 100px',
            padding: '12px 16px',
            background: '#111',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '.04em',
            userSelect: 'none',
          }}>
            <div onClick={() => toggleSort('tecnico')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Tecnico <SortIcon col="tecnico" />
            </div>
            <div onClick={() => toggleSort('tipo')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Tipo <SortIcon col="tipo" />
            </div>
            <div onClick={() => toggleSort('descricao')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              Descricao <SortIcon col="descricao" />
            </div>
            <div onClick={() => toggleSort('dias')} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
              Dias Atraso <SortIcon col="dias" />
            </div>
          </div>

          {/* Linhas */}
          {alertasFiltrados.map(a => {
            const tipoInfo = TIPO_LABELS[a.tipo] || TIPO_LABELS.manual
            const dias = calcDias(a.data_inicio, a.data_fim)
            const isContestado = a.status === 'contestado'
            const ordem = a.tipo === 'ordem_pendente' && a.referencia_id ? ordensMap[a.referencia_id] : null
            const isExpanded = expandedId === a.id
            const sol = ordem ? extrairSolicitacao(ordem.Serv_Solicitado || '') : ''

            return (
              <div key={a.id}>
                {/* Linha principal — clique expande */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : a.id)}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '180px 130px 1fr 100px',
                    padding: '14px 16px',
                    borderBottom: isExpanded ? 'none' : '1px solid var(--portal-border)',
                    cursor: 'pointer',
                    background: isExpanded ? 'var(--portal-bg-secondary)' : isContestado ? '#FFFBEB' : 'var(--portal-bg-card)',
                    borderLeft: `4px solid ${isContestado ? '#F59E0B' : corDias(dias)}`,
                    alignItems: 'center',
                    transition: 'background .1s',
                    fontSize: 14,
                  }}
                  onMouseEnter={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = 'var(--portal-bg-secondary)' }}
                  onMouseLeave={e => { if (!isExpanded) (e.currentTarget as HTMLDivElement).style.background = isContestado ? '#FFFBEB' : 'var(--portal-bg-card)' }}
                >
                  {/* Tecnico */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {isExpanded ? <ChevronDown size={14} color="var(--portal-text-secondary)" /> : <ChevronRight size={14} color="var(--portal-text-muted)" />}
                    <span style={{ fontWeight: 700, color: 'var(--portal-text)', fontSize: 15 }}>
                      {a.tecnico_nome.split(' ').slice(0, 2).join(' ')}
                    </span>
                  </div>

                  {/* Tipo */}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 4, background: tipoInfo.bg, color: tipoInfo.color }}>
                      {tipoInfo.label}
                    </span>
                    {isContestado && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: '#FEF3C7', color: '#92400E' }}>Contestado</span>
                    )}
                  </div>

                  {/* Descricao */}
                  <div style={{ overflow: 'hidden', paddingRight: 10 }}>
                    {a.tipo === 'ordem_pendente' && a.referencia_id && (
                      <span style={{ fontWeight: 800, color: '#1E40AF', marginRight: 6, fontSize: 14 }}>OS #{a.referencia_id}</span>
                    )}
                    <span style={{ fontWeight: 500, color: 'var(--portal-text-secondary)', fontSize: 14 }}>
                      {a.tipo === 'ordem_pendente' && ordem
                        ? `${ordem.Os_Cliente}${ordem.Cidade_Cliente ? ` — ${ordem.Cidade_Cliente}` : ''}`
                        : a.descricao.length > 100 ? a.descricao.substring(0, 100) + '...' : a.descricao
                      }
                    </span>
                  </div>

                  {/* Dias em atraso */}
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <span style={{
                      fontSize: 20, fontWeight: 900, color: corDias(dias),
                      background: bgDias(dias), padding: '5px 16px', borderRadius: 8,
                      minWidth: 50, textAlign: 'center', display: 'inline-block',
                    }}>
                      {dias}d
                    </span>
                  </div>
                </div>

                {/* Detalhe expandido com acoes */}
                {isExpanded && (
                  <div style={{ padding: '16px 24px 16px 40px', background: 'var(--portal-bg-secondary)', borderBottom: '1px solid var(--portal-border)' }}>
                    {/* ACOES — agora bem visiveis no topo do expandido */}
                    <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                      {!isContestado && (
                        <button onClick={() => setShowContestarModal(a.id)} style={{
                          background: '#FEF3C7', color: '#92400E', border: '1px solid #FDE68A', borderRadius: 6,
                          padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 6,
                        }}><MessageSquare size={14} /> Contestar</button>
                      )}
                      <button onClick={() => { setConverterDados({ tipo: 'atraso', pontos_descontados: 5 }); setShowConverterModal(a) }} {...gateBtn(podeConverter)} style={{
                        background: '#FEE2E2', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 6,
                        padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                        ...estiloSemPermissao(podeConverter)
                      }}><AlertOctagon size={14} /> Converter em Ocorrencia</button>
                      <button onClick={() => fecharAlerta(a.id)} style={{
                        background: '#D1FAE5', color: '#065F46', border: '1px solid #A7F3D0', borderRadius: 6,
                        padding: '8px 16px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: 6,
                      }}><Check size={14} /> Dispensar</button>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: ordem ? '1fr 1fr' : '1fr', gap: 16 }}>
                      {/* Detalhes do alerta */}
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>Detalhes do Alerta</div>
                        <div style={{ fontSize: 14, color: 'var(--portal-text)', lineHeight: 1.6, marginBottom: 8 }}>
                          {a.descricao}
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginBottom: 4 }}>
                          Criado em: <strong>{formatDataHora(a.created_at)}</strong>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', marginBottom: 4 }}>
                          Inicio: <strong>{a.data_inicio}</strong> · Dias: <strong style={{ color: corDias(dias), fontSize: 15 }}>{dias}</strong>
                        </div>
                        {a.foto_url && (
                          <img src={a.foto_url} alt="" style={{ maxWidth: 200, maxHeight: 120, borderRadius: 8, objectFit: 'cover', cursor: 'pointer', marginTop: 8, border: '1px solid var(--portal-border)' }}
                            onClick={() => window.open(a.foto_url!, '_blank')} />
                        )}
                        {isContestado && a.contestacao_motivo && (
                          <div style={{ background: '#FFFBEB', padding: '10px 12px', borderRadius: 6, border: '1px solid #FEF3C7', fontSize: 13, color: '#92400E', lineHeight: 1.4, marginTop: 8 }}>
                            <strong>Contestacao:</strong> {a.contestacao_motivo}{a.contestado_por ? ` — ${a.contestado_por}` : ''}
                          </div>
                        )}
                      </div>

                      {/* Detalhes da OS */}
                      {ordem && (
                        <div style={{ background: 'var(--portal-bg-card)', borderRadius: 8, padding: 16, border: '1px solid var(--portal-border)' }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted)', textTransform: 'uppercase', marginBottom: 10 }}>Ordem de Servico #{ordem.Id_Ordem}</div>
                          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 16px', fontSize: 13 }}>
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Cliente</span>
                              <div style={{ fontWeight: 700, color: 'var(--portal-text)', fontSize: 15 }}>{ordem.Os_Cliente}</div>
                            </div>
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Cidade</span>
                              <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>{ordem.Cidade_Cliente || '—'}</div>
                            </div>
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Status</span>
                              <div style={{ fontWeight: 700, color: ordem.Status === 'Concluida' ? '#065F46' : '#D97706' }}>{ordem.Status}</div>
                            </div>
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Tipo</span>
                              <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>{ordem.Tipo_Servico || '—'}</div>
                            </div>
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Previsao Exec.</span>
                              <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>{ordem.Previsao_Execucao || '—'}</div>
                            </div>
                            <div>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Horas</span>
                              <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>{ordem.Qtd_HR || '—'}h</div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Tecnico Principal</span>
                              <div style={{ fontWeight: 700, color: 'var(--portal-text)' }}>{ordem.Os_Tecnico}{ordem.Os_Tecnico2 ? ` + ${ordem.Os_Tecnico2}` : ''}</div>
                            </div>
                            <div style={{ gridColumn: '1 / -1' }}>
                              <span style={{ fontWeight: 600, color: 'var(--portal-text-muted)', fontSize: 11 }}>Endereco</span>
                              <div style={{ fontWeight: 600, color: 'var(--portal-text-secondary)' }}>{ordem.Endereco_Cliente || '—'}</div>
                            </div>
                          </div>
                          {sol && (
                            <div style={{ marginTop: 10, padding: '8px 10px', background: '#F0F4FF', borderRadius: 6, fontSize: 13, color: '#1E40AF', lineHeight: 1.4, border: '1px solid #DBEAFE' }}>
                              <strong>Solicitacao:</strong> {sol}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* == MODAL NOVO ALERTA == */}
      {showNovoModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--portal-bg-card)', borderRadius: 8, padding: 24, width: '100%', maxWidth: 460, border: '1px solid var(--portal-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Novo Alerta</h3>
              <button onClick={() => setShowNovoModal(false)} style={{ background: 'var(--portal-bg-secondary)', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} color="var(--portal-text-muted)" /></button>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Destino</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['individual', 'todos'] as const).map(alvo => (
                  <button key={alvo} onClick={() => setNovoAlerta(p => ({ ...p, alvo }))} style={{
                    flex: 1, padding: 9, borderRadius: 4, fontSize: 13, fontWeight: 700,
                    border: `1px solid ${novoAlerta.alvo === alvo ? '#111' : 'var(--portal-border)'}`,
                    background: novoAlerta.alvo === alvo ? '#111' : 'var(--portal-bg-card)',
                    color: novoAlerta.alvo === alvo ? '#fff' : 'var(--portal-text)', cursor: 'pointer',
                  }}>{alvo === 'individual' ? 'Tecnico especifico' : 'Todos os tecnicos'}</button>
                ))}
              </div>
            </div>
            {novoAlerta.alvo === 'individual' && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Tecnico</label>
                <select value={novoAlerta.tecnico_nome} onChange={e => setNovoAlerta(p => ({ ...p, tecnico_nome: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                  <option value="">Selecione...</option>
                  {tecAtivos.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>)}
                </select>
              </div>
            )}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Tipo</label>
              <select value={novoAlerta.tipo} onChange={e => setNovoAlerta(p => ({ ...p, tipo: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                {Object.entries(TIPO_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Descricao</label>
              <textarea value={novoAlerta.descricao} onChange={e => setNovoAlerta(p => ({ ...p, descricao: e.target.value }))}
                placeholder="Descreva o alerta..." rows={3}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, resize: 'vertical', color: 'var(--portal-text)', boxSizing: 'border-box', background: 'var(--portal-bg-card)' }} />
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Foto (opcional)</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={e => setFotoFile(e.target.files?.[0] || null)} style={{ display: 'none' }} />
              <button onClick={() => fileRef.current?.click()} style={{
                display: 'flex', alignItems: 'center', gap: 6, background: 'var(--portal-bg-card)', color: 'var(--portal-text)',
                border: '1px dashed var(--portal-border)', borderRadius: 4, padding: '9px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer', width: '100%', justifyContent: 'center',
              }}><Camera size={14} />{fotoFile ? fotoFile.name : 'Anexar foto'}</button>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowNovoModal(false)} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={criarAlertaManual} disabled={uploading} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#111', color: '#fff', border: 'none', cursor: 'pointer', opacity: uploading ? 0.6 : 1 }}>
                {uploading ? 'Salvando...' : 'Criar Alerta'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* == MODAL CONVERTER EM OCORRENCIA == */}
      {showConverterModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--portal-bg-card)', borderRadius: 8, padding: 24, width: '100%', maxWidth: 420, border: '1px solid var(--portal-border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Converter em Ocorrencia</h3>
              <button onClick={() => setShowConverterModal(null)} style={{ background: 'var(--portal-bg-secondary)', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} color="var(--portal-text-muted)" /></button>
            </div>
            <div style={{ background: 'var(--portal-bg-secondary)', padding: '10px 12px', borderRadius: 6, marginBottom: 16, border: '1px solid var(--portal-border)' }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)', marginBottom: 4 }}>Alerta original</div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--portal-text)' }}>{showConverterModal.tecnico_nome}</div>
              <div style={{ fontSize: 13, color: 'var(--portal-text)', marginTop: 2 }}>{showConverterModal.descricao}</div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Tipo da Ocorrencia</label>
              <select value={converterDados.tipo} onChange={e => setConverterDados(p => ({ ...p, tipo: e.target.value }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                {Object.entries(tipoOcorrencia).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Pontos a descontar</label>
              <input type="number" min={0} max={100} value={converterDados.pontos_descontados}
                onChange={e => setConverterDados(p => ({ ...p, pontos_descontados: Number(e.target.value) }))}
                style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => setShowConverterModal(null)} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
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

      {/* == MODAL CONTESTAR == */}
      {showContestarModal !== null && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: 'var(--portal-bg-card)', borderRadius: 8, padding: 24, width: '100%', maxWidth: 400, border: '1px solid var(--portal-border)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 14px' }}>Contestar Alerta</h3>
            <textarea value={contestacaoMotivo} onChange={e => setContestacaoMotivo(e.target.value)}
              placeholder="Motivo da contestacao..." rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, resize: 'vertical', marginBottom: 14, color: 'var(--portal-text)', boxSizing: 'border-box', background: 'var(--portal-bg-card)' }} />
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowContestarModal(null); setContestacaoMotivo('') }} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
              <button onClick={() => contestarAlerta(showContestarModal)} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#F59E0B', color: '#fff', border: 'none', cursor: 'pointer' }}>Contestar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
