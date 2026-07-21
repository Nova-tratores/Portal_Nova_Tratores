'use client';
// Estoque negativo (Fase 2). Portado de negativos.ejs + public/negativos.js.
// Padrao worker-ready: dispara POST /iniciar e faz POLLING de GET ate concluir.
// A correcao e' um ajuste RETROATIVO datado -> a UI pede a DATA por linha.
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos do payload ----------
interface PorLocal { localId: number; localNome: string; saldo: number; cmc: number }
interface MovimentoResumo {
  data?: string; codOrigem?: string; desOrigem?: string; numDoc?: string;
  qtdeEntrada?: number; entradaCMC?: number; qtdeSaida?: number; qtdeAtual?: number | null;
  cmcAnterior?: number | null; cmcAtual?: number | null; cancelado?: boolean; devolucao?: boolean;
}
interface OutraEmpresa {
  conta?: string | null; contaLabel?: string | null; codigoProduto?: number | null;
  saldo?: number | null; cmc?: number | null;
}
interface UltimaCorrecao {
  criado_em?: string; cmc_anterior?: number; cmc_aplicado?: number;
  codigo_local_estoque?: number | string; codigo_ajuste_omie?: number | string; criado_por?: string;
}
interface Episodio {
  dataFicouNegativo?: string | null; dataAjusteRetroativoBR?: string | null;
  cmcSugerido?: number | null; estrategiaSugestao?: string;
  cmcSugeridoBaseadoEm?: { data?: string; origem?: string; doc?: string } | null;
  saldoMin?: number | null; jaCorrigido?: boolean; ultimaCorrecao?: UltimaCorrecao | null;
}
interface ProdutoNegativo {
  key: string; codigoProduto: number | null; codigoIntegracao?: string | null; codigo?: string | null;
  descricao?: string | null; cmcAtual: number | null; saldoTotal: number | null;
  porLocal?: PorLocal[]; cmcSugerido?: number | null; estrategiaSugestao?: string;
  dataFicouNegativo?: string | null; dataAjusteRetroativoBR?: string | null;
  episodios?: Episodio[];
  suspeitaEmpresaErrada?: boolean; outraEmpresa?: OutraEmpresa | null;
  cmcSugeridoBaseadoEm?: { data?: string; origem?: string; doc?: string } | null;
  movimentosResumo?: MovimentoResumo[]; jaCorrigido?: boolean; ultimaCorrecao?: UltimaCorrecao | null;
}
interface NegativosPayload {
  rodando?: boolean; etapa?: string; inicio?: string; jobId?: string;
  semDados?: boolean; erro?: string; fonte?: string; cachedEm?: string; geradoEm?: string;
  duracaoMs?: number; totalProdutos?: number; totalNegativos?: number; totalSuspeitas?: number;
  produtos?: ProdutoNegativo[];
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
function brToISO(br?: string | null): string {
  const m = String(br || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}
function isoToBR(iso?: string | null): string {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}
const ESTRATEGIA_LABEL: Record<string, string> = {
  cmc_antes_de_negativo: 'CMC vigente antes de o estoque ficar negativo',
  maior_cmc_compra: 'maior CMC entre as compras recentes',
  ultimo_cmc_compra: 'CMC apos a ultima compra',
  manual: 'sem base automatica - informe manualmente',
};
function estrategiaLabel(e?: string): string { return (e && ESTRATEGIA_LABEL[e]) || e || ''; }

function localMaisNegativo(p: ProdutoNegativo): PorLocal | null {
  const locais = p.porLocal || [];
  if (!locais.length) return null;
  return locais.slice().sort((a, b) => a.saldo - b.saldo)[0];
}

// Lista de episodios do produto. Quando o back nao trouxe episodios (ex.: negativo
// mais antigo que a janela de 24m), sintetiza 1 "episodio" dos campos de topo.
function episodiosDe(p: ProdutoNegativo): Episodio[] {
  if (p.episodios && p.episodios.length) return p.episodios;
  return [{
    dataFicouNegativo: p.dataFicouNegativo ?? null,
    dataAjusteRetroativoBR: p.dataAjusteRetroativoBR ?? null,
    cmcSugerido: p.cmcSugerido ?? null,
    estrategiaSugestao: p.estrategiaSugestao,
    cmcSugeridoBaseadoEm: p.cmcSugeridoBaseadoEm ?? null,
    saldoMin: p.saldoTotal ?? null,
    jaCorrigido: p.jaCorrigido,
    ultimaCorrecao: p.ultimaCorrecao ?? null,
  }];
}
const epKey = (p: ProdutoNegativo, i: number) => `${p.key}#${i}`;

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

export default function EstoqueNegativoPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const [dados, setDados] = useState<NegativosPayload | null>(null);
  const [rodando, setRodando] = useState(false);
  const [etapa, setEtapa] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const [semDados, setSemDados] = useState(false);

  // estado de edicao por produto
  const [cmcEdit, setCmcEdit] = useState<Record<string, string>>({});
  const [dataEdit, setDataEdit] = useState<Record<string, string>>({}); // ISO yyyy-mm-dd
  const [localSel, setLocalSel] = useState<Record<string, number | ''>>({});
  const [resultados, setResultados] = useState<Record<string, ResultadoLinha>>({});
  const [aplicandoKey, setAplicandoKey] = useState<string | null>(null);
  const [corrigidosExtra, setCorrigidosExtra] = useState(0);
  const [precisaRevalidar, setPrecisaRevalidar] = useState(false);

  // correcao em massa (selecao por episodio)
  const [sel, setSel] = useState<Record<string, boolean>>({});
  const [massaRodando, setMassaRodando] = useState(false);
  const [massaProgresso, setMassaProgresso] = useState('');
  const [massaResumo, setMassaResumo] = useState('');
  const cancelarMassa = useRef(false);

  const [modalProd, setModalProd] = useState<ProdutoNegativo | null>(null);

  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const contaRef = useRef(conta);
  contaRef.current = conta;

  const stopPoll = useCallback(() => {
    if (pollRef.current) { clearTimeout(pollRef.current); pollRef.current = null; }
  }, []);

  // popula edicao inicial a partir do payload
  const popularEdicao = useCallback((d: NegativosPayload) => {
    const cmcInit: Record<string, string> = {};
    const dataInit: Record<string, string> = {};
    const localInit: Record<string, number | ''> = {};
    (d.produtos || []).forEach((p) => {
      const def = localMaisNegativo(p);
      episodiosDe(p).forEach((ep, i) => {
        const kk = epKey(p, i);
        cmcInit[kk] = ep.cmcSugerido != null ? String(ep.cmcSugerido) : '';
        dataInit[kk] = brToISO(ep.dataAjusteRetroativoBR);
        localInit[kk] = def ? def.localId : '';
      });
    });
    setCmcEdit(cmcInit);
    setDataEdit(dataInit);
    setLocalSel(localInit);
    setResultados({});
    setCorrigidosExtra(0);
    setPrecisaRevalidar(false);
    setSel({});
    setMassaResumo('');
  }, []);

  const carregar = useCallback(async (force: boolean) => {
    if (!contaRef.current) return;
    try {
      let qs = contaParam.replace(/^&/, '');
      if (force) qs += (qs ? '&' : '') + 'force=1';
      const r = await fetch(`/api/ajustes/estoque-negativo?${qs}`);
      const d = (await r.json()) as NegativosPayload;
      if (contaRef.current !== conta) return; // conta trocou no meio
      if (d.erro && !d.rodando) {
        setErro(d.erro); setRodando(false); setStatusMsg('');
        return;
      }
      if (d.rodando) {
        setRodando(true);
        setSemDados(false);
        setEtapa(d.etapa || '');
        setStatusMsg(`varrendo... ${d.etapa || ''}${d.inicio ? ` (desde ${new Date(d.inicio).toLocaleTimeString('pt-BR')})` : ''}`);
        pollRef.current = setTimeout(() => carregar(false), 3000);
        return;
      }
      setRodando(false);
      if (d.semDados) { setSemDados(true); setDados(null); setStatusMsg(''); return; }
      setSemDados(false);
      popularEdicao(d);
      setDados(d);
      const fonte = d.fonte === 'cache' ? 'cache' : (d.fonte === 'job' ? 'varredura' : (d.fonte || 'varredura'));
      const dur = d.duracaoMs ? ` · varredura levou ${(d.duracaoMs / 60000).toFixed(1)} min` : '';
      setStatusMsg(`${fmtNum(d.totalNegativos)} produto(s) com estoque negativo · ${fonte}${dur}`);
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
      pollRef.current = setTimeout(() => carregar(false), 5000);
    }
  }, [conta, contaParam, popularEdicao]);

  const iniciar = useCallback(async (force: boolean) => {
    if (!conta) return;
    stopPoll();
    setErro('');
    setSemDados(false);
    setRodando(true);
    setStatusMsg('iniciando varredura... (pode levar ~30-50 min na 1a vez - pode fechar a aba e voltar depois)');
    try {
      const qs = (contaParam.replace(/^&/, '')) + (force ? '&force=1' : '');
      const r = await fetch(`/api/ajustes/estoque-negativo/iniciar?${qs}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ criadoPor }),
      });
      const d = await r.json();
      if (d && d.erro) { setErro(d.erro); setRodando(false); setStatusMsg(''); return; }
      pollRef.current = setTimeout(() => carregar(false), 3000);
    } catch (ex) {
      setErro('erro de rede: ' + (ex as Error).message);
      setRodando(false);
    }
  }, [conta, contaParam, criadoPor, carregar, stopPoll]);

  // auto-load (usa cache/status existente) ao montar/trocar conta
  useEffect(() => {
    stopPoll();
    setDados(null); setErro(''); setSemDados(false); setRodando(false); setStatusMsg('');
    if (conta) carregar(false);
    return () => stopPoll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  // Aplica UM episodio (ajuste retroativo). skipConfirm=true no modo "corrigir
  // todos" (a confirmacao e' feita uma vez la). Retorna true se aplicou.
  const corrigirEpisodio = useCallback(async (p: ProdutoNegativo, i: number, ep: Episodio, skipConfirm = false): Promise<boolean> => {
    const kk = epKey(p, i);
    const novoCMC = Number(String(cmcEdit[kk] ?? '').replace(',', '.'));
    const codLocal = localSel[kk] === '' || localSel[kk] == null ? null : Number(localSel[kk]);
    const dataISO = dataEdit[kk] || '';
    if (!(novoCMC > 0)) { alert('Informe um CMC valido (> 0).'); return false; }
    if (codLocal == null) { alert('Selecione um local.'); return false; }
    if (!dataISO) { alert('Informe a data do ajuste retroativo (dia seguinte ao que o produto ficou negativo).'); return false; }
    const dataBR = isoToBR(dataISO);

    if (!skipConfirm) {
      if (p.suspeitaEmpresaErrada) {
        const oe = p.outraEmpresa || {};
        if (!confirm(`ATENCAO: este produto pode estar negativo so porque a venda foi faturada na empresa errada (${oe.contaLabel || 'a outra empresa'} tem saldo ${oe.saldo != null ? oe.saldo : '?'}).\n\nO recomendado e' fazer a CONTAGEM FISICA, NAO o ajuste retroativo.\n\nMesmo assim, prosseguir com o ajuste retroativo?`)) return false;
      }
      if (!confirm(`AJUSTE RETROATIVO no produto ${p.codigoProduto} (${p.descricao || ''}), local ${codLocal}:\n\n- datado em ${dataBR}\n- ZERA o saldo nesse ponto e seta o CMC para ${fmtBRL(novoCMC)}\n- o Omie vai REPROCESSAR os movimentos posteriores (o saldo de hoje vai mudar)\n\nIsso mexe em periodos contabeis ja fechados. Confirme que esta alinhado com a contabilidade. Continuar?`)) return false;
    }

    setAplicandoKey(kk);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const r = await fetch('/api/ajustes/corrigir-estoque-negativo', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` },
        body: JSON.stringify({
          conta, codigoProduto: p.codigoProduto, codigoIntegracao: p.codigoIntegracao,
          codLocal, novoCMC, dataAjusteBR: dataBR, cmcSugerido: ep.cmcSugerido,
          estrategiaSugestao: ep.estrategiaSugestao, descricao: p.descricao, criadoPor,
        }),
      });
      const d = await r.json();
      if (d.ok) {
        setResultados((s) => ({ ...s, [kk]: { tipo: 'ok', texto: `corrigido (retroativo ${d.dataAjusteBR || dataBR}) · ajuste #${d.codigoAjuste || '?'} · CMC ${fmtBRL(d.cmcAnterior)} → ${fmtBRL(d.cmcAplicado)}` } }));
        setCorrigidosExtra((n) => n + 1);
        setPrecisaRevalidar(true);
        return true;
      }
      setResultados((s) => ({ ...s, [kk]: { tipo: 'erro', texto: d.erro || 'falhou' } }));
      return false;
    } catch (ex) {
      setResultados((s) => ({ ...s, [kk]: { tipo: 'erro', texto: 'erro de rede: ' + (ex as Error).message } }));
      return false;
    } finally {
      setAplicandoKey(null);
    }
  }, [cmcEdit, localSel, dataEdit, conta, criadoPor]);

  // Aplica TODOS os episodios pendentes do produto, do mais ANTIGO para o mais
  // recente (a ordem importa: cada SLD zera o saldo e a Omie reprocessa o resto).
  const corrigirTodos = useCallback(async (p: ProdutoNegativo, eps: Episodio[]) => {
    const pendentes = eps.map((ep, i) => ({ ep, i })).filter(({ ep, i }) => !ep.jaCorrigido && !resultados[epKey(p, i)]);
    if (!pendentes.length) return;
    if (p.suspeitaEmpresaErrada) {
      const oe = p.outraEmpresa || {};
      if (!confirm(`ATENCAO: este produto pode estar negativo so porque a venda foi faturada na empresa errada (${oe.contaLabel || 'a outra empresa'} tem saldo ${oe.saldo != null ? oe.saldo : '?'}).\n\nO recomendado e' fazer a CONTAGEM FISICA, NAO o ajuste retroativo.\n\nMesmo assim, prosseguir?`)) return;
    }
    if (!confirm(`Vai aplicar ${pendentes.length} ajuste(s) retroativo(s) no produto ${p.codigoProduto} (${p.descricao || ''}), do episodio mais ANTIGO para o mais recente.\n\nCada um zera o saldo na data e seta o CMC; a Omie reprocessa os movimentos posteriores. Mexe em periodos contabeis ja fechados.\n\nDepois, clique em "Atualizar" para revarrer e confirmar o resultado. Continuar?`)) return;
    for (const { ep, i } of pendentes) {
      const ok = await corrigirEpisodio(p, i, ep, true);
      if (!ok) break; // para na 1a falha (nao adianta seguir com o saldo desatualizado)
    }
  }, [resultados, corrigirEpisodio]);

  // Correcao EM MASSA: aplica os episodios SELECIONADOS, produto a produto, sempre
  // do episodio mais antigo para o mais recente (a ordem importa: cada SLD zera o
  // saldo e o Omie reprocessa o resto). Na 1a falha de um produto, pula para o
  // proximo produto (nao adianta seguir naquele com o saldo desatualizado).
  const corrigirSelecionados = useCallback(async () => {
    if (massaRodando || !dados?.produtos) return;
    type ItemMassa = { p: ProdutoNegativo; i: number; ep: Episodio; kk: string };
    let grupos: ItemMassa[][] = [];
    for (const p of dados.produtos) {
      if (p.codigoProduto == null || !localMaisNegativo(p)) continue;
      const doProduto = episodiosDe(p)
        .map((ep, i) => ({ p, i, ep, kk: epKey(p, i) }))
        .filter(({ ep, kk }) => sel[kk] && !ep.jaCorrigido && !resultados[kk]);
      if (doProduto.length) grupos.push(doProduto);
    }
    if (!grupos.length) { alert('Nenhum episodio selecionado para corrigir.'); return; }

    const suspeitos = grupos.filter((g) => g[0].p.suspeitaEmpresaErrada).length;
    if (suspeitos > 0 && !confirm(`${suspeitos} produto(s) selecionado(s) tem SUSPEITA de venda faturada na empresa errada — nesses casos o recomendado e' a CONTAGEM FISICA, nao o ajuste retroativo.\n\nOK = incluir mesmo assim · Cancelar = corrigir so os demais`)) {
      grupos = grupos.filter((g) => !g[0].p.suspeitaEmpresaErrada);
    }
    const total = grupos.reduce((n, g) => n + g.length, 0);
    if (!total) { alert('Nenhum episodio restante para corrigir.'); return; }
    if (!confirm(`CORRECAO EM MASSA: vai aplicar ${total} ajuste(s) retroativo(s) em ${grupos.length} produto(s), um por vez, do episodio mais antigo para o mais recente.\n\nCada ajuste ZERA o saldo na data e seta o CMC; o Omie reprocessa os movimentos posteriores (o saldo de hoje muda). Mexe em periodos contabeis ja fechados — confirme que esta alinhado com a contabilidade.\n\nDeixe esta aba ABERTA ate terminar. Continuar?`)) return;

    setMassaRodando(true);
    setMassaResumo('');
    cancelarMassa.current = false;
    let feitos = 0, falhas = 0, pulados = 0, n = 0;
    try {
      for (const grupo of grupos) {
        if (cancelarMassa.current) break;
        for (const { p, i, ep, kk } of grupo) {
          if (cancelarMassa.current) break;
          n++;
          setMassaProgresso(`${n}/${total} — ${p.codigoProduto} ${p.descricao || ''}`);
          // valida os campos editaveis aqui (sem alert por linha, diferente do fluxo individual)
          const novoCMC = Number(String(cmcEdit[kk] ?? '').replace(',', '.'));
          const codLocal = localSel[kk] === '' || localSel[kk] == null ? null : Number(localSel[kk]);
          if (!(novoCMC > 0) || codLocal == null || !dataEdit[kk]) {
            setResultados((s) => ({ ...s, [kk]: { tipo: 'erro', texto: 'pulado na correcao em massa: preencha CMC (>0), data e local' } }));
            pulados++;
            break; // nao aplica os episodios seguintes fora de ordem
          }
          const ok = await corrigirEpisodio(p, i, ep, true);
          if (!ok) { falhas++; break; }
          feitos++;
          setSel((s) => ({ ...s, [kk]: false }));
          await new Promise((r) => setTimeout(r, 350)); // folga entre escritas no Omie
        }
      }
    } finally {
      setMassaRodando(false);
      setMassaProgresso('');
    }
    setMassaResumo(`${cancelarMassa.current ? 'Interrompida' : 'Concluida'}: ${feitos} aplicada(s), ${falhas} falha(s), ${pulados} pulada(s) por dados incompletos.${feitos ? ' Revarra ("Atualizar") para confirmar o resultado.' : ''}`);
  }, [massaRodando, dados, sel, resultados, cmcEdit, localSel, dataEdit, corrigirEpisodio]);

  if (!permLoading && userProfile && !pode('ajustes', 'negativos')) return <SemPermissao />;

  const jaCorrigidos = (dados?.produtos || []).reduce((n, p) => n + episodiosDe(p).filter((e) => e.jaCorrigido).length, 0) + corrigidosExtra;

  // chaves dos episodios que ainda dao para corrigir (para a selecao em massa)
  const corrigiveis: string[] = [];
  (dados?.produtos || []).forEach((p) => {
    if (p.codigoProduto == null || !localMaisNegativo(p)) return;
    episodiosDe(p).forEach((ep, i) => {
      const kk = epKey(p, i);
      if (!ep.jaCorrigido && !resultados[kk]) corrigiveis.push(kk);
    });
  });
  const nSel = corrigiveis.reduce((c, kk) => c + (sel[kk] ? 1 : 0), 0);
  const todosSel = corrigiveis.length > 0 && nSel === corrigiveis.length;
  const toggleTodos = () => {
    if (todosSel) { setSel({}); return; }
    const s: Record<string, boolean> = {};
    corrigiveis.forEach((kk) => { s[kk] = true; });
    setSel(s);
  };

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Produtos com estoque negativo (CMC distorcido)</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 760 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b>. Bug do Omie: quando o estoque fisico fica negativo, o CMC vai sendo reduzido progressivamente. A ferramenta varre <b>todos</b> os produtos, lista os com saldo &lt; 0 e corrige via um <b>ajuste retroativo</b> datado logo depois do produto ficar negativo, que zera o saldo e seta o CMC bom.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => iniciar(false)} disabled={rodando || massaRodando || !conta} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: rodando ? 'wait' : 'pointer', opacity: rodando || massaRodando || !conta ? 0.5 : 1 }}>Buscar produtos negativos</button>
          <button onClick={() => iniciar(true)} disabled={rodando || massaRodando || !conta} title="Refaz a varredura ignorando o cache" style={{ padding: '7px 14px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: rodando ? 'wait' : 'pointer', opacity: rodando || massaRodando || !conta ? 0.5 : 1 }}>Atualizar</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      {conta === '' ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica para varrer o estoque negativo. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '.72rem' }}>
            <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>⚠ A 1a varredura demora ~30-50 min (consulta a posicao de estoque de todos os produtos). Pode deixar rodando e voltar depois.</span>
            <span style={{ padding: '3px 8px', borderRadius: 6, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e' }}>⚠ A correcao e&apos; um ajuste de estoque <b>RETROATIVO</b> — mexe em periodos contabeis ja fechados. Alinhe com a contabilidade.</span>
            <span style={{ marginLeft: 'auto', color: '#64748b' }}>{rodando ? `⏳ ${statusMsg}` : statusMsg}</span>
          </div>

          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

          {precisaRevalidar && !rodando && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span>✔ Ajuste(s) aplicado(s). O Omie reprocessa os movimentos posteriores — <b>revarra</b> para confirmar o resultado e ver se sobraram episodios.</span>
              <button onClick={() => iniciar(true)} style={{ marginLeft: 'auto', padding: '5px 12px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.78rem', cursor: 'pointer' }}>Atualizar agora</button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Kpi label="Produtos varridos" valor={fmtNum(dados?.totalProdutos)} />
            <Kpi label="Com estoque negativo" valor={fmtNum(dados?.totalNegativos)} cor="#b91c1c" />
            <Kpi label="Ja corrigidos" valor={fmtNum(jaCorrigidos)} cor="#047857" />
            <Kpi label="Ultima varredura" valor={dados?.geradoEm ? new Date(dados.geradoEm).toLocaleString('pt-BR') : (dados?.cachedEm ? new Date(dados.cachedEm).toLocaleString('pt-BR') + ' (cache)' : '--')} pequeno />
          </div>

          {dados && (dados.produtos || []).length > 0 && !rodando && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 10, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: '8px 12px', fontSize: '.78rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', color: '#334155' }}>
                <input type="checkbox" checked={todosSel} disabled={massaRodando || !corrigiveis.length} onChange={toggleTodos} />
                Selecionar todos os corrigiveis ({corrigiveis.length})
              </label>
              <button onClick={corrigirSelecionados} disabled={massaRodando || aplicandoKey != null || nSel === 0} style={{ padding: '5px 12px', background: massaRodando || nSel === 0 ? '#e2e8f0' : '#b91c1c', color: massaRodando || nSel === 0 ? '#94a3b8' : '#fff', border: 'none', borderRadius: 6, fontSize: '.78rem', fontWeight: 600, cursor: massaRodando || nSel === 0 ? 'not-allowed' : 'pointer' }}>
                {massaRodando ? 'Corrigindo em massa...' : `Corrigir selecionados (${nSel})`}
              </button>
              {massaRodando && (
                <>
                  <span style={{ color: '#64748b' }}>⏳ {massaProgresso}</span>
                  <button onClick={() => { cancelarMassa.current = true; }} style={{ padding: '5px 12px', background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, fontSize: '.78rem', cursor: 'pointer' }}>Parar apos o atual</button>
                </>
              )}
              {!massaRodando && massaResumo && <span style={{ color: '#334155' }}>{massaResumo}</span>}
            </div>
          )}

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...thStyle, width: 30, textAlign: 'center' }} title="Selecionar para correcao em massa">
                      <input type="checkbox" checked={todosSel} disabled={massaRodando || !corrigiveis.length} onChange={toggleTodos} />
                    </th>
                    <th style={thStyle}>Produto</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>CMC atual</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Saldo</th>
                    <th style={thStyle}>Ficou negativo em</th>
                    <th style={thStyle}>Data do ajuste (retroativo)</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>CMC sugerido</th>
                    <th style={thStyle}>Estrategia</th>
                    <th style={thStyle}>Local</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Acao</th>
                  </tr>
                </thead>
                <tbody>
                  {rodando ? (
                    <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Varredura em andamento… {etapa}</td></tr>
                  ) : semDados ? (
                    <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Nenhuma varredura ainda. Clique em <b>Buscar produtos negativos</b> para iniciar.</td></tr>
                  ) : !dados ? (
                    <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>Carregando…</td></tr>
                  ) : (dados.produtos || []).length === 0 ? (
                    <tr><td colSpan={10} style={{ padding: '40px', textAlign: 'center', color: '#059669' }}>Nenhum produto com estoque negativo. 🎉</td></tr>
                  ) : (
                    dados.produtos!.flatMap((p) => {
                      const locais = p.porLocal || [];
                      const def = localMaisNegativo(p);
                      const susp = !!p.suspeitaEmpresaErrada;
                      const skuMostrar = p.codigo || p.codigoIntegracao || (p.codigoProduto != null ? p.codigoProduto : '?');
                      const oe = p.outraEmpresa || {};
                      const eps = episodiosDe(p);
                      const multi = eps.length > 1;
                      return eps.map((ep, i) => {
                        const kk = epKey(p, i);
                        const res = resultados[kk];
                        const jaCorr = !!ep.jaCorrigido;
                        const temComoCorrigir = p.codigoProduto != null && def != null && !res && !jaCorr;
                        const bg = res?.tipo === 'ok' || jaCorr ? '#ecfdf5' : (susp ? '#fef2f2' : undefined);
                        const ultimoDoProduto = i === eps.length - 1;
                        return (
                          <tr key={kk} style={{ background: bg, borderBottom: ultimoDoProduto ? '2px solid #e2e8f0' : '1px solid #f8fafc' }}>
                            <td style={{ ...tdStyle, textAlign: 'center' }}>
                              <input type="checkbox" checked={!!sel[kk]} disabled={!temComoCorrigir || massaRodando} onChange={(e) => { const v = e.target.checked; setSel((s) => ({ ...s, [kk]: v })); }} />
                            </td>
                            <td style={tdStyle}>
                              {i === 0 ? (
                                <>
                                  <div style={{ fontFamily: 'monospace', fontSize: '.72rem', color: '#64748b' }}>{skuMostrar}</div>
                                  <div style={{ fontWeight: 500 }}>{p.descricao || '(sem descricao)'}</div>
                                  {multi && <span style={{ display: 'inline-block', marginTop: 2, padding: '1px 6px', borderRadius: 4, fontSize: '.62rem', background: '#fef3c7', color: '#92400e' }}>{eps.length} episodios negativos</span>}
                                  {p.jaCorrigido && <span style={{ display: 'inline-block', marginTop: 2, marginLeft: 4, padding: '1px 6px', borderRadius: 4, fontSize: '.62rem', background: '#d1fae5', color: '#065f46' }}>tudo corrigido</span>}
                                  {susp && (
                                    <div style={{ marginTop: 3 }}>
                                      <span style={{ display: 'inline-block', padding: '1px 6px', borderRadius: 4, fontSize: '.62rem', background: '#dc2626', color: '#fff' }} title="Possivelmente faturado na empresa errada. Recomendado: contagem fisica.">⚠ suspeita empresa errada</span>
                                      <span style={{ fontSize: '.62rem', color: '#b91c1c', marginLeft: 4 }}>existe na {oe.contaLabel || 'outra empresa'} c/ saldo {oe.saldo != null ? fmtSaldo(oe.saldo) : '?'}{oe.cmc != null ? `, CMC ${fmtBRL(oe.cmc)}` : ''} → <b>fazer contagem</b></span>
                                    </div>
                                  )}
                                </>
                              ) : (
                                <span style={{ fontSize: '.72rem', color: '#94a3b8', paddingLeft: 12 }}>↳ episodio {i + 1} de {eps.length}</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>{i === 0 ? (p.cmcAtual == null ? '?' : fmtBRL(p.cmcAtual)) : ''}</td>
                            <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 600, color: '#b91c1c' }}>{i === 0 ? fmtSaldo(p.saldoTotal) : ''}</td>
                            <td style={{ ...tdStyle, fontSize: '.72rem' }}>
                              {ep.dataFicouNegativo || (i === 0 && !multi ? <span style={{ color: '#d97706' }}>nao detectado (mais antigo que 24m)</span> : '-')}
                              {ep.saldoMin != null && ep.saldoMin < 0 && <div style={{ fontSize: '.62rem', color: '#b91c1c' }}>ate {fmtSaldo(ep.saldoMin)}</div>}
                            </td>
                            <td style={tdStyle}>
                              <input type="date" value={dataEdit[kk] ?? ''} onChange={(e) => setDataEdit((s) => ({ ...s, [kk]: e.target.value }))} disabled={!!res || jaCorr} style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.72rem' }} />
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right' }}>
                              <input type="number" step="0.0001" min="0" value={cmcEdit[kk] ?? ''} onChange={(e) => setCmcEdit((s) => ({ ...s, [kk]: e.target.value }))} disabled={!!res || jaCorr} style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.8rem', width: 110, textAlign: 'right' }} />
                            </td>
                            <td style={{ ...tdStyle, fontSize: '.72rem', color: '#475569' }} title={estrategiaLabel(ep.estrategiaSugestao)}>{ep.estrategiaSugestao || ''}</td>
                            <td style={tdStyle}>
                              {locais.length > 0 ? (
                                <select value={localSel[kk] ?? ''} onChange={(e) => setLocalSel((s) => ({ ...s, [kk]: e.target.value === '' ? '' : Number(e.target.value) }))} disabled={!!res || jaCorr} style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.72rem', maxWidth: 220 }}>
                                  {locais.map((l) => (
                                    <option key={l.localId} value={l.localId}>{l.localNome} (saldo {fmtSaldo(l.saldo)})</option>
                                  ))}
                                </select>
                              ) : (
                                <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>-</span>
                              )}
                            </td>
                            <td style={{ ...tdStyle, textAlign: 'right', whiteSpace: 'nowrap' }}>
                              {i === 0 && <button onClick={() => setModalProd(p)} style={{ padding: '3px 8px', fontSize: '.72rem', background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer', marginRight: 4 }}>Detalhes</button>}
                              {i === 0 && multi && (
                                <button onClick={() => corrigirTodos(p, eps)} disabled={aplicandoKey != null || massaRodando || p.jaCorrigido} title="Aplica todos os episodios pendentes, do mais antigo para o mais recente" style={{ padding: '3px 8px', fontSize: '.72rem', border: 'none', borderRadius: 4, cursor: aplicandoKey != null || massaRodando || p.jaCorrigido ? 'not-allowed' : 'pointer', background: aplicandoKey != null || massaRodando || p.jaCorrigido ? '#e2e8f0' : '#0f766e', color: aplicandoKey != null || massaRodando || p.jaCorrigido ? '#94a3b8' : '#fff', marginRight: 4 }}>Corrigir todos</button>
                              )}
                              <button onClick={() => corrigirEpisodio(p, i, ep)} disabled={!temComoCorrigir || aplicandoKey === kk || massaRodando} style={{ padding: '3px 8px', fontSize: '.72rem', border: 'none', borderRadius: 4, cursor: temComoCorrigir && !massaRodando ? 'pointer' : 'not-allowed', background: temComoCorrigir && !massaRodando ? '#059669' : '#e2e8f0', color: temComoCorrigir && !massaRodando ? '#fff' : '#94a3b8' }}>
                                {res?.tipo === 'ok' || jaCorr ? 'Corrigido' : aplicandoKey === kk ? 'aplicando...' : 'Corrigir'}
                              </button>
                              {res && <div style={{ fontSize: '.68rem', marginTop: 2, color: res.tipo === 'ok' ? '#047857' : '#dc2626' }}>{res.texto}</div>}
                            </td>
                          </tr>
                        );
                      });
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalProd && <ModalProduto p={modalProd} onClose={() => setModalProd(null)} />}
    </div>
  );
}

function Kpi({ label, valor, cor, pequeno }: { label: string; valor: string; cor?: string; pequeno?: boolean }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14 }}>
      <div style={{ fontSize: '.65rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.4px' }}>{label}</div>
      <div style={{ fontSize: pequeno ? '.82rem' : '1.5rem', fontWeight: pequeno ? 500 : 700, marginTop: 4, color: cor || '#1e293b' }}>{valor}</div>
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

function ModalProduto({ p, onClose }: { p: ProdutoNegativo; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const skuModal = p.codigo || p.codigoIntegracao || (p.codigoProduto != null ? p.codigoProduto : '');
  const c = p.ultimaCorrecao;
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 920, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Produto {skuModal} - {p.descricao || ''}</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.82rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
            <KpiBox label="CMC atual" valor={p.cmcAtual == null ? '?' : fmtBRL(p.cmcAtual)} />
            <KpiBox label="Saldo total" valor={fmtSaldo(p.saldoTotal)} />
            <KpiBox label="CMC sugerido" valor={fmtBRL(p.cmcSugerido)} />
            <KpiBox label="Ficou negativo em" valor={p.dataFicouNegativo || '?'} />
            <KpiBox label="Data do ajuste" valor={p.dataAjusteRetroativoBR || '(informar)'} />
          </div>
          <div style={{ fontSize: '.74rem', color: '#475569', marginBottom: 8 }}>
            Base da sugestao: <b>{estrategiaLabel(p.estrategiaSugestao)}</b>
            {p.cmcSugeridoBaseadoEm ? ` (movimento de ${p.cmcSugeridoBaseadoEm.data || '?'} - ${p.cmcSugeridoBaseadoEm.origem || ''}${p.cmcSugeridoBaseadoEm.doc ? ' doc ' + p.cmcSugeridoBaseadoEm.doc : ''})` : ''}. Voce pode editar o valor (e a data) na tabela antes de corrigir.
          </div>
          <div style={{ fontSize: '.74rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 8, marginBottom: 14 }}>
            ⚠ A correcao e&apos; um ajuste de estoque <b>RETROATIVO</b> datado em <b>{p.dataAjusteRetroativoBR || '?'}</b>: zera o saldo nesse ponto e seta o CMC. O Omie reprocessa os movimentos posteriores (o saldo de hoje muda). Mexe em periodos contabeis ja fechados - alinhe com a contabilidade.
          </div>

          <h3 style={{ fontWeight: 600, color: '#334155', marginBottom: 4, fontSize: '.82rem' }}>Saldo por local</h3>
          <MiniTabela headers={['Local', 'Saldo', 'CMC no local']} rows={(p.porLocal || []).map((l) => [
            <span key="n">{l.localNome} <span style={{ color: '#94a3b8' }}>(#{l.localId})</span></span>, fmtSaldo(l.saldo), fmtBRL(l.cmc),
          ])} />

          {p.movimentosResumo && p.movimentosResumo.length > 0 && (
            <>
              <h3 style={{ fontWeight: 600, color: '#334155', margin: '14px 0 4px', fontSize: '.82rem' }}>Ultimos movimentos de estoque</h3>
              <MiniTabela headers={['Data', 'Origem', 'Doc', 'Entrou (qtd / custo)', 'Saiu', 'Qtde apos', 'CMC antes', 'CMC depois']} rows={p.movimentosResumo.map((m) => [
                <span key="d">{m.data || ''}{m.cancelado ? <span style={{ color: '#ef4444' }}> (canc)</span> : null}{m.devolucao ? <span style={{ color: '#d97706' }}> (devol)</span> : null}</span>,
                m.desOrigem || m.codOrigem || '', m.numDoc || '',
                m.qtdeEntrada && m.qtdeEntrada > 0 ? `${fmtSaldo(m.qtdeEntrada)} / ${fmtBRL(m.entradaCMC)}` : '',
                m.qtdeSaida ? fmtSaldo(Math.abs(m.qtdeSaida)) : '',
                m.qtdeAtual != null ? (m.qtdeAtual < 0 ? <span key="q" style={{ color: '#b91c1c', fontWeight: 600 }}>{fmtSaldo(m.qtdeAtual)}</span> : fmtSaldo(m.qtdeAtual)) : '',
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
