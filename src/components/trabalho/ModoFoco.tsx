'use client'
// MODO FOCO (melhorias 3.3, 25/11/2026) — tela limpa com SÓ o item da vez: cronômetro, o checklist
// do pedido (se houver) e dois botões, Pausar e Concluir. Abre ao clicar em Começar e volta sozinho
// ao recarregar a página enquanto o cronômetro estiver aberto (a sessão fica em tickets_tempo).
// "Sair do foco" só fecha a tela: o cronômetro continua rodando.
import { useEffect, useState } from 'react'
import { Pause, Check, Minimize2, Square, CheckSquare } from 'lucide-react'
import { authHeaders } from '@/lib/auth/client'
import { COR } from './estiloFila'

interface Passo { id: number; titulo: string; concluida: boolean }

const relogio = (ms: number) => { const s = Math.max(0, Math.floor(ms / 1000)); return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` }
const nf = (h: number) => String(Math.round(h * 10) / 10).replace('.', ',')

const CSS = `.foco{position:fixed;inset:0;z-index:1000;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;padding:24px 16px;
background:var(--portal-bg,#f8fafc);color:var(--portal-text,#0f172a);overflow:auto;animation:foco-entra .25s ease both}
@keyframes foco-entra{from{opacity:0}to{opacity:1}}
@media (prefers-reduced-motion:reduce){.foco{animation:none}}
.foco *{box-sizing:border-box}
.foco-sair{position:absolute;top:14px;right:14px}
.foco-tit{margin:0;max-width:720px;text-align:center;font-size:clamp(20px,4vw,30px);font-weight:500;line-height:1.25}
.foco-rel{font-size:clamp(44px,12vw,84px);font-weight:500;font-variant-numeric:tabular-nums;letter-spacing:-.02em;color:${COR.ok}}
.foco-sub{font-size:14px;color:var(--portal-text-muted,#64748b);text-align:center}
.foco-lista{width:100%;max-width:520px;display:flex;flex-direction:column;gap:6px}
.foco-passo{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;border-radius:12px;border:1px solid var(--portal-border,#e2e8f0);
background:var(--portal-surface,#fefefe);color:inherit;font:inherit;font-size:15px;text-align:left;cursor:pointer}
.foco-passo.feito{color:var(--portal-text-muted,#64748b);text-decoration:line-through}
.foco-botoes{display:flex;gap:12px;flex-wrap:wrap;justify-content:center}
.foco-botoes .mf-btn{min-height:52px;padding:0 26px;font-size:16px;border-radius:14px}`

export default function ModoFoco({ item, inicio, gastoAntes, semCronometro, ocupado, onPausar, onConcluir, onSair }: {
  item: { id: string; numero: number; titulo: string; horas: number }
  /** Quando a sessão aberta começou (ISO). null = sem cronômetro (falta o SQL). */
  inicio: string | null
  /** Horas já feitas ANTES desta sessão. */
  gastoAntes: number
  semCronometro?: boolean
  ocupado: boolean
  onPausar: () => void
  onConcluir: () => void
  onSair: () => void
}) {
  const [agoraMs, setAgoraMs] = useState(() => Date.now())
  const [passos, setPassos] = useState<Passo[] | null>(null)
  const [podeMexer, setPodeMexer] = useState(false)

  useEffect(() => { const t = setInterval(() => setAgoraMs(Date.now()), 1000); return () => clearInterval(t) }, [])
  // Esc = sair do foco (o cronômetro continua).
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onSair() }
    window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k)
  }, [onSair])
  useEffect(() => {
    let vivo = true
    ;(async () => {
      try {
        const r = await fetch(`/api/tickets/${item.id}/tarefas`, { headers: await authHeaders(), cache: 'no-store' })
        const j = await r.json()
        if (vivo && r.ok) { setPassos(j.passos || []); setPodeMexer(!!j.pode_mexer) }
      } catch { /* sem checklist */ }
    })()
    return () => { vivo = false }
  }, [item.id])

  const marcar = async (p: Passo) => {
    if (!podeMexer) return
    setPassos((l) => l && l.map((x) => (x.id === p.id ? { ...x, concluida: !x.concluida } : x)))
    try {
      const r = await fetch(`/api/tickets/${item.id}/tarefas`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) }, body: JSON.stringify({ tarefa_id: p.id, feita: !p.concluida }) })
      if (!r.ok) setPassos((l) => l && l.map((x) => (x.id === p.id ? { ...x, concluida: p.concluida } : x)))
    } catch { setPassos((l) => l && l.map((x) => (x.id === p.id ? { ...x, concluida: p.concluida } : x))) }
  }

  const sessao = inicio ? agoraMs - Date.parse(inicio) : 0
  const feitas = gastoAntes + sessao / 3600000

  return (
    <div className="foco mf" role="dialog" aria-modal="true" aria-label={`Modo foco: #${item.numero} ${item.titulo}`}>
      <style href="modo-foco" precedence="default">{CSS}</style>
      <button className="mf-btn peq foco-sair" onClick={onSair} title="Fecha esta tela. O cronômetro continua (Esc)"><Minimize2 size={15} /> Sair do foco</button>
      <span className="foco-sub" style={{ color: COR.ok }}>Fazendo agora</span>
      <h1 className="foco-tit">#{item.numero} {item.titulo}</h1>
      {semCronometro
        ? <span className="foco-sub">Cronômetro desligado: falta rodar sql/fila-tempo.sql no Supabase.</span>
        : <span className="foco-rel" aria-live="off">{relogio(sessao)}</span>}
      <span className="foco-sub">{nf(feitas)} h feitas de {nf(item.horas)} h estimadas</span>

      {passos && passos.length > 0 && (
        <div className="foco-lista" aria-label="Checklist do pedido">
          {passos.map((p) => (
            <button key={p.id} className={`foco-passo${p.concluida ? ' feito' : ''}`} onClick={() => marcar(p)} disabled={!podeMexer} aria-pressed={p.concluida}>
              {p.concluida ? <CheckSquare size={18} color={COR.ok} /> : <Square size={18} color={COR.info} />} {p.titulo}
            </button>
          ))}
        </div>
      )}

      <div className="foco-botoes">
        <button className="mf-btn" disabled={ocupado} onClick={onPausar}><Pause size={18} /> Pausar</button>
        <button className="mf-btn cheio" style={{ ['--c' as string]: COR.ok }} disabled={ocupado} onClick={onConcluir}><Check size={18} /> Concluir</button>
      </div>
    </div>
  )
}
