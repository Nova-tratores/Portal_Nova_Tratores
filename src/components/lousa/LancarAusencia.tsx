'use client'
// Lançamentos fora de OS no quadro da Lousa (José, 20/10/2026):
//  - clique no DIA  → Reunião ou Folga para todos os técnicos ou só os escolhidos;
//  - clique no TÉCNICO → Férias (nº de dias), Falta (meio período / 1 dia / de–até,
//    justificada ou não + motivo) ou Médico (dia todo ou período + atestado).
// Falta e Médico vão para o RH como pendentes de validação; Férias viram pedido ao RH.
// Também: DetalheAusencia = clique num lançamento já feito (ver, abrir atestado, apagar).
import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, Users, CalendarOff, Plane, UserX, Stethoscope, Paperclip, Check, Trash2, ExternalLink, Info, Clock, AlertTriangle } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { addDias } from '@/lib/salas/regras'
import { validarLancamento, diasDasFerias, MEIO_PERIODO, type Lancamento, type TipoAusencia, type Duracao } from '@/lib/lousa/ausencias'
import type { Pessoa } from '@/lib/agenda/regras'

const ddmm = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`
const NOMES = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado']
const nomeDia = (d: string) => `${NOMES[new Date(d + 'T12:00:00Z').getUTCDay()]}, ${ddmm(d)}`
const primeiro = (p: Pessoa) => (p.tecnicoNome || p.nome).split(' ')[0]

interface OpcaoTipo { id: TipoAusencia; rotulo: string; dica: string; cor: string; icone: React.ReactNode }
const DO_DIA: OpcaoTipo[] = [
  { id: 'reuniao', rotulo: 'Reunião', dica: 'Equipe reunida na loja', cor: '#7c3aed', icone: <Users size={20} /> },
  { id: 'folga', rotulo: 'Folga', dica: 'Dia ou período de folga', cor: '#64748b', icone: <CalendarOff size={20} /> },
]
const DO_TECNICO: OpcaoTipo[] = [
  { id: 'ferias', rotulo: 'Férias', dica: 'O RH aprova e agenda', cor: '#0d9488', icone: <Plane size={20} /> },
  { id: 'falta', rotulo: 'Falta', dica: 'Justificada ou não', cor: '#dc2626', icone: <UserX size={20} /> },
  { id: 'medico', rotulo: 'Médico', dica: 'Com atestado', cor: '#d97706', icone: <Stethoscope size={20} /> },
]

function Avatar({ p }: { p: Pessoa }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <span className="la-av" style={{ background: p.cor }}>{p.avatar_url ? <img src={p.avatar_url} alt="" /> : (p.tecnicoNome || p.nome).split(' ').map((x) => x[0]).slice(0, 2).join('').toUpperCase()}</span>
}

export default function LancarAusencia({ modo, dia, tecnico, tecnicos, onFechar, onFeito }: {
  modo: 'dia' | 'tecnico'
  dia: string
  /** modo 'tecnico': quem foi clicado */
  tecnico?: Pessoa
  /** todos os técnicos do quadro (modo 'dia') */
  tecnicos: Pessoa[]
  onFechar: () => void
  onFeito: (msg: string) => void
}) {
  const opcoes = modo === 'dia' ? DO_DIA : DO_TECNICO
  const [tipo, setTipo] = useState<TipoAusencia>(opcoes[0].id)
  const [quando, setQuando] = useState(dia)
  const [duracao, setDuracao] = useState<Duracao>('dia')
  const [ini, setIni] = useState('08:00')
  const [fim, setFim] = useState('12:00')
  const [nFerias, setNFerias] = useState(15)
  const [titulo, setTitulo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [justificada, setJustificada] = useState<boolean | null>(null)
  const [anexo, setAnexo] = useState<File | null>(null)
  const [escolhidos, setEscolhidos] = useState<string[]>(() => (modo === 'tecnico' && tecnico ? [tecnico.id] : tecnicos.map((t) => t.id)))
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [onFechar])

  const op = opcoes.find((o) => o.id === tipo)!
  const lanc: Lancamento = {
    tipo, dia: quando, diasFerias: tipo === 'ferias' ? nFerias : undefined, duracao: tipo === 'ferias' ? 'dia' : duracao,
    horaInicio: duracao === 'horas' ? ini : null, horaFim: duracao === 'horas' ? fim : null,
    titulo: titulo || null, motivo: motivo || null, justificada: tipo === 'falta' ? justificada : null, temAnexo: !!anexo, tecnicos: escolhidos,
  }
  const problema = validarLancamento(lanc)
  const diasF = useMemo(() => (tipo === 'ferias' ? diasDasFerias(quando, nFerias) : []), [tipo, quando, nFerias])
  const todos = escolhidos.length === tecnicos.length

  const enviar = async () => {
    if (problema) { setErro(problema); return }
    setEnviando(true); setErro('')
    try {
      const fd = new FormData()
      fd.append('dados', JSON.stringify(lanc))
      if (anexo) fd.append('anexo', anexo)
      const r = await fetch('/api/lousa/lancamentos', { method: 'POST', headers: await authHeaders(), body: fd })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Não deu para lançar.')
      const rh = j.rh as { enviados: number; problemas: string[] } | null
      onFeito(`${op.rotulo} lançada.${rh ? (rh.problemas.length ? ` Não foi para o RH: ${rh.problemas.join('; ')}` : ' Já está no RH.') : ''}`)
    } catch (e) { setErro((e as Error).message) } finally { setEnviando(false) }
  }

  const duracoes: { id: Duracao; rot: string }[] = tipo === 'falta'
    ? [{ id: 'manha', rot: 'Manhã' }, { id: 'tarde', rot: 'Tarde' }, { id: 'dia', rot: '1 dia' }, { id: 'horas', rot: 'Personalizado' }]
    : tipo === 'medico'
      ? [{ id: 'dia', rot: 'Dia todo' }, { id: 'horas', rot: 'Um período' }]
      : [{ id: 'dia', rot: 'Dia todo' }, { id: 'manha', rot: 'Manhã' }, { id: 'tarde', rot: 'Tarde' }, { id: 'horas', rot: 'Horário' }]

  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="la-fundo" onClick={onFechar}>
      <style>{CSS_LA}</style>
      <div className="la" role="dialog" onClick={(e) => e.stopPropagation()} style={{ ['--cor' as string]: op.cor }}>
        <header className="la-cab">
          {modo === 'tecnico' && tecnico ? <Avatar p={tecnico} /> : <span className="la-cab-ic"><CalendarOff size={18} /></span>}
          <div style={{ minWidth: 0 }}>
            <small>{modo === 'tecnico' ? 'Lançar para o técnico' : 'Agendar fora de OS'}</small>
            <b>{modo === 'tecnico' && tecnico ? (tecnico.tecnicoNome || tecnico.nome) : nomeDia(dia)}</b>
          </div>
          <button className="la-x" onClick={onFechar} title="Fechar (Esc)"><X size={18} /></button>
        </header>

        <div className="la-corpo">
          <div className="la-tipos">
            {opcoes.map((o) => (
              <button key={o.id} className={`la-tipo ${tipo === o.id ? 'on' : ''}`} style={{ ['--c' as string]: o.cor }}
                onClick={() => { setTipo(o.id); setDuracao(o.id === 'falta' ? 'dia' : 'dia'); setErro('') }}>
                <span className="la-tipo-ic">{o.icone}</span>
                <b>{o.rotulo}</b>
                <small>{o.dica}</small>
                {tipo === o.id && <Check size={14} className="la-tipo-ok" />}
              </button>
            ))}
          </div>

          {modo === 'dia' && (
            <section className="la-sec">
              <h4>Título <span>(opcional)</span></h4>
              <input className="la-in" value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={tipo === 'reuniao' ? 'Ex.: Reunião de segurança' : 'Ex.: Folga do feriado'} />
            </section>
          )}

          <section className="la-sec la-linha">
            <label><h4>{tipo === 'ferias' ? 'Começa em' : 'Dia'}</h4>
              <input type="date" className="la-in" value={quando} onChange={(e) => setQuando(e.target.value)} />
            </label>
            {tipo === 'ferias' && (
              <label><h4>Quantos dias</h4>
                <input type="number" className="la-in" min={1} max={30} value={nFerias} onChange={(e) => setNFerias(Math.max(1, Math.min(30, Number(e.target.value) || 1)))} />
              </label>
            )}
          </section>
          {tipo === 'ferias' && (
            <>
              <div className="la-chips">{[10, 15, 20, 30].map((n) => <button key={n} className={nFerias === n ? 'on' : ''} onClick={() => setNFerias(n)}>{n} dias</button>)}</div>
              <div className="la-resumo"><Plane size={14} /> De <b>{nomeDia(diasF[0])}</b> até <b>{nomeDia(diasF[diasF.length - 1])}</b> · volta em {nomeDia(addDias(diasF[diasF.length - 1], 1))}</div>
            </>
          )}

          {tipo !== 'ferias' && (
            <section className="la-sec">
              <h4>{tipo === 'falta' ? 'Quanto tempo' : 'Período'}</h4>
              <div className="la-seg">{duracoes.map((d) => <button key={d.id} className={duracao === d.id ? 'on' : ''} onClick={() => setDuracao(d.id)}>{d.rot}</button>)}</div>
              {(duracao === 'manha' || duracao === 'tarde') && <div className="la-dica"><Clock size={12} /> {MEIO_PERIODO[duracao].ini} às {MEIO_PERIODO[duracao].fim}</div>}
              {duracao === 'horas' && (
                <div className="la-linha" style={{ marginTop: 8 }}>
                  <label><h4>De</h4><input type="time" className="la-in" value={ini} onChange={(e) => setIni(e.target.value)} /></label>
                  <label><h4>Até</h4><input type="time" className="la-in" value={fim} onChange={(e) => setFim(e.target.value)} /></label>
                </div>
              )}
            </section>
          )}

          {tipo === 'falta' && (
            <section className="la-sec">
              <h4>A falta é…</h4>
              <div className="la-seg duplo">
                <button className={justificada === true ? 'on verde' : ''} onClick={() => setJustificada(true)}>Justificada</button>
                <button className={justificada === false ? 'on vermelho' : ''} onClick={() => setJustificada(false)}>Não justificada</button>
              </div>
            </section>
          )}

          {(tipo === 'falta' || tipo === 'medico' || tipo === 'ferias' || tipo === 'folga') && (
            <section className="la-sec">
              <h4>{tipo === 'falta' && justificada ? 'Motivo (obrigatório)' : 'Observação'} <span>{tipo === 'falta' && justificada ? '' : '(opcional)'}</span></h4>
              <textarea className="la-in" rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder={tipo === 'falta' ? 'Ex.: velório, filho doente, problema no carro…' : 'Ex.: consulta marcada às 9h'} />
            </section>
          )}

          {tipo === 'medico' && (
            <section className="la-sec">
              <h4>Atestado (obrigatório)</h4>
              <label className={`la-arq ${anexo ? 'ok' : ''}`}>
                <Paperclip size={16} />
                <span>{anexo ? anexo.name : 'Anexar o atestado (foto ou PDF, até 8 MB)'}</span>
                <input type="file" accept="image/*,application/pdf" onChange={(e) => setAnexo(e.target.files?.[0] || null)} />
              </label>
            </section>
          )}

          {modo === 'dia' && (
            <section className="la-sec">
              <h4>Para quem <span>· {todos ? 'todos os técnicos' : `${escolhidos.length} escolhido${escolhidos.length === 1 ? '' : 's'}`}</span></h4>
              <div className="la-tecs">
                <button className={`la-tec todos ${todos ? 'on' : ''}`} onClick={() => setEscolhidos(todos ? [] : tecnicos.map((t) => t.id))}><Users size={14} /> Todos</button>
                {tecnicos.map((t) => {
                  const on = escolhidos.includes(t.id)
                  return (
                    <button key={t.id} className={`la-tec ${on ? 'on' : ''}`} onClick={() => setEscolhidos((l) => (on ? l.filter((x) => x !== t.id) : [...l, t.id]))}>
                      <Avatar p={t} /> {primeiro(t)}
                    </button>
                  )
                })}
              </div>
            </section>
          )}

          {(tipo === 'falta' || tipo === 'medico' || tipo === 'ferias') && (
            <div className="la-rh"><Info size={14} /> {tipo === 'ferias' ? 'Vai para o RH como pedido. Quem agenda e paga é o RH.' : 'Vai para o RH como pendente. A folha só muda quando o RH confirmar.'}</div>
          )}
          {erro && <div className="la-erro"><AlertTriangle size={14} /> {erro}</div>}
        </div>

        <footer className="la-rod">
          <button className="la-btn" onClick={onFechar}>Cancelar</button>
          <button className="la-btn prim" disabled={enviando || !!problema} title={problema || ''} onClick={() => void enviar()}>
            {enviando ? 'Lançando…' : `Lançar ${op.rotulo.toLowerCase()}`}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

/** Clique num lançamento já feito: detalhes, atestado e apagar. */
export function DetalheAusencia({ id, titulo, cor, linhas, anexo, rhStatus, rhErro, emGrupo, onFechar, onFeito }: {
  id: string; titulo: string; cor: string; linhas: [string, string][]; anexo?: string | null
  rhStatus?: string | null; rhErro?: string | null; emGrupo: boolean
  onFechar: () => void; onFeito: (msg: string) => void
}) {
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const apagar = async (soDia: boolean) => {
    if (!confirm(soDia ? 'Apagar só este dia?' : 'Apagar o lançamento inteiro (todos os dias e técnicos)?')) return
    setOcupado(true); setErro('')
    try {
      const r = await fetch(`/api/lousa/lancamentos?id=${encodeURIComponent(id)}${soDia ? '&so=dia' : ''}`, { method: 'DELETE', headers: await authHeaders() })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Não deu para apagar.')
      onFeito(`Apagado.${j.avisos?.length ? ' ' + j.avisos.join(' ') : ''}`)
    } catch (e) { setErro((e as Error).message) } finally { setOcupado(false) }
  }
  const verAtestado = async () => {
    const w = window.open('', '_blank')
    try {
      const r = await fetch(`/api/lousa/lancamentos?atestado=${encodeURIComponent(anexo || '')}`, { headers: await authHeaders() })
      const j = await r.json()
      if (!r.ok || !j.url) throw new Error(j.error || 'Não achei o atestado.')
      if (w) w.location.href = j.url; else window.open(j.url, '_blank')
    } catch (e) { w?.close(); setErro((e as Error).message) }
  }
  if (typeof document === 'undefined') return null
  return createPortal(
    <div className="la-fundo" onClick={onFechar}>
      <style>{CSS_LA}</style>
      <div className="la pequeno" onClick={(e) => e.stopPropagation()} style={{ ['--cor' as string]: cor }}>
        <header className="la-cab">
          <span className="la-cab-ic" style={{ background: `color-mix(in srgb, ${cor} 14%, transparent)`, color: cor }}><CalendarOff size={18} /></span>
          <div style={{ minWidth: 0 }}><small>Lançamento da Lousa</small><b>{titulo}</b></div>
          <button className="la-x" onClick={onFechar}><X size={18} /></button>
        </header>
        <div className="la-corpo">
          <dl className="la-dl">{linhas.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>
          {rhStatus === 'enviado' && <div className="la-rh ok"><Check size={14} /> Já está no RH.</div>}
          {(rhStatus === 'erro' || rhStatus === 'sem_rh') && <div className="la-erro"><AlertTriangle size={14} /> Não foi para o RH: {rhErro}</div>}
          {erro && <div className="la-erro"><AlertTriangle size={14} /> {erro}</div>}
        </div>
        <footer className="la-rod">
          {anexo && <button className="la-btn" onClick={() => void verAtestado()}><ExternalLink size={14} /> Ver atestado</button>}
          {emGrupo && <button className="la-btn" disabled={ocupado} onClick={() => void apagar(true)}>Apagar só este dia</button>}
          <button className="la-btn perigo" disabled={ocupado} onClick={() => void apagar(false)}><Trash2 size={14} /> {emGrupo ? 'Apagar tudo' : 'Apagar'}</button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}

const CSS_LA = `
.la-fundo { position: fixed; inset: 0; z-index: 9850; background: rgba(15,23,42,.42); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; animation: laFundo .2s ease; }
@keyframes laFundo { from { opacity: 0 } }
.la { width: min(560px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; background: var(--portal-bg-card); color: var(--portal-text); border: 1px solid var(--portal-border); border-radius: 18px; box-shadow: 0 30px 80px rgba(15,23,42,.32); overflow: hidden; animation: laEntra .32s cubic-bezier(.34,1.3,.5,1); }
.la.pequeno { width: min(420px, 100%); }
@keyframes laEntra { from { opacity: 0; transform: translateY(14px) scale(.97) } }
.la-cab { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--portal-border); background: linear-gradient(180deg, color-mix(in srgb, var(--cor) 8%, transparent), transparent); }
.la-cab small { display: block; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted); }
.la-cab b { display: block; font-size: 17px; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.la-cab-ic { flex: none; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--cor) 14%, transparent); color: var(--cor); }
.la-x { margin-left: auto; flex: none; width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.la-av { flex: none; width: 34px; height: 34px; border-radius: 50%; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; color: #fefefe; font-size: 12px; font-weight: 800; }
.la-av img { width: 100%; height: 100%; object-fit: cover; }
.la-corpo { padding: 16px 18px; display: grid; gap: 14px; overflow-y: auto; }
.la-tipos { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.la-tipo { position: relative; display: grid; justify-items: start; gap: 4px; padding: 12px; border-radius: 14px; border: 1.5px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); cursor: pointer; text-align: left; font-family: inherit; transition: border-color .2s, box-shadow .2s, transform .15s; }
.la-tipo:hover { transform: translateY(-1px); border-color: color-mix(in srgb, var(--c) 50%, var(--portal-border)); }
.la-tipo.on { border-color: var(--c); box-shadow: 0 0 0 3px color-mix(in srgb, var(--c) 18%, transparent); background: color-mix(in srgb, var(--c) 5%, var(--portal-bg-card)); }
.la-tipo-ic { width: 36px; height: 36px; border-radius: 11px; display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--c) 13%, transparent); color: var(--c); }
.la-tipo b { font-size: 14px; }
.la-tipo small { font-size: 11px; color: var(--portal-text-muted); line-height: 1.35; }
.la-tipo-ok { position: absolute; top: 10px; right: 10px; color: var(--c); }
.la-sec { display: grid; gap: 6px; }
.la-sec h4, .la-linha h4 { margin: 0 0 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted); }
.la-sec h4 span { text-transform: none; letter-spacing: 0; font-weight: 600; }
.la-linha { display: flex; gap: 10px; flex-wrap: wrap; }
.la-linha > label { flex: 1; min-width: 140px; display: grid; }
.la-in { width: 100%; box-sizing: border-box; padding: 10px 12px; border-radius: 11px; border: 1px solid var(--portal-border); background: var(--portal-bg-secondary); color: var(--portal-text); font-family: inherit; font-size: 13.5px; }
.la-in:focus { outline: 2px solid color-mix(in srgb, var(--cor) 35%, transparent); border-color: var(--cor); }
textarea.la-in { resize: vertical; }
.la-seg { display: flex; flex-wrap: wrap; gap: 4px; padding: 4px; border-radius: 12px; background: var(--portal-bg-secondary); }
.la-seg button { flex: 1; min-width: 90px; padding: 8px 10px; border: none; border-radius: 9px; background: transparent; color: var(--portal-text-secondary); font-family: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer; transition: background .2s; }
.la-seg button.on { background: var(--portal-bg-card); color: var(--portal-text); box-shadow: 0 1px 4px rgba(0,0,0,.12); }
.la-seg button.on.verde { color: #047857; } .la-seg button.on.vermelho { color: #b91c1c; }
.la-dica { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--portal-text-muted); }
.la-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-top: -6px; }
.la-chips button { padding: 5px 11px; border-radius: 999px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text-secondary); font-family: inherit; font-weight: 700; font-size: 12px; cursor: pointer; }
.la-chips button.on { border-color: var(--cor); color: var(--cor); background: color-mix(in srgb, var(--cor) 8%, transparent); }
.la-resumo { display: flex; align-items: center; gap: 7px; flex-wrap: wrap; padding: 10px 12px; border-radius: 12px; background: color-mix(in srgb, var(--cor) 8%, transparent); color: var(--portal-text); font-size: 13px; }
.la-arq { position: relative; display: flex; align-items: center; gap: 9px; padding: 12px; border-radius: 12px; border: 1.5px dashed var(--portal-border); color: var(--portal-text-secondary); font-size: 13px; cursor: pointer; }
.la-arq.ok { border-style: solid; border-color: #16a34a; color: #047857; background: #f0fdf4; }
.la-arq input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.la-tecs { display: flex; flex-wrap: wrap; gap: 6px; }
.la-tec { display: inline-flex; align-items: center; gap: 7px; padding: 4px 11px 4px 4px; border-radius: 999px; border: 1.5px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text-secondary); font-family: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer; }
.la-tec .la-av { width: 26px; height: 26px; font-size: 10px; }
.la-tec.todos { padding: 6px 12px; }
.la-tec.on { border-color: var(--cor); color: var(--portal-text); background: color-mix(in srgb, var(--cor) 8%, transparent); }
.la-rh { display: flex; align-items: flex-start; gap: 7px; padding: 10px 12px; border-radius: 12px; background: var(--portal-bg-secondary); color: var(--portal-text-secondary); font-size: 12.5px; line-height: 1.45; }
.la-rh.ok { background: #ecfdf5; color: #047857; }
.la-erro { display: flex; align-items: flex-start; gap: 7px; padding: 10px 12px; border-radius: 12px; background: #fef2f2; color: #b91c1c; font-size: 12.5px; font-weight: 600; line-height: 1.45; }
.la-dl { margin: 0; display: grid; gap: 8px; }
.la-dl div { display: grid; grid-template-columns: 110px 1fr; gap: 8px; font-size: 13px; }
.la-dl dt { color: var(--portal-text-muted); font-weight: 700; }
.la-dl dd { margin: 0; }
.la-rod { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; padding: 14px 18px; border-top: 1px solid var(--portal-border); }
.la-btn { display: inline-flex; align-items: center; gap: 6px; padding: 10px 15px; border-radius: 11px; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); font-family: inherit; font-weight: 700; font-size: 13px; cursor: pointer; }
.la-btn.prim { border-color: var(--cor); background: var(--cor); color: #fefefe; box-shadow: 0 6px 16px color-mix(in srgb, var(--cor) 30%, transparent); }
.la-btn.perigo { color: #b91c1c; border-color: #fecaca; }
.la-btn:disabled { opacity: .5; cursor: not-allowed; box-shadow: none; }
`
