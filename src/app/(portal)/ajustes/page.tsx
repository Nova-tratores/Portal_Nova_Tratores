'use client';
// Dashboard CMC Garantia. Portado de app.js + dashboard.ejs (ex-"Omie CMC Garantia").
// Consome /api/ajustes/{analise,aplicar-correcao,aplicar-correcao-lote}.
import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos do payload ----------
interface PorLocal { localId: number; localNome: string; saldo: number; cmc: number }
interface NfGarantia {
  numero?: string; codNotaEnt?: number | string; dataRef?: string; fornecedor?: string;
  cfop?: string; motivoClassificacao?: string; qtde?: number; valUnit?: number; valTotal?: number;
}
interface EntradaNormal { numero?: string; dataRef?: string; qtde?: number; valUnit?: number }
interface MovimentoResumo {
  data?: string; codOrigem?: string; desOrigem?: string; numDoc?: string; cancelado?: boolean;
  devolucao?: boolean; qtdeEntrada?: number; entradaCMC?: number; qtdeSaida?: number;
  cmcAnterior?: number | null; cmcAtual?: number | null;
}
interface UltimaCorrecao {
  criado_em?: string; cmc_anterior?: number; cmc_aplicado?: number;
  codigo_local_estoque?: number | string; codigo_ajuste_omie?: number | string; criado_por?: string;
}
interface ProdutoAfetado {
  key: string; codigoProduto: number | null; codigoIntegracao?: string | null; descricao?: string;
  cmcAtual: number | null; saldoTotal: number | null; qtdNfsGarantia?: number;
  ultimoCustoGarantia?: number; menorCustoGarantia?: number; cfopsGarantia?: string[];
  cmcSugerido?: number | null; estrategiaSugestao?: string; provavelmenteDistorcido?: boolean;
  jaCorrigido?: boolean; ultimaCorrecao?: UltimaCorrecao | null; dataPrimeiraGarantia?: string | null;
  porLocal?: PorLocal[]; nfsGarantia?: NfGarantia[]; entradasNormais?: EntradaNormal[];
  movimentosResumo?: MovimentoResumo[];
  cmcSugeridoBaseadoEm?: { data?: string; origem?: string; doc?: string } | null;
}
interface AnaliseConfig { cfopsGarantia?: string[]; thresholdCustoBaixo?: number; lookbackMeses?: number }
interface AnalisePayload {
  totalNfs?: number; totalNfsComItemGarantia?: number; totalItensGarantia?: number;
  totalProdutosAfetados?: number; totalNfsCanceladas?: number; dataDeBR?: string; dataAteBR?: string;
  duracaoMs?: number; fonte?: 'cache' | 'omie'; cachedEm?: string; config?: AnaliseConfig;
  produtos?: ProdutoAfetado[]; erro?: string;
}
interface ResultadoLinha { tipo: 'ok' | 'erro'; texto: string }

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
function fmtSaldo(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '?';
  return fmtNum(n, Number(n) % 1 ? 2 : 0);
}
const MOTIVO_LABEL: Record<string, string> = {
  recebimento: 'recebimento de NF com sinal de garantia',
  cfop: 'CFOP de garantia',
  custo_zero: 'custo zero/negativo',
  custo_baixo: 'custo abaixo do normal',
};
function motivoLabel(m?: string): string { return (m && MOTIVO_LABEL[m]) || m || ''; }
const ESTRATEGIA_LABEL: Record<string, string> = {
  cmc_movimento_anterior: 'CMC vigente imediatamente antes da NF de garantia (via movimentos de estoque)',
  ultimo_cmc_compra: 'CMC apos a ultima compra real antes da garantia',
  ultimo_custo_normal: 'ultimo custo de entrada normal',
  mediana_custos_normais: 'mediana dos custos de entrada normais',
  manual: 'sem base automatica - informe manualmente',
};
function estrategiaLabel(e?: string): string { return (e && ESTRATEGIA_LABEL[e]) || e || ''; }

function localDefaultId(p: ProdutoAfetado): number | null {
  const comSaldo = (p.porLocal || []).filter((l) => l.saldo > 0);
  if (!comSaldo.length) return null;
  return comSaldo.slice().sort((a, b) => b.saldo - a.saldo)[0].localId;
}

// estilos compartilhados
const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

export default function AjustesDashboardPage() {
  const { userProfile } = useAuth();
  const { temAcesso, isAdmin, permissoes, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [dados, setDados] = useState<AnalisePayload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');

  // estado de edição por produto (key -> {cmc, local})
  const [cmcEdit, setCmcEdit] = useState<Record<string, string>>({});
  const [localSel, setLocalSel] = useState<Record<string, number | ''>>({});
  const [selecionados, setSelecionados] = useState<Record<string, boolean>>({});
  const [resultados, setResultados] = useState<Record<string, ResultadoLinha>>({});
  const [aplicandoKey, setAplicandoKey] = useState<string | null>(null);
  const [aplicandoLote, setAplicandoLote] = useState(false);
  const [loteStatus, setLoteStatus] = useState('');
  const [corrigidosExtra, setCorrigidosExtra] = useState(0);

  // modal de detalhe
  const [modalProd, setModalProd] = useState<ProdutoAfetado | null>(null);

  const analisar = useCallback(async (force: boolean) => {
    if (!conta) return; // tela é por conta
    setCarregando(true);
    setErro('');
    setStatusMsg('Consultando o Omie... (pode levar 1-2 min na 1a vez)');
    try {
      let qs = contaParam; // já vem como '&conta=...'
      if (de) qs += '&de=' + encodeURIComponent(de);
      if (ate) qs += '&ate=' + encodeURIComponent(ate);
      if (force) qs += '&force=1';
      const r = await fetch(`/api/ajustes/analise?${qs.replace(/^&/, '')}`);
      const d = (await r.json()) as AnalisePayload;
      if (d.erro) { setErro(d.erro); setStatusMsg(''); return; }
      // popula edição inicial
      const cmcInit: Record<string, string> = {};
      const localInit: Record<string, number | ''> = {};
      (d.produtos || []).forEach((p) => {
        cmcInit[p.key] = p.cmcSugerido != null ? String(p.cmcSugerido) : '';
        const def = localDefaultId(p);
        localInit[p.key] = def != null ? def : '';
      });
      setCmcEdit(cmcInit);
      setLocalSel(localInit);
      setSelecionados({});
      setResultados({});
      setCorrigidosExtra(0);
      setDados(d);
      const fonte = d.fonte === 'cache'
        ? 'cache de ' + (d.cachedEm ? new Date(d.cachedEm).toLocaleTimeString('pt-BR') : '?')
        : 'consulta ao vivo';
      const dur = d.duracaoMs ? ' · ' + (d.duracaoMs / 1000).toFixed(1) + 's' : '';
      const cancel = d.totalNfsCanceladas ? ' · ' + d.totalNfsCanceladas + ' canceladas ignoradas' : '';
      setStatusMsg(`Janela ${d.dataDeBR || '?'} a ${d.dataAteBR || '?'} · ${fonte}${dur}${cancel}`);
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
      setStatusMsg('');
    } finally {
      setCarregando(false);
    }
  }, [conta, contaParam, de, ate]);

  // auto-análise ao montar / trocar conta (usa cache se houver)
  useEffect(() => {
    if (conta) analisar(false);
    else { setDados(null); setStatusMsg(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  const corpoLinha = useCallback((p: ProdutoAfetado) => {
    const novoCMC = Number(String(cmcEdit[p.key] ?? '').replace(',', '.'));
    const codLocal = localSel[p.key] === '' || localSel[p.key] == null ? null : Number(localSel[p.key]);
    return {
      conta,
      codigoProduto: p.codigoProduto,
      codigoIntegracao: p.codigoIntegracao,
      codLocal,
      novoCMC,
      cmcSugerido: p.cmcSugerido,
      estrategiaSugestao: p.estrategiaSugestao,
      descricao: p.descricao,
      nfOrigemNumero: (p.nfsGarantia || []).map((g) => g.numero).filter(Boolean).slice(0, 30).join(','),
      nfOrigemDataBR: p.dataPrimeiraGarantia || null,
      cfopOrigem: (p.cfopsGarantia || []).join(','),
      custoGarantiaUnit: p.ultimoCustoGarantia != null ? p.ultimoCustoGarantia : p.menorCustoGarantia,
      criadoPor,
    };
  }, [cmcEdit, localSel, conta, criadoPor]);

  const aplicarLinha = useCallback(async (p: ProdutoAfetado) => {
    const body = corpoLinha(p);
    if (!(body.novoCMC > 0)) { alert('Informe um CMC valido (> 0).'); return; }
    if (body.codLocal == null) { alert('Selecione um local de estoque.'); return; }
    if (!confirm(`Aplicar CMC ${fmtBRL(body.novoCMC)} no produto ${p.codigoProduto} (${p.descricao || ''}), local ${body.codLocal}?\n\nIsso registra um ajuste de estoque (tipo SLD, motivo CMC) no Omie.`)) return;
    setAplicandoKey(p.key);
    try {
      const r = await fetch('/api/ajustes/aplicar-correcao', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      if (d.ok) {
        setResultados((s) => ({ ...s, [p.key]: { tipo: 'ok', texto: `OK ${d.duplicado ? '(ja existia)' : ''} · ajuste #${d.codigoAjuste || '?'} · CMC ${fmtBRL(d.cmcAnterior)} → ${fmtBRL(d.cmcAplicado)}` } }));
        setSelecionados((s) => ({ ...s, [p.key]: false }));
        setCorrigidosExtra((n) => n + 1);
      } else {
        setResultados((s) => ({ ...s, [p.key]: { tipo: 'erro', texto: d.erro || 'falhou' } }));
      }
    } catch (ex) {
      setResultados((s) => ({ ...s, [p.key]: { tipo: 'erro', texto: 'erro de rede: ' + (ex as Error).message } }));
    } finally {
      setAplicandoKey(null);
    }
  }, [corpoLinha]);

  // produtos aplicáveis (têm saldo>0 e código)
  const podeAplicar = useCallback((p: ProdutoAfetado) => {
    return p.codigoProduto != null && (p.porLocal || []).some((l) => l.saldo > 0);
  }, []);

  const keysSelecionadas = dados?.produtos?.filter((p) => selecionados[p.key] && podeAplicar(p) && !resultados[p.key]) || [];

  const aplicarLote = useCallback(async () => {
    const sel = (dados?.produtos || []).filter((p) => selecionados[p.key] && podeAplicar(p) && !resultados[p.key]);
    if (!sel.length) return;
    const bodies = [];
    for (const p of sel) {
      const b = corpoLinha(p);
      if (!(b.novoCMC > 0) || b.codLocal == null) { alert('Linha do produto ' + p.codigoProduto + ' com CMC ou local invalido.'); return; }
      bodies.push(b);
    }
    if (!confirm(`Aplicar ${bodies.length} correcoes de CMC no Omie? Cada uma registra um ajuste de estoque.`)) return;
    setAplicandoLote(true);
    setLoteStatus(`aplicando ${bodies.length} correcoes (com pausa entre cada)...`);
    try {
      const r = await fetch('/api/ajustes/aplicar-correcao-lote', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ correcoes: bodies, criadoPor }) });
      const d = await r.json();
      let ok = 0, err = 0;
      const novosRes: Record<string, ResultadoLinha> = {};
      const desmarcar: Record<string, boolean> = {};
      (d.resultados || []).forEach((rr: { codigoProduto?: number; codLocal?: number; ok?: boolean; codigoAjuste?: number | string; erro?: string }) => {
        const alvo = sel.find((s) => s.codigoProduto === rr.codigoProduto);
        if (!alvo) return;
        if (rr.ok) { ok++; novosRes[alvo.key] = { tipo: 'ok', texto: `OK · ajuste #${rr.codigoAjuste || '?'}` }; desmarcar[alvo.key] = false; }
        else { err++; novosRes[alvo.key] = { tipo: 'erro', texto: rr.erro || 'falhou' }; }
      });
      setResultados((s) => ({ ...s, ...novosRes }));
      setSelecionados((s) => ({ ...s, ...desmarcar }));
      setCorrigidosExtra((n) => n + ok);
      setLoteStatus(`${ok} aplicadas, ${err} com erro.`);
    } catch (ex) {
      setLoteStatus('erro de rede: ' + (ex as Error).message);
    } finally {
      setAplicandoLote(false);
    }
  }, [dados, selecionados, resultados, corpoLinha, podeAplicar, criadoPor]);

  const toggleTodos = useCallback((on: boolean) => {
    const novo: Record<string, boolean> = {};
    (dados?.produtos || []).forEach((p) => { if (podeAplicar(p) && !resultados[p.key]) novo[p.key] = on; });
    setSelecionados(novo);
  }, [dados, resultados, podeAplicar]);

  if (!permLoading && userProfile && !temAcesso('ajustes:dashboard')) {
    // Sem o dashboard, mas com acesso a outra(s) pagina(s): nao bloqueia seco —
    // o submenu (layout) lista o que ele pode abrir.
    const temAlgumAjuste = isAdmin || (permissoes?.modulos_permitidos || []).some((m) => m.startsWith('ajustes:'));
    if (temAlgumAjuste) {
      return (
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: '40px 24px', color: '#64748b', fontSize: '.9rem' }}>
          Selecione uma página no menu acima.
        </div>
      );
    }
    return <SemPermissao />;
  }

  const jaCorrigidos = (dados?.produtos || []).filter((p) => p.jaCorrigido).length + corrigidosExtra;
  const cfg = dados?.config;
  const nSel = keysSelecionadas.length;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Produtos com CMC distorcido por NF de garantia</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem' }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b> · consulta ao vivo no Omie
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>De (emissao/entrada)</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && analisar(false)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ate</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && analisar(false)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <button onClick={() => analisar(false)} disabled={carregando || !conta} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Analisar</button>
          <button onClick={() => analisar(true)} disabled={carregando || !conta} title="Refaz a analise ignorando o cache" style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Atualizar</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes/historico" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Histórico</Link>
        <Link href="/ajustes/ajuste-custos" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Ajuste de custos</Link>
      </div>

      {conta === '' ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica para varrer as NFs de garantia. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          {/* badges de config */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '.72rem' }}>
            {cfg && (
              <>
                <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>
                  CFOPs garantia: <span style={{ fontFamily: 'monospace' }}>{cfg.cfopsGarantia?.length ? cfg.cfopsGarantia.join(', ') : '(nenhum configurado!)'}</span>
                </span>
                {cfg.thresholdCustoBaixo != null && (
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>
                    Custo abaixo de {Math.round(cfg.thresholdCustoBaixo * 100)}% do normal → tratado como garantia
                  </span>
                )}
                {cfg.lookbackMeses != null && (
                  <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>Janela padrao: {cfg.lookbackMeses} meses</span>
                )}
              </>
            )}
            <span style={{ marginLeft: 'auto', color: '#64748b' }}>{carregando ? 'Carregando…' : statusMsg}</span>
          </div>

          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

          {/* KPIs */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Kpi label="NFs no periodo" valor={fmtNum(dados?.totalNfs)} />
            <Kpi label="NFs com item garantia" valor={fmtNum(dados?.totalNfsComItemGarantia)} cor="#b45309" />
            <Kpi label="Itens de garantia" valor={fmtNum(dados?.totalItensGarantia)} />
            <Kpi label="Produtos afetados" valor={fmtNum(dados?.totalProdutosAfetados)} cor="#b91c1c" />
            <Kpi label="Ja corrigidos" valor={fmtNum(jaCorrigidos)} cor="#047857" />
          </div>

          {/* Resumo da semana anterior (recebimentos pendentes, pedidos abertos, estoque negativo) */}
          {conta && <ResumoSemana key={conta} conta={conta} contaParam={contaParam} />}

          {/* Ações em lote */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
            <label style={{ fontSize: '.82rem', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={nSel > 0 && nSel === (dados?.produtos || []).filter((p) => podeAplicar(p) && !resultados[p.key]).length} onChange={(e) => toggleTodos(e.target.checked)} />
              selecionar todos
            </label>
            <button onClick={aplicarLote} disabled={nSel === 0 || aplicandoLote} style={{ padding: '6px 14px', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: 'pointer', opacity: nSel === 0 || aplicandoLote ? 0.4 : 1 }}>
              {nSel === 0 ? 'Aplicar selecionados' : `Aplicar selecionados (${nSel})`}
            </button>
            {loteStatus && <span style={{ fontSize: '.82rem', color: aplicandoLote ? '#64748b' : '#475569' }}>{loteStatus}</span>}
          </div>

          {/* Tabela */}
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 30 }}></th>
                    <th style={thStyle}>Produto</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>CMC atual</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Saldo</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>NFs gar.</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Ult. custo gar.</th>
                    <th style={thStyle}>CFOPs</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>CMC sugerido</th>
                    <th style={thStyle}>Estrategia</th>
                    <th style={thStyle}>Local p/ ajuste</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {!dados ? (
                    <tr><td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Clique em <b>Analisar</b> para buscar os dados no Omie.</td></tr>
                  ) : (dados.produtos || []).length === 0 ? (
                    <tr><td colSpan={11} style={{ padding: '40px', textAlign: 'center', color: '#059669' }}>Nenhum produto afetado por NF de garantia nesse periodo. 🎉</td></tr>
                  ) : (
                    dados.produtos!.map((p) => {
                      const locaisComSaldo = (p.porLocal || []).filter((l) => l.saldo > 0);
                      const temComoAplicar = podeAplicar(p);
                      const res = resultados[p.key];
                      const bg = res?.tipo === 'ok' || p.jaCorrigido ? '#ecfdf5' : (p.provavelmenteDistorcido ? '#fffbeb' : undefined);
                      return (
                        <tr key={p.key} style={{ background: bg, borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ ...tdStyle, textAlign: 'center' }}>
                            <input type="checkbox" disabled={!temComoAplicar || !!res} checked={!!selecionados[p.key]} onChange={(e) => setSelecionados((s) => ({ ...s, [p.key]: e.target.checked }))} />
                          </td>
                          <td style={tdStyle}>
                            <div style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#64748b' }}>{p.codigoProduto != null ? p.codigoProduto : (p.codigoIntegracao || '?')}</div>
                            <div style={{ fontWeight: 500 }}>{p.descricao || '(sem descricao)'}</div>
                            {p.provavelmenteDistorcido && <span style={{ display: 'inline-block', marginTop: 2, padding: '1px 6px', borderRadius: 4, fontSize: '.62rem', background: '#fef3c7', color: '#92400e' }}>provavelmente distorcido</span>}
                            {p.jaCorrigido && <span style={{ display: 'inline-block', marginTop: 2, marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '.62rem', background: '#d1fae5', color: '#065f46' }}>ja corrigido</span>}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: p.cmcAtual == null ? '#94a3b8' : undefined }}>{p.cmcAtual == null ? '?' : fmtBRL(p.cmcAtual)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtSaldo(p.saldoTotal)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtNum(p.qtdNfsGarantia)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right', color: '#b45309' }}>{fmtBRL(p.ultimoCustoGarantia)}</td>
                          <td style={{ ...tdStyle, fontSize: '.72rem', fontFamily: 'monospace' }}>{(p.cfopsGarantia || []).join(', ')}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>
                            <input type="number" step="0.0001" min="0" value={cmcEdit[p.key] ?? ''} onChange={(e) => setCmcEdit((s) => ({ ...s, [p.key]: e.target.value }))} disabled={!!res} style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.8rem', width: 110, textAlign: 'right' }} />
                          </td>
                          <td style={{ ...tdStyle, fontSize: '.72rem', color: '#475569' }} title={estrategiaLabel(p.estrategiaSugestao)}>{p.estrategiaSugestao || ''}</td>
                          <td style={tdStyle}>
                            {locaisComSaldo.length > 0 ? (
                              <select value={localSel[p.key] ?? ''} onChange={(e) => setLocalSel((s) => ({ ...s, [p.key]: e.target.value === '' ? '' : Number(e.target.value) }))} disabled={!!res} style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.72rem', maxWidth: 220 }}>
                                {locaisComSaldo.map((l) => (
                                  <option key={l.localId} value={l.localId}>{l.localNome} (saldo {fmtSaldo(l.saldo)}, CMC {fmtBRL(l.cmc)})</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>sem saldo</span>
                            )}
                          </td>
                          <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <button onClick={() => setModalProd(p)} style={{ padding: '3px 8px', fontSize: '.72rem', background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}>Detalhes</button>
                            <button onClick={() => aplicarLinha(p)} disabled={!temComoAplicar || !!res || aplicandoKey === p.key} style={{ padding: '3px 8px', fontSize: '.72rem', border: 'none', borderRadius: 4, cursor: temComoAplicar && !res ? 'pointer' : 'not-allowed', background: temComoAplicar && !res ? '#059669' : '#e2e8f0', color: temComoAplicar && !res ? '#fff' : '#94a3b8' }}>
                              {res?.tipo === 'ok' ? 'Aplicado' : aplicandoKey === p.key ? 'aplicando...' : 'Aplicar'}
                            </button>
                            {res && <div style={{ fontSize: '.68rem', marginTop: 2, color: res.tipo === 'ok' ? '#047857' : '#dc2626' }}>{res.texto}</div>}
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
      )}

      {/* Modal de detalhe */}
      {modalProd && <ModalProduto p={modalProd} onClose={() => setModalProd(null)} />}
    </div>
  );
}

function Kpi({ label, valor, cor }: { label: string; valor: string; cor?: string }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: '1.5rem', fontWeight: 700, marginTop: 4, color: cor || '#1e293b' }}>{valor}</div>
    </div>
  );
}

// ---------- resumo da semana anterior ----------
interface ResumoPayload {
  periodo?: { de?: string; ate?: string; deISO?: string; ateISO?: string };
  recebimentos?: { erro?: string; totalNaoProcessados?: number; totalComSinalGarantia?: number; totalItensRisco?: number };
  pedidos?: { erro?: string; total?: number };
  negativos?: { erro?: string; semDados?: boolean; rodando?: boolean; totalNegativos?: number; totalSuspeitas?: number; geradoEm?: string; cachedEm?: string };
}
function ResumoSemana({ conta, contaParam }: { conta: string; contaParam: string }) {
  const [d, setD] = useState<ResumoPayload | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    fetch(`/api/ajustes/home-resumo?${contaParam.replace(/^&/, '')}`)
      .then((r) => r.json())
      .then((j) => {
        if (!vivo) return;
        if (j.erro) setErro(j.erro);
        else setD(j);
      })
      .catch((e) => vivo && setErro(e.message));
    return () => {
      vivo = false;
    };
  }, [conta, contaParam]);

  const rc = d?.recebimentos;
  const pd = d?.pedidos;
  const ng = d?.negativos;
  const card: React.CSSProperties = { display: 'block', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, textDecoration: 'none', color: 'inherit' };
  const lbl: React.CSSProperties = { fontSize: '.62rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' };
  const big = (cor?: string): React.CSSProperties => ({ fontSize: '1.4rem', fontWeight: 700, marginTop: 4, color: cor || '#1e293b' });
  const sub: React.CSSProperties = { fontSize: '.68rem', color: '#64748b', marginTop: 2 };

  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '.75rem', fontWeight: 600, color: '#475569', textTransform: 'uppercase', letterSpacing: '.4px' }}>Resumo da semana anterior</h2>
        {d?.periodo && <span style={{ fontSize: '.7rem', color: '#94a3b8' }}>({d.periodo.de} a {d.periodo.ate})</span>}
        {erro && <span style={{ fontSize: '.7rem', color: '#dc2626', marginLeft: 'auto' }}>{erro}</span>}
        {!d && !erro && <span style={{ fontSize: '.7rem', color: '#94a3b8', marginLeft: 'auto' }}>carregando…</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <Link href="/ajustes/recebimentos" style={card}>
          <div style={lbl}>Recebimentos pendentes</div>
          <div style={big(rc?.totalNaoProcessados ? '#b45309' : undefined)}>{rc?.erro ? '—' : rc?.totalNaoProcessados ?? '—'}</div>
          <div style={sub}>{rc?.erro ? rc.erro : [rc?.totalComSinalGarantia ? `${rc.totalComSinalGarantia} c/ sinal garantia` : '', rc?.totalItensRisco ? `${rc.totalItensRisco} itens risco` : ''].filter(Boolean).join(' · ') || 'NFs nao processadas'}</div>
        </Link>
        <Link href="/ajustes/pedidos" style={card}>
          <div style={lbl}>Pedidos abertos</div>
          <div style={big()}>{pd?.erro ? '—' : pd?.total ?? '—'}</div>
          <div style={sub}>{pd?.erro ? pd.erro : 'pedidos abertos na semana'}</div>
        </Link>
        <Link href="/ajustes/negativos" style={card}>
          <div style={lbl}>Estoque negativo</div>
          <div style={big(ng?.totalNegativos ? '#b91c1c' : undefined)}>{ng?.semDados || ng?.erro ? '—' : ng?.totalNegativos ?? '—'}</div>
          <div style={sub}>{ng?.semDados ? (ng.rodando ? 'varredura em andamento…' : 'sem varredura recente') : ng?.erro ? ng.erro : (ng?.totalSuspeitas ? `${ng.totalSuspeitas} suspeitas` : 'produtos negativos')}</div>
        </Link>
      </div>
    </div>
  );
}

// ---------- modal ----------
const mTh: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '.7rem', color: '#475569', fontWeight: 600 };
const mTd: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '.72rem', color: '#334155' };

function MiniTabela({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 4 }}>
      <thead><tr>{headers.map((h, i) => <th key={i} style={mTh}>{h}</th>)}</tr></thead>
      <tbody>
        {rows.length === 0 ? (
          <tr><td colSpan={headers.length} style={{ ...mTd, color: '#94a3b8' }}>(nenhum)</td></tr>
        ) : rows.map((cells, i) => (
          <tr key={i}>{cells.map((c, j) => <td key={j} style={mTd}>{c}</td>)}</tr>
        ))}
      </tbody>
    </table>
  );
}

function ModalProduto({ p, onClose }: { p: ProdutoAfetado; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const titulo = `Produto ${p.codigoProduto != null ? p.codigoProduto : (p.codigoIntegracao || '')} - ${p.descricao || ''}`;
  const c = p.ultimaCorrecao;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 920, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>{titulo}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.82rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <KpiBox label="CMC atual" valor={p.cmcAtual == null ? '?' : fmtBRL(p.cmcAtual)} />
            <KpiBox label="Saldo total" valor={fmtSaldo(p.saldoTotal)} />
            <KpiBox label="CMC sugerido" valor={fmtBRL(p.cmcSugerido)} />
            <KpiBox label="Estrategia" valor={p.estrategiaSugestao || ''} />
          </div>
          <div style={{ fontSize: '.74rem', color: '#475569', marginBottom: 8 }}>Como a sugestao foi calculada: <b>{estrategiaLabel(p.estrategiaSugestao)}</b>. Voce pode editar o valor na tabela antes de aplicar.</div>
          {p.estrategiaSugestao === 'cmc_movimento_anterior' && (
            <div style={{ fontSize: '.74rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 8, marginBottom: 14 }}>
              ⚠ Atencao: a sugestao e&apos; o CMC vigente <b>imediatamente antes</b> da entrada de garantia. Se houve <b>compras reais</b> do produto <b>depois</b> dessa data, o CMC &quot;certo&quot; provavelmente e&apos; um pouco menor (a compra real diluiu o custo) - confira o histor. de movimentos abaixo e ajuste o valor se necessario.
            </div>
          )}

          <h3 style={{ fontWeight: 600, color: '#334155', marginBottom: 4, fontSize: '.82rem' }}>Saldo por local</h3>
          <MiniTabela headers={['Local', 'Saldo', 'CMC no local']} rows={(p.porLocal || []).map((l) => [
            <span key="n">{l.localNome} <span style={{ color: '#94a3b8' }}>(#{l.localId})</span></span>, fmtSaldo(l.saldo), fmtBRL(l.cmc),
          ])} />
          {p.cmcSugeridoBaseadoEm && (
            <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 10 }}>Base da sugestao: movimento de {p.cmcSugeridoBaseadoEm.data || '?'} ({p.cmcSugeridoBaseadoEm.origem || ''}{p.cmcSugeridoBaseadoEm.doc ? ' doc ' + p.cmcSugeridoBaseadoEm.doc : ''}) — CMC vigente imediatamente antes dele.</div>
          )}

          <h3 style={{ fontWeight: 600, color: '#334155', margin: '14px 0 4px', fontSize: '.82rem' }}>Itens de garantia detectados ({(p.nfsGarantia || []).length})</h3>
          <MiniTabela headers={['NF entrada', 'Data', 'Fornecedor', 'CFOP', 'Motivo', 'Qtd', 'Custo unit.', 'Total']} rows={(p.nfsGarantia || []).map((g) => [
            <span key="nf">{g.numero || ''}{g.codNotaEnt ? <span style={{ color: '#94a3b8' }}> #{g.codNotaEnt}</span> : null}</span>,
            g.dataRef || '', g.fornecedor || '', <span key="c" style={{ fontFamily: 'monospace' }}>{g.cfop || ''}</span>, motivoLabel(g.motivoClassificacao),
            fmtSaldo(g.qtde), fmtBRL(g.valUnit), fmtBRL(g.valTotal),
          ])} />

          <h3 style={{ fontWeight: 600, color: '#334155', margin: '14px 0 4px', fontSize: '.82rem' }}>Entradas normais no periodo ({(p.entradasNormais || []).length})</h3>
          <MiniTabela headers={['NF entrada', 'Data', 'Qtd', 'Custo unit.']} rows={(p.entradasNormais || []).map((e) => [
            e.numero || '', e.dataRef || '', fmtSaldo(e.qtde), fmtBRL(e.valUnit),
          ])} />

          {p.movimentosResumo && p.movimentosResumo.length > 0 && (
            <>
              <h3 style={{ fontWeight: 600, color: '#334155', margin: '14px 0 4px', fontSize: '.82rem' }}>Ultimos movimentos de estoque</h3>
              <MiniTabela headers={['Data', 'Origem', 'Doc', 'Entrou (qtd / custo)', 'Saiu (qtd)', 'CMC antes', 'CMC depois']} rows={p.movimentosResumo.map((m) => [
                <span key="d">{m.data || ''}{m.cancelado ? <span style={{ color: '#ef4444' }}> (canc)</span> : null}{m.devolucao ? <span style={{ color: '#d97706' }}> (devol)</span> : null}</span>,
                m.desOrigem || m.codOrigem || '', m.numDoc || '',
                m.qtdeEntrada && m.qtdeEntrada > 0 ? `${fmtSaldo(m.qtdeEntrada)} / ${fmtBRL(m.entradaCMC)}` : '',
                m.qtdeSaida ? fmtSaldo(Math.abs(m.qtdeSaida)) : '',
                m.cmcAnterior != null ? fmtBRL(m.cmcAnterior) : <span key="a" style={{ color: '#94a3b8' }}>n/d</span>,
                m.cmcAtual != null ? fmtBRL(m.cmcAtual) : <span key="b" style={{ color: '#94a3b8' }}>n/d</span>,
              ])} />
            </>
          )}

          {p.jaCorrigido && c && (
            <div style={{ marginTop: 14, padding: 10, background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, fontSize: '.72rem', color: '#065f46' }}>
              Ja corrigido em {c.criado_em ? new Date(c.criado_em).toLocaleString('pt-BR') : '?'}: CMC {fmtBRL(c.cmc_anterior)} → {fmtBRL(c.cmc_aplicado)} (local #{c.codigo_local_estoque}, ajuste Omie #{c.codigo_ajuste_omie}, por {c.criado_por || ''}).
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function KpiBox({ label, valor }: { label: string; valor: string }) {
  return (
    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: 8 }}>
      <div style={{ fontSize: '.62rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontSize: '.95rem', fontWeight: 600, marginTop: 2 }}>{valor}</div>
    </div>
  );
}
