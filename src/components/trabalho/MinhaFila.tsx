'use client'
// MINHA FILA (24/11/2026) — 1ª aba da Central. Uma área só para o objetivo do dia e da semana:
//   Chegou pra você (pedidos para aceitar, aqui mesmo, sem escolher quadro)
//   Hoje · Esta semana · Depois  (a ORDEM da fila, a mesma conta da Fila/lembrete)
// e a aba Equipe: a carga de cada pessoa, com filtro por setor, e o botão "Pedir".
// Pedir para alguém é sempre o mesmo formulário (FormTicket), que mostra a carga da pessoa.
import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { Check, CalendarClock, CircleX, Send, ListOrdered, Users, Sun, CalendarRange, Inbox, Repeat, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import SeloAtrasado, { SeloUrgente } from '@/components/tickets/SeloAtrasado'
import type { ResumoFila, ItemResumo } from '@/lib/trabalho/fila-server'
import type { Carga } from './CargaDaPessoa'

const FormTicket = dynamic(() => import('@/components/tickets/FormTicket'), { ssr: false })
const TicketModal = dynamic(() => import('@/components/tickets/TicketModal'), { ssr: false })

interface Pendente { id: string; numero: number; titulo: string; prazo: string | null; solicitante_nome: string }
interface ItemDia { tipo: string; texto: string; detalhe?: string; link?: string }
interface Hoje { ativo: boolean; pendentes: Pendente[]; itens: ItemDia[]; fila: ResumoFila | null }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

const CSS = `
.mf{padding:18px 20px 40px;max-width:1100px;margin:0 auto;color:var(--portal-text,#0f172a)}
.mf-topo{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.mf-abas{display:flex;border:1px solid var(--portal-border,#e2e8f0);border-radius:11px;overflow:hidden}
.mf-abas button{display:inline-flex;align-items:center;gap:7px;padding:9px 15px;border:none;background:var(--portal-surface,#fff);color:var(--portal-text-secondary,#475569);font-size:14px;font-weight:600;cursor:pointer}
.mf-abas button.on{background:#0f172a;color:#fff}
.mf-btn{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 14px;border-radius:10px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fff);color:var(--portal-text,#0f172a);font-size:13.5px;font-weight:600;cursor:pointer;text-decoration:none;white-space:nowrap}
.mf-btn.cheio{border:none;background:#dc2626;color:#fff}
.mf-btn.peq{height:32px;padding:0 11px;font-size:13px}
.mf-btn:disabled{opacity:.5;cursor:default}
.mf-resumo{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px}
.mf-num{flex:1 1 140px;padding:12px 14px;border-radius:12px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fff)}
.mf-num b{display:block;font-size:24px;font-weight:700;line-height:1.1}
.mf-num span{font-size:12.5px;color:var(--portal-text-muted,#64748b)}
.mf-sec{margin-bottom:20px}
.mf-sec h2{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:16px;font-weight:700}
.mf-sec h2 small{font-size:13px;font-weight:500;color:var(--portal-text-muted,#64748b)}
.mf-lin{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;margin-bottom:6px;border-radius:11px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fff)}
.mf-lin .n{width:26px;font-weight:800;color:var(--portal-text-muted,#94a3b8);font-variant-numeric:tabular-nums}
.mf-lin .t{flex:1 1 260px;min-width:0;border:none;background:transparent;padding:0;text-align:left;cursor:pointer;color:inherit;font:inherit;font-size:14.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mf-lin .m{font-size:12.5px;color:var(--portal-text-muted,#64748b);white-space:nowrap}
.mf-lin.reuniao{border-left:4px solid #4f46e5}
.mf-chegou{border-left:4px solid #2563eb}
.mf-vazio{padding:14px;border-radius:11px;border:1px dashed var(--portal-border,#e2e8f0);font-size:13.5px;color:var(--portal-text-muted,#64748b)}
.mf-est{padding:1px 8px;border-radius:999px;font-size:11px;font-weight:700;background:rgba(234,179,8,.18);color:#a16207;border:1px solid rgba(234,179,8,.45)}
.mf-chips{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px}
.mf-chip{padding:6px 12px;border-radius:999px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fff);font-size:13px;font-weight:600;cursor:pointer;color:var(--portal-text-secondary,#475569)}
.mf-chip.on{background:#0f172a;border-color:#0f172a;color:#fff}
.mf-pes{display:grid;grid-template-columns:minmax(150px,220px) 1fr auto;gap:12px;align-items:center;padding:10px 12px;margin-bottom:6px;border-radius:11px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fff)}
.mf-barra{height:10px;border-radius:999px;background:var(--portal-bg-secondary,#f1f5f9);overflow:hidden}
.mf-barra i{display:block;height:100%;border-radius:999px;background:#2563eb}
@media (max-width:700px){.mf{padding:14px 12px 30px}.mf-pes{grid-template-columns:1fr}}
`

export default function MinhaFila() {
  const { userProfile } = useAuth()
  // Fila completa (arrastar para mudar a ordem, dias × h/dia) continua no Cronograma.
  const linkFila = userProfile?.id ? `/cronograma?fila=${userProfile.id}` : '/cronograma'
  const [aba, setAba] = useState<'minha' | 'equipe'>('minha')
  const [h, setH] = useState<Hoje | null>(null)
  const [equipe, setEquipe] = useState<{ eu: string; pessoas: Carga[] } | null>(null)
  const [setor, setSetor] = useState('Todos')
  const [erro, setErro] = useState('')
  const [pedirPara, setPedirPara] = useState<string | null | false>(false) // null = escolher a pessoa
  const [aberto, setAberto] = useState<string | null>(null)
  // decisão em andamento num pedido que chegou
  const [decidindo, setDecidindo] = useState<{ id: string; modo: 'data' | 'recusar'; valor: string } | null>(null)
  const [salvando, setSalvando] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    try {
      const r = await fetch('/api/trabalho/hoje', { headers: await authHeaders(), cache: 'no-store' })
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Falha ao carregar a fila'); return }
      setH(j); setErro('')
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

  const setores = useMemo(() => ['Todos', ...[...new Set((equipe?.pessoas || []).map((p) => p.setor))].sort()], [equipe])
  const pessoasF = (equipe?.pessoas || []).filter((p) => setor === 'Todos' || p.setor === setor)
    .sort((a, b) => b.horas - a.horas || a.nome.localeCompare(b.nome))
  const maxHoras = Math.max(1, ...pessoasF.map((p) => p.horas))

  const f = h?.fila
  const reunioes = (h?.itens || []).filter((i) => i.tipo === 'reuniao')
  const hoje = hojeISO()

  // Mudar a ordem aqui mesmo (24/11/2026): ↑↓ troca com o vizinho visível e grava a fila
  // inteira (o PUT precisa da lista toda). Urgente fica sempre no topo, então não mexe.
  const visiveis = f ? [...f.hoje, ...f.semana] : []
  const [movendo, setMovendo] = useState(false)
  const mover = async (id: string, dir: -1 | 1) => {
    if (!f || movendo) return
    const k = visiveis.findIndex((x) => x.id === id)
    const viz = visiveis[k + dir]
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
  const seta: React.CSSProperties = { border: 'none', background: 'transparent', padding: 2, cursor: 'pointer', color: 'var(--portal-text-muted,#94a3b8)', display: 'flex' }

  const linha = (i: ItemResumo, n: number, quando: string) => (
    <div key={i.id} className="mf-lin">
      {!i.urgente && (
        <span style={{ display: 'flex', flexDirection: 'column' }}>
          <button style={{ ...seta, opacity: n === 1 || movendo ? .3 : 1 }} disabled={n === 1 || movendo} onClick={() => mover(i.id, -1)} aria-label={`Subir #${i.numero}`} title="Subir na fila"><ChevronUp size={15} /></button>
          <button style={{ ...seta, opacity: n === visiveis.length || movendo ? .3 : 1 }} disabled={n === visiveis.length || movendo} onClick={() => mover(i.id, 1)} aria-label={`Descer #${i.numero}`} title="Descer na fila"><ChevronDown size={15} /></button>
        </span>
      )}
      <span className="n">{n}.</span>
      <button className="t" onClick={() => setAberto(i.id)} title={`#${i.numero} ${i.titulo}`}>#{i.numero} {i.titulo}</button>
      {i.urgente && <SeloUrgente />}
      {i.atrasado && i.prazo && <SeloAtrasado>desde {br(i.prazo)}</SeloAtrasado>}
      {i.semEstimativa && <span className="mf-est" title="Ninguém estimou as horas. Ajuste em Mudar a ordem.">estimar</span>}
      <span className="m">{nf(i.horas)} h · {quando}</span>
    </div>
  )

  return (
    <div className="mf">
      <style>{CSS}</style>
      <div className="mf-topo">
        <div className="mf-abas" role="tablist">
          <button role="tab" aria-selected={aba === 'minha'} className={aba === 'minha' ? 'on' : ''} onClick={() => setAba('minha')}><ListOrdered size={16} /> Minha fila</button>
          <button role="tab" aria-selected={aba === 'equipe'} className={aba === 'equipe' ? 'on' : ''} onClick={() => setAba('equipe')}><Users size={16} /> Equipe</button>
        </div>
        <span style={{ flex: 1 }} />
        {aba === 'minha' && <a className="mf-btn" href={linkFila}><ArrowUpDown size={15} /> Mudar a ordem</a>}
        <button className="mf-btn cheio" onClick={() => setPedirPara(null)}><Send size={15} /> Pedir para alguém</button>
      </div>

      {erro && <div className="mf-vazio" style={{ color: '#b91c1c', marginBottom: 12 }}>{erro}</div>}

      {aba === 'minha' && (!h ? <div className="mf-vazio">Carregando sua fila…</div> : !h.ativo ? <div className="mf-vazio">A Central de Trabalho não está liberada para você.</div> : (
        <>
          {f && (
            <div className="mf-resumo">
              <div className="mf-num"><b>{f.hoje.length}</b><span>para hoje · cabe 4,5 h</span></div>
              <div className="mf-num"><b>{f.semana.length}</b><span>no resto da semana</span></div>
              <div className="mf-num"><b style={{ color: f.atrasados ? 'var(--cor-atrasado-texto)' : undefined }}>{f.atrasados}</b><span>atrasados</span></div>
              <div className="mf-num"><b>{f.livreEm ? br(f.livreEm) : '—'}</b><span>fila ocupada até ({f.total} itens)</span></div>
            </div>
          )}

          {h.pendentes.length > 0 && (
            <section className="mf-sec">
              <h2><Inbox size={17} color="#2563eb" /> Chegou pra você <small>aceite para entrar na fila</small></h2>
              {h.pendentes.map((p) => {
                const d = decidindo?.id === p.id ? decidindo : null
                return (
                  <div key={p.id} className="mf-lin mf-chegou">
                    <button className="t" onClick={() => setAberto(p.id)}>#{p.numero} {p.titulo}</button>
                    <span className="m">de {p.solicitante_nome} · {p.prazo ? `até ${br(p.prazo)}` : 'sem data'}</span>
                    {!d ? (
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="mf-btn peq" style={{ background: '#059669', color: '#fff', border: 'none' }} disabled={salvando === p.id} onClick={() => decidir(p.id, { decisao: 'confirmar' })}><Check size={14} /> Aceitar</button>
                        <button className="mf-btn peq" onClick={() => setDecidindo({ id: p.id, modo: 'data', valor: '' })}><CalendarClock size={14} /> Outra data</button>
                        <button className="mf-btn peq" onClick={() => setDecidindo({ id: p.id, modo: 'recusar', valor: '' })}><CircleX size={14} /> Recusar</button>
                      </span>
                    ) : (
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: '1 1 100%' }}>
                        {d.modo === 'data'
                          ? <input type="date" min={hoje} value={d.valor} onChange={(e) => setDecidindo({ ...d, valor: e.target.value })} aria-label="Consigo fazer até" className="mf-btn peq" />
                          : <input value={d.valor} onChange={(e) => setDecidindo({ ...d, valor: e.target.value })} placeholder="Por que não consegue? (vai para quem pediu)" aria-label="Motivo" className="mf-btn peq" style={{ flex: '1 1 260px', fontWeight: 400 }} autoFocus />}
                        <button className="mf-btn peq" style={{ background: d.modo === 'data' ? '#059669' : '#b91c1c', color: '#fff', border: 'none' }} disabled={!d.valor.trim() || salvando === p.id}
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
          )}

          <section className="mf-sec">
            <h2><Sun size={17} color="#d97706" /> Hoje <small>objetivo do dia, na ordem da fila</small></h2>
            {reunioes.map((r, k) => (
              <div key={`r${k}`} className="mf-lin reuniao">
                <span className="n"><Users size={15} /></span>
                {r.link ? <Link className="t" href={r.link}>{r.texto}</Link> : <span className="t">{r.texto}</span>}
                {r.detalhe && <span className="m">{r.detalhe}</span>}
              </div>
            ))}
            {f && f.hoje.length === 0 && reunioes.length === 0 && <div className="mf-vazio">Nada na fila para hoje.</div>}
            {f?.hoje.map((i, n) => linha(i, n + 1, i.fim > hoje ? `até ${br(i.fim)}` : 'termina hoje'))}
          </section>

          <section className="mf-sec">
            <h2><CalendarRange size={17} color="#2563eb" /> Esta semana <small>objetivo da semana</small></h2>
            {f && f.semana.length === 0 && <div className="mf-vazio">Nada mais previsto até sexta.</div>}
            {f?.semana.map((i, n) => linha(i, (f.hoje.length) + n + 1, `começa ${br(i.inicio)}`))}
          </section>

          {f && (f.depois > 0 || f.continuos > 0) && (
            <section className="mf-sec">
              <h2><ListOrdered size={17} color="#64748b" /> Depois</h2>
              <div className="mf-vazio" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                {f.depois > 0 && <span>+ {f.depois} {f.depois === 1 ? 'item' : 'itens'} depois desta semana.</span>}
                {f.continuos > 0 && <span><Repeat size={13} style={{ verticalAlign: -2 }} /> {f.continuos} contínuo{f.continuos > 1 ? 's' : ''} na rotina (1,5 h/dia).</span>}
                <a className="mf-btn peq" href={linkFila}>Ver a fila completa</a>
              </div>
            </section>
          )}
        </>
      ))}

      {aba === 'equipe' && (
        <section className="mf-sec">
          <div className="mf-chips" role="group" aria-label="Filtrar por setor">
            {setores.map((s) => <button key={s} className={`mf-chip${s === setor ? ' on' : ''}`} aria-pressed={s === setor} onClick={() => setSetor(s)}>{s}</button>)}
          </div>
          {!equipe ? <div className="mf-vazio">Carregando a equipe…</div> : pessoasF.length === 0 ? <div className="mf-vazio">Ninguém neste setor.</div> : pessoasF.map((p) => (
            <div key={p.id} className="mf-pes">
              <span style={{ minWidth: 0 }}>
                <b style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}{p.id === equipe.eu ? ' (você)' : ''}</b>
                <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>{p.setor}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
                <span className="mf-barra" title={`${p.horas} h na fila`}><i style={{ width: `${Math.max(p.horas ? 4 : 0, (p.horas / maxHoras) * 100)}%` }} /></span>
                <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>
                  {p.itens === 0 ? 'fila vazia' : <>{p.itens} {p.itens === 1 ? 'item' : 'itens'} · {p.horas} h{p.livreEm && <> · ocupada até <b>{br(p.livreEm)}</b></>}</>}
                  {p.atrasados > 0 && <> · <span style={{ color: 'var(--cor-atrasado-texto)', fontWeight: 700 }}>⏰ {p.atrasados} atrasado{p.atrasados > 1 ? 's' : ''}</span></>}
                  {p.aceitar > 0 && <> · {p.aceitar} esperando resposta</>}
                </span>
              </span>
              {p.id !== equipe.eu && <button className="mf-btn peq" onClick={() => setPedirPara(p.id)}><Send size={14} /> Pedir</button>}
            </div>
          ))}
        </section>
      )}

      {pedirPara !== false && (
        <FormTicket responsavelInicial={pedirPara || undefined} onFechar={() => setPedirPara(false)}
          onCriado={() => { setPedirPara(false); window.dispatchEvent(new Event('central-trabalho-mudou')) }} />
      )}
      {aberto && <TicketModal id={aberto} onFechar={() => setAberto(null)} onMudou={() => carregar()} />}
    </div>
  )
}
