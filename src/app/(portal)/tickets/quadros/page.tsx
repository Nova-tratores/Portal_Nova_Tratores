'use client'
// CENTRAL DE TRABALHO — casa do módulo. Três coisas:
//  1) Pra organizar: tickets que recebi e ainda não pus num bloco;
//  2) Meus blocos: os quadros de cada um, por assunto, cada um de uma cor;
//  3) Pedidos que fiz: o que pedi pra outras pessoas (dia, situação, bloco).
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, LayoutGrid, Lock, Globe, Users, RefreshCw, Inbox, Send, Clock, SquareCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import type { QuadroResumo } from '@/lib/tickets/quadros'
import type { Ticket, UsuarioMin } from '@/lib/tickets/constantes'
import FormQuadro from '@/components/tickets/quadros/FormQuadro'
import StatusBadge from '@/components/tickets/StatusBadge'
import TicketModal from '@/components/tickets/TicketModal'
import OrganizarTicket, { type TicketParaOrganizar } from '@/components/trabalho/OrganizarTicket'

type TicketC = Ticket & { aceite?: string | null; aceite_motivo?: string | null }
interface Central {
  praOrganizar: TicketC[]
  pedidos: TicketC[]
  quadros: Record<string, { id: string; nome: string; cor: string }>
  colunas: Record<string, string>
  usuarios: Record<string, { id: string; nome: string }>
  passos: Record<string, { feitas: number; total: number }>
}

const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)

export default function QuadrosPage() {
  const router = useRouter()
  const { userProfile } = useAuth()
  const isMobile = useIsMobile()
  const [quadros, setQuadros] = useState<QuadroResumo[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, UsuarioMin>>({})
  const [central, setCentral] = useState<Central | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [arquivados, setArquivados] = useState(false)
  const [novo, setNovo] = useState(false)
  const [organizando, setOrganizando] = useState<TicketParaOrganizar | null>(null)
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setErro('')
    try {
      const h = await authHeaders()
      const [rq, rc] = await Promise.all([
        fetch(`/api/tickets/quadros${arquivados ? '?arquivados=1' : ''}`, { headers: h }),
        fetch('/api/trabalho/central', { headers: h }),
      ])
      const jq = await rq.json()
      const jc = await rc.json()
      if (!rq.ok) { setErro(jq.error || 'Falha ao carregar'); return }
      setQuadros(jq.quadros || [])
      setUsuarios(jq.usuarios || {})
      setAviso(jq.migracaoFaltando ? jq.error : '')
      if (rc.ok) setCentral(jc)
    } catch {
      setErro('Falha de conexão')
    } finally {
      setCarregando(false)
    }
  }, [arquivados])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])
  // Ticket/tarefa criados pela barra de cima, ou mudança feita no ticket aberto
  useEffect(() => {
    const f = () => carregar()
    window.addEventListener('central-trabalho-mudou', f)
    window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar])

  const meus = quadros.filter((q) => q.meu)
  const outrosPublicos = quadros.filter((q) => !q.meu && q.visibilidade === 'publico')
  const hoje = hojeISO()
  const nome = (id: string) => central?.usuarios[id]?.nome || '—'

  const secao = (icone: React.ReactNode, titulo: string, extra?: React.ReactNode, id?: string) => (
    <div id={id} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 10px', scrollMarginTop: 90 }}>
      <h2 style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--portal-text,#111)' }}>{icone} {titulo}</h2>
      {extra}
    </div>
  )
  const contador = (n: number, forte = false) => (
    <span style={{ fontSize: 12, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: forte ? '#dc2626' : 'var(--portal-bg,#f1f1f1)', color: forte ? '#fff' : 'var(--portal-text-muted,#777)' }}>{n}</span>
  )
  // Capa do bloco: o que é, quem está, e em que pé está (sem precisar abrir).
  const cartaoBloco = (q: QuadroResumo) => {
    const r = q.resumo || { andamento: 0, atrasados: 0, proximo: null }
    const pessoas = [...new Set([q.criado_por, ...q.membros])]
    const numero = (n: number, rotulo: string, cor?: string, ultimo?: boolean) => (
      <div style={{ flex: 1, textAlign: 'center', padding: '2px 4px', borderRight: ultimo ? 'none' : '1px solid var(--portal-border,#eee)' }}>
        <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1.1, color: cor && n > 0 ? cor : 'var(--portal-text,#111)' }}>{n}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: cor && n > 0 ? cor : 'var(--portal-text-muted,#888)' }}>{rotulo}</div>
      </div>
    )
    return (
      <button key={q.id} onClick={() => router.push(`/tickets/quadros/${q.id}`)}
        style={{
          display: 'flex', flexDirection: 'column', textAlign: 'left', borderRadius: 14, overflow: 'hidden', cursor: 'pointer', padding: 0,
          border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', opacity: q.arquivado ? .6 : 1,
          boxShadow: '0 2px 8px rgba(0,0,0,.05)',
        }}>
        <div style={{ padding: '14px 14px 12px', display: 'flex', flexDirection: 'column', gap: 4, background: q.cor + '14', borderBottom: `1px solid ${q.cor}33` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: q.cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><LayoutGrid size={16} /></span>
            <span style={{ flex: 1, minWidth: 0, fontSize: 16, fontWeight: 800, color: 'var(--portal-text,#111)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.nome}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 600, color: 'var(--portal-text-muted,#888)' }}>
            {q.visibilidade === 'privado'
              ? <><Lock size={12} /> Só quem está no bloco vê</>
              : <><Globe size={12} /> Todos podem ver</>}
            {q.arquivado && <b> · arquivado</b>}
          </div>
          {q.descricao && <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary,#666)', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{q.descricao}</div>}
        </div>
        <div style={{ display: 'flex', padding: '12px 10px' }}>
          {numero(q.tickets_abertos, 'em aberto')}
          {numero(r.andamento, 'fazendo')}
          {numero(r.atrasados, r.atrasados === 1 ? 'atrasado' : 'atrasados', '#dc2626', true)}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderTop: '1px solid var(--portal-border,#f0f0f0)', fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>
          <span style={{ display: 'flex' }} title={pessoas.map((id) => usuarios[id]?.nome || '—').join(', ')}>
            {pessoas.slice(0, 4).map((id, i) => {
              const u = usuarios[id]
              const ini = (u?.nome || '?').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()
              return u?.avatar_url
                // eslint-disable-next-line @next/next/no-img-element
                ? <img key={id} src={u.avatar_url} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--portal-surface,#fff)', marginLeft: i ? -7 : 0 }} />
                : <span key={id} style={{ width: 24, height: 24, borderRadius: '50%', fontSize: 10, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: q.cor, color: '#fff', border: '2px solid var(--portal-surface,#fff)', marginLeft: i ? -7 : 0 }}>{ini}</span>
            })}
            {pessoas.length > 4 && <span style={{ marginLeft: 4, fontWeight: 700 }}>+{pessoas.length - 4}</span>}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Users size={12} /> {pessoas.length} {pessoas.length === 1 ? 'pessoa' : 'pessoas'}</span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4 }}>
            {r.proximo ? <><Clock size={12} /> próximo {br(r.proximo)}</> : q.tickets_abertos === 0 ? 'vazio' : 'sem data'}
          </span>
        </div>
      </button>
    )
  }

  return (
    <div style={{ padding: isMobile ? '14px 12px' : 20, maxWidth: 1200, margin: '0 auto' }}>
      {aviso && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(217,119,6,.1)', color: '#b45309', fontSize: 13, fontWeight: 600, marginTop: 12 }}>{aviso}</div>}
      {erro && <div style={{ padding: '12px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600, marginTop: 12 }}>{erro}</div>}

      {carregando ? (
        <div style={{ padding: 60, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando...</div>
      ) : (
        <>
          {/* 1) Pra organizar */}
          {central && central.praOrganizar.length > 0 && (
            <>
              {secao(<Inbox size={17} color="#dc2626" />, 'Pra organizar', contador(central.praOrganizar.length, true))}
              <div style={{ display: 'grid', gap: 8 }}>
                {central.praOrganizar.map((t) => {
                  const atrasado = !!t.prazo && t.prazo < hoje
                  const pendente = t.aceite === 'pendente'
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '12px 14px', borderRadius: 12, border: `1px solid ${pendente ? 'rgba(220,38,38,.35)' : 'var(--portal-border,#e5e7eb)'}`, background: 'var(--portal-surface,#fff)' }}>
                      <button onClick={() => setTicketAberto(t.id)} style={{ flex: '1 1 260px', minWidth: 0, textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--portal-text,#111)' }}>
                        <div style={{ fontSize: 14.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{t.numero} {t.titulo}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)', marginTop: 2 }}>
                          {t.solicitante_id === userProfile?.id ? 'você criou para você' : `de ${nome(t.solicitante_id)}`}
                          {' · '}<span style={{ color: atrasado ? '#dc2626' : undefined, fontWeight: atrasado ? 700 : 400 }}>{t.prazo ? `até ${br(t.prazo)}` : 'sem data'}</span>
                          {pendente && <> · <b style={{ color: '#dc2626' }}>falta confirmar</b></>}
                        </div>
                      </button>
                      <button onClick={() => setOrganizando({ id: t.id, numero: t.numero, titulo: t.titulo, prazo: t.prazo, visibilidade: t.visibilidade, aceite: t.aceite, solicitante_nome: t.solicitante_id === userProfile?.id ? undefined : nome(t.solicitante_id) })}
                        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8, border: 'none', background: pendente ? '#059669' : '#dc2626', color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                        <LayoutGrid size={14} /> {pendente ? 'Confirmar e organizar' : 'Pôr num bloco'}
                      </button>
                    </div>
                  )
                })}
              </div>
            </>
          )}

          {/* 2) Meus blocos */}
          {secao(<LayoutGrid size={17} color="#dc2626" />, 'Meus blocos', (
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer' }}>
                <input type="checkbox" checked={arquivados} onChange={(e) => setArquivados(e.target.checked)} /> Mostrar arquivados
              </label>
              <button onClick={() => carregar()} title="Atualizar"
                style={{ display: 'flex', padding: 7, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
                <RefreshCw size={14} />
              </button>
              <button onClick={() => setNovo(true)} disabled={!!aviso}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: aviso ? .5 : 1 }}>
                <Plus size={15} /> Novo bloco
              </button>
            </div>
          ))}
          {meus.length === 0 && !aviso ? (
            <div style={{ padding: '36px 20px', textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: 'var(--portal-text-muted,#888)' }}>
              <LayoutGrid size={30} style={{ opacity: .35, marginBottom: 8 }} />
              <div style={{ fontSize: 14, fontWeight: 600 }}>Você ainda não tem nenhum bloco.</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Crie um por assunto (ex.: Oficina, Compras, Loja) e escolha a cor. Os tickets que você recebe vão para eles.</div>
              <button onClick={() => setNovo(true)} disabled={!!aviso}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 14, padding: '9px 16px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                <Plus size={16} /> Criar meu primeiro bloco
              </button>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12 }}>
              {meus.map(cartaoBloco)}
            </div>
          )}
          {outrosPublicos.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>Blocos públicos de outras pessoas ({outrosPublicos.length})</summary>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 12, marginTop: 10 }}>
                {outrosPublicos.map(cartaoBloco)}
              </div>
            </details>
          )}

          {/* 3) Pedidos que fiz */}
          {central && (
            <>
              {secao(<Send size={17} color="#dc2626" />, 'Pedidos que fiz', contador(central.pedidos.length), 'pedidos')}
              {central.pedidos.length === 0 ? (
                <div style={{ padding: '18px 16px', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', fontSize: 13, color: 'var(--portal-text-muted,#888)' }}>
                  Nada pedido em aberto. Use <b>Novo ticket</b> lá em cima para pedir algo a alguém.
                </div>
              ) : (
                <div style={{ display: 'grid', gap: 8 }}>
                  {central.pedidos.map((t) => {
                    const q = t.quadro_id ? central.quadros[t.quadro_id] : null
                    const p = central.passos[t.id]
                    const atrasado = !!t.prazo && t.prazo < hoje && t.status !== 'resolvido'
                    return (
                      <button key={t.id} onClick={() => setTicketAberto(t.id)}
                        style={{ display: 'flex', alignItems: 'stretch', gap: 12, textAlign: 'left', padding: 0, borderRadius: 12, overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)' }}>
                        <span style={{ width: 6, flex: 'none', background: q?.cor || 'var(--portal-border,#d4d4d4)' }} />
                        <span style={{ flex: 1, minWidth: 0, padding: '11px 12px 11px 0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ flex: '1 1 240px', minWidth: 0 }}>
                            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>#{t.numero} {t.titulo}</span>
                            <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#888)' }}>
                              para <b style={{ color: 'var(--portal-text-secondary,#555)' }}>{nome(t.responsavel_id)}</b>
                              {q ? <> · {q.nome}</> : null}
                              {p && p.total > 0 ? <> · <SquareCheck size={11} style={{ verticalAlign: -1 }} /> {p.feitas}/{p.total}</> : null}
                            </span>
                            {t.aceite === 'recusado' && (
                              <span style={{ display: 'block', fontSize: 12.5, color: '#dc2626', fontWeight: 700, marginTop: 2 }}>Recusado{t.aceite_motivo ? `: ${t.aceite_motivo}` : ''}</span>
                            )}
                          </span>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            {t.aceite === 'pendente' && <span style={{ fontSize: 12, fontWeight: 700, color: '#b45309' }}>aguardando confirmar</span>}
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12.5, fontWeight: 700, color: atrasado ? '#dc2626' : 'var(--portal-text-secondary,#555)' }}>
                              <Clock size={13} /> {t.prazo ? br(t.prazo) : 'sem data'}{atrasado ? ' · atrasado' : ''}
                            </span>
                            <StatusBadge status={t.status} />
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}

        </>
      )}

      {novo && (
        <FormQuadro usuarios={usuarios} onFechar={() => setNovo(false)}
          onSalvo={(q) => { setNovo(false); router.push(`/tickets/quadros/${q.id}`) }} />
      )}
      {organizando && (
        <OrganizarTicket ticket={organizando} onFechar={() => setOrganizando(null)}
          onFeito={() => { setOrganizando(null); carregar() }} />
      )}
      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={carregar} />}
    </div>
  )
}
