'use client'
// Gasto por mês — COLUNAS, não linha.
//
// Cada mês é um balde somado, não uma medição contínua: uma linha desenharia
// interpolação entre os pontos e sugeriria que existiu um valor no dia 15 de
// março. Coluna diz "o total deste balde", que é a verdade do dado.
//
// A linha da média é o acréscimo com melhor relação sinal/tinta da tela: sem
// ela, "R$ 28 mil em junho" não é alto nem baixo.

import {
  Bar, BarChart, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { useChartTheme } from '@/lib/charts/useChartTheme'
import { formatarMoeda } from '@/lib/financeiro/utils'
import type { PontoMes } from '@/lib/financeiro/despesas/tipos'

/** 'R$ 28,4 mil' — eixo com valor cheio viraria parede de dígitos */
function compacto(v: number): string {
  if (v === 0) return '0'
  if (Math.abs(v) >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`
  if (Math.abs(v) >= 1000) return `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

export default function EvolucaoMensalChart({ dados, media, mesAtivo, onSelecionarMes }: {
  dados: PontoMes[]
  media: number
  mesAtivo?: string | null
  onSelecionarMes?: (mes: string) => void
}) {
  const t = useChartTheme()
  const temDado = dados.some((d) => d.total > 0)

  return (
    <section style={{
      background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
      borderRadius: 16, padding: 16, marginBottom: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--portal-text)', margin: 0 }}>Gasto por mês</h2>
        <span style={{ fontSize: 11.5, color: 'var(--portal-text-muted)' }}>
          {onSelecionarMes ? 'clique num mês para filtrar a tela' : ''}
        </span>
      </div>

      <div style={{ width: '100%', height: 260, marginTop: 12 }}>
        {!temDado ? (
          <div style={{ height: '100%', display: 'grid', placeItems: 'center', fontSize: 13, color: 'var(--portal-text-muted)' }}>
            Nenhuma despesa neste período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados} margin={{ top: 16, right: 8, left: 4, bottom: 0 }}>
              <CartesianGrid stroke={t.grade} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: t.eixo, fontSize: 11 }} tickLine={false} axisLine={{ stroke: t.grade }} />
              <YAxis tick={{ fill: t.eixo, fontSize: 11 }} tickLine={false} axisLine={false} width={54} tickFormatter={compacto} />
              <Tooltip
                cursor={{ fill: t.grade, opacity: .5 }}
                // sem estas 3 props o tooltip do Recharts sai branco sobre
                // branco no escuro — é o bug que existe em todos os gráficos
                // do projeto hoje
                contentStyle={{ background: t.tooltipBg, border: `1px solid ${t.tooltipBorda}`, borderRadius: 12, fontSize: 12 }}
                labelStyle={{ color: t.tintaMuted, fontWeight: 700 }}
                itemStyle={{ color: t.tinta }}
                formatter={(v: number, _n, p) => [
                  `${formatarMoeda(v)}${(p?.payload?.qtd ?? 0) > 0 ? ` · ${p.payload.qtd} despesa${p.payload.qtd === 1 ? '' : 's'}` : ''}`,
                  'Total',
                ]}
              />
              {media > 0 && (
                <ReferenceLine
                  y={media}
                  stroke={t.tintaMuted}
                  strokeWidth={1}
                  label={{ value: `média ${compacto(media)}`, position: 'insideTopRight', fill: t.tintaMuted, fontSize: 10.5 }}
                />
              )}
              <Bar
                dataKey="total"
                radius={[4, 4, 0, 0]}
                maxBarSize={46}
                onClick={onSelecionarMes ? (d: { mes?: string }) => d?.mes && onSelecionarMes(d.mes) : undefined}
                cursor={onSelecionarMes ? 'pointer' : 'default'}
                isAnimationActive={false}
              >
                {dados.map((d) => (
                  <Cell
                    key={d.mes}
                    fill={t.serie}
                    // mês em curso esmaecido: cheio, ele se leria como queda real
                    fillOpacity={d.parcial ? .45 : mesAtivo && mesAtivo !== d.mes ? .3 : 1}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {dados.some((d) => d.parcial) && (
        <div style={{ fontSize: 11, color: 'var(--portal-text-muted)', marginTop: 6 }}>
          A última coluna é o mês em curso, ainda incompleto.
        </div>
      )}
    </section>
  )
}
