// Selos da Central de Trabalho (Fase 0 do redesenho, 24/11/2026). O vermelho cheio é da
// marca e dos botões; ATRASADO e URGENTE se destacam pela FORMA (pílula de fundo claro +
// ícone) e usam os tokens --cor-atrasado-* / --cor-urgente-* do globals.css (claro e escuro).
import { AlarmClock, Flame, Ban } from 'lucide-react'

// React 19 junta <style href> iguais: vai uma vez só na página, por mais selos que existam.
const CSS = `.selo-ct{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;font-weight:700;white-space:nowrap;border:1px solid}
.selo-atrasado{background:var(--cor-atrasado-fundo);color:var(--cor-atrasado-texto);border-color:var(--cor-atrasado-borda)}
.selo-urgente{background:var(--cor-urgente-fundo);color:var(--cor-urgente-texto);border-color:var(--cor-urgente-borda)}
.selo-atr1{background:#fef9c3;color:#854d0e;border-color:#fde68a}
.selo-atr2{background:#ffedd5;color:#c2410c;border-color:#fed7aa}
.selo-impossivel{background:#f5f3ff;color:#6d28d9;border-color:#ddd6fe}
[data-theme="dark"] .selo-atr1{background:rgba(250,204,21,.14);color:#fde047;border-color:rgba(250,204,21,.35)}
[data-theme="dark"] .selo-atr2{background:rgba(251,146,60,.16);color:#fdba74;border-color:rgba(251,146,60,.35)}
[data-theme="dark"] .selo-impossivel{background:rgba(167,139,250,.16);color:#c4b5fd;border-color:rgba(167,139,250,.35)}`

function Selo({ tipo, children, tamanho, extra = '' }: { tipo: 'atrasado' | 'urgente' | 'impossivel'; children: React.ReactNode; tamanho: number; extra?: string }) {
  const Icone = tipo === 'atrasado' ? AlarmClock : tipo === 'impossivel' ? Ban : Flame
  return (
    <>
      <style href="selos-central" precedence="default">{CSS}</style>
      <span className={`selo-ct selo-${tipo}${extra}`} style={{ fontSize: tamanho }}>
        <Icone size={Math.round(tamanho)} aria-hidden /> {children}
      </span>
    </>
  )
}

export default function SeloAtrasado({ children, tamanho = 11.5, dias }: {
  /** Texto do selo; padrão "atrasado". */
  children?: React.ReactNode
  tamanho?: number
  /** Escala do atraso (melhorias 2.4): até 3 dias amarelo · 4–15 laranja · 16+ vermelho. Sem dias = vermelho. */
  dias?: number
}) {
  const extra = dias == null ? '' : dias <= 3 ? ' selo-atr1' : dias <= 15 ? ' selo-atr2' : ''
  return <Selo tipo="atrasado" tamanho={tamanho} extra={extra}>{children ?? 'atrasado'}</Selo>
}

/** Prazo impossível (melhorias 2.2): a fila só começa depois do prazo. Diferente de "atrasado". */
export function SeloImpossivel({ children, tamanho = 11.5 }: { children?: React.ReactNode; tamanho?: number }) {
  return <Selo tipo="impossivel" tamanho={tamanho}>{children ?? 'prazo impossível'}</Selo>
}

/** Urgente = selo pequeno, nunca a cor do cartão inteiro. */
export function SeloUrgente({ children, tamanho = 11 }: { children?: React.ReactNode; tamanho?: number }) {
  return <Selo tipo="urgente" tamanho={tamanho}>{children ?? 'Urgente'}</Selo>
}
