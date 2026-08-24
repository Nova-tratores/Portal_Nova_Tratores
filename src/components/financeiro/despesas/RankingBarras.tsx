'use client'
// Ranking horizontal — serve categoria E fornecedor.
//
// Barras em CSS, não em SVG: os rótulos aqui são longos ("Adiantamento a
// Fornecedores", razão social inteira) e o que se quer é rótulo à esquerda,
// barra no meio e valor à direita, na mesma linha. Em Recharts isso exige
// margem esquerda enorme e truncagem desajeitada; em CSS sai natural, herda os
// tokens do tema sem hook e ainda é clicável linha a linha.
//
// Rosca foi descartada por medição, não por gosto: um fornecedor concentra 65%
// do total — viraria uma fatia dominante com lascas ilegíveis ao lado.
//
// `colorir`:
//   'identidade' → cor por nome (categoria; a MESMA cor do chip na lista)
//   'serie'      → uma cor só (fornecedor; aqui a cor não liga nada a lugar nenhum)

import { CINZA_OUTROS, corDaCategoria } from '@/lib/charts/paleta'
import { useChartTheme } from '@/lib/charts/useChartTheme'
import { formatarMoeda } from '@/lib/financeiro/utils'
import type { FatiaRanking } from '@/lib/financeiro/despesas/tipos'

export default function RankingBarras({
  titulo, dados, colorir, mapaCores, ativo, onSelecionar, rodape,
}: {
  titulo: string
  dados: FatiaRanking[]
  colorir: 'identidade' | 'serie'
  mapaCores?: Map<string, number>
  ativo?: string | null
  onSelecionar?: (chave: string, rotulo: string) => void
  rodape?: React.ReactNode
}) {
  const t = useChartTheme()
  const maior = dados.reduce((m, d) => Math.max(m, d.total), 0)

  return (
    <section style={{
      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
      borderRadius: 16, padding: 16, flex: '1 1 320px', minWidth: 0,
    }}>
      <h2 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text)', margin: '0 0 12px' }}>{titulo}</h2>

      {dados.length === 0 ? (
        <div style={{ padding: '28px 0', textAlign: 'center', fontSize: 13, color: 'var(--portal-text-muted)' }}>
          Nada neste período.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {dados.map((d) => {
            const cor = d.ehOutros
              ? CINZA_OUTROS[t.modo]
              : colorir === 'identidade'
                ? corDaCategoria(d.rotulo, t.modo, mapaCores)
                : t.serie
            const clicavel = !!onSelecionar && !d.ehOutros
            const apagado = !!ativo && ativo !== d.chave
            return (
              <button
                key={d.chave}
                onClick={clicavel ? () => onSelecionar!(d.chave, d.rotulo) : undefined}
                title={d.ehOutros && d.variantes.length ? d.variantes.join(' · ') : `${d.rotulo} · ${d.qtd} despesa${d.qtd === 1 ? '' : 's'}`}
                style={{
                  display: 'block', width: '100%', textAlign: 'left', font: 'inherit',
                  border: 'none', background: 'none', padding: 0,
                  cursor: clicavel ? 'pointer' : 'default',
                  opacity: apagado ? .42 : 1, transition: 'opacity .15s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 3 }}>
                  <span style={{
                    flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--portal-text)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {d.rotulo}
                    {d.variantes.length > 1 && !d.ehOutros && (
                      <span style={{ color: 'var(--portal-text-muted)', fontSize: 11 }}> ({d.variantes.length} grafias)</span>
                    )}
                  </span>
                  <span style={{
                    fontSize: 12.5, fontWeight: 700, color: 'var(--portal-text)',
                    fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
                  }}>
                    {formatarMoeda(d.total)}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--portal-text-muted)', width: 34, textAlign: 'right' }}>
                    {Math.round(d.percentual * 100)}%
                  </span>
                </div>
                <div style={{ height: 8, borderRadius: 5, background: 'var(--portal-bg-secondary)', overflow: 'hidden' }}>
                  <div style={{
                    height: '100%', borderRadius: 5, background: cor,
                    width: `${maior > 0 ? Math.max(2, (d.total / maior) * 100) : 0}%`,
                  }} />
                </div>
              </button>
            )
          })}
        </div>
      )}

      {rodape && <div style={{ marginTop: 12 }}>{rodape}</div>}
    </section>
  )
}
