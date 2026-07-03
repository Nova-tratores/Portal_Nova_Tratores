'use client';
// Movimentação de estoque de um produto (entradas/saídas no período), como o
// relatório do Omie: data, origem, cliente/fornecedor (cruzado das tabelas
// locais), NF, operação, entrada/saída, CMC. Consome
// /api/ajustes/movimentacao{,/buscar-produto}. Padrão visual de /ajustes/pedidos.
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos (espelham lib/ajustes/movimentacao.ts) ----------
interface ProdutoSugestao { codigoProduto: number; codigo: string; descricao: string; estoque: number | null }
interface Movimento {
  data: string | null; codOrigem: string; origem: string | null;
  clienteFornecedor: string | null; numDoc: string | null; operacao: string | null;
  qtdeEntrada: number | null; entradaCMC: number | null; qtdeSaida: number | null;
  cancelado: boolean; devolucao: boolean; qtdeAnterior: number | null; qtdeAtual: number | null;
}
interface Resumo {
  saldoAnterior: number | null; totalEntradas: number; totalSaidas: number;
  saldoFinal: number | null; movimentos: number; cancelados: number;
}
interface MovPayload {
  conta?: string; produto?: { codigoProduto: number; codigo: string | null; descricao: string | null };
  dataDeBR?: string; dataAteBR?: string; movimentos?: Movimento[]; resumo?: Resumo;
  duracaoMs?: number; fonte?: string; erro?: string;
}

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return brl.format(Number(n));
}
function fmtNum(n: number | null | undefined, dec = 0): string {
  if (n == null || isNaN(Number(n))) return '-';
  return Number(n).toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
function isoOffset(dias: number): string {
  const d = new Date(Date.now() - dias * 86400000);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 16px', minWidth: 130 };
const cardLabel: React.CSSProperties = { fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px', marginBottom: 2 };

export default function MovimentacaoProdutoPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  // autocomplete
  const [termo, setTermo] = useState('');
  const [digitou, setDigitou] = useState(false);
  const [sugestoes, setSugestoes] = useState<ProdutoSugestao[]>([]);
  const [mostrarDrop, setMostrarDrop] = useState(false);
  const [buscandoSug, setBuscandoSug] = useState(false);
  const [produtoSel, setProdutoSel] = useState<ProdutoSugestao | null>(null);

  // filtros e dados
  const [de, setDe] = useState(isoOffset(90));
  const [ate, setAte] = useState(isoOffset(0));
  const [mostrarCancelados, setMostrarCancelados] = useState(false);
  const [dados, setDados] = useState<MovPayload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const deepLinkFeito = useRef(false);

  // debounce da busca de sugestões
  useEffect(() => {
    if (!digitou || !conta) return;
    const t = termo.trim();
    if (t.length < 2) { setSugestoes([]); setMostrarDrop(false); return; }
    const timer = setTimeout(async () => {
      setBuscandoSug(true);
      try {
        const r = await fetch(`/api/ajustes/movimentacao/buscar-produto?${contaParam.replace(/^&/, '')}&termo=${encodeURIComponent(t)}`);
        const d = await r.json();
        setSugestoes(d.produtos || []);
        setMostrarDrop(true);
      } catch { /* silencioso */ } finally { setBuscandoSug(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [termo, digitou, conta, contaParam]);

  const buscar = useCallback(async (prod: ProdutoSugestao | null, force = false) => {
    if (!conta || !prod) return;
    setCarregando(true); setErro(''); setStatusMsg('buscando movimentos na Omie...');
    try {
      let qs = contaParam.replace(/^&/, '') + `&idProd=${prod.codigoProduto}`;
      if (de) qs += '&de=' + encodeURIComponent(de);
      if (ate) qs += '&ate=' + encodeURIComponent(ate);
      if (force) qs += '&force=1';
      const r = await fetch(`/api/ajustes/movimentacao?${qs}`);
      const d = (await r.json()) as MovPayload;
      if (d.erro) { setErro(d.erro); setStatusMsg(''); setDados(null); return; }
      setDados(d);
      const n = (d.movimentos || []).length;
      setStatusMsg(`${fmtNum(n)} movimento(s)${d.fonte === 'cache' ? ' (cache)' : ''}${d.duracaoMs ? ' · ' + (d.duracaoMs / 1000).toFixed(1) + 's' : ''}`);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message); setStatusMsg('');
    } finally { setCarregando(false); }
  }, [conta, contaParam, de, ate]);

  const selecionar = useCallback((p: ProdutoSugestao) => {
    setProdutoSel(p);
    setTermo(`${p.codigo} — ${p.descricao}`);
    setDigitou(false); setMostrarDrop(false);
    buscar(p);
  }, [buscar]);

  // deep-link ?codigo=SKU (seleciona automático no 1º match exato)
  useEffect(() => {
    if (deepLinkFeito.current || !conta) return;
    const codigo = new URLSearchParams(window.location.search).get('codigo');
    if (!codigo) { deepLinkFeito.current = true; return; }
    deepLinkFeito.current = true;
    (async () => {
      try {
        const r = await fetch(`/api/ajustes/movimentacao/buscar-produto?${contaParam.replace(/^&/, '')}&termo=${encodeURIComponent(codigo)}`);
        const d = await r.json();
        const lista: ProdutoSugestao[] = d.produtos || [];
        const exato = lista.find((p) => p.codigo.toLowerCase() === codigo.toLowerCase()) || lista[0];
        if (exato) selecionar(exato);
        else { setTermo(codigo); setDigitou(true); }
      } catch { /* silencioso */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  // troca de conta: zera produto e dados (o codigo_produto é por conta)
  useEffect(() => {
    setProdutoSel(null); setDados(null); setTermo(''); setSugestoes([]); setStatusMsg('');
  }, [conta]);

  const movsView = useMemo(() => {
    const movs = dados?.movimentos || [];
    return mostrarCancelados ? movs : movs.filter((m) => !m.cancelado);
  }, [dados, mostrarCancelados]);

  const exportarCSV = useCallback(() => {
    if (!dados || !produtoSel) return;
    const sep = ';';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas: string[] = [];
    linhas.push(['Data', 'Origem', 'Cliente/Fornecedor', 'NF', 'Operacao', 'Entrada', 'CMC entrada', 'Saida', 'Cancelado', 'Devolucao'].join(sep));
    for (const m of movsView) {
      linhas.push([
        esc(m.data), esc(m.origem), esc(m.clienteFornecedor), esc(m.numDoc), esc(m.operacao),
        m.qtdeEntrada != null ? String(m.qtdeEntrada).replace('.', ',') : '',
        m.entradaCMC != null ? String(m.entradaCMC).replace('.', ',') : '',
        m.qtdeSaida != null ? String(Math.abs(m.qtdeSaida)).replace('.', ',') : '',
        m.cancelado ? 'S' : 'N', m.devolucao ? 'S' : 'N',
      ].join(sep));
    }
    const r = dados.resumo;
    if (r) {
      linhas.push('');
      linhas.push(['Saldo anterior', String(r.saldoAnterior ?? '')].join(sep));
      linhas.push(['Total entradas', String(r.totalEntradas)].join(sep));
      linhas.push(['Total saidas', String(r.totalSaidas)].join(sep));
      linhas.push(['Saldo final', String(r.saldoFinal ?? '')].join(sep));
    }
    const blob = new Blob(['﻿' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `movimentacao-${produtoSel.codigo || produtoSel.codigoProduto}-${de}-a-${ate}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [dados, movsView, produtoSel, de, ate]);

  if (!permLoading && userProfile && !pode('ajustes', 'movimentacao-produto')) return <SemPermissao />;

  const resumo = dados?.resumo;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Movimentação de produto</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 760 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b>. Entradas e saídas de estoque de um produto no período
            (direto do Omie), com cliente/fornecedor cruzado das vendas, compras e remessas do portal.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <ContaSelector />
        </div>
      </div>

      {/* Busca do produto + período */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <div style={{ position: 'relative', flex: '1 1 340px', maxWidth: 560 }}>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Produto (código ou descrição)</label>
          <input
            value={termo}
            onChange={(e) => { setTermo(e.target.value); setDigitou(true); setProdutoSel(null); }}
            onFocus={() => { if (digitou && sugestoes.length > 0) setMostrarDrop(true); }}
            onBlur={() => setTimeout(() => setMostrarDrop(false), 150)}
            placeholder="Ex.: 2710801 ou FILTRO AR..."
            style={{ width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 10px', fontSize: '.85rem' }}
          />
          {mostrarDrop && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 30, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.12)', maxHeight: 320, overflowY: 'auto' }}>
              {buscandoSug ? (
                <div style={{ padding: 12, color: '#94a3b8', fontSize: '.78rem' }}>buscando…</div>
              ) : sugestoes.length === 0 ? (
                <div style={{ padding: 12, color: '#94a3b8', fontSize: '.78rem' }}>Nenhum produto encontrado.</div>
              ) : sugestoes.map((p) => (
                <div key={p.codigoProduto} onMouseDown={() => selecionar(p)}
                  style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '.8rem' }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#f8fafc'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = '#fff'; }}>
                  <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{p.codigo}</span>
                  <span style={{ margin: '0 6px', color: '#334155' }}>{p.descricao}</span>
                  {p.estoque != null && <span style={{ color: '#94a3b8', fontSize: '.72rem' }}>· est. {fmtNum(p.estoque)}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>De</label>
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Até</label>
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
        </div>
        <button onClick={() => buscar(produtoSel)} disabled={carregando || !conta || !produtoSel} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: carregando || !conta || !produtoSel ? 0.5 : 1 }}>Buscar</button>
        <button onClick={() => buscar(produtoSel, true)} disabled={carregando || !conta || !produtoSel} title="Refaz a busca ignorando o cache" style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: carregando || !conta || !produtoSel ? 0.5 : 1 }}>Atualizar</button>
        <button onClick={exportarCSV} disabled={!dados || movsView.length === 0} style={{ padding: '7px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: !dados || movsView.length === 0 ? 0.5 : 1 }}>CSV</button>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '.72rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarCancelados} onChange={(e) => setMostrarCancelados(e.target.checked)} />
          mostrar cancelados{resumo?.cancelados ? ` (${resumo.cancelados})` : ''}
        </label>
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{carregando ? 'Carregando…' : statusMsg}</span>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {/* Cards de resumo */}
      {dados && resumo && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={cardStyle}>
            <div style={cardLabel}>Saldo anterior</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155' }}>{fmtNum(resumo.saldoAnterior)}</div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabel}>Entradas</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#16a34a' }}>+{fmtNum(resumo.totalEntradas)}</div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabel}>Saídas</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#dc2626' }}>-{fmtNum(resumo.totalSaidas)}</div>
          </div>
          <div style={cardStyle}>
            <div style={cardLabel}>Saldo final</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155' }}>{fmtNum(resumo.saldoFinal)}</div>
          </div>
          <div style={{ ...cardStyle, minWidth: 220, flex: '1 1 auto' }}>
            <div style={cardLabel}>Produto · {dados.dataDeBR} a {dados.dataAteBR}</div>
            <div style={{ fontSize: '.82rem', color: '#334155' }}>
              <span style={{ fontFamily: 'monospace', color: '#2563eb' }}>{dados.produto?.codigo || dados.produto?.codigoProduto}</span>{' '}
              {dados.produto?.descricao || ''}
            </div>
          </div>
        </div>
      )}

      {!conta ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={thStyle}>Data</th>
                  <th style={thStyle}>Origem</th>
                  <th style={thStyle}>Cliente / Fornecedor</th>
                  <th style={thStyle}>NF</th>
                  <th style={thStyle}>Operação</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Entrada</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>Saída</th>
                  <th style={{ ...thStyle, textAlign: 'right' }}>CMC unit.</th>
                </tr>
              </thead>
              <tbody>
                {!dados ? (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Busque um produto (código ou descrição) para ver as entradas e saídas do período.</td></tr>
                ) : movsView.length === 0 ? (
                  <tr><td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Nenhum movimento no período.</td></tr>
                ) : (
                  movsView.map((m, i) => {
                    const riscado: React.CSSProperties = m.cancelado ? { textDecoration: 'line-through', color: '#94a3b8' } : {};
                    return (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: m.cancelado ? '#fafafa' : undefined }}>
                        <td style={{ ...tdStyle, fontSize: '.76rem', whiteSpace: 'nowrap', ...riscado }}>{m.data || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '.78rem', ...riscado }}>
                          {m.origem || m.codOrigem || '-'}
                          {m.devolucao && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: '.66rem', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>devolução</span>}
                          {m.cancelado && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: '.66rem', background: '#f1f5f9', color: '#64748b' }}>cancelado</span>}
                        </td>
                        <td style={{ ...tdStyle, fontSize: '.78rem', ...riscado }}>{m.clienteFornecedor || '—'}</td>
                        <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.74rem', ...riscado }}>{m.numDoc || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b', ...riscado }}>{m.operacao || '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: m.cancelado ? '#94a3b8' : '#16a34a', ...riscado }}>{m.qtdeEntrada ? '+' + fmtNum(Math.abs(m.qtdeEntrada)) : ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: m.cancelado ? '#94a3b8' : '#dc2626', ...riscado }}>{m.qtdeSaida ? '-' + fmtNum(Math.abs(m.qtdeSaida)) : ''}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.76rem', ...riscado }}>{m.entradaCMC ? fmtBRL(m.entradaCMC) : ''}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
