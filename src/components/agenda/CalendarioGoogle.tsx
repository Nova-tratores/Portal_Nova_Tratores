'use client'
// AGENDA — calendário estilo Google Agenda. Dois modos:
//  - 'coletiva' (/agenda, Central de Trabalho): todos os usuários, agrupados por setor;
//    junta compromissos, reuniões, sala, prazos de tickets, OS e Lousa.
//  - 'tecnicos' (/lousa): só os técnicos; criar/editar = lançamento na Lousa.
// Vistas: Dia · Semana · Mês · Programação · Pessoas (lado a lado). Atalhos do Google:
// t hoje · d/w/m/a/e vistas · j/n próximo · k/p anterior · c criar · / buscar · ? ajuda.
import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Menu, ChevronLeft, ChevronRight, Search, HelpCircle, X, ChevronDown, ChevronUp, Check, RefreshCw } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import { useIsMobile } from '@/hooks/useIsMobile'
import TicketModal from '@/components/tickets/TicketModal'
import {
  addDias, localDe, isoDe, hhmm, domingoDe, gradeDoMes, somarMeses, primeiroDoMes, diaDaSemana, casaItem, ordemSetor,
  periodoDoHorario, rotuloHorario, textoSobre, FONTES, MESES, DIAS_LONGOS,
  type ItemAgenda, type Pessoa, type Fonte, type Resposta,
} from '@/lib/agenda/regras'
import GradeHoras, { type Coluna } from './GradeHoras'
import { GradeMes, ListaProgramacao, MiniCalendario } from './Vistas'
import {
  PopoverItem, CriarRapido, FormEvento, FormLousa, rascunhoDeItem, rascunhoLousaDeItem,
  type RascunhoEvento, type RascunhoLousa,
} from './Janelas'
import { CSS_AGENDA } from './estilo'

type Vista = 'dia' | 'semana' | 'mes' | 'programacao' | 'pessoas'
const VISTAS: { id: Vista; rotulo: string; tecla: string }[] = [
  { id: 'dia', rotulo: 'Dia', tecla: 'D' }, { id: 'semana', rotulo: 'Semana', tecla: 'W' }, { id: 'mes', rotulo: 'Mês', tecla: 'M' },
  { id: 'programacao', rotulo: 'Programação', tecla: 'A' }, { id: 'pessoas', rotulo: 'Pessoas (lado a lado)', tecla: 'E' },
]
interface Resp {
  pessoas: Pessoa[]; itens: ItemAgenda[]; avisos: string[]; migracaoFaltando?: boolean; aviso?: string
  podeLousa: boolean; de: string; ate: string; agora: { dia: string; hora: string }; eu: string; admin: boolean
}
type Criacao = { ancora: DOMRect; dia: string; ini: string; fim: string; diaInteiro: boolean; pessoa?: Pessoa | null; colKey?: string; iniMin?: number; fimMin?: number }

const ler = <T,>(k: string, padrao: T): T => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) as T : padrao } catch { return padrao } }
const gravar = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)) } catch { /* sem storage */ } }
const hojeSP = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const minParaHora = (m: number) => (m >= 24 * 60 ? '23:59' : hhmm(m))

async function chamar<T = Record<string, unknown>>(url: string, metodo = 'GET', corpo?: unknown): Promise<T> {
  const res = await fetch(url, {
    method: metodo, cache: 'no-store',
    headers: { ...(corpo !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(await authHeaders()) },
    body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
  })
  const j = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(j.error || `Falha (${res.status})`)
  return j as T
}

export default function CalendarioGoogle({ modo, titulo }: { modo: 'coletiva' | 'tecnicos'; titulo?: string }) {
  const isMobile = useIsMobile()
  const { userProfile } = useAuth()
  const chave = (k: string) => `agenda-${modo}-${k}`
  const [dia, setDia] = useState(hojeSP)
  const [mesMini, setMesMini] = useState(() => primeiroDoMes(hojeSP()))
  const [vista, setVistaS] = useState<Vista>('semana')
  const [lateral, setLateral] = useState(true)
  const [dados, setDados] = useState<Resp | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [ocultos, setOcultos] = useState<Set<string>>(new Set())
  const [fontesOff, setFontesOff] = useState<Set<Fonte>>(new Set())
  const [setoresFechados, setSetoresFechados] = useState<Set<string>>(new Set())
  const [mostrarFds, setMostrarFds] = useState(true)
  const [busca, setBusca] = useState('')
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [aberto, setAberto] = useState<{ it: ItemAgenda; ancora: DOMRect } | null>(null)
  const [criando, setCriando] = useState<Criacao | null>(null)
  const [form, setForm] = useState<RascunhoEvento | null>(null)
  const [formLousa, setFormLousa] = useState<RascunhoLousa | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erroForm, setErroForm] = useState('')
  const [ticket, setTicket] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [ajuda, setAjuda] = useState(false)
  const [hora, setHora] = useState(() => localDe(new Date().toISOString()).hora)
  const buscaRef = useRef<HTMLInputElement>(null)
  // ocupa da posição em que começa até o fim da tela (as faixas do portal variam de altura)
  const raiz = useRef<HTMLDivElement>(null)
  const [topo, setTopo] = useState(64)
  useLayoutEffect(() => {
    const medir = () => { if (raiz.current) setTopo(Math.max(0, Math.round(raiz.current.getBoundingClientRect().top + window.scrollY))) }
    medir()
    window.addEventListener('resize', medir)
    return () => window.removeEventListener('resize', medir)
  }, [])
  const seq = useRef(0)

  // preferências do navegador (vista, quem está oculto, fontes, fins de semana)
  useEffect(() => {
     
    const v = ler<Vista | null>(chave('vista'), null)
    // Lousa abre na SEMANA: na vista de um dia só, um dia sem OS parecia "não aparece nada" (16/10/2026)
    setVistaS(v && VISTAS.some((x) => x.id === v) ? v : window.innerWidth < 900 ? 'dia' : 'semana')
    setOcultos(new Set(ler<string[]>(chave('ocultos'), [])))
    setFontesOff(new Set(ler<Fonte[]>(chave('fontes-off'), [])))
    setSetoresFechados(new Set(ler<string[]>(chave('setores-fechados'), [])))
    setMostrarFds(ler<boolean>('agenda-fds', true))
    setLateral(window.innerWidth >= 900)
     
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo])
  const setVista = (v: Vista) => { setVistaS(v); gravar(chave('vista'), v) }
  const trocarOcultos = (s: Set<string>) => { setOcultos(s); gravar(chave('ocultos'), [...s]) }
  const trocarFontes = (s: Set<Fonte>) => { setFontesOff(s); gravar(chave('fontes-off'), [...s]) }

  // ---------- faixa de datas da vista
  const faixa = useMemo(() => {
    if (vista === 'dia' || vista === 'pessoas') return { de: dia, ate: dia }
    if (vista === 'semana') {
      const dom = domingoDe(dia)
      return mostrarFds ? { de: dom, ate: addDias(dom, 6) } : { de: addDias(dom, 1), ate: addDias(dom, 5) }
    }
    if (vista === 'mes') { const g = gradeDoMes(dia); return { de: g[0], ate: g[41] } }
    return { de: dia, ate: addDias(dia, 30) }
  }, [vista, dia, mostrarFds])

  const carregar = useCallback(async (silencioso = false) => {
    const n = ++seq.current
    if (!silencioso) setCarregando(true)
    try {
      const j = await chamar<Resp>(`/api/agenda?de=${faixa.de}&ate=${faixa.ate}&modo=${modo}`)
      if (n !== seq.current) return
      setDados(j); setErro('')
    } catch (e) { if (n === seq.current) setErro(e instanceof Error ? e.message : 'Falha ao carregar') }
    finally { if (n === seq.current) setCarregando(false) }
  }, [faixa.de, faixa.ate, modo])
  useEffect(() => { carregar() }, [carregar])
  useEffect(() => {
    const f = () => { carregar(true); setHora(localDe(new Date().toISOString()).hora) }
    const t = setInterval(f, 60_000)
    window.addEventListener('focus', f)
    window.addEventListener('central-trabalho-mudou', f)
    return () => { clearInterval(t); window.removeEventListener('focus', f); window.removeEventListener('central-trabalho-mudou', f) }
  }, [carregar])

  // ---------- link da notificação: /agenda?evento=<id>
  const alvoEvento = useRef<string | null>(null)
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const id = sp.get('evento')
    if (!id) return
    window.history.replaceState(null, '', window.location.pathname)
    chamar<{ evento: { inicio: string } }>(`/api/agenda/eventos/${id}`).then((j) => {
      alvoEvento.current = id
       
      setDia(localDe(j.evento.inicio).dia)
    }).catch(() => setToast('Esse compromisso não existe mais.'))
  }, [])
  useEffect(() => {
    if (!dados || !alvoEvento.current) return
    const it = dados.itens.find((i) => i.ref === alvoEvento.current)
    if (!it) return
    alvoEvento.current = null
    const W = window.innerWidth, H = window.innerHeight
     
    setAberto({ it, ancora: new DOMRect(W / 2 - 220, H / 3, 1, 1) })
  }, [dados])

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 4000); return () => clearTimeout(t) }, [toast])

  // ---------- pessoas, cores, filtros
  const eu = dados?.eu || userProfile?.id || ''
  const pessoas = useMemo(() => dados?.pessoas || [], [dados])
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas])
  const nomes = useMemo(() => new Map(pessoas.map((p) => [p.id, p.nome])), [pessoas])
  const visivel = useCallback((id: string) => !ocultos.has(id), [ocultos])
  const itens = useMemo(() => (dados?.itens || []).filter((it) =>
    !fontesOff.has(it.fonte) && it.pessoas.some(visivel) && casaItem(it, busca, nomes),
  ), [dados, fontesOff, visivel, busca, nomes])
  const corDe = useCallback((it: ItemAgenda, col?: Coluna) => {
    if (it.cor) return it.cor
    if (col?.pessoa) return col.pessoa.cor
    const dono = it.fonte === 'evento' && it.criadoPor && visivel(it.criadoPor) ? it.criadoPor : it.pessoas.find(visivel) || it.pessoas[0]
    return porId.get(dono)?.cor || '#039be5'
  }, [porId, visivel])
  const grupos = useMemo(() => {
    const t = buscaPessoa.trim().toLowerCase()
    const lista = pessoas.filter((p) => p.id !== eu && (!t || p.nome.toLowerCase().includes(t) || p.setor.toLowerCase().includes(t)))
    const setores = [...new Set(lista.map((p) => p.setor))].sort(ordemSetor)
    return setores.map((s) => ({ setor: s, pessoas: lista.filter((p) => p.setor === s) }))
  }, [pessoas, buscaPessoa, eu])
  const pessoasVisiveis = useMemo(() => pessoas.filter((p) => visivel(p.id)), [pessoas, visivel])

  // ---------- colunas das vistas de horas
  const colunas: Coluna[] = useMemo(() => {
    if (vista === 'pessoas') {
      const ordem = [...pessoasVisiveis].sort((a, b) => Number(b.id === eu) - Number(a.id === eu) || ordemSetor(a.setor, b.setor) || a.nome.localeCompare(b.nome, 'pt-BR'))
      return ordem.map((p) => ({ key: `${dia}|${p.id}`, dia, pessoa: p }))
    }
    if (vista === 'dia') return [{ key: dia, dia }]
    const out: Coluna[] = []
    for (let d = faixa.de; d <= faixa.ate; d = addDias(d, 1)) out.push({ key: d, dia: d })
    return out
  }, [vista, dia, faixa, pessoasVisiveis, eu])

  // ---------- navegação
  const andar = useCallback((n: number) => {
    setDia((d) => vista === 'mes' ? somarMeses(d, n) : vista === 'semana' ? addDias(d, 7 * n) : vista === 'programacao' ? addDias(d, 30 * n) : addDias(d, n))
  }, [vista])
  useEffect(() => { setMesMini(primeiroDoMes(dia)) }, [dia])
  const irPara = (d: string, v?: Vista) => { setDia(d); if (v) setVista(v) }
  const hoje = dados?.agora.dia || hojeSP()
  const tituloPeriodo = useMemo(() => {
    const m = (d: string) => MESES[Number(d.slice(5, 7)) - 1]
    if (vista === 'dia' || vista === 'pessoas') return `${Number(dia.slice(8, 10))} de ${m(dia)} de ${dia.slice(0, 4)}`
    if (vista === 'mes') return `${m(dia)} de ${dia.slice(0, 4)}`
    const { de, ate } = faixa
    if (de.slice(0, 7) === ate.slice(0, 7)) return `${m(de)} de ${de.slice(0, 4)}`
    if (de.slice(0, 4) === ate.slice(0, 4)) return `${m(de).slice(0, 3)}. – ${m(ate).slice(0, 3)}. de ${ate.slice(0, 4)}`
    return `${m(de).slice(0, 3)}. de ${de.slice(0, 4)} – ${m(ate).slice(0, 3)}. de ${ate.slice(0, 4)}`
  }, [vista, dia, faixa])

  // ---------- criar
  const modoTecnicos = modo === 'tecnicos'
  const podeLousa = !!dados?.podeLousa
  const abrirCriacao = (c: Criacao) => {
    setAberto(null); setErroForm('')
    if (modoTecnicos) {
      if (!podeLousa) { setToast('Você não tem permissão para lançar na Lousa.'); return }
      setFormLousa({
        data: c.dia, periodo: c.diaInteiro ? 'dia' : periodoDoHorario(c.ini, c.fim), tipo: 'servico',
        tecnico: c.pessoa?.tecnicoNome || '', acompanhante: '', cliente: '', cnpj: null, descricao: '',
      })
      return
    }
    setCriando(c)
  }
  const novoPadrao = () => {
    const agora = localDe(new Date().toISOString())
    const h = Math.min(22, Number(agora.hora.slice(0, 2)) + 1)
    const d = dia === hoje ? hoje : dia
    return { ini: `${String(h).padStart(2, '0')}:00`, fim: `${String(h + 1).padStart(2, '0')}:00`, d }
  }
  const botaoCriar = () => {
    const { ini, fim, d } = novoPadrao()
    if (modoTecnicos) { abrirCriacao({ ancora: new DOMRect(0, 0, 1, 1), dia: d, ini, fim, diaInteiro: false }); return }
    setErroForm('')
    setForm({ titulo: '', descricao: '', local: '', diaInteiro: false, diaIni: d, horaIni: ini, diaFim: d, horaFim: fim, participantes: [], freq: '', ate: '', cor: null })
  }
  const rascunhoDaCriacao = (c: Criacao, titulo: string): RascunhoEvento => ({
    titulo, descricao: '', local: '', diaInteiro: c.diaInteiro, diaIni: c.dia, horaIni: c.diaInteiro ? '09:00' : c.ini,
    diaFim: c.dia, horaFim: c.diaInteiro ? '10:00' : c.fim,
    participantes: c.pessoa && c.pessoa.id !== eu ? [c.pessoa.id] : [], freq: '', ate: '', cor: null,
  })
  const corpoEvento = (r: RascunhoEvento) => ({
    titulo: r.titulo, descricao: r.descricao, local: r.local, diaInteiro: r.diaInteiro, diaIni: r.diaIni, horaIni: r.horaIni,
    diaFim: r.diaFim, horaFim: r.horaFim, participantes: r.participantes, cor: r.cor,
    recorrencia: r.freq ? { freq: r.freq, ate: r.ate || null } : null,
  })
  const salvarEvento = async (r: RascunhoEvento) => {
    setSalvando(true); setErroForm('')
    try {
      if (r.id) await chamar(`/api/agenda/eventos/${r.id}`, 'PATCH', { acao: 'editar', ...corpoEvento(r) })
      else await chamar('/api/agenda/eventos', 'POST', corpoEvento(r))
      setForm(null); setCriando(null); setToast(r.id ? 'Compromisso atualizado' : r.participantes.length ? 'Compromisso salvo e convites enviados' : 'Compromisso salvo')
      carregar(true)
    } catch (e) { setErroForm(e instanceof Error ? e.message : 'Falha ao salvar') } finally { setSalvando(false) }
  }

  // ---------- Lousa (API antiga /api/pos/lousa, a mesma do quadro clássico)
  const salvarLousa = async (r: RascunhoLousa) => {
    if (!userProfile) return
    setSalvando(true); setErroForm('')
    const servico = r.tipo === 'servico'
    const corpo: Record<string, unknown> = {
      data: r.data, tipo: r.tipo, periodo: r.periodo, tecnico_nome: r.tecnico || null,
      tecnico_acompanhante: servico && r.acompanhante && r.acompanhante !== r.tecnico ? r.acompanhante : null,
      cliente_cnpj: servico ? r.cnpj : null, cliente_nome: servico ? r.cliente.trim() : ({ faltou: 'Faltou', feriado: 'Feriado', oficina: 'Oficina', saida: 'Saída antecipada' } as Record<string, string>)[r.tipo],
      descricao: r.descricao.trim() || null,
    }
    try {
      const res = r.id
        ? await fetch('/api/pos/lousa', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: r.id, ...corpo }) })
        : await fetch('/api/pos/lousa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...corpo, criado_por_id: userProfile.id, criado_por_nome: userProfile.nome || 'Usuário' }) })
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || 'Falha ao salvar')
      setFormLousa(null); setToast(r.id ? 'Lousa atualizada' : 'Lançado na Lousa'); carregar(true)
    } catch (e) { setErroForm(e instanceof Error ? e.message : 'Falha ao salvar') } finally { setSalvando(false) }
  }
  const excluirLousa = async (id: string) => {
    if (!window.confirm('Excluir este lançamento da Lousa?')) return
    const res = await fetch(`/api/pos/lousa?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    if (!res.ok) { setToast('Não deu para excluir.'); return }
    setFormLousa(null); setAberto(null); setToast('Excluído da Lousa'); carregar(true)
  }

  // ---------- mover (arrastar na grade)
  const podeArrastar = useCallback((it: ItemAgenda) => !!it.podeEditar && ((it.fonte === 'evento' && !it.serie) || it.fonte === 'lousa'), [])
  const mover = async (it: ItemAgenda, col: Coluna, ini: number, fim: number) => {
    const novoIni = isoDe(col.dia, hhmm(ini))
    const novoFim = fim >= 24 * 60 ? isoDe(addDias(col.dia, 1), '00:00') : isoDe(col.dia, hhmm(fim))
    // otimista: o cartão já fica no lugar novo
    setDados((d) => d && { ...d, itens: d.itens.map((x) => (x.id === it.id ? { ...x, inicio: novoIni, fim: novoFim } : x)) })
    try {
      if (it.fonte === 'evento') {
        await chamar(`/api/agenda/eventos/${it.ref}`, 'PATCH', { acao: 'mover', inicio: novoIni, fim: novoFim })
        setToast('Compromisso movido')
      } else {
        const x = it.extra || {}
        const trocaTec = col.pessoa?.tecnicoNome && !it.pessoas.includes(col.pessoa.id) ? col.pessoa.tecnicoNome : undefined
        const res = await fetch('/api/pos/lousa', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: it.ref, data: col.dia, periodo: periodoDoHorario(minParaHora(ini), minParaHora(fim)), ...(trocaTec ? { tecnico_nome: trocaTec } : {}) }),
        })
        if (!res.ok) throw new Error('Não deu para mover na Lousa')
        setToast(trocaTec ? `Passado para ${col.pessoa!.nome.split(' ')[0]}` : x.periodo ? 'Lousa atualizada' : 'Movido')
      }
    } catch (e) { setToast(e instanceof Error ? e.message : 'Não deu para mover') }
    carregar(true)
  }

  // ---------- ações do detalhe
  const excluir = async (it: ItemAgenda, soEsta: boolean) => {
    if (it.fonte === 'lousa') { excluirLousa(it.ref); return }
    try {
      await chamar(`/api/agenda/eventos/${it.ref}${soEsta && it.ocorrencia ? `?dia=${it.ocorrencia}` : ''}`, 'DELETE')
      setAberto(null); setToast('Compromisso excluído'); carregar(true)
    } catch (e) { setToast(e instanceof Error ? e.message : 'Não deu para excluir') }
  }
  const responder = async (it: ItemAgenda, r: Resposta) => {
    setAberto((a) => a && { ...a, it: { ...a.it, respostas: { ...(a.it.respostas || {}), [eu]: r } } })
    try { await chamar(`/api/agenda/eventos/${it.ref}`, 'PATCH', { acao: 'responder', resposta: r }); carregar(true) }
    catch (e) { setToast(e instanceof Error ? e.message : 'Não deu para responder') }
  }
  const editar = (it: ItemAgenda) => {
    setAberto(null); setErroForm('')
    if (it.fonte === 'lousa') setFormLousa(rascunhoLousaDeItem(it))
    else if (it.serie) {
      // série: abre o original (1º dia), não a ocorrência clicada
      chamar<{ evento: { inicio: string; fim: string; dia_inteiro: boolean } }>(`/api/agenda/eventos/${it.ref}`).then((j) => {
        setForm(rascunhoDeItem({ ...it, inicio: j.evento.inicio, fim: j.evento.fim, diaInteiro: j.evento.dia_inteiro }))
      }).catch(() => setForm(rascunhoDeItem(it)))
    } else setForm(rascunhoDeItem(it))
  }

  // ---------- atalhos do Google Agenda
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(alvo.tagName) || alvo.isContentEditable) return
      if (aberto || criando || form || formLousa || ticket) return
      const k = e.key.toLowerCase()
      const mapa: Record<string, () => void> = {
        t: () => setDia(hojeSP()), d: () => setVista('dia'), w: () => setVista('semana'), m: () => setVista('mes'),
        a: () => setVista('programacao'), e: () => setVista('pessoas'), j: () => andar(1), n: () => andar(1), k: () => andar(-1), p: () => andar(-1),
        c: () => botaoCriar(), '/': () => buscaRef.current?.focus(), '?': () => setAjuda(true),
      }
      const fn = mapa[e.key === '?' ? '?' : k]
      if (fn) { e.preventDefault(); fn() }
    }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  })

  // ---------- lateral
  const minhaPessoa = porId.get(eu)
  const caixa = (on: boolean, cor: string) => (
    <span className="gc-caixa" style={{ borderColor: cor, background: on ? cor : 'transparent' }}>{on && <Check size={13} color={textoSobre(cor)} strokeWidth={3} />}</span>
  )
  const linhaAgenda = (p: Pessoa) => (
    <div key={p.id} className="gc-agenda-linha" title={`${p.nome} · ${p.setor}`}
      onClick={() => { const s = new Set(ocultos); if (s.has(p.id)) s.delete(p.id); else s.add(p.id); trocarOcultos(s) }}>
      {caixa(visivel(p.id), p.cor)}
      <span className="gc-agenda-nome">{p.nome}</span>
      <button className="gc-so" title="Mostrar só esta agenda" onClick={(e) => { e.stopPropagation(); trocarOcultos(new Set(pessoas.filter((x) => x.id !== p.id).map((x) => x.id))) }}>só</button>
    </div>
  )
  const fontesDoModo = modoTecnicos ? FONTES.filter((f) => ['lousa', 'os', 'evento'].includes(f.id)) : FONTES

  const lateralEl = lateral && (
    <>
      {isMobile && <div className="gc-fundo-leve" style={{ background: 'rgba(0,0,0,.3)', zIndex: 1399 }} onClick={() => setLateral(false)} />}
      <aside className="gc-lateral">
        <button className="gc-criar" onClick={botaoCriar} disabled={modoTecnicos && !podeLousa} title={modoTecnicos && !podeLousa ? 'Sem permissão para lançar na Lousa' : 'Criar (C)'}>
          <span className="gc-mais-cor" /> {modoTecnicos ? 'Lançar' : 'Criar'} <ChevronDown size={16} style={{ opacity: .6 }} />
        </button>
        <MiniCalendario mes={mesMini} onMes={setMesMini} selecionado={dia} hoje={hoje}
          destaque={vista === 'semana' ? colunas.map((c) => c.dia) : []} onEscolher={(d) => { setDia(d); if (isMobile) setLateral(false) }} />
        <div className="gc-busca-pessoas"><Search size={16} className="gc-muted" /><input placeholder={modoTecnicos ? 'Buscar técnico' : 'Buscar pessoas ou setor'} value={buscaPessoa} onChange={(e) => setBuscaPessoa(e.target.value)} /></div>
        {minhaPessoa && !buscaPessoa && (
          <div className="gc-grupo">
            <div className="gc-grupo-cab" style={{ cursor: 'default' }}><b>Minha agenda</b></div>
            {linhaAgenda(minhaPessoa)}
          </div>
        )}
        {grupos.map((g) => {
          const fechado = setoresFechados.has(g.setor) && !buscaPessoa
          const ligados = g.pessoas.filter((p) => visivel(p.id)).length
          return (
            <div key={g.setor} className="gc-grupo">
              <div className="gc-grupo-cab" onClick={() => { const s = new Set(setoresFechados); if (s.has(g.setor)) s.delete(g.setor); else s.add(g.setor); setSetoresFechados(s); gravar(chave('setores-fechados'), [...s]) }}>
                <span onClick={(e) => {
                  e.stopPropagation()
                  const s = new Set(ocultos)
                  if (ligados === g.pessoas.length) g.pessoas.forEach((p) => s.add(p.id)); else g.pessoas.forEach((p) => s.delete(p.id))
                  trocarOcultos(s)
                }} title={ligados === g.pessoas.length ? 'Esconder o setor' : 'Mostrar o setor inteiro'} style={{ display: 'flex', padding: 4 }}>
                  {caixa(ligados > 0, ligados === g.pessoas.length ? '#5f6368' : '#9aa0a6')}
                </span>
                <b>{modoTecnicos && g.setor === 'Técnicos' ? 'Técnicos' : g.setor}</b>
                <small>{ligados}/{g.pessoas.length}</small>
                {fechado ? <ChevronDown size={18} className="gc-muted" /> : <ChevronUp size={18} className="gc-muted" />}
              </div>
              {!fechado && g.pessoas.map(linhaAgenda)}
            </div>
          )
        })}
        <div className="gc-sep" />
        <div className="gc-grupo">
          <div className="gc-grupo-cab" style={{ cursor: 'default' }}><b>Outras agendas</b></div>
          {fontesDoModo.map((f) => {
            const on = !fontesOff.has(f.id)
            return (
              <div key={f.id} className="gc-agenda-linha" onClick={() => { const s = new Set(fontesOff); if (on) s.add(f.id); else s.delete(f.id); trocarFontes(s) }}>
                {caixa(on, '#5f6368')}<span className="gc-agenda-nome">{f.rotulo}</span>
              </div>
            )
          })}
        </div>
        <div className="gc-sep" />
        <label className="gc-check gc-rodape-lat"><input type="checkbox" checked={mostrarFds} onChange={(e) => { setMostrarFds(e.target.checked); gravar('agenda-fds', e.target.checked) }} /> Mostrar fins de semana</label>
        <div className="gc-rodape-lat gc-muted" style={{ fontSize: 12 }}>
          <button className="gc-btn-txt" style={{ padding: '4px 0' }} onClick={() => trocarOcultos(new Set())}>Mostrar todas</button>
          {' · '}
          <button className="gc-btn-txt" style={{ padding: '4px 0' }} onClick={() => trocarOcultos(new Set(pessoas.filter((p) => p.id !== eu).map((p) => p.id)))}>Só a minha</button>
        </div>
      </aside>
    </>
  )

  // ---------- render
  const quandoCriacao = (c: Criacao) => c.diaInteiro
    ? `${DIAS_LONGOS[diaDaSemana(c.dia)]}, ${Number(c.dia.slice(8, 10))} de ${MESES[Number(c.dia.slice(5, 7)) - 1]} · Dia inteiro`
    : rotuloHorario({ inicio: isoDe(c.dia, c.ini), fim: isoDe(c.dia, c.fim), diaInteiro: false })
  const vazio = busca ? `Nada encontrado para "${busca}".` : 'Nada agendado neste período.'

  return (
    <div ref={raiz} className="gc" style={{ ['--gc-topo' as string]: `${topo}px` }}>
      <style>{CSS_AGENDA}</style>
      <div className="gc-barra-topo">
        <button className="gc-icone" aria-label="Menu principal" title="Menu principal" onClick={() => setLateral((v) => !v)}><Menu size={22} /></button>
        <div className="gc-logo">
          <span className="gc-logo-ic"><span /><span>{Number(hoje.slice(8, 10))}</span></span>
          <b style={{ fontWeight: 400 }}>{titulo || (modoTecnicos ? 'Lousa' : 'Agenda')}</b>
        </div>
        <button className="gc-btn-hoje" onClick={() => setDia(hojeSP())} title={`${DIAS_LONGOS[diaDaSemana(hoje)]}, ${Number(hoje.slice(8, 10))} de ${MESES[Number(hoje.slice(5, 7)) - 1]} (T)`}>Hoje</button>
        <button className="gc-icone gc-icone-p" style={{ width: 32, height: 32 }} aria-label="Anterior" title="Anterior (K)" onClick={() => andar(-1)}><ChevronLeft size={20} /></button>
        <button className="gc-icone gc-icone-p" style={{ width: 32, height: 32 }} aria-label="Próximo" title="Próximo (J)" onClick={() => andar(1)}><ChevronRight size={20} /></button>
        <span className="gc-titulo-per">{tituloPeriodo}</span>
        <div className="gc-direita">
          <div className="gc-busca">
            <Search size={18} className="gc-muted" />
            <input ref={buscaRef} placeholder="Pesquisar (/)" value={busca} onChange={(e) => setBusca(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') { setBusca(''); (e.target as HTMLInputElement).blur() } }} />
            {busca && <button className="gc-icone gc-icone-p" aria-label="Limpar" onClick={() => setBusca('')}><X size={16} /></button>}
          </div>
          <button className="gc-icone gc-so-largo" aria-label="Atualizar" title="Atualizar" onClick={() => carregar()}><RefreshCw size={18} /></button>
          <button className="gc-icone gc-so-largo" aria-label="Ajuda e atalhos" title="Atalhos de teclado (?)" onClick={() => setAjuda(true)}><HelpCircle size={20} /></button>
          <select className="gc-select-vista" value={vista} onChange={(e) => setVista(e.target.value as Vista)} aria-label="Vista">
            {VISTAS.map((v) => <option key={v.id} value={v.id}>{v.rotulo}</option>)}
          </select>
        </div>
      </div>
      {carregando ? <div className="gc-progresso" /> : <div style={{ height: 3, flex: 'none' }} />}

      <div className="gc-meio">
        {lateralEl}
        <main className="gc-principal">
          {(erro || dados?.aviso || (dados?.avisos || []).length > 0) && (
            <div className="gc-avisos">{erro || [dados?.aviso, ...(dados?.avisos || [])].filter(Boolean).join(' ')}</div>
          )}
          {vista === 'mes' ? (
            <GradeMes dia={dia} hoje={hoje} itens={itens} corDe={(it) => corDe(it)} mostrarFds={mostrarFds}
              onAbrir={(it, r) => setAberto({ it, ancora: r })} onIrParaDia={(d) => irPara(d, 'dia')}
              onCriarNoDia={(d, r) => abrirCriacao({ ancora: r, dia: d, ini: '09:00', fim: '10:00', diaInteiro: true })} />
          ) : vista === 'programacao' ? (
            <ListaProgramacao de={faixa.de} ate={faixa.ate} hoje={hoje} itens={itens} corDe={(it) => corDe(it)} vazio={vazio}
              nomeDe={(id) => nomes.get(id) || '—'} onAbrir={(it, r) => setAberto({ it, ancora: r })} />
          ) : colunas.length === 0 ? (
            <div className="gc-lista-vazia">Nenhuma agenda marcada na lateral. Marque as pessoas que quer ver.</div>
          ) : (
            <GradeHoras key={`${vista}-${modo}`} colunas={colunas} itens={itens} hoje={hoje} agoraHora={hora} corDe={corDe}
              podeArrastar={podeArrastar} onAbrir={(it, r) => setAberto({ it, ancora: r })} onIrParaDia={(d) => irPara(d, 'dia')}
              onCriar={(col, ini, fim, r) => abrirCriacao({ ancora: r, dia: col.dia, ini: hhmm(ini), fim: minParaHora(fim), diaInteiro: false, pessoa: col.pessoa, colKey: col.key, iniMin: ini, fimMin: fim })}
              onCriarDiaInteiro={(col, r) => abrirCriacao({ ancora: r, dia: col.dia, ini: '09:00', fim: '10:00', diaInteiro: true, pessoa: col.pessoa })}
              onMover={mover}
              rascunho={criando?.colKey && criando.iniMin !== undefined ? { colKey: criando.colKey, ini: criando.iniMin, fim: criando.fimMin! } : null} />
          )}
        </main>
      </div>

      {aberto && (
        <PopoverItem it={aberto.it} ancora={aberto.ancora} cor={corDe(aberto.it)} pessoas={porId} eu={eu}
          onFechar={() => setAberto(null)}
          onEditar={() => editar(aberto.it)}
          onExcluir={(so) => excluir(aberto.it, so)}
          onResponder={aberto.it.fonte === 'evento' && aberto.it.criadoPor !== eu ? (r) => responder(aberto.it, r) : undefined}
          onAbrirTicket={(id) => { setAberto(null); setTicket(id) }} />
      )}
      {criando && (
        <CriarRapido ancora={criando.ancora} quando={quandoCriacao(criando)} convidado={criando.pessoa && criando.pessoa.id !== eu ? criando.pessoa : null}
          salvando={salvando} erro={erroForm} onFechar={() => setCriando(null)}
          onSalvar={(t) => salvarEvento(rascunhoDaCriacao(criando, t))}
          onMais={(t) => { const r = rascunhoDaCriacao(criando, t); setCriando(null); setForm(r) }} />
      )}
      {form && (
        <FormEvento inicial={form} pessoas={pessoas} eu={eu} corPadrao={minhaPessoa?.cor || '#039be5'} salvando={salvando} erro={erroForm}
          avisoSerie={!!form.id && !!form.freq} onSalvar={salvarEvento} onFechar={() => setForm(null)} />
      )}
      {formLousa && (
        <FormLousa inicial={formLousa} tecnicos={pessoas.filter((p) => p.tecnico)} salvando={salvando} erro={erroForm}
          onSalvar={salvarLousa} onExcluir={formLousa.id ? () => excluirLousa(formLousa.id!) : undefined} onFechar={() => setFormLousa(null)} />
      )}
      {ticket && <TicketModal id={ticket} onFechar={() => { setTicket(null); carregar(true) }} onMudou={() => carregar(true)} zIndex={9100} />}
      {ajuda && (
        <div className="gc-fundo" onMouseDown={() => setAjuda(false)}>
          <div className="gc-modal gc-modal-p" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Ajuda">
            <div className="gc-modal-topo"><b style={{ flex: 1, fontSize: 18 }}>Como usar a {modoTecnicos ? 'Lousa' : 'Agenda'}</b><button className="gc-icone" aria-label="Fechar" onClick={() => setAjuda(false)}><X size={20} /></button></div>
            <div className="gc-modal-corpo">
              <p style={{ margin: 0, lineHeight: 1.5 }}>
                {modoTecnicos
                  ? 'A agenda dos técnicos: o que foi lançado na Lousa (serviço, oficina, faltou, feriado, saída) e as OS do POS nos dias de execução. Clique ou arraste num horário vazio para lançar; arraste um cartão para outro dia ou para outro técnico (vista Pessoas). Manhã = 8h–12h, tarde = 13h–18h.'
                  : 'A agenda de todo mundo, por setor. Marque na lateral quem você quer ver. Aparecem os compromissos criados aqui, as reuniões, as reservas da sala, os prazos dos tickets e a agenda dos técnicos (OS do POS e Lousa). Clique ou arraste num horário vazio para criar; arraste seu compromisso para mudar o horário; puxe a borda de baixo para mudar a duração. Na vista Pessoas, clicar na coluna de alguém já convida essa pessoa.'}
              </p>
              <div className="gc-atalhos">
                {[['T', 'Hoje'], ['J ou N', 'Próximo período'], ['K ou P', 'Período anterior'], ['D', 'Dia'], ['W', 'Semana'], ['M', 'Mês'], ['A', 'Programação'], ['E', 'Pessoas lado a lado'], ['C', modoTecnicos ? 'Lançar' : 'Criar compromisso'], ['/', 'Pesquisar'], ['Esc', 'Fechar']].map(([k, d]) => (
                  <Fragment key={k}><span><kbd>{k}</kbd></span><span>{d}</span></Fragment>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
      {toast && <div className="gc-toast" role="status">{toast}<button onClick={() => setToast(null)}>OK</button></div>}
    </div>
  )
}
