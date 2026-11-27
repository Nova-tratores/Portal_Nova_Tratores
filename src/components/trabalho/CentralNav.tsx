'use client'
// CENTRAL DE TRABALHO — barra única do módulo. Fica no topo de /tickets*,
// /cronograma* e /tarefas. Quadros (os de cada um) é a casa; Cronograma
// é a visão geral por dia; Pendências só aparece pra quem tem tarefas
// automáticas (robôs do estoque / DRE). Criar ticket = botão; o checklist
// (passos) se cria dentro do ticket (Fase 0, 24/11/2026: sem "Nova tarefa" solta).
import { useEffect, useState } from 'react'
import { authHeaders } from '@/lib/auth/client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutGrid, Ticket as TicketIcon, GanttChartSquare, X, ListTodo,
  ArrowRight, Users, Lock, Calendar, Lightbulb, CalendarClock, MapPin, CalendarDays, ListOrdered, Send, ShoppingCart,
} from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import FormTicket from '@/components/tickets/FormTicket'
import TicketModal from '@/components/tickets/TicketModal'
import { useBlocoAtual, type BlocoAtual } from '@/lib/trabalho/bloco-atual'
import { ESTILO_CENTRAL_VN } from './visualCentral'
import PaletaComandos from './PaletaComandos'

export default function CentralNav() {
  const pathname = usePathname() || ''
  const { userProfile } = useAuth()
  const { isDev } = usePermissoes(userProfile?.id)
  // "Minha equipe" só para líder de setor (pelo cargo, organograma) e dev (José, 27/11/2026).
  const [veEquipe, setVeEquipe] = useState(false)
  useEffect(() => {
    if (!userProfile?.id) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/eu/papel', { headers: await authHeaders(), cache: 'no-store' })
        if (r.ok && vivo) setVeEquipe(!!((await r.json()) as { veEquipe?: boolean }).veEquipe)
      } catch { /* sem resposta: a aba não aparece */ }
    })()
    return () => { vivo = false }
  }, [userProfile?.id])
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
  // Dentro de um bloco: o ticket novo vai para ele — depois de confirmar.
  const bloco = useBlocoAtual()
  const [perguntaBloco, setPerguntaBloco] = useState(false)
  const [noBloco, setNoBloco] = useState<BlocoAtual | null>(null)
  const abrirNovoTicket = () => {
    if (bloco) { setPerguntaBloco(true); return }
    setNoBloco(null); setNovoTicket(true)
  }
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  const [pendencias, setPendencias] = useState(0)
  const [reunioesHoje, setReunioesHoje] = useState(0)

  // Contagens da barra. Desde 24/11/2026 a barra fica montada no PortalLayout (não desmonta ao
  // navegar): carrega uma vez e de novo só quando algo muda — antes eram 2 chamadas a cada página.
  const [parados, setParados] = useState(0)
  useEffect(() => {
    let vivo = true
    const contar = async () => {
      const h = await authHeaders()
      const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
      const [c, r, fx] = await Promise.allSettled([
        fetch('/api/trabalho/central?so=contagem', { headers: h }).then((x) => x.json()),
        fetch('/api/reunioes?visao=minhas', { headers: h }).then((x) => x.json()),
        fetch('/api/trabalho/faxina?contar=1', { headers: h }).then((x) => x.json()),
      ])
      if (!vivo) return
      if (c.status === 'fulfilled') setPendencias(c.value.pendencias || 0)
      if (r.status === 'fulfilled') setReunioesHoje(((r.value.reunioes || []) as { prazo?: string | null }[]).filter((t) => t.prazo === hoje).length)
      if (fx.status === 'fulfilled') setParados(fx.value.n || 0)
    }
    void contar()
    window.addEventListener('central-trabalho-mudou', contar)
    return () => { vivo = false; window.removeEventListener('central-trabalho-mudou', contar) }
  }, [])

  // /tickets (exato) é só a Visão gerencial; o resto de /tickets* é Quadros (por link).
  const naGerencial = pathname === '/tickets'
  const emQuadros = pathname.startsWith('/tickets') && !naGerencial
  // Barra única (melhorias 1.4, 24/11/2026): Minha fila · Equipe · Todos · Agenda · Reuniões · Ideias.
  // Lista/Kanban/Gantt/Calendário são um seletor DENTRO de Todos. Agenda tem a vista Salas ao lado.
  const naAgenda = pathname.startsWith('/agenda') || pathname.startsWith('/salas')
  const naEquipe = pathname.startsWith('/fila/equipe')
  const naEsperando = pathname.startsWith('/fila/esperando')
  const abas = [
    // Minha fila: o item da vez, os próximos, o que chegou. O número = pedidos parados (Faxina).
    { href: '/fila', label: 'Minha fila', icone: <ListOrdered size={15} />, ativo: pathname.startsWith('/fila') && !naEquipe && !naEsperando, n: parados },
    // Esperando: o que EU pedi para os outros (saiu da coluna da Minha fila, 26/11/2026).
    { href: '/fila/esperando', label: 'Esperando', icone: <Send size={15} />, ativo: naEsperando },
    // Equipe: a carga de cada pessoa, só números.
    ...(veEquipe || isDev ? [{ href: '/fila/equipe', label: 'Minha equipe', icone: <Users size={15} />, ativo: naEquipe }] : []),
    // Todos os pedidos (lista, kanban, Gantt, calendário) + Visão geral e quadros por link.
    { href: '/cronograma', label: 'Todos', icone: <GanttChartSquare size={15} />, ativo: pathname.startsWith('/cronograma') || (pathname.startsWith('/tickets') && !pathname.startsWith('/tickets/compras')) },
    // Compras (José, 26/11/2026): o kanban das Solicitações de Compra já existia, mas tinha ficado sem aba.
    { href: '/tickets/compras', label: 'Compras', icone: <ShoppingCart size={15} />, ativo: pathname.startsWith('/tickets/compras') },
    // Agenda coletiva (todos por setor + reuniões, prazos, técnicos) com a vista Salas.
    { href: '/agenda', label: 'Agenda', icone: <CalendarDays size={15} />, ativo: naAgenda },
    // Reuniões (pauta + ata): mesma permissão da Central.
    { href: '/reunioes', label: 'Reuniões', icone: <CalendarClock size={15} />, ativo: pathname.startsWith('/reunioes'), n: reunioesHoje },
    // Bloco de notas dos devs (captar → agrupar → planejar vira pedido). A tela é só de Dev.
    ...(isDev ? [{ href: '/ideias', label: 'Ideias', icone: <Lightbulb size={15} />, ativo: pathname.startsWith('/ideias') }] : []),
    ...(pendencias > 0 || pathname.startsWith('/tarefas')
      ? [{ href: '/tarefas', label: 'Pendências', icone: <ListTodo size={15} />, ativo: pathname.startsWith('/tarefas'), n: pendencias }]
      : []),
  ]
  const vistas = naAgenda ? [
    { href: '/agenda', label: 'Calendário', icone: <CalendarDays size={14} />, ativo: pathname.startsWith('/agenda') },
    { href: '/salas', label: 'Salas', icone: <MapPin size={14} />, ativo: pathname.startsWith('/salas') },
  ] : []
  // Avisa a página aberta (Quadros/Cronograma) que algo novo foi criado.
  const avisarMudanca = () => window.dispatchEvent(new Event('central-trabalho-mudou'))
  const botao = (cor: string): React.CSSProperties => ({
    // NewPortal (José, 17/11/2026): cheio, sem negrito, cantos 11 — o transparente "ficou feio"
    display: 'flex', alignItems: 'center', gap: 7, height: 38, padding: '0 15px', borderRadius: 11, border: 'none', flex: 'none',
    background: cor, color: '#fefefe', fontSize: 13.5, fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
    boxShadow: `0 6px 14px -8px ${cor}`,
  })

  return (
    <>
      {/* Tela estreita: abas numa linha (rolam de lado) e os botões de criar na linha de baixo. */}
      <style>{ESTILO_CENTRAL_VN}</style>
      {/* 901–1100 px (Fase 0, 24/11/2026): sem rolar de lado. Aba que não está aberta mostra só o ícone; o nome vem no title. */}
      <style>{`@media (min-width: 901px) and (max-width: 1100px){.ct-aba{padding:9px 10px 10px !important}.ct-aba:not(.on) .ct-aba-txt{display:none}}`}</style>
      <style>{`.ct-vistas{display:flex;gap:4px;padding:3px;margin-left:10px;border-radius:11px;background:var(--portal-bg-secondary,#f1f5f9);flex:none}
.ct-vista{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border-radius:9px;font-size:13px;font-weight:500;color:var(--portal-text-secondary,#475569);text-decoration:none;white-space:nowrap}
.ct-vista:hover{color:var(--portal-text,#0f172a)}
.ct-vista.on{background:var(--portal-surface,#fefefe);color:var(--portal-text,#0f172a);box-shadow:0 1px 3px rgba(15,23,42,.12)}
@media (max-width:900px){.ct-vistas{order:3;margin:6px 0 4px;overflow-x:auto;max-width:100%}}
@media (max-width:1100px){.ct-k-txt{display:none}}`}</style>
      <style>{`@media (max-width: 900px){.ct-nav{flex-wrap:wrap;padding:0 12px !important}.ct-nav-abas{flex:1 1 100% !important}.ct-nav-acoes{flex:1 1 100%;margin-left:0 !important;padding:8px 0 10px !important;justify-content:flex-end}.ct-nav-acoes button{min-height:36px}.ct-nav-acoes .ct-nav-ajuda{width:36px !important;height:36px !important}}`}</style>
      <nav aria-label="Central de Trabalho" className="ct-nav" style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 16px', borderBottom: '1px solid var(--portal-border,#eee)', background: 'var(--portal-surface,#fff)' }}>
        <div className="ct-nav-abas" style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '0 1 auto', minWidth: 0, overflowX: 'auto' }}>
        {/* abas estilo Chrome, sem o nome do módulo ao lado (José, 04/11/2026 — docs/padrao-telas.md); CSS em visualCentral.ts */}
        {abas.map((a) => (
          <Link key={a.label} href={a.href} className={`ct-aba${a.ativo ? ' on' : ''}`} aria-current={a.ativo ? 'page' : undefined} title={a.label} aria-label={a.label}>
            <span className="ct-aba-ic">{a.icone}</span> <span className="ct-aba-txt">{a.label}</span>
            {'n' in a && typeof a.n === 'number' && a.n > 0 && <span className="ct-aba-n">{a.n}</span>}
          </Link>
        ))}
        </div>
        {vistas.length > 1 && (
          // Vistas da aba aberta (24/11/2026): no lugar das abas que repetiam calendário e kanban.
          <div className="ct-vistas" role="group" aria-label="Vistas">
            {vistas.map((v) => (
              <Link key={v.label} href={v.href} className={`ct-vista${v.ativo ? ' on' : ''}`} aria-current={v.ativo ? 'page' : undefined}>
                {v.icone} {v.label}
              </Link>
            ))}
          </div>
        )}
        <span className="ct-nav-acoes" style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12 }}>
          {/* só na aba Quadros (José, 17/11/2026) */}
          {emQuadros && <button onClick={abrirNovoTicket} style={botao('#dc2626')}><TicketIcon size={15} /> Novo pedido</button>}
          {/* Na Minha fila o pedido é o botão "Pedir para alguém" da própria tela. */}
          {/* Ctrl+K (melhorias 5.4): pedir escrevendo ou ir para uma tela */}
          <PaletaComandos />
          <button className="ct-nav-ajuda" onClick={() => setAjuda(true)} title="Como funciona" aria-label="Como funciona a Central de Trabalho"
            style={{ flex: 'none', width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}>?</button>
        </span>
      </nav>
      {ajuda && <ComoFunciona onFechar={() => setAjuda(false)} />}
      {perguntaBloco && bloco && (
        <ConfirmarBloco nome={bloco.nome} onFechar={() => setPerguntaBloco(false)}
          onEscolher={(sim) => { setPerguntaBloco(false); setNoBloco(sim ? bloco : null); setNovoTicket(true) }} />
      )}
      {novoTicket && (
        <FormTicket tituloInicial={preenchido?.titulo} descricaoInicial={preenchido?.descricao}
          quadro={noBloco ? { id: noBloco.id, nome: noBloco.nome, colunaId: noBloco.colunaId ?? null } : undefined}
          onFechar={() => { setNovoTicket(false); setPreenchido(null); setNoBloco(null) }}
          onCriado={(id) => { setNovoTicket(false); setNoBloco(null); avisarMudanca(); setTicketAberto(id) }} />
      )}
      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={avisarMudanca} />}
    </>
  )
}

function ConfirmarBloco({ nome, onEscolher, onFechar }: { nome: string; onEscolher: (noBloco: boolean) => void; onFechar: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }
    window.addEventListener('keydown', esc)
    return () => window.removeEventListener('keydown', esc)
  }, [onFechar])
  return (
    <div onClick={onFechar} role="dialog" aria-modal="true"
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 400, background: 'var(--portal-surface,#fff)', borderRadius: 14, padding: 22, boxShadow: '0 20px 60px rgba(0,0,0,.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, fontWeight: 800, color: 'var(--portal-text,#111)', marginBottom: 8 }}>
          <LayoutGrid size={18} color="#dc2626" /> Abrir no quadro {nome}?
        </div>
        <p style={{ margin: '0 0 18px', fontSize: 14, lineHeight: 1.5, color: 'var(--portal-text-secondary,#555)' }}>
          Você está dentro do quadro <strong>{nome}</strong>. O ticket novo já entra nele.
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button autoFocus onClick={() => onEscolher(true)}
            style={{ padding: '10px 14px', borderRadius: 8, border: 'none', background: '#dc2626', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            Sim, abrir no quadro {nome}
          </button>
          <button onClick={() => onEscolher(false)}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', color: 'var(--portal-text-secondary,#555)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            Não, abrir fora do quadro
          </button>
        </div>
      </div>
    </div>
  )
}

function ComoFunciona({ onFechar }: { onFechar: () => void }) {
  const caixa = (forte: boolean): React.CSSProperties => ({
    flex: '1 1 140px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '14px 10px', borderRadius: 12, textAlign: 'center',
    border: forte ? '2px solid #dc2626' : '1px solid var(--portal-border,#e5e7eb)', background: forte ? 'rgba(220,38,38,.06)' : 'var(--portal-bg,#fafafa)', color: 'var(--portal-text,#111)',
  })
  const seta: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 11.5, fontWeight: 700, color: 'var(--portal-text-muted,#888)', textAlign: 'center', flex: 'none' }
  const passos = [
    ['1. Peça', 'Novo pedido: o que precisa, para quem e até quando. Quem pediu acompanha o dia e a situação até o fim.'],
    ['2. Quem recebe organiza', 'Confirma (ou propõe outra data / recusa) e escolhe em qual QUADRO o ticket vai e se fica privado ou compartilhado com o quadro.'],
    ['3. Quadros', 'Cada pessoa tem os seus quadros, por assunto, cada um de uma cor. Dá pra convidar colegas para um quadro.'],
    ['4. Checklist e Ações', 'Dentro do ticket, o checklist são os passos pequenos, com quem faz e prazo. Na reunião, o que fica combinado vira Ação, que é um ticket.'],
    ['5. Cronograma', 'Tudo que você pode ver, por dia, cada ticket na cor do seu quadro. Atrasados aparecem primeiro.'],
  ]
  return (
    <div onClick={(e) => { if (e.target === e.currentTarget) onFechar() }} style={{ position: 'fixed', inset: 0, zIndex: 1200, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div role="dialog" aria-modal="true" aria-labelledby="cf-t" style={{ width: '100%', maxWidth: 760, maxHeight: '90vh', overflowY: 'auto', background: 'var(--portal-surface,#fff)', borderRadius: 16, boxShadow: '0 24px 70px rgba(0,0,0,.35)' }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '14px 18px', borderBottom: '1px solid var(--portal-border,#eee)' }}>
          <h2 id="cf-t" style={{ margin: 0, fontSize: 18, color: 'var(--portal-text,#111)' }}>Como funciona</h2>
          <button onClick={onFechar} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', cursor: 'pointer', color: 'var(--portal-text,#111)' }}><X size={15} /> Fechar</button>
        </header>
        <div style={{ padding: 18, color: 'var(--portal-text,#111)' }}>
          <p style={{ margin: 0, color: 'var(--portal-text-secondary,#555)', fontSize: 13.5 }}>
            O <b>Ticket</b> é o pedido. Quem recebe guarda num dos seus <b>Quadros</b> (por assunto, cada um de uma cor). O <b>Checklist</b> são os passos dentro do ticket. O <b>Cronograma</b> junta tudo por dia.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0', flexWrap: 'wrap' }}>
            <div style={caixa(true)}><TicketIcon size={22} color="#dc2626" /><b>Ticket</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>o pedido</small></div>
            <div style={seta}><span>quem recebe<br />escolhe</span><ArrowRight size={18} /></div>
            <div style={caixa(false)}><LayoutGrid size={22} color="#dc2626" /><b>Quadro</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>organização, com cor</small></div>
            <div style={seta}><span>por dia</span><ArrowRight size={18} /></div>
            <div style={caixa(false)}><Calendar size={22} color="#dc2626" /><b>Cronograma</b><small style={{ color: 'var(--portal-text-muted,#888)' }}>tudo, na cor do quadro</small></div>
          </div>
          <div style={{ display: 'grid', gap: 6, marginBottom: 14, fontSize: 13.5 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Lock size={16} color="#6b7280" /> <b>Privado</b>: só você, quem pediu e quem estiver no ticket</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><Users size={16} color="#059669" /> <b>Compartilhado</b>: quem participa do quadro também vê</div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(210px,100%),1fr))', gap: 10 }}>
            {passos.map(([t, d]) => (
              <div key={t} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', fontSize: 13, color: 'var(--portal-text-secondary,#555)' }}>
                <b style={{ display: 'block', color: 'var(--portal-text,#111)', marginBottom: 4 }}>{t}</b>{d}
              </div>
            ))}
          </div>
          <PreferenciaAtalho />
          <PreferenciaTratorilson />
        </div>
      </div>
    </div>
  )
}

// Tratorilson organiza a semana de tickets (José, 29/10/2026): chave geral (admin) + cada um desliga o seu.
function PreferenciaTratorilson() {
  const [st, setSt] = useState<{ ligado: boolean; tabela: boolean; admin: boolean; desligadoParaMim: boolean } | null>(null)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch('/api/tickets/tratorilson', { headers: await authHeaders() })
        const j = await r.json()
        if (vivo && r.ok) setSt(j)
      } catch { /* sem a função */ }
    })()
    return () => { vivo = false }
  }, [])
  if (!st) return null
  const enviar = async (corpo: Record<string, unknown>) => {
    setMsg('')
    const r = await fetch('/api/tickets/tratorilson', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(j.error || 'Não deu certo.'); return null }
    return j
  }
  const linha: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, cursor: 'pointer' }
  return (
    <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--portal-border,#eee)', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 13.5 }}><i className="fa-solid fa-robot" style={{ color: '#4F46E5', marginRight: 6 }} />Tratorilson organiza a semana</div>
      <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)', lineHeight: 1.45 }}>
        Todo dia às 7h ele dá um dia da semana aos tickets <b>sem prazo</b> de cada pessoa, pela prioridade e pelo que ela já tem marcado.
        Prazo que alguém colocou ele não mexe. Na dúvida, pergunta numa janelinha.
      </div>
      {!st.tabela && <div style={{ fontSize: 12.5, color: '#b45309' }}>Falta rodar o SQL sql/tratorilson-tickets.sql no Supabase.</div>}
      {st.admin && st.tabela && (
        <label style={linha}>
          <input type="checkbox" checked={st.ligado} onChange={async (e) => { const v = e.target.checked; if (await enviar({ acao: 'config', ligado: v })) setSt({ ...st, ligado: v }) }} />
          Ligado para todos (admin)
        </label>
      )}
      {!st.admin && st.tabela && <div style={{ fontSize: 12.5 }}>Para a empresa: <b>{st.ligado ? 'ligado' : 'desligado'}</b></div>}
      {st.tabela && st.ligado && (
        <label style={linha}>
          <input type="checkbox" checked={!st.desligadoParaMim} onChange={async (e) => { const v = e.target.checked; if (await enviar({ acao: 'optout', desligado: !v })) setSt({ ...st, desligadoParaMim: !v }) }} />
          Organizar a minha semana
        </label>
      )}
      {st.tabela && st.ligado && !st.desligadoParaMim && (
        <button type="button" onClick={async () => { const j = await enviar({ acao: 'organizar_agora' }); if (j) setMsg(j.pulado ? j.pulado : `Pronto: ${j.marcados} ticket(s) ganharam dia.`) }}
          style={{ alignSelf: 'flex-start', fontSize: 13, padding: '6px 12px', borderRadius: 10, border: '1px solid var(--portal-border,#e2e8f0)', background: 'transparent', color: 'inherit', cursor: 'pointer' }}>
          Organizar minha semana agora
        </button>
      )}
      {msg && <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>{msg}</div>}
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
