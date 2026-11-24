// Selos da Central de Trabalho (Fase 0 do redesenho, 24/11/2026). O vermelho cheio é da
// marca e dos botões; ATRASADO e URGENTE se destacam pela FORMA (pílula de fundo claro +
// ícone) e usam os tokens --cor-atrasado-* / --cor-urgente-* do globals.css (claro e escuro).
import { AlarmClock, Flame } from 'lucide-react'

// React 19 junta <style href> iguais: vai uma vez só na página, por mais selos que existam.
const CSS = `.selo-ct{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;font-weight:700;white-space:nowrap;border:1px solid}
.selo-atrasado{background:var(--cor-atrasado-fundo);color:var(--cor-atrasado-texto);border-color:var(--cor-atrasado-borda)}
.selo-urgente{background:var(--cor-urgente-fundo);color:var(--cor-urgente-texto);border-color:var(--cor-urgente-borda)}`

function Selo({ tipo, children, tamanho }: { tipo: 'atrasado' | 'urgente'; children: React.ReactNode; tamanho: number }) {
  const Icone = tipo === 'atrasado' ? AlarmClock : Flame
  return (
    <>
      <style href="selos-central" precedence="default">{CSS}</style>
      <span className={`selo-ct selo-${tipo}`} style={{ fontSize: tamanho }}>
        <Icone size={Math.round(tamanho)} aria-hidden /> {children}
      </span>
    </>
  )
}

export default function SeloAtrasado({ children, tamanho = 11.5 }: {
  /** Texto do selo; padrão "atrasado". */
  children?: React.ReactNode
  tamanho?: number
}) {
  return <Selo tipo="atrasado" tamanho={tamanho}>{children ?? 'atrasado'}</Selo>
}

/** Urgente = selo pequeno, nunca a cor do cartão inteiro. */
export function SeloUrgente({ children, tamanho = 11 }: { children?: React.ReactNode; tamanho?: number }) {
  return <Selo tipo="urgente" tamanho={tamanho}>{children ?? 'Urgente'}</Selo>
}
