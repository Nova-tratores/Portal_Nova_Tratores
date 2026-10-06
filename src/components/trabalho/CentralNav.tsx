'use client'
// CENTRAL DE TRABALHO — barra única do módulo (Tarefas + Tickets + Cronograma).
// Fica no topo de /tickets, /tickets/quadros, /tickets/compras, /cronograma e /tarefas.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  LayoutGrid, Ticket as TicketIcon, Send, GanttChartSquare, SquareCheck, ShoppingCart, X,
  ArrowRight, ArrowLeft, CircleCheck, Clock, Calendar,
} from 'lucide-react'

export default function CentralNav() {
  const pathname = usePathname() || ''
  const sp = useSearchParams()
  const [ajuda, setAjuda] = useState(false)
  const aba = sp?.get('aba')
  const emTickets = pathname === '/tickets' || (pathname.startsWith('/tickets/') && !pathname.startsWith('/tickets/quadros') && !pathname.startsWith('/tickets/compras'))
  const abas = [
    { href: '/tickets/quadros', label: 'Quadros', icone: <LayoutGrid size={16} />, ativo: pathname.startsWith('/tickets/quadros') },
    { href: '/tickets', label: 'Tickets', icone: <TicketIcon size={16} />, ativo: emTickets && aba !== 'pedidos' },
    { href: '/tickets?aba=pedidos', label: 'Meus pedidos', icone: <Send size={16} />, ativo: emTickets && aba === 'pedidos' },
    { href: '/cronograma', label: 'Cronograma', icone: <GanttChartSquare size={16} />, ativo: pathname.startsWith('/cronograma') },
    { href: '/tarefas', label: 'Tarefas', icone: <SquareCheck size={16} />, ativo: pathname.startsWith('/tarefas') },
    { href: '/tickets/compras', label: 'Solicitações de Compras', icone: <ShoppingCart size={16} />, ativo: pathname.startsWith('/tickets/compras') },
  ]

  return (
    <>
      <nav aria-label="Central de Trabalho" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--portal-border,#eee)', background: 'var(--portal-surface,#fff)', overflowX: 'auto' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--portal-text,#111)', padding: '12px 12px 12px 0', marginRight: 4, borderRight: '1px solid var(--portal-border,#eee)', whiteSpace: 'nowrap' }}>Central de Trabalho</span>
        {abas.map((a) => (
          <Link key={a.label} href={a.href} style={{
            display: 'flex', alignItems: 'center', gap: 6, padding: '12px 14px', whiteSpace: 'nowrap',
            fontSize: 14, fontWeight: 600, textDecoration: 'none',
            color: a.ativo ? '#dc2626' : 'var(--portal-text-muted,#888)',
            borderBottom: a.ativo ? '2px solid #dc2626' : '2px solid transparent',
          }}>
            {a.icone} {a.label}
          </Link>
        ))}
        <button onClick={() => setAjuda(true)} title="Como funciona" aria-label="Como funciona a Central de Trabalho"
          style={{ marginLeft: 'auto', flex: 'none', width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>?</button>
      </nav>
      {ajuda && <ComoFunciona onFechar={() => setAjuda(false)} />}
    </>
  )
}

function ComoFunciona({ onFechar }: { onFechar: () => void }) {
  const caixa = (forte: boolean): React.CSSProperties => ({
    flex: '1 1 140px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 10px', borderRadius: 12, textAlign: 'center',
    border: forte ? '2px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)', background: forte ? 'rgba(220,38,38,.06)' : 'var(--portal-bg,#fafafa)', color: 'var(--portal-text,#111)',
  })
  const seta: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-muted,#888)', textAlign: 'center', flex: 'none' }
  const passos = [
    ['1. Planeje', 'Monte as etapas no Cronograma (duração, quem faz, o que depende do quê). O sistema calcula as datas e o caminho crítico.'],
    ['2. Comece', 'Na etapa, clique Iniciar: nasce um ticket no quadro do projeto, com prazo e responsável. A etapa fica "em andamento" com a data real.'],
    ['3. Execute', 'O trabalho anda no ticket: conversa, anexos, checklist de tarefas e a coluna do quadro.'],
    ['4. Conclua', 'Ticket resolvido = etapa concluída no Cronograma. As etapas seguintes são recalculadas.'],
    ['5. Atrasou?', 'Se o ticket passa do previsto sem resolver, o Cronograma replaneja sozinho e mostra a nova data de entrega.'],
    ['6. Coisas soltas', 'Uma tarefa que cresceu vira ticket e etapa do Cronograma com um botão só: Transformar. Um ticket fora do plano entra com Planejar.'],
  ]
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onFechar() }} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cf-t" style={{ width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--portal-border,#eee)' }}>
          <h2 id="cf-t" style={{ margin: 0, fontSize: 18, color: 'var(--portal-text,#111)' }}>Como funciona</h2>
          <button onClick={onFechar} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text,#111)' }}><X size={15} /> Fechar</button>
        </header>
        <div style={{ padding: 18, color: 'var(--portal-text,#111)' }}>
          <p style={{ margin: 0, color: 'var(--portal-text-secondary,#555)', fontSize: 13.5 }}>
            O Cronograma diz <b>quando deveria</b> acontecer. O Ticket mostra <b>o que está acontecendo</b>. A Tarefa é o <b>passo pequeno</b> dentro disso. Qualquer um pode virar o outro, e as datas se ajustam sozinhas.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', flexWrap: 'wrap' }}>
            <div style={caixa(false)}><SquareCheck size={22} color="#dc2626" /><b>Tarefa</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>o passo pequeno</small></div>
            <div style={seta}><span>Transformar<br />ou incluir</span><ArrowRight size={18} /></div>
            <div style={caixa(true)}><TicketIcon size={22} color="#dc2626" /><b>Ticket</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>o que está acontecendo</small></div>
            <div style={seta}><ArrowLeft size={18} /><span>Iniciar</span></div>
            <div style={caixa(false)}><Calendar size={22} color="#dc2626" /><b>Cronograma</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>quando deveria acontecer</small></div>
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14, fontSize: 13.5 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><CircleCheck size={16} color="#059669" /> Ticket <b>resolvido</b> = etapa <b>concluída</b> no cronograma</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Clock size={16} color="#d97706" /> Ticket <b>atrasado</b> = cronograma <b>empurra</b> as próximas etapas sozinho</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
            {passos.map(([t, d]) => (
              <div key={t} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                <b style={{ display: 'block', color: 'var(--portal-text,#111)', marginBottom: 4 }}>{t}</b>{d}
              </div>
            ))}
          </div>
          <PreferenciaAtalho />
        </div>
      </div>
    </div>
  )
}

// Cada pessoa escolhe se quer o atalho flutuante na dashboard.
function PreferenciaAtalho() {
  const [ligado, setLigado] = useState<boolean | null>(null)
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/trabalho/hoje', { headers: await authHeaders() })
        const j = await r.json()
        if (vivo && j?.ativo) setLigado(j.preferencias?.atalho_flutuante !== false)
      } catch { /* sem preferência */ }
    })()
    return () => { vivo = false }
  }, [])
  if (ligado === null) return null
  const trocar = async (v: boolean) => {
    setLigado(v)
    try {
      const r = await fetch('/api/trabalho/hoje', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'preferencias', atalho_flutuante: v }) })
      if (!r.ok) setLigado(!v)
    } catch { setLigado(!v) }
  }
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--portal-border,#eee)', fontSize: 13.5, cursor: 'pointer' }}>
      <input type="checkbox" checked={ligado} onChange={(e) => trocar(e.target.checked)} />
      Mostrar o atalho flutuante da Central de Trabalho na minha dashboard
    </label>
  )
}
