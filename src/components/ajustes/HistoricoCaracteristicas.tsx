'use client';
// Aba "Características" do Histórico de ajustes: lista as edições de características
// (audit_log, sistema='caracteristicas') para o gerente supervisionar quem alterou
// o quê (de→para) e reverter uma alteração (regrava o valor anterior na Omie).
import { useState, useCallback, useEffect, useMemo } from 'react';
import { useConta } from '@/components/estoque/ContaProvider';
import { authHeaders } from '@/lib/auth/client';

interface CaractLinha {
  id: number;
  criado_em?: string;
  criado_por?: string;
  acao?: string;
  empresa?: string;
  codigo_produto?: number | string | null;
  codigo?: string | null;
  descricao?: string | null;
  caracteristica?: string;
  de?: string;
  para?: string;
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.8rem' };

function fmtDataHora(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString('pt-BR');
}

const ACAO_LABEL: Record<string, string> = { editar: 'edição', 'editar-lote': 'edição (lote)', reverter: 'reversão' };

type SortCol = 'quando' | 'por' | 'conta' | 'produto' | 'caracteristica' | 'de' | 'para' | 'acao';
const COLS: { key: SortCol; label: string; get: (l: CaractLinha) => string | number }[] = [
  { key: 'quando', label: 'Quando', get: (l) => (l.criado_em ? new Date(l.criado_em).getTime() || 0 : 0) },
  { key: 'por', label: 'Por', get: (l) => l.criado_por || '' },
  { key: 'conta', label: 'Conta', get: (l) => l.empresa || '' },
  { key: 'produto', label: 'Produto', get: (l) => l.codigo || (l.codigo_produto != null ? '#' + l.codigo_produto : '') },
  { key: 'caracteristica', label: 'Característica', get: (l) => l.caracteristica || '' },
  { key: 'de', label: 'De', get: (l) => l.de || '' },
  { key: 'para', label: 'Para', get: (l) => l.para || '' },
  { key: 'acao', label: 'Tipo', get: (l) => ACAO_LABEL[l.acao || 'editar'] || l.acao || '' },
];

export default function HistoricoCaracteristicas() {
  const { conta, contaParam } = useConta();
  const [produto, setProduto] = useState('');
  const [linhas, setLinhas] = useState<CaractLinha[] | null>(null);
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
      const va = col.get(a), vb = col.get(b);
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * sortDir;
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
      const r = await fetch(`/api/ajustes/historico-caracteristicas?${qs.replace(/^&/, '')}`, { headers: { ...(await authHeaders()) } });
      const d = await r.json();
      if (d.erro) { setErro(d.erro); setLinhas([]); return; }
      setLinhas((d.linhas || []) as CaractLinha[]);
      setRevStatus({});
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [contaParam, produto]);

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  const reverter = useCallback(async (l: CaractLinha) => {
    if (!confirm(`Reverter esta alteração?\n\n"${l.caracteristica}" volta de "${l.para}" para "${l.de}" na Omie (${l.empresa}).`)) return;
    setRevertendo(l.id);
    try {
      const r = await fetch('/api/ajustes/caracteristicas/reverter', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ logId: l.id }),
      });
      const d = await r.json();
      if (d.ok) {
        setRevStatus((s) => ({ ...s, [l.id]: { ok: true, texto: `revertido para "${d.valor}"` } }));
        buscar();
      } else {
        setRevStatus((s) => ({ ...s, [l.id]: { ok: false, texto: d.erro || 'falhou' } }));
      }
    } catch (ex) {
      setRevStatus((s) => ({ ...s, [l.id]: { ok: false, texto: 'erro de rede: ' + (ex as Error).message } }));
    } finally {
      setRevertendo(null);
    }
  }, [buscar]);

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Código (SKU) do produto</label>
          <input value={produto} onChange={(e) => setProduto(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar()} placeholder="ex: RP-12345" style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', width: 170 }} />
        </div>
        <button onClick={buscar} disabled={carregando} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.6 : 1 }}>{carregando ? 'Buscando…' : 'Buscar'}</button>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {COLS.map((c) => (
                  <th key={c.key} onClick={() => ordenar(c.key)} title="Ordenar" style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }}>
                    {c.label} <span style={{ color: sortCol === c.key ? '#2563eb' : '#cbd5e1' }}>{seta(c.key)}</span>
                  </th>
                ))}
                <th style={{ ...thStyle, textAlign: 'right' }}>Ação</th>
              </tr>
            </thead>
            <tbody>
              {!linhasOrdenadas ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Carregando…</td></tr>
              ) : linhasOrdenadas.length === 0 ? (
                <tr><td colSpan={9} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhuma alteração de característica registrada.</td></tr>
              ) : (
                linhasOrdenadas.map((l) => {
                  const rs = revStatus[l.id];
                  const bg = l.acao === 'reverter' ? '#fffbeb' : undefined;
                  return (
                    <tr key={l.id} style={{ background: bg, borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ ...tdStyle, whiteSpace: 'nowrap' }}>{fmtDataHora(l.criado_em)}</td>
                      <td style={tdStyle}>{l.criado_por || ''}</td>
                      <td style={tdStyle}>{l.empresa || ''}</td>
                      <td style={tdStyle}>
                        <span style={{ fontFamily: 'monospace', fontSize: '.72rem' }}>{l.codigo || (l.codigo_produto != null ? '#' + l.codigo_produto : '')}</span>
                        {l.descricao && <div style={{ fontSize: '.7rem', color: '#64748b' }}>{l.descricao}</div>}
                      </td>
                      <td style={tdStyle}>{l.caracteristica}</td>
                      <td style={{ ...tdStyle, color: '#64748b' }}>{l.de || <span style={{ color: '#cbd5e1' }}>(vazio)</span>}</td>
                      <td style={{ ...tdStyle, fontWeight: 500 }}>{l.para || <span style={{ color: '#cbd5e1' }}>(vazio)</span>}</td>
                      <td style={tdStyle}>
                        <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: '.68rem', background: l.acao === 'reverter' ? '#fef3c7' : '#f1f5f9', color: l.acao === 'reverter' ? '#92400e' : '#475569' }}>{ACAO_LABEL[l.acao || 'editar'] || l.acao}</span>
                      </td>
                      <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <button onClick={() => reverter(l)} disabled={revertendo === l.id} title="Regrava o valor anterior na Omie" style={{ padding: '3px 8px', fontSize: '.72rem', background: '#fef3c7', color: '#92400e', border: 'none', borderRadius: 4, cursor: 'pointer' }}>
                          {revertendo === l.id ? 'revertendo…' : 'Reverter'}
                        </button>
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
    </>
  );
}
