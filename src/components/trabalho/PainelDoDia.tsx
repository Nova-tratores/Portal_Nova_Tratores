'use client'
// CENTRAL DE TRABALHO — o que aparece na cara da pessoa, em qualquer tela:
//  1) "Fulano criou um ticket para você": Confirmar · Propor outra data · Recusar
//  2) "Seu dia" a partir das 7:30, até ela fechar — desde 24/11/2026 é uma FAIXA no topo, sem
//     travar a tela, na ordem da Minha fila (antes: janela que juntava cronograma, tickets e
//     passos fora de ordem). Pedido novo não pula mais na cara: fica em "Chegou pra você"
//     na Minha fila (a janela antiga continua no código, desligada em JANELAS_ANTIGAS).
//  3) Atalho flutuante na dashboard (cada um escolhe se quer)
import { useCallback, useEffect, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import {
  Check, CircleX, CalendarClock, Kanban, X, Inbox, Sun, Send, Plus, ArrowUpRight, EyeOff,
} from 'lucide-react'
import { createPortal } from 'react-dom'
import { authHeaders } from '@/lib/auth/client'
import { DOCA_ID } from '@/components/dashboard/AtalhosDashboard'
import dynamic from 'next/dynamic'
import EscolhaBloco, { carregarMeusBlocos, type EscolhaBlocoValor } from './EscolhaBloco'
import SeletorDataAgenda from './SeletorDataAgenda'

// ticket (novo ou aberto) só vem quando alguém clica (03/11/2026: o Painel do Dia fica em toda página)
const FormTicket = dynamic(() => import('@/components/tickets/FormTicket'), { ssr: false })
const TicketModal = dynamic(() => import('@/components/tickets/TicketModal'), { ssr: false })

interface Pendente { id: string; numero: number; titulo: string; prazo: string | null; solicitante_nome: string; quadro_id?: string | null; quadro_nome: string | null; visibilidade?: 'privado' | 'publico' }
interface Item { tipo: 'andamento' | 'comeca' | 'ticket' | 'tarefa' | 'reuniao'; texto: string; detalhe?: string; ticketId?: string | null; atrasado?: boolean; link?: string }
interface ItemFilaHoje { id: string; numero: number; titulo: string; horas: number; atrasado: boolean }
interface Hoje { ativo: boolean; hora: string; pendentes: Pendente[]; itens: Item[]; confirmado: boolean; pedidos: number; preferencias: { atalho_flutuante: boolean }
  fila?: { hoje: ItemFilaHoje[]; semana: unknown[]; atrasados: number } | null }
/** true = volta a janela "Fulano criou um ticket para você" pulando na tela. */
const JANELAS_ANTIGAS = false

const VERMELHO = 'linear-gradient(135deg,#dc2626,#7f1d1d)'
const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const hojeIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

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
  // Quantos blocos a pessoa tem (null = ainda carregando). Zero = confirmar cria "Meu trabalho".
  const [qtdBlocos, setQtdBlocos] = useState<number | null>(null)

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
    // Voltar para a janela recarregava SEMPRE (cada volta = uma chamada de segundos, e elas se
    // empilhavam). Agora no máximo a cada 2 min (24/11/2026).
    let ultima = Date.now()
    const foco = () => { if (Date.now() - ultima > 120_000) { ultima = Date.now(); carregar() } }
    window.addEventListener('focus', foco)
    return () => { clearInterval(t); window.removeEventListener('focus', foco) }
  }, [carregar])

  // Na dashboard o atalho entra na doca de atalhos (lado a lado com o da Agenda, sem sobrepor)
  const [doca, setDoca] = useState<HTMLElement | null>(null)
  const naDash = pathname === '/dashboard' || pathname === '/'
  useEffect(() => {
    if (!naDash) return
    let t: ReturnType<typeof setInterval> | null = null
    const achar = () => { const d = document.getElementById(DOCA_ID); if (d) setDoca(d); return !!d }
    void Promise.resolve().then(() => { if (!achar()) t = setInterval(() => { if (achar() && t) clearInterval(t) }, 300) })
    return () => { if (t) clearInterval(t); setDoca(null) }
  }, [naDash])
  const naDoca = (el: React.ReactNode) => (doca && doca.isConnected ? createPortal(el, doca) : el)

  if (!h?.ativo) return null
  const pend = JANELAS_ANTIGAS ? h.pendentes[0] : undefined
  const org: EscolhaBlocoValor = organizacao && pend && organizacao.id === pend.id
    ? organizacao.valor
    : { quadroId: null, visibilidade: pend?.visibilidade || 'privado' }
  // Ticket criado direto num bloco fica nele; senão vai pro bloco escolhido.
  const extraOrg = pend?.quadro_id ? {} : { quadro_id: org.quadroId, visibilidade: org.visibilidade }
  // Todo ticket precisa estar num bloco: sem bloco escolhido não confirma.
  const faltaBloco = !!pend && !pend.quadro_id && !org.quadroId
  // Quem ainda não tem bloco nenhum não fica travado: o Confirmar cria o bloco pessoal na hora.
  const criaBloco = faltaBloco && qtdBlocos === 0
  const travado = faltaBloco && !criaBloco
  const reunioesHoje = h.itens.filter((i) => i.tipo === 'reuniao')
  const filaHoje = h.fila?.hoje || []
  const temAlgo = filaHoje.length > 0 || reunioesHoje.length > 0 || h.pendentes.length > 0
  // Faixa: a partir das 7:30 até fechar no X (ou pelo atalho). Na própria Minha fila não precisa.
  const mostrarDia = !pend && temAlgo && !pathname.startsWith('/fila') && ((h.hora >= '07:30' && !h.confirmado && !diaFechado) || verDia)
  const naDashboard = pathname === '/dashboard' || pathname === '/'
  // Atalho redondo da Central DESLIGADO no dashboard novo por setor (José, 10/11/2026: "está poluindo");
  // a Central virou botão em Adicionais › Dia a dia. Para voltar, troque ATALHO_NA_DASHBOARD para true.
  const ATALHO_NA_DASHBOARD = false
  const atalho = ATALHO_NA_DASHBOARD && naDashboard && h.preferencias.atalho_flutuante && !pend && !mostrarDia

  const decidir = async (corpo: Record<string, unknown>) => {
    if (!pend) return
    setSalvando(true); setErro('')
    try {
      if (criaBloco && corpo.decisao !== 'recusar') {
        const rq = await fetch('/api/tickets/quadros', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
          body: JSON.stringify({ nome: 'Meu trabalho', descricao: 'Quadro pessoal, criado ao confirmar o primeiro ticket.', visibilidade: 'privado' }) })
        const jq = await rq.json().catch(() => ({}))
        if (!rq.ok || !jq.quadro?.id) { setErro(jq.error || 'Não deu para criar o quadro "Meu trabalho" — tente de novo.'); return }
        corpo = { ...corpo, quadro_id: jq.quadro.id, visibilidade: org.visibilidade }
        try { localStorage.setItem('ct-ultimo-bloco', jq.quadro.id) } catch { /* ignora */ }
        setQtdBlocos(1); carregarMeusBlocos(true).catch(() => {})
      }
      const res = await fetch(`/api/tickets/${pend.id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'aceite', ...corpo }) })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { setErro(json.error || 'Falha'); return }
      setModo(null); setMotivo(''); setNovaData(''); setOrganizacao(null)
      await carregar()
    } catch {
      setErro('Falha de conexão — tente de novo.')
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
  const caixa: React.CSSProperties = { width: '100%', maxWidth: 520, maxHeight: '92vh', overflowY: 'auto', background: 'var(--portal-bg-card,#fff)', borderRadius: 16, overflowX: 'hidden', boxShadow: '0 24px 70px rgba(0,0,0,.4)' }
  const topo: React.CSSProperties = { background: VERMELHO, color: '#fff', padding: '18px 20px' }
  const btn = (cor?: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 10, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: cor ? 'none' : '1px solid var(--portal-border,#e5e7eb)', background: cor || 'var(--portal-bg-card,#fff)', color: cor ? '#fff' : 'var(--portal-text,#111)' })

  return (
    <>
      {/* 1) Confirmação de ticket recebido */}
      {/* Com um ticket aberto por aqui, o aviso some (senão ficaria por cima dele) e volta ao fechar */}
      {pend && !ticketAberto && (
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
                  <EscolhaBloco key={pend.id} valor={org} autoSelecionar onCarregado={(b) => setQtdBlocos(b.length)} onChange={(v) => setOrganizacao({ id: pend.id, valor: v })} />
                  {criaBloco && <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--portal-text-secondary,#555)' }}>Ao confirmar, criamos para você o quadro <b>“Meu trabalho”</b> e o ticket entra nele.</div>}
                </div>
              )}
              {modo === 'data' && (
                <div style={{ marginTop: 12 }}>
                  <SeletorDataAgenda diasUteis rotulo="Consigo fazer até" value={novaData} onChange={setNovaData} min={hojeIso()} textoVazio="Escolha a data" ignorar={pend.titulo} />
                  <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#888)' }}>Sugestão: seu primeiro dia livre.</span>
                </div>
              )}
              {modo === 'recusar' && (
                <label style={{ display: 'block', marginTop: 12, fontSize: 12, fontWeight: 700, color: 'var(--portal-text-muted,#888)' }}>Por que não consegue? (vai para quem pediu)
                  <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} autoFocus placeholder="Ex.: estou na feira até sexta; peça ao Henri"
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fff)', color: 'var(--portal-text,#111)', resize: 'vertical' }} />
                </label>
              )}
              {travado && modo !== 'recusar' && <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 8, background: 'rgba(217,119,6,.12)', color: '#b45309', fontSize: 13, fontWeight: 700 }}>Escolha acima em qual quadro o ticket vai para poder confirmar.</div>}
              {erro && <div style={{ marginTop: 8, color: '#dc2626', fontSize: 13, fontWeight: 600 }}>{erro}</div>}
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--portal-border,#f0f0f0)', display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
              {modo === null ? (
                <>
                  <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button style={btn()} onClick={() => setModo('recusar')}><CircleX size={15} /> Recusar</button>
                    <button style={btn()} onClick={sugerirData}><CalendarClock size={15} /> Propor outra data</button>
                  </span>
                  <button style={{ ...btn('#059669'), ...(salvando || travado ? { opacity: .45, cursor: 'not-allowed' } : {}) }} disabled={salvando || travado} title={travado ? 'Escolha um quadro acima' : undefined} onClick={() => decidir({ decisao: 'confirmar', ...extraOrg })}><Check size={15} /> {salvando ? 'Confirmando…' : 'Confirmar'}</button>
                </>
              ) : (
                <>
                  <button style={btn()} onClick={() => { setModo(null); setErro('') }}>Voltar</button>
                  {modo === 'data'
                    ? <button style={{ ...btn('#059669'), ...(salvando || !novaData || travado ? { opacity: .45, cursor: 'not-allowed' } : {}) }} disabled={salvando || !novaData || travado} onClick={() => decidir({ decisao: 'nova_data', data: novaData, ...extraOrg })}><Check size={15} /> Confirmar com esta data</button>
                    : <button style={btn('#dc2626')} disabled={salvando || !motivo.trim()} onClick={() => decidir({ decisao: 'recusar', motivo })}><CircleX size={15} /> Recusar ticket</button>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2) Seu dia (7:30): FAIXA no topo, não trava a tela */}
      {mostrarDia && !ticketAberto && (() => {
        const primeiro = filaHoje[0]
        const horas = filaHoje.reduce((t, i) => t + i.horas, 0)
        const reuniao = reunioesHoje[0]
        return (
          <div role="status" aria-live="polite"
            style={{ position: 'fixed', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 950, width: 'min(860px, calc(100vw - 24px))',
              display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', padding: '10px 12px 10px 16px', borderRadius: 14,
              background: 'var(--portal-bg-card,#fff)', border: '1px solid rgba(217,119,6,.45)', boxShadow: '0 14px 34px -16px rgba(0,0,0,.45)', color: 'var(--portal-text,#111)' }}>
            <Sun size={20} color="#d97706" style={{ flex: 'none' }} />
            <span style={{ flex: '1 1 320px', minWidth: 0, fontSize: 13.5, lineHeight: 1.45 }}>
              <b>Bom dia{nome ? `, ${nome.split(' ')[0]}` : ''}!</b>{' '}
              {filaHoje.length > 0
                ? <>Hoje: <b>{filaHoje.length} {filaHoje.length === 1 ? 'item' : 'itens'}</b> ({String(Math.round(horas * 10) / 10).replace('.', ',')} h)</>
                : 'Nada na fila para hoje'}
              {reuniao && <> · reunião {(reuniao.detalhe || '').slice(0, 5)}{reunioesHoje.length > 1 ? ` (+${reunioesHoje.length - 1})` : ''}</>}
              {h.pendentes.length > 0 && <> · <b style={{ color: '#2563eb' }}>{h.pendentes.length} {h.pendentes.length === 1 ? 'pedido chegou' : 'pedidos chegaram'}</b></>}
              {primeiro && <><br />Comece pelo <b>#{primeiro.numero} {primeiro.titulo}</b>{primeiro.atrasado && <span style={{ color: 'var(--cor-atrasado-texto)', fontWeight: 700 }}> (atrasado)</span>}</>}
            </span>
            <button style={btn('#d97706')} onClick={() => { void confirmarDia(); router.push('/fila') }}><Send size={15} /> Abrir minha fila</button>
            <button onClick={confirmarDia} aria-label="Fechar o lembrete de hoje" title="Fechar (volta amanhã)"
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 6, color: 'var(--portal-text-muted,#888)', display: 'flex' }}><X size={18} /></button>
          </div>
        )
      })()}

      {/* 3) Atalho flutuante na dashboard */}
      {atalho && naDoca(
        <div style={doca ? { position: 'relative', order: -1, pointerEvents: 'auto' } : { position: 'fixed', right: 22, bottom: 'calc(22px + env(safe-area-inset-bottom, 0px))', zIndex: 900 }}>
          {menu && (
            <div style={{ position: 'absolute', right: 0, bottom: 70, width: 290, maxWidth: 'calc(100vw - 44px)', background: 'var(--portal-bg-card,#fff)', border: '1px solid var(--portal-border,#f0f0f0)', borderRadius: 14, boxShadow: '0 16px 40px rgba(0,0,0,.18)', overflow: 'hidden' }}>
              <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--portal-border,#f0f0f0)', fontWeight: 800, fontSize: 14, display: 'flex', alignItems: 'center', gap: 8, color: 'var(--portal-text,#111)' }}><Kanban size={16} color="#dc2626" /> Central de Trabalho</div>
              {[
                { ic: <Inbox size={16} />, txt: 'Para confirmar', n: h.pendentes.length, destaque: h.pendentes.length > 0, acao: () => carregar() },
                { ic: <Sun size={16} />, txt: 'Meu dia', n: h.itens.length, acao: () => setVerDia(true) },
                { ic: <Send size={16} />, txt: 'Meus pedidos', n: h.pedidos, acao: () => router.push('/tickets/quadros#pedidos') },
                { ic: <Plus size={16} />, txt: 'Novo ticket', acao: () => setNovo(true) },
                { ic: <ArrowUpRight size={16} />, txt: 'Abrir minha fila', acao: () => router.push('/fila') },
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
