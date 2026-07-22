'use client';
// Omie em Massa — visualizar e editar EM LOTE os cadastros do Omie (conta NOVA)
// direto no portal: aba Serviços (todos os 210) e aba Produtos (ranqueados por
// família / estoque / vendas do mês). Edição inline na tabela; célula alterada
// fica destacada; "Revisar e aplicar" mostra o diff e só então grava via
// /api/omie-massa/* (que compara de novo com o Omie e altera só o que mudou).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';

// ---------- tipos ----------
type Row = Record<string, string | number>;
type Conta = 'NOVA' | 'CASTRO';
type Aba = 'servicos' | 'produtos' | 'fiscal' | 'ncm';
interface Col { key: string; label: string; w: number; tipo?: 'num' | 'sn'; ro?: boolean; dica?: string }
interface Resultado { ok: boolean; erro?: string; campos: string[]; cCodigo?: string; codigo?: string; nCodServ?: number; codigo_produto?: number }
interface Familia { nome: string; produtos: number }
// Agrupamento por NCM — é no Cenário Fiscal por NCM que a tributação real mora.
interface GrupoNcm {
  ncm: string; produtos: number; cests: string[]; origens: string[];
  semCest: number; semOrigem: number; divergente: boolean;
}
interface ResumoFiscal { semNcm: number; semCest: number; semOrigem: number; atualizadoEm: string | null }
// "Produtos Utilizados" — composição de produtos do serviço no cadastro do Omie
interface ProdutoServ { codigo_produto: number; codigo: string; descricao: string; qtde: number; local: string }
interface ServComProdutos { nCodServ: number; cCodigo: string; cDescricao: string; inativo: string; produtos: ProdutoServ[] }

// ---------- colunas ----------
const COLS_SERV: Col[] = [
  { key: 'nCodServ', label: 'Cód. Omie', w: 105, ro: true },
  { key: 'inativo', label: 'Inativo', w: 62, tipo: 'sn' },
  { key: 'cCodigo', label: 'Código', w: 120 },
  { key: 'cDescricao', label: 'Descrição', w: 260 },
  { key: 'cDescrCompleta', label: 'Descrição completa', w: 260 },
  { key: 'nPrecoUnit', label: 'Preço (R$)', w: 90, tipo: 'num' },
  { key: 'cIdTrib', label: 'ID Trib', w: 60 },
  { key: 'cCodLC116', label: 'LC 116', w: 70 },
  { key: 'cCodServMun', label: 'Cód. Mun.', w: 80 },
  { key: 'cCodCateg', label: 'Categoria', w: 90 },
  { key: 'nAliqISS', label: '% ISS', w: 60, tipo: 'num' },
  { key: 'cRetISS', label: 'Ret ISS', w: 58, tipo: 'sn' },
  { key: 'nAliqPIS', label: '% PIS', w: 60, tipo: 'num' },
  { key: 'cRetPIS', label: 'Ret PIS', w: 58, tipo: 'sn' },
  { key: 'nAliqCOFINS', label: '% COFINS', w: 70, tipo: 'num' },
  { key: 'cRetCOFINS', label: 'Ret COF', w: 58, tipo: 'sn' },
  { key: 'nAliqCSLL', label: '% CSLL', w: 60, tipo: 'num' },
  { key: 'cRetCSLL', label: 'Ret CSLL', w: 58, tipo: 'sn' },
  { key: 'nAliqIR', label: '% IR', w: 60, tipo: 'num' },
  { key: 'cRetIR', label: 'Ret IR', w: 58, tipo: 'sn' },
  { key: 'nAliqINSS', label: '% INSS', w: 60, tipo: 'num' },
  { key: 'cRetINSS', label: 'Ret INSS', w: 58, tipo: 'sn' },
  // Reforma Tributária (IBS/CBS)
  { key: 'cCstIbsCbs', label: 'CST IBS/CBS', w: 85 },
  { key: 'cClassTrib', label: 'Class. Trib.', w: 85 },
  { key: 'cIndOper', label: 'Ind. Operação', w: 95 },
  { key: 'nAliqIbsMun', label: '% IBS Mun', w: 75, tipo: 'num' },
  { key: 'nAliqIbsUf', label: '% IBS Est', w: 75, tipo: 'num' },
  { key: 'nAliqCbs', label: '% CBS', w: 65, tipo: 'num' },
  { key: 'nPercReducaoIbsMun', label: 'Red. IBS Mun', w: 85, tipo: 'num' },
  { key: 'nPercReducaoIbsUf', label: 'Red. IBS Est', w: 85, tipo: 'num' },
  { key: 'nPercReducaoCbs', label: 'Red. CBS', w: 75, tipo: 'num' },
];
// Colunas fiscais EDITÁVEIS de produto — compartilhadas pela aba Produtos
// (ao vivo) e pela aba Fiscal (cache do banco).
//
// ATENÇÃO ao que NÃO está aqui: IPI, e "Tipo de Cálculo" de IPI/PIS. Esses
// campos não existem no cadastro de produto da Omie — vivem no Cenário Fiscal
// → Tributação por NCM, que não tem API. Ver o aviso na tela.
//
// CEST e Origem gravam dentro de `recomendacoes_fiscais` (a API ignora em
// silêncio um bloco parcial — o merge é feito no servidor, em diffProduto).
const COLS_FISCAL_EDIT: Col[] = [
  { key: 'ncm', label: 'NCM', w: 95 },
  { key: 'cest', label: 'CEST', w: 90, dica: 'Vem de Recomendações Fiscais → CEST. A Omie valida o CEST contra o NCM do produto.' },
  { key: 'origem_mercadoria', label: 'Origem', w: 70, dica: 'Origem da mercadoria (0–8), em Recomendações Fiscais.' },
  { key: 'tipoItem', label: 'Tipo item', w: 75 },
  { key: 'cfop', label: 'CFOP', w: 70 },
  { key: 'ean', label: 'EAN', w: 110 },
  { key: 'unidade', label: 'Unidade', w: 70 },
  // ICMS — exceções por produto (o padrão vem do Cenário Fiscal por NCM)
  { key: 'cst_icms', label: 'CST ICMS', w: 75 },
  { key: 'modalidade_icms', label: 'Modalid. BC ICMS', w: 105, dica: 'Só vem na consulta individual — use "Detalhar" para preencher.' },
  { key: 'csosn_icms', label: 'CSOSN', w: 70 },
  { key: 'aliquota_icms', label: '% ICMS', w: 65, tipo: 'num' },
  { key: 'red_base_icms', label: 'Red. BC ICMS', w: 85, tipo: 'num' },
  { key: 'motivo_deson_icms', label: 'Mot. deson.', w: 85 },
  { key: 'per_icms_fcp', label: '% FCP', w: 60, tipo: 'num' },
  { key: 'codigo_beneficio', label: 'Cód. benefício', w: 95 },
  // PIS / COFINS
  { key: 'cst_pis', label: 'CST PIS', w: 65 },
  { key: 'aliquota_pis', label: '% PIS', w: 60, tipo: 'num' },
  { key: 'red_base_pis', label: 'Red. BC PIS', w: 80, tipo: 'num' },
  { key: 'cst_cofins', label: 'CST COFINS', w: 80 },
  { key: 'aliquota_cofins', label: '% COFINS', w: 70, tipo: 'num' },
  { key: 'red_base_cofins', label: 'Red. BC COFINS', w: 95, tipo: 'num' },
];

// Aba Fiscal: contexto (só leitura, vindo do cache) + as colunas editáveis.
const COLS_FISCAL: Col[] = [
  { key: 'codigo_produto', label: 'Cód. Omie', w: 105, ro: true },
  { key: 'codigo', label: 'Código', w: 120, ro: true },
  { key: 'descricao', label: 'Descrição', w: 280, ro: true },
  { key: 'familia_nome', label: 'Família', w: 110, ro: true },
  { key: 'estoque', label: 'Estoque', w: 70, ro: true },
  ...COLS_FISCAL_EDIT,
  { key: 'cst_ibs_cbs', label: 'CST IBS/CBS', w: 85 },
  { key: 'class_trib', label: 'Class. Trib.', w: 85 },
];

const COLS_PROD: Col[] = [
  { key: 'codigo_produto', label: 'Cód. Omie', w: 105, ro: true },
  { key: 'codigo', label: 'Código', w: 120, ro: true },
  { key: 'familia', label: 'Família', w: 110, ro: true },
  { key: 'estoque', label: 'Estoque', w: 70, ro: true },
  { key: 'vendas_qtd', label: 'Vendas (qtd)', w: 85, ro: true },
  { key: 'vendas_valor', label: 'Vendas (R$)', w: 95, ro: true },
  { key: 'descricao', label: 'Descrição', w: 300 },
  { key: 'descr_detalhada', label: 'Descr. detalhada', w: 300 },
  { key: 'valor_unitario', label: 'Valor unit. (R$)', w: 105, tipo: 'num' },
  ...COLS_FISCAL_EDIT,
  // Reforma Tributária (IBS/CBS)
  { key: 'cst_ibs_cbs', label: 'CST IBS/CBS', w: 85 },
  { key: 'class_trib', label: 'Class. Trib.', w: 85 },
  { key: 'aliquota_ibs_mun', label: '% IBS Mun', w: 75, tipo: 'num' },
  { key: 'aliquota_ibs_uf', label: '% IBS Est', w: 75, tipo: 'num' },
  { key: 'aliquota_cbs', label: '% CBS', w: 65, tipo: 'num' },
  { key: 'perc_reducao_ibs_mun', label: 'Red. IBS Mun', w: 85, tipo: 'num' },
  { key: 'perc_reducao_ibs_uf', label: 'Red. IBS Est', w: 85, tipo: 'num' },
  { key: 'perc_reducao_cbs', label: 'Red. CBS', w: 75, tipo: 'num' },
  { key: 'inativo', label: 'Inativo', w: 62, tipo: 'sn' },
];

const ABAS: Array<[Aba, string]> = [
  ['servicos', 'Serviços'],
  ['produtos', 'Produtos (ao vivo)'],
  ['fiscal', 'Fiscal'],
  ['ncm', 'Por NCM'],
];

// ---------- helpers ----------
const parseNum = (s: string) => parseFloat(String(s).replace(',', '.')) || 0;
const difere = (col: Col, editado: string, original: string | number): boolean => {
  if (col.tipo === 'num') return parseNum(editado) !== Number(original);
  if (col.tipo === 'sn') return editado.trim().toUpperCase() !== String(original).toUpperCase();
  return editado.trim() !== String(original).trim();
};
const valorFinal = (col: Col, editado: string): string | number => {
  if (col.tipo === 'num') return parseNum(editado);
  if (col.tipo === 'sn') return editado.trim().toUpperCase();
  return editado.trim();
};

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', position: 'sticky', top: 0, zIndex: 1 };
const btn: React.CSSProperties = { padding: '8px 16px', borderRadius: 8, border: '1px solid #e2e8f0', background: '#fff', cursor: 'pointer', fontSize: '.82rem', fontWeight: 600, color: '#334155' };
const btnPrim: React.CSSProperties = { ...btn, background: '#0f172a', color: '#fff', border: '1px solid #0f172a' };
const btnDanger: React.CSSProperties = { ...btn, background: '#dc2626', color: '#fff', border: '1px solid #dc2626' };
const inputBase: React.CSSProperties = { width: '100%', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', fontSize: '.78rem', background: 'transparent', color: '#334155' };

// ---------- grid editável (compartilhado pelas duas abas) ----------
function GridEditavel({ cols, rows, idKey, edits, setEdits, filtro, acao }: {
  cols: Col[]; rows: Row[]; idKey: string;
  edits: Record<string, Record<string, string>>;
  setEdits: React.Dispatch<React.SetStateAction<Record<string, Record<string, string>>>>;
  filtro: string;
  // coluna extra de ação no início da linha (ex.: "Produtos" nos serviços)
  acao?: { label: string; render: (r: Row) => React.ReactNode };
}) {
  const visiveis = useMemo(() => {
    if (!filtro.trim()) return rows;
    const f = filtro.trim().toLowerCase();
    return rows.filter((r) => cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(f)));
  }, [rows, filtro, cols]);

  const setCel = (id: string, key: string, val: string) => {
    setEdits((prev) => ({ ...prev, [id]: { ...(prev[id] || {}), [key]: val } }));
  };

  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
      <table style={{ borderCollapse: 'collapse', width: 'max-content', minWidth: '100%' }}>
        <thead>
          <tr>
            {acao && <th style={{ ...thStyle, minWidth: 70 }}>{acao.label}</th>}
            {cols.map((c) => (
              <th key={c.key} style={{ ...thStyle, minWidth: c.w }} title={c.dica}>
                {c.label}{c.dica && <span style={{ color: '#94a3b8', marginLeft: 3 }}>?</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((r) => {
            const id = String(r[idKey]);
            return (
              <tr key={id}>
                {acao && <td style={{ borderBottom: '1px solid #f1f5f9', padding: '2px 8px', whiteSpace: 'nowrap' }}>{acao.render(r)}</td>}
                {cols.map((c) => {
                  const original = r[c.key] ?? '';
                  const editado = edits[id]?.[c.key];
                  const valor = editado !== undefined ? editado : String(original);
                  const dirty = editado !== undefined && difere(c, editado, original);
                  const tdBase: React.CSSProperties = { borderBottom: '1px solid #f1f5f9', padding: 0, background: dirty ? '#fef9c3' : undefined };
                  if (c.ro) {
                    return <td key={c.key} style={{ ...tdBase, padding: '4px 8px', color: '#64748b', fontSize: '.78rem', whiteSpace: 'nowrap' }}>{String(original)}</td>;
                  }
                  if (c.tipo === 'sn') {
                    return (
                      <td key={c.key} style={tdBase}>
                        <select value={valor.toUpperCase() === 'S' ? 'S' : 'N'} onChange={(e) => setCel(id, c.key, e.target.value)}
                          style={{ ...inputBase, cursor: 'pointer', fontWeight: dirty ? 700 : 400 }}>
                          <option value="N">N</option>
                          <option value="S">S</option>
                        </select>
                      </td>
                    );
                  }
                  return (
                    <td key={c.key} style={tdBase}>
                      <input value={valor} onChange={(e) => setCel(id, c.key, e.target.value)}
                        style={{ ...inputBase, fontWeight: dirty ? 700 : 400 }}
                        onFocus={(e) => { e.target.style.border = '1px solid #94a3b8'; e.target.style.background = '#fff'; }}
                        onBlur={(e) => { e.target.style.border = '1px solid transparent'; e.target.style.background = 'transparent'; }} />
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {!visiveis.length && (
            <tr><td colSpan={cols.length + (acao ? 1 : 0)} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Nenhum item.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- visão por NCM (só leitura) ----------
// A tributação real é por NCM no Cenário Fiscal. Quando produtos do MESMO NCM
// têm CEST ou Origem diferentes (ou uns preenchidos e outros não), quase sempre
// é erro de cadastro — é isso que a coluna "divergente" aponta.
function TabelaNcm({ grupos, soDivergentes, filtro, aoEscolher }: {
  grupos: GrupoNcm[]; soDivergentes: boolean; filtro: string; aoEscolher: (ncm: string) => void;
}) {
  const visiveis = useMemo(() => {
    const f = filtro.trim().toLowerCase();
    return grupos.filter((g) => (!soDivergentes || g.divergente) && (!f || g.ncm.toLowerCase().includes(f)));
  }, [grupos, soDivergentes, filtro]);

  const lista = (vals: string[], faltando: number) => {
    const partes = vals.length ? vals.join(', ') : '—';
    return faltando ? `${partes}  (${faltando} em branco)` : partes;
  };

  return (
    <div style={{ overflow: 'auto', maxHeight: 'calc(100vh - 320px)', border: '1px solid #e2e8f0', borderRadius: 8, background: '#fff' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            {['NCM', 'Produtos', 'CEST(s) no NCM', 'Origem(ns) no NCM', ''].map((h, i) => (
              <th key={i} style={{ ...thStyle, minWidth: i === 0 ? 110 : undefined }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {visiveis.map((g) => (
            <tr key={g.ncm} style={{ background: g.divergente ? '#fffbeb' : undefined }}>
              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: '#0f172a', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {g.ncm}
                {g.divergente && <span title="Produtos do mesmo NCM com CEST ou Origem diferentes — provável erro de cadastro"
                  style={{ marginLeft: 6, fontSize: '.66rem', color: '#b45309', border: '1px solid #fcd34d', borderRadius: 6, padding: '1px 5px' }}>divergente</span>}
              </td>
              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: '#334155', textAlign: 'right', width: 80 }}>{g.produtos}</td>
              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: g.cests.length > 1 ? '#b45309' : '#475569' }}>{lista(g.cests, g.semCest)}</td>
              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: g.origens.length > 1 ? '#b45309' : '#475569' }}>{lista(g.origens, g.semOrigem)}</td>
              <td style={{ borderBottom: '1px solid #f1f5f9', padding: '2px 8px', width: 90 }}>
                {g.ncm !== '(sem NCM)' && (
                  <button onClick={() => aoEscolher(g.ncm)} style={{ ...btn, padding: '3px 10px', fontSize: '.72rem' }}
                    title="Abrir estes produtos na aba Fiscal">ver</button>
                )}
              </td>
            </tr>
          ))}
          {!visiveis.length && (
            <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Nenhum NCM.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// ---------- página ----------
export default function OmieMassaPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);

  const [aba, setAba] = useState<Aba>('servicos');
  const [conta, setConta] = useState<Conta>('NOVA');
  const [filtro, setFiltro] = useState('');
  // "aplicar à coluna": preenche um valor em todas as linhas visíveis da aba
  const [fillCol, setFillCol] = useState('');
  const [fillVal, setFillVal] = useState('');

  // serviços
  const [servRows, setServRows] = useState<Row[]>([]);
  const [servEdits, setServEdits] = useState<Record<string, Record<string, string>>>({});
  const [servLoading, setServLoading] = useState(false);

  // produtos
  const [prodRows, setProdRows] = useState<Row[]>([]);
  const [prodEdits, setProdEdits] = useState<Record<string, Record<string, string>>>({});
  const [prodLoading, setProdLoading] = useState(false);
  const [familias, setFamilias] = useState<Familia[]>([]);
  const [fFamilia, setFFamilia] = useState('');
  const [fOrdenar, setFOrdenar] = useState<'vendas' | 'estoque'>('vendas');
  const [fTop, setFTop] = useState(50);
  const mesPassado = useMemo(() => { const d = new Date(); d.setMonth(d.getMonth() - 1); return d; }, []);
  const [fMes, setFMes] = useState(mesPassado.getMonth() + 1);
  const [fAno, setFAno] = useState(mesPassado.getFullYear());
  const [prodInfo, setProdInfo] = useState('');

  // fiscal (cache do banco — abre em ~1s, sem bater no Omie)
  const [fiscalRows, setFiscalRows] = useState<Row[]>([]);
  const [fiscalEdits, setFiscalEdits] = useState<Record<string, Record<string, string>>>({});
  const [fiscalLoading, setFiscalLoading] = useState(false);
  const [fNcm, setFNcm] = useState('');
  const [fBusca, setFBusca] = useState('');
  const [fVazio, setFVazio] = useState<'' | 'semCest' | 'semOrigem' | 'semNcm'>('');
  const [fPagina, setFPagina] = useState(1);
  const [fTotal, setFTotal] = useState(0);
  const [fResumo, setFResumo] = useState<ResumoFiscal | null>(null);
  const [detalhando, setDetalhando] = useState(false);
  const POR_PAGINA = 200;

  // fiscal por NCM
  const [grupos, setGrupos] = useState<GrupoNcm[]>([]);
  const [gruposLoading, setGruposLoading] = useState(false);
  const [gruposDiv, setGruposDiv] = useState(0);
  const [soDivergentes, setSoDivergentes] = useState(false);

  const [erro, setErro] = useState('');
  const [modal, setModal] = useState<null | { itens: Array<{ id: string; rotulo: string; difs: Array<{ campo: string; de: string; para: string }> }> }>(null);
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<null | { resultados: Resultado[]; inativoIgnorado?: number[] }>(null);

  // "Produtos Utilizados" dos serviços (só visualização)
  const [prodServ, setProdServ] = useState<null | { titulo: string; loading: boolean; erro?: string; produtos: ProdutoServ[] }>(null);
  const [todosProdServ, setTodosProdServ] = useState<null | { loading: boolean; erro?: string; servicos: ServComProdutos[]; comProdutos: number }>(null);
  const [filtroProdServ, setFiltroProdServ] = useState('');

  const authHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const { data: { session } } = await supabase.auth.getSession();
    return { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token ?? ''}` };
  }, []);

  // ---- carregar serviços ----
  const carregarServicos = useCallback(async () => {
    setServLoading(true); setErro(''); setServEdits({}); setResultado(null);
    try {
      const res = await fetch(`/api/omie-massa/servicos?conta=${conta}`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setServRows(json.servicos || []);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setServLoading(false);
  }, [authHeaders, conta]);

  // ---- carregar produtos ----
  const carregarFamilias = useCallback(async () => {
    try {
      const res = await fetch(`/api/omie-massa/produtos/familias?conta=${conta}`, { headers: await authHeaders() });
      const json = await res.json();
      if (res.ok) setFamilias(json.familias || []);
    } catch { /* seletor fica vazio */ }
  }, [authHeaders, conta]);

  const buscarProdutos = useCallback(async () => {
    setProdLoading(true); setErro(''); setProdEdits({}); setResultado(null); setProdInfo('');
    try {
      const q = new URLSearchParams({ conta, familia: fFamilia, ordenar: fOrdenar, top: String(fTop), mes: String(fMes), ano: String(fAno) });
      const res = await fetch(`/api/omie-massa/produtos?${q}`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setProdRows(json.produtos || []);
      setProdInfo(`${(json.produtos || []).length} de ${json.totalCandidatos} produtos (vendas ${json.mes}/${json.ano})`);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setProdLoading(false);
  }, [authHeaders, conta, fFamilia, fOrdenar, fTop, fMes, fAno]);

  // ---- carregar catálogo fiscal (do cache local, não do Omie) ----
  const buscarFiscal = useCallback(async (pagina = 1) => {
    setFiscalLoading(true); setErro(''); setFiscalEdits({}); setResultado(null);
    try {
      const q = new URLSearchParams({ conta, ncm: fNcm, busca: fBusca, pagina: String(pagina), porPagina: String(POR_PAGINA) });
      if (fVazio) q.set(fVazio, '1');
      const res = await fetch(`/api/omie-massa/fiscal?${q}`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setFiscalRows(json.linhas || []);
      setFTotal(json.total || 0);
      setFResumo(json.resumo || null);
      setFPagina(json.pagina || pagina);
      if (json.aviso) setErro(json.aviso);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setFiscalLoading(false);
  }, [authHeaders, conta, fNcm, fBusca, fVazio]);

  const buscarGrupos = useCallback(async () => {
    setGruposLoading(true); setErro('');
    try {
      const res = await fetch(`/api/omie-massa/fiscal?conta=${conta}&agrupar=ncm`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setGrupos(json.grupos || []);
      setGruposDiv(json.divergentes || 0);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setGruposLoading(false);
  }, [authHeaders, conta]);

  const baixarCsvFiscal = useCallback(async () => {
    const q = new URLSearchParams({ conta, ncm: fNcm, busca: fBusca, formato: 'csv' });
    if (fVazio) q.set(fVazio, '1');
    const res = await fetch(`/api/omie-massa/fiscal?${q}`, { headers: await authHeaders() });
    if (!res.ok) { setErro('falha ao gerar o CSV'); return; }
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `catalogo-fiscal-${conta.toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }, [authHeaders, conta, fNcm, fBusca, fVazio]);

  // Preenche os campos que o cache não tem (só o ConsultarProduto devolve
  // modalidade_icms) nas linhas visíveis — 1 chamada Omie por linha.
  const detalharVisiveis = useCallback(async () => {
    if (!fiscalRows.length) return;
    setDetalhando(true); setErro('');
    try {
      const codigos = fiscalRows.map((r) => Number(r.codigo_produto));
      const res = await fetch('/api/omie-massa/fiscal/detalhar', {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ conta, codigos }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const porCodigo = new Map<number, Row>((json.detalhes || []).map((d: Row) => [Number(d.codigo_produto), d]));
      setFiscalRows((prev) => prev.map((r) => {
        const d = porCodigo.get(Number(r.codigo_produto));
        return d ? { ...r, ...d } : r;
      }));
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setDetalhando(false);
  }, [authHeaders, conta, fiscalRows]);

  // Carga inicial e, depois, a cada troca de conta (que invalida tudo que já
  // estava na tela — os cadastros são de outra empresa).
  useEffect(() => {
    if (permLoading || !pode('ajustes', 'omie-massa')) return;
    setProdRows([]); setFiscalRows([]); setGrupos([]);
    setServEdits({}); setProdEdits({}); setFiscalEdits({});
    setResultado(null); setProdInfo(''); setFTotal(0); setFResumo(null);
    carregarServicos();
    carregarFamilias();
  }, [permLoading, conta]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- "Produtos Utilizados" de um serviço (modal rápido) ----
  const verProdutosServico = useCallback(async (r: Row) => {
    const titulo = `${r.cCodigo} — ${r.cDescricao}`;
    setProdServ({ titulo, loading: true, produtos: [] });
    try {
      const res = await fetch(`/api/omie-massa/servicos/produtos?nCodServ=${r.nCodServ}`, { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setProdServ({ titulo, loading: false, produtos: json.produtos || [] });
    } catch (e: unknown) {
      setProdServ({ titulo, loading: false, erro: e instanceof Error ? e.message : String(e), produtos: [] });
    }
  }, [authHeaders]);

  // ---- "Produtos Utilizados" de TODOS os serviços (1 consulta por serviço no Omie) ----
  const carregarTodosProdutosServicos = useCallback(async () => {
    setFiltroProdServ('');
    setTodosProdServ({ loading: true, servicos: [], comProdutos: 0 });
    try {
      const res = await fetch('/api/omie-massa/servicos/produtos', { headers: await authHeaders() });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setTodosProdServ({ loading: false, servicos: json.servicos || [], comProdutos: json.comProdutos || 0 });
    } catch (e: unknown) {
      setTodosProdServ({ loading: false, erro: e instanceof Error ? e.message : String(e), servicos: [], comProdutos: 0 });
    }
  }, [authHeaders]);

  const baixarCsvProdutosServicos = () => {
    if (!todosProdServ?.servicos.length) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const linhas = ['servico_codigo;servico_descricao;servico_inativo;produto_codigo;produto_descricao;quantidade;local_estoque'];
    for (const s of todosProdServ.servicos) {
      for (const p of s.produtos) linhas.push([s.cCodigo, s.cDescricao, s.inativo, p.codigo, p.descricao, p.qtde, p.local].map(esc).join(';'));
    }
    const blob = new Blob(['\ufeff' + linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'produtos-por-servico.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---- copiar Descrição → Descr. detalhada (só onde está vazia) ----
  // Apenas marca as células como editadas (amarelo); nada vai pro Omie sem
  // passar pelo "Revisar e aplicar".
  const copiarDescricaoParaDetalhada = useCallback(() => {
    setProdEdits((prev) => {
      const next = { ...prev };
      for (const r of prodRows) {
        const id = String(r.codigo_produto);
        const det = next[id]?.descr_detalhada !== undefined ? next[id].descr_detalhada : String(r.descr_detalhada ?? '');
        const desc = next[id]?.descricao !== undefined ? next[id].descricao : String(r.descricao ?? '');
        if (det.trim() === '' && desc.trim() !== '') {
          next[id] = { ...(next[id] || {}), descr_detalhada: desc };
        }
      }
      return next;
    });
  }, [prodRows]);

  // ---- diff pendente da aba ativa ----
  // A aba Fiscal edita os MESMOS cadastros de produto da aba Produtos — só muda
  // a fonte de leitura (cache do banco vs. Omie ao vivo). A gravação é a mesma.
  const cols = aba === 'servicos' ? COLS_SERV : aba === 'fiscal' ? COLS_FISCAL : COLS_PROD;
  const rows = aba === 'servicos' ? servRows : aba === 'fiscal' ? fiscalRows : prodRows;
  const edits = aba === 'servicos' ? servEdits : aba === 'fiscal' ? fiscalEdits : prodEdits;
  const setEdits = aba === 'servicos' ? setServEdits : aba === 'fiscal' ? setFiscalEdits : setProdEdits;
  const idKey = aba === 'servicos' ? 'nCodServ' : 'codigo_produto';

  // linhas que passam no filtro de texto (mesma regra do GridEditavel)
  const linhasVisiveis = useMemo(() => {
    if (!filtro.trim()) return rows;
    const f = filtro.trim().toLowerCase();
    return rows.filter((r) => cols.some((c) => String(r[c.key] ?? '').toLowerCase().includes(f)));
  }, [rows, filtro, cols]);

  // preenche fillVal na coluna fillCol de todas as linhas visíveis — só marca
  // as células (amarelo); nada grava sem passar pelo "Revisar e aplicar"
  const aplicarColuna = () => {
    if (!fillCol) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const r of linhasVisiveis) {
        const id = String(r[idKey]);
        next[id] = { ...(next[id] || {}), [fillCol]: fillVal };
      }
      return next;
    });
  };

  const pendencias = useMemo(() => {
    const itens: Array<{ id: string; rotulo: string; difs: Array<{ campo: string; de: string; para: string }>; alteracao: Row }> = [];
    for (const r of rows) {
      const id = String(r[idKey]);
      const ed = edits[id];
      if (!ed) continue;
      const difs: Array<{ campo: string; de: string; para: string }> = [];
      const alteracao: Row = { [idKey]: r[idKey] };
      for (const c of cols) {
        if (c.ro || ed[c.key] === undefined) continue;
        if (difere(c, ed[c.key], r[c.key] ?? '')) {
          difs.push({ campo: c.label, de: String(r[c.key] ?? ''), para: String(valorFinal(c, ed[c.key])) });
          alteracao[c.key] = valorFinal(c, ed[c.key]);
        }
      }
      if (difs.length) {
        const rotulo = aba === 'servicos' ? `${r.cCodigo} — ${r.cDescricao}` : `${r.codigo} — ${r.descricao}`;
        itens.push({ id, rotulo, difs, alteracao });
      }
    }
    return itens;
  }, [rows, edits, cols, idKey, aba]);

  // ---- aplicar ----
  const aplicar = async () => {
    setAplicando(true); setErro('');
    try {
      const url = aba === 'servicos' ? '/api/omie-massa/servicos' : '/api/omie-massa/produtos';
      const enviadas = pendencias;
      const res = await fetch(url, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ conta, alteracoes: enviadas.map((p) => p.alteracao) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResultado(json);
      setModal(null);
      setEdits({});
      if (aba === 'servicos') carregarServicos();
      else if (aba === 'produtos') buscarProdutos();
      else {
        // Aba Fiscal: NÃO recarrega do banco. O cache local só é atualizado pelo
        // cron de produtos, então reler agora traria o valor ANTIGO de volta e
        // pareceria que a gravação falhou. Aplica na tela o que o Omie aceitou.
        const okIds = new Set(
          (json.resultados as Resultado[] || [])
            .filter((r) => r.ok && r.campos.length)
            .map((r) => String(r.codigo_produto)),
        );
        setFiscalRows((prev) => prev.map((r) => {
          const id = String(r[idKey]);
          if (!okIds.has(id)) return r;
          const p = enviadas.find((x) => x.id === id);
          return p ? { ...r, ...p.alteracao } : r;
        }));
      }
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    setAplicando(false);
  };

  if (permLoading) return <div style={{ padding: 40, color: '#64748b' }}>Carregando…</div>;
  if (!pode('ajustes', 'omie-massa')) return <SemPermissao />;

  const loading = aba === 'servicos' ? servLoading : prodLoading;

  return (
    <div style={{ padding: '20px 24px', maxWidth: 1600, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 14 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: '1.25rem', color: '#0f172a' }}>Omie em Massa</h1>
          <p style={{ margin: '2px 0 0', fontSize: '.78rem', color: '#64748b' }}>
            Edite os cadastros direto na tabela (conta NOVA). Nada é gravado até você revisar e confirmar.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={conta} onChange={(e) => setConta(e.target.value as Conta)}
            style={{ ...btn, cursor: 'pointer', fontWeight: 700 }}
            title="Empresa do Omie cujos cadastros estão sendo editados">
            <option value="NOVA">Nova</option>
            <option value="CASTRO">Castro</option>
          </select>
          {ABAS.map(([t, rotulo]) => (
            <button key={t} onClick={() => {
              setAba(t); setResultado(null); setFiltro(''); setFillCol(''); setFillVal('');
              if (t === 'fiscal' && !fiscalRows.length) buscarFiscal(1);
              if (t === 'ncm' && !grupos.length) buscarGrupos();
            }}
              style={{ ...btn, ...(aba === t ? { background: '#0f172a', color: '#fff', border: '1px solid #0f172a' } : {}) }}>
              {t === 'servicos' ? `${rotulo} (${servRows.length})` : rotulo}
            </button>
          ))}
        </div>
      </div>

      {/* O ponto que mais confunde: metade dos campos fiscais NÃO é do produto. */}
      {(aba === 'fiscal' || aba === 'ncm') && (
        <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.78rem', lineHeight: 1.5 }}>
          <strong>IPI, CST de ICMS/PIS/COFINS e &quot;Tipo de Cálculo&quot; não são editáveis aqui.</strong>{' '}
          Esses campos são definidos por <strong>NCM</strong>, no <strong>Cenário Fiscal</strong> do Omie, e a API não os expõe —
          por isso vêm em branco em praticamente todo o catálogo. O que existe por produto e dá para
          corrigir em massa é: <strong>NCM, CEST, Origem, Tipo do item</strong> e as <em>exceções</em> fiscais.
          Use a aba <strong>Por NCM</strong> para achar cadastros divergentes.
        </div>
      )}

      {/* filtros */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
        {aba === 'produtos' && (
          <>
            <select value={fFamilia} onChange={(e) => setFFamilia(e.target.value)} style={{ ...btn, cursor: 'pointer' }}>
              <option value="">Todas as famílias</option>
              {familias.map((f) => <option key={f.nome} value={f.nome}>{f.nome} ({f.produtos})</option>)}
            </select>
            <select value={fOrdenar} onChange={(e) => setFOrdenar(e.target.value as 'vendas' | 'estoque')} style={{ ...btn, cursor: 'pointer' }}>
              <option value="vendas">Mais vendidos no mês</option>
              <option value="estoque">Mais estoque</option>
            </select>
            <label style={{ fontSize: '.78rem', color: '#475569' }}>
              Top{' '}
              <input type="number" min={1} max={300} value={fTop} onChange={(e) => setFTop(Number(e.target.value) || 50)}
                style={{ ...btn, width: 70, padding: '7px 8px' }} />
            </label>
            <label style={{ fontSize: '.78rem', color: '#475569' }}>
              Mês{' '}
              <input type="number" min={1} max={12} value={fMes} onChange={(e) => setFMes(Number(e.target.value) || 1)}
                style={{ ...btn, width: 58, padding: '7px 8px' }} />
            </label>
            <label style={{ fontSize: '.78rem', color: '#475569' }}>
              Ano{' '}
              <input type="number" min={2020} max={2100} value={fAno} onChange={(e) => setFAno(Number(e.target.value) || fAno)}
                style={{ ...btn, width: 78, padding: '7px 8px' }} />
            </label>
            <button onClick={buscarProdutos} disabled={prodLoading} style={btnPrim}>{prodLoading ? 'Buscando…' : 'Buscar'}</button>
            <button onClick={copiarDescricaoParaDetalhada} disabled={prodLoading || !prodRows.length} style={btn}
              title="Preenche a Descr. detalhada com a Descrição nos produtos listados onde ela está vazia — só marca as células; revise e aplique depois">
              Descrição → detalhada (vazios)
            </button>
            {prodInfo && <span style={{ fontSize: '.75rem', color: '#64748b' }}>{prodInfo}</span>}
          </>
        )}
        {aba === 'fiscal' && (
          <>
            <input placeholder="NCM (ex.: 8708)" value={fNcm} onChange={(e) => setFNcm(e.target.value)}
              style={{ ...btn, cursor: 'text', width: 130, fontWeight: 400 }} />
            <input placeholder="Código ou descrição…" value={fBusca} onChange={(e) => setFBusca(e.target.value)}
              style={{ ...btn, cursor: 'text', minWidth: 200, fontWeight: 400 }} />
            <select value={fVazio} onChange={(e) => setFVazio(e.target.value as typeof fVazio)} style={{ ...btn, cursor: 'pointer' }}>
              <option value="">Todos os produtos</option>
              <option value="semCest">Só sem CEST</option>
              <option value="semOrigem">Só sem Origem</option>
              <option value="semNcm">Só sem NCM</option>
            </select>
            <button onClick={() => buscarFiscal(1)} disabled={fiscalLoading} style={btnPrim}>
              {fiscalLoading ? 'Buscando…' : 'Buscar'}
            </button>
            <button onClick={baixarCsvFiscal} disabled={fiscalLoading || !fiscalRows.length} style={btn}
              title="Baixa TODAS as linhas do filtro atual (não só a página) — é assim que se vê o catálogo inteiro de uma vez">
              Baixar CSV
            </button>
            <button onClick={detalharVisiveis} disabled={detalhando || !fiscalRows.length} style={btn}
              title="Consulta produto a produto no Omie para preencher a Modalidade da BC do ICMS (o cache não tem esse campo). Demora ~1s por linha.">
              {detalhando ? 'Detalhando…' : 'Detalhar página'}
            </button>
          </>
        )}
        {aba === 'ncm' && (
          <>
            <button onClick={buscarGrupos} disabled={gruposLoading} style={btn}>
              {gruposLoading ? 'Carregando…' : 'Recarregar'}
            </button>
            <label style={{ fontSize: '.78rem', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <input type="checkbox" checked={soDivergentes} onChange={(e) => setSoDivergentes(e.target.checked)} />
              Só divergentes ({gruposDiv})
            </label>
          </>
        )}
        {aba === 'servicos' && (
          <>
            <button onClick={carregarServicos} disabled={servLoading} style={btn}>{servLoading ? 'Carregando…' : 'Recarregar'}</button>
            <button onClick={carregarTodosProdutosServicos} disabled={!!todosProdServ?.loading} style={btn}
              title="Lista os Produtos Utilizados de TODOS os serviços (1 consulta por serviço no Omie — pode levar 1–2 minutos)">
              🧩 Produtos de todos os serviços
            </button>
          </>
        )}
        <input placeholder="Filtrar na tabela…" value={filtro} onChange={(e) => setFiltro(e.target.value)}
          style={{ ...btn, cursor: 'text', minWidth: 220, fontWeight: 400 }} />
        {/* aplicar valor em massa a uma coluna (linhas visíveis) */}
        {rows.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 8px', border: '1px dashed #cbd5e1', borderRadius: 10 }}>
            <select value={fillCol} onChange={(e) => setFillCol(e.target.value)} style={{ ...btn, cursor: 'pointer', padding: '6px 8px' }}>
              <option value="">Aplicar à coluna…</option>
              {cols.filter((c) => !c.ro).map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
            <input placeholder="valor" value={fillVal} onChange={(e) => setFillVal(e.target.value)}
              style={{ ...btn, cursor: 'text', width: 110, fontWeight: 400, padding: '6px 8px' }} />
            <button onClick={aplicarColuna} disabled={!fillCol || !linhasVisiveis.length} style={{ ...btn, opacity: !fillCol ? 0.5 : 1 }}
              title="Preenche esta coluna em todas as linhas visíveis (só marca as células em amarelo; nada grava sem o Revisar e aplicar)">
              Preencher {linhasVisiveis.length} linha(s)
            </button>
          </span>
        )}
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem' }}>
          {erro}
        </div>
      )}

      {resultado && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.82rem', color: '#166534' }}>
          <strong>Aplicado:</strong>{' '}
          {resultado.resultados.filter((r) => r.ok && r.campos.length).length} alterado(s),{' '}
          {resultado.resultados.filter((r) => !r.ok).length} falha(s).
          {resultado.resultados.filter((r) => !r.ok).map((r, i) => (
            <div key={i} style={{ color: '#b91c1c' }}>✗ {r.cCodigo || r.codigo || r.nCodServ || r.codigo_produto}: {r.erro}</div>
          ))}
          {!!resultado.inativoIgnorado?.length && (
            <div style={{ color: '#b45309', marginTop: 4 }}>
              ⚠ O Omie ignorou a mudança de &quot;inativo&quot; em {resultado.inativoIgnorado.length} serviço(s) — inativar serviço só pela tela do Omie.
            </div>
          )}
        </div>
      )}

      {/* aba Fiscal: panorama do catálogo + paginação (a grade nunca renderiza
          o catálogo inteiro — são milhares de linhas × dezenas de inputs) */}
      {aba === 'fiscal' && fResumo && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, fontSize: '.76rem', color: '#475569' }}>
          <span><strong>{fTotal.toLocaleString('pt-BR')}</strong> produto(s) no filtro</span>
          <span>sem NCM: <strong>{fResumo.semNcm.toLocaleString('pt-BR')}</strong></span>
          <span>sem CEST: <strong>{fResumo.semCest.toLocaleString('pt-BR')}</strong></span>
          <span>sem Origem: <strong>{fResumo.semOrigem.toLocaleString('pt-BR')}</strong></span>
          {fResumo.atualizadoEm && (
            <span style={{ color: '#94a3b8' }}>
              cache de {new Date(fResumo.atualizadoEm).toLocaleString('pt-BR')} (atualiza no sync diário de produtos)
            </span>
          )}
        </div>
      )}

      {aba === 'ncm' ? (
        gruposLoading && !grupos.length
          ? <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: '.9rem' }}>Agrupando o catálogo por NCM…</div>
          : <TabelaNcm grupos={grupos} soDivergentes={soDivergentes} filtro={filtro}
              aoEscolher={(ncm) => { setAba('fiscal'); setFNcm(ncm); setFVazio(''); setFBusca(''); buscarFiscal(1); }} />
      ) : loading && !rows.length
        ? <div style={{ padding: 60, textAlign: 'center', color: '#64748b', fontSize: '.9rem' }}>
            {aba === 'fiscal' ? 'Lendo o catálogo fiscal…' : 'Consultando o Omie… (pode levar alguns segundos)'}
          </div>
        : <GridEditavel cols={cols} rows={rows} idKey={idKey} edits={edits} setEdits={setEdits} filtro={filtro}
            acao={aba === 'servicos' ? {
              label: 'Produtos',
              render: (r) => (
                <button onClick={() => verProdutosServico(r)} style={{ ...btn, padding: '3px 10px', fontSize: '.72rem' }}
                  title="Ver os Produtos Utilizados deste serviço (aba do cadastro no Omie)">
                  ver
                </button>
              ),
            } : undefined} />}

      {/* paginação da aba Fiscal */}
      {aba === 'fiscal' && fTotal > POR_PAGINA && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 10, fontSize: '.78rem', color: '#475569' }}>
          <button onClick={() => buscarFiscal(fPagina - 1)} disabled={fiscalLoading || fPagina <= 1} style={{ ...btn, opacity: fPagina <= 1 ? 0.5 : 1 }}>← Anterior</button>
          <span>
            {((fPagina - 1) * POR_PAGINA + 1).toLocaleString('pt-BR')}–{Math.min(fPagina * POR_PAGINA, fTotal).toLocaleString('pt-BR')}
            {' de '}{fTotal.toLocaleString('pt-BR')}
          </span>
          <button onClick={() => buscarFiscal(fPagina + 1)} disabled={fiscalLoading || fPagina * POR_PAGINA >= fTotal}
            style={{ ...btn, opacity: fPagina * POR_PAGINA >= fTotal ? 0.5 : 1 }}>Próxima →</button>
          {!!Object.keys(fiscalEdits).length && (
            <span style={{ color: '#b45309' }}>trocar de página descarta as edições não aplicadas</span>
          )}
        </div>
      )}

      {/* barra de pendências */}
      {pendencias.length > 0 && (
        <div style={{ position: 'sticky', bottom: 12, marginTop: 12, background: '#0f172a', color: '#fff', borderRadius: 10, padding: '10px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, boxShadow: '0 8px 24px rgba(15,23,42,.35)' }}>
          <span style={{ fontSize: '.85rem' }}>
            <strong>{pendencias.reduce((n, p) => n + p.difs.length, 0)}</strong> campo(s) alterado(s) em <strong>{pendencias.length}</strong> item(ns)
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setEdits({})} style={{ ...btn, background: 'transparent', color: '#cbd5e1', border: '1px solid #475569' }}>Descartar</button>
            <button onClick={() => setModal({ itens: pendencias })} style={{ ...btn, background: '#fff', color: '#0f172a' }}>Revisar e aplicar</button>
          </div>
        </div>
      )}

      {/* modal de revisão */}
      {modal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => !aplicando && setModal(null)}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 720, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: '.95rem', color: '#0f172a' }}>Revisar alterações ({aba === 'servicos' ? 'Serviços' : 'Produtos'})</strong>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 2 }}>Confira antes de gravar — a alteração vai direto para o Omie.</div>
            </div>
            <div style={{ overflow: 'auto', padding: '10px 18px', flex: 1 }}>
              {modal.itens.map((it) => (
                <div key={it.id} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: '.82rem', fontWeight: 600, color: '#0f172a' }}>{it.rotulo}</div>
                  {it.difs.map((d, i) => (
                    <div key={i} style={{ fontSize: '.78rem', color: '#475569', paddingLeft: 10 }}>
                      {d.campo}: <span style={{ color: '#b91c1c', textDecoration: 'line-through' }}>{d.de || '(vazio)'}</span>{' '}
                      → <span style={{ color: '#15803d', fontWeight: 600 }}>{d.para || '(vazio)'}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button onClick={() => setModal(null)} disabled={aplicando} style={btn}>Cancelar</button>
              <button onClick={aplicar} disabled={aplicando} style={btnDanger}>
                {aplicando ? 'Aplicando…' : `Aplicar ${modal.itens.length} item(ns) no Omie`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* modal: Produtos Utilizados de UM serviço */}
      {prodServ && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setProdServ(null)}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 760, width: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0' }}>
              <strong style={{ fontSize: '.95rem', color: '#0f172a' }}>Produtos utilizados</strong>
              <div style={{ fontSize: '.78rem', color: '#64748b', marginTop: 2 }}>{prodServ.titulo}</div>
            </div>
            <div style={{ overflow: 'auto', padding: '10px 18px', flex: 1 }}>
              {prodServ.loading && <div style={{ padding: 24, textAlign: 'center', color: '#64748b', fontSize: '.85rem' }}>Consultando o Omie…</div>}
              {prodServ.erro && <div style={{ color: '#b91c1c', fontSize: '.82rem' }}>{prodServ.erro}</div>}
              {!prodServ.loading && !prodServ.erro && !prodServ.produtos.length && (
                <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Este serviço não tem produtos cadastrados.</div>
              )}
              {!prodServ.loading && prodServ.produtos.length > 0 && (
                <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                  <thead>
                    <tr>
                      {['Código', 'Descrição', 'Qtde', 'Local de estoque'].map((h) => (
                        <th key={h} style={{ ...thStyle, position: 'static' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {prodServ.produtos.map((p, i) => (
                      <tr key={i}>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: '#334155', whiteSpace: 'nowrap' }}>{p.codigo}</td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: '#334155' }}>{p.descricao}</td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: '#334155', textAlign: 'right' }}>{p.qtde}</td>
                        <td style={{ borderBottom: '1px solid #f1f5f9', padding: '5px 8px', fontSize: '.78rem', color: '#64748b', whiteSpace: 'nowrap' }}>{p.local}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end' }}>
              <button onClick={() => setProdServ(null)} style={btn}>Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* modal: Produtos Utilizados de TODOS os serviços */}
      {todosProdServ && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.55)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => !todosProdServ.loading && setTodosProdServ(null)}>
          <div style={{ background: '#fff', borderRadius: 12, maxWidth: 900, width: '100%', maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 220 }}>
                <strong style={{ fontSize: '.95rem', color: '#0f172a' }}>Produtos utilizados por serviço</strong>
                {!todosProdServ.loading && !todosProdServ.erro && (
                  <div style={{ fontSize: '.75rem', color: '#64748b', marginTop: 2 }}>
                    {todosProdServ.comProdutos} de {todosProdServ.servicos.length} serviços têm produtos cadastrados
                  </div>
                )}
              </div>
              {!todosProdServ.loading && (
                <input placeholder="Filtrar serviço ou produto…" value={filtroProdServ} onChange={(e) => setFiltroProdServ(e.target.value)}
                  style={{ ...btn, cursor: 'text', minWidth: 220, fontWeight: 400 }} />
              )}
            </div>
            <div style={{ overflow: 'auto', padding: '10px 18px', flex: 1 }}>
              {todosProdServ.loading && (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: '.85rem' }}>
                  Consultando o Omie serviço a serviço… (pode levar 1–2 minutos)
                </div>
              )}
              {todosProdServ.erro && <div style={{ color: '#b91c1c', fontSize: '.82rem' }}>{todosProdServ.erro}</div>}
              {!todosProdServ.loading && !todosProdServ.erro && (() => {
                const f = filtroProdServ.trim().toLowerCase();
                const visiveis = todosProdServ.servicos.filter((s) => s.produtos.length && (!f
                  || `${s.cCodigo} ${s.cDescricao}`.toLowerCase().includes(f)
                  || s.produtos.some((p) => `${p.codigo} ${p.descricao}`.toLowerCase().includes(f))));
                if (!visiveis.length) {
                  return <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontSize: '.85rem' }}>Nenhum serviço com produtos {f ? 'para esse filtro' : 'cadastrados'}.</div>;
                }
                return visiveis.map((s) => (
                  <div key={s.nCodServ} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '.82rem', fontWeight: 700, color: '#0f172a', padding: '6px 0 4px' }}>
                      {s.cCodigo} — {s.cDescricao}
                      {s.inativo === 'S' && <span style={{ marginLeft: 8, fontSize: '.68rem', color: '#b45309', border: '1px solid #fcd34d', background: '#fffbeb', borderRadius: 6, padding: '1px 6px' }}>inativo</span>}
                      <span style={{ marginLeft: 8, fontSize: '.72rem', color: '#64748b', fontWeight: 400 }}>{s.produtos.length} produto(s)</span>
                    </div>
                    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                      <tbody>
                        {s.produtos.map((p, i) => (
                          <tr key={i}>
                            <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 8px', fontSize: '.76rem', color: '#334155', whiteSpace: 'nowrap', width: 160 }}>{p.codigo}</td>
                            <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 8px', fontSize: '.76rem', color: '#334155' }}>{p.descricao}</td>
                            <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 8px', fontSize: '.76rem', color: '#334155', textAlign: 'right', width: 60 }}>{p.qtde}</td>
                            <td style={{ borderBottom: '1px solid #f1f5f9', padding: '4px 8px', fontSize: '.76rem', color: '#64748b', whiteSpace: 'nowrap', width: 150 }}>{p.local}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ));
              })()}
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              {!todosProdServ.loading && !todosProdServ.erro && todosProdServ.servicos.length > 0 && (
                <button onClick={baixarCsvProdutosServicos} style={btn}>Baixar CSV</button>
              )}
              <button onClick={() => setTodosProdServ(null)} disabled={todosProdServ.loading} style={btn}>Fechar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
