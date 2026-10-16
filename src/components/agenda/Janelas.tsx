'use client'
// AGENDA — janelas: detalhe (popover), criação rápida, formulário completo do compromisso
// e formulário da Lousa (técnicos). Tudo no visual do Google Agenda.
import CampoLocal from "./CampoLocal"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import {
  X, Pencil, Trash2, MapPin, Users, AlignLeft, Clock, Repeat, ExternalLink, Check, Search, Wrench, Calendar as CalIcon,
} from 'lucide-react'
import {
  rotuloHorario, textoSobre, normTexto, FREQ_ROTULO, PALETA, TIPOS_LOUSA, PERIODOS, localDe, ultimoDia, ordemSetor,
  type ItemAgenda, type Pessoa, type Freq, type Resposta, type TipoLousa, type PeriodoLousa,
} from '@/lib/agenda/regras'

const FONTE_ROTULO: Record<ItemAgenda['fonte'], string> = {
  evento: 'Compromisso', reuniao: 'Reunião', sala: 'Reserva da sala', ticket: 'Prazo de ticket', os: 'OS do POS', lousa: 'Lousa',
}
const LINK_ROTULO: Partial<Record<ItemAgenda['fonte'], string>> = {
  reuniao: 'Abrir a reunião', sala: 'Abrir a agenda da sala', ticket: 'Abrir o ticket', os: 'Abrir a OS', lousa: 'Abrir na Lousa',
}

/** Posiciona uma caixa ao lado do retângulo clicado, sem sair da tela. */
function usePosicao(ancora: DOMRect | null, largura: number) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    if (!ancora || !ref.current) return
    const h = ref.current.offsetHeight, W = window.innerWidth, H = window.innerHeight
    if (W < 640) { setPos({ left: 8, top: Math.max(8, H - h - 8) }); return }
    let left = ancora.right + 8
    if (left + largura > W - 8) left = ancora.left - largura - 8
    if (left < 8) left = Math.max(8, Math.min(W - largura - 8, ancora.left))
    const top = Math.max(8, Math.min(H - h - 8, ancora.top - 8))
    setPos({ left, top })
  }, [ancora, largura])
  return { ref, estilo: { left: pos?.left ?? -9999, top: pos?.top ?? -9999, width: typeof window !== 'undefined' && window.innerWidth < 640 ? 'calc(100vw - 16px)' : largura } }
}

function useEsc(fn: () => void) {
  useEffect(() => {
    const f = (e: KeyboardEvent) => { if (e.key === 'Escape') fn() }
    window.addEventListener('keydown', f)
    return () => window.removeEventListener('keydown', f)
  }, [fn])
}

export function Avatar({ p, tam = 28 }: { p: Pick<Pessoa, 'nome' | 'cor' | 'avatar_url'>; tam?: number }) {
  return (
    <span className="gc-avatar" style={{ width: tam, height: tam, fontSize: tam * 0.4, background: p.cor, color: textoSobre(p.cor) }}>
      {p.avatar_url
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={p.avatar_url} alt="" />
        : p.nome.split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}
    </span>
  )
}

// ------------------------------------------------------------------ detalhe
export function PopoverItem({ it, ancora, cor, pessoas, eu, onFechar, onEditar, onExcluir, onResponder, onAbrirTicket }: {
  it: ItemAgenda; ancora: DOMRect; cor: string; pessoas: Map<string, Pessoa>; eu: string
  onFechar: () => void; onEditar?: () => void; onExcluir?: (soEsta: boolean) => void
  onResponder?: (r: Resposta) => void; onAbrirTicket?: (id: string) => void
}) {
  const { ref, estilo } = usePosicao(ancora, 448)
  useEsc(onFechar)
  const [confirmar, setConfirmar] = useState(false)
  const respostas = it.respostas || {}
  const convidados = it.fonte === 'evento'
    ? [it.criadoPor!, ...Object.keys(respostas).filter((u) => u !== it.criadoPor)]
    : it.pessoas
  const minha = respostas[eu]
  const sims = Object.values(respostas).filter((r) => r === 'sim').length + (it.fonte === 'evento' ? 1 : 0)
  const aguardando = Object.values(respostas).filter((r) => r === 'pendente').length
  const marca: Record<Resposta, string> = { sim: '✓', nao: '✕', talvez: '?', pendente: '' }
  const editavel = it.podeEditar && (it.fonte === 'evento' || it.fonte === 'lousa')
  return (
    <div className="gc-fundo-leve" onMouseDown={onFechar}>
      <div ref={ref} className="gc-pop" style={estilo} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={it.titulo}>
        <div className="gc-pop-acoes">
          {editavel && onEditar && <button className="gc-icone" title="Editar" aria-label="Editar" onClick={onEditar}><Pencil size={18} /></button>}
          {editavel && onExcluir && <button className="gc-icone" title="Excluir" aria-label="Excluir" onClick={() => (it.serie ? setConfirmar(true) : onExcluir(false))}><Trash2 size={18} /></button>}
          <button className="gc-icone" title="Fechar" aria-label="Fechar" onClick={onFechar}><X size={20} /></button>
        </div>
        {confirmar && onExcluir && (
          <div className="gc-pop-confirma">
            <b>Excluir evento recorrente</b>
            <button className="gc-btn-txt" onClick={() => onExcluir(true)}>Este evento</button>
            <button className="gc-btn-txt" onClick={() => onExcluir(false)}>Todos os eventos</button>
            <button className="gc-btn-txt gc-muted" onClick={() => setConfirmar(false)}>Cancelar</button>
          </div>
        )}
        <div className="gc-pop-linha">
          <span className="gc-pop-ic"><span className="gc-quadrado" style={{ background: cor }} /></span>
          <div>
            <div className={`gc-pop-tit${it.esmaecido ? ' gc-riscado' : ''}`}>{it.titulo}</div>
            <div className="gc-pop-sub">{rotuloHorario(it)}</div>
            {it.serie && <div className="gc-pop-sub"><Repeat size={12} style={{ verticalAlign: -1 }} /> {FREQ_ROTULO[it.serie.freq]}{it.serie.ate ? `, até ${it.serie.ate.slice(8, 10)}/${it.serie.ate.slice(5, 7)}` : ''}</div>}
          </div>
        </div>
        {it.local && <div className="gc-pop-linha"><span className="gc-pop-ic"><MapPin size={18} /></span><div className="gc-pop-txt">{it.local}</div></div>}
        {convidados.length > 0 && (
          <div className="gc-pop-linha">
            <span className="gc-pop-ic"><Users size={18} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="gc-pop-txt">{convidados.length} {it.fonte === 'evento' ? (convidados.length === 1 ? 'participante' : 'convidados') : (convidados.length === 1 ? 'pessoa' : 'pessoas')}</div>
              {it.fonte === 'evento' && convidados.length > 1 && <div className="gc-pop-sub">{sims} sim{aguardando ? `, ${aguardando} aguardando` : ''}</div>}
              <div className="gc-pop-pessoas">
                {convidados.map((id) => {
                  const p = pessoas.get(id)
                  if (!p) return null
                  const r = id === it.criadoPor ? null : respostas[id]
                  return (
                    <div key={id} className="gc-pop-pessoa">
                      <span style={{ position: 'relative' }}>
                        <Avatar p={p} tam={26} />
                        {r && marca[r] && <span className={`gc-resp gc-resp-${r}`}>{marca[r]}</span>}
                      </span>
                      <span className="gc-pop-nome">{p.nome}{id === it.criadoPor && <small> · Organizador</small>}{r === 'nao' && <small> · não vai</small>}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        )}
        {it.descricao && <div className="gc-pop-linha"><span className="gc-pop-ic"><AlignLeft size={18} /></span><div className="gc-pop-txt gc-pre">{it.descricao}</div></div>}
        {(it.detalhes || []).length > 0 && (
          <div className="gc-pop-linha">
            <span className="gc-pop-ic">{it.fonte === 'os' || it.fonte === 'lousa' ? <Wrench size={18} /> : <CalIcon size={18} />}</span>
            <div className="gc-pop-txt">{it.detalhes!.map(([k, v]) => <div key={k}><span className="gc-muted">{k}:</span> {v}</div>)}</div>
          </div>
        )}
        <div className="gc-pop-rodape">
          <span className="gc-chip-fonte">{FONTE_ROTULO[it.fonte]}</span>
          {it.fonte === 'ticket' && typeof it.extra?.ticketId === 'string' && onAbrirTicket
            ? <button className="gc-btn-txt" onClick={() => onAbrirTicket(it.extra!.ticketId as string)}>{LINK_ROTULO.ticket} <ExternalLink size={13} /></button>
            : it.link && LINK_ROTULO[it.fonte] && <a className="gc-btn-txt" href={it.link}>{LINK_ROTULO[it.fonte]} <ExternalLink size={13} /></a>}
        </div>
        {minha && onResponder && (
          <div className="gc-pop-rsvp">
            <span>Vai participar?</span>
            {(['sim', 'nao', 'talvez'] as Resposta[]).map((r) => (
              <button key={r} className={`gc-rsvp${minha === r ? ' gc-rsvp-on' : ''}`} onClick={() => onResponder(r)}>
                {r === 'sim' ? 'Sim' : r === 'nao' ? 'Não' : 'Talvez'}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ criação rápida
export function CriarRapido({ ancora, quando, convidado, onSalvar, onMais, onFechar, salvando, erro }: {
  ancora: DOMRect; quando: string; convidado?: Pessoa | null; salvando: boolean; erro: string
  onSalvar: (titulo: string) => void; onMais: (titulo: string) => void; onFechar: () => void
}) {
  const { ref, estilo } = usePosicao(ancora, 420)
  const [titulo, setTitulo] = useState('')
  useEsc(onFechar)
  return (
    <div className="gc-fundo-leve" onMouseDown={onFechar}>
      <div ref={ref} className="gc-pop" style={estilo} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Novo compromisso">
        <div className="gc-pop-acoes"><button className="gc-icone" aria-label="Fechar" onClick={onFechar}><X size={20} /></button></div>
        <div style={{ padding: '0 20px 0 56px' }}>
          <input className="gc-titulo-input" autoFocus placeholder="Adicionar título" value={titulo} maxLength={200}
            onChange={(e) => setTitulo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && titulo.trim()) onSalvar(titulo) }} />
          <div className="gc-aba-tipo"><span className="gc-aba-on">Compromisso</span></div>
        </div>
        <div className="gc-pop-linha"><span className="gc-pop-ic"><Clock size={18} /></span><div className="gc-pop-txt">{quando}</div></div>
        {convidado && <div className="gc-pop-linha"><span className="gc-pop-ic"><Users size={18} /></span><div className="gc-pop-txt">Com {convidado.nome}</div></div>}
        {erro && <div className="gc-erro" style={{ margin: '4px 20px 0 56px' }}>{erro}</div>}
        <div className="gc-pop-botoes">
          <button className="gc-btn-txt" onClick={() => onMais(titulo)}>Mais opções</button>
          <button className="gc-btn-azul" disabled={salvando || !titulo.trim()} onClick={() => onSalvar(titulo)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ seletor de pessoas (convidados)
function SeletorPessoas({ pessoas, escolhidos, onChange, eu }: { pessoas: Pessoa[]; escolhidos: string[]; onChange: (ids: string[]) => void; eu: string }) {
  const [q, setQ] = useState('')
  const [aberto, setAberto] = useState(false)
  const porId = useMemo(() => new Map(pessoas.map((p) => [p.id, p])), [pessoas])
  const resultados = useMemo(() => {
    const t = normTexto(q)
    return pessoas.filter((p) => p.id !== eu && !escolhidos.includes(p.id) && (!t || normTexto(`${p.nome} ${p.setor}`).includes(t))).slice(0, 40)
  }, [q, pessoas, escolhidos, eu])
  const setores = useMemo(() => [...new Set(pessoas.map((p) => p.setor))].sort(ordemSetor), [pessoas])
  return (
    <div>
      <div className="gc-busca-convidado">
        <Search size={16} />
        <input placeholder="Adicionar convidados (nome ou setor)" value={q} onChange={(e) => { setQ(e.target.value); setAberto(true) }}
          onFocus={() => setAberto(true)} onBlur={() => setTimeout(() => setAberto(false), 150)} />
        {aberto && (resultados.length > 0 || !q) && (
          <div className="gc-sugestoes">
            {!q && <div className="gc-sug-setores">
              {setores.map((s) => (
                <button key={s} className="gc-chip" onMouseDown={(e) => { e.preventDefault(); onChange([...new Set([...escolhidos, ...pessoas.filter((p) => p.setor === s && p.id !== eu).map((p) => p.id)])]) }}>
                  + {s} inteiro
                </button>
              ))}
            </div>}
            {resultados.map((p) => (
              <button key={p.id} className="gc-sug" onMouseDown={(e) => { e.preventDefault(); onChange([...escolhidos, p.id]); setQ('') }}>
                <Avatar p={p} tam={24} /> <span>{p.nome}</span> <small>{p.setor}</small>
              </button>
            ))}
          </div>
        )}
      </div>
      {escolhidos.length > 0 && (
        <div className="gc-convidados">
          {escolhidos.map((id) => {
            const p = porId.get(id)
            if (!p) return null
            return (
              <div key={id} className="gc-convidado">
                <Avatar p={p} tam={26} /><span>{p.nome}<small>{p.setor}</small></span>
                <button className="gc-icone gc-icone-p" aria-label={`Remover ${p.nome}`} onClick={() => onChange(escolhidos.filter((x) => x !== id))}><X size={15} /></button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------ formulário completo
export interface RascunhoEvento {
  id?: string; titulo: string; descricao: string; local: string; diaInteiro: boolean
  diaIni: string; horaIni: string; diaFim: string; horaFim: string; participantes: string[]
  freq: Freq | ''; ate: string; cor: string | null
}

export function rascunhoDeItem(it: ItemAgenda): RascunhoEvento {
  const a = localDe(it.inicio), z = localDe(it.fim)
  const parts = Object.entries(it.respostas || {}).map(([u]) => u)
  // série: edita a partir do 1º dia (a data do evento original não muda pela ocorrência)
  return {
    id: it.ref, titulo: it.titulo, descricao: it.descricao || '', local: it.local || '', diaInteiro: it.diaInteiro,
    diaIni: a.dia, horaIni: it.diaInteiro ? '09:00' : a.hora, diaFim: it.diaInteiro ? ultimoDia(it) : z.dia, horaFim: it.diaInteiro ? '10:00' : z.hora,
    participantes: parts, freq: it.serie?.freq || '', ate: it.serie?.ate || '', cor: it.cor || null,
  }
}

export function FormEvento({ inicial, pessoas, eu, corPadrao, salvando, erro, onSalvar, onFechar, avisoSerie }: {
  inicial: RascunhoEvento; pessoas: Pessoa[]; eu: string; corPadrao: string; salvando: boolean; erro: string
  onSalvar: (r: RascunhoEvento) => void; onFechar: () => void; avisoSerie?: boolean
}) {
  const [r, setR] = useState(inicial)
  const up = (p: Partial<RascunhoEvento>) => setR((x) => ({ ...x, ...p }))
  useEsc(onFechar)
  return (
    <div className="gc-fundo" onMouseDown={onFechar}>
      <div className="gc-modal" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label={r.id ? 'Editar compromisso' : 'Novo compromisso'}>
        <div className="gc-modal-topo">
          <button className="gc-icone" aria-label="Fechar" onClick={onFechar}><X size={22} /></button>
          <input className="gc-titulo-grande" autoFocus placeholder="Adicionar título" value={r.titulo} maxLength={200} onChange={(e) => up({ titulo: e.target.value })} />
          <button className="gc-btn-azul" disabled={salvando || !r.titulo.trim()} onClick={() => onSalvar(r)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
        <div className="gc-modal-corpo">
          {avisoSerie && <div className="gc-aviso">Este é um evento que se repete: a mudança vale para todos os dias da série.</div>}
          <div className="gc-datas">
            <input type="date" value={r.diaIni} onChange={(e) => { const d = e.target.value; up({ diaIni: d, diaFim: r.diaFim < d ? d : r.diaFim }) }} aria-label="Data inicial" />
            {!r.diaInteiro && <input type="time" step={900} value={r.horaIni} onChange={(e) => up({ horaIni: e.target.value })} aria-label="Hora inicial" />}
            <span className="gc-muted">até</span>
            {!r.diaInteiro && <input type="time" step={900} value={r.horaFim} onChange={(e) => up({ horaFim: e.target.value })} aria-label="Hora final" />}
            <input type="date" value={r.diaFim} min={r.diaIni} onChange={(e) => up({ diaFim: e.target.value })} aria-label="Data final" />
          </div>
          <div className="gc-linha-opcoes">
            <label className="gc-check"><input type="checkbox" checked={r.diaInteiro} onChange={(e) => up({ diaInteiro: e.target.checked })} /> Dia inteiro</label>
            <select value={r.freq} onChange={(e) => up({ freq: e.target.value as Freq | '' })} aria-label="Repetição">
              <option value="">Não se repete</option>
              {(Object.keys(FREQ_ROTULO) as Freq[]).map((f) => <option key={f} value={f}>{FREQ_ROTULO[f]}</option>)}
            </select>
            {r.freq && <label className="gc-check">até <input type="date" value={r.ate} min={r.diaIni} onChange={(e) => up({ ate: e.target.value })} aria-label="Repetir até" /> <small className="gc-muted">(vazio = sem fim)</small></label>}
          </div>

          <div className="gc-secao"><Users size={18} /><b>Convidados</b></div>
          <SeletorPessoas pessoas={pessoas} escolhidos={r.participantes} onChange={(ids) => up({ participantes: ids })} eu={eu} />

          <CampoLocal valor={r.local} onChange={(v) => up({ local: v })} />
          <div className="gc-campo-ic gc-topo-al"><AlignLeft size={18} /><textarea placeholder="Adicionar descrição" rows={4} value={r.descricao} maxLength={4000} onChange={(e) => up({ descricao: e.target.value })} /></div>

          <div className="gc-cores">
            <span className="gc-muted">Cor</span>
            <button className={`gc-cor${!r.cor ? ' gc-cor-on' : ''}`} style={{ background: corPadrao }} title="Cor da minha agenda" onClick={() => up({ cor: null })}>{!r.cor && <Check size={13} />}</button>
            {PALETA.slice(0, 11).map((c) => (
              <button key={c.cor} className={`gc-cor${r.cor === c.cor ? ' gc-cor-on' : ''}`} style={{ background: c.cor }} title={c.nome} onClick={() => up({ cor: c.cor })}>
                {r.cor === c.cor && <Check size={13} color={textoSobre(c.cor)} />}
              </button>
            ))}
          </div>
          {erro && <div className="gc-erro">{erro}</div>}
        </div>
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ Lousa (técnicos)
export interface RascunhoLousa {
  id?: string; data: string; periodo: PeriodoLousa; tipo: TipoLousa; tecnico: string; acompanhante: string
  cliente: string; cnpj: string | null; descricao: string
}
interface ClienteBusca { cnpj_cpf: string; nome_fantasia: string; razao_social: string; cidade: string }

export function FormLousa({ inicial, tecnicos, salvando, erro, onSalvar, onExcluir, onFechar }: {
  inicial: RascunhoLousa; tecnicos: Pessoa[]; salvando: boolean; erro: string
  onSalvar: (r: RascunhoLousa) => void; onExcluir?: () => void; onFechar: () => void
}) {
  const [r, setR] = useState(inicial)
  const up = (p: Partial<RascunhoLousa>) => setR((x) => ({ ...x, ...p }))
  const [res, setRes] = useState<ClienteBusca[]>([])
  const [abrir, setAbrir] = useState(false)
  const t = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEsc(onFechar)
  const buscar = (q: string) => {
    up({ cliente: q, cnpj: null })
    if (t.current) clearTimeout(t.current)
    if (q.trim().length < 2) { setRes([]); return }
    t.current = setTimeout(async () => {
      try {
        const j = await (await fetch(`/api/pos/lousa?modo=clientes&q=${encodeURIComponent(q)}`)).json()
        setRes(Array.isArray(j) ? j : []); setAbrir(true)
      } catch { setRes([]) }
    }, 300)
  }
  const servico = r.tipo === 'servico'
  const nomesTec = tecnicos.filter((p) => p.tecnicoNome)
  const ok = !!r.data && (servico ? !!r.cliente.trim() : r.tipo === 'faltou' ? !!r.descricao.trim() : true)
  return (
    <div className="gc-fundo" onMouseDown={onFechar}>
      <div className="gc-modal gc-modal-p" onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-label="Lousa">
        <div className="gc-modal-topo">
          <button className="gc-icone" aria-label="Fechar" onClick={onFechar}><X size={22} /></button>
          <b style={{ flex: 1, fontSize: 18 }}>{r.id ? 'Editar na Lousa' : 'Novo na Lousa'}</b>
          {r.id && onExcluir && <button className="gc-icone" title="Excluir" aria-label="Excluir" onClick={onExcluir}><Trash2 size={18} /></button>}
          <button className="gc-btn-azul" disabled={salvando || !ok} onClick={() => onSalvar(r)}>{salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
        <div className="gc-modal-corpo">
          <div className="gc-chips">
            {(Object.keys(TIPOS_LOUSA) as TipoLousa[]).map((k) => (
              <button key={k} className={`gc-chip${r.tipo === k ? ' gc-chip-on' : ''}`} onClick={() => up({ tipo: k })}>
                <span className="gc-ponto" style={{ background: TIPOS_LOUSA[k].cor }} /> {TIPOS_LOUSA[k].rotulo}
              </button>
            ))}
          </div>
          <div className="gc-grade-form">
            <label>Técnico
              <select value={r.tecnico} onChange={(e) => up({ tecnico: e.target.value })}>
                <option value="">{r.tipo === 'feriado' ? 'Todos os técnicos' : 'Sem técnico'}</option>
                {nomesTec.map((p) => <option key={p.id} value={p.tecnicoNome!}>{p.nome}</option>)}
              </select>
            </label>
            <label>Data<input type="date" value={r.data} onChange={(e) => up({ data: e.target.value })} /></label>
            <label>Período
              <div className="gc-segmentado">
                {(Object.keys(PERIODOS) as PeriodoLousa[]).map((k) => (
                  <button key={k} className={r.periodo === k ? 'gc-seg-on' : ''} onClick={() => up({ periodo: k })}>{PERIODOS[k].rotulo}</button>
                ))}
              </div>
            </label>
            {servico && (
              <label>Acompanhante
                <select value={r.acompanhante} onChange={(e) => up({ acompanhante: e.target.value })}>
                  <option value="">Ninguém</option>
                  {nomesTec.filter((p) => p.tecnicoNome !== r.tecnico).map((p) => <option key={p.id} value={p.tecnicoNome!}>{p.nome}</option>)}
                </select>
              </label>
            )}
          </div>
          {servico && (
            <div className="gc-busca-convidado" style={{ marginTop: 14 }}>
              <Search size={16} />
              <input placeholder="Cliente (nome ou CNPJ)" value={r.cliente} onChange={(e) => buscar(e.target.value)} onFocus={() => res.length && setAbrir(true)} onBlur={() => setTimeout(() => setAbrir(false), 150)} />
              {abrir && res.length > 0 && (
                <div className="gc-sugestoes">
                  {res.map((c) => (
                    <button key={c.cnpj_cpf + c.nome_fantasia} className="gc-sug" onMouseDown={(e) => { e.preventDefault(); up({ cliente: c.nome_fantasia || c.razao_social, cnpj: c.cnpj_cpf }); setAbrir(false) }}>
                      <span>{c.nome_fantasia || c.razao_social}</span><small>{c.cidade} · {c.cnpj_cpf}</small>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="gc-campo-ic gc-topo-al"><AlignLeft size={18} />
            <textarea rows={3} placeholder={r.tipo === 'faltou' ? 'Motivo (obrigatório)' : servico ? 'O que vai fazer (ex.: REV 600H 6075)' : 'Observação'} value={r.descricao} onChange={(e) => up({ descricao: e.target.value })} />
          </div>
          {erro && <div className="gc-erro">{erro}</div>}
        </div>
      </div>
    </div>
  )
}

export const rascunhoLousaDeItem = (it: ItemAgenda): RascunhoLousa => {
  const x = it.extra || {}
  return {
    id: it.ref, data: String(x.data || localDe(it.inicio).dia), periodo: (x.periodo as PeriodoLousa) || 'manha', tipo: (x.tipo as TipoLousa) || 'servico',
    tecnico: String(x.tecnico_nome || ''), acompanhante: String(x.tecnico_acompanhante || ''), cliente: x.tipo === 'servico' ? String(x.cliente_nome || '') : '',
    cnpj: (x.cliente_cnpj as string) || null, descricao: String(x.descricao || ''),
  }
}
