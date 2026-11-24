// Selo de ATRASADO (Fase 0 do redesenho, 24/11/2026). O vermelho cheio é da marca e
// dos botões; atrasado precisa se destacar pela FORMA: pílula de fundo claro +
// despertador. Usado no cartão do kanban e nas listas da página Quadros.
import { AlarmClock } from 'lucide-react'

// React 19 junta <style href> iguais: vai uma vez só na página, por mais selos que existam.
const CSS = `.selo-atrasado{display:inline-flex;align-items:center;gap:4px;padding:1px 7px;border-radius:999px;
font-weight:700;white-space:nowrap;background:#fee2e2;color:#b91c1c;border:1px solid #fecaca}
[data-theme="dark"] .selo-atrasado{background:rgba(248,113,113,.16);color:#fca5a5;border-color:rgba(248,113,113,.35)}`

export default function SeloAtrasado({ children, tamanho = 11.5 }: {
  /** Texto do selo; padrão "atrasado". */
  children?: React.ReactNode
  tamanho?: number
}) {
  return (
    <>
      <style href="selo-atrasado" precedence="default">{CSS}</style>
      <span className="selo-atrasado" style={{ fontSize: tamanho }}>
        <AlarmClock size={Math.round(tamanho)} aria-hidden /> {children ?? 'atrasado'}
      </span>
    </>
  )
}
