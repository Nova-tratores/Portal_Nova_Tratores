'use client'
// Ficha da OS aberta pelo clique no cartão da Lousa (José, 20/10/2026): o que importa para
// agendar — fase, dia de execução, técnicos, observações, pendente — gravando NA OS
// (o POS já vê) e o resto em "Abrir a OS completa no POS".
import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { X, ExternalLink, MapPin, Wrench, CalendarDays, User, Save, Pin, PinOff, FileText } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { useAuth } from '@/hooks/useAuth'
import { PHASES } from '@/lib/pos/constants'
import { corStatusOS } from './status'
import { novoValorTotal, numeroOS } from '@/lib/lousa/quadro'

interface Ficha {
  id: string; cliente: string | null; documento: string | null; cidade: string | null; endereco: string | null
  tecnico1: string | null; tecnico2: string | null; status: string | null; tipoServico: string | null; revisao: string | null
  projeto: string | null; solicitacao: string | null; observacoes: string | null; previsao: string | null; dias: string | null
  horaInicio: string | null; oficina: boolean; valorTotal: string | null; horas: string | null; km: string | null
  faturada: boolean; pendente: boolean | null
  pedido: string; valorHora: number; valorKm: number; ordemOmie: string | null
}

const formDe = (f: Ficha) => ({
  dia: String(f.dias || '').split(',')[0]?.trim().slice(0, 10) || f.previsao || '', hora: f.horaInicio ? f.horaInicio.slice(0, 5) : '', tecnico1: f.tecnico1 || '', tecnico2: f.tecnico2 || '',
  observacoes: f.observacoes || '', projeto: f.projeto || '', pedido: f.pedido || '', horas: String(numeroOS(f.horas)), km: String(numeroOS(f.km)),
})
const brl = (v: string | null) => { const n = Number(String(v || '').replace(',', '.')); return n ? n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—' }
const semZeros = (id: string) => id.replace(/^OS-?/i, '').replace(/^0+(?=\d)/, '')

export default function FichaOS({ id, tecnicos, onFechar, onMudou }: {
  id: string
  /** nomes dos técnicos como o POS grava (MAIÚSCULAS) */
  tecnicos: string[]
  onFechar: () => void
  onMudou: () => void
}) {
  const [f, setF] = useState<Ficha | null>(null)
  const [pode, setPode] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [form, setForm] = useState({ dia: '', hora: '', tecnico1: '', tecnico2: '', observacoes: '', projeto: '', pedido: '', horas: '', km: '' })
  const [fase, setFase] = useState('')
  const { userProfile } = useAuth()

  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/lousa/quadro?os=${encodeURIComponent(id)}`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (!vivo) return
        if (!r.ok) { setErro(j.error || 'Não deu para abrir a OS.'); return }
        setF(j.ficha); setPode(!!j.podeEditar); setFase(j.ficha.status || '')
        setForm(formDe(j.ficha))
      } catch { if (vivo) setErro('Sem conexão.') }
    })()
    return () => { vivo = false }
  }, [id])

  useEffect(() => { const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onFechar() }; window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc) }, [onFechar])

  const travada = !!f && (f.faturada || /conclu|cancel/i.test(f.status || ''))
  const base = f ? formDe(f) : null
  const campos = ['dia', 'hora', 'tecnico1', 'tecnico2', 'projeto', 'pedido', 'horas', 'km'] as const
  const mudou = !!f && !!base && (form.observacoes !== base.observacoes || (!travada && campos.some((k) => form[k] !== base[k])))
  // prévia do valor da OS se horas/km mudarem (mesma conta do servidor)
  const valorNovo = f ? novoValorTotal(f.valorTotal, { antes: f.horas, depois: form.horas, valor: f.valorHora || 0 }, { antes: f.km, depois: form.km, valor: f.valorKm || 0 }) : 0
  const valorMudou = !!f && (numeroOS(form.horas) !== numeroOS(f.horas) || numeroOS(form.km) !== numeroOS(f.km))

  const enviar = async (extra: Record<string, unknown>, msg: string) => {
    setSalvando(true); setErro(''); setOk('')
    try {
      const r = await fetch('/api/lousa/quadro', { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ acao: 'editar', ref: id, ...extra }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(j.error || 'Não gravou.')
      setF(j.ficha); setForm(formDe(j.ficha)); setOk(msg); onMudou()
    } catch (e) { setErro((e as Error).message) } finally { setSalvando(false) }
  }
  const salvar = () => {
    if (!f) return
    const extra: Record<string, unknown> = {}
    if (form.observacoes !== (f.observacoes || '')) extra.observacoes = form.observacoes
    if (!travada && base) {
      if (form.dia) extra.dia = form.dia
      extra.tecnico1 = form.tecnico1 || null
      extra.tecnico2 = form.tecnico2 || null
      if (form.hora !== base.hora) extra.hora = form.hora || null
      if (form.projeto !== base.projeto) extra.projeto = form.projeto
      if (form.pedido !== base.pedido) extra.pedido = form.pedido
      if (form.horas !== base.horas) extra.horas = form.horas
      if (form.km !== base.km) extra.km = form.km
    }
    void enviar(extra, 'Salvo.')
  }
  const trocarFase = async (nova: string) => {
    if (!f || nova === f.status) return
    setSalvando(true); setErro(''); setOk('')
    try {
      const r = await fetch(`/api/pos/ordens/${encodeURIComponent(id)}/fase`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ status: nova, userName: userProfile?.nome || 'Lousa' }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok || j.erro) throw new Error(j.erro || 'Não mudou a fase.')
      setF({ ...f, status: nova }); setFase(nova); setOk(`Fase: ${nova}.`); onMudou()
    } catch (e) { setFase(f.status || ''); setErro((e as Error).message) } finally { setSalvando(false) }
  }

  if (typeof document === 'undefined') return null
  const cor = corStatusOS(f?.status)
  const opcoesTec = [...new Set([...tecnicos, f?.tecnico1, f?.tecnico2].filter((x): x is string => !!x))].sort()
  return createPortal(
    <div className="fo-fundo" onClick={onFechar}>
      <style>{CSS_FICHA}</style>
      <aside className="fo" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={`OS ${id}`}>
        <header className="fo-cab">
          <div style={{ minWidth: 0 }}>
            <div className="fo-num">OS {semZeros(id)}{f?.pendente && <span className="fo-pend"><Pin size={11} /> pendente</span>}</div>
            <div className="fo-cli">{f?.cliente || (erro ? '' : 'Carregando…')}</div>
            {f?.documento && <div className="fo-doc">{f.documento}</div>}
          </div>
          <button className="fo-x" onClick={onFechar} title="Fechar (Esc)"><X size={18} /></button>
        </header>

        {erro && <div className="fo-erro">{erro}</div>}
        {ok && <div className="fo-ok">{ok}</div>}

        {f && (
          <div className="fo-corpo">
            <div className="fo-chips">
              <span className="fo-chip" style={{ color: cor, background: `color-mix(in srgb, ${cor} 12%, transparent)` }}>● {f.status || 'sem fase'}</span>
              {f.tipoServico && <span className="fo-chip">{f.tipoServico}{f.revisao ? ` · ${f.revisao}` : ''}</span>}
              <span className="fo-chip">{f.oficina ? <><Wrench size={11} /> Oficina</> : <><MapPin size={11} /> {f.cidade || 'sem cidade'}</>}</span>
            </div>

            <section className="fo-sec">
              <h4><FileText size={13} /> Solicitação do cliente</h4>
              <textarea className="fo-in" rows={3} value={form.pedido} disabled={!pode || travada} onChange={(e) => setForm({ ...form, pedido: e.target.value })} placeholder="O que o cliente pediu…" />
              <small className="fo-ajuda">Muda só o pedido do cliente. Modelo, chassi e serviço realizado ficam como estão.</small>
            </section>

            <section className="fo-sec">
              <h4>Projeto (máquina)</h4>
              <input className="fo-in" value={form.projeto} disabled={!pode || travada} onChange={(e) => setForm({ ...form, projeto: e.target.value })} placeholder="Ex.: 6075E MDI07516JR0004592" />
            </section>

            <section className="fo-sec">
              <h4>Fase</h4>
              <select className="fo-in" value={fase} disabled={!pode || salvando || f.faturada} onChange={(e) => { setFase(e.target.value); void trocarFase(e.target.value) }}>
                {(f.faturada ? PHASES.filter((p) => p === f.status || p === 'Concluída') : PHASES).map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
            </section>

            <section className="fo-sec fo-grade">
              <label><span><CalendarDays size={12} /> Dia de execução</span>
                <input type="date" className="fo-in" value={form.dia} disabled={!pode || travada} onChange={(e) => setForm({ ...form, dia: e.target.value })} />
                {String(f.dias || '').includes(',') && <small>OS de vários dias: todos andam juntos.</small>}
              </label>
              <label><span>Horário de início</span>
                <input type="time" className="fo-in" value={form.hora} disabled={!pode || travada} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                <small>Define a ordem quando tem mais de uma OS no dia.</small>
              </label>
              <label><span><User size={12} /> Técnico</span>
                <select className="fo-in" value={form.tecnico1} disabled={!pode || travada} onChange={(e) => setForm({ ...form, tecnico1: e.target.value })}>
                  <option value="">Sem técnico</option>
                  {opcoesTec.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
              <label><span><User size={12} /> 2º técnico</span>
                <select className="fo-in" value={form.tecnico2} disabled={!pode || travada} onChange={(e) => setForm({ ...form, tecnico2: e.target.value })}>
                  <option value="">Nenhum</option>
                  {opcoesTec.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </label>
            </section>

            <section className="fo-sec">
              <h4>Observações</h4>
              <textarea className="fo-in" rows={4} value={form.observacoes} disabled={!pode} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} placeholder="Observações internas da OS…" />
            </section>

            <section className="fo-sec fo-nums">
              <label><small>Horas</small><input className="fo-in" type="number" min={0} step={0.5} value={form.horas} disabled={!pode || travada} onChange={(e) => setForm({ ...form, horas: e.target.value })} /></label>
              <label><small>Km</small><input className="fo-in" type="number" min={0} step={1} value={form.km} disabled={!pode || travada} onChange={(e) => setForm({ ...form, km: e.target.value })} /></label>
              <div><small>Valor da OS</small><b>{brl(f.valorTotal)}</b>{valorMudou && <span className="fo-novo">→ {brl(String(valorNovo))}</span>}</div>
            </section>
            {valorMudou && <small className="fo-ajuda">Hora R$ {(f.valorHora || 0).toFixed(2)} · km R$ {(f.valorKm || 0).toFixed(2)} desta OS. O valor muda pela diferença.</small>}
            {f.ordemOmie && !travada && <div className="fo-aviso">Já está no Omie (nº {f.ordemOmie.replace(/^0+/, '')}). Se mudar horas, km, projeto ou pedido, a conferência antes de faturar atualiza lá.</div>}

            {travada && <div className="fo-aviso">{f.faturada ? 'OS faturada' : `OS ${f.status}`}: aqui só dá para mudar as observações.</div>}
          </div>
        )}

        <footer className="fo-rod">
          <a className="fo-btn sec" href={`/pos?id=${encodeURIComponent(id)}`} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Abrir a OS completa no POS</a>
          {f && pode && !travada && f.pendente !== null && (
            <button className="fo-btn sec" disabled={salvando} onClick={() => void enviar({ pendente: !f.pendente }, f.pendente ? 'Saiu das pendentes.' : 'Foi para as pendentes. A data continua na OS.')}>
              {f.pendente ? <><PinOff size={14} /> Tirar das pendentes</> : <><Pin size={14} /> Deixar pendente</>}
            </button>
          )}
          {f && pode && <button className="fo-btn prim" disabled={!mudou || salvando} onClick={salvar}><Save size={14} /> {salvando ? 'Gravando…' : 'Salvar na OS'}</button>}
        </footer>
      </aside>
    </div>,
    document.body,
  )
}

const CSS_FICHA = `
.fo-fundo { position: fixed; inset: 0; z-index: 9800; background: rgba(15,23,42,.35); backdrop-filter: blur(2px); display: flex; justify-content: flex-end; animation: foFundo .2s ease; }
@keyframes foFundo { from { opacity: 0 } }
.fo { width: min(440px, 100vw); height: 100%; background: var(--portal-bg-card); color: var(--portal-text); border-left: 1px solid var(--portal-border); box-shadow: -20px 0 50px rgba(15,23,42,.18); display: flex; flex-direction: column; animation: foEntra .3s cubic-bezier(.16,1,.3,1); }
@keyframes foEntra { from { transform: translateX(100%) } }
.fo-cab { display: flex; justify-content: space-between; gap: 10px; padding: 18px 20px 14px; border-bottom: 1px solid var(--portal-border); }
.fo-num { display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 800; letter-spacing: .4px; color: #2563eb; }
.fo-pend { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 999px; background: #fee2e2; color: #b91c1c; font-size: 10.5px; }
.fo-cli { font-size: 17px; font-weight: 800; margin-top: 3px; line-height: 1.25; }
.fo-doc { font-size: 12px; color: var(--portal-text-muted); margin-top: 2px; }
.fo-x { flex: none; width: 34px; height: 34px; border-radius: 10px; border: 1px solid var(--portal-border); background: transparent; color: var(--portal-text-secondary); cursor: pointer; display: flex; align-items: center; justify-content: center; }
.fo-erro, .fo-ok, .fo-aviso { margin: 12px 20px 0; padding: 9px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 600; }
.fo-erro { background: #fef2f2; color: #b91c1c; } .fo-ok { background: #ecfdf5; color: #047857; } .fo-aviso { background: #fffbeb; color: #92400e; margin: 0; }
.fo-corpo { flex: 1; overflow-y: auto; padding: 14px 20px 18px; display: grid; gap: 16px; align-content: start; }
.fo-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.fo-chip { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 999px; font-size: 11.5px; font-weight: 700; background: var(--portal-bg-secondary); color: var(--portal-text-secondary); }
.fo-sec h4 { display: flex; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted); }
.fo-texto { margin: 0; font-size: 13px; line-height: 1.5; color: var(--portal-text); white-space: pre-wrap; }
.fo-grade { display: grid; gap: 10px; }
.fo-grade label { display: grid; gap: 5px; }
.fo-grade label > span { display: flex; align-items: center; gap: 5px; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: .5px; color: var(--portal-text-muted); }
.fo-grade small { font-size: 11px; color: var(--portal-text-muted); }
.fo-in { width: 100%; box-sizing: border-box; padding: 9px 11px; border-radius: 10px; border: 1px solid var(--portal-border); background: var(--portal-bg-secondary); color: var(--portal-text); font-family: inherit; font-size: 13px; }
.fo-in:focus { outline: 2px solid color-mix(in srgb, #2563eb 40%, transparent); border-color: #2563eb; }
textarea.fo-in { resize: vertical; line-height: 1.45; }
.fo-nums { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.fo-nums > div, .fo-nums > label { display: grid; gap: 4px; padding: 9px 10px; border-radius: 10px; background: var(--portal-bg-secondary); }
.fo-nums .fo-in { background: var(--portal-bg-card); padding: 6px 8px; }
.fo-novo { font-size: 12px; font-weight: 800; color: #2563eb; }
.fo-ajuda { display: block; margin-top: 4px; font-size: 11px; color: var(--portal-text-muted); line-height: 1.4; }
.fo-nums small { display: block; font-size: 10.5px; color: var(--portal-text-muted); font-weight: 700; }
.fo-nums b { font-size: 14px; }
.fo-rod { display: flex; flex-wrap: wrap; gap: 8px; padding: 14px 20px; border-top: 1px solid var(--portal-border); }
.fo-btn { display: inline-flex; align-items: center; gap: 6px; padding: 9px 13px; border-radius: 10px; font-family: inherit; font-weight: 700; font-size: 12.5px; cursor: pointer; text-decoration: none; border: 1px solid var(--portal-border); background: var(--portal-bg-card); color: var(--portal-text); }
.fo-btn.prim { margin-left: auto; border-color: #2563eb; background: #2563eb; color: #fefefe; }
.fo-btn:disabled { opacity: .5; cursor: not-allowed; }
`
