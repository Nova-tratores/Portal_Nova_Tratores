'use client';
// Correcao de contas (Fase 3). Portado de correcao-contas.ejs + public/correcao-contas.js.
// Ranking de gastos por categoria/departamento (a pagar/receber) -> clica num grupo,
// ve os lancamentos, e corrige a categoria/departamento (com rateio) direto no Omie,
// individual ou em massa.
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { authHeaders } from '@/lib/auth/client';
import ModalRegistrarBoleto from '@/components/ajustes/ModalRegistrarBoleto';
import { PaginaFin, CampoFin, Segmentado, BotaoFin, Chip, ChipSituacao, ChipEmpresa, RodapeGrade, JanelaFin, ThOrdena, TEAL_ESC } from '@/components/ajustes/omie-fin';

// ---------- tipos ----------
type Tipo = 'pagar' | 'receber';
type Dim = 'categoria' | 'departamento';

interface GrupoRanking { codigo: string | number | null; descricao: string; total: number; n: number }
interface RankingPayload {
  tipo?: Tipo; dim?: Dim; conta?: string; ranking?: GrupoRanking[];
  totalGeral?: number; totalLancamentos?: number; erro?: string;
}
interface Lancamento {
  conta: string; codigoLancamento: number | string; valor: number;
  dataEmissao?: string; vencimento?: string; numeroDoc?: string; contraparte?: string;
  status?: string | null;
  codigoCategoria?: string | number | null; descricaoCategoria?: string | null;
  codigoDepartamento?: string | number | null; descricaoDepartamento?: string | null;
  dataPrevisao?: string | null; observacao?: string | null;
  codigoProjeto?: number | null; idContaCorrente?: number | null;
  projetoNome?: string | null; // preenchido na tela (espelho de projetos)
  // boleto agrupado de fornecedor: duplicata da NF (COMP) × manual (RPTP), parcela, fornecedor
  numeroDocFiscal?: string | null; parcela?: string | null; valorPago?: number | null; idOrigem?: string | null; codigoFornecedor?: number | null;
}
interface BoletoAtivo { boletoId: string; numero: string; status: string }
type Situacao = 'todas' | 'aberto' | 'atrasado';
type Vista = 'ranking' | 'lista';
interface CamposForm { dataVencimento: string; dataPrevisao: string; codigoProjeto: string; idContaCorrente: string; numeroDocumento: string; observacao: string }
interface LancamentosPayload { total?: number; mostrando?: number; lancamentos?: Lancamento[]; erro?: string }
interface CatDep { codigo: string | number; descricao: string }
interface RateioRow { id: number; codDep: string; perc: string }

// ---------- helpers ----------
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtBRL(n: number | null | undefined): string { return brl.format(Number(n) || 0); }
function fmtData(s?: string | null): string {
  if (!s) return '';
  const m = String(s).slice(0, 10).split('-');
  return m.length === 3 ? `${m[2]}/${m[1]}/${m[0]}` : String(s);
}
function norm(s: unknown): string { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function decode(s?: string | null): string {
  if (s == null) return '';
  return String(s)
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&amp;/g, '&');
}
function isoDefault(meses: number): { de: string; ate: string } {
  const hoje = new Date();
  const ate = hoje.toISOString().slice(0, 10);
  const d = new Date(hoje); d.setMonth(d.getMonth() - meses);
  return { de: d.toISOString().slice(0, 10), ate };
}

// colunas da tabela de lancamentos (filtraveis/ordenaveis)
interface ColDef { key: string; label: string; type: 'num' | 'date' | 'text'; align?: 'right'; val: (l: Lancamento) => number | string; txt: (l: Lancamento) => string }
const COLS: ColDef[] = [
  { key: 'conta', label: 'Empresa', type: 'text', val: (l) => l.conta || '', txt: (l) => l.conta || '' },
  { key: 'valor', label: 'Valor', type: 'num', align: 'right', val: (l) => Number(l.valor) || 0, txt: (l) => fmtBRL(l.valor) },
  { key: 'dataEmissao', label: 'Emissao', type: 'date', val: (l) => l.dataEmissao || '', txt: (l) => fmtData(l.dataEmissao) },
  { key: 'vencimento', label: 'Vencimento', type: 'date', val: (l) => l.vencimento || '', txt: (l) => fmtData(l.vencimento) },
  { key: 'dataPrevisao', label: 'Previsao', type: 'date', val: (l) => l.dataPrevisao || '', txt: (l) => fmtData(l.dataPrevisao) },
  { key: 'status', label: 'Situacao', type: 'text', val: (l) => l.status || '', txt: (l) => l.status || '' },
  { key: 'contraparte', label: 'Fornecedor/Cliente', type: 'text', val: (l) => decode(l.contraparte), txt: (l) => decode(l.contraparte) },
  { key: 'numeroDoc', label: 'Nº doc', type: 'text', val: (l) => l.numeroDoc || '', txt: (l) => l.numeroDoc || '' },
  { key: 'descricaoCategoria', label: 'Categoria', type: 'text', val: (l) => l.descricaoCategoria || '', txt: (l) => l.descricaoCategoria || '' },
  { key: 'descricaoDepartamento', label: 'Departamento', type: 'text', val: (l) => l.descricaoDepartamento || '', txt: (l) => l.descricaoDepartamento || '' },
  { key: 'projeto', label: 'Projeto', type: 'text', val: (l) => l.projetoNome || '', txt: (l) => l.projetoNome || '' },
];

export default function CorrecaoContasPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const def = useMemo(() => isoDefault(3), []);
  const [tipo, setTipo] = useState<Tipo>('pagar');
  const [dim, setDim] = useState<Dim>('categoria');
  const [situacao, setSituacao] = useState<Situacao>('todas');
  // Ranking (barras por categoria/departamento) ou Lista (todos os lancamentos numa tabela ordenavel)
  const [vista, setVista] = useState<Vista>(() => {
    try { return localStorage.getItem('cc-vista') === 'lista' ? 'lista' : 'ranking'; } catch { return 'ranking'; }
  });
  const mudarVista = (v: Vista) => { setVista(v); try { localStorage.setItem('cc-vista', v); } catch { /* sem storage */ } };
  const [de, setDe] = useState(def.de);
  const [ate, setAte] = useState(def.ate);
  // em aberto/atrasado ignora a janela de emissao (titulos atrasados costumam ser antigos)
  const usaData = situacao === 'todas';

  const [ranking, setRanking] = useState<GrupoRanking[]>([]);
  const [resumo, setResumo] = useState('');
  const [status, setStatus] = useState('');
  const [carregando, setCarregando] = useState(false);

  // painel de lancamentos
  const [grupoSel, setGrupoSel] = useState<GrupoRanking | null>(null);
  const [lancs, setLancs] = useState<Lancamento[]>([]);
  const [lancSub, setLancSub] = useState('');
  const [sort, setSort] = useState<{ key: string | null; dir: number }>({ key: null, dir: 1 });
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  // boleto agrupado de fornecedor (vista Lista, a pagar): seleção de duplicatas + quais já estão em boleto
  const [selBoleto, setSelBoleto] = useState<Set<string>>(new Set());
  const [emBoleto, setEmBoleto] = useState<Record<string, BoletoAtivo>>({});
  const [modalBoleto, setModalBoleto] = useState<Lancamento[] | null>(null);

  // caches de cat/dep por conta (slug)
  const catCache = useRef<Record<string, CatDep[]>>({});
  const depCache = useRef<Record<string, CatDep[]>>({});
  const projCache = useRef<Record<string, CatDep[]>>({});
  const ccCache = useRef<Record<string, CatDep[]>>({});
  // nome do projeto por empresa+codigo (coluna Projeto da tabela)
  const [projetos, setProjetos] = useState<Record<string, Record<string, string>>>({});

  // modal individual
  const [modalLanc, setModalLanc] = useState<Lancamento | null>(null);
  // modal de massa
  const [massaRows, setMassaRows] = useState<Lancamento[] | null>(null);

  // duplicatas que já estão num boleto agrupado ativo (chip na linha + bloqueio da seleção)
  const carregarEmBoleto = useCallback(async (ls: Lancamento[]) => {
    const contas = Array.from(new Set(ls.map((l) => String(l.conta).toUpperCase()))).filter((c) => c === 'NOVA' || c === 'CASTRO');
    const mapa: Record<string, BoletoAtivo> = {};
    for (const c of contas) {
      try {
        const r = await fetch(`/api/ajustes/boletos-fornecedor?conta=${c}&status=ativos`, { headers: await authHeaders() });
        const d = await r.json();
        for (const [cod, info] of Object.entries((d.titulosAtivos || {}) as Record<string, BoletoAtivo>)) mapa[`${c}:${cod}`] = info;
      } catch { /* sem o painel de boletos (migration ausente) a tela segue igual */ }
    }
    setEmBoleto(mapa);
  }, []);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setStatus('carregando...');
    setGrupoSel(null);
    setLancs([]);
    try {
      let qs = `tipo=${tipo}&dim=${dim}`;
      qs += contaParam; // '' (todas) ou '&conta=...'
      if (situacao !== 'todas') qs += '&situacao=' + situacao;
      if (usaData && de) qs += '&de=' + encodeURIComponent(de);
      if (usaData && ate) qs += '&ate=' + encodeURIComponent(ate);
      const sit = situacao === 'aberto' ? ' em aberto' : situacao === 'atrasado' ? ' atrasado(s)' : '';
      if (vista === 'lista') {
        // modo Lista: todos os lancamentos do filtro numa tabela so (cabecalho ordena A→Z / Z→A)
        const r = await fetch(`/api/ajustes/contas/lancamentos?${qs.replace(/^&/, '').replace(/dim=\w+/, 'dim=todos')}&limite=2500`, { headers: await authHeaders() });
        const d = (await r.json()) as LancamentosPayload;
        if (d.erro) { setStatus('Erro: ' + d.erro); setLancs([]); return; }
        setRanking([]);
        setLancs(d.lancamentos || []);
        setSort({ key: 'vencimento', dir: 1 });
        setFiltros({});
        setSelBoleto(new Set());
        if (tipo === 'pagar') carregarEmBoleto(d.lancamentos || []);
        setGrupoSel({ codigo: '*', descricao: 'Todos os lancamentos', total: 0, n: d.total || 0 });
        const corte = (d.total || 0) > (d.mostrando || 0) ? ` · mostrando os ${d.mostrando} maiores — refine o periodo ou a situacao` : '';
        setLancSub(`${d.total || 0} lancamento(s)${sit}${corte} · clique no cabecalho para ordenar, filtre por coluna, Corrigir para editar`);
        setResumo(`${d.total || 0} lancamentos${sit}`);
        setStatus('');
        return;
      }
      const r = await fetch(`/api/ajustes/contas/ranking?${qs.replace(/^&/, '')}`, { headers: await authHeaders() });
      const d = (await r.json()) as RankingPayload;
      if (d.erro) { setStatus('Erro: ' + d.erro); setRanking([]); return; }
      setRanking(d.ranking || []);
      setResumo(`${d.totalLancamentos || 0} lancamentos${sit} · total ${fmtBRL(d.totalGeral)} · ${(d.ranking || []).length} ${dim}(s)`);
      setStatus('');
    } catch (ex) {
      setStatus('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [tipo, dim, situacao, usaData, contaParam, de, ate, vista, carregarEmBoleto]);

  // recarrega ao trocar conta/tipo/dim/situacao/vista
  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, tipo, dim, situacao, vista]);

  const abrirLancamentos = useCallback(async (grupo: GrupoRanking) => {
    setGrupoSel(grupo);
    setLancs([]);
    setSort({ key: null, dir: 1 });
    setFiltros({});
    setLancSub('carregando...');
    try {
      let qs = `tipo=${tipo}&dim=${dim}&codigo=${encodeURIComponent(grupo.codigo == null ? '(sem)' : grupo.codigo)}`;
      qs += contaParam;
      if (situacao !== 'todas') qs += '&situacao=' + situacao;
      if (usaData && de) qs += '&de=' + encodeURIComponent(de);
      if (usaData && ate) qs += '&ate=' + encodeURIComponent(ate);
      const r = await fetch(`/api/ajustes/contas/lancamentos?${qs.replace(/^&/, '')}`, { headers: await authHeaders() });
      const d = (await r.json()) as LancamentosPayload;
      if (d.erro) { setLancSub('Erro: ' + d.erro); return; }
      setLancs(d.lancamentos || []);
      setLancSub(`${d.total || 0} lancamento(s)${(d.total || 0) > (d.mostrando || 0) ? ` (mostrando os ${d.mostrando} maiores)` : ''} · clique em Corrigir`);
    } catch (ex) {
      setLancSub('Rede: ' + (ex as Error).message);
    }
  }, [tipo, dim, situacao, usaData, contaParam, de, ate]);

  const carregarCats = useCallback(async (slug: string): Promise<CatDep[]> => {
    if (catCache.current[slug]) return catCache.current[slug];
    const r = await fetch('/api/ajustes/categorias?conta=' + encodeURIComponent(slug), { headers: await authHeaders() });
    const d = await r.json();
    catCache.current[slug] = d.categorias || [];
    return catCache.current[slug];
  }, []);
  const carregarDeps = useCallback(async (slug: string): Promise<CatDep[]> => {
    if (depCache.current[slug]) return depCache.current[slug];
    const r = await fetch('/api/ajustes/departamentos?conta=' + encodeURIComponent(slug), { headers: await authHeaders() });
    const d = await r.json();
    depCache.current[slug] = d.departamentos || [];
    return depCache.current[slug];
  }, []);
  const carregarProjetos = useCallback(async (slug: string): Promise<CatDep[]> => {
    if (projCache.current[slug]) return projCache.current[slug];
    const r = await fetch('/api/ajustes/projetos?conta=' + encodeURIComponent(slug), { headers: await authHeaders() });
    const d = await r.json();
    projCache.current[slug] = d.projetos || [];
    setProjetos((s) => ({ ...s, [slug]: Object.fromEntries((d.projetos || []).map((p: CatDep) => [String(p.codigo), p.descricao])) }));
    return projCache.current[slug];
  }, []);
  const carregarCCs = useCallback(async (slug: string): Promise<CatDep[]> => {
    if (ccCache.current[slug]) return ccCache.current[slug];
    const r = await fetch('/api/ajustes/contas-correntes?conta=' + encodeURIComponent(slug), { headers: await authHeaders() });
    const d = await r.json();
    ccCache.current[slug] = (d.contasCorrentes || []).map((c: { codigo: number; descricao: string; tipo?: string }) => ({ codigo: c.codigo, descricao: `${c.descricao}${c.tipo ? ` (${c.tipo})` : ''}` }));
    return ccCache.current[slug];
  }, []);
  // nomes dos projetos das duas empresas (coluna Projeto)
  useEffect(() => {
    carregarProjetos('NOVA').catch(() => {});
    carregarProjetos('CASTRO').catch(() => {});
  }, [carregarProjetos]);

  // linhas filtradas/ordenadas
  const linhasVisiveis = useMemo(() => {
    const nomeProjeto = (l: Lancamento) => (l.codigoProjeto ? ((projetos[String(l.conta).toUpperCase()] || {})[String(l.codigoProjeto)] || String(l.codigoProjeto)) : '');
    let rows = lancs.map((l) => ({ ...l, projetoNome: nomeProjeto(l) })).filter((l) => COLS.every((c) => {
      const f = filtros[c.key]; if (!f) return true;
      return norm(c.txt(l)).indexOf(norm(f)) >= 0;
    }));
    if (sort.key) {
      const c = COLS.find((x) => x.key === sort.key);
      if (c) rows = rows.slice().sort((a, b) => {
        const va = c.val(a), vb = c.val(b);
        const r = c.type === 'num' ? (Number(va) - Number(vb)) : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
        return r * sort.dir;
      });
    }
    return rows;
  }, [lancs, filtros, sort, projetos]);

  // botao de massa: so 1 cliente/fornecedor distinto nas linhas visiveis
  const massaInfo = useMemo(() => {
    const nomes = new Set(linhasVisiveis.map((l) => decode(l.contraparte) || '(sem)'));
    if (linhasVisiveis.length && nomes.size === 1) return { cliente: Array.from(nomes)[0], rows: linhasVisiveis };
    return null;
  }, [linhasVisiveis]);

  const ordenarPor = useCallback((key: string) => {
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }, []);

  // seleção para boleto agrupado: só vista Lista + a pagar; válida com 1 empresa, 1 fornecedor, só duplicatas de NF em aberto
  const modoBoleto = vista === 'lista' && tipo === 'pagar';
  const chaveSel = (l: Lancamento) => `${String(l.conta).toUpperCase()}:${l.codigoLancamento}`;
  const podeSelecionar = (l: Lancamento) => modoBoleto && ['A VENCER', 'ATRASADO', 'VENCE HOJE'].includes(String(l.status || '')) && (l.idOrigem || 'COMP') === 'COMP' && !emBoleto[chaveSel(l)];
  const selecionados = useMemo(() => linhasVisiveis.filter((l) => selBoleto.has(chaveSel(l))), [linhasVisiveis, selBoleto]);
  const boletoInfo = useMemo(() => {
    if (!selecionados.length) return { ok: false, motivo: '' };
    const contas = new Set(selecionados.map((l) => String(l.conta).toUpperCase()));
    if (contas.size > 1) return { ok: false, motivo: 'uma empresa por boleto' };
    const forns = new Set(selecionados.map((l) => l.codigoFornecedor ?? decode(l.contraparte)));
    if (forns.size > 1) return { ok: false, motivo: 'um fornecedor por boleto' };
    return { ok: true, motivo: '' };
  }, [selecionados]);
  const toggleSel = (l: Lancamento) => setSelBoleto((s) => { const n = new Set(s); const k = chaveSel(l); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const toggleTodos = () => {
    const elegiveis = linhasVisiveis.filter(podeSelecionar);
    setSelBoleto((s) => elegiveis.every((l) => s.has(chaveSel(l))) ? new Set() : new Set(elegiveis.map(chaveSel)));
  };

  if (!permLoading && userProfile && !pode('financeiro', 'correcao-contas')) return <SemPermissao />;

  const TOP = 30;
  const topRanking = ranking.slice(0, TOP);
  const maxTotal = topRanking.reduce((m, r) => Math.max(m, r.total), 0) || 1;

  const colsGrade = COLS.length + (modoBoleto ? 2 : 1);
  return (
    <PaginaFin
      titulo="Correção de contas"
      sub={<>Categoria, departamento e campos dos títulos <b>a pagar / a receber</b> — corrige direto na Omie · conta <b>{conta ? conta.toUpperCase() : 'Todas'}</b></>}
      direita={<ContaSelector />}
      comoLer={<>
        <b>Ranking</b>: gastos por <b>categoria</b> ou <b>departamento</b> para achar valores que distorcem o DRE — clique numa barra para ver os lançamentos.
        <b> Lista</b>: todos os lançamentos do filtro numa grade só; o cabeçalho ordena A→Z / Z→A e a 2ª linha filtra cada coluna.
        Em qualquer linha, <b>Corrigir</b> (ou dois cliques) abre a janela do lançamento: categoria, departamento com rateio, vencimento, previsão, projeto, conta corrente, nº do documento e observação — só o que mudar vai para a Omie.
        <b> Situação</b> = Em aberto / Atrasado ignora as datas de emissão. Quando o filtro deixa um único fornecedor/cliente aparece <b>Alterar em massa</b>.
        Na Lista a pagar dá para marcar as duplicatas de NF de um fornecedor e <b>registrar o boleto agrupado</b> (o boleto reprograma as duplicatas; nada de título manual nem baixa antes de pagar).
        <div style={{ marginTop: 6 }}><Link href="/financeiro/caixa/boletos-fornecedor">Boletos de fornecedor</Link></div>
      </>}
    >
      {/* Filtros */}
      <div className="ofin-cartao">
        <div className="ofin-filtros">
          <CampoFin titulo="Visualização"><Segmentado<Vista> valor={vista} onChange={mudarVista} opcoes={[['ranking', 'Ranking'], ['lista', 'Lista']]} /></CampoFin>
          <CampoFin titulo="Tipo"><Segmentado<Tipo> valor={tipo} onChange={setTipo} opcoes={[['pagar', 'A pagar'], ['receber', 'A receber']]} /></CampoFin>
          {vista === 'ranking' && <CampoFin titulo="Agrupar por"><Segmentado<Dim> valor={dim} onChange={setDim} opcoes={[['categoria', 'Categoria'], ['departamento', 'Departamento']]} /></CampoFin>}
          <CampoFin titulo="Situação"><Segmentado<Situacao> valor={situacao} onChange={setSituacao} opcoes={[['todas', 'Todas'], ['aberto', 'Em aberto'], ['atrasado', 'Atrasado']]} /></CampoFin>
          <CampoFin titulo="Emissão de" apagado={!usaData} style={{ width: 160 }}><input className="ofin-inp" type="date" value={de} disabled={!usaData} onChange={(e) => setDe(e.target.value)} /></CampoFin>
          <CampoFin titulo="Até" apagado={!usaData} style={{ width: 160 }}><input className="ofin-inp" type="date" value={ate} disabled={!usaData} onChange={(e) => setAte(e.target.value)} /></CampoFin>
          <div style={{ marginLeft: 'auto' }}><BotaoFin variante="prim" icone="fa-rotate" onClick={buscar} disabled={carregando} style={{ height: 38 }}>{carregando ? 'Carregando…' : 'Atualizar'}</BotaoFin></div>
        </div>
        {(status || resumo) && (
          <div className="ofin-filtros-pe">
            {status && <span className={`ofin-msg${status.startsWith('Erro') ? ' erro' : ''}`}>{status}</span>}
            {resumo && <span className="ofin-resumo">{resumo}</span>}
          </div>
        )}
      </div>

      {/* Ranking (barras clicáveis) — só na vista Ranking */}
      {vista === 'ranking' && (
        <div className="ofin-cartao">
          <div className="ofin-grade-cab">
            <h2>Ranking por {dim}</h2>
            <span className="ofin-sub">{topRanking.length ? `os ${topRanking.length} maiores · clique para ver os lançamentos` : ''}</span>
          </div>
          {topRanking.length === 0 ? (
            <div style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>{carregando ? 'Carregando…' : 'Sem dados para o período/filtro.'}</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 10px 12px' }}>
              {topRanking.map((r) => {
                const ativo = !!grupoSel && String(grupoSel.codigo) === String(r.codigo);
                return (
                  <button key={String(r.codigo)} type="button" onClick={() => abrirLancamentos(r)} title={`${r.descricao} · ${fmtBRL(r.total)} (${r.n} lanç.)`} className={`ofin-barra${ativo ? ' ativo' : ''}`}>
                    <span style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: ativo ? 600 : 400 }}>{r.descricao || '(sem)'}</span>
                    <span className="trilho"><i style={{ width: `${Math.max(2, (r.total / maxTotal) * 100)}%` }} /></span>
                    <span style={{ fontSize: 12.5, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(r.total)} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({r.n})</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Lançamentos (grupo do ranking ou todos, na vista Lista) */}
      {grupoSel && (
        <div className="ofin-cartao">
          <div className="ofin-grade-cab">
            <h2>{grupoSel.codigo === '*' ? 'Lançamentos' : `${dim === 'categoria' ? 'Categoria' : 'Departamento'}: ${grupoSel.descricao || '(sem)'}`}</h2>
            <span className="ofin-sub">{lancSub}</span>
            <div style={{ flex: 1 }} />
            {modoBoleto && selecionados.length > 0 && (
              <BotaoFin variante="prim" icone="fa-barcode" onClick={() => boletoInfo.ok && setModalBoleto(selecionados)} disabled={!boletoInfo.ok}
                title={boletoInfo.ok ? 'O boleto do fornecedor reprograma estas duplicatas (previsão/vencimento = parcela) — sem título manual, sem baixa' : boletoInfo.motivo}>
                Registrar boleto agrupado ({selecionados.length}){boletoInfo.ok ? '' : ` — ${boletoInfo.motivo}`}
              </BotaoFin>
            )}
            {massaInfo && (
              <BotaoFin variante="aviso" icone="fa-layer-group" onClick={() => setMassaRows(massaInfo.rows)} title="Só aparece quando o filtro deixa um único cliente/fornecedor">Alterar em massa ({massaInfo.rows.length})</BotaoFin>
            )}
            {vista === 'ranking' && <button type="button" className="ofin-fechar" onClick={() => setGrupoSel(null)}>Fechar ✕</button>}
          </div>
          <div className="ofin-grade-caixa" style={{ maxHeight: '62vh' }}>
            <table className="ofin-grade fixo">
              <thead>
                <tr>
                  {modoBoleto && <th className="centro" style={{ width: 34 }} title="selecionar duplicatas de NF em aberto para registrar um boleto agrupado"><input type="checkbox" onChange={toggleTodos} checked={linhasVisiveis.some(podeSelecionar) && linhasVisiveis.filter(podeSelecionar).every((l) => selBoleto.has(chaveSel(l)))} /></th>}
                  {COLS.map((c) => <ThOrdena key={c.key} rotulo={c.label} ativo={sort.key === c.key} dir={sort.dir} num={c.align === 'right'} onClick={() => ordenarPor(c.key)} />)}
                  <th />
                </tr>
                <tr>
                  {modoBoleto && <th className="filtro" />}
                  {COLS.map((c) => (
                    <th key={c.key} className="filtro">
                      <input className="ofin-filtro-col" value={filtros[c.key] || ''} onChange={(e) => setFiltros((s) => ({ ...s, [c.key]: e.target.value }))} placeholder="filtrar" />
                    </th>
                  ))}
                  <th className="filtro" />
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.length === 0 ? (
                  <tr><td colSpan={colsGrade} className="vazio">{lancSub === 'carregando...' ? 'Carregando…' : 'Nenhum lançamento bate com os filtros.'}</td></tr>
                ) : linhasVisiveis.map((l) => {
                  const marcado = selBoleto.has(chaveSel(l));
                  const prevDif = !!l.dataPrevisao && l.dataPrevisao !== l.vencimento;
                  return (
                    <tr key={`${l.conta}:${l.codigoLancamento}`} className={marcado ? 'sel' : undefined} onDoubleClick={() => setModalLanc(l)} title="Dois cliques: corrigir este lançamento">
                      {modoBoleto && (
                        <td className="centro" title={emBoleto[chaveSel(l)] ? `já está no boleto ${emBoleto[chaveSel(l)].numero}` : (l.idOrigem || 'COMP') !== 'COMP' ? 'título manual (não é duplicata de NF)' : ''} onDoubleClick={(e) => e.stopPropagation()}>
                          {podeSelecionar(l) ? <input type="checkbox" checked={marcado} onChange={() => toggleSel(l)} />
                            : emBoleto[chaveSel(l)] ? <Chip cor="roxo">boleto {emBoleto[chaveSel(l)].numero}</Chip>
                            : (l.idOrigem || 'COMP') !== 'COMP' && ['A VENCER', 'ATRASADO', 'VENCE HOJE'].includes(String(l.status || '')) ? <Chip cor="ambar" title="título digitado à mão na Omie (não veio de NF)">manual</Chip> : null}
                        </td>
                      )}
                      <td><ChipEmpresa conta={l.conta} /></td>
                      <td className="num" style={{ fontWeight: 600 }}>{fmtBRL(l.valor)}</td>
                      <td className="apagado nowrap">{fmtData(l.dataEmissao) || '-'}</td>
                      <td className="apagado nowrap">{fmtData(l.vencimento) || '-'}</td>
                      <td className="apagado nowrap" style={prevDif ? { color: '#b45309', fontWeight: 600 } : undefined}>{fmtData(l.dataPrevisao) || '-'}</td>
                      <td><ChipSituacao s={l.status} /></td>
                      <td>{decode(l.contraparte) || '-'}</td>
                      <td className="apagado nowrap">{l.numeroDoc || '-'}</td>
                      <td className="apagado">{l.descricaoCategoria || '-'}</td>
                      <td className="apagado">{l.descricaoDepartamento || '-'}</td>
                      <td className="apagado" style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={l.projetoNome || ''}>{l.projetoNome || '-'}</td>
                      <td className="num"><BotaoFin mini icone="fa-pen" onClick={() => setModalLanc(l)}>Corrigir</BotaoFin></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <RodapeGrade mostrando={linhasVisiveis.length} total={lancs.length} dica={<><i className="fas fa-hand-pointer" /> dois cliques numa linha abre a correção</>} />
        </div>
      )}

      {modalLanc && (
        <ModalCorrecao lanc={modalLanc} tipo={tipo} carregarCats={carregarCats} carregarDeps={carregarDeps} carregarProjetos={carregarProjetos} carregarCCs={carregarCCs}
          onClose={() => setModalLanc(null)} onAplicado={() => { setModalLanc(null); buscar(); }} />
      )}
      {modalBoleto && (
        <ModalRegistrarBoleto titulos={modalBoleto} onClose={() => setModalBoleto(null)} onRegistrado={() => { setModalBoleto(null); buscar(); }} />
      )}
      {massaRows && (
        <ModalMassa rows={massaRows} tipo={tipo} criadoPor={criadoPor} carregarCats={carregarCats} carregarDeps={carregarDeps}
          onClose={() => setMassaRows(null)} onAplicado={() => { setMassaRows(null); buscar(); }} />
      )}
    </PaginaFin>
  );
}

// ---------- modal de correcao individual ----------
let rowSeq = 1;
const ROTULO_CAMPO_FORM: Record<keyof CamposForm, string> = { dataVencimento: 'Vencimento', dataPrevisao: 'Previsao', codigoProjeto: 'Projeto', idContaCorrente: 'Conta corrente', numeroDocumento: 'Nº documento', observacao: 'Observacao' };
function ModalCorrecao({ lanc, tipo, carregarCats, carregarDeps, carregarProjetos, carregarCCs, onClose, onAplicado }: {
  lanc: Lancamento; tipo: Tipo;
  carregarCats: (slug: string) => Promise<CatDep[]>; carregarDeps: (slug: string) => Promise<CatDep[]>;
  carregarProjetos: (slug: string) => Promise<CatDep[]>; carregarCCs: (slug: string) => Promise<CatDep[]>;
  onClose: () => void; onAplicado: () => void;
}) {
  // conta_omie já é 'NOVA'/'CASTRO' (uppercase) — o backend unificado exige esse formato.
  const slug = String(lanc.conta || '').toUpperCase();
  const [cats, setCats] = useState<CatDep[]>([]);
  const [deps, setDeps] = useState<CatDep[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [catSel, setCatSel] = useState<string>(lanc.codigoCategoria != null ? String(lanc.codigoCategoria) : '');
  const [rateio, setRateio] = useState<RateioRow[]>([{ id: rowSeq++, codDep: lanc.codigoDepartamento != null ? String(lanc.codigoDepartamento) : '', perc: '100' }]);
  const [modalStatus, setModalStatus] = useState('');
  const [aplicando, setAplicando] = useState(false);
  // campos alem de categoria/departamento (vencimento, previsao, projeto, conta corrente, nº doc, observacao)
  const [projs, setProjs] = useState<CatDep[]>([]);
  const [ccs, setCcs] = useState<CatDep[]>([]);
  const [filtroProj, setFiltroProj] = useState('');
  const inicial: CamposForm = {
    dataVencimento: (lanc.vencimento || '').slice(0, 10), dataPrevisao: (lanc.dataPrevisao || '').slice(0, 10),
    codigoProjeto: lanc.codigoProjeto ? String(lanc.codigoProjeto) : '', idContaCorrente: lanc.idContaCorrente ? String(lanc.idContaCorrente) : '',
    numeroDocumento: lanc.numeroDoc || '', observacao: lanc.observacao || '',
  };
  const [form, setForm] = useState<CamposForm>(inicial);
  const setCampo = (k: keyof CamposForm, v: string) => setForm((s) => ({ ...s, [k]: v }));
  const camposMudados = useMemo(() => {
    const out: Partial<CamposForm> = {};
    (Object.keys(inicial) as (keyof CamposForm)[]).forEach((k) => { if (form[k] !== inicial[k]) out[k] = form[k]; });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form]);
  const nMudados = Object.keys(camposMudados).length;

  useEffect(() => {
    let vivo = true;
    Promise.all([carregarCats(slug), carregarDeps(slug), carregarProjetos(slug).catch(() => [] as CatDep[]), carregarCCs(slug).catch(() => [] as CatDep[])]).then(([c, d, p, cc]) => {
      if (!vivo) return;
      setCats(c); setDeps(d); setProjs(p); setCcs(cc); setCarregando(false);
    }).catch((e) => { if (vivo) { setModalStatus('Erro ao carregar: ' + (e as Error).message); setCarregando(false); } });
    return () => { vivo = false; };
  }, [slug, carregarCats, carregarDeps, carregarProjetos, carregarCCs]);

  const soma = rateio.reduce((s, r) => s + (Number(r.perc) || 0), 0);
  const somaOk = Math.abs(soma - 100) < 0.01;
  const catFalta = lanc.codigoCategoria != null && !cats.some((c) => String(c.codigo) === String(lanc.codigoCategoria));
  const depFalta = lanc.codigoDepartamento != null && !deps.some((d) => String(d.codigo) === String(lanc.codigoDepartamento));

  const aplicar = useCallback(async () => {
    if (!somaOk) { setModalStatus('a soma do rateio precisa ser 100%'); return; }
    const distribuicao: { cCodDep: string; nPerDep: number }[] = [];
    let faltou = false;
    for (const r of rateio) {
      const perc = Number(r.perc) || 0;
      if (!r.codDep) faltou = true;
      if (r.codDep && perc > 0) distribuicao.push({ cCodDep: r.codDep, nPerDep: perc });
    }
    if (faltou) { setModalStatus('escolha o departamento em todas as linhas'); return; }
    const resumoCampos = nMudados ? ` e ${nMudados} campo(s): ${Object.keys(camposMudados).map((k) => ROTULO_CAMPO_FORM[k as keyof CamposForm]).join(', ')}` : '';
    if (!confirm(`Aplicar correcao no Omie para o lancamento ${lanc.codigoLancamento} (${decode(lanc.contraparte)})?${resumoCampos}`)) return;
    setAplicando(true);
    setModalStatus('aplicando no Omie...');
    try {
      const r = await fetch('/api/ajustes/contas/corrigir', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ conta: slug, tipo, codigoLancamento: lanc.codigoLancamento, codigoCategoria: catSel, distribuicao, campos: camposMudados }),
      });
      const d = await r.json();
      if (!d.ok) { setModalStatus(d.erro || 'falha'); setAplicando(false); return; }
      setModalStatus(`aplicado ✓${d.aviso ? ` · ${d.aviso}` : ''}`);
      setTimeout(onAplicado, d.aviso ? 6000 : 600);
    } catch (ex) {
      setModalStatus('rede: ' + (ex as Error).message); setAplicando(false);
    }
  }, [somaOk, rateio, lanc, slug, tipo, catSel, onAplicado, camposMudados, nMudados]);

  const mud = (k: keyof CamposForm) => `ofin-inp${form[k] !== inicial[k] ? ' mudou' : ''}`;
  return (
    <JanelaFin titulo="Corrigir lançamento" largura={760} onFechar={onClose} travado={aplicando}
      sub={<>{lanc.conta} · {decode(lanc.contraparte)} · {fmtBRL(lanc.valor)} · emissão {fmtData(lanc.dataEmissao)} · lanç. <span style={{ fontFamily: 'monospace' }}>{lanc.codigoLancamento}</span></>}
      pe={<>
        <span className={`ofin-msg${modalStatus.includes('✓') ? ' ok' : modalStatus ? ' erro' : ''}`}>{modalStatus}</span>
        <BotaoFin variante="neutro" onClick={onClose} disabled={aplicando}>Cancelar</BotaoFin>
        <BotaoFin variante="prim" icone="fa-check" onClick={aplicar} disabled={aplicando || carregando}>Aplicar na Omie</BotaoFin>
      </>}>
      {carregando ? <div className="ofin-msg">carregando categorias e departamentos…</div> : (
        <>
          <CampoFin titulo="Categoria">
            <select className="ofin-inp" value={catSel} onChange={(e) => setCatSel(e.target.value)}>
              {catFalta && <option value={String(lanc.codigoCategoria)}>{lanc.codigoCategoria} — {lanc.descricaoCategoria || '(atual)'} [atual/inativa]</option>}
              {cats.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.codigo} — {c.descricao}</option>)}
            </select>
          </CampoFin>

          <div>
            <h3 className="ofin-secao">Departamentos <small>rateio em % · soma <b style={{ color: somaOk ? '#047857' : '#dc2626' }}>{soma.toFixed(2)}%</b>{somaOk ? '' : ' (precisa ser 100)'}</small></h3>
            <div className="ofin-cartao" style={{ marginBottom: 0 }}>
              <table className="ofin-grade compacta">
                <thead><tr><th>Departamento</th><th className="num" style={{ width: 120 }}>%</th><th style={{ width: 36 }} /></tr></thead>
                <tbody>{rateio.map((row) => {
                  const rowFalta = row.codDep && !deps.some((d) => String(d.codigo) === String(row.codDep));
                  return (
                    <tr key={row.id}>
                      <td style={{ padding: '4px 10px' }}>
                        <select className="ofin-inp" style={{ minHeight: 34 }} value={row.codDep} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, codDep: e.target.value } : x))}>
                          <option value="">(escolha)</option>
                          {rowFalta && <option value={row.codDep}>{depFalta && String(row.codDep) === String(lanc.codigoDepartamento) ? (lanc.descricaoDepartamento || row.codDep) : row.codDep} [atual/inativo]</option>}
                          {deps.map((d) => <option key={String(d.codigo)} value={String(d.codigo)}>{d.descricao}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 10px' }}><input className="ofin-inp num" style={{ minHeight: 34 }} type="number" min="0" max="100" step="0.01" value={row.perc} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, perc: e.target.value } : x))} /></td>
                      <td className="centro"><button type="button" className="ofin-x" title="Tirar este departamento" disabled={rateio.length <= 1} onClick={() => setRateio((s) => s.length > 1 ? s.filter((x) => x.id !== row.id) : s)}>×</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
              <div className="ofin-rodape"><button type="button" className="ofin-link" onClick={() => setRateio((s) => [...s, { id: rowSeq++, codDep: '', perc: '0' }])}><i className="fas fa-plus" /> Incluir departamento</button><span>{rateio.length} {rateio.length === 1 ? 'departamento' : 'departamentos'}</span></div>
            </div>
          </div>

          {/* Outros campos do título — só o que mudar vai para a Omie */}
          <div>
            <h3 className="ofin-secao">Outros campos do título <small>só o que você alterar é enviado · {nMudados ? <b style={{ color: '#b45309' }}>{nMudados} alterado(s)</b> : 'nada alterado'}</small></h3>
            <div className="ofin-grid" style={{ gridTemplateColumns: 'repeat(2, minmax(0, 1fr))' }}>
              <CampoFin titulo="Vencimento"><input className={mud('dataVencimento')} type="date" value={form.dataVencimento} onChange={(e) => setCampo('dataVencimento', e.target.value)} /></CampoFin>
              <CampoFin titulo={`Previsão de ${tipo === 'receber' ? 'recebimento' : 'pagamento'}`}><input className={mud('dataPrevisao')} type="date" value={form.dataPrevisao} onChange={(e) => setCampo('dataPrevisao', e.target.value)} /></CampoFin>
              <CampoFin titulo={<>Projeto <span style={{ fontWeight: 400, color: '#94a3b8' }}>({projs.length} no cadastro · digite para filtrar)</span></>} style={{ gridColumn: '1 / -1' }}>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input className="ofin-inp" style={{ flex: '0 0 40%' }} value={filtroProj} onChange={(e) => setFiltroProj(e.target.value)} placeholder="filtrar projeto (modelo, chassi, nome)" />
                  <select className={mud('codigoProjeto')} style={{ flex: 1 }} value={form.codigoProjeto} onChange={(e) => setCampo('codigoProjeto', e.target.value)}>
                    <option value="">{inicial.codigoProjeto ? '(manter sem alterar)' : '(sem projeto)'}</option>
                    {inicial.codigoProjeto && !projs.some((p) => String(p.codigo) === inicial.codigoProjeto) && <option value={inicial.codigoProjeto}>{lanc.projetoNome || inicial.codigoProjeto} [atual]</option>}
                    {projs.filter((p) => !filtroProj.trim() || norm(p.descricao).includes(norm(filtroProj)) || String(p.codigo).includes(filtroProj.trim())).slice(0, 400).map((p) => <option key={String(p.codigo)} value={String(p.codigo)}>{p.descricao}</option>)}
                  </select>
                </div>
              </CampoFin>
              <CampoFin titulo="Conta corrente">
                <select className={mud('idContaCorrente')} value={form.idContaCorrente} onChange={(e) => setCampo('idContaCorrente', e.target.value)}>
                  <option value="">{inicial.idContaCorrente ? '(manter sem alterar)' : '(sem conta corrente)'}</option>
                  {inicial.idContaCorrente && !ccs.some((c) => String(c.codigo) === inicial.idContaCorrente) && <option value={inicial.idContaCorrente}>{inicial.idContaCorrente} [atual]</option>}
                  {ccs.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.descricao}</option>)}
                </select>
              </CampoFin>
              <CampoFin titulo="Nº do documento"><input className={mud('numeroDocumento')} value={form.numeroDocumento} onChange={(e) => setCampo('numeroDocumento', e.target.value)} maxLength={60} /></CampoFin>
              <CampoFin titulo="Observação" style={{ gridColumn: '1 / -1' }}><textarea className={mud('observacao')} value={form.observacao} onChange={(e) => setCampo('observacao', e.target.value)} maxLength={1000} rows={2} /></CampoFin>
            </div>
          </div>
        </>
      )}
    </JanelaFin>
  );
}

// ---------- modal de alteracao em massa ----------
function ModalMassa({ rows, tipo, criadoPor, carregarCats, carregarDeps, onClose, onAplicado }: {
  rows: Lancamento[]; tipo: Tipo; criadoPor: string;
  carregarCats: (slug: string) => Promise<CatDep[]>; carregarDeps: (slug: string) => Promise<CatDep[]>;
  onClose: () => void; onAplicado: () => void;
}) {
  const contas = Array.from(new Set(rows.map((l) => l.conta)));
  const multiConta = contas.length > 1;
  const slug = String(contas[0] || '').toUpperCase();
  const cliente = decode(rows[0]?.contraparte) || '(sem)';
  const semCat = rows.filter((l) => !l.codigoCategoria).length;
  const semDep = rows.filter((l) => !l.codigoDepartamento).length;

  const [cats, setCats] = useState<CatDep[]>([]);
  const [deps, setDeps] = useState<CatDep[]>([]);
  const [carregando, setCarregando] = useState(!multiConta);
  const [catOn, setCatOn] = useState(false);
  const [depOn, setDepOn] = useState(false);
  const [catSel, setCatSel] = useState('');
  const [soCatVazia, setSoCatVazia] = useState(false);
  const [soDepVazio, setSoDepVazio] = useState(false);
  const [rateio, setRateio] = useState<RateioRow[]>([{ id: rowSeq++, codDep: '', perc: '100' }]);
  const [modalStatus, setModalStatus] = useState('');
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    if (multiConta) return;
    let vivo = true;
    Promise.all([carregarCats(slug), carregarDeps(slug)]).then(([c, d]) => {
      if (!vivo) return; setCats(c); setDeps(d); setCarregando(false);
    }).catch((e) => { if (vivo) { setModalStatus('Erro ao carregar: ' + (e as Error).message); setCarregando(false); } });
    return () => { vivo = false; };
  }, [multiConta, slug, carregarCats, carregarDeps]);

  const soma = rateio.reduce((s, r) => s + (Number(r.perc) || 0), 0);
  const somaOk = Math.abs(soma - 100) < 0.01;

  const aplicar = useCallback(async () => {
    if (!catOn && !depOn) { setModalStatus('marque categoria e/ou departamento'); return; }
    const codigoCategoria = catOn ? catSel : null;
    if (catOn && !codigoCategoria) { setModalStatus('escolha a categoria'); return; }
    let distribuicao: { cCodDep: string; nPerDep: number }[] | null = null;
    if (depOn) {
      if (!somaOk) { setModalStatus('a soma do rateio precisa ser 100%'); return; }
      distribuicao = []; let faltou = false;
      for (const r of rateio) {
        const perc = Number(r.perc) || 0;
        if (!r.codDep) faltou = true;
        if (r.codDep && perc > 0) distribuicao.push({ cCodDep: r.codDep, nPerDep: perc });
      }
      if (faltou) { setModalStatus('escolha o departamento em todas as linhas'); return; }
    }
    const itens = rows.map((l) => ({ conta: String(l.conta).toUpperCase(), codigoLancamento: l.codigoLancamento, temCategoria: !!l.codigoCategoria, temDepartamento: !!l.codigoDepartamento }));
    const afetados = itens.filter((it) => {
      const aCat = catOn && (!soCatVazia || !it.temCategoria);
      const aDep = depOn && (!soDepVazio || !it.temDepartamento);
      return aCat || aDep;
    }).length;
    if (!afetados) { setModalStatus('nenhum lancamento se aplica (veja "so as sem...")'); return; }
    if (!confirm(`Aplicar no Omie em ${afetados} lancamento(s)? Isso altera os titulos direto no Omie.`)) return;
    setAplicando(true);
    setModalStatus(`aplicando em ${afetados} no Omie...`);
    try {
      const r = await fetch('/api/ajustes/contas/corrigir-massa', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ tipo, codigoCategoria, distribuicao, soCategoriaVazia: soCatVazia, soDepartamentoVazio: soDepVazio, itens, criadoPor }),
      });
      const d = await r.json();
      if (!d.ok) { setModalStatus(d.erro || 'falha'); setAplicando(false); return; }
      const msg = `aplicados ${d.aplicados}${d.pulados ? ` · ${d.pulados} pulado(s)` : ''}${d.falhas ? ` · ${d.falhas} falha(s)` : ''}${d.bloqueado ? ' · Omie bloqueou — tente o resto em alguns minutos' : ''}`;
      setModalStatus(msg);
      setTimeout(onAplicado, (d.falhas || d.bloqueado) ? 2600 : 1100);
    } catch (ex) {
      setModalStatus('rede: ' + (ex as Error).message); setAplicando(false);
    }
  }, [catOn, depOn, catSel, somaOk, rateio, rows, soCatVazia, soDepVazio, tipo, criadoPor, onAplicado]);

  return (
    <JanelaFin titulo="Alteração em massa" largura={620} onFechar={onClose} travado={aplicando}
      sub={<>{cliente} · {rows.length} lançamento(s){multiConta ? '' : ` · empresa ${contas[0]}`}</>}
      pe={<>
        <span className="ofin-msg">{modalStatus}</span>
        <BotaoFin variante="neutro" onClick={onClose} disabled={aplicando}>Cancelar</BotaoFin>
        <BotaoFin variante="prim" icone="fa-layer-group" onClick={aplicar} disabled={aplicando || carregando || multiConta}>Aplicar em massa</BotaoFin>
      </>}>
      {multiConta ? (
        <div className="ofin-aviso"><div>Os {rows.length} lançamentos são de mais de uma empresa ({contas.join(', ')}). A alteração em massa exige uma empresa por vez — filtre também pela coluna <b>Empresa</b>.</div></div>
      ) : carregando ? <div className="ofin-msg">carregando categorias e departamentos…</div> : (
        <>
          <div className="ofin-resumo">{semCat} sem categoria · {semDep} sem departamento</div>
          <div className="ofin-caixa" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: TEAL_ESC, cursor: 'pointer' }}><input type="checkbox" checked={catOn} onChange={(e) => setCatOn(e.target.checked)} /> Definir categoria</label>
            <select className="ofin-inp" value={catSel} onChange={(e) => setCatSel(e.target.value)} disabled={!catOn}>
              <option value="">(escolha)</option>
              {cats.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.codigo} — {c.descricao}</option>)}
            </select>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#6b7a89', cursor: 'pointer' }}><input type="checkbox" checked={soCatVazia} disabled={!catOn} onChange={(e) => setSoCatVazia(e.target.checked)} /> Aplicar só nas que estão <b>sem categoria</b> ({semCat})</label>
          </div>
          <div className="ofin-caixa" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontWeight: 600, color: TEAL_ESC, cursor: 'pointer' }}><input type="checkbox" checked={depOn} onChange={(e) => setDepOn(e.target.checked)} /> Definir departamento (rateio %)</label>
              <span style={{ marginLeft: 'auto', fontSize: 12.5 }}>Soma: <b style={{ color: somaOk ? '#047857' : '#dc2626' }}>{soma.toFixed(2)}%</b>{somaOk ? '' : ' (precisa ser 100)'}</span>
            </div>
            {rateio.map((row) => (
              <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <select className="ofin-inp" style={{ flex: 1 }} value={row.codDep} disabled={!depOn} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, codDep: e.target.value } : x))}>
                  <option value="">(escolha)</option>
                  {deps.map((d) => <option key={String(d.codigo)} value={String(d.codigo)}>{d.descricao}</option>)}
                </select>
                <input className="ofin-inp num" style={{ width: 90 }} type="number" min="0" max="100" step="0.01" value={row.perc} disabled={!depOn} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, perc: e.target.value } : x))} />
                <span className="ofin-msg">%</span>
                <button type="button" className="ofin-x" disabled={!depOn || rateio.length <= 1} onClick={() => setRateio((s) => s.length > 1 ? s.filter((x) => x.id !== row.id) : s)}>×</button>
              </div>
            ))}
            <div><button type="button" className="ofin-link" disabled={!depOn} style={{ opacity: depOn ? 1 : 0.5 }} onClick={() => setRateio((s) => [...s, { id: rowSeq++, codDep: '', perc: '0' }])}><i className="fas fa-plus" /> Incluir departamento</button></div>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#6b7a89', cursor: 'pointer' }}><input type="checkbox" checked={soDepVazio} disabled={!depOn} onChange={(e) => setSoDepVazio(e.target.checked)} /> Aplicar só nas que estão <b>sem departamento</b> ({semDep})</label>
          </div>
        </>
      )}
    </JanelaFin>
  );
}
