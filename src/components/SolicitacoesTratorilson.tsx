'use client'
// Kanban das solicitações confirmadas no Tratorilson (NovaZap).
// Abre pelo ícone do zap no header. Fases:
//   nova → orcamento (POS/PPV) → aguardando_data → agendado → execucao → concluida
// Regras: marcar a data => "agendado"; "Adiar" => volta pra "aguardando_data";
// em execução dá pra Concluir; coluna Concluídas fica oculta por padrão.
import { useCallback, useEffect, useState } from 'react'
import { X, ChevronLeft, ChevronRight, CalendarClock, CheckCircle2 } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'

interface Solicitacao {
  id: number
  created_at: string
  contato_nome: string | null
  contato_telefone: string | null
  cliente_nome: string | null
  cliente_cnpj: string | null
  tipo: string | null
  resumo: string | null
  extras: string | null
  total: number | null
  fase: string | null
  data_servico: string | null
  status: string | null
  detalhes: {
    pecas?: { codigo: string; descricao: string; qtd: number; preco: number }[]
    orcamento_numero?: string
    ppv_id?: string
    modelo?: string | null
    revisao?: string | null
  } | null
}

const FASES: { id: string; titulo: string; cor: string }[] = [
  { id: 'nova', titulo: 'Novas', cor: '#22c55e' },
  { id: 'orcamento', titulo: 'Orçamento POS/PPV', cor: '#3b82f6' },
  { id: 'aguardando_data', titulo: 'Aguardando data', cor: '#f59e0b' },
  { id: 'agendado', titulo: 'Agendado', cor: '#8b5cf6' },
  { id: 'execucao', titulo: 'Execução', cor: '#ef4444' },
  { id: 'concluida', titulo: 'Concluídas', cor: '#6b7280' },
]
const ORDEM = FASES.map(f => f.id)

const TIPO_ROTULO: Record<string, string> = {
  revisao: 'Revisão', quadriciclo: 'Quadriciclo', assistencia: 'Assistência', pecas: 'Peças', outro: 'Outro',
  humano: '🔴 Precisa de atendimento humano',
}

export default function SolicitacoesTratorilson({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [lista, setLista] = useState<Solicitacao[]>([])
  const [mostrarConcluidas, setMostrarConcluidas] = useState(false)
  const [aviso, setAviso] = useState('')

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/tratorilson/solicitacoes', { headers: await authHeaders(), cache: 'no-store' })
      const d = await r.json()
      if (Array.isArray(d.solicitacoes)) setLista(d.solicitacoes)
      setAviso(d.aviso || '')
    } catch { /* mantém a lista */ }
  }, [])

  useEffect(() => { if (open) carregar() }, [open, carregar])
  useEffect(() => {
    if (!open) return
    const t = setInterval(carregar, 45000)
    return () => clearInterval(t)
  }, [open, carregar])

  const salvar = async (id: number, mudanca: Partial<Solicitacao>) => {
    setLista(l => l.map(s => (s.id === id ? { ...s, ...mudanca } : s)))
    try {
      await fetch('/api/tratorilson/solicitacoes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id, ...mudanca }),
      })
    } catch { /* próxima carga corrige */ }
  }

  const [criando, setCriando] = useState<number | null>(null)
  const criarOrcamento = async (s: Solicitacao) => {
    if (criando) return
    setCriando(s.id)
    try {
      const r = await fetch('/api/tratorilson/solicitacoes/criar-orcamento', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ id: s.id }),
      })
      const d = await r.json()
      if (!r.ok) { setAviso(d.error || 'Não deu para criar o orçamento.'); return }
      setAviso('')
      setLista(l => l.map(x => (x.id === s.id
        ? { ...x, fase: 'orcamento', detalhes: { ...(x.detalhes || {}), orcamento_numero: d.orcamento, ppv_id: d.ppv } }
        : x)))
    } catch {
      setAviso('Não deu para criar o orçamento agora.')
    } finally {
      setCriando(null)
    }
  }

  const faseDe = (s: Solicitacao) => s.fase || (s.status === 'atendida' ? 'concluida' : 'nova')
  const mover = (s: Solicitacao, passo: number) => {
    const i = ORDEM.indexOf(faseDe(s))
    const nova = ORDEM[Math.min(ORDEM.length - 1, Math.max(0, i + passo))]
    if (nova !== faseDe(s)) salvar(s.id, { fase: nova })
  }

  if (!open) return null

  const colunas = FASES.filter(f => f.id !== 'concluida' || mostrarConcluidas)

  return (
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
      onClick={onClose}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(1280px, 98vw)', height: 'min(760px, 92vh)', background: 'var(--portal-bg)', borderRadius: 16,
          border: '1px solid var(--portal-border)', boxShadow: '0 24px 64px rgba(0,0,0,.4)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 18px', borderBottom: '1px solid var(--portal-border)' }}>
          <strong style={{ fontSize: 16, color: 'var(--portal-text)' }}>Solicitações do Tratorilson</strong>
          <label style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarConcluidas} onChange={e => setMostrarConcluidas(e.target.checked)} />
            Mostrar concluídas
          </label>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--portal-text-secondary)', cursor: 'pointer', padding: 6 }}>
            <X size={20} />
          </button>
        </div>

        {aviso && <div style={{ padding: '8px 18px', fontSize: 12, color: '#d97706' }}>{aviso}</div>}

        <div style={{ flex: 1, display: 'flex', gap: 12, padding: 14, overflowX: 'auto' }}>
          {colunas.map(col => {
            const cards = lista.filter(s => faseDe(s) === col.id)
            return (
              <div key={col.id} style={{ minWidth: 235, width: 235, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 4px' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 5, background: col.cor }} />
                  <strong style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{col.titulo}</strong>
                  <span style={{ fontSize: 11, color: 'var(--portal-text-secondary)' }}>{cards.length}</span>
                </div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingBottom: 8 }}>
                  {cards.map(s => (
                    <div key={s.id} style={{
                      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
                      borderLeft: `4px solid ${s.tipo === 'humano' ? '#ef4444' : col.cor}`, borderRadius: 10, padding: '9px 10px',
                      ...(s.tipo === 'humano' && faseDe(s) !== 'concluida' ? { boxShadow: '0 0 0 1px #ef444455' } : {}),
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                        <strong style={{ fontSize: 12.5, color: 'var(--portal-text)' }}>{s.contato_nome || s.contato_telefone || 'Contato'}</strong>
                        <span style={{ fontSize: 10, color: 'var(--portal-text-secondary)', whiteSpace: 'nowrap' }}>
                          {new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                      {s.cliente_nome && (
                        <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)' }}>
                          {s.cliente_nome}{s.cliente_cnpj ? ` · ${s.cliente_cnpj}` : ''}
                        </div>
                      )}
                      <div style={{ fontSize: 11.5, color: 'var(--portal-text)', margin: '5px 0' }}>
                        <span style={{ fontWeight: 600 }}>{TIPO_ROTULO[s.tipo || 'outro'] || s.tipo}</span>
                        {s.resumo ? ` — ${s.resumo}` : ''}
                      </div>
                      {s.extras && <div style={{ fontSize: 11, color: '#d97706', marginBottom: 4 }}>Extras: {s.extras}</div>}

                      {s.detalhes?.orcamento_numero ? (
                        <div style={{ fontSize: 11, color: '#3b82f6', margin: '4px 0', fontWeight: 600 }}>
                          {s.detalhes.orcamento_numero} · {s.detalhes.ppv_id}
                        </div>
                      ) : (s.detalhes?.pecas?.length || 0) > 0 ? (
                        <button
                          onClick={() => criarOrcamento(s)}
                          disabled={criando === s.id}
                          style={{
                            margin: '4px 0', fontSize: 11, padding: '5px 9px', borderRadius: 7, width: '100%',
                            border: '1px solid #3b82f6', background: criando === s.id ? 'transparent' : '#3b82f6',
                            color: criando === s.id ? '#3b82f6' : '#fff', cursor: 'pointer', fontWeight: 600,
                          }}
                        >{criando === s.id ? 'Criando…' : 'Criar orçamento + PPV no POS'}</button>
                      ) : null}

                      {/* Data do serviço: marcar => vai pra Agendado */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 0' }}>
                        <CalendarClock size={13} style={{ color: 'var(--portal-text-secondary)', flexShrink: 0 }} />
                        <input
                          type="date"
                          value={s.data_servico || ''}
                          onChange={e => salvar(s.id, { data_servico: e.target.value || null, ...(e.target.value ? { fase: 'agendado' } : {}) })}
                          style={{
                            fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--portal-border)',
                            background: 'var(--portal-bg-secondary)', color: 'var(--portal-text)', width: '100%',
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        <button title="Fase anterior" onClick={() => mover(s, -1)} disabled={faseDe(s) === 'nova'}
                          style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                          <ChevronLeft size={13} />
                        </button>
                        <button title="Próxima fase" onClick={() => mover(s, 1)} disabled={faseDe(s) === 'concluida'}
                          style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid var(--portal-border)', background: 'transparent', color: 'var(--portal-text-secondary)', cursor: 'pointer' }}>
                          <ChevronRight size={13} />
                        </button>
                        {(faseDe(s) === 'agendado' || faseDe(s) === 'execucao') && (
                          <button
                            onClick={() => salvar(s.id, { fase: 'aguardando_data' })}
                            title="Precisou adiar — volta pra Aguardando data"
                            style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, border: '1px solid #f59e0b', background: 'transparent', color: '#f59e0b', cursor: 'pointer' }}
                          >Adiar</button>
                        )}
                        {faseDe(s) === 'execucao' && (
                          <button
                            onClick={() => salvar(s.id, { fase: 'concluida' })}
                            style={{ fontSize: 10.5, padding: '3px 8px', borderRadius: 6, border: '1px solid #22c55e', background: 'transparent', color: '#22c55e', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                          ><CheckCircle2 size={12} /> Concluir</button>
                        )}
                      </div>
                    </div>
                  ))}
                  {cards.length === 0 && (
                    <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', padding: '8px 4px', opacity: 0.7 }}>—</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
