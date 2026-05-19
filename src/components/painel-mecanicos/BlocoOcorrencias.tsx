'use client'
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronRight, Filter, AlertOctagon, Plus, X } from 'lucide-react'

interface Tecnico { user_id: string; tecnico_nome: string; tecnico_email: string; mecanico_role: 'tecnico' | 'observador' }
interface Ocorrencia { id: number; tecnico_nome: string; id_ordem: string | null; tipo: string; descricao: string; pontos_descontados: number; data: string; created_at?: string }
interface Justificativa { id: number; tecnico_nome: string; id_ordem: string | null; id_ocorrencia: number | null; justificativa: string; status: string; descontar_comissao: boolean | null; avaliado_por: string | null; data_avaliacao: string | null; created_at: string }

function getMesAtual() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function formatMes(mes: string) {
  const [y, m] = mes.split('-')
  const nomes = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
  return `${nomes[parseInt(m) - 1]} ${y}`
}

function formatData(iso: string): string {
  try {
    const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (match) return `${match[3]}/${match[2]}/${match[1]}`
    const d = new Date(iso)
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  } catch { return iso }
}

export default function BlocoOcorrencias({
  tecnicos, ocorrencias, justificativas, tipoOcorrencia, onSalvarOcorrencia,
}: {
  tecnicos: Tecnico[]
  ocorrencias: Ocorrencia[]
  justificativas: Justificativa[]
  tipoOcorrencia: Record<string, { label: string; color: string }>
  onSalvarOcorrencia: (dados: { tecnico_nome: string; id_ordem: string; tipo: string; descricao: string; pontos_descontados: number }) => Promise<void>
}) {
  const mesAtual = getMesAtual()
  const [mesSelecionado, setMesSelecionado] = useState(mesAtual)
  const [filtroTecnico, setFiltroTecnico] = useState('todos')
  const [tecExpandido, setTecExpandido] = useState<string | null>(null)
  const [showNovaModal, setShowNovaModal] = useState(false)
  const [nova, setNova] = useState({ tecnico_nome: '', id_ordem: '', tipo: 'atraso', descricao: '', pontos_descontados: 5 })
  const [salvando, setSalvando] = useState(false)

  const tecAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')

  // Meses disponíveis (extrair de ocorrências)
  const mesesDisponiveis = useMemo(() => {
    const s = new Set<string>()
    s.add(mesAtual)
    ocorrencias.forEach(o => {
      if (o.data) {
        const match = o.data.match(/^(\d{4})-(\d{2})/)
        if (match) s.add(`${match[1]}-${match[2]}`)
      }
    })
    return Array.from(s).sort().reverse()
  }, [ocorrencias, mesAtual])

  // Filtrar ocorrências do mês selecionado
  const ocorrenciasMes = useMemo(() => {
    let filtered = ocorrencias.filter(o => {
      if (!o.data) return false
      return o.data.startsWith(mesSelecionado)
    })
    if (filtroTecnico !== 'todos') {
      filtered = filtered.filter(o => o.tecnico_nome === filtroTecnico)
    }
    return filtered
  }, [ocorrencias, mesSelecionado, filtroTecnico])

  // Agrupar por técnico
  const porTecnico = useMemo(() => {
    const m: Record<string, { ocorrencias: Ocorrencia[]; pontos: number }> = {}
    ocorrenciasMes.forEach(o => {
      if (!m[o.tecnico_nome]) m[o.tecnico_nome] = { ocorrencias: [], pontos: 0 }
      m[o.tecnico_nome].ocorrencias.push(o)
      // Só desconta se não tem justificativa aprovada sem desconto
      const justAprovada = justificativas.find(j => j.id_ocorrencia === o.id && j.status === 'aprovada' && j.descontar_comissao === false)
      if (!justAprovada) m[o.tecnico_nome].pontos += o.pontos_descontados
    })
    return Object.entries(m)
      .sort(([, a], [, b]) => b.pontos - a.pontos)
  }, [ocorrenciasMes, justificativas])

  const totalOcorrencias = ocorrenciasMes.length
  const totalPontos = porTecnico.reduce((acc, [, v]) => acc + v.pontos, 0)

  const SEL: React.CSSProperties = { padding: '7px 10px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, fontWeight: 600, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', cursor: 'pointer' }

  return (
    <div>
      {/* ══ HEADER ══ */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)' }}>Ocorrencias</span>
          <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 4, background: totalOcorrencias > 0 ? '#FEE2E2' : '#D1FAE5', color: totalOcorrencias > 0 ? '#DC2626' : '#065F46' }}>
            {totalOcorrencias} ocorrencia(s)
          </span>
          {totalPontos > 0 && (
            <span style={{ fontSize: 12, fontWeight: 700, padding: '4px 10px', borderRadius: 4, background: '#111', color: '#fff' }}>
              -{totalPontos} pts total
            </span>
          )}
          <span style={{ width: 1, height: 20, background: 'var(--portal-border)', margin: '0 4px' }} />
          <Filter size={14} color="var(--portal-text)" />
          <select value={mesSelecionado} onChange={e => setMesSelecionado(e.target.value)} style={SEL}>
            {mesesDisponiveis.map(m => (
              <option key={m} value={m}>{formatMes(m)}{m === mesAtual ? ' (atual)' : ''}</option>
            ))}
          </select>
          <select value={filtroTecnico} onChange={e => setFiltroTecnico(e.target.value)} style={SEL}>
            <option value="todos">Todos tecnicos</option>
            {tecAtivos.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome.split(' ').slice(0, 2).join(' ')}</option>)}
          </select>
        </div>
        <button onClick={() => setShowNovaModal(true)} style={{ display: 'flex', alignItems: 'center', gap: 5, borderRadius: 4, padding: '7px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer', background: '#111', color: '#fff', border: 'none' }}>
          <Plus size={13} /> Nova Ocorrencia
        </button>
      </div>

      {/* ══ CARDS POR TÉCNICO ══ */}
      {porTecnico.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted)', fontSize: 14, fontWeight: 500, border: '1px solid var(--portal-border)', borderRadius: 8, background: 'var(--portal-bg-secondary)' }}>
          Nenhuma ocorrencia em {formatMes(mesSelecionado)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2, border: '1px solid var(--portal-border)', borderRadius: 6, overflow: 'hidden' }}>
          {porTecnico.map(([nome, dados]) => {
            const aberto = tecExpandido === nome
            return (
              <div key={nome}>
                {/* Header do técnico */}
                <div
                  onClick={() => setTecExpandido(aberto ? null : nome)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '12px 16px', cursor: 'pointer',
                    background: aberto ? 'var(--portal-bg-secondary)' : 'var(--portal-bg-card)',
                    borderBottom: '1px solid var(--portal-border)',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {aberto ? <ChevronDown size={16} color="var(--portal-text)" /> : <ChevronRight size={16} color="var(--portal-text)" />}
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'var(--portal-text)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--portal-bg-card)', fontSize: 13, fontWeight: 700 }}>
                      {nome.charAt(0)}
                    </div>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)' }}>{nome}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text-secondary)' }}>
                      {dados.ocorrencias.length} ocorrencia(s)
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 800, padding: '4px 12px', borderRadius: 4, background: dados.pontos > 0 ? '#FEE2E2' : '#D1FAE5', color: dados.pontos > 0 ? '#DC2626' : '#065F46' }}>
                      -{dados.pontos} pts
                    </span>
                  </div>
                </div>

                {/* Lista de ocorrências */}
                {aberto && (
                  <div style={{ background: 'var(--portal-bg-secondary)' }}>
                    {/* Header tabela */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 80px',
                      padding: '6px 16px', background: 'var(--portal-border)', borderBottom: '1px solid var(--portal-border)',
                      fontSize: 11, fontWeight: 700, color: 'var(--portal-text)', textTransform: 'uppercase', letterSpacing: '.03em',
                    }}>
                      <span>Tipo</span>
                      <span>Descricao</span>
                      <span>OS</span>
                      <span>Data</span>
                      <span style={{ textAlign: 'right' }}>Pontos</span>
                    </div>

                    {dados.ocorrencias
                      .sort((a, b) => (b.data || '').localeCompare(a.data || ''))
                      .map(o => {
                        const ti = tipoOcorrencia[o.tipo] || tipoOcorrencia.outros || { label: o.tipo, color: '#71717A' }
                        const justAprovada = justificativas.find(j => j.id_ocorrencia === o.id && j.status === 'aprovada' && j.descontar_comissao === false)
                        const justPendente = justificativas.find(j => j.id_ocorrencia === o.id && j.status === 'pendente')

                        return (
                          <div key={o.id} style={{
                            display: 'grid', gridTemplateColumns: '120px 1fr 80px 100px 80px',
                            padding: '10px 16px', borderBottom: '1px solid var(--portal-border)', alignItems: 'center',
                            background: 'var(--portal-bg-card)',
                            borderLeft: `3px solid ${ti.color}`,
                            opacity: justAprovada ? 0.5 : 1,
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 3, background: `${ti.color}18`, color: ti.color, display: 'inline-block', width: 'fit-content' }}>
                              {ti.label}
                            </span>
                            <div style={{ overflow: 'hidden', paddingRight: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--portal-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {o.descricao}
                              </div>
                              {justAprovada && (
                                <div style={{ fontSize: 11, color: '#065F46', marginTop: 2, fontWeight: 500 }}>
                                  Justificativa aceita - sem desconto
                                </div>
                              )}
                              {justPendente && !justAprovada && (
                                <div style={{ fontSize: 11, color: '#D97706', marginTop: 2, fontWeight: 500 }}>
                                  Justificativa pendente
                                </div>
                              )}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--portal-text-secondary)' }}>
                              {o.id_ordem ? `#${o.id_ordem}` : '--'}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--portal-text)' }}>
                              {o.data ? formatData(o.data) : '--'}
                            </span>
                            <span style={{ fontSize: 14, fontWeight: 900, color: justAprovada ? '#999' : '#DC2626', textAlign: 'right', textDecoration: justAprovada ? 'line-through' : 'none' }}>
                              -{o.pontos_descontados}
                            </span>
                          </div>
                        )
                      })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ══ RESUMO DO MÊS ══ */}
      {porTecnico.length > 0 && (
        <div style={{ marginTop: 20, padding: 16, background: 'var(--portal-bg-secondary)', borderRadius: 8, border: '1px solid var(--portal-border)' }}>
          <div style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text)', marginBottom: 12, textTransform: 'uppercase', letterSpacing: '.03em' }}>
            Resumo {formatMes(mesSelecionado)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
            {porTecnico.map(([nome, dados]) => (
              <div key={nome} style={{ background: 'var(--portal-bg-card)', padding: '10px 14px', borderRadius: 6, border: '1px solid var(--portal-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{nome.split(' ').slice(0, 2).join(' ')}</div>
                  <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', fontWeight: 500 }}>{dados.ocorrencias.length} ocorr.</div>
                </div>
                <div style={{ fontSize: 18, fontWeight: 900, color: dados.pontos > 0 ? '#DC2626' : '#065F46' }}>
                  -{dados.pontos}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ MODAL NOVA OCORRÊNCIA ══ */}
      {showNovaModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={() => setShowNovaModal(false)}>
          <div style={{ background: 'var(--portal-bg-card)', borderRadius: 8, padding: 24, width: '100%', maxWidth: 440, border: '1px solid var(--portal-border)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Nova Ocorrencia</h3>
              <button onClick={() => setShowNovaModal(false)} style={{ background: 'var(--portal-bg-secondary)', border: 'none', cursor: 'pointer', width: 28, height: 28, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><X size={14} color="var(--portal-text)" /></button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Tecnico</label>
                <select value={nova.tecnico_nome} onChange={e => setNova(p => ({ ...p, tecnico_nome: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                  <option value="">Selecione...</option>
                  {tecAtivos.map(t => <option key={t.user_id} value={t.tecnico_nome}>{t.tecnico_nome}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>OS (opcional)</label>
                <input type="text" value={nova.id_ordem} onChange={e => setNova(p => ({ ...p, id_ordem: e.target.value }))}
                  placeholder="Ex: 1234" style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Tipo</label>
                <select value={nova.tipo} onChange={e => setNova(p => ({ ...p, tipo: e.target.value }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)' }}>
                  {Object.entries(tipoOcorrencia).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Descricao</label>
                <textarea value={nova.descricao} onChange={e => setNova(p => ({ ...p, descricao: e.target.value }))}
                  placeholder="Descreva a ocorrencia..." rows={3}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, resize: 'vertical', color: 'var(--portal-text)', boxSizing: 'border-box' }} />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--portal-text)', display: 'block', marginBottom: 5 }}>Pontos a descontar</label>
                <input type="number" min={0} max={100} value={nova.pontos_descontados}
                  onChange={e => setNova(p => ({ ...p, pontos_descontados: Number(e.target.value) }))}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 4, border: '1px solid var(--portal-border)', fontSize: 13, background: 'var(--portal-bg-card)', color: 'var(--portal-text)', boxSizing: 'border-box' }} />
              </div>

              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button onClick={() => setShowNovaModal(false)} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', border: 'none', cursor: 'pointer' }}>Cancelar</button>
                <button disabled={salvando || !nova.tecnico_nome || !nova.descricao} onClick={async () => {
                  setSalvando(true)
                  await onSalvarOcorrencia(nova)
                  setNova({ tecnico_nome: '', id_ordem: '', tipo: 'atraso', descricao: '', pontos_descontados: 5 })
                  setShowNovaModal(false)
                  setSalvando(false)
                }} style={{ flex: 1, padding: 10, borderRadius: 4, fontSize: 13, fontWeight: 700, background: '#DC2626', color: '#fff', border: 'none', cursor: 'pointer', opacity: salvando || !nova.tecnico_nome || !nova.descricao ? 0.5 : 1 }}>
                  {salvando ? 'Salvando...' : 'Registrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
