'use client'
import { useState, useMemo } from 'react'
import {
  ChevronDown, Star, Clock, Wrench, AlertOctagon,
  ThumbsUp, ThumbsDown, Building2, FileText, Search
} from 'lucide-react'

interface Tecnico { user_id: string; tecnico_nome: string; tecnico_email: string; mecanico_role: 'tecnico' | 'observador' }
interface OrdemServico {
  Id_Ordem: string; Status: string; Os_Cliente: string; Cnpj_Cliente: string
  Os_Tecnico: string; Os_Tecnico2: string; Previsao_Execucao: string | null
  Serv_Solicitado: string; Endereco_Cliente: string; Cidade_Cliente: string
  Tipo_Servico: string; Qtd_HR: string | number | null
}
interface Execucao { id: number; tecnico_nome: string; id_ordem: string; servico_realizado: string; data_execucao: string; status: string }
interface Ocorrencia { id: number; tecnico_nome: string; id_ordem: string | null; tipo: string; descricao: string; pontos_descontados: number; data: string }
interface Justificativa {
  id: number; tecnico_nome: string; id_ordem: string | null; id_ocorrencia: number | null
  justificativa: string; status: string; descontar_comissao: boolean | null
  avaliado_por: string | null; data_avaliacao: string | null; created_at: string
}
interface RequisicaoMecanico {
  id: number; tecnico_nome: string; material_solicitado: string; quantidade: string
  urgencia: string; id_ordem: string | null; status: string; created_at: string
}

interface Props {
  tecnicos: Tecnico[]
  ordens: OrdemServico[]
  execucoes: Execucao[]
  ocorrencias: Ocorrencia[]
  justificativas: Justificativa[]
  reqsMecanico: RequisicaoMecanico[]
  pontuacaoTecnico: Record<string, number>
  ordensAtrasoPorTecnico: Record<string, OrdemServico[]>
  ordensPorTecnico: Record<string, OrdemServico[]>
  onAprovarRequisicao: (id: number) => void
  onRecusarRequisicao: (id: number) => void
  onAvaliarJustificativa: (id: number, aprovada: boolean) => void
  tipoOcorrencia: Record<string, { label: string; color: string }>
}

function normNome(n: string): string[] {
  return n.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/).filter(p => p.length > 2)
}
function match(a: string, b: string) {
  if (!a || !b) return false
  const pA = normNome(a), pB = normNome(b)
  if (!pA.length || !pB.length || pA[0] !== pB[0]) return false
  if (pA.length === 1 || pB.length === 1) return true
  const s = new Set(pA.slice(1))
  return pB.slice(1).some(p => s.has(p))
}

interface ClienteGrupo {
  cnpj: string
  nome: string
  cidade: string
  ordens: { ordem: OrdemServico; execucoes: Execucao[] }[]
}

export default function BlocoTecnicos({
  tecnicos, ordens, execucoes, ocorrencias, justificativas, reqsMecanico,
  pontuacaoTecnico, ordensAtrasoPorTecnico, ordensPorTecnico,
  onAprovarRequisicao, onRecusarRequisicao, onAvaliarJustificativa, tipoOcorrencia,
}: Props) {
  const [expandedTec, setExpandedTec] = useState<string | null>(null)
  const [tecSubTab, setTecSubTab] = useState<'clientes' | 'atrasos' | 'ocorrencias'>('clientes')
  const [buscaTec, setBuscaTec] = useState('')

  const tecnicosAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')
  const reqPendentes = reqsMecanico.filter(r => r.status === 'pendente')
  const justPendentes = justificativas.filter(j => j.status === 'pendente')

  // Agrupar execuções por técnico → cliente (CNPJ)
  const clientesPorTecnico = useMemo(() => {
    const map: Record<string, ClienteGrupo[]> = {}

    tecnicos.forEach(tec => {
      // Pegar todas as execuções desse técnico
      const execsTec = execucoes.filter(e => e.tecnico_nome === tec.tecnico_nome)

      // Pegar todas as ordens desse técnico (ativas + históricas)
      const ordensTec = ordens.filter(o =>
        match(tec.tecnico_nome, o.Os_Tecnico) || match(tec.tecnico_nome, o.Os_Tecnico2)
      )

      // Agrupar por CNPJ
      const porCnpj: Record<string, ClienteGrupo> = {}

      ordensTec.forEach(ordem => {
        const cnpj = ordem.Cnpj_Cliente || 'SEM_CNPJ'
        if (!porCnpj[cnpj]) {
          porCnpj[cnpj] = {
            cnpj,
            nome: ordem.Os_Cliente,
            cidade: ordem.Cidade_Cliente || '',
            ordens: [],
          }
        }
        const execsDaOrdem = execsTec.filter(e => e.id_ordem === ordem.Id_Ordem)
        porCnpj[cnpj].ordens.push({ ordem, execucoes: execsDaOrdem })
      })

      // Ordenar por quantidade de ordens (mais ordens primeiro)
      map[tec.tecnico_nome] = Object.values(porCnpj).sort((a, b) => b.ordens.length - a.ordens.length)
    })

    return map
  }, [tecnicos, ordens, execucoes])

  const tecsFiltrados = buscaTec
    ? tecnicos.filter(t => t.tecnico_nome.toLowerCase().includes(buscaTec.toLowerCase()))
    : tecnicos

  return (
    <div>
      {/* Justificativas pendentes */}
      {justPendentes.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)', margin: 0 }}>Justificativas pendentes</h3>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#D97706', background: '#FFFBEB', padding: '2px 8px', borderRadius: 10 }}>
              {justPendentes.length}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))', gap: 12 }}>
            {justPendentes.map(j => {
              const oc = ocorrencias.find(o => o.id === j.id_ocorrencia)
              return (
                <div key={j.id} style={{
                  background: 'var(--portal-bg-card)', borderRadius: 10, padding: 18,
                  border: '1px solid var(--portal-border)', borderLeft: '3px solid #D97706',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{j.tecnico_nome}</span>
                      {j.id_ordem && <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginLeft: 8 }}>OS: {j.id_ordem}</span>}
                    </div>
                    <span style={{ fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6, background: '#FFFBEB', color: '#D97706' }}>
                      Pendente
                    </span>
                  </div>
                  {oc && (
                    <div style={{ background: 'var(--portal-bg-secondary)', borderRadius: 8, padding: 12, marginBottom: 12, border: '1px solid var(--portal-border)' }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--portal-text-muted)', marginBottom: 4 }}>Ocorrência</div>
                      <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>
                        <span style={{
                          fontSize: 11, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                          background: `${(tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).color}12`,
                          color: (tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).color,
                          marginRight: 6,
                        }}>
                          {(tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros).label}
                        </span>
                        {oc.descricao}
                        <span style={{ color: '#DC2626', fontWeight: 600, marginLeft: 8 }}>-{oc.pontos_descontados}pts</span>
                      </div>
                    </div>
                  )}
                  <div style={{
                    fontSize: 13, color: 'var(--portal-text)', marginBottom: 14, background: '#FFFBEB',
                    padding: 12, borderRadius: 8, border: '1px solid #FEF3C7', lineHeight: 1.5,
                  }}>
                    <div style={{ fontSize: 11, fontWeight: 500, color: '#92400E', marginBottom: 4 }}>Justificativa</div>
                    {j.justificativa}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => onAvaliarJustificativa(j.id, true)} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: '#18181B', color: '#fff', border: 'none', borderRadius: 8,
                      padding: '9px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    }}>
                      <ThumbsUp size={14} /> Aceitar
                    </button>
                    <button onClick={() => onAvaliarJustificativa(j.id, false)} style={{
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                      background: 'var(--portal-bg-card)', color: '#DC2626', border: '1px solid #FECACA', borderRadius: 8,
                      padding: '9px 0', fontSize: 13, fontWeight: 500, cursor: 'pointer',
                    }}>
                      <ThumbsDown size={14} /> Recusar
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Requisições pendentes do mecânico */}
      {reqPendentes.length > 0 && (
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)', margin: 0 }}>Requisições de material</h3>
            <span style={{ fontSize: 11, fontWeight: 500, color: '#D97706', background: '#FFFBEB', padding: '2px 8px', borderRadius: 10 }}>
              {reqPendentes.length}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
            {reqPendentes.map(req => (
              <div key={req.id} style={{
                background: 'var(--portal-bg-card)', borderRadius: 10, padding: 16, border: '1px solid var(--portal-border)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)' }}>{req.tecnico_nome.split(' ').slice(0, 2).join(' ')}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 6,
                    background: req.urgencia === 'alta' ? '#FEF2F2' : 'var(--portal-bg-secondary)',
                    color: req.urgencia === 'alta' ? '#DC2626' : 'var(--portal-text-secondary)',
                  }}>
                    {req.urgencia === 'alta' ? 'Urgente' : 'Normal'}
                  </span>
                </div>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--portal-text)' }}>{req.material_solicitado}</div>
                <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>
                  {req.quantidade && `Qtd: ${req.quantidade} · `}
                  {req.id_ordem && `OS: ${req.id_ordem} · `}
                  {new Date(req.created_at).toLocaleDateString('pt-BR')}
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  <button onClick={() => onAprovarRequisicao(req.id)} style={{
                    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500,
                    background: '#18181B', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer',
                  }}>Aprovar</button>
                  <button onClick={() => onRecusarRequisicao(req.id)} style={{
                    flex: 1, padding: '7px 0', fontSize: 12, fontWeight: 500,
                    background: 'var(--portal-bg-card)', color: 'var(--portal-text-secondary)', border: '1px solid var(--portal-border)', borderRadius: 6, cursor: 'pointer',
                  }}>Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Busca + Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)', margin: 0 }}>Equipe</h3>
        <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)', padding: '2px 8px', borderRadius: 10 }}>
          {tecnicosAtivos.length}
        </span>
        <div style={{ flex: 1 }} />
        <div style={{ position: 'relative', width: 220 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#A1A1AA' }} />
          <input
            value={buscaTec}
            onChange={e => setBuscaTec(e.target.value)}
            placeholder="Buscar técnico..."
            style={{
              width: '100%', padding: '7px 12px 7px 30px', borderRadius: 8,
              border: '1px solid var(--portal-border)', fontSize: 12, outline: 'none',
              background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Lista de técnicos */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {tecsFiltrados.map(tec => {
          const isExpanded = expandedTec === tec.user_id
          const pontos = pontuacaoTecnico[tec.tecnico_nome] ?? 100
          const atrasosDoTec = ordensAtrasoPorTecnico[tec.tecnico_nome] || []
          const ocorrDoTec = ocorrencias.filter(o => o.tecnico_nome === tec.tecnico_nome)
          const ordsTec = ordensPorTecnico[tec.tecnico_nome] || []
          const clientesTec = clientesPorTecnico[tec.tecnico_nome] || []
          const pontosColor = pontos >= 80 ? '#18181B' : pontos >= 50 ? '#D97706' : '#DC2626'
          const isTecnico = tec.mecanico_role === 'tecnico'
          const totalExecs = execucoes.filter(e => e.tecnico_nome === tec.tecnico_nome).length

          return (
            <div key={tec.user_id} style={{
              background: 'var(--portal-bg-card)', borderRadius: 10, border: '1px solid var(--portal-border)', overflow: 'hidden',
            }}>
              <div
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '14px 20px', cursor: 'pointer',
                }}
                onClick={() => { setExpandedTec(isExpanded ? null : tec.user_id); setTecSubTab('clientes') }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10, background: 'var(--portal-bg-secondary)',
                    color: 'var(--portal-text)', display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 14, fontWeight: 700,
                  }}>
                    {tec.tecnico_nome.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>{tec.tecnico_nome}</div>
                    <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 6, marginTop: 1 }}>
                      <span>{ordsTec.length} ordens ativas</span>
                      <span style={{ color: 'var(--portal-text-faint)' }}>·</span>
                      <span>{clientesTec.length} clientes</span>
                      <span style={{ color: 'var(--portal-text-faint)' }}>·</span>
                      <span>{totalExecs} execuções</span>
                      <span style={{ color: 'var(--portal-text-faint)' }}>·</span>
                      <span style={{
                        fontSize: 11, fontWeight: 500, padding: '0px 6px', borderRadius: 4,
                        background: isTecnico ? 'var(--portal-bg-secondary)' : '#FAF5FF',
                        color: isTecnico ? 'var(--portal-text-secondary)' : '#7C3AED',
                      }}>
                        {isTecnico ? 'Técnico' : 'Observador'}
                      </span>
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {atrasosDoTec.length > 0 && (
                    <span style={{
                      background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 500,
                      padding: '3px 10px', borderRadius: 6,
                    }}>
                      {atrasosDoTec.length} atraso{atrasosDoTec.length !== 1 ? 's' : ''}
                    </span>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Star size={13} color={pontosColor} fill={pontos >= 80 ? pontosColor : 'none'} />
                    <span style={{ fontSize: 15, fontWeight: 700, color: pontosColor }}>{pontos}</span>
                  </div>
                  <ChevronDown size={16} color="#A1A1AA" style={{
                    transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                    transition: 'transform 0.2s',
                  }} />
                </div>
              </div>

              {isExpanded && (
                <div style={{ borderTop: '1px solid var(--portal-border)' }}>
                  <div style={{ display: 'flex', gap: 0, borderBottom: '1px solid var(--portal-border)' }}>
                    {([
                      { id: 'clientes' as const, label: `Clientes (${clientesTec.length})`, icon: <Building2 size={13} /> },
                      { id: 'atrasos' as const, label: `Atrasos (${atrasosDoTec.length})`, icon: <Clock size={13} /> },
                      { id: 'ocorrencias' as const, label: `Ocorrências (${ocorrDoTec.length})`, icon: <AlertOctagon size={13} /> },
                    ]).map(st => {
                      const active = tecSubTab === st.id
                      return (
                        <button key={st.id} onClick={() => setTecSubTab(st.id)} style={{
                          padding: '10px 20px', fontSize: 12, fontWeight: active ? 600 : 400, border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 5,
                          background: 'transparent',
                          color: active ? 'var(--portal-text)' : 'var(--portal-text-muted)',
                          borderBottom: active ? '2px solid var(--portal-text)' : '2px solid transparent',
                          marginBottom: -1,
                        }}>
                          {st.icon} {st.label}
                        </button>
                      )
                    })}
                  </div>

                  <div style={{ padding: 20 }}>
                    {/* ─── Clientes (agrupado por CNPJ) ─── */}
                    {tecSubTab === 'clientes' && (
                      clientesTec.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#D4D4D8', fontSize: 13, padding: 24 }}>
                          Nenhuma ordem encontrada para este técnico
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                          {clientesTec.map(grupo => (
                            <div key={grupo.cnpj} style={{
                              background: 'var(--portal-bg-secondary)', borderRadius: 10, border: '1px solid var(--portal-border)',
                              overflow: 'hidden',
                            }}>
                              {/* Header do cliente */}
                              <div style={{
                                padding: '14px 18px', borderBottom: '1px solid var(--portal-border)',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                background: 'var(--portal-bg-card)',
                              }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                  <Building2 size={15} color="#71717A" />
                                  <div>
                                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>
                                      {grupo.nome}
                                    </div>
                                    <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                                      {grupo.cnpj !== 'SEM_CNPJ' ? `CNPJ: ${grupo.cnpj}` : 'Sem CNPJ'}
                                      {grupo.cidade && ` · ${grupo.cidade}`}
                                    </div>
                                  </div>
                                </div>
                                <span style={{
                                  fontSize: 11, fontWeight: 600, color: 'var(--portal-text-secondary)', background: 'var(--portal-bg-secondary)',
                                  padding: '3px 10px', borderRadius: 6,
                                }}>
                                  {grupo.ordens.length} {grupo.ordens.length === 1 ? 'ordem' : 'ordens'}
                                </span>
                              </div>

                              {/* Lista de ordens do cliente */}
                              <div style={{ padding: '8px 12px' }}>
                                {grupo.ordens.map(({ ordem, execucoes: execsOrdem }) => {
                                  const statusColor = ordem.Status === 'Concluída' ? '#15803D'
                                    : ordem.Status === 'Execução' ? '#0EA5E9'
                                    : ordem.Status === 'Cancelada' ? '#DC2626'
                                    : '#D97706'
                                  const statusBg = ordem.Status === 'Concluída' ? '#F0FDF4'
                                    : ordem.Status === 'Execução' ? '#F0F9FF'
                                    : ordem.Status === 'Cancelada' ? '#FEF2F2'
                                    : '#FFFBEB'

                                  return (
                                    <div key={ordem.Id_Ordem} style={{
                                      padding: '12px 14px', margin: '4px 0', borderRadius: 8,
                                      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)' }}>{ordem.Id_Ordem}</span>
                                          <span style={{
                                            fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                            background: statusBg, color: statusColor,
                                          }}>
                                            {ordem.Status}
                                          </span>
                                        </div>
                                        <span style={{ fontSize: 11, color: 'var(--portal-text-muted)' }}>
                                          {ordem.Tipo_Servico}
                                          {ordem.Qtd_HR ? ` · ${ordem.Qtd_HR}h` : ''}
                                        </span>
                                      </div>
                                      {ordem.Cidade_Cliente && (
                                        <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginBottom: 4 }}>
                                          {ordem.Cidade_Cliente}
                                          {ordem.Previsao_Execucao && ` · Prev: ${new Date(ordem.Previsao_Execucao + 'T12:00:00').toLocaleDateString('pt-BR')}`}
                                        </div>
                                      )}
                                      {execsOrdem.length > 0 && (
                                        <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--portal-border)' }}>
                                          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--portal-text-secondary)', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Wrench size={11} /> Execuções ({execsOrdem.length})
                                          </div>
                                          {execsOrdem.map(ex => (
                                            <div key={ex.id} style={{
                                              fontSize: 12, color: 'var(--portal-text-secondary)', padding: '6px 8px', marginBottom: 4,
                                              background: 'var(--portal-bg-secondary)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                            }}>
                                              <span>
                                                {ex.servico_realizado
                                                  ? (ex.servico_realizado.length > 80 ? ex.servico_realizado.substring(0, 80) + '...' : ex.servico_realizado)
                                                  : 'Sem descrição'}
                                              </span>
                                              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, marginLeft: 8 }}>
                                                <span style={{
                                                  fontSize: 10, fontWeight: 500, padding: '1px 6px', borderRadius: 4,
                                                  background: ex.status === 'enviado' ? '#F0FDF4' : '#FFFBEB',
                                                  color: ex.status === 'enviado' ? '#15803D' : '#92400E',
                                                }}>
                                                  {ex.status === 'enviado' ? 'Enviado' : 'Rascunho'}
                                                </span>
                                                <span style={{ fontSize: 11, color: 'var(--portal-text-faint)' }}>
                                                  {new Date(ex.data_execucao + 'T12:00:00').toLocaleDateString('pt-BR')}
                                                </span>
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  )
                                })}
                              </div>
                            </div>
                          ))}
                        </div>
                      )
                    )}

                    {/* ─── Atrasos ─── */}
                    {tecSubTab === 'atrasos' && (
                      atrasosDoTec.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#D4D4D8', fontSize: 13, padding: 24 }}>
                          Nenhum serviço em atraso
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {atrasosDoTec.map(o => {
                            const diasAtraso = Math.ceil((Date.now() - new Date(o.Previsao_Execucao + 'T23:59:59').getTime()) / (1000 * 60 * 60 * 24))
                            return (
                              <div key={o.Id_Ordem} style={{
                                padding: 14, background: 'var(--portal-bg-secondary)', borderRadius: 8,
                                border: '1px solid var(--portal-border)', borderLeft: '3px solid #DC2626',
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)' }}>{o.Id_Ordem}</span>
                                  <span style={{ fontSize: 12, fontWeight: 500, color: '#DC2626' }}>
                                    {diasAtraso} dia{diasAtraso !== 1 ? 's' : ''} de atraso
                                  </span>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--portal-text)' }}>{o.Os_Cliente}</div>
                                <div style={{ fontSize: 12, color: 'var(--portal-text-muted)', marginTop: 4 }}>
                                  {o.Tipo_Servico} · Previsão: {o.Previsao_Execucao ? new Date(o.Previsao_Execucao + 'T12:00:00').toLocaleDateString('pt-BR') : '-'}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    )}

                    {/* ─── Ocorrências ─── */}
                    {tecSubTab === 'ocorrencias' && (
                      ocorrDoTec.length === 0 ? (
                        <div style={{ textAlign: 'center', color: '#D4D4D8', fontSize: 13, padding: 24 }}>
                          Nenhuma ocorrência registrada
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {ocorrDoTec.map(oc => {
                            const tipoInfo = tipoOcorrencia[oc.tipo] || tipoOcorrencia.outros
                            const justDoOc = justificativas.find(j => j.id_ocorrencia === oc.id)
                            return (
                              <div key={oc.id} style={{
                                padding: 14, background: 'var(--portal-bg-secondary)', borderRadius: 8,
                                border: '1px solid var(--portal-border)', borderLeft: `3px solid ${tipoInfo.color}`,
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{
                                      fontSize: 11, fontWeight: 500, padding: '2px 8px', borderRadius: 4,
                                      background: `${tipoInfo.color}12`, color: tipoInfo.color,
                                    }}>
                                      {tipoInfo.label}
                                    </span>
                                    {oc.id_ordem && <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>OS: {oc.id_ordem}</span>}
                                  </div>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 600, color: '#DC2626' }}>-{oc.pontos_descontados}pts</span>
                                    {justDoOc && (
                                      <span style={{
                                        fontSize: 10, fontWeight: 500, padding: '2px 6px', borderRadius: 4,
                                        background: justDoOc.status === 'aprovada' ? '#F0FDF4' : justDoOc.status === 'recusada' ? '#FEF2F2' : '#FFFBEB',
                                        color: justDoOc.status === 'aprovada' ? '#15803D' : justDoOc.status === 'recusada' ? '#DC2626' : '#D97706',
                                      }}>
                                        {justDoOc.status}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <div style={{ fontSize: 13, color: 'var(--portal-text)', lineHeight: 1.5 }}>{oc.descricao}</div>
                                <div style={{ fontSize: 12, color: 'var(--portal-text-faint)', marginTop: 6 }}>
                                  {new Date(oc.data).toLocaleDateString('pt-BR')}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
