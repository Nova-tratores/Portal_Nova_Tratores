'use client';
// Cruzamento por família: estoque atual × entradas do mês × saídas (vendas) do mês.
// Consome /api/estoque/cruzamento-familia.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';
import SerieMensalChart, { type PontoMensal, type SerieDef } from '@/components/estoque/SerieMensalChart';
import ComposicaoModal, { type ComposicaoParams } from '@/components/estoque/ComposicaoModal';
import RazaoDetalheModal, { type DetalheParams } from '@/components/estoque/RazaoDetalheModal';

type Tab = 'mes' | 'grafico' | 'estoqueTipo' | 'reconciliacao';
type Dimensao = 'tipo' | 'categoria' | 'familia' | 'tipocarac';
interface SerieResp { pontos: PontoMensal[]; series: SerieDef[]; dimensao: Dimensao; estoqueAtual: { peca: number; maquina: number }; erro?: string }
interface SerieTipoResp { pontos: PontoMensal[]; series: SerieDef[]; estoqueAtual: Record<string, number>; erro?: string }
interface PontoRecon { periodo: string; ano: number; mes: number; estoqueFim: number | null; deltaEstoque: number; [bucket: string]: number | string | null }
interface TotalMetrica { valor: number; nf: number; itens: number }
interface ReconResp { pontos: PontoRecon[]; buckets: string[]; estoqueAtual: number; totalMovimentos: number; totais?: Record<string, TotalMetrica>; erro?: string }
type MetricaRec = 'valor' | 'nf' | 'itens';
// Labels/cores/sinal dos buckets do razão (Reconciliação).
const BUCKET_INFO: Record<string, { label: string; cor: string }> = {
  compra: { label: 'Compra', cor: '#16a34a' },
  entrada_nf: { label: 'Entrada NF', cor: '#16a34a' },
  devolucao_venda: { label: 'Devol. venda', cor: '#16a34a' },
  frete: { label: 'Frete', cor: '#0891b2' },
  venda: { label: 'Venda (COGS)', cor: '#dc2626' },
  remessa: { label: 'Remessa', cor: '#d97706' },
  devolucao_compra: { label: 'Devol. compra', cor: '#dc2626' },
  ajuste: { label: 'Ajuste', cor: '#7c3aed' },
  outro: { label: 'Outro', cor: '#9ca3af' },
};

// R$ sem centavos (gráfico e popup).
const fmtRS0 = (v: number): string => 'R$ ' + Math.round(v).toLocaleString('pt-BR');

// Barras opcionais de faturamento (saída) por grupo, no eixo Y direito.
const BARRA_PECA = { key: 'faturamento_peca', label: 'Faturamento peças', cor: '#dc2626' };
const BARRA_MAQ = { key: 'faturamento_maquina', label: 'Faturamento máquina', cor: '#d97706' };
// SerieDef sintético p/ o clique na barra de faturamento (não vive em `series`).
const sinteticoFat = (key: string): SerieDef | null =>
  key === 'faturamento_peca' ? { ...BARRA_PECA }
  : key === 'faturamento_maquina' ? { ...BARRA_MAQ }
  : null;

// Ordenação das tabelas de meses (clique no cabeçalho → A→Z/Z→A). `col='mes'`
// ordena cronologicamente (ano×100+mes); qualquer outra coluna ordena pelo número.
type PSort = { col: string | null; dir: 1 | -1 };
function ordPontos<T>(rows: T[], s: PSort): T[] {
  if (!s.col) return rows;
  const c = s.col;
  const val = (r: T): number => {
    const o = r as Record<string, unknown>;
    return c === 'mes' ? Number(o.ano ?? 0) * 100 + Number(o.mes ?? 0) : Number(o[c] ?? 0);
  };
  return [...rows].sort((a, b) => { const x = val(a), y = val(b); return x < y ? -s.dir : x > y ? s.dir : 0; });
}
const toggleSort = (s: PSort, col: string): PSort =>
  s.col === col ? { col, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { col, dir: col === 'mes' ? 1 : -1 };
const seta = (s: PSort, col: string): string => (s.col === col ? (s.dir === 1 ? ' ▲' : ' ▼') : '');
const thClick: React.CSSProperties = { cursor: 'pointer', userSelect: 'none' };

interface Linha {
  familia: string;
  tipo: 'maquina' | 'peca' | 'ignorar';
  estoque_qtd: number;
  estoque_valor: number;
  entradas_qtd: number;
  entradas_valor: number;
  saidas_qtd: number;
  saidas_valor: number;
}
interface Totais {
  estoque_qtd: number; estoque_valor: number;
  entradas_qtd: number; entradas_valor: number;
  saidas_qtd: number; saidas_valor: number;
}
interface Resp {
  linhas: Linha[];
  totais: Totais;
  mes: number; ano: number;
  entradasSemFamilia: number;
  erro?: string;
}

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const tdNum: React.CSSProperties = { ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' };
const thNum: React.CSSProperties = { ...thStyle, textAlign: 'right' };
// Célula numérica clicável (abre popup de composição quando tem valor).
const cell = (clicavel: boolean, cor?: string): React.CSSProperties => ({
  ...tdNum,
  color: clicavel ? (cor || '#444') : (cor ? '#bbb' : '#444'),
  cursor: clicavel ? 'pointer' : 'default',
});

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const fmtQtd = (n: number): string => (Math.abs(n % 1) < 1e-9 ? n.toLocaleString('pt-BR') : n.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 }));

type SortKey = keyof Omit<Linha, 'tipo'>;

export default function CruzamentoFamiliaPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { contaParam } = useConta();

  const agora = new Date();
  // Abre direto no "Gráfico mensal" (pedido do usuário).
  const [tab, setTab] = useState<Tab>('grafico');
  const [mes, setMes] = useState(agora.getMonth() + 1);
  const [ano, setAno] = useState(agora.getFullYear());
  const [tipo, setTipo] = useState('');
  const [busca, setBusca] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [dados, setDados] = useState<Resp | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('estoque_valor');
  const [sortDir, setSortDir] = useState<1 | -1>(-1);

  // Aba "Gráfico mensal"
  const [meses, setMeses] = useState(12);
  const [dimensao, setDimensao] = useState<Dimensao>('tipo');
  const [serie, setSerie] = useState<SerieResp | null>(null);
  const [serieCarregando, setSerieCarregando] = useState(false);
  const [serieErro, setSerieErro] = useState('');
  const [mostrarFatPecas, setMostrarFatPecas] = useState(false);
  const [grupo, setGrupo] = useState<'peca' | 'maquina' | 'ambos'>('ambos');
  const [incluirDemo, setIncluirDemo] = useState(true);
  const [grupoRec, setGrupoRec] = useState<'peca' | 'maquina'>('peca');
  // Ordenação (clique no cabeçalho) das tabelas de meses.
  const [sortGraf, setSortGraf] = useState<PSort>({ col: 'mes', dir: 1 });
  const [sortTipo, setSortTipo] = useState<PSort>({ col: 'mes', dir: 1 });
  const [sortRec, setSortRec] = useState<PSort>({ col: 'mes', dir: 1 });
  // Aba "Reconciliação" (razão de estoque — estoque_movimentos)
  const [recon, setRecon] = useState<ReconResp | null>(null);
  const [reconCarregando, setReconCarregando] = useState(false);
  const [reconErro, setReconErro] = useState('');
  const [reconPopup, setReconPopup] = useState<{ titulo: string; params: DetalheParams } | null>(null);
  const [metricaRec, setMetricaRec] = useState<MetricaRec>('valor'); // cards: Valor R$ / Qtd NF / Qtd itens

  // Aba "Estoque por Tipo" (saldo de Peças por característica "Tipo:")
  const [mesesTipo, setMesesTipo] = useState(12);
  const [incluirSemTipo, setIncluirSemTipo] = useState(false);
  const [logScale, setLogScale] = useState(false); // eixo Y logarítmico (gráficos)
  const [linlogTipo, setLinlogTipo] = useState(false); // eixo Y "linlog" (symlog: linear até 30k, log acima) — só nesta aba
  const [ocultarDominantes, setOcultarDominantes] = useState(false); // esconde "Sem tipo"+"Outras" do gráfico
  const [hoverLinhaTipo, setHoverLinhaTipo] = useState<number | null>(null); // realce da linha sob o mouse (tabela)
  const [serieTipo, setSerieTipo] = useState<SerieTipoResp | null>(null);
  const [serieTipoCarregando, setSerieTipoCarregando] = useState(false);
  const [serieTipoErro, setSerieTipoErro] = useState('');

  // Popup de composição (clique em célula).
  const [popup, setPopup] = useState<{ titulo: string; params: ComposicaoParams; resumo?: { valor: number } } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await fetch(`/api/estoque/cruzamento-familia?mes=${mes}&ano=${ano}&tipo=${tipo}${contaParam}`);
      const d = (await r.json()) as Resp;
      if (d.erro) { setErro(d.erro); setDados(null); return; }
      setDados(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, ano, tipo, contaParam]);

  useEffect(() => { if (tab === 'mes') carregar(); }, [carregar, tab]);

  const carregarSerie = useCallback(async () => {
    setSerieCarregando(true);
    setSerieErro('');
    try {
      const r = await fetch(`/api/estoque/cruzamento-familia/serie?meses=${meses}&dimensao=${dimensao}&demo=${incluirDemo ? 1 : 0}${contaParam}`);
      const d = (await r.json()) as SerieResp;
      if (d.erro) { setSerieErro(d.erro); setSerie(null); return; }
      setSerie(d);
    } catch (ex) {
      setSerieErro('Erro: ' + (ex as Error).message);
    } finally {
      setSerieCarregando(false);
    }
  }, [meses, dimensao, incluirDemo, contaParam]);

  useEffect(() => { if (tab === 'grafico') carregarSerie(); }, [carregarSerie, tab]);

  const carregarRecon = useCallback(async () => {
    setReconCarregando(true);
    setReconErro('');
    try {
      const r = await fetch(`/api/estoque/cruzamento-familia/reconciliacao?meses=${meses}&grupo=${grupoRec}${contaParam}`);
      const d = (await r.json()) as ReconResp;
      if (d.erro) { setReconErro(d.erro); setRecon(null); return; }
      setRecon(d);
    } catch (ex) {
      setReconErro('Erro: ' + (ex as Error).message);
    } finally {
      setReconCarregando(false);
    }
  }, [meses, grupoRec, contaParam]);

  useEffect(() => { if (tab === 'reconciliacao') carregarRecon(); }, [carregarRecon, tab]);

  const carregarSerieTipo = useCallback(async () => {
    setSerieTipoCarregando(true);
    setSerieTipoErro('');
    try {
      const r = await fetch(`/api/estoque/cruzamento-familia/serie-tipo?meses=${mesesTipo}&semtipo=${incluirSemTipo ? 1 : 0}${contaParam}`);
      const d = (await r.json()) as SerieTipoResp;
      if (d.erro) { setSerieTipoErro(d.erro); setSerieTipo(null); return; }
      setSerieTipo(d);
    } catch (ex) {
      setSerieTipoErro('Erro: ' + (ex as Error).message);
    } finally {
      setSerieTipoCarregando(false);
    }
  }, [mesesTipo, incluirSemTipo, contaParam]);

  useEffect(() => { if (tab === 'estoqueTipo') carregarSerieTipo(); }, [carregarSerieTipo, tab]);

  const ordenar = (k: SortKey) => {
    if (k === sortKey) setSortDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(k); setSortDir(k === 'familia' ? 1 : -1); }
  };

  const linhas = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    const filtradas = q ? dados.linhas.filter((l) => l.familia.toLowerCase().includes(q)) : dados.linhas;
    return [...filtradas].sort((a, b) => {
      const va = a[sortKey], vb = b[sortKey];
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * sortDir;
      return String(va).localeCompare(String(vb)) * sortDir;
    });
  }, [dados, busca, sortKey, sortDir]);

  const exportarCSV = useCallback(() => {
    if (!dados) return;
    const linhasCsv: string[] = [];
    linhasCsv.push(['Familia', 'Tipo', 'Estoque Qtd', 'Estoque Valor', 'Entradas Qtd', 'Entradas Valor', 'Saidas Qtd', 'Saidas Valor'].join(';'));
    linhas.forEach((l) => linhasCsv.push([
      l.familia.replace(/;/g, ','), l.tipo,
      l.estoque_qtd, l.estoque_valor.toFixed(2),
      l.entradas_qtd, l.entradas_valor.toFixed(2),
      l.saidas_qtd, l.saidas_valor.toFixed(2),
    ].join(';')));
    const blob = new Blob(['﻿' + linhasCsv.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cruzamento-familia-${ano}-${String(mes).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [dados, linhas, mes, ano]);

  // Clique numa célula da TABELA DO GRÁFICO (mês × série) → popup de composição.
  const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const abrirPopupSerie = (s: SerieDef, p: PontoMensal) => {
    const mesN = Number(p.mes), anoN = Number(p.ano);
    const labelMes = `${MESES_ABREV[mesN - 1]}/${anoN}`;
    let params: ComposicaoParams | null = null;
    if (s.key === 'estoque_peca' || s.key === 'estoque_maquina') {
      params = { fonte: 'estoque', grupo: s.key === 'estoque_peca' ? 'peca' : 'maquina' };
    } else if (s.key.startsWith('nf_entrada_')) {
      params = { fonte: 'entrada', mes: mesN, ano: anoN, grupo: s.key.endsWith('peca') ? 'peca' : 'maquina' };
    } else if (s.key.startsWith('nf_saida_')) {
      params = { fonte: 'saida', mes: mesN, ano: anoN, grupo: s.key.endsWith('peca') ? 'peca' : 'maquina' };
    } else if (s.key === 'faturamento_peca' || s.key === 'faturamento_maquina') {
      // Barra de faturamento = saída do mês por grupo.
      params = { fonte: 'saida', mes: mesN, ano: anoN, grupo: s.key.endsWith('peca') ? 'peca' : 'maquina' };
    } else if (s.key.startsWith('entrada::') || s.key.startsWith('saida::')) {
      const fonte: 'entrada' | 'saida' = s.key.startsWith('entrada::') ? 'entrada' : 'saida';
      const nome = s.key.slice((fonte + '::').length);
      if (nome === 'Outras') return;
      params = { fonte, mes: mesN, ano: anoN };
      if (serie?.dimensao === 'familia') params.familia = nome;
      else if (serie?.dimensao === 'tipocarac') params.tipocarac = nome;
      else params.categoria = nome;
    }
    if (params) setPopup({ titulo: `${s.label} — ${s.key.startsWith('estoque') ? 'saldo atual' : labelMes}`, params });
  };

  // Clique numa célula da aba "Estoque por Tipo" → composição daquele Tipo NAQUELE mês.
  // Mês atual = saldo ao vivo (lista item-a-item de `produtos`); meses passados só têm o
  // valor agregado do snapshot (não dá pra reconstruir os itens) → abre em modo "resumo".
  const abrirPopupEstoqueTipo = (s: SerieDef, p: PontoMensal) => {
    const tipo = s.key.slice('estoque::'.length);
    const ehMesAtual = Number(p.mes) === agora.getMonth() + 1 && Number(p.ano) === agora.getFullYear();
    const valorCel = Number(p[s.key] || 0);
    // Meses passados: mostra só o valor da célula (snapshot), sem lista de produtos.
    if (!ehMesAtual) {
      setPopup({ titulo: `${s.label} — ${p.periodo}`, params: { fonte: 'estoque', grupo: 'peca' }, resumo: { valor: valorCel } });
      return;
    }
    // grupo:'peca' espelha a série (só peças) — nunca listar máquinas no popup de Tipo.
    if (tipo === 'Outras') {
      // "Outras" = agregado de vários Tipos → filtra por "não é nenhum dos mostrados".
      const mostrados = (serieTipo?.series || []).map((x) => x.key.slice('estoque::'.length)).filter((t) => t !== 'Outras');
      setPopup({ titulo: `Outras — ${p.periodo} (saldo atual)`, params: { fonte: 'estoque', grupo: 'peca', tipocaracExceto: mostrados, incluirSemTipo } });
      return;
    }
    setPopup({ titulo: `${s.label} — ${p.periodo} (saldo atual)`, params: { fonte: 'estoque', tipocarac: tipo, grupo: 'peca' } });
  };

  // Clique numa célula da TABELA DO MÊS por família → popup de composição.
  const abrirPopupFamilia = (l: Linha, fonte: 'estoque' | 'entrada' | 'saida') => {
    const params: ComposicaoParams = fonte === 'estoque'
      ? { fonte, familia: l.familia }
      : { fonte, mes, ano, familia: l.familia };
    const nomeFonte = fonte === 'estoque' ? 'Estoque (saldo atual)' : fonte === 'entrada' ? `Entradas ${MESES[mes - 1]}/${ano}` : `Saídas ${MESES[mes - 1]}/${ano}`;
    setPopup({ titulo: `${l.familia} — ${nomeFonte}`, params });
  };

  if (!permLoading && userProfile && !temAcesso('estoque')) return <SemPermissao />;

  const t = dados?.totais;
  const anos: number[] = [];
  for (let y = agora.getFullYear(); y >= agora.getFullYear() - 4; y--) anos.push(y);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Cruzamento por Família</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Estoque atual × entradas do mês × saídas (vendas) do mês, por família</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
        <Link href="/estoque/notas-entrada" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Notas de Entrada</Link>
        <Link href="/estoque/curva-abc" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Curva ABC</Link>
      </div>

      {/* Abas */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
        {([['mes', 'Tabela do mês'], ['grafico', 'Gráfico mensal'], ['estoqueTipo', 'Estoque por Tipo'], ['reconciliacao', 'Reconciliação']] as [Tab, string][]).map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)}
            style={{ padding: '8px 16px', border: '1px solid', borderColor: tab === id ? '#dc2626' : '#e0e0e0', background: tab === id ? '#dc2626' : '#fff', color: tab === id ? '#fff' : '#666', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'mes' && (
      <>
      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Mês" value={mes} onChange={(v) => setMes(parseInt(v))} options={MESES.map((nome, i) => ({ value: i + 1, label: nome }))} />
        <Sel label="Ano" value={ano} onChange={(v) => setAno(parseInt(v))} options={anos.map((y) => ({ value: y, label: String(y) }))} />
        <Sel label="Tipo" value={tipo} onChange={setTipo} options={[{ value: '', label: 'Todos' }, { value: 'maquinas', label: 'Máquinas' }, { value: 'pecas', label: 'Peças' }]} />
        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>Buscar família</label>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="filtrar…" style={{ padding: '9px 12px', border: '1px solid #e0e0e0', background: '#fff', color: '#333', borderRadius: 8, fontSize: '.82rem', outline: 'none' }} />
        </div>
        <button onClick={exportarCSV} disabled={!dados} style={{ padding: '9px 16px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', marginLeft: 'auto' }}>Exportar CSV</button>
      </div>

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {t && !carregando && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Resumo titulo="Valor em estoque" valor={fmtRS(t.estoque_valor)} sub={`${fmtQtd(t.estoque_qtd)} un · saldo atual`} />
            <Resumo titulo="Entradas do mês" valor={fmtRS(t.entradas_valor)} sub={`${fmtQtd(t.entradas_qtd)} un`} cor="#16a34a" />
            <Resumo titulo="Saídas (vendas) do mês" valor={fmtRS(t.saidas_valor)} sub={`${fmtQtd(t.saidas_qtd)} un`} cor="#dc2626" />
            <Resumo titulo="Entradas − Saídas" valor={fmtRS(t.entradas_valor - t.saidas_valor)} sub="movimento líquido do mês" cor={t.entradas_valor - t.saidas_valor >= 0 ? '#16a34a' : '#dc2626'} />
          </div>

          {dados!.entradasSemFamilia > 0 && (
            <div style={{ color: '#d97706', fontSize: '.76rem', marginBottom: 10 }}>
              ⚠ {dados!.entradasSemFamilia} item(ns) de entrada sem código casado na tabela de produtos foram agrupados em &quot;Sem família&quot;.
            </div>
          )}

          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...thStyle, borderBottom: 'none', paddingBottom: 2 }} />
                  <th style={{ ...thNum, borderBottom: 'none', paddingBottom: 2, textAlign: 'center' }} colSpan={2}>Estoque atual</th>
                  <th style={{ ...thNum, borderBottom: 'none', paddingBottom: 2, textAlign: 'center', color: '#16a34a' }} colSpan={2}>Entradas mês</th>
                  <th style={{ ...thNum, borderBottom: 'none', paddingBottom: 2, textAlign: 'center', color: '#dc2626' }} colSpan={2}>Saídas mês</th>
                </tr>
                <tr>
                  <th style={thStyle} onClick={() => ordenar('familia')}>Família</th>
                  <th style={thNum} onClick={() => ordenar('estoque_qtd')}>Qtd</th>
                  <th style={thNum} onClick={() => ordenar('estoque_valor')}>Valor</th>
                  <th style={thNum} onClick={() => ordenar('entradas_qtd')}>Qtd</th>
                  <th style={thNum} onClick={() => ordenar('entradas_valor')}>Valor</th>
                  <th style={thNum} onClick={() => ordenar('saidas_qtd')}>Qtd</th>
                  <th style={thNum} onClick={() => ordenar('saidas_valor')}>Valor</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l, i) => (
                  <tr key={i}>
                    <td style={tdStyle}>
                      {l.familia}
                      <span style={{ marginLeft: 6, fontSize: '.6rem', color: '#aaa', textTransform: 'uppercase' }}>{l.tipo === 'maquina' ? 'máq' : l.tipo === 'peca' ? 'peça' : '—'}</span>
                    </td>
                    <td style={cell(!!l.estoque_valor)} onClick={() => l.estoque_valor && abrirPopupFamilia(l, 'estoque')}>{l.estoque_qtd ? fmtQtd(l.estoque_qtd) : '—'}</td>
                    <td style={cell(!!l.estoque_valor)} onClick={() => l.estoque_valor && abrirPopupFamilia(l, 'estoque')}>{l.estoque_valor ? fmtRS(l.estoque_valor) : '—'}</td>
                    <td style={cell(!!l.entradas_valor, '#16a34a')} onClick={() => l.entradas_valor && abrirPopupFamilia(l, 'entrada')}>{l.entradas_qtd ? fmtQtd(l.entradas_qtd) : '—'}</td>
                    <td style={cell(!!l.entradas_valor, '#16a34a')} onClick={() => l.entradas_valor && abrirPopupFamilia(l, 'entrada')}>{l.entradas_valor ? fmtRS(l.entradas_valor) : '—'}</td>
                    <td style={cell(!!l.saidas_valor, '#dc2626')} onClick={() => l.saidas_valor && abrirPopupFamilia(l, 'saida')}>{l.saidas_qtd ? fmtQtd(l.saidas_qtd) : '—'}</td>
                    <td style={cell(!!l.saidas_valor, '#dc2626')} onClick={() => l.saidas_valor && abrirPopupFamilia(l, 'saida')}>{l.saidas_valor ? fmtRS(l.saidas_valor) : '—'}</td>
                  </tr>
                ))}
                {linhas.length === 0 && (
                  <tr><td style={tdStyle} colSpan={7}>Nenhuma família encontrada para o período.</td></tr>
                )}
              </tbody>
              {linhas.length > 0 && (
                <tfoot>
                  <tr style={{ fontWeight: 700, background: '#fafafa' }}>
                    <td style={{ ...tdStyle, fontWeight: 700 }}>Total ({linhas.length})</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmtQtd(linhas.reduce((s, l) => s + l.estoque_qtd, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700 }}>{fmtRS(linhas.reduce((s, l) => s + l.estoque_valor, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#16a34a' }}>{fmtQtd(linhas.reduce((s, l) => s + l.entradas_qtd, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#16a34a' }}>{fmtRS(linhas.reduce((s, l) => s + l.entradas_valor, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#dc2626' }}>{fmtQtd(linhas.reduce((s, l) => s + l.saidas_qtd, 0))}</td>
                    <td style={{ ...tdNum, fontWeight: 700, color: '#dc2626' }}>{fmtRS(linhas.reduce((s, l) => s + l.saidas_valor, 0))}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 10 }}>
            Estoque = saldo atual × CMC (snapshot do último sync, não histórico do mês). Saídas = vendas do mês. Entradas = itens das notas de entrada do mês, com família resolvida pelo código do produto.
          </p>
        </>
      )}
      </>
      )}

      {tab === 'grafico' && (
      <>
        <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Sel label="Período" value={meses} onChange={(v) => setMeses(parseInt(v))} options={[6, 12, 18, 24, 36, 48].map((m) => ({ value: m, label: m + ' meses' }))} />
          <Sel label="Entrada/Saída por" value={dimensao} onChange={(v) => setDimensao(v as Dimensao)} options={[{ value: 'tipo', label: 'Tipo (Peça/Máquina)' }, { value: 'categoria', label: 'Categoria' }, { value: 'familia', label: 'Família' }, { value: 'tipocarac', label: 'Tipo (característica)' }]} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '.7rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Grupo</span>
            <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
              {([['peca', 'Peças'], ['maquina', 'Máquinas'], ['ambos', 'Ambos']] as const).map(([g, lbl]) => (
                <button key={g} onClick={() => setGrupo(g)} style={{
                  padding: '7px 12px', fontSize: '.8rem', border: 'none', cursor: 'pointer',
                  background: grupo === g ? '#111' : '#fff', color: grupo === g ? '#fff' : '#555',
                  borderLeft: g !== 'peca' ? '1px solid #ddd' : 'none',
                }}>{lbl}</button>
              ))}
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#555', cursor: 'pointer', paddingBottom: 9 }}>
            <input type="checkbox" checked={mostrarFatPecas} onChange={(e) => setMostrarFatPecas(e.target.checked)} />
            Faturamento (barra)
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#555', cursor: 'pointer', paddingBottom: 9 }} title="Soma ao Estoque Máquina as máquinas que saíram em remessa de demonstração (ainda nossas)">
            <input type="checkbox" checked={incluirDemo} onChange={(e) => setIncluirDemo(e.target.checked)} />
            Incluir máquinas em demonstração
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#555', cursor: 'pointer', paddingBottom: 9 }}>
            <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
            Escala log
          </label>
        </div>

        {serieErro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{serieErro}</div>}
        {serieCarregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

        {serie && !serieCarregando && (
          <>
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 12 }}>
              <SerieMensalChart
                dados={serie.pontos}
                series={serie.series}
                hideKeys={grupo === 'peca' ? ['estoque_maquina'] : grupo === 'maquina' ? ['estoque_peca'] : []}
                bars={!mostrarFatPecas ? [] : grupo === 'maquina' ? [BARRA_MAQ] : grupo === 'peca' ? [BARRA_PECA] : [BARRA_PECA, BARRA_MAQ]}
                logScale={logScale}
                onPointClick={(key, p) => { const s = serie.series.find((x) => x.key === key) ?? sinteticoFat(key); if (s) abrirPopupSerie(s, p); }}
              />
            </div>

            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...thStyle, ...thClick }} onClick={() => setSortGraf((s) => toggleSort(s, 'mes'))}>Mês{seta(sortGraf, 'mes')}</th>
                  {serie.series.map((s) => <th key={s.key} style={{ ...thNum, ...thClick, color: s.cor }} onClick={() => setSortGraf((st) => toggleSort(st, s.key))}>{s.label}{seta(sortGraf, s.key)}</th>)}
                </tr></thead>
                <tbody>
                  {ordPontos(serie.pontos, sortGraf).map((p, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{p.periodo}</td>
                      {serie.series.map((s) => {
                        const v = Number(p[s.key] || 0);
                        const clic = v !== 0 && !(s.key.endsWith('::Outras'));
                        return (
                          <td key={s.key} style={{ ...tdNum, color: v ? s.cor : '#bbb', cursor: clic ? 'pointer' : 'default' }}
                            onClick={() => clic && abrirPopupSerie(s, p)}>
                            {v ? fmtRS0(v) : '—'}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 10 }}>
              NF Entrada = itens das notas de entrada do mês. NF Saída = vendas do mês. {dimensao === 'categoria' && 'Linha cheia = entrada, tracejada = saída; cada cor é uma categoria (top 6 + “Outras”). '}{dimensao === 'familia' && 'Linha cheia = entrada, tracejada = saída; cada cor é uma família (top 6 + “Outras”). '}{dimensao === 'tipocarac' && 'Linha cheia = entrada, tracejada = saída; cada cor é um Tipo (característica de produto_tipo; top 6 + “Outras”). Quem não tem Tipo cai em “Sem tipo”. '}
              Estoque Peça/Máquina vem do <strong>snapshot mensal</strong> (valor congelado a cada captura): o mês atual mostra o saldo de hoje e os meses anteriores aparecem conforme o histórico for sendo gravado — meses sem snapshot ficam sem ponto. Famílias &quot;#N/D&quot;, &quot;Kit revisão&quot; e &quot;Ativo imobilizado&quot; são ignoradas. {incluirDemo && <><strong>Estoque Máquina</strong> inclui as máquinas em <strong>demonstração</strong> (remessas em aberto, ainda nossas), somadas mês a mês pelas datas de saída/retorno. </>}Clique numa célula ou ponto para ver a composição.
            </p>
          </>
        )}
      </>
      )}

      {tab === 'estoqueTipo' && (
      <>
        <div style={{ display: 'flex', gap: 16, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Sel label="Período" value={mesesTipo} onChange={(v) => setMesesTipo(parseInt(v))} options={[6, 12, 18, 24, 36, 48].map((m) => ({ value: m, label: m + ' meses' }))} />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#555', cursor: 'pointer', paddingBottom: 9 }}>
            <input type="checkbox" checked={incluirSemTipo} onChange={(e) => { setIncluirSemTipo(e.target.checked); if (e.target.checked) setOcultarDominantes(false); }} />
            Incluir &quot;Sem tipo&quot;
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#555', cursor: 'pointer', paddingBottom: 9 }}>
            <input type="checkbox" checked={logScale} onChange={(e) => setLogScale(e.target.checked)} />
            Escala log
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#555', cursor: 'pointer', paddingBottom: 9 }} title="Escala 'linlog' (symlog): de 0 a R$ 30k o eixo é bem espaçado (linear); acima disso comprime (log). Boa para ver as linhas pequenas sem esmagar as grandes.">
            <input type="checkbox" checked={linlogTipo} onChange={(e) => setLinlogTipo(e.target.checked)} />
            Escala linlog
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#555', cursor: 'pointer', paddingBottom: 9 }} title="Esconde as linhas 'Sem tipo' e 'Outras' do gráfico — as demais reescalam e ficam mais legíveis">
            <input type="checkbox" checked={ocultarDominantes} onChange={(e) => { setOcultarDominantes(e.target.checked); if (e.target.checked) setIncluirSemTipo(false); }} />
            Ocultar &quot;Sem tipo&quot; + &quot;Outras&quot;
          </label>
        </div>

        {serieTipoErro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{serieTipoErro}</div>}
        {serieTipoCarregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

        {serieTipo && !serieTipoCarregando && (
          <>
            {serieTipo.series.length === 0 ? (
              <div style={{ color: '#888', fontSize: '.85rem', padding: '20px 0' }}>
                Sem dados de Tipo para as Peças. Verifique a tabela <strong>produto_tipo</strong> (classificação manual de Tipo das peças).
              </div>
            ) : (
              <>
                <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 16, marginBottom: 12 }}>
                  <SerieMensalChart dados={serieTipo.pontos} series={serieTipo.series} logScale={logScale} linlog={linlogTipo}
                    hideKeys={ocultarDominantes ? ['estoque::Sem tipo', 'estoque::Outras'] : []}
                    onPointClick={(key, p) => { const s = serieTipo.series.find((x) => x.key === key); if (s) abrirPopupEstoqueTipo(s, p); }} />
                </div>

                {(() => {
                  // Colunas congeladas + Total + triângulo de tendência (vs mês anterior).
                  const MES_W = 92, TOTAL_W = 134;
                  const chave = (p: PontoMensal) => Number(p.ano || 0) * 100 + Number(p.mes || 0);
                  const totalDe = (p: PontoMensal) => serieTipo.series.reduce((a, s) => a + Number(p[s.key] || 0), 0);
                  // Aumenta cada ponto com __total (p/ ordenar e mostrar a coluna Total).
                  const pontosTot: PontoMensal[] = serieTipo.pontos.map((p) => ({ ...p, __total: totalDe(p) }));
                  // Ordem cronológica real (independe da ordenação da tabela) p/ achar o mês anterior.
                  const crono = [...pontosTot].sort((a, b) => chave(a) - chave(b));
                  const idxCrono = new Map(crono.map((p, k) => [chave(p), k]));
                  const valorAnterior = (p: PontoMensal, key: string): number | null => {
                    const k = idxCrono.get(chave(p));
                    if (k == null || k === 0) return null;
                    return Number(crono[k - 1][key] || 0);
                  };
                  // Triângulo ▲/▼ (subiu/desceu vs mês anterior), verde/vermelho a 30% de opacidade.
                  const triangulo = (atual: number, key: string, p: PontoMensal) => {
                    if (!atual) return null;
                    const ant = valorAnterior(p, key);
                    if (ant == null || atual === ant) return null;
                    const subiu = atual > ant;
                    return (
                      <span aria-hidden style={{ opacity: 0.3, marginRight: 4, fontSize: '.62rem', color: subiu ? '#16a34a' : '#dc2626' }}
                        title={`${subiu ? 'Subiu' : 'Desceu'} vs mês anterior (${fmtRS0(ant)})`}>
                        {subiu ? '▲' : '▼'}
                      </span>
                    );
                  };
                  const rowBg = (i: number) => (hoverLinhaTipo === i ? '#eaf2fb' : '#fff');
                  const stickyLeft = (bg: string): React.CSSProperties => ({ position: 'sticky', left: 0, zIndex: 1, background: bg, boxShadow: '2px 0 5px -3px rgba(0,0,0,.18)' });
                  const stickyMesDir = (bg: string): React.CSSProperties => ({ position: 'sticky', right: TOTAL_W, zIndex: 1, background: bg });
                  const stickyTotal = (bg: string): React.CSSProperties => ({ position: 'sticky', right: 0, zIndex: 1, background: bg, boxShadow: '-3px 0 5px -3px rgba(0,0,0,.18)' });
                  // Linha de cabeçalho (nomes dos Tipos) — repetida no rodapé (tfoot).
                  const headerRow = (
                    <tr>
                      <th style={{ ...thStyle, ...thClick, ...stickyLeft('#fafafa'), zIndex: 3, minWidth: MES_W }} onClick={() => setSortTipo((s) => toggleSort(s, 'mes'))}>Mês{seta(sortTipo, 'mes')}</th>
                      {serieTipo.series.map((s) => <th key={s.key} style={{ ...thNum, ...thClick, color: s.cor }} onClick={() => setSortTipo((st) => toggleSort(st, s.key))}>{s.label}{seta(sortTipo, s.key)}</th>)}
                      <th style={{ ...thNum, ...thClick, ...stickyMesDir('#fafafa'), zIndex: 3, textAlign: 'left', minWidth: MES_W }} onClick={() => setSortTipo((s) => toggleSort(s, 'mes'))}>Mês{seta(sortTipo, 'mes')}</th>
                      <th style={{ ...thNum, ...thClick, ...stickyTotal('#f2f2f2'), zIndex: 3, color: '#111', minWidth: TOTAL_W }} onClick={() => setSortTipo((s) => toggleSort(s, '__total'))}>Total{seta(sortTipo, '__total')}</th>
                    </tr>
                  );
                  return (
                <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0 }}>
                    <thead>{headerRow}</thead>
                    <tbody>
                      {ordPontos(pontosTot, sortTipo).map((p, i) => {
                        const bg = rowBg(i);
                        const total = Number(p.__total || 0);
                        return (
                        <tr key={i} onMouseEnter={() => setHoverLinhaTipo(i)} onMouseLeave={() => setHoverLinhaTipo(null)}
                          style={{ background: hoverLinhaTipo === i ? '#eaf2fb' : 'transparent' }}>
                          <td style={{ ...tdStyle, ...stickyLeft(bg), fontWeight: 600 }}>{p.periodo}</td>
                          {serieTipo.series.map((s) => {
                            const v = Number(p[s.key] || 0);
                            const clic = v !== 0;
                            return (
                              <td key={s.key} style={{ ...tdNum, color: v ? s.cor : '#bbb', cursor: clic ? 'pointer' : 'default', background: hoverLinhaTipo === i ? '#eaf2fb' : 'transparent' }}
                                onClick={() => clic && abrirPopupEstoqueTipo(s, p)}>
                                {v ? <>{triangulo(v, s.key, p)}{fmtRS0(v)}</> : '—'}
                              </td>
                            );
                          })}
                          <td style={{ ...tdStyle, ...stickyMesDir(bg), fontWeight: 600 }}>{p.periodo}</td>
                          <td style={{ ...tdNum, ...stickyTotal(bg), fontWeight: 700, color: '#111' }}>
                            {total ? <>{triangulo(total, '__total', p)}{fmtRS0(total)}</> : '—'}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>{headerRow}</tfoot>
                  </table>
                </div>
                  );
                })()}
              </>
            )}
            <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 10 }}>
              Saldo (R$) de estoque das <strong>Peças</strong>, por característica <strong>&quot;Tipo:&quot;</strong> (tabela produto_tipo; top 20 + &ldquo;Outras&rdquo;). Quem não tem Tipo cai em &ldquo;Sem tipo&rdquo;.
              O mês atual mostra o saldo de hoje (ao vivo); os meses anteriores aparecem conforme o <strong>snapshot mensal</strong> for sendo gravado — meses sem snapshot ficam sem ponto. Clique numa célula do <strong>mês atual</strong> para ver a composição item-a-item; nos meses passados o clique mostra só o valor do snapshot (a lista de produtos não é guardada). Use <strong>Escala log</strong> ou <strong>Escala linlog</strong> (linear até R$ 30k, comprimida acima) para enxergar as linhas menores; <strong>passe o mouse ou clique</strong> numa linha/legenda para destacá-la (clique fixa/solta); e <strong>Ocultar &ldquo;Sem tipo&rdquo; + &ldquo;Outras&rdquo;</strong> para as demais reescalarem.
              Na tabela: a coluna <strong>Mês</strong> fica congelada na esquerda e repetida (também congelada) na direita, junto de <strong>Total</strong> (soma dos tipos); o <strong>triângulo ▲/▼</strong> em cada célula indica se o valor subiu (verde) ou desceu (vermelho) ante o mês anterior.
            </p>
          </>
        )}
      </>
      )}

      {tab === 'reconciliacao' && (
      <>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Sel label="Período" value={meses} onChange={(v) => setMeses(parseInt(v))} options={[6, 12, 18, 24, 36, 48].map((m) => ({ value: m, label: m + ' meses' }))} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '.7rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Grupo</span>
            <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
              {([['peca', 'Peças'], ['maquina', 'Máquinas']] as const).map(([g, lbl]) => (
                <button key={g} onClick={() => setGrupoRec(g)} style={{
                  padding: '7px 12px', fontSize: '.8rem', border: 'none', cursor: 'pointer',
                  background: grupoRec === g ? '#111' : '#fff', color: grupoRec === g ? '#fff' : '#555',
                  borderLeft: g !== 'peca' ? '1px solid #ddd' : 'none',
                }}>{lbl}</button>
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '.7rem', color: '#888', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.03em' }}>Cards</span>
            <div style={{ display: 'flex', border: '1px solid #ddd', borderRadius: 8, overflow: 'hidden' }}>
              {([['valor', 'Valor'], ['nf', 'Qtd NF'], ['itens', 'Qtd itens']] as const).map(([m, lbl], idx) => (
                <button key={m} onClick={() => setMetricaRec(m)} style={{
                  padding: '7px 12px', fontSize: '.8rem', border: 'none', cursor: 'pointer',
                  background: metricaRec === m ? '#111' : '#fff', color: metricaRec === m ? '#fff' : '#555',
                  borderLeft: idx !== 0 ? '1px solid #ddd' : 'none',
                }}>{lbl}</button>
              ))}
            </div>
          </div>
        </div>

        {reconErro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{reconErro}</div>}
        {reconCarregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

        {recon && !reconCarregando && (() => {
          const fmtSig = (v: number): string => (v >= 0 ? '+' : '−') + 'R$ ' + Math.round(Math.abs(v)).toLocaleString('pt-BR');
          const cols = recon.buckets;
          if (recon.totalMovimentos === 0) {
            return <div style={{ color: '#888', fontSize: '.9rem', padding: '24px 4px' }}>
              Sem movimentos no razão para <strong>{grupoRec === 'peca' ? 'Peças' : 'Máquinas'}</strong> ainda. Rode o backfill do razão de estoque (<code>/api/estoque/movimentos/sync?conta={contaParam.replace('&conta=', '') || 'nova'}&grupo={grupoRec}</code>) até <em>restantes = 0</em>.
            </div>;
          }
          // Totais do período por bucket (para os cards), na métrica escolhida.
          // `met` lê recon.totais (valor R$ / NF distintas / itens); null = card sem dado.
          const met = (key: string): number | null => {
            const t = recon.totais?.[key];
            if (!t) return null;
            return metricaRec === 'valor' ? t.valor : metricaRec === 'nf' ? t.nf : t.itens;
          };
          const fmtMet = (v: number, sig = false): string =>
            metricaRec === 'valor' ? (sig ? fmtSig(v) : fmtRS0(v)) : Math.round(v).toLocaleString('pt-BR');
          // Sub-rótulo: no modo Valor mantém o texto original; em NF/itens explica a métrica.
          const subMet = (base: string, nfLbl = 'qtd NF'): string =>
            metricaRec === 'valor' ? base : metricaRec === 'nf' ? nfLbl : 'qtd itens';
          const corEstoque = grupoRec === 'peca' ? '#2563eb' : '#d97706';
          const cardBucket = (key: string, titulo: string, cor: string, subBase: string, sig = false) => {
            const v = met(key);
            if (v == null) return null;
            return <Resumo key={key} titulo={titulo} valor={fmtMet(v, sig)} sub={subMet(subBase)} cor={cor} />;
          };
          const fatVal = met('venda_fat');
          return (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 14 }}>
                {/* Estoque hoje só faz sentido em R$ (saldo); em NF/itens fica n/d. */}
                <Resumo titulo="Estoque hoje" valor={metricaRec === 'valor' ? fmtRS0(recon.estoqueAtual) : '—'} sub={metricaRec === 'valor' ? 'âncora do razão (real)' : 'só em R$'} cor={corEstoque} />
                {fatVal != null && <Resumo titulo="Faturamento de vendas" valor={fmtMet(fatVal)} sub={subMet('receita da venda', 'qtd NF/pedidos')} cor="#16a34a" />}
                {cardBucket('venda', 'Vendas / COGS', '#dc2626', 'custo dos vendidos', true)}
                {cardBucket('devolucao_venda', 'Devolução de venda', '#16a34a', 'a custo (entra)', true)}
                {cardBucket('devolucao_compra', 'Devolução de compra', '#dc2626', 'a custo (sai)', true)}
                {cardBucket('compra', 'Compras (período)', '#16a34a', 'a custo')}
                {cardBucket('ajuste', 'Ajustes de estoque', '#7c3aed', 'inventário/CMC', true)}
              </div>
              <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>
                    <th style={{ ...thStyle, ...thClick }} onClick={() => setSortRec((s) => toggleSort(s, 'mes'))}>Mês{seta(sortRec, 'mes')}</th>
                    <th style={{ ...thNum, ...thClick, color: corEstoque }} onClick={() => setSortRec((s) => toggleSort(s, 'estoqueFim'))}>Estoque (fim){seta(sortRec, 'estoqueFim')}</th>
                    {cols.map((b) => <th key={b} style={{ ...thNum, ...thClick, color: BUCKET_INFO[b]?.cor || '#666' }} onClick={() => setSortRec((s) => toggleSort(s, b))}>{BUCKET_INFO[b]?.label || b}{seta(sortRec, b)}</th>)}
                    <th style={{ ...thNum, ...thClick }} onClick={() => setSortRec((s) => toggleSort(s, 'deltaEstoque'))}>Δ Estoque{seta(sortRec, 'deltaEstoque')}</th>
                  </tr></thead>
                  <tbody>
                    {ordPontos(recon.pontos, sortRec).map((p, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{p.periodo}</td>
                        <td style={{ ...tdNum, color: p.estoqueFim == null ? '#bbb' : corEstoque }}>{p.estoqueFim == null ? '—' : fmtRS0(p.estoqueFim as number)}</td>
                        {cols.map((b) => { const v = Number(p[b] || 0); return (
                          <td key={b} style={{ ...tdNum, color: v ? (BUCKET_INFO[b]?.cor || '#444') : '#ddd', cursor: v ? 'pointer' : 'default' }}
                            onClick={() => v && setReconPopup({ titulo: `${BUCKET_INFO[b]?.label || b} — ${p.periodo}`, params: { grupo: grupoRec, ano: p.ano, mes: p.mes, bucket: b } })}>
                            {v ? fmtSig(v) : '—'}
                          </td>
                        ); })}
                        <td style={{ ...tdNum, fontWeight: 700, color: (p.deltaEstoque as number) >= 0 ? '#16a34a' : '#dc2626', cursor: p.deltaEstoque ? 'pointer' : 'default' }}
                          onClick={() => p.deltaEstoque && setReconPopup({ titulo: `Δ Estoque — ${p.periodo} (todos os movimentos)`, params: { grupo: grupoRec, ano: p.ano, mes: p.mes, bucket: '' } })}>{fmtSig(p.deltaEstoque as number)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 10 }}>
                Reconciliação pelo <strong>livro-razão de estoque da Omie</strong> (MovimentoEstoque). Cada mês mostra a variação do <strong>valor</strong> de estoque decomposta por tipo de movimento, a custo CMC: <strong>Compra</strong>, <strong>Venda (COGS)</strong>, <strong>Ajuste</strong> (inventário/correção de CMC), <strong>Remessa</strong> (demonstração/consignação), <strong>Frete</strong> (capitalizado no custo), <strong>Devoluções</strong>. A soma dos tipos <strong>é</strong> o Δ Estoque do mês — não sobra resíduo, pois todo movimento está contabilizado. O <strong>Estoque (fim)</strong> é reconstruído do próprio razão, ancorado no estoque real de hoje. Substitui o cálculo anterior por snapshot (que não fechava). <strong>Clique em qualquer célula</strong> para ver os produtos que compõem o valor.
              </p>
              <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 8 }}>
                <strong>Cards × tabela:</strong> os cards acima respeitam o botão <strong>Valor / Qtd NF / Qtd itens</strong> (a tabela abaixo é sempre em R$). O card <strong>Faturamento de vendas</strong> é a <strong>receita</strong> da venda (o que o cliente pagou, de <code>vendas_itens</code>) — diferente de <strong>Vendas / COGS</strong>, que é o custo do que saiu do estoque. As <strong>devoluções</strong> vêm do razão (a custo CMC).
              </p>
              <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 8 }}>
                <strong>Por que o «Estoque hoje» daqui difere do «Estoque» do Gráfico mensal?</strong> Este card mostra <strong>um grupo por vez</strong> (Peças <em>ou</em> Máquinas) e <strong>não</strong> soma as máquinas em demonstração. Já o Gráfico mensal traça <strong>duas linhas</strong> (Peças + Máquinas) e a linha de Máquina <strong>inclui as máquinas em demonstração</strong> (remessas em aberto, ainda nossas). Por isso os totais não batem: são recortes diferentes do mesmo estoque, não um erro.
              </p>
            </>
          );
        })()}
      </>
      )}

      {popup && (
        <ComposicaoModal titulo={popup.titulo} params={popup.params} resumo={popup.resumo} contaParam={contaParam} onClose={() => setPopup(null)} />
      )}
      {reconPopup && (
        <RazaoDetalheModal titulo={reconPopup.titulo} params={reconPopup.params} contaParam={contaParam} onClose={() => setReconPopup(null)} />
      )}
    </div>
  );
}

function Resumo({ titulo, valor, sub, cor }: { titulo: string; valor: string; sub?: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 14 }}>
      <div style={{ fontSize: '.66rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 6 }}>{titulo}</div>
      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: cor || '#333' }}>{valor}</div>
      {sub && <div style={{ fontSize: '.68rem', color: '#aaa', marginTop: 2 }}>{sub}</div>}
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
