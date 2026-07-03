'use client';
// Movimentação de estoque de um produto (entradas/saídas no período), como o
// relatório do Omie: data, origem, cliente/fornecedor (cruzado das tabelas
// locais), NF, operação, entrada/saída, CMC. Consome
// /api/ajustes/movimentacao{,/buscar-produto}. Padrão visual de /ajustes/pedidos.
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos (espelham lib/ajustes/movimentacao.ts) ----------
interface ProdutoSugestao { codigoProduto: number; codigo: string; descricao: string; estoque: number | null }
interface Movimento {
  data: string | null; codOrigem: string; origem: string | null;
  clienteFornecedor: string | null; numDoc: string | null; idDoc: number | null; operacao: string | null;
  qtdeEntrada: number | null; entradaCMC: number | null; qtdeSaida: number | null;
  valorVendaUnit: number | null; valorVendaTotal: number | null;
  cancelado: boolean; devolucao: boolean;
  qtdeAnterior: number | null; qtdeAtual: number | null;
  cmcAnterior: number | null; cmcAtual: number | null;
}
interface Resumo {
  saldoAnterior: number | null; custoInicial: number | null; totalEntradas: number; totalSaidas: number;
  saldoFinal: number | null; custoFinal: number | null; movimentos: number; cancelados: number;
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
// Cabeçalho clicável (ordenação AZ/ZA), padrão das telas de pedidos/remessas.
const thSort: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none' };
const thSortR: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none', textAlign: 'right' };
// Linha fixa de saldo inicial/final (kardex)
const tdSaldoRow: React.CSSProperties = { ...tdStyle, background: '#eef2f7', color: '#1e293b', fontWeight: 600, fontSize: '.76rem' };

// Acessores de coluna para ordenação (números por subtração, strings por localeCompare).
const ACESSO: Record<string, (m: Movimento) => string | number> = {
  data: (m) => { const p = /(\d{2})\/(\d{2})\/(\d{4})/.exec(m.data || ''); return p ? new Date(+p[3], +p[2] - 1, +p[1]).getTime() : 0; },
  origem: (m) => m.origem || m.codOrigem || '',
  cliente: (m) => m.clienteFornecedor || '',
  nf: (m) => Number(m.numDoc) || m.numDoc || '',
  operacao: (m) => m.operacao || '',
  entrada: (m) => Math.abs(m.qtdeEntrada || 0),
  saida: (m) => Math.abs(m.qtdeSaida || 0),
  saldo: (m) => m.qtdeAtual ?? -1,
  cmc: (m) => m.entradaCMC || 0,
  vendaUnit: (m) => m.valorVendaUnit || 0,
  vendaTotal: (m) => m.valorVendaTotal || 0,
};

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

  // snapshot compartilhável (?s=<hash>)
  interface SnapInfo { criadoPor: string | null; criadoEm: string; expiraEm: string }
  const [snapInfo, setSnapInfo] = useState<SnapInfo | null>(null);
  const [compartilhando, setCompartilhando] = useState(false);
  const [compartilhaMsg, setCompartilhaMsg] = useState('');

  const limparSnapshotDaURL = useCallback(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.has('s')) {
      u.searchParams.delete('s');
      window.history.replaceState(null, '', u.toString());
    }
  }, []);

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
    setSnapInfo(null); limparSnapshotDaURL(); // consulta ao vivo sai do modo snapshot
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
  }, [conta, contaParam, de, ate, limparSnapshotDaURL]);

  const selecionar = useCallback((p: ProdutoSugestao) => {
    setProdutoSel(p);
    setTermo(`${p.codigo} — ${p.descricao}`);
    setDigitou(false); setMostrarDrop(false);
    buscar(p);
  }, [buscar]);

  // deep-link ?codigo=SKU (seleciona automático no 1º match exato)
  useEffect(() => {
    if (deepLinkFeito.current || !conta) return;
    if (new URLSearchParams(window.location.search).get('s')) { deepLinkFeito.current = true; return; } // snapshot tem prioridade
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

  // modo snapshot: ?s=<hash> carrega o retrato congelado (1 leitura, sem Omie).
  // Declarado DEPOIS do reset por conta para prevalecer no mesmo ciclo.
  const snapCarregado = useRef(false);
  useEffect(() => {
    if (snapCarregado.current || !conta) return;
    const hash = new URLSearchParams(window.location.search).get('s');
    if (!hash) { snapCarregado.current = true; return; }
    snapCarregado.current = true;
    (async () => {
      setCarregando(true); setErro(''); setStatusMsg('abrindo snapshot compartilhado...');
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const r = await fetch(`/api/ajustes/movimentacao/snapshot?hash=${encodeURIComponent(hash)}`, {
          headers: { Authorization: `Bearer ${session?.access_token ?? ''}` },
        });
        const d = await r.json();
        if (!r.ok || d.erro) { setErro(d.erro || 'não foi possível abrir o snapshot'); setStatusMsg(''); return; }
        const payload = d.payload as MovPayload;
        setDados(payload);
        const prod = payload.produto;
        if (prod) {
          setProdutoSel({ codigoProduto: prod.codigoProduto, codigo: prod.codigo || '', descricao: prod.descricao || '', estoque: null });
          setTermo(`${prod.codigo || prod.codigoProduto} — ${prod.descricao || ''}`);
          setDigitou(false);
        }
        setSnapInfo({ criadoPor: d.criadoPor, criadoEm: d.criadoEm, expiraEm: d.expiraEm });
        setStatusMsg(`${fmtNum((payload.movimentos || []).length)} movimento(s) · snapshot`);
      } catch (ex) {
        setErro('erro ao abrir snapshot: ' + (ex as Error).message); setStatusMsg('');
      } finally { setCarregando(false); }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  // botão Compartilhar: gera o snapshot e copia o link (vale 30 dias)
  const compartilhar = useCallback(async () => {
    if (!conta || !produtoSel || !dados) return;
    // já está num snapshot? só copia o link atual
    const sAtual = new URLSearchParams(window.location.search).get('s');
    if (snapInfo && sAtual) {
      await navigator.clipboard.writeText(window.location.href).catch(() => {});
      setCompartilhaMsg('link copiado!');
      setTimeout(() => setCompartilhaMsg(''), 4000);
      return;
    }
    setCompartilhando(true); setCompartilhaMsg('gerando link...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/ajustes/movimentacao/snapshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({ conta, idProd: produtoSel.codigoProduto, de, ate }),
      });
      const d = await r.json();
      if (!r.ok || d.erro) { setCompartilhaMsg('falhou: ' + (d.erro || r.status)); return; }
      const url = `${window.location.origin}/ajustes/movimentacao-produto?s=${d.hash}`;
      let copiou = true;
      try { await navigator.clipboard.writeText(url); } catch { copiou = false; }
      setCompartilhaMsg(copiou ? 'link copiado! (vale 30 dias)' : url);
      setTimeout(() => setCompartilhaMsg(''), 8000);
    } catch (ex) {
      setCompartilhaMsg('erro: ' + (ex as Error).message);
    } finally { setCompartilhando(false); }
  }, [conta, produtoSel, dados, de, ate, snapInfo]);

  // ordenação AZ/ZA (linhas de saldo inicial/final ficam fixas fora da ordenação)
  const [ordem, setOrdem] = useState<{ col: string; dir: 'asc' | 'desc' } | null>(null);
  const toggleOrdem = useCallback((col: string) => {
    setOrdem((o) => (o && o.col === col ? (o.dir === 'asc' ? { col, dir: 'desc' } : null) : { col, dir: 'asc' }));
  }, []);
  const setaCol = (col: string) => (ordem?.col === col ? (ordem.dir === 'asc' ? ' ▲' : ' ▼') : '');

  const movsView = useMemo(() => {
    const movs = dados?.movimentos || [];
    let arr = mostrarCancelados ? movs.slice() : movs.filter((m) => !m.cancelado);
    if (ordem) {
      const acc = ACESSO[ordem.col];
      if (acc) {
        arr = arr.slice().sort((a, b) => {
          const va = acc(a), vb = acc(b);
          const c = (typeof va === 'number' && typeof vb === 'number') ? va - vb : String(va).localeCompare(String(vb), 'pt-BR');
          return ordem.dir === 'asc' ? c : -c;
        });
      }
    }
    return arr;
  }, [dados, mostrarCancelados, ordem]);

  // DANFE: clica no nº da NF -> abre o PDF (idDoc direto; fallback por número)
  const [danfeBuscando, setDanfeBuscando] = useState<string | null>(null);
  const verDanfe = useCallback(async (m: Movimento) => {
    if (!conta || (!m.idDoc && !m.numDoc)) return;
    const chaveMov = `${m.idDoc}|${m.numDoc}`;
    setDanfeBuscando(chaveMov);
    try {
      const tipo = ['COM', 'NFC', 'RRE', 'RDE', 'RDV'].includes(m.codOrigem) ? 'E' : 'S';
      let qs = contaParam.replace(/^&/, '');
      if (m.idDoc) qs += `&nCodNF=${m.idDoc}`;
      if (m.numDoc) qs += `&numero=${encodeURIComponent(m.numDoc)}`;
      qs += `&tipo=${tipo}`;
      const r = await fetch(`/api/ajustes/movimentacao/danfe?${qs}`);
      const d = await r.json();
      if (d.url) window.open(d.url, '_blank');
      else alert('DANFE indisponível: ' + (d.erro || 'sem URL'));
    } catch (ex) {
      alert('Erro ao buscar DANFE: ' + (ex as Error).message);
    } finally { setDanfeBuscando(null); }
  }, [conta, contaParam]);

  const abrirPDF = useCallback(() => {
    if (!conta || !produtoSel) return;
    let qs = contaParam.replace(/^&/, '') + `&idProd=${produtoSel.codigoProduto}`;
    if (de) qs += '&de=' + encodeURIComponent(de);
    if (ate) qs += '&ate=' + encodeURIComponent(ate);
    if (mostrarCancelados) qs += '&cancelados=1';
    window.open(`/api/ajustes/movimentacao/pdf?${qs}`, '_blank');
  }, [conta, contaParam, produtoSel, de, ate, mostrarCancelados]);

  const exportarCSV = useCallback(() => {
    if (!dados || !produtoSel) return;
    const sep = ';';
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas: string[] = [];
    const num = (v: number | null | undefined) => (v != null ? String(v).replace('.', ',') : '');
    linhas.push(['Data', 'Origem', 'Cliente/Fornecedor', 'NF', 'Operacao', 'Entrada', 'Saida', 'Saldo', 'CMC entrada', 'Vlr venda unit', 'Vlr venda total', 'Cancelado', 'Devolucao'].join(sep));
    for (const m of movsView) {
      linhas.push([
        esc(m.data), esc(m.origem), esc(m.clienteFornecedor), esc(m.numDoc), esc(m.operacao),
        num(m.qtdeEntrada), num(m.qtdeSaida != null ? Math.abs(m.qtdeSaida) : null),
        m.cancelado ? '' : num(m.qtdeAtual),
        num(m.entradaCMC), num(m.valorVendaUnit), num(m.valorVendaTotal),
        m.cancelado ? 'S' : 'N', m.devolucao ? 'S' : 'N',
      ].join(sep));
    }
    const r = dados.resumo;
    if (r) {
      linhas.push('');
      linhas.push(['Saldo inicial', String(r.saldoAnterior ?? ''), 'Custo inicial', num(r.custoInicial)].join(sep));
      linhas.push(['Total entradas', String(r.totalEntradas)].join(sep));
      linhas.push(['Total saidas', String(r.totalSaidas)].join(sep));
      linhas.push(['Saldo final', String(r.saldoFinal ?? ''), 'Custo final', num(r.custoFinal)].join(sep));
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
        <button onClick={abrirPDF} disabled={!dados || !produtoSel || !!snapInfo} title={snapInfo ? 'PDF gera dados ao vivo — clique em "Atualizar ao vivo" primeiro' : 'Abre o relatório em PDF para impressão'} style={{ padding: '7px 12px', background: '#f1f5f9', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: !dados || !produtoSel || !!snapInfo ? 0.5 : 1 }}>PDF</button>
        <button onClick={compartilhar} disabled={!dados || !produtoSel || compartilhando} title="Gera um link do retrato desta consulta para mandar a outro usuário do portal (vale 30 dias)" style={{ padding: '7px 12px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: compartilhando ? 'wait' : 'pointer', opacity: !dados || !produtoSel || compartilhando ? 0.5 : 1 }}>Compartilhar</button>
        {compartilhaMsg && <span style={{ fontSize: '.72rem', color: '#0f766e', alignSelf: 'center' }}>{compartilhaMsg}</span>}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: '.72rem' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#475569', cursor: 'pointer' }}>
          <input type="checkbox" checked={mostrarCancelados} onChange={(e) => setMostrarCancelados(e.target.checked)} />
          mostrar cancelados{resumo?.cancelados ? ` (${resumo.cancelados})` : ''}
        </label>
        <span style={{ marginLeft: 'auto', color: '#64748b' }}>{carregando ? 'Carregando…' : statusMsg}</span>
      </div>

      {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

      {/* Banner de snapshot compartilhado */}
      {snapInfo && dados && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.78rem' }}>
          <span>
            📌 <b>Snapshot compartilhado</b>
            {snapInfo.criadoPor ? <> por <b>{snapInfo.criadoPor}</b></> : null}
            {snapInfo.criadoEm ? <> em {new Date(snapInfo.criadoEm).toLocaleString('pt-BR')}</> : null}
            {' '}· retrato congelado (não consulta o Omie) · válido até {snapInfo.expiraEm ? new Date(snapInfo.expiraEm).toLocaleDateString('pt-BR') : '?'}
          </span>
          <button onClick={() => buscar(produtoSel, true)} disabled={carregando} style={{ marginLeft: 'auto', padding: '5px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.76rem', cursor: 'pointer' }}>Atualizar ao vivo</button>
        </div>
      )}

      {/* Cards de resumo */}
      {dados && resumo && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
          <div style={cardStyle}>
            <div style={cardLabel}>Saldo anterior</div>
            <div style={{ fontSize: '1.1rem', fontWeight: 700, color: '#334155' }}>{fmtNum(resumo.saldoAnterior)}</div>
            {resumo.custoInicial != null && <div style={{ fontSize: '.7rem', color: '#64748b' }}>custo {fmtBRL(resumo.custoInicial)}</div>}
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
            {resumo.custoFinal != null && <div style={{ fontSize: '.7rem', color: '#64748b' }}>custo {fmtBRL(resumo.custoFinal)}</div>}
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
                  <th style={thSort} onClick={() => toggleOrdem('data')}>Data{setaCol('data')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('origem')}>Origem{setaCol('origem')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('cliente')}>Cliente / Fornecedor{setaCol('cliente')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('nf')}>NF{setaCol('nf')}</th>
                  <th style={thSort} onClick={() => toggleOrdem('operacao')}>Operação{setaCol('operacao')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('entrada')}>Entrada{setaCol('entrada')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('saida')}>Saída{setaCol('saida')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('saldo')}>Saldo{setaCol('saldo')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('cmc')}>CMC unit.{setaCol('cmc')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('vendaUnit')}>Vlr venda un.{setaCol('vendaUnit')}</th>
                  <th style={thSortR} onClick={() => toggleOrdem('vendaTotal')}>Vlr venda tot.{setaCol('vendaTotal')}</th>
                </tr>
              </thead>
              <tbody>
                {!dados ? (
                  <tr><td colSpan={11} style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Busque um produto (código ou descrição) para ver as entradas e saídas do período.</td></tr>
                ) : (
                  <>
                    {/* Linha fixa: saldo/custo inicial do período (kardex) */}
                    {resumo && (
                      <tr>
                        <td style={tdSaldoRow} colSpan={7}>SALDO INICIAL em {dados.dataDeBR}</td>
                        <td style={{ ...tdSaldoRow, textAlign: 'right' }}>{fmtNum(resumo.saldoAnterior)}</td>
                        <td style={{ ...tdSaldoRow, textAlign: 'right' }}>{resumo.custoInicial != null ? fmtBRL(resumo.custoInicial) : '—'}</td>
                        <td style={tdSaldoRow} colSpan={2}></td>
                      </tr>
                    )}
                    {movsView.length === 0 ? (
                      <tr><td colSpan={11} style={{ padding: 30, textAlign: 'center', color: '#94a3b8' }}>Nenhum movimento no período.</td></tr>
                    ) : (
                      movsView.map((m, i) => {
                        const riscado: React.CSSProperties = m.cancelado ? { textDecoration: 'line-through', color: '#94a3b8' } : {};
                        const temNF = !!(m.idDoc || m.numDoc);
                        const buscandoEsta = danfeBuscando === `${m.idDoc}|${m.numDoc}`;
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9', background: m.cancelado ? '#fafafa' : undefined }}>
                            <td style={{ ...tdStyle, fontSize: '.76rem', whiteSpace: 'nowrap', ...riscado }}>{m.data || '-'}</td>
                            <td style={{ ...tdStyle, fontSize: '.78rem', ...riscado }}>
                              {m.origem || m.codOrigem || '-'}
                              {m.devolucao && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: '.66rem', background: '#fff7ed', color: '#c2410c', border: '1px solid #fed7aa' }}>devolução</span>}
                              {m.cancelado && <span style={{ marginLeft: 6, padding: '1px 6px', borderRadius: 4, fontSize: '.66rem', background: '#f1f5f9', color: '#64748b' }}>cancelado</span>}
                            </td>
                            <td style={{ ...tdStyle, fontSize: '.78rem', ...riscado }}>{m.clienteFornecedor || '—'}</td>
                            <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.74rem', ...riscado }}>
                              {m.numDoc ? (
                                temNF ? (
                                  <button onClick={() => verDanfe(m)} disabled={!!danfeBuscando} title="Abrir DANFE (PDF) para impressão"
                                    style={{ background: 'none', border: 'none', padding: 0, fontFamily: 'monospace', fontSize: '.74rem', color: m.cancelado ? '#94a3b8' : '#2563eb', textDecoration: 'underline', cursor: danfeBuscando ? 'wait' : 'pointer' }}>
                                    {buscandoEsta ? 'abrindo…' : m.numDoc}
                                  </button>
                                ) : m.numDoc
                              ) : '-'}
                            </td>
                            <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b', ...riscado }}>{m.operacao || '-'}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: m.cancelado ? '#94a3b8' : '#16a34a', ...riscado }}>{m.qtdeEntrada ? '+' + fmtNum(Math.abs(m.qtdeEntrada)) : ''}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: m.cancelado ? '#94a3b8' : '#dc2626', ...riscado }}>{m.qtdeSaida ? '-' + fmtNum(Math.abs(m.qtdeSaida)) : ''}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, ...riscado }}>{m.cancelado ? '' : fmtNum(m.qtdeAtual)}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.76rem', ...riscado }}>{m.entradaCMC ? fmtBRL(m.entradaCMC) : ''}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.76rem', ...riscado }}>{m.valorVendaUnit ? fmtBRL(m.valorVendaUnit) : ''}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.76rem', fontWeight: 600, ...riscado }}>{m.valorVendaTotal ? fmtBRL(m.valorVendaTotal) : ''}</td>
                          </tr>
                        );
                      })
                    )}
                    {/* Linha fixa: saldo/custo final do período (kardex) */}
                    {resumo && (
                      <tr>
                        <td style={tdSaldoRow} colSpan={7}>SALDO FINAL em {dados.dataAteBR}</td>
                        <td style={{ ...tdSaldoRow, textAlign: 'right' }}>{fmtNum(resumo.saldoFinal)}</td>
                        <td style={{ ...tdSaldoRow, textAlign: 'right' }}>{resumo.custoFinal != null ? fmtBRL(resumo.custoFinal) : '—'}</td>
                        <td style={tdSaldoRow} colSpan={2}></td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
