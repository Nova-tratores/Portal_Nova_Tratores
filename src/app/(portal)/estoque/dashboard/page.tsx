'use client';
// Dashboard de Vendas. Consome /api/estoque/dashboard{,/historico,/categorias-vendas,
// /vendas,/pedido-itens,/compras,/tendencia}.
// Layout: faixa de KPIs → tendência 12 meses → detalhe em duas colunas (Peças+Serviços
// | Máquinas). Cor do VALOR é sempre neutra; verde/vermelho só para variação %.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from 'recharts';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
type Metrica = 'venda' | 'custo' | 'margem';

// Cor do VALOR é sempre neutra; verde/vermelho SÓ para variação %.
const COR_INK = '#1f2937';
const COR_UP = '#16a34a';
const COR_DOWN = '#dc2626';
const COR_MUTED = '#9ca3af'; // variação suprimida (base baixa no período anterior)
// Cores de IDENTIDADE de seção (borda/acento) — nunca aplicadas ao valor.
const ACCENT = { geral: '#111827', maquinas: '#d97706', pecas: '#dc2626', servicos: '#0891b2', comprei: '#4f46e5' };
// Limiares de base baixa (item 9): abaixo disso, variação vira cinza sem verde/vermelho.
const BASE_MIN_PECAS = 1000; // R$ no período anterior
const BASE_MIN_MAQ_UN = 2; // unidades no período anterior

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
  proporcao: number | null;
  diasUteisTranscorridos: number | null;
  diasUteisTotal: number | null;
  erro?: string;
}
interface TendPonto { label: string; mes: number; ano: number; pecas: number; servicos: number; maquinas: number; total: number; deltaPct: number | null }
interface HistMes { label: string; mes: number; ano: number; valor: number; custo: number; qtdePedidos: number; valorNota?: number | null; valorInterno?: number | null }
interface HistResp { card: number; nome: string; meses: HistMes[]; erro?: string }
interface VendaRow {
  numero_pedido?: string; data_pedido?: string; descricao?: string; codigo_produto?: string;
  quantidade?: number; valor_unitario?: number; valor_total?: number; cmc_unitario?: number;
}
interface CompraRow {
  numero_nf?: string | null; data_nota?: string | null; codigo_produto?: string | null; descricao?: string | null;
  quantidade?: number | string | null; valor_unitario?: number | string | null; valor_total?: number | string | null;
}
type InternoBalde = 'retorno' | 'puro' | null;
interface OSRow { numero_os?: string; data?: string; cliente?: string; codigo_cliente?: number | null; valor?: number; conta?: string; tem_nota?: boolean | null; internoBalde?: InternoBalde }
type TipoServico = 'HR' | 'KM' | 'OUTRO';
interface ServicoOSRow {
  numero_os?: string; data?: string; cliente?: string; codigo_cliente?: number | null;
  descricao?: string; tipo?: TipoServico; categoria?: string; categoria_desc?: string;
  qtde?: number; valor_unit?: number; valor_total?: number; conta?: string; tem_nota?: boolean | null;
  internoBalde?: InternoBalde;
}

// Teto de linhas renderizadas nas tabelas de drill-down (o "Ano inteiro" traz
// milhares). Os totais/somas exibidos sempre consideram TODAS as linhas.
const LIMITE_LINHAS = 800;

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };

function fmtPct(v: number): string {
  const s = v >= 0 ? '+' : '';
  return s + v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}
// "Pecas"/"Servicos" → "Peças"/"Serviços" na exibição (dado vem sem acento da config).
function fixLabel(s: string): string {
  return s.replace(/Pecas/g, 'Peças').replace(/Peças Diversas/g, 'Peças diversas').replace(/Servicos/g, 'Serviços');
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
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam, setConta } = useConta();

  // Esta tela sempre abre com Conta = "Todas" (pedido do usuário).
  useEffect(() => { setConta(''); }, [setConta]);

  const now = new Date();
  // mes = 0 → "Ano inteiro" (jan–dez do ano selecionado).
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const ehAno = mes === 0;
  const periodoParam = ehAno ? 'mes=0&modo=ano' : 'mes=' + mes;
  const [categoria, setCategoria] = useState('');
  const [metrica, setMetrica] = useState<Metrica>('venda');

  const [dados, setDados] = useState<DashboardResp | null>(null);
  const [tendencia, setTendencia] = useState<TendPonto[] | null>(null);
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

  // Itens que compõem o card "Comprei" (peças por NF de entrada).
  const [comprasAberto, setComprasAberto] = useState(false);
  const [comprasItens, setComprasItens] = useState<CompraRow[] | null>(null);

  // OS do card Serviços (popup): visão "Serviços" (itens HR/KM) × "Por OS"
  const [osAberto, setOsAberto] = useState(false);
  const [osServicos, setOsServicos] = useState<OSRow[] | null>(null);
  const [servItens, setServItens] = useState<ServicoOSRow[] | null>(null);
  const [osView, setOsView] = useState<'servicos' | 'os'>('servicos');
  const [tipoFiltro, setTipoFiltro] = useState<TipoServico | null>(null);
  const [osPendente, setOsPendente] = useState(false);
  const [osErro, setOsErro] = useState('');

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

  // Carrega opções de categoria ao montar / trocar conta
  useEffect(() => {
    fetch(`/api/estoque/dashboard/categorias-vendas?_=1${contaParam}`)
      .then((r) => r.json())
      .then((d) => setCategoriasOpts(d.categorias || []))
      .catch(() => setCategoriasOpts([]));
  }, [contaParam]);

  // Tendência 12 meses (não depende do período/categoria — só da conta).
  useEffect(() => {
    fetch(`/api/estoque/dashboard/tendencia?_=1${contaParam}`)
      .then((r) => r.json())
      .then((d) => {
        const raw = (d.pontos || []) as Array<{ label: string; mes: number; ano: number; pecas: number; servicos: number; maquinas: number }>;
        let prev = 0;
        setTendencia(raw.map((p, i) => {
          const total = p.pecas + p.servicos + p.maquinas;
          const deltaPct = i === 0 || prev <= 0 ? null : ((total - prev) / prev) * 100;
          prev = total;
          return { ...p, total, deltaPct };
        }));
      })
      .catch(() => setTendencia(null));
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
    const r = await fetch(`/api/estoque/dashboard/vendas?${periodoParam}&ano=${ano}&card=${cardIdx}${catParam}${contaParam}`);
    const d = await r.json();
    if (!d.erro) setVendas(d.vendas || []);
  }, [periodoParam, ano, categoria, contaParam]);

  // Itens do card "Comprei": as peças (por NF de entrada) que somam o valor.
  const abrirCompras = useCallback(async () => {
    setComprasItens(null);
    setComprasAberto(true);
    const r = await fetch(`/api/estoque/dashboard/compras?${periodoParam}&ano=${ano}${contaParam}`);
    const d = await r.json();
    if (!d.erro) setComprasItens(d.compras || []);
  }, [periodoParam, ano, contaParam]);

  // Drill do card de máquina: reaproveita o popup de vendas, filtrando pela
  // família (ou '__TODAS__' no card-resumo). Não usa filtro de categoria de peça.
  const abrirVendasMaquina = useCallback(async (familia: string, nome: string) => {
    setVendas(null);
    setVendasCard({ idx: -1, nome });
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

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Dashboard de Vendas</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Peças, Serviços e Máquinas — resumo, tendência e detalhe</p>
        </div>
        <ContaSelector />
      </div>

      {/* Navegação (menu horizontal para as telas irmãs) */}
      <div style={{ display: 'flex', gap: 2, margin: '14px 0 18px', flexWrap: 'wrap', borderBottom: '1px solid #eee' }}>
        <span style={{ fontSize: '.8rem', fontWeight: 700, color: '#111827', padding: '8px 14px', borderBottom: '2px solid #111827' }}>Dashboard</span>
        {navItens.map(([href, label]) => (
          <Link key={href} href={href} style={{ fontSize: '.8rem', fontWeight: 600, color: '#6b7280', textDecoration: 'none', padding: '8px 14px' }}>{label}</Link>
        ))}
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 4, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Período" value={mes} onChange={(v) => setMes(parseInt(v))}
          options={[{ value: 0, label: 'Ano inteiro' }, ...MESES.map((m, i) => ({ value: i + 1, label: m }))]} />
        <Sel label="Ano" value={ano} onChange={(v) => setAno(parseInt(v))} options={anos.map((y) => ({ value: y, label: String(y) }))} />
        <Sel label="Categoria de peças" value={categoria} onChange={setCategoria} options={[{ value: '', label: 'Todas' }, ...categoriasOpts.map((c) => ({ value: c.codigo, label: c.descricao }))]} />
        <div style={{ display: 'flex', gap: 4, marginLeft: 'auto' }}>
          {(['venda', 'custo', 'margem'] as Metrica[]).map((m) => (
            <button key={m} onClick={() => setMetrica(m)}
              style={{ padding: '8px 14px', border: '1px solid', borderColor: metrica === m ? '#111827' : '#e0e0e0', background: metrica === m ? '#111827' : '#fff', color: metrica === m ? '#fff' : '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', textTransform: 'capitalize' }}>
              {m}
            </button>
          ))}
        </div>
      </div>
      <div style={{ fontSize: '.68rem', color: '#9ca3af', marginBottom: 16 }}>Categoria e Venda/Custo/Margem aplicam-se aos cards de <b>Peças</b>. Os KPIs mostram faturamento.</div>

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {dados && (() => {
        const cats = dados.categorias;
        const get = (t: string) => cats.find((c) => c.cardType === t);
        const cPecas = get('totalPecas');
        const cServ = get('servico');
        const cMaqTotal = get('totalMaquinas');
        const cComprei = get('compras');
        const pecasCats = cats.filter((c) => c.cardType === 'produto').slice().sort((a, b) => b.valorAtual - a.valorAtual);
        const maqFamilias = cats.filter((c) => c.cardType === 'maquina').slice().sort((a, b) => b.valorAtual - a.valorAtual);
        const totalPecasVenda = cPecas?.valorAtual ?? pecasCats.reduce((s, c) => s + c.valorAtual, 0);
        const modo = dados.modo;

        // Total Geral (front) = Peças + Serviços + Máquinas.
        const tgAtual = (cPecas?.valorAtual || 0) + (cServ?.valorAtual || 0) + (cMaqTotal?.valorAtual || 0);
        const tgMesAnt = (cPecas?.mesAnteriorValor || 0) + (cServ?.mesAnteriorValor || 0) + (cMaqTotal?.mesAnteriorValor || 0);
        const tgAnoAnt = (cPecas?.anoAnteriorValor || 0) + (cServ?.anoAnteriorValor || 0) + (cMaqTotal?.anoAnteriorValor || 0);
        const razaoCV = totalPecasVenda > 0 && cComprei ? cComprei.valorAtual / totalPecasVenda : null;

        return (
          <>
            {dados.ehMesCorrente && dados.proporcao != null && (
              <div style={{ fontSize: '.75rem', color: '#999', marginBottom: 10 }}>
                {modo === 'ano' ? 'Ano corrente' : 'Mês corrente'} — {dados.diasUteisTranscorridos}/{dados.diasUteisTotal} dias úteis ({Math.round((dados.proporcao || 0) * 100)}%). Comparativos ajustados proporcionalmente.
              </div>
            )}

            {/* FAIXA DE KPIs */}
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
              <KpiCard titulo="Total Geral" accent={ACCENT.geral} valorNode={fmtRS(tgAtual)} subNode="Peças + Serviços + Máquinas"
                varM={calcVar(tgAtual, tgMesAnt)} supM={tgMesAnt < BASE_MIN_PECAS} varA={calcVar(tgAtual, tgAnoAnt)} supA={tgAnoAnt < BASE_MIN_PECAS}
                modo={modo} strongDrop={tgAnoAnt >= BASE_MIN_PECAS && calcVar(tgAtual, tgAnoAnt) < -50} />
              {cMaqTotal && (
                <KpiCard titulo="Máquinas" accent={ACCENT.maquinas}
                  valorNode={`${(cMaqTotal.unidades ?? 0).toLocaleString('pt-BR')} máq.`} subNode={fmtRS(cMaqTotal.valorAtual)}
                  varM={calcVar(cMaqTotal.valorAtual, cMaqTotal.mesAnteriorValor)} supM={(cMaqTotal.unidadesMesAnt ?? 0) < BASE_MIN_MAQ_UN}
                  varA={calcVar(cMaqTotal.valorAtual, cMaqTotal.anoAnteriorValor)} supA={(cMaqTotal.unidadesAnoAnt ?? 0) < BASE_MIN_MAQ_UN}
                  modo={modo} strongDrop={(cMaqTotal.unidadesAnoAnt ?? 0) >= BASE_MIN_MAQ_UN && calcVar(cMaqTotal.valorAtual, cMaqTotal.anoAnteriorValor) < -50} />
              )}
              {cPecas && (
                <KpiCard titulo="Total Peças" accent={ACCENT.pecas} valorNode={fmtRS(cPecas.valorAtual)}
                  varM={cPecas.varMesAnterior} supM={cPecas.mesAnteriorValor < BASE_MIN_PECAS} varA={cPecas.varAnoAnterior} supA={cPecas.anoAnteriorValor < BASE_MIN_PECAS}
                  modo={modo} strongDrop={cPecas.anoAnteriorValor >= BASE_MIN_PECAS && cPecas.varAnoAnterior < -50} />
              )}
              {cServ && (
                <KpiCard titulo="Serviços" accent={ACCENT.servicos} valorNode={fmtRS(cServ.valorAtual)}
                  varM={cServ.varMesAnterior} supM={cServ.mesAnteriorValor < BASE_MIN_PECAS} varA={cServ.varAnoAnterior} supA={cServ.anoAnteriorValor < BASE_MIN_PECAS}
                  modo={modo} strongDrop={cServ.anoAnteriorValor >= BASE_MIN_PECAS && cServ.varAnoAnterior < -50} />
              )}
              {cComprei && (
                <KpiCard titulo="Comprei" accent={ACCENT.comprei} valorNode={fmtRS(cComprei.valorAtual)} subNode="entradas de peças (NF)"
                  varM={cComprei.varMesAnterior} supM={cComprei.mesAnteriorValor < BASE_MIN_PECAS} varA={cComprei.varAnoAnterior} supA={cComprei.anoAnteriorValor < BASE_MIN_PECAS}
                  modo={modo} onDrill={abrirCompras} drillLabel="ver itens"
                  extraNode={razaoCV != null && (
                    <div style={{ fontSize: '.66rem', color: '#6b7280', marginTop: 6 }}>
                      Razão compra/venda: <b>{razaoCV.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}x</b>
                      {razaoCV > 2 && <span style={{ marginLeft: 6, color: '#b45309', background: '#fef3c7', border: '1px solid #fde68a', borderRadius: 6, padding: '1px 6px', fontSize: '.58rem', fontWeight: 700 }}>estocando acima da venda</span>}
                    </div>
                  )} />
              )}
            </div>

            {/* TENDÊNCIA 12 MESES */}
            {tendencia && tendencia.length > 0 && (
              <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '14px 16px 8px', marginBottom: 18 }}>
                <div style={{ fontSize: '.72rem', color: '#6b7280', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 6 }}>Tendência · últimos 12 meses</div>
                <TendenciaChart pontos={tendencia} />
              </div>
            )}

            {/* DETALHE EM DUAS COLUNAS */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, alignItems: 'start' }}>
              {/* Esquerda: Peças por categoria + Serviços */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <Secao titulo="Peças por categoria" accent={ACCENT.pecas}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                    {pecasCats.map((c, i) => (
                      <PecaCard key={i} c={c} modo={modo} metrica={metrica}
                        pctMix={totalPecasVenda > 0 ? (c.valorAtual / totalPecasVenda) * 100 : 0}
                        onHist={() => abrirHistorico(cardIndexParaApi(c, dados))}
                        onVendas={() => abrirVendas(cardIndexParaApi(c, dados), fixLabel(c.nome))} />
                    ))}
                  </div>
                </Secao>
                {cServ && <ServicosDecomp c={cServ} onDetalhe={abrirOSServicos} />}
              </div>

              {/* Direita: Máquinas por família */}
              <div>
                <Secao titulo="Máquinas por família" accent={ACCENT.maquinas}
                  hint={metrica !== 'venda' ? 'o filtro Venda/Custo/Margem não se aplica a máquinas' : undefined}>
                  {maqFamilias.length === 0 ? (
                    <div style={{ color: '#9ca3af', fontSize: '.82rem' }}>Sem vendas de máquina no período.</div>
                  ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
                      {maqFamilias.map((c, i) => (
                        <MaquinaCard key={i} c={c} modo={modo}
                          onVendas={() => abrirVendasMaquina(c.nome === 'Outras máquinas' ? '__TODAS__' : c.nome, fixLabel(c.nome))} />
                      ))}
                    </div>
                  )}
                </Secao>
              </div>
            </div>
          </>
        );
      })()}

      {/* Histórico */}
      {histCard != null && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, margin: '18px 0' }}>
          <h2 style={{ color: '#111827', fontSize: '.95rem', fontWeight: 700, marginBottom: 12 }}>Histórico — {hist?.nome ? fixLabel(hist.nome) : '…'}</h2>
          {!hist ? <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div> : (() => {
            const temSplit = hist.meses.some((m) => m.valorNota != null);
            const custoTodoZero = hist.meses.every((m) => !m.custo);
            return (
              <div style={{ width: '100%', height: 320 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={hist.meses}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => 'R$ ' + (v / 1000).toFixed(0) + 'k'} />
                    <Tooltip formatter={(v: number) => fmtRS(v)} />
                    <Legend />
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
            <h2 style={{ color: '#111827', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>Vendas — {vendasCard.nome} ({vendas?.length ?? 0})</h2>
            {vendas && vendas.length > 0 && <button onClick={exportarCSV} style={linkBtn}>exportar CSV</button>}
          </div>
          {!vendas ? <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div> : vendas.length === 0 ? <div style={{ color: '#888', fontSize: '.85rem' }}>Sem vendas no período.</div> : (
            <div style={{ overflowX: 'auto' }}>
              {vendas.length > LIMITE_LINHAS && (
                <div style={{ color: '#999', fontSize: '.72rem', marginBottom: 6 }}>
                  Mostrando as {LIMITE_LINHAS} primeiras de {vendas.length.toLocaleString('pt-BR')} linhas — o CSV exporta tudo.
                </div>
              )}
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Pedido', 'Data', 'Descrição', 'Qtd', 'V. Unit', 'V. Total', 'CMC'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {vendas.slice(0, LIMITE_LINHAS).map((v, i) => (
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

      {/* Popup do card Serviços: itens de serviço (HR/KM) × lista de OS */}
      {osAberto && (
        <div onClick={() => setOsAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 1100, width: '94%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ color: '#111827', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>
                Serviços — {osView === 'servicos' ? `itens (${servItens?.length ?? 0})` : `Ordens de Serviço (${osServicos?.length ?? 0})`}
                {osServicos && osServicos.length > 0 && (
                  <span style={{ color: '#888', fontWeight: 600, marginLeft: 8 }}>· Total {fmtRS(osServicos.reduce((s, o) => s + (o.valor || 0), 0))}</span>
                )}
              </h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([['servicos', 'Serviços'], ['os', 'Por OS']] as Array<['servicos' | 'os', string]>).map(([v, rotulo]) => (
                    <button key={v} onClick={() => setOsView(v)}
                      style={{ padding: '5px 12px', border: '1px solid', borderColor: osView === v ? '#111827' : '#e0e0e0', background: osView === v ? '#111827' : '#fff', color: osView === v ? '#fff' : '#666', borderRadius: 8, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer' }}>
                      {rotulo}
                    </button>
                  ))}
                </div>
                <button onClick={() => setOsAberto(false)} style={linkBtn}>fechar</button>
              </div>
            </div>

            {osErro && <div style={{ color: '#dc2626', fontSize: '.82rem', marginBottom: 10 }}>{osErro}</div>}
            {osPendente && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '.78rem', marginBottom: 10 }}>
                Sincronizando {ehAno ? 'os meses que faltam' : 'este mês'} com a Omie em segundo plano — feche e abra o popup novamente em ~1–2 minutos.
                {ehAno && ' (um mês por vez, para não sobrecarregar a Omie)'}
              </div>
            )}
            {osView === 'servicos' ? (
              !servItens ? (osErro ? null : <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>) : servItens.length === 0 ? (osPendente ? null : <div style={{ color: '#888', fontSize: '.85rem' }}>Sem serviços faturados no período.</div>) : (
                <>
                  {/* Resumo por tipo (clique filtra) */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {(['HR', 'KM', 'OUTRO'] as TipoServico[]).map((t) => {
                      const doTipo = servItens.filter((s) => s.tipo === t);
                      const soma = doTipo.reduce((s, x) => s + (x.valor_total || 0), 0);
                      const qtd = doTipo.reduce((s, x) => s + (x.qtde || 0), 0);
                      const ativo = tipoFiltro === t;
                      const unidade = t === 'HR' ? `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h` : t === 'KM' ? `${qtd.toLocaleString('pt-BR', { maximumFractionDigits: 0 })} km` : `${doTipo.length} itens`;
                      return (
                        <button key={t} onClick={() => setTipoFiltro(ativo ? null : t)}
                          style={{ padding: '7px 12px', border: '1px solid', borderColor: ativo ? '#111827' : '#e0e0e0', background: ativo ? '#f3f4f6' : '#fafafa', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ fontSize: '.62rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>{tipoRotulo(t)}</div>
                          <div style={{ fontSize: '.88rem', fontWeight: 700, color: COR_INK }}>{fmtRS(soma)} <span style={{ color: '#999', fontWeight: 600, fontSize: '.7rem' }}>· {unidade}</span></div>
                        </button>
                      );
                    })}
                  </div>
                  {(() => {
                    const n = servItens.filter((s) => !tipoFiltro || s.tipo === tipoFiltro).length;
                    return n > LIMITE_LINHAS ? (
                      <div style={{ color: '#999', fontSize: '.72rem', marginBottom: 6 }}>
                        Mostrando as {LIMITE_LINHAS} primeiras de {n.toLocaleString('pt-BR')} linhas (os totais acima consideram todas).
                      </div>
                    ) : null;
                  })()}
                  <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead><tr>{['OS', 'Data', 'Cliente', 'Serviço', 'Tipo', 'Nota', 'Categoria', ...(contaParam === '' ? ['Conta'] : []), 'Qtd', 'V. Unit', 'V. Total'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                      <tbody>
                        {servItens.filter((s) => !tipoFiltro || s.tipo === tipoFiltro).slice(0, LIMITE_LINHAS).map((s, i) => (
                          <tr key={i}>
                            <td style={tdStyle}>{s.numero_os}</td>
                            <td style={tdStyle}>{s.data}</td>
                            <td style={tdStyle}>{s.cliente || (s.codigo_cliente ? '#' + s.codigo_cliente : '—')}</td>
                            <td style={{ ...tdStyle, maxWidth: 320 }} title={s.descricao}>{(s.descricao || '—').length > 70 ? (s.descricao || '').slice(0, 70) + '…' : (s.descricao || '—')}</td>
                            <td style={tdStyle}><TipoBadge tipo={s.tipo} /></td>
                            <td style={tdStyle}><NotaBadge temNota={s.tem_nota} balde={s.internoBalde} /></td>
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
              !osServicos ? (osErro ? null : <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>) : osServicos.length === 0 ? (osPendente ? null : <div style={{ color: '#888', fontSize: '.85rem' }}>Sem OS faturadas no período.</div>) : (
                <>
                {osServicos.length > LIMITE_LINHAS && (
                  <div style={{ color: '#999', fontSize: '.72rem', marginBottom: 6 }}>
                    Mostrando as {LIMITE_LINHAS} primeiras de {osServicos.length.toLocaleString('pt-BR')} OS (o total acima considera todas).
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['OS', 'Data', 'Cliente', 'Nota', ...(contaParam === '' ? ['Conta'] : []), 'Valor'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {osServicos.slice(0, LIMITE_LINHAS).map((o, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{o.numero_os}</td>
                        <td style={tdStyle}>{o.data}</td>
                        <td style={tdStyle}>{o.cliente || (o.codigo_cliente ? '#' + o.codigo_cliente : '—')}</td>
                        <td style={tdStyle}><NotaBadge temNota={o.tem_nota} balde={o.internoBalde} /></td>
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
              <h2 style={{ color: '#111827', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>Pedido {pedidoItens.numero}</h2>
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

      {/* Popup dos itens do "Comprei": peças por NF de entrada que somam o valor */}
      {comprasAberto && (
        <div onClick={() => setComprasAberto(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 20, maxWidth: 900, width: '92%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
              <h2 style={{ color: '#111827', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>
                Comprei — itens ({comprasItens?.length ?? 0})
                {comprasItens && comprasItens.length > 0 && (
                  <span style={{ color: '#888', fontWeight: 600, marginLeft: 8 }}>· Total {fmtRS(comprasItens.reduce((s, c) => s + (Number(c.valor_total) || 0), 0))}</span>
                )}
              </h2>
              <button onClick={() => setComprasAberto(false)} style={linkBtn}>fechar</button>
            </div>
            {!comprasItens ? <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div> : comprasItens.length === 0 ? <div style={{ color: '#888', fontSize: '.85rem' }}>Sem compras de peças no período.</div> : (
              <div style={{ overflowX: 'auto' }}>
                {comprasItens.length > LIMITE_LINHAS && (
                  <div style={{ color: '#999', fontSize: '.72rem', marginBottom: 6 }}>
                    Mostrando as {LIMITE_LINHAS} primeiras de {comprasItens.length.toLocaleString('pt-BR')} linhas (o total acima considera todas).
                  </div>
                )}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Produto', 'NF', 'Data', 'Qtd', 'V. Unit', 'V. Total'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {comprasItens.slice(0, LIMITE_LINHAS).map((c, i) => (
                      <tr key={i}>
                        <td style={{ ...tdStyle, maxWidth: 340 }} title={c.descricao || ''}>{c.descricao || c.codigo_produto || '—'}</td>
                        <td style={tdStyle}>{c.numero_nf}</td>
                        <td style={tdStyle}>{c.data_nota}</td>
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

const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#2563eb', fontSize: '.74rem', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

// Variação (Mês/Ano ant.): verde/vermelho, ou cinza quando a base do período
// anterior é baixa (item 9) — nesse caso não induz leitura de bom/ruim.
function Delta({ label, v, sup }: { label: string; v: number; sup: boolean }) {
  const cor = sup ? COR_MUTED : v >= 0 ? COR_UP : COR_DOWN;
  return <span title={sup ? 'base baixa no período anterior' : undefined} style={{ color: cor }}>{label}: {fmtPct(v)}</span>;
}

function KpiCard({ titulo, accent, valorNode, subNode, varM, supM, varA, supA, modo, strongDrop, extraNode, onDrill, drillLabel }: {
  titulo: string; accent: string; valorNode: React.ReactNode; subNode?: React.ReactNode;
  varM: number; supM: boolean; varA: number; supA: boolean; modo?: 'mes' | 'ano'; strongDrop?: boolean; extraNode?: React.ReactNode;
  onDrill?: () => void; drillLabel?: string;
}) {
  return (
    <div style={{ flex: '1 1 170px', background: '#fff', border: strongDrop ? '2px solid ' + COR_DOWN : '1px solid #e5e7eb', borderTop: '3px solid ' + accent, borderRadius: 12, padding: 14, boxShadow: '0 1px 3px rgba(0,0,0,.04)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: '.66rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>{titulo}</span>
        {strongDrop && <span style={{ fontSize: '.56rem', fontWeight: 700, color: COR_DOWN, background: '#fee2e2', border: '1px solid #fecaca', borderRadius: 6, padding: '1px 6px', whiteSpace: 'nowrap' }}>queda acentuada</span>}
      </div>
      <div style={{ fontSize: '1.3rem', fontWeight: 700, color: COR_INK, fontVariantNumeric: 'tabular-nums' }}>{valorNode}</div>
      {subNode && <div style={{ fontSize: '.78rem', color: '#6b7280', marginTop: 1 }}>{subNode}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: '.68rem', flexWrap: 'wrap' }}>
        {modo !== 'ano' && <Delta label="Mês ant" v={varM} sup={supM} />}
        <Delta label="Ano ant" v={varA} sup={supA} />
      </div>
      {extraNode}
      {onDrill && <div style={{ marginTop: 8 }}><button onClick={onDrill} style={linkBtn}>{drillLabel || 'ver itens'}</button></div>}
    </div>
  );
}

function Secao({ titulo, accent, hint, children }: { titulo: string; accent: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ marginBottom: 10, borderLeft: '3px solid ' + accent, paddingLeft: 8 }}>
        <div style={{ fontSize: '.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: '#374151' }}>{titulo}</div>
        {hint && <div style={{ fontSize: '.64rem', color: '#9ca3af', marginTop: 1 }}>{hint}</div>}
      </div>
      {children}
    </div>
  );
}

function PecaCard({ c, modo, metrica, pctMix, onHist, onVendas }: {
  c: Categoria; modo?: 'mes' | 'ano'; metrica: Metrica; pctMix: number; onHist: () => void; onVendas: () => void;
}) {
  const zero = c.valorAtual === 0 && c.custoAtual === 0;
  const atual = valorMetrica(c, metrica, 'atual');
  const varM = calcVar(atual, valorMetrica(c, metrica, 'mesAnt'));
  const varA = calcVar(atual, valorMetrica(c, metrica, 'anoAnt'));
  const margemPct = c.valorAtual > 0 ? (c.margemAtual / c.valorAtual) * 100 : 0;
  return (
    <div style={{ background: zero ? '#fafafa' : '#fff', border: '1px solid #eee', borderRadius: 10, padding: 12, opacity: zero ? 0.6 : 1 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
        <span style={{ fontSize: '.66rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700 }}>{fixLabel(c.nome)}</span>
        {!zero && <span style={{ fontSize: '.62rem', color: '#9ca3af', whiteSpace: 'nowrap' }}>{pctMix.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}% do total</span>}
      </div>
      {zero ? (
        <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: 4 }}>sem vendas no período</div>
      ) : (
        <>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: COR_INK, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(atual)}</div>
          {metrica === 'venda' && <div style={{ fontSize: '.64rem', color: '#6b7280' }}>margem {margemPct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: '.62rem', flexWrap: 'wrap' }}>
            {modo !== 'ano' && <Delta label="Mês" v={varM} sup={c.mesAnteriorValor < BASE_MIN_PECAS} />}
            <Delta label="Ano" v={varA} sup={c.anoAnteriorValor < BASE_MIN_PECAS} />
          </div>
          <div style={{ marginTop: 8 }}>
            <button onClick={onHist} style={linkBtn}>histórico</button>
            <button onClick={onVendas} style={{ ...linkBtn, marginLeft: 10 }}>vendas</button>
          </div>
        </>
      )}
    </div>
  );
}

function MaquinaCard({ c, modo, onVendas }: { c: Categoria; modo?: 'mes' | 'ano'; onVendas: () => void }) {
  const un = c.unidades ?? 0;
  const zero = un === 0 && c.valorAtual === 0;
  const ticket = un > 0 ? c.valorAtual / un : 0;
  const varM = calcVar(c.valorAtual, c.mesAnteriorValor);
  const varA = calcVar(c.valorAtual, c.anoAnteriorValor);
  return (
    <div style={{ background: zero ? '#fafafa' : '#fff', border: '1px solid #f0e6d5', borderRadius: 10, padding: 12, opacity: zero ? 0.6 : 1 }}>
      <div style={{ fontSize: '.66rem', color: '#92610e', textTransform: 'uppercase', letterSpacing: '.4px', fontWeight: 700 }}>{fixLabel(c.nome)}</div>
      {zero ? (
        <div style={{ fontSize: '.78rem', color: '#9ca3af', marginTop: 4 }}>sem vendas no período</div>
      ) : (
        <>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: COR_INK, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{un.toLocaleString('pt-BR')} {un === 1 ? 'máquina' : 'máquinas'}</div>
          <div style={{ fontSize: '.76rem', color: '#6b7280' }}>{fmtRS(c.valorAtual)} · ticket {fmtRS(ticket)}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6, fontSize: '.62rem', flexWrap: 'wrap' }}>
            {modo !== 'ano' && <Delta label="Mês" v={varM} sup={(c.unidadesMesAnt ?? 0) < BASE_MIN_MAQ_UN} />}
            <Delta label="Ano" v={varA} sup={(c.unidadesAnoAnt ?? 0) < BASE_MIN_MAQ_UN} />
          </div>
          <div style={{ marginTop: 8 }}><button onClick={onVendas} style={linkBtn}>ver vendas</button></div>
        </>
      )}
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
  if (c.valorInternoRetorno != null) linhas.push({ label: 'Interno c/ retorno', valor: c.valorInternoRetorno, somado: true });
  if (c.valorInternoPuro != null) linhas.push({ label: 'Interno puro', valor: c.valorInternoPuro, somado: false });
  else if (c.valorInterno != null) linhas.push({ label: 'Interno', valor: c.valorInterno, somado: false });
  const maxv = Math.max(1, ...linhas.map((l) => Math.abs(l.valor)));
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14, borderLeft: '3px solid ' + ACCENT.servicos }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
        <span style={{ fontSize: '.72rem', color: '#374151', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px' }}>Serviços — decomposição</span>
        <button onClick={onDetalhe} style={linkBtn}>ver detalhe</button>
      </div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: COR_INK, marginBottom: 10, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(c.valorAtual)} <span style={{ fontSize: '.7rem', color: '#9ca3af', fontWeight: 400 }}>receita</span></div>
      {linhas.length === 0 ? <div style={{ fontSize: '.78rem', color: '#9ca3af' }}>Sem detalhe no período.</div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {linhas.map((l, i) => (
            <div key={i}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.72rem', color: l.somado ? '#374151' : '#9ca3af' }}>
                <span>{l.label}{!l.somado && <span style={{ fontSize: '.62rem' }}> (não somado)</span>}</span>
                <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(l.valor)}</span>
              </div>
              <div style={{ height: 5, background: '#f3f4f6', borderRadius: 3, marginTop: 2, overflow: 'hidden' }}>
                <div style={{ height: '100%', width: Math.max(2, (Math.abs(l.valor) / maxv) * 100) + '%', background: l.somado ? ACCENT.servicos : '#d1d5db', borderRadius: 3 }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface TendTooltipProps { active?: boolean; label?: string; payload?: Array<{ payload: TendPonto }> }
function TendTooltip({ active, payload, label }: TendTooltipProps) {
  if (!active || !payload || !payload.length) return null;
  const p = payload[0].payload;
  const row = (nome: string, v: number, cor: string) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: cor }}>{nome}</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(v)}</span></div>
  );
  return (
    <div style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, padding: '8px 10px', fontSize: '.72rem', boxShadow: '0 2px 8px rgba(0,0,0,.1)' }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
      {row('Peças', p.pecas, ACCENT.pecas)}
      {row('Serviços', p.servicos, ACCENT.servicos)}
      {row('Máquinas', p.maquinas, ACCENT.maquinas)}
      <div style={{ borderTop: '1px solid #eee', marginTop: 4, paddingTop: 4, display: 'flex', justifyContent: 'space-between', gap: 16 }}><span>Total</span><span style={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{fmtRS(p.total)}</span></div>
      {p.deltaPct != null && <div style={{ marginTop: 2, color: p.deltaPct >= 0 ? COR_UP : COR_DOWN }}>vs mês anterior: {fmtPct(p.deltaPct)}</div>}
    </div>
  );
}

function TendenciaChart({ pontos }: { pontos: TendPonto[] }) {
  return (
    <div style={{ width: '100%', height: 300 }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={pontos} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => 'R$ ' + (v / 1000).toFixed(0) + 'k'} />
          <Tooltip content={<TendTooltip />} cursor={{ fill: 'rgba(0,0,0,.03)' }} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar dataKey="pecas" stackId="a" name="Peças" fill={ACCENT.pecas} />
          <Bar dataKey="servicos" stackId="a" name="Serviços" fill={ACCENT.servicos} />
          <Bar dataKey="maquinas" stackId="a" name="Máquinas" fill={ACCENT.maquinas} radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function tipoRotulo(t: TipoServico): string {
  return t === 'HR' ? 'HR — Hora trabalhada' : t === 'KM' ? 'KM — Deslocamento' : 'Outros';
}

function NotaBadge({ temNota, balde }: { temNota?: boolean | null; balde?: InternoBalde }) {
  if (temNota == null) return <span title="Ainda não verificado" style={{ color: '#bbb', fontSize: '.7rem' }}>—</span>;
  if (temNota) {
    return <span style={{ background: '#ede9fe', color: '#6d28d9', borderRadius: 6, padding: '2px 7px', fontSize: '.66rem', fontWeight: 700 }}>Com nota</span>;
  }
  // Sem nota: distingue interno que rendeu (garantia/entrega/revisão) do interno puro (cortesia/interno).
  if (balde === 'retorno') {
    return <span title="Garantia de fábrica, entrega/montagem, revisão ou serviço normal fechado sem nota — rendeu." style={{ background: '#fef3c7', color: '#b45309', borderRadius: 6, padding: '2px 7px', fontSize: '.66rem', fontWeight: 700 }}>Interno c/ retorno</span>;
  }
  if (balde === 'puro') {
    return <span title="Cortesia comercial ou contrato interno/oficina — interno de verdade." style={{ background: '#f3f4f6', color: '#666', borderRadius: 6, padding: '2px 7px', fontSize: '.66rem', fontWeight: 700 }}>Interno puro</span>;
  }
  return <span style={{ background: '#f3f4f6', color: '#666', borderRadius: 6, padding: '2px 7px', fontSize: '.66rem', fontWeight: 700 }}>Interno</span>;
}

function TipoBadge({ tipo }: { tipo?: TipoServico }) {
  const cores: Record<TipoServico, { bg: string; fg: string }> = {
    HR: { bg: '#dbeafe', fg: '#1d4ed8' },
    KM: { bg: '#dcfce7', fg: '#15803d' },
    OUTRO: { bg: '#f3f4f6', fg: '#666' },
  };
  const c = cores[tipo || 'OUTRO'];
  return (
    <span style={{ background: c.bg, color: c.fg, borderRadius: 6, padding: '2px 7px', fontSize: '.66rem', fontWeight: 700 }}>
      {tipo === 'OUTRO' || !tipo ? 'Outro' : tipo}
    </span>
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

// O índice do card na API:
//   produtos → 1..numCats (Pecas Diversas, o último produto, → numCats+1);
//   Servicos → numCats+2; Total Pecas → 0; Total Geral → numCats+3.
function cardIndexParaApi(c: Categoria, dados: DashboardResp): number {
  const produtos = dados.categorias.filter((x) => x.cardType === 'produto');
  const numCats = produtos.length - 1;
  if (c.cardType === 'totalPecas') return 0;
  if (c.cardType === 'servico') return numCats + 2;
  if (c.cardType === 'totalGeral') return numCats + 3;
  const pIdx = produtos.indexOf(c);
  if (pIdx === numCats) return numCats + 1; // Pecas Diversas (catch-all)
  return pIdx + 1;
}
