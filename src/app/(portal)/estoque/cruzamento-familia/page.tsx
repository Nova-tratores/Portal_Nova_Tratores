'use client';
// Cruzamento por família: estoque atual × entradas do mês × saídas (vendas) do mês.
// Consome /api/estoque/cruzamento-familia.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

interface Linha {
  familia: string;
  tipo: 'maquina' | 'peca';
  estoque_qtd: number;
  estoque_valor: number;
  entradas_qtd: number;
  entradas_valor: number;
  saidas_qtd: number;
  saidas_valor: number;
}
interface Totais {
  estoque_qtd: number; estoque_valor: number;
  entradas_qtd: number; entradas_valor: number;
  saidas_qtd: number; saidas_valor: number;
}
interface Resp {
  linhas: Linha[];
  totais: Totais;
  mes: number; ano: number;
  entradasSemFamilia: number;
  erro?: string;
}

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const tdNum: React.CSSProperties = { ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' };
const thNum: React.CSSProperties = { ...thStyle, textAlign: 'right' };

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const fmtQtd = (n: number): string => (Math.abs(n % 1) < 1e-9 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));

type SortKey = keyof Omit<Linha, 'tipo'>;

export default function CruzamentoFamiliaPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam } = useConta();

  const agora = new Date();
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [ano, setAno] = useState(agora.getFullYear());
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<Resp | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('estoque_valor');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await fetch(`/api/estoque/cruzamento-familia?mes=${mes}&ano=${ano}&tipo=${tipo}${contaParam}`);
      const d = (await r.json()) as Resp;
      if (d.erro) { setErro(d.erro); setDados(null); return; }
      setDados(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, ano, tipo, contaParam]);

  useEffect(() => { carregar(); }, [carregar]);

  const ordenar = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === 'familia' ? 1 : -1); }
  };

  const linhas = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    const filtradas = q ? dados.linhas.filter((l) => l.familia.toLowerCase().includes(q)) : dados.linhas;
    return [...filtradas].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
      return String(va).localeCompare(String(vb)) * sortDir;
    });
  }, [dados, busca, sortKey, sortDir]);

  const exportarCSV = useCallback(() => {
    if (!dados) return;
    const linhasCsv: string[] = [];
    linhasCsv.push(['Familia', 'Tipo', 'Estoque Qtd', 'Estoque Valor', 'Entradas Qtd', 'Entradas Valor', 'Saidas Qtd', 'Saidas Valor'].join(';'));
    linhas.forEach((l) => linhasCsv.push([
      l.familia.replace(/;/g, ','), l.tipo,
      l.estoque_qtd, l.estoque_valor.toFixed(2),
      l.entradas_qtd, l.entradas_valor.toFixed(2),
      l.saidas_qtd, l.saidas_valor.toFixed(2),
    ].join(';')));
    const blob = new Blob(['﻿' + linhasCsv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cruzamento-familia-${ano}-${String(mes).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dados, linhas, mes, ano]);

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  const t = dados?.totais;
  const anos: number[] = [];
  for (let y = agora.getFullYear(); y >= agora.getFullYear() - 4; y--) anos.push(y);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Cruzamento por Família</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Estoque atual × entradas do mês × saídas (vendas) do mês, por família</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
        <Link href="/estoque/notas-entrada" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Notas de Entrada</Link>
        <Link href="/estoque/curva-abc" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Curva ABC</Link>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Mês" value={mes} onChange={(v) => setMes(parseInt(v))} options={MESES.map((nome, i) => ({ value: i + 1, label: nome }))} />
        <Sel label="Ano" value={ano} onChange={(v) => setAno(parseInt(v))} options={anos.map((y) => ({ value: y, label: String(y) }))} />
        <Sel label="Tipo" value={tipo} onChange={setTipo} options={[{ value: '', label: 'Todos' }, { value: 'maquinas', label: 'Máquinas' }, { value: 'pecas', label: 'Peças' }]} />
        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>Buscar família</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="filtrar…" style={{ padding: '9px 12px', border: '1px solid #e0e0e0', background: '#fff', color: '#333', borderRadius: 8, fontSize: '.82rem', outline: 'none' }} />
        </div>
        <button onClick={exportarCSV} disabled={!dados} style={{ padding: '9px 16px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {t && !carregando && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Resumo titulo="Valor em estoque" valor={fmtRS(t.estoque_valor)} sub={`${fmtQtd(t.estoque_qtd)} un · saldo atual`} />
            <Resumo titulo="Entradas do mês" valor={fmtRS(t.entradas_valor)} sub={`${fmtQtd(t.entradas_qtd)} un`} cor="#16a34a" />
            <Resumo titulo="Saídas (vendas) do mês" valor={fmtRS(t.saidas_valor)} sub={`${fmtQtd(t.saidas_qtd)} un`} cor="#dc2626" />
            <Resumo titulo="Entradas − Saídas" valor={fmtRS(t.entradas_valor - t.saidas_valor)} sub="movimento líquido do mês" cor={t.entradas_valor - t.saidas_valor >= 0 ? '#16a34a' : '#dc2626'} />
          </div>

          {dados!.entradasSemFamilia > 0 && (
            <div style={{ color: '#d97706', fontSize: '.76rem', marginBottom: 10 }}>
              ⚠ {dados!.entradasSemFamilia} item(ns) de entrada sem código casado na tabela de produtos foram agrupados em &quot;Sem família&quot;.
            </div>
          )}

          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, borderBottom: 'none', paddingBottom: 2 }} />
                  <th style={{ ...thNum, borderBottom: 'none', paddingBottom: 2, textAlign: 'center' }} colSpan={2}>Estoque atual</th>
                  <th style={{ ...thNum, borderBottom: 'none', paddingBottom: 2, textAlign: 'center', color: '#16a34a' }} colSpan={2}>Entradas mês</th>
                  <th style={{ ...thNum, borderBottom: 'none', paddingBottom: 2, textAlign: 'center', color: '#dc2626' }} colSpan={2}>Saídas mês</th>
                </tr>
                <tr>
                  <th style={thStyle} onClick={() => ordenar('familia')}>Família</th>
                  <th style={thNum} onClick={() => ordenar('estoque_qtd')}>Qtd</th>
                  <th style={thNum} onClick={() => ordenar('estoque_valor')}>Valor</th>
                  <th style={thNum} onClick={() => ordenar('entradas_qtd')}>Qtd</th>
                  <th style={thNum} onClick={() => ordenar('entradas_valor')}>Valor</th>
                  <th style={thNum} onClick={() => ordenar('saidas_qtd')}>Qtd</th>
                  <th style={thNum} onClick={() => ordenar('saidas_valor')}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>
                      {l.familia}
                      <span style={{ marginLeft: 6, fontSize: '.6rem', color: '#aaa', textTransform: 'uppercase' }}>{l.tipo === 'maquina' ? 'máq' : 'peça'}</span>
                    </td>
                    <td style={tdNum}>{l.estoque_qtd ? fmtQtd(l.estoque_qtd) : '—'}</td>
                    <td style={tdNum}>{l.estoque_valor ? fmtRS(l.estoque_valor) : '—'}</td>
                    <td style={{ ...tdNum, color: l.entradas_valor ? '#16a34a' : '#bbb' }}>{l.entradas_qtd ? fmtQtd(l.entradas_qtd) : '—'}</td>
                    <td style={{ ...tdNum, color: l.entradas_valor ? '#16a34a' : '#bbb' }}>{l.entradas_valor ? fmtRS(l.entradas_valor) : '—'}</td>
                    <td style={{ ...tdNum, color: l.saidas_valor ? '#dc2626' : '#bbb' }}>{l.saidas_qtd ? fmtQtd(l.saidas_qtd) : '—'}</td>
                    <td style={{ ...tdNum, color: l.saidas_valor ? '#dc2626' : '#bbb' }}>{l.saidas_valor ? fmtRS(l.saidas_valor) : '—'}</td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td style={tdStyle} colSpan={7}>Nenhuma família encontrada para o período.</td></tr>
                )}
              </tbody>
              {linhas.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: '#fafafa' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>Total ({linhas.length})</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmtQtd(linhas.reduce((s, l) => s + l.estoque_qtd, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmtRS(linhas.reduce((s, l) => s + l.estoque_valor, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#16a34a' }}>{fmtQtd(linhas.reduce((s, l) => s + l.entradas_qtd, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#16a34a' }}>{fmtRS(linhas.reduce((s, l) => s + l.entradas_valor, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#dc2626' }}>{fmtQtd(linhas.reduce((s, l) => s + l.saidas_qtd, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#dc2626' }}>{fmtRS(linhas.reduce((s, l) => s + l.saidas_valor, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 10 }}>
            Estoque = saldo atual × CMC (snapshot do último sync, não histórico do mês). Saídas = vendas do mês. Entradas = itens das notas de entrada do mês, com família resolvida pelo código do produto.
          </p>
        </>
      )}
    </div>
  );
}

function Resumo({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: '.66rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: cor || '#333' }}>{valor}</div>
      {sub && <div style={{ fontSize: '.68rem', color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string | number; onChange: (v: string) => void; options: Array<{ value: string | number; label: string }> }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e0e0e0', background: '#fff', color: '#333', borderRadius: 8, fontSize: '.82rem', outline: 'none' }}>
        {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}
