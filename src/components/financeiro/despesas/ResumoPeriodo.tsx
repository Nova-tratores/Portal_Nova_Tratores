'use client'
// Resumo do período: o total é a pergunta que a tela responde, então ele é a
// única coisa grande. Os tiles são a régua que dá sentido ao número.
//
// O subtítulo NÃO é enfeite: sem "por vencimento" o total é ambíguo — não
// existe data de pagamento em finan_pagar, e alguém ia ler como dinheiro que
// saiu do caixa naquele mês.
//
// Sem comparação com o período anterior de propósito: com 7 meses de base e um
// mês de R$ 28k contra outro de R$ 120, a variação percentual só produz número
// assustador e sem significado.

import { formatarMoeda } from '@/lib/financeiro/utils'
import type { ResumoDespesas } from '@/lib/financeiro/despesas/tipos'

function Tile({ label, valor, sub, onClick, alerta }: {
  label: string; valor: string; sub?: string; onClick?: () => void; alerta?: boolean
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      style={{
        flex: '1 1 150px', minWidth: 0, textAlign: 'left', font: 'inherit',
        padding: '12px 14px', borderRadius: 12,
        border: `1px solid ${alerta ? 'rgba(217,119,6,.3)' : 'var(--portal-border)'}`,
        background: alerta ? 'rgba(217,119,6,.06)' : 'var(--portal-bg-secondary)',
        cursor: onClick ? 'pointer' : 'default',
      }}
    >
      <div style={{ fontSize: 10.5, letterSpacing: .6, textTransform: 'uppercase', color: 'var(--portal-text-muted)' }}>
        {label}
      </div>
      <div style={{
        fontSize: 17, fontWeight: 800, marginTop: 3, fontVariantNumeric: 'tabular-nums',
        color: alerta ? '#b45309' : 'var(--portal-text)',
      }}>
        {valor}
      </div>
      {sub && <div style={{ fontSize: 11, color: 'var(--portal-text-secondary)', marginTop: 1 }}>{sub}</div>}
    </Tag>
  )
}

export default function ResumoPeriodo({ resumo, intervalo, meses, onVerForaDoOmie }: {
  resumo: ResumoDespesas
  /** 'fev–ago/2026' */
  intervalo: string
  meses: number
  onVerForaDoOmie?: () => void
}) {
  return (
    <section style={{
      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
      borderRadius: 16, padding: 'clamp(16px, 3vw, 24px)', marginBottom: 16,
    }}>
      <div style={{ fontSize: 11, letterSpacing: 1, textTransform: 'uppercase', color: 'var(--portal-text-muted)' }}>
        Total do período
      </div>
      <div style={{
        fontSize: 'clamp(30px, 6vw, 44px)', fontWeight: 800, lineHeight: 1.1, marginTop: 4,
        color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums',
      }}>
        {formatarMoeda(resumo.total)}
      </div>
      <div style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)', marginTop: 6 }}>
        {meses} {meses === 1 ? 'mês' : 'meses'} · {intervalo} · <strong style={{ fontWeight: 600 }}>por vencimento</strong>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
        <Tile label="Média mensal" valor={formatarMoeda(resumo.mediaMensal)} sub={`em ${meses} meses`} />
        <Tile
          label="Mês mais caro"
          valor={resumo.mesMaisCaro ? formatarMoeda(resumo.mesMaisCaro.total) : '—'}
          sub={resumo.mesMaisCaro?.label}
        />
        <Tile
          label="Despesas"
          valor={String(resumo.qtd)}
          sub={`média de ${formatarMoeda(resumo.ticketMedio)}`}
        />
        {/* só aparece quando há o que resolver — tile dizendo "está tudo certo"
            ocupa espaço sem informar */}
        {resumo.foraDoOmie.qtd > 0 && (
          <Tile
            label="Fora do Omie"
            valor={`${resumo.foraDoOmie.qtd} · ${formatarMoeda(resumo.foraDoOmie.total)}`}
            sub="ver só estas"
            onClick={onVerForaDoOmie}
            alerta
          />
        )}
      </div>
    </section>
  )
}
