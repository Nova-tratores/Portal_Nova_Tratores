'use client'
// IDEIAS DOS DEVS — bloco de notas em 3 estágios (só papel Dev; gate no layout).
//   1 · Captadas  : abriu, digitou, salvou (textarea sempre no topo)
//   2 · Agrupadas : seleciona ideias afins → grupo
//   3 · Planejadas: o grupo vira um ticket da Central (FormTicket pré-preenchido)
// Tudo pelas rotas /api/dev/ideias/* (service role); sem Realtime — recarrega
// no foco da janela e no evento 'central-trabalho-mudou', como as outras páginas.
// melhorias 5 (25/11/2026): 👍 e Captadas por votos · "levar para reunião" · ao salvar, avisa se
// parece com um pedido aberto ("vincular?") · "Sugerir grupos" com IA (só com IDEIAS_IA=1).
export const dynamic = 'force-dynamic'

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react'
import { Lightbulb, FolderOpen, Rocket, FolderPlus, ArrowRight, RefreshCw, Archive, Sparkles, Link2, X } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import { authHeaders } from '@/lib/auth/client'
import {
  separarPorEstagio, descricaoDoGrupo, tituloDoGrupo, ordenarPorVotos,
  type Ideia, type GrupoIdeias, type GrupoComIdeias,
} from '@/lib/dev/ideias'
import CapturaIdeia from '@/components/ideias/CapturaIdeia'
import CardIdeia from '@/components/ideias/CardIdeia'
import CardGrupo from '@/components/ideias/CardGrupo'
import FormTicket from '@/components/tickets/FormTicket'
import TicketModal from '@/components/tickets/TicketModal'

type Usuario = { id: string; nome: string; avatar_url: string | null }
type ResumoTicket = { numero: number; status: string; titulo: string }

async function chamar<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { ...(init?.json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `Falha (${res.status})`)
  return j as T
}

function IdeiasInner() {
  const { userProfile } = useAuth()
  const isMobile = useIsMobile()

  const [ideias, setIdeias] = useState<Ideia[]>([])
  const [grupos, setGrupos] = useState<GrupoIdeias[]>([])
  const [usuarios, setUsuarios] = useState<Record<string, Usuario>>({})
  const [tickets, setTickets] = useState<Record<string, ResumoTicket>>({})
  const [arquivadas, setArquivadas] = useState(false)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [migracaoFaltando, setMigracaoFaltando] = useState(false)

  const [selecao, setSelecao] = useState<Set<string>>(new Set())
  const [novoGrupo, setNovoGrupo] = useState(false)
  const [nomeNovoGrupo, setNomeNovoGrupo] = useState('')
  const [planejando, setPlanejando] = useState<GrupoComIdeias | null>(null)
  const [ticketAberto, setTicketAberto] = useState<string | null>(null)
  // melhorias 5.2/5.3
  const [votos, setVotos] = useState<Record<string, string[]> | null>(null)
  const [ia, setIa] = useState(false)
  const [parecido, setParecido] = useState<{ ideiaId: string; lista: { id: string; numero: number; titulo: string; comuns: string[] }[] } | null>(null)
  const [propostas, setPropostas] = useState<{ nome: string; ideias: string[] }[] | null>(null)
  const [sugerindo, setSugerindo] = useState(false)

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true)
    try {
      const j = await chamar<{ ideias: Ideia[]; grupos: GrupoIdeias[]; usuarios: Record<string, Usuario>; tickets: Record<string, ResumoTicket>; votos?: Record<string, string[]> | null; ia?: boolean; migracaoFaltando?: boolean; error?: string }>(
        `/api/dev/ideias${arquivadas ? '?arquivadas=1' : ''}`,
      )
      setIdeias(j.ideias || [])
      setGrupos(j.grupos || [])
      setUsuarios(j.usuarios || {})
      setTickets(j.tickets || {})
      setVotos(j.votos ?? null)
      setIa(!!j.ia)
      setMigracaoFaltando(!!j.migracaoFaltando)
      setErro(j.migracaoFaltando ? j.error || '' : '')
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao carregar')
    } finally {
      setCarregando(false)
    }
  }, [arquivadas])

  useEffect(() => { if (userProfile) carregar() }, [carregar, userProfile])
  useEffect(() => {
    const f = () => carregar(true)
    window.addEventListener('central-trabalho-mudou', f)
    window.addEventListener('focus', f)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', f) }
  }, [carregar])

  const nomes = useMemo(() => {
    const m: Record<string, string | undefined> = {}
    for (const u of Object.values(usuarios)) m[u.id] = u.nome
    return m
  }, [usuarios])

  const estagios = useMemo(() => {
    const e = separarPorEstagio(ideias, grupos)
    return { ...e, captadas: ordenarPorVotos(e.captadas, votos || {}) }
  }, [ideias, grupos, votos])
  const arquivadasLista = useMemo(() => ideias.filter((i) => i.arquivada), [ideias])

  // ---- ações (otimistas onde é barato; tudo termina em carregar(true)) ----
  const falhou = (e: unknown) => setErro(e instanceof Error ? e.message : 'Falha')

  const salvarIdeia = async (texto: string) => {
    const j = await chamar<{ ideia: Ideia }>('/api/dev/ideias', { method: 'POST', json: { texto } })
    setIdeias((l) => [j.ideia, ...l])
    setErro('')
    // Parece com um pedido aberto? (melhorias 5.3 — por palavras em comum, sem IA)
    chamar<{ parecidos: { id: string; numero: number; titulo: string; comuns: string[] }[] }>('/api/dev/ideias/acoes', { method: 'POST', json: { acao: 'parecidos', texto } })
      .then((p) => setParecido(p.parecidos.length ? { ideiaId: j.ideia.id, lista: p.parecidos } : null)).catch(() => {})
  }

  const votar = async (id: string) => {
    const eu = userProfile?.id
    if (!eu || !votos) return
    const antes = votos
    setVotos((v) => { const l = v?.[id] || []; return { ...(v || {}), [id]: l.includes(eu) ? l.filter((x) => x !== eu) : [...l, eu] } })
    try { const r = await chamar<{ votos: string[] }>('/api/dev/ideias/acoes', { method: 'POST', json: { acao: 'votar', ideia_id: id } }); setVotos((v) => ({ ...(v || {}), [id]: r.votos })) }
    catch (e) { setVotos(antes); falhou(e) }
  }

  const levarReuniao = async (id: string, levar: boolean) => {
    const antes = ideias
    setIdeias((l) => l.map((i) => (i.id === id ? { ...i, levar_reuniao: levar } : i)))
    try { await chamar('/api/dev/ideias', { method: 'PATCH', json: { id, levar_reuniao: levar } }) } catch (e) { setIdeias(antes); falhou(e) }
  }

  // "Vincular" ao pedido parecido: a ideia vira um grupo já ligado ao pedido (planejada).
  const vincular = async (ideiaId: string, t: { id: string; numero: number; titulo: string }) => {
    setParecido(null)
    try {
      const g = await chamar<{ grupo: GrupoIdeias }>('/api/dev/ideias/grupos', { method: 'POST', json: { nome: `#${t.numero} ${t.titulo}`.slice(0, 120), ideias: [ideiaId] } })
      await chamar('/api/dev/ideias/grupos', { method: 'PATCH', json: { id: g.grupo.id, ticket_id: t.id } })
      await carregar(true)
    } catch (e) { falhou(e) }
  }

  const sugerirGrupos = async () => {
    setSugerindo(true); setErro('')
    try { const r = await chamar<{ grupos: { nome: string; ideias: string[] }[] }>('/api/dev/ideias/acoes', { method: 'POST', json: { acao: 'sugerir_grupos' } }); setPropostas(r.grupos) }
    catch (e) { falhou(e) } finally { setSugerindo(false) }
  }
  const aceitarProposta = async (k: number) => {
    const p = propostas?.[k]
    if (!p) return
    try {
      const j = await chamar<{ grupo: GrupoIdeias }>('/api/dev/ideias/grupos', { method: 'POST', json: { nome: p.nome.trim() || 'Grupo', ideias: p.ideias } })
      setGrupos((g) => [j.grupo, ...g])
      setIdeias((l) => l.map((i) => (p.ideias.includes(i.id) ? { ...i, grupo_id: j.grupo.id } : i)))
      setPropostas((l) => l && l.filter((_, i) => i !== k))
    } catch (e) { falhou(e) }
  }

  const editarIdeia = async (id: string, texto: string) => {
    const antes = ideias
    setIdeias((l) => l.map((i) => (i.id === id ? { ...i, texto } : i)))
    try { await chamar('/api/dev/ideias', { method: 'PATCH', json: { id, texto } }) } catch (e) { setIdeias(antes); falhou(e) }
  }

  const arquivarIdeia = async (id: string) => {
    const antes = ideias
    setIdeias((l) => l.map((i) => (i.id === id ? { ...i, arquivada: true } : i)))
    setSelecao((s) => { const n = new Set(s); n.delete(id); return n })
    try { await chamar('/api/dev/ideias', { method: 'PATCH', json: { id, arquivada: true } }) } catch (e) { setIdeias(antes); falhou(e) }
  }

  const restaurarIdeia = async (id: string) => {
    try { await chamar('/api/dev/ideias', { method: 'PATCH', json: { id, arquivada: false } }); carregar(true) } catch (e) { falhou(e) }
  }

  const moverSelecao = async (grupoId: string | null, ids = [...selecao]) => {
    if (!ids.length) return
    const antes = ideias
    setIdeias((l) => l.map((i) => (ids.includes(i.id) ? { ...i, grupo_id: grupoId } : i)))
    setSelecao(new Set())
    try { await chamar('/api/dev/ideias', { method: 'PATCH', json: { ids, grupo_id: grupoId } }); carregar(true) } catch (e) { setIdeias(antes); falhou(e) }
  }

  const criarGrupo = async () => {
    const nome = nomeNovoGrupo.trim()
    if (!nome) return
    try {
      const j = await chamar<{ grupo: GrupoIdeias }>('/api/dev/ideias/grupos', { method: 'POST', json: { nome, ideias: [...selecao] } })
      setGrupos((g) => [j.grupo, ...g])
      const ids = [...selecao]
      setIdeias((l) => l.map((i) => (ids.includes(i.id) ? { ...i, grupo_id: j.grupo.id } : i)))
      setSelecao(new Set())
      setNovoGrupo(false)
      setNomeNovoGrupo('')
      setErro('')
    } catch (e) { falhou(e) }
  }

  const renomearGrupo = async (id: string, nome: string) => {
    const antes = grupos
    setGrupos((g) => g.map((x) => (x.id === id ? { ...x, nome } : x)))
    try { await chamar('/api/dev/ideias/grupos', { method: 'PATCH', json: { id, nome } }) } catch (e) { setGrupos(antes); falhou(e) }
  }

  const corGrupo = async (id: string, cor: string | null) => {
    const antes = grupos
    setGrupos((g) => g.map((x) => (x.id === id ? { ...x, cor } : x)))
    try { await chamar('/api/dev/ideias/grupos', { method: 'PATCH', json: { id, cor } }) } catch (e) { setGrupos(antes); falhou(e) }
  }

  const desfazerGrupo = async (id: string) => {
    const g = grupos.find((x) => x.id === id)
    if (!window.confirm(`Desfazer o grupo "${g?.nome || ''}"? As ideias voltam para Captadas.`)) return
    try { await chamar(`/api/dev/ideias/grupos?id=${id}`, { method: 'DELETE' }); carregar(true) } catch (e) { falhou(e) }
  }

  // 3º passo: o FormTicket devolve o id → grava no grupo → vira "planejado".
  const ticketCriado = async (ticketId: string) => {
    const g = planejando
    setPlanejando(null)
    if (!g) return
    try {
      await chamar('/api/dev/ideias/grupos', { method: 'PATCH', json: { id: g.grupo.id, ticket_id: ticketId } })
    } catch (e) { falhou(e) }
    window.dispatchEvent(new Event('central-trabalho-mudou'))
    await carregar(true)
    setTicketAberto(ticketId)
  }

  // ---- visual ----
  const titulo = (icone: React.ReactNode, texto: string, n: number, cor: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ width: 26, height: 26, borderRadius: 8, background: cor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{icone}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: 'var(--portal-text,#111)' }}>{texto}</span>
      <span style={{ fontSize: 12, fontWeight: 800, padding: '1px 8px', borderRadius: 999, background: 'var(--portal-bg,#f1f1f1)', color: 'var(--portal-text-muted,#777)' }}>{n}</span>
    </div>
  )
  const vazio = (texto: string) => (
    <div style={{ padding: '26px 14px', textAlign: 'center', borderRadius: 12, border: '1px dashed var(--portal-border,#ddd)', color: 'var(--portal-text-muted,#999)', fontSize: 12.5 }}>{texto}</div>
  )
  const gruposAbertos = estagios.agrupadas
  const nSel = selecao.size

  return (
    <div style={{ padding: isMobile ? '14px 12px' : '18px 20px', maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#888)', flex: 1, minWidth: 220 }}>
          Bloco de notas dos devs: anote rápido, agrupe o que combina e, quando fizer sentido, transforme o grupo num ticket.
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--portal-text-muted,#888)', cursor: 'pointer' }}>
          <input type="checkbox" checked={arquivadas} onChange={(e) => setArquivadas(e.target.checked)} /> Mostrar arquivadas
        </label>
        <button onClick={() => carregar()} title="Atualizar"
          style={{ display: 'flex', alignItems: 'center', padding: 7, borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>
          <RefreshCw size={14} />
        </button>
      </div>

      <CapturaIdeia onSalvar={salvarIdeia} focarAoAbrir={!migracaoFaltando} />
      {parecido && parecido.lista.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10, padding: '10px 14px', borderRadius: 12, background: 'rgba(37,99,235,.07)', border: '1px solid rgba(37,99,235,.25)', fontSize: 13.5 }}>
          <Link2 size={15} color="#2563eb" />
          <span style={{ flex: 1, minWidth: 200 }}>Parece com o <button onClick={() => setTicketAberto(t.id)} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', color: '#2563eb', font: 'inherit', textDecoration: 'underline' }}>#{t.numero} {t.titulo}</button> <span style={{ color: 'var(--portal-text-muted,#64748b)' }}>({t.comuns.join(', ')})</span>. Vincular?</span>
          <button onClick={() => vincular(parecido.ideiaId, t)} style={{ padding: '6px 12px', borderRadius: 8, border: 'none', background: '#2563eb', color: '#fefefe', fontSize: 12.5, cursor: 'pointer' }}>Vincular</button>
          <button onClick={() => setParecido(null)} style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', fontSize: 12.5, cursor: 'pointer', color: 'var(--portal-text-muted,#64748b)' }}>Não é isso</button>
        </div>
      ))}

      {erro && (
        <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(220,38,38,.08)', color: '#dc2626', fontSize: 13, fontWeight: 600 }}>
          {erro}
        </div>
      )}

      {carregando ? (
        <div style={{ padding: 50, textAlign: 'center', color: 'var(--portal-text-muted,#888)', fontSize: 14 }}>Carregando ideias...</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap: 16, marginTop: 18, alignItems: 'start' }}>
          {/* 1 · Captadas */}
          <section>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ flex: 1 }}>{titulo(<Lightbulb size={14} />, 'Captadas', estagios.captadas.length, '#111')}</span>
              {ia && estagios.captadas.length >= 3 && (
                <button onClick={sugerirGrupos} disabled={sugerindo} title="A IA propõe grupos; você aceita ou muda o nome"
                  style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 10, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--portal-border,#e5e7eb)', background: 'var(--portal-surface,#fff)', fontSize: 12, cursor: 'pointer', color: '#7c3aed' }}>
                  <Sparkles size={13} /> {sugerindo ? 'Pensando…' : 'Sugerir grupos'}
                </button>
              )}
            </div>
            {propostas && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, marginBottom: 10, borderRadius: 12, border: '1px solid rgba(124,58,237,.3)', background: 'rgba(124,58,237,.05)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                  <Sparkles size={13} color="#7c3aed" /> <span style={{ flex: 1 }}>{propostas.length ? 'Grupos sugeridos — mude o nome se quiser e aceite:' : 'A IA não achou ideias parecidas o bastante para agrupar.'}</span>
                  <button onClick={() => setPropostas(null)} aria-label="Fechar sugestões" style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'inherit', display: 'flex' }}><X size={14} /></button>
                </div>
                {propostas.map((p, k) => (
                  <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: 8, borderRadius: 10, background: 'var(--portal-surface,#fff)', border: '1px solid var(--portal-border,#e5e7eb)' }}>
                    <input value={p.nome} maxLength={120} aria-label="Nome do grupo" onChange={(e) => setPropostas((l) => l && l.map((x, i) => (i === k ? { ...x, nome: e.target.value } : x)))}
                      style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', fontSize: 13, background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)' }} />
                    {p.ideias.map((id) => <span key={id} style={{ fontSize: 12, color: 'var(--portal-text-muted,#666)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>· {ideias.find((i) => i.id === id)?.texto || ''}</span>)}
                    <span style={{ display: 'flex', gap: 6 }}>
                      <button onClick={() => aceitarProposta(k)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#111', color: '#fff', fontSize: 12, cursor: 'pointer' }}>Aceitar</button>
                      <button onClick={() => setPropostas((l) => l && l.filter((_, i) => i !== k))} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>Descartar</button>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {nSel > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: '8px 10px', marginBottom: 8, borderRadius: 10, background: 'rgba(17,17,17,.06)', border: '1px solid var(--portal-border,#e5e7eb)', fontSize: 12.5 }}>
                <b>{nSel} selecionada{nSel > 1 ? 's' : ''}</b>
                {novoGrupo ? (
                  <>
                    <input autoFocus value={nomeNovoGrupo} onChange={(e) => setNomeNovoGrupo(e.target.value)} placeholder="Nome do grupo"
                      onKeyDown={(e) => { if (e.key === 'Enter') criarGrupo(); if (e.key === 'Escape') setNovoGrupo(false) }}
                      maxLength={120}
                      style={{ flex: '1 1 140px', padding: '5px 8px', borderRadius: 6, border: '1px solid #111', fontSize: 12.5, background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', outline: 'none' }} />
                    <button onClick={criarGrupo} disabled={!nomeNovoGrupo.trim()}
                      style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', opacity: nomeNovoGrupo.trim() ? 1 : .4 }}>
                      Criar
                    </button>
                    <button onClick={() => setNovoGrupo(false)} style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>cancelar</button>
                  </>
                ) : (
                  <>
                    <button onClick={() => setNovoGrupo(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 6, border: 'none', background: '#111', color: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                      <FolderPlus size={13} /> Agrupar
                    </button>
                    {gruposAbertos.length > 0 && (
                      <select value="" onChange={(e) => { if (e.target.value) moverSelecao(e.target.value) }}
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--portal-border,#e5e7eb)', fontSize: 12, background: 'var(--portal-surface,#fff)', color: 'var(--portal-text,#111)', cursor: 'pointer' }}>
                        <option value="">Mover para grupo…</option>
                        {gruposAbertos.map((g) => <option key={g.grupo.id} value={g.grupo.id}>{g.grupo.nome}</option>)}
                      </select>
                    )}
                    <button onClick={() => setSelecao(new Set())} style={{ marginLeft: 'auto', border: 'none', background: 'transparent', fontSize: 12, cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>limpar</button>
                  </>
                )}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {estagios.captadas.length === 0 && vazio(migracaoFaltando ? 'Ative as ideias no banco (sql/dev-ideias.sql) para começar.' : 'Nenhuma ideia solta. Escreva uma ali em cima.')}
              {estagios.captadas.map((i) => (
                <CardIdeia key={i.id} ideia={i} autor={nomes[i.autor_id]}
                  selecionada={selecao.has(i.id)}
                  onSelecionar={(id, m) => setSelecao((s) => { const n = new Set(s); if (m) n.add(id); else n.delete(id); return n })}
                  onEditar={editarIdeia} onArquivar={arquivarIdeia}
                  votos={votos ? votos[i.id] || [] : null} meuId={userProfile?.id} onVotar={votar} onLevarReuniao={levarReuniao} />
              ))}
              {arquivadas && arquivadasLista.length > 0 && (
                <details style={{ marginTop: 6 }}>
                  <summary style={{ cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text-muted,#888)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Archive size={13} /> Arquivadas ({arquivadasLista.length})
                  </summary>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                    {arquivadasLista.map((i) => (
                      <div key={i.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0 }}><CardIdeia ideia={i} autor={nomes[i.autor_id]} apagada onEditar={editarIdeia} /></div>
                        <button onClick={() => restaurarIdeia(i.id)} title="Restaurar" style={{ border: '1px solid var(--portal-border,#e5e7eb)', background: 'transparent', borderRadius: 6, padding: '4px 8px', fontSize: 11.5, cursor: 'pointer', color: 'var(--portal-text-muted,#888)' }}>restaurar</button>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          </section>

          {/* 2 · Agrupadas */}
          <section>
            {titulo(<FolderOpen size={14} />, 'Agrupadas', estagios.agrupadas.length, '#d97706')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {estagios.agrupadas.length === 0 && vazio('Selecione ideias em Captadas e clique em "Agrupar".')}
              {estagios.agrupadas.map((item) => (
                <CardGrupo key={item.grupo.id} item={item} nomes={nomes}
                  onRenomear={renomearGrupo} onCor={corGrupo} onEditarIdeia={editarIdeia}
                  onTirarDoGrupo={(id) => moverSelecao(null, [id])} onArquivarIdeia={arquivarIdeia}
                  onDesfazer={desfazerGrupo} onPlanejar={setPlanejando} />
              ))}
            </div>
          </section>

          {/* 3 · Planejadas */}
          <section>
            {titulo(<Rocket size={14} />, 'Planejadas', estagios.planejadas.length, '#16a34a')}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {estagios.planejadas.length === 0 && vazio('Quando um grupo virar ticket, ele aparece aqui com o número e a fase.')}
              {estagios.planejadas.map((item) => (
                <CardGrupo key={item.grupo.id} item={item} nomes={nomes} ticket={item.grupo.ticket_id ? tickets[item.grupo.ticket_id] : undefined}
                  onRenomear={renomearGrupo} onCor={corGrupo} onEditarIdeia={editarIdeia}
                  onTirarDoGrupo={() => {}} onArquivarIdeia={() => {}}
                  onAbrirTicket={setTicketAberto} />
              ))}
            </div>
          </section>
        </div>
      )}

      {!isMobile && !carregando && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 16, fontSize: 12, color: 'var(--portal-text-muted,#aaa)' }}>
          Captar <ArrowRight size={12} /> Agrupar <ArrowRight size={12} /> Planejar (vira ticket)
        </div>
      )}

      {planejando && (
        <FormTicket
          tituloInicial={tituloDoGrupo(planejando.grupo)}
          descricaoInicial={descricaoDoGrupo(planejando.grupo, planejando.ideias, nomes)}
          onFechar={() => setPlanejando(null)}
          onCriado={ticketCriado} />
      )}
      {ticketAberto && (
        <TicketModal id={ticketAberto} onFechar={() => setTicketAberto(null)} onMudou={() => carregar(true)} />
      )}
    </div>
  )
}

export default function IdeiasPage() {
  return (
    <Suspense fallback={<div style={{ padding: 40, textAlign: 'center', color: '#888' }}>Carregando...</div>}>
      <IdeiasInner />
    </Suspense>
  )
}
