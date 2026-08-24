'use client'
// Histórico de alterações feitas pela tela de Despesas.
//
// Serve nos dois lugares: embutido na expansão de uma despesa (só o que
// aconteceu com ela) e dentro do modal do botão "Alterações" (tudo o que mudou
// por aqui, em ordem).

import { History, User, X } from 'lucide-react'
import { descreverLog, type LogDespesa } from '@/lib/financeiro/despesas/logs'

// `created_at` é INSTANTE (timestamptz), não data de calendário — aqui
// converter pro fuso é correto, ao contrário do que vale pra data_vencimento.
function dataHora(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  } catch { return '' }
}

export function ListaLogs({ logs, comDespesa = false }: { logs: LogDespesa[]; comDespesa?: boolean }) {
  if (logs.length === 0) {
    return (
      <div style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>
        Nenhuma alteração registrada.
      </div>
    )
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {logs.map((l) => (
        <div key={String(l.id)} style={{
          display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 12,
          color: 'var(--portal-text-secondary)',
        }}>
          <span style={{ color: 'var(--portal-text)' }}>
            {comDespesa && l.entidade_label && (
              <strong style={{ marginRight: 6 }}>{l.entidade_label}</strong>
            )}
            {descreverLog(l)}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--portal-text-muted)' }}>
            <User size={11} /> {l.user_nome || '—'}
          </span>
          <span style={{ color: 'var(--portal-text-muted)', fontVariantNumeric: 'tabular-nums' }}>
            {dataHora(l.created_at)}
          </span>
        </div>
      ))}
    </div>
  )
}

export default function ModalLogs({ logs, carregando, onFechar }: {
  logs: LogDespesa[]
  carregando: boolean
  onFechar: () => void
}) {
  return (
    <div
      onClick={onFechar}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,23,42,.45)', display: 'grid', placeItems: 'center', padding: 16 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 100%)', maxHeight: '80vh', display: 'flex', flexDirection: 'column',
          background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
          borderRadius: 16, overflow: 'hidden', boxShadow: '0 20px 50px rgba(0,0,0,.25)',
        }}
      >
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--portal-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <strong style={{ fontSize: 14, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 7 }}>
            <History size={16} /> Alterações feitas nesta tela
          </strong>
          <button onClick={onFechar} style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--portal-text-muted)', padding: 4 }}>
            <X size={18} />
          </button>
        </div>
        <div style={{ overflowY: 'auto', padding: 16 }}>
          {carregando
            ? <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted)' }}>Carregando…</div>
            : <ListaLogs logs={logs} comDespesa />}
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--portal-border)', fontSize: 11, color: 'var(--portal-text-muted)', lineHeight: 1.5 }}>
          Só o que foi alterado <strong>por esta tela</strong>. Lançamento, envio ao Omie e anexos têm histórico próprio no card da despesa.
        </div>
      </div>
    </div>
  )
}
