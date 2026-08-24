'use client'
// Lista mês → semana → dia.
//
// O truque para três níveis não virarem sanfona: SÓ UM É CONTROLE.
//   mês    = accordion (o único clicável) — atual aberto, resto fechado
//   semana = divisor com total, régua que dá ritmo à leitura
//   dia    = cabeçalho com número grande + dia da semana, como na referência
//
// Com 3 a 12 despesas por mês, colapsar semana e dia só esconderia informação e
// cobraria dois cliques por nada.
//
// Os três totais (mês, semana, dia) alinham no MESMO eixo à direita: vira uma
// coluna de números que se lê de relance sem abrir nada.

import { ChevronDown } from 'lucide-react'
import { formatarMoeda } from '@/lib/financeiro/utils'
import type { LogDespesa } from '@/lib/financeiro/despesas/logs'
import type { Despesa, NoMes } from '@/lib/financeiro/despesas/tipos'
import LinhaDespesa from './LinhaDespesa'

export default function ListaDespesas({
  arvore, mesAtual, abertos, onAlternarMes, mapaCores, logsPorDespesa, onClassificar, onFiltrarCategoria,
}: {
  arvore: NoMes[]
  mesAtual: string
  abertos: Record<string, boolean>
  onAlternarMes: (mes: string) => void
  mapaCores?: Map<string, number>
  logsPorDespesa?: Map<string, LogDespesa[]>
  onClassificar?: (d: Despesa) => void
  onFiltrarCategoria?: (categoria: string) => void
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {arvore.map((mes) => {
        const aberto = abertos[mes.mes] ?? (mes.mes === mesAtual)
        const eAtual = mes.mes === mesAtual
        return (
          <section key={mes.mes} style={{
            background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
            borderRadius: 16, overflow: 'hidden',
          }}>
            <button
              onClick={() => onAlternarMes(mes.mes)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 12, padding: '14px 18px', border: 'none', background: 'none',
                cursor: 'pointer', textAlign: 'left', font: 'inherit',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <ChevronDown
                  size={17}
                  style={{ color: 'var(--portal-text-muted)', flexShrink: 0, transform: aberto ? 'none' : 'rotate(-90deg)', transition: 'transform .15s' }}
                />
                <strong style={{ fontSize: 15.5, color: 'var(--portal-text)' }}>{mes.label}</strong>
                {eAtual && (
                  <span style={{
                    fontSize: 9.5, fontWeight: 800, letterSpacing: .5, padding: '3px 8px', borderRadius: 20,
                    color: '#b45309', background: 'rgba(217,119,6,.12)', border: '1px solid rgba(217,119,6,.28)',
                  }}>
                    MÊS ATUAL
                  </span>
                )}
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0 }}>
                <span style={{ fontSize: 12, color: 'var(--portal-text-muted)' }}>
                  {mes.qtd} despesa{mes.qtd === 1 ? '' : 's'}
                </span>
                <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', minWidth: 116, textAlign: 'right' }}>
                  {formatarMoeda(mes.total)}
                </span>
              </span>
            </button>

            {aberto && (
              <div style={{ padding: '0 18px 14px' }}>
                {mes.semanas.map((s) => (
                  <div key={`${mes.mes}-${s.segunda}`}>
                    {/* divisor de semana: régua, não controle */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 10, padding: '14px 0 6px',
                    }}>
                      <span style={{
                        fontSize: 10.5, fontWeight: 700, letterSpacing: .8, textTransform: 'uppercase',
                        color: 'var(--portal-text-muted)', whiteSpace: 'nowrap',
                      }}>
                        {s.label}
                      </span>
                      <span style={{ flex: 1, height: 1, background: 'var(--portal-border)' }} />
                      <span style={{
                        fontSize: 12, fontWeight: 700, color: 'var(--portal-text-secondary)',
                        fontVariantNumeric: 'tabular-nums', minWidth: 116, textAlign: 'right',
                      }}>
                        {formatarMoeda(s.total)}
                      </span>
                    </div>

                    {s.dias.map((dia) => (
                      <div key={dia.dia} style={{ display: 'flex', gap: 14, padding: '4px 0' }}>
                        {/* cabeçalho de dia: número grande + dia da semana */}
                        <div style={{
                          flex: '0 0 52px', textAlign: 'center', paddingTop: 8,
                          borderRight: '1px solid var(--portal-border)',
                        }}>
                          <div style={{ fontSize: 22, fontWeight: 800, lineHeight: 1, color: 'var(--portal-text)', fontVariantNumeric: 'tabular-nums' }}>
                            {dia.numero}
                          </div>
                          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: .6, color: 'var(--portal-text-muted)', marginTop: 3 }}>
                            {dia.diaSemana}
                          </div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          {dia.itens.map((d) => (
                            <LinhaDespesa
                              key={d.id}
                              d={d}
                              mapaCores={mapaCores}
                              logs={logsPorDespesa?.get(String(d.id)) || []}
                              onClassificar={onClassificar}
                              onFiltrarCategoria={onFiltrarCategoria}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </section>
        )
      })}
    </div>
  )
}
