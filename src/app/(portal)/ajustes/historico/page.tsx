'use client';
// Histórico de correções de CMC. Portado de historico.ejs + historico.js (aba CMC).
// Consome /api/ajustes/historico e /api/ajustes/reverter-correcao.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

interface CorrecaoLinha {
  id: number;
  conta_omie?: string;
  codigo_produto?: number | null;
  codigo_integracao?: string | null;
  descricao_produto?: string;
  codigo_local_estoque?: number | string | null;
  local_nome?: string | null;
  cmc_anterior?: number | null;
  cmc_aplicado?: number | null;
  cmc_sugerido?: number | null;
  estrategia_sugestao?: string;
  origem?: string;
  codigo_ajuste_omie?: number | string | null;
  status?: 'aplicado' | 'erro' | 'revertido';
  erro?: string;
  obs?: string;
  criado_em?: string;
  criado_por?: string;
  nf_origem_numero?: string;
  fornecedor_nome?: string;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtDataHora(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}
const ORIGEM_LABEL: Record<string, string> = {
  estoque_negativo: 'estoque negativo',
  garantia: 'garantia',
  ajuste_custo: 'ajuste de custo',
  manual: 'manual',
  dashboard: 'garantia (legado)',
};

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.8rem' };

// Colunas ordenáveis do histórico (get = valor usado na ordenação).
type SortCol = 'quando' | 'conta' | 'origem' | 'produto' | 'local' | 'cmc_anterior' | 'cmc_aplicado' | 'cmc_sugerido' | 'nf' | 'estrategia' | 'ajuste' | 'status' | 'por';
const COLS: { key: SortCol; label: string; align?: 'right'; num?: boolean; get: (l: CorrecaoLinha) => string | number }[] = [
  { key: 'quando', label: 'Quando', num: true, get: (l) => (l.criado_em ? new Date(l.criado_em).getTime() || 0 : 0) },
  { key: 'conta', label: 'Conta', get: (l) => l.conta_omie || '' },
  { key: 'origem', label: 'Origem', get: (l) => ORIGEM_LABEL[l.origem || 'dashboard'] || l.origem || '' },
  { key: 'produto', label: 'Produto', get: (l) => l.codigo_integracao || (l.codigo_produto != null ? '#' + l.codigo_produto : '') },
  { key: 'local', label: 'Local', get: (l) => l.local_nome || (l.codigo_local_estoque != null ? '#' + l.codigo_local_estoque : '') },
  { key: 'cmc_anterior', label: 'CMC anterior', align: 'right', num: true, get: (l) => Number(l.cmc_anterior || 0) },
  { key: 'cmc_aplicado', label: 'CMC aplicado', align: 'right', num: true, get: (l) => Number(l.cmc_aplicado || 0) },
  { key: 'cmc_sugerido', label: 'CMC sugerido', align: 'right', num: true, get: (l) => Number(l.cmc_sugerido || 0) },
  { key: 'nf', label: 'NF origem', get: (l) => l.nf_origem_numero || '' },
  { key: 'estrategia', label: 'Estrategia', get: (l) => l.estrategia_sugestao || '' },
  { key: 'ajuste', label: 'Ajuste Omie', align: 'right', num: true, get: (l) => Number(l.codigo_ajuste_omie || 0) },
  { key: 'status', label: 'Status', get: (l) => l.status || '' },
  { key: 'por', label: 'Por', get: (l) => l.criado_por || '' },
];

export default function AjustesHistoricoPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [produto, setProduto] = useState('');
  const [origem, setOrigem] = useState('');
  const [linhas, setLinhas] = useState<CorrecaoLinha[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [revertendo, setRevertendo] = useState<number | null>(null);
  const [revStatus, setRevStatus] = useState<Record<number, { ok: boolean; texto: string }>>({});
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState(1);

  const linhasOrdenadas = useMemo(() => {
    if (!linhas || !sortCol) return linhas;
    const col = COLS.find((c) => c.key === sortCol);
    if (!col) return linhas;
    return linhas.slice().sort((a, b) => {
      if (col.num) return (Number(col.get(a)) - Number(col.get(b))) * sortDir;
      return String(col.get(a)).localeCompare(String(col.get(b)), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sortDir;
    });
  }, [linhas, sortCol, sortDir]);

  const ordenar = useCallback((col: SortCol) => {
    setSortDir((dir) => (sortCol === col ? -dir : 1));
    setSortCol(col);
  }, [sortCol]);
  const seta = (col: SortCol) => (sortCol !== col ? '⇅' : sortDir === 1 ? '▲' : '▼');

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      let qs = contaParam;
      if (produto.trim()) qs += '&produto=' + encodeURIComponent(produto.trim());
      if (origem) qs += '&origem=' + encodeURIComponent(origem);
      const r = await fetch(`/api/ajustes/historico?${qs.replace(/^&/, '')}`);
      const d = await r.json();
      if (d.erro) { setErro(d.erro); setLinhas([]); return; }
      setLinhas((d.linhas || []) as CorrecaoLinha[]);
      setRevStatus({});
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [contaParam, produto, origem]);

  // busca ao montar / trocar conta / trocar origem
  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, origem]);

  const reverter = useCallback(async (l: CorrecaoLinha) => {
    if (!confirm(`Reverter a correção #${l.id}? Isso EXCLUI o ajuste de estoque no Omie e o CMC volta ao valor anterior.`)) return;
    setRevertendo(l.id);
    try {
      const r = await fetch('/api/ajustes/reverter-correcao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correcaoId: l.id }) });
      const d = await r.json();
      if (d.ok) {
        setRevStatus((s) => ({ ...s, [l.id]: { ok: true, texto: 'revertido' + (d.ajusteId ? ' · ajuste #' + d.ajusteId : '') } }));
        setLinhas((prev) => (prev || []).map((x) => (x.id === l.id ? { ...x, status: 'revertido' } : x)));
      } else {
        setRevStatus((s) => ({ ...s, [l.id]: { ok: false, texto: d.erro || 'falhou' } }));
      }
    } catch (ex) {
      setRevStatus((s) => ({ ...s, [l.id]: { ok: false, texto: 'erro de rede: ' + (ex as Error).message } }));
    } finally {
      setRevertendo(null);
    }
  }, []);

  if (!permLoading && userProfile && !pode('ajustes', 'historico')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b' }}>Histórico de correções</h1>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Origem</label>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: 170, background: '#fff' }}>
              <option value="">Todas</option>
              <option value="estoque_negativo">{ORIGEM_LABEL.estoque_negativo}</option>
              <option value="garantia">{ORIGEM_LABEL.garantia}</option>
              <option value="ajuste_custo">{ORIGEM_LABEL.ajuste_custo}</option>
              <option value="manual">{ORIGEM_LABEL.manual}</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Codigo do produto</label>
            <input value={produto} onChange={(e) => setProduto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="ex: 1234567" style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: 150 }} />
          </div>
          <button onClick={buscar} disabled={carregando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.6 : 1 }}>{carregando ? 'Buscando…' : 'Buscar'}</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '0 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Dashboard</Link>
        <Link href="/ajustes/ajuste-custos" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Ajuste de custos</Link>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} onClick={() => ordenar(c.key)} title="Ordenar" style={{ ...thStyle, ...(c.align === 'right' ? { textAlign: 'right' } : {}), cursor: 'pointer', userSelect: 'none' }}>
                    {c.label} <span style={{ color: sortCol === c.key ? '#2563eb' : '#cbd5e1' }}>{seta(c.key)}</span>
                  </th>
                ))}
                <th style={{ ...thStyle, textAlign: 'right' }}>Acao</th>
              </tr>
            </thead>
            <tbody>
              {!linhasOrdenadas ? (
                <tr><td colSpan={14} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</td></tr>
              ) : linhasOrdenadas.length === 0 ? (
                <tr><td colSpan={14} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhuma correcao registrada.</td></tr>
              ) : (
                linhasOrdenadas.map((l) => {
                  const bg = l.status === 'erro' ? '#fef2f2' : (l.status === 'revertido' ? '#fffbeb' : undefined);
                  const origemLabel = ORIGEM_LABEL[l.origem || 'dashboard'] || l.origem || 'dashboard';
                  const rs = revStatus[l.id];
                  return (
                    <tr key={l.id} style={{ background: bg, borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDataHora(l.criado_em)}</td>
                      <td style={tdStyle}>{l.conta_omie}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: '.68rem', background: l.origem === 'estoque_negativo' ? '#fee2e2' : '#f1f5f9', color: l.origem === 'estoque_negativo' ? '#991b1b' : '#475569' }}>{origemLabel}</span>
                      </td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontSize: '.72rem' }}>{l.codigo_integracao || (l.codigo_produto != null ? '#' + l.codigo_produto : '')}</span>
                        {l.descricao_produto && <div style={{ fontSize: '.7rem', color: '#64748b' }}>{l.descricao_produto}</div>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '.72rem' }}>{l.local_nome || (l.codigo_local_estoque != null ? '#' + l.codigo_local_estoque : '')}</td>
                      <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(l.cmc_anterior)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, color: l.status === 'aplicado' ? '#047857' : undefined }}>{fmtBRL(l.cmc_aplicado)}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#64748b' }}>{fmtBRL(l.cmc_sugerido)}</td>
                      <td style={{ ...tdStyle, fontSize: '.72rem' }}>{l.nf_origem_numero || ''}{l.fornecedor_nome ? <div style={{ color: '#64748b' }}>{l.fornecedor_nome}</div> : null}</td>
                      <td style={{ ...tdStyle, fontSize: '.72rem' }}>{l.estrategia_sugestao || ''}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', fontFamily: 'monospace', fontSize: '.72rem' }}>{l.codigo_ajuste_omie != null ? l.codigo_ajuste_omie : '-'}</td>
                      <td style={tdStyle}>
                        {l.status === 'aplicado' ? <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: '.68rem', background: '#d1fae5', color: '#065f46' }}>aplicado</span>
                          : l.status === 'erro' ? <span title={l.erro || ''} style={{ padding: '1px 8px', borderRadius: 4, fontSize: '.68rem', background: '#fee2e2', color: '#991b1b' }}>erro</span>
                            : <span style={{ padding: '1px 8px', borderRadius: 4, fontSize: '.68rem', background: '#fef3c7', color: '#92400e' }}>{l.status}</span>}
                      </td>
                      <td style={{ ...tdStyle, fontSize: '.72rem' }}>{l.criado_por || ''}</td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        {l.status === 'aplicado' && (
                          <button onClick={() => reverter(l)} disabled={revertendo === l.id} title="Exclui o ajuste de estoque no Omie (volta o CMC ao valor anterior)" style={{ padding: '3px 8px', fontSize: '.72rem', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                            {revertendo === l.id ? 'revertendo...' : 'Reverter'}
                          </button>
                        )}
                        {rs && <div style={{ fontSize: '.68rem', marginTop: 2, color: rs.ok ? '#047857' : '#dc2626' }}>{rs.texto}</div>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
