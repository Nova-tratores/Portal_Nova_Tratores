'use client';

// Grade "ano × mês" do histórico de um card do Dashboard de Vendas: uma linha
// por ano (mais recente em cima), 12 meses com mini-barra, trimestres embaixo,
// total do ano + ticket médio, Δ vs mês anterior ou vs ano anterior, projeção
// do mês corrente por dias úteis.
// Com várias SÉRIES (Comparar: empresas, Venda×Custo×Margem, categorias) cada
// célula empilha uma linha por série, na cor dela.
// Regras (parcial, trimestre incompleto, ano corrente, projeção) em
// lib/estoque/historico-grade.ts.

import { useMemo, useState } from 'react';
import { montarGrade, PROJECAO_MIN_DIAS, type Comparacao, type Delta, type Grade, type Metrica, type PontoMes } from '@/lib/estoque/historico-grade';

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

export interface MesHistorico { mes: number; ano: number; valor: number; custo: number; qtdePedidos: number; qtdeNota?: number | null }

export interface SerieGrade {
  nome: string;
  cor: string;
  meses: MesHistorico[];
  metrica: Metrica;
  /** Card Serviços: ticket por OS com nota. */
  servico: boolean;
}

export interface HistoricoGradeProps {
  series: SerieGrade[];
  baseMin: number;
  /** Dias úteis do mês corrente (com feriados), vindos do servidor — habilita a projeção. */
  diasUteisMes?: { ano: number; mes: number; decorridos: number; total: number } | null;
  onMes?: (ano: number, mes: number) => void;
}

const ROTULO_METRICA: Record<Metrica, string> = { venda: 'Venda', custo: 'Custo (CMC)', margem: 'Margem' };

export default function HistoricoGrade({ series, baseMin, diasUteisMes, onMes }: HistoricoGradeProps) {
  // Só monta depois do fetch (nunca no SSR), então dá para ler o storage aqui.
  const [comparacao, setComparacao] = useState<Comparacao>(() => {
    try { return localStorage.getItem(CHAVE_COMP) === 'mom' ? 'mom' : 'yoy'; } catch { return 'yoy'; }
  });
  const trocar = (c: Comparacao) => {
    setComparacao(c);
    try { localStorage.setItem(CHAVE_COMP, c); } catch { /* sem storage */ }
  };

  const hoje = useMemo(() => new Date(), []);
  const du = diasUteisMes && diasUteisMes.ano === hoje.getFullYear() && diasUteisMes.mes === hoje.getMonth() + 1 ? diasUteisMes : null;
  const grades: Grade[] = useMemo(() => series.map((s) => {
    const pontos: PontoMes[] = s.meses.map((m) => ({
      ano: m.ano, mes: m.mes, valor: m.valor, custo: m.custo,
      qtde: s.servico ? (m.qtdeNota ?? null) : m.qtdePedidos,
    }));
    return montarGrade(pontos, { metrica: s.servico ? 'venda' : s.metrica, comparacao, hoje, anoInicial: ANO_INICIAL, baseMin, diasUteisMes: du });
  }), [series, comparacao, hoje, baseMin, du]);

  const multi = series.length > 1;
  const maxMes = Math.max(0, ...grades.map((g) => g.maxMes));
  // Anos presentes em qualquer série (a mais longa manda).
  const anos = [...new Set(grades.flatMap((g) => g.anos.map((a) => a.ano)))].sort((a, b) => b - a);
  const linha = (g: Grade, ano: number) => g.anos.find((a) => a.ano === ano) ?? null;

  const rotuloComp = comparacao === 'yoy' ? 'vs mesmo período do ano anterior' : 'vs período anterior';
  const unidade = series[0]?.servico ? 'OS' : 'ped.';

  const th: React.CSSProperties = { fontSize: '.78rem', color: '#6b7280', fontWeight: 600, padding: '4px 6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' };
  const tdMes: React.CSSProperties = { padding: '6px 5px 4px', verticalAlign: 'top', minWidth: 64, borderBottom: '1px dashed #f0f0f0' };
  const barra = (valor: number, cor: string, projetado?: number | null) => (
    <div style={{ height: 4, background: '#f3f4f6', borderRadius: 2, marginBottom: 3, position: 'relative', overflow: 'hidden' }}>
      {projetado != null && maxMes > 0 && (
        <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: cor, opacity: 0.25, width: `${Math.min(100, (projetado / maxMes) * 100)}%` }} />
      )}
      <div style={{ position: 'absolute', inset: 0, borderRadius: 2, background: cor, width: maxMes > 0 ? `${Math.max(0, Math.min(100, (valor / maxMes) * 100))}%` : 0 }} />
    </div>
  );

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
        {multi ? (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {series.map((s) => (
              <span key={s.nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.84rem', fontWeight: 600, color: '#374151' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: s.cor, display: 'inline-block' }} />{s.nome}
              </span>
            ))}
          </div>
        ) : null}
        <span style={{ fontSize: '.8rem', color: '#6b7280' }}>
          {!multi && (series[0]?.servico ? 'Serviços com NFS-e · ' : ROTULO_METRICA[series[0]?.metrica ?? 'venda'] + ' · ')}
          Δ {rotuloComp}{multi ? ' (no mês, ao passar o mouse)' : ''}. Mês corrente e trimestre incompleto ficam sem Δ; o ano corrente compara só os meses fechados.
          {du ? ` Projeção do mês: ritmo de ${du.decorridos} de ${du.total} dias úteis (com feriados${du.decorridos < PROJECAO_MIN_DIAS ? `; aparece a partir de ${PROJECAO_MIN_DIAS}` : ''}).` : ''}
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
            {anos.map((ano) => {
              const corAno = multi ? '#374151' : COR_ANO[ano] || '#6b7280';
              const linhas = grades.map((g) => linha(g, ano));
              const base = linhas.find((l) => l != null)!;
              const ultimoFechado = base.mesesFechados < 12 && base.mesesFechados > 0 ? MESES[base.mesesFechados - 1].toLowerCase() : null;
              const corSerie = (i: number) => (multi ? series[i].cor : corAno);
              return [
                <tr key={ano + 'm'}>
                  <td rowSpan={2} style={{ padding: '6px 8px', fontWeight: 800, color: corAno, fontSize: '1rem', borderBottom: '2px solid #e5e7eb', verticalAlign: 'middle' }}>{ano}</td>
                  {base.meses.map((c0) => {
                    const futuro = c0.futuro;
                    const clicavel = !futuro && !!onMes;
                    return (
                      <td
                        key={c0.mes}
                        onClick={clicavel ? () => onMes!(ano, c0.mes) : undefined}
                        title={clicavel ? `Abrir ${MESES[c0.mes - 1]}/${ano} no dashboard` : undefined}
                        style={{ ...tdMes, cursor: clicavel ? 'pointer' : 'default' }}
                      >
                        {linhas.map((l, i) => {
                          const c = l?.meses[c0.mes - 1];
                          if (!c || c.valor == null) return <div key={i} style={{ color: '#d1d5db', fontSize: '.8rem' }}>—</div>;
                          const tituloCel = `${multi ? series[i].nome + ' · ' : ''}${MESES[c.mes - 1]}/${ano}: ${fmtRS(c.valor)}${c.qtde != null ? ` · ${c.qtde} ${unidade}` : ''}${c.parcial ? ' (mês em andamento)' : ''}${c.projetado != null ? ` · projeção ${fmtRS(c.projetado)}` : ''}${c.delta ? ` · Δ ${(c.delta.pct >= 0 ? '+' : '') + c.delta.pct.toFixed(1).replace('.', ',')}% ${rotuloComp}` : ''}`;
                          return (
                            <div key={i} title={tituloCel} style={{ opacity: c.parcial && c.projetado == null ? 0.7 : 1, marginBottom: multi ? 4 : 0 }}>
                              {barra(c.valor, corSerie(i), c.projetado)}
                              <div style={{ fontSize: multi ? '.8rem' : '.86rem', fontWeight: 600, color: '#111827', whiteSpace: 'nowrap' }}>
                                {fmtK(c.valor)}
                              </div>
                              {c.parcial ? (
                                <div style={{ fontSize: '.72rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                  {c.projetado != null ? <span title="Projeção pelo ritmo dos dias úteis já fechados">proj. <b style={{ color: '#6b7280' }}>{fmtK(c.projetado)}</b></span> : <i>parcial</i>}
                                </div>
                              ) : !multi ? (
                                <div style={{ whiteSpace: 'nowrap', minHeight: '1.1em' }}><DeltaTxt d={c.delta} titulo={rotuloComp} /></div>
                              ) : null}
                              {!multi && c.qtde != null && <div style={{ fontSize: '.7rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{c.qtde} {unidade}</div>}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}
                  <td rowSpan={2} style={{ padding: '6px 8px', textAlign: 'right', verticalAlign: 'middle', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap' }}>
                    {linhas.map((l, i) => l && (
                      <div key={i} style={{ marginBottom: multi ? 6 : 0 }}>
                        <div style={{ fontSize: multi ? '.9rem' : '1rem', fontWeight: 800, color: multi ? series[i].cor : '#111827' }}>{fmtK(l.total)}</div>
                        <div><DeltaTxt d={l.delta} titulo={ultimoFechado ? `jan–${ultimoFechado} vs jan–${ultimoFechado} do ano anterior` : 'vs ano anterior'} /></div>
                        {!multi && l.ticket != null && <div style={{ fontSize: '.72rem', color: '#6b7280' }} title={`${l.qtde} ${unidade}`}>ticket {fmtK(l.ticket)}</div>}
                      </div>
                    ))}
                    {ultimoFechado && linhas.some((l) => l?.delta) && <div style={{ fontSize: '.7rem', color: '#9ca3af' }}>Δ jan–{ultimoFechado}</div>}
                  </td>
                </tr>,
                <tr key={ano + 't'}>
                  {[1, 2, 3, 4].map((tri) => (
                    <td key={tri} colSpan={3} style={{ padding: '3px 6px 8px', borderBottom: '2px solid #e5e7eb', background: '#fafafa', textAlign: 'center' }}>
                      {linhas.map((l, i) => {
                        const t = l?.trimestres[tri - 1];
                        if (!t || t.valor == null) return <div key={i} style={{ color: '#d1d5db', fontSize: '.78rem' }}>T{tri} —</div>;
                        return (
                          <div key={i} style={{ fontSize: '.8rem', color: '#374151', whiteSpace: 'nowrap' }}>
                            {multi && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: series[i].cor, marginRight: 4 }} />}
                            <b>T{tri}</b> {fmtK(t.valor)}{' '}
                            {t.completo ? <DeltaTxt d={t.delta} titulo={rotuloComp} /> : <span style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic' }}>em andamento</span>}
                          </div>
                        );
                      })}
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
