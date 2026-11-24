'use client'
// Reuniões — aba Próximas. Fase 0 (24/11/2026): LISTA por dia (Hoje, Amanhã, Qui 26/11) no lugar
// do "Hoje em cartões + semana em grade", que repetia a Agenda. Reunião que já terminou vai para o
// Histórico. TODO fase 1: a grade semanal (gradeSemana) ficou só no Histórico; ver se ainda faz sentido lá.
// Capa do cartão em palavras simples (a etapa técnica fica escondida); canceladas escondidas por padrão.
// Clique abre a janela com o botão do próximo passo e as Tarefas da reunião (TarefasRapidas).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Play, ListPlus, FileText, Check, X, MapPin, CalendarCheck, CircleCheck, CircleHelp, Ban, ArrowRight, CalendarClock, Pencil, Trash2, Lock, Globe } from 'lucide-react'
import type { Ticket, UsuarioMin } from '@/lib/tickets/constantes'
import type { ReuniaoEtapa, Serie } from '@/lib/reunioes/regras'
import type { PresencaRow } from '@/lib/reunioes/server'
import type { ReuniaoUI } from './tipos'
import TarefasRapidas from './TarefasRapidas'
import RemarcarReuniao from './RemarcarReuniao'
import EditarReuniao from './EditarReuniao'
import ConviteReuniao from './ConviteReuniao'
import TicketModal from '@/components/tickets/TicketModal'
import { chamar, horaDe, hojeISO, CronometroReuniao } from './comum'

type Lista = { reunioes: Ticket[]; presencas: Record<string, PresencaRow[]>; itens: Record<string, number>; usuarios: Record<string, UsuarioMin>; series: Serie[]; salas?: Record<string, string> }

const SEMANA_LONGA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
const diaSP = (ts: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(ts))
const somarDia = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dowDe = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()
const segundaDe = (iso: string) => somarDia(iso, -((dowDe(iso) + 6) % 7))
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const semData = (t: string) => t.replace(/\s*[—–-]\s*\d{2}\/\d{2}(\/\d{2,4})?\s*$/, '') || t
const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()
const durDe = (t: Ticket) => Math.max(5, Number((t.payload as { duracao_min?: number } | null)?.duracao_min) || 30)
const fimDe = (t: Ticket) => (t.reuniao_inicio ? new Date(new Date(t.reuniao_inicio).getTime() + durDe(t) * 60_000).toISOString() : null)

type Passo = 'pauta' | 'comecar' | 'agora' | 'ata' | 'pronta' | 'aconteceu' | 'cancelada'
function passoDe(t: Ticket, nItens: number, agoraISO: string): Passo {
  const e = t.reuniao_etapa as ReuniaoEtapa
  if (e === 'cancelada') return 'cancelada'
  if (e === 'ata_publicada') return 'pronta'
  if (e === 'ata_rascunho') return 'ata'
  if (e === 'em_andamento') return 'agora'
  const fim = fimDe(t)
  if (fim && fim < agoraISO) return 'aconteceu'
  if (t.reuniao_inicio && t.reuniao_inicio <= agoraISO) return 'agora'
  return nItens > 0 ? 'comecar' : 'pauta'
}
// texto = pílula da capa (curta, sem jargão); dica = o que fazer
const PASSO: Record<Passo, { texto: string; dica: string; cor: string; ic: React.ReactNode; botao: string; icone: React.ReactNode }> = {
  pauta:     { texto: 'Sem assunto', dica: 'Inclua o que vai ser falado', cor: '#d97706', ic: <ListPlus size={16} />, botao: 'Incluir assunto', icone: <ListPlus size={15} /> },
  comecar:   { texto: 'Marcada', dica: 'Pauta pronta', cor: '#2563eb', ic: <CalendarCheck size={16} />, botao: 'Abrir a reunião', icone: <ArrowRight size={15} /> },
  agora:     { texto: 'Agora', dica: 'Acontecendo neste momento', cor: '#dc2626', ic: <Play size={16} />, botao: 'Entrar', icone: <Play size={15} /> },
  ata:       { texto: 'Falta a ata', dica: 'Anote o que ficou combinado', cor: '#7c3aed', ic: <FileText size={16} />, botao: 'Fechar a ata', icone: <FileText size={15} /> },
  pronta:    { texto: 'Concluída', dica: 'Ata registrada', cor: '#059669', ic: <CircleCheck size={16} />, botao: 'Ver a ata', icone: <FileText size={15} /> },
  aconteceu: { texto: 'Sem registro', dica: 'Já passou — aconteceu?', cor: '#7c3aed', ic: <CircleHelp size={16} />, botao: 'Sim, aconteceu', icone: <Check size={15} /> },
  cancelada: { texto: 'Cancelada', dica: '', cor: '#94a3b8', ic: <Ban size={16} />, botao: 'Abrir', icone: <ArrowRight size={15} /> },
}

// cor do botão cheio no tema escuro (texto branco precisa de 4,5:1)
const FUNDO_ESCURO: Record<string, string> = { '#d97706': '#b45309', '#059669': '#047857', '#94a3b8': '#64748b' }

const CSS = `
.ag{color:var(--portal-text,#0f172a)}
.ag *{font-weight:inherit;box-sizing:border-box}
.ag-sec{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 10px}
.ag-sec h2{margin:0;font-size:18px;font-weight:500;letter-spacing:-.01em}
.ag-sec .sub{font-size:13px;color:var(--portal-text-muted,#64748b)}
.ag-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:40px;padding:0 14px;border-radius:11px;font-size:14px;font-weight:500;cursor:pointer;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);white-space:nowrap;font-family:inherit}
.ag-btn.cheio{border:none;color:#fefefe;background:var(--c,#dc2626)}
/* tema escuro: fundo um tom mais escuro quando a cor do passo não dá 4,5:1 com o texto branco (--cb) */
[data-theme="dark"] .ag-btn.cheio{background:var(--cb,var(--c,#dc2626))}
.ag-btn.peq{height:36px;padding:0 11px;font-size:13px}
.ag-btn:disabled{opacity:.45;cursor:default}
.ag-av{width:24px;height:24px;border-radius:50%;display:inline-grid;place-items:center;font-size:10px;color:#fefefe;background:#64748b;overflow:hidden;flex:none;border:2px solid var(--portal-surface,#fefefe)}
.ag-av img{width:100%;height:100%;object-fit:cover}
.ag-chip{display:inline-flex;align-items:center;gap:5px;padding:2px 10px;border-radius:999px;font-size:12.5px;white-space:nowrap;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
.ag-chip i{width:7px;height:7px;border-radius:50%;background:var(--c)}
.ag-ic{flex:none;width:40px;height:40px;border-radius:11px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border:1px solid color-mix(in srgb,var(--c) 18%,transparent)}
.ag-ic.p{width:32px;height:32px;border-radius:9px}
.ag-hoje{display:flex;gap:12px;overflow-x:auto;padding:2px 2px 10px;scroll-snap-type:x mandatory;margin-bottom:26px}
.ag-hc{flex:0 0 330px;scroll-snap-align:start;display:flex;flex-direction:column;gap:10px;padding:16px 18px 14px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);transition:box-shadow .25s,transform .25s,border-color .25s}
.ag-hc:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:color-mix(in srgb,var(--c) 35%,var(--portal-border,#e2e8f0))}
.ag-hc .hora{font-size:26px;font-weight:500;font-variant-numeric:tabular-nums;line-height:1}
.ag-hc .hora small{font-size:14px;font-weight:400;color:var(--portal-text-muted,#64748b);margin-left:6px}
.ag-hc .tit{font-size:17px;font-weight:500}
.ag-hc .lin{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;font-size:13px;color:var(--portal-text-secondary,#475569)}
.ag-hc .acoes{display:flex;gap:8px;margin-top:auto;flex-wrap:wrap}
.ag-hc .acoes .ag-btn{flex:1}
.ag-vazio{padding:22px;border-radius:16px;border:1px dashed var(--portal-border,#e2e8f0);color:var(--portal-text-muted,#64748b);font-size:14px;display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:26px}
.ag-sem-wrap{overflow-x:auto;padding-bottom:8px}
.ag-sem{display:grid;grid-template-columns:repeat(var(--n),minmax(150px,1fr));gap:10px;min-width:calc(var(--n) * 160px)}
.ag-col{display:flex;flex-direction:column;gap:8px;min-height:170px;min-width:0}
.ag-cab{display:flex;align-items:center;gap:8px;padding:6px 4px 8px;border-bottom:1px solid var(--portal-border,#e2e8f0);color:var(--portal-text-secondary,#475569);font-size:13px;min-height:52px}
.ag-cab b{font-size:22px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--portal-text,#0f172a);letter-spacing:-.01em}
.ag-cab .q{margin-left:auto;font-size:12px;padding:1px 8px;border-radius:999px;background:var(--portal-bg-secondary,#f1f5f9);color:var(--portal-text-muted,#64748b)}
.ag-col.hoje .ag-cab{border-bottom:2px solid #2563eb}
.ag-col.hoje .ag-cab b{color:#fefefe;background:#2563eb;border-radius:50%;width:36px;height:36px;display:grid;place-items:center;font-size:17px}
.ag-col.passado .ag-cab b{color:var(--portal-text-muted,#94a3b8)}
.ag-mini{display:flex;flex-direction:column;gap:9px;text-align:left;width:100%;padding:12px 12px 11px;border-radius:16px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);cursor:pointer;color:inherit;font:inherit;transition:box-shadow .25s,transform .25s,border-color .25s}
.ag-mini:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:color-mix(in srgb,var(--c) 35%,var(--portal-border,#e2e8f0))}
.ag-mini .topo{display:flex;align-items:center;gap:9px}
.ag-mini .h{font-size:17px;font-weight:500;font-variant-numeric:tabular-nums;color:var(--portal-text,#0f172a);line-height:1}
.ag-mini .h small{display:block;font-size:12px;font-weight:400;color:var(--portal-text-muted,#64748b);margin-top:3px}
.ag-mini .t{font-size:14.5px;font-weight:500;line-height:1.3;color:var(--portal-text,#0f172a);overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.ag-mini .pe{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--portal-text-secondary,#475569)}
.ag-mini .dica{font-size:12px;color:var(--portal-text-muted,#64748b)}
.ag-mini.cancelada{opacity:.55}
.ag-mini.cancelada .t{text-decoration:line-through}
.ag-nada{font-size:12.5px;color:var(--portal-text-muted,#94a3b8);text-align:center;padding:18px 0;border:1px dashed var(--portal-border,#e2e8f0);border-radius:14px}
.ag-lista{display:flex;flex-direction:column;gap:18px}
.ag-dia h3{margin:0 0 8px;font-size:14px;font-weight:600;color:var(--portal-text-secondary,#475569)}
.ag-dia.hoje h3{color:#2563eb}
.ag-lin{display:grid;grid-template-columns:92px minmax(0,1fr) auto;gap:14px;align-items:center;width:100%;text-align:left;padding:12px 14px;margin-bottom:8px;border-radius:14px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);cursor:pointer;color:inherit;font:inherit}
.ag-lin:hover{box-shadow:0 10px 22px -18px rgba(15,23,42,.55)}
.ag-lin.cancelada{opacity:.55}
.ag-lin.cancelada .t{text-decoration:line-through}
.ag-lin .h{font-size:17px;font-weight:500;font-variant-numeric:tabular-nums}
.ag-lin .h small{display:block;font-size:12px;color:var(--portal-text-muted,#64748b)}
.ag-lin .t{display:block;font-size:15px;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ag-lin .info{display:flex;align-items:center;gap:6px 12px;flex-wrap:wrap;margin-top:4px;font-size:12.5px;color:var(--portal-text-secondary,#475569)}
.ag-check{display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--portal-text-secondary,#475569);cursor:pointer}
.ag-modal{position:fixed;inset:0;z-index:1400;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.ag-modal > div{width:100%;max-width:600px;max-height:92vh;overflow-y:auto;background:var(--portal-surface,#fefefe);border-radius:18px;padding:18px 20px;display:flex;flex-direction:column;gap:12px}
@media (max-width:640px){
  .ag-hc{flex-basis:86%}
  .ag-lin{grid-template-columns:1fr;gap:8px}
  .ag-modal{padding:0;align-items:stretch}
  .ag-modal > div{max-width:none;max-height:none;border-radius:0}
}
`

function Av({ u, nome, i }: { u?: UsuarioMin; nome: string; i?: number }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="ag-av" title={nome} style={i ? { marginLeft: -7 } : undefined}>{u?.avatar_url ? <img src={u.avatar_url} alt="" /> : iniciais(nome)}</span>
}

type FiltroHist = 'todas' | 'aconteceu' | 'pronta' | 'cancelada'
const FILTROS_HIST: { id: FiltroHist; rotulo: string; cor: string }[] = [
  { id: 'todas', rotulo: 'Todas', cor: '#475569' },
  { id: 'aconteceu', rotulo: 'Sem registro', cor: '#7c3aed' },
  { id: 'pronta', rotulo: 'Concluídas', cor: '#059669' },
  { id: 'cancelada', rotulo: 'Canceladas', cor: '#94a3b8' },
]

/** modo 'proximas' = Hoje + semana com setas; 'historico' = semanas que já passaram, da mais nova para a mais velha. */
export default function AgendaReunioes({ meuId, isAdmin, onAviso, modo = 'proximas' }: { meuId: string; isAdmin: boolean; /** sem uso: "Nova reunião" fica só no topo da página */ onNova?: () => void; onAviso: (s: string) => void; modo?: 'proximas' | 'historico' }) {
  const router = useRouter()
  const [prox, setProx] = useState<Lista | null>(null)
  const [hist, setHist] = useState<Lista | null>(null)
  const [erro, setErro] = useState('')
  const [agora, setAgora] = useState(() => new Date().toISOString())
  const hoje = hojeISO()
  const [verCanceladas, setVerCanceladas] = useState(false)
  const [aberta, setAberta] = useState<Ticket | null>(null)
  const [det, setDet] = useState<ReuniaoUI | null>(null)
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [remarcar, setRemarcar] = useState<Ticket | null>(null)
  const [editar, setEditar] = useState<Ticket | null>(null)
  const [filtroHist, setFiltroHist] = useState<FiltroHist>('todas')
  const [busca, setBusca] = useState('')
  const [semanasHist, setSemanasHist] = useState(8)

  const carregar = useCallback(async () => {
    try {
      const [p, h] = await Promise.all([chamar<Lista>('/api/reunioes?visao=proximas'), chamar<Lista>('/api/reunioes?visao=historico')])
      setProx(p); setHist(h); setErro(''); setAgora(new Date().toISOString())
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar') }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const f = () => carregar()
    window.addEventListener('central-trabalho-mudou', f); window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar])

  const carregarDet = useCallback(async (id: string) => {
    try { setDet(await chamar<ReuniaoUI>(`/api/reunioes/${id}`)) } catch { setDet(null) }
  }, [])
  const abrir = (t: Ticket) => { setAberta(t); setDet(null); carregarDet(t.id) }

  const d = useMemo(() => {
    const vistos = new Set<string>()
    return {
      todas: [...(prox?.reunioes || []), ...(hist?.reunioes || [])].filter((t) => (vistos.has(t.id) ? false : (vistos.add(t.id), true))),
      usuarios: { ...(hist?.usuarios || {}), ...(prox?.usuarios || {}) } as Record<string, UsuarioMin>,
      presencas: { ...(hist?.presencas || {}), ...(prox?.presencas || {}) } as Record<string, PresencaRow[]>,
      itens: { ...(hist?.itens || {}), ...(prox?.itens || {}) } as Record<string, number>,
      series: prox?.series || hist?.series || [],
      salas: { ...(hist?.salas || {}), ...(prox?.salas || {}) } as Record<string, string>,
    }
  }, [prox, hist])

  const porDia = useMemo(() => {
    const m = new Map<string, Ticket[]>()
    for (const t of d.todas) { if (!t.reuniao_inicio) continue; const k = diaSP(t.reuniao_inicio); m.set(k, [...(m.get(k) || []), t]) }
    for (const l of m.values()) l.sort((a, b) => (a.reuniao_inicio || '').localeCompare(b.reuniao_inicio || ''))
    return m
  }, [d.todas])

  const nome = (id: string) => d.usuarios[id]?.nome || det?.usuarios[id]?.nome || '—'
  const condutor = (t: Ticket) => d.presencas[t.id]?.find((p) => p.papel === 'condutor')?.usuario_id || t.solicitante_id || ''
  const titulo = (t: Ticket) => { const s = d.series.find((x) => x.id === t.reuniao_serie_id); const tt = semData(t.titulo); return s && tt === s.nome ? s.nome : tt }
  const passo = (t: Ticket) => passoDe(t, d.itens[t.id] || 0, agora)
  const conduzo = (t: Ticket) => isAdmin || (d.presencas[t.id] || []).some((p) => p.usuario_id === meuId && (p.papel === 'condutor' || p.papel === 'secretario'))

  const naoAconteceu = async (t: Ticket) => {
    if (!window.confirm(`Marcar "${titulo(t)}" como não aconteceu? Ela fica como cancelada.`)) return
    setOcupado(true)
    try {
      await chamar(`/api/reunioes/${t.id}/acoes`, { json: { acao: 'etapa', para: 'cancelada', motivo: 'Não aconteceu' } })
      setAberta(null); await carregar()
    } catch (e) { onAviso(e instanceof Error ? e.message : 'Falha') } finally { setOcupado(false) }
  }

  const trocarVisibilidade = async (t: Ticket) => {
    const priv = t.visibilidade === 'privado'
    if (!window.confirm(priv ? 'Deixar a reunião PÚBLICA? Todo mundo do portal vai ver.' : 'Deixar a reunião PRIVADA? Só quem está nela vai ver.')) return
    setOcupado(true)
    try {
      await chamar(`/api/reunioes/${t.id}/acoes`, { json: { acao: 'titulo', titulo: t.titulo, visibilidade: priv ? 'publico' : 'privado' } })
      setAberta({ ...t, visibilidade: priv ? 'publico' : 'privado' }); await carregar()
    } catch (e) { onAviso(e instanceof Error ? e.message : 'Falha') } finally { setOcupado(false) }
  }

  const excluir = async (t: Ticket) => {
    if (!window.confirm(`Excluir "${titulo(t)}" de vez? Não dá para desfazer.`)) return
    setOcupado(true)
    try {
      await chamar(`/api/reunioes/${t.id}`, { method: 'DELETE' })
      window.dispatchEvent(new Event('central-trabalho-mudou'))
      setAberta(null); await carregar()
    } catch (e) { onAviso(e instanceof Error ? e.message : 'Falha ao excluir') } finally { setOcupado(false) }
  }

  const botoes = (t: Ticket) => {
    const p = passo(t); const info = PASSO[p]
    return (
      <>
        <button className="ag-btn cheio" style={{ ['--c' as string]: info.cor, ['--cb' as string]: FUNDO_ESCURO[info.cor] || info.cor }} onClick={() => router.push(`/reunioes/${t.id}`)}>{info.icone} {info.botao}</button>
        {p === 'aconteceu' && (conduzo(t) || (det?.reuniao.id === t.id && det.criador_id === meuId)) &&<button className="ag-btn" disabled={ocupado} onClick={() => naoAconteceu(t)}><X size={15} /> Não aconteceu</button>}
      </>
    )
  }

  const pessoas = (t: Ticket, max = 5) => {
    const pres = d.presencas[t.id] || []
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        <span style={{ display: 'inline-flex' }}>{pres.slice(0, max).map((p, i) => <Av key={p.usuario_id} i={i} u={d.usuarios[p.usuario_id]} nome={nome(p.usuario_id)} />)}</span>
        {pres.length} {pres.length === 1 ? 'pessoa' : 'pessoas'}
      </span>
    )
  }

  if (erro) return <div className="ag-vazio" style={{ color: '#dc2626' }}>{erro}</div>
  if (!prox || !hist) return <div className="ag-vazio">Carregando reuniões…</div>

  // Próximas = ainda não terminou (ou está acontecendo). O que já passou vai para o Histórico.
  const terminou = (t: Ticket) => ['ata_publicada', 'ata_rascunho'].includes(t.reuniao_etapa || '') || (t.reuniao_etapa !== 'em_andamento' && (fimDe(t) || '') < agora)
  const futuras = d.todas.filter((t) => t.reuniao_inicio && !terminou(t) && (verCanceladas || passo(t) !== 'cancelada'))
    .sort((a, b) => (a.reuniao_inicio || '').localeCompare(b.reuniao_inicio || ''))
  const diasLista = [...new Set(futuras.map((t) => diaSP(t.reuniao_inicio!)))]
  const deHoje = futuras.filter((t) => diaSP(t.reuniao_inicio!) === hoje && passo(t) !== 'cancelada')
  const proximaDepois = futuras.find((t) => diaSP(t.reuniao_inicio!) > hoje && passo(t) !== 'cancelada')
  // Passou e ninguém fechou a ata nem disse se aconteceu: lembrete com link para o Histórico.
  const semAta = d.todas.filter((t) => terminou(t) && ['aconteceu', 'ata'].includes(passo(t))).length
  const amanha = somarDia(hoje, 1)
  const nomeDia = (dia: string) => dia === hoje ? `Hoje · ${ddmm(dia)}` : dia === amanha ? `Amanhã · ${ddmm(dia)}` : `${SEMANA_LONGA[dowDe(dia)].slice(0, 3)} ${ddmm(dia)}`

  const janela = (
    <>
      {/* ───────────── JANELA DA REUNIÃO ───────────── */}
      {aberta && (() => {
        const t = aberta; const p = passo(t); const info = PASSO[p]; const c = condutor(t); const n = d.itens[t.id] || 0
        const pres = (det?.presencas || d.presencas[t.id] || []).map((x) => x.usuario_id)
        const usuarios = { ...d.usuarios, ...(det?.usuarios || {}) }
        return (
          <div className="ag-modal" onClick={() => setAberta(null)}>
            <div onClick={(e) => e.stopPropagation()} style={{ ['--c' as string]: info.cor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span className="ag-ic">{info.ic}</span>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'flex-start' }}>
                  <span className="ag-chip"><i />{info.texto}</span>
                  {info.dica && <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>{info.dica}</span>}
                </span>
                <span style={{ flex: 1 }} />
                <button className="ag-btn peq" onClick={() => setAberta(null)} aria-label="Fechar"><X size={15} /></button>
              </div>
              <div style={{ fontSize: 20, fontWeight: 500 }}>{titulo(t)}</div>
              <div style={{ fontSize: 14, color: 'var(--portal-text-secondary,#475569)' }}>
                {t.reuniao_inicio && `${SEMANA_LONGA[dowDe(diaSP(t.reuniao_inicio))]} ${ddmm(diaSP(t.reuniao_inicio))} · ${horaDe(t.reuniao_inicio)} até ${horaDe(fimDe(t))}`}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Av u={d.usuarios[c]} nome={nome(c)} /> {nome(c)} conduz</span>
                {(() => {
                  const priv = t.visibilidade === 'privado'
                  const cor = priv ? '#7c3aed' : '#0891b2'
                  const rotulo = <>{priv ? <Lock size={13} /> : <Globe size={13} />} {priv ? 'Privada · só quem está nela vê' : 'Pública · todo mundo do portal vê'}</>
                  return det?.posso_editar && det.reuniao.id === t.id ? (
                    <button className="ag-btn peq" disabled={ocupado} style={{ alignSelf: 'flex-start', color: cor, borderColor: `color-mix(in srgb,${cor} 35%,var(--portal-border,#e2e8f0))` }}
                      onClick={() => trocarVisibilidade(t)} title="Clique para trocar">{rotulo} <span style={{ opacity: .7 }}>· trocar</span></button>
                  ) : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: cor }}>{rotulo}</span>
                })()}
                {t.reuniao_etapa === 'em_andamento' && (
                  <span><CronometroReuniao inicio={(t.payload as { iniciada_em?: string } | null)?.iniciada_em || t.reuniao_inicio!} duracaoMin={durDe(t)} /></span>
                )}
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Users size={14} /> {pessoas(t, 8)}</span>
                {d.salas[t.id] && <span><MapPin size={14} style={{ verticalAlign: -2 }} /> {d.salas[t.id]}</span>}
                <span>{n ? `${n} ${n === 1 ? 'assunto' : 'assuntos'} na pauta` : 'Nenhum assunto na pauta'}</span>
              </div>
              {/* descrição escrita pela pessoa (a automática "Reunião em dd/mm/aaaa às hh:mm." não aparece) */}
              {t.descricao && !/^Reunião( da série ".*")? em \d{2}\/\d{2}\/\d{4} às \d{2}:\d{2}\.$/.test(t.descricao) && (
                <div style={{ fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{t.descricao}</div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{botoes(t)}{det?.posso_editar && <button className="ag-btn" onClick={() => setEditar(t)}><Pencil size={15} /> Editar</button>}{det?.posso_remarcar &&<button className="ag-btn" onClick={() => setRemarcar(t)}><CalendarClock size={15} /> Remarcar</button>}{det?.posso_excluir && det.reuniao.id === t.id && <button className="ag-btn" style={{ color: '#dc2626' }} disabled={ocupado} title="Apaga de vez (reunião de teste ou marcada por engano)" onClick={() => excluir(t)}><Trash2 size={15} /> Excluir</button>}</div>
              {det && p !== 'cancelada' && (
                <ConviteReuniao reuniaoId={t.id} presencas={det.presencas} usuarios={usuarios} meuId={meuId} convite={det.convite}
                  encerrada={['ata_publicada', 'cancelada'].includes(t.reuniao_etapa || '')} onMudou={() => carregarDet(t.id)} />
              )}
              {p !== 'cancelada' && (
                <div style={{ borderTop: '1px solid var(--portal-border,#e2e8f0)', paddingTop: 12 }}>
                  {!det ? <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Carregando ações…</div> : (
                    <TarefasRapidas reuniaoId={t.id} pessoas={pres} usuarios={usuarios} acoes={det.acoes}
                      podeCriar={det.posso_conduzir || !!det.meu_papel} onCriada={() => carregarDet(t.id)} onAbrir={setTicketAberto} />
                  )}
                </div>
              )}
            </div>
          </div>
        )
      })()}
      {ticketAberto && <TicketModal id={ticketAberto} zIndex={1500} onFechar={() => setTicketAberto(null)} onMudou={() => aberta && carregarDet(aberta.id)} />}
      {editar && (
        <EditarReuniao reuniaoId={editar.id} titulo={editar.titulo} descricao={editar.descricao ?? null} visibilidade={editar.visibilidade ?? null}
          pessoas={(det?.presencas || d.presencas[editar.id] || []).map((x) => x.usuario_id)} condutorId={det?.condutor_id || condutor(editar)}
          onFechar={() => setEditar(null)}
          onFeito={() => { setEditar(null); setAberta(null); carregar() }} />
      )}
      {remarcar && (
        <RemarcarReuniao reuniaoId={remarcar.id} inicio={remarcar.reuniao_inicio ?? null} duracaoMin={durDe(remarcar)}
          onFechar={() => setRemarcar(null)}
          onFeito={(av) => { setRemarcar(null); setAberta(null); if (av) onAviso(av); carregar() }} />
      )}
    </>
  )

  // Linha de reunião (Próximas e Histórico): hora · título · etiqueta do estado · sala · pessoas,
  // e o botão do próximo passo em AZUL (regra de cores: azul = o que você pode fazer; a cor do
  // estado fica só na etiqueta). Clicar na linha abre a janela da reunião.
  const linha = (t: Ticket, botao?: React.ReactNode) => {
    const p = passo(t); const info = PASSO[p]
    return (
      <div key={t.id} role="button" tabIndex={0} className={`ag-lin${p === 'cancelada' ? ' cancelada' : ''}`} style={{ ['--c' as string]: info.cor }}
        onClick={() => abrir(t)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); abrir(t) } }}>
        <span className="h">{horaDe(t.reuniao_inicio)}<small>até {horaDe(fimDe(t))}</small></span>
        <span style={{ minWidth: 0 }}>
          <span className="t">{titulo(t)}</span>
          <span className="info">
            <span className="ag-chip"><i />{info.texto}</span>
            {d.salas[t.id] && <span><MapPin size={13} style={{ verticalAlign: -2 }} /> {d.salas[t.id]}</span>}
            {pessoas(t)}
          </span>
        </span>
        {botao ?? (p !== 'cancelada' && (
          <button className="ag-btn cheio peq" style={{ ['--c' as string]: '#2563eb' }}
            onClick={(e) => { e.stopPropagation(); router.push(`/reunioes/${t.id}`) }}>
            {info.icone} {info.botao}
          </button>
        ))}
      </div>
    )
  }

  // Histórico: só o que já passou (ou foi encerrado), agrupado por semana, mais nova primeiro.
  const passadas = d.todas.filter((t) => t.reuniao_inicio && ((fimDe(t) || '') < agora || ['cancelada', 'ata_publicada', 'ata_rascunho'].includes(t.reuniao_etapa || '')))
  // Busca (23/11/2026): título, descrição, o que foi escrito na ata e nome de quem participou — sem acento/maiúscula
  const sem = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  const termos = sem(busca).split(/\s+/).filter(Boolean)
  const casaBusca = (t: Ticket) => {
    if (!termos.length) return true
    const pessoasTxt = (d.presencas[t.id] || []).map((p) => d.usuarios[p.usuario_id]?.nome || '').join(' ')
    const alvo = sem(`${t.titulo} ${t.descricao || ''} ${String((t.payload as { ata_texto?: unknown } | null)?.ata_texto || '')} ${pessoasTxt} #${t.numero}`)
    return termos.every((x) => alvo.includes(x))
  }
  const contaHist = (f: FiltroHist) => passadas.filter((t) => (f === 'todas' || passo(t) === f) && casaBusca(t)).length
  const filtroH = (t: Ticket) => passadas.includes(t) && (filtroHist === 'todas' || passo(t) === filtroHist) && casaBusca(t)
  const semanasComReuniao = [...new Set(passadas.filter(filtroH).map((t) => segundaDe(diaSP(t.reuniao_inicio!))))].sort().reverse()

  if (modo === 'historico') return (
    <div className="ag">
      <style>{CSS}</style>
      <div className="ag-sec">
        {FILTROS_HIST.map((f) => (
          <button key={f.id} className="ag-btn peq" onClick={() => setFiltroHist(f.id)}
            style={filtroHist === f.id ? { borderColor: f.cor, color: f.cor, background: `color-mix(in srgb,${f.cor} 10%,var(--portal-surface,#fefefe))` } : undefined}>
            {f.rotulo} <span style={{ fontSize: 12, opacity: .8 }}>{contaHist(f.id)}</span>
          </button>
        ))}
        <span style={{ flex: 1 }} />
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar: assunto, ata, pessoa…" aria-label="Buscar no histórico"
          style={{ height: 34, minWidth: 0, flex: '0 1 280px', padding: '0 12px', borderRadius: 10, border: '1px solid var(--portal-border,#e2e8f0)', background: 'var(--portal-surface,#fefefe)', color: 'var(--portal-text,#0f172a)', fontFamily: 'inherit', fontSize: 13.5 }} />
      </div>
      {semanasComReuniao.length === 0 && <div className="ag-vazio">Nenhuma reunião aqui.</div>}
      {semanasComReuniao.slice(0, semanasHist).map((seg) => (
        <div key={seg} style={{ marginBottom: 22 }}>
          <div className="ag-sec"><h2 style={{ fontSize: 16 }}>Semana de {ddmm(seg)} a {ddmm(somarDia(seg, 6))}</h2></div>
          <div className="ag-lista">
            {Array.from({ length: 7 }, (_, i) => somarDia(seg, i)).filter((dia) => (porDia.get(dia) || []).some(filtroH)).map((dia) => (
              <section key={dia} className="ag-dia">
                <h3>{SEMANA_LONGA[dowDe(dia)]}, {ddmm(dia)}</h3>
                {(porDia.get(dia) || []).filter(filtroH).map((t) => linha(t))}
              </section>
            ))}
          </div>
        </div>
      ))}
      {semanasComReuniao.length > semanasHist && <button className="ag-btn" onClick={() => setSemanasHist(semanasHist + 8)}>Ver semanas mais antigas</button>}
      {janela}
    </div>
  )

  return (
    <div className="ag">
      <style>{CSS}</style>

      <div className="ag-sec" style={{ justifyContent: 'space-between' }}>
        <span className="sub">
          {deHoje.length > 0 ? `Hoje: ${deHoje.length} ${deHoje.length === 1 ? 'reunião' : 'reuniões'}`
            : proximaDepois?.reuniao_inicio ? <>Nada hoje. Próxima: <b style={{ fontWeight: 600, color: 'var(--portal-text,#0f172a)' }}>{titulo(proximaDepois)}</b>, {nomeDia(diaSP(proximaDepois.reuniao_inicio)).toLowerCase()} às {horaDe(proximaDepois.reuniao_inicio)}</>
            : 'Nada hoje e nenhuma reunião marcada.'}
        </span>
        <label className="ag-check"><input type="checkbox" checked={verCanceladas} onChange={(e) => setVerCanceladas(e.target.checked)} /> Mostrar canceladas</label>
      </div>
      {semAta > 0 && (
        <button className="ag-btn peq" style={{ marginBottom: 14, color: '#7c3aed', borderColor: 'color-mix(in srgb,#7c3aed 35%,var(--portal-border,#e2e8f0))' }} onClick={() => router.push('/reunioes?aba=historico')}>
          <FileText size={14} /> {semAta} {semAta === 1 ? 'reunião passou e está' : 'reuniões passaram e estão'} sem ata · ver no Histórico
        </button>
      )}
      {futuras.length === 0 && <div className="ag-vazio">Nenhuma reunião marcada. Use “Nova reunião” lá em cima.</div>}
      <div className="ag-lista">
        {diasLista.map((dia) => (
          <section key={dia} className={`ag-dia${dia === hoje ? ' hoje' : ''}`}>
            <h3>{nomeDia(dia)}</h3>
            {futuras.filter((t) => diaSP(t.reuniao_inicio!) === dia).map((t) => linha(t, passo(t) === 'cancelada' ? null : (
              <button className="ag-btn cheio peq" style={{ ['--c' as string]: '#2563eb' }}
                onClick={(e) => { e.stopPropagation(); router.push(`/reunioes/${t.id}`) }}>
                {passo(t) === 'agora' ? <><Play size={14} /> Entrar</> : <><FileText size={14} /> Abrir pauta</>}
              </button>
            )))}
          </section>
        ))}
      </div>

      {janela}
    </div>
  )
}
