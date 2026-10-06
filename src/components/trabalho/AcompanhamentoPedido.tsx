'use client'
// "Meus pedidos": quem pediu vê, em cada ticket, se a pessoa confirmou,
// em que fase (coluna do quadro) está, a previsão do cronograma e as tarefas.
import { CircleCheck, Hourglass, CircleX, Columns3, CalendarRange, ListChecks } from 'lucide-react'

export interface DadosAcompanhamento {
  quadro: string | null
  coluna: string | null
  etapa: { inicio: string | null; fim: string | null } | null
  passos: { feitas: number; total: number } | null
}

const br = (iso: string) => iso.slice(8, 10) + '/' + iso.slice(5, 7)
const chip = (cor: string, fundo: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 8px', borderRadius: 999, fontSize: 11.5, fontWeight: 700, color: cor, background: fundo })

export default function AcompanhamentoPedido({ ticket, dados }: { ticket: { aceite?: string | null; aceite_motivo?: string | null; prazo?: string | null }; dados?: DadosAcompanhamento }) {
  const a = ticket.aceite
  const atrasou = !!(dados?.etapa?.fim && ticket.prazo && dados.etapa.fim > ticket.prazo)
  return (
    <>
      {a === 'pendente' && <span style={chip('#b45309', 'rgba(217,119,6,.14)')}><Hourglass size={11} /> Aguardando confirmação</span>}
      {a === 'ok' && <span style={chip('#047857', 'rgba(5,150,105,.12)')}><CircleCheck size={11} /> Confirmado</span>}
      {a === 'recusado' && <span style={chip('#b91c1c', 'rgba(220,38,38,.12)')} title={ticket.aceite_motivo || ''}><CircleX size={11} /> Recusou{ticket.aceite_motivo ? `: ${ticket.aceite_motivo}` : ''}</span>}
      {dados?.coluna && <span style={chip('var(--portal-text-secondary,#555)', 'var(--portal-bg,#f3f4f6)')}><Columns3 size={11} /> {dados.quadro ? `${dados.quadro} · ` : ''}{dados.coluna}</span>}
      {dados?.etapa?.fim && (
        <span style={chip(atrasou ? '#b91c1c' : 'var(--portal-text-secondary,#555)', atrasou ? 'rgba(220,38,38,.12)' : 'var(--portal-bg,#f3f4f6)')}>
          <CalendarRange size={11} /> previsto {dados.etapa.inicio ? `${br(dados.etapa.inicio)}–` : 'até '}{br(dados.etapa.fim)}{atrasou ? ' (atrasou)' : ''}
        </span>
      )}
      {dados?.passos && dados.passos.total > 0 && <span style={chip('var(--portal-text-secondary,#555)', 'var(--portal-bg,#f3f4f6)')}><ListChecks size={11} /> {dados.passos.feitas}/{dados.passos.total} tarefas</span>}
    </>
  )
}
