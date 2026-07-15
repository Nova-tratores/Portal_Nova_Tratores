'use client';
// Omie em Massa — visualizar e editar EM LOTE os cadastros do Omie (conta NOVA)
// direto no portal: aba Serviços (todos os 210) e aba Produtos (ranqueados por
// família / estoque / vendas do mês). Edição inline na tabela; célula alterada
// fica destacada; "Revisar e aplicar" mostra o diff e só então grava via
// /api/omie-massa/* (que compara de novo com o Omie e altera só o que mudou).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

// ---------- tipos ----------
type Row = Record<string, string | number>;
interface Col { key: string; label: string; w: number; tipo?: 'num' | 'sn'; ro?: boolean }
interface Resultado { ok: boolean; erro?: string; campos: string[]; cCodigo?: string; codigo?: string; nCodServ?: number; codigo_produto?: number }
interface Familia { nome: string; produtos: number }

// ---------- colunas ----------
const COLS_SERV: Col[] = [
  { key: 'nCodServ', label: 'Cód. Omie', w: 105, ro: true },
  { key: 'inativo', label: 'Inativo', w: 62, tipo: 'sn' },
  { key: 'cCodigo', label: 'Código', w: 120 },
  { key: 'cDescricao', label: 'Descrição', w: 260 },
  { key: 'cDescrCompleta', label: 'Descrição completa', w: 260 },
  { key: 'nPrecoUnit', label: 'Preço (R$)', w: 90, tipo: 'num' },
  { key: 'cIdTrib', label: 'ID Trib', w: 60 },
  { key: 'cCodLC116', label: 'LC 116', w: 70 },
  { key: 'cCodServMun', label: 'Cód. Mun.', w: 80 },
  { key: 'cCodCateg', label: 'Categoria', w: 90 },
  { key: 'nAliqISS', label: '% ISS', w: 60, tipo: 'num' },
  { key: 'cRetISS', label: 'Ret ISS', w: 58, tipo: 'sn' },
  { key: 'nAliqPIS', label: '% PIS', w: 60, tipo: 'num' },
  { key: 'cRetPIS', label: 'Ret PIS', w: 58, tipo: 'sn' },
  { key: 'nAliqCOFINS', label: '% COFINS', w: 70, tipo: 'num' },
  { key: 'cRetCOFINS', label: 'Ret COF', w: 58, tipo: 'sn' },
  { key: 'nAliqCSLL', label: '% CSLL', w: 60, tipo: 'num' },
  { key: 'cRetCSLL', label: 'Ret CSLL', w: 58, tipo: 'sn' },
  { key: 'nAliqIR', label: '% IR', w: 60, tipo: 'num' },
  { key: 'cRetIR', label: 'Ret IR', w: 58, tipo: 'sn' },
  { key: 'nAliqINSS', label: '% INSS', w: 60, tipo: 'num' },
  { key: 'cRetINSS', label: 'Ret INSS', w: 58, tipo: 'sn' },
  // Reforma Tributária (IBS/CBS)
  { key: 'cCstIbsCbs', label: 'CST IBS/CBS', w: 85 },
  { key: 'cClassTrib', label: 'Class. Trib.', w: 85 },
  { key: 'cIndOper', label: 'Ind. Operação', w: 95 },
  { key: 'nAliqIbsMun', label: '% IBS Mun', w: 75, tipo: 'num' },
  { key: 'nAliqIbsUf', label: '% IBS Est', w: 75, tipo: 'num' },
  { key: 'nAliqCbs', label: '% CBS', w: 65, tipo: 'num' },
  { key: 'nPercReducaoIbsMun', label: 'Red. IBS Mun', w: 85, tipo: 'num' },
  { key: 'nPercReducaoIbsUf', label: 'Red. IBS Est', w: 85, tipo: 'num' },
  { key: 'nPercReducaoCbs', label: 'Red. CBS', w: 75, tipo: 'num' },
];
const COLS_PROD: Col[] = [
  { key: 'codigo_produto', label: 'Cód. Omie', w: 105, ro: true },
  { key: 'codigo', label: 'Código', w: 120, ro: true },
  { key: 'familia', label: 'Família', w: 110, ro: true },
  { key: 'estoque', label: 'Estoque', w: 70, ro: true },
  { key: 'vendas_qtd', label: 'Vendas (qtd)', w: 85, ro: true },
  { key: 'vendas_valor', label: 'Vendas (R$)', w: 95, ro: true },
  { key: 'descricao', label: 'Descrição', w: 300 },
  { key: 'descr_detalhada', label: 'Descr. detalhada', w: 300 },
  { key: 'valor_unitario', label: 'Valor unit. (R$)', w: 105, tipo: 'num' },
  { key: 'ncm', label: 'NCM', w: 95 },
  { key: 'cest', label: 'CEST', w: 90 },
  { key: 'cfop', label: 'CFOP', w: 70 },
  { key: 'ean', label: 'EAN', w: 110 },
  { key: 'unidade', label: 'Unidade', w: 70 },
  // ICMS/PIS/COFINS (clássicos)
  { key: 'cst_icms', label: 'CST ICMS', w: 75 },
  { key: 'csosn_icms', label: 'CSOSN', w: 70 },
  { key: 'aliquota_icms', label: '% ICMS', w: 65, tipo: 'num' },
  { key: 'cst_pis', label: 'CST PIS', w: 65 },
  { key: 'aliquota_pis', label: '% PIS', w: 60, tipo: 'num' },
  { key: 'cst_cofins', label: 'CST COFINS', w: 80 },
  { key: 'aliquota_cofins', label: '% COFINS', w: 70, tipo: 'num' },
  // Reforma Tributária (IBS/CBS)
  { key: 'cst_ibs_cbs', label: 'CST IBS/CBS', w: 85 },
  { key: 'class_trib', label: 'Class. Trib.', w: 85 },
  { key: 'aliquota_ibs_mun', label: '% IBS Mun', w: 75, tipo: 'num' },
  { key: 'aliquota_ibs_uf', label: '% IBS Est', w: 75, tipo: 'num' },
  { key: 'aliquota_cbs', label: '% CBS', w: 65, tipo: 'num' },
  { key: 'perc_reducao_ibs_mun', label: 'Red. IBS Mun', w: 85, tipo: 'num' },
  { key: 'perc_reducao_ibs_uf', label: 'Red. IBS Est', w: 85, tipo: 'num' },
  { key: 'perc_reducao_cbs', label: 'Red. CBS', w: 75, tipo: 'num' },
  { key: 'inativo', label: 'Inativo', w: 62, tipo: 'sn' },
];

// ---------- helpers ----------
const parseNum = (s: string) => parseFloat(String(s).replace(',', '.')) || 0;
const difere = (col: Col, editado: string, original: string | number): boolean => {
  if (col.tipo === 'num') return parseNum(editado) !== Number(original);
  if (col.tipo === 'sn') return editado.trim().toUpperCase() !== String(original).toUpperCase();
  return editado.trim() !== String(original).trim();
};
const valorFinal = (col: Col, editado: string): string | number => {
  if (col.tipo === 'num') return parseNum(editado);
  if (col.tipo === 'sn') return editado.trim().toUpperCase();
  return editado.trim();
};

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600, color: '#334155' };
const btnPrim: React.CSSProperties = { ...btn, background: '#0f172a', color: '#fff', border: '1px solid #0f172a' };
const btnDanger: React.CSSProperties = { ...btn, background: '#dc2626', color: '#fff', border: '1px solid #dc2626' };
const inputBase: React.CSSProperties = { width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', fontSize: '.78rem', background: 'transparent', color: '#334155' };

// ---------- grid editável (compartilhado pelas duas abas) ----------
function GridEditavel({ cols, rows, idKey, edits, setEdits, filtro }: {
  cols: Col[]; rows: Row[]; idKey: string;
  edits: Record<string, Record<string, string>>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  filtro: string;
}) {
  const visiveis = useMemo(() => {
    if (!filtro.trim()) return rows;
    const f = filtro.trim().toLowerCase();
    return rows.filter((r) => cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(f)));
  }, [rows, filtro, cols]);

  const setCel = (id: string, key: string, val: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }));
  };

  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
      <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>{cols.map((c) => <th key={c.key} style={{ ...thStyle, minWidth: c.w }}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {visiveis.map((r) => {
            const id = String(r[idKey]);
            return (
              <tr key={id}>
                {cols.map((c) => {
                  const original = r[c.key] ?? '';
                  const editado = edits[id]?.[c.key];
                  const valor = editado !== undefined ? editado : String(original);
                  const dirty = editado !== undefined && difere(c, editado, original);
                  const tdBase: React.CSSProperties = { borderBottom: '1px solid #f1f5f9', padding: 0, background: dirty ? '#fef9c3' : undefined };
                  if (c.ro) {
                    return <td key={c.key} style={{ ...tdBase, padding: '4px 8px', color: '#64748b', fontSize: '.78rem', whiteSpace: 'nowrap' }}>{String(original)}</td>;
                  }
                  if (c.tipo === 'sn') {
                    return (
                      <td key={c.key} style={tdBase}>
                        <select value={valor.toUpperCase() === 'S' ? 'S' : 'N'} onChange={(e) => setCel(id, c.key, e.target.value)}
                          style={{ ...inputBase, cursor: 'pointer', fontWeight: dirty ? 700 : 400 }}>
                          <option value="N">N</option>
                          <option value="S">S</option>
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} style={tdBase}>
                      <input value={valor} onChange={(e) => setCel(id, c.key, e.target.value)}
                        style={{ ...inputBase, fontWeight: dirty ? 700 : 400 }}
                        onFocus={(e) => { e.target.style.border = '1px solid #94a3b8'; e.target.style.background = '#fff'; }}
                        onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {!visiveis.length && (
            <tr><td colSpan={cols.length} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Nenhum item.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- página ----------
export default function OmieMassaPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);

  const [aba, setAba] = useState<'servicos' | 'produtos'>('servicos');
  const [filtro, setFiltro] = useState('');
  // "aplicar à coluna": preenche um valor em todas as linhas visíveis da aba
  const [fillCol, setFillCol] = useState('');
  const [fillVal, setFillVal] = useState('');

  // serviços
  const [servRows, setServRows] = useState<Row[]>([]);
  const [servEdits, setServEdits] = useState<Record<string, Record<string, string>>>({});
  const [servLoading, setServLoading] = useState(false);

  // produtos
  const [prodRows, setProdRows] = useState<Row[]>([]);
  const [prodEdits, setProdEdits] = useState<Record<string, Record<string, string>>>({});
  const [prodLoading, setProdLoading] = useState(false);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [fFamilia, setFFamilia] = useState('');
  const [fOrdenar, setFOrdenar] = useState<'vendas' | 'estoque'>('vendas');
  const [fTop, setFTop] = useState(50);
  const mesPassado = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; }, []);
  const [fMes, setFMes] = useState(mesPassado.getMonth() + 1);
  const [fAno, setFAno] = useState(mesPassado.getFullYear());
  const [prodInfo, setProdInfo] = useState('');

  const [erro, setErro] = useState('');
  const [modal, setModal] = useState<null | { itens: Array<{ id: string; rotulo: string; difs: Array<{ campo: string; de: string; para: string }> }> }>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<null | { resultados: Resultado[]; inativoIgnorado?: number[] }>(null);

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` };
  }, []);

  // ---- carregar serviços ----
  const carregarServicos = useCallback(async () => {
    setServLoading(true); setErro(''); setServEdits({}); setResultado(null);
    try {
      const res = await fetch('/api/omie-massa/servicos', { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setServRows(json.servicos || []);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setServLoading(false);
  }, [authHeaders]);

  // ---- carregar produtos ----
  const carregarFamilias = useCallback(async () => {
    try {
      const res = await fetch('/api/omie-massa/produtos/familias', { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setFamilias(json.familias || []);
    } catch { /* seletor fica vazio */ }
  }, [authHeaders]);

  const buscarProdutos = useCallback(async () => {
    setProdLoading(true); setErro(''); setProdEdits({}); setResultado(null); setProdInfo('');
    try {
      const q = new URLSearchParams({ familia: fFamilia, ordenar: fOrdenar, top: String(fTop), mes: String(fMes), ano: String(fAno) });
      const res = await fetch(`/api/omie-massa/produtos?${q}`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setProdRows(json.produtos || []);
      setProdInfo(`${(json.produtos || []).length} de ${json.totalCandidatos} produtos (vendas ${json.mes}/${json.ano})`);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setProdLoading(false);
  }, [authHeaders, fFamilia, fOrdenar, fTop, fMes, fAno]);

  useEffect(() => {
    if (permLoading || !pode('ajustes', 'omie-massa')) return;
    carregarServicos();
    carregarFamilias();
  }, [permLoading]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- copiar Descrição → Descr. detalhada (só onde está vazia) ----
  // Apenas marca as células como editadas (amarelo); nada vai pro Omie sem
  // passar pelo "Revisar e aplicar".
  const copiarDescricaoParaDetalhada = useCallback(() => {
    setProdEdits((prev) => {
      const next = { ...prev };
      for (const r of prodRows) {
        const id = String(r.codigo_produto);
        const det = next[id]?.descr_detalhada !== undefined ? next[id].descr_detalhada : String(r.descr_detalhada ?? '');
        const desc = next[id]?.descricao !== undefined ? next[id].descricao : String(r.descricao ?? '');
        if (det.trim() === '' && desc.trim() !== '') {
          next[id] = { ...(next[id] || {}), descr_detalhada: desc };
        }
      }
      return next;
    });
  }, [prodRows]);

  // ---- diff pendente da aba ativa ----
  const cols = aba === 'servicos' ? COLS_SERV : COLS_PROD;
  const rows = aba === 'servicos' ? servRows : prodRows;
  const edits = aba === 'servicos' ? servEdits : prodEdits;
  const setEdits = aba === 'servicos' ? setServEdits : setProdEdits;
  const idKey = aba === 'servicos' ? 'nCodServ' : 'codigo_produto';

  // linhas que passam no filtro de texto (mesma regra do GridEditavel)
  const linhasVisiveis = useMemo(() => {
    if (!filtro.trim()) return rows;
    const f = filtro.trim().toLowerCase();
    return rows.filter((r) => cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(f)));
  }, [rows, filtro, cols]);

  // preenche fillVal na coluna fillCol de todas as linhas visíveis — só marca
  // as células (amarelo); nada grava sem passar pelo "Revisar e aplicar"
  const aplicarColuna = () => {
    if (!fillCol) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of linhasVisiveis) {
        const id = String(r[idKey]);
        next[id] = { ...(next[id] || {}), [fillCol]: fillVal };
      }
      return next;
    });
  };

  const pendencias = useMemo(() => {
    const itens: Array<{ id: string; rotulo: string; difs: Array<{ campo: string; de: string; para: string }>; alteracao: Row }> = [];
    for (const r of rows) {
      const id = String(r[idKey]);
      const ed = edits[id];
      if (!ed) continue;
      const difs: Array<{ campo: string; de: string; para: string }> = [];
      const alteracao: Row = { [idKey]: r[idKey] };
      for (const c of cols) {
        if (c.ro || ed[c.key] === undefined) continue;
        if (difere(c, ed[c.key], r[c.key] ?? '')) {
          difs.push({ campo: c.label, de: String(r[c.key] ?? ''), para: String(valorFinal(c, ed[c.key])) });
          alteracao[c.key] = valorFinal(c, ed[c.key]);
        }
      }
      if (difs.length) {
        const rotulo = aba === 'servicos' ? `${r.cCodigo} — ${r.cDescricao}` : `${r.codigo} — ${r.descricao}`;
        itens.push({ id, rotulo, difs, alteracao });
      }
    }
    return itens;
  }, [rows, edits, cols, idKey, aba]);

  // ---- aplicar ----
  const aplicar = async () => {
    setAplicando(true); setErro('');
    try {
      const url = aba === 'servicos' ? '/api/omie-massa/servicos' : '/api/omie-massa/produtos';
      const res = await fetch(url, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ alteracoes: pendencias.map((p) => p.alteracao) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResultado(json);
      setModal(null);
      setEdits({});
      if (aba === 'servicos') carregarServicos(); else buscarProdutos();
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setAplicando(false);
  };

  if (permLoading) return <div style={{ padding: 40, color: '#64748b' }}>Carregando…</div>;
  if (!pode('ajustes', 'omie-massa')) return <SemPermissao />;

  const loading = aba === 'servicos' ? servLoading : prodLoading;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Omie em Massa</h1>
          <p style={{ margin: '2px 0 0', fontSize: '.78rem', color: '#64748b' }}>
            Edite os cadastros direto na tabela (conta NOVA). Nada é gravado até você revisar e confirmar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['servicos', 'produtos'] as const).map((t) => (
            <button key={t} onClick={() => { setAba(t); setResultado(null); setFiltro(''); setFillCol(''); setFillVal(''); }}
              style={{ ...btn, ...(aba === t ? { background: '#0f172a', color: '#fff', border: '1px solid #0f172a' } : {}) }}>
              {t === 'servicos' ? `Serviços (${servRows.length})` : 'Produtos'}
            </button>
          ))}
        </div>
      </div>

      {/* filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {aba === 'produtos' && (
          <>
            <select value={fFamilia} onChange={(e) => setFFamilia(e.target.value)} style={{ ...btn, cursor: 'pointer' }}>
              <option value="">Todas as famílias</option>
              {familias.map((f) => <option key={f.nome} value={f.nome}>{f.nome} ({f.produtos})</option>)}
            </select>
            <select value={fOrdenar} onChange={(e) => setFOrdenar(e.target.value as 'vendas' | 'estoque')} style={{ ...btn, cursor: 'pointer' }}>
              <option value="vendas">Mais vendidos no mês</option>
              <option value="estoque">Mais estoque</option>
            </select>
            <label style={{ fontSize: '.78rem', color: '#475569' }}>
              Top{' '}
              <input type="number" min={1} max={300} value={fTop} onChange={(e) => setFTop(Number(e.target.value) || 50)}
                style={{ ...btn, width: 70, padding: '7px 8px' }} />
            </label>
            <label style={{ fontSize: '.78rem', color: '#475569' }}>
              Mês{' '}
              <input type="number" min={1} max={12} value={fMes} onChange={(e) => setFMes(Number(e.target.value) || 1)}
                style={{ ...btn, width: 58, padding: '7px 8px' }} />
            </label>
            <label style={{ fontSize: '.78rem', color: '#475569' }}>
              Ano{' '}
              <input type="number" min={2020} max={2100} value={fAno} onChange={(e) => setFAno(Number(e.target.value) || fAno)}
                style={{ ...btn, width: 78, padding: '7px 8px' }} />
            </label>
            <button onClick={buscarProdutos} disabled={prodLoading} style={btnPrim}>{prodLoading ? 'Buscando…' : 'Buscar'}</button>
            <button onClick={copiarDescricaoParaDetalhada} disabled={prodLoading || !prodRows.length} style={btn}
              title="Preenche a Descr. detalhada com a Descrição nos produtos listados onde ela está vazia — só marca as células; revise e aplique depois">
              Descrição → detalhada (vazios)
            </button>
            {prodInfo && <span style={{ fontSize: '.75rem', color: '#64748b' }}>{prodInfo}</span>}
          </>
        )}
        {aba === 'servicos' && (
          <button onClick={carregarServicos} disabled={servLoading} style={btn}>{servLoading ? 'Carregando…' : 'Recarregar'}</button>
        )}
        <input placeholder="Filtrar na tabela…" value={filtro} onChange={(e) => setFiltro(e.target.value)}
          style={{ ...btn, cursor: 'text', minWidth: 220, fontWeight: 400 }} />
        {/* aplicar valor em massa a uma coluna (linhas visíveis) */}
        {rows.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
            <select value={fillCol} onChange={(e) => setFillCol(e.target.value)} style={{ ...btn, cursor: 'pointer', padding: '6px 8px' }}>
              <option value="">Aplicar à coluna…</option>
              {cols.filter((c) => !c.ro).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <input placeholder="valor" value={fillVal} onChange={(e) => setFillVal(e.target.value)}
              style={{ ...btn, cursor: 'text', width: 110, fontWeight: 400, padding: '6px 8px' }} />
            <button onClick={aplicarColuna} disabled={!fillCol || !linhasVisiveis.length} style={{ ...btn, opacity: !fillCol ? 0.5 : 1 }}
              title="Preenche esta coluna em todas as linhas visíveis (só marca as células em amarelo; nada grava sem o Revisar e aplicar)">
              Preencher {linhasVisiveis.length} linha(s)
            </button>
          </span>
        )}
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>
          {erro}
        </div>
      )}

      {resultado && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem', color: '#166534' }}>
          <strong>Aplicado:</strong>{' '}
          {resultado.resultados.filter((r) => r.ok && r.campos.length).length} alterado(s),{' '}
          {resultado.resultados.filter((r) => !r.ok).length} falha(s).
          {resultado.resultados.filter((r) => !r.ok).map((r, i) => (
            <div key={i} style={{ color: '#b91c1c' }}>✗ {r.cCodigo || r.codigo || r.nCodServ || r.codigo_produto}: {r.erro}</div>
          ))}
          {!!resultado.inativoIgnorado?.length && (
            <div style={{ color: '#b45309', marginTop: 4 }}>
              ⚠ O Omie ignorou a mudança de &quot;inativo&quot; em {resultado.inativoIgnorado.length} serviço(s) — inativar serviço só pela tela do Omie.
            </div>
          )}
        </div>
      )}

      {loading && !rows.length
        ? <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: '.9rem' }}>Consultando o Omie… (pode levar alguns segundos)</div>
        : <GridEditavel cols={cols} rows={rows} idKey={idKey} edits={edits} setEdits={setEdits} filtro={filtro} />}

      {/* barra de pendências */}
      {pendencias.length > 0 && (
        <div style={{ position: 'sticky', bottom: 12, marginTop: 12, background: '#0f172a', color: '#fff', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, boxShadow: '0 8px 24px rgba(15,23,42,.35)' }}>
          <span style={{ fontSize: '.85rem' }}>
            <strong>{pendencias.reduce((n, p) => n + p.difs.length, 0)}</strong> campo(s) alterado(s) em <strong>{pendencias.length}</strong> item(ns)
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEdits({})} style={{ ...btn, background: 'transparent', color: '#cbd5e1', border: '1px solid #475569' }}>Descartar</button>
            <button onClick={() => setModal({ itens: pendencias })} style={{ ...btn, background: '#fff', color: '#0f172a' }}>Revisar e aplicar</button>
          </div>
        </div>
      )}

      {/* modal de revisão */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => !aplicando && setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 720, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: '.95rem', color: '#0f172a' }}>Revisar alterações ({aba === 'servicos' ? 'Serviços' : 'Produtos'})</strong>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 2 }}>Confira antes de gravar — a alteração vai direto para o Omie.</div>
            </div>
            <div style={{ overflow: 'auto', padding: '10px 18px', flex: 1 }}>
              {modal.itens.map((it) => (
                <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0f172a' }}>{it.rotulo}</div>
                  {it.difs.map((d, i) => (
                    <div key={i} style={{ fontSize: '.78rem', color: '#475569', paddingLeft: 10 }}>
                      {d.campo}: <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{d.de || '(vazio)'}</span>{' '}
                      → <span style={{ color: '#15803d', fontWeight: 600 }}>{d.para || '(vazio)'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} disabled={aplicando} style={btn}>Cancelar</button>
              <button onClick={aplicar} disabled={aplicando} style={btnDanger}>
                {aplicando ? 'Aplicando…' : `Aplicar ${modal.itens.length} item(ns) no Omie`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
