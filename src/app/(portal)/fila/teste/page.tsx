'use client'
// PÁGINA DE TESTE da Minha fila (docs/padrao-telas.md §6: antes de trocar uma tela, as opções com
// os dados reais, e o José escolhe). As 3 usam os MESMOS dados e ações — só muda o desenho:
//   1. Lista  — a atual: tudo em listas (Hoje · Semana · Depois · Rotina) + coluna do lado
//   2. Foco   — "Agora" grande (Começar · Pausar · Concluir) + os próximos
//   3. Plano  — "Agora" compacto + o plano de trabalho desenhado por dia
// Em todas: estimar o tempo (tamanho sugerido + previsão de término) e aceitar já dizendo o tempo.
export const dynamic = 'force-dynamic'

import { useState } from 'react'
import { List, Focus, CalendarRange } from 'lucide-react'
import MinhaFila, { type LayoutFila } from '@/components/trabalho/MinhaFila'

const OPCOES: { id: LayoutFila; n: number; titulo: string; texto: string; icone: React.ReactNode; cor: string }[] = [
  { id: 'lista', n: 1, titulo: 'Lista', texto: 'A atual: a fila inteira em listas e a coluna do lado.', icone: <List size={16} />, cor: '#475569' },
  { id: 'foco', n: 2, titulo: 'Foco', texto: 'O item da vez grande, com Começar e Concluir. Embaixo, só os próximos.', icone: <Focus size={16} />, cor: '#2563eb' },
  { id: 'plano', n: 3, titulo: 'Plano', texto: 'O item da vez em cima e a semana desenhada, dia por dia.', icone: <CalendarRange size={16} />, cor: '#7c3aed' },
]

export default function FilaTestePage() {
  const [op, setOp] = useState<LayoutFila>('foco')
  return (
    <div>
      <div style={{ padding: 'clamp(12px,2vw,28px)', paddingBottom: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--portal-text-muted,#64748b)', marginBottom: 8 }}>
          Página de teste · escolha a opção que fica melhor para o dia a dia. Os dados são reais: o que você fizer aqui vale de verdade.
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(240px,100%),1fr))', gap: 10 }}>
          {OPCOES.map((o) => {
            const on = o.id === op
            return (
              <button key={o.id} onClick={() => setOp(o.id)} aria-pressed={on}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '12px 14px', borderRadius: 16, cursor: 'pointer', textAlign: 'left', font: 'inherit',
                  border: `1.5px solid ${on ? o.cor : 'var(--portal-border,#e2e8f0)'}`, background: on ? `color-mix(in srgb,${o.cor} 7%,var(--portal-surface,#fefefe))` : 'var(--portal-surface,#fefefe)', color: 'var(--portal-text,#0f172a)' }}>
                <span style={{ flex: 'none', width: 32, height: 32, borderRadius: 9, display: 'grid', placeItems: 'center', color: on ? '#fefefe' : o.cor, background: on ? o.cor : `color-mix(in srgb,${o.cor} 10%,transparent)` }}>{o.icone}</span>
                <span>
                  <span style={{ display: 'block', fontSize: 15, fontWeight: 500 }}>Opção {o.n} · {o.titulo}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--portal-text-secondary,#475569)' }}>{o.texto}</span>
                </span>
              </button>
            )
          })}
        </div>
      </div>
      <MinhaFila key={op} layout={op} />
    </div>
  )
}
