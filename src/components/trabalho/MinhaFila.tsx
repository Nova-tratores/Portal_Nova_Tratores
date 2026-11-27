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
import {
  Check, CalendarClock, CircleX, Send, ListOrdered, Users, Sun, CalendarRange, Inbox, Repeat, ChevronUp, ChevronDown,
  AlarmClock, HelpCircle, Clock3, Layers, GripVertical, BellRing,
} from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import { STATUS_INFO, type TicketStatus } from '@/lib/tickets/constantes'
import SeloAtrasado, { SeloUrgente, SeloImpossivel } from '@/components/tickets/SeloAtrasado'
import type { ResumoFila, ItemResumo } from '@/lib/trabalho/fila-server'
import type { Carga } from './CargaDaPessoa'
import { ESTILO_FILA, COR } from './estiloFila'
import { TAMANHOS, tamanhoDe, planoDeHoras } from '@/lib/trabalho/estimativa'
import EstimarTempo from './EstimarTempo'
import ModoAgora, { type Agora } from './ModoAgora'
import PlanoSemana from './PlanoSemana'
import EquipeLista from './EquipeLista'

const FormTicket = dynamic(() => import('@/components/tickets/FormTicket'), { ssr: false })
const TicketModal = dynamic(() => import('@/components/tickets/TicketModal'), { ssr: false })

interface Pendente { id: string; numero: number; titulo: string; prazo: string | null; solicitante_nome: string }
interface ItemDia { tipo: string; texto: string; detalhe?: string; link?: string }
interface Negociacao { id: string; numero: number; titulo: string; prazo: string; comeca: string; termina: string; com: string; prioridade: string | null }
interface Prioridade { id: string; numero: number; titulo: string; por: string; motivo: string | null }
interface Hoje { ativo: boolean; pendentes: Pendente[]; itens: ItemDia[]; fila: ResumoFila | null; fator?: { fator: number; n: number } | null; negociar?: Negociacao[]; prioridades?: Prioridade[] }
/** Dias de atraso de um item (0 = em dia). Acima de 30 vai para "Parados — decidir" (melhorias 2.4). */
const diasDeAtraso = (i: { atrasado: boolean; prazo: string | null }, hoje: string) => (i.atrasado && i.prazo ? Math.max(1, Math.round((Date.parse(hoje) - Date.parse(i.prazo)) / 86400000)) : 0)
const MES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
/** Dia útil seguinte, "05/dez". */
const livreAPartir = (iso: string) => { const d = new Date(iso + 'T12:00:00Z'); do { d.setUTCDate(d.getUTCDate() + 1) } while ([0, 6].includes(d.getUTCDay())); return `${String(d.getUTCDate()).padStart(2, '0')}/${MES[d.getUTCMonth()]}` }
interface Pedido { id: string; numero: number; titulo: string; prazo: string | null; status: string; responsavel_id: string; aceite?: string | null; created_at?: string }
/** Pedido que fiz e ainda não foi aceito há mais de 1 dia: o cartão pulsa (José, 26/11/2026). */
const HORAS_PARA_PULSAR = 24
interface Central { pedidos: Pedido[]; usuarios: Record<string, { id: string; nome: string }> }

const br = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const primeiro = (n: string) => n.split(' ')[0]
const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()


type Filtro = 'tudo' | 'atrasados' | 'parados'

/** Desenho da tela (página de teste /fila/teste): lista = tudo em listas · foco = "Agora" grande +
 *  próximos · plano = "Agora" + o plano da semana desenhado. Dados e ações são os mesmos. */
export type LayoutFila = 'lista' | 'foco' | 'plano'

/** abaFixa: a aba já vem da barra da Central (/fila = minha, /fila/equipe = equipe) e o seletor
 *  interno some — melhorias 1.4, uma navegação só. Sem abaFixa (página de teste), o seletor aparece. */
export default function MinhaFila({ layout = 'lista', abaFixa }: { layout?: LayoutFila; abaFixa?: 'minha' | 'equipe' | 'esperando' } = {}) {
  const { userProfile } = useAuth()
  const [abaEscolhida, setAba] = useState<'minha' | 'equipe' | 'esperando'>('minha')
  const aba = abaFixa || abaEscolhida
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
  // Faxina dos parados (melhorias 1.2): quantos pedidos meus estão parados/vencidos.
  const [parados, setParados] = useState(0)
  // Chip de tempo clicado: some da linha na hora (grava por trás).
  const [tempoSalvo, setTempoSalvo] = useState<Set<string>>(new Set())
  const salvarTempo = async (id: string, horas: number) => {
    setTempoSalvo((s) => new Set(s).add(id)); setErro('')
    const { dias, horasDia } = planoDeHoras(horas, 4.5)
    try {
      const r = await fetch(`/api/tickets/${id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'editar', dias, horas_dia: horasDia }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || 'Não deu para gravar o tempo'); setTempoSalvo((s) => { const n = new Set(s); n.delete(id); return n }) }
      await carregar()
    } catch { setErro('Falha de conexão') }
  }
  const [agora, setAgora] = useState<Agora | null>(null)
  // Cutucar (melhorias 3.2): 1 vez por dia em cada pedido; o servidor valida e diz "próxima às…".
  const [cutucadas, setCutucadas] = useState<Record<string, { enviando?: boolean; ok?: boolean; erro?: string }>>({})
  const cutucar = async (id: string) => {
    setCutucadas((c) => ({ ...c, [id]: { enviando: true } }))
    try {
      const r = await fetch(`/api/tickets/${id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'pedir_atualizacao', cutucada: true }) })
      const j = await r.json().catch(() => ({}))
      setCutucadas((c) => ({ ...c, [id]: r.ok ? { ok: true } : { erro: j.error || 'Não deu certo' } }))
    } catch { setCutucadas((c) => ({ ...c, [id]: { erro: 'Falha de conexão' } })) }
  }
  // Estimar o tempo de um item (ou aceitar um pedido já dizendo quanto leva).
  const [estimando, setEstimando] = useState<{ id: string; titulo: string; aceitar?: boolean } | null>(null)
  const [verTudo, setVerTudo] = useState(false)

  const carregar = useCallback(async () => {
    try {
      const hd = await authHeaders()
      const [r, rc, ra, rf] = await Promise.all([
        fetch('/api/trabalho/hoje', { headers: hd, cache: 'no-store' }),
        fetch('/api/trabalho/central?so=pedidos', { headers: hd, cache: 'no-store' }),
        fetch('/api/trabalho/agora', { headers: hd, cache: 'no-store' }),
        fetch('/api/trabalho/faxina?contar=1', { headers: hd, cache: 'no-store' }),
      ])
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Falha ao carregar a fila'); return }
      setH(j); setErro('')
      if (rc.ok) setCentral(await rc.json())
      if (ra.ok) setAgora(await ra.json())
      if (rf.ok) setParados(((await rf.json()) as { n?: number }).n || 0)
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
    // Foco recarrega no máximo a cada 1 min (cada volta para a janela disparava as consultas de novo).
    let ultima = Date.now()
    const foco = () => { if (Date.now() - ultima > 60_000) { ultima = Date.now(); f() } }
    window.addEventListener('central-trabalho-mudou', f); window.addEventListener('focus', foco)
    return () => { window.removeEventListener('central-trabalho-mudou', f); window.removeEventListener('focus', foco) }
  }, [carregar, carregarEquipe, equipe])

  // Ação num pedido pela rota de sempre (/api/tickets/[id]/acoes) e recarrega (prazo impossível, prioridade).
  const acaoPedido = async (id: string, corpo: Record<string, unknown>) => {
    setSalvando(id); setErro('')
    try {
      const r = await fetch(`/api/tickets/${id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErro(j.error || 'Não deu certo'); return }
      window.dispatchEvent(new Event('central-trabalho-mudou'))
      await carregar()
    } catch { setErro('Falha de conexão') } finally { setSalvando(null) }
  }
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
  // A fila inteira na ordem (o que tem data). Mudar a ordem (↑↓ ou arrastar) aparece NA HORA
  // (ordemLocal) e grava por trás; se o servidor recusar, volta (24/11/2026: "tá meio lagado").
  const [ordemLocal, setOrdemLocal] = useState<string[] | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const comData = useMemo(() => {
    const base = f ? [...f.hoje, ...f.semana, ...(f.listaDepois || [])] : []
    if (!ordemLocal) return base
    const k = new Map(ordemLocal.map((id, i) => [id, i]))
    return [...base].sort((a, b) => (k.get(a.id) ?? 1e9) - (k.get(b.id) ?? 1e9))
  }, [f, ordemLocal])
  const gravarOrdem = async (ordem: string[]) => {
    setOrdemLocal(ordem); setMovendo(true); setErro('')
    try {
      const r = await fetch('/api/trabalho/fila', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ ordem }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErro(j.error || 'Não deu para mudar a ordem')
      await carregar()
    } catch { setErro('Falha de conexão') } finally { setMovendo(false); setOrdemLocal(null) }
  }
  const ordemAtual = () => ordemLocal || f?.ordem || []
  const mover = (id: string, dir: -1 | 1) => {
    if (!f || movendo) return
    const k = comData.findIndex((x) => x.id === id)
    const viz = comData[k + dir]
    if (k < 0 || !viz || viz.urgente) return
    const ordem = [...ordemAtual()]
    const a = ordem.indexOf(id), b = ordem.indexOf(viz.id)
    if (a < 0 || b < 0) return
    ;[ordem[a], ordem[b]] = [ordem[b], ordem[a]]
    void gravarOrdem(ordem)
  }
  // Arrastar: solta EM CIMA de outro item = fica logo antes dele.
  const soltar = (alvo: string) => {
    const id = arrastando
    setArrastando(null); setSobre(null)
    if (!f || !id || id === alvo || movendo) return
    if (comData.find((x) => x.id === alvo)?.urgente) return
    const ordem = ordemAtual().filter((x) => x !== id)
    const i = ordem.indexOf(alvo)
    if (i < 0) return
    ordem.splice(i, 0, id)
    void gravarOrdem(ordem)
  }

  const passa = (i: ItemResumo) => filtro === 'tudo' || (filtro === 'atrasados' ? i.atrasado : i.parado >= 14)
  const reunioes = (h?.itens || []).filter((i) => i.tipo === 'reuniao')
  const pedidos = (central?.pedidos || []).filter((p) => !['fechado', 'cancelado'].includes(p.status))
    .sort((a, b) => Number(b.aceite === 'pendente') - Number(a.aceite === 'pendente')
      || Number(!!b.prazo && b.prazo < hoje) - Number(!!a.prazo && a.prazo < hoje) || (a.prazo || '9').localeCompare(b.prazo || '9'))

  const setores = useMemo(() => ['Todos', ...[...new Set((equipe?.pessoas || []).map((p) => p.setor))].sort()], [equipe])
  const pessoasF = (equipe?.pessoas || []).filter((p) => setor === 'Todos' || p.setor === setor)
    .sort((a, b) => b.horas - a.horas || a.nome.localeCompare(b.nome))

  // Item em 2 linhas (24/11/2026): em cima o título e UM selo (o mais importante: atrasado,
  // senão urgente, senão o prazo); embaixo uma linha cinza com quem pediu, o quadro, as horas
  // e quando. Sem tempo estimado = "? h" (o aviso de cima chama para estimar).
  const item = (i: ItemResumo, quando: string) => {
    const pos = comData.findIndex((x) => x.id === i.id)
    const diasAtraso = diasDeAtraso(i, hoje)
    const selo = i.impossivel ? <span title={`A fila só chega neste pedido em ${br(i.inicio)}, e o prazo é ${i.prazo ? br(i.prazo) : '—'}. Quem pediu foi avisado para decidir.`}><SeloImpossivel /></span>
      : diasAtraso ? <SeloAtrasado dias={diasAtraso}>atrasado {diasAtraso} {diasAtraso === 1 ? 'dia' : 'dias'}</SeloAtrasado>
      : i.urgente ? <SeloUrgente />
      : i.prazo ? <span className="mf-quando"><Clock3 size={13} /> prazo {br(i.prazo)}</span> : null
    return (
      <div key={i.id} className={`mf-it${arrastando === i.id ? ' arrastando' : ''}${sobre === i.id && arrastando && arrastando !== i.id ? ' sobre' : ''}${i.bola ? ` bola${Math.min(3, Math.floor(i.bola.dias / i.bola.limite))}` : ''}`}
        draggable={!i.urgente && !i.continuo}
        onDragStart={(e) => { setArrastando(i.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setArrastando(null); setSobre(null) }}
        onDragOver={(e) => { if (!arrastando || i.continuo) return; e.preventDefault(); if (sobre !== i.id) setSobre(i.id) }}
        onDrop={(e) => { e.preventDefault(); soltar(i.id) }}>
        <span className="mf-pos">
          {!i.urgente && !i.continuo && <span className="mf-alca" title="Arraste para mudar a ordem" aria-hidden><GripVertical size={16} /></span>}
          {!i.urgente && !i.continuo ? (
            <span className="mf-setas">
              <button disabled={pos <= 0 || movendo || comData[pos - 1]?.urgente} onClick={() => mover(i.id, -1)} aria-label={`Subir #${i.numero}`} title="Subir na fila"><ChevronUp size={15} /></button>
              <button disabled={pos < 0 || pos >= comData.length - 1 || movendo} onClick={() => mover(i.id, 1)} aria-label={`Descer #${i.numero}`} title="Descer na fila"><ChevronDown size={15} /></button>
            </span>
          ) : <span style={{ width: 17 }} />}
          {i.continuo ? <Repeat size={14} /> : <b className="mf-num">{pos + 1}</b>}
        </span>
        <button className="mf-tit" onClick={() => setAberto(i.id)} title={`#${i.numero} ${i.titulo}`}>#{i.numero} {i.titulo}</button>
        <span style={{ justifySelf: 'end' }}>{selo}</span>
        <span className="mf-info">
          <span title="Quem pediu">{i.pedidoPor ? primeiro(i.pedidoPor) : 'você'}</span>
          {i.quadro && <span style={{ ['--c' as string]: i.quadro.cor }}><i className="mf-dot" /> {i.quadro.nome}</span>}
          {i.continuo ? <span>na rotina</span> : (
            <button className="mf-link" title={i.semEstimativa ? 'Ninguém disse quanto tempo leva. Clique para escolher (o sistema sugere).' : 'Mudar o tempo deste pedido'}
              onClick={() => setEstimando(estimando?.id === i.id ? null : { id: i.id, titulo: i.titulo })}>
              {i.semEstimativa ? <span style={{ color: COR.atencao }}>~{nf(i.horas)} h</span> : `${nf(i.horas)} h`}
            </button>
          )}
          {!i.continuo && <span>{quando}</span>}
          {i.status === 'em_andamento' && <span style={{ color: COR.ok }}>fazendo</span>}
          {i.bola
            ? <span style={{ color: COR.atencao }} title={`Você não mexe neste pedido há ${i.bola.dias} dias úteis (limite: ${i.bola.limite}). Um comentário, uma mudança de situação ou de data já conta.`}>bola parada há {i.bola.dias} {i.bola.dias === 1 ? 'dia' : 'dias'}</span>
            : i.parado >= 14 && !diasAtraso && <span style={{ color: COR.atencao }}>parado {i.parado} dias</span>}
        </span>
        {i.semEstimativa && !i.continuo && !tempoSalvo.has(i.id) && estimando?.id !== i.id && (
          <div className="mf-chips-tempo" role="group" aria-label={`Quanto leva o #${i.numero}?`}>
            <span>Quanto leva?</span>
            {TAMANHOS.map((t) => {
              const sug = i.sugerido != null && tamanhoDe(i.sugerido).id === t.id
              return (
                <button key={t.id} className={sug ? 'sug' : ''} onClick={() => salvarTempo(i.id, t.horas)} title={sug ? 'Sugerido pela mediana da categoria' : t.dica}>
                  {t.rotulo}{sug && <small> sugerido</small>}
                </button>
              )
            })}
            <button onClick={() => setEstimando({ id: i.id, titulo: i.titulo })}>outro</button>
          </div>
        )}
        {estimando?.id === i.id && !estimando.aceitar && (
          <div style={{ gridColumn: '1/-1' }}>
            <EstimarTempo ticketId={i.id} titulo={`#${i.numero} ${i.titulo}`} onFechar={() => setEstimando(null)} onSalvo={() => { setEstimando(null); carregar() }} />
          </div>
        )}
      </div>
    )
  }
  const secao = (titulo: string, sub: string, cor: string, icone: React.ReactNode, itens: ItemResumo[], quando: (i: ItemResumo) => string, vazio: string) => {
    // Atrasado há mais de 30 dias não fica no meio da fila: vai para "Parados — decidir" (melhorias 2.4).
    const lista = itens.filter(passa).filter((i) => titulo === 'Parados — decidir' || diasDeAtraso(i, hoje) <= 30)
    if (filtro !== 'tudo' && lista.length === 0) return null
    return (
      <section className="mf-card mf-anim">
        <div className="mf-cab"><span className="mf-ic p" style={{ ['--c' as string]: cor }}>{icone}</span><h2>{titulo}</h2>
          <span>{sub}{lista.length ? ` · ${lista.length} ${lista.length === 1 ? 'item' : 'itens'} · ${nf(lista.reduce((s, x) => s + x.horas, 0))} h` : ''}</span></div>
        {lista.length === 0 ? <div className="mf-vazio">{vazio}</div> : lista.map((i) => item(i, quando(i)))}
      </section>
    )
  }

  // pct (0 a 1): troca o ícone por um anel que enche (gráfico pedido pelo José, 26/11/2026).
  const kpi = (id: Filtro | null, cor: string, icone: React.ReactNode, valor: React.ReactNode, rotulo: string, pct?: number) => (
    <button className={`mf-kpi mf-anim${id && filtro === id ? ' on' : ''}`} style={{ ['--c' as string]: cor }}
      onClick={() => id && setFiltro(filtro === id ? 'tudo' : id)} aria-pressed={id ? filtro === id : undefined}
      title={id ? (filtro === id ? 'Mostrar tudo de novo' : 'Mostrar só estes') : undefined}>
      {pct == null ? <span className="mf-ic" style={{ ['--c' as string]: cor }}>{icone}</span> : (
        <span className="mf-anel" aria-hidden>
          <svg viewBox="0 0 44 44" width="52" height="52">
            <circle cx="22" cy="22" r="18" fill="none" stroke="var(--portal-bg-secondary,#eef2f7)" strokeWidth="5" />
            <circle cx="22" cy="22" r="18" fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round"
              strokeDasharray={`${Math.max(0, Math.min(1, pct)) * 113.1} 113.1`} transform="rotate(-90 22 22)" style={{ transition: 'stroke-dasharray .6s ease' }} />
          </svg>
          <span style={{ color: cor }}>{icone}</span>
        </span>
      )}
      <span><b>{valor}</b><small>{rotulo}</small></span>
    </button>
  )

  return (
    <div className="mf">
      <style>{ESTILO_FILA}</style>
      <div className="mf-topo">
        <div className="mf-titulo">
          <h1>{aba === 'minha' ? `Bom dia${userProfile?.nome ? `, ${primeiro(userProfile.nome)}` : ''}` : aba === 'esperando' ? 'Esperando outros' : 'Carga da equipe'}</h1>
          <span>{aba === 'minha' ? 'Seu dia tem 4,5 h para a fila. Comece pelo item da vez.'
            : aba === 'esperando' ? `O que você pediu para outras pessoas. Pulsando = ainda não aceitaram há mais de ${HORAS_PARA_PULSAR / 24} dia.`
            : 'Quem está ocupado, por setor. Só números: ninguém vê os títulos da fila do outro.'}</span>
        </div>
        {!abaFixa && (
          <>
            <button className={`mf-aba${aba === 'minha' ? ' on' : ''}`} style={{ ['--c' as string]: '#334155' }} onClick={() => setAba('minha')} aria-pressed={aba === 'minha'}>
              <span className="ic"><ListOrdered size={15} /></span> Minha fila
            </button>
            <button className={`mf-aba${aba === 'equipe' ? ' on' : ''}`} style={{ ['--c' as string]: '#334155' }} onClick={() => setAba('equipe')} aria-pressed={aba === 'equipe'}>
              <span className="ic"><Users size={15} /></span> Equipe
            </button>
          </>
        )}
        <span style={{ flex: 1 }} />
        {parados > 0 && <a className="mf-btn" href="/fila/faxina" title="Pedidos parados há 30+ dias ou vencidos há 15+">Faxina <span className="mf-pill" style={{ ['--c' as string]: COR.atencao }}>{parados}</span></a>}
        <button className="mf-btn" onClick={() => setAjuda((a) => !a)} aria-expanded={ajuda}><HelpCircle size={16} /> Como ler esta tela</button>
        <button className="mf-btn cheio" style={{ ['--c' as string]: COR.acao }} onClick={() => setPedirPara(null)}><Send size={15} /> Pedir para alguém</button>
      </div>

      {ajuda && (
        <div className="mf-ajuda mf-anim">
          <b style={{ fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>Como ler esta tela.</b> Cada pessoa tem <b style={{ fontWeight: 500 }}>uma fila só</b>, na ordem em que vai fazer.
          O sistema encaixa a fila em 4,5 h por dia e mostra o que cabe <b style={{ fontWeight: 500 }}>hoje</b>, o que vem <b style={{ fontWeight: 500 }}>na semana</b> e o que fica <b style={{ fontWeight: 500 }}>depois</b>.
          Use ↑↓ para mudar a ordem. Em cada item você vê <b style={{ fontWeight: 500 }}>quem pediu</b>, o quadro e a situação.
          Pedidos novos chegam em <b style={{ fontWeight: 500 }}>Chegou pra você</b>: aceite, proponha outra data ou recuse com o motivo.
          Para pedir algo a alguém, use <b style={{ fontWeight: 500 }}>Pedir para alguém</b>: antes de enviar, você vê a fila dessa pessoa.
          {h?.fator && <>Pelo seu histórico, <b style={{ fontWeight: 500 }}>você costuma levar {String(h.fator.fator).replace('.', ',')}× o que estima</b> ({h.fator.n} pedidos). </>}
          Os cartões de cima são clicáveis: <b style={{ fontWeight: 500 }}>Atrasados</b> e <b style={{ fontWeight: 500 }}>Parados</b> filtram a lista.
          <span style={{ display: 'flex', gap: '6px 16px', flexWrap: 'wrap', marginTop: 8 }}>
            <span><b style={{ fontWeight: 500, color: COR.acao }}>Azul</b> = o que você pode fazer</span>
            <span><b style={{ fontWeight: 500, color: COR.ok }}>Verde</b> = feito ou fazendo agora</span>
            <span><b style={{ fontWeight: 500, color: COR.ruim }}>Vermelho</b> = atrasado</span>
            <span><b style={{ fontWeight: 500, color: COR.atencao }}>Amarelo</b> = atenção (parado, sem tempo)</span>
            <span><b style={{ fontWeight: 500, color: COR.atencao }}>Borda que esquenta</b> = bola parada: você não mexe no pedido há 5 dias úteis (urgente: 1). Amarela, laranja, vermelha conforme passa o tempo</span>
            <span><b style={{ fontWeight: 500, color: COR.info }}>Cinza</b> = informação</span>
          </span>
        </div>
      )}
      {erro && <div className="mf-ajuda" style={{ color: 'var(--cor-atrasado-texto)' }}>{erro}</div>}

      {aba === 'minha' && (!h ? <div className="mf-ajuda">Carregando sua fila…</div> : !h.ativo ? <div className="mf-ajuda">A Central de Trabalho não está liberada para você.</div> : (
        <>
          {(() => {
            // Hoje = o que o plano põe no dia (nunca passa de 4,5 h); antes somava o item inteiro (13,5 h).
            const planoHoje = f?.plano?.[0]?.dia === hoje ? f.plano[0].itens : []
            const horasHoje = planoHoje.reduce((s, x) => s + x.horas, 0)
            const itensHoje = planoHoje.length
            const semTempo = comData.filter((x) => x.semEstimativa)
            // Um aviso só para "sem tempo" (antes era uma etiqueta amarela em cada linha).
            const segunda = new Date(hoje + 'T12:00:00Z').getUTCDay() === 1
            const conviteFaxina = parados > 0 && (segunda || parados >= 10) && (
              <div className="mf-aviso" style={{ background: 'color-mix(in srgb,#2563eb 6%,var(--portal-surface,#fefefe))', borderColor: 'color-mix(in srgb,#2563eb 30%,var(--portal-border,#e2e8f0))' }}>
                <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>Você tem {parados} {parados === 1 ? 'pedido parado' : 'pedidos parados'}.</b> 3 minutos de faxina: um de cada vez, fazer agora, nova data, devolver ou cancelar.</span>
                <a className="mf-btn peq cheio" style={{ ['--c' as string]: COR.acao }} href="/fila/faxina">Começar a faxina</a>
              </div>
            )
            const avisoSemTempo = semTempo.length > 0 && (
              <div className="mf-aviso">
                <span style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{semTempo.length} {semTempo.length === 1 ? 'pedido está' : 'pedidos estão'} sem tempo estimado.</b> Enquanto isso, a previsão usa a mediana da categoria (ou um dia). Escolha nos chips de cada um.</span>
                <button className="mf-btn peq" onClick={() => setEstimando({ id: semTempo[0].id, titulo: semTempo[0].titulo })}>Estimar agora</button>
              </div>
            )
            const numeros = f && (
              <div className="mf-kpis">
                {kpi(null, horasHoje >= 4.5 ? COR.atencao : COR.acao, <Sun size={16} />, `${nf(horasHoje)} de 4,5 h`, `ocupadas hoje · ${itensHoje} ${itensHoje === 1 ? 'pedido' : 'pedidos'}`, horasHoje / 4.5)}
                {kpi('atrasados', f.atrasados ? COR.ruim : COR.ok, <AlarmClock size={16} />, f.total ? `${f.atrasados} de ${f.total}` : f.atrasados, f.atrasados ? 'atrasados · clique para ver só eles' : 'nada atrasado', f.total ? f.atrasados / f.total : 0)}
                {kpi(null, COR.info, <Layers size={18} />, f.livreEm ? livreAPartir(f.livreEm) : 'hoje', `livre a partir de · ${f.total} ${f.total === 1 ? 'item' : 'itens'} na fila`)}
              </div>
            )
            const velhosLista = comData.filter((i) => diasDeAtraso(i, hoje) > 30)
            const secaoVelhosLista = velhosLista.length > 0 && secao('Parados — decidir', `atrasados há mais de 30 dias · ${velhosLista.length}`, COR.ruim, <AlarmClock size={16} />, velhosLista, (i) => `prazo era ${i.prazo ? br(i.prazo) : '—'}`, '')
            const filaCompleta = (
              <>
                {avisoSemTempo}
                {secaoVelhosLista}
                {f && secao('Hoje', 'objetivo do dia · arraste ⠿ ou use ↑↓ para mudar a ordem', COR.info, <Sun size={16} />, f.hoje, (i) => (i.fim > hoje ? `até ${br(i.fim)}` : 'termina hoje'), 'Nada na fila para hoje.')}
                {f && secao('Esta semana', 'objetivo da semana', COR.info, <CalendarRange size={16} />, f.semana, (i) => `começa ${br(i.inicio)}`, 'Nada mais previsto até sexta.')}
                {f && secao('Depois', 'o resto da fila, na ordem', '#475569', <ListOrdered size={16} />, f.listaDepois || [], (i) => `${br(i.inicio)}–${br(i.fim)}`, 'Nada depois desta semana.')}
                {f && (f.listaContinuos || []).length > 0 && secao('Rotina', 'sem prazo, dentro da 1,5 h de rotina', COR.info, <Repeat size={16} />, f.listaContinuos, () => '', '')}
              </>
            )
            // Foco: só os próximos (o "Agora" já está em cima); "ver a fila completa" abre o resto.
            const velhos = comData.filter((i) => diasDeAtraso(i, hoje) > 30)
            const secaoVelhos = velhos.length > 0 && (
              <>
                {secao('Parados — decidir', `atrasados há mais de 30 dias · ${velhos.length}`, COR.ruim, <AlarmClock size={16} />, velhos, (i) => `prazo era ${i.prazo ? br(i.prazo) : '—'}`, '')}
                <a className="mf-btn" href="/fila/faxina" style={{ alignSelf: 'flex-start' }}>Decidir na Faxina (um de cada vez)</a>
              </>
            )
            const vivos = comData.filter((i) => diasDeAtraso(i, hoje) <= 30)
            const proximos = f && (verTudo ? filaCompleta : (
              <>
                {secao('Próximos', 'arraste ⠿ ou use ↑↓ para mudar a ordem', COR.info, <ListOrdered size={16} />, vivos.filter((x) => x.id !== agora?.rodando?.ticket_id).slice(1, 7), (i) => (i.inicio <= hoje ? 'hoje' : `começa ${br(i.inicio)}`), 'Nada depois deste.')}
                {comData.length > 7 && <button className="mf-btn" onClick={() => setVerTudo(true)}>Ver a fila completa ({comData.length} itens)</button>}
                {secaoVelhos}
                {avisoSemTempo}
              </>
            ))
            const lado = (
              <>
                {(h.negociar || []).length > 0 && (
                  <section className="mf-card mf-anim">
                    <div className="mf-cab"><span className="mf-ic p" style={{ ['--c' as string]: '#6d28d9' }}><AlarmClock size={16} /></span><h2>Precisa da sua decisão</h2><span>prazo impossível · {(h.negociar || []).length}</span></div>
                    {(h.negociar || []).map((n) => (
                      <div key={n.id} className="mf-it" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                        <button className="mf-tit" onClick={() => setAberto(n.id)}>#{n.numero} {n.titulo}</button>
                        <span style={{ fontSize: 13, color: 'var(--portal-text-secondary,#475569)' }}>
                          Seu pedido com {primeiro(n.com)} só começa por volta de <b style={{ fontWeight: 500 }}>{br(n.comeca)}</b>{n.termina ? <> (termina ~{br(n.termina)})</> : null} e o prazo era <b style={{ fontWeight: 500 }}>{br(n.prazo)}</b>.
                        </span>
                        {n.prioridade === 'pedida'
                          ? <span className="mf-pill" style={{ ['--c' as string]: COR.atencao }}>prioridade pedida: esperando {primeiro(n.com)}</span>
                          : (
                            <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                              {n.termina && <button className="mf-btn peq cheio" style={{ ['--c' as string]: COR.acao }} disabled={salvando === n.id}
                                onClick={() => acaoPedido(n.id, { acao: 'editar', prazo: n.termina })}>Aceitar {br(n.termina)}</button>}
                              <button className="mf-btn peq" disabled={salvando === n.id} onClick={() => { const m = window.prompt(`Por que o #${n.numero} precisa passar na frente? (vai para ${primeiro(n.com)})`); if (m !== null) acaoPedido(n.id, { acao: 'prioridade', decisao: 'pedir', motivo: m }) }}>Pedir prioridade</button>
                              <button className="mf-btn peq" disabled={salvando === n.id} onClick={() => { const m = window.prompt('Por que cancelar? (vai para a timeline)'); if (m) acaoPedido(n.id, { acao: 'status', para: 'cancelado', motivo: m }) }}>Cancelar</button>
                            </span>
                          )}
                      </div>
                    ))}
                  </section>
                )}
                <section className={`mf-card mf-anim${h.pendentes.length + (h.prioridades || []).length ? ' mf-chegou' : ''}`}>
                  <div className="mf-cab" style={h.pendentes.length + (h.prioridades || []).length ? undefined : { marginBottom: 0 }}><span className="mf-ic p" style={{ ['--c' as string]: COR.acao }}><Inbox size={16} /></span><h2>Chegou pra você</h2>
                    <span>{h.pendentes.length + (h.prioridades || []).length ? `${h.pendentes.length + (h.prioridades || []).length} esperando sua resposta` : 'nada esperando sua resposta'}</span></div>
                  {(h.prioridades || []).map((p) => (
                    <div key={`pr${p.id}`} className="mf-it" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                      <span style={{ fontSize: 13.5 }}><b style={{ fontWeight: 500 }}>{primeiro(p.por)}</b> pede prioridade no <button className="mf-tit" style={{ display: 'inline', fontSize: 13.5 }} onClick={() => setAberto(p.id)}>#{p.numero} {p.titulo}</button></span>
                      {p.motivo && <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>“{p.motivo}”</span>}
                      <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                        <button className="mf-btn peq cheio" style={{ ['--c' as string]: COR.acao }} disabled={salvando === p.id} onClick={() => acaoPedido(p.id, { acao: 'prioridade', decisao: 'aceitar' })}>Aceitar (vai para o topo)</button>
                        <button className="mf-btn peq" disabled={salvando === p.id} onClick={() => acaoPedido(p.id, { acao: 'prioridade', decisao: 'recusar' })}>Recusar</button>
                      </span>
                    </div>
                  ))}
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
                            <button className="mf-btn peq cheio" style={{ ['--c' as string]: COR.acao }} disabled={salvando === p.id} onClick={() => setEstimando({ id: p.id, titulo: p.titulo, aceitar: true })}><Check size={14} /> Aceitar</button>
                            <button className="mf-btn peq" onClick={() => setDecidindo({ id: p.id, modo: 'data', valor: '' })}><CalendarClock size={14} /> Outra data</button>
                            <button className="mf-btn peq" onClick={() => setDecidindo({ id: p.id, modo: 'recusar', valor: '' })}><CircleX size={14} /> Recusar</button>
                          </span>
                        ) : (
                          <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginTop: 4 }}>
                            {d.modo === 'data'
                              ? <input type="date" min={hoje} value={d.valor} onChange={(e) => setDecidindo({ ...d, valor: e.target.value })} aria-label="Consigo fazer até" className="mf-btn peq" />
                              : <input value={d.valor} onChange={(e) => setDecidindo({ ...d, valor: e.target.value })} placeholder="Por que não consegue? (vai para quem pediu)" aria-label="Motivo" className="mf-btn peq" style={{ flex: '1 1 220px' }} autoFocus />}
                            <button className="mf-btn peq cheio" style={{ ['--c' as string]: d.modo === 'data' ? COR.acao : COR.info }} disabled={!d.valor.trim() || salvando === p.id}
                              onClick={() => decidir(p.id, d.modo === 'data' ? { decisao: 'nova_data', data: d.valor } : { decisao: 'recusar', motivo: d.valor })}>
                              {d.modo === 'data' ? 'Aceitar com esta data' : 'Recusar'}
                            </button>
                            <button className="mf-btn peq" onClick={() => setDecidindo(null)}>Voltar</button>
                          </span>
                        )}
                        {estimando?.id === p.id && estimando.aceitar && (
                          <EstimarTempo aceitar ticketId={p.id} titulo={`#${p.numero} ${p.titulo}`} onFechar={() => setEstimando(null)} onSalvo={() => { setEstimando(null); carregar() }} />
                        )}
                      </div>
                    )
                  })}
                </section>
              </>
            )
            return (
              <div className="mf-col">
                {conviteFaxina}
                {/* O que pede resposta sua fica em cima de tudo (José, 26/11/2026). Reuniões saíram daqui: têm a aba Reuniões. */}
                {lado}
                {layout !== 'plano' && numeros}
                {layout !== 'lista' && f && <ModoAgora itens={vivos} agora={agora} compacto={layout === 'plano'} onMudou={() => { carregar(); window.dispatchEvent(new Event('central-trabalho-mudou')) }} onAbrir={setAberto} />}
                {layout === 'plano' && f && <PlanoSemana fila={f} reunioesHoje={reunioes.length} onAbrir={setAberto} />}
                {layout !== 'plano' && <div className="mf-col">{layout === 'foco' ? proximos : filaCompleta}</div>}
              </div>
            )
          })()}
        </>
      ))}

      {aba === 'esperando' && (
        <section className="mf-card mf-anim">
          <div className="mf-cab"><span className="mf-ic p" style={{ ['--c' as string]: COR.info }}><Send size={16} /></span><h2>O que você pediu</h2><span>{pedidos.length} {pedidos.length === 1 ? 'pedido' : 'pedidos'}</span></div>
          {!central && <div className="mf-vazio">Carregando…</div>}
          {central && pedidos.length === 0 && <div className="mf-vazio">Você não está esperando ninguém.</div>}
          {(todosPedidos ? pedidos : pedidos.slice(0, 30)).map((p) => {
            const quem = central?.usuarios[p.responsavel_id]?.nome || 'Alguém'
            const st = STATUS_INFO[p.status as TicketStatus]
            const atrasado = !!p.prazo && p.prazo < hoje && p.status !== 'resolvido'
            const cut = cutucadas[p.id]
            // Resolvido = a bola está comigo (confirmar); aí não tem quem cutucar.
            const podeCutucar = p.status !== 'resolvido' && p.responsavel_id !== userProfile?.id
            // Há quanto tempo o pedido espera ser aceito. Passou de 1 dia = pulsa.
            const horasEsperando = p.aceite === 'pendente' && p.created_at ? (Date.now() - Date.parse(p.created_at)) / 3600000 : 0
            const pulsa = horasEsperando >= HORAS_PARA_PULSAR
            const diasEsperando = Math.floor(horasEsperando / 24)
            return (
              <div key={p.id} className={`mf-it${pulsa ? ' mf-pulsa' : ''}`} style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                <button className="mf-tit" onClick={() => setAberto(p.id)}>#{p.numero} {p.titulo}</button>
                <span className="mf-info" style={{ gridColumn: 'auto' }}>
                  <span><span className="mf-av">{iniciais(quem)}</span> com {primeiro(quem)}</span>
                  {p.aceite === 'pendente'
                    ? <span className="mf-pill" style={{ ['--c' as string]: pulsa ? COR.ruim : COR.atencao }}>{diasEsperando >= 1 ? `não aceitou há ${diasEsperando} ${diasEsperando === 1 ? 'dia' : 'dias'}` : 'esperando aceitar'}</span>
                    : st && <span className="mf-pill" style={{ ['--c' as string]: COR.info }}>{st.label}</span>}
                  {atrasado ? <SeloAtrasado>desde {br(p.prazo!)}</SeloAtrasado> : p.prazo && <span><Clock3 size={13} /> prazo {br(p.prazo)}</span>}
                  {podeCutucar && (cut?.ok
                    ? <span style={{ color: COR.ok }}>cutucado ✓</span>
                    : <button className="mf-cutucar" disabled={cut?.enviando} onClick={() => cutucar(p.id)} title={`Manda um aviso no sino de ${primeiro(quem)}: “como está?”. Uma vez por dia.`}><BellRing size={13} /> Cutucar</button>)}
                  {cut?.erro && <span style={{ color: COR.atencao }}>{cut.erro}</span>}
                </span>
              </div>
            )
          })}
          {pedidos.length > 30 && <button className="mf-btn peq" style={{ margin: '6px 0' }} onClick={() => setTodosPedidos(!todosPedidos)}>{todosPedidos ? 'Mostrar menos' : `Ver todos (${pedidos.length})`}</button>}
        </section>
      )}

      {aba === 'equipe' && (
        <>
          <div className="mf-chips" role="group" aria-label="Filtrar por setor">
            {setores.map((s) => (
              <button key={s} className={`mf-aba${s === setor ? ' on' : ''}`} style={{ ['--c' as string]: '#334155', paddingLeft: 14 }} aria-pressed={s === setor} onClick={() => setSetor(s)}>
                {s}{s !== 'Todos' && equipe && <span style={{ fontSize: 12, color: 'var(--portal-text-muted,#64748b)' }}>{equipe.pessoas.filter((p) => p.setor === s).length}</span>}
              </button>
            ))}
          </div>
          {!equipe ? <div className="mf-ajuda">Carregando a equipe…</div> : pessoasF.length === 0 ? <div className="mf-ajuda">Ninguém neste setor.</div> : (
            <EquipeLista pessoas={pessoasF} eu={equipe.eu} onPedir={(id) => setPedirPara(id)} onAbrir={setAberto} />
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
