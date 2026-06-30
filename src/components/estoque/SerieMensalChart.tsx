'use client';
// Gráfico mensal do cruzamento por família: Estoque Peça, Estoque Máquina,
// NF Entrada e NF Saída (valores em R$). Recharts.

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export interface PontoMensal {
  periodo: string;
  estoque_peca: number;
  estoque_maquina: number;
  nf_entrada: number;
  nf_saida: number;
}

const fmtRS = (v: number) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 });

type Serie = 'estoque_peca' | 'estoque_maquina' | 'nf_entrada' | 'nf_saida';
const CONFIG: Record<Serie, { label: string; cor: string }> = {
  estoque_peca: { label: 'Estoque Peça', cor: '#2563eb' },
  estoque_maquina: { label: 'Estoque Máquina', cor: '#d97706' },
  nf_entrada: { label: 'NF Entrada', cor: '#16a34a' },
  nf_saida: { label: 'NF Saída', cor: '#dc2626' },
};

export default function SerieMensalChart({ dados, altura = 340 }: { dados: PontoMensal[]; altura?: number }) {
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
        <LineChart data={dados} margin={{ top: 8, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
          <XAxis dataKey="periodo" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + 'k'} width={70} />
          <Tooltip formatter={(v: number, name: string) => [fmtRS(v), name]} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {(Object.keys(CONFIG) as Serie[]).map((s) => (
            <Line key={s} type="monotone" dataKey={s} name={CONFIG[s].label} stroke={CONFIG[s].cor} strokeWidth={2} dot={{ r: 2 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
