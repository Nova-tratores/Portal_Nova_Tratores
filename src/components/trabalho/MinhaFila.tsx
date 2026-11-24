'use client'
// MINHA FILA (24/11/2026) — 1ª aba da Central, TELA CHEIA, estilo NewPortal (docs/estilo-pos-newportal.md
// e docs/padrao-telas.md: sem negrito, sem caixa alta, sem faixa colorida na lateral, cor no ícone/selo).
//   Esquerda: a fila COMPLETA na ordem — Hoje · Esta semana · Depois · Rotina (contínuos), com ↑↓.
//   Direita: Chegou pra você (aceitar ali mesmo) · Reuniões de hoje · Esperando outros (o que pedi).
//   Cada item diz DE QUEM É: quem pediu, o quadro, a situação e há quantos dias está parado.
//   Aba Equipe: a carga de cada pessoa, com filtro por setor e o botão "Pedir".
// Pedir para alguém é sempre o FormTicket, que mostra a fila da pessoa antes de enviar.
import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  Check, CalendarClock, CircleX, Send, ListOrdered, Users, Sun, CalendarRange, Inbox, Repeat, ChevronUp, ChevronDown,
  AlarmClock, HelpCircle, Hourglass, Clock3, Layers,
} from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import { STATUS_INFO, type TicketStatus } from '@/lib/tickets/constantes'
import SeloAtrasado, { SeloUrgente } from '@/components/tickets/SeloAtrasado'
import type { ResumoFila, ItemResumo } from '@/lib/trabalho/fila-server'
import type { Carga } from './CargaDaPessoa'

const FormTicket = dynamic(() => import('@/components/tickets/FormTicket'), { ssr: false })
const TicketModal = dynamic(() => import('@/components/tickets/TicketModal'), { ssr: false })

interface Pendente { id: string; numero: number; titulo: string; prazo: string | null; solicitante_nome: string }
interface ItemDia { tipo: string; texto: string; detalhe?: string; link?: string }
interface Hoje { ativo: boolean; pendentes: Pendente[]; itens: ItemDia[]; fila: ResumoFila | null }
interface Pedido { id: string; numero: number; titulo: string; prazo: string | null; status: string; responsavel_id: string; aceite?: string | null }
interface Central { pedidos: Pedido[]; usuarios: Record<string, { id: string; nome: string }> }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const primeiro = (n: string) => n.split(' ')[0]
const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()

const CSS = `
.mf{padding:clamp(12px,2vw,28px);color:var(--portal-text,#0f172a)}
.mf *{font-weight:inherit;box-sizing:border-box}
.mf i,.mf [class*="fa-"]{font-weight:900}
@keyframes mf-entra{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.mf-anim{animation:mf-entra .35s ease both}
@media (prefers-reduced-motion:reduce){.mf-anim{animation:none}.mf-card,.mf-it{transition:none!important}}
.mf-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px}
.mf-titulo{display:flex;flex-direction:column;gap:2px;margin-right:8px}
.mf-titulo h1{margin:0;font-size:22px;font-weight:500;letter-spacing:-.01em}
.mf-titulo span{font-size:13px;color:var(--portal-text-muted,#64748b)}
.mf-aba{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px 0 8px;border-radius:11px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);font-size:14px;font-weight:500;cursor:pointer}
.mf-aba .ic{width:26px;height:26px;border-radius:8px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 11%,transparent)}
.mf-aba.on{background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border-color:color-mix(in srgb,var(--c) 45%,var(--portal-border,#e2e8f0));color:var(--portal-text,#0f172a)}
.mf-aba.on .ic{background:var(--c);color:#fefefe}
.mf-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:40px;padding:0 14px;border-radius:11px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);font-size:13.5px;font-weight:500;cursor:pointer;white-space:nowrap;font-family:inherit;text-decoration:none}
.mf-btn:hover{background:var(--portal-bg-secondary,#f8fafc)}
.mf-btn.cheio{border:none;color:#fefefe;background:var(--c,#dc2626);box-shadow:0 6px 14px -8px var(--c,#dc2626)}
.mf-btn.peq{min-height:34px;padding:0 11px;font-size:13px;border-radius:10px}
.mf-btn:disabled{opacity:.5;cursor:default}
.mf-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(200px,100%),1fr));gap:12px;margin-bottom:16px}
.mf-kpi{display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);text-align:left;font:inherit;color:inherit;cursor:pointer;transition:box-shadow .25s,transform .25s,border-color .25s}
.mf-kpi:hover,.mf-kpi.on{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:color-mix(in srgb,var(--c) 35%,var(--portal-border,#e2e8f0))}
.mf-kpi.on{background:color-mix(in srgb,var(--c) 6%,var(--portal-surface,#fefefe))}
.mf-kpi b{display:block;font-size:22px;font-weight:500;letter-spacing:-.01em;font-variant-numeric:tabular-nums;line-height:1.15}
.mf-kpi small{font-size:13px;color:var(--portal-text-muted,#64748b)}
.mf-ic{flex:none;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border:1px solid color-mix(in srgb,var(--c) 18%,transparent)}
.mf-ic.p{width:32px;height:32px;border-radius:9px}
.mf-grade{display:grid;grid-template-columns:minmax(0,1fr);gap:16px;align-items:start}
@media (min-width:1100px){.mf-grade{grid-template-columns:minmax(0,1.9fr) minmax(320px,1fr)}}
.mf-col{display:flex;flex-direction:column;gap:16px;min-width:0}
.mf-card{border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);padding:14px 16px 10px}
.mf-cab{display:flex;align-items:center;gap:10px;margin-bottom:8px}
.mf-cab h2{margin:0;font-size:16px;font-weight:500}
.mf-cab span{font-size:13px;color:var(--portal-text-muted,#64748b)}
.mf-it{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:4px 12px;align-items:center;padding:10px 6px;border-top:1px solid var(--portal-border,#eef2f7);transition:background .2s}
.mf-it:first-of-type{border-top:none}
.mf-it:hover{background:color-mix(in srgb,#0369a1 4%,transparent);border-radius:10px}
.mf-pos{display:flex;align-items:center;gap:2px;color:var(--portal-text-muted,#94a3b8);font-variant-numeric:tabular-nums;font-size:13px;min-width:44px}
.mf-setas{display:flex;flex-direction:column}
.mf-setas button{border:none;background:transparent;padding:1px;cursor:pointer;color:var(--portal-text-muted,#94a3b8);display:flex;border-radius:6px}
.mf-setas button:hover:not(:disabled){color:var(--portal-text,#0f172a);background:var(--portal-bg-secondary,#f1f5f9)}
.mf-setas button:disabled{opacity:.25;cursor:default}
.mf-tit{border:none;background:transparent;padding:0;text-align:left;cursor:pointer;color:var(--portal-text,#0f172a);font:inherit;font-size:14.5px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%}
.mf-tit:hover{color:#2563eb}
.mf-info{grid-column:2/4;display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;font-size:12.5px;color:var(--portal-text-secondary,#475569)}
.mf-info > span{display:inline-flex;align-items:center;gap:5px}
.mf-dot{width:8px;height:8px;border-radius:50%;background:var(--c)}
.mf-pill{padding:1px 9px;border-radius:999px;font-size:12px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
.mf-est{padding:1px 8px;border-radius:999px;font-size:11.5px;background:rgba(234,179,8,.16);color:#a16207;border:1px solid rgba(234,179,8,.4)}
.mf-quando{font-size:12.5px;color:var(--portal-text-muted,#64748b);white-space:nowrap;text-align:right;font-variant-numeric:tabular-nums}
.mf-av{width:20px;height:20px;border-radius:50%;display:inline-grid;place-items:center;font-size:9.5px;color:#fefefe;background:#64748b;flex:none}
.mf-vazio{padding:12px 6px;font-size:13.5px;color:var(--portal-text-muted,#64748b)}
.mf-ajuda{margin-bottom:16px;padding:14px 16px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);font-size:13.5px;line-height:1.55;color:var(--portal-text-secondary,#475569)}
.mf-chips{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}
.mf-pessoas{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(320px,100%),1fr));gap:12px}
.mf-pes{display:flex;flex-direction:column;gap:10px;padding:14px 16px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);transition:box-shadow .25s,transform .25s}
.mf-pes:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55)}
.mf-barra{height:8px;border-radius:999px;background:var(--portal-bg-secondary,#f1f5f9);overflow:hidden}
.mf-barra i{display:block;height:100%;border-radius:999px;background:var(--c,#2563eb);transition:width .6s ease}
@media (max-width:640px){.mf-it{grid-template-columns:auto minmax(0,1fr)}.mf-quando{grid-column:2;text-align:left}.mf-info{grid-column:1/3}}
`

type Filtro = 'tudo' | 'atrasados' | 'parados'

export default function MinhaFila() {
  const { userProfile } = useAuth()
  const [aba, setAba] = useState<'minha' | 'equipe'>('minha')
  const [h, setH] = useState<Hoje | null>(null)
  const [central, setCentral] = useState<Central | null>(null)
  const [equipe, setEquipe] = useState<{ eu: string; pessoas: Carga[] } | null>(null)
  const [setor, setSetor] = useState('Todos')
  const [filtro, setFiltro] = useState<Filtro>('tudo')
  const [ajuda, setAjuda] = useState(false)
  const [erro, setErro] = useState('')
  const [pedirPara, setPedirPara] = useState<string | null | false>(false) // null = escolher a pessoa
  const [aberto, setAberto] = useState<string | null>(null)
  const [decidindo, setDecidindo] = useState<{ id: string; modo: 'data' | 'recusar'; valor: string } | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)
  const [movendo, setMovendo] = useState(false)
  const [todosPedidos, setTodosPedidos] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const hd = await authHeaders()
      const [r, rc] = await Promise.all([
        fetch('/api/trabalho/hoje', { headers: hd, cache: 'no-store' }),
        fetch('/api/trabalho/central', { headers: hd, cache: 'no-store' }),
      ])
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Falha ao carregar a fila'); return }
      setH(j); setErro('')
      if (rc.ok) setCentral(await rc.json())
    } catch { setErro('Falha de conexão') }
  }, [])
  const carregarEquipe = useCallback(async () => {
    try {
      const r = await fetch('/api/trabalho/carga', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (r.ok) setEquipe(j); else setErro(j.error || 'Falha ao carregar a equipe')
    } catch { setErro('Falha de conexão') }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => { if (aba === 'equipe' && !equipe) carregarEquipe() }, [aba, equipe, carregarEquipe])
  useEffect(() => {
    const f = () => { carregar(); if (equipe) carregarEquipe() }
    window.addEventListener('central-trabalho-mudou', f); window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar, carregarEquipe, equipe])

  const decidir = async (id: string, corpo: Record<string, unknown>) => {
    setSalvando(id); setErro('')
    try {
      // Sem quadro no corpo: o servidor põe no quadro de quem recebeu (não precisa escolher).
      const r = await fetch(`/api/tickets/${id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'aceite', ...corpo }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || 'Não deu certo'); return }
      setDecidindo(null)
      window.dispatchEvent(new Event('central-trabalho-mudou'))
      await carregar()
    } catch { setErro('Falha de conexão') } finally { setSalvando(null) }
  }

  const f = h?.fila
  const hoje = hojeISO()
  // A fila inteira na ordem (o que tem data). ↑↓ troca com o vizinho e grava a lista toda.
  const comData = useMemo(() => (f ? [...f.hoje, ...f.semana, ...(f.listaDepois || [])] : []), [f])
  const mover = async (id: string, dir: -1 | 1) => {
    if (!f || movendo) return
    const k = comData.findIndex((x) => x.id === id)
    const viz = comData[k + dir]
    if (k < 0 || !viz || viz.urgente) return
    const ordem = [...f.ordem]
    const a = ordem.indexOf(id), b = ordem.indexOf(viz.id)
    if (a < 0 || b < 0) return
    ;[ordem[a], ordem[b]] = [ordem[b], ordem[a]]
    setMovendo(true); setErro('')
    try {
      const r = await fetch('/api/trabalho/fila', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ ordem }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErro(j.error || 'Não deu para mudar a ordem')
      await carregar()
    } catch { setErro('Falha de conexão') } finally { setMovendo(false) }
  }

  const passa = (i: ItemResumo) => filtro === 'tudo' || (filtro === 'atrasados' ? i.atrasado : i.parado >= 14)
  const reunioes = (h?.itens || []).filter((i) => i.tipo === 'reuniao')
  const pedidos = (central?.pedidos || []).filter((p) => !['fechado', 'cancelado'].includes(p.status))
    .sort((a, b) => Number(!!b.prazo && b.prazo < hoje) - Number(!!a.prazo && a.prazo < hoje) || (a.prazo || '9').localeCompare(b.prazo || '9'))
  const parados = f ? [...comData, ...(f.listaContinuos || [])].filter((i) => i.parado >= 14).length : 0

  const setores = useMemo(() => ['Todos', ...[...new Set((equipe?.pessoas || []).map((p) => p.setor))].sort()], [equipe])
  const pessoasF = (equipe?.pessoas || []).filter((p) => setor === 'Todos' || p.setor === setor)
    .sort((a, b) => b.horas - a.horas || a.nome.localeCompare(b.nome))
  const maxHoras = Math.max(1, ...pessoasF.map((p) => p.horas))

  const item = (i: ItemResumo, quando: string) => {
    const pos = comData.findIndex((x) => x.id === i.id)
    const st = STATUS_INFO[i.status as TicketStatus]
    return (
      <div key={i.id} className="mf-it">
        <span className="mf-pos">
          {!i.urgente && !i.continuo ? (
            <span className="mf-setas">
              <button disabled={pos <= 0 || movendo || comData[pos - 1]?.urgente} onClick={() => mover(i.id, -1)} aria-label={`Subir #${i.numero}`} title="Subir na fila"><ChevronUp size={15} /></button>
              <button disabled={pos < 0 || pos >= comData.length - 1 || movendo} onClick={() => mover(i.id, 1)} aria-label={`Descer #${i.numero}`} title="Descer na fila"><ChevronDown size={15} /></button>
            </span>
          ) : <span style={{ width: 17 }} />}
          {i.continuo ? <Repeat size={14} /> : `${pos + 1}.`}
        </span>
        <button className="mf-tit" onClick={() => setAberto(i.id)} title={`#${i.numero} ${i.titulo}`}>#{i.numero} {i.titulo}</button>
        <span className="mf-quando">{i.continuo ? 'na rotina' : `${nf(i.horas)} h · ${quando}`}</span>
        <span className="mf-info">
          {i.quadro && <span style={{ ['--c' as string]: i.quadro.cor }}><i className="mf-dot" /> {i.quadro.nome}</span>}
          <span title="Quem pediu">{i.pedidoPor ? <><span className="mf-av">{iniciais(i.pedidoPor)}</span> pedido de {primeiro(i.pedidoPor)}</> : 'você mesmo'}</span>
          {st && <span className="mf-pill" style={{ ['--c' as string]: st.cor }}>{st.label}</span>}
          {i.urgente && <SeloUrgente />}
          {i.atrasado && i.prazo && <SeloAtrasado>desde {br(i.prazo)}</SeloAtrasado>}
          {!i.atrasado && i.prazo && <span><Clock3 size={13} /> prazo {br(i.prazo)}</span>}
          {i.parado >= 14 && <span style={{ color: '#b45309' }} title="Sem nenhum movimento"><Hourglass size={13} /> {i.parado} dias parado</span>}
          {i.semEstimativa && <span className="mf-est" title="Ninguém estimou as horas. Abra o ticket e preencha dias × horas.">estimar</span>}
        </span>
      </div>
    )
  }
  const secao = (titulo: string, sub: string, cor: string, icone: React.ReactNode, itens: ItemResumo[], quando: (i: ItemResumo) => string, vazio: string) => {
    const lista = itens.filter(passa)
    if (filtro !== 'tudo' && lista.length === 0) return null
    return (
      <section className="mf-card mf-anim">
        <div className="mf-cab"><span className="mf-ic p" style={{ ['--c' as string]: cor }}>{icone}</span><h2>{titulo}</h2>
          <span>{sub}{lista.length ? ` · ${lista.length} ${lista.length === 1 ? 'item' : 'itens'} · ${nf(lista.reduce((s, x) => s + x.horas, 0))} h` : ''}</span></div>
        {lista.length === 0 ? <div className="mf-vazio">{vazio}</div> : lista.map((i) => item(i, quando(i)))}
      </section>
    )
  }

  const kpi = (id: Filtro | null, cor: string, icone: React.ReactNode, valor: React.ReactNode, rotulo: string) => (
    <button className={`mf-kpi mf-anim${id && filtro === id ? ' on' : ''}`} style={{ ['--c' as string]: cor }}
      onClick={() => id && setFiltro(filtro === id ? 'tudo' : id)} aria-pressed={id ? filtro === id : undefined}
      title={id ? (filtro === id ? 'Mostrar tudo de novo' : 'Mostrar só estes') : undefined}>
      <span className="mf-ic" style={{ ['--c' as string]: cor }}>{icone}</span>
      <span><b>{valor}</b><small>{rotulo}</small></span>
    </button>
  )

  return (
    <div className="mf">
      <style>{CSS}</style>
      <div className="mf-topo">
        <div className="mf-titulo">
          <h1>{aba === 'minha' ? `Bom dia${userProfile?.nome ? `, ${primeiro(userProfile.nome)}` : ''}` : 'Carga da equipe'}</h1>
          <span>{aba === 'minha' ? 'Sua fila: o que fazer hoje, na semana e depois. Capacidade 6 h − 1,5 h de rotina = 4,5 h por dia.' : 'Quem está ocupado, por setor. Só números: ninguém vê os títulos da fila do outro.'}</span>
        </div>
        <button className={`mf-aba${aba === 'minha' ? ' on' : ''}`} style={{ ['--c' as string]: '#2563eb' }} onClick={() => setAba('minha')} aria-pressed={aba === 'minha'}>
          <span className="ic"><ListOrdered size={15} /></span> Minha fila
        </button>
        <button className={`mf-aba${aba === 'equipe' ? ' on' : ''}`} style={{ ['--c' as string]: '#7c3aed' }} onClick={() => setAba('equipe')} aria-pressed={aba === 'equipe'}>
          <span className="ic"><Users size={15} /></span> Equipe
        </button>
        <span style={{ flex: 1 }} />
        <button className="mf-btn" onClick={() => setAjuda((a) => !a)} aria-expanded={ajuda}><HelpCircle size={16} /> Como ler esta tela</button>
        <button className="mf-btn cheio" style={{ ['--c' as string]: '#dc2626' }} onClick={() => setPedirPara(null)}><Send size={15} /> Pedir para alguém</button>
      </div>

      {ajuda && (
        <div className="mf-ajuda mf-anim">
          <b style={{ fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>Como ler esta tela.</b> Cada pessoa tem <b style={{ fontWeight: 500 }}>uma fila só</b>, na ordem em que vai fazer.
          O sistema encaixa a fila em 4,5 h por dia e mostra o que cabe <b style={{ fontWeight: 500 }}>hoje</b>, o que vem <b style={{ fontWeight: 500 }}>na semana</b> e o que fica <b style={{ fontWeight: 500 }}>depois</b>.
          Use ↑↓ para mudar a ordem. Em cada item você vê <b style={{ fontWeight: 500 }}>quem pediu</b>, o quadro e a situação.
          Pedidos novos chegam em <b style={{ fontWeight: 500 }}>Chegou pra você</b>: aceite, proponha outra data ou recuse com o motivo.
          Para pedir algo a alguém, use <b style={{ fontWeight: 500 }}>Pedir para alguém</b>: antes de enviar, você vê a fila dessa pessoa.
          Os cartões de cima são clicáveis: <b style={{ fontWeight: 500 }}>Atrasados</b> e <b style={{ fontWeight: 500 }}>Parados</b> filtram a lista.
        </div>
      )}
      {erro && <div className="mf-ajuda" style={{ color: 'var(--cor-atrasado-texto)' }}>{erro}</div>}

      {aba === 'minha' && (!h ? <div className="mf-ajuda">Carregando sua fila…</div> : !h.ativo ? <div className="mf-ajuda">A Central de Trabalho não está liberada para você.</div> : (
        <>
          {f && (
            <div className="mf-kpis">
              {kpi(null, '#d97706', <Sun size={18} />, f.hoje.length, `para hoje · ${nf(f.hoje.reduce((s, x) => s + x.horas, 0))} h`)}
              {kpi(null, '#2563eb', <CalendarRange size={18} />, f.semana.length, 'no resto da semana')}
              {kpi('atrasados', '#dc2626', <AlarmClock size={18} />, f.atrasados, 'atrasados (clique para filtrar)')}
              {kpi('parados', '#b45309', <Hourglass size={18} />, parados, '14+ dias parados (clique)')}
              {kpi(null, '#475569', <Layers size={18} />, f.livreEm ? br(f.livreEm) : 'livre', `fila ocupada até · ${f.total} itens`)}
            </div>
          )}

          <div className="mf-grade">
            <div className="mf-col">
              {f && secao('Hoje', 'objetivo do dia', '#d97706', <Sun size={16} />, f.hoje, (i) => (i.fim > hoje ? `até ${br(i.fim)}` : 'termina hoje'), 'Nada na fila para hoje.')}
              {f && secao('Esta semana', 'objetivo da semana', '#2563eb', <CalendarRange size={16} />, f.semana, (i) => `começa ${br(i.inicio)}`, 'Nada mais previsto até sexta.')}
              {f && secao('Depois', 'o resto da fila, na ordem', '#475569', <ListOrdered size={16} />, f.listaDepois || [], (i) => `${br(i.inicio)}–${br(i.fim)}`, 'Nada depois desta semana.')}
              {f && (f.listaContinuos || []).length > 0 && secao('Rotina', 'sem prazo, dentro da 1,5 h de rotina', '#0891b2', <Repeat size={16} />, f.listaContinuos, () => '', '')}
            </div>

            <div className="mf-col">
              <section className="mf-card mf-anim">
                <div className="mf-cab"><span className="mf-ic p" style={{ ['--c' as string]: '#2563eb' }}><Inbox size={16} /></span><h2>Chegou pra você</h2><span>{h.pendentes.length || 'nada'}</span></div>
                {h.pendentes.length === 0 && <div className="mf-vazio">Nenhum pedido esperando resposta.</div>}
                {h.pendentes.map((p) => {
                  const d = decidindo?.id === p.id ? decidindo : null
                  return (
                    <div key={p.id} className="mf-it" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                      <button className="mf-tit" onClick={() => setAberto(p.id)}>#{p.numero} {p.titulo}</button>
                      <span className="mf-info" style={{ gridColumn: 'auto' }}>
                        <span><span className="mf-av">{iniciais(p.solicitante_nome)}</span> pedido de {primeiro(p.solicitante_nome)}</span>
                        <span><Clock3 size={13} /> {p.prazo ? `até ${br(p.prazo)}` : 'sem data'}</span>
                      </span>
                      {!d ? (
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                          <button className="mf-btn peq cheio" style={{ ['--c' as string]: '#059669' }} disabled={salvando === p.id} onClick={() => decidir(p.id, { decisao: 'confirmar' })}><Check size={14} /> Aceitar</button>
                          <button className="mf-btn peq" onClick={() => setDecidindo({ id: p.id, modo: 'data', valor: '' })}><CalendarClock size={14} /> Outra data</button>
                          <button className="mf-btn peq" onClick={() => setDecidindo({ id: p.id, modo: 'recusar', valor: '' })}><CircleX size={14} /> Recusar</button>
                        </span>
                      ) : (
                        <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                          {d.modo === 'data'
                            ? <input type="date" min={hoje} value={d.valor} onChange={(e) => setDecidindo({ ...d, valor: e.target.value })} aria-label="Consigo fazer até" className="mf-btn peq" />
                            : <input value={d.valor} onChange={(e) => setDecidindo({ ...d, valor: e.target.value })} placeholder="Por que não consegue? (vai para quem pediu)" aria-label="Motivo" className="mf-btn peq" style={{ flex: '1 1 220px' }} autoFocus />}
                          <button className="mf-btn peq cheio" style={{ ['--c' as string]: d.modo === 'data' ? '#059669' : '#b91c1c' }} disabled={!d.valor.trim() || salvando === p.id}
                            onClick={() => decidir(p.id, d.modo === 'data' ? { decisao: 'nova_data', data: d.valor } : { decisao: 'recusar', motivo: d.valor })}>
                            {d.modo === 'data' ? 'Aceitar com esta data' : 'Recusar'}
                          </button>
                          <button className="mf-btn peq" onClick={() => setDecidindo(null)}>Voltar</button>
                        </span>
                      )}
                    </div>
                  )
                })}
              </section>

              <section className="mf-card mf-anim">
                <div className="mf-cab"><span className="mf-ic p" style={{ ['--c' as string]: '#4f46e5' }}><Users size={16} /></span><h2>Reuniões de hoje</h2><span>{reunioes.length || 'nenhuma'}</span></div>
                {reunioes.length === 0 && <div className="mf-vazio">Nenhuma reunião hoje.</div>}
                {reunioes.map((r, k) => (
                  <div key={k} className="mf-it" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                    {r.link ? <Link className="mf-tit" href={r.link}>{r.texto}</Link> : <span className="mf-tit">{r.texto}</span>}
                    {r.detalhe && <span className="mf-info" style={{ gridColumn: 'auto' }}><span><Clock3 size={13} /> {r.detalhe}</span></span>}
                  </div>
                ))}
              </section>

              <section className="mf-card mf-anim">
                <div className="mf-cab"><span className="mf-ic p" style={{ ['--c' as string]: '#059669' }}><Send size={16} /></span><h2>Esperando outros</h2><span>o que você pediu · {pedidos.length}</span></div>
                {pedidos.length === 0 && <div className="mf-vazio">Você não está esperando ninguém.</div>}
                {(todosPedidos ? pedidos : pedidos.slice(0, 12)).map((p) => {
                  const quem = central?.usuarios[p.responsavel_id]?.nome || 'Alguém'
                  const st = STATUS_INFO[p.status as TicketStatus]
                  const atrasado = !!p.prazo && p.prazo < hoje && p.status !== 'resolvido'
                  return (
                    <div key={p.id} className="mf-it" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                      <button className="mf-tit" onClick={() => setAberto(p.id)}>#{p.numero} {p.titulo}</button>
                      <span className="mf-info" style={{ gridColumn: 'auto' }}>
                        <span><span className="mf-av">{iniciais(quem)}</span> com {primeiro(quem)}</span>
                        {p.aceite === 'pendente' ? <span className="mf-pill" style={{ ['--c' as string]: '#d97706' }}>esperando aceitar</span>
                          : st && <span className="mf-pill" style={{ ['--c' as string]: st.cor }}>{st.label}</span>}
                        {atrasado ? <SeloAtrasado>desde {br(p.prazo!)}</SeloAtrasado> : p.prazo && <span><Clock3 size={13} /> {br(p.prazo)}</span>}
                      </span>
                    </div>
                  )
                })}
                {pedidos.length > 12 && <button className="mf-btn peq" style={{ margin: '6px 0' }} onClick={() => setTodosPedidos(!todosPedidos)}>{todosPedidos ? 'Mostrar menos' : `Ver todos (${pedidos.length})`}</button>}
              </section>
            </div>
          </div>
        </>
      ))}

      {aba === 'equipe' && (
        <>
          <div className="mf-chips" role="group" aria-label="Filtrar por setor">
            {setores.map((s) => (
              <button key={s} className={`mf-aba${s === setor ? ' on' : ''}`} style={{ ['--c' as string]: '#7c3aed', paddingLeft: 14 }} aria-pressed={s === setor} onClick={() => setSetor(s)}>
                {s}{s !== 'Todos' && equipe && <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>{equipe.pessoas.filter((p) => p.setor === s).length}</span>}
              </button>
            ))}
          </div>
          {!equipe ? <div className="mf-ajuda">Carregando a equipe…</div> : pessoasF.length === 0 ? <div className="mf-ajuda">Ninguém neste setor.</div> : (
            <div className="mf-pessoas">
              {pessoasF.map((p) => {
                const cor = p.atrasados > 0 ? '#dc2626' : p.horas > maxHoras * 0.66 ? '#d97706' : '#2563eb'
                return (
                  <div key={p.id} className="mf-pes mf-anim" style={{ ['--c' as string]: cor }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span className="mf-ic" style={{ ['--c' as string]: '#7c3aed', fontSize: 13 }}>{iniciais(p.nome)}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: 'block', fontSize: 15, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}{p.id === equipe.eu ? ' (você)' : ''}</span>
                        <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>{p.setor}</span>
                      </span>
                      {p.id !== equipe.eu && <button className="mf-btn peq" onClick={() => setPedirPara(p.id)}><Send size={14} /> Pedir</button>}
                    </div>
                    <span className="mf-barra" title={`${p.horas} h na fila`}><i style={{ width: `${Math.max(p.horas ? 4 : 0, (p.horas / maxHoras) * 100)}%` }} /></span>
                    <span style={{ display: 'flex', gap: '4px 12px', flexWrap: 'wrap', fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>
                      {p.itens === 0 ? <span>fila vazia</span> : <>
                        <span>{p.itens} {p.itens === 1 ? 'item' : 'itens'} · {p.horas} h</span>
                        {p.livreEm && <span>ocupada até {br(p.livreEm)}</span>}
                      </>}
                      {p.atrasados > 0 && <span style={{ color: 'var(--cor-atrasado-texto)' }}><AlarmClock size={12} style={{ verticalAlign: -2 }} /> {p.atrasados} atrasado{p.atrasados > 1 ? 's' : ''}</span>}
                      {p.aceitar > 0 && <span>{p.aceitar} esperando resposta</span>}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {pedirPara !== false && (
        <FormTicket responsavelInicial={pedirPara || undefined} onFechar={() => setPedirPara(false)}
          onCriado={() => { setPedirPara(false); window.dispatchEvent(new Event('central-trabalho-mudou')) }} />
      )}
      {aberto && <TicketModal id={aberto} onFechar={() => setAberto(null)} onMudou={() => carregar()} />}
    </div>
  )
}
