'use client';
// Gráfico de linha CMC / Venda média / Margem (substitui o SVG desenharGrafico
// do monolito). Recharts: declarativo, sem ciclo imperativo new Chart().

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import type { HistoricoPonto } from '@/lib/estoque/types';

const fmtRS = (v: number) =>
  'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Serie = 'cmc' | 'venda' | 'margem';

const CONFIG: Record<Serie, { label: string; cor: string }> = {
  cmc: { label: 'CMC', cor: '#dc2626' },
  venda: { label: 'Venda média', cor: '#2563eb' },
  margem: { label: 'Margem (R$)', cor: '#16a34a' },
};

export default function CmcChart({
  dados,
  series = ['cmc', 'venda', 'margem'],
  altura = 260,
}: {
  dados: HistoricoPonto[];
  series?: Serie[];
  altura?: number;
}) {
  if (!dados || dados.length === 0) {
    return (
      <div style={{ height: altura, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>
        Sem dados de histórico.
      </div>
    );
  }
  return (
    // ResponsiveContainer exige altura explícita no pai.
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => fmtRS(v)} width={80} />
          <Tooltip formatter={(v: number, name: string) => [fmtRS(v), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {series.map((s) => (
            <Line key={s} type="monotone" dataKey={s} name={CONFIG[s].label} stroke={CONFIG[s].cor} strokeWidth={2} dot={{ r: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
