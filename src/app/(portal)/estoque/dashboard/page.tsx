'use client';
// Dashboard de Vendas — duas visões independentes: "Peças + Serviços" e "Máquinas".
// Consome /api/estoque/dashboard{,/historico,/categorias-vendas,/vendas,/pedido-itens,
// /compras,/tendencia}. Cor do VALOR é sempre neutra; verde/vermelho só p/ variação.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, LineChart, Line, BarChart, ComposedChart, Bar, Area, AreaChart, Cell, LabelList, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ReferenceLine } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';
import { chartColors } from '@/lib/estoque/chartColors';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
type Metrica = 'venda' | 'custo' | 'margem';
type Visao = 'pecas' | 'maquinas';

const COR_INK = '#1f2937';
const COR_UP = '#16a34a';
const COR_DOWN = '#dc2626';
const COR_MUTED = '#9ca3af';
// Peças/Serviços/Entradas vêm dos tokens compartilhados (casam com o gráfico).
const ACCENT = { geral: chartColors.consolidado, maquinas: '#d97706', pecas: chartColors.pecas, servicos: chartColors.servicos, comprei: chartColors.entradas };
const BASE_MIN_PECAS = 1000;
const BASE_MIN_MAQ_UN = 2;

interface Categoria {
  key: string;
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
  valorNota?: number;
  valorInterno?: number;
  valorInternoRetorno?: number;
  valorInternoPuro?: number;
  valorHR?: number;
  valorKM?: number;
  valorOutros?: number;
  unidades?: number;
  unidadesMesAnt?: number;
  unidadesAnoAnt?: number;
}
interface DashboardResp {
  periodo: string;
  modo?: 'mes' | 'ano';
  mes: number;
  ano: number;
  categorias: Categoria[];
  ehMesCorrente: boolean;
  /** Dia de corte (period-to-date) no mês corrente; null se fechado. */
  diaCorte?: number | null;
  maquinasYTD: { unidades: number; receita: number };
  erro?: string;
}
interface TendPonto { label: string; mes: number; ano: number; pecas: number; servicos: number; maquinas: number; maquinasUn: number; total: number; deltaPct: number | null; parcial?: boolean;
  /** Peças+Serviços do mês, MoM de PS, e PS do mesmo mês do ano anterior (YoY). */
  ps: number; psDeltaPct: number | null; psAnoAnt: number;
  /** Compras (entradas) de peças do mês — sparkline do card Entradas + razão. */
  compras: number }
interface HistMes { label: string; mes: number; ano: number; valor: number; custo: number; qtdePedidos: number; valorNota?: number | null; valorInterno?: number | null }
interface HistResp { catKey: string; nome: string; meses: HistMes[]; erro?: string }
interface VendaRow {
  numero_pedido?: string; data_pedido?: string; descricao?: string; codigo_produto?: string;
  quantidade?: number; valor_unitario?: number; valor_total?: number; cmc_unitario?: number;
}
interface CompraRow {
  codigo?: string | null; descricao?: string | null; familia?: string | null; numero_nf?: string | null;
  quantidade?: number | string | null; valor_unitario?: number | string | null; valor_total?: number | string | null;
}
type InternoBalde = 'retorno' | 'puro' | null;
interface OSRow { numero_os?: string; data?: string; cliente?: string; codigo_cliente?: number | null; valor?: number; conta?: string; tem_nota?: boolean | null; nfse_num?: string | null; internoBalde?: InternoBalde }
type TipoServico = 'HR' | 'KM' | 'OUTRO';
interface ServicoOSRow {
  numero_os?: string; data?: string; cliente?: string; codigo_cliente?: number | null;
  descricao?: string; tipo?: TipoServico; categoria?: string; categoria_desc?: string;
  qtde?: number; valor_unit?: number; valor_total?: number; conta?: string; tem_nota?: boolean | null; nfse_num?: string | null;
  internoBalde?: InternoBalde;
}

const LIMITE_LINHAS = 800;

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.87rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '10px 11px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '9px 11px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.92rem' };

function fmtPct(v: number): string {
  const s = v >= 0 ? '+' : '';
  return s + v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}
// Formato pt-BR compacto p/ eixos e ticket ("R$ 450 mil" / "R$ 1,2 mi").
function fmtMil(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi';
  if (abs >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: abs >= 1e5 ? 0 : 1 }) + ' mil';
  return 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
// Compacto em linha única para rótulos de barra/eixo: 272k · 60,7k · 1,2M.
function fmtK(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1e6) return (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (abs >= 1000) return (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: abs >= 1e5 ? 0 : 1 }) + 'k';
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}
function fixLabel(s: string): string {
  return s.replace(/Pecas Diversas/g, 'Peças diversas').replace(/Pecas/g, 'Peças').replace(/Servicos/g, 'Serviços');
}
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
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam, setConta } = useConta();

  useEffect(() => { setConta(''); }, [setConta]);

  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const ehAno = mes === 0;
  const periodoParam = ehAno ? 'mes=0&modo=ano' : 'mes=' + mes;
  const [categoria, setCategoria] = useState('');
  const [metrica, setMetrica] = useState<Metrica>('venda');
  const [visao, setVisao] = useState<Visao>('pecas');

  const [dados, setDados] = useState<DashboardResp | null>(null);
  const [tendencia, setTendencia] = useState<TendPonto[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [categoriasOpts, setCategoriasOpts] = useState<Array<{ codigo: string; descricao: string }>>([]);

  const [histCard, setHistCard] = useState<string | null>(null);
  const [hist, setHist] = useState<HistResp | null>(null);

  const [vendas, setVendas] = useState<VendaRow[] | null>(null);
  const [vendasCard, setVendasCard] = useState<{ nome: string } | null>(null);
  const [vendasSort, setVendasSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: '', dir: 'asc' });
  const [pedidoItens, setPedidoItens] = useState<{ numero: string; itens: VendaRow[] } | null>(null);

  const [comprasAberto, setComprasAberto] = useState(false);
  const [comprasItens, setComprasItens] = useState<CompraRow[] | null>(null);
  const [comprasSort, setComprasSort] = useState<{ col: string; dir: 'asc' | 'desc' }>({ col: 'valor_total', dir: 'desc' });

  const [osAberto, setOsAberto] = useState(false);
  const [osServicos, setOsServicos] = useState<OSRow[] | null>(null);
  const [servItens, setServItens] = useState<ServicoOSRow[] | null>(null);
  const [osView, setOsView] = useState<'servicos' | 'os'>('servicos');
  const [tipoFiltro, setTipoFiltro] = useState<TipoServico | null>(null);
  const [osPendente, setOsPendente] = useState(false);
  const [osErro, setOsErro] = useState('');

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('v');
    if (v === 'maquinas' || v === 'pecas') setVisao(v);
  }, []);
  const trocarVisao = useCallback((v: Visao) => {
    setVisao(v);
    const params = new URLSearchParams(window.location.search);
    params.set('v', v);
    window.history.replaceState(null, '', '?' + params.toString());
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    setHistCard(null);
    setHist(null);
    setVendas(null);
    setVendasCard(null);
    setOsAberto(false);
    setOsServicos(null);
    setServItens(null);
    setComprasAberto(false);
    setComprasItens(null);
    try {
      const catParam = categoria ? `&categoria=${encodeURIComponent(categoria)}` : '';
      const r = await fetch(`/api/estoque/dashboard?${periodoParam}&ano=${ano}${catParam}${contaParam}`);
      const d = (await r.json()) as DashboardResp;
      if (d.erro) { setErro(d.erro); return; }
      setDados(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [periodoParam, ano, categoria, contaParam]);

  useEffect(() => {
    fetch(`/api/estoque/dashboard/categorias-vendas?_=1${contaParam}`)
      .then((r) => r.json())
      .then((d) => setCategoriasOpts(d.categorias || []))
      .catch(() => setCategoriasOpts([]));
  }, [contaParam]);

  useEffect(() => {
    fetch(`/api/estoque/dashboard/tendencia?_=1${contaParam}`)
      .then((r) => r.json())
      .then((d) => {
        const raw = (d.pontos || []) as Array<{ label: string; mes: number; ano: number; pecas: number; servicos: number; maquinas: number; maquinasUn: number; psAnoAnt?: number; compras?: number }>;
        let prev = 0;
        let prevPs = 0;
        setTendencia(raw.map((p, i) => {
          const total = p.pecas + p.servicos + p.maquinas;
          const ps = p.pecas + p.servicos;
          const deltaPct = i === 0 || prev <= 0 ? null : ((total - prev) / prev) * 100;
          const psDeltaPct = i === 0 || prevPs <= 0 ? null : ((ps - prevPs) / prevPs) * 100;
          prev = total;
          prevPs = ps;
          return { ...p, total, ps, deltaPct, psDeltaPct, psAnoAnt: p.psAnoAnt ?? 0, compras: p.compras ?? 0, parcial: i === raw.length - 1 };
        }));
      })
      .catch(() => setTendencia(null));
  }, [contaParam]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirHistorico = useCallback(async (catKey: string) => {
    setHistCard(catKey);
    setHist(null);
    const catParam = categoria ? `&categoria=${encodeURIComponent(categoria)}` : '';
    const r = await fetch(`/api/estoque/dashboard/historico?catKey=${encodeURIComponent(catKey)}${catParam}${contaParam}`);
    const d = (await r.json()) as HistResp;
    if (!d.erro) setHist(d);
  }, [categoria, contaParam]);

  const abrirVendas = useCallback(async (catKey: string, nome: string) => {
    setVendas(null);
    setVendasCard({ nome });
    setVendasSort({ col: '', dir: 'asc' });
    const catParam = categoria ? `&categoria=${encodeURIComponent(categoria)}` : '';
    const r = await fetch(`/api/estoque/dashboard/vendas?${periodoParam}&ano=${ano}&catKey=${encodeURIComponent(catKey)}${catParam}${contaParam}`);
    const d = await r.json();
    if (!d.erro) setVendas(d.vendas || []);
  }, [periodoParam, ano, categoria, contaParam]);

  const abrirCompras = useCallback(async () => {
    setComprasItens(null);
    setComprasAberto(true);
    const r = await fetch(`/api/estoque/dashboard/compras?${periodoParam}&ano=${ano}${contaParam}`);
    const d = await r.json();
    if (!d.erro) setComprasItens(d.compras || []);
  }, [periodoParam, ano, contaParam]);

  const abrirVendasMaquina = useCallback(async (familia: string, nome: string) => {
    setVendas(null);
    setVendasCard({ nome });
    setVendasSort({ col: '', dir: 'asc' });
    const r = await fetch(`/api/estoque/dashboard/vendas?${periodoParam}&ano=${ano}&familiaMaquina=${encodeURIComponent(familia)}${contaParam}`);
    const d = await r.json();
    if (!d.erro) setVendas(d.vendas || []);
  }, [periodoParam, ano, contaParam]);

  const abrirOSServicos = useCallback(async () => {
    setOsServicos(null);
    setServItens(null);
    setTipoFiltro(null);
    setOsPendente(false);
    setOsErro('');
    setOsAberto(true);
    const r = await fetch(`/api/estoque/dashboard/os?${periodoParam}&ano=${ano}${contaParam}`);
    const d = await r.json();
    if (d.erro) {
      setOsErro(d.erro);
    } else {
      setOsServicos(d.os || []);
      setServItens(d.servicos || []);
      setOsPendente(!!d.pendente);
    }
  }, [periodoParam, ano, contaParam]);

  const abrirPedido = useCallback(async (numero: string) => {
    setPedidoItens({ numero, itens: [] });
    const r = await fetch(`/api/estoque/dashboard/pedido-itens?numero_pedido=${encodeURIComponent(numero)}&${periodoParam}&ano=${ano}${contaParam}`);
    const d = await r.json();
    setPedidoItens({ numero, itens: d.itens || [] });
  }, [periodoParam, ano, contaParam]);

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
    a.download = ehAno ? `vendas_ano_${ano}.csv` : `vendas_${mes}_${ano}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [vendas, mes, ano, ehAno]);

  if (!permLoading && userProfile && !pode('estoque', 'dashboard')) return <SemPermissao />;

  const anos: number[] = [];
  for (let y = now.getFullYear(); y >= 2023; y--) anos.push(y);

  const navItens: Array<[string, string]> = [
    ['/estoque', 'Busca'],
    ...(pode('estoque', 'curva-abc') ? [['/estoque/curva-abc', 'Curva ABC'] as [string, string]] : []),
    ...(pode('estoque', 'giro-estoque') ? [['/estoque/giro-estoque', 'Giro de Estoque'] as [string, string]] : []),
    ['/estoque/cruzamento-familia', 'Cruzamento de Família'],
  ];

  // Ordenação da tabela do popup "Comprei".
  const comprasOrdenadas = (() => {
    if (!comprasItens) return null;
    const { col, dir } = comprasSort;
    const nfNum = (c: CompraRow) => Number(String(c.numero_nf ?? '').replace(/\D/g, '')) || 0;
    const cmp = (a: CompraRow, b: CompraRow): number => {
      if (col === 'descricao') return String(a.descricao || a.codigo || '').localeCompare(String(b.descricao || b.codigo || ''), 'pt-BR');
      if (col === 'familia') return String(a.familia || '').localeCompare(String(b.familia || ''), 'pt-BR');
      if (col === 'numero_nf') return nfNum(a) - nfNum(b);
      if (col === 'quantidade') return (Number(a.quantidade) || 0) - (Number(b.quantidade) || 0);
      if (col === 'valor_unitario') return (Number(a.valor_unitario) || 0) - (Number(b.valor_unitario) || 0);
      return (Number(a.valor_total) || 0) - (Number(b.valor_total) || 0);
    };
    const arr = [...comprasItens].sort(cmp);
    if (dir === 'desc') arr.reverse();
    return arr;
  })();
  const sortHeader = (label: string, col: string) => (
    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => setComprasSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label} {comprasSort.col === col ? (comprasSort.dir === 'asc' ? '▲' : '▼') : <span style={{ color: '#ccc' }}>⇅</span>}
    </th>
  );

  // Ordenação da tabela do popup "Vendas" (col vazia = ordem original do backend).
  const vendasOrdenadas = (() => {
    if (!vendas) return null;
    const { col, dir } = vendasSort;
    if (!col) return vendas;
    const n = (v: unknown) => Number(v) || 0;
    const dataBR = (s?: string | null) => {
      const p = String(s ?? '').split('/');
      return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]).getTime() || 0 : 0;
    };
    const cmp = (a: VendaRow, b: VendaRow): number => {
      if (col === 'numero_pedido') return (parseInt(String(a.numero_pedido ?? '')) || 0) - (parseInt(String(b.numero_pedido ?? '')) || 0);
      if (col === 'data_pedido') return dataBR(a.data_pedido) - dataBR(b.data_pedido);
      if (col === 'descricao') return String(a.descricao || '').localeCompare(String(b.descricao || ''), 'pt-BR');
      if (col === 'quantidade') return n(a.quantidade) - n(b.quantidade);
      if (col === 'valor_unitario') return n(a.valor_unitario) - n(b.valor_unitario);
      if (col === 'cmc_unitario') return n(a.cmc_unitario) - n(b.cmc_unitario);
      return n(a.valor_total) - n(b.valor_total);
    };
    const arr = [...vendas].sort(cmp);
    if (dir === 'desc') arr.reverse();
    return arr;
  })();
  const sortHeaderVendas = (label: string, col: string) => (
    <th style={{ ...thStyle, cursor: 'pointer', userSelect: 'none' }} onClick={() => setVendasSort((s) => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }))}>
      {label} {vendasSort.col === col ? (vendasSort.dir === 'asc' ? '▲' : '▼') : <span style={{ color: '#ccc' }}>⇅</span>}
    </th>
  );

  return (
    <div style={{ margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.7rem', fontWeight: 700 }}>Dashboard de Vendas</h1>
          <p style={{ color: '#888', fontSize: '1.12rem', marginBottom: 0 }}>Duas visões — Peças + Serviços e Máquinas</p>
        </div>
        <ContaSelector />
      </div>

      {/* Navegação (telas irmãs) */}
      <div style={{ display: 'flex', gap: 2, margin: '14px 0 16px', flexWrap: 'wrap', borderBottom: '1px solid #eee' }}>
        <span style={{ fontSize: '.9rem', fontWeight: 700, color: '#111827', padding: '8px 14px', borderBottom: '2px solid #111827' }}>Dashboard</span>
        {navItens.map(([href, label]) => (
          <Link key={href} href={href} style={{ fontSize: '.9rem', fontWeight: 600, color: '#6b7280', textDecoration: 'none', padding: '8px 14px' }}>{label}</Link>
        ))}
      </div>

      {/* Seletor de visão */}
      <div style={{ display: 'inline-flex', gap: 0, marginBottom: 14, border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
        {([['pecas', 'Peças + Serviços'], ['maquinas', 'Máquinas']] as Array<[Visao, string]>).map(([v, rotulo]) => (
          <button key={v} onClick={() => trocarVisao(v)}
            style={{ padding: '10px 20px', border: 'none', borderRight: v === 'pecas' ? '1px solid #e0e0e0' : 'none', background: visao === v ? '#111827' : '#fff', color: visao === v ? '#fff' : '#666', fontSize: '1.12rem', fontWeight: 700, cursor: 'pointer' }}>
            {rotulo}
          </button>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 4, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Período" value={mes} onChange={(v) => setMes(parseInt(v))}
          options={[{ value: 0, label: 'Ano inteiro' }, ...MESES.map((m, i) => ({ value: i + 1, label: m }))]} />
        <Sel label="Ano" value={ano} onChange={(v) => setAno(parseInt(v))} options={anos.map((y) => ({ value: y, label: String(y) }))} />
        {visao === 'pecas' && (
          <>
            <Sel label="Categoria de peças" value={categoria} onChange={setCategoria} options={[{ value: '', label: 'Todas' }, ...categoriasOpts.map((c) => ({ value: c.codigo, label: c.descricao }))]} />
            <span title="Venda/Custo/Margem vale para Peças e Serviços (KPIs e cards). Serviços não tem custo apurado (fica “—” em Custo). Comprei é sempre entradas de NF." style={{ fontSize: '1rem', color: '#9ca3af', cursor: 'help', paddingBottom: 9 }}>ⓘ</span>
            <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
              {(['venda', 'custo', 'margem'] as Metrica[]).map((m) => (
                <button key={m} onClick={() => setMetrica(m)}
                  style={{ padding: '9px 16px', border: '1px solid', borderColor: metrica === m ? '#111827' : '#e0e0e0', background: metrica === m ? '#111827' : '#fff', color: metrica === m ? '#fff' : '#666', borderRadius: 8, fontSize: '.9rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
                  {m}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
      <div style={{ marginBottom: 16 }} />

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.9rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.9rem' }}>Carregando…</div>}

      {dados && (() => {
        const parcial = dados.ehMesCorrente;
        const cats = dados.categorias;
        const get = (t: string) => cats.find((c) => c.cardType === t);
        const cPecas = get('totalPecas');
        const cServ = get('servico');
        const cMaqTotal = get('totalMaquinas');
        const cComprei = get('compras');
        const modo = dados.modo;

        const badgeParcial = parcial && (
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.98rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '5px 12px', marginBottom: 14 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b' }} /> {modo === 'ano' ? 'ano em andamento' : 'mês em andamento'} — comparação parcial
          </div>
        );

        if (visao === 'maquinas') {
          const maqFamilias = cats.filter((c) => c.cardType === 'maquina');
          const ativas = maqFamilias.filter((c) => (c.unidades ?? 0) > 0 || c.valorAtual > 0).sort((a, b) => b.valorAtual - a.valorAtual);
          const zeradas = maqFamilias.filter((c) => (c.unidades ?? 0) === 0 && c.valorAtual === 0);
          const ytd = dados.maquinasYTD;
          const unTotal = cMaqTotal?.unidades ?? 0;
          const ticketMes = unTotal > 0 ? (cMaqTotal?.valorAtual || 0) / unTotal : 0;
          const ticketYtd = ytd.unidades > 0 ? ytd.receita / ytd.unidades : 0;
          return (
            <>
              {badgeParcial}
              {!cMaqTotal ? <div style={{ color: '#9ca3af', fontSize: '1.12rem' }}>Sem vendas de máquina no período.</div> : (
                <>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                    <KpiCard titulo={`Máquinas · ${dados.periodo}`} accent={ACCENT.maquinas}
                      valorNode={`${unTotal.toLocaleString('pt-BR')} ${unTotal === 1 ? 'máquina' : 'máquinas'}`}
                      subNode={<span style={{ whiteSpace: 'nowrap' }}>{fmtRS(cMaqTotal.valorAtual)} · ticket {fmtMil(ticketMes)}</span>}
                      varM={cMaqTotal.varMesAnterior} supM={(cMaqTotal.unidadesMesAnt ?? 0) < BASE_MIN_MAQ_UN}
                      varA={cMaqTotal.varAnoAnterior} supA={(cMaqTotal.unidadesAnoAnt ?? 0) < BASE_MIN_MAQ_UN}
                      modo={modo} parcial={parcial}
                      strongDrop={!parcial && (cMaqTotal.unidadesAnoAnt ?? 0) >= BASE_MIN_MAQ_UN && cMaqTotal.varAnoAnterior < -50} />
                    <KpiCard titulo={`Acumulado no ano (YTD ${dados.ano})`} accent={ACCENT.geral}
                      valorNode={`${ytd.unidades.toLocaleString('pt-BR')} ${ytd.unidades === 1 ? 'máquina' : 'máquinas'}`}
                      subNode={<span style={{ whiteSpace: 'nowrap' }}>{fmtRS(ytd.receita)} · ticket {fmtMil(ticketYtd)}</span>}
                      varM={0} supM varA={0} supA modo="ano" semVar />
                  </div>

                  {tendencia && tendencia.length > 0 && (
                    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '16px 18px 10px', marginBottom: 18 }}>
                      <div style={{ fontSize: '.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 8 }}>Máquinas · faturamento e unidades — últimos 12 meses</div>
                      <MaquinasChart pontos={tendencia} />
                    </div>
                  )}

                  <Secao titulo="Máquinas por família" accent={ACCENT.maquinas}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 12 }}>
                      {ativas.map((c, i) => (
                        <MaquinaCard key={i} c={c} modo={modo} parcial={parcial}
                          onVendas={() => abrirVendasMaquina(c.nome === 'Outras máquinas' ? '__TODAS__' : c.nome, fixLabel(c.nome))} />
                      ))}
                    </div>
                    {zeradas.length > 0 && (
                      <div style={{ fontSize: '.98rem', color: '#9ca3af', marginTop: 12 }}>
                        Sem vendas no período: {zeradas.map((z) => fixLabel(z.nome)).join(' · ')}
                      </div>
                    )}
                  </Secao>
                </>
              )}
            </>
          );
        }

        // ---- Visão PEÇAS + SERVIÇOS ----
        // Ordem definida pelo backend: 3 fixos (Peças diversas, Filtros,
        // Lubrificantes) + demais tipos com faturamento, em ordem alfabética.
        const pecasCats = cats.filter((c) => c.cardType === 'produto');
        const totalPecasVenda = cPecas?.valorAtual ?? pecasCats.reduce((s, c) => s + c.valorAtual, 0);
        // Peças e Serviços respondem ao toggle Venda/Custo/Margem. Serviços não tem
        // custo apurado neste painel → em "Custo" fica "—".
        const kv = (c: Categoria | undefined, quando: 'atual' | 'mesAnt' | 'anoAnt') => (c ? valorMetrica(c, metrica, quando) : 0);
        const rotuloMetrica = metrica === 'venda' ? 'faturamento no período' : metrica === 'custo' ? 'custo (CMV) no período' : 'margem no período';
        const psA = kv(cPecas, 'atual') + kv(cServ, 'atual');
        const psM = kv(cPecas, 'mesAnt') + kv(cServ, 'mesAnt');
        const psY = kv(cPecas, 'anoAnt') + kv(cServ, 'anoAnt');
        const psMesAntV = (cPecas?.mesAnteriorValor || 0) + (cServ?.mesAnteriorValor || 0);
        const psAnoAntV = (cPecas?.anoAnteriorValor || 0) + (cServ?.anoAnteriorValor || 0);
        const razaoCV = totalPecasVenda > 0 && cComprei ? cComprei.valorAtual / totalPecasVenda : null;
        // Sparklines (12 meses) e mediana histórica da razão compra/venda (só meses
        // fechados) — referência real da própria concessionária, não meta inventada.
        const spk = tendencia && tendencia.length > 1 ? tendencia : null;
        const razaoMediana = (() => {
          if (!tendencia) return null;
          const rs = tendencia.filter((t) => !t.parcial && t.pecas > 0).map((t) => t.compras / t.pecas);
          if (!rs.length) return null;
          const srt = [...rs].sort((a, b) => a - b);
          const m = Math.floor(srt.length / 2);
          return srt.length % 2 ? srt[m] : (srt[m - 1] + srt[m]) / 2;
        })();

        return (
          <>
            {badgeParcial}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <KpiCard titulo="Peças + Serviços" accent={ACCENT.geral} valorNode={fmtRS(psA)} subNode={rotuloMetrica}
                varM={calcVar(psA, psM)} supM={psMesAntV < BASE_MIN_PECAS} varA={calcVar(psA, psY)} supA={psAnoAntV < BASE_MIN_PECAS}
                modo={modo} parcial={parcial} comparavel={!parcial} diaCorte={dados.diaCorte} strongDrop={metrica === 'venda' && !parcial && psAnoAntV >= BASE_MIN_PECAS && calcVar(psA, psY) < -50}
                sparkNode={spk && <Sparkline data={spk.map((t) => t.ps)} cor={ACCENT.geral} parcialUltimo />} />
              {cPecas && (
                <KpiCard titulo="Total Peças" accent={ACCENT.pecas} valorNode={fmtRS(kv(cPecas, 'atual'))} subNode={metrica !== 'venda' ? rotuloMetrica : undefined}
                  varM={calcVar(kv(cPecas, 'atual'), kv(cPecas, 'mesAnt'))} supM={cPecas.mesAnteriorValor < BASE_MIN_PECAS}
                  varA={calcVar(kv(cPecas, 'atual'), kv(cPecas, 'anoAnt'))} supA={cPecas.anoAnteriorValor < BASE_MIN_PECAS}
                  modo={modo} parcial={parcial} diaCorte={dados.diaCorte} strongDrop={metrica === 'venda' && !parcial && cPecas.anoAnteriorValor >= BASE_MIN_PECAS && cPecas.varAnoAnterior < -50}
                  sparkNode={spk && <Sparkline data={spk.map((t) => t.pecas)} cor={ACCENT.pecas} parcialUltimo />} />
              )}
              {cServ && (
                <KpiCard titulo="Serviços" accent={ACCENT.servicos}
                  valorNode={metrica === 'custo' ? '—' : fmtRS(kv(cServ, 'atual'))}
                  subNode={metrica === 'venda' ? undefined : metrica === 'custo' ? 'serviço sem custo apurado' : 'margem = receita (sem custo)'}
                  varM={calcVar(kv(cServ, 'atual'), kv(cServ, 'mesAnt'))} supM={cServ.mesAnteriorValor < BASE_MIN_PECAS}
                  varA={calcVar(kv(cServ, 'atual'), kv(cServ, 'anoAnt'))} supA={cServ.anoAnteriorValor < BASE_MIN_PECAS}
                  modo={modo} parcial={parcial} comparavel={!parcial} semVar={metrica === 'custo'}
                  strongDrop={metrica === 'venda' && !parcial && cServ.anoAnteriorValor >= BASE_MIN_PECAS && cServ.varAnoAnterior < -50}
                  sparkNode={spk && <Sparkline data={spk.map((t) => t.servicos)} cor={ACCENT.servicos} parcialUltimo />} />
              )}
              {cComprei && (
                <KpiCard titulo="Entradas de Peças" accent={ACCENT.comprei} valorNode={fmtRS(cComprei.valorAtual)} subNode="por nota fiscal de entrada"
                  varM={cComprei.varMesAnterior} supM={cComprei.mesAnteriorValor < BASE_MIN_PECAS} varA={cComprei.varAnoAnterior} supA={cComprei.anoAnteriorValor < BASE_MIN_PECAS}
                  modo={modo} parcial={parcial} diaCorte={dados.diaCorte} onDrill={abrirCompras} drillLabel="ver itens"
                  sparkNode={spk && <Sparkline data={spk.map((t) => t.compras)} cor={ACCENT.comprei} parcialUltimo />}
                  extraNode={razaoCV != null && (
                    <div style={{ fontSize: '.82rem', color: '#6b7280', marginTop: 6 }}>
                      Razão compra/venda: <b>{razaoCV.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</b>
                      {razaoMediana != null && <span style={{ marginLeft: 6, color: '#9ca3af' }}>· mediana 12m: {razaoMediana.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</span>}
                      {razaoMediana != null && razaoCV > razaoMediana * 1.5 && <span style={{ marginLeft: 6, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 6px', fontSize: '.84rem', fontWeight: 700 }}>acima do histórico</span>}
                    </div>
                  )} />
              )}
            </div>

            {tendencia && tendencia.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '16px 18px 10px', marginBottom: 18 }}>
                <PecasChart pontos={tendencia} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 16, alignItems: 'start' }}>
              <Secao titulo="Peças por categoria" accent={ACCENT.pecas}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(205px, 1fr))', gap: 12 }}>
                  {pecasCats.map((c, i) => (
                    <PecaCard key={i} c={c} modo={modo} metrica={metrica} parcial={parcial}
                      pctMix={totalPecasVenda > 0 ? (c.valorAtual / totalPecasVenda) * 100 : 0}
                      onHist={() => abrirHistorico(c.key)}
                      onVendas={() => abrirVendas(c.key, fixLabel(c.nome))} />
                  ))}
                </div>
              </Secao>
              {cServ && <ServicosDecomp c={cServ} onDetalhe={abrirOSServicos} />}
            </div>
          </>
        );
      })()}

      {/* Histórico */}
      {histCard != null && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, margin: '18px 0' }}>
          <h2 style={{ color: '#111827', fontSize: '1.05rem', fontWeight: 700, marginBottom: 12 }}>Histórico — {hist?.nome ? fixLabel(hist.nome) : '…'}</h2>
          {!hist ? <div style={{ color: '#888', fontSize: '.9rem' }}>Carregando…</div> : (() => {
            const temSplit = hist.meses.some((m) => m.valorNota != null);
            const custoTodoZero = hist.meses.every((m) => !m.custo);
            return (
              <div style={{ width: '100%', height: 340 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hist.meses}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 13 }} />
                    <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => fmtMil(v)} width={88} />
                    <Tooltip formatter={(v: number) => fmtRS(v)} />
                    <Legend wrapperStyle={{ fontSize: 14 }} />
                    <Line type="monotone" dataKey="valor" name="Venda" stroke="#111827" strokeWidth={2} dot={false} />
                    {!custoTodoZero && <Line type="monotone" dataKey="custo" name="Custo" stroke="#888" strokeWidth={1.5} dot={false} />}
                    {temSplit && <Line type="monotone" dataKey="valorNota" name="Com nota" stroke="#2563eb" strokeWidth={1.5} dot={false} />}
                    {temSplit && <Line type="monotone" dataKey="valorInterno" name="Interno" stroke="#f59e0b" strokeWidth={1.5} dot={false} />}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            );
          })()}
        </div>
      )}

      {/* Vendas */}
      {vendasCard && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, margin: '18px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ color: '#111827', fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Vendas — {vendasCard.nome} ({vendas?.length ?? 0})</h2>
            {vendas && vendas.length > 0 && <button onClick={exportarCSV} style={linkBtn}>exportar CSV</button>}
          </div>
          {!vendas ? <div style={{ color: '#888', fontSize: '.9rem' }}>Carregando…</div> : vendas.length === 0 ? <div style={{ color: '#888', fontSize: '.9rem' }}>Sem vendas no período.</div> : (
            <div style={{ overflowX: 'auto' }}>
              {vendas.length > LIMITE_LINHAS && (
                <div style={{ color: '#999', fontSize: '.9rem', marginBottom: 6 }}>
                  Mostrando as {LIMITE_LINHAS} primeiras de {vendas.length.toLocaleString('pt-BR')} linhas — o CSV exporta tudo.
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  {sortHeaderVendas('Pedido', 'numero_pedido')}
                  {sortHeaderVendas('Data', 'data_pedido')}
                  {sortHeaderVendas('Descrição', 'descricao')}
                  {sortHeaderVendas('Qtd', 'quantidade')}
                  {sortHeaderVendas('V. Unit', 'valor_unitario')}
                  {sortHeaderVendas('V. Total', 'valor_total')}
                  {sortHeaderVendas('CMC', 'cmc_unitario')}
                </tr></thead>
                <tbody>
                  {(vendasOrdenadas ?? vendas).slice(0, LIMITE_LINHAS).map((v, i) => (
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

      {/* Popup Serviços */}
      {osAberto && (
        <div onClick={() => setOsAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 1240, width: '94%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ color: '#111827', fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                Serviços — {osView === 'servicos' ? `itens (${servItens?.length ?? 0})` : `Ordens de Serviço (${osServicos?.length ?? 0})`}
                {osServicos && osServicos.length > 0 && (
                  <span style={{ color: '#888', fontWeight: 600, marginLeft: 8 }}>· Total {fmtRS(osServicos.reduce((s, o) => s + (o.valor || 0), 0))}</span>
                )}
              </h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([['servicos', 'Serviços'], ['os', 'Por OS']] as Array<['servicos' | 'os', string]>).map(([v, rotulo]) => (
                    <button key={v} onClick={() => setOsView(v)}
                      style={{ padding: '6px 13px', border: '1px solid', borderColor: osView === v ? '#111827' : '#e0e0e0', background: osView === v ? '#111827' : '#fff', color: osView === v ? '#fff' : '#666', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
                      {rotulo}
                    </button>
                  ))}
                </div>
                <button onClick={() => setOsAberto(false)} style={linkBtn}>fechar</button>
              </div>
            </div>
            {osErro && <div style={{ color: '#dc2626', fontSize: '.88rem', marginBottom: 10 }}>{osErro}</div>}
            {osPendente && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '.85rem', marginBottom: 10 }}>
                Sincronizando {ehAno ? 'os meses que faltam' : 'este mês'} com a Omie em segundo plano — feche e abra o popup novamente em ~1–2 minutos.
                {ehAno && ' (um mês por vez, para não sobrecarregar a Omie)'}
              </div>
            )}
            {osView === 'servicos' ? (
              !servItens ? (osErro ? null : <div style={{ color: '#888', fontSize: '.9rem' }}>Carregando…</div>) : servItens.length === 0 ? (osPendente ? null : <div style={{ color: '#888', fontSize: '.9rem' }}>Sem serviços faturados no período.</div>) : (
                <>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {(['HR', 'KM', 'OUTRO'] as TipoServico[]).map((t) => {
                      const doTipo = servItens.filter((s) => s.tipo === t);
                      const soma = doTipo.reduce((s, x) => s + (x.valor_total || 0), 0);
                      const qtd = doTipo.reduce((s, x) => s + (x.qtde || 0), 0);
                      const ativo = tipoFiltro === t;
                      const unidade = t === 'HR' ? `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : t === 'KM' ? `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km` : `${doTipo.length} itens`;
                      return (
                        <button key={t} onClick={() => setTipoFiltro(ativo ? null : t)}
                          style={{ padding: '8px 13px', border: '1px solid', borderColor: ativo ? '#111827' : '#e0e0e0', background: ativo ? '#f3f4f6' : '#fafafa', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ fontSize: '.7rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>{tipoRotulo(t)}</div>
                          <div style={{ fontSize: '1rem', fontWeight: 700, color: COR_INK }}>{fmtRS(soma)} <span style={{ color: '#999', fontWeight: 600, fontSize: '.9rem' }}>· {unidade}</span></div>
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const n = servItens.filter((s) => !tipoFiltro || s.tipo === tipoFiltro).length;
                    return n > LIMITE_LINHAS ? (
                      <div style={{ color: '#999', fontSize: '.9rem', marginBottom: 6 }}>Mostrando as {LIMITE_LINHAS} primeiras de {n.toLocaleString('pt-BR')} linhas (os totais acima consideram todas).</div>
                    ) : null;
                  })()}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['OS', 'Data', 'Cliente', 'Serviço', 'Tipo', 'Nota', 'NFS', 'Categoria', ...(contaParam === '' ? ['Conta'] : []), 'Qtd', 'V. Unit', 'V. Total'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                      <tbody>
                        {servItens.filter((s) => !tipoFiltro || s.tipo === tipoFiltro).slice(0, LIMITE_LINHAS).map((s, i) => (
                          <tr key={i}>
                            <td style={tdStyle}>{s.numero_os}</td>
                            <td style={tdStyle}>{s.data}</td>
                            <td style={tdStyle}>{s.cliente || (s.codigo_cliente ? '#' + s.codigo_cliente : '—')}</td>
                            <td style={{ ...tdStyle, maxWidth: 320 }} title={s.descricao}>{(s.descricao || '—').length > 70 ? (s.descricao || '').slice(0, 70) + '…' : (s.descricao || '—')}</td>
                            <td style={tdStyle}><TipoBadge tipo={s.tipo} /></td>
                            <td style={tdStyle}><NotaBadge temNota={s.tem_nota} balde={s.internoBalde} /></td>
                            <td style={tdStyle}>{s.nfse_num || '—'}</td>
                            <td style={tdStyle} title={s.categoria}>{s.categoria_desc || s.categoria || '—'}</td>
                            {contaParam === '' && <td style={tdStyle}>{s.conta}</td>}
                            <td style={tdStyle}>{s.qtde}</td>
                            <td style={tdStyle}>{fmtRS(s.valor_unit)}</td>
                            <td style={tdStyle}>{fmtRS(s.valor_total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )
            ) : (
              !osServicos ? (osErro ? null : <div style={{ color: '#888', fontSize: '.9rem' }}>Carregando…</div>) : osServicos.length === 0 ? (osPendente ? null : <div style={{ color: '#888', fontSize: '.9rem' }}>Sem OS faturadas no período.</div>) : (
                <>
                {osServicos.length > LIMITE_LINHAS && (
                  <div style={{ color: '#999', fontSize: '.9rem', marginBottom: 6 }}>Mostrando as {LIMITE_LINHAS} primeiras de {osServicos.length.toLocaleString('pt-BR')} OS (o total acima considera todas).</div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['OS', 'Data', 'Cliente', 'Nota', 'NFS', ...(contaParam === '' ? ['Conta'] : []), 'Valor'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {osServicos.slice(0, LIMITE_LINHAS).map((o, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{o.numero_os}</td>
                        <td style={tdStyle}>{o.data}</td>
                        <td style={tdStyle}>{o.cliente || (o.codigo_cliente ? '#' + o.codigo_cliente : '—')}</td>
                        <td style={tdStyle}><NotaBadge temNota={o.tem_nota} balde={o.internoBalde} /></td>
                        <td style={tdStyle}>{o.nfse_num || '—'}</td>
                        {contaParam === '' && <td style={tdStyle}>{o.conta}</td>}
                        <td style={tdStyle}>{fmtRS(o.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                </>
              )
            )}
          </div>
        </div>
      )}

      {/* Popup composição do pedido */}
      {pedidoItens && (
        <div onClick={() => setPedidoItens(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 760, width: '90%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
              <h2 style={{ color: '#111827', fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>Pedido {pedidoItens.numero}</h2>
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

      {/* Popup itens do "Comprei" (peças por NF) — cabeçalho ordenável */}
      {comprasAberto && (
        <div onClick={() => setComprasAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 960, width: '92%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ color: '#111827', fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
                Comprei — itens ({comprasItens?.length ?? 0})
                {comprasItens && comprasItens.length > 0 && (
                  <span style={{ color: '#888', fontWeight: 600, marginLeft: 8 }}>· Total {fmtRS(comprasItens.reduce((s, c) => s + (Number(c.valor_total) || 0), 0))}</span>
                )}
              </h2>
              <button onClick={() => setComprasAberto(false)} style={linkBtn}>fechar</button>
            </div>
            {!comprasOrdenadas ? <div style={{ color: '#888', fontSize: '.9rem' }}>Carregando…</div> : comprasOrdenadas.length === 0 ? <div style={{ color: '#888', fontSize: '.9rem' }}>Sem compras de peças no período.</div> : (
              <div style={{ overflowX: 'auto' }}>
                {comprasOrdenadas.length > LIMITE_LINHAS && (
                  <div style={{ color: '#999', fontSize: '.9rem', marginBottom: 6 }}>Mostrando as {LIMITE_LINHAS} primeiras de {comprasOrdenadas.length.toLocaleString('pt-BR')} linhas (o total acima considera todas).</div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    {sortHeader('Produto', 'descricao')}
                    {sortHeader('Família', 'familia')}
                    {sortHeader('NF', 'numero_nf')}
                    {sortHeader('Qtd', 'quantidade')}
                    {sortHeader('V. Unit', 'valor_unitario')}
                    {sortHeader('V. Total', 'valor_total')}
                  </tr></thead>
                  <tbody>
                    {comprasOrdenadas.slice(0, LIMITE_LINHAS).map((c, i) => (
                      <tr key={i}>
                        <td style={{ ...tdStyle, maxWidth: 340 }} title={c.descricao || ''}>{c.descricao || c.codigo || '—'}</td>
                        <td style={tdStyle}>{c.familia}</td>
                        <td style={tdStyle}>{c.numero_nf}</td>
                        <td style={tdStyle}>{c.quantidade}</td>
                        <td style={tdStyle}>{fmtRS(Number(c.valor_unitario) || 0)}</td>
                        <td style={tdStyle}>{fmtRS(Number(c.valor_total) || 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2563eb', fontSize: '.98rem', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

// Variação: verde/vermelho; CINZA quando base baixa; "—" quando não comparável
// (mês parcial de card cujo período anterior NÃO é recortado — ex.: Serviços).
// No mês corrente, PEÇAS/COMPRAS já são recortadas (period-to-date) → a
// comparação é válida e sai colorida.
function Delta({ label, v, sup, parcial, comparavel = true }: { label: string; v: number; sup: boolean; parcial?: boolean; comparavel?: boolean }) {
  if (!comparavel) return <span title="mês parcial — serviços não têm base diária para recorte, comparação omitida" style={{ color: COR_MUTED }}>{label}: —</span>;
  const cor = sup ? COR_MUTED : v >= 0 ? COR_UP : COR_DOWN;
  const motivo = parcial ? 'comparação sobre o mesmo intervalo de dias em cada período' : sup ? 'base baixa no período anterior' : undefined;
  return <span title={motivo} style={{ color: cor }}>{label}: {fmtPct(v)}</span>;
}

function KpiCard({ titulo, accent, valorNode, subNode, varM, supM, varA, supA, modo, strongDrop, extraNode, onDrill, drillLabel, parcial, semVar, diaCorte, comparavel = true, sparkNode }: {
  titulo: string; accent: string; valorNode: React.ReactNode; subNode?: React.ReactNode;
  varM: number; supM: boolean; varA: number; supA: boolean; modo?: 'mes' | 'ano'; strongDrop?: boolean; extraNode?: React.ReactNode;
  onDrill?: () => void; drillLabel?: string; parcial?: boolean; semVar?: boolean; diaCorte?: number | null; comparavel?: boolean; sparkNode?: React.ReactNode;
}) {
  const suf = comparavel && parcial && diaCorte ? `. (1–${diaCorte})` : '';
  const mostrarInfo = comparavel && parcial && !!diaCorte;
  return (
    <div style={{ flex: '1 1 220px', background: '#fff', border: strongDrop ? '2px solid ' + COR_DOWN : '1px solid #e5e7eb', borderTop: '3px solid ' + accent, borderRadius: 12, padding: 16, boxShadow: '0 1px 3px rgba(0,0,0,.04)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <span style={{ fontSize: '.82rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>{titulo}</span>
        {strongDrop && <span style={{ fontSize: '.7rem', fontWeight: 700, color: COR_DOWN, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>queda acentuada</span>}
      </div>
      <div style={{ fontSize: '2.1rem', fontWeight: 800, color: COR_INK, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{valorNode}</div>
      {subNode && <div style={{ fontSize: '1rem', color: '#6b7280', marginTop: 3 }}>{subNode}</div>}
      {!semVar && (
        <div style={{ display: 'flex', gap: 12, marginTop: 10, fontSize: '.98rem', flexWrap: 'wrap', fontWeight: 600, alignItems: 'center' }}>
          {modo !== 'ano' && <Delta label={'Mês ant' + suf} v={varM} sup={supM} parcial={parcial} comparavel={comparavel} />}
          <Delta label={'Ano ant' + suf} v={varA} sup={supA} parcial={parcial} comparavel={comparavel} />
          {mostrarInfo && <span title={`Comparação period-to-date: mesmo intervalo de dias (1–${diaCorte}) em cada período. Serviços não entram no recorte.`} style={{ cursor: 'help', color: '#9ca3af', fontWeight: 700 }}>ⓘ</span>}
        </div>
      )}
      {sparkNode && <div style={{ marginTop: 'auto', paddingTop: 10 }}>{sparkNode}</div>}
      {extraNode}
      {onDrill && <div style={{ marginTop: 8 }}><button onClick={onDrill} style={linkBtn}>{drillLabel || 'ver itens'}</button></div>}
    </div>
  );
}

function Secao({ titulo, accent, hint, children }: { titulo: string; accent: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 12, borderLeft: '3px solid ' + accent, paddingLeft: 8 }}>
        <div style={{ fontSize: '1.12rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#374151' }}>{titulo}</div>
        {hint && <div style={{ fontSize: '.9rem', color: '#9ca3af', marginTop: 1 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function PecaCard({ c, modo, metrica, pctMix, parcial, onHist, onVendas }: {
  c: Categoria; modo?: 'mes' | 'ano'; metrica: Metrica; pctMix: number; parcial?: boolean; onHist: () => void; onVendas: () => void;
}) {
  const zero = c.valorAtual === 0 && c.custoAtual === 0;
  const atual = valorMetrica(c, metrica, 'atual');
  const varM = calcVar(atual, valorMetrica(c, metrica, 'mesAnt'));
  const varA = calcVar(atual, valorMetrica(c, metrica, 'anoAnt'));
  const margemPct = c.valorAtual > 0 ? (c.margemAtual / c.valorAtual) * 100 : 0;
  return (
    <div style={{ background: zero ? '#fafafa' : '#fff', border: '1px solid #eee', borderRadius: 10, padding: 13, opacity: zero ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: '.96rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700 }}>{fixLabel(c.nome)}</span>
        {!zero && <span style={{ fontSize: '.87rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{pctMix.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do total</span>}
      </div>
      {zero ? (
        <div style={{ fontSize: '.98rem', color: '#9ca3af', marginTop: 5 }}>sem vendas no período</div>
      ) : (
        <>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: COR_INK, marginTop: 3, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{fmtRS(atual)}</div>
          {metrica === 'venda' && <div style={{ fontSize: '.9rem', color: '#6b7280' }}>margem {margemPct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</div>}
          <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: '.9rem', flexWrap: 'wrap', fontWeight: 600 }}>
            {modo !== 'ano' && <Delta label="Mês" v={varM} sup={c.mesAnteriorValor < BASE_MIN_PECAS} parcial={parcial} />}
            <Delta label="Ano" v={varA} sup={c.anoAnteriorValor < BASE_MIN_PECAS} parcial={parcial} />
          </div>
          <div style={{ marginTop: 9 }}>
            <button onClick={onHist} style={linkBtn}>histórico</button>
            <button onClick={onVendas} style={{ ...linkBtn, marginLeft: 12 }}>vendas</button>
          </div>
        </>
      )}
    </div>
  );
}

function MaquinaCard({ c, modo, parcial, onVendas }: { c: Categoria; modo?: 'mes' | 'ano'; parcial?: boolean; onVendas: () => void }) {
  const un = c.unidades ?? 0;
  const ticket = un > 0 ? c.valorAtual / un : 0;
  const varM = calcVar(c.valorAtual, c.mesAnteriorValor);
  const varA = calcVar(c.valorAtual, c.anoAnteriorValor);
  return (
    <div style={{ background: '#fff', border: '1px solid #f0e6d5', borderRadius: 10, padding: 13 }}>
      <div style={{ fontSize: '.96rem', color: '#92610e', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700 }}>{fixLabel(c.nome)}</div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: COR_INK, marginTop: 3, fontVariantNumeric: 'tabular-nums', lineHeight: 1.1 }}>{un.toLocaleString('pt-BR')} {un === 1 ? 'máquina' : 'máquinas'}</div>
      <div style={{ fontSize: '.9rem', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtRS(c.valorAtual)} · ticket {fmtMil(ticket)}</div>
      <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: '.9rem', flexWrap: 'wrap', fontWeight: 600 }}>
        {modo !== 'ano' && <Delta label="Mês" v={varM} sup={(c.unidadesMesAnt ?? 0) < BASE_MIN_MAQ_UN} parcial={parcial} />}
        <Delta label="Ano" v={varA} sup={(c.unidadesAnoAnt ?? 0) < BASE_MIN_MAQ_UN} parcial={parcial} />
      </div>
      <div style={{ marginTop: 9 }}><button onClick={onVendas} style={linkBtn}>ver vendas</button></div>
    </div>
  );
}

function ServicosDecomp({ c, onDetalhe }: { c: Categoria; onDetalhe: () => void }) {
  const linhas: Array<{ label: string; valor: number; somado: boolean }> = [];
  if (c.valorHR != null) {
    linhas.push({ label: 'HR (com nota)', valor: c.valorHR, somado: true });
    linhas.push({ label: 'KM (com nota)', valor: c.valorKM || 0, somado: true });
    linhas.push({ label: 'Outros (com nota)', valor: c.valorOutros || 0, somado: true });
  } else if (c.valorNota != null) {
    linhas.push({ label: 'Com nota', valor: c.valorNota, somado: true });
  }
  if (c.valorInternoRetorno != null) linhas.push({ label: 'Interno c/ retorno', valor: c.valorInternoRetorno, somado: false });
  if (c.valorInternoPuro != null) linhas.push({ label: 'Interno puro', valor: c.valorInternoPuro, somado: false });
  else if (c.valorInterno != null) linhas.push({ label: 'Interno', valor: c.valorInterno, somado: false });
  const maxv = Math.max(1, ...linhas.map((l) => Math.abs(l.valor)));
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 15, borderLeft: '3px solid ' + ACCENT.servicos }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: '.9rem', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Serviços — decomposição</span>
        <button onClick={onDetalhe} style={linkBtn}>ver detalhe</button>
      </div>
      <div style={{ fontSize: '2rem', fontWeight: 800, color: COR_INK, marginBottom: 12, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(c.valorAtual)} <span style={{ fontSize: '.82rem', color: '#9ca3af', fontWeight: 400 }}>receita</span></div>
      {linhas.length === 0 ? <div style={{ fontSize: '.98rem', color: '#9ca3af' }}>Sem detalhe no período.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {linhas.map((l, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.98rem', color: l.somado ? '#374151' : '#9ca3af' }}>
                <span>{l.label}{!l.somado && <span style={{ fontSize: '.84rem' }}> (não somado)</span>}</span>
                <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(l.valor)}</span>
              </div>
              <div style={{ height: 6, background: '#f3f4f6', borderRadius: 3, marginTop: 3, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: Math.max(2, (Math.abs(l.valor) / maxv) * 100) + '%', background: l.somado ? ACCENT.servicos : '#d1d5db', borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Cores do gráfico Peças+Serviços — dos tokens compartilhados (casam com os cards).
const CHART_PECAS = chartColors.pecas;
const CHART_SERVICOS = chartColors.servicosBar;
const CHART_SERVICOS_INK = chartColors.servicos;
const COR_POS = chartColors.pos;
const COR_NEG = chartColors.neg;

type PSView = 'empilhado' | 'agrupado' | 'pct';
const fmtVar = (v: number | null): { txt: string; cor: string } => {
  if (v == null) return { txt: '—', cor: '#9ca3af' };
  const s = v >= 0 ? '+' : '';
  return { txt: s + v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%', cor: v >= 0 ? COR_POS : COR_NEG };
};

interface PSTooltipProps { active?: boolean; label?: string; payload?: Array<{ payload: TendPonto }> }
function PSTooltip({ active, payload, label }: PSTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const ps = p.ps || p.pecas + p.servicos;
  const pctP = ps > 0 ? Math.round((p.pecas / ps) * 100) : 0;
  const pctS = ps > 0 ? 100 - pctP : 0;
  const yoy = p.psAnoAnt > 0 ? ((ps - p.psAnoAnt) / p.psAnoAnt) * 100 : null;
  const mom = fmtVar(p.psDeltaPct);
  const vy = fmtVar(yoy);
  const row = (nome: string, v: number, pct: number, cor: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}>
      <span style={{ color: cor }}>{nome} <span style={{ color: '#9ca3af' }}>({pct}%)</span></span>
      <span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(v)}</span>
    </div>
  );
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '.95rem', boxShadow: '0 2px 8px rgba(0,0,0,.1)', minWidth: 234 }}>
      <div style={{ fontWeight: 700, marginBottom: 5 }}>{label}{p.parcial && <span style={{ color: '#b45309', fontWeight: 600 }}> · parcial</span>}</div>
      {row('Peças', p.pecas, pctP, CHART_PECAS)}
      {row('Serviços', p.servicos, pctS, CHART_SERVICOS_INK)}
      <div style={{ borderTop: '1px solid #eee', marginTop: 5, paddingTop: 5, display: 'flex', justifyContent: 'space-between', gap: 16 }}>
        <span style={{ fontWeight: 600 }}>Total</span><span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(ps)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 3, color: '#6b7280' }}>
        <span>vs. mês anterior</span><span style={{ fontWeight: 700, color: mom.cor }}>{mom.txt}</span>
      </div>
      {yoy != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, color: '#6b7280' }}>
          <span>vs. ano anterior</span><span style={{ fontWeight: 700, color: vy.cor }}>{vy.txt}</span>
        </div>
      )}
    </div>
  );
}
// Mini-tendência de 12 meses no rodapé do card. Sem eixos/grade/tooltip. O último
// ponto (mês corrente parcial) fica com opacidade reduzida (coerente com a barra).
function Sparkline({ data, cor, parcialUltimo }: { data: number[]; cor: string; parcialUltimo?: boolean }) {
  if (!data || data.length < 2) return null;
  const d = data.map((v, i) => ({ i, v }));
  const last = d.length - 1;
  return (
    <div style={{ width: '100%', height: 34 }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={d} margin={{ top: 3, right: 1, left: 1, bottom: 0 }}>
          <Area type="monotone" dataKey="v" stroke={cor} strokeWidth={1.5} fill={cor} fillOpacity={0.12} isAnimationActive={false}
            dot={(p: { cx?: number; cy?: number; index?: number }) =>
              parcialUltimo && p.index === last && p.cx != null && p.cy != null
                ? <circle key={p.index} cx={p.cx} cy={p.cy} r={2.6} fill={cor} fillOpacity={0.45} stroke="none" />
                : <g key={p.index} />} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
function PecasChart({ pontos }: { pontos: TendPonto[] }) {
  const [view, setView] = useState<PSView>('empilhado');
  // Média sobre MESES FECHADOS apenas (exclui o mês corrente parcial, que puxaria
  // a linha para baixo e comprimiria a leitura das barras).
  const fechados = pontos.filter((p) => !p.parcial);
  const media = fechados.length ? fechados.reduce((s, p) => s + p.ps, 0) / fechados.length : 0;
  const diaHoje = new Date().getDate();
  const ultimo = pontos[pontos.length - 1];
  const data = pontos.map((p) => ({
    ...p,
    // Linha de ano anterior (YoY): NÃO liga o ponto do mês parcial — Ago/25 cheio
    // vs Ago/26 parcial geraria um salto vertical no canto. A linha termina no
    // último mês fechado. (Serviços não são recortados, então não dá pra plotar
    // um Ago/25 "period-to-date" coerente — optamos por interromper.)
    psAnoAnt: p.parcial ? null : p.psAnoAnt,
    pecasPct: p.ps > 0 ? (p.pecas / p.ps) * 100 : 0,
    servicosPct: p.ps > 0 ? (p.servicos / p.ps) * 100 : 0,
  }));
  const isPct = view === 'pct';
  const isStack = view === 'empilhado';
  const stackId = isStack || isPct ? 'ps' : undefined;
  const kP = isPct ? 'pecasPct' : 'pecas';
  const kS = isPct ? 'servicosPct' : 'servicos';
  const tgl = (v: PSView, l: string) => (
    <button key={v} onClick={() => setView(v)}
      style={{ padding: '5px 11px', border: '1px solid', borderColor: view === v ? '#111827' : '#e0e0e0', background: view === v ? '#111827' : '#fff', color: view === v ? '#fff' : '#666', borderRadius: 7, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer' }}>{l}</button>
  );
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: '.85rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Peças + Serviços · faturamento — últimos 12 meses</div>
          {!isPct && <div style={{ fontSize: '.72rem', color: '#9ca3af' }}>valores em R$ mil</div>}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>{tgl('empilhado', 'Empilhado')}{tgl('agrupado', 'Agrupado')}{tgl('pct', '% Mix')}</div>
      </div>
      <div style={{ width: '100%', height: 340 }}>
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 24, right: 12, left: 8, bottom: 0 }}>
            <XAxis dataKey="label" tick={{ fontSize: 13 }} />
            <YAxis tick={{ fontSize: 13 }} width={isPct ? 42 : 56} domain={isPct ? [0, 100] : undefined} tickFormatter={isPct ? (v) => v + '%' : (v) => fmtK(v)} />
            <Tooltip content={<PSTooltip />} cursor={{ fill: 'rgba(0,0,0,.03)' }} />
            <Legend wrapperStyle={{ fontSize: 14 }} />
            {isStack && <ReferenceLine y={media} stroke="#9ca3af" strokeDasharray="5 4" ifOverflow="extendDomain"
              label={{ value: `média ${fechados.length}m fechados: ${fmtK(media)}`, position: 'insideTopRight', fill: '#6b7280', fontSize: 12 }} />}
            <Bar dataKey={kP} stackId={stackId} name="Peças" fill={CHART_PECAS} radius={isStack || isPct ? [0, 0, 0, 0] : [3, 3, 0, 0]} maxBarSize={54}>
              {data.map((p, i) => <Cell key={i} fillOpacity={p.parcial ? 0.55 : 1} />)}
              {view === 'agrupado' && <LabelList dataKey="pecas" position="top" style={{ fontSize: 11, fill: CHART_PECAS, fontWeight: 700 }} formatter={(v: number) => fmtK(v)} />}
              {isPct && <LabelList dataKey="pecasPct" position="center" style={{ fontSize: 11, fill: '#fff', fontWeight: 700 }} formatter={(v: number) => (v >= 8 ? Math.round(v) + '%' : '')} />}
            </Bar>
            <Bar dataKey={kS} stackId={stackId} name="Serviços" fill={CHART_SERVICOS} radius={[3, 3, 0, 0]} maxBarSize={54}>
              {data.map((p, i) => <Cell key={i} fillOpacity={p.parcial ? 0.55 : 1} />)}
              {isStack && <LabelList dataKey="ps" position="top" style={{ fontSize: 12, fill: '#374151', fontWeight: 700 }} formatter={(v: number) => fmtK(v)} />}
              {view === 'agrupado' && <LabelList dataKey="servicos" position="top" style={{ fontSize: 11, fill: CHART_SERVICOS_INK, fontWeight: 700 }} formatter={(v: number) => fmtK(v)} />}
              {isPct && <LabelList dataKey="servicosPct" position="center" style={{ fontSize: 11, fill: '#083344', fontWeight: 700 }} formatter={(v: number) => (v >= 8 ? Math.round(v) + '%' : '')} />}
            </Bar>
            {isStack && <Line type="monotone" dataKey="psAnoAnt" name="Ano anterior" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 3" dot={false} connectNulls={false} />}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      {ultimo?.parcial && (
        <div style={{ fontSize: '.8rem', color: '#b45309', marginTop: 2 }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, background: CHART_SERVICOS, opacity: 0.55, borderRadius: 2, marginRight: 5, verticalAlign: 'middle' }} />
          {ultimo.label} é o mês corrente — parcial (até dia {diaHoje}).
        </div>
      )}
    </div>
  );
}

interface MaqTooltipProps { active?: boolean; label?: string; payload?: Array<{ payload: TendPonto }> }
function MaqTooltip({ active, payload, label }: MaqTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '9px 12px', fontSize: '.98rem', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}>
      <div style={{ fontWeight: 700, marginBottom: 5 }}>{label}{p.parcial && <span style={{ color: '#b45309', fontWeight: 600 }}> · parcial</span>}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: ACCENT.maquinas }}>Faturamento</span><span style={{ fontWeight: 700 }}>{fmtRS(p.maquinas)}</span></div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span>Unidades</span><span style={{ fontWeight: 700 }}>{p.maquinasUn.toLocaleString('pt-BR')}</span></div>
    </div>
  );
}
function MaquinasChart({ pontos }: { pontos: TendPonto[] }) {
  return (
    <div style={{ width: '100%', height: 340 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pontos} margin={{ top: 22, right: 8, left: 8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 13 }} />
          <YAxis tick={{ fontSize: 13 }} tickFormatter={(v) => fmtMil(v)} width={90} />
          <Tooltip content={<MaqTooltip />} cursor={{ fill: 'rgba(0,0,0,.03)' }} />
          <Bar dataKey="maquinas" name="Faturamento" fill={ACCENT.maquinas} radius={[3, 3, 0, 0]}>
            {pontos.map((p, i) => <Cell key={i} fillOpacity={p.parcial ? 0.5 : 1} />)}
            <LabelList dataKey="maquinasUn" position="top" style={{ fontSize: 13, fill: '#92610e', fontWeight: 700 }} formatter={(v: number) => (v ? v.toLocaleString('pt-BR') : '')} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function tipoRotulo(t: TipoServico): string {
  return t === 'HR' ? 'HR — Hora trabalhada' : t === 'KM' ? 'KM — Deslocamento' : 'Outros';
}

function NotaBadge({ temNota, balde }: { temNota?: boolean | null; balde?: InternoBalde }) {
  if (temNota == null) return <span title="Ainda não verificado" style={{ color: '#bbb', fontSize: '.9rem' }}>—</span>;
  if (temNota) {
    return <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 6, padding: '2px 7px', fontSize: '.87rem', fontWeight: 700 }}>Com nota</span>;
  }
  if (balde === 'retorno') {
    return <span title="Garantia de fábrica, entrega/montagem, revisão ou serviço normal fechado sem nota — rendeu." style={{ background: '#fef3c7', color: '#b45309', borderRadius: 6, padding: '2px 7px', fontSize: '.87rem', fontWeight: 700 }}>Interno c/ retorno</span>;
  }
  if (balde === 'puro') {
    return <span title="Cortesia comercial ou contrato interno/oficina — interno de verdade." style={{ background: '#f3f4f6', color: '#666', borderRadius: 6, padding: '2px 7px', fontSize: '.87rem', fontWeight: 700 }}>Interno puro</span>;
  }
  return <span style={{ background: '#f3f4f6', color: '#666', borderRadius: 6, padding: '2px 7px', fontSize: '.87rem', fontWeight: 700 }}>Interno</span>;
}

function TipoBadge({ tipo }: { tipo?: TipoServico }) {
  const cores: Record<TipoServico, { bg: string; fg: string }> = {
    HR: { bg: '#dbeafe', fg: '#1d4ed8' },
    KM: { bg: '#dcfce7', fg: '#15803d' },
    OUTRO: { bg: '#f3f4f6', fg: '#666' },
  };
  const c = cores[tipo || 'OUTRO'];
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: '2px 7px', fontSize: '.87rem', fontWeight: 700 }}>
      {tipo === 'OUTRO' || !tipo ? 'Outro' : tipo}
    </span>
  );
}

function Sel({ label, value, onChange, options }: { label: string; value: string | number; onChange: (v: string) => void; options: Array<{ value: string | number; label: string }> }) {
  return (
    <div>
      <label style={{ display: 'block', color: '#888', fontSize: '.87rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ padding: '9px 12px', border: '1px solid #e0e0e0', background: '#fff', color: '#333', borderRadius: 8, fontSize: '.92rem', outline: 'none' }}>
        {options.map((o) => <option key={String(o.value)} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

