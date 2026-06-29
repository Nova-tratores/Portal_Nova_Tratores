'use client';
// Giro de Estoque. Portado de GET /giro-estoque (server.js:9708) consumindo
// /api/estoque/giro-estoque.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

type Classe = 'excelente' | 'bom' | 'lento' | 'morto' | 'sem_giro' | 'fora_estoque';
interface GiroItem {
  codigo_produto: string; descricao: string; sku?: string; familia: string; estoque: number;
  valor_estoque: number; cogs_anual: number; qtd_vendida: number; faturamento: number;
  giro: number; dias_cobertura: number | null; classe: Classe; posicao?: number;
}
interface GiroResumo {
  total_skus: number; valor_estoque_total: number; giro_medio_ponderado: number;
  dias_cobertura_media: number | null; pct_saudaveis: number;
  por_classe: Record<Classe, { skus: number; valor: number }>;
}
interface GiroResp { itens: GiroItem[]; resumo: GiroResumo; total: number; erro?: string }

const CLASSE_LABEL: Record<Classe, string> = { excelente: 'Excelente', bom: 'Bom', lento: 'Lento', morto: 'Morto', sem_giro: 'Sem giro', fora_estoque: 'Fora de estoque' };
const CLASSE_COR: Record<Classe, string> = { excelente: '#16a34a', bom: '#65a30d', lento: '#d97706', morto: '#dc2626', sem_giro: '#991b1b', fora_estoque: '#6b7280' };

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };

export default function GiroEstoquePage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam } = useConta();

  const [periodo, setPeriodo] = useState(12);
  const [familia, setFamilia] = useState('');
  const [classeFiltro, setClasseFiltro] = useState<Classe | ''>('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [resp, setResp] = useState<GiroResp | null>(null);
  const [sortKey, setSortKey] = useState<keyof GiroItem>('valor_estoque');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const famParam = familia ? `&familia=${familia}` : '';
      const r = await fetch(`/api/estoque/giro-estoque?periodo=${periodo}${famParam}${contaParam}`);
      const d = (await r.json()) as GiroResp;
      if (d.erro) { setErro(d.erro); return; }
      setResp(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodo, familia, contaParam]);

  useEffect(() => { carregar(); }, [carregar]);

  const ordenar = (k: keyof GiroItem) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(-1); }
  };
  const itens = resp ? resp.itens.filter((it) => !classeFiltro || it.classe === classeFiltro) : [];
  const itensOrd = [...itens].sort((a, b) => {
    const va = a[sortKey], vb = b[sortKey];
    if (typeof va === 'number' && typeof vb === 'number') return ((va ?? 0) - (vb ?? 0)) * sortDir;
    return String(va).localeCompare(String(vb)) * sortDir;
  });

  // pontos do scatter (limita ao top por valor pra não sobrecarregar)
  const scatterData = itens
    .filter((it) => it.valor_estoque > 0)
    .map((it) => ({ x: Number(it.giro.toFixed(2)), y: it.valor_estoque, classe: it.classe, descricao: it.descricao }));

  const exportarCSV = useCallback(() => {
    if (!resp) return;
    const head = ['Pos', 'Classe', 'SKU', 'Descricao', 'Estoque', 'Valor estoque', 'COGS anual', 'Giro', 'Dias cobertura'];
    const linhas = itensOrd.map((it) => [it.posicao ?? '', it.classe, it.sku || it.codigo_produto, (it.descricao || '').replace(/;/g, ','), it.estoque, it.valor_estoque, it.cogs_anual, it.giro.toFixed(2), it.dias_cobertura != null ? Math.round(it.dias_cobertura) : ''].join(';'));
    const blob = new Blob(['﻿' + [head.join(';'), ...linhas].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `giro-estoque.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [resp, itensOrd]);

  if (!permLoading && userProfile && !pode('estoque', 'giro-estoque')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Giro de Estoque</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Giro = COGS anualizado ÷ valor em estoque</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
        {pode('estoque', 'dashboard') && (<Link href="/estoque/dashboard" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Dashboard</Link>)}
        {pode('estoque', 'curva-abc') && (<Link href="/estoque/curva-abc" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Curva ABC</Link>)}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Período" value={periodo} onChange={(v) => setPeriodo(parseInt(v))} options={[6, 12, 24].map((m) => ({ value: m, label: m + ' meses' }))} />
        <Sel label="Família" value={familia} onChange={setFamilia} options={[{ value: '', label: 'Todas' }, { value: 'pecas', label: 'Peças' }, { value: 'maquinas', label: 'Máquinas' }]} />
        <Sel label="Classe" value={classeFiltro} onChange={(v) => setClasseFiltro(v as Classe | '')} options={[{ value: '', label: 'Todas' }, ...(Object.keys(CLASSE_LABEL) as Classe[]).map((c) => ({ value: c, label: CLASSE_LABEL[c] }))]} />
        <button onClick={exportarCSV} style={{ padding: '9px 16px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {resp && !carregando && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Resumo titulo="SKUs" valor={String(resp.resumo.total_skus)} />
            <Resumo titulo="Valor em estoque" valor={fmtRS(resp.resumo.valor_estoque_total)} />
            <Resumo titulo="Giro médio" valor={resp.resumo.giro_medio_ponderado.toFixed(2) + 'x'} />
            <Resumo titulo="Cobertura média" valor={resp.resumo.dias_cobertura_media != null ? Math.round(resp.resumo.dias_cobertura_media) + ' dias' : '—'} />
            <Resumo titulo="% Saudáveis" valor={resp.resumo.pct_saudaveis.toFixed(0) + '%'} cor="#16a34a" />
          </div>

          {/* Chips por classe (clicáveis pra filtrar) */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
            {(Object.keys(CLASSE_LABEL) as Classe[]).map((c) => {
              const pc = resp.resumo.por_classe[c];
              return (
                <button key={c} onClick={() => setClasseFiltro(classeFiltro === c ? '' : c)}
                  style={{ padding: '6px 12px', border: '1px solid', borderColor: classeFiltro === c ? CLASSE_COR[c] : '#e0e0e0', background: classeFiltro === c ? CLASSE_COR[c] : '#fff', color: classeFiltro === c ? '#fff' : '#555', borderRadius: 20, fontSize: '.74rem', fontWeight: 600, cursor: 'pointer' }}>
                  <span style={{ color: classeFiltro === c ? '#fff' : CLASSE_COR[c] }}>●</span> {CLASSE_LABEL[c]}: {pc.skus} ({fmtRS(pc.valor)})
                </button>
              );
            })}
          </div>

          {/* Scatter giro × valor em estoque */}
          {scatterData.length > 0 && (
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 18, height: 340 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis type="number" dataKey="x" name="Giro" tick={{ fontSize: 10 }} label={{ value: 'Giro (x)', position: 'insideBottom', offset: -8, fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" name="Valor" tick={{ fontSize: 10 }} tickFormatter={(v) => 'R$ ' + (v / 1000).toFixed(0) + 'k'} />
                  <ZAxis range={[40, 40]} />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} formatter={(v: number, n: string) => (n === 'Valor' ? fmtRS(v) : v)} />
                  {(Object.keys(CLASSE_LABEL) as Classe[]).map((c) => (
                    <Scatter key={c} name={CLASSE_LABEL[c]} data={scatterData.filter((p) => p.classe === c)} fill={CLASSE_COR[c]} />
                  ))}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          )}

          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={thStyle}>#</th>
                <th style={thStyle}>Classe</th>
                <th style={thStyle} onClick={() => ordenar('sku')}>SKU</th>
                <th style={thStyle} onClick={() => ordenar('descricao')}>Descrição</th>
                <th style={thStyle} onClick={() => ordenar('estoque')}>Estoque</th>
                <th style={thStyle} onClick={() => ordenar('valor_estoque')}>Valor estoque</th>
                <th style={thStyle} onClick={() => ordenar('giro')}>Giro</th>
                <th style={thStyle} onClick={() => ordenar('dias_cobertura')}>Cobertura (dias)</th>
              </tr></thead>
              <tbody>
                {itensOrd.slice(0, 1000).map((it, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{it.posicao}</td>
                    <td style={{ ...tdStyle, color: CLASSE_COR[it.classe], fontWeight: 600 }}>{CLASSE_LABEL[it.classe]}</td>
                    <td style={tdStyle}>{it.sku || it.codigo_produto}</td>
                    <td style={tdStyle}>{it.descricao}</td>
                    <td style={tdStyle}>{it.estoque}</td>
                    <td style={tdStyle}>{fmtRS(it.valor_estoque)}</td>
                    <td style={tdStyle}>{it.giro.toFixed(2)}x</td>
                    <td style={tdStyle}>{it.dias_cobertura != null ? Math.round(it.dias_cobertura) : '—'}</td>
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

function Resumo({ titulo, valor, cor }: { titulo: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: '.66rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: cor || '#333' }}>{valor}</div>
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
