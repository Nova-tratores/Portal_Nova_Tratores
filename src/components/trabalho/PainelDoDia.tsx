'use client'
// CENTRAL DE TRABALHO — o que aparece na cara da pessoa, em qualquer tela:
//  1) "Fulano criou um ticket para você": Confirmar · Propor outra data · Recusar
//  2) "Seu dia" a partir das 7:30, até ela confirmar (só se houver algo)
//  3) Atalho flutuante na dashboard (cada um escolhe se quer)
import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Check, CircleX, CalendarClock, Wrench, Play, Ticket as TicketIcon, SquareCheck, Kanban, X, Inbox, Sun, Send, Plus, ArrowUpRight, EyeOff,
} from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import FormTicket from '@/components/tickets/FormTicket'
import TicketModal from '@/components/tickets/TicketModal'
import EscolhaBloco, { type EscolhaBlocoValor } from './EscolhaBloco'

interface Pendente { id: string; numero: number; titulo: string; prazo: string | null; solicitante_nome: string; quadro_id?: string | null; quadro_nome: string | null; visibilidade?: 'privado' | 'publico' }
interface Item { tipo: 'andamento' | 'comeca' | 'ticket' | 'tarefa'; texto: string; detalhe?: string; ticketId?: string | null; atrasado?: boolean }
interface Hoje { ativo: boolean; hora: string; pendentes: Pendente[]; itens: Item[]; confirmado: boolean; pedidos: number; preferencias: { atalho_flutuante: boolean } }

const VERMELHO = 'linear-gradient(135deg,#dc2626,#7f1d1d)'
const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const ICONE: Record<Item['tipo'], React.ReactNode> = {
  andamento: <Wrench size={16} />, comeca: <Play size={16} />, ticket: <TicketIcon size={16} />, tarefa: <SquareCheck size={16} />,
}

export default function PainelDoDia({ nome }: { nome?: string }) {
  const pathname = usePathname()
  const router = useRouter()
  const [h, setH] = useState<Hoje | null>(null)
  const [verDia, setVerDia] = useState(false)       // abrir o "Seu dia" na mão (atalho)
  const [diaFechado, setDiaFechado] = useState(false)
  const [menu, setMenu] = useState(false)
  const [novo, setNovo] = useState(false)
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  const [modo, setModo] = useState<null | 'data' | 'recusar'>(null)
  const [novaData, setNovaData] = useState('')
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  // Bloco + privacidade escolhidos por quem recebe (por ticket pendente)
  const [organizacao, setOrganizacao] = useState<{ id: string; valor: EscolhaBlocoValor } | null>(null)

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/trabalho/hoje', { headers: await authHeaders(), cache: 'no-store' })
      if (!res.ok) return
      setH(await res.json())
    } catch { /* fica quieto */ }
  }, [])
  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 5 * 60 * 1000)
    const foco = () => carregar()
    window.addEventListener('focus', foco)
    return () => { clearInterval(t); window.removeEventListener('focus', foco) }
  }, [carregar])

  if (!h?.ativo) return null
  const pend = h.pendentes[0]
  const org: EscolhaBlocoValor = organizacao && pend && organizacao.id === pend.id
    ? organizacao.valor
    : { quadroId: null, visibilidade: pend?.visibilidade || 'privado' }
  // Ticket criado direto num bloco fica nele; senão vai pro bloco escolhido.
  const extraOrg = pend?.quadro_id ? {} : { quadro_id: org.quadroId, visibilidade: org.visibilidade }
  const mostrarDia = !pend && h.itens.length > 0 && ((h.hora >= '07:30' && !h.confirmado && !diaFechado) || verDia)
  const naDashboard = pathname === '/dashboard' || pathname === '/'
  const atalho = naDashboard && h.preferencias.atalho_flutuante && !pend && !mostrarDia

  const decidir = async (corpo: Record<string, unknown>) => {
    if (!pend) return
    setSalvando(true); setErro('')
    try {
      const res = await fetch(`/api/tickets/${pend.id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'aceite', ...corpo }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Falha'); return }
      setModo(null); setMotivo(''); setNovaData(''); setOrganizacao(null)
      await carregar()
    } finally { setSalvando(false) }
  }
  const sugerirData = async () => {
    setModo('data')
    try {
      const res = await fetch('/api/trabalho/agenda?duracao=1', { headers: await authHeaders() })
      const json = await res.json()
      if (res.ok) setNovaData(json.sugestao)
    } catch { /* manual */ }
  }
  const confirmarDia = async () => {
    setDiaFechado(true); setVerDia(false)
    try { await fetch('/api/trabalho/hoje', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'confirmar_dia' }) }) } catch { /* ok */ }
    carregar()
  }
  const esconderAtalho = async () => {
    setMenu(false)
    try { await fetch('/api/trabalho/hoje', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'preferencias', atalho_flutuante: false }) }) } catch { /* ok */ }
    carregar()
  }

  const fundo: React.CSSProperties = { position: 'fixed', inset: 0, zIndex: 1300, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }
  const caixa: React.CSSProperties = { width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--portal-bg-card,#fff)', borderRadius: 16, overflow: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.4)' }
  const topo: React.CSSProperties = { background: VERMELHO, color: '#fff', padding: '18px 20px' }
  const btn = (cor?: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: cor ? 'none' : '1px solid var(--portal-border,#e5e7eb)', background: cor || 'var(--portal-bg-card,#fff)', color: cor ? '#fff' : 'var(--portal-text,#111)' })

  return (
    <>
      {/* 1) Confirmação de ticket recebido */}
      {pend && (
        <div style={fundo} role="dialog" aria-modal="true" aria-labelledby="aceite-t">
          <div style={caixa}>
            <div style={topo}>
              <div style={{ fontSize: 12, opacity: .9 }}>Novo ticket para você{h.pendentes.length > 1 ? ` · 1 de ${h.pendentes.length}` : ''}</div>
              <div id="aceite-t" style={{ fontSize: 19, fontWeight: 800 }}>{pend.solicitante_nome} criou um ticket para você</div>
              <div style={{ fontSize: 13, opacity: .95 }}>Confirme se consegue fazer.</div>
            </div>
            <div style={{ padding: '16px 20px', fontSize: 14, color: 'var(--portal-text,#111)' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--portal-text-muted,#888)' }}>TICKET #{pend.numero}{pend.quadro_nome ? ` · QUADRO ${pend.quadro_nome.toUpperCase()}` : ''}</div>
              <div style={{ fontSize: 18, fontWeight: 800, margin: '4px 0 8px' }}>{pend.titulo}</div>
              <div style={{ color: 'var(--portal-text-secondary,#555)' }}>Prazo: <strong>{pend.prazo ? br(pend.prazo) : 'sem data'}</strong>
                {' · '}<button onClick={() => setTicketAberto(pend.id)} style={{ border: 'none', background: 'transparent', padding: 0, color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>ver detalhes</button></div>
              {modo !== 'recusar' && !pend.quadro_id && (
                <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px dashed var(--portal-border,#e5e7eb)' }}>
                  <EscolhaBloco valor={org} onChange={(v) => setOrganizacao({ id: pend.id, valor: v })} />
                </div>
              )}
              {modo === 'data' && (
                <label style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>Consigo fazer até
                  <input type="date" value={novaData} onChange={(e) => setNovaData(e.target.value)} style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)' }} />
                  <span style={{ fontWeight: 400 }}>Sugestão: seu primeiro dia livre.</span>
                </label>
              )}
              {modo === 'recusar' && (
                <label style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>Por que não consegue? (vai para quem pediu)
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} autoFocus placeholder="Ex.: estou na feira até sexta; peça ao Henri"
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', resize: 'vertical' }} />
                </label>
              )}
              {erro && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--portal-border,#f0f0f0)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {modo === null ? (
                <>
                  <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button style={btn()} onClick={() => setModo('recusar')}><CircleX size={15} /> Recusar</button>
                    <button style={btn()} onClick={sugerirData}><CalendarClock size={15} /> Propor outra data</button>
                  </span>
                  <button style={btn('#059669')} disabled={salvando} onClick={() => decidir({ decisao: 'confirmar', ...extraOrg })}><Check size={15} /> Confirmar</button>
                </>
              ) : (
                <>
                  <button style={btn()} onClick={() => { setModo(null); setErro('') }}>Voltar</button>
                  {modo === 'data'
                    ? <button style={btn('#059669')} disabled={salvando || !novaData} onClick={() => decidir({ decisao: 'nova_data', data: novaData, ...extraOrg })}><Check size={15} /> Confirmar com esta data</button>
                    : <button style={btn('#dc2626')} disabled={salvando || !motivo.trim()} onClick={() => decidir({ decisao: 'recusar', motivo })}><CircleX size={15} /> Recusar ticket</button>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2) Seu dia (7:30) */}
      {mostrarDia && (
        <div style={fundo} role="dialog" aria-modal="true" aria-labelledby="dia-t">
          <div style={caixa}>
            <div style={topo}>
              <div style={{ fontSize: 12, opacity: .9 }}>Hoje · {h.hora}</div>
              <div id="dia-t" style={{ fontSize: 20, fontWeight: 800 }}>Bom dia{nome ? `, ${nome.split(' ')[0]}` : ''}!</div>
              <div style={{ fontSize: 13, opacity: .95 }}>Isto é o que você tem para hoje:</div>
            </div>
            <ul style={{ listStyle: 'none', margin: 0, padding: '6px 20px', maxHeight: '55vh', overflowY: 'auto' }}>
              {h.itens.map((i, k) => (
                <li key={k} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 0', borderBottom: '1px solid var(--portal-border,#f0f0f0)', fontSize: 14, color: 'var(--portal-text,#111)' }}>
                  <span style={{ flex: 'none', width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--portal-bg,#fafafa)', color: '#dc2626' }}>{ICONE[i.tipo]}</span>
                  <span style={{ flex: 1 }}>
                    <strong>{i.texto}</strong>{i.detalhe && <> — <span style={{ color: i.atrasado ? '#dc2626' : 'var(--portal-text-secondary,#555)', fontWeight: i.atrasado ? 700 : 400 }}>{i.detalhe}</span></>}
                    {i.ticketId && <> · <button onClick={() => setTicketAberto(i.ticketId!)} style={{ border: 'none', background: 'transparent', padding: 0, color: '#dc2626', fontWeight: 700, cursor: 'pointer' }}>abrir</button></>}
                  </span>
                </li>
              ))}
            </ul>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--portal-border,#f0f0f0)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <small style={{ color: 'var(--portal-text-muted,#888)' }}>Esta tela fica aqui até você confirmar.</small>
              <button style={btn('#dc2626')} onClick={confirmarDia}><Check size={15} /> Ok, vi meu dia</button>
            </div>
          </div>
        </div>
      )}

      {/* 3) Atalho flutuante na dashboard */}
      {atalho && (
        <div style={{ position: 'fixed', right: 22, bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))', zIndex: 900 }}>
          {menu && (
            <div style={{ position: 'absolute', right: 0, bottom: 70, width: 290, background: 'var(--portal-bg-card,#fff)', border: '1px solid var(--portal-border,#f0f0f0)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,.18)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--portal-border,#f0f0f0)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--portal-text,#111)' }}><Kanban size={16} color="#dc2626" /> Central de Trabalho</div>
              {[
                { ic: <Inbox size={16} />, txt: 'Para confirmar', n: h.pendentes.length, destaque: h.pendentes.length > 0, acao: () => carregar() },
                { ic: <Sun size={16} />, txt: 'Meu dia', n: h.itens.length, acao: () => setVerDia(true) },
                { ic: <Send size={16} />, txt: 'Meus pedidos', n: h.pedidos, acao: () => router.push('/tickets/quadros#pedidos') },
                { ic: <Plus size={16} />, txt: 'Novo ticket', acao: () => setNovo(true) },
                { ic: <ArrowUpRight size={16} />, txt: 'Abrir a Central de Trabalho', acao: () => router.push('/tickets/quadros') },
              ].map((o) => (
                <button key={o.txt} onClick={() => { setMenu(false); o.acao() }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', background: 'transparent', padding: '11px 14px', fontSize: 13.5, cursor: 'pointer', textAlign: 'left', color: 'var(--portal-text,#111)' }}>
                  {o.ic} {o.txt}
                  {typeof o.n === 'number' && <span style={{ marginLeft: 'auto', fontWeight: 800, fontSize: 12, padding: '1px 8px', borderRadius: 999, background: o.destaque ? '#dc2626' : 'var(--portal-bg,#f5f5f5)', color: o.destaque ? '#fff' : 'var(--portal-text-muted,#888)' }}>{o.n}</span>}
                </button>
              ))}
              <button onClick={esconderAtalho} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', border: 'none', borderTop: '1px solid var(--portal-border,#f0f0f0)', background: 'transparent', padding: '11px 14px', fontSize: 12.5, cursor: 'pointer', textAlign: 'left', color: 'var(--portal-text-muted,#888)' }}>
                <EyeOff size={15} /> Não mostrar este atalho
              </button>
            </div>
          )}
          <button onClick={() => setMenu((m) => !m)} aria-label="Central de Trabalho" title="Central de Trabalho"
            style={{ width: 58, height: 58, borderRadius: '50%', border: 'none', background: VERMELHO, color: '#fff', cursor: 'pointer', boxShadow: '0 8px 24px rgba(220,38,38,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            {menu ? <X size={24} /> : <Kanban size={24} />}
            {!menu && h.itens.length + h.pendentes.length > 0 && (
              <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 22, height: 22, padding: '0 6px', borderRadius: 11, background: '#fff', color: '#dc2626', fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px solid #dc2626' }}>{h.itens.length + h.pendentes.length}</span>
            )}
          </button>
        </div>
      )}

      {novo && <FormTicket onFechar={() => setNovo(false)} onCriado={(id) => { setNovo(false); setTicketAberto(id); carregar() }} />}
      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={carregar} />}
    </>
  )
}
