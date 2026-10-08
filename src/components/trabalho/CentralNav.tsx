'use client'
// CENTRAL DE TRABALHO — barra única do módulo. Fica no topo de /tickets*,
// /cronograma* e /tarefas. Quadros (os blocos de cada um) é a casa; Cronograma
// é a visão geral por dia; Pendências só aparece pra quem tem tarefas
// automáticas (robôs do estoque / DRE). Criar ticket e tarefa = botões.
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Ticket as TicketIcon, GanttChartSquare, SquareCheck, X, ListTodo,
  ArrowRight, Users, Lock, Calendar, BarChart3,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import FormTicket from '@/components/tickets/FormTicket'
import TicketModal from '@/components/tickets/TicketModal'
import FormTarefa from './FormTarefa'

export default function CentralNav() {
  const pathname = usePathname() || ''
  const { userProfile } = useAuth()
  const { isAdmin } = usePermissoes(userProfile?.id)
  const [ajuda, setAjuda] = useState(false)
  const [novoTicket, setNovoTicket] = useState(false)
  const [preenchido, setPreenchido] = useState<{ titulo: string; descricao: string } | null>(null)
  // Link da notificação "Fulano pediu para você abrir um ticket": abre o Novo
  // ticket já preenchido e limpa a URL.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    if (sp.get('novoTicket') !== '1') return
    const titulo = sp.get('titulo') || ''
    const de = sp.get('pedidoDe') || ''
    // A URL só existe no navegador: ler e abrir o form aqui é sincronizar com algo de fora.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPreenchido({ titulo, descricao: de ? `Pedido de ${de}: ${titulo}` : titulo })
    setNovoTicket(true)
    window.history.replaceState(null, '', window.location.pathname)
  }, [pathname])
  const [novaTarefa, setNovaTarefa] = useState(false)
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState(0)

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/trabalho/central', { headers: await authHeaders() })
        const j = await r.json()
        if (vivo && r.ok) setPendencias(j.pendencias || 0)
      } catch { /* sem contagem: a aba fica escondida */ }
    })()
    return () => { vivo = false }
  }, [pathname])

  // /tickets (exato) é só a Visão gerencial; o resto de /tickets* é Quadros.
  const naGerencial = pathname === '/tickets'
  const emQuadros = pathname.startsWith('/tickets') && !naGerencial
  const abas = [
    { href: '/tickets/quadros', label: 'Quadros', icone: <LayoutGrid size={16} />, ativo: emQuadros },
    { href: '/cronograma', label: 'Cronograma', icone: <GanttChartSquare size={16} />, ativo: pathname.startsWith('/cronograma') },
    ...(isAdmin ? [{ href: '/tickets?aba=gerencial', label: 'Visão gerencial', icone: <BarChart3 size={16} />, ativo: naGerencial }] : []),
    ...(pendencias > 0 || pathname.startsWith('/tarefas')
      ? [{ href: '/tarefas', label: 'Pendências', icone: <ListTodo size={16} />, ativo: pathname.startsWith('/tarefas'), n: pendencias }]
      : []),
  ]
  // Avisa a página aberta (Quadros/Cronograma) que algo novo foi criado.
  const avisarMudanca = () => window.dispatchEvent(new Event('central-trabalho-mudou'))
  const botao = (cor: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: 'none', flex: 'none',
    background: cor, color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  })

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
            {'n' in a && typeof a.n === 'number' && a.n > 0 && (
              <span style={{ fontSize: 11, fontWeight: 800, padding: '1px 7px', borderRadius: 999, background: '#dc2626', color: '#fff' }}>{a.n}</span>
            )}
          </Link>
        ))}
        <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
          <button onClick={() => setNovoTicket(true)} style={botao('#dc2626')}><TicketIcon size={15} /> Novo ticket</button>
          <button onClick={() => setNovaTarefa(true)} style={botao('#16a34a')}><SquareCheck size={15} /> Nova tarefa</button>
          <button onClick={() => setAjuda(true)} title="Como funciona" aria-label="Como funciona a Central de Trabalho"
            style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>?</button>
        </span>
      </nav>
      {ajuda && <ComoFunciona onFechar={() => setAjuda(false)} />}
      {novoTicket && (
        <FormTicket tituloInicial={preenchido?.titulo} descricaoInicial={preenchido?.descricao}
          onFechar={() => { setNovoTicket(false); setPreenchido(null) }}
          onCriado={(id) => { setNovoTicket(false); avisarMudanca(); setTicketAberto(id) }} />
      )}
      {novaTarefa && (
        <FormTarefa onFechar={() => setNovaTarefa(false)}
          onNovoTicket={() => { setNovaTarefa(false); setNovoTicket(true) }}
          onCriada={(id) => { setNovaTarefa(false); avisarMudanca(); setTicketAberto(id) }} />
      )}
      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={avisarMudanca} />}
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
    ['1. Peça', 'Novo ticket: o que precisa, para quem e até quando. Quem pediu acompanha o dia e a situação até o fim.'],
    ['2. Quem recebe organiza', 'Confirma (ou propõe outra data / recusa) e escolhe em qual BLOCO o ticket vai e se fica privado ou compartilhado com o bloco.'],
    ['3. Blocos', 'Cada pessoa tem os seus blocos, por assunto, cada um de uma cor. Dá pra convidar colegas para um bloco.'],
    ['4. Tarefas', 'Nova tarefa sempre dentro de um ticket (que você criou ou recebeu): os passos pequenos, com quem faz e prazo.'],
    ['5. Cronograma', 'Tudo que você pode ver, por dia, cada ticket na cor do seu bloco. Atrasados aparecem primeiro.'],
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
            O <b>Ticket</b> é o pedido. Quem recebe guarda num dos seus <b>Blocos</b> (por assunto, cada um de uma cor). As <b>Tarefas</b> são os passos dentro do ticket. O <b>Cronograma</b> junta tudo por dia.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', flexWrap: 'wrap' }}>
            <div style={caixa(true)}><TicketIcon size={22} color="#dc2626" /><b>Ticket</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>o pedido</small></div>
            <div style={seta}><span>quem recebe<br />escolhe</span><ArrowRight size={18} /></div>
            <div style={caixa(false)}><LayoutGrid size={22} color="#dc2626" /><b>Bloco</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>organização, com cor</small></div>
            <div style={seta}><span>por dia</span><ArrowRight size={18} /></div>
            <div style={caixa(false)}><Calendar size={22} color="#dc2626" /><b>Cronograma</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>tudo, na cor do bloco</small></div>
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14, fontSize: 13.5 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Lock size={16} color="#6b7280" /> <b>Privado</b>: só você, quem pediu e quem estiver no ticket</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Users size={16} color="#059669" /> <b>Compartilhado</b>: quem participa do bloco também vê</div>
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
