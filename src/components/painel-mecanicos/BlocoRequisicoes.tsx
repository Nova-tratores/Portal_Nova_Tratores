'use client'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, Package, CheckCircle } from 'lucide-react'

interface RequisicaoGeral {
  id: number
  titulo: string
  tipo: string
  solicitante: string
  setor: string
  status: string
  ordem_servico: string | null
  created_at: string
  updated_at: string | null
}

interface Tecnico {
  user_id: string
  tecnico_nome: string
  tecnico_email: string
  mecanico_role: 'tecnico' | 'observador'
}

interface UsuarioBanco {
  id: string
  nome: string
  email: string
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

export default function BlocoRequisicoes({
  tecnicos, requisicoes, usuariosBanco
}: {
  tecnicos: Tecnico[]
  requisicoes: RequisicaoGeral[]
  usuariosBanco: UsuarioBanco[]
}) {
  const [expandido, setExpandido] = useState<string | null>(null)

  // Resolve solicitante email → nome
  const resolverNomeSolicitante = (solicitante: string): string => {
    if (!solicitante) return ''
    if (solicitante.includes('@')) {
      const usu = usuariosBanco.find(u => u.email === solicitante.trim())
      return usu?.nome || solicitante
    }
    return solicitante
  }

  // Filtra requisições com status "pedido" e agrupa por técnico
  const reqsPedido = useMemo(() =>
    requisicoes.filter(r => r.status === 'pedido'),
    [requisicoes]
  )

  const reqsPorTecnico = useMemo(() => {
    const map: Record<string, RequisicaoGeral[]> = {}
    const tecAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')
    tecAtivos.forEach(tec => {
      map[tec.tecnico_nome] = reqsPedido.filter(r => {
        const nomeSol = resolverNomeSolicitante(r.solicitante)
        return nomesBatem(tec.tecnico_nome, nomeSol)
      })
    })
    return map
  }, [tecnicos, reqsPedido, usuariosBanco])

  const tecAtivos = tecnicos.filter(t => t.mecanico_role === 'tecnico')

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))', gap: 16 }}>
        {tecAtivos.map(tec => {
          const reqs = reqsPorTecnico[tec.tecnico_nome] || []
          const isExpanded = expandido === tec.tecnico_nome

          return (
            <div key={tec.user_id} style={{
              background: 'var(--portal-bg-card)', borderRadius: 14,
              boxShadow: '0 1px 6px rgba(0,0,0,0.06)',
              borderLeft: `5px solid ${reqs.length === 0 ? '#10B981' : '#F59E0B'}`,
              overflow: 'hidden',
            }}>
              {/* Header */}
              <div
                onClick={() => setExpandido(isExpanded ? null : tec.tecnico_nome)}
                style={{
                  padding: '16px 18px', cursor: 'pointer',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  background: reqs.length === 0 ? '#F0FDF4' : '#FFFBEB',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 42, height: 42, borderRadius: '50%',
                    background: reqs.length === 0 ? '#10B981' : '#F59E0B',
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
                      {reqs.length === 0 ? 'Nenhuma requisição pendente' : `${reqs.length} requisição(ões) em pedido`}
                    </div>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {reqs.length === 0 ? (
                    <CheckCircle size={22} color="#10B981" />
                  ) : (
                    <Package size={22} color="#F59E0B" />
                  )}
                  <span style={{
                    fontSize: 26, fontWeight: 900,
                    color: reqs.length === 0 ? '#10B981' : '#D97706',
                  }}>
                    {reqs.length}
                  </span>
                  {isExpanded ? <ChevronUp size={18} color="#6B7280" /> : <ChevronDown size={18} color="#6B7280" />}
                </div>
              </div>

              {/* Lista expandida */}
              {isExpanded && reqs.length > 0 && (
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {reqs.map(r => {
                    const diasPedido = Math.floor(
                      (new Date().getTime() - new Date(r.created_at).getTime()) / 86400000
                    )
                    return (
                      <div key={r.id} style={{
                        background: 'var(--portal-bg-secondary)', borderRadius: 10,
                        padding: '10px 14px',
                        borderLeft: `3px solid ${diasPedido > 3 ? '#EF4444' : '#F59E0B'}`,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 15, fontWeight: 700, color: '#1E3A5F' }}>
                            {r.titulo || 'Sem título'}
                          </span>
                          <span style={{
                            fontSize: 11, fontWeight: 700,
                            padding: '2px 8px', borderRadius: 6,
                            background: diasPedido > 3 ? '#FEE2E2' : '#FEF3C7',
                            color: diasPedido > 3 ? '#DC2626' : '#92400E',
                          }}>
                            {diasPedido}d aguardando
                          </span>
                        </div>
                        <div style={{ fontSize: 13, color: 'var(--portal-text)', fontWeight: 600 }}>
                          Tipo: {r.tipo} {r.setor ? `| Setor: ${r.setor}` : ''}
                        </div>
                        {r.ordem_servico && (
                          <div style={{ fontSize: 12, color: 'var(--portal-text-secondary)', marginTop: 2 }}>
                            OS vinculada: {r.ordem_servico}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 2 }}>
                          Criada: {new Date(r.created_at).toLocaleDateString('pt-BR')}
                        </div>
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
