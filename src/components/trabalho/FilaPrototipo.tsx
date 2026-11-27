'use client'
// PROTÓTIPO DA MINHA FILA (26/11/2026) — tela de teste do José ("como se fosse um designer").
//   · Uma fila só (a antiga "Rotina" entra nela). Arrasta para mudar a ordem; o tempo muda na linha.
//   · Cada tarefa: o que fazer, quem pediu, quando pediu, tempo e a ENTREGA PREVISTA.
//   · Cor do mês: verde = dá para entregar neste mês; laranja = fica para o mês que vem.
//     Uma linha marca onde a fila "vira o mês" — arraste para cima o que precisa sair antes.
//   · Sem etapa de aceitar: não dá para fazer = CONTESTAR (motivo pronto → WhatsApp de quem pediu).
//   · No topo, o mês: chegaram, concluídas, contestadas, canceladas — e a Faxina à vista.
// Mesmos dados da Minha fila (/api/trabalho/hoje) + /api/trabalho/mes.
import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { authHeaders } from '@/lib/auth/client'
import { STATUS_INFO, type TicketStatus } from '@/lib/tickets/constantes'
import type { ResumoFila, ItemResumo } from '@/lib/trabalho/fila-server'
import { TAMANHOS, planoDeHoras } from '@/lib/trabalho/estimativa'
import { prefetchTicket, prefetchVarios } from '@/components/tickets/cacheTicket'

const FormTicket = dynamic(() => import('@/components/tickets/FormTicket'), { ssr: false })
const FormSC = dynamic(() => import('@/components/tickets/FormSC'), { ssr: false })
const TicketModal = dynamic(() => import('@/components/tickets/TicketModal'), { ssr: false })
const Faxina = dynamic(() => import('./Faxina'), { ssr: false })

interface Hoje { ativo: boolean; fila: ResumoFila | null }
type ChaveMes = 'chegaram' | 'concluidas' | 'contestadas' | 'canceladas'
interface ItemMes { id: string; numero: number; titulo: string; status: string }
interface Mes { mes: string; fimMes: string; chegaram: number; concluidas: number; contestadas: number; canceladas: number; listas?: Record<ChaveMes, ItemMes[]> }
const ROTULO_MES: Record<ChaveMes, string> = { chegaram: 'Chegaram', concluidas: 'Concluídas', contestadas: 'Contestadas', canceladas: 'Canceladas' }

const MOTIVOS = ['Não entendi o pedido', 'Falta informação', 'Não é comigo', 'Prazo impossível', 'Já foi feito', 'Outro motivo']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const dm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const diaSemana = (iso: string) => SEMANA[new Date(iso.slice(0, 10) + 'T12:00:00').getDay()]
const hojeISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const diasEntre = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10)) - Date.parse(a.slice(0, 10))) / 86400000)
const primeiro = (n: string) => n.split(' ')[0]
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')
const haQuanto = (iso: string, hoje: string) => { const d = diasEntre(iso, hoje); return d <= 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias` }
const nomeMes = (iso: string) => MESES[Number(iso.slice(5, 7)) - 1]

async function acao(id: string, corpo: Record<string, unknown>) {
  const r = await fetch(`/api/tickets/${id}/acoes`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error((j as { error?: string }).error || 'Não deu certo')
  return j as { whats?: 'enviado' | 'sem_celular' | 'falhou'; aviso?: string; pediu?: string | null }
}

export default function FilaPrototipo() {
  const [h, setH] = useState<Hoje | null>(null)
  const [mes, setMes] = useState<Mes | null>(null)
  const [erro, setErro] = useState('')
  const [parados, setParados] = useState(0)
  const [aberto, setAberto] = useState<string | null>(null)
  // "+ Novo" (José, 26/11/2026): um botão só; escolhe Tarefa ou Solicitação de compra.
  const [pedir, setPedir] = useState(false)
  const [novaSC, setNovaSC] = useState(false)
  const [menuNovo, setMenuNovo] = useState(false)
  const [ocupado, setOcupado] = useState<string | null>(null)
  const [tempoDe, setTempoDe] = useState<string | null>(null)
  const [contestando, setContestando] = useState<ItemResumo | null>(null)
  // Cartão do mês clicado: abre a lista logo abaixo dos cartões.
  const [listaMes, setListaMes] = useState<ChaveMes | null>(null)
  // Faxina numa janela por cima da fila (José: "modal e não uma nova página").
  // (Sem Esc para fechar: dentro da Faxina o Esc já significa "voltar" da escolha.)
  const [faxina, setFaxina] = useState(false)
  // Arrastar: a nova ordem aparece na hora (ordemLocal) e grava por trás.
  const [ordemLocal, setOrdemLocal] = useState<string[] | null>(null)
  const [arrastando, setArrastando] = useState<string | null>(null)
  const [sobre, setSobre] = useState<string | null>(null)
  const hoje = hojeISO()

  const carregar = useCallback(async () => {
    try {
      const hd = await authHeaders()
      const [r, rf, rm] = await Promise.all([
        fetch('/api/trabalho/hoje', { headers: hd, cache: 'no-store' }),
        fetch('/api/trabalho/faxina?contar=1', { headers: hd, cache: 'no-store' }),
        fetch('/api/trabalho/mes', { headers: hd, cache: 'no-store' }),
      ])
      const j = await r.json()
      if (!r.ok) { setErro(j.error || 'Falha ao carregar'); return }
      setH(j); setErro('')
      if (rf.ok) setParados(((await rf.json()) as { n?: number }).n || 0)
      if (rm.ok) setMes(await rm.json())
    } catch { setErro('Falha de conexão') }
  }, [])
  useEffect(() => { carregar() }, [carregar])
  // Abrir sem travar (José): baixa a janela do pedido logo que a tela abre, antes do 1º clique.
  useEffect(() => { void import('@/components/tickets/TicketModal'); void import('@/components/tickets/FormTicket'); void import('@/components/tickets/FormSC') }, [])

  const f = h?.fila
  // Tudo numa fila só, na ordem do servidor (rotina inclusa). Em andamento fica num bloco acima.
  const { andamento, fila } = useMemo(() => {
    if (!f) return { andamento: [] as ItemResumo[], fila: [] as ItemResumo[] }
    const todos = [...f.hoje, ...f.semana, ...(f.listaDepois || []), ...(f.listaContinuos || [])]
    const ordem = ordemLocal || f.ordem
    const pos = new Map(ordem.map((id, i) => [id, i]))
    todos.sort((a, b) => (pos.get(a.id) ?? 1e9) - (pos.get(b.id) ?? 1e9))
    return { andamento: todos.filter((i) => i.status === 'em_andamento'), fila: todos.filter((i) => i.status !== 'em_andamento') }
  }, [f, ordemLocal])
  const atrasadas = [...andamento, ...fila].filter((i) => i.atrasado).length
  // Pré-carrega as 8 primeiras (fazendo + topo da fila): abrir a tarefa fica instantâneo.
  const idsTopo = [...andamento, ...fila].slice(0, 8).map((i) => i.id).join(',')
  useEffect(() => { if (idsTopo) void prefetchVarios(idsTopo.split(',')) }, [idsTopo])
  const fimMes = mes?.fimMes || `${hoje.slice(0, 7)}-31`
  const noMes = (i: ItemResumo) => !i.continuo && i.fim <= fimMes
  const proximoMes = (() => { const d = new Date(fimMes + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10) })()

  const gravarOrdem = async (ordem: string[]) => {
    setOrdemLocal(ordem); setErro('')
    try {
      const r = await fetch('/api/trabalho/fila', { method: 'PUT', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ ordem }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) setErro((j as { error?: string }).error || 'Não deu para mudar a ordem')
      await carregar()
    } catch { setErro('Falha de conexão') } finally { setOrdemLocal(null) }
  }
  const soltar = (alvo: string) => {
    const id = arrastando
    setArrastando(null); setSobre(null)
    if (!f || !id || id === alvo) return
    const ordem = (ordemLocal || f.ordem).filter((x) => x !== id)
    const k = ordem.indexOf(alvo)
    if (k < 0) return
    ordem.splice(k, 0, id)
    void gravarOrdem(ordem)
  }

  // Lista ou Kanban (José, 26/11/2026). A escolha fica neste navegador.
  const [visao, setVisao] = useState<'lista' | 'kanban'>('lista')
  useEffect(() => { try { if (localStorage.getItem('fila-visao') === 'kanban') setVisao('kanban') } catch { /* sem storage */ } }, [])
  const trocarVisao = (v: 'lista' | 'kanban') => { setVisao(v); try { localStorage.setItem('fila-visao', v) } catch { /* sem storage */ } }
  const [colSobre, setColSobre] = useState<string | null>(null)

  // Rapidez (José: "na hora que eu começo também tá demorando"): a tela muda NA HORA (otimista) e o
  // servidor confirma por trás. Recusou → volta como estava e mostra o motivo.
  const mudarStatus = async (i: ItemResumo, para: string) => {
    if (para === 'resolvido' && !window.confirm(`Concluir "#${i.numero} ${i.titulo}"? Quem pediu vai confirmar.`)) return
    const antes = h
    setH((atual) => {
      if (!atual?.fila) return atual
      const muda = (l: ItemResumo[]) => (para === 'resolvido' ? l.filter((x) => x.id !== i.id) : l.map((x) => (x.id === i.id ? { ...x, status: para } : x)))
      const f = atual.fila
      return { ...atual, fila: { ...f, hoje: muda(f.hoje), semana: muda(f.semana), listaDepois: muda(f.listaDepois || []), listaContinuos: muda(f.listaContinuos || []) } }
    })
    setErro('')
    try { await acao(i.id, { acao: 'status', para }); void carregar() }
    catch (e) { setH(antes); setErro(e instanceof Error ? e.message : 'Não deu certo') }
  }
  const salvarTempo = async (i: ItemResumo, horas: number) => {
    setTempoDe(null); setOcupado(i.id)
    const { dias, horasDia } = planoDeHoras(horas, 4.5)
    try { await acao(i.id, { acao: 'editar', dias, horas_dia: horasDia }); await carregar() } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo') } finally { setOcupado(null) }
  }

  const linha = (i: ItemResumo, pos: number | null) => {
    const vaiAtrasar = !!i.prazo && !i.continuo && i.fim > i.prazo
    const andando = i.status === 'em_andamento'
    const situacao = !andando && !['aberto', 'em_andamento'].includes(i.status) ? STATUS_INFO[i.status as TicketStatus]?.label : null
    const corMes = i.continuo ? 'sem' : i.atrasado || vaiAtrasar ? 'ruim' : noMes(i) ? 'mes' : 'depois'
    const arrastavel = !andando
    return (
      <div key={i.id} style={{ ['--d' as string]: `${Math.min(12, pos ?? 0) * 35}ms` }}
        className={`fp-lin fp-anim${arrastando === i.id ? ' arrastando' : ''}${sobre === i.id && arrastando && arrastando !== i.id ? ' sobre' : ''}${i.contestada ? ' contestada' : ''}`}
        role="button" tabIndex={0} onClick={() => setAberto(i.id)} onKeyDown={(e) => { if (e.key === 'Enter') setAberto(i.id) }}
        onMouseEnter={() => { void prefetchTicket(i.id) }}
        draggable={arrastavel}
        onDragStart={(e) => { setArrastando(i.id); e.dataTransfer.effectAllowed = 'move' }}
        onDragEnd={() => { setArrastando(null); setSobre(null) }}
        onDragOver={(e) => { if (!arrastando || !arrastavel) return; e.preventDefault(); if (sobre !== i.id) setSobre(i.id) }}
        onDrop={(e) => { e.preventDefault(); soltar(i.id) }}>
        <div className="fp-pos" title={arrastavel ? 'Arraste para mudar a ordem' : undefined}>
          {arrastavel && <span className="fp-alca" aria-hidden>⠿</span>}{pos ?? ''}
        </div>
        <div className="fp-tarefa">
          <div className="fp-tit">
            <span className="fp-num">#{i.numero}</span> {i.titulo}
            {i.urgente && <span className="fp-tag verm">urgente</span>}
            {situacao && <span className="fp-tag">{situacao.toLowerCase()}</span>}
          </div>
          {i.descricao ? <div className="fp-desc">{i.descricao}</div> : <div className="fp-desc vazia">Sem descrição</div>}
          {i.contestada && <div className="fp-contest">Contestada: {i.contestada.motivo} · {haQuanto(i.contestada.em, hoje)}</div>}
        </div>
        <div className="fp-cel" data-rot="Pediu">{i.pedidoPor ? primeiro(i.pedidoPor) : 'Você'}</div>
        <div className="fp-cel" data-rot="Criado">{i.criadoEm ? <>{dm(i.criadoEm)}<small>{haQuanto(i.criadoEm, hoje)}</small></> : '—'}</div>
        <div className="fp-cel" data-rot="Tempo" onClick={(e) => e.stopPropagation()}>
          {/* Sem tempo (ou 0 h) pulsa: a previsão não fecha sem ele (José, 26/11/2026). */}
          <button className={`fp-tempo${i.semEstimativa || !i.horas ? ' falta' : ''}`} disabled={ocupado === i.id}
            onClick={() => setTempoDe(tempoDe === i.id ? null : i.id)} title={i.semEstimativa || !i.horas ? 'Sem tempo: clique e diga quanto leva' : 'Mudar o tempo desta tarefa'}>
            {i.semEstimativa || !i.horas ? 'definir' : `${nf(i.horas)} h`}
          </button>
        </div>
        <div className="fp-cel" data-rot="Entrega prevista">
          <span className={`fp-entrega ${corMes}`}>{i.continuo ? 'sem prazo' : `${diaSemana(i.fim)} ${dm(i.fim)}`}</span>
          <small className={corMes === 'ruim' ? 'ruim' : ''}>
            {i.continuo ? 'rotina'
              : i.atrasado && i.prazo ? `prazo era ${dm(i.prazo)}`
              : vaiAtrasar ? `prazo ${dm(i.prazo!)} · vai atrasar`
              : i.prazo ? `prazo ${dm(i.prazo)}` : ''}
          </small>
        </div>
        <div className="fp-acao" onClick={(e) => e.stopPropagation()}>
          {andando
            ? <button disabled={ocupado === i.id} onClick={() => mudarStatus(i, 'resolvido')}>Concluir</button>
            : <button disabled={ocupado === i.id} onClick={() => mudarStatus(i, 'em_andamento')}>Começar</button>}
          {i.pedidoPor && <button className="fraco" disabled={ocupado === i.id} onClick={() => setContestando(i)}>Contestar</button>}
        </div>
        {tempoDe === i.id && (
          <div className="fp-chips" onClick={(e) => e.stopPropagation()}>
            <span>Quanto leva?</span>
            {TAMANHOS.map((t) => <button key={t.id} onClick={() => salvarTempo(i, t.horas)} title={t.dica}>{t.rotulo}</button>)}
            <button className="fraco" onClick={() => setTempoDe(null)}>fechar</button>
          </div>
        )}
      </div>
    )
  }

  const cabTabela = (
    <div className="fp-lin fp-cab-tab" aria-hidden>
      <div /><div>Tarefa</div><div>Pediu</div><div>Criado</div><div>Tempo</div><div>Entrega prevista</div><div />
    </div>
  )
  // Onde a fila "vira o mês": a 1ª tarefa (com prazo) que já não cabe neste mês.
  const viraMes = fila.findIndex((i) => !i.continuo && !noMes(i))

  return (
    <div className="fp">
      <style>{CSS_BASE + CSS}</style>
      {/* Topo sem título (José): o resumo da fila + o mês em cartões + a Faxina à vista. */}
      <header className="fp-topo">
        {f ? (
          <p>
            <b>{andamento.length + fila.length} tarefas</b> · <span className={atrasadas ? 'ruim' : ''}>{atrasadas} {atrasadas === 1 ? 'atrasada' : 'atrasadas'}</span>
            {f.livreEm && <> · livre a partir de <b>{diaSemana(f.livreEm)} {dm(f.livreEm)}</b></>}
          </p>
        ) : <p>Carregando…</p>}
        <div className="fp-topo-dir">
          <div className="fp-visao" role="group" aria-label="Como ver">
            <button className={visao === 'lista' ? 'on' : ''} aria-pressed={visao === 'lista'} onClick={() => trocarVisao('lista')}>Lista</button>
            <button className={visao === 'kanban' ? 'on' : ''} aria-pressed={visao === 'kanban'} onClick={() => trocarVisao('kanban')}>Kanban</button>
          </div>
          <div className="fp-novo" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setMenuNovo(false) }}>
            <button className="fp-btn" onClick={() => setMenuNovo((v) => !v)} aria-expanded={menuNovo} aria-haspopup="menu">+ Novo</button>
            {menuNovo && (
              <div className="fp-novo-menu" role="menu">
                <button role="menuitem" onClick={() => { setMenuNovo(false); setPedir(true) }}><b>Tarefa</b><small>pedir algo para alguém</small></button>
                <button role="menuitem" onClick={() => { setMenuNovo(false); setNovaSC(true) }}><b>Solicitação de compra</b><small>comprar produto, passa pela aprovação</small></button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="fp-cards">
        {(['chegaram', 'concluidas', 'contestadas', 'canceladas'] as ChaveMes[]).map((k, n) => (
          <button key={k} className={`fp-card fp-anim${k === 'concluidas' ? ' ok' : ''}${listaMes === k ? ' on' : ''}`} style={{ ['--d' as string]: `${n * 60}ms` }}
            onClick={() => setListaMes(listaMes === k ? null : k)} aria-expanded={listaMes === k}
            title={listaMes === k ? 'Fechar a lista' : 'Ver quais são'}>
            <span>{k === 'chegaram' ? `Chegaram em ${mes ? nomeMes(mes.mes + '-01') : '…'}` : ROTULO_MES[k]}</span>
            <b>{mes ? mes[k] : '–'}</b>
            {k === 'concluidas' && mes && mes.chegaram > 0 && <i className="fp-barra"><i style={{ width: `${Math.min(100, (mes.concluidas / mes.chegaram) * 100)}%` }} /></i>}
            <em className="fp-ver">{listaMes === k ? 'fechar ↑' : 'ver ↓'}</em>
          </button>
        ))}
        {/* Quanto da fila cabe neste mês: barra verde (cabe) e laranja (vai para o próximo). Clica = vai até a virada. */}
        {f && (() => {
          const comPrazo = fila.filter((i) => !i.continuo)
          const cabe = comPrazo.filter(noMes).length
          return (
            <button className="fp-card fp-anim largo" style={{ ['--d' as string]: '240ms' }} title="Ir até onde a fila vira o mês"
              onClick={() => document.getElementById(viraMes >= 0 ? 'fp-vira' : 'fp-na-fila')?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
              <span>A fila em {nomeMes(fimMes)}</span>
              <b>{cabe}<small> de {comPrazo.length} cabem</small></b>
              <i className="fp-barra duas"><i style={{ width: comPrazo.length ? `${(cabe / comPrazo.length) * 100}%` : '0%' }} /></i>
              <em className="fp-ver">ver na fila ↓</em>
            </button>
          )
        })()}
        {parados > 0 && (
          <button className="fp-card fp-anim faxina" onClick={() => setFaxina(true)} style={{ ['--d' as string]: '300ms' }}>
            <span>Paradas há muito tempo</span><b>{parados}</b><em>Revisar na Faxina →</em>
          </button>
        )}
      </div>

      {listaMes && mes && (
        <div className="fp-lista-mes fp-anim">
          <div className="fp-lista-cab">
            <b>{ROTULO_MES[listaMes]} em {nomeMes(mes.mes + '-01')}</b>
            <button onClick={() => setListaMes(null)} aria-label="Fechar">fechar</button>
          </div>
          {(mes.listas?.[listaMes] || []).length === 0
            ? <div className="fp-lista-vazia">Nenhuma neste mês.</div>
            : (mes.listas?.[listaMes] || []).map((t) => (
              <button key={t.id} className="fp-lista-it" onClick={() => setAberto(t.id)}>
                <span className="fp-num">#{t.numero}</span> {t.titulo}
                <small>{STATUS_INFO[t.status as TicketStatus]?.label || t.status}</small>
              </button>
            ))}
        </div>
      )}

      {erro && <div className="fp-erro">{erro}</div>}
      {!h && !erro && <div className="fp-vazio">Carregando…</div>}

      {f && visao === 'kanban' && (() => {
        // Kanban por situação. Arrastar o cartão para outra coluna muda a situação do pedido.
        const todos = [...andamento, ...fila]
        const colunas: { id: string; titulo: string; cor: string; itens: ItemResumo[] }[] = [
          { id: 'aberto', titulo: 'Na fila', cor: '#475569', itens: todos.filter((i) => i.status === 'aberto') },
          { id: 'em_andamento', titulo: 'Fazendo', cor: '#2563eb', itens: todos.filter((i) => i.status === 'em_andamento') },
          { id: 'aguardando_terceiro', titulo: 'Aguardando terceiro', cor: '#7c3aed', itens: todos.filter((i) => i.status === 'aguardando_terceiro') },
          { id: 'aguardando_interno', titulo: 'Aguardando interno', cor: '#0891b2', itens: todos.filter((i) => i.status === 'aguardando_interno') },
        ]
        const soltarNaColuna = (col: string) => {
          const id = arrastando
          setArrastando(null); setColSobre(null)
          const it = todos.find((x) => x.id === id)
          if (!it || it.status === col) return
          void mudarStatus(it, col)
        }
        const zona = (col: string) => ({
          onDragOver: (e: React.DragEvent) => { if (!arrastando) return; e.preventDefault(); if (colSobre !== col) setColSobre(col) },
          onDragLeave: () => setColSobre((c) => (c === col ? null : c)),
          onDrop: (e: React.DragEvent) => { e.preventDefault(); soltarNaColuna(col) },
        })
        return (
          <div className="fp-kanban">
            {colunas.map((c) => (
              <section key={c.id} className={`fp-col${colSobre === c.id ? ' sobre' : ''}`} style={{ ['--c' as string]: c.cor }} {...zona(c.id)}>
                <div className="fp-col-cab"><i />{c.titulo}<span>{c.itens.length}</span></div>
                {c.itens.length === 0 && <div className="fp-col-vazia">Solte um cartão aqui</div>}
                {c.itens.map((i, k) => {
                  const vaiAtrasar = !!i.prazo && !i.continuo && i.fim > i.prazo
                  const corMes = i.continuo ? 'sem' : i.atrasado || vaiAtrasar ? 'ruim' : noMes(i) ? 'mes' : 'depois'
                  return (
                    <article key={i.id} className={`fp-cartao fp-anim${arrastando === i.id ? ' arrastando' : ''}${i.contestada ? ' contestada' : ''}`}
                      style={{ ['--d' as string]: `${Math.min(10, k) * 30}ms` }} draggable onMouseEnter={() => { void prefetchTicket(i.id) }}
                      onDragStart={(e) => { setArrastando(i.id); e.dataTransfer.effectAllowed = 'move' }}
                      onDragEnd={() => { setArrastando(null); setColSobre(null) }}
                      onClick={() => setAberto(i.id)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') setAberto(i.id) }}>
                      <div className="fp-tit"><span className="fp-num">#{i.numero}</span> {i.titulo}{i.urgente && <span className="fp-tag verm">urgente</span>}</div>
                      {i.descricao && <div className="fp-desc">{i.descricao}</div>}
                      {i.contestada && <div className="fp-contest">Contestada: {i.contestada.motivo}</div>}
                      <div className="fp-cartao-pe">
                        <span>{i.pedidoPor ? primeiro(i.pedidoPor) : 'Você'}</span>
                        <span className={`fp-tempo-mini${i.semEstimativa || !i.horas ? ' falta' : ''}`}>{i.semEstimativa || !i.horas ? 'sem tempo' : `${nf(i.horas)} h`}</span>
                        <span className={`fp-entrega ${corMes}`}>{i.continuo ? 'sem prazo' : `${diaSemana(i.fim)} ${dm(i.fim)}`}</span>
                      </div>
                    </article>
                  )
                })}
              </section>
            ))}
            <section className={`fp-col fp-col-fim${colSobre === 'resolvido' ? ' sobre' : ''}`} style={{ ['--c' as string]: '#15803d' }} {...zona('resolvido')}>
              <div className="fp-col-cab"><i />Concluir</div>
              <div className="fp-col-vazia">Solte aqui o que terminou. Quem pediu confirma.</div>
            </section>
          </div>
        )
      })()}

      {f && visao === 'lista' && (
        <>
          {/* Destaque (José): o que está em andamento fica num painel verde, com o ponto "ao vivo". */}
          <section className="fp-sec fp-agora">
            <div className="fp-sec-cab"><h2><i className="fp-vivo" aria-hidden /> Fazendo agora <span>{andamento.length}</span></h2>
              <p>{andamento.length ? 'Termine estas antes de puxar a próxima da fila.' : ''}</p></div>
            {andamento.length === 0 ? <div className="fp-vazio">Nada em andamento. Comece a primeira da fila.</div>
              : <div className="fp-tab">{cabTabela}{andamento.map((i) => linha(i, null))}</div>}
          </section>

          <section className="fp-sec" id="fp-na-fila">
            <div className="fp-sec-cab">
              <h2>Na fila <span>{fila.length}</span></h2>
              <p>Arraste para mudar a ordem. A entrega prevista conta 4,5 h de trabalho por dia.</p>
              <div className="fp-legenda">
                <span><i className="mes" /> entrega em {mes ? nomeMes(mes.mes + '-01') : 'este mês'}</span>
                <span><i className="depois" /> fica para {nomeMes(proximoMes)}</span>
                <span><i className="ruim" /> atrasada</span>
              </div>
            </div>
            {fila.length === 0 ? <div className="fp-vazio">Fila vazia.</div> : (
              <div className="fp-tab">
                {cabTabela}
                {fila.map((i, k) => (
                  <div key={i.id} style={{ display: 'contents' }}>
                    {k === viraMes && (
                      <div className="fp-vira" id="fp-vira">Daqui para baixo, fica para {nomeMes(proximoMes)}. Arraste para cima o que precisa sair antes.</div>
                    )}
                    {linha(i, k + 1)}
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {faxina && (
        <div className="fp-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) { setFaxina(false); carregar() } }}>
          <div className="fp-caixa fp-caixa-grande" role="dialog" aria-label="Faxina dos parados">
            <Faxina onFechar={() => { setFaxina(false); carregar() }} />
          </div>
        </div>
      )}
      {contestando && <Contestar item={contestando} onFechar={() => setContestando(null)} onFeito={() => { setContestando(null); carregar() }} />}
      {pedir && <FormTicket onFechar={() => setPedir(false)} onCriado={() => { setPedir(false); carregar() }} />}
      {novaSC && <FormSC onFechar={() => setNovaSC(false)} onCriado={(id) => { setNovaSC(false); setAberto(id) }} />}
      {aberto && <TicketModal id={aberto} onFechar={() => setAberto(null)} onMudou={() => carregar()} />}
    </div>
  )
}

/** Contestar: motivo pronto → WhatsApp de quem pediu. Sem celular: cadastra ali mesmo e reenvia. */
function Contestar({ item, onFechar, onFeito }: { item: ItemResumo; onFechar: () => void; onFeito: () => void }) {
  const [motivo, setMotivo] = useState('')
  const [detalhe, setDetalhe] = useState('')
  const [celular, setCelular] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ whats?: string; aviso?: string; pediu?: string | null } | null>(null)
  const quem = item.pedidoPor ? primeiro(item.pedidoPor) : 'quem pediu'

  const enviar = async () => {
    setEnviando(true); setErro('')
    try { setResultado(await acao(item.id, { acao: 'contestar', motivo, detalhe })) } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo') } finally { setEnviando(false) }
  }
  const reenviar = async () => {
    setEnviando(true); setErro('')
    try { setResultado(await acao(item.id, { acao: 'contestar_whats', celular })) } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo') } finally { setEnviando(false) }
  }
  const tirarMarca = async () => {
    setEnviando(true); setErro('')
    try { await acao(item.id, { acao: 'contestacao_limpar' }); onFeito() } catch (e) { setErro(e instanceof Error ? e.message : 'Não deu certo') } finally { setEnviando(false) }
  }

  return (
    <div className="fp-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) onFechar() }}>
      <style>{CSS_BASE + CSS}</style>
      <div className="fp-caixa" role="dialog" aria-label="Contestar tarefa">
        <h3>Contestar tarefa</h3>
        <p className="fp-sub">#{item.numero} {item.titulo}</p>

        {item.contestada && !resultado && (
          <div className="fp-ja">
            Já contestada: <b>{item.contestada.motivo}</b>.
            <button className="fp-link" disabled={enviando} onClick={tirarMarca}>Já resolvemos, tirar a marca</button>
          </div>
        )}

        {!resultado ? (
          <>
            <p className="fp-rot">Por quê? {quem} recebe no WhatsApp.</p>
            <div className="fp-motivos">
              {MOTIVOS.map((m) => <button key={m} className={motivo === m ? 'on' : ''} onClick={() => setMotivo(m)}>{m}</button>)}
            </div>
            <textarea value={detalhe} onChange={(e) => setDetalhe(e.target.value)} rows={3} placeholder="Explique em uma frase (opcional)" />
            {erro && <div className="fp-erro">{erro}</div>}
            <div className="fp-botoes">
              <button className="fraco" onClick={onFechar}>Voltar</button>
              <button className="forte" disabled={!motivo || enviando || (motivo === 'Outro motivo' && !detalhe.trim())} onClick={enviar}>{enviando ? 'Enviando…' : 'Contestar'}</button>
            </div>
          </>
        ) : resultado.whats === 'sem_celular' ? (
          <>
            <div className="fp-ok">Contestação registrada. A tarefa continua na sua fila, marcada.</div>
            <p className="fp-rot">{resultado.pediu ? primeiro(resultado.pediu) : quem} não tem celular no cadastro. Digite para mandar o WhatsApp:</p>
            <input value={celular} onChange={(e) => setCelular(e.target.value)} placeholder="(14) 99999-9999" inputMode="tel" autoFocus />
            {erro && <div className="fp-erro">{erro}</div>}
            <div className="fp-botoes">
              <button className="fraco" onClick={onFeito}>Agora não</button>
              <button className="forte" disabled={celular.replace(/\D/g, '').length < 10 || enviando} onClick={reenviar}>{enviando ? 'Enviando…' : 'Guardar e mandar'}</button>
            </div>
          </>
        ) : (
          <>
            {resultado.whats === 'enviado'
              ? <div className="fp-ok">Pronto. {resultado.pediu ? primeiro(resultado.pediu) : quem} recebeu a contestação no WhatsApp. A tarefa continua na sua fila, marcada.</div>
              : <div className="fp-aviso">Contestação registrada no pedido, mas o WhatsApp não saiu{resultado.aviso ? ` (${resultado.aviso})` : ''}. {quem} vê no sino do Portal.</div>}
            <div className="fp-botoes"><button className="forte" onClick={onFeito}>Fechar</button></div>
          </>
        )}
      </div>
    </div>
  )
}

// Contraste alto de propósito: texto #0f172a, secundário #334155 (o cinza claro "sumia").
const CSS = `
.fp-topo-dir{display:flex;align-items:center;gap:10px}
.fp-novo{position:relative}
.fp-novo-menu{position:absolute;right:0;top:calc(100% + 8px);z-index:30;min-width:280px;padding:6px;border-radius:14px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 20px 44px -18px rgba(15,23,42,.5);animation:fpSobe .2s ease both}
.fp-novo-menu button{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;padding:10px 12px;border:none;border-radius:10px;background:transparent;font:inherit;text-align:left;cursor:pointer;color:#0f172a}
.fp-novo-menu button:hover{background:#eff6ff}
.fp-novo-menu b{font-size:15px;font-weight:700}
.fp-novo-menu small{font-size:13px;color:#475569}
.fp-visao{display:inline-flex;padding:3px;border-radius:12px;background:#eef2f6;border:1px solid #e2e8f0}
.fp-visao button{height:34px;padding:0 16px;border:none;border-radius:9px;background:transparent;font:inherit;font-size:14px;font-weight:600;color:#475569;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s}
.fp-visao button.on{background:#fff;color:#0f172a;box-shadow:0 1px 3px rgba(15,23,42,.15)}
.fp-kanban{display:grid;grid-template-columns:repeat(4,minmax(240px,1fr)) minmax(160px,.6fr);gap:14px;margin-top:22px;align-items:start;overflow-x:auto;padding-bottom:6px}
.fp-col{display:flex;flex-direction:column;gap:10px;min-height:200px;padding:12px;border-radius:16px;background:#f1f5f9;border:2px solid transparent;transition:border-color .15s,background .15s}
.fp-col.sobre{border-color:var(--c);background:color-mix(in srgb,var(--c) 8%,#f8fafc)}
.fp-col-cab{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;padding:2px 4px}
.fp-col-cab i{width:10px;height:10px;border-radius:50%;background:var(--c)}
.fp-col-cab span{margin-left:auto;min-width:24px;padding:0 8px;border-radius:999px;background:#fff;font-size:13px;line-height:22px;text-align:center;color:#0f172a}
.fp-col-vazia{padding:18px 12px;border-radius:12px;border:1.5px solid #cbd5e1;border-style:solid;color:#64748b;font-size:13.5px;text-align:center;background:rgba(255,255,255,.5)}
.fp-col-fim .fp-col-vazia{min-height:120px;display:grid;place-items:center}
.fp-cartao{display:flex;flex-direction:column;gap:8px;padding:12px 14px;border-radius:12px;background:#fff;border:1px solid #e2e8f0;box-shadow:0 1px 2px rgba(15,23,42,.05);cursor:grab;transition:transform .15s,box-shadow .15s,border-color .15s}
.fp-cartao:hover{transform:translateY(-2px);box-shadow:0 12px 24px -16px rgba(15,23,42,.5);border-color:#94a3b8}
.fp-cartao.arrastando{opacity:.4}
.fp-cartao.contestada{background:#fef2f2;border-color:#fecaca}
.fp-cartao .fp-tit{font-size:15px}
.fp-cartao .fp-desc{margin-top:0}
.fp-cartao-pe{display:flex;align-items:center;gap:8px;flex-wrap:wrap;font-size:13px;color:#334155}
.fp-cartao-pe .fp-entrega{margin-left:auto;font-size:13px;padding:2px 8px}
.fp-tempo-mini{padding:1px 8px;border-radius:6px;border:1px solid #cbd5e1;font-weight:600;color:#0f172a}
.fp-tempo-mini.falta{border-color:#fca5a5;color:#b91c1c;animation:fpPulsa 1.6s ease-in-out infinite}
@media (max-width:900px){.fp-kanban{grid-template-columns:repeat(5,minmax(240px,82vw))}}`
const CSS_BASE = `
.fp{width:100%;box-sizing:border-box;padding:12px clamp(12px,2vw,28px) 48px;color:#0f172a;font-size:15px}
.fp .ruim,.fp small.ruim{color:#b91c1c}
.fp-topo{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:4px 0 14px}
.fp-topo p{margin:0;font-size:16px;color:#334155}
.fp-topo p b{color:#0f172a;font-weight:700}
.fp-btn{height:42px;padding:0 20px;border-radius:12px;border:1px solid #2563eb;background:#2563eb;color:#fff;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer;transition:transform .15s,box-shadow .15s,background .15s}
.fp-btn:hover{background:#1d4ed8;transform:translateY(-1px);box-shadow:0 10px 20px -12px rgba(37,99,235,.8)}
/* Cartões do mês */
.fp-cards{display:grid;grid-template-columns:repeat(4,minmax(130px,1fr)) minmax(220px,1.6fr) minmax(220px,1.4fr);gap:12px}
.fp-card{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:6px;padding:14px 16px;border-radius:14px;border:1px solid #e2e8f0;background:#fff;text-decoration:none;color:#0f172a;font:inherit;text-align:left;cursor:pointer;transition:transform .2s,box-shadow .2s,border-color .2s}
.fp-card:hover{transform:translateY(-2px);box-shadow:0 14px 28px -20px rgba(15,23,42,.55);border-color:#94a3b8}
.fp-card:focus-visible{outline:2px solid #0f172a;outline-offset:2px}
.fp-card.on{border-color:#0f172a;box-shadow:0 0 0 1px #0f172a}
.fp-card .fp-barra{width:100%}
.fp-ver{font-style:normal;font-size:13px;font-weight:600;color:#475569;margin-top:auto}
.fp-card:hover .fp-ver,.fp-card.on .fp-ver{color:#0f172a}
.fp-lista-mes{margin-top:12px;border:1px solid #0f172a;border-radius:14px;background:#fff;overflow:hidden}
.fp-lista-cab{display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-size:15px}
.fp-lista-cab button{border:none;background:none;font:inherit;font-size:14px;font-weight:600;color:#475569;cursor:pointer;text-decoration:underline}
.fp-lista-it{display:flex;align-items:baseline;gap:8px;width:100%;padding:10px 16px;border:none;border-top:1px solid #eef2f6;background:#fff;font:inherit;font-size:15px;font-weight:600;color:#0f172a;text-align:left;cursor:pointer}
.fp-lista-it:first-of-type{border-top:none}
.fp-lista-it:hover{background:#f8fafc}
.fp-lista-it small{margin-left:auto;font-size:13px;font-weight:500;color:#475569;white-space:nowrap}
.fp-lista-vazia{padding:14px 16px;font-size:14.5px;color:#475569}
.fp-card span{font-size:13.5px;font-weight:600;color:#475569}
.fp-card b{font-size:30px;font-weight:700;line-height:1;font-variant-numeric:tabular-nums}
.fp-card b small{font-size:14px;font-weight:600;color:#475569}
.fp-card.ok b{color:#15803d}
.fp-card.faxina{background:#eef4ff;border-color:#93b4fd}
.fp-card.faxina span,.fp-card.faxina em{color:#1e40af}
.fp-card.faxina b{color:#2563eb}
.fp-card.faxina em{font-style:normal;font-size:14px;font-weight:700;text-decoration:underline;text-underline-offset:3px}
.fp-card.faxina:hover{border-color:#60a5fa}
.fp-barra{display:block;height:8px;border-radius:999px;background:#e2e8f0;overflow:hidden;margin-top:auto}
.fp-barra > i{display:block;height:100%;border-radius:999px;background:#22c55e;animation:fpEnche .9s cubic-bezier(.2,.8,.2,1) both}
.fp-barra.duas{background:#fdba74}
@keyframes fpEnche{from{width:0}}
/* Entrada: cartões e linhas sobem um pouco, um depois do outro */
.fp-anim{animation:fpSobe .45s cubic-bezier(.2,.8,.2,1) both;animation-delay:var(--d,0ms)}
@keyframes fpSobe{from{opacity:0;transform:translateY(8px)}}
@media (prefers-reduced-motion:reduce){.fp-anim,.fp-barra > i,.fp-tempo.falta{animation:none!important}}
@media (max-width:1200px){.fp-cards{grid-template-columns:repeat(2,minmax(0,1fr))}.fp-card.largo,.fp-card.faxina{grid-column:span 1}}
.fp-sec{margin-top:26px}
.fp-sec-cab{display:flex;align-items:baseline;gap:8px 16px;flex-wrap:wrap;margin-bottom:10px}
/* Destaque sem cor de fundo (José: "tira essa cor"): painel branco, borda escura e sombra. */
/* "Deixa uma corzinha" (José): azul bem claro no fundo, borda azul suave; as linhas seguem brancas. */
.fp-agora{padding:16px 18px 18px;border-radius:18px;background:linear-gradient(180deg,#eef4ff,#f6f9ff);border:1.5px solid #bfd3fe;box-shadow:0 18px 40px -30px rgba(37,99,235,.55)}
.fp-agora .fp-sec-cab h2{display:flex;align-items:center;gap:8px;color:#1e3a8a}
.fp-agora .fp-sec-cab h2 span{background:#2563eb;color:#fff}
.fp-agora .fp-sec-cab p{color:#1e40af}
.fp-agora .fp-tab{border:1px solid #dbe6fe;box-shadow:none;border-radius:12px}
.fp-agora .fp-cab-tab{background:#f8faff}
.fp-agora .fp-lin:hover{background:#f5f8ff}
.fp-agora .fp-vivo{background:#2563eb;animation-name:fpVivoAzul}
@keyframes fpVivoAzul{0%,100%{box-shadow:0 0 0 0 rgba(37,99,235,.55)}50%{box-shadow:0 0 0 7px rgba(37,99,235,0)}}
.fp-agora .fp-vazio{background:#fff;border-color:#bfd3fe}
.fp-vivo{width:10px;height:10px;border-radius:50%;background:#22c55e;display:inline-block;animation:fpVivo 1.6s ease-in-out infinite}
@keyframes fpVivo{0%,100%{box-shadow:0 0 0 0 rgba(34,197,94,.6)}50%{box-shadow:0 0 0 7px rgba(34,197,94,0)}}
@media (prefers-reduced-motion:reduce){.fp-vivo{animation:none}}
.fp-sec-cab h2{margin:0;font-size:18px;font-weight:700}
.fp-sec-cab h2 span{display:inline-block;min-width:24px;padding:0 8px;margin-left:4px;border-radius:999px;background:#e2e8f0;color:#0f172a;font-size:13px;font-weight:600;text-align:center;line-height:22px;vertical-align:2px}
.fp-sec-cab p{margin:0;font-size:14px;color:#475569}
.fp-legenda{display:flex;gap:14px;flex-wrap:wrap;margin-left:auto;font-size:13.5px;color:#334155}
.fp-legenda span{display:inline-flex;align-items:center;gap:6px}
.fp-legenda i{width:12px;height:12px;border-radius:4px;display:inline-block}
.fp-legenda i.mes,.fp-entrega.mes{background:#dcfce7;color:#166534}
.fp-legenda i.depois,.fp-entrega.depois{background:#ffedd5;color:#9a3412}
.fp-legenda i.ruim,.fp-entrega.ruim{background:#fee2e2;color:#b91c1c}
.fp-tab{border:1px solid #e2e8f0;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,.04)}
.fp-lin{display:grid;grid-template-columns:52px minmax(0,1fr) 110px 110px 90px 170px 200px;gap:16px;align-items:center;padding:14px 20px;border-top:1px solid #eef2f6;cursor:pointer;transition:background .15s,transform .15s}
.fp-tab > .fp-lin:first-child{border-top:none}
.fp-lin:hover{background:#f8fafc}
.fp-lin:focus-visible{outline:2px solid #0f172a;outline-offset:-2px}
.fp-lin[draggable="true"]{cursor:grab}
.fp-lin.arrastando{opacity:.4}
.fp-lin.sobre{box-shadow:inset 0 3px 0 #0f172a}
.fp-lin.contestada{background:#fef2f2}
.fp-cab-tab{cursor:default!important;padding-top:10px;padding-bottom:10px;background:#f8fafc;font-size:13px;font-weight:600;color:#475569}
.fp-pos{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:700;font-variant-numeric:tabular-nums}
.fp-alca{color:#94a3b8;font-size:16px;font-weight:400}
.fp-lin:hover .fp-alca{color:#0f172a}
.fp-tarefa{min-width:0}
.fp-tit{font-size:15.5px;font-weight:600;line-height:1.35}
.fp-num{color:#475569;font-weight:500;font-variant-numeric:tabular-nums}
.fp-desc{margin-top:4px;font-size:14px;line-height:1.45;color:#334155;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.fp-desc.vazia{color:#94a3b8;font-style:italic}
.fp-contest{margin-top:6px;font-size:13.5px;font-weight:600;color:#b91c1c}
.fp-tag{display:inline-block;margin-left:8px;padding:1px 8px;border-radius:6px;background:#f1f5f9;color:#334155;font-size:12.5px;font-weight:600;vertical-align:1px}
.fp-tag.verm{background:#fee2e2;color:#b91c1c}
.fp-cel{font-size:14.5px;color:#0f172a;font-variant-numeric:tabular-nums;display:flex;flex-direction:column;align-items:flex-start;gap:3px}
.fp-cel small{font-size:13px;color:#475569}
.fp-entrega{display:inline-block;padding:3px 10px;border-radius:8px;font-weight:700;font-size:14.5px}
.fp-entrega.sem{background:#f1f5f9;color:#334155}
.fp-tempo{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:4px 10px;font:inherit;font-size:14px;font-weight:600;color:#0f172a;cursor:pointer}
.fp-tempo:hover{border-color:#0f172a}
.fp-tempo.falta{color:#b91c1c;border-color:#fca5a5;background:#fff;animation:fpPulsa 1.6s ease-in-out infinite}
@keyframes fpPulsa{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,.45)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}
.fp-chips{grid-column:2/-1;display:flex;flex-wrap:wrap;align-items:center;gap:6px;font-size:14px;color:#334155}
.fp-chips button{height:32px;padding:0 12px;border-radius:999px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:14px;font-weight:600;color:#0f172a;cursor:pointer}
.fp-chips button:hover{border-color:#0f172a}
.fp-chips button.fraco{border:none;color:#475569;font-weight:500}
.fp-acao{display:flex;justify-content:flex-end;gap:6px}
.fp-acao button{height:34px;padding:0 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;color:#0f172a;font:inherit;font-size:14px;font-weight:600;cursor:pointer;opacity:0;transition:opacity .15s}
.fp-acao button.fraco{border-color:transparent;color:#475569;font-weight:500}
.fp-acao button.fraco:hover{color:#b91c1c;border-color:#fecaca}
.fp-lin:hover .fp-acao button,.fp-acao button:focus-visible{opacity:1}
.fp-acao button:hover{border-color:#0f172a}
.fp-acao button:disabled{opacity:.5;cursor:default}
@media (hover:none){.fp-acao button{opacity:1}}
.fp-vira{padding:10px 18px;background:#eef4ff;border-top:2px solid #93b4fd;font-size:14px;font-weight:600;color:#1e40af}
.fp-vazio{padding:18px;border:1px solid #e2e8f0;border-radius:12px;color:#475569;font-size:14.5px}
.fp-erro{margin-top:12px;padding:12px 16px;border-radius:10px;background:#fee2e2;color:#991b1b;font-size:14.5px}
.fp-fundo{position:fixed;inset:0;z-index:1000;background:rgba(15,23,42,.45);display:flex;align-items:center;justify-content:center;padding:16px}
.fp-caixa-grande{max-width:960px!important;max-height:90vh;overflow-y:auto;padding:10px!important}
.fp-caixa{width:100%;max-width:480px;background:#fff;border-radius:14px;padding:22px;color:#0f172a;box-shadow:0 20px 60px rgba(0,0,0,.3)}
.fp-caixa h3{margin:0;font-size:19px;font-weight:700}
.fp-sub{margin:4px 0 14px;font-size:14.5px;color:#334155}
.fp-rot{margin:0 0 8px;font-size:14.5px;font-weight:600}
.fp-motivos{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:10px}
.fp-motivos button{padding:8px 12px;border-radius:999px;border:1px solid #cbd5e1;background:#fff;font:inherit;font-size:14px;color:#0f172a;cursor:pointer}
.fp-motivos button.on{border-color:#0f172a;background:#0f172a;color:#fff}
.fp-caixa textarea,.fp-caixa input{width:100%;box-sizing:border-box;padding:10px 12px;border-radius:10px;border:1px solid #cbd5e1;font:inherit;font-size:14.5px;color:#0f172a;resize:vertical}
.fp-botoes{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.fp-botoes button{height:40px;padding:0 16px;border-radius:10px;font:inherit;font-size:14.5px;font-weight:600;cursor:pointer}
.fp-botoes .fraco{border:1px solid #cbd5e1;background:#fff;color:#0f172a}
.fp-botoes .forte{border:none;background:#0f172a;color:#fff}
.fp-botoes .forte:disabled{opacity:.4;cursor:default}
.fp-ok{padding:10px 12px;border-radius:10px;background:#dcfce7;color:#166534;font-size:14.5px;margin-bottom:12px}
.fp-aviso{padding:10px 12px;border-radius:10px;background:#fff7ed;color:#9a3412;font-size:14.5px}
.fp-ja{display:flex;flex-wrap:wrap;gap:8px;align-items:center;padding:10px 12px;margin-bottom:12px;border-radius:10px;background:#fef2f2;color:#991b1b;font-size:14px}
.fp-link{border:none;background:none;padding:0;font:inherit;font-weight:700;color:#0f172a;text-decoration:underline;cursor:pointer}
@media (max-width:980px){
  .fp-cab-tab{display:none!important}
  .fp-lin{grid-template-columns:40px minmax(0,1fr);gap:6px 12px;align-items:start}
  .fp-lin > .fp-cel,.fp-lin > .fp-acao,.fp-chips{grid-column:2}
  .fp-cel{flex-direction:row;flex-wrap:wrap;align-items:center;gap:6px}
  .fp-cel::before{content:attr(data-rot) ':';color:#475569}
  .fp-acao{justify-content:flex-start;margin-top:6px}
  .fp-legenda{margin-left:0}
}
`
