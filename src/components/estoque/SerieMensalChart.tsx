'use client';
// Gráfico mensal do cruzamento por família. Séries genéricas (definidas pelo
// backend) — Estoque Peça/Máquina + NF Entrada/Saída por tipo ou por categoria.
// Valores em R$ SEM centavos. Recharts.

import { ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface SerieDef { key: string; label: string; cor: string; dash?: boolean; soTabela?: boolean }
export type PontoMensal = Record<string, number | string>;

const fmtRS = (v: number) => 'R$ ' + Math.round(Number(v)).toLocaleString('pt-BR');

export interface BarraDef { key: string; label: string; cor: string }

export default function SerieMensalChart({ dados, series, altura = 360, hideKeys, bars, onPointClick }: {
  dados: PontoMensal[]; series: SerieDef[]; altura?: number;
  hideKeys?: string[];          // chaves de linha a esconder (ex.: filtro de grupo)
  bars?: BarraDef[];            // barras no eixo Y direito (ex.: faturamento)
  onPointClick?: (key: string, ponto: PontoMensal) => void; // clique num ponto/barra
}) {
  if (!dados || dados.length === 0) {
    return (
      <div style={{ height: altura, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9CA3AF', fontSize: 13 }}>
        Sem dados no período.
      </div>
    );
  }
  const oculto = new Set(hideKeys ?? []);
  const linhas = series.filter((s) => !s.soTabela && !oculto.has(s.key));
  const temBarras = !!bars && bars.length > 0;
  const cursor = onPointClick ? 'pointer' : undefined;
  const paraPonto = (d: unknown): PontoMensal | undefined => (d as { payload?: PontoMensal })?.payload;
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 11 }} tickFormatter={(v: number) => 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + 'k'} width={70} />
          {temBarras && (
            <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} tickFormatter={(v: number) => 'R$ ' + Math.round(v / 1000).toLocaleString('pt-BR') + 'k'} width={70} />
          )}
          <Tooltip formatter={(v: number, name: string) => [fmtRS(v), name]} />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          {temBarras && bars!.map((b) => (
            <Bar key={b.key} yAxisId="right" dataKey={b.key} name={b.label} fill={b.cor} fillOpacity={0.28}
              cursor={cursor} onClick={(d: unknown) => { const p = paraPonto(d); if (p) onPointClick?.(b.key, p); }} />
          ))}
          {linhas.map((s) => (
            <Line yAxisId="left" key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.cor}
              strokeWidth={2} strokeDasharray={s.dash ? '5 4' : undefined} dot={{ r: 2 }}
              activeDot={{ r: 4, cursor, onClick: (a: unknown, b: unknown) => { const p = paraPonto(b) ?? paraPonto(a); if (p) onPointClick?.(s.key, p); } }} />
          ))}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
