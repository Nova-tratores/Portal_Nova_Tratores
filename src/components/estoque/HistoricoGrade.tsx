'use client';

// Grade do histórico de um card do Dashboard de Vendas: uma linha por ano
// (mais recente em cima), total do ano + Δ.
//   Vista MESES: 12 colunas, cada célula = valor + Δ (vs mês anterior ou vs
//     mesmo mês do ano anterior). Mês corrente mostra a projeção.
//   Vista TRIMESTRES: 4 colunas, cada célula = valor + Δ vs trimestre anterior
//     + Δ vs mesmo trimestre do ano anterior (os dois, sempre).
// Quantidades (pedidos/OS) e ticket só com "Mostrar quantidades" ou no hover.
// MEDIDA: Valor (R$) ou contagens — Pedidos de venda / Itens (linhas) nos cards
// de peças, OS / Itens em Serviços. Em contagem a grade soma números, sem R$.
// Com várias SÉRIES (Comparar: empresas, Venda×Custo×Margem, categorias) cada
// célula empilha uma linha por série, na cor dela.
// Regras (parcial, trimestre incompleto, ano corrente, projeção) em
// lib/estoque/historico-grade.ts.

import { useMemo, useState } from 'react';
import { montarGrade, delta as calcDelta, PROJECAO_MIN_DIAS, type Comparacao, type Delta, type Grade, type Metrica, type PontoMes } from '@/lib/estoque/historico-grade';
import {
  montarSemanas, inicioSemana, periodosDaComparacao, somarSemanas, rotuloPeriodo, PRESETS_SEMANAS,
  type LinhaSemana, type PontoSemana, type PresetSemanas,
} from '@/lib/estoque/historico-semanas';
import { feriadosNacionais } from '@/lib/assistente/horario';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
// Cores fixas por ano (as do painel antigo); anos fora da lista caem no cinza.
const COR_ANO: Record<number, string> = { 2023: '#1976d2', 2024: '#00897b', 2025: '#f57c00', 2026: '#c62828', 2027: '#6a1b9a' };
const ANO_INICIAL = 2023;
const CHAVE_COMP = 'estoque-hist-comparacao';
const CHAVE_VISTA = 'estoque-hist-vista';
const CHAVE_QTD = 'estoque-hist-qtd';

type Vista = 'meses' | 'trimestres' | 'semanas';
const SEMANAS_POR_PAGINA = 26;
const CHAVE_PRESET_SEM = 'estoque-hist-semanas-comp';

function fmtK(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + ' mi';
  if (abs >= 1000) return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: abs >= 1e5 ? 0 : 1 }) + ' mil';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
const fmtRS = (v: number) => 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtInt = (v: number) => Math.round(v).toLocaleString('pt-BR');

/** O que a grade soma: dinheiro ou contagens. */
export type Medida = 'valor' | 'pedidos' | 'itens' | 'os' | 'horas';
const ROTULO_MEDIDA: Record<Medida, string> = { valor: 'Valor (R$)', pedidos: 'Pedidos de venda', itens: 'Itens', os: 'OS', horas: 'Horas' };
const UNID_MEDIDA: Record<Medida, string> = { valor: '', pedidos: 'pedidos', itens: 'itens', os: 'OS', horas: 'h' };
const fmtHoras = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: v >= 100 ? 0 : 1 }) + ' h';
// Base mínima de um Δ "significativo" nas contagens (no valor vem da página).
const BASE_MIN_QTD = 5;
const fmtPct = (d: Delta) => (d.pct >= 0 ? '+' : '') + d.pct.toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(d.pct) >= 100 ? 0 : 1 }) + '%';

function DeltaTxt({ d, titulo, rotulo, tamanho = '.78rem' }: { d: Delta | null; titulo: string; rotulo?: string; tamanho?: string }) {
  if (!d) return rotulo ? <span style={{ color: '#d1d5db', fontSize: tamanho }}>{rotulo} —</span> : null;
  const cor = d.basePequena ? '#9ca3af' : d.pct >= 0 ? '#15803d' : '#dc2626';
  return (
    <span title={titulo + (d.basePequena ? ' — base pequena, pouco significativo' : '')} style={{ color: cor, fontWeight: 600, fontSize: tamanho, whiteSpace: 'nowrap' }}>
      {rotulo && <span style={{ color: '#9ca3af', fontWeight: 500 }}>{rotulo} </span>}{fmtPct(d)}
    </span>
  );
}

/** Um mês já normalizado pela página. Contagem null = não se sabe (o mês fica sem dado nessa medida). */
export interface MesHistorico { mes: number; ano: number; valor: number; custo: number; pedidos: number | null; itens: number | null; os: number | null; horas?: number | null }
/** Uma semana (segunda-feira em `inicio`, 'YYYY-MM-DD'), com as mesmas medidas do mês. */
export interface SemanaHistorico { inicio: string; valor: number; custo: number; pedidos: number | null; itens: number | null; os: number | null; horas?: number | null }

export interface SerieGrade {
  nome: string;
  cor: string;
  meses: MesHistorico[];
  /** Vista Semanas — sem ela (RPC semanal ausente) a vista não aparece. */
  semanas?: SemanaHistorico[] | null;
  metrica: Metrica;
  /** Card Serviços: ticket por OS com nota. */
  servico: boolean;
}

export interface HistoricoGradeProps {
  series: SerieGrade[];
  /** Medidas oferecidas (a 1ª é o padrão). Só "valor" → o seletor some. */
  medidas?: Medida[];
  baseMin: number;
  /** Dias úteis do mês corrente (com feriados), vindos do servidor — habilita a projeção. */
  diasUteisMes?: { ano: number; mes: number; decorridos: number; total: number } | null;
  /** Feriados extras (municipais) vindos do servidor; os nacionais são calculados aqui. */
  feriadosExtras?: string[];
  onMes?: (ano: number, mes: number) => void;
}

const ROTULO_METRICA: Record<Metrica, string> = { venda: 'Venda', custo: 'Custo (CMC)', margem: 'Margem' };

function lerStorage(chave: string): string | null {
  try { return localStorage.getItem(chave); } catch { return null; }
}
function gravarStorage(chave: string, valor: string) {
  try { localStorage.setItem(chave, valor); } catch { /* sem storage */ }
}

export default function HistoricoGrade({ series, medidas = ['valor'], baseMin, diasUteisMes, feriadosExtras, onMes }: HistoricoGradeProps) {
  const [medidaSel, setMedida] = useState<Medida>(medidas[0]);
  const medida: Medida = medidas.includes(medidaSel) ? medidaSel : medidas[0];
  const ehValor = medida === 'valor';
  const fmtV = (v: number) => (ehValor ? 'R$ ' + fmtK(v) : medida === 'horas' ? fmtHoras(v) : fmtInt(v));
  const fmtVLongo = (v: number) => (ehValor ? fmtRS(v) : medida === 'horas' ? fmtHoras(v) : fmtInt(v) + ' ' + UNID_MEDIDA[medida]);
  // Só monta depois do fetch (nunca no SSR), então dá para ler o storage aqui.
  const [comparacao, setComparacao] = useState<Comparacao>(() => (lerStorage(CHAVE_COMP) === 'mom' ? 'mom' : 'yoy'));
  const [vistaSel, setVista] = useState<Vista>(() => {
    const v = lerStorage(CHAVE_VISTA);
    return v === 'trimestres' || v === 'semanas' ? v : 'meses';
  });
  const [qtdSemanas, setQtdSemanas] = useState(SEMANAS_POR_PAGINA);
  const [presetSem, setPresetSem] = useState<PresetSemanas>(() => {
    const v = lerStorage(CHAVE_PRESET_SEM);
    return PRESETS_SEMANAS.some((p) => p.id === v) ? (v as PresetSemanas) : 'ultima_anterior';
  });
  const trocarPresetSem = (p: PresetSemanas) => { setPresetSem(p); gravarStorage(CHAVE_PRESET_SEM, p); };
  const [semEscolhidas, setSemEscolhidas] = useState<{ a: string; b: string }>({ a: '', b: '' });
  const temSemanas = series.length > 0 && series.every((s) => s.semanas);
  const vista: Vista = vistaSel === 'semanas' && !temSemanas ? 'meses' : vistaSel;
  const [mostrarQtd, setMostrarQtd] = useState<boolean>(() => lerStorage(CHAVE_QTD) === '1');
  const trocarComp = (c: Comparacao) => { setComparacao(c); gravarStorage(CHAVE_COMP, c); };
  const trocarVista = (v: Vista) => { setVista(v); gravarStorage(CHAVE_VISTA, v); };
  const trocarQtd = (v: boolean) => { setMostrarQtd(v); gravarStorage(CHAVE_QTD, v ? '1' : '0'); };

  const hoje = useMemo(() => new Date(), []);
  const du = diasUteisMes && diasUteisMes.ano === hoje.getFullYear() && diasUteisMes.mes === hoje.getMonth() + 1 ? diasUteisMes : null;
  const grades: Grade[] = useMemo(() => series.map((s) => {
    const pontos: PontoMes[] = [];
    for (const m of s.meses) {
      // Ticket médio: por OS (serviços) ou por pedido (peças).
      const qtde = s.servico ? m.os : m.pedidos;
      if (medida === 'valor') { pontos.push({ ano: m.ano, mes: m.mes, valor: m.valor, custo: m.custo, qtde }); continue; }
      const n = m[medida] ?? null;
      if (n != null) pontos.push({ ano: m.ano, mes: m.mes, valor: n, custo: 0, qtde: null });
    }
    const metrica: Metrica = medida !== 'valor' || s.servico ? 'venda' : s.metrica;
    return montarGrade(pontos, { metrica, comparacao, hoje, anoInicial: ANO_INICIAL, baseMin: medida === 'valor' ? baseMin : BASE_MIN_QTD, diasUteisMes: du });
  }), [series, comparacao, hoje, baseMin, du, medida]);

  // Feriados (nacionais de todos os anos com semanas + extras) para os dias úteis.
  const feriados = useMemo(() => {
    const anosSem = new Set(series.flatMap((s) => (s.semanas || []).map((w) => Number(w.inicio.slice(0, 4)))));
    anosSem.add(hoje.getFullYear());
    const set = new Set<string>(feriadosExtras || []);
    for (const a of anosSem) for (const f of feriadosNacionais(a)) set.add(f);
    return set;
  }, [series, feriadosExtras, hoje]);
  // Semanas de cada série (mais recente primeiro), na medida escolhida.
  const semanasSerie: LinhaSemana[][] = useMemo(() => series.map((s) => {
    const pontos: PontoSemana[] = [];
    for (const w of s.semanas || []) {
      if (medida === 'valor') { pontos.push({ inicio: w.inicio, valor: w.valor, custo: w.custo }); continue; }
      const n = w[medida] ?? null;
      if (n != null) pontos.push({ inicio: w.inicio, valor: n, custo: 0 });
    }
    const metrica: Metrica = medida !== 'valor' || s.servico ? 'venda' : s.metrica;
    return montarSemanas(pontos, { metrica, hoje, baseMin: medida === 'valor' ? baseMin / 4 : BASE_MIN_QTD, feriados });
  }), [series, medida, hoje, baseMin, feriados]);
  const inicioSemanas = [...new Set(semanasSerie.flatMap((ls) => ls.map((l) => l.inicio)))].sort().reverse();
  // Comparação pronta: só semanas fechadas (a corrente é parcial).
  const semanaAtual = inicioSemana(hoje);
  const fechadas = inicioSemanas.filter((i) => i < semanaAtual);
  const escolhidasEf = {
    a: semEscolhidas.a || fechadas[0] || '',
    b: semEscolhidas.b || fechadas[1] || '',
  };
  const periodos = periodosDaComparacao(presetSem, fechadas, escolhidasEf);
  const resultadoComp = periodos ? semanasSerie.map((ls) => {
    const a = somarSemanas(ls, periodos.a.inicios);
    const b = somarSemanas(ls, periodos.b.inicios);
    const n = periodos.a.inicios.length;
    const completo = a.faltando === 0 && b.faltando === 0;
    return { a: a.valor, b: b.valor, completo, d: completo ? calcDelta(a.valor, b.valor, (medida === 'valor' ? baseMin / 4 : BASE_MIN_QTD) * n) : null };
  }) : null;

  const multi = series.length > 1;
  // Anos presentes em qualquer série (a mais longa manda).
  const anos = [...new Set(grades.flatMap((g) => g.anos.map((a) => a.ano)))].sort((a, b) => b - a);
  const linha = (g: Grade, ano: number) => g.anos.find((a) => a.ano === ano) ?? null;

  const rotuloComp = comparacao === 'yoy' ? 'vs mesmo mês do ano anterior' : 'vs mês anterior';
  const unidade = series[0]?.servico ? 'OS' : 'ped.';
  const oQue = !ehValor
    ? ROTULO_MEDIDA[medida] + (medida === 'itens' ? ' (linhas de item)' : '')
    : multi ? '' : series[0]?.servico ? 'Serviços com NFS-e' : ROTULO_METRICA[series[0]?.metrica ?? 'venda'];
  const qtdTxt = (q: number | null) => (ehValor && q != null ? ` · ${q} ${unidade}` : '');

  const th: React.CSSProperties = { fontSize: '.78rem', color: '#6b7280', fontWeight: 600, padding: '6px 6px', textAlign: 'center', borderBottom: '1px solid #e5e7eb' };
  const td: React.CSSProperties = { padding: '8px 6px', verticalAlign: 'top', borderBottom: '1px solid #f0f0f0' };
  const valorStyle = (destaque: boolean): React.CSSProperties => ({ fontSize: destaque ? '.9rem' : '.82rem', fontWeight: 700, color: '#111827', whiteSpace: 'nowrap' });
  const seg = (ativo: boolean): React.CSSProperties => ({ border: 'none', cursor: 'pointer', padding: '5px 12px', fontSize: '.85rem', fontWeight: 600, background: ativo ? '#2563eb' : '#fff', color: ativo ? '#fff' : '#374151' });
  const caixa: React.CSSProperties = { display: 'inline-flex', border: '1px solid #d1d5db', borderRadius: 8, overflow: 'hidden' };

  const explicacao = [
    oQue ? `${oQue}.` : '',
    vista === 'meses'
      ? `Δ ${rotuloComp}. O mês corrente é parcial: mostra o valor e a projeção, sem Δ.`
      : vista === 'trimestres'
        ? 'Cada trimestre traz dois Δ: vs trimestre anterior e vs mesmo trimestre do ano anterior. Trimestre incompleto fica sem Δ.'
        : 'Semana de segunda a domingo, pela data do faturamento; (4d) = dias úteis da semana (seg–sex fora dos feriados). Δ vs semana anterior, vs a semana equivalente do mês anterior (a semana é do mês da sua quinta-feira: 2ª de outubro × 2ª de setembro) e vs a mesma semana (nº) do ano anterior. A semana corrente é parcial, sem Δ.',
    vista === 'semanas' ? '' : 'O total do ano corrente compara só os meses fechados com os mesmos meses do ano anterior.',
    du ? `Projeção do mês: ritmo de ${du.decorridos} de ${du.total} dias úteis (com feriados)${du.decorridos < PROJECAO_MIN_DIAS ? `; aparece a partir de ${PROJECAO_MIN_DIAS}` : ''}.` : '',
    onMes && vista === 'meses' ? 'Clique num mês para abrir o dashboard dele.' : '',
    multi ? 'Com várias séries, o Δ de cada uma aparece ao passar o mouse.' : '',
  ].filter(Boolean).join(' ');

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={caixa}>
          {([['meses', 'Meses'], ['trimestres', 'Trimestres'], ...(temSemanas ? [['semanas', 'Semanas']] : [])] as Array<[Vista, string]>).map(([k, rot]) => (
            <button key={k} onClick={() => trocarVista(k)} style={{ ...seg(vista === k), background: vista === k ? '#111827' : '#fff' }}>{rot}</button>
          ))}
        </div>
        {vista === 'meses' && (
          <div style={caixa}>
            {([['yoy', 'vs ano anterior'], ['mom', 'vs mês anterior']] as const).map(([k, rot]) => (
              <button key={k} onClick={() => trocarComp(k)} style={seg(comparacao === k)}>{rot}</button>
            ))}
          </div>
        )}
        {medidas.length > 1 && (
          <div style={caixa}>
            {medidas.map((m) => (
              <button key={m} onClick={() => setMedida(m)} style={{ ...seg(medida === m), background: medida === m ? '#111827' : '#fff' }}>{ROTULO_MEDIDA[m]}</button>
            ))}
          </div>
        )}
        {!multi && ehValor && (
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.84rem', color: '#374151', cursor: 'pointer' }}>
            <input type="checkbox" checked={mostrarQtd} onChange={(e) => trocarQtd(e.target.checked)} /> Mostrar quantidades
          </label>
        )}
        {multi && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {series.map((s) => (
              <span key={s.nome} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.84rem', fontWeight: 600, color: '#374151' }}>
                <span style={{ width: 12, height: 12, borderRadius: 3, background: s.cor, display: 'inline-block' }} />{s.nome}
              </span>
            ))}
          </div>
        )}
        <span title={explicacao} style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#6b7280', cursor: 'help' }}>
          {vista === 'meses' ? `Δ ${rotuloComp}` : vista === 'trimestres' ? 'Δ vs trimestre anterior · vs ano anterior' : 'Δ vs semana anterior · mês anterior · ano anterior'}
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1px solid #d1d5db', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: '.72rem', fontWeight: 700 }}>?</span>
        </span>
      </div>

      {vista === 'semanas' && (
        <div style={{ border: '1px solid #e5e7eb', borderRadius: 10, padding: '10px 12px', marginBottom: 12, background: '#fafafa' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#374151', marginRight: 4 }}>Comparar semanas:</span>
            {PRESETS_SEMANAS.map((p) => (
              <button key={p.id} onClick={() => trocarPresetSem(p.id)}
                style={{ border: '1px solid ' + (presetSem === p.id ? '#2563eb' : '#d1d5db'), background: presetSem === p.id ? '#2563eb' : '#fff', color: presetSem === p.id ? '#fff' : '#374151', borderRadius: 999, padding: '4px 11px', fontSize: '.8rem', fontWeight: 600, cursor: 'pointer' }}>
                {p.rotulo}
              </button>
            ))}
          </div>
          {presetSem === 'escolher' && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 8, fontSize: '.84rem', color: '#374151' }}>
              {(['a', 'b'] as const).map((k) => (
                <label key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  {k === 'a' ? 'Semana A' : 'comparada com B'}
                  <select value={escolhidasEf[k]} onChange={(e) => setSemEscolhidas({ ...escolhidasEf, [k]: e.target.value })}
                    style={{ border: '1px solid #d1d5db', borderRadius: 8, padding: '4px 8px', fontSize: '.84rem', background: '#fff', color: '#374151' }}>
                    {fechadas.map((i) => <option key={i} value={i}>{rotuloPeriodo([i])}</option>)}
                  </select>
                </label>
              ))}
            </div>
          )}
          {!periodos || !resultadoComp ? (
            <div style={{ marginTop: 8, fontSize: '.84rem', color: '#9ca3af' }}>Ainda não há semanas fechadas suficientes para esta comparação.</div>
          ) : (
            <table style={{ borderCollapse: 'collapse', marginTop: 8, width: '100%', maxWidth: 820 }}>
              <thead>
                <tr>
                  {multi && <th style={{ ...th, textAlign: 'left' }}></th>}
                  <th style={{ ...th, textAlign: 'right' }}>A · {periodos.a.rotulo}</th>
                  <th style={{ ...th, textAlign: 'right' }}>B · {periodos.b.rotulo}</th>
                  <th style={{ ...th, textAlign: 'right' }}>Diferença</th>
                  <th style={{ ...th, textAlign: 'right' }}>Δ%</th>
                </tr>
              </thead>
              <tbody>
                {resultadoComp.map((r, i) => (
                  <tr key={i}>
                    {multi && (
                      <td style={{ ...td, whiteSpace: 'nowrap', fontWeight: 600, fontSize: '.84rem', color: '#374151' }}>
                        <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 2, background: series[i].cor, marginRight: 6 }} />{series[i].nome}
                      </td>
                    )}
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#111827' }}>{fmtV(r.a)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: '#374151' }}>{fmtV(r.b)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.a - r.b >= 0 ? '#15803d' : '#dc2626', whiteSpace: 'nowrap' }}>
                      {(r.a - r.b >= 0 ? '+' : '−') + fmtV(Math.abs(r.a - r.b))}
                    </td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      {r.completo ? <DeltaTxt d={r.d} titulo="A vs B" tamanho=".9rem" /> : <span style={{ fontSize: '.75rem', color: '#9ca3af' }} title="Alguma semana de B é anterior ao início dos dados">sem base</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
      {vista === 'semanas' ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: multi ? 160 + series.length * 170 : 520 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left' }}>Semana</th>
                {series.map((s, i) => (
                  <th key={i} style={{ ...th, textAlign: 'right' }}>
                    {multi ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 10, height: 10, borderRadius: 2, background: s.cor, display: 'inline-block' }} />{s.nome}</span> : ROTULO_MEDIDA[medida]}
                  </th>
                ))}
                {!multi && <th style={{ ...th, textAlign: 'right' }}>vs semana anterior</th>}
                {!multi && <th style={{ ...th, textAlign: 'right' }}>vs semana equivalente do mês anterior</th>}
                {!multi && <th style={{ ...th, textAlign: 'right' }}>vs mesma semana do ano anterior</th>}
              </tr>
            </thead>
            <tbody>
              {inicioSemanas.slice(0, qtdSemanas).map((inicio) => {
                const linhasSem = semanasSerie.map((ls) => ls.find((l) => l.inicio === inicio) ?? null);
                const ref = linhasSem.find((l) => l != null)!;
                return (
                  <tr key={inicio}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>
                      <div style={{ fontWeight: 700, color: '#111827', fontSize: '.86rem' }}>{ref.rotulo}<span style={{ color: '#9ca3af', fontWeight: 500 }}>/{inicio.slice(2, 4)}</span></div>
                      <div style={{ fontSize: '.72rem', color: '#9ca3af' }}>
                        semana {ref.semanaIso} <span title={`${ref.diasUteis} dias úteis (seg–sex fora dos feriados) · ${ref.posMes.pos}ª semana de ${MESES[ref.posMes.mes - 1].toLowerCase()}`} style={{ color: ref.diasUteis < 5 ? '#b45309' : '#9ca3af', fontWeight: ref.diasUteis < 5 ? 700 : 400 }}>({ref.diasUteis}d)</span>
                        {ref.parcial ? ' · em andamento' : ''}
                      </div>
                    </td>
                    {linhasSem.map((l, i) => (
                      <td key={i} style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}
                        title={l ? `${multi ? series[i].nome + ' · ' : ''}${l.rotulo}: ${fmtVLongo(l.valor)}${l.deltaAnt ? ` · ${fmtPct(l.deltaAnt)} vs semana anterior` : ''}${l.deltaMes ? ` · ${fmtPct(l.deltaMes)} vs semana equivalente do mês anterior` : ''}${l.deltaAno ? ` · ${fmtPct(l.deltaAno)} vs semana ${l.semanaIso}/${l.anoIso - 1}` : ''}` : undefined}>
                        {!l ? <span style={{ color: '#d1d5db' }}>—</span> : (
                          <>
                            <div style={{ ...valorStyle(!multi), opacity: l.parcial ? 0.75 : 1 }}>{fmtV(l.valor)}</div>
                            {multi && !l.parcial && (
                              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                                <DeltaTxt d={l.deltaAnt} titulo="vs semana anterior" rotulo="sem." tamanho=".72rem" />
                                <DeltaTxt d={l.deltaMes} titulo="vs semana equivalente do mês anterior" rotulo="mês" tamanho=".72rem" />
                                <DeltaTxt d={l.deltaAno} titulo="vs mesma semana do ano anterior" rotulo="ano" tamanho=".72rem" />
                              </div>
                            )}
                            {l.parcial && <div style={{ fontSize: '.72rem', color: '#9ca3af', fontStyle: 'italic' }}>parcial</div>}
                          </>
                        )}
                      </td>
                    ))}
                    {!multi && <td style={{ ...td, textAlign: 'right' }}>{ref.parcial ? <span style={{ color: '#d1d5db' }}>—</span> : <DeltaTxt d={ref.deltaAnt} titulo="vs semana anterior" />}</td>}
                    {!multi && <td style={{ ...td, textAlign: 'right' }}>{ref.parcial ? <span style={{ color: '#d1d5db' }}>—</span> : <DeltaTxt d={ref.deltaMes} titulo={`vs ${ref.posMes.pos}ª semana do mês anterior`} />}</td>}
                    {!multi && <td style={{ ...td, textAlign: 'right' }}>{ref.parcial ? <span style={{ color: '#d1d5db' }}>—</span> : <DeltaTxt d={ref.deltaAno} titulo={`vs semana ${ref.semanaIso}/${ref.anoIso - 1}`} />}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {inicioSemanas.length > qtdSemanas && (
            <div style={{ textAlign: 'center', padding: '10px 0' }}>
              <button onClick={() => setQtdSemanas((n) => n + SEMANAS_POR_PAGINA)} style={{ border: '1px solid #d1d5db', background: '#fff', borderRadius: 8, padding: '6px 14px', fontSize: '.85rem', fontWeight: 600, color: '#374151', cursor: 'pointer' }}>
                Ver mais {Math.min(SEMANAS_POR_PAGINA, inicioSemanas.length - qtdSemanas)} semanas
              </button>
            </div>
          )}
        </div>
      ) : (
      <div style={{ overflowX: 'auto' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: vista === 'meses' ? 900 : 560 }}>
          <thead>
            <tr>
              <th style={{ ...th, textAlign: 'left' }}>Ano</th>
              {vista === 'meses'
                ? MESES.map((m) => <th key={m} style={th}>{m}</th>)
                : [1, 2, 3, 4].map((t) => <th key={t} style={th}>{`T${t}`} <span style={{ fontWeight: 500, color: '#9ca3af' }}>{['jan–mar', 'abr–jun', 'jul–set', 'out–dez'][t - 1]}</span></th>)}
              <th style={{ ...th, textAlign: 'right' }}>Total do ano</th>
            </tr>
          </thead>
          <tbody>
            {anos.map((ano) => {
              const corAno = multi ? '#374151' : COR_ANO[ano] || '#6b7280';
              const linhas = grades.map((g) => linha(g, ano));
              const base = linhas.find((l) => l != null)!;
              const ultimoFechado = base.mesesFechados < 12 && base.mesesFechados > 0 ? MESES[base.mesesFechados - 1].toLowerCase() : null;
              const corSerie = (i: number) => (multi ? series[i].cor : corAno);
              const pontoSerie = (i: number) => multi ? <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 2, background: corSerie(i), marginRight: 5, verticalAlign: 'middle' }} /> : null;
              return (
                <tr key={ano}>
                  <td style={{ ...td, padding: '8px 8px', fontWeight: 800, color: corAno, fontSize: '1rem', verticalAlign: 'middle' }}>{ano}</td>

                  {vista === 'meses' && base.meses.map((c0) => {
                    const clicavel = !c0.futuro && !!onMes;
                    return (
                      <td key={c0.mes}
                        onClick={clicavel ? () => onMes!(ano, c0.mes) : undefined}
                        title={clicavel ? `Abrir ${MESES[c0.mes - 1]}/${ano} no dashboard` : undefined}
                        style={{ ...td, minWidth: 62, cursor: clicavel ? 'pointer' : 'default' }}>
                        {linhas.map((l, i) => {
                          const c = l?.meses[c0.mes - 1];
                          if (!c || c.valor == null) return <div key={i} style={{ color: '#d1d5db', fontSize: '.8rem' }}>—</div>;
                          const tituloCel = `${multi ? series[i].nome + ' · ' : ''}${MESES[c.mes - 1]}/${ano}: ${fmtVLongo(c.valor)}${qtdTxt(c.qtde)}${c.parcial ? ' (mês em andamento)' : ''}${c.projetado != null ? ` · projeção ${fmtVLongo(c.projetado)}` : ''}${c.delta ? ` · Δ ${fmtPct(c.delta)} ${rotuloComp}` : ''}`;
                          return (
                            <div key={i} title={tituloCel} style={{ marginBottom: multi ? 4 : 0, opacity: c.parcial ? 0.85 : 1 }}>
                              <div style={valorStyle(!multi)}>{pontoSerie(i)}{fmtV(c.valor)}</div>
                              {c.parcial ? (
                                <div style={{ fontSize: '.72rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>
                                  {c.projetado != null ? <span title="Projeção pelo ritmo dos dias úteis já fechados">proj. <b style={{ color: '#6b7280' }}>{fmtV(c.projetado)}</b></span> : <i>parcial</i>}
                                </div>
                              ) : !multi ? (
                                <div style={{ minHeight: '1.1em' }}><DeltaTxt d={c.delta} titulo={rotuloComp} /></div>
                              ) : null}
                              {!multi && ehValor && mostrarQtd && c.qtde != null && <div style={{ fontSize: '.7rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{c.qtde} {unidade}</div>}
                            </div>
                          );
                        })}
                      </td>
                    );
                  })}

                  {vista === 'trimestres' && [1, 2, 3, 4].map((tri) => (
                    <td key={tri} style={{ ...td, minWidth: 110 }}>
                      {linhas.map((l, i) => {
                        const t = l?.trimestres[tri - 1];
                        if (!t || t.valor == null) return <div key={i} style={{ color: '#d1d5db', fontSize: '.8rem' }}>—</div>;
                        const tituloCel = `${multi ? series[i].nome + ' · ' : ''}T${tri}/${ano}: ${fmtVLongo(t.valor)}${t.completo ? '' : ' (em andamento)'}${t.deltaAnt ? ` · ${fmtPct(t.deltaAnt)} vs trimestre anterior` : ''}${t.deltaAno ? ` · ${fmtPct(t.deltaAno)} vs T${tri}/${ano - 1}` : ''}`;
                        return (
                          <div key={i} title={tituloCel} style={{ marginBottom: multi ? 4 : 0 }}>
                            <div style={valorStyle(!multi)}>{pontoSerie(i)}{fmtV(t.valor)}{!t.completo && <span style={{ fontSize: '.7rem', color: '#9ca3af', fontWeight: 500, fontStyle: 'italic' }}> em andamento</span>}</div>
                            {t.completo && !multi && (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 2 }}>
                                <DeltaTxt d={t.deltaAnt} titulo={`vs ${tri === 1 ? `T4/${ano - 1}` : `T${tri - 1}/${ano}`}`} rotulo="trim. ant." />
                                <DeltaTxt d={t.deltaAno} titulo={`vs T${tri}/${ano - 1}`} rotulo="ano ant." />
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </td>
                  ))}

                  <td style={{ ...td, padding: '8px 8px', textAlign: 'right', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
                    {linhas.map((l, i) => l && (
                      <div key={i} style={{ marginBottom: multi ? 6 : 0 }}>
                        <div style={{ fontSize: multi ? '.9rem' : '1rem', fontWeight: 800, color: multi ? series[i].cor : '#111827' }}>{fmtV(l.total)}</div>
                        <div><DeltaTxt d={l.delta} titulo={ultimoFechado ? `jan–${ultimoFechado} vs jan–${ultimoFechado} do ano anterior` : 'vs ano anterior'} /></div>
                        {!multi && ehValor && mostrarQtd && l.ticket != null && <div style={{ fontSize: '.72rem', color: '#6b7280' }} title={`${l.qtde} ${unidade}`}>{l.qtde} {unidade} · ticket R$ {fmtK(l.ticket)}</div>}
                      </div>
                    ))}
                    {ultimoFechado && linhas.some((l) => l?.delta) && <div style={{ fontSize: '.7rem', color: '#9ca3af' }}>Δ jan–{ultimoFechado}</div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
