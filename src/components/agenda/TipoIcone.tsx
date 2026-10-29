'use client'
// AGENDA — ícone e seletor do tipo do compromisso (reunião, visita, trabalho externo…).
// A lista e as cores ficam em lib/agenda/regras.ts (TIPOS_COMPROMISSO).
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Users, Tractor, Briefcase, Plane, Truck, GraduationCap, Phone, Tent, Target, HeartPulse, Palmtree, CircleDot, ChevronDown, Check,
  type LucideIcon,
} from 'lucide-react'
import { TIPOS_COMPROMISSO, infoTipo, type TipoCompromisso } from '@/lib/agenda/regras'

const ICONES: Record<TipoCompromisso, LucideIcon> = {
  reuniao: Users, visita_cliente: Tractor, trabalho_fora: Briefcase, viagem: Plane, entrega: Truck,
  treinamento: GraduationCap, ligacao: Phone, evento: Tent, foco: Target, pessoal: HeartPulse, folga: Palmtree, outro: CircleDot,
}

export function TipoIcone({ tipo, size = 14, cor }: { tipo: TipoCompromisso; size?: number; cor?: string }) {
  const I = ICONES[tipo] || CircleDot
  return <I size={size} color={cor} style={{ flex: 'none' }} aria-hidden />
}

// Quantas vezes cada tipo foi usado neste navegador (José, 29/10/2026: "dropdown do mais usado para o menos usado").
const CHAVE_USO = 'agenda-tipos-uso'
export function lerUsoTipos(): Partial<Record<TipoCompromisso, number>> {
  try { return JSON.parse(localStorage.getItem(CHAVE_USO) || '{}') } catch { return {} }
}
export function contarUsoTipo(t: TipoCompromisso | null) {
  if (!t) return
  try { const u = lerUsoTipos(); u[t] = (u[t] || 0) + 1; localStorage.setItem(CHAVE_USO, JSON.stringify(u)) } catch { /* sem storage */ }
}

/** Lista suspensa, do mais usado ao menos usado (uso = deste navegador + compromissos já criados). Tipo é opcional. */
export function SeletorTipo({ valor, onChange, uso }: { valor: TipoCompromisso | null; onChange: (t: TipoCompromisso | null) => void; uso?: Partial<Record<TipoCompromisso, number>> }) {
  const [aberto, setAberto] = useState(false)
  const [local, setLocal] = useState<Partial<Record<TipoCompromisso, number>>>({})
  const caixa = useRef<HTMLDivElement>(null)
  useEffect(() => { setTimeout(() => setLocal(lerUsoTipos()), 0) }, [])
  useEffect(() => {
    if (!aberto) return
    const fora = (e: MouseEvent) => { if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false) }
    document.addEventListener('mousedown', fora)
    return () => document.removeEventListener('mousedown', fora)
  }, [aberto])
  const ordem = useMemo(() => {
    const n = (t: TipoCompromisso) => (local[t] || 0) + (uso?.[t] || 0)
    return TIPOS_COMPROMISSO.map((t, i) => ({ ...t, n: n(t.id), i })).sort((a, b) => b.n - a.n || a.i - b.i)
  }, [local, uso])
  const atual = infoTipo(valor)
  return (
    <div className="gc-tipo-drop" ref={caixa}>
      <button type="button" className="gc-tipo-botao" aria-haspopup="listbox" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}
        onKeyDown={(e) => { if (e.key === 'Escape' && aberto) { e.stopPropagation(); setAberto(false) } }}>
        {atual ? <><TipoIcone tipo={atual.id} size={16} cor={atual.cor} /><span>{atual.rotulo}</span></> : <span className="gc-muted">Escolher o tipo</span>}
        <ChevronDown size={16} className="gc-muted" style={{ marginLeft: 'auto' }} />
      </button>
      {aberto && (
        <div className="gc-tipo-menu" role="listbox">
          {ordem.map((t) => (
            <button key={t.id} type="button" role="option" aria-selected={valor === t.id} className={`gc-tipo-op${valor === t.id ? ' gc-tipo-op-on' : ''}`}
              onClick={() => { onChange(t.id); setAberto(false) }}>
              <span className="gc-tipo-ic" style={{ background: `color-mix(in srgb, ${t.cor} 14%, transparent)` }}><TipoIcone tipo={t.id} size={15} cor={t.cor} /></span>
              <span className="gc-tipo-txt"><span>{t.rotulo}</span><small>{t.dica}</small></span>
              {valor === t.id ? <Check size={16} color={t.cor} /> : t.n > 0 && <small className="gc-muted">{t.n}×</small>}
            </button>
          ))}
          {valor && <button type="button" className="gc-tipo-op gc-tipo-limpar" onClick={() => { onChange(null); setAberto(false) }}>Sem tipo</button>}
        </div>
      )}
    </div>
  )
}
