'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, FileText, AlertTriangle, CheckCircle } from 'lucide-react'

interface OrdemServico {
  Id_Ordem: string
  Status: string
  Os_Cliente: string
  Cnpj_Cliente: string
  Os_Tecnico: string
  Os_Tecnico2: string
  Previsao_Execucao: string | null
  Serv_Solicitado: string
  Endereco_Cliente: string
  Cidade_Cliente: string
  Tipo_Servico: string
}

interface Tecnico {
  user_id: string
  tecnico_nome: string
  tecnico_email: string
  mecanico_role: 'tecnico' | 'observador'
}

function normalizarNome(nome: string): string[] {
  return nome
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .split(/\s+/)
    .filter(p => p.length > 2)
}

function nomesBatem(nomeA: string, nomeB: string): boolean {
  if (!nomeA || !nomeB) return false
  const partesA = normalizarNome(nomeA)
  const partesB = normalizarNome(nomeB)
  if (partesA.length === 0 || partesB.length === 0) return false
  if (partesA[0] !== partesB[0]) return false
  if (partesA.length === 1 || partesB.length === 1) return true
  const sobrenomesA = new Set(partesA.slice(1))
  return partesB.slice(1).some(p => sobrenomesA.has(p))
}

const STATUS_CORES: Record<string, { bg: string; color: string }> = {
  'Orçamento': { bg: '#FEF3C7', color: '#92400E' },
  'Orçamento enviado para o cliente e aguardando': { bg: '#FEF3C7', color: '#92400E' },
  'Execução': { bg: '#DBEAFE', color: '#1E40AF' },
  'Execução (Realizando Diagnóstico)': { bg: '#DBEAFE', color: '#1E40AF' },
  'Execução aguardando peças (em transporte)': { bg: '#E0E7FF', color: '#3730A3' },
  'Executada aguardando comercial': { bg: '#EDE9FE', color: '#5B21B6' },
  'Aguardando outros': { bg: '#F3F4F6', color: '#374151' },
  'Aguardando ordem Técnico': { bg: '#FFF7ED', color: '#9A3412' },
  'Relatório Concluído': { bg: '#FEF3C7', color: '#78350F' },
}

function getStatusAbreviado(status: string): string {
  const map: Record<string, string> = {
    'Orçamento': 'Orçam.',
    'Orçamento enviado para o cliente e aguardando': 'Orç. Enviado',
    'Execução': 'Execução',
    'Execução (Realizando Diagnóstico)': 'Diagnóstico',
    'Execução aguardando peças (em transporte)': 'Ag. Peças',
    'Executada aguardando comercial': 'Ag. Comercial',
    'Aguardando outros': 'Ag. Outros',
    'Aguardando ordem Técnico': 'Ag. Técnico',
    'Relatório Concluído': 'Rel. Concluído',
  }
  return map[status] || status
}

export default function BlocoOrdens({
  tecnicos, ordens
}: {
  tecnicos: Tecnico[]
  ordens: OrdemServico[]
}) {
  const [expandido, setExpandido] = useState<string | null>(null)

  // Filtra só abertas (não Concluída nem Cancelada)
  const ordensAbertas = useMemo(() =>
    ordens.filter(o => o.Status !== 'Concluída' && o.Status !== 'Cancelada'),
    [ordens]
  )

  // Agrupa por técnico
  const ordensPorTecnico = useMemo(() => {
    const map: Record<string, OrdemServico[]> = {}
    const tecAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')
    tecAtivos.forEach(tec => {
      map[tec.tecnico_nome] = ordensAbertas.filter(o =>
        nomesBatem(tec.tecnico_nome, o.Os_Tecnico) || nomesBatem(tec.tecnico_nome, o.Os_Tecnico2)
      )
    })
    return map
  }, [tecnicos, ordensAbertas])

  const tecAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')
  const hoje = new Date()

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {tecAtivos.map(tec => {
          const ords = ordensPorTecnico[tec.tecnico_nome] || []
          const temAtraso = ords.some(o =>
            o.Previsao_Execucao && new Date(o.Previsao_Execucao + 'T23:59:59') < hoje
          )
          const isExpanded = expandido === tec.tecnico_nome

          return (
            <div key={tec.user_id} style={{
              background: 'var(--portal-bg-card)', borderRadius: 14,
              boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
              borderLeft: `5px solid ${ords.length === 0 ? '#10B981' : temAtraso ? '#EF4444' : '#3B82F6'}`,
              overflow: 'hidden',
            }}>
              {/* Header do técnico */}
              <div
                onClick={() => setExpandido(isExpanded ? null : tec.tecnico_nome)}
                style={{
                  padding: '16px 18px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: ords.length === 0 ? '#F0FDF4' : temAtraso ? '#FEF2F2' : '#EFF6FF',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: ords.length === 0 ? '#10B981' : temAtraso ? '#EF4444' : '#1E3A5F',
                    color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 16, fontWeight: 800,
                  }}>
                    {tec.tecnico_nome.charAt(0)}
                  </div>
                  <div>
                    <div style={{ fontSize: 17, fontWeight: 800, color: '#1E3A5F' }}>
                      {tec.tecnico_nome.split(' ').slice(0, 2).join(' ')}
                    </div>
                    <div style={{ fontSize: 13, color: 'var(--portal-text-secondary)', fontWeight: 600 }}>
                      {ords.length === 0 ? 'Nenhuma ordem pendente' : `${ords.length} ordem(s) ativa(s)`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {ords.length === 0 ? (
                    <CheckCircle size={22} color="#10B981" />
                  ) : temAtraso ? (
                    <AlertTriangle size={22} color="#EF4444" />
                  ) : (
                    <FileText size={22} color="#3B82F6" />
                  )}
                  <span style={{
                    fontSize: 26, fontWeight: 900,
                    color: ords.length === 0 ? '#10B981' : temAtraso ? '#EF4444' : '#1E3A5F',
                  }}>
                    {ords.length}
                  </span>
                  {isExpanded ? <ChevronUp size={18} color="#6B7280" /> : <ChevronDown size={18} color="#6B7280" />}
                </div>
              </div>

              {/* Lista de ordens expandida */}
              {isExpanded && ords.length > 0 && (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ords.map(o => {
                    const cidade = o.Cidade_Cliente || ''
                    const clienteNome = o.Os_Cliente ? o.Os_Cliente.split(' ').slice(0, 3).join(' ') : ''
                    const diasAtraso = o.Previsao_Execucao
                      ? Math.floor((hoje.getTime() - new Date(o.Previsao_Execucao + 'T23:59:59').getTime()) / 86400000)
                      : null
                    const atrasado = diasAtraso !== null && diasAtraso > 0
                    const cores = STATUS_CORES[o.Status] || { bg: '#F3F4F6', color: '#374151' }

                    return (
                      <div key={o.Id_Ordem} style={{
                        background: atrasado ? '#FEF2F2' : 'var(--portal-bg-secondary)', borderRadius: 10,
                        padding: '10px 14px',
                        borderLeft: `3px solid ${atrasado ? '#EF4444' : cores.color}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 14, fontWeight: 700, color: '#1E3A5F' }}>
                            {o.Id_Ordem}
                          </span>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            {atrasado && (
                              <span style={{
                                fontSize: 11, fontWeight: 700, color: '#DC2626', background: '#FEE2E2',
                                padding: '2px 8px', borderRadius: 6,
                              }}>
                                {diasAtraso}d atraso
                              </span>
                            )}
                            <span style={{
                              fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 6,
                              background: cores.bg, color: cores.color,
                            }}>
                              {getStatusAbreviado(o.Status)}
                            </span>
                          </div>
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--portal-text)' }}>
                          {clienteNome}{cidade ? ` - ${cidade}` : ''}
                        </div>
                        {o.Previsao_Execucao && (
                          <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                            Previsão: {new Date(o.Previsao_Execucao + 'T12:00:00').toLocaleDateString('pt-BR')}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
