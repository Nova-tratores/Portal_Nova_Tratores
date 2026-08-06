'use client';
// Dashboard de Vendas. Portado de GET /dashboard (server.js:4932) consumindo
// /api/estoque/dashboard{,/historico,/categorias-vendas,/vendas,/pedido-itens,/compras}.
import { useState, useCallback, useEffect, Fragment } from 'react';
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
  valorNota?: number;
  valorInterno?: number;
  valorInternoRetorno?: number;
  valorInternoPuro?: number;
  valorHR?: number;
  valorKM?: number;
  valorOutros?: number;
  unidades?: number;
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
interface HistMes { label: string; mes: number; ano: number; valor: number; custo: number; qtdePedidos: number; valorNota?: number | null; valorInterno?: number | null }
interface HistResp { card: number; nome: string; meses: HistMes[]; erro?: string }
interface VendaRow {
  numero_pedido?: string; data_pedido?: string; descricao?: string; codigo_produto?: string;
  quantidade?: number; valor_unitario?: number; valor_total?: number; cmc_unitario?: number;
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
        {pode('estoque', 'curva-abc') && (<Link href="/estoque/curva-abc" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Curva ABC</Link>)}
        {pode('estoque', 'giro-estoque') && (<Link href="/estoque/giro-estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Giro de Estoque</Link>)}
        <Link href="/estoque/cruzamento-familia" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Cruzamento de Família</Link>
      </div>

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Período" value={mes} onChange={(v) => setMes(parseInt(v))}
          options={[{ value: 0, label: 'Ano inteiro' }, ...MESES.map((m, i) => ({ value: i + 1, label: m }))]} />
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
              {dados.modo === 'ano' ? 'Ano corrente' : 'Mês corrente'} — {dados.diasUteisTranscorridos}/{dados.diasUteisTotal} dias úteis ({Math.round((dados.proporcao || 0) * 100)}%). Comparativos ajustados proporcionalmente; projeção exibida.
            </div>
          )}
          {(() => {
            const renderCard = (c: Categoria, key: number) => {
              // "Comprei" só tem um valor (não venda/custo/margem): ignora o toggle.
              const ehCompras = c.cardType === 'compras';
              const mLocal: Metrica = ehCompras ? 'venda' : metrica;
              const atual = valorMetrica(c, mLocal, 'atual');
              const mAnt = valorMetrica(c, mLocal, 'mesAnt');
              const aAnt = valorMetrica(c, mLocal, 'anoAnt');
              const varM = calcVar(atual, mAnt);
              const varA = calcVar(atual, aAnt);
              const proj = mLocal === 'venda' ? c.valorProjetado : null;
              const bordaVermelha = c.cardType === 'totalPecas' || c.cardType === 'totalGeral';
              // "Comprei" é dinheiro que SAI, não venda: acento indigo p/ não confundir.
              const cor = ehCompras ? '#4f46e5' : '#dc2626';
              const borda = ehCompras ? '1px solid #c7d2fe' : bordaVermelha ? '2px solid #dc2626' : '1px solid #eee';
              // Card Serviços (métrica venda): o destaque é a RECEITA de serviços
              // (com nota + interno c/ retorno), espelhando a régua do OMIE. Abaixo,
              // a composição com-nota (HR/KM/Outros), o quanto veio do "com retorno"
              // e o interno puro que ficou de fora.
              const servicoNota = c.cardType === 'servico' && metrica === 'venda' && c.valorNota != null && c.valorInterno != null;
              return (
                <div key={key} style={{ background: ehCompras ? '#f5f6ff' : '#fff', border: borda, borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                  <div style={{ fontSize: '.72rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 6 }}>{c.nome}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: cor }}>{fmtRS(atual)}</div>
                  {ehCompras && (
                    <div style={{ fontSize: '.68rem', color: '#6366f1', marginTop: 3 }}>entradas de peças (NF) no período</div>
                  )}
                  {servicoNota && (
                    <>
                      {c.valorHR != null && (
                        <div style={{ fontSize: '.7rem', color: '#666', marginTop: 4 }}>
                          <span title="Composição da parte COM NOTA da receita." style={{ color: '#999' }}>Com nota — </span>
                          HR: <span style={{ fontWeight: 700 }}>{fmtRS(c.valorHR)}</span>
                          {' · '}KM: <span style={{ fontWeight: 700 }}>{fmtRS(c.valorKM)}</span>
                          {' · '}Outros: <span style={{ fontWeight: 700 }}>{fmtRS(c.valorOutros)}</span>
                        </div>
                      )}
                      {c.valorInternoRetorno != null && c.valorInternoPuro != null ? (
                        <>
                          <div style={{ fontSize: '.7rem', color: '#b45309', marginTop: 4 }}>
                            <span title="Garantia de fábrica, revisão e serviço normal sem nota (valor cheio) + entrega técnica/montagem pela comissão fixa (R$150/250/400/500, como no OMIE) — JÁ SOMADO na receita acima.">
                              + Interno c/ retorno: <span style={{ fontWeight: 700 }}>{fmtRS(c.valorInternoRetorno)}</span>
                            </span>
                          </div>
                          <div style={{ fontSize: '.7rem', color: '#999', marginTop: 2 }}>
                            <span title="Cortesia comercial e contrato interno/oficina — NÃO entra na receita (interno de verdade).">
                              Interno puro (fora): <span style={{ fontWeight: 600, color: '#666' }}>{fmtRS(c.valorInternoPuro)}</span>
                            </span>
                          </div>
                        </>
                      ) : (
                        <div style={{ fontSize: '.7rem', color: '#999', marginTop: 4 }}>
                          Interno: <span style={{ fontWeight: 600, color: '#666' }}>{fmtRS(c.valorInterno)}</span>
                        </div>
                      )}
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: '.7rem' }}>
                    {/* No modo "ano inteiro" não existe mês anterior — só o comparativo com o ano passado. */}
                    {dados.modo !== 'ano' && <span style={{ color: varM >= 0 ? '#16a34a' : '#dc2626' }}>Mês ant: {fmtPct(varM)}</span>}
                    <span style={{ color: varA >= 0 ? '#16a34a' : '#dc2626' }}>Ano ant: {fmtPct(varA)}</span>
                  </div>
                  {proj != null && <div style={{ fontSize: '.7rem', color: '#999', marginTop: 4 }}>Projeção: {fmtRS(proj)}</div>}
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    {ehCompras ? (
                      <Link href="/estoque/notas-entrada" style={{ ...linkBtn, color: '#4f46e5' }}>ver notas de entrada</Link>
                    ) : (
                      <>
                        <button onClick={() => abrirHistorico(cardIndexParaApi(c, dados))} style={linkBtn}>histórico</button>
                        {c.cardType === 'servico'
                          ? <button onClick={abrirOSServicos} style={linkBtn}>vendas</button>
                          : <button onClick={() => abrirVendas(cardIndexParaApi(c, dados), c.nome)} style={linkBtn}>vendas</button>}
                      </>
                    )}
                  </div>
                </div>
              );
            };
            // Card de MÁQUINA (faixa própria): venda é "caroço" → destaque = UNIDADES
            // + faturamento, comparativo relevante = ano-a-ano (mês/projeção escondidos).
            const renderMaquina = (c: Categoria, key: number) => {
              const ehTotal = c.cardType === 'totalMaquinas';
              const varA = calcVar(c.valorAtual, c.anoAnteriorValor);
              const un = c.unidades ?? 0;
              const familiaDrill = ehTotal || c.nome === 'Outras máquinas' ? '__TODAS__' : c.nome;
              return (
                <div key={key} style={{ background: ehTotal ? '#fffaf0' : '#fff', border: ehTotal ? '2px solid #d97706' : '1px solid #f0d9b5', borderRadius: 12, padding: 16, boxShadow: '0 1px 4px rgba(0,0,0,.04)' }}>
                  <div style={{ fontSize: '.72rem', color: '#92610e', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700, marginBottom: 6 }}>{c.nome}</div>
                  <div style={{ fontSize: '1.3rem', fontWeight: 700, color: '#d97706' }}>{un.toLocaleString('pt-BR')} {un === 1 ? 'máquina' : 'máquinas'}</div>
                  <div style={{ fontSize: '.9rem', color: '#666', marginTop: 2 }}>{fmtRS(c.valorAtual)} faturado</div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 8, fontSize: '.7rem' }}>
                    <span style={{ color: varA >= 0 ? '#16a34a' : '#dc2626' }}>Ano ant: {fmtPct(varA)}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, marginTop: 10 }}>
                    <button onClick={() => abrirVendasMaquina(familiaDrill, ehTotal ? 'Máquinas (todas)' : c.nome)} style={{ ...linkBtn, color: '#b45309' }}>ver vendas</button>
                  </div>
                </div>
              );
            };
            // Esboço do usuário: produtos à esquerda; Serviços + totais na coluna da
            // direita, atrás de uma linha vertical; linha horizontal acima do Total Geral.
            // Máquinas ficam numa faixa separada abaixo (não misturam com peças).
            const produtos = dados.categorias.filter((c) => c.cardType === 'produto');
            const maquinas = dados.categorias.filter((c) => c.cardType === 'maquina' || c.cardType === 'totalMaquinas');
            const direita = dados.categorias.filter((c) => c.cardType !== 'produto' && c.cardType !== 'maquina' && c.cardType !== 'totalMaquinas');
            return (
              <>
                <div style={{ display: 'flex', gap: 12, marginBottom: 18, flexWrap: 'wrap', alignItems: 'stretch' }}>
                  <div style={{ flex: '3 1 500px', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12, alignContent: 'start' }}>
                    {produtos.map((c, i) => renderCard(c, i))}
                  </div>
                  <div style={{ width: 2, background: '#111', alignSelf: 'stretch' }} />
                  <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 12, alignContent: 'start' }}>
                    {direita.map((c, i) => (
                      <Fragment key={i}>
                        {c.cardType === 'totalGeral' && <div style={{ borderTop: '2px solid #111' }} />}
                        {renderCard(c, i)}
                      </Fragment>
                    ))}
                  </div>
                </div>
                {maquinas.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ fontSize: '.8rem', color: '#92610e', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, background: '#d97706', display: 'inline-block' }} />
                      Máquinas <span style={{ color: '#bbb', fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>· por família · unidades vendidas no período</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
                      {maquinas.map((c, i) => renderMaquina(c, i))}
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </>
      )}

      {/* Histórico */}
      {histCard != null && (
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <h2 style={{ color: '#dc2626', fontSize: '.95rem', fontWeight: 700, marginBottom: 12 }}>Histórico — {hist?.nome || '…'}</h2>
          {!hist ? <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div> : (() => {
            // Card Serviços: split com nota × interno (quando o os_mensal já tem); custo todo-zero sai do gráfico.
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
                    <Line type="monotone" dataKey="valor" name="Venda" stroke="#dc2626" strokeWidth={2} dot={false} />
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
        <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 18, marginBottom: 18 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h2 style={{ color: '#dc2626', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>Vendas — {vendasCard.nome} ({vendas?.length ?? 0})</h2>
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
              <h2 style={{ color: '#dc2626', fontSize: '.95rem', fontWeight: 700, margin: 0 }}>
                Serviços — {osView === 'servicos' ? `itens (${servItens?.length ?? 0})` : `Ordens de Serviço (${osServicos?.length ?? 0})`}
                {osServicos && osServicos.length > 0 && (
                  <span style={{ color: '#888', fontWeight: 600, marginLeft: 8 }}>· Total {fmtRS(osServicos.reduce((s, o) => s + (o.valor || 0), 0))}</span>
                )}
              </h2>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ display: 'flex', gap: 4 }}>
                  {([['servicos', 'Serviços'], ['os', 'Por OS']] as Array<['servicos' | 'os', string]>).map(([v, rotulo]) => (
                    <button key={v} onClick={() => setOsView(v)}
                      style={{ padding: '5px 12px', border: '1px solid', borderColor: osView === v ? '#dc2626' : '#e0e0e0', background: osView === v ? '#dc2626' : '#fff', color: osView === v ? '#fff' : '#666', borderRadius: 8, fontSize: '.72rem', fontWeight: 600, cursor: 'pointer' }}>
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
                          style={{ padding: '7px 12px', border: '1px solid', borderColor: ativo ? '#dc2626' : '#e0e0e0', background: ativo ? '#fef2f2' : '#fafafa', borderRadius: 8, cursor: 'pointer', textAlign: 'left' }}>
                          <div style={{ fontSize: '.62rem', color: '#888', textTransform: 'uppercase', letterSpacing: '.5px', fontWeight: 700 }}>{tipoRotulo(t)}</div>
                          <div style={{ fontSize: '.88rem', fontWeight: 700, color: '#dc2626' }}>{fmtRS(soma)} <span style={{ color: '#999', fontWeight: 600, fontSize: '.7rem' }}>· {unidade}</span></div>
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
// O ordinal do produto é a posição ENTRE os cards de produto (a ordem de exibição
// intercala Serviços/totais, então o índice bruto do array não serve).
function cardIndexParaApi(c: Categoria, dados: DashboardResp): number {
  const produtos = dados.categorias.filter((x) => x.cardType === 'produto');
  // produto cards = N categorias reais + 1 "Pecas Diversas" (catch-all) → numCats = produtoCount - 1
  const numCats = produtos.length - 1;
  if (c.cardType === 'totalPecas') return 0;
  if (c.cardType === 'servico') return numCats + 2;
  if (c.cardType === 'totalGeral') return numCats + 3;
  const pIdx = produtos.indexOf(c);
  if (pIdx === numCats) return numCats + 1; // Pecas Diversas (catch-all)
  return pIdx + 1;
}
