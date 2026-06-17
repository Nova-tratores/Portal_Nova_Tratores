'use client';
// Curva ABC + Inativos. Portado de GET /curva-abc (server.js:9253) consumindo
// /api/estoque/curva-abc e /api/estoque/curva-abc/inativos.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

type Tab = 'abc' | 'inativos';
type CurvaTipo = 'produto' | 'cliente' | 'familia';

interface ABCItem {
  codigo: string; descricao: string; sku?: string; valor_total: number; custo_total: number;
  margem: number; quantidade: number; ocorrencias: number; percentual: number; percentual_acumulado: number; classe: 'A' | 'B' | 'C'; posicao: number;
}
interface ABCResp {
  itens: ABCItem[];
  resumo: { totalGeral: number; qtdeA: number; qtdeB: number; qtdeC: number; valorA: number; valorB: number; valorC: number };
  tipo: CurvaTipo; totalItens: number; erro?: string;
}
interface InativoItem {
  codigo_produto: string; sku: string; descricao: string; ultima_venda: string | null;
  dias_parado: number | null; saldo: number | null; cmc: number | null; valor_estoque: number | null; sugestao: string;
}
interface InativosResp {
  inativos: InativoItem[]; total: number; totalCatalogo: number; totalVendidos: number;
  resumo: { nuncaVendidos: number; mais365: number; mais180: number; menos180: number; valorParadoTotal: number; comEstoque: number };
  erro?: string;
}

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const corClasse: Record<string, string> = { A: '#16a34a', B: '#d97706', C: '#dc2626' };

export default function CurvaABCPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam } = useConta();

  const [tab, setTab] = useState<Tab>('abc');
  const [tipo, setTipo] = useState<CurvaTipo>('produto');
  const [periodo, setPeriodo] = useState(12);
  const [familia, setFamilia] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [abc, setAbc] = useState<ABCResp | null>(null);
  const [inativos, setInativos] = useState<InativosResp | null>(null);
  const [sortKey, setSortKey] = useState<keyof ABCItem>('valor_total');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const famParam = familia ? `&familia=${familia}` : '';
      if (tab === 'abc') {
        const r = await fetch(`/api/estoque/curva-abc?tipo=${tipo}&periodo=${periodo}${famParam}${contaParam}`);
        const d = (await r.json()) as ABCResp;
        if (d.erro) { setErro(d.erro); return; }
        setAbc(d);
      } else {
        const r = await fetch(`/api/estoque/curva-abc/inativos?periodo=${periodo}${famParam}${contaParam}`);
        const d = (await r.json()) as InativosResp;
        if (d.erro) { setErro(d.erro); return; }
        setInativos(d);
      }
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [tab, tipo, periodo, familia, contaParam]);

  useEffect(() => { carregar(); }, [carregar]);

  const ordenar = (k: keyof ABCItem) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(-1); }
  };
  const itensOrd = useMemo(() => abc ? [...abc.itens].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  }) : [], [abc, sortKey, sortDir]);

  const exportarCSV = useCallback(() => {
    const linhas: string[] = [];
    if (tab === 'abc' && abc) {
      linhas.push(['Pos', 'Classe', 'Codigo', 'SKU', 'Descricao', 'Valor', 'Custo', 'Margem', 'Qtd', '%', '% Acum'].join(';'));
      itensOrd.forEach((it) => linhas.push([it.posicao, it.classe, it.codigo, it.sku || '', (it.descricao || '').replace(/;/g, ','), it.valor_total, it.custo_total, it.margem, it.quantidade, it.percentual.toFixed(2), it.percentual_acumulado.toFixed(2)].join(';')));
    } else if (inativos) {
      linhas.push(['Codigo', 'SKU', 'Descricao', 'Ultima venda', 'Dias parado', 'Saldo', 'CMC', 'Valor estoque', 'Sugestao'].join(';'));
      inativos.inativos.forEach((it) => linhas.push([it.codigo_produto, it.sku, (it.descricao || '').replace(/;/g, ','), it.ultima_venda || '', it.dias_parado ?? '', it.saldo ?? '', it.cmc ?? '', it.valor_estoque ?? '', it.sugestao].join(';')));
    }
    const blob = new Blob(['﻿' + linhas.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `curva-abc-${tab}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [tab, abc, inativos, itensOrd]);

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Curva ABC</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Análise de Pareto e produtos sem giro</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
        <Link href="/estoque/dashboard" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Dashboard</Link>
        <Link href="/estoque/giro-estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Giro de Estoque</Link>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([['abc', 'Curva ABC'], ['inativos', 'Inativos']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)}
            style={{ padding: '8px 16px', border: '1px solid', borderColor: tab === t ? '#dc2626' : '#e0e0e0', background: tab === t ? '#dc2626' : '#fff', color: tab === t ? '#fff' : '#666', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {tab === 'abc' && (
          <Sel label="Dimensão" value={tipo} onChange={(v) => setTipo(v as CurvaTipo)} options={[{ value: 'produto', label: 'Produto' }, { value: 'cliente', label: 'Cliente' }, { value: 'familia', label: 'Tipo/Família' }]} />
        )}
        <Sel label="Período" value={periodo} onChange={(v) => setPeriodo(parseInt(v))} options={[12, 24, 36, 48].map((m) => ({ value: m, label: m + ' meses' }))} />
        <Sel label="Família" value={familia} onChange={setFamilia} options={[{ value: '', label: 'Todas' }, { value: 'pecas', label: 'Peças' }, { value: 'maquinas', label: 'Máquinas' }]} />
        <button onClick={exportarCSV} style={{ padding: '9px 16px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {/* === ABC === */}
      {tab === 'abc' && abc && !carregando && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Resumo titulo="Total" valor={fmtRS(abc.resumo.totalGeral)} sub={`${abc.totalItens} itens`} />
            <Resumo titulo="Classe A" valor={fmtRS(abc.resumo.valorA)} sub={`${abc.resumo.qtdeA} itens`} cor="#16a34a" />
            <Resumo titulo="Classe B" valor={fmtRS(abc.resumo.valorB)} sub={`${abc.resumo.qtdeB} itens`} cor="#d97706" />
            <Resumo titulo="Classe C" valor={fmtRS(abc.resumo.valorC)} sub={`${abc.resumo.qtdeC} itens`} cor="#dc2626" />
          </div>
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Classe</th>
                {tipo === 'produto' && <th style={thStyle} onClick={() => ordenar('sku')}>SKU</th>}
                <th style={thStyle} onClick={() => ordenar('descricao')}>Descrição</th>
                <th style={thStyle} onClick={() => ordenar('valor_total')}>Valor</th>
                <th style={thStyle} onClick={() => ordenar('margem')}>Margem</th>
                <th style={thStyle} onClick={() => ordenar('quantidade')}>Qtd</th>
                <th style={thStyle} onClick={() => ordenar('percentual')}>%</th>
                <th style={thStyle} onClick={() => ordenar('percentual_acumulado')}>% Acum</th>
              </tr></thead>
              <tbody>
                {itensOrd.slice(0, 1000).map((it, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{it.posicao}</td>
                    <td style={{ ...tdStyle, fontWeight: 700, color: corClasse[it.classe] }}>{it.classe}</td>
                    {tipo === 'produto' && <td style={tdStyle}>{it.sku || it.codigo}</td>}
                    <td style={tdStyle}>{it.descricao}</td>
                    <td style={tdStyle}>{fmtRS(it.valor_total)}</td>
                    <td style={tdStyle}>{fmtRS(it.margem)}</td>
                    <td style={tdStyle}>{it.quantidade}</td>
                    <td style={tdStyle}>{it.percentual.toFixed(1)}%</td>
                    <td style={tdStyle}>{it.percentual_acumulado.toFixed(1)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* === Inativos === */}
      {tab === 'inativos' && inativos && !carregando && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Resumo titulo="Inativos" valor={String(inativos.total)} sub={`de ${inativos.totalCatalogo}`} />
            <Resumo titulo="Nunca vendidos" valor={String(inativos.resumo.nuncaVendidos)} cor="#dc2626" />
            <Resumo titulo="> 365 dias" valor={String(inativos.resumo.mais365)} cor="#dc2626" />
            <Resumo titulo="Com estoque" valor={String(inativos.resumo.comEstoque)} cor="#d97706" />
            <Resumo titulo="Valor parado" valor={fmtRS(inativos.resumo.valorParadoTotal)} cor="#dc2626" />
          </div>
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['SKU', 'Descrição', 'Última venda', 'Dias parado', 'Saldo', 'Valor estoque', 'Sugestão'].map((h) => <th key={h} style={{ ...thStyle, cursor: 'default' }}>{h}</th>)}</tr></thead>
              <tbody>
                {inativos.inativos.slice(0, 1000).map((it, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{it.sku || it.codigo_produto}</td>
                    <td style={tdStyle}>{it.descricao}</td>
                    <td style={tdStyle}>{it.ultima_venda || 'nunca'}</td>
                    <td style={tdStyle}>{it.dias_parado ?? '—'}</td>
                    <td style={tdStyle}>{it.saldo ?? '—'}</td>
                    <td style={tdStyle}>{it.valor_estoque != null ? fmtRS(it.valor_estoque) : '—'}</td>
                    <td style={tdStyle}>{it.sugestao}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
