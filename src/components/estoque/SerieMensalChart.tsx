'use client';
// Gráfico mensal do cruzamento por família. Séries genéricas (definidas pelo
// backend) — Estoque Peça/Máquina + NF Entrada/Saída por tipo ou por categoria.
// Valores em R$ SEM centavos. Recharts.

import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface SerieDef { key: string; label: string; cor: string; dash?: boolean; soTabela?: boolean }
export type PontoMensal = Record<string, number | string>;

const fmtRS = (v: number) => 'R$ ' + Math.round(Number(v)).toLocaleString('pt-BR');

export default function SerieMensalChart({ dados, series, altura = 360, barKey, barLabel, barCor }: {
  dados: PontoMensal[]; series: SerieDef[]; altura?: number;
  barKey?: string; barLabel?: string; barCor?: string;
}) {
  if (!dados || dados.length === 0) {
    return (
      <div style={{ height: altura, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>
        Sem dados no período.
      </div>
    );
  }
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v: number) => 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + 'k'} width={70} />
          {barKey && (
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + 'k'} width={70} />
          )}
          <Tooltip formatter={(v: number, name: string) => [fmtRS(v), name]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {barKey && (
            <Bar yAxisId="right" dataKey={barKey} name={barLabel ?? 'Faturamento'} fill={barCor ?? '#dc2626'} fillOpacity={0.28} />
          )}
          {series.filter((s) => !s.soTabela).map((s) => (
            <Line yAxisId="left" key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.cor}
              strokeWidth={2} strokeDasharray={s.dash ? '5 4' : undefined} dot={{ r: 2 }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
