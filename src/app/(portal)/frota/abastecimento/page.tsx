'use client';
// Abastecimento da frota — upload mensal do CSV da operadora de cartão-frota
// + dashboard analítico em abas (visão geral, veículos, motoristas & postos,
// auditoria, transações), com drill-down: clicar num gráfico abre o popup com
// os abastecimentos que compõem o valor. Relatórios PDF por período.
// Permissões: abastecimento:upload e abastecimento:dashboard.

import { useCallback, useEffect, useState } from 'react';
import {
  ResponsiveContainer, ComposedChart, BarChart, LineChart, ScatterChart,
  Bar, Line, Scatter, XAxis, YAxis, ZAxis, Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { AlertTriangle, FileDown, FileSpreadsheet, Upload, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import { authHeaders } from '@/lib/auth/client';
import { Card, fmtRS } from '@/components/estoque/ui';
import UploadLotes from '@/components/abastecimento/UploadLotes';
import DetalheModal, { type DetalheParams } from '@/components/abastecimento/DetalheModal';
import HeatmapDiaHora from '@/components/abastecimento/HeatmapDiaHora';
import TabelaTransacoes from '@/components/abastecimento/TabelaTransacoes';
import { gerarPdfConsolidado, gerarPdfTransacoes } from '@/lib/abastecimento/pdf';
import { gerarCsvConsolidado, gerarCsvTransacoes } from '@/lib/abastecimento/csv';
import type { DashboardAbastecimento, TransacoesResp } from '@/lib/abastecimento/tipos';

const COR_VALOR = '#dc2626';
const COR_LITROS = '#2563eb';
const COR_ANO_ANTERIOR = '#9ca3af';

// Cores fixas por combustível (paleta validada p/ daltonismo). Combustíveis
// fora do dicionário recebem as sobras em ordem alfabética (estável por nome).
const COR_COMBUSTIVEL: Record<string, string> = {
  'Gasolina Comum': '#dc2626',
  'Gasolina Aditivada': '#7c3aed',
  'Etanol': '#059669',
  'Diesel': '#b45309',
  'Diesel S50': '#2563eb',
  'Diesel S10': '#2563eb',
};
const CORES_SOBRA = ['#7c3aed', '#b45309', '#2563eb', '#059669', '#dc2626'];

function corDoCombustivel(nome: string, todos: string[]): string {
  if (COR_COMBUSTIVEL[nome]) return COR_COMBUSTIVEL[nome];
  const semCor = todos.filter((c) => !COR_COMBUSTIVEL[c]).sort();
  return CORES_SOBRA[semCor.indexOf(nome) % CORES_SOBRA.length];
}

const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600 };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const selStyle: React.CSSProperties = { padding: '8px 10px', border: '1px solid #ddd', borderRadius: 0, fontSize: '.82rem', background: '#fff', color: '#444' };
const linhaClicavel: React.CSSProperties = { cursor: 'pointer' };

function fmtL(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' L';
}
function fmtKm(v: number): string {
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' km';
}
function fmtPct(v: number | null): string {
  if (v == null) return '—';
  const s = v >= 0 ? '+' : '';
  return s + v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%';
}
function rotuloMes(mes: string): string {
  const [ano, m] = mes.split('-');
  return `${MESES_ABREV[Number(m) - 1]}/${ano.slice(2)}`;
}
// "JOSE HENRIQUE BERNARDINO GARROTE" -> "JOSE GARROTE" (rótulo dos rankings)
function nomeCurto(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes.length > 2 ? `${partes[0]} ${partes[partes.length - 1]}` : nome;
}
// evita rótulo comprido invadindo o gráfico
function truncar(s: string, max = 24): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
function isoHoje(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoMesesAtras(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d.toISOString().slice(0, 10);
}
function isoInicioMes(): string {
  return isoHoje().slice(0, 8) + '01';
}

type Preset = 'mes' | '3m' | '12m' | 'custom';
type Aba = 'visao' | 'veiculos' | 'pessoas' | 'auditoria' | 'transacoes';

function KPI({ label, valor, sub, cor, onClick }: { label: string; valor: string; sub?: string; cor?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      title={onClick ? 'Clique para ver os abastecimentos' : undefined}
      style={{ background: '#fff', border: '1px solid #eee', borderRadius: 0, padding: 16, cursor: onClick ? 'pointer' : 'default' }}
    >
      <div style={{ color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1.2rem', fontWeight: 700, color: cor || '#333' }}>{valor}</div>
      {sub && <div style={{ fontSize: '.68rem', color: '#aaa', marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Comparativo de consumo entre veículos ao longo dos meses (litros/R$/km‑l).
const CORES_COMPARA = ['#dc2626', '#2563eb', '#059669'];
type MetricaComp = 'litros' | 'valor' | 'kml';

function ComparadorVeiculos({ serie, veiculos, meses }: {
  serie: import('@/lib/abastecimento/tipos').VeiculoMes[];
  veiculos: { placa: string; modelo: string | null }[];
  meses: string[];
}) {
  const [sel, setSel] = useState<string[]>(['', '', '']);
  const [metrica, setMetrica] = useState<MetricaComp>('litros');
  const escolhidas = sel.filter(Boolean);

  const rotMetrica = metrica === 'litros' ? 'Litros' : metrica === 'valor' ? 'Gasto (R$)' : 'km/L';
  const fmtMetrica = (v: number) =>
    metrica === 'valor' ? fmtRS(v) : metrica === 'litros' ? fmtL(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' km/L';

  const porChave = new Map(serie.map((s) => [`${s.placa}|${s.mes}`, s]));
  const dadosGrafico = meses.map((mes) => {
    const row: Record<string, string | number | null> = { rotulo: rotuloMes(mes) };
    for (const p of escolhidas) {
      const s = porChave.get(`${p}|${mes}`);
      row[p] = s ? (metrica === 'kml' ? s.kml : s[metrica]) : null;
    }
    return row;
  });

  return (
    <Card titulo="Comparar veículos ao longo dos meses">
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
        {sel.map((v, i) => (
          <select
            key={i}
            value={v}
            onChange={(e) => setSel(sel.map((s, j) => (j === i ? e.target.value : s)))}
            style={{ ...selStyle, borderLeft: v ? `4px solid ${CORES_COMPARA[i]}` : selStyle.border as string }}
          >
            <option value="">{i < 2 ? `Veículo ${i + 1}…` : 'Veículo 3 (opcional)…'}</option>
            {veiculos.map((vc) => (
              <option key={vc.placa} value={vc.placa}>{vc.modelo ? `${vc.modelo} · ${vc.placa}` : vc.placa}</option>
            ))}
          </select>
        ))}
        {(['litros', 'valor', 'kml'] as MetricaComp[]).map((m) => (
          <button
            key={m}
            onClick={() => setMetrica(m)}
            style={{ ...selStyle, cursor: 'pointer', fontWeight: metrica === m ? 700 : 400, borderColor: metrica === m ? '#dc2626' : '#ddd', color: metrica === m ? '#dc2626' : '#444' }}
          >
            {m === 'litros' ? 'Litros' : m === 'valor' ? 'Gasto (R$)' : 'km/L'}
          </button>
        ))}
      </div>
      {escolhidas.length < 2 ? (
        <p style={{ color: '#888', fontSize: '.8rem' }}>Escolha pelo menos dois veículos para comparar {rotMetrica.toLowerCase()} mês a mês.</p>
      ) : (
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dadosGrafico}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
              <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: '#888' }} />
              <YAxis tick={{ fontSize: 12, fill: '#888' }} width={70} tickFormatter={(v) => metrica === 'valor' ? (Number(v) / 1000).toLocaleString('pt-BR') + 'k' : String(v)} />
              <Tooltip formatter={(v) => fmtMetrica(Number(v))} labelStyle={{ color: '#444' }} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              {escolhidas.map((p) => (
                <Line key={p} dataKey={p} name={p} stroke={CORES_COMPARA[sel.indexOf(p)]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {metrica === 'kml' && escolhidas.length >= 2 && (
        <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 6 }}>
          km/L usa os trechos de hodômetro fechados em cada mês — meses sem trecho válido ficam sem ponto.
        </p>
      )}
    </Card>
  );
}

// Barras horizontais de ranking (uma série; título identifica). Clique → drill.
function RankingChart({ dados, cor, formato, onItemClick }: {
  dados: { nome: string; chave: string; valor: number }[];
  cor: string;
  formato: (v: number) => string;
  onItemClick?: (chave: string) => void;
}) {
  const altura = Math.max(180, dados.length * 32);
  return (
    <div style={{ width: '100%', height: altura }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={dados} layout="vertical" margin={{ left: 8, right: 24 }}>
          <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
          <XAxis type="number" tick={{ fontSize: 12, fill: '#888' }} tickFormatter={(v) => formato(Number(v))} />
          <YAxis
            type="category" dataKey="nome" width={155} interval={0}
            tick={{ fontSize: 11.5, fill: '#444' }}
            tickFormatter={(v) => truncar(String(v))}
          />
          <Tooltip formatter={(v) => formato(Number(v))} labelStyle={{ color: '#444' }} />
          <Bar
            dataKey="valor"
            fill={cor}
            radius={[0, 4, 4, 0]}
            barSize={18}
            cursor={onItemClick ? 'pointer' : undefined}
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onClick={(d: any) => { const chave = d?.payload?.chave ?? d?.chave; if (chave && onItemClick) onItemClick(chave); }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function AbastecimentoPage() {
  const { userProfile } = useAuth();
  const { pode, isAdmin, loading: permLoading } = usePermissoes(userProfile?.id);
  // O gate da TELA é do frota/layout.tsx (chegou aqui = pode ver). Aqui fica só
  // a ação de escrita. As chaves antigas (abastecimento:*) continuam valendo:
  // (a camada de compat foi removida em 16/07 — ninguém mais tinha chave legada).
  const podeDash = true;
  const podeUpload = pode('frota', 'abastecimento:upload');

  // Padrão ao abrir: mês atual, do dia 1 até hoje (o dia em que o usuário abre).
  const [preset, setPreset] = useState<Preset>('mes');
  const [de, setDe] = useState(isoInicioMes());
  const [ate, setAte] = useState(isoHoje());
  const [filial] = useState(''); // filtro de filial oculto (só há uma filial em uso)
  const [placa, setPlaca] = useState('');
  const [departamento, setDepartamento] = useState('');
  const [aba, setAba] = useState<Aba>('visao');

  const [dados, setDados] = useState<DashboardAbastecimento | null>(null);
  const [opcoes, setOpcoes] = useState<DashboardAbastecimento['opcoesFiltro']>({ filiais: [], placas: [], veiculos: [], motoristas: [], departamentos: [] });
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [detalhe, setDetalhe] = useState<DetalheParams | null>(null);
  const [uploadAberto, setUploadAberto] = useState(false); // popup de import do CSV (aberto pela linha do rodapé)
  const [gerandoPdf, setGerandoPdf] = useState('');

  const aplicarPreset = (p: Preset) => {
    setPreset(p);
    if (p === 'mes') { setDe(isoInicioMes()); setAte(isoHoje()); }
    if (p === '3m') { setDe(isoMesesAtras(3)); setAte(isoHoje()); }
    if (p === '12m') { setDe(isoMesesAtras(12)); setAte(isoHoje()); }
  };

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const params = new URLSearchParams({ de, ate });
      if (filial) params.set('filial', filial);
      if (placa) params.set('placa', placa);
      if (departamento) params.set('departamento', departamento);
      const r = await fetch(`/api/abastecimento/dashboard?${params}`, { headers: await authHeaders() });
      const d = await r.json();
      if (!r.ok) { setErro(d.error || 'Erro ao carregar.'); return; }
      setDados(d as DashboardAbastecimento);
      if (!filial && !placa && !departamento) setOpcoes((d as DashboardAbastecimento).opcoesFiltro);
    } catch (e) {
      setErro('Erro: ' + (e as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [de, ate, filial, placa, departamento]);

  useEffect(() => {
    if (podeDash) carregar();
  }, [carregar, podeDash]);

  // ----- drill-down -----
  const paramsBase = useCallback((): Record<string, string> => {
    const p: Record<string, string> = { de, ate };
    if (filial) p.filial = filial;
    if (placa) p.placa = placa;
    if (departamento) p.departamento = departamento;
    return p;
  }, [de, ate, filial, placa, departamento]);

  const abrirDetalhe = (titulo: string, extras: Record<string, string>) => {
    setDetalhe({ titulo, params: { ...paramsBase(), ...extras } });
  };

  // ----- PDFs -----
  const filtrosDescricao = (): string[] => {
    const f: string[] = [];
    if (filial) f.push(`Filial: ${filial}`);
    if (placa) f.push(`Veículo: ${placa}`);
    return f;
  };

  const pdfAnalitico = async () => {
    setGerandoPdf('analitico');
    try {
      const qs = new URLSearchParams({ ...paramsBase(), limit: '0' });
      const r = await fetch(`/api/abastecimento/transacoes?${qs}`, { headers: await authHeaders() });
      const d = (await r.json()) as TransacoesResp;
      await gerarPdfTransacoes({ periodo: { de, ate }, filtros: filtrosDescricao(), linhas: d.linhas, somaValor: d.somaValor, somaLitros: d.somaLitros });
    } finally {
      setGerandoPdf('');
    }
  };

  const pdfConsolidado = async (tipo: 'veiculo' | 'motorista') => {
    if (!dados) return;
    setGerandoPdf(tipo);
    try {
      await gerarPdfConsolidado({
        tipo,
        periodo: { de, ate },
        filtros: filtrosDescricao(),
        itens: tipo === 'veiculo' ? dados.porVeiculo : dados.porMotorista,
      });
    } finally {
      setGerandoPdf('');
    }
  };

  const csvAnalitico = async () => {
    setGerandoPdf('csv-analitico');
    try {
      const qs = new URLSearchParams({ ...paramsBase(), limit: '0' });
      const r = await fetch(`/api/abastecimento/transacoes?${qs}`, { headers: await authHeaders() });
      const d = (await r.json()) as TransacoesResp;
      gerarCsvTransacoes({ periodo: { de, ate }, linhas: d.linhas });
    } finally {
      setGerandoPdf('');
    }
  };

  const csvConsolidado = (tipo: 'veiculo' | 'motorista') => {
    if (!dados) return;
    gerarCsvConsolidado({
      tipo,
      periodo: { de, ate },
      itens: tipo === 'veiculo' ? dados.porVeiculo : dados.porMotorista,
    });
  };

  if (permLoading || !userProfile) {
    return <div style={{ padding: 40, color: '#888' }}>Carregando…</div>;
  }

  const evolucao = dados?.evolucaoMensal.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) })) || [];
  const precoMensal = dados?.precoMensal.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) })) || [];
  const gastoComb = dados?.gastoMensalCombustivel.map((m) => ({ ...m, rotulo: rotuloMes(m.mes) })) || [];
  const anomaliaPorPlaca = new Set((dados?.anomalias || []).map((a) => a.placa));
  const suspeitas = (dados?.intervalos || []).filter((i) => i.suspeito);
  const pontosScatter = (dados?.intervalos || []).filter((i) => i.horas <= 168); // até 7 dias no gráfico

  const ABAS: { id: Aba; label: string; badge?: number }[] = [
    { id: 'visao', label: 'Visão geral' },
    { id: 'veiculos', label: 'Veículos', badge: dados?.anomalias.length || 0 },
    { id: 'pessoas', label: 'Motoristas & Postos' },
    { id: 'auditoria', label: 'Auditoria', badge: suspeitas.length },
    { id: 'transacoes', label: 'Transações' },
  ];

  const botaoExportar = (rotulo: string, chave: string, acao: () => void, tipo: 'pdf' | 'csv' = 'pdf') => (
    <button
      key={chave}
      onClick={acao}
      disabled={!!gerandoPdf || !dados}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#fff', color: tipo === 'pdf' ? '#dc2626' : '#166534', border: `1px solid ${tipo === 'pdf' ? '#dc2626' : '#166534'}`, borderRadius: 0, padding: '8px 12px', fontSize: '.78rem', fontWeight: 600, cursor: 'pointer', opacity: gerandoPdf && gerandoPdf !== chave ? 0.5 : 1 }}
    >
      {tipo === 'pdf' ? <FileDown size={14} /> : <FileSpreadsheet size={14} />} {gerandoPdf === chave ? 'Gerando…' : rotulo}
    </button>
  );

  return (
    <div style={{ padding: 20, maxWidth: 1300, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: '1.3rem', fontWeight: 700, color: '#333', marginBottom: 4 }}>Abastecimento da Frota</h1>
        <a href="/frota/abastecimento/flex" style={{ fontSize: '.78rem', color: '#dc2626', fontWeight: 600, textDecoration: 'none' }}>
          Álcool × Gasolina por veículo →
        </a>
      </div>
      <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 16 }}>
        Gastos com combustível por veículo, motorista e posto — relatório mensal da operadora do cartão
        <strong style={{ color: '#666' }}> + requisições de abastecimento</strong> (Veicular, Trator e Quadri — entram
        sozinhas assim que vão pro financeiro). Trator/Quadri aparecem agrupados como{' '}
        <strong style={{ color: '#666' }}>TRATOR</strong> e <strong style={{ color: '#666' }}>QUADRI</strong>.
        Clique nas barras e linhas dos gráficos para ver os abastecimentos que compõem cada valor.
      </p>

      {/* A importação do CSV foi movida para uma linha no rodapé (abre em popup)
          — ver o final desta página. */}

      {podeDash && (
        <>
          {/* filtros + PDFs */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', margin: '16px 0 8px' }}>
            {(['mes', '3m', '12m'] as Preset[]).map((p) => (
              <button
                key={p}
                onClick={() => aplicarPreset(p)}
                style={{ ...selStyle, cursor: 'pointer', fontWeight: preset === p ? 700 : 400, borderColor: preset === p ? '#dc2626' : '#ddd', color: preset === p ? '#dc2626' : '#444' }}
              >
                {p === 'mes' ? 'Mês atual' : p === '3m' ? 'Últimos 3 meses' : 'Últimos 12 meses'}
              </button>
            ))}
            <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPreset('custom'); }} style={selStyle} />
            <span style={{ color: '#888', fontSize: '.8rem' }}>a</span>
            <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPreset('custom'); }} style={selStyle} />
            <select value={placa} onChange={(e) => setPlaca(e.target.value)} style={selStyle}>
              <option value="">Todos os veículos</option>
              {opcoes.veiculos.map((v) => (
                <option key={v.placa} value={v.placa}>{v.modelo ? `${v.modelo} · ${v.placa}` : v.placa}</option>
              ))}
            </select>
            <select value={departamento} onChange={(e) => setDepartamento(e.target.value)} style={selStyle}>
              <option value="">Todos os departamentos</option>
              {opcoes.departamentos.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            {carregando && <span style={{ color: '#888', fontSize: '.8rem' }}>Carregando…</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
            {botaoExportar('PDF analítico', 'analitico', pdfAnalitico)}
            {botaoExportar('PDF por veículo', 'veiculo', () => pdfConsolidado('veiculo'))}
            {botaoExportar('PDF por motorista', 'motorista', () => pdfConsolidado('motorista'))}
            {botaoExportar('CSV analítico', 'csv-analitico', csvAnalitico, 'csv')}
            {botaoExportar('CSV por veículo', 'csv-veiculo', () => csvConsolidado('veiculo'), 'csv')}
            {botaoExportar('CSV por motorista', 'csv-motorista', () => csvConsolidado('motorista'), 'csv')}
          </div>

          {erro && (
            <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', color: '#b91c1c', borderRadius: 0, padding: '10px 12px', fontSize: '.82rem', marginBottom: 16 }}>
              {erro}
            </div>
          )}

          {dados && (
            <>
              {/* KPIs */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
                <KPI label="Gasto total" valor={fmtRS(dados.totais.valor)} sub="pago (com desconto)" onClick={() => abrirDetalhe('Todos os abastecimentos do período', {})} />
                <KPI
                  label="Economizado (desconto)"
                  valor={fmtRS(dados.totais.economizado || 0)}
                  cor="#16a34a"
                  sub="desconto da operadora"
                  onClick={() => abrirDetalhe('Todos os abastecimentos do período', {})}
                />
                <KPI label="Litros" valor={fmtL(dados.totais.litros)} onClick={() => abrirDetalhe('Todos os abastecimentos do período', {})} />
                <KPI label="Preço médio/L" valor={fmtRS(dados.totais.precoMedioLitro)} onClick={() => abrirDetalhe('Todos os abastecimentos do período', {})} />
                <KPI label="Abastecimentos" valor={String(dados.totais.transacoes)} sub={`${dados.totais.veiculos} veículo(s)`} onClick={() => abrirDetalhe('Todos os abastecimentos do período', {})} />
                <KPI
                  label="Último mês vs anterior"
                  valor={fmtPct(dados.totais.varMesAnterior)}
                  cor={dados.totais.varMesAnterior == null ? '#333' : dados.totais.varMesAnterior > 0 ? '#dc2626' : '#16a34a'}
                  onClick={() => {
                    const ultimo = [...dados.evolucaoMensal].reverse().find((m) => m.valor > 0);
                    if (ultimo) abrirDetalhe(`Abastecimentos de ${rotuloMes(ultimo.mes)}`, { mes: ultimo.mes });
                  }}
                />
                {dados.projecao && (
                  <KPI
                    label={`Projeção ${rotuloMes(dados.projecao.mes)}`}
                    valor={fmtRS(dados.projecao.projetado)}
                    sub={`realizado ${fmtRS(dados.projecao.realizado)} em ${dados.projecao.diasCorridos}/${dados.projecao.diasMes} dias`}
                    onClick={() => abrirDetalhe(`Abastecimentos de ${rotuloMes(dados.projecao!.mes)}`, { mes: dados.projecao!.mes })}
                  />
                )}
              </div>

              {/* abas */}
              <div style={{ display: 'flex', gap: 4, borderBottom: '2px solid #eee', marginBottom: 14, flexWrap: 'wrap' }}>
                {ABAS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAba(a.id)}
                    style={{ background: 'none', border: 'none', borderBottom: aba === a.id ? '2px solid #dc2626' : '2px solid transparent', marginBottom: -2, padding: '10px 14px', fontSize: '.85rem', fontWeight: aba === a.id ? 700 : 500, color: aba === a.id ? '#dc2626' : '#666', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {a.label}
                    {!!a.badge && (
                      <span style={{ background: '#dc2626', color: '#fff', borderRadius: 999, fontSize: '.62rem', padding: '1px 7px', fontWeight: 700 }}>{a.badge}</span>
                    )}
                  </button>
                ))}
              </div>

              {/* ===================== VISÃO GERAL ===================== */}
              {aba === 'visao' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                    <Card titulo="Gasto por mês (R$) — barra atual, linha = mesmo mês do ano passado">
                      <div style={{ width: '100%', height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={evolucao}
                            style={{ cursor: 'pointer' }}
                            // clique em qualquer ponto da coluna do mês (não só na barra)
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={(st: any) => { const mes = st?.activePayload?.[0]?.payload?.mes; if (mes) abrirDetalhe(`Abastecimentos de ${rotuloMes(mes)}`, { mes }); }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: '#888' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#888' }} tickFormatter={(v) => (Number(v) / 1000).toLocaleString('pt-BR') + 'k'} />
                            <Tooltip
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              content={({ active, payload, label }: any) => {
                                if (!active || !payload?.length) return null;
                                const m = payload[0].payload;
                                return (
                                  <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 0, padding: '8px 10px', fontSize: '.76rem', color: '#444', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
                                    <div style={{ fontWeight: 700, marginBottom: 4 }}>{label}</div>
                                    <div>Gasto: <strong>{fmtRS(m.valor)}</strong></div>
                                    <div>Ano passado: {m.valorAnoAnterior != null ? fmtRS(m.valorAnoAnterior) : '—'}</div>
                                    <div>vs mês anterior: {fmtPct(m.varMes)} · vs ano passado: {fmtPct(m.varAno)}</div>
                                    <div style={{ color: '#aaa', marginTop: 4 }}>clique para detalhar</div>
                                  </div>
                                );
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="valor" name="Gasto" fill={COR_VALOR} radius={[4, 4, 0, 0]} barSize={24} />
                            <Line dataKey="valorAnoAnterior" name="Mesmo mês/ano passado" stroke={COR_ANO_ANTERIOR} strokeDasharray="5 4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>

                    <Card titulo="Litros por mês — separa efeito consumo do efeito preço">
                      <div style={{ width: '100%', height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart
                            data={evolucao}
                            style={{ cursor: 'pointer' }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={(st: any) => { const mes = st?.activePayload?.[0]?.payload?.mes; if (mes) abrirDetalhe(`Abastecimentos de ${rotuloMes(mes)}`, { mes }); }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: '#888' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#888' }} />
                            <Tooltip formatter={(v, nome) => [fmtL(Number(v)), nome]} labelStyle={{ color: '#444' }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="litros" name="Litros" fill={COR_LITROS} radius={[4, 4, 0, 0]} barSize={24} />
                            <Line dataKey="litrosAnoAnterior" name="Mesmo mês/ano passado" stroke={COR_ANO_ANTERIOR} strokeDasharray="5 4" strokeWidth={2} dot={{ r: 3 }} connectNulls />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                    <Card titulo="Preço médio do litro por combustível">
                      <div style={{ width: '100%', height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart
                            data={precoMensal}
                            style={{ cursor: 'pointer' }}
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            onClick={(st: any) => { const mes = st?.activePayload?.[0]?.payload?.mes; if (mes) abrirDetalhe(`Abastecimentos de ${rotuloMes(mes)}`, { mes }); }}
                          >
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: '#888' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#888' }} tickFormatter={(v) => 'R$ ' + Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} domain={['auto', 'auto']} width={70} />
                            <Tooltip formatter={(v) => fmtRS(Number(v))} labelStyle={{ color: '#444' }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {dados.combustiveis.map((c) => (
                              <Line key={c} dataKey={c} name={c} stroke={corDoCombustivel(c, dados.combustiveis)} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                            ))}
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>

                    <Card titulo="Gasto mensal por combustível (empilhado)">
                      <div style={{ width: '100%', height: 280 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={gastoComb}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                            <XAxis dataKey="rotulo" tick={{ fontSize: 12, fill: '#888' }} />
                            <YAxis tick={{ fontSize: 12, fill: '#888' }} tickFormatter={(v) => (Number(v) / 1000).toLocaleString('pt-BR') + 'k'} />
                            <Tooltip formatter={(v) => fmtRS(Number(v))} labelStyle={{ color: '#444' }} />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            {dados.combustiveis.map((c) => (
                              <Bar
                                key={c} dataKey={c} name={c} stackId="g" fill={corDoCombustivel(c, dados.combustiveis)} barSize={26} cursor="pointer"
                                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                onClick={(d: any) => { const mes = d?.payload?.mes ?? d?.mes; if (mes) abrirDetalhe(`${c} em ${rotuloMes(mes)}`, { mes, combustivel: c }); }}
                              />
                            ))}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>
                  </div>

                  <Card titulo="Gasto por departamento">
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Departamento</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Abastecimentos</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Gasto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dados.porDepartamento.map((d) => (
                            <tr
                              key={d.chave}
                              style={linhaClicavel}
                              onClick={() => d.chave !== 'Sem departamento' && abrirDetalhe(`Abastecimentos — ${d.chave}`, { departamento: d.chave })}
                            >
                              <td style={{ ...tdStyle, fontWeight: 600 }}>{d.chave}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{d.transacoes}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtL(d.litros)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtRS(d.valor)}</td>
                            </tr>
                          ))}
                          {dados.porDepartamento.length === 0 && (
                            <tr><td style={tdStyle} colSpan={4}>Sem dados (reenvie os lotes para preencher o departamento).</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card titulo="Resumo por combustível">
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Combustível</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Gasto</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Preço médio/L</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dados.porCombustivel.map((c) => (
                            <tr key={c.combustivel} style={linhaClicavel} onClick={() => abrirDetalhe(`Abastecimentos de ${c.combustivel}`, { combustivel: c.combustivel })}>
                              <td style={tdStyle}>
                                <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 0, background: corDoCombustivel(c.combustivel, dados.combustiveis), marginRight: 8 }} />
                                {c.combustivel}
                              </td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtL(c.litros)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtRS(c.valor)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtRS(c.precoMedio)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}

              {/* ===================== VEÍCULOS ===================== */}
              {aba === 'veiculos' && (
                <>
                  {dados.anomalias.length > 0 && (
                    <Card titulo="Anomalias de consumo — investigar (possível problema mecânico, vazamento ou desvio)">
                      {dados.anomalias.map((a) => (
                        <div
                          key={a.placa}
                          onClick={() => abrirDetalhe(`Abastecimentos de ${a.placa}`, { placa: a.placa })}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 0, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}
                        >
                          <AlertTriangle size={18} color="#b45309" />
                          <div style={{ fontSize: '.82rem', color: '#78350f' }}>
                            <strong>{a.placa}</strong>{a.modelo ? ` · ${a.modelo}` : ''} — km/l caiu para{' '}
                            <strong>{a.kmlRecente.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</strong>{' '}
                            (média histórica {a.kmlMedio.toLocaleString('pt-BR', { maximumFractionDigits: 1 })},{' '}
                            {a.desvios.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} desvios-padrão abaixo, {a.trechos} trechos)
                          </div>
                        </div>
                      ))}
                    </Card>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                    <Card titulo="Top 10 veículos por gasto">
                      <RankingChart
                        dados={dados.porVeiculo.slice(0, 10).map((v) => ({ chave: v.chave, nome: v.detalhe ? `${v.chave} · ${v.detalhe}` : v.chave, valor: v.valor }))}
                        cor={COR_VALOR}
                        formato={(v) => fmtRS(v)}
                        onItemClick={(chave) => abrirDetalhe(`Abastecimentos de ${chave}`, { placa: chave })}
                      />
                    </Card>

                    <Card titulo="Curva ABC — quais veículos concentram o custo">
                      <div style={{ overflowX: 'auto', maxHeight: 420, overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                          <thead>
                            <tr>
                              <th style={thStyle}>Classe</th>
                              <th style={thStyle}>Placa</th>
                              <th style={{ ...thStyle, textAlign: 'right' }}>Gasto</th>
                              <th style={{ ...thStyle, textAlign: 'right' }}>% do total</th>
                              <th style={{ ...thStyle, textAlign: 'right' }}>% acumulado</th>
                            </tr>
                          </thead>
                          <tbody>
                            {dados.abc.map((v) => (
                              <tr key={v.placa} style={linhaClicavel} onClick={() => abrirDetalhe(`Abastecimentos de ${v.placa}`, { placa: v.placa })}>
                                <td style={tdStyle}>
                                  <span style={{ background: v.classe === 'A' ? '#fee2e2' : v.classe === 'B' ? '#fef3c7' : '#f3f4f6', color: v.classe === 'A' ? '#b91c1c' : v.classe === 'B' ? '#92400e' : '#6b7280', borderRadius: 0, padding: '2px 8px', fontWeight: 700, fontSize: '.72rem' }}>{v.classe}</span>
                                </td>
                                <td style={{ ...tdStyle, fontWeight: 600 }}>{v.placa}{v.modelo ? <span style={{ color: '#999', fontWeight: 400 }}> · {v.modelo}</span> : null}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtRS(v.valor)}</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{v.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                                <td style={{ ...tdStyle, textAlign: 'right' }}>{v.pctAcum.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  </div>

                  <ComparadorVeiculos
                    serie={dados.porVeiculoMes}
                    veiculos={opcoes.veiculos.length ? opcoes.veiculos : dados.opcoesFiltro.veiculos}
                    meses={dados.evolucaoMensal.map((m) => m.mes)}
                  />

                  <Card titulo="Eficiência por veículo — km/l e custo por km (hodômetro digitado, trechos ruins descartados)">
                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={thStyle}>Veículo</th>
                            <th style={thStyle}>Modelo</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Km rodados</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Km/L</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>R$/km</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Trechos</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Descartados</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dados.consumo.map((c) => (
                            <tr key={c.placa} style={linhaClicavel} onClick={() => abrirDetalhe(`Abastecimentos de ${c.placa}`, { placa: c.placa })}>
                              <td style={{ ...tdStyle, fontWeight: 600 }}>
                                {c.placa}
                                {anomaliaPorPlaca.has(c.placa) && <AlertTriangle size={13} color="#b45309" style={{ marginLeft: 6, verticalAlign: -2 }} />}
                              </td>
                              <td style={tdStyle}>{c.modelo || '—'}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtKm(c.kmRodado)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtL(c.litrosConsiderados)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700 }}>{c.kmPorLitro > 0 ? c.kmPorLitro.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) : '—'}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 700, color: '#dc2626' }}>{c.custoPorKm > 0 ? fmtRS(c.custoPorKm) : '—'}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{c.trechos}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', color: c.trechosDescartados ? '#b45309' : '#444' }}>{c.trechosDescartados}</td>
                            </tr>
                          ))}
                          {dados.consumo.length === 0 && (
                            <tr><td style={tdStyle} colSpan={8}>Sem dados de hodômetro no período.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>
                </>
              )}

              {/* ===================== MOTORISTAS & POSTOS ===================== */}
              {aba === 'pessoas' && (
                <>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                    <Card titulo="Gasto por motorista (top 15)">
                      <RankingChart
                        dados={dados.porMotorista.slice(0, 15).map((m) => ({ chave: m.chave, nome: nomeCurto(m.chave), valor: m.valor }))}
                        cor={COR_VALOR}
                        formato={(v) => fmtRS(v)}
                        onItemClick={(chave) => abrirDetalhe(`Abastecimentos de ${chave}`, { motorista: chave === 'Sem motorista' ? '__sem__' : chave })}
                      />
                    </Card>
                    <Card titulo="Gasto por posto — onde o dinheiro está indo (vale negociar?)">
                      <RankingChart
                        dados={dados.porPosto.slice(0, 12).map((p) => ({ chave: p.chave, nome: p.chave, valor: p.valor }))}
                        cor={COR_VALOR}
                        formato={(v) => fmtRS(v)}
                        onItemClick={(chave) => abrirDetalhe(`Abastecimentos no posto ${chave}`, { posto: chave })}
                      />
                    </Card>
                  </div>

                  {/* Tabela de motoristas — linha clicável abre o popup com a
                      composição do valor (mesmo drill do gráfico de barras, mas
                      com alvo de clique claro e a lista completa, não só o top 15). */}
                  <Card titulo="Gasto por motorista — clique num motorista para ver o que compõe o valor">
                    <div style={{ overflowX: 'auto', maxHeight: 460, overflowY: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr>
                            <th style={{ ...thStyle, textAlign: 'right', width: 44 }}>#</th>
                            <th style={thStyle}>Motorista</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Abastecimentos</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Litros</th>
                            <th style={{ ...thStyle, textAlign: 'right' }}>Gasto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dados.porMotorista.map((m, i) => (
                            <tr
                              key={m.chave}
                              style={linhaClicavel}
                              title="Clique para ver os abastecimentos que compõem este valor"
                              onClick={() => abrirDetalhe(`Abastecimentos de ${m.chave}`, { motorista: m.chave === 'Sem motorista' ? '__sem__' : m.chave })}
                            >
                              <td style={{ ...tdStyle, textAlign: 'right', color: '#aaa' }}>{i + 1}</td>
                              <td style={{ ...tdStyle, fontWeight: 600 }}>{m.chave}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{m.transacoes}</td>
                              <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtL(m.litros)}</td>
                              <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600 }}>{fmtRS(m.valor)}</td>
                            </tr>
                          ))}
                          {dados.porMotorista.length === 0 && (
                            <tr><td style={tdStyle} colSpan={5}>Sem motoristas no período.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  {/* Card "Gasto por Ordem de Serviço" OCULTO a pedido do usuário
                      (07/2026): a operadora ainda manda a coluna OS vazia. Os dados
                      continuam sendo gravados (dados.porOS) — quando os motoristas
                      passarem a digitar a OS, é só restaurar o card aqui. */}
                </>
              )}

              {/* ===================== AUDITORIA ===================== */}
              {aba === 'auditoria' && (
                <>
                  {suspeitas.length > 0 && (
                    <Card titulo="Abastecimentos suspeitos — red flags clássicas de desvio">
                      {suspeitas.map((s, i) => (
                        <div
                          key={i}
                          onClick={() => abrirDetalhe(`Abastecimentos de ${s.placa}`, { placa: s.placa })}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 0, padding: '10px 12px', marginBottom: 8, cursor: 'pointer' }}
                        >
                          <AlertTriangle size={18} color="#b91c1c" />
                          <div style={{ fontSize: '.82rem', color: '#7f1d1d' }}>
                            <strong>{s.placa}</strong> em {new Date(s.data).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} —{' '}
                            {s.motivo} ({s.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L,{' '}
                            {s.horas < 48 ? `${s.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h` : `${(s.horas / 24).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`} após o anterior
                            {s.capacidade ? `, tanque de ${s.capacidade} L` : ''})
                          </div>
                        </div>
                      ))}
                    </Card>
                  )}

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 12 }}>
                    <Card titulo="Intervalo entre abastecimentos × litros (até 7 dias)">
                      <p style={{ color: '#888', fontSize: '.76rem', marginBottom: 8 }}>
                        Pontos no canto superior esquerdo (pouco tempo, muitos litros) merecem verificação.
                      </p>
                      <div style={{ width: '100%', height: 300 }}>
                        <ResponsiveContainer width="100%" height="100%">
                          <ScatterChart margin={{ left: 8, right: 16, bottom: 12 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis type="number" dataKey="horas" name="Horas" tick={{ fontSize: 12, fill: '#888' }} label={{ value: 'horas desde o abastecimento anterior', position: 'insideBottom', offset: -6, fontSize: 12, fill: '#888' }} />
                            <YAxis type="number" dataKey="litros" name="Litros" tick={{ fontSize: 12, fill: '#888' }} />
                            <ZAxis range={[50, 51]} />
                            <Tooltip
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              content={({ active, payload }: any) => {
                                if (!active || !payload?.length) return null;
                                const p = payload[0].payload;
                                return (
                                  <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 0, padding: '8px 10px', fontSize: '.76rem', color: '#444', boxShadow: '0 2px 8px rgba(0,0,0,.08)' }}>
                                    <div style={{ fontWeight: 700 }}>{p.placa}</div>
                                    <div>{p.litros.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} L, {p.horas.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}h após o anterior</div>
                                    {p.motivo && <div style={{ color: '#b91c1c', fontWeight: 600 }}>{p.motivo}</div>}
                                  </div>
                                );
                              }}
                            />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Scatter
                              name="Normal" data={pontosScatter.filter((p) => !p.suspeito)} fill="#94a3b8"
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              onClick={(d: any) => { const pl = d?.placa ?? d?.payload?.placa; if (pl) abrirDetalhe(`Abastecimentos de ${pl}`, { placa: pl }); }}
                            />
                            <Scatter
                              name="Suspeito" data={pontosScatter.filter((p) => p.suspeito)} fill="#b91c1c"
                              // eslint-disable-next-line @typescript-eslint/no-explicit-any
                              onClick={(d: any) => { const pl = d?.placa ?? d?.payload?.placa; if (pl) abrirDetalhe(`Abastecimentos de ${pl}`, { placa: pl }); }}
                            />
                          </ScatterChart>
                        </ResponsiveContainer>
                      </div>
                    </Card>

                    <Card titulo="Quando a frota abastece — dia da semana × hora">
                      <HeatmapDiaHora
                        celulas={dados.heatmap}
                        onCellClick={(dia, hora, nomeDia) =>
                          abrirDetalhe(`Abastecimentos de ${nomeDia} às ${hora}h (no período)`, { dia: String(dia), hora: String(hora) })
                        }
                      />
                    </Card>
                  </div>
                </>
              )}

              {/* ===================== TRANSAÇÕES ===================== */}
              {aba === 'transacoes' && (
                <Card titulo="Últimos abastecimentos">
                  <TabelaTransacoes
                    de={de}
                    ate={ate}
                    filial={filial}
                    placa={placa}
                    motoristas={opcoes.motoristas}
                    veiculos={opcoes.veiculos}
                  />
                </Card>
              )}
            </>
          )}
        </>
      )}

      {/* Rodapé: linha de importação — clica e abre o popup para enviar o CSV. */}
      {podeUpload && (
        <div
          onClick={() => setUploadAberto(true)}
          title="Importar o CSV mensal da operadora"
          style={{ marginTop: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, borderTop: '1px dashed #e5e5e5', background: '#fafafa', color: '#dc2626', fontSize: '.8rem', fontWeight: 600, padding: '13px 16px', borderRadius: 0, cursor: 'pointer' }}
        >
          <Upload size={15} /> Importar CSV da operadora
          <span style={{ color: '#aaa', fontWeight: 400 }}>· clique para enviar o arquivo do mês</span>
        </div>
      )}

      {/* Popup de importação: reusa o componente UploadLotes inteiro. */}
      {podeUpload && uploadAberto && (
        <div
          onClick={() => setUploadAberto(false)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '5vh 16px', overflow: 'auto' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 0, width: 'min(1020px, 100%)', maxHeight: '90vh', overflow: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,.2)', position: 'relative', padding: 16 }}
          >
            <button
              onClick={() => setUploadAberto(false)}
              title="Fechar"
              style={{ position: 'absolute', top: 12, right: 12, background: 'none', border: 'none', cursor: 'pointer', color: '#888', padding: 4, zIndex: 1 }}
            >
              <X size={20} />
            </button>
            <UploadLotes usuario={userProfile.nome || ''} isAdmin={isAdmin} onMudou={carregar} />
          </div>
        </div>
      )}

      {detalhe && <DetalheModal {...detalhe} onClose={() => setDetalhe(null)} />}
    </div>
  );
}
