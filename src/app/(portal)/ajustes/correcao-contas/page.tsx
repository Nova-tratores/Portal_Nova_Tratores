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
  codigoCategoria?: string | number | null; descricaoCategoria?: string | null;
  codigoDepartamento?: string | number | null; descricaoDepartamento?: string | null;
}
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

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

// colunas da tabela de lancamentos (filtraveis/ordenaveis)
interface ColDef { key: string; label: string; type: 'num' | 'date' | 'text'; align?: 'right'; val: (l: Lancamento) => number | string; txt: (l: Lancamento) => string }
const COLS: ColDef[] = [
  { key: 'conta', label: 'Empresa', type: 'text', val: (l) => l.conta || '', txt: (l) => l.conta || '' },
  { key: 'valor', label: 'Valor', type: 'num', align: 'right', val: (l) => Number(l.valor) || 0, txt: (l) => fmtBRL(l.valor) },
  { key: 'dataEmissao', label: 'Emissao', type: 'date', val: (l) => l.dataEmissao || '', txt: (l) => fmtData(l.dataEmissao) },
  { key: 'vencimento', label: 'Vencimento', type: 'date', val: (l) => l.vencimento || '', txt: (l) => fmtData(l.vencimento) },
  { key: 'contraparte', label: 'Fornecedor/Cliente', type: 'text', val: (l) => decode(l.contraparte), txt: (l) => decode(l.contraparte) },
  { key: 'descricaoCategoria', label: 'Categoria', type: 'text', val: (l) => l.descricaoCategoria || '', txt: (l) => l.descricaoCategoria || '' },
  { key: 'descricaoDepartamento', label: 'Departamento', type: 'text', val: (l) => l.descricaoDepartamento || '', txt: (l) => l.descricaoDepartamento || '' },
];

export default function CorrecaoContasPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();
  const criadoPor = userProfile?.nome || 'portal';

  const def = useMemo(() => isoDefault(3), []);
  const [tipo, setTipo] = useState<Tipo>('pagar');
  const [dim, setDim] = useState<Dim>('categoria');
  const [de, setDe] = useState(def.de);
  const [ate, setAte] = useState(def.ate);

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

  // caches de cat/dep por conta (slug)
  const catCache = useRef<Record<string, CatDep[]>>({});
  const depCache = useRef<Record<string, CatDep[]>>({});

  // modal individual
  const [modalLanc, setModalLanc] = useState<Lancamento | null>(null);
  // modal de massa
  const [massaRows, setMassaRows] = useState<Lancamento[] | null>(null);

  const buscar = useCallback(async () => {
    setCarregando(true);
    setStatus('carregando...');
    setGrupoSel(null);
    setLancs([]);
    try {
      let qs = `tipo=${tipo}&dim=${dim}`;
      qs += contaParam; // '' (todas) ou '&conta=...'
      if (de) qs += '&de=' + encodeURIComponent(de);
      if (ate) qs += '&ate=' + encodeURIComponent(ate);
      const r = await fetch(`/api/ajustes/contas/ranking?${qs.replace(/^&/, '')}`);
      const d = (await r.json()) as RankingPayload;
      if (d.erro) { setStatus('Erro: ' + d.erro); setRanking([]); return; }
      setRanking(d.ranking || []);
      setResumo(`${d.totalLancamentos || 0} lancamentos · total ${fmtBRL(d.totalGeral)} · ${(d.ranking || []).length} ${dim}(s)`);
      setStatus('');
    } catch (ex) {
      setStatus('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [tipo, dim, contaParam, de, ate]);

  // recarrega ao trocar conta/tipo/dim
  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, tipo, dim]);

  const abrirLancamentos = useCallback(async (grupo: GrupoRanking) => {
    setGrupoSel(grupo);
    setLancs([]);
    setSort({ key: null, dir: 1 });
    setFiltros({});
    setLancSub('carregando...');
    try {
      let qs = `tipo=${tipo}&dim=${dim}&codigo=${encodeURIComponent(grupo.codigo == null ? '(sem)' : grupo.codigo)}`;
      qs += contaParam;
      if (de) qs += '&de=' + encodeURIComponent(de);
      if (ate) qs += '&ate=' + encodeURIComponent(ate);
      const r = await fetch(`/api/ajustes/contas/lancamentos?${qs.replace(/^&/, '')}`);
      const d = (await r.json()) as LancamentosPayload;
      if (d.erro) { setLancSub('Erro: ' + d.erro); return; }
      setLancs(d.lancamentos || []);
      setLancSub(`${d.total || 0} lancamento(s)${(d.total || 0) > (d.mostrando || 0) ? ` (mostrando os ${d.mostrando} maiores)` : ''} · clique em Corrigir`);
    } catch (ex) {
      setLancSub('Rede: ' + (ex as Error).message);
    }
  }, [tipo, dim, contaParam, de, ate]);

  const carregarCats = useCallback(async (slug: string): Promise<CatDep[]> => {
    if (catCache.current[slug]) return catCache.current[slug];
    const r = await fetch('/api/ajustes/categorias?conta=' + encodeURIComponent(slug));
    const d = await r.json();
    catCache.current[slug] = d.categorias || [];
    return catCache.current[slug];
  }, []);
  const carregarDeps = useCallback(async (slug: string): Promise<CatDep[]> => {
    if (depCache.current[slug]) return depCache.current[slug];
    const r = await fetch('/api/ajustes/departamentos?conta=' + encodeURIComponent(slug));
    const d = await r.json();
    depCache.current[slug] = d.departamentos || [];
    return depCache.current[slug];
  }, []);

  // linhas filtradas/ordenadas
  const linhasVisiveis = useMemo(() => {
    let rows = lancs.filter((l) => COLS.every((c) => {
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
  }, [lancs, filtros, sort]);

  // botao de massa: so 1 cliente/fornecedor distinto nas linhas visiveis
  const massaInfo = useMemo(() => {
    const nomes = new Set(linhasVisiveis.map((l) => decode(l.contraparte) || '(sem)'));
    if (linhasVisiveis.length && nomes.size === 1) return { cliente: Array.from(nomes)[0], rows: linhasVisiveis };
    return null;
  }, [linhasVisiveis]);

  const ordenarPor = useCallback((key: string) => {
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }, []);

  if (!permLoading && userProfile && !temAcesso('ajustes:correcao-contas')) return <SemPermissao />;

  const TOP = 30;
  const topRanking = ranking.slice(0, TOP);
  const maxTotal = topRanking.reduce((m, r) => Math.max(m, r.total), 0) || 1;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Correcao de contas</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 820 }}>
            Ranking de gastos por <b>categoria</b> ou <b>departamento</b> (a pagar e a receber) pra achar valores que distorcem o DRE. Clique numa barra pra ver os lancamentos e <b>corrigir</b> a categoria/departamento direto no Omie. Conta <b>{conta ? conta.toUpperCase() : 'Todas'}</b>.
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}><ContaSelector /></div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      {/* Controles */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
          <Toggle label="Tipo" value={tipo} onChange={(v) => setTipo(v as Tipo)} opts={[['pagar', 'A pagar'], ['receber', 'A receber']]} />
          <Toggle label="Agrupar por" value={dim} onChange={(v) => setDim(v as Dim)} opts={[['categoria', 'Categoria'], ['departamento', 'Departamento']]} />
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Emissao de</label>
            <input type="date" value={de} onChange={(e) => setDe(e.target.value)} style={inpStyle} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Ate</label>
            <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} style={inpStyle} />
          </div>
          <button onClick={buscar} disabled={carregando} style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.5 : 1 }}>Atualizar</button>
        </div>
        <div style={{ marginTop: 8, fontSize: '.75rem' }}>
          <span style={{ color: status.startsWith('Erro') ? '#dc2626' : '#64748b' }}>{status}</span>
          <span style={{ marginLeft: 8, color: '#94a3b8' }}>{resumo}</span>
        </div>
      </div>

      {/* Ranking (lista de barras clicaveis) */}
      <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        {topRanking.length === 0 ? (
          <div style={{ padding: 36, textAlign: 'center', color: '#94a3b8' }}>{carregando ? 'Carregando…' : 'Sem dados para o periodo/filtro.'}</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {topRanking.map((r) => {
              const ativo = grupoSel && String(grupoSel.codigo) === String(r.codigo);
              return (
                <button key={String(r.codigo)} onClick={() => abrirLancamentos(r)} title={`${r.descricao} · ${fmtBRL(r.total)} (${r.n} lanc.)`}
                  style={{ display: 'grid', gridTemplateColumns: '260px 1fr 130px', alignItems: 'center', gap: 10, background: ativo ? '#eff6ff' : 'transparent', border: 'none', borderRadius: 6, padding: '4px 6px', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ fontSize: '.78rem', color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.descricao || '(sem)'}</span>
                  <span style={{ background: '#e2e8f0', borderRadius: 4, height: 18, position: 'relative' }}>
                    <span style={{ position: 'absolute', inset: 0, width: `${Math.max(2, (r.total / maxTotal) * 100)}%`, background: '#3b82f6', borderRadius: 4 }} />
                  </span>
                  <span style={{ fontSize: '.78rem', color: '#1e293b', fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(r.total)} <span style={{ color: '#94a3b8', fontWeight: 400 }}>({r.n})</span></span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Painel de lancamentos */}
      {grupoSel && (
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
          <div style={{ padding: '10px 14px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.9rem', margin: 0 }}>{dim === 'categoria' ? 'Categoria: ' : 'Departamento: '}{grupoSel.descricao || '(sem)'}</h2>
            <span style={{ fontSize: '.72rem', color: '#64748b' }}>{lancSub}</span>
            <div style={{ flex: 1 }} />
            {massaInfo && (
              <button onClick={() => setMassaRows(massaInfo.rows)} style={{ padding: '4px 12px', background: '#d97706', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.72rem', cursor: 'pointer' }} title="So aparece quando o filtro deixa um unico cliente/fornecedor">Alterar em massa ({massaInfo.rows.length})</button>
            )}
            <button onClick={() => setGrupoSel(null)} style={{ background: 'none', border: 'none', fontSize: '1.4rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
          </div>
          <div style={{ overflow: 'auto', maxHeight: '60vh' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} onClick={() => ordenarPor(c.key)} style={{ ...thStyle, textAlign: c.align === 'right' ? 'right' : 'left' }}>
                      {c.label}{sort.key === c.key ? (sort.dir > 0 ? ' ▲' : ' ▼') : ''}
                    </th>
                  ))}
                  <th style={thStyle} />
                </tr>
                <tr>
                  {COLS.map((c) => (
                    <th key={c.key} style={{ ...thStyle, cursor: 'auto', padding: '2px 6px' }}>
                      <input value={filtros[c.key] || ''} onChange={(e) => setFiltros((s) => ({ ...s, [c.key]: e.target.value }))} placeholder="filtrar" style={{ width: '100%', minWidth: 80, border: '1px solid #e2e8f0', borderRadius: 4, padding: '2px 6px', fontSize: '.72rem', fontWeight: 400, textTransform: 'none' }} />
                    </th>
                  ))}
                  <th style={{ ...thStyle, cursor: 'auto' }} />
                </tr>
              </thead>
              <tbody>
                {linhasVisiveis.length === 0 ? (
                  <tr><td colSpan={COLS.length + 1} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8' }}>Nenhum lancamento bate com os filtros.</td></tr>
                ) : linhasVisiveis.map((l) => (
                  <tr key={`${l.conta}:${l.codigoLancamento}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                    <td style={tdStyle}><Badge conta={l.conta} /></td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(l.valor)}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#64748b' }}>{fmtData(l.dataEmissao) || '-'}</td>
                    <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#64748b' }}>{fmtData(l.vencimento) || '-'}</td>
                    <td style={tdStyle}>{decode(l.contraparte) || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b' }}>{l.descricaoCategoria || '-'}</td>
                    <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b' }}>{l.descricaoDepartamento || '-'}</td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button onClick={() => setModalLanc(l)} style={{ padding: '3px 10px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 4, fontSize: '.72rem', cursor: 'pointer' }}>Corrigir</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modalLanc && (
        <ModalCorrecao lanc={modalLanc} tipo={tipo} carregarCats={carregarCats} carregarDeps={carregarDeps}
          onClose={() => setModalLanc(null)} onAplicado={() => { setModalLanc(null); buscar(); }} />
      )}
      {massaRows && (
        <ModalMassa rows={massaRows} tipo={tipo} criadoPor={criadoPor} carregarCats={carregarCats} carregarDeps={carregarDeps}
          onClose={() => setMassaRows(null)} onAplicado={() => { setMassaRows(null); buscar(); }} />
      )}
    </div>
  );
}

const inpStyle: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem' };

function Toggle({ label, value, onChange, opts }: { label: string; value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>{label}</label>
      <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid #cbd5e1', overflow: 'hidden', fontSize: '.82rem' }}>
        {opts.map(([v, lbl], i) => (
          <button key={v} onClick={() => onChange(v)} style={{ padding: '6px 12px', border: 'none', borderLeft: i ? '1px solid #cbd5e1' : 'none', background: value === v ? '#2563eb' : '#fff', color: value === v ? '#fff' : '#475569', cursor: 'pointer' }}>{lbl}</button>
        ))}
      </div>
    </div>
  );
}

function Badge({ conta }: { conta: string }) {
  const castro = conta === 'CASTRO';
  return <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: '.68rem', background: castro ? '#f3e8ff' : '#e0f2fe', color: castro ? '#7e22ce' : '#0369a1' }}>{conta}</span>;
}

// ---------- modal de correcao individual ----------
let rowSeq = 1;
function ModalCorrecao({ lanc, tipo, carregarCats, carregarDeps, onClose, onAplicado }: {
  lanc: Lancamento; tipo: Tipo;
  carregarCats: (slug: string) => Promise<CatDep[]>; carregarDeps: (slug: string) => Promise<CatDep[]>;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    let vivo = true;
    Promise.all([carregarCats(slug), carregarDeps(slug)]).then(([c, d]) => {
      if (!vivo) return;
      setCats(c); setDeps(d); setCarregando(false);
    }).catch((e) => { if (vivo) { setModalStatus('Erro ao carregar: ' + (e as Error).message); setCarregando(false); } });
    return () => { vivo = false; };
  }, [slug, carregarCats, carregarDeps]);

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
    if (!confirm(`Aplicar correcao no Omie para o lancamento ${lanc.codigoLancamento} (${decode(lanc.contraparte)})?`)) return;
    setAplicando(true);
    setModalStatus('aplicando no Omie...');
    try {
      const r = await fetch('/api/ajustes/contas/corrigir', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta: slug, tipo, codigoLancamento: lanc.codigoLancamento, codigoCategoria: catSel, distribuicao }),
      });
      const d = await r.json();
      if (!d.ok) { setModalStatus(d.erro || 'falha'); setAplicando(false); return; }
      setModalStatus('aplicado ✓');
      setTimeout(onAplicado, 600);
    } catch (ex) {
      setModalStatus('rede: ' + (ex as Error).message); setAplicando(false);
    }
  }, [somaOk, rateio, lanc, slug, tipo, catSel, onAplicado]);

  return (
    <Overlay onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Corrigir categoria / departamento</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.85rem' }}>
          {carregando ? <div style={{ color: '#94a3b8' }}>carregando categorias/departamentos...</div> : (
            <>
              <div style={{ marginBottom: 12, fontSize: '.72rem', color: '#64748b' }}>{lanc.conta} · {decode(lanc.contraparte)} · {fmtBRL(lanc.valor)} · {fmtData(lanc.dataEmissao)} · lanc <span style={{ fontFamily: 'monospace' }}>{lanc.codigoLancamento}</span></div>
              <label style={lblStyle}>Categoria</label>
              <select value={catSel} onChange={(e) => setCatSel(e.target.value)} style={{ ...selStyle, marginBottom: 16 }}>
                {catFalta && <option value={String(lanc.codigoCategoria)}>{lanc.codigoCategoria} — {lanc.descricaoCategoria || '(atual)'} [atual/inativa]</option>}
                {cats.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.codigo} — {c.descricao}</option>)}
              </select>
              <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
                <label style={{ fontSize: '.72rem', color: '#64748b' }}>Departamento (rateio %)</label>
                <button onClick={() => setRateio((s) => [...s, { id: rowSeq++, codDep: '', perc: '0' }])} style={{ marginLeft: 'auto', fontSize: '.72rem', padding: '2px 8px', background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer' }}>+ departamento</button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {rateio.map((row) => {
                  const rowFalta = row.codDep && !deps.some((d) => String(d.codigo) === String(row.codDep));
                  return (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select value={row.codDep} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, codDep: e.target.value } : x))} style={{ ...selStyle, flex: 1 }}>
                        <option value="">(escolha)</option>
                        {rowFalta && <option value={row.codDep}>{depFalta && String(row.codDep) === String(lanc.codigoDepartamento) ? (lanc.descricaoDepartamento || row.codDep) : row.codDep} [atual/inativo]</option>}
                        {deps.map((d) => <option key={String(d.codigo)} value={String(d.codigo)}>{d.descricao}</option>)}
                      </select>
                      <input type="number" min="0" max="100" step="0.01" value={row.perc} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, perc: e.target.value } : x))} style={{ width: 80, ...selStyle, textAlign: 'right' }} />
                      <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>%</span>
                      <button onClick={() => setRateio((s) => s.length > 1 ? s.filter((x) => x.id !== row.id) : s)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 6, fontSize: '.72rem' }}>Soma: <b style={{ color: somaOk ? '#047857' : '#dc2626' }}>{soma.toFixed(2)}%</b>{somaOk ? '' : ' (precisa ser 100)'}</div>
            </>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: modalStatus.includes('✓') ? '#047857' : '#dc2626', marginRight: 'auto' }}>{modalStatus}</span>
          <button onClick={onClose} style={btnSec}>Cancelar</button>
          <button onClick={aplicar} disabled={aplicando || carregando} style={{ ...btnPrim, background: '#059669', opacity: aplicando || carregando ? 0.5 : 1 }}>Aplicar no Omie</button>
        </div>
      </div>
    </Overlay>
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
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
    <Overlay onClose={onClose}>
      <div style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 560, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Alteracao em massa</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.85rem' }}>
          {multiConta ? (
            <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 6, padding: 12, fontSize: '.78rem' }}>
              Os {rows.length} lancamentos sao de mais de uma empresa ({contas.join(', ')}). A alteracao em massa exige uma empresa por vez — filtre tambem pela coluna <b>Empresa</b>.
            </div>
          ) : carregando ? <div style={{ color: '#94a3b8' }}>carregando categorias/departamentos...</div> : (
            <>
              <div style={{ marginBottom: 12, fontSize: '.72rem', color: '#475569' }}>Cliente/Fornecedor: <b>{cliente}</b> · <b>{rows.length}</b> lancamento(s) · empresa <b>{contas[0]}</b><br /><span style={{ color: '#94a3b8' }}>{semCat} sem categoria · {semDep} sem departamento</span></div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 12 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, color: '#334155' }}><input type="checkbox" checked={catOn} onChange={(e) => setCatOn(e.target.checked)} /> Definir categoria</label>
                <select value={catSel} onChange={(e) => setCatSel(e.target.value)} disabled={!catOn} style={{ ...selStyle, marginTop: 8 }}>
                  <option value="">(escolha)</option>
                  {cats.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.codigo} — {c.descricao}</option>)}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', color: '#64748b', marginTop: 8 }}><input type="checkbox" checked={soCatVazia} disabled={!catOn} onChange={(e) => setSoCatVazia(e.target.checked)} /> Aplicar so nas que estao <b>sem categoria</b> ({semCat})</label>
              </div>
              <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500, color: '#334155' }}><input type="checkbox" checked={depOn} onChange={(e) => setDepOn(e.target.checked)} /> Definir departamento (rateio %)</label>
                  <button onClick={() => setRateio((s) => [...s, { id: rowSeq++, codDep: '', perc: '0' }])} disabled={!depOn} style={{ marginLeft: 'auto', fontSize: '.72rem', padding: '2px 8px', background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer', opacity: depOn ? 1 : 0.5 }}>+ departamento</button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
                  {rateio.map((row) => (
                    <div key={row.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <select value={row.codDep} disabled={!depOn} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, codDep: e.target.value } : x))} style={{ ...selStyle, flex: 1 }}>
                        <option value="">(escolha)</option>
                        {deps.map((d) => <option key={String(d.codigo)} value={String(d.codigo)}>{d.descricao}</option>)}
                      </select>
                      <input type="number" min="0" max="100" step="0.01" value={row.perc} disabled={!depOn} onChange={(e) => setRateio((s) => s.map((x) => x.id === row.id ? { ...x, perc: e.target.value } : x))} style={{ width: 80, ...selStyle, textAlign: 'right' }} />
                      <span style={{ fontSize: '.72rem', color: '#94a3b8' }}>%</span>
                      <button onClick={() => setRateio((s) => s.length > 1 ? s.filter((x) => x.id !== row.id) : s)} disabled={!depOn} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.1rem', cursor: 'pointer' }}>×</button>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 6, fontSize: '.72rem' }}>Soma: <b style={{ color: somaOk ? '#047857' : '#dc2626' }}>{soma.toFixed(2)}%</b>{somaOk ? '' : ' (precisa ser 100)'}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', color: '#64748b', marginTop: 8 }}><input type="checkbox" checked={soDepVazio} disabled={!depOn} onChange={(e) => setSoDepVazio(e.target.checked)} /> Aplicar so nas que estao <b>sem departamento</b> ({semDep})</label>
              </div>
            </>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: '#475569', marginRight: 'auto' }}>{modalStatus}</span>
          <button onClick={onClose} style={btnSec}>Cancelar</button>
          <button onClick={aplicar} disabled={aplicando || carregando || multiConta} style={{ ...btnPrim, background: '#d97706', opacity: aplicando || carregando || multiConta ? 0.5 : 1 }}>Aplicar em massa</button>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ display: 'contents' }}>{children}</div>
    </div>
  );
}

const lblStyle: React.CSSProperties = { display: 'block', fontSize: '.72rem', color: '#64748b', marginBottom: 2 };
const selStyle: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', background: '#fff' };
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' };
const btnSec: React.CSSProperties = { padding: '6px 12px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnPrim: React.CSSProperties = { padding: '6px 12px', fontSize: '.82rem', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
