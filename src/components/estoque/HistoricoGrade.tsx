'use client';

// Grade "ano × mês" do histórico de um card do Dashboard de Vendas: uma linha
// por ano (mais recente em cima), 12 meses com mini-barra, trimestres embaixo,
// total do ano + ticket médio, Δ vs mês anterior ou vs ano anterior.
// Regras (parcial, trimestre incompleto, ano corrente) em lib/estoque/historico-grade.ts.

import { useMemo, useState } from 'react';
import { montarGrade, type Comparacao, type Delta, type Metrica, type PontoMes } from '@/lib/estoque/historico-grade';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// Cores fixas por ano (as do painel antigo); anos fora da lista caem no cinza.
const COR_ANO: Record<number, string> = { 2023: '#1976d2', 2024: '#00897b', 2025: '#f57c00', 2026: '#c62828', 2027: '#6a1b9a' };
const ANO_INICIAL = 2023;
const CHAVE_COMP = 'estoque-hist-comparacao';

function fmtK(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (abs >= 1000) return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: abs >= 1e5 ? 0 : 1 }) + ' mil';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
const fmtRS = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function DeltaTxt({ d, titulo }: { d: Delta | null; titulo: string }) {
  if (!d) return null;
  const cor = d.basePequena ? '#9ca3af' : d.pct >= 0 ? '#15803d' : '#dc2626';
  const s = (d.pct >= 0 ? '+' : '') + d.pct.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(d.pct) >= 100 ? 0 : 1 }) + '%';
  return (
    <span title={titulo + (d.basePequena ? ' — base pequena, pouco significativo' : '')} style={{ color: cor, fontWeight: 600, fontSize: '.78rem' }}>
      {s}
    </span>
  );
}

export interface HistoricoGradeProps {
  meses: Array<{ mes: number; ano: number; valor: number; custo: number; qtdePedidos: number; qtdeNota?: number | null }>;
  /** Card Serviços: ticket por OS com nota, métrica sempre "venda". */
  servico: boolean;
  metrica: Metrica;
  baseMin: number;
  onMes?: (ano: number, mes: number) => void;
}

export default function HistoricoGrade({ meses, servico, metrica, baseMin, onMes }: HistoricoGradeProps) {
  // Só monta depois do fetch (nunca no SSR), então dá para ler o storage aqui.
  const [comparacao, setComparacao] = useState<Comparacao>(() => {
    try { return localStorage.getItem(CHAVE_COMP) === 'mom' ? 'mom' : 'yoy'; } catch { return 'yoy'; }
  });
  const trocar = (c: Comparacao) => {
    setComparacao(c);
    try { localStorage.setItem(CHAVE_COMP, c); } catch { /* sem storage */ }
  };

  const metricaEf: Metrica = servico ? 'venda' : metrica;
  const grade = useMemo(() => {
    const pontos: PontoMes[] = meses.map((m) => ({
      ano: m.ano, mes: m.mes, valor: m.valor, custo: m.custo,
      qtde: servico ? (m.qtdeNota ?? null) : m.qtdePedidos,
    }));
    return montarGrade(pontos, { metrica: metricaEf, comparacao, hoje: new Date(), anoInicial: ANO_INICIAL, baseMin });
  }, [meses, servico, metricaEf, comparacao, baseMin]);

  const rotuloComp = comparacao === 'yoy' ? 'vs mesmo período do ano anterior' : 'vs período anterior';
  const unidade = servico ? 'OS' : 'ped.';

  const th: React.CSSProperties = { fontSize: '.78rem', color: '#6b7280', fontWeight: 600, padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' };
  const tdMes: React.CSSProperties = { padding: '6px 5px 4px', verticalAlign: 'top', minWidth: 64, borderBottom: '1px dashed #f0f0f0' };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ display: 'inline-flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' }}>
          {([['yoy', 'vs ano anterior'], ['mom', 'vs mês anterior']] as const).map(([k, rot]) => (
            <button
              key={k}
              onClick={() => trocar(k)}
              style={{ border: 'none', cursor: 'pointer', padding: '5px 12px', fontSize: '.85rem', fontWeight: 600, background: comparacao === k ? '#2563eb' : '#fff', color: comparacao === k ? '#fff' : '#374151' }}
            >{rot}</button>
          ))}
        </div>
        <span style={{ fontSize: '.8rem', color: '#6b7280' }}>
          {servico ? 'Serviços com NFS-e' : metricaEf === 'venda' ? 'Venda' : metricaEf === 'custo' ? 'Custo (CMC)' : 'Margem'} ·
          Δ {rotuloComp}. Mês corrente e trimestre incompleto ficam sem Δ; o ano corrente compara só os meses fechados.
          {onMes ? ' Clique num mês para abrir o dashboard dele.' : ''}
        </span>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: 960 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Ano</th>
              {MESES.map((m) => <th key={m} style={th}>{m}</th>)}
              <th style={{ ...th, textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {grade.anos.map((a) => {
              const cor = COR_ANO[a.ano] || '#6b7280';
              const ultimoFechado = a.mesesFechados < 12 && a.mesesFechados > 0 ? MESES[a.mesesFechados - 1].toLowerCase() : null;
              return [
                <tr key={a.ano + 'm'}>
                  <td rowSpan={2} style={{ padding: '6px 8px', fontWeight: 800, color: cor, fontSize: '1rem', borderBottom: '2px solid #e5e7eb', verticalAlign: 'middle' }}>{a.ano}</td>
                  {a.meses.map((c) => (
                    <td
                      key={c.mes}
                      onClick={!c.futuro && onMes ? () => onMes(a.ano, c.mes) : undefined}
                      title={c.valor != null ? `${MESES[c.mes - 1]}/${a.ano}: ${fmtRS(c.valor)}${c.qtde != null ? ` · ${c.qtde} ${unidade}` : ''}${c.parcial ? ' (mês em andamento)' : ''}` : undefined}
                      style={{ ...tdMes, cursor: !c.futuro && onMes ? 'pointer' : 'default', opacity: c.parcial ? 0.7 : 1 }}
                    >
                      {c.valor == null ? <span style={{ color: '#d1d5db' }}>—</span> : (
                        <>
                          <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginBottom: 3 }}>
                            <div style={{ height: 4, borderRadius: 2, background: cor, width: grade.maxMes > 0 ? `${Math.max(0, (c.valor / grade.maxMes) * 100)}%` : 0 }} />
                          </div>
                          <div style={{ fontSize: '.86rem', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>{fmtK(c.valor)}</div>
                          <div style={{ whiteSpace: 'nowrap', minHeight: '1.1em' }}>
                            {c.parcial ? <span style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic' }}>parcial</span> : <DeltaTxt d={c.delta} titulo={rotuloComp} />}
                          </div>
                          {c.qtde != null && <div style={{ fontSize: '.7rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{c.qtde} {unidade}</div>}
                        </>
                      )}
                    </td>
                  ))}
                  <td rowSpan={2} style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'middle', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '1rem', fontWeight: 800, color: '#111827' }}>{fmtK(a.total)}</div>
                    <div><DeltaTxt d={a.delta} titulo={ultimoFechado ? `jan–${ultimoFechado} vs jan–${ultimoFechado} do ano anterior` : 'vs ano anterior'} /></div>
                    {ultimoFechado && a.delta && <div style={{ fontSize: '.7rem', color: '#9ca3af' }}>Δ jan–{ultimoFechado}</div>}
                    {a.ticket != null && <div style={{ fontSize: '.72rem', color: '#6b7280' }} title={`${a.qtde} ${unidade}`}>ticket {fmtK(a.ticket)}</div>}
                  </td>
                </tr>,
                <tr key={a.ano + 't'}>
                  {a.trimestres.map((t) => (
                    <td key={t.tri} colSpan={3} style={{ padding: '3px 6px 8px', borderBottom: '2px solid #e5e7eb', background: '#fafafa', textAlign: 'center' }}>
                      {t.valor == null ? <span style={{ color: '#d1d5db', fontSize: '.78rem' }}>T{t.tri} —</span> : (
                        <span style={{ fontSize: '.8rem', color: '#374151', whiteSpace: 'nowrap' }}>
                          <b>T{t.tri}</b> {fmtK(t.valor)}{' '}
                          {t.completo ? <DeltaTxt d={t.delta} titulo={rotuloComp} /> : <span style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic' }}>em andamento</span>}
                        </span>
                      )}
                    </td>
                  ))}
                </tr>,
              ];
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
