'use client';
// Inteligência Comercial: 3 abas (Compras / Clientes / Oportunidades-RFM) sobre
// /api/estoque/inteligencia-comercial. Tabelas com cabeçalho ordenável + filtro
// por coluna + export CSV. Todo o histórico, por conta (NOVA/CASTRO/Todas).
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

type Aba = 'compras' | 'clientes' | 'oportunidades';
const ABAS: Array<{ id: Aba; label: string }> = [
  { id: 'compras', label: 'Compras' },
  { id: 'clientes', label: 'Clientes' },
  { id: 'oportunidades', label: 'Oportunidades (RFM)' },
];

type Tipo = 'texto' | 'num' | 'moeda' | 'data' | 'bool';
interface Col { key: string; label: string; tipo: Tipo; get: (r: Record<string, unknown>) => unknown }

const MAX_RENDER = 500;

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#666', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'pointer', position: 'sticky', top: 0, zIndex: 2 };
const thFiltro: React.CSSProperties = { background: '#fff', padding: '4px 6px', borderBottom: '1px solid #eee', position: 'sticky', top: 30, zIndex: 2 };
const tdStyle: React.CSSProperties = { padding: '7px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.8rem', whiteSpace: 'nowrap' };
const filtroInput: React.CSSProperties = { width: '100%', padding: '4px 6px', border: '1px solid #e5e5e5', borderRadius: 6, fontSize: '.72rem', outline: 'none' };

const parseBR = (s: string): number => { const p = s.split('/'); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]).getTime() : 0; };

// Filtro por coluna: termo numérico => igualdade exata; texto => substring; case-insensitive.
function casaFiltro(valor: unknown, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  const v = String(valor ?? '').toLowerCase();
  if (/^\d+([.,]\d+)?$/.test(t)) { return v.replace(/\./g, '').replace(',', '.') === t.replace(',', '.') || v === t; }
  return v.includes(t);
}

function fmtCel(v: unknown, tipo: Tipo): string {
  if (tipo === 'moeda') return fmtRS(Number(v) || 0);
  if (tipo === 'bool') return v ? '✓' : '';
  if (tipo === 'num') return String(Number(v) || 0);
  return v == null ? '' : String(v);
}

function TabelaAnalise({ cols, rows, csvName, defaultSort }: { cols: Col[]; rows: Array<Record<string, unknown>>; csvName: string; defaultSort?: { key: string; dir: number } }) {
  const [sortKey, setSortKey] = useState(defaultSort?.key ?? cols[0].key);
  const [sortDir, setSortDir] = useState(defaultSort?.dir ?? 1);
  const [filtros, setFiltros] = useState<Record<string, string>>({});

  const colByKey = useMemo(() => Object.fromEntries(cols.map((c) => [c.key, c])), [cols]);

  const ordenar = useCallback((k: string) => {
    if (k === sortKey) setSortDir((d) => -d); else { setSortKey(k); setSortDir(1); }
  }, [sortKey]);

  const filtradas = useMemo(() => {
    const ativos = Object.entries(filtros).filter(([, v]) => v.trim());
    let out = rows;
    if (ativos.length) out = rows.filter((r) => ativos.every(([k, termo]) => casaFiltro(colByKey[k]?.get(r), termo)));
    const col = colByKey[sortKey];
    const arr = [...out].sort((a, b) => {
      const va = col.get(a), vb = col.get(b);
      let cmp: number;
      if (col.tipo === 'data') cmp = parseBR(String(va ?? '')) - parseBR(String(vb ?? ''));
      else if (col.tipo === 'num' || col.tipo === 'moeda' || col.tipo === 'bool') cmp = (Number(va) || 0) - (Number(vb) || 0);
      else cmp = String(va ?? '').localeCompare(String(vb ?? ''), 'pt-BR', { numeric: true, sensitivity: 'base' });
      return cmp * sortDir;
    });
    return arr;
  }, [rows, filtros, sortKey, sortDir, colByKey]);

  const exportarCSV = useCallback(() => {
    const linhas: string[] = [cols.map((c) => c.label).join(';')];
    const cell = (v: unknown, tipo: Tipo) => {
      if (tipo === 'moeda' || tipo === 'num') return String(Number(v) || 0).replace('.', ',');
      const s = tipo === 'bool' ? (v ? 'SIM' : '') : String(v ?? '');
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    filtradas.forEach((r) => linhas.push(cols.map((c) => cell(c.get(r), c.tipo)).join(';')));
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = csvName; a.click(); URL.revokeObjectURL(url);
  }, [filtradas, cols, csvName]);

  const visiveis = filtradas.slice(0, MAX_RENDER);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.78rem', color: '#888' }}>{filtradas.length.toLocaleString('pt-BR')} linhas{filtradas.length > MAX_RENDER ? ` (mostrando ${MAX_RENDER})` : ''}</span>
        <button onClick={exportarCSV} disabled={!filtradas.length} style={{ marginLeft: 'auto', padding: '7px 14px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.76rem', fontWeight: 600, cursor: 'pointer' }}>Exportar CSV</button>
      </div>
      <div style={{ overflowX: 'auto', maxHeight: '70vh', overflowY: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{cols.map((c) => (
              <th key={c.key} style={{ ...thStyle, textAlign: c.tipo === 'texto' ? 'left' : 'right' }} onClick={() => ordenar(c.key)} title="Clique para ordenar">
                {c.label}{sortKey === c.key ? (sortDir === 1 ? ' ▲' : ' ▼') : ''}
              </th>
            ))}</tr>
            <tr>{cols.map((c) => (
              <th key={c.key} style={thFiltro}>
                <input value={filtros[c.key] || ''} onChange={(e) => setFiltros((f) => ({ ...f, [c.key]: e.target.value }))} placeholder="filtrar" style={filtroInput} onClick={(e) => e.stopPropagation()} />
              </th>
            ))}</tr>
          </thead>
          <tbody>
            {visiveis.map((r, i) => (
              <tr key={i}>{cols.map((c) => (
                <td key={c.key} style={{ ...tdStyle, textAlign: c.tipo === 'texto' ? 'left' : 'right', color: c.tipo === 'bool' && r[c.key] ? '#059669' : tdStyle.color, whiteSpace: c.key === 'fornecedores' || c.key === 'produtos_top' ? 'normal' : 'nowrap', maxWidth: c.key === 'fornecedores' || c.key === 'produtos_top' ? 340 : undefined }}>
                  {fmtCel(c.get(r), c.tipo)}
                </td>
              ))}</tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ===== Definições de colunas por aba =====
const COLS_COMPRAS: Col[] = [
  { key: 'sku', label: 'SKU', tipo: 'texto', get: (r) => r.sku },
  { key: 'descricao', label: 'Descrição', tipo: 'texto', get: (r) => r.descricao },
  { key: 'qtd_total', label: 'Qtd comprada', tipo: 'num', get: (r) => r.qtd_total },
  { key: 'valor_total', label: 'Valor total', tipo: 'moeda', get: (r) => r.valor_total },
  { key: 'n_fornecedores', label: 'Nº fornec.', tipo: 'num', get: (r) => r.n_fornecedores },
  { key: 'fornecedores', label: 'Fornecedores', tipo: 'texto', get: (r) => r.fornecedores },
  { key: 'n_notas', label: 'Nº NFs', tipo: 'num', get: (r) => r.n_notas },
  { key: 'ultima_compra', label: 'Última compra', tipo: 'data', get: (r) => r.ultima_compra },
  { key: 'vinculado', label: 'Vinculado', tipo: 'bool', get: (r) => r.vinculado },
];

const COLS_CLIENTES: Col[] = [
  { key: 'nome', label: 'Cliente', tipo: 'texto', get: (r) => r.nome },
  { key: 'conta', label: 'Conta', tipo: 'texto', get: (r) => r.conta },
  { key: 'n_vendas', label: 'Nº vendas', tipo: 'num', get: (r) => r.n_vendas },
  { key: 'n_produtos', label: 'Nº produtos', tipo: 'num', get: (r) => r.n_produtos },
  { key: 'qtd_total', label: 'Qtd total', tipo: 'num', get: (r) => r.qtd_total },
  { key: 'valor_total', label: 'Valor total', tipo: 'moeda', get: (r) => r.valor_total },
  { key: 'ultima_venda', label: 'Última venda', tipo: 'data', get: (r) => r.ultima_venda },
  { key: 'produtos_top', label: 'Produtos vendidos (top)', tipo: 'texto', get: (r) => r.produtos_top },
  { key: 'codigo_cliente', label: 'Cód.', tipo: 'texto', get: (r) => r.codigo_cliente },
];

const COLS_OPORT: Col[] = [
  { key: 'na_hora', label: 'Na hora?', tipo: 'bool', get: (r) => r.na_hora },
  { key: 'sku', label: 'SKU', tipo: 'texto', get: (r) => r.sku },
  { key: 'descricao', label: 'Descrição', tipo: 'texto', get: (r) => r.descricao },
  { key: 'estoque', label: 'Estoque', tipo: 'num', get: (r) => r.estoque },
  { key: 'ultima_venda', label: 'Última venda', tipo: 'data', get: (r) => r.ultima_venda },
  { key: 'dias_desde_ultima', label: 'Dias s/ vender', tipo: 'num', get: (r) => r.dias_desde_ultima },
  { key: 'intervalo_medio', label: 'Interv. médio (d)', tipo: 'num', get: (r) => r.intervalo_medio },
  { key: 'n_vendas', label: 'Nº vendas', tipo: 'num', get: (r) => r.n_vendas },
  { key: 'qtd_vendida', label: 'Qtd vendida', tipo: 'num', get: (r) => r.qtd_vendida },
  { key: 'faturamento', label: 'Faturamento', tipo: 'moeda', get: (r) => r.faturamento },
  { key: 'rfm', label: 'RFM', tipo: 'num', get: (r) => r.rfm },
];

export default function InteligenciaComercialPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [aba, setAba] = useState<Aba>('compras');
  const [dados, setDados] = useState<Record<Aba, Array<Record<string, unknown>> | null>>({ compras: null, clientes: null, oportunidades: null });
  const [meta, setMeta] = useState<Record<string, unknown>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = useCallback(async (ab: Aba) => {
    setCarregando(true); setErro('');
    try {
      const r = await fetch(`/api/estoque/inteligencia-comercial?aba=${ab}${contaParam}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); return; }
      setDados((prev) => ({ ...prev, [ab]: d.itens || [] }));
      setMeta(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [contaParam]);

  // Recarrega ao trocar de aba ou de conta (invalida cache local ao mudar conta).
  useEffect(() => { setDados({ compras: null, clientes: null, oportunidades: null }); }, [contaParam]);
  useEffect(() => { if (dados[aba] == null) carregar(aba); /* eslint-disable-next-line */ }, [aba, contaParam]);

  if (!permLoading && userProfile && !pode('estoque', 'inteligencia-comercial')) return <SemPermissao />;

  const rows = dados[aba] || [];
  const cols = aba === 'compras' ? COLS_COMPRAS : aba === 'clientes' ? COLS_CLIENTES : COLS_OPORT;
  const csvName = `inteligencia-${aba}${conta ? '-' + conta : ''}.csv`;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Inteligência Comercial</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Compras por produto · Clientes · Oportunidades (RFM) — histórico desde 11/2022</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => setAba(a.id)} style={{ padding: '9px 18px', border: '1px solid ' + (aba === a.id ? '#dc2626' : '#e0e0e0'), background: aba === a.id ? '#dc2626' : '#fff', color: aba === a.id ? '#fff' : '#666', borderRadius: 999, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            {a.label}
          </button>
        ))}
      </div>

      {aba === 'oportunidades' && typeof meta.na_hora === 'number' && !carregando && (
        <div style={{ fontSize: '.8rem', color: '#059669', marginBottom: 10, fontWeight: 600 }}>
          {Number(meta.na_hora)} {Number(meta.na_hora) === 1 ? 'produto está' : 'produtos estão'} na hora de vender (têm estoque e a venda está atrasada em relação ao ritmo).
        </div>
      )}

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem', padding: '20px 0' }}>Calculando… (varre todo o histórico, pode levar alguns segundos)</div>}

      {!carregando && !erro && (
        <TabelaAnalise
          cols={cols}
          rows={rows}
          csvName={csvName}
          defaultSort={aba === 'oportunidades' ? { key: 'na_hora', dir: -1 } : { key: 'valor_total', dir: -1 }}
        />
      )}
      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Modo Todas (NOVA + CASTRO)</div>}
    </div>
  );
}
