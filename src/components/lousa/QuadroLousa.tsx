'use client'
// QUADRO DA LOUSA — inspirado no quadro branco da oficina (foto do José, 20/10/2026):
// linhas = técnicos, colunas = segunda a sábado, cartões = OS (e lançamentos da Lousa),
// FAIXA VERMELHA = embaixo dela ficam as OS PENDENTES (sem dia marcado).
// Arrastar o cartão para outro dia/técnico muda a OS; arrastar para baixo da faixa deixa pendente.
// Nesta versão de TESTE o arrastar é só SIMULADO: mostra o que aconteceria e não grava nada.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, RotateCcw, Info, MapPin, Wrench, Pin } from 'lucide-react'
import FichaOS from './FichaOS'
import { corStatusOS, faseCurta } from './status'
import { authHeaders } from '@/lib/auth/client'
import { addDias, localDe, diaDaSemana } from '@/lib/salas/regras'
import type { ItemAgenda, Pessoa } from '@/lib/agenda/regras'

export type VarianteQuadro = 'parede' | 'semana' | 'lousa'

interface Pendente { id: string; cliente: string | null; tecnico: string | null; status: string | null; cidade: string | null; oficina: boolean; solicitacao: string | null; criadaEm: string | null; dia?: string | null }
interface Dados { pessoas: Pessoa[]; itens: ItemAgenda[]; pendentes: Pendente[]; avisos?: string[]; agora: { dia: string }; podeEditar?: boolean; pendenteAtivo?: boolean }

/** o que foi arrastado (simulado): dias novos (null = pendente) e técnico novo */
interface Mudanca { dias: string[] | null; pessoa?: string }
interface Aviso { id: number; texto: string }

const NOMES_DIA = ['DOMINGO', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO']
const segundaDe = (dia: string) => { const w = diaDaSemana(dia); return addDias(dia, w === 0 ? -6 : 1 - w) }
const ddmm = (dia: string) => `${dia.slice(8, 10)}/${dia.slice(5, 7)}`
const curtoDia = (dia: string) => `${NOMES_DIA[diaDaSemana(dia)].slice(0, 3).toLowerCase()} ${ddmm(dia)}`
const semZeros = (id: string) => id.replace(/^OS-?/i, '').replace(/^0+(?=\d)/, '')

/** dias (YYYY-MM-DD) que o item ocupa, sem domingo */
function diasDoItem(i: ItemAgenda): string[] {
  const ini = localDe(i.inicio).dia
  if (!i.diaInteiro) return [ini]
  const fim = addDias(localDe(i.fim).dia, -1)
  const out: string[] = []
  for (let d = ini; d <= fim && out.length < 40; d = addDias(d, 1)) if (diaDaSemana(d) !== 0) out.push(d)
  return out.length ? out : [ini]
}
/** horário combinado da OS naquele dia ("08:00") ou null */
function horaDe(it: ItemAgenda, dia: string): string | null {
  const ex = it.extra as { horas?: Record<string, string>; hora?: string | null } | undefined
  return ex?.horas?.[dia] || ex?.hora || null
}
function deslocar(dias: string[], delta: number): string[] {
  return dias.map((d) => { let n = addDias(d, delta); if (diaDaSemana(n) === 0) n = addDias(n, delta >= 0 ? 1 : -1); return n })
}

/** gravar = Lousa de verdade (o arrastar muda a OS); sem gravar = página de teste (só simula). */
export default function QuadroLousa({ variante, gravar = false, acoes }: { variante: VarianteQuadro; gravar?: boolean; acoes?: React.ReactNode }) {
  const [recarga, setRecarga] = useState(0)
  const [ficha, setFicha] = useState<string | null>(null) // OS aberta pelo clique no cartão
  const [dados, setDados] = useState<Dados | null>(null)
  const [erro, setErro] = useState('')
  const [ini, setIni] = useState<string | null>(null)
  const [mudancas, setMudancas] = useState<Record<string, Mudanca>>({})
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [sobre, setSobre] = useState<string | null>(null) // célula com o cartão por cima (arrastando)
  // mais de uma OS no mesmo dia: 'pilha' (um na frente, os outros atrás, com animação) ou 'lista' (um embaixo do outro)
  const [varios, setVarios] = useState<'pilha' | 'lista'>('pilha')
  const [abertas, setAbertas] = useState<Set<string>>(() => new Set())
  const [pedirHora, setPedirHora] = useState<{ ref: string; dia: string; cliente: string; hora: string } | null>(null)
  useEffect(() => { try { if (localStorage.getItem('lousa-varios') === 'lista') void Promise.resolve().then(() => setVarios('lista')) } catch { /* sem storage */ } }, [])
  const escolherVarios = (v: 'pilha' | 'lista') => { setVarios(v); setAbertas(new Set()); try { localStorage.setItem('lousa-varios', v) } catch { /* sem storage */ } }

  const semanas = variante === 'parede' ? 2 : 1
  useEffect(() => { void Promise.resolve().then(() => setIni((x) => x || segundaDe(localDe(new Date().toISOString()).dia))) }, [])

  useEffect(() => {
    if (!ini) return
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/lousa/quadro?de=${ini}&ate=${addDias(ini, 13)}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.error || 'Não deu para carregar o quadro.'); return }
        setErro(''); setDados(j)
        if (gravar) setMudancas({}) // o que foi gravado já veio do banco
      } catch { if (vivo) setErro('Sem conexão.') }
    })()
    return () => { vivo = false }
  }, [ini, recarga, gravar])
  // de volta à aba: relê (alguém pode ter mudado a OS no POS)
  useEffect(() => {
    if (!gravar) return
    const f = () => setRecarga((x) => x + 1)
    window.addEventListener('focus', f)
    const t = setInterval(f, 2 * 60_000)
    return () => { window.removeEventListener('focus', f); clearInterval(t) }
  }, [gravar])

  const avisar = useCallback((texto: string) => {
    const id = Date.now() + Math.random()
    setAvisos((l) => [{ id, texto }, ...l].slice(0, 4))
    setTimeout(() => setAvisos((l) => l.filter((a) => a.id !== id)), 7000)
  }, [])

  const hoje = dados?.agora.dia || ''
  const colunas = useMemo(() => {
    if (!ini) return [] as string[][]
    return Array.from({ length: semanas }, (_, s) => Array.from({ length: 6 }, (_, d) => addDias(ini, s * 7 + d)))
  }, [ini, semanas])

  const pessoasPorId = useMemo(() => new Map((dados?.pessoas || []).map((p) => [p.id, p])), [dados])
  const nomeCurto = (id?: string) => (id ? (pessoasPorId.get(id)?.tecnicoNome || pessoasPorId.get(id)?.nome || '').split(' ')[0] : '')

  // onde cada cartão está (com as mudanças simuladas aplicadas)
  const { celulas, pendentesSim } = useMemo(() => {
    const cel = new Map<string, { item: ItemAgenda; n: number; total: number }[]>()
    const pend: ItemAgenda[] = []
    for (const it of dados?.itens || []) {
      const m = mudancas[it.id]
      if (m && m.dias === null) { pend.push(it); continue }
      const dias = m?.dias || diasDoItem(it)
      const pessoas = m?.pessoa ? [m.pessoa] : it.pessoas
      dias.forEach((d, n) => pessoas.forEach((p) => {
        const k = `${p}|${d}`
        cel.set(k, [...(cel.get(k) || []), { item: it, n, total: dias.length }])
      }))
    }
    // com mais de uma no dia, quem tem horário mais cedo vem primeiro (sem horário vai por último)
    for (const [k, l] of cel) {
      const dia = k.split('|')[1]
      l.sort((a, b) => (horaDe(a.item, dia) || '99:99').localeCompare(horaDe(b.item, dia) || '99:99'))
    }
    return { celulas: cel, pendentesSim: pend }
  }, [dados, mudancas])

  // pendentes reais que foram arrastadas para um dia (simulado)
  const pendentesMovidas = useMemo(() => Object.entries(mudancas).filter(([k, m]) => k.startsWith('pend:') && m.dias), [mudancas])
  const linhas = useMemo(() => {
    const ps = (dados?.pessoas || []).filter((p) => p.tecnico)
    return ps.filter((p) => p.id !== 'sem-tecnico' || [...celulas.keys()].some((k) => k.startsWith('sem-tecnico|')))
  }, [dados, celulas])

  // ---------- gravar na OS (Lousa de verdade)
  const salvar = async (corpo: Record<string, unknown>, chave: string, texto: string): Promise<boolean> => {
    try {
      const r = await fetch('/api/lousa/quadro', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify(corpo) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Não deu para gravar.')
      avisar(texto); setRecarga((x) => x + 1)
      return true
    } catch (err) {
      avisar('Não gravou: ' + (err as Error).message)
      setMudancas((m) => { const n = { ...m }; delete n[chave]; return n })
      return false
    }
  }
  const salvarHora = async () => {
    if (!pedirHora) return
    const p = pedirHora; setPedirHora(null)
    await salvar({ acao: 'editar', ref: p.ref, hora: p.hora || null }, '', `Horário gravado na OS — ${p.ref} às ${p.hora}.`)
  }

  // ---------- arrastar (no teste só simula; com gravar muda a OS)
  const soltar = (e: React.DragEvent, alvo: { pessoa: string; dia: string } | 'pendente') => {
    e.preventDefault(); setSobre(null)
    if (gravar && !dados?.podeEditar) { avisar('Você não tem permissão para mexer na Lousa.'); return }
    let d: { tipo: 'item' | 'pend'; id: string; dia?: string; pessoa?: string }
    try { d = JSON.parse(e.dataTransfer.getData('text/plain')) } catch { return }
    if (d.tipo === 'pend') {
      const p = dados?.pendentes.find((x) => x.id === d.id)
      if (!p || alvo === 'pendente') return
      setMudancas((m) => ({ ...m, ['pend:' + d.id]: { dias: [alvo.dia], pessoa: alvo.pessoa } }))
      const txt = `${p.id} (${p.cliente || 'cliente'}): ${curtoDia(alvo.dia)} com ${nomeCurto(alvo.pessoa) || 'esse técnico'}, fora das pendentes`
      if (gravar) void salvar({ acao: 'mover', fonte: 'os', ref: p.id, origem: null, destino: alvo.dia, de: null, para: alvo.pessoa }, 'pend:' + d.id, `Gravado na OS — ${txt}.`)
      else avisar(`Ficaria assim — ${txt}.`)
      return
    }
    const it = dados?.itens.find((x) => x.id === d.id)
    if (!it) return
    const os = it.fonte === 'os'
    const nome = os ? `A ${it.ref}` : 'O lançamento da Lousa'
    if (alvo === 'pendente') {
      if (!os) { avisar('Só OS vai para as pendentes.'); return }
      if (gravar && dados?.pendenteAtivo === false) { avisar('Para usar as pendentes, falta rodar sql/lousa-pendente.sql no Supabase.'); return }
      setMudancas((m) => ({ ...m, [it.id]: { dias: null } }))
      if (gravar) void salvar({ acao: 'pendente', fonte: 'os', ref: it.ref }, it.id, `Gravado — ${it.ref} ficou PENDENTE (a data de execução continua na OS) e já aparece em Pendentes no POS.`)
      else avisar(`${nome} ficaria PENDENTE — a data de execução continua na OS, e ela aparece em Pendentes no POS.`)
      return
    }
    const atual = mudancas[it.id]?.dias || diasDoItem(it)
    const origem = d.dia || atual[0]
    const delta = Math.round((new Date(alvo.dia + 'T12:00:00Z').getTime() - new Date(origem + 'T12:00:00Z').getTime()) / 86_400_000)
    const novos = delta ? deslocar(atual, delta) : atual
    const pessoaAntes = mudancas[it.id]?.pessoa || d.pessoa || it.pessoas[0]
    const trocouTecnico = alvo.pessoa !== pessoaAntes
    if (!delta && !trocouTecnico) return
    setMudancas((m) => ({ ...m, [it.id]: { dias: novos, pessoa: alvo.pessoa } }))
    const partes: string[] = []
    if (delta) partes.push(novos.length > 1 ? `de ${curtoDia(atual[0])}–${curtoDia(atual[atual.length - 1])} para ${curtoDia(novos[0])}–${curtoDia(novos[novos.length - 1])}` : `de ${curtoDia(atual[0])} para ${curtoDia(novos[0])}`)
    if (trocouTecnico) partes.push(`do ${nomeCurto(pessoaAntes) || 'sem técnico'} para o ${nomeCurto(alvo.pessoa) || 'sem técnico'}`)
    const ocupada = os && (celulas.get(`${alvo.pessoa}|${alvo.dia}`) || []).some((c) => c.item.fonte === 'os' && c.item.ref !== it.ref)
    if (gravar) void salvar({ acao: 'mover', fonte: it.fonte, ref: it.ref, origem, destino: alvo.dia, de: pessoaAntes, para: alvo.pessoa }, it.id, `Gravado${os ? ' na OS' : ''} — ${nome} passou ${partes.join(' e ')}.`)
      .then((ok) => { if (ok && ocupada) setPedirHora({ ref: it.ref, dia: alvo.dia, cliente: it.titulo.replace(/^[^·]*·\s*/, ''), hora: horaDe(it, origem) || '' }) })
    else avisar(`${nome} passaria ${partes.join(' e ')}${os ? ' — a data também mudaria na OS.' : '.'}`)
  }
  const arrastar = (e: React.DragEvent, d: { tipo: 'item' | 'pend'; id: string; dia?: string; pessoa?: string }) => {
    e.dataTransfer.setData('text/plain', JSON.stringify(d)); e.dataTransfer.effectAllowed = 'move'
  }

  if (!ini) return null
  const mudou = Object.keys(mudancas).length > 0
  const fimJanela = addDias(ini, semanas * 7 - 2)
  const titulo = `${ddmm(ini)} a ${ddmm(fimJanela)}`

  const pode = !gravar || !!dados?.podeEditar
  const abrir = (os: string | null) => {
    if (!os) return
    if (gravar) setFicha(os)
    else avisar('Na Lousa de verdade, o clique abre a ficha da OS para alterar (dia, técnico, fase, observações).')
  }
  const tecnicosNomes = (dados?.pessoas || []).filter((p) => p.tecnico && p.id !== 'sem-tecnico').map((p) => (p.tecnicoNome || p.nome).toUpperCase())
  const cartaoItem = (c: { item: ItemAgenda; n: number; total: number }, dia: string, pessoa: string, ordem?: string | null) => {
    const it = c.item
    const os = it.fonte === 'os'
    const tipo = (it.extra as { tipo?: string } | undefined)?.tipo
    if (!os && (tipo === 'feriado' || tipo === 'faltou' || tipo === 'saida')) {
      return (
        <div key={it.id + dia} className="ql-ausente" draggable={pode} onDragStart={(e) => arrastar(e, { tipo: 'item', id: it.id, dia, pessoa })} title={it.titulo}>
          <span className="ql-traco" style={{ background: it.cor || '#dc2626' }} /><small>{it.titulo}</small>
        </div>
      )
    }
    const situacao = it.detalhes?.find((x) => x[0] === 'Situação')?.[1]
    const cor = corStatusOS(situacao)
    return (
      <div key={it.id + dia} className={`ql-card ${os ? 'os' : 'lousa'} ${it.esmaecido ? 'apagado' : ''} ${mudancas[it.id] ? 'mexido' : ''}`}
        draggable={pode} onDragStart={(e) => arrastar(e, { tipo: 'item', id: it.id, dia, pessoa })}
        onClick={() => abrir(os ? it.ref : null)} title={os ? 'Clique para abrir a OS · arraste para mudar o dia ou o técnico' : it.titulo}>
        <div className="ql-card-topo">
          <span className={`ql-num ${os ? '' : 'lousa'}`}>{os ? `OS ${semZeros(it.ref)}` : 'LOUSA'}</span>
          {os && situacao && <span className="ql-st" style={{ color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>{faseCurta(situacao)}</span>}
        </div>
        {ordem && <div className={`ql-ordem ${/sem hor/.test(ordem) ? 'falta' : ''}`}>{ordem}</div>}
        <div className="ql-cli">{os ? it.titulo.replace(/^[^·]*·\s*/, '') : it.titulo}</div>
        {variante !== 'parede' && it.descricao && <div className="ql-desc">{it.descricao}</div>}
        {(it.local || c.total > 1) && (
          <div className="ql-rodape">
            {it.local && <span className="ql-local">{/oficina/i.test(it.local) ? <Wrench size={11} /> : <MapPin size={11} />} {it.local}</span>}
            {c.total > 1 && <span className="ql-dias">dia {c.n + 1} de {c.total}</span>}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className={`ql ql-${variante}`}>
      <style>{CSS_QUADRO}</style>
      <div className="ql-barra">
        <button className="ql-nav" onClick={() => setIni(addDias(ini, -7))} title="Semana anterior"><ChevronLeft size={18} /></button>
        <button className="ql-hoje" onClick={() => setIni(segundaDe(hoje || ini))}>Hoje</button>
        <button className="ql-nav" onClick={() => setIni(addDias(ini, 7))} title="Próxima semana"><ChevronRight size={18} /></button>
        <b className="ql-titulo">{titulo}</b>
        {!gravar && <span className="ql-teste"><Info size={13} /> Teste: arrastar mostra o que mudaria na OS, mas ainda não grava.</span>}
        {gravar && <span className="ql-dica">Arraste o cartão para outro dia ou técnico — muda na OS. Embaixo da faixa vermelha fica pendente.</span>}
        {mudou && !gravar && <button className="ql-reset" onClick={() => setMudancas({})}><RotateCcw size={13} /> Desfazer tudo</button>}
        <div className="ql-seg" title="Quando o técnico tem mais de uma OS no dia">
          <span>Vários no dia</span>
          <button className={varios === 'pilha' ? 'on' : ''} onClick={() => escolherVarios('pilha')}>Pilha</button>
          <button className={varios === 'lista' ? 'on' : ''} onClick={() => escolherVarios('lista')}>Lista</button>
        </div>
        {acoes}
      </div>
      {erro && <div className="ql-erro">{erro}</div>}
      {!dados && !erro && <div className="ql-carregando">Carregando o quadro…</div>}

      {dados && (
        <div className="ql-moldura">
          <div className="ql-grade" style={{ gridTemplateColumns: Array.from({ length: semanas }, () => 'minmax(110px, auto) repeat(6, minmax(0, 1fr))').join(' ') }}>
            {/* cabeçalho */}
            {colunas.map((dias, s) => [
              <div key={`h${s}`} className={`ql-cab ql-cab-sem ${s > 0 ? 'ql-div' : ''}`}><small>{ddmm(dias[0])} a {ddmm(dias[5])}</small></div>,
              ...dias.map((d) => (
                <div key={`h${d}`} className={`ql-cab ${d === hoje ? 'hoje' : ''}`}><small>{ddmm(d)}</small><b>{NOMES_DIA[diaDaSemana(d)]}</b></div>
              )),
            ])}
            {/* linhas dos técnicos */}
            {linhas.map((p, li) => colunas.map((dias, s) => [
              <div key={`n${p.id}${s}`} className={`ql-nome ${s > 0 ? 'ql-div' : ''} ${li % 2 ? 'par' : ''}`}>
                <span className="ql-av" style={{ background: p.id === 'sem-tecnico' ? '#94a3b8' : p.cor }}>
                  {p.avatar_url ? <img src={p.avatar_url} alt="" /> : (p.id === 'sem-tecnico' ? '?' : (p.tecnicoNome || p.nome).split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase())}
                </span>
                <span className="ql-nome-txt">
                  <b>{p.id === 'sem-tecnico' ? 'SEM TÉCNICO' : (p.tecnicoNome || p.nome).split(' ')[0].toUpperCase()}</b>
                  <small>{(() => { const n = new Set(dias.flatMap((d) => (celulas.get(`${p.id}|${d}`) || []).filter((c) => c.item.fonte === 'os').map((c) => c.item.ref))).size; return n ? `${n} OS na semana` : 'livre na semana' })()}</small>
                </span>
              </div>,
              ...dias.map((d) => {
                const k = `${p.id}|${d}`
                const pend = pendentesMovidas.filter(([, m]) => m.pessoa === p.id && m.dias?.[0] === d)
                return (
                  <div key={k} className={`ql-cel ${d === hoje ? 'hoje' : ''} ${sobre === k ? 'sobre' : ''} ${li % 2 ? 'par' : ''}`}
                    onDragOver={(e) => { e.preventDefault(); if (sobre !== k) setSobre(k) }} onDragLeave={() => setSobre((x) => (x === k ? null : x))}
                    onDrop={(e) => soltar(e, { pessoa: p.id, dia: d })}>
                    {(() => {
                      const lista = celulas.get(k) || []
                      const nOS = lista.filter((c) => c.item.fonte === 'os').length
                      const ordem = (c: { item: ItemAgenda }, i: number) => (nOS > 1 && c.item.fonte === 'os' ? `${i + 1}º · ${horaDe(c.item, d) || 'sem horário'}` : null)
                      if (varios === 'pilha' && lista.length > 1 && !abertas.has(k)) {
                        const semHora = lista.some((c) => c.item.fonte === 'os' && !horaDe(c.item, d))
                        return (
                          <div className="ql-pilha" data-n={Math.min(lista.length, 3)}>
                            {cartaoItem(lista[0], d, p.id, ordem(lista[0], 0))}
                            <button className={`ql-pilha-mais ${semHora ? 'falta' : ''}`} onClick={() => setAbertas((s) => new Set(s).add(k))} title="Ver todas as OS deste dia">
                              +{lista.length - 1} {lista.length - 1 === 1 ? 'outra' : 'outras'} · ver todas{semHora ? ' · falta horário' : ''}
                            </button>
                          </div>
                        )
                      }
                      return (
                        <>
                          {lista.map((c, i) => cartaoItem(c, d, p.id, ordem(c, i)))}
                          {varios === 'pilha' && abertas.has(k) && <button className="ql-recolher" onClick={() => setAbertas((s) => { const n = new Set(s); n.delete(k); return n })}>recolher</button>}
                        </>
                      )
                    })()}
                    {pend.map(([key]) => {
                      const pe = dados.pendentes.find((x) => 'pend:' + x.id === key)!
                      return <div key={key} className="ql-card os mexido"><div className="ql-card-topo"><span className="ql-num">OS {semZeros(pe.id)}</span></div><div className="ql-cli">{pe.cliente}</div></div>
                    })}
                  </div>
                )
              }),
            ]))}
          </div>

          {/* FAIXA VERMELHA + pendentes */}
          <div className="ql-faixa"><span>PENDENTES — arraste para cá o que ainda não tem dia</span></div>
          <div className={`ql-pendentes ${sobre === 'pend' ? 'sobre' : ''}`}
            onDragOver={(e) => { e.preventDefault(); if (sobre !== 'pend') setSobre('pend') }} onDragLeave={() => setSobre((x) => (x === 'pend' ? null : x))}
            onDrop={(e) => soltar(e, 'pendente')}>
            {dados.pendentes.filter((p) => !mudancas['pend:' + p.id]).map((p) => (
              <div key={p.id} className="ql-card os pend" draggable={pode} onDragStart={(e) => arrastar(e, { tipo: 'pend', id: p.id })}
                onClick={() => abrir(p.id)} title="Clique para abrir a OS · arraste para um dia para agendar">
                <div className="ql-card-topo"><span className="ql-num">OS {semZeros(p.id)}</span><span className="ql-st pend"><Pin size={10} /> pendente</span></div>
                <div className="ql-cli">{p.cliente}</div>
                {variante !== 'parede' && p.solicitacao && <div className="ql-desc">{p.solicitacao}</div>}
                <div className="ql-rodape">
                  <span className="ql-local">{p.oficina ? <><Wrench size={11} /> Oficina</> : p.cidade ? <><MapPin size={11} /> {p.cidade}</> : p.status}</span>
                  {(p.dia || p.tecnico) && <span className="ql-dias">{[p.dia ? ddmm(p.dia) : null, p.tecnico?.split(' ')[0]].filter(Boolean).join(' · ')}</span>}
                </div>
              </div>
            ))}
            {pendentesSim.map((it) => (
              <div key={it.id} className="ql-card os pend mexido" draggable={pode} onDragStart={(e) => arrastar(e, { tipo: 'item', id: it.id })}>
                <div className="ql-card-topo"><span className="ql-num">{it.fonte === 'os' ? `OS ${semZeros(it.ref)}` : 'LOUSA'}</span><span className="ql-st pend"><Pin size={10} /> pendente</span></div>
                <div className="ql-cli">{it.fonte === 'os' ? it.titulo.replace(/^[^·]*·\s*/, '') : it.titulo}</div>
              </div>
            ))}
            {!dados.pendentes.length && !pendentesSim.length && <div className="ql-vazio">Nenhuma OS sem dia marcado. Arraste um cartão para cá para deixá-lo pendente.</div>}
          </div>
        </div>
      )}

      {pedirHora && (
        <div className="ql-hora-fundo" onClick={() => setPedirHora(null)}>
          <div className="ql-hora" onClick={(e) => e.stopPropagation()}>
            <b>Qual o horário da {pedirHora.ref}?</b>
            <span>{pedirHora.cliente} · {curtoDia(pedirHora.dia)}. Esse técnico já tem outra OS nesse dia — o horário diz qual vem primeiro.</span>
            <input type="time" autoFocus value={pedirHora.hora} onChange={(e) => setPedirHora({ ...pedirHora, hora: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && pedirHora.hora) void salvarHora() }} />
            <div className="ql-hora-bot">
              <button onClick={() => setPedirHora(null)}>Agora não</button>
              <button className="prim" disabled={!pedirHora.hora} onClick={() => void salvarHora()}>Salvar horário</button>
            </div>
          </div>
        </div>
      )}
      {ficha && <FichaOS id={ficha} tecnicos={tecnicosNomes} onFechar={() => setFicha(null)} onMudou={() => setRecarga((x) => x + 1)} />}

      <div className="ql-avisos">
        {avisos.map((a) => <div key={a.id} className="ql-aviso"><Info size={14} /> {a.texto}</div>)}
      </div>
    </div>
  )
}

const CSS_QUADRO = `
@import url('https://fonts.googleapis.com/css2?family=Kalam:wght@400;700&display=swap');
.ql { --ql-linha: var(--portal-border); --ql-azul: #1e3a8a; --ql-fundo: var(--portal-bg-card); --ql-cel: var(--portal-bg-card); display: grid; gap: 12px; color: var(--portal-text); }
.ql-barra { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ql-nav, .ql-hoje, .ql-reset { display: inline-flex; align-items: center; gap: 5px; height: 34px; padding: 0 10px; border-radius: 9px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); font-family: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
.ql-titulo { font-size: 17px; margin: 0 6px; }
.ql-teste { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; color: #b45309; background: #fef3c7; padding: 5px 10px; border-radius: 999px; }
.ql-reset { color: #b91c1c; }
.ql-dica { margin-left: auto; font-size: 12px; color: var(--portal-text-muted); }
@media (max-width: 1200px) { .ql-dica { display: none; } }
.ql-erro { padding: 12px; border-radius: 10px; background: #fef2f2; color: #b91c1c; font-weight: 600; }
.ql-carregando { padding: 30px; text-align: center; color: var(--portal-text-muted); }
.ql-moldura { background: var(--ql-fundo); border: 1px solid var(--portal-border); border-radius: 14px; overflow: hidden; }
.ql-grade { display: grid; }
.ql-cab { display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 8px 4px; border-bottom: 2px solid var(--ql-azul); border-right: 1px solid var(--ql-linha); }
.ql-cab small { font-size: 11px; color: var(--portal-text-muted); font-weight: 700; }
.ql-cab b { font-size: 14px; font-weight: 900; color: var(--ql-azul); letter-spacing: .3px; }
.ql-cab.hoje { background: color-mix(in srgb, #2563eb 8%, transparent); }
.ql-cab.hoje b::after { content: ' • hoje'; font-size: 10px; color: #2563eb; }
.ql-cab-sem { min-width: 110px; }
.ql-cab-sem small { color: var(--ql-azul); font-size: 12px; }
.ql-nome { display: flex; align-items: center; gap: 9px; padding: 10px 12px; color: var(--ql-azul); border-bottom: 2px solid color-mix(in srgb, var(--ql-azul) 22%, var(--ql-linha)); border-right: 2px solid var(--ql-azul); min-width: 150px; background: var(--ql-cel); }
.ql-nome.par, .ql-cel.par { background: color-mix(in srgb, var(--ql-azul) 3%, var(--ql-cel)); }
.ql-av { flex: none; width: 32px; height: 32px; border-radius: 50%; overflow: hidden; display: flex; align-items: center; justify-content: center; color: #fefefe; font-size: 12px; font-weight: 800; box-shadow: 0 0 0 2px var(--portal-bg-card), 0 0 0 3px color-mix(in srgb, var(--ql-azul) 25%, transparent); }
.ql-av img { width: 100%; height: 100%; object-fit: cover; }
.ql-nome-txt { display: grid; min-width: 0; }
.ql-nome-txt b { font-size: 14px; font-weight: 900; letter-spacing: .2px; }
.ql-nome-txt small { font-size: 10.5px; font-weight: 600; color: var(--portal-text-muted); white-space: nowrap; }
.ql-div { border-left: 3px solid #dc2626; }
.ql-cel { min-height: 74px; padding: 5px; display: flex; flex-direction: column; gap: 5px; border-bottom: 2px solid color-mix(in srgb, var(--ql-azul) 22%, var(--ql-linha)); border-right: 1px solid var(--ql-linha); background: var(--ql-cel); transition: background .15s; min-width: 0; }
.ql-ordem { justify-self: start; font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 6px; background: color-mix(in srgb, #0f172a 7%, transparent); color: var(--portal-text-secondary); }
.ql-ordem.falta { background: #fef3c7; color: #b45309; }
.ql-pilha { position: relative; isolation: isolate; padding: 0 8px 9px 0; display: grid; }
.ql-pilha::before, .ql-pilha::after { content: ''; position: absolute; border-radius: 10px; background: var(--portal-bg-card); border: 1px solid var(--portal-border); z-index: -1; box-shadow: 0 1px 2px rgba(15,23,42,.05); animation: qlEspia 3.4s ease-in-out infinite; }
.ql-pilha::before { inset: 5px 3px 4px 5px; }
.ql-pilha::after { inset: 10px 0 0 10px; opacity: .75; animation-delay: .12s; }
.ql-pilha[data-n="2"]::after { display: none; }
@keyframes qlEspia { 0%, 72%, 100% { transform: none } 82% { transform: translate(5px, 4px) rotate(1.6deg) } 90% { transform: translate(2px, 2px) rotate(.6deg) } }
.ql-pilha-mais { position: relative; z-index: 2; justify-self: center; margin-top: -2px; padding: 3px 10px; border-radius: 999px; border: 1px solid color-mix(in srgb, #2563eb 35%, var(--portal-border)); background: var(--portal-bg-card); color: #2563eb; font-family: inherit; font-size: 10.5px; font-weight: 800; cursor: pointer; white-space: nowrap; box-shadow: 0 2px 6px rgba(37,99,235,.15); transition: transform .15s; }
.ql-pilha-mais:hover { transform: translateY(-1px); }
.ql-pilha-mais.falta { color: #b45309; border-color: #fcd34d; }
.ql-recolher { justify-self: center; border: none; background: transparent; color: var(--portal-text-muted); font-family: inherit; font-size: 10.5px; font-weight: 700; cursor: pointer; text-decoration: underline; }
.ql-seg { display: inline-flex; align-items: center; gap: 3px; padding: 3px; border-radius: 10px; background: var(--portal-bg-secondary); border: 1px solid var(--portal-border); }
.ql-seg span { font-size: 11px; font-weight: 700; color: var(--portal-text-muted); padding: 0 6px 0 4px; }
.ql-seg button { padding: 5px 11px; border: none; border-radius: 8px; background: transparent; color: var(--portal-text-secondary); font-family: inherit; font-weight: 700; font-size: 12px; cursor: pointer; }
.ql-seg button.on { background: var(--portal-bg-card); color: var(--portal-text); box-shadow: 0 1px 3px rgba(0,0,0,.12); }
.ql-hora-fundo { position: fixed; inset: 0; z-index: 9850; background: rgba(15,23,42,.4); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.ql-hora { width: min(380px, 100%); display: grid; gap: 10px; padding: 18px; border-radius: 16px; background: var(--portal-bg-card); color: var(--portal-text); border: 1px solid var(--portal-border); box-shadow: 0 24px 60px rgba(15,23,42,.3); animation: qlAviso .3s cubic-bezier(.34,1.4,.5,1); }
.ql-hora b { font-size: 16px; }
.ql-hora span { font-size: 12.5px; color: var(--portal-text-secondary); line-height: 1.45; }
.ql-hora input { padding: 10px 12px; border-radius: 10px; border: 1px solid var(--portal-border); background: var(--portal-bg-secondary); color: var(--portal-text); font-family: inherit; font-size: 18px; font-weight: 700; }
.ql-hora-bot { display: flex; justify-content: flex-end; gap: 8px; }
.ql-hora-bot button { padding: 9px 14px; border-radius: 10px; border: 1px solid var(--portal-border); background: transparent; color: var(--portal-text); font-family: inherit; font-weight: 700; cursor: pointer; }
.ql-hora-bot button.prim { background: #2563eb; border-color: #2563eb; color: #fefefe; }
.ql-hora-bot button:disabled { opacity: .5; }
.ql-cel.hoje { background: color-mix(in srgb, #2563eb 4%, var(--ql-cel)); }
.ql-cel.sobre, .ql-pendentes.sobre { background: color-mix(in srgb, #2563eb 14%, var(--ql-cel)); box-shadow: inset 0 0 0 2px #2563eb; }
.ql-card { position: relative; display: grid; gap: 3px; padding: 8px 10px; border-radius: 10px; background: var(--portal-bg-card); border: 1px solid var(--portal-border); box-shadow: 0 1px 2px rgba(15,23,42,.05); cursor: pointer; font-size: 11.5px; line-height: 1.35; min-width: 0; transition: transform .15s, box-shadow .15s, border-color .15s; }
.ql-card:hover { transform: translateY(-1px); border-color: color-mix(in srgb, #2563eb 45%, var(--portal-border)); box-shadow: 0 6px 16px rgba(15,23,42,.10); }
.ql-card:active { cursor: grabbing; }
.ql-card.lousa { border-style: dashed; cursor: grab; }
.ql-card.apagado { opacity: .55; }
.ql-card.mexido { box-shadow: 0 0 0 2px #f59e0b; }
.ql-card[draggable="true"]:active { cursor: grabbing; }
.ql-card.pend { width: 210px; }
.ql-card-topo { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; }
.ql-num { flex: none; font-size: 10.5px; font-weight: 800; letter-spacing: .3px; padding: 1px 7px; border-radius: 6px; background: color-mix(in srgb, #2563eb 10%, transparent); color: #1d4ed8; font-variant-numeric: tabular-nums; }
.ql-num.lousa { background: color-mix(in srgb, #0d9488 12%, transparent); color: #0f766e; }
.ql-st { min-width: 0; display: inline-flex; align-items: center; gap: 3px; font-size: 10px; font-weight: 800; padding: 1px 7px; border-radius: 999px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ql-st.pend { color: #b91c1c; background: #fee2e2; }
.ql-rodape { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-width: 0; margin-top: 1px; }
.ql-dias { font-size: 9.5px; font-weight: 800; padding: 0 5px; border-radius: 99px; background: var(--portal-bg-secondary); color: var(--portal-text-secondary); white-space: nowrap; }
.ql-cli { font-weight: 700; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--portal-text); }
.ql-desc { color: var(--portal-text-secondary); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; margin-top: 1px; }
.ql-local { min-width: 0; display: flex; align-items: center; gap: 4px; color: var(--portal-text-muted); font-size: 10.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ql-ausente { display: flex; align-items: center; gap: 6px; cursor: grab; }
.ql-traco { width: 26px; height: 3px; border-radius: 3px; }
.ql-ausente small { font-size: 10.5px; color: #b91c1c; font-weight: 700; }
.ql-faixa { height: 12px; background: #dc2626; position: relative; }
.ql-faixa span { position: absolute; left: 12px; top: -1px; font-size: 9.5px; line-height: 14px; font-weight: 800; letter-spacing: .5px; color: #fefefe; }
.ql-pendentes { min-height: 90px; padding: 10px; display: flex; flex-wrap: wrap; gap: 8px; align-content: flex-start; transition: background .15s; }
.ql-vazio { color: var(--portal-text-muted); font-size: 13px; padding: 14px 4px; }
.ql-avisos { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 9500; display: grid; gap: 8px; width: min(560px, calc(100vw - 32px)); pointer-events: none; }
.ql-aviso { display: flex; align-items: flex-start; gap: 8px; padding: 11px 14px; border-radius: 12px; background: #0f172a; color: #fefefe; font-size: 13px; line-height: 1.4; box-shadow: 0 12px 30px rgba(15,23,42,.3); animation: qlAviso .35s cubic-bezier(.34,1.4,.5,1); }
@keyframes qlAviso { from { opacity: 0; transform: translateY(14px) } }

/* opção 2 — uma semana, cartões maiores */
.ql-semana .ql-cel { min-height: 104px; padding: 7px; gap: 6px; }
.ql-semana .ql-card { font-size: 12px; padding: 10px 12px; gap: 4px; }
.ql-semana .ql-cli { font-size: 13px; }
.ql-semana .ql-desc { font-size: 12px; }

/* opção 3 — lousa de verdade: quadro branco, fita azul, letra de pincel */
.ql-lousa { --ql-linha: #2f5fbf; --ql-azul: #1e3a8a; --ql-fundo: #fbfbf8; --ql-cel: #fbfbf8; }
.ql-lousa .ql-moldura { border: 8px solid #c9ccd1; border-radius: 6px; box-shadow: inset 0 0 0 1px #9aa0a6, 0 6px 18px rgba(0,0,0,.12); color: #111; }
.ql-lousa .ql-cab, .ql-lousa .ql-nome { border-color: #2f5fbf; }
.ql-lousa .ql-cel { border-right: 3px solid #2f5fbf; border-bottom: 3px solid #2f5fbf; }
.ql-lousa .ql-cab { border-right: 3px solid #2f5fbf; border-bottom: 3px solid #2f5fbf; }
.ql-lousa .ql-nome { border-bottom: 3px solid #2f5fbf; border-right: 3px solid #2f5fbf; font-size: 17px; }
.ql-lousa .ql-div { border-left: 5px solid #dc2626; }
.ql-lousa .ql-card { background: transparent; border: none; box-shadow: none; padding: 2px 3px; font-family: 'Kalam', cursive; font-size: 13px; color: #1f2937; border-radius: 4px; }
.ql-lousa .ql-card:hover { background: rgba(37,99,235,.06); transform: none; }
.ql-lousa .ql-num { background: transparent; font-family: 'Kalam', cursive; font-size: 13.5px; text-decoration: underline; color: #111; padding: 0; }
.ql-lousa .ql-card.lousa { color: #0f766e; }
.ql-lousa .ql-card.pend { color: #b91c1c; width: 170px; }
.ql-lousa .ql-card.mexido { background: rgba(245,158,11,.14); }
.ql-lousa .ql-desc, .ql-lousa .ql-local { color: #374151; }
.ql-lousa .ql-dias { background: transparent; color: #b91c1c; font-family: 'Kalam', cursive; }
.ql-lousa .ql-faixa { height: 16px; }
.ql-lousa .ql-pendentes { background: #fbfbf8; }
@media (max-width: 900px) { .ql-moldura { overflow-x: auto; } .ql-grade { min-width: 860px; } }
`
