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

type Tab = 'mes' | 'grafico' | 'estoqueTipo';
type Dimensao = 'tipo' | 'categoria' | 'familia' | 'tipocarac';
interface SerieResp { pontos: PontoMensal[]; series: SerieDef[]; dimensao: Dimensao; estoqueAtual: { peca: number; maquina: number }; erro?: string }
interface SerieTipoResp { pontos: PontoMensal[]; series: SerieDef[]; estoqueAtual: Record<string, number>; erro?: string }

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

  // Aba "Estoque por Tipo" (saldo de Peças por característica "Tipo:")
  const [mesesTipo, setMesesTipo] = useState(12);
  const [incluirSemTipo, setIncluirSemTipo] = useState(false);
  const [serieTipo, setSerieTipo] = useState<SerieTipoResp | null>(null);
  const [serieTipoCarregando, setSerieTipoCarregando] = useState(false);
  const [serieTipoErro, setSerieTipoErro] = useState('');

  // Popup de composição (clique em célula).
  const [popup, setPopup] = useState<{ titulo: string; params: ComposicaoParams } | null>(null);

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

  // Clique numa célula da aba "Estoque por Tipo" → composição do saldo atual daquele Tipo.
  // (Só saldo atual: a composição por mês passado não é reconstruível item-a-item.)
  const abrirPopupEstoqueTipo = (s: SerieDef) => {
    const tipo = s.key.slice('estoque::'.length);
    if (tipo === 'Outras') return; // agregado de vários Tipos — não filtra por um só
    // grupo:'peca' espelha a série (só peças) — nunca listar máquinas no popup de Tipo.
    setPopup({ titulo: `${s.label} — saldo atual`, params: { fonte: 'estoque', tipocarac: tipo, grupo: 'peca' } });
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
        {([['mes', 'Tabela do mês'], ['grafico', 'Gráfico mensal'], ['estoqueTipo', 'Estoque por Tipo']] as [Tab, string][]).map(([id, label]) => (
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
                onPointClick={(key, p) => { const s = serie.series.find((x) => x.key === key) ?? sinteticoFat(key); if (s) abrirPopupSerie(s, p); }}
              />
            </div>

            <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={thStyle}>Mês</th>
                  {serie.series.map((s) => <th key={s.key} style={{ ...thNum, color: s.cor }}>{s.label}</th>)}
                </tr></thead>
                <tbody>
                  {serie.pontos.map((p, i) => (
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
            <input type="checkbox" checked={incluirSemTipo} onChange={(e) => setIncluirSemTipo(e.target.checked)} />
            Incluir &quot;Sem tipo&quot;
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
                  <SerieMensalChart dados={serieTipo.pontos} series={serieTipo.series} />
                </div>

                <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr>
                      <th style={thStyle}>Mês</th>
                      {serieTipo.series.map((s) => <th key={s.key} style={{ ...thNum, color: s.cor }}>{s.label}</th>)}
                    </tr></thead>
                    <tbody>
                      {serieTipo.pontos.map((p, i) => (
                        <tr key={i}>
                          <td style={tdStyle}>{p.periodo}</td>
                          {serieTipo.series.map((s) => {
                            const v = Number(p[s.key] || 0);
                            const clic = v !== 0 && s.key !== 'estoque::Outras';
                            return (
                              <td key={s.key} style={{ ...tdNum, color: v ? s.cor : '#bbb', cursor: clic ? 'pointer' : 'default' }}
                                onClick={() => clic && abrirPopupEstoqueTipo(s)}>
                                {v ? fmtRS0(v) : '—'}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            <p style={{ color: '#aaa', fontSize: '.72rem', marginTop: 10 }}>
              Saldo (R$) de estoque das <strong>Peças</strong>, por característica <strong>&quot;Tipo:&quot;</strong> (tabela produto_tipo; top 6 + &ldquo;Outras&rdquo;). Quem não tem Tipo cai em &ldquo;Sem tipo&rdquo;.
              O mês atual mostra o saldo de hoje (ao vivo); os meses anteriores aparecem conforme o <strong>snapshot mensal</strong> for sendo gravado — meses sem snapshot ficam sem ponto. Clique numa célula para ver a composição do saldo atual daquele Tipo.
            </p>
          </>
        )}
      </>
      )}

      {popup && (
        <ComposicaoModal titulo={popup.titulo} params={popup.params} contaParam={contaParam} onClose={() => setPopup(null)} />
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
