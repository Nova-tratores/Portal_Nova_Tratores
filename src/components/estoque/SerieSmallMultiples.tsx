'use client';
// "Small multiples": um mini-gráfico por Tipo, em grade. Cura o gráfico-espaguete
// (20+ séries sobrepostas) — cada Tipo tem seu próprio quadro auto-escalado, então
// dá pra ler a tendência de cada um sem embolar. Valores em R$ (sem centavos).

import { LineChart, Line, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { PontoMensal, SerieDef } from './SerieMensalChart';

const fmtRS0 = (v: number) => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

export default function SerieSmallMultiples({ dados, series, onCellClick }: {
  dados: PontoMensal[];
  series: SerieDef[];
  onCellClick?: (key: string, ponto: PontoMensal) => void; // clique no quadro → composição do mês atual
}) {
  if (!dados || dados.length === 0 || series.length === 0) {
    return <div style={{ color: '#9CA3AF', fontSize: 13, padding: '20px 0' }}>Sem dados no período.</div>;
  }
  // Ordem cronológica (o gráfico e o Δ precisam do 1º→último mês real).
  const chave = (p: PontoMensal) => Number(p.ano || 0) * 100 + Number(p.mes || 0);
  const crono = [...dados].sort((a, b) => chave(a) - chave(b));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(185px, 1fr))', gap: 10 }}>
      {series.map((s) => {
        const pts = crono.map((p) => {
          const raw = p[s.key];
          const v = raw == null ? null : Number(raw);
          return { periodo: String(p.periodo), v: v != null && Number.isFinite(v) ? v : null };
        });
        const comValor = pts.filter((x) => x.v != null) as { periodo: string; v: number }[];
        const ultimo = comValor.length ? comValor[comValor.length - 1].v : null;
        const primeiro = comValor.length ? comValor[0].v : null;
        const delta = ultimo != null && primeiro != null && primeiro !== 0
          ? ((ultimo - primeiro) / Math.abs(primeiro)) * 100 : null;
        const clic = !!onCellClick && ultimo != null;
        return (
          <div
            key={s.key}
            onClick={() => clic && onCellClick!(s.key, crono[crono.length - 1])}
            title={clic ? `Ver composição de ${s.label} (mês atual)` : undefined}
            style={{ border: '1px solid #eee', borderRadius: 8, padding: '8px 10px', background: '#fff', cursor: clic ? 'pointer' : 'default' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: s.cor, flex: '0 0 auto' }} />
              <span style={{ fontSize: '.72rem', fontWeight: 700, color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.label}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 3 }}>
              <span style={{ fontSize: '.8rem', fontWeight: 700, color: (ultimo ?? 0) < 0 ? '#dc2626' : '#333' }}>{ultimo != null ? fmtRS0(ultimo) : '—'}</span>
              {delta != null && (
                <span style={{ fontSize: '.66rem', fontWeight: 700, color: delta >= 0 ? '#16a34a' : '#dc2626' }}>
                  {delta >= 0 ? '▲ +' : '▼ '}{Math.round(delta)}%
                </span>
              )}
            </div>
            <div style={{ height: 46 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={pts} margin={{ top: 4, right: 2, bottom: 0, left: 2 }}>
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip formatter={(v: number) => [fmtRS0(v), s.label]} labelFormatter={(l) => String(l)}
                    contentStyle={{ fontSize: 11, padding: '4px 8px' }} />
                  <Line type="monotone" dataKey="v" stroke={s.cor} strokeWidth={1.8} dot={false} isAnimationActive={false} connectNulls />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      })}
    </div>
  );
}
