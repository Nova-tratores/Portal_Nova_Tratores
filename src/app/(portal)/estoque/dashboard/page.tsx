'use client';
// Dashboard de Vendas. Portado de GET /dashboard (server.js:4932) consumindo
// /api/estoque/dashboard{,/historico,/categorias-vendas,/vendas,/pedido-itens,/compras}.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
type Metrica = 'venda' | 'custo' | 'margem';

interface Categoria {
  nome: string;
  valorAtual: number;
  custoAtual: number;
  margemAtual: number;
  mesAnteriorValor: number;
  mesAnteriorCusto: number;
  anoAnteriorValor: number;
  anoAnteriorCusto: number;
  varMesAnterior: number;
  varAnoAnterior: number;
  valorProjetado: number | null;
  cardType: string;
}
interface DashboardResp {
  periodo: string;
  mes: number;
  ano: number;
  categorias: Categoria[];
  ehMesCorrente: boolean;
  proporcao: number | null;
  diasUteisTranscorridos: number | null;
  diasUteisTotal: number | null;
  erro?: string;
}
interface HistMes { label: string; mes: number; ano: number; valor: number; custo: number; qtdePedidos: number }
interface HistResp { card: number; nome: string; meses: HistMes[]; erro?: string }
interface VendaRow {
  numero_pedido?: string; data_pedido?: string; descricao?: string; codigo_produto?: string;
  quantidade?: number; valor_unitario?: number; valor_total?: number; cmc_unitario?: number;
}

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };

function fmtPct(v: number): string {
  const s = v >= 0 ? '+' : '';
  return s + v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}

// Valor da métrica escolhida para um card (atual/mês ant./ano ant.)
function valorMetrica(c: Categoria, m: Metrica, quando: 'atual' | 'mesAnt' | 'anoAnt'): number {
  if (quando === 'atual') return m === 'venda' ? c.valorAtual : m === 'custo' ? c.custoAtual : c.margemAtual;
  if (quando === 'mesAnt') return m === 'venda' ? c.mesAnteriorValor : m === 'custo' ? c.mesAnteriorCusto : c.mesAnteriorValor - c.mesAnteriorCusto;
  return m === 'venda' ? c.anoAnteriorValor : m === 'custo' ? c.anoAnteriorCusto : c.anoAnteriorValor - c.anoAnteriorCusto;
}
function calcVar(a: number, b: number): number {
  return b > 0 ? ((a - b) / b) * 100 : a > 0 ? 100 : 0;
}

export default function DashboardPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam } = useConta();

  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [categoria, setCategoria] = useState('');
  const [metrica, setMetrica] = useState<Metrica>('venda');

  const [dados, setDados] = useState<DashboardResp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [categoriasOpts, setCategoriasOpts] = useState<Array<{ codigo: string; descricao: string }>>([]);

  // Histórico (drill-down de card)
  const [histCard, setHistCard] = useState<number | null>(null);
  const [hist, setHist] = useState<HistResp | null>(null);

  // Vendas (tabela)
  const [vendas, setVendas] = useState<VendaRow[] | null>(null);
  const [vendasCard, setVendasCard] = useState<{ idx: number; nome: string } | null>(null);
  const [pedidoItens, setPedidoItens] = useState<{ numero: string; itens: VendaRow[] } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setHistCard(null);
    setHist(null);
    setVendas(null);
    setVendasCard(null);
    try {
      const catParam = categoria ? `&categoria=${encodeURIComponent(categoria)}` : '';
      const r = await fetch(`/api/estoque/dashboard?mes=${mes}&ano=${ano}${catParam}${contaParam}`);
      const d = (await r.json()) as DashboardResp;
      if (d.erro) { setErro(d.erro); return; }
      setDados(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, ano, categoria, contaParam]);

  // Carrega opções de categoria ao montar / trocar conta
  useEffect(() => {
    fetch(`/api/estoque/dashboard/categorias-vendas?_=1${contaParam}`)
      .then((r) => r.json())
      .then((d) => setCategoriasOpts(d.categorias || []))
      .catch(() => setCategoriasOpts([]));
  }, [contaParam]);

  // Carrega dashboard ao montar / quando filtros mudam
  useEffect(() => { carregar(); }, [carregar]);

  const abrirHistorico = useCallback(async (cardIdx: number) => {
    setHistCard(cardIdx);
    setHist(null);
    const catParam = categoria ? `&categoria=${encodeURIComponent(categoria)}` : '';
    const r = await fetch(`/api/estoque/dashboard/historico?card=${cardIdx}${catParam}${contaParam}`);
    const d = (await r.json()) as HistResp;
    if (!d.erro) setHist(d);
  }, [categoria, contaParam]);

  const abrirVendas = useCallback(async (cardIdx: number, nome: string) => {
    setVendas(null);
    setVendasCard({ idx: cardIdx, nome });
    const catParam = categoria ? `&categoria=${encodeURIComponent(categoria)}` : '';
    const r = await fetch(`/api/estoque/dashboard/vendas?mes=${mes}&ano=${ano}&card=${cardIdx}${catParam}${contaParam}`);
    const d = await r.json();
    if (!d.erro) setVendas(d.vendas || []);
  }, [mes, ano, categoria, contaParam]);

  const abrirPedido = useCallback(async (numero: string) => {
    setPedidoItens({ numero, itens: [] });
    const r = await fetch(`/api/estoque/dashboard/pedido-itens?numero_pedido=${encodeURIComponent(numero)}&mes=${mes}&ano=${ano}${contaParam}`);
    const d = await r.json();
    setPedidoItens({ numero, itens: d.itens || [] });
  }, [mes, ano, contaParam]);

  const exportarCSV = useCallback(() => {
    if (!vendas) return;
    const head = ['Pedido', 'Data', 'Codigo', 'Descricao', 'Qtd', 'Valor Unit', 'Valor Total', 'CMC'];
    const linhas = vendas.map((v) => [
      v.numero_pedido || '', v.data_pedido || '', v.codigo_produto || '', (v.descricao || '').replace(/;/g, ','),
      v.quantidade ?? '', v.valor_unitario ?? '', v.valor_total ?? '', v.cmc_unitario ?? '',
    ].join(';'));
    const csv = [head.join(';'), ...linhas].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vendas_${mes}_${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vendas, mes, ano]);

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  const anos: number[] = [];
  for (let y = now.getFullYear(); y >= 2023; y--) anos.push(y);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Dashboard de Vendas</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Vendas por categoria, comparativo e histórico</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
        <Link href="/estoque/curva-abc" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Curva ABC</Link>
        <Link href="/estoque/giro-estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Giro de Estoque</Link>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Mês" value={mes} onChange={(v) => setMes(parseInt(v))} options={MESES.map((m, i) => ({ value: i + 1, label: m }))} />
        <Sel label="Ano" value={ano} onChange={(v) => setAno(parseInt(v))} options={anos.map((y) => ({ value: y, label: String(y) }))} />
        <Sel label="Categoria" value={categoria} onChange={setCategoria} options={[{ value: '', label: 'Todas' }, ...categoriasOpts.map((c) => ({ value: c.codigo, label: c.descricao }))]} />
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['venda', 'custo', 'margem'] as Metrica[]).map((m) => (
            <button key={m} onClick={() => setMetrica(m)}
              style={{ padding: '8px 14px', border: '1px solid', borderColor: metrica === m ? '#dc2626' : '#e0e0e0', background: metrica === m ? '#dc2626' : '#fff', color: metrica === m ? '#fff' : '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {dados && (
        <>
          {dados.ehMesCorrente && dados.proporcao != null && (
            <div style={{ fontSize: '.75rem', color: '#999', marginBottom: 10 }}>
              Mês corrente — {dados.diasUteisTranscorridos}/{dados.diasUteisTotal} dias úteis ({Math.round((dados.proporcao || 0) * 100)}%). Comparativos ajustados proporcionalmente; projeção exibida.
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, marginBottom: 18 }}>
            {dados.categorias.map((c, idx) => {
              const atual = valorMetrica(c, metrica, 'atual');
              const mAnt = valorMetrica(c, metrica, 'mesAnt');
              const aAnt = valorMetrica(c, metrica, 'anoAnt');
              const varM = calcVar(atual, mAnt);
              const varA = calcVar(atual, aAnt);
              const proj = metrica === 'venda' ? c.valorProjetado : null;
              return (
                <div key={idx} style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                  <div style={{ fontSize: '.72rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 6 }}>{c.nome}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#dc2626' }}>{fmtRS(atual)}</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: '.7rem' }}>
                    <span style={{ color: varM >= 0 ? '#16a34a' : '#dc2626' }}>Mês ant: {fmtPct(varM)}</span>
                    <span style={{ color: varA >= 0 ? '#16a34a' : '#dc2626' }}>Ano ant: {fmtPct(varA)}</span>
                  </div>
                  {proj != null && <div style={{ fontSize: '.7rem', color: '#999', marginTop: 4 }}>Projeção: {fmtRS(proj)}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button onClick={() => abrirHistorico(cardIndexParaApi(c, idx, dados))} style={linkBtn}>histórico</button>
                    {c.cardType !== 'servico' && <button onClick={() => abrirVendas(cardIndexParaApi(c, idx, dados), c.nome)} style={linkBtn}>vendas</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {/* Histórico */}
      {histCard != null && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <h2 style={{ color: '#dc2626', fontSize: '.95rem', fontWeight: 700, marginBottom: 12 }}>Histórico — {hist?.nome || '…'}</h2>
          {!hist ? <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div> : (
            <div style={{ width: '100%', height: 320 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={hist.meses}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => 'R$ ' + (v / 1000).toFixed(0) + 'k'} />
                  <Tooltip formatter={(v: number) => fmtRS(v)} />
                  <Legend />
                  <Line type="monotone" dataKey="valor" name="Venda" stroke="#dc2626" strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="custo" name="Custo" stroke="#888" strokeWidth={1.5} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Vendas */}
      {vendasCard && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ color: '#dc2626', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>Vendas — {vendasCard.nome} ({vendas?.length ?? 0})</h2>
            {vendas && vendas.length > 0 && <button onClick={exportarCSV} style={linkBtn}>exportar CSV</button>}
          </div>
          {!vendas ? <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div> : vendas.length === 0 ? <div style={{ color: '#888', fontSize: '.85rem' }}>Sem vendas no período.</div> : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Pedido', 'Data', 'Descrição', 'Qtd', 'V. Unit', 'V. Total', 'CMC'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {vendas.slice(0, 500).map((v, i) => (
                    <tr key={i}>
                      <td style={tdStyle}><button onClick={() => v.numero_pedido && abrirPedido(v.numero_pedido)} style={linkBtn}>{v.numero_pedido}</button></td>
                      <td style={tdStyle}>{v.data_pedido}</td>
                      <td style={tdStyle}>{v.descricao}</td>
                      <td style={tdStyle}>{v.quantidade}</td>
                      <td style={tdStyle}>{fmtRS(v.valor_unitario)}</td>
                      <td style={tdStyle}>{fmtRS(v.valor_total)}</td>
                      <td style={tdStyle}>{fmtRS(v.cmc_unitario)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Popup composição do pedido */}
      {pedidoItens && (
        <div onClick={() => setPedidoItens(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 760, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ color: '#dc2626', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>Pedido {pedidoItens.numero}</h2>
              <button onClick={() => setPedidoItens(null)} style={linkBtn}>fechar</button>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Código', 'Descrição', 'Qtd', 'V. Unit', 'V. Total', 'CMC'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
              <tbody>
                {pedidoItens.itens.map((v, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>{v.codigo_produto}</td>
                    <td style={tdStyle}>{v.descricao}</td>
                    <td style={tdStyle}>{v.quantidade}</td>
                    <td style={tdStyle}>{fmtRS(v.valor_unitario)}</td>
                    <td style={tdStyle}>{fmtRS(v.valor_total)}</td>
                    <td style={tdStyle}>{fmtRS(v.cmc_unitario)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#dc2626', fontSize: '.74rem', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

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

// O índice do card no array casa com o "card" da API:
//   0..numCats-1 → cards de produto (API usa 1..numCats); Pecas Diversas → numCats+1;
//   Servicos → numCats+2; Total Pecas → 0; Total Geral → numCats+3.
// Aqui derivamos pelo cardType para casar com a semântica do backend.
function cardIndexParaApi(c: Categoria, idx: number, dados: DashboardResp): number {
  // produto cards = N categorias reais + 1 "Pecas Diversas" (catch-all) → numCats = produtoCount - 1
  const numCats = dados.categorias.filter((x) => x.cardType === 'produto').length - 1;
  if (c.cardType === 'totalPecas') return 0;
  if (c.cardType === 'servico') return numCats + 2;
  if (c.cardType === 'totalGeral') return numCats + 3;
  // produto: posição 1..numCats; Pecas Diversas é o último card de produto → numCats+1
  if (idx === numCats) return numCats + 1; // Pecas Diversas (catch-all)
  return idx + 1;
}
