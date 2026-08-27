'use client';
// Recebimentos de NF-e pendentes (Fase 2). Portado de recebimentos.ejs + public/recebimentos.js.
// Lista NFs de fornecedor pendentes; destaca sinal de garantia/impacto no CMC; permite
// "dar entrada" revisando/editando o CFOP de entrada por item (default = cfopEntradaSugerido).
// SEM dropdown de categoria/departamento (adiado p/ Fase 3).
import { Fragment, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { supabase } from '@/lib/supabase';

interface Usuario { id: string; nome: string; funcao?: string | null }
const TIPO_LABEL: Record<string, string> = { pecas: 'Peças', pecas_garantia: 'Peças (garantia)', almoxarifado: 'Almoxarifado', combustivel: 'Combustível', maquinas: 'Máquinas' };
const TIPO_COR: Record<string, string> = { pecas: '#475569', pecas_garantia: '#b45309', almoxarifado: '#0e7490', combustivel: '#ca8a04', maquinas: '#7c3aed' };

// ---------- tipos do payload ----------
interface ItemReceb {
  nSequencia: number | string | null;
  cfop?: string | null;
  ncm?: string | null;
  cfopEntrada?: string | null;
  cfopEntradaSugerido?: string | null;
  codigoProdutoInt?: string | null;
  descricaoProduto?: string | null;
  idProduto?: number | null;
  criarNovo?: boolean;
  associarExistente?: boolean;
  qtde?: number;
  precoUnit?: number;
  valTotalItem?: number;
  // enriquecidos (so itens com sinal de garantia)
  cfopEhGarantia?: boolean;
  tipoItem?: 'novo' | 'existente';
  cmcAtual?: number | null;
  saldoAtual?: number | null;
  cmcProjetado?: number | null;
  impactoCMC?: number | null;
  impactoPct?: number | null;
  alerta?: boolean;
}
interface Recebimento {
  idReceb?: number | string | null;
  numeroNFe?: string | null;
  serieNFe?: string | null;
  chaveNFe?: string | null;
  etapa?: string | null;
  naturezaOperacao?: string | null;
  fornecedorNome?: string | null;
  dataEmissao?: string | null;
  valorNFe?: number;
  itens?: ItemReceb[];
  sinal?: string | null;
  temSinalGarantia?: boolean;
  temItemNovo?: boolean;
  temItemRisco?: boolean;
  maiorImpactoPct?: number;
  tipo?: string | null;
  responsavelUserId?: string | null;
  responsavelNome?: string | null;
  responsavelAutomatico?: boolean;
}
interface RecebPayload {
  dataDeBR?: string; dataAteBR?: string; fonte?: string; cachedEm?: string; duracaoMs?: number;
  totalRecebimentos?: number; totalNaoProcessados?: number; totalComSinalGarantia?: number;
  totalItensRisco?: number; recebimentos?: Recebimento[]; erro?: string;
}
interface ResultadoCard { tipo: 'ok' | 'erro'; texto: string }
// autocomplete de produto (/api/ajustes/movimentacao/buscar-produto)
interface ProdutoSugestao { codigoProduto: number; codigo: string; descricao: string; estoque: number | null }
// o que fazer com um item que o Omie traz como "produto novo"
type AcaoItem = 'novo' | 'associar' | 'ignorar';
// retorno de /api/ajustes/dar-entrada-recebimento p/ itens associados (impacto no CMC)
interface AssociadoInfo {
  nSequencia: number | string; idProduto: number; descricaoProduto?: string | null;
  cmcAtual: number | null; saldoAtual: number | null; cmcProjetado: number | null;
  impactoCMC: number | null; impactoPct: number | null; alerta: boolean; precoUnit?: number | null;
}
interface SugestaoCusto { cmcSugerido: number | null; estrategia: string; baseadoEm: { data?: string; doc?: string; origem?: string } | null; distorcido: boolean; erro?: string }
const ESTRAT_LABEL: Record<string, string> = {
  cmc_antes_de_negativo: 'CMC de antes de ficar negativo',
  maior_cmc_compra: 'maior CMC de uma compra',
  ultimo_custo_normal: 'último custo de compra normal',
  mediana_custos_normais: 'mediana dos custos normais',
  manual: 'sem base histórica — confira o valor',
  erro: 'erro ao buscar histórico — confira',
};

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
function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '-';
  return (Number(n) * 100).toFixed(1).replace('.', ',') + '%';
}
function cfopEntradaEquiv(cfopSaida?: string | null): string {
  if (cfopSaida == null) return '';
  const d = String(cfopSaida).replace(/\D/g, '');
  if (d.length < 4) return '';
  const mapa: Record<string, string> = { '5': '1', '6': '2', '7': '3' };
  return `${mapa[d[0]] || d[0]}.${d.slice(1, 4)}`;
}
function recKey(r: Recebimento): string {
  return String(r.idReceb != null ? r.idReceb : (r.chaveNFe || r.numeroNFe));
}
function isoDefault(offsetMeses: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMeses);
  return d.toISOString().slice(0, 10);
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

// atalhos rápidos de filtro (estilo pílula/toggle vermelho-branco)
const RED = '#dc2626';
const TIPOS_CHIP: Array<{ v: string; label: string }> = [
  { v: '', label: 'Todos' },
  { v: 'pecas', label: 'Peças' },
  { v: 'pecas_garantia', label: 'Peças (garantia)' },
  { v: 'almoxarifado', label: 'Almoxarifado' },
  { v: 'combustivel', label: 'Combustível' },
  { v: 'maquinas', label: 'Máquinas' },
];
// segmentado (Todas/Minhas/Sem responsável)
function Toggle({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: Array<{ v: string; l: string }> }) {
  return (
    <div style={{ display: 'inline-flex', border: '1px solid #e0e0e0', borderRadius: 10, overflow: 'hidden' }}>
      {options.map((o) => (
        <button key={o.v} onClick={() => onChange(o.v)} style={{ padding: '7px 16px', background: value === o.v ? RED : '#fff', border: 'none', cursor: 'pointer', fontSize: '.78rem', fontWeight: 600, color: value === o.v ? '#fff' : '#666' }}>{o.l}</button>
      ))}
    </div>
  );
}
// pílula com contador (chip por tipo / garantia)
function Chip({ label, count, active, onClick }: { label: string; count?: number | null; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} style={{
      padding: '8px 16px', border: `1px solid ${active ? RED : '#e0e0e0'}`, background: active ? RED : '#fff',
      borderRadius: 20, cursor: 'pointer', fontSize: '.8rem', fontWeight: 600, color: active ? '#fff' : '#666',
    }}>
      {label}
      {count != null && <span style={{ marginLeft: 6, background: active ? 'rgba(255,255,255,.25)' : 'rgba(0,0,0,.12)', borderRadius: 10, padding: '1px 7px', fontSize: '.7rem' }}>{count}</span>}
    </button>
  );
}

// ---------- cabecalho ordenavel + filtro por coluna (padrao de /ajustes/alertas + caracteristicas) ----------
type SortKey = 'nf' | 'fornecedor' | 'natureza' | 'tipo' | 'emissao' | 'total' | 'itens' | 'sinal' | 'responsavel';
const COLS_RECEB: { key: SortKey; label: string; num?: boolean; flex: number; min: number }[] = [
  { key: 'nf', label: 'NF', flex: 1.2, min: 100 },
  { key: 'fornecedor', label: 'Fornecedor', flex: 2.4, min: 170 },
  { key: 'natureza', label: 'Natureza', flex: 2.2, min: 150 },
  { key: 'tipo', label: 'Tipo', flex: 1, min: 95 },
  { key: 'emissao', label: 'Emissao', flex: 1, min: 90 },
  { key: 'total', label: 'Total', num: true, flex: 1, min: 95 },
  { key: 'itens', label: 'Itens', num: true, flex: 0.7, min: 60 },
  { key: 'sinal', label: 'Sinal', flex: 1, min: 90 },
  { key: 'responsavel', label: 'Responsavel', flex: 1.8, min: 150 },
];
// grid COMPARTILHADO entre o cabecalho e a linha principal de cada card (alinhamento).
const GRID_RECEB = COLS_RECEB.map((c) => `minmax(${c.min}px, ${c.flex}fr)`).join(' ');
const MINW_RECEB = COLS_RECEB.reduce((s, c) => s + c.min, 0); // largura minima p/ scroll horizontal
const ROW_PAD_X = 12; // padding lateral igual no header e nos cards (p/ as trilhas baterem)

// data de emissao (DD/MM/AAAA ou ISO) -> epoch ms para ordenar
function tsEmissao(s: string | null | undefined): number {
  if (!s) return 0;
  const str = String(s);
  if (str.includes('/')) { const p = str.split('/'); if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]).getTime(); }
  const d = new Date(str);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

// texto de uma coluna (p/ filtro/exibicao)
function valTexto(r: Recebimento, key: SortKey): string {
  switch (key) {
    case 'nf': return `${r.numeroNFe || ''}${r.serieNFe ? '/' + r.serieNFe : ''}`;
    case 'fornecedor': return r.fornecedorNome || '';
    case 'natureza': return r.naturezaOperacao || '';
    case 'tipo': return r.tipo ? (TIPO_LABEL[r.tipo] || r.tipo) : '';
    case 'emissao': return r.dataEmissao || '';
    case 'total': return r.valorNFe != null ? String(r.valorNFe) : '';
    case 'itens': return String((r.itens || []).length);
    case 'sinal': return r.temSinalGarantia ? (r.sinal === 'natureza' ? 'garantia (natureza)' : 'garantia (cfop)') : '';
    case 'responsavel': return r.responsavelNome || '';
  }
}
// valor de ordenacao (numero p/ colunas num/emissao, senao string)
function valSort(r: Recebimento, key: SortKey): number | string {
  if (key === 'total') return r.valorNFe ?? 0;
  if (key === 'itens') return (r.itens || []).length;
  if (key === 'emissao') return tsEmissao(r.dataEmissao);
  return valTexto(r, key).toLowerCase();
}
// filtro por coluna: termo so-digitos exige igualdade EXATA (num); senao substring.
function casaFiltroColuna(valorCelula: string, termo: string): boolean {
  const t = termo.trim().toLowerCase();
  if (!t) return true;
  const v = String(valorCelula).toLowerCase();
  if (/^\d+$/.test(t)) return v === t || v.replace(/\D/g, '') === t;
  return v.includes(t);
}

const thSortStyle: React.CSSProperties = { ...thStyle, cursor: 'pointer', userSelect: 'none' };
const thFiltroStyle: React.CSSProperties = { background: '#fff', padding: '4px 8px', borderBottom: '1px solid #e2e8f0' };
const filtroInput: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.7rem', boxSizing: 'border-box' };

export default function RecebimentosPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  // janela padrão: pendentes desde 01/11/2022 (o cache guarda o histórico; só o recente
  // é recomputado diariamente pelo cron). O usuário pode estreitar a janela nos filtros.
  const [de, setDe] = useState('2022-11-01');
  const [ate, setAte] = useState(isoDefault(0));
  const [dados, setDados] = useState<RecebPayload | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [erro, setErro] = useState('');
  const [resultados, setResultados] = useState<Record<string, ResultadoCard>>({});
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  // atalhos rápidos de filtro (client-side)
  const [tipoFiltro, setTipoFiltro] = useState('');
  const [respFiltro, setRespFiltro] = useState<'todas' | 'me' | '__nenhum__'>('todas');
  const [soGarantia, setSoGarantia] = useState(false);

  // ordenacao/filtro por coluna (nivel NF)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 } | null>(null);
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  // mostrar/esconder a descricao dos produtos (default: compacto). Lembra no localStorage.
  const [mostrarProdutos, setMostrarProdutos] = useState(false);
  useEffect(() => {
    try { if (localStorage.getItem('receb-mostrar-produtos') === '1') setMostrarProdutos(true); } catch { /* ignore */ }
  }, []);
  const toggleProdutos = useCallback(() => {
    setMostrarProdutos((v) => { const n = !v; try { localStorage.setItem('receb-mostrar-produtos', n ? '1' : '0'); } catch { /* ignore */ } return n; });
  }, []);
  const ordenarPor = useCallback((key: SortKey) => {
    setSort((s) => (s && s.key === key ? { key, dir: (s.dir === 1 ? -1 : 1) as 1 | -1 } : { key, dir: 1 }));
  }, []);
  const temFiltro = Object.values(filtros).some((v) => v && v.trim());
  // atalhos rápidos (chips/toggle) — filtro client-side sobre o payload já carregado
  const temAtalho = !!tipoFiltro || respFiltro !== 'todas' || soGarantia;
  const contagens = useMemo(() => {
    const recs = dados?.recebimentos || [];
    const porTipo: Record<string, number> = {};
    let garantia = 0;
    for (const r of recs) {
      const t = r.tipo || '';
      if (t) porTipo[t] = (porTipo[t] || 0) + 1;
      if (r.temSinalGarantia) garantia++;
    }
    return { total: recs.length, porTipo, garantia };
  }, [dados]);

  // modal "dar entrada"
  const [modalReceb, setModalReceb] = useState<Recebimento | null>(null);

  // carrega usuarios reais do Portal (financeiro_usu) p/ atribuir/transferir
  useEffect(() => {
    supabase
      .from('financeiro_usu')
      .select('id,nome,funcao')
      .eq('ativo', true)
      .order('nome')
      .then(({ data }) => setUsuarios((data as Usuario[]) || []));
  }, []);

  const buscar = useCallback(async (force: boolean) => {
    if (!conta) return;
    setCarregando(true);
    setErro('');
    setStatusMsg('buscando recebimentos no Omie... (pode levar 1-2 min)');
    try {
      let qs = contaParam.replace(/^&/, '');
      if (de) qs += (qs ? '&' : '') + 'de=' + encodeURIComponent(de);
      if (ate) qs += '&ate=' + encodeURIComponent(ate);
      if (force) qs += '&force=1';
      const r = await fetch(`/api/ajustes/recebimentos-pendentes?${qs}`);
      // A resposta pode NAO ser JSON: numa carga fria/force o calculo ao vivo (~1-2 min)
      // pode estourar o timeout do proxy do Railway, que devolve "upstream error" (texto).
      // O calculo continua rodando no servidor e grava o snapshot; o proximo Buscar pega do cache.
      const txt = await r.text();
      let d: RecebPayload;
      try { d = JSON.parse(txt) as RecebPayload; }
      catch {
        setErro('O servidor esta reprocessando os recebimentos na Omie (pode levar 1-2 min na primeira vez). O calculo continua em segundo plano — aguarde alguns segundos e clique em Buscar de novo.');
        setStatusMsg('');
        return;
      }
      if (!r.ok || d.erro) { setErro(d.erro || `Erro ${r.status} ao buscar recebimentos.`); setStatusMsg(''); return; }
      setResultados({});
      setDados(d);
      const fonte = d.fonte === 'cache' ? `cache de ${d.cachedEm ? new Date(d.cachedEm).toLocaleTimeString('pt-BR') : '?'}` : 'consulta ao vivo';
      const dur = d.duracaoMs ? ` · ${(d.duracaoMs / 1000).toFixed(1)}s` : '';
      setStatusMsg(`Janela emissao ${d.dataDeBR || '?'} a ${d.dataAteBR || '?'} · ${fonte}${dur}`);
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
      setStatusMsg('');
    } finally {
      setCarregando(false);
    }
  }, [conta, contaParam, de, ate]);

  useEffect(() => {
    if (conta) buscar(false);
    else { setDados(null); setStatusMsg(''); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);

  const onEntradaConcluida = useCallback((reck: string, res: ResultadoCard) => {
    setResultados((s) => ({ ...s, [reck]: res }));
  }, []);

  // transferencia de responsavel (persiste em recebimento_meta + atualiza UI)
  const onResponsavelChange = useCallback(async (r: Recebimento, userId: string | null) => {
    if (!conta || r.idReceb == null) return;
    const u = userId ? usuarios.find((x) => x.id === userId) || null : null;
    const nome = u ? u.nome : null;
    // otimista
    setDados((d) => {
      if (!d) return d;
      const recs = (d.recebimentos || []).map((x) =>
        x.idReceb === r.idReceb ? { ...x, responsavelUserId: userId, responsavelNome: nome, responsavelAutomatico: false } : x,
      );
      return { ...d, recebimentos: recs };
    });
    try {
      await fetch(`/api/ajustes/recebimentos/${r.idReceb}/responsavel?conta=${encodeURIComponent(conta)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, userNome: nome }),
      });
    } catch { /* silencioso: a UI ja atualizou; recarregar reflete o estado real */ }
  }, [conta, usuarios]);

  if (!permLoading && userProfile && !pode('estoque', 'recebimentos') && !pode('ajustes', 'recebimentos')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Recebimentos de NF-e pendentes</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 760 }}>
            Conta <b>{conta ? conta.toUpperCase() : '—'}</b> · NFs de fornecedor que ainda nao foram processadas. As com sinal de garantia/conserto aparecem destacadas, com o impacto no CMC. Voce pode <b>dar entrada</b> (= processar no Omie: gera estoque e contas a pagar) por aqui.
          </p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Emissao de</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar(false)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ate</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && buscar(false)} style={{ border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' }} />
          </div>
          <button onClick={() => buscar(false)} disabled={carregando || !conta} style={{ padding: '7px 14px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>Buscar</button>
          <ContaSelector />
        </div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Estoque</Link>
      </div>

      {conta === '' ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          Esta tela precisa de uma conta especifica para listar os recebimentos. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          {/* Atalhos rápidos: chips por tipo */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            {TIPOS_CHIP.map((t) => (
              <Chip key={t.v} label={t.label} active={tipoFiltro === t.v}
                count={t.v === '' ? contagens.total : (contagens.porTipo[t.v] || 0)}
                onClick={() => setTipoFiltro(t.v)} />
            ))}
          </div>
          {/* Toggle responsável + chip garantia */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <Toggle value={respFiltro} onChange={(v) => setRespFiltro(v as typeof respFiltro)}
              options={[{ v: 'todas', l: 'Todas' }, { v: 'me', l: 'Minhas' }, { v: '__nenhum__', l: 'Sem responsável' }]} />
            <Chip label="Garantia" active={soGarantia} count={contagens.garantia} onClick={() => setSoGarantia((s) => !s)} />
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 14, fontSize: '.72rem' }}>
            <span style={{ padding: '3px 8px', borderRadius: 6, background: '#f1f5f9', border: '1px solid #e2e8f0', color: '#475569' }}>Detecta natureza ~ garantia/conserto/reparo e CFOPs de garantia</span>
            <button onClick={toggleProdutos} title="Mostra/esconde a descricao dos produtos em cada NF"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: mostrarProdutos ? '#eef2ff' : '#fff', color: '#334155', cursor: 'pointer', fontSize: '.72rem' }}>
              {mostrarProdutos ? '▾ Esconder produtos' : '▸ Mostrar produtos'}
            </button>
            {temFiltro && (
              <button onClick={() => setFiltros({})} style={{ padding: '3px 10px', borderRadius: 6, border: '1px solid #fecaca', background: '#fef2f2', color: '#dc2626', cursor: 'pointer', fontSize: '.72rem' }}>limpar filtros</button>
            )}
            <span style={{ marginLeft: 'auto', color: '#64748b' }}>{carregando ? 'Carregando…' : statusMsg}</span>
          </div>

          {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>{erro}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12, marginBottom: 18 }}>
            <Kpi label="Recebimentos no periodo" valor={fmtNum(dados?.totalRecebimentos)} />
            <Kpi label="Pendentes (nao processados)" valor={fmtNum(dados?.totalNaoProcessados)} />
            <Kpi label="Com sinal de garantia" valor={fmtNum(dados?.totalComSinalGarantia)} cor="#b45309" />
            <Kpi label="Itens que vao baixar o CMC" valor={fmtNum(dados?.totalItensRisco)} cor="#b91c1c" />
          </div>

          {!dados ? (
            <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 40, textAlign: 'center', color: '#94a3b8' }}>Clique em <b>Buscar</b> para listar os recebimentos pendentes.</div>
          ) : (
            <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
              <CabecalhoReceb
                sort={sort}
                filtros={filtros}
                onSort={ordenarPor}
                onFiltro={(k, v) => setFiltros((f) => ({ ...f, [k]: v }))}
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {(() => {
                  let lista = (dados.recebimentos || []).filter((r) => {
                    if (tipoFiltro && (r.tipo || '') !== tipoFiltro) return false;
                    if (respFiltro === 'me' && !(userProfile?.id && r.responsavelUserId === userProfile.id)) return false;
                    if (respFiltro === '__nenhum__' && r.responsavelUserId) return false;
                    if (soGarantia && !r.temSinalGarantia) return false;
                    return true;
                  });
                  const ativos = COLS_RECEB.filter((c) => (filtros[c.key] || '').trim());
                  if (ativos.length) {
                    lista = lista.filter((r) => ativos.every((c) => casaFiltroColuna(valTexto(r, c.key), filtros[c.key])));
                  }
                  if (sort) {
                    const { key, dir } = sort;
                    lista = [...lista].sort((a, b) => {
                      const va = valSort(a, key), vb = valSort(b, key);
                      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
                      return String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' }) * dir;
                    });
                  }
                  if (lista.length === 0) {
                    return <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 40, textAlign: 'center', color: (temFiltro || temAtalho) ? '#b45309' : '#059669' }}>{temFiltro ? 'Nenhuma NF-e bate com os filtros. Use "limpar filtros".' : (temAtalho ? 'Nenhuma NF-e bate com os atalhos selecionados.' : 'Nenhuma NF-e pendente nesse periodo. 🎉')}</div>;
                  }
                  return lista.map((r) => (
                    <CardReceb
                      key={recKey(r)}
                      r={r}
                      conta={conta}
                      resultado={resultados[recKey(r)]}
                      usuarios={usuarios}
                      mostrarProdutos={mostrarProdutos}
                      onAbrir={() => setModalReceb(r)}
                      onResponsavelChange={(uid) => onResponsavelChange(r, uid)}
                    />
                  ));
                })()}
              </div>
            </div>
          )}

          {/* Rodape: "Atualizar" fica AQUI embaixo (nao no topo) p/ nao ser clicado sem querer,
              pois forca um recompute ao vivo na Omie (~1-2 min, ignora o cache). */}
          <div style={{ marginTop: 24, paddingTop: 14, borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => buscar(true)} disabled={carregando || !conta} title="Ignora o cache e recalcula tudo na Omie (demora)"
              style={{ padding: '7px 14px', background: '#fff', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando || !conta ? 0.5 : 1 }}>
              ↻ Atualizar (recalcular ao vivo)
            </button>
            <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>
              Recalcula tudo na Omie ignorando o cache — leva ~1-2 min. Use só quando precisar do estado mais recente; a lista normal já vem do cache.
            </span>
          </div>
        </>
      )}

      {modalReceb && conta && (
        <ModalEntrada
          r={modalReceb}
          conta={conta}
          criadoPor={criadoPor}
          userId={userProfile?.id || null}
          userNome={userProfile?.nome || null}
          onClose={() => setModalReceb(null)}
          onConcluido={onEntradaConcluida}
        />
      )}
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

// Cabecalho sticky sobre os cards: rotulos clicaveis (ordenar) + linha de filtros (AND).
// Nao alinha pixel a pixel com os cards (a lista sao cards, nao uma <table>): funciona
// como painel de ordenacao/filtro rotulado por campo, no estilo das tabelas de /ajustes.
function CabecalhoReceb({ sort, filtros, onSort, onFiltro }: {
  sort: { key: SortKey; dir: 1 | -1 } | null;
  filtros: Record<string, string>;
  onSort: (key: SortKey) => void;
  onFiltro: (key: SortKey, valor: string) => void;
}) {
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 20, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12, overflow: 'hidden', minWidth: MINW_RECEB + 2 * ROW_PAD_X }}>
      <div style={{ display: 'grid', gridTemplateColumns: GRID_RECEB, padding: `8px ${ROW_PAD_X}px 6px` }}>
        {COLS_RECEB.map((c) => {
          const ativo = sort?.key === c.key;
          return (
            <div key={c.key} onClick={() => onSort(c.key)} style={{ ...thSortStyle, background: 'transparent', border: 'none', padding: '0 6px', textAlign: c.num ? 'right' : 'left' }}
              title="Clique para ordenar">
              {c.label}{ativo ? (sort!.dir === 1 ? ' ▲' : ' ▼') : ''}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: GRID_RECEB, padding: `0 ${ROW_PAD_X}px 8px` }}>
        {COLS_RECEB.map((c) => (
          <div key={c.key} style={{ padding: '0 6px' }}>
            <input value={filtros[c.key] || ''} onChange={(e) => onFiltro(c.key, e.target.value)}
              placeholder={c.num ? '= exato' : 'filtrar…'} style={{ ...filtroInput, textAlign: c.num ? 'right' : 'left' }} />
          </div>
        ))}
      </div>
    </div>
  );
}

// Ações da NF-e do fornecedor: copiar chave, consultar na SEFAZ e ver DANFE (PDF).
// O DANFE vem via DfeDocs/ObterNfe (rota [id]/danfe): resolve nIdNfe pela chave ->
// cPdf. Só existe DEPOIS de concluir (pendente -> aviso "disponível após concluir").
function NotaFiscalAcoes({ chave, idReceb, conta }: { chave?: string | null; idReceb?: number | string | null; conta: string }) {
  const [carregando, setCarregando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const chaveDig = (chave || '').replace(/\D/g, '');
  const copiar = async () => {
    if (!chaveDig) return;
    try { await navigator.clipboard.writeText(chaveDig); setCopiado(true); setTimeout(() => setCopiado(false), 1500); } catch { /* ignore */ }
  };
  const consultarSefaz = async () => {
    await copiar();
    window.open('https://www.nfe.fazenda.gov.br/portal/consultaRecaptcha.aspx', '_blank', 'noopener');
  };
  const verDanfe = async () => {
    if (idReceb == null) return;
    setCarregando(true);
    try {
      const qs = `conta=${encodeURIComponent(conta)}${chaveDig ? `&chave=${chaveDig}` : ''}`;
      const r = await fetch(`/api/ajustes/recebimentos/${idReceb}/danfe?${qs}`);
      const d = await r.json();
      if (d.url) window.open(d.url, '_blank', 'noopener');
      else if (d.pendente) alert(d.msg || 'O DANFE fica disponível após concluir o recebimento.');
      else alert('Não foi possível abrir o DANFE: ' + (d.erro || 'erro'));
    } catch (ex) { alert('Erro ao buscar o DANFE: ' + (ex as Error).message); }
    finally { setCarregando(false); }
  };
  if (!chaveDig && idReceb == null) return null;
  const btn: React.CSSProperties = { padding: '3px 8px', fontSize: '.7rem', border: '1px solid #cbd5e1', borderRadius: 6, background: '#fff', color: '#334155', cursor: 'pointer', whiteSpace: 'nowrap' };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {chaveDig && <button type="button" onClick={copiar} title={`Chave: ${chaveDig}`} style={btn}>{copiado ? '✓ chave copiada' : 'copiar chave'}</button>}
      {chaveDig && <button type="button" onClick={consultarSefaz} title="Copia a chave e abre a consulta pública da SEFAZ" style={btn}>consultar (SEFAZ)</button>}
      <button type="button" onClick={verDanfe} disabled={carregando} style={{ ...btn, opacity: carregando ? 0.6 : 1, cursor: carregando ? 'wait' : 'pointer' }}>{carregando ? '…' : 'ver DANFE'}</button>
    </span>
  );
}

function CardReceb({ r, conta, resultado, usuarios, mostrarProdutos, onAbrir, onResponsavelChange }: {
  r: Recebimento; conta: string; resultado?: ResultadoCard; usuarios: Usuario[]; mostrarProdutos: boolean;
  onAbrir: () => void; onResponsavelChange: (userId: string | null) => void;
}) {
  const temSinal = !!r.temSinalGarantia;
  const borda = r.temItemRisco ? '#fca5a5' : (r.temItemNovo && temSinal ? '#fcd34d' : (temSinal ? '#fde68a' : '#e2e8f0'));
  const headerBg = r.temItemRisco ? '#fef2f2' : (temSinal ? '#fffbeb' : '#f8fafc');
  const concluido = resultado?.tipo === 'ok';
  const cell: React.CSSProperties = { padding: '0 6px', minWidth: 0, alignSelf: 'center' };
  const ellip: React.CSSProperties = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' };
  const sinalLabel = !temSinal ? '' : (r.sinal === 'natureza' ? 'natureza' : 'CFOP');
  return (
    <div style={{ background: '#fff', border: `1px solid ${borda}`, borderRadius: 8, overflow: 'hidden', opacity: concluido ? 0.65 : 1, minWidth: MINW_RECEB + 2 * ROW_PAD_X }}>
      <div style={{ background: headerBg, borderBottom: `1px solid ${borda}` }}>
        {/* linha ALINHADA com o cabeçalho (mesmo grid) */}
        <div style={{ display: 'grid', gridTemplateColumns: GRID_RECEB, alignItems: 'center', padding: `8px ${ROW_PAD_X}px`, gap: '2px 0' }}>
          <div style={cell}><span style={{ fontWeight: 600, color: '#1e293b', fontSize: '.8rem' }}>NF {r.numeroNFe || '?'}{r.serieNFe ? `/${r.serieNFe}` : ''}</span></div>
          <div style={cell} title={r.fornecedorNome || ''}><span style={{ ...ellip, fontSize: '.8rem', color: '#475569' }}>{r.fornecedorNome || ''}</span></div>
          <div style={cell} title={r.naturezaOperacao || ''}>
            {r.naturezaOperacao ? <span style={{ ...ellip, fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#e2e8f0', color: '#475569' }}>{r.naturezaOperacao}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
          </div>
          <div style={cell}>
            {r.tipo ? <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#fff', border: `1px solid ${TIPO_COR[r.tipo] || '#cbd5e1'}`, color: TIPO_COR[r.tipo] || '#475569', fontWeight: 600, whiteSpace: 'nowrap' }}>{TIPO_LABEL[r.tipo] || r.tipo}</span> : null}
          </div>
          <div style={{ ...cell, fontSize: '.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>{r.dataEmissao || ''}</div>
          <div style={{ ...cell, fontSize: '.78rem', color: '#334155', textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtBRL(r.valorNFe)}</div>
          <div style={{ ...cell, fontSize: '.75rem', color: '#64748b', textAlign: 'right' }}>{r.itens ? r.itens.length : 0}</div>
          <div style={cell}>
            {temSinal ? <span style={{ fontSize: '.68rem', padding: '2px 7px', borderRadius: 6, background: r.sinal === 'natureza' ? '#fef3c7' : '#dbeafe', color: r.sinal === 'natureza' ? '#92400e' : '#1e40af', whiteSpace: 'nowrap' }} title={r.sinal === 'natureza' ? 'sinal: natureza da operação' : 'sinal: CFOP de garantia'}>{sinalLabel}</span> : <span style={{ color: '#cbd5e1' }}>—</span>}
          </div>
          <div style={cell} title={r.responsavelAutomatico ? 'Responsável padrão (pelo tipo). Troque para transferir.' : 'Responsável (transferível)'}>
            <select
              value={r.responsavelUserId || ''}
              onChange={(e) => onResponsavelChange(e.target.value || null)}
              style={{ width: '100%', fontSize: '.72rem', border: '1px solid #cbd5e1', borderRadius: 6, padding: '3px 6px', background: '#fff', color: '#334155' }}
            >
              <option value="">(ninguém)</option>
              {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
            </select>
          </div>
        </div>
        {/* linha de AÇÕES (largura total): badges de risco + botões */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', padding: `0 ${ROW_PAD_X}px 8px` }}>
          {r.etapa && <span style={{ fontSize: '.68rem', color: '#94a3b8' }}>etapa {r.etapa}</span>}
          {r.temItemRisco ? (
            <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#dc2626', color: '#fff' }}>vai baixar o CMC{r.maiorImpactoPct ? ` (~${fmtPct(r.maiorImpactoPct)})` : ''}</span>
          ) : r.temItemNovo && temSinal ? (
            <span style={{ fontSize: '.7rem', padding: '2px 8px', borderRadius: 6, background: '#fde68a', color: '#92400e' }}>vai criar produto novo</span>
          ) : null}
          {r.responsavelAutomatico && r.responsavelUserId && <span style={{ fontSize: '.6rem', color: '#94a3b8' }}>resp. automático</span>}
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
            <NotaFiscalAcoes chave={r.chaveNFe} idReceb={r.idReceb} conta={conta} />
            {resultado ? (
              <span style={{ fontSize: '.72rem', color: resultado.tipo === 'ok' ? '#047857' : '#dc2626' }}>{resultado.texto}</span>
            ) : (
              <button onClick={onAbrir} style={{ padding: '5px 12px', fontSize: '.75rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Dar entrada...</button>
            )}
          </span>
        </div>
      </div>

      {mostrarProdutos && (temSinal ? (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={thStyle}>Produto</th>
                <th style={thStyle}>CFOP forn.</th>
                <th style={thStyle}>CFOP entrada (Omie)</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Qtd</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Custo unit.</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Saldo atual</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CMC atual</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>CMC projetado</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Impacto</th>
              </tr>
            </thead>
            <tbody>
              {(r.itens || []).map((it, idx) => {
                const novo = it.tipoItem === 'novo';
                const rowBg = it.alerta ? '#fef2f2' : (novo ? '#fffbeb' : undefined);
                const sug = it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop);
                const divergente = it.cfopEntrada && sug && String(it.cfopEntrada).replace(/\D/g, '') !== String(sug).replace(/\D/g, '');
                return (
                  <tr key={idx} style={{ background: rowBg, borderBottom: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}>
                      {it.descricaoProduto || it.codigoProdutoInt || ''}
                      {it.codigoProdutoInt && <span style={{ fontFamily: 'monospace', fontSize: '.7rem', color: '#94a3b8' }}> {it.codigoProdutoInt}</span>}
                      {novo ? <span style={{ marginLeft: 4, fontSize: '.62rem', padding: '1px 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>produto novo</span> : (it.idProduto ? <span style={{ fontFamily: 'monospace', fontSize: '.62rem', color: '#94a3b8' }}> #{it.idProduto}</span> : null)}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem', color: it.cfopEhGarantia ? '#b45309' : undefined, fontWeight: it.cfopEhGarantia ? 600 : undefined }}>{it.cfop || ''}</td>
                    <td style={{ ...tdStyle, fontFamily: 'monospace', fontSize: '.72rem' }}>
                      {it.cfopEntrada || <span style={{ color: '#cbd5e1' }}>(definido ao processar)</span>}
                      {divergente && <span style={{ color: '#dc2626', fontSize: '.62rem', marginLeft: 4 }} title={`O Omie puxaria ${it.cfopEntrada}, mas o equivalente da NF e' ${sug}`}>≠ {sug}</span>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtSaldo(it.qtde)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>{fmtBRL(it.precoUnit)}</td>
                    {novo ? (
                      <td style={{ ...tdStyle, textAlign: 'right', color: '#94a3b8' }} colSpan={4}>produto sera criado com CMC {fmtBRL(it.precoUnit)}</td>
                    ) : (
                      <>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{it.saldoAtual != null ? fmtSaldo(it.saldoAtual) : '?'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>{it.cmcAtual != null ? fmtBRL(it.cmcAtual) : '?'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', color: it.alerta ? '#b91c1c' : undefined, fontWeight: it.alerta ? 600 : undefined }}>{it.cmcProjetado != null ? fmtBRL(it.cmcProjetado) : '?'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontSize: '.72rem', color: it.alerta ? '#b91c1c' : '#64748b', fontWeight: it.alerta ? 600 : undefined }}>
                          {it.impactoCMC != null ? `${it.impactoCMC >= 0 ? '+' : ''}${fmtBRL(it.impactoCMC)}${it.impactoPct != null ? ` (${it.impactoPct >= 0 ? '+' : ''}${fmtPct(it.impactoPct)})` : ''}` : ''}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div style={{ padding: '8px 16px', fontSize: '.72rem', color: '#64748b' }}>
          {(r.itens || []).slice(0, 6).map((it) => `${it.descricaoProduto || it.codigoProdutoInt || '?'} (${fmtSaldo(it.qtde)} @ ${fmtBRL(it.precoUnit)})`).join(' · ') || '(sem itens)'}
          {(r.itens || []).length > 6 ? ` · +${(r.itens || []).length - 6} itens` : ''}
        </div>
      ))}
    </div>
  );
}

// itens que vao baixar o CMC (precisam de correcao apos a entrada)
function itensEmRisco(r: Recebimento): ItemReceb[] {
  return (r.itens || []).filter((it) => it.alerta && it.idProduto && (it.cmcAtual || 0) > 0);
}

// ---------- autocomplete de produto (p/ associar um item a um produto existente) ----------
// Reusa /api/ajustes/movimentacao/buscar-produto (tabela `produtos`, ja com fallback
// fuzzy p/ 1<->I<->l e 0<->O nos SKUs). `codigoProduto` = id interno do Omie.
function BuscaProduto({ conta, termoInicial, valor, onSelecionar, disabled }: {
  conta: string; termoInicial: string; valor: ProdutoSugestao | null;
  onSelecionar: (p: ProdutoSugestao | null) => void; disabled?: boolean;
}) {
  const [termo, setTermo] = useState(termoInicial);
  const [sugestoes, setSugestoes] = useState<ProdutoSugestao[]>([]);
  const [buscando, setBuscando] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [digitou, setDigitou] = useState(false);

  useEffect(() => {
    if (!digitou || !conta) return;
    const t = termo.trim();
    if (t.length < 2) { setSugestoes([]); setAberto(false); return; }
    const timer = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetch(`/api/ajustes/movimentacao/buscar-produto?conta=${encodeURIComponent(conta)}&termo=${encodeURIComponent(t)}`);
        const d = await r.json();
        setSugestoes(d.produtos || []);
        setAberto(true);
      } catch { /* silencioso */ } finally { setBuscando(false); }
    }, 300);
    return () => clearTimeout(timer);
  }, [termo, digitou, conta]);

  if (valor) {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: '.7rem', background: '#ecfdf5', border: '1px solid #a7f3d0', color: '#065f46', borderRadius: 4, padding: '2px 6px' }}>
          <b style={{ fontFamily: 'monospace' }}>{valor.codigo}</b> {valor.descricao}
          <span style={{ color: '#94a3b8', fontFamily: 'monospace' }}> #{valor.codigoProduto}</span>
          {valor.estoque != null && <span style={{ color: '#64748b' }}> · saldo {fmtSaldo(valor.estoque)}</span>}
        </span>
        {!disabled && (
          <button type="button" onClick={() => { onSelecionar(null); setTermo(termoInicial); setDigitou(false); }}
            style={{ background: 'none', border: 'none', color: '#dc2626', fontSize: '.65rem', textDecoration: 'underline', cursor: 'pointer' }}>trocar</button>
        )}
      </span>
    );
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <input
        type="text" value={termo} disabled={disabled}
        onChange={(e) => { setTermo(e.target.value); setDigitou(true); }}
        onFocus={() => { if (sugestoes.length) setAberto(true); }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        placeholder="SKU ou descricao do produto..."
        style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '3px 6px', width: 260, fontSize: '.72rem' }}
      />
      {buscando && <span style={{ fontSize: '.62rem', color: '#94a3b8', marginLeft: 4 }}>buscando…</span>}
      {aberto && sugestoes.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 60, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,.12)', maxHeight: 220, overflowY: 'auto', width: 340 }}>
          {sugestoes.map((p) => (
            <div key={p.codigoProduto} onMouseDown={() => { onSelecionar(p); setAberto(false); setDigitou(false); }}
              style={{ padding: '5px 8px', fontSize: '.7rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
              onMouseLeave={(e) => (e.currentTarget.style.background = '#fff')}>
              <b style={{ fontFamily: 'monospace' }}>{p.codigo}</b> — {p.descricao}
              <span style={{ color: '#94a3b8' }}> · saldo {fmtSaldo(p.estoque)}</span>
            </div>
          ))}
        </div>
      )}
      {aberto && !buscando && sugestoes.length === 0 && termo.trim().length >= 2 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 60, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.68rem', color: '#94a3b8', width: 340 }}>
          nenhum produto encontrado (a base local sincroniza por cron — produto criado hoje pode nao aparecer)
        </div>
      )}
    </span>
  );
}

// ---------- combobox de categoria (mais usadas primeiro + busca por nome) ----------
// Substitui o <select> simples: as opções chegam já ordenadas por uso (do backend);
// digitar filtra por código+descrição sobre a lista JÁ carregada (sem fetch por tecla).
function ComboCategoria({ value, options, onChange }: {
  value: string; options: OpcaoCat[]; onChange: (codigo: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [termo, setTermo] = useState('');
  const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const atual = options.find((c) => c.codigo === value) || null;
  const t = norm(termo.trim());
  const filtradas = t
    ? options.filter((c) => norm(`${c.codigo} ${c.descricao}`).includes(t))
    : options;
  // índice da 1ª sem uso: separa o bloco "mais usadas" do resto (só quando não filtrando).
  const corte = !t ? filtradas.findIndex((c) => !(c.uso && c.uso > 0)) : -1;
  const rotulo = atual ? `${atual.codigo} — ${atual.descricao}` : (value ? `${value} (atual)` : '');

  return (
    <span style={{ position: 'relative', display: 'block' }}>
      <input
        type="text"
        value={aberto ? termo : rotulo}
        placeholder={value ? rotulo : '(não classificar) — digite p/ buscar'}
        onFocus={() => { setTermo(''); setAberto(true); }}
        onChange={(e) => { setTermo(e.target.value); setAberto(true); }}
        onBlur={() => setTimeout(() => setAberto(false), 150)}
        style={{ ...selStyle, width: '100%', maxWidth: 'none' }}
      />
      {aberto && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60, background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6, boxShadow: '0 6px 18px rgba(0,0,0,.12)', maxHeight: 260, overflowY: 'auto' }}>
          <div onMouseDown={() => { onChange(''); setAberto(false); }}
            style={{ padding: '6px 8px', fontSize: '.72rem', cursor: 'pointer', color: '#64748b', borderBottom: '1px solid #f1f5f9' }}>
            (não classificar)
          </div>
          {filtradas.length === 0 && (
            <div style={{ padding: '6px 8px', fontSize: '.7rem', color: '#94a3b8' }}>nenhuma categoria encontrada</div>
          )}
          {filtradas.map((c, i) => (
            <Fragment key={c.codigo}>
              {i === 0 && corte !== 0 && (c.uso ?? 0) > 0 && (
                <div style={{ padding: '3px 8px', fontSize: '.6rem', color: '#b45309', background: '#fffbeb', textTransform: 'uppercase', letterSpacing: '.4px' }}>★ mais usadas</div>
              )}
              {corte > 0 && i === corte && (
                <div style={{ padding: '3px 8px', fontSize: '.6rem', color: '#94a3b8', background: '#f8fafc', textTransform: 'uppercase', letterSpacing: '.4px' }}>demais categorias</div>
              )}
              <div onMouseDown={() => { onChange(c.codigo); setAberto(false); }}
                style={{ padding: '5px 8px', fontSize: '.72rem', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', background: c.codigo === value ? '#eff6ff' : '#fff' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#f8fafc')}
                onMouseLeave={(e) => (e.currentTarget.style.background = c.codigo === value ? '#eff6ff' : '#fff')}>
                <b style={{ fontFamily: 'monospace' }}>{c.codigo}</b> — {c.descricao}
                {(c.uso ?? 0) > 0 && <span style={{ color: '#94a3b8' }}> · {c.uso}×</span>}
              </div>
            </Fragment>
          ))}
        </div>
      )}
    </span>
  );
}

// ---------- modal "dar entrada" ----------
// ---- datas: Omie usa DD/MM/AAAA; <input type=date> usa AAAA-MM-DD ----
function brToIso(s?: string | null): string {
  if (!s) return '';
  const p = String(s).split('/');
  if (p.length === 3) return `${p[2]}-${String(p[1]).padStart(2, '0')}-${String(p[0]).padStart(2, '0')}`;
  return String(s).slice(0, 10);
}
function isoToBR(s?: string | null): string {
  if (!s) return '';
  const p = String(s).slice(0, 10).split('-');
  if (p.length === 3) return `${p[2]}/${p[1]}/${p[0]}`;
  return String(s);
}
function hojeIso(): string { return new Date().toISOString().slice(0, 10); }
// tipos da seção financeira (Fase 3)
interface OpcaoCat { codigo: string; descricao: string; uso?: number }
interface OpcaoCC { codigo: number; descricao: string }
interface ParcelaEdit { dVenc: string; valor: number; pct: number } // dVenc em ISO

function ModalEntrada({ r, conta, criadoPor, userId, userNome, onClose, onConcluido }: {
  r: Recebimento; conta: string; criadoPor: string; userId: string | null; userNome: string | null;
  onClose: () => void; onConcluido: (reck: string, res: ResultadoCard) => void;
}) {
  const [naoFin, setNaoFin] = useState<boolean>(!!r.temSinalGarantia); // garantia: nao gera contas a pagar por padrao
  const [naoMov, setNaoMov] = useState<boolean>(false);

  // ---- Fase 3: Financeiro / Classificacao (categoria/conta/data + obs + parcelas) ----
  const [categorias, setCategorias] = useState<OpcaoCat[]>([]);
  const [contasCC, setContasCC] = useState<OpcaoCC[]>([]);
  const [categoria, setCategoria] = useState('');       // cCategCompra
  const [contaCC, setContaCC] = useState('');           // nIdConta (string)
  const [dataReg, setDataReg] = useState('');           // ISO
  const [obs, setObs] = useState('');
  const [obsTouched, setObsTouched] = useState(false);
  const [cCodParcela, setCCodParcela] = useState('999');
  const [parcelas, setParcelas] = useState<ParcelaEdit[]>([]);
  const [parcelasTouched, setParcelasTouched] = useState(false);
  const [finCarregando, setFinCarregando] = useState(false);
  const totalNFe = Number(r.valorNFe) || 0;
  // CFOP de entrada editavel por item. Default = o CFOP que a Omie puxaria (it.cfopEntrada),
  // que e' garantidamente CADASTRADO na Omie; cai para o equivalente calculado da NF so' quando
  // a Omie nao trouxe nenhum. Evita o erro "CFOP nao cadastrada [X]" do equivalente calculado.
  const [cfops, setCfops] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    (r.itens || []).forEach((it, i) => { init[i] = it.cfopEntrada || it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop) || ''; });
    return init;
  });
  // mapa aprendido CFOP-saida(fornecedor) -> CFOP-entrada (prioridade 2, quando a Omie
  // nao trouxe cfopEntrada) + quais linhas vieram do mapa (p/ o selo "padrao aprendido").
  const [cfopDeMapa, setCfopDeMapa] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!conta) return;
    let cancel = false;
    (async () => {
      try {
        const d = await fetch(`/api/ajustes/recebimentos/cfop-map?conta=${encodeURIComponent(conta)}`).then((x) => x.json());
        const mapa = (d?.mapa || {}) as Record<string, string>;
        if (cancel || !mapa || Object.keys(mapa).length === 0) return;
        setCfops((atual) => {
          const novo = { ...atual };
          const vindos = new Set<number>();
          (r.itens || []).forEach((it, i) => {
            if (it.cfopEntrada) return; // Omie ja forneceu (prioridade 1) — nao mexe
            const fallback = it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop) || '';
            const saidaDig = String(it.cfop || '').replace(/\D/g, '');
            const ncmDig = String(it.ncm || '').replace(/\D/g, '');
            // prioriza o aprendido POR NCM (desambigua: mesmo CFOP saída → entradas diferentes); fallback só por saída
            const aprendido = mapa[`${ncmDig}|${saidaDig}`] || mapa[`|${saidaDig}`];
            // so' aplica se o usuario ainda nao editou (valor == fallback calculado)
            if (aprendido && (atual[i] || '') === fallback) { novo[i] = aprendido; vindos.add(i); }
          });
          if (vindos.size > 0) setCfopDeMapa(vindos);
          return novo;
        });
      } catch { /* silencioso */ }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta]);
  const [enviando, setEnviando] = useState(false);
  const [statusModal, setStatusModal] = useState('');

  // itens que o Omie criaria como produto NOVO: o usuario decide novo/associar/ignorar
  const [acoes, setAcoes] = useState<Record<number, AcaoItem>>({});
  const [assoc, setAssoc] = useState<Record<number, ProdutoSugestao | null>>({});
  // acao por item: para produto NOVO o usuario escolhe novo/associar/ignorar; para produto
  // EXISTENTE o padrao e' 'novo' (=EDITAR) mas tambem pode ser 'ignorar' (checkbox).
  const acaoDe = (_it: ItemReceb, i: number): AcaoItem => acoes[i] || 'novo';

  // 2a fase: correcao do CMC distorcido por garantia
  const [fase, setFase] = useState<'entrada' | 'correcao'>('entrada');
  // itens associados a um produto existente que baixaram o CMC entram na correcao
  // junto com os de garantia (o backend projeta o impacto ANTES de concluir).
  const [riscosExtra, setRiscosExtra] = useState<ItemReceb[]>([]);
  const riscosBase = useMemo(() => itensEmRisco(r), [r]);
  const riscos = useMemo(() => [...riscosBase, ...riscosExtra], [riscosBase, riscosExtra]);
  const [cmcAlvo, setCmcAlvo] = useState<Record<number, string>>(() => {
    const init: Record<number, string> = {};
    riscos.forEach((it, i) => { init[i] = String(it.cmcAtual ?? ''); });
    return init;
  });
  const [corrResult, setCorrResult] = useState<Record<number, ResultadoCard>>({});
  const [corrigindo, setCorrigindo] = useState(false);
  // custo real sugerido por produto (busca sob demanda ao abrir a correcao); pre-preenche
  // o "CMC a restaurar" com o custo ANTES da distorcao (nao o CMC imediato anterior).
  const [sugestoes, setSugestoes] = useState<Record<string, SugestaoCusto>>({});
  const [carregandoSug, setCarregandoSug] = useState(false);
  const editouAlvo = useRef<Set<number>>(new Set()); // linhas onde o usuario digitou manualmente

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // prefill da seção Financeiro ao abrir: dropdowns (categorias/contas) + o que a NF já traz
  // (categoria/conta/data/parcelas do XML, via ConsultarRecebimento).
  useEffect(() => {
    if (!conta || r.idReceb == null) return;
    let cancel = false;
    (async () => {
      setFinCarregando(true);
      try {
        const [cats, ccs, fin] = await Promise.all([
          fetch(`/api/ajustes/categorias?conta=${encodeURIComponent(conta)}&comUso=1`).then((x) => x.json()).catch(() => ({})),
          fetch(`/api/ajustes/contas-correntes?conta=${encodeURIComponent(conta)}`).then((x) => x.json()).catch(() => ({})),
          fetch(`/api/ajustes/recebimentos/${r.idReceb}/financeiro?conta=${encodeURIComponent(conta)}`).then((x) => x.json()).catch(() => ({})),
        ]);
        if (cancel) return;
        setCategorias((cats.categorias || []) as OpcaoCat[]);
        setContasCC((ccs.contasCorrentes || []) as OpcaoCC[]);
        if (fin && !fin.erro) {
          if (fin.categoria) setCategoria(String(fin.categoria));
          if (fin.nIdConta != null) setContaCC(String(fin.nIdConta));
          setDataReg(fin.dRegistro ? brToIso(fin.dRegistro) : (r.dataEmissao ? brToIso(r.dataEmissao) : hojeIso()));
          if (fin.parcelas) {
            setCCodParcela(fin.parcelas.cCodParcela || '999');
            setParcelas((fin.parcelas.lista || []).map((p: { dVencimento?: string; vParcela?: number; pParcela?: number }) => ({
              dVenc: brToIso(p.dVencimento), valor: Number(p.vParcela) || 0, pct: Number(p.pParcela) || 0,
            })));
          }
        } else if (!fin?.dRegistro) {
          setDataReg(r.dataEmissao ? brToIso(r.dataEmissao) : hojeIso());
        }
      } finally { if (!cancel) setFinCarregando(false); }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, r.idReceb]);

  // helpers de parcelas
  const refazerParcelas = (n: number) => {
    setParcelasTouched(true);
    const qtd = Math.max(1, Math.min(36, Math.floor(n) || 1));
    const base = totalNFe / qtd;
    const arr: ParcelaEdit[] = [];
    let acc = 0;
    const d0 = parcelas[0]?.dVenc || dataReg || hojeIso();
    for (let i = 0; i < qtd; i++) {
      const valor = i === qtd - 1 ? Math.round((totalNFe - acc) * 100) / 100 : Math.round(base * 100) / 100;
      acc += valor;
      const d = new Date(d0); d.setMonth(d.getMonth() + i);
      arr.push({ dVenc: isNaN(d.getTime()) ? d0 : d.toISOString().slice(0, 10), valor, pct: totalNFe > 0 ? Math.round((valor / totalNFe) * 1e5) / 1e3 : 0 });
    }
    setParcelas(arr);
  };
  const setParcelaCampo = (i: number, campo: 'dVenc' | 'valor', v: string) => {
    setParcelasTouched(true);
    setParcelas((ps) => ps.map((p, idx) => idx === i ? {
      ...p,
      dVenc: campo === 'dVenc' ? v : p.dVenc,
      valor: campo === 'valor' ? (Number(v) || 0) : p.valor,
      pct: campo === 'valor' && totalNFe > 0 ? Math.round(((Number(v) || 0) / totalNFe) * 1e5) / 1e3 : p.pct,
    } : p));
  };
  const somaParcelas = parcelas.reduce((s, p) => s + (Number(p.valor) || 0), 0);
  const parcelasDivergem = parcelas.length > 0 && Math.abs(somaParcelas - totalNFe) > 0.01;

  // ao entrar na fase de correcao, busca o custo REAL de cada item em risco e
  // pre-preenche o alvo (so onde o usuario ainda nao editou).
  useEffect(() => {
    if (fase !== 'correcao' || riscos.length === 0) return;
    let cancel = false;
    (async () => {
      setCarregandoSug(true);
      try {
        const resp = await fetch(`/api/ajustes/recebimentos/sugerir-custo?conta=${encodeURIComponent(conta)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conta, itens: riscos.map((it) => ({ codigoProduto: it.idProduto, cmcAtual: it.cmcAtual })) }),
        });
        const d = await resp.json();
        if (cancel) return;
        const map = (d.sugestoes || {}) as Record<string, SugestaoCusto>;
        setSugestoes(map);
        setCmcAlvo((prev) => {
          const novo = { ...prev };
          riscos.forEach((it, i) => {
            if (editouAlvo.current.has(i)) return;
            const s = map[String(it.idProduto)];
            if (s && s.cmcSugerido != null && Number(s.cmcSugerido) > 0) novo[i] = String(s.cmcSugerido);
          });
          return novo;
        });
      } catch { /* mantem o default (cmcAtual) */ }
      finally { if (!cancel) setCarregandoSug(false); }
    })();
    return () => { cancel = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  const usarOmie = () => {
    const novo: Record<number, string> = {};
    (r.itens || []).forEach((it, i) => { novo[i] = it.cfopEntrada || ''; });
    setCfops(novo);
  };
  // aplica o EQUIVALENTE calculado da NF (5->1/6->2) em todos os itens (pode nao estar cadastrado)
  const usarEquivalente = () => {
    const novo: Record<number, string> = {};
    (r.itens || []).forEach((it, i) => { novo[i] = it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop) || ''; });
    setCfops(novo);
  };

  const confirmar = async () => {
    // valida os itens marcados p/ associar (produto obrigatorio)
    const semProduto = (r.itens || []).findIndex((it, i) => it.criarNovo && acaoDe(it, i) === 'associar' && !assoc[i]);
    if (semProduto >= 0) {
      alert(`Escolha o produto para associar no item "${(r.itens || [])[semProduto].descricaoProduto || (r.itens || [])[semProduto].codigoProdutoInt || semProduto + 1}" (ou volte para "criar novo").`);
      return;
    }
    const itens = (r.itens || []).map((it, i) => {
      const seq = it.nSequencia;
      const cfop = (cfops[i] || '').trim();
      const acao = acaoDe(it, i);
      const p = acao === 'associar' ? assoc[i] : null;
      return {
        nSequencia: (seq == null || seq === '' ? null : (isNaN(Number(seq)) ? seq : Number(seq))),
        // 'NOVO' nao e' acao valida no Omie: o item ja vem com cAdicionarNovo='S' e o
        // produto e' criado ao concluir. Aqui so' EDITAR (leva o CFOP) ou IGNORAR.
        cAcao: acao === 'ignorar' ? 'IGNORAR' : 'EDITAR',
        cfopEntrada: cfop || undefined,
        cfopForn: it.cfop || undefined, // p/ aprender o mapa saída→entrada
        ncm: it.ncm || undefined,       // desambigua o CFOP de entrada por NCM
        associarIdProduto: p ? p.codigoProduto : undefined,
        qtde: p ? it.qtde : undefined,
        precoUnit: p ? it.precoUnit : undefined,
        descricaoProduto: p ? `${p.codigo} — ${p.descricao}` : undefined,
      };
    });
    // Fase 3: financeiro/classificacao (cabecalho). infoAdicionais e' all-or-nothing.
    const dataRegBR = dataReg ? isoToBR(dataReg) : '';
    let infoAdicionais: { cCategCompra: string; nIdConta: number; dRegistro: string } | undefined;
    if (categoria) {
      if (!contaCC || !dataRegBR) { alert('Para classificar a NF, informe categoria + conta corrente + data de registro (os três juntos), ou deixe a categoria em branco.'); return; }
      infoAdicionais = { cCategCompra: categoria, nIdConta: Number(contaCC), dRegistro: dataRegBR };
    }
    const parcelasPayload = (parcelasTouched && parcelas.length > 0) ? {
      cCodParcela, nQtdParcela: parcelas.length,
      lista: parcelas.map((p, i) => ({ dVencimento: isoToBR(p.dVenc), nSequencia: i + 1, pParcela: Number(p.pct) || 0, vParcela: Number(p.valor) || 0 })),
    } : undefined;
    if (parcelasPayload && parcelasDivergem) { alert(`A soma das parcelas (${fmtBRL(somaParcelas)}) difere do total da NF (${fmtBRL(totalNFe)}). Ajuste antes de continuar.`); return; }
    const observacoesPayload = obsTouched ? obs : undefined;

    const assocTxt = (r.itens || [])
      .map((it, i) => (it.criarNovo && acaoDe(it, i) === 'associar' && assoc[i] ? `\n  · "${it.descricaoProduto || it.codigoProdutoInt}" → ${assoc[i]!.codigo} ${assoc[i]!.descricao}` : ''))
      .join('');
    const ignTxt = (r.itens || []).filter((it, i) => acaoDe(it, i) === 'ignorar').length;
    if (!confirm(
      `Confirmar entrada da NF ${r.numeroNFe || '?'}?\n\nIsso PROCESSA a NF no Omie${naoFin ? ', SEM gerar contas a pagar' : ''}${naoMov ? ', SEM movimentar estoque' : ''}.`
      + (assocTxt ? `\n\nItens que serao ASSOCIADOS a produtos existentes (so' da p/ desfazer revertendo o recebimento):${assocTxt}` : '')
      + (ignTxt ? `\n\n${ignTxt} item(ns) serao IGNORADOS.` : '')
      + '\n\nContinuar?',
    )) return;
    setEnviando(true);
    setStatusModal('processando no Omie...');
    try {
      const resp = await fetch('/api/ajustes/dar-entrada-recebimento', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conta, idReceb: r.idReceb, chaveNFe: r.chaveNFe,
          itens, naoGerarFinanceiro: naoFin, naoGerarMovEstoque: naoMov,
          infoAdicionais, observacoes: observacoesPayload, parcelas: parcelasPayload,
          criadoPor, userId, userNome, tipo: r.tipo, numeroNFe: r.numeroNFe,
        }),
      });
      const d = await resp.json();
      if (d.ok) {
        // itens associados a um produto existente que derrubaram o CMC entram na
        // correcao junto com os de garantia (o card nao os tinha como "em risco",
        // porque na hora da analise eles ainda eram "produto novo").
        const extras: ItemReceb[] = ((d.associados || []) as AssociadoInfo[])
          .filter((a) => a.alerta && a.idProduto && (a.cmcAtual || 0) > 0)
          .map((a) => ({
            nSequencia: a.nSequencia, idProduto: a.idProduto,
            descricaoProduto: a.descricaoProduto || null, codigoProdutoInt: null,
            cmcAtual: a.cmcAtual, saldoAtual: a.saldoAtual, cmcProjetado: a.cmcProjetado,
            impactoCMC: a.impactoCMC, impactoPct: a.impactoPct, alerta: true,
            precoUnit: a.precoUnit ?? undefined, tipoItem: 'existente',
          }));
        if (extras.length > 0) {
          setRiscosExtra(extras);
          setCmcAlvo((s) => {
            const novo = { ...s };
            extras.forEach((e, i) => { novo[riscosBase.length + i] = String(e.cmcAtual ?? ''); });
            return novo;
          });
        }
        const cabecFalhou = d.cabec && d.cabec.ok === false;
        if (cabecFalhou) alert('A entrada foi processada, mas os campos financeiros (categoria/conta/data/parcelas) NÃO gravaram: ' + (d.cabec.erro || 'erro') + '\n\nAjuste direto na Omie se necessário.');
        onConcluido(recKey(r), { tipo: 'ok', texto: `✔ entrada processada${d.ajustado ? ' (com ajustes)' : ''}${cabecFalhou ? ' · ⚠ financeiro não gravou' : ''}${d.descStatus ? ' · ' + d.descStatus : ''}` });
        if (riscosBase.length + extras.length > 0) {
          // mantem o modal aberto p/ corrigir o CMC que acabou de baixar
          setEnviando(false);
          setStatusModal('entrada processada. Reveja a correção do custo abaixo.');
          setFase('correcao');
        } else {
          onClose();
        }
      } else {
        setEnviando(false);
        setStatusModal('');
        onConcluido(recKey(r), { tipo: 'erro', texto: d.erro || 'falhou' });
        // Erro comum da Omie: "CFOP nao cadastrada [X] ! - Tag: [cCFOPEntrada]" — o CFOP de entrada
        // (tipicamente o equivalente calculado) nao existe na tabela de CFOPs desta empresa na Omie.
        const mCfop = /CFOP\s+n[ãa]o\s+cadastrada\s*\[?\s*([\d.]+)/i.exec(String(d.erro || ''));
        if (mCfop) {
          alert(
            `A Omie recusou: o CFOP de entrada ${mCfop[1]} nao esta cadastrado nesta empresa.\n\n` +
            `Como resolver:\n` +
            `• clique em "usar o que a Omie puxaria" (CFOP ja cadastrado), ou\n` +
            `• edite o CFOP de entrada do item para um valido, ou deixe em branco (a Omie decide), ou\n` +
            `• cadastre o CFOP ${mCfop[1]} na Omie (Configuracoes > CFOP) e tente de novo.`,
          );
        } else {
          alert('Erro ao dar entrada: ' + (d.erro || 'falhou'));
        }
      }
    } catch (ex) {
      setEnviando(false);
      setStatusModal('erro de rede: ' + (ex as Error).message);
    }
  };

  const corrigirCustos = async () => {
    setCorrigindo(true);
    for (let i = 0; i < riscos.length; i++) {
      if (corrResult[i]?.tipo === 'ok') continue; // ja corrigido
      const it = riscos[i];
      const novoCMC = Number(cmcAlvo[i]);
      if (!(novoCMC > 0)) { setCorrResult((s) => ({ ...s, [i]: { tipo: 'erro', texto: 'CMC inválido' } })); continue; }
      setStatusModal(`corrigindo ${i + 1}/${riscos.length}: ${it.descricaoProduto || it.codigoProdutoInt || it.idProduto}...`);
      try {
        const resp = await fetch(`/api/ajustes/recebimentos/${r.idReceb}/corrigir-custo?conta=${encodeURIComponent(conta)}`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            codigoProduto: it.idProduto, novoCMC, cmcSugerido: novoCMC,
            cfopOrigem: it.cfop, nfOrigemNumero: r.numeroNFe, custoGarantiaUnit: it.precoUnit,
            origemCorrecao: 'garantia', criadoPor, userId, userNome, tipo: r.tipo, numeroNFe: r.numeroNFe,
            obs: `Entrada via integracao Portal por ${userNome || criadoPor}. CMC restaurado apos NF de garantia ${r.numeroNFe || ''}.`,
          }),
        });
        const d = await resp.json();
        if (d.ok) setCorrResult((s) => ({ ...s, [i]: { tipo: 'ok', texto: `✔ ${fmtBRL(d.cmcAnterior)} → ${fmtBRL(d.cmcAplicado)}${d.duplicado ? ' (já feito)' : ''}` } }));
        else setCorrResult((s) => ({ ...s, [i]: { tipo: 'erro', texto: d.erro || 'falhou' } }));
      } catch (ex) {
        setCorrResult((s) => ({ ...s, [i]: { tipo: 'erro', texto: (ex as Error).message } }));
      }
      if (i < riscos.length - 1) await new Promise((res) => setTimeout(res, 1000)); // throttle Omie
    }
    setCorrigindo(false);
    setStatusModal('correções concluídas.');
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 920, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Dar entrada na NF {r.numeroNFe || '?'}{r.serieNFe ? `/${r.serieNFe}` : ''} - {r.fornecedorNome || ''}</h2>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10, marginLeft: 'auto' }}>
            <NotaFiscalAcoes chave={r.chaveNFe} idReceb={r.idReceb} conta={conta} />
            <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
          </span>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.82rem' }}>
          {fase === 'entrada' && (<>
          <div style={{ fontSize: '.74rem', color: '#475569', marginBottom: 12 }}>
            Natureza: <b>{r.naturezaOperacao || '-'}</b> · etapa {r.etapa || '?'} · total {fmtBRL(r.valorNFe)}. Concluir essa NF processa ela no Omie (igual processar la).
          </div>
          {r.temSinalGarantia && (
            <div style={{ fontSize: '.74rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: 8, marginBottom: 12, color: '#92400e' }}>
              ⚠ <b>Sinal de garantia detectado</b> (CFOP/natureza). Default aplicado: <b>NAO gera contas a pagar</b>. Confira antes de confirmar.
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
            <label style={{ fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={naoFin} onChange={(e) => setNaoFin(e.target.checked)} />
              <b>Nao gerar contas a pagar</b> <span style={{ color: '#64748b' }}>(marque se a NF nao gera financeiro, ex.: garantia)</span>
            </label>
            <label style={{ fontSize: '.82rem', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={naoMov} onChange={(e) => setNaoMov(e.target.checked)} />
              <b>Nao movimentar estoque</b> <span style={{ color: '#64748b' }}>(marque se essa NF nao deve mexer no estoque)</span>
            </label>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 12, marginBottom: 14, background: '#f8fafc' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <h3 style={{ fontWeight: 600, color: '#334155', margin: 0, fontSize: '.82rem' }}>Financeiro / Classificação</h3>
              {finCarregando && <span style={{ fontSize: '.68rem', color: '#94a3b8' }}>carregando…</span>}
              <span style={{ fontSize: '.68rem', color: '#94a3b8' }}>(pré-preenchido com o que a NF traz; edite se precisar)</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 10 }}>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Categoria da compra
                <ComboCategoria value={categoria} options={categorias} onChange={setCategoria} />
              </label>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Conta corrente
                <select value={contaCC} onChange={(e) => setContaCC(e.target.value)} style={selStyle}>
                  <option value="">(padrão da Omie)</option>
                  {contaCC && !contasCC.some((c) => String(c.codigo) === contaCC) && <option value={contaCC}>conta {contaCC} (atual)</option>}
                  {contasCC.map((c) => <option key={c.codigo} value={String(c.codigo)}>{c.descricao}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Data de registro
                <input type="date" value={dataReg} onChange={(e) => setDataReg(e.target.value)} style={selStyle} />
              </label>
            </div>
            {categoria && (!contaCC || !dataReg) && (
              <div style={{ fontSize: '.68rem', color: '#b45309', marginBottom: 8 }}>⚠ Para classificar, a Omie exige categoria + conta corrente + data de registro juntas.</div>
            )}
            <label style={{ fontSize: '.72rem', color: '#475569', display: 'block', marginBottom: 10 }}>Observações
              <textarea value={obs} onChange={(e) => { setObs(e.target.value); setObsTouched(true); }} rows={2}
                placeholder="observações internas do recebimento…" style={{ ...selStyle, resize: 'vertical', fontFamily: 'inherit' }} />
            </label>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                <span style={{ fontSize: '.72rem', color: '#475569', fontWeight: 600 }}>Parcelas</span>
                <span style={{ fontSize: '.68rem', color: '#64748b' }}>nº</span>
                <input type="number" min={1} max={36} value={parcelas.length || 1} onChange={(e) => refazerParcelas(Number(e.target.value))}
                  style={{ width: 52, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.72rem' }} />
                <button type="button" onClick={() => refazerParcelas(parcelas.length || 1)}
                  style={{ fontSize: '.68rem', color: '#2563eb', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer' }}>refazer (dividir igual)</button>
                <span style={{ marginLeft: 'auto', fontSize: '.68rem', color: parcelasDivergem ? '#dc2626' : '#059669' }}>
                  soma {fmtBRL(somaParcelas)} / total {fmtBRL(totalNFe)}{parcelasDivergem ? ' ⚠' : ' ✓'}
                </span>
              </div>
              {parcelas.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {parcelas.map((p, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem' }}>
                      <span style={{ color: '#94a3b8', width: 18 }}>{i + 1}</span>
                      <input type="date" value={p.dVenc} onChange={(e) => setParcelaCampo(i, 'dVenc', e.target.value)}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.72rem' }} />
                      <input type="number" step="0.01" value={p.valor} onChange={(e) => setParcelaCampo(i, 'valor', e.target.value)}
                        style={{ width: 100, border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', fontSize: '.72rem', textAlign: 'right' }} />
                      <span style={{ color: '#94a3b8' }}>{p.pct ? p.pct.toFixed(2).replace('.', ',') + '%' : ''}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <h3 style={{ fontWeight: 600, color: '#334155', marginBottom: 4, fontSize: '.82rem' }}>CFOP de entrada por item</h3>
          <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 8 }}>
            Pre-preenchido com o CFOP que a <b>Omie puxaria</b> (garantidamente cadastrado). Edite se precisar. O equivalente calculado da NF (5→1/6→2) e' mais &quot;correto&quot;, mas pode nao estar cadastrado na Omie — se der erro de &quot;CFOP nao cadastrada&quot;, volte ao que a Omie puxaria ou deixe em branco.
            <button type="button" onClick={usarOmie} style={{ marginLeft: 6, color: '#2563eb', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: '.72rem' }}>usar o que a Omie puxaria</button>
            <button type="button" onClick={usarEquivalente} style={{ marginLeft: 8, color: '#2563eb', background: 'none', border: 'none', textDecoration: 'underline', cursor: 'pointer', fontSize: '.72rem' }}>usar o equivalente da NF</button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <thead>
                <tr>
                  <th style={mTh}>Produto</th>
                  <th style={mTh}>CFOP forn.</th>
                  <th style={mTh}>CFOP entrada (Omie puxaria)</th>
                  <th style={mTh}>CFOP de entrada (a usar)</th>
                  <th style={{ ...mTh, textAlign: 'right' }}>Qtd</th>
                  <th style={{ ...mTh, textAlign: 'right' }}>Custo unit.</th>
                </tr>
              </thead>
              <tbody>
                {(r.itens || []).map((it, i) => {
                  const acao = acaoDe(it, i);
                  const ignorado = acao === 'ignorar';
                  return (
                  <Fragment key={i}>
                  <tr style={ignorado ? { opacity: 0.5 } : undefined}>
                    <td style={mTd}>
                      {it.descricaoProduto || it.codigoProdutoInt || '?'}
                      {it.criarNovo ? <span style={{ marginLeft: 4, fontSize: '.6rem', padding: '0 5px', borderRadius: 4, background: '#fef3c7', color: '#92400e' }}>novo</span> : (it.idProduto ? <span style={{ fontFamily: 'monospace', fontSize: '.6rem', color: '#94a3b8' }}> #{it.idProduto}</span> : null)}
                      {!it.criarNovo && (
                        <label style={{ marginLeft: 8, fontSize: '.62rem', color: ignorado ? '#dc2626' : '#94a3b8', display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer' }} title="Deixa este item de fora do recebimento (não processa)">
                          <input type="checkbox" checked={ignorado} onChange={(e) => setAcoes((s) => ({ ...s, [i]: e.target.checked ? 'ignorar' : 'novo' }))} />
                          ignorar
                        </label>
                      )}
                    </td>
                    <td style={{ ...mTd, fontFamily: 'monospace' }}>{it.cfop || ''}</td>
                    <td style={{ ...mTd, fontFamily: 'monospace', color: '#64748b' }}>{it.cfopEntrada || '(ao processar)'}</td>
                    <td style={mTd}>
                      <input type="text" value={cfops[i] ?? ''} disabled={ignorado}
                        onChange={(e) => { setCfops((s) => ({ ...s, [i]: e.target.value })); setCfopDeMapa((m) => { if (!m.has(i)) return m; const n = new Set(m); n.delete(i); return n; }); }}
                        placeholder={it.cfopEntradaSugerido || cfopEntradaEquiv(it.cfop) || '1.949'}
                        style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', width: 90, fontFamily: 'monospace', fontSize: '.72rem' }} />
                      {cfopDeMapa.has(i) && <span title="CFOP de entrada que já foi aceito antes para este CFOP do fornecedor" style={{ marginLeft: 4, fontSize: '.58rem', padding: '1px 5px', borderRadius: 4, background: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0' }}>padrão aprendido</span>}
                    </td>
                    <td style={{ ...mTd, textAlign: 'right' }}>{fmtSaldo(it.qtde)}</td>
                    <td style={{ ...mTd, textAlign: 'right' }}>{fmtBRL(it.precoUnit)}</td>
                  </tr>
                  {it.criarNovo && (
                    <tr>
                      <td colSpan={6} style={{ ...mTd, background: '#fffbeb', paddingTop: 6, paddingBottom: 6 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: '.65rem', color: '#92400e', textTransform: 'uppercase', letterSpacing: '.4px' }}>este item nao existe no cadastro:</span>
                          {([['novo', 'Criar produto novo'], ['associar', 'Associar a um existente'], ['ignorar', 'Ignorar item']] as [AcaoItem, string][]).map(([v, label]) => (
                            <label key={v} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: '.72rem', cursor: 'pointer' }}>
                              <input type="radio" name={`acao-${i}`} checked={acao === v}
                                onChange={() => { setAcoes((s) => ({ ...s, [i]: v })); if (v !== 'associar') setAssoc((s) => ({ ...s, [i]: null })); }} />
                              {label}
                            </label>
                          ))}
                          {acao === 'associar' && (
                            <BuscaProduto
                              conta={conta}
                              termoInicial={it.codigoProdutoInt || it.descricaoProduto || ''}
                              valor={assoc[i] || null}
                              onSelecionar={(p) => setAssoc((s) => ({ ...s, [i]: p }))}
                            />
                          )}
                        </span>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: 8 }}>
            Deixe um CFOP de entrada em branco para o Omie decidir aquele item.
            {(r.itens || []).some((it) => it.criarNovo) && (
              <> Itens marcados como <b>novo</b> nao existem no cadastro: por padrao o Omie <b>cria o produto</b> ao concluir — escolha <b>associar</b> para ligar a um produto ja cadastrado (⚠ so' se desfaz revertendo o recebimento) ou <b>ignorar</b> para deixar o item de fora.</>
            )}
          </div>
          </>)}

          {fase === 'correcao' && (<>
            <div style={{ fontSize: '.74rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: 6, padding: 8, marginBottom: 12, color: '#065f46' }}>
              ✔ <b>Entrada processada no Omie.</b> Os itens abaixo baixaram o CMC (entrada de garantia{riscosExtra.length > 0 ? ' ou item associado a um produto existente' : ''}). Reveja o <b>CMC a restaurar</b> (= CMC anterior) e clique em <b>Corrigir custo</b> — isso aplica um ajuste no Omie e fica registrado como feito por você.
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <thead>
                  <tr>
                    <th style={mTh}>Produto</th>
                    <th style={{ ...mTh, textAlign: 'right' }}>CMC distorcido</th>
                    <th style={{ ...mTh, textAlign: 'right' }}>CMC a restaurar</th>
                    <th style={mTh}>Resultado</th>
                  </tr>
                </thead>
                <tbody>
                  {riscos.map((it, i) => {
                    const sug = it.idProduto != null ? sugestoes[String(it.idProduto)] : undefined;
                    return (
                    <tr key={i}>
                      <td style={mTd}>
                        {it.descricaoProduto || it.codigoProdutoInt || '?'}
                        {it.idProduto ? <span style={{ fontFamily: 'monospace', fontSize: '.6rem', color: '#94a3b8' }}> #{it.idProduto}</span> : null}
                      </td>
                      <td style={{ ...mTd, textAlign: 'right', color: '#b91c1c' }}>{fmtBRL(it.cmcProjetado)}</td>
                      <td style={{ ...mTd, textAlign: 'right' }}>
                        <input type="number" step="0.01" value={cmcAlvo[i] ?? ''}
                          onChange={(e) => { editouAlvo.current.add(i); setCmcAlvo((s) => ({ ...s, [i]: e.target.value })); }}
                          disabled={corrResult[i]?.tipo === 'ok'}
                          style={{ border: '1px solid #cbd5e1', borderRadius: 4, padding: '2px 6px', width: 100, textAlign: 'right', fontSize: '.72rem' }} />
                        {carregandoSug && !sug ? (
                          <div style={{ fontSize: '.62rem', color: '#94a3b8', marginTop: 2 }}>buscando custo real…</div>
                        ) : sug ? (
                          <div style={{ fontSize: '.62rem', marginTop: 2, color: sug.distorcido ? '#b45309' : '#94a3b8' }} title={sug.baseadoEm ? `base: ${sug.baseadoEm.origem || ''} ${sug.baseadoEm.doc || ''} ${sug.baseadoEm.data || ''}` : ''}>
                            {sug.distorcido ? '⚠ ' : ''}sugerido: {ESTRAT_LABEL[sug.estrategia] || sug.estrategia}
                          </div>
                        ) : null}
                      </td>
                      <td style={{ ...mTd, fontSize: '.72rem', color: corrResult[i]?.tipo === 'ok' ? '#047857' : (corrResult[i]?.tipo === 'erro' ? '#dc2626' : '#94a3b8') }}>{corrResult[i]?.texto || '—'}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: '.7rem', color: '#94a3b8', marginTop: 8 }}>
              O campo <b>CMC a restaurar</b> já vem preenchido com o <b>custo real</b> estimado (o CMC de antes da distorção, ex.: antes de o produto ficar negativo) — não o CMC imediato anterior. <b>Confira e edite</b> se souber o custo certo. ⚠ = o CMC atual parece bem abaixo do custo real. O ajuste é aplicado no local de maior saldo do produto.
            </div>
          </>)}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: '#64748b', marginRight: 'auto' }}>{statusModal}</span>
          {fase === 'entrada' ? (
            <>
              <button onClick={onClose} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
              <button onClick={confirmar} disabled={enviando} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 6, cursor: enviando ? 'wait' : 'pointer', opacity: enviando ? 0.6 : 1 }}>
                {enviando ? 'processando...' : 'Confirmar — dar entrada'}
              </button>
            </>
          ) : (
            <>
              <button onClick={onClose} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Fechar (sem corrigir)</button>
              <button onClick={corrigirCustos} disabled={corrigindo} style={{ padding: '6px 14px', fontSize: '.82rem', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, cursor: corrigindo ? 'wait' : 'pointer', opacity: corrigindo ? 0.6 : 1 }}>
                {corrigindo ? 'corrigindo...' : `Corrigir custo (${riscos.length})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const selStyle: React.CSSProperties = { display: 'block', width: '100%', marginTop: 3, border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.78rem', background: '#fff', boxSizing: 'border-box' };
const mTh: React.CSSProperties = { textAlign: 'left', padding: '4px 8px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '.7rem', color: '#475569', fontWeight: 600, whiteSpace: 'nowrap' };
const mTd: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #f1f5f9', fontSize: '.72rem', color: '#334155' };
