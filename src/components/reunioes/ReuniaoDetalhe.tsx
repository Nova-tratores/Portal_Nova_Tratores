'use client'
// Uma reunião (refeita em 17/11/2026 — José: "muito confuso").
// Topo: data, nome, situação em palavras simples e UM botão principal (Começar · Encerrar · Publicar a ata).
// Esquerda: Pauta (o que vai ser falado) + Ata escrita DURANTE a reunião (salva sozinha).
// Direita: Tarefas (quem faz o quê até quando — até para quem não está na reunião) + Quem participa.
// Pendências de reuniões anteriores só aparecem quando existem. Dados de GET /api/reunioes/[id].
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Play, Square, FileCheck2, Copy, Repeat, AlertTriangle, Check, Ban, MessageSquarePlus, RotateCcw, MapPin, CalendarClock, NotebookPen, Users, CircleCheck, Video, CalendarPlus, Pencil, Trash2, Printer, Lock, Globe } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermissoes'
import { useIsMobile } from '@/hooks/useIsMobile'
import TicketModal from '@/components/tickets/TicketModal'
import UserSelect from '@/components/tickets/UserSelect'
import type { ItemPauta, ItemResultado, ItemTipo, SaidaPendencia } from '@/lib/reunioes/regras'
import type { ReuniaoUI } from './tipos'
import BlocoPendencias from './BlocoPendencias'
import PautaItens, { type CampanhaPauta } from './PautaItens'
import FormAcaoReuniao from './FormAcaoReuniao'
import TarefasRapidas from './TarefasRapidas'
import RemarcarReuniao from './RemarcarReuniao'
import EditarReuniao from './EditarReuniao'
import ConviteReuniao from './ConviteReuniao'
import VirarSerie from './VirarSerie'
import AoVivo, { type Gravacao } from './AoVivo'
import { chamar, horaDe, brCurto, primeiroNome, CronometroReuniao } from './comum'

// situação em palavras simples (a etapa técnica fica escondida)
const SITUACAO: Record<string, { texto: string; cor: string }> = {
  agendada: { texto: 'Marcada', cor: '#2563eb' },
  pauta_fechada: { texto: 'Marcada', cor: '#2563eb' },
  em_andamento: { texto: 'Acontecendo agora', cor: '#dc2626' },
  ata_rascunho: { texto: 'Falta publicar a ata', cor: '#7c3aed' },
  ata_publicada: { texto: 'Concluída', cor: '#059669' },
  cancelada: { texto: 'Cancelada', cor: '#94a3b8' },
}
const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()

const CSS = `
.rd{padding:18px 20px 60px;display:flex;flex-direction:column;gap:14px;color:var(--portal-text,#0f172a)}
.rd *{font-weight:inherit;box-sizing:border-box}
.rd-card{background:var(--portal-surface,#fefefe);border:1px solid var(--portal-border,#e2e8f0);border-radius:16px;padding:16px 18px}
.rd-grade{display:grid;grid-template-columns:minmax(0,1.35fr) minmax(0,1fr);gap:14px;align-items:start}
.rd-col{display:flex;flex-direction:column;gap:14px;min-width:0}
.rd-sec{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.rd-sec .ic{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;color:var(--c);background:color-mix(in srgb,var(--c) 9%,var(--portal-surface,#fefefe));border:1px solid color-mix(in srgb,var(--c) 18%,transparent)}
.rd-sec b{display:block;font-size:17px;font-weight:500}
.rd-sec small{display:block;font-size:12.5px;color:var(--portal-text-muted,#64748b)}
.rd-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 16px;border-radius:11px;font-size:14px;font-weight:500;cursor:pointer;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);white-space:nowrap;font-family:inherit}
.rd-btn.cheio{border:none;color:#fefefe;background:var(--c);box-shadow:0 6px 14px -8px var(--c)}
.rd-btn:disabled{opacity:.5;cursor:default}
.rd-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 11px;border-radius:999px;font-size:13px;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
.rd-pill i{width:7px;height:7px;border-radius:50%;background:var(--c)}
.rd-av{width:26px;height:26px;border-radius:50%;display:inline-grid;place-items:center;font-size:10px;color:#fefefe;background:#64748b;overflow:hidden;flex:none}
.rd-av img{width:100%;height:100%;object-fit:cover}
.rd-ata{width:100%;min-height:220px;padding:12px 14px;border-radius:12px;border:1px solid var(--portal-border,#e5e7eb);background:var(--portal-bg,#fefefe);color:var(--portal-text,#111111);font-size:14.5px;line-height:1.55;font-family:inherit;resize:vertical;outline:none}
.rd-ata:focus{border-color:#7c3aed;box-shadow:0 0 0 3px color-mix(in srgb,#7c3aed 14%,transparent)}
.rd-pessoa{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 12px 0 5px;border-radius:999px;font-size:13.5px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text,#0f172a);font-family:inherit}
@media (max-width:980px){.rd-grade{grid-template-columns:1fr}}
@media (max-width:640px){.rd{padding:12px 10px 60px}.rd-topo-acoes{width:100%}.rd-topo-acoes .rd-btn{flex:1}}
`

function Av({ u, nome }: { u?: { nome: string; avatar_url?: string | null }; nome: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="rd-av" title={nome}>{u?.avatar_url ? <img src={u.avatar_url} alt="" /> : iniciais(nome)}</span>
}

/**
 * Ata em PDF (23/11/2026): abre uma página limpa só com a ata e chama a impressão do navegador —
 * lá a pessoa escolhe a impressora ou "Salvar como PDF". O texto é o mesmo do WhatsApp (*negrito* vira negrito).
 */
function imprimirAta(titulo: string, texto: string, rodape: string, adendos: { quem: string; em: string; texto: string }[]) {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const fmt = (s: string) => esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>')
  const w = window.open('', '_blank')
  if (!w) return
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Ata — ${esc(titulo)}</title>
<style>body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:32px;line-height:1.5;font-size:13.5px}
h1{font-size:20px;margin:0 0 4px}.sub{color:#555;font-size:12px;margin-bottom:18px}
.ata{white-space:pre-wrap}.ad{margin-top:16px;padding-top:10px;border-top:1px solid #ccc}.ad small{color:#555}
@page{margin:16mm}</style></head><body>
<h1>Ata — ${esc(titulo)}</h1><div class="sub">Nova Tratores · ${esc(rodape)}</div>
<div class="ata">${fmt(texto)}</div>
${adendos.map((a) => `<div class="ad"><small>Adendo · ${esc(a.quem)} · ${esc(a.em)}</small><div class="ata">${fmt(a.texto)}</div></div>`).join('')}
<script>window.onload=function(){window.print()}</script></body></html>`)
  w.document.close()
}

/** Ata escrita durante a reunião — salva sozinha 1 s depois de parar de digitar. */
function AtaDuranteReuniao({ reuniaoId, inicial, inicialEm, podeEscrever }: { reuniaoId: string; inicial: string; inicialEm: string | null; podeEscrever: boolean }) {
  const [texto, setTexto] = useState(inicial)
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('')
  const [salvoEm, setSalvoEm] = useState('')
  // versão do servidor em que este texto se baseia; outra pessoa salvou depois = conflito (23/11/2026)
  const base = useRef<string | null>(inicialEm)
  const [conflito, setConflito] = useState<{ msg: string; texto: string; em: string } | null>(null)
  const timer = useRef<number | null>(null)
  const salvar = useCallback(async (t: string, forcar = false) => {
    setEstado('salvando')
    try {
      const j = await chamar<{ em: string }>(`/api/reunioes/${reuniaoId}/acoes`, { json: { acao: 'anotacoes', texto: t, base_em: base.current, forcar } })
      base.current = j.em; setConflito(null)
      setEstado('salvo'); setSalvoEm(horaDe(j.em))
    } catch (e) {
      const d = (e as { dados?: { conflito?: boolean; texto?: string; em?: string } }).dados
      if (d?.conflito) { setConflito({ msg: (e as Error).message, texto: d.texto || '', em: d.em || '' }); setEstado('') }
      else setEstado('erro')
    }
  }, [reuniaoId])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])
  if (!podeEscrever) return <div style={{ whiteSpace: 'pre-wrap', fontSize: 14.5, lineHeight: 1.55, color: texto ? 'var(--portal-text,#0f172a)' : 'var(--portal-text-muted,#64748b)' }}>{texto || 'Nada anotado.'}</div>
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {conflito && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 12, background: 'rgba(217,119,6,.1)', color: '#b45309', fontSize: 13.5 }}>
          <span><b style={{ fontWeight: 500 }}>{conflito.msg}</b> O seu texto ainda não foi salvo. Escolha:</span>
          <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="rd-btn" onClick={() => { setTexto(conflito.texto); base.current = conflito.em; setConflito(null) }}>Usar a outra versão (descarta a minha)</button>
            <button className="rd-btn" onClick={() => { setTexto(`${conflito.texto}\n\n${texto}`); base.current = conflito.em; setConflito(null); salvar(`${conflito.texto}\n\n${texto}`) }}>Juntar as duas</button>
            <button className="rd-btn" onClick={() => salvar(texto, true)}>Manter só a minha</button>
          </span>
        </div>
      )}
      <textarea className="rd-ata" value={texto} maxLength={20000}
        placeholder={'Anote aqui o que está sendo falado e decidido, durante a reunião.\nEx.: Ficou combinado trocar o fornecedor de filtros a partir de dezembro.'}
        onChange={(e) => {
          const t = e.target.value; setTexto(t); setEstado('')
          if (timer.current) window.clearTimeout(timer.current)
          timer.current = window.setTimeout(() => salvar(t), 1000)
        }} />
      <span style={{ fontSize: 12.5, color: estado === 'erro' ? '#dc2626' : 'var(--portal-text-muted,#64748b)' }}>
        {estado === 'salvando' ? 'Salvando…' : estado === 'salvo' ? `Salvo às ${salvoEm}` : estado === 'erro' ? 'Não salvou — confira a internet e digite de novo' : 'Salva sozinha enquanto você escreve'}
      </span>
    </div>
  )
}

export default function ReuniaoDetalhe({ id }: { id: string }) {
  const router = useRouter()
  const { userProfile } = useAuth()
  const { isDev, isAdmin } = usePermissoes(userProfile?.id)
  const isMobile = useIsMobile()
  const [d, setD] = useState<ReuniaoUI | null>(null)
  const [eventos, setEventos] = useState<{ id: string; tipo: string; payload: Record<string, unknown>; created_at: string; autor_id: string | null }[]>([])
  const [erro, setErro] = useState('')
  const [erroLista, setErroLista] = useState<string[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  const [acaoDe, setAcaoDe] = useState<ItemPauta | null | false>(false)
  const [adendo, setAdendo] = useState('')
  const [copiado, setCopiado] = useState(false)
  const [remarcando, setRemarcando] = useState(false)
  const [repetindo, setRepetindo] = useState(false)
  const [editandoTitulo, setEditandoTitulo] = useState(false)
  const [editandoTudo, setEditandoTudo] = useState(false)
  const [novoTitulo, setNovoTitulo] = useState('')
  const [aviso, setAviso] = useState('')
  // campanhas de marketing para ligar os assuntos da pauta (linha do tempo da campanha, 18/11/2026)
  const [campanhas, setCampanhas] = useState<CampanhaPauta[]>([])
  useEffect(() => {
    if (!userProfile) return
    chamar<{ campanhas: CampanhaPauta[] }>('/api/reunioes/campanhas').then((j) => setCampanhas(j.campanhas || [])).catch(() => {})
  }, [userProfile])

  const carregar = useCallback(async () => {
    try {
      const [j, t] = await Promise.all([
        chamar<ReuniaoUI>(`/api/reunioes/${id}`),
        chamar<{ eventos: typeof eventos }>(`/api/tickets/${id}`).catch(() => ({ eventos: [] })),
      ])
      setD(j); setEventos(t.eventos || []); setErro('')
    } catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao carregar') }
  }, [id])
  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])
  useEffect(() => {
    const f = () => carregar()
    window.addEventListener('central-trabalho-mudou', f)
    return () => window.removeEventListener('central-trabalho-mudou', f)
  }, [carregar])

  const nome = useCallback((uid: string) => d?.usuarios[uid]?.nome || '—', [d])
  const acao = async (body: Record<string, unknown>) => {
    setOcupado(true); setErro(''); setErroLista([])
    try { await chamar(`/api/reunioes/${id}/acoes`, { json: body }); await carregar() }
    catch (e) { const err = e as Error & { pendentes?: string[] }; setErro(err.message); setErroLista(err.pendentes || []); throw e }
    finally { setOcupado(false) }
  }
  const itemAcao = async (body: Record<string, unknown>) => {
    setErro('')
    try { await chamar(`/api/reunioes/${id}/itens`, { json: body }); await carregar() }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha'); throw e }
  }
  const adendos = useMemo(() => eventos.filter((e) => e.tipo === 'ata_adendo'), [eventos])
  const tratadas = useMemo(() => eventos.filter((e) => e.tipo === 'pendencia_tratada'), [eventos])

  if (erro && !d) return <div style={{ padding: 30, color: '#dc2626' }}>{erro}</div>
  if (!d) return <div style={{ padding: 40, textAlign: 'center', color: 'var(--portal-text-muted,#888)' }}>Carregando reunião…</div>

  const r = d.reuniao
  const etapa = r.reuniao_etapa || 'agendada'
  const cancelada = etapa === 'cancelada'
  const publicada = etapa === 'ata_publicada'
  const conducao = etapa === 'em_andamento'
  const rascunho = etapa === 'ata_rascunho'
  const antes = etapa === 'agendada' || etapa === 'pauta_fechada'
  const conduz = d.posso_conduzir
  const participo = !!d.meu_papel
  const sit = SITUACAO[etapa] || SITUACAO.agendada
  const fim = r.reuniao_inicio ? new Date(new Date(r.reuniao_inicio).getTime() + d.duracao_min * 60_000).toISOString() : null
  const ataTexto = String((r.payload as { ata_texto?: unknown } | null)?.ata_texto || '')
  const ataEm = ((r.payload as { ata_texto_em?: unknown } | null)?.ata_texto_em as string) || null
  const temPendencias = d.pendencias.atrasadas.length + d.pendencias.vencendo.length > 0

  // botão principal: o próximo passo
  const principal = !conduz || cancelada ? null
    : antes ? <button className="rd-btn cheio" style={{ ['--c' as string]: '#d97706' }} disabled={ocupado} onClick={() => acao({ acao: 'etapa', para: 'em_andamento' }).catch(() => {})}><Play size={15} /> Começar reunião</button>
    : conducao ? <button className="rd-btn cheio" style={{ ['--c' as string]: '#7c3aed' }} disabled={ocupado} onClick={() => acao({ acao: 'etapa', para: 'ata_rascunho' }).catch(() => {})}><Square size={15} /> Encerrar reunião</button>
    : rascunho ? <button className="rd-btn cheio" style={{ ['--c' as string]: '#059669' }} disabled={ocupado} onClick={() => acao({ acao: 'publicar_ata' }).catch(() => {})}><FileCheck2 size={15} /> Publicar a ata</button>
    : null

  const onTratar = async (ticketId: string, saida: SaidaPendencia, extra: Record<string, unknown>) => { await acao({ acao: 'tratar_pendencia', ticket_id: ticketId, saida, ...extra }) }
  const onResultado = async (itemId: string, res: { resultado: ItemResultado; decisao_texto?: string; decisao_motivo?: string }) => { await acao({ acao: 'item_resultado', item_id: itemId, ...res }) }
  const onIncluir = async (c: { pergunta: string; tipo: ItemTipo; tempo_min: number; parking?: boolean }) => { await itemAcao({ acao: 'incluir', ...c }) }
  const condutor = d.condutor_id

  return (
    <div className="rd">
      <style>{CSS}</style>
      <button onClick={() => router.push('/reunioes')} style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13.5, color: 'var(--portal-text-muted,#64748b)', padding: 0, alignSelf: 'flex-start', fontFamily: 'inherit' }}><ArrowLeft size={15} /> Reuniões</button>

      {/* ───────── TOPO ───────── */}
      <div className="rd-card" style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', ['--c' as string]: sit.cor }}>
        {r.reuniao_inicio && (() => {
          const dt = new Date(r.reuniao_inicio)
          const p = (o: Intl.DateTimeFormatOptions) => dt.toLocaleDateString('pt-BR', { ...o, timeZone: 'America/Sao_Paulo' }).replace('.', '')
          return (
            <span style={{ flex: 'none', width: 66, padding: '7px 0', borderRadius: 14, textAlign: 'center', border: '1px solid color-mix(in srgb,#2563eb 22%,var(--portal-border,#e2e8f0))', background: 'color-mix(in srgb,#2563eb 7%,var(--portal-surface,#fefefe))', color: '#2563eb', display: 'flex', flexDirection: 'column', lineHeight: 1.1 }}>
              <span style={{ fontSize: 12 }}>{p({ weekday: 'short' })}</span>
              <span style={{ fontSize: 26, fontWeight: 500, color: 'var(--portal-text,#0f172a)', fontVariantNumeric: 'tabular-nums' }}>{p({ day: 'numeric' })}</span>
              <span style={{ fontSize: 12 }}>{p({ month: 'short' })}</span>
            </span>
          )
        })()}
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0, flex: '1 1 300px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span className="rd-pill"><i />{sit.texto}</span>
            {d.serie && <span className="rd-pill" style={{ ['--c' as string]: '#4f46e5' }}><Repeat size={12} /> {d.serie.nome}</span>}
            {/* pública/privada à vista; quem pode editar troca com um clique (José, 23/11/2026: "não acho onde muda") */}
            {(() => {
              const priv = r.visibilidade === 'privado'
              const conteudo = <>{priv ? <Lock size={12} /> : <Globe size={12} />} {priv ? 'Privada' : 'Pública'}</>
              const estilo = { ['--c' as string]: priv ? '#7c3aed' : '#0891b2' }
              if (!d.posso_editar) return <span className="rd-pill" style={estilo} title={priv ? 'Só quem está na reunião vê' : 'Todo mundo do portal vê'}>{conteudo}</span>
              return (
                <button className="rd-pill" disabled={ocupado} style={{ ...estilo, cursor: 'pointer', border: 'none', fontFamily: 'inherit' }}
                  title={priv ? 'Só quem está na reunião vê. Clique para deixar pública.' : 'Todo mundo do portal vê. Clique para deixar privada.'}
                  onClick={() => { if (window.confirm(priv ? 'Deixar a reunião PÚBLICA? Todo mundo do portal vai ver.' : 'Deixar a reunião PRIVADA? Só quem está nela vai ver.')) acao({ acao: 'titulo', titulo: r.titulo, visibilidade: priv ? 'publico' : 'privado' }).catch(() => {}) }}>
                  {conteudo} <span style={{ opacity: .7 }}>· trocar</span>
                </button>
              )
            })()}
          </span>
          {editandoTitulo ? (
            <span style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input autoFocus value={novoTitulo} maxLength={200} onChange={(e) => setNovoTitulo(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && novoTitulo.trim()) acao({ acao: 'titulo', titulo: novoTitulo }).then(() => setEditandoTitulo(false)).catch(() => {}); if (e.key === 'Escape') setEditandoTitulo(false) }}
                style={{ flex: '1 1 260px', height: 44, padding: '0 12px', borderRadius: 10, border: '1px solid #2563eb', background: 'var(--portal-bg,#fefefe)', color: 'var(--portal-text,#111111)', fontSize: 18, fontFamily: 'inherit' }} />
              <button className="rd-btn cheio" style={{ ['--c' as string]: '#2563eb' }} disabled={!novoTitulo.trim() || ocupado} onClick={() => acao({ acao: 'titulo', titulo: novoTitulo }).then(() => setEditandoTitulo(false)).catch(() => {})}><Check size={15} /> Salvar</button>
              <button className="rd-btn" onClick={() => setEditandoTitulo(false)}>Cancelar</button>
            </span>
          ) : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h1 style={{ margin: 0, fontSize: isMobile ? 20 : 24, fontWeight: 500, letterSpacing: '-.01em', lineHeight: 1.25 }}>{r.titulo}</h1>
              {d.posso_editar && (
                <button title="Editar título, descrição, pessoas e quem pode ver" aria-label="Editar a reunião" onClick={() => setEditandoTudo(true)}
                  style={{ flex: 'none', width: 34, height: 34, borderRadius: 9, border: '1px solid var(--portal-border,#e2e8f0)', background: 'var(--portal-surface,#fefefe)', color: 'var(--portal-text-muted,#64748b)', cursor: 'pointer', display: 'grid', placeItems: 'center' }}><Pencil size={15} /></button>
              )}
            </span>
          )}
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px 16px', flexWrap: 'wrap', fontSize: 14, color: 'var(--portal-text-secondary,#475569)' }}>
            <span style={{ fontVariantNumeric: 'tabular-nums' }}>{horaDe(r.reuniao_inicio)}{fim ? ` às ${horaDe(fim)}` : ''} · {d.duracao_min} min</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Av u={d.usuarios[condutor]} nome={nome(condutor)} /> {primeiroNome(nome(condutor))} conduz</span>
            {d.sala && <a href="/salas" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'inherit', textDecoration: 'none' }}><MapPin size={14} /> {d.sala.nome}</a>}
          </span>
          {/* cronômetro da reunião toda: rodando durante, parado mostrando quanto durou depois */}
          {(() => {
            const pl = (r.payload || {}) as { iniciada_em?: string; encerrada_em?: string }
            const ini = pl.iniciada_em || r.reuniao_inicio
            if (!ini || !(conducao || (pl.iniciada_em && pl.encerrada_em))) return null
            return <span><CronometroReuniao inicio={ini} fim={conducao ? null : pl.encerrada_em} duracaoMin={d.duracao_min} /></span>
          })()}
        </span>
        <span className="rd-topo-acoes" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {d.posso_remarcar && <button className="rd-btn" disabled={ocupado} onClick={() => setRemarcando(true)}><CalendarClock size={15} /> Remarcar</button>}
          {antes && (conduz || d.criador_id === userProfile?.id) && <button className="rd-btn" disabled={ocupado} onClick={() => { if (window.confirm('Cancelar esta reunião? Todos recebem o aviso.')) acao({ acao: 'etapa', para: 'cancelada' }).catch(() => {}) }}><Ban size={15} /> Cancelar</button>}
          {d.posso_excluir && <button className="rd-btn" disabled={ocupado} style={{ color: '#dc2626' }} title="Apaga de vez (para reunião de teste ou marcada por engano)" onClick={async () => {
            if (!window.confirm(`Excluir "${r.titulo}" de vez? Não dá para desfazer.${cancelada ? '' : ' Quem estava nela recebe o aviso.'}`)) return
            try { await chamar(`/api/reunioes/${id}`, { method: 'DELETE' }); window.dispatchEvent(new Event('central-trabalho-mudou')); router.push('/reunioes') }
            catch (e) { setAviso(e instanceof Error ? e.message : 'Falha ao excluir') }
          }}><Trash2 size={15} /> Excluir</button>}
          {d.posso_reabrir && <button className="rd-btn" disabled={ocupado} onClick={() => {
            const msg = publicada ? 'Reabrir? A ata volta para edição e precisa ser publicada de novo.' : cancelada ? 'Reabrir a reunião cancelada? Ela volta a ficar marcada (a sala não é reservada de novo).' : 'Reabrir a reunião?'
            if (window.confirm(msg)) acao({ acao: 'reabrir' }).catch(() => {})
          }}><RotateCcw size={15} /> Reabrir</button>}
          {principal}
        </span>
      </div>

      {(erro || erroLista.length > 0) && (
        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13.5 }}>
          {erro}{erroLista.length > 0 && <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>{erroLista.map((e, i) => <li key={i}>{e}</li>)}</ul>}
        </div>
      )}
      {(aviso || d.aviso) && <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#b45309' }}><AlertTriangle size={14} /> {aviso || d.aviso}</div>}

      {temPendencias && !cancelada && !publicada && (
        <BlocoPendencias pend={d.pendencias} usuarios={d.usuarios} modoConducao={conducao && conduz} onTratar={onTratar} onAbrirTicket={setTicketAberto} />
      )}

      <div className="rd-grade">
        {/* ───────── ESQUERDA: pauta + ata ───────── */}
        <div className="rd-col">
          {/* Ao vivo: PC da sala transmite e grava; quem está fora assiste e pergunta (José, 17/11/2026) */}
          {!cancelada && (
            <section className="rd-card">
              <div className="rd-sec" style={{ ['--c' as string]: '#dc2626' }}>
                <span className="ic"><Video size={16} /></span>
                <span><b>Ao vivo</b><small>O computador da sala transmite pela câmera; quem está fora assiste e pergunta por escrito</small></span>
              </div>
              <AoVivo reuniaoId={id} podeTransmitir={conduz || participo} podeApagar={isDev}
                visibilidade={(r.payload as { gravacao_visibilidade?: string } | null)?.gravacao_visibilidade === 'todos' ? 'todos' : 'participantes'}
                podeVerGravacoes={(r.payload as { gravacao_visibilidade?: string } | null)?.gravacao_visibilidade === 'todos' || participo || conduz || isAdmin || d.criador_id === userProfile?.id}
                podeEscolherVisibilidade={(rascunho || publicada) && (conduz || d.criador_id === userProfile?.id)} meuNome={userProfile ? nome(userProfile.id) : '—'} encerrada={publicada}
                perguntasIniciais={eventos.filter((e) => e.tipo === 'comentario' && e.payload.ao_vivo === true).map((e) => ({ nome: e.autor_id ? nome(e.autor_id) : '—', texto: String(e.payload.texto || ''), em: e.created_at }))}
                gravacoes={((r.payload as { gravacoes?: Gravacao[] } | null)?.gravacoes) || []} onGravou={() => carregar()} />
            </section>
          )}
          <PautaItens itens={d.itens} usuarios={d.usuarios} destinos={d.destinos} origens={d.origens} proxima={d.proxima} temSerie={!!d.serie}
            onAbrirReuniao={(rid) => router.push(`/reunioes/${rid}`)}
            modo={antes ? (cancelada ? 'leitura' : 'pauta') : publicada || cancelada ? 'leitura' : 'conducao'}
            podeEditar={!cancelada && !publicada && !rascunho && (participo || conduz || d.criador_id === userProfile?.id)} podeConduzir={conduz && !publicada} duracaoMin={d.duracao_min} corteFechado={false}
            onIncluir={onIncluir} onReordenar={(ordem) => itemAcao({ acao: 'reordenar', ordem })} onRemover={(item_id) => itemAcao({ acao: 'remover', item_id })}
            onResultado={publicada ? undefined : onResultado} onCriarAcao={publicada ? undefined : (item) => setAcaoDe(item)} onAbrirTicket={setTicketAberto}
            campanhas={campanhas} onCampanha={!cancelada && (participo || conduz || d.criador_id === userProfile?.id || isAdmin) ? (item_id, campanha_id) => itemAcao({ acao: 'campanha', item_id, campanha_id }) : undefined} />

          {!cancelada && (
            <section className="rd-card">
              <div className="rd-sec" style={{ ['--c' as string]: '#7c3aed' }}>
                <span className="ic"><NotebookPen size={16} /></span>
                <span><b>Ata</b><small>{publicada ? 'O que foi falado e decidido' : 'Escreva durante a reunião o que está sendo falado e decidido'}</small></span>
              </div>
              <AtaDuranteReuniao key={id} reuniaoId={id} inicial={ataTexto} inicialEm={ataEm} podeEscrever={!publicada && (conduz || participo)} />
              {rascunho && conduz && (
                <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 12, background: 'color-mix(in srgb,#059669 7%,transparent)', fontSize: 13.5, color: 'var(--portal-text-secondary,#475569)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <CircleCheck size={16} color="#059669" /> <span style={{ flex: 1 }}>Revise e publique: todos recebem a ata no sino. Depois de publicada, correção só por adendo.</span>
                  <button className="rd-btn cheio" style={{ ['--c' as string]: '#059669' }} disabled={ocupado} onClick={() => acao({ acao: 'publicar_ata' }).catch(() => {})}><FileCheck2 size={15} /> Publicar a ata</button>
                </div>
              )}
              {publicada && d.ata && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)', flex: 1 }}>Publicada por {nome(d.ata.publicada_por)} em {new Date(d.ata.publicada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                    <button className="rd-btn cheio" style={{ ['--c' as string]: '#16a34a' }} onClick={async () => { try { await navigator.clipboard.writeText(d.ata!.texto_whatsapp); setCopiado(true); setTimeout(() => setCopiado(false), 2000) } catch { /* sem clipboard */ } }}><Copy size={15} /> {copiado ? 'Copiado!' : 'Copiar para o WhatsApp'}</button>
                    <button className="rd-btn" onClick={() => imprimirAta(r.titulo, d.ata!.texto_whatsapp,
                      `Publicada por ${nome(d.ata!.publicada_por)} em ${new Date(d.ata!.publicada_em).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
                      adendos.map((e) => ({ quem: e.autor_id ? nome(e.autor_id) : 'sistema', em: new Date(e.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' }), texto: String(e.payload.texto || '') })))}>
                      <Printer size={15} /> Imprimir / PDF</button>
                  </div>
                  {adendos.map((e) => (
                    <div key={e.id} style={{ padding: '8px 10px', borderRadius: 10, background: 'var(--portal-bg-secondary,#f8fafc)', fontSize: 13.5 }}>
                      <div style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>Adendo · {e.autor_id ? nome(e.autor_id) : 'sistema'} · {new Date(e.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</div>
                      <div style={{ whiteSpace: 'pre-wrap' }}>{String(e.payload.texto || '')}</div>
                    </div>
                  ))}
                  {conduz && (
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input value={adendo} onChange={(e) => setAdendo(e.target.value)} placeholder="Faltou algo? Escreva um adendo" maxLength={4000}
                        style={{ flex: 1, height: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-bg,#fefefe)', color: 'var(--portal-text,#111111)', fontSize: 14, fontFamily: 'inherit' }} />
                      <button className="rd-btn" disabled={!adendo.trim() || ocupado} onClick={() => acao({ acao: 'adendo', texto: adendo }).then(() => setAdendo('')).catch(() => {})}><MessageSquarePlus size={15} /> Adicionar</button>
                    </div>
                  )}
                </div>
              )}
            </section>
          )}
        </div>

        {/* ───────── DIREITA: tarefas + pessoas ───────── */}
        <div className="rd-col">
          {!cancelada && (
            <section className="rd-card">
              <TarefasRapidas reuniaoId={id} pessoas={d.presencas.map((p) => p.usuario_id)} usuarios={d.usuarios} acoes={d.acoes}
                podeCriar={conduz || participo} onCriada={() => carregar()} onAbrir={setTicketAberto} />
            </section>
          )}

          {/* Próxima reunião embaixo de Tarefas (José, 17/11/2026): repetir (série) ou ramificação com outro assunto/pessoas */}
          {!cancelada && (
            <section className="rd-card">
              <div className="rd-sec" style={{ ['--c' as string]: '#4f46e5' }}>
                <span className="ic"><Repeat size={16} /></span>
                <span><b>Próxima reunião</b><small>{d.serie
                  ? `Esta já se repete: ${d.serie.recorrencia === 'semanal' ? 'toda' : d.serie.recorrencia === 'quinzenal' ? 'a cada 15 dias,' : 'a cada 4 semanas,'} ${['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'][d.serie.dia_semana ?? 0]} às ${d.serie.hora?.slice(0, 5) || '—'}. Também dá para marcar outra, com outro assunto.`
                  : 'Repetir esta reunião (toda semana, 15 dias, mês) ou marcar uma seguinte com outro assunto e outras pessoas'}</small></span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {d.posso_continuar
                  ? <button className="rd-btn cheio" style={{ ['--c' as string]: '#4f46e5' }} disabled={ocupado} onClick={() => setRepetindo(true)}><CalendarPlus size={15} /> {d.serie ? 'Marcar outra reunião a partir desta' : 'Repetir ou marcar a próxima'}</button>
                  : <span style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)' }}>Só quem conduz ou quem marcou a reunião faz isso.</span>}
                {d.serie && <button className="rd-btn" onClick={() => router.push('/reunioes?aba=series')}><Repeat size={15} /> Ver a série</button>}
              </div>
            </section>
          )}

          {/* Convite (23/11/2026): aceitar/recusar + WhatsApp por pessoa — só antes de a reunião acabar */}
          {!publicada && !cancelada && (d.convite || (d.meu_papel && d.meu_papel !== 'condutor')) && (
            <section className="rd-card">
              <div className="rd-sec" style={{ ['--c' as string]: '#16a34a' }}>
                <span className="ic"><MessageSquarePlus size={16} /></span>
                <span><b>Convite</b><small>{d.convite ? 'Quem confirmou e o aviso pelo WhatsApp' : 'Confirme se vai participar'}</small></span>
              </div>
              <ConviteReuniao reuniaoId={id} presencas={d.presencas} usuarios={d.usuarios} meuId={userProfile?.id || ''} convite={d.convite}
                encerrada={false} onMudou={() => carregar()} />
            </section>
          )}

          <section className="rd-card">
            <div className="rd-sec" style={{ ['--c' as string]: '#0891b2' }}>
              <span className="ic"><Users size={16} /></span>
              <span><b>Quem participa</b><small>{conducao || rascunho ? 'Toque para marcar quem veio' : `${d.presencas.length} ${d.presencas.length === 1 ? 'pessoa' : 'pessoas'}`}</small></span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {d.presencas.map((p) => {
                const marca = (conducao || rascunho) && !publicada && (conduz || p.usuario_id === userProfile?.id)
                const cor = p.presente === true ? '#059669' : p.presente === false ? '#dc2626' : undefined
                return (
                  <button key={p.usuario_id} className="rd-pessoa" disabled={!marca} title={p.papel === 'condutor' ? 'Conduz' : p.papel === 'secretario' ? 'Secretário' : ''}
                    onClick={() => acao({ acao: 'presenca', usuario_id: p.usuario_id, presente: p.presente === true ? false : true }).catch(() => {})}
                    style={{ cursor: marca ? 'pointer' : 'default', borderColor: cor, color: cor }}>
                    <Av u={d.usuarios[p.usuario_id]} nome={nome(p.usuario_id)} /> {primeiroNome(nome(p.usuario_id))}
                    {p.presente === true && <Check size={14} />}{p.presente === false && <Ban size={14} />}
                    {p.papel !== 'participante' && <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>{p.papel === 'condutor' ? 'conduz' : 'secretário'}</span>}
                  </button>
                )
              })}
            </div>
            {conduz && !publicada && !cancelada && (
              <div style={{ marginTop: 10 }}>
                <UserSelect value="" barraBusca placeholder="Chamar mais alguém…" excluir={d.presencas.map((p) => p.usuario_id)} autoFocus={false}
                  onChange={(uid) => { if (uid) acao({ acao: 'adicionar_participante', usuario_id: uid }).catch(() => {}) }} />
              </div>
            )}
          </section>

          {tratadas.length > 0 && (
            <section className="rd-card">
              <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 8 }}>Pendências tratadas nesta reunião</div>
              <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {tratadas.map((e) => <li key={e.id}>#{String(e.payload.numero)} {String(e.payload.titulo || '')} — {String(e.payload.saida).replace('_', ' ')}{e.payload.para && e.payload.saida === 'novo_prazo' ? ` para ${brCurto(String(e.payload.para))}` : ''}</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>

      {acaoDe !== false && (
        <FormAcaoReuniao tituloInicial={acaoDe?.decisao_texto || ''} categoriaInicial={r.categoria === 'Reunião' ? '' : r.categoria}
          pessoas={d.presencas.map((p) => p.usuario_id)} usuarios={d.usuarios}
          descricaoInicial={acaoDe ? `Decidido em "${r.titulo}" — ${acaoDe.pergunta}\nDecisão: ${acaoDe.decisao_texto || ''}\nMotivo: ${acaoDe.decisao_motivo || ''}` : `Tarefa combinada em "${r.titulo}".`}
          onFechar={() => setAcaoDe(false)}
          onCriar={async (a) => { await acao({ acao: 'criar_acao', ...a, item_id: acaoDe ? acaoDe.id : undefined }); window.dispatchEvent(new Event('central-trabalho-mudou')) }} />
      )}
      {repetindo && (
        <VirarSerie reuniaoId={id} inicio={r.reuniao_inicio ?? null} titulo={r.titulo} pessoas={d.presencas.map((p) => p.usuario_id)} condutorId={d.condutor_id}
          podeRepetir={!!d.posso_virar_serie} onFechar={() => setRepetindo(false)}
          onFeito={(msg, novaId) => { setRepetindo(false); setAviso(msg); if (novaId) router.push(`/reunioes/${novaId}`); else carregar() }} />
      )}
      {editandoTudo && (
        <EditarReuniao reuniaoId={id} titulo={r.titulo} descricao={r.descricao ?? null} visibilidade={r.visibilidade ?? null}
          pessoas={d.presencas.map((p) => p.usuario_id)} condutorId={d.condutor_id}
          onFechar={() => { setEditandoTudo(false); carregar() }}
          onFeito={() => { setEditandoTudo(false); carregar() }} />
      )}
      {remarcando && (
        <RemarcarReuniao reuniaoId={id} inicio={r.reuniao_inicio ?? null} duracaoMin={d.duracao_min}
          onFechar={() => setRemarcando(false)} onFeito={(av) => { setRemarcando(false); setAviso(av || ''); carregar() }} />
      )}
      {ticketAberto && <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={() => carregar()} />}
    </div>
  )
}
