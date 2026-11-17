'use client'
// Tarefas da reunião (José, 17/11/2026): "o que a ação significa? deixa claro o que é para fazer;
// está feio para abrir uma tarefa; tem que dar tarefa para quem não está na reunião".
// Tarefa = alguém fica responsável por fazer algo até uma data. Vira um ticket (sino + agenda da pessoa).
// Formulário em 3 passos: o que fazer → quem (participantes ou OUTRA pessoa) → até quando.
// Grava pela ação `criar_acao`; qualquer participante cria, em qualquer fase (menos cancelada).
import { useState } from 'react'
import { Check, ListChecks, Plus, UserPlus, X } from 'lucide-react'
import type { UsuarioMin } from '@/lib/tickets/constantes'
import UserSelect from '@/components/tickets/UserSelect'
import type { AcaoUI } from './tipos'
import { chamar, hojeISO, primeiroNome } from './comum'

const somarDia = (iso: string, n: number) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
const dow = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay()
const diaUtil = (iso: string) => { let d = iso; while (dow(d) === 0 || dow(d) === 6) d = somarDia(d, 1); return d }
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
const iniciais = (n: string) => n.split(' ').filter(Boolean).map((x) => x[0]).slice(0, 2).join('').toUpperCase()

export function prazosRapidos(hoje: string): { rotulo: string; dia: string }[] {
  const amanha = diaUtil(somarDia(hoje, 1))
  const sexta = somarDia(hoje, dow(hoje) === 5 ? 7 : ((5 - dow(hoje) + 7) % 7 || 7))
  return [
    { rotulo: 'Amanhã', dia: amanha },
    { rotulo: `Sexta ${ddmm(sexta)}`, dia: sexta },
    { rotulo: 'Em 1 semana', dia: diaUtil(somarDia(hoje, 7)) },
    { rotulo: 'Em 15 dias', dia: diaUtil(somarDia(hoje, 15)) },
  ]
}

export const CSS_TAREFAS = `
.tr{display:flex;flex-direction:column;gap:12px}
.tr *{font-weight:inherit;box-sizing:border-box}
.tr-it{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:12px;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);text-align:left;width:100%;cursor:pointer;color:inherit;font:inherit;transition:border-color .2s}
.tr-it:hover{border-color:color-mix(in srgb,#2563eb 35%,var(--portal-border,#e2e8f0))}
.tr-it .tx{flex:1;min-width:0;font-size:14px;color:var(--portal-text,#0f172a)}
.tr-it .tx small{display:block;font-size:12.5px;color:var(--portal-text-muted,#64748b);margin-top:2px}
.tr-pill{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:12.5px;white-space:nowrap;color:var(--c);background:color-mix(in srgb,var(--c) 12%,transparent)}
.tr-av{width:28px;height:28px;border-radius:50%;display:inline-grid;place-items:center;font-size:10.5px;color:#fefefe;background:#64748b;overflow:hidden;flex:none}
.tr-av.p{width:24px;height:24px;font-size:10px}
.tr-av img{width:100%;height:100%;object-fit:cover}
.tr-form{display:flex;flex-direction:column;gap:16px;padding:16px;border-radius:14px;border:1px solid color-mix(in srgb,#059669 30%,var(--portal-border,#e2e8f0));background:color-mix(in srgb,#059669 4%,var(--portal-surface,#fefefe))}
.tr-passo{display:flex;flex-direction:column;gap:8px}
.tr-passo > label{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--portal-text,#0f172a)}
.tr-passo > label i{font-style:normal;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-size:12px;color:#fefefe;background:#059669;flex:none}
.tr-passo > label small{font-size:12.5px;color:var(--portal-text-muted,#64748b)}
.tr-campo{width:100%;height:44px;padding:0 12px;border-radius:10px;font-size:15px;border:1px solid var(--portal-border,#e5e7eb);background:var(--portal-surface,#fefefe);color:var(--portal-text,#111111);outline:none;font-family:inherit}
.tr-campo:focus{border-color:#059669;box-shadow:0 0 0 3px color-mix(in srgb,#059669 14%,transparent)}
.tr-ops{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.tr-op{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 13px;border-radius:10px;font-size:13.5px;cursor:pointer;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);font-family:inherit}
.tr-op:hover{border-color:color-mix(in srgb,#059669 40%,var(--portal-border,#e2e8f0))}
.tr-op.on{border-color:#059669;background:#059669;color:#fefefe}
.tr-acoes{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}
.tr-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;height:42px;padding:0 16px;border-radius:11px;font-size:14px;font-weight:500;border:1px solid var(--portal-border,#e2e8f0);background:var(--portal-surface,#fefefe);color:var(--portal-text-secondary,#475569);cursor:pointer;font-family:inherit}
.tr-btn.ok{border:none;color:#fefefe;background:#059669;box-shadow:0 6px 14px -8px #059669}
.tr-btn:disabled{opacity:.5;cursor:default}
@media (max-width:640px){.tr-acoes .tr-btn{flex:1}}
`

function Av({ u, nome, p }: { u?: UsuarioMin; nome: string; p?: boolean }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className={`tr-av${p ? ' p' : ''}`} title={nome}>{u?.avatar_url ? <img src={u.avatar_url} alt="" /> : iniciais(nome)}</span>
}

export interface NovaTarefa { titulo: string; responsavel_id: string; prazo: string }

/** O formulário em 3 passos — usado aqui e na janela "Nova tarefa" da condução. */
export function FormNovaTarefa({ pessoas, usuarios, tituloInicial = '', onSalvar, onCancelar }: {
  pessoas: string[]
  usuarios: Record<string, UsuarioMin>
  tituloInicial?: string
  onSalvar: (t: NovaTarefa) => Promise<void>
  onCancelar: () => void
}) {
  const hoje = hojeISO()
  const [texto, setTexto] = useState(tituloInicial)
  const [quem, setQuem] = useState('')
  const [deFora, setDeFora] = useState<UsuarioMin | null>(null)
  const [buscandoFora, setBuscandoFora] = useState(false)
  const [prazo, setPrazo] = useState('')
  const [outra, setOutra] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')
  const nome = (id: string) => usuarios[id]?.nome || (deFora?.id === id ? deFora.nome : '—')
  const pronto = !!(texto.trim() && quem && prazo)

  const salvar = async () => {
    if (!pronto || salvando) return
    setSalvando(true); setErro('')
    try { await onSalvar({ titulo: texto.trim(), responsavel_id: quem, prazo }) }
    catch (e) { setErro(e instanceof Error ? e.message : 'Falha ao criar') } finally { setSalvando(false) }
  }

  return (
    <div className="tr-form">
      <div className="tr-passo">
        <label><i>1</i> O que precisa ser feito?</label>
        <input autoFocus className="tr-campo" value={texto} maxLength={200} onChange={(e) => setTexto(e.target.value)}
          placeholder="Ex.: Ligar para o cliente da OS 0850 e confirmar a entrega" />
      </div>
      <div className="tr-passo">
        <label><i>2</i> Quem vai fazer? <small>pode ser alguém de fora da reunião</small></label>
        <div className="tr-ops">
          {pessoas.map((id) => (
            <button key={id} className={`tr-op${quem === id ? ' on' : ''}`} style={{ paddingLeft: 5 }} onClick={() => { setQuem(id); setBuscandoFora(false) }}>
              <Av p u={usuarios[id]} nome={nome(id)} /> {primeiroNome(nome(id))}
            </button>
          ))}
          {deFora && !pessoas.includes(deFora.id) && (
            <button className={`tr-op${quem === deFora.id ? ' on' : ''}`} style={{ paddingLeft: 5 }} onClick={() => setQuem(deFora.id)}>
              <Av p u={deFora} nome={deFora.nome} /> {primeiroNome(deFora.nome)}
            </button>
          )}
          <button className="tr-op" onClick={() => setBuscandoFora(!buscandoFora)}><UserPlus size={15} /> Outra pessoa</button>
        </div>
        {buscandoFora && (
          <div style={{ maxWidth: 420 }}>
            <UserSelect value="" barraBusca autoFocus placeholder="Digite o nome de quem vai fazer…" excluir={pessoas}
              onChange={(id, u) => { if (u) { setDeFora(u); setQuem(id); setBuscandoFora(false) } }} />
          </div>
        )}
      </div>
      <div className="tr-passo">
        <label><i>3</i> Até quando?</label>
        <div className="tr-ops">
          {prazosRapidos(hoje).map((p) => (
            <button key={p.rotulo} className={`tr-op${prazo === p.dia && !outra ? ' on' : ''}`} onClick={() => { setPrazo(p.dia); setOutra(false) }}>{p.rotulo}</button>
          ))}
          {outra
            ? <input type="date" className="tr-campo" style={{ width: 170, height: 38, fontSize: 14 }} min={hoje} value={prazo} onChange={(e) => setPrazo(e.target.value)} />
            : <button className="tr-op" onClick={() => { setOutra(true); setPrazo('') }}>Outra data</button>}
        </div>
      </div>
      {erro && <div style={{ color: '#dc2626', fontSize: 13 }}>{erro}</div>}
      <div className="tr-acoes">
        <button className="tr-btn" onClick={onCancelar}><X size={15} /> Cancelar</button>
        <button className="tr-btn ok" disabled={!pronto || salvando} onClick={salvar}>
          <Check size={15} /> {salvando ? 'Criando…' : pronto ? `Dar a tarefa para ${primeiroNome(nome(quem))} até ${ddmm(prazo)}` : !texto.trim() ? 'Escreva o que fazer' : !quem ? 'Escolha quem faz' : 'Escolha até quando'}
        </button>
      </div>
    </div>
  )
}

function situacao(a: AcaoUI, hoje: string): { texto: string; cor: string } {
  if (a.status === 'cancelado') return { texto: 'cancelada', cor: '#94a3b8' }
  if (a.status === 'resolvido' || a.status === 'fechado') return { texto: 'feita', cor: '#059669' }
  if (a.aceite === 'recusado') return { texto: 'recusada', cor: '#dc2626' }
  if (a.prazo && a.prazo < hoje) return { texto: `atrasada · ${ddmm(a.prazo)}`, cor: '#dc2626' }
  if (a.aceite === 'pendente') return { texto: `falta a pessoa confirmar · até ${a.prazo ? ddmm(a.prazo) : '—'}`, cor: '#d97706' }
  return { texto: a.prazo ? `até ${ddmm(a.prazo)}` : 'sem prazo', cor: '#475569' }
}

export default function TarefasRapidas({ reuniaoId, pessoas, usuarios, acoes, podeCriar, onCriada, onAbrir, semCabecalho }: {
  reuniaoId: string
  pessoas: string[]
  usuarios: Record<string, UsuarioMin>
  acoes: AcaoUI[]
  podeCriar: boolean
  onCriada: () => void
  onAbrir?: (ticketId: string) => void
  semCabecalho?: boolean
}) {
  const hoje = hojeISO()
  const [criando, setCriando] = useState(false)
  const nome = (id: string) => usuarios[id]?.nome || '—'
  const abertas = acoes.filter((a) => !['resolvido', 'fechado', 'cancelado'].includes(a.status)).length

  const criar = async (t: NovaTarefa) => {
    await chamar(`/api/reunioes/${reuniaoId}/acoes`, { json: { acao: 'criar_acao', ...t } })
    setCriando(false)
    window.dispatchEvent(new Event('central-trabalho-mudou'))
    onCriada()
  }

  return (
    <div className="tr">
      <style>{CSS_TAREFAS}</style>
      {!semCabecalho && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ flex: 'none', width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#059669', background: 'color-mix(in srgb,#059669 9%,var(--portal-surface,#fefefe))', border: '1px solid color-mix(in srgb,#059669 18%,transparent)' }}><ListChecks size={16} /></span>
          <span style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 17, fontWeight: 500, color: 'var(--portal-text,#0f172a)' }}>Tarefas</span>
            <span style={{ fontSize: 12.5, color: 'var(--portal-text-muted,#64748b)' }}>Quem ficou de fazer o quê, e até quando. A pessoa recebe no sino e na agenda.</span>
          </span>
          <span style={{ flex: 1 }} />
          {acoes.length > 0 && <span className="tr-pill" style={{ ['--c' as string]: '#475569' }}>{abertas} em aberto</span>}
        </div>
      )}

      {acoes.length === 0 && !criando && <div style={{ fontSize: 13.5, color: 'var(--portal-text-muted,#64748b)' }}>Nenhuma tarefa ainda.</div>}
      {acoes.map((a) => {
        const s = situacao(a, hoje)
        return (
          <button key={a.id} className="tr-it" onClick={() => onAbrir?.(a.id)} title="Abrir a tarefa">
            <Av u={usuarios[a.responsavel_id]} nome={nome(a.responsavel_id)} />
            <span className="tx">{a.titulo}<small>{nome(a.responsavel_id)} faz</small></span>
            <span className="tr-pill" style={{ ['--c' as string]: s.cor }}>{s.texto}</span>
          </button>
        )
      })}

      {podeCriar && (criando
        ? <FormNovaTarefa pessoas={pessoas} usuarios={usuarios} onCancelar={() => setCriando(false)}
            onSalvar={criar} />
        : <button className="tr-btn ok" style={{ alignSelf: 'flex-start' }} onClick={() => setCriando(true)}><Plus size={16} /> Nova tarefa</button>)}
    </div>
  )
}
