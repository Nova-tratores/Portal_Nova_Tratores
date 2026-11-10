'use client';
// Tela /financeiro/notas: lista unificada do cache de notas fiscais, faixa de
// cobertura, filtros, selo por nota, Ver PDF (visualizador), Baixar XML,
// Guardar agora. Quando a Omie está fora, o que está guardado continua abrindo.
// Busca por campo (Tudo · Nº da nota · Pedido · OS · Cliente · Máquina) com
// deep-link ?campo=&q= ; colunas Pedido/OS (link pra Pasta Clientes) e Máquina.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Download, RefreshCw, ShieldCheck, CloudOff, Search, Tractor, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento';
import {
  CAMPOS_BUSCA, ROTULO_BATEU, ROTULO_SELO, ROTULO_TIPO, chassiPrincipal, ehCampoBusca, ehTipoFiltro, linkPasta, ondeBateu, selo,
  alternarOrdem, ehOrdemPadrao, ordemParaParam, parseOrdem,
  type CampoBusca, type ColunaOrdem, type LinhaDoc, type Ordem, type Selo, type Cobertura,
} from '@/lib/notas/cache-regras';
import {
  COR_CATEGORIA, DICA_CATEGORIA, FILTROS_VAZIOS, ROTULO_CATEGORIA, categoriaDe, categoriasDaAba, contarFiltrosColuna, descreverFiltros,
  ehCategoria, escreverFiltrosColuna, lerFiltrosColuna, numeroBR, rotuloCategoria,
  type Categoria, type FiltrosColuna, type SituacaoDoc, type Soma,
} from '@/lib/notas/filtros-relatorios';
import RelatoriosNotas from './RelatoriosNotas';

interface Resp {
  notas: LinhaDoc[]; total: number; pagina: number; porPagina: number; totalPaginas: number;
  cobertura: Cobertura; ultimaRodada: { iniciado_em: string; status: string | null; detalhe: unknown } | null;
  podeIndexar: boolean; podeEntrada?: boolean; vinculosFaltando?: boolean; numeroComoTexto?: boolean; erro?: string; migracaoFaltando?: boolean;
  soma?: Soma | null; somaErro?: string | null; podeRelatorios?: boolean; categoriaFaltando?: boolean;
}

/** Cabeçalho da tabela: `col` = ordenável clicando (A→Z / Z→A). */
const CABECALHO: Array<{ label: string; col?: ColunaOrdem }> = [
  { label: 'Tipo', col: 'tipo' }, { label: 'Nº / Série', col: 'numero' }, { label: 'Emissão', col: 'data_emissao' },
  { label: 'Cliente / Fornecedor', col: 'parte_nome' }, { label: 'Pedido / OS', col: 'pedido' }, { label: 'Máquina', col: 'maquina' },
  { label: 'Valor', col: 'valor' }, { label: 'Documento' }, { label: '' },
];

const PRESETS: Array<{ label: string; dias: number | null }> = [
  { label: '30 dias', dias: 30 }, { label: '90 dias', dias: 90 }, { label: '1 ano', dias: 365 }, { label: 'Tudo', dias: null },
];

const COR_SELO: Record<Selo, { bg: string; fg: string; bd: string }> = {
  completa: { bg: '#ecfdf5', fg: '#065f46', bd: '#a7f3d0' },
  so_pdf: { bg: '#fffbeb', fg: '#92400e', bd: '#fcd34d' },
  so_xml: { bg: '#fffbeb', fg: '#92400e', bd: '#fcd34d' },
  na_fila: { bg: '#f5f5f5', fg: '#737373', bd: '#e5e5e5' },
  pendente_omie: { bg: '#eff6ff', fg: '#1e40af', bd: '#bfdbfe' },
  sem_documento: { bg: '#fef2f2', fg: '#991b1b', bd: '#fecaca' },
};

function isoDia(d: Date) { return d.toISOString().slice(0, 10); }
function hojeLocal() { return isoDia(new Date(Date.now() - 3 * 3600 * 1000)); }
function menosDias(n: number) { return isoDia(new Date(Date.now() - 3 * 3600 * 1000 - n * 86400000)); }
function fmtData(iso: string | null) { if (!iso) return '—'; const [a, m, d] = iso.split('-'); return `${d}/${m}/${a}`; }
function fmtDoc(d: string | null) {
  if (!d) return '';
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}

const AZUL = '#2563eb';
const th: React.CSSProperties = { background: 'var(--portal-bg-secondary, #f8fafc)', color: 'var(--portal-text-secondary, #475569)', fontSize: 14.5, padding: '10px 12px', textAlign: 'left', borderBottom: '1px solid var(--border, #e2e8f0)', fontWeight: 400, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '10px 12px', borderBottom: '1px solid var(--border, #e2e8f0)', color: 'var(--portal-text, #0f172a)', fontSize: 15.5, verticalAlign: 'middle' };
const inp: React.CSSProperties = { height: 36, padding: '0 12px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 10, fontSize: 15.5, outline: 'none', background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)' };
const btn: React.CSSProperties = { height: 36, padding: '0 12px', border: '1px solid var(--border, #e2e8f0)', background: 'var(--surface, #fefefe)', color: 'var(--portal-text-secondary, #475569)', borderRadius: 10, fontSize: 15, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: AZUL, fontSize: 15, cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', gap: 4 };
const linkPastaSt: React.CSSProperties = { color: AZUL, textDecoration: 'none' };
const rotulo: React.CSSProperties = { display: 'block', color: 'var(--portal-text-secondary, #475569)', fontSize: 14.5, marginBottom: 5 };
const cartao: React.CSSProperties = { background: 'var(--surface, #fefefe)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 16 };
const apagado = 'var(--portal-text-muted, #64748b)';
const thFiltro: React.CSSProperties = { background: 'var(--portal-bg-secondary, #f8fafc)', padding: '0 8px 8px', borderBottom: '1px solid var(--border, #e2e8f0)', verticalAlign: 'top', fontWeight: 400 };
const inpF: React.CSSProperties = { height: 30, width: '100%', minWidth: 0, padding: '0 8px', border: '1px solid var(--border, #e2e8f0)', borderRadius: 8, fontSize: 14, outline: 'none', background: 'var(--surface, #fefefe)', color: 'var(--portal-text, #0f172a)', boxSizing: 'border-box' };
const ativoF = (on: boolean): React.CSSProperties => (on ? { borderColor: AZUL, boxShadow: `0 0 0 1px ${AZUL}` } : {});

const ESTILO_NOTAS = `
.nf-pagina { background: color-mix(in srgb, var(--portal-text, #0f172a) 6%, var(--portal-bg, #fafafa)); min-height: calc(100vh - 150px) }
.nf-abas { display: flex; flex-wrap: wrap; gap: 6px; border-bottom: 1px solid var(--border, #e2e8f0) }
.nf-aba { --c: #2563eb; display: inline-flex; align-items: center; gap: 8px; padding: 9px 16px; border: none; border-bottom: 3px solid color-mix(in srgb, var(--c) 30%, transparent); border-radius: 10px 10px 0 0; background: transparent; color: var(--portal-text, #0f172a); font-size: 16.5px; cursor: pointer; transition: background .2s, border-color .2s }
.nf-aba:hover { background: color-mix(in srgb, var(--c) 6%, transparent) }
.nf-aba-on { background: color-mix(in srgb, var(--c) 9%, transparent); border-bottom-color: var(--c); font-weight: 500 }
.nf-aba-ico { width: 26px; height: 26px; display: grid; place-items: center; border-radius: 8px; font-size: 12.5px; color: var(--c); background: color-mix(in srgb, var(--c) 11%, transparent) }
.nf-aba-on .nf-aba-ico { background: var(--c); color: #fefefe }
.nf-num { display: inline-flex; align-items: baseline; gap: 4px; padding: 1px 8px; border-radius: 7px; font: inherit; font-weight: 500; font-variant-numeric: tabular-nums; color: inherit; cursor: pointer; background: color-mix(in srgb, #2563eb 10%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, #2563eb 22%, transparent); transition: background .15s, border-color .15s }
.nf-num:hover, .nf-num[aria-expanded="true"] { background: color-mix(in srgb, #2563eb 18%, var(--surface, #fefefe)); border-color: color-mix(in srgb, #2563eb 45%, transparent) }
.nf-menu { position: fixed; z-index: 61; min-width: 170px; padding: 6px; display: flex; flex-direction: column; gap: 2px; border-radius: 12px; background: var(--surface, #fefefe); border: 1px solid var(--border, #e2e8f0); box-shadow: 0 8px 24px rgba(15, 23, 42, .16) }
.nf-menu button { display: flex; align-items: center; gap: 9px; padding: 9px 11px; border: none; border-radius: 8px; background: transparent; color: var(--portal-text, #0f172a); font-size: 15.5px; text-align: left; cursor: pointer }
.nf-menu button:hover:not(:disabled) { background: color-mix(in srgb, #2563eb 9%, transparent) }
.nf-menu button:disabled { opacity: .5; cursor: default }
.nf-tr { transition: background .15s }
.nf-tipo { --c: #b45309; display: inline-block; font-size: 14px; padding: 2px 9px; border-radius: 999px; white-space: nowrap; color: var(--c); background: color-mix(in srgb, var(--c) 10%, transparent); border: 1px solid color-mix(in srgb, var(--c) 28%, transparent) }
.nf-total { display: flex; flex-wrap: wrap; align-items: stretch; overflow: hidden }
.nf-total-main { display: flex; flex-direction: column; gap: 2px; padding: 12px 18px; min-width: 240px; border-right: 1px solid var(--border, #e2e8f0) }
.nf-total-main span { font-size: 14.5px; color: var(--portal-text-secondary, #475569) }
.nf-total-main b { font-size: 26px; font-weight: 600; letter-spacing: -.01em; font-variant-numeric: tabular-nums; color: #15803d }
.nf-total-main small { font-size: 14px; color: var(--portal-text-secondary, #475569) }
.nf-total-cats { display: flex; flex-wrap: wrap; gap: 8px; padding: 10px 14px; flex: 1; align-content: center }
.nf-cat { --c: #64748b; display: flex; flex-direction: column; align-items: flex-start; gap: 1px; padding: 7px 12px; border-radius: 10px; cursor: pointer; text-align: left; color: var(--portal-text, #0f172a); background: color-mix(in srgb, var(--c) 6%, var(--surface, #fefefe)); border: 1px solid color-mix(in srgb, var(--c) 25%, transparent); border-left: 4px solid var(--c); transition: background .15s }
.nf-cat:hover:not(:disabled) { background: color-mix(in srgb, var(--c) 13%, var(--surface, #fefefe)) }
.nf-cat:disabled { cursor: default }
.nf-cat-on { background: color-mix(in srgb, var(--c) 18%, var(--surface, #fefefe)); box-shadow: 0 0 0 1.5px var(--c) }
.nf-cat-nome { font-size: 13.5px; color: var(--c); font-weight: 600 }
.nf-cat-val { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums }
.nf-cat-n { font-size: 12.5px; color: var(--portal-text-secondary, #475569) }
@media (max-width: 560px) { .nf-total-main { border-right: none; width: 100% } }
.nf-tr:hover { background: color-mix(in srgb, #0369a1 4%, var(--surface, #fefefe)) }
.nf-tr:last-child td { border-bottom: none }
`;

export default function NotasFiscais({ podeXml, isAdmin, podeEntrada = true }: { podeXml: boolean; isAdmin: boolean; podeEntrada?: boolean }) {
  const { conta, contaParam } = useConta();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const campoUrl = sp.get('campo');
  const [tipo, setTipo] = useState(() => (ehTipoFiltro(sp.get('tipo')) ? String(sp.get('tipo')) : sp.get('q') ? '' : 'saida')); // ?tipo=entrada|saida|… (redirect das telas aposentadas)
  const [de, setDe] = useState(() => (sp.get('q') ? '' : `${hojeLocal().slice(0, 7)}-01`)); // abre no mês corrente
  const [ate, setAte] = useState(() => (sp.get('q') ? '' : hojeLocal()));
  const [q, setQ] = useState(() => sp.get('q') || '');
  const [campo, setCampo] = useState<CampoBusca>(() => (ehCampoBusca(campoUrl) ? campoUrl : 'auto'));
  // filtros do cabeçalho da tabela (tipo, nº, cliente, pedido/OS, máquina, valor, documento) — vivem na URL
  const [filtros, setFiltros] = useState<FiltrosColuna>(() => lerFiltrosColuna(sp));
  const [vminTxt, setVminTxt] = useState(() => (filtros.vmin != null ? String(filtros.vmin).replace('.', ',') : ''));
  const [vmaxTxt, setVmaxTxt] = useState(() => (filtros.vmax != null ? String(filtros.vmax).replace('.', ',') : ''));
  const [menuTipo, setMenuTipo] = useState<{ x: number; y: number } | null>(null);
  const [relatorios, setRelatorios] = useState(false);
  const [ordem, setOrdem] = useState<Ordem>(() => parseOrdem(sp.get('ordem')));
  const [pagina, setPagina] = useState(1);
  const [resp, setResp] = useState<Resp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [omieFora, setOmieFora] = useState(false);
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aviso, setAviso] = useState('');
  const [indexando, setIndexando] = useState(false);
  const [menuNf, setMenuNf] = useState<{ n: LinhaDoc; x: number; y: number } | null>(null); // clique no nº da NF: PDF ou XML

  // o menu fica preso ao botão: rolou a tela ou apertou Esc, fecha
  useEffect(() => {
    if (!menuNf) return;
    const fechar = () => setMenuNf(null);
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') fechar(); };
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    window.addEventListener('keydown', tecla);
    return () => { window.removeEventListener('scroll', fechar, true); window.removeEventListener('resize', fechar); window.removeEventListener('keydown', tecla); };
  }, [menuNf]);

  const abrirMenuNf = (n: LinhaDoc, botao: HTMLElement) => {
    const r = botao.getBoundingClientRect();
    const altura = podeXml ? 96 : 54;
    setMenuNf({ n, x: r.left, y: r.bottom + altura + 8 > window.innerHeight ? r.top - altura - 4 : r.bottom + 4 });
  };

  // q/campo vivem também na URL (deep-link de outras telas; F5 mantém a busca)
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (campo !== 'auto') p.set('campo', campo);
    if (!ehOrdemPadrao(ordem)) p.set('ordem', ordemParaParam(ordem));
    escreverFiltrosColuna(filtros, p);
    const alvo = p.toString() ? `${pathname}?${p}` : pathname;
    if (`${window.location.pathname}${window.location.search}` !== alvo) router.replace(alvo, { scroll: false });
  }, [q, campo, ordem, filtros, pathname, router]);

  // filtros SEM página/ordem: os mesmos vão para o relatório
  const filtrosQs = useMemo(() => {
    const p = new URLSearchParams();
    if (tipo) p.set('tipo', tipo);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    if (q.trim()) { p.set('q', q.trim()); if (campo !== 'auto') p.set('campo', campo); }
    escreverFiltrosColuna(filtros, p);
    return p.toString() + contaParam;
  }, [tipo, de, ate, q, campo, filtros, contaParam]);
  const qs = useMemo(() => {
    const p = new URLSearchParams(filtrosQs);
    p.set('pagina', String(pagina));
    if (!ehOrdemPadrao(ordem)) p.set('ordem', ordemParaParam(ordem));
    return p.toString();
  }, [filtrosQs, pagina, ordem]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const r = await fetch(`/api/financeiro/notas?${qs}`, { headers: await authHeaders(), cache: 'no-store' });
      const d = (await r.json()) as Resp;
      if (!r.ok || d.erro) { setErro(d.erro || `Erro ${r.status}`); setResp(null); return; }
      setResp(d);
    } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); }
  }, [qs]);
  useEffect(() => { const t = setTimeout(() => { carregar(); }, 300); return () => clearTimeout(t); }, [carregar]);

  const buscar = (texto: string, c: CampoBusca) => { setCampo(c); setQ(texto); setDe(''); setAte(''); setPagina(1); };
  const ordenar = (col: ColunaOrdem) => { setOrdem((o) => alternarOrdem(o, col)); setPagina(1); };
  const setF = (patch: Partial<FiltrosColuna>) => { setFiltros((f) => ({ ...f, ...patch })); setPagina(1); };
  const limparFiltros = () => { setFiltros(FILTROS_VAZIOS); setVminTxt(''); setVmaxTxt(''); setPagina(1); };
  const alternarCat = (c: Categoria) => setF({ cat: filtros.cat.includes(c) ? filtros.cat.filter((x) => x !== c) : [...filtros.cat, c] });
  const trocarAba = (valor: string) => {
    setTipo(valor); setPagina(1);
    const da = categoriasDaAba(valor === 'entrada' ? 'entrada' : valor === '' ? 'todas' : 'saida', true);
    setFiltros((f) => ({ ...f, cat: f.cat.filter((c) => da.includes(c)) }));
  };

  const verPdf = (n: LinhaDoc) => {
    setDoc({ titulo: `${ROTULO_TIPO[n.tipo]} · NF ${n.numero || n.n_cod_nf} · ${n.parte_nome || ''}`, url: `/api/financeiro/notas/${n.id}/arquivo?tipo=pdf`, nome: `NF-${n.numero || n.n_cod_nf}-${n.conta_omie}` });
  };

  const baixarXml = async (n: LinhaDoc) => {
    setOcupado(n.id); setAviso('');
    try {
      const r = await fetch(`/api/financeiro/notas/${n.id}/arquivo?tipo=xml`, { headers: await authHeaders() });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (j.omieFora) setOmieFora(true);
        setAviso(j.erro || `Não foi possível obter o XML (${r.status})`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `NF-${n.numero || n.n_cod_nf}-${n.conta_omie}.xml`; a.click();
      URL.revokeObjectURL(url);
      carregar();
    } finally { setOcupado(null); }
  };

  const guardarAgora = async (n: LinhaDoc) => {
    setOcupado(n.id); setAviso('');
    try {
      const r = await fetch(`/api/financeiro/notas/${n.id}/guardar`, { method: 'POST', headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (j.omieFora) { setOmieFora(true); setAviso('Omie indisponível agora — a nota fica na fila e o portal tenta de novo sozinho.'); }
      else if (j.bloqueio) setAviso('A Omie bloqueou as consultas por alguns minutos. A fila continua depois.');
      else if (j.pendente) setAviso('A Omie ainda não concluiu esta nota (recebimento pendente).');
      else if (!j.ok) setAviso(j.erro || 'A Omie não devolveu o documento.');
      else { setOmieFora(false); setAviso(`Guardada: PDF ${j.pdf ? 'ok' : 'não'} · XML ${j.xml ? 'ok' : 'não'}.`); }
      carregar();
    } finally { setOcupado(null); }
  };

  const indexar = async () => {
    setIndexando(true); setAviso('');
    try {
      const r = await fetch('/api/financeiro/notas/indexar?limite=30', { method: 'POST', headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setAviso(j.erro || `Erro ${r.status}`);
      else {
        const l = j.lote || {};
        const v = j.indexadas?.vinculos;
        setAviso(`Indexadas: ${j.indexadas?.entrada ?? 0} entradas, ${j.indexadas?.saida ?? 0} saídas${v ? `; vínculos atualizados: ${v.nfe} NF-e, ${v.nfse} NFS-e` : j.indexadas?.vinculosErro ? ' (vínculos: aplicar sql/notas-fiscais-vinculos.sql)' : ''}. Lote: ${l.processadas ?? 0} processadas, ${l.completas ?? 0} completas${l.paradoPor ? ` — parou: ${l.paradoPor}` : ''}.`);
        if (l.paradoPor === 'omieFora') setOmieFora(true);
      }
      carregar();
    } finally { setIndexando(false); }
  };

  // quem não tem Recebimentos não vê nota de entrada (o servidor decide; a prop só esconde antes da 1ª resposta)
  const mostraEntrada = podeEntrada && resp?.podeEntrada !== false;
  const aba = tipo === 'entrada' ? 'entrada' : tipo === '' ? 'todas' : 'saida';
  const catsAba = categoriasDaAba(aba, mostraEntrada);
  const nFiltros = contarFiltrosColuna(filtros);
  const soma = resp?.soma;
  const resumoFiltros = descreverFiltros({ conta, aba, de, ate, q: q.trim(), campo, filtros });
  const abas: Array<{ id: string; nome: string; fa: string; cor: string; valor: string }> = [
    { id: 'saida', nome: 'Saída', fa: 'fa-arrow-up', cor: '#9333ea', valor: 'saida' },
    ...(mostraEntrada ? [{ id: 'entrada', nome: 'Entrada', fa: 'fa-arrow-down', cor: '#059669', valor: 'entrada' }] : []),
    { id: 'todas', nome: 'Todas', fa: 'fa-layer-group', cor: AZUL, valor: '' },
  ];
  const campoInfo = CAMPOS_BUSCA.find((c) => c.id === campo) || CAMPOS_BUSCA[0];
  const mostrarBateu = campo === 'auto' && !!q.trim();

  return (
    <div className="nf-pagina" style={{ padding: 'clamp(12px, 2vw, 28px)', color: 'var(--portal-text, #0f172a)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{ESTILO_NOTAS}</style>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ fontSize: 15.5, color: 'var(--portal-text-secondary, #475569)' }}>
          {mostraEntrada ? 'Entradas e saídas' : 'Notas de saída (NF-e e NFS-e)'} guardadas no portal. Continuam abrindo mesmo com o Omie fora.
          {mostraEntrada && <Link href="/estoque/notas-entrada" style={{ color: AZUL, textDecoration: 'none', marginLeft: 10 }}>Notas de entrada: itens e contas a pagar</Link>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {isAdmin && (
            <button onClick={indexar} disabled={indexando} style={{ ...btn, cursor: indexando ? 'wait' : 'pointer' }}>
              <RefreshCw size={13} className={indexando ? 'animate-spin' : ''} /> {indexando ? 'Rodando…' : 'Indexar e guardar agora'}
            </button>
          )}
          <ContaSelector />
        </div>
      </div>

      {omieFora && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 14px', fontSize: 15.5, color: '#92400e' }}>
          <CloudOff size={16} /> Omie indisponível: mostrando só o que já está guardado. Notas sem documento guardado ficam na fila e são buscadas quando a Omie voltar.
        </div>
      )}
      {resp?.vinculosFaltando && (
        <div style={{ fontSize: 15.5, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '10px 14px' }}>
          Busca por pedido, OS e máquina ainda não instalada no banco (aplicar <code>sql/notas-fiscais-vinculos.sql</code>). Por enquanto a busca é só por nº, chave, cliente e CNPJ.
        </div>
      )}
      {aviso && <div style={{ fontSize: 15.5, color: 'var(--portal-text, #0f172a)', background: 'var(--portal-bg-secondary, #f8fafc)', border: '1px solid var(--border, #e2e8f0)', borderRadius: 12, padding: '10px 14px' }}>{aviso}</div>}

      {/* Saída × Entrada */}
      <div className="nf-abas" role="tablist" aria-label="Tipo de nota">
        {abas.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} className={`nf-aba${aba === a.id ? ' nf-aba-on' : ''}`} style={{ ['--c' as string]: a.cor }} onClick={() => trocarAba(a.valor)}>
            <span className="nf-aba-ico"><i className={`fa-solid ${a.fa}`} /></span> {a.nome}
          </button>
        ))}
        <span style={{ marginLeft: 'auto', alignSelf: 'center', fontSize: 15, color: apagado }}>Da mais nova para a mais velha; clique no título da coluna para mudar</span>
      </div>

      {/* Busca (acima dos filtros) */}
      <div style={{ ...cartao, display: 'flex', gap: 8, padding: '10px 12px', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <Search size={17} style={{ position: 'absolute', left: 13, top: '50%', transform: 'translateY(-50%)', color: apagado }} />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder={`Buscar: ${campoInfo.placeholder}`} style={{ ...inp, width: '100%', height: 42, fontSize: 16.5, paddingLeft: 40 }} aria-label="Buscar" />
        </div>
        <select value={campo} onChange={(e) => { setCampo(ehCampoBusca(e.target.value) ? e.target.value : 'auto'); setPagina(1); }} style={{ ...inp, height: 42 }} title="Em que campo buscar" aria-label="Buscar em">
          {CAMPOS_BUSCA.map((c) => <option key={c.id} value={c.id}>{c.id === 'auto' ? 'em: Tudo' : `em: ${c.label}`}</option>)}
        </select>
        {q && <button type="button" onClick={() => { setQ(''); setPagina(1); }} style={{ ...btn, height: 42 }} title="Limpar a busca" aria-label="Limpar a busca"><i className="fa-solid fa-xmark" /></button>}
      </div>

      {/* Filtros */}
      <div style={{ ...cartao, display: 'flex', gap: 12, padding: '12px 16px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={rotulo}>Período (emissão)</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {PRESETS.map((p) => {
              const ativo = p.dias == null ? !de && !ate : de === menosDias(p.dias) && ate === hojeLocal();
              return <button key={p.label} onClick={() => { setDe(p.dias == null ? '' : menosDias(p.dias)); setAte(p.dias == null ? '' : hojeLocal()); setPagina(1); }} style={{ ...btn, padding: '0 10px', background: ativo ? AZUL : btn.background, color: ativo ? '#fefefe' : btn.color, borderColor: ativo ? AZUL : undefined }}>{p.label}</button>;
            })}
            <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPagina(1); }} style={inp} />
            <span style={{ fontSize: 14.5, color: apagado }}>até</span>
            <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPagina(1); }} style={inp} />
          </div>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {nFiltros > 0 && (
            <button type="button" onClick={limparFiltros} style={btn} title="Tira os filtros do cabeçalho da tabela (tipo, nº, cliente, pedido/OS, máquina, valor, documento)">
              <i className="fa-solid fa-filter-circle-xmark" /> Limpar filtros ({nFiltros})
            </button>
          )}
          {resp?.podeRelatorios && (
            <button type="button" onClick={() => setRelatorios(true)} style={{ ...btn, background: '#15803d', borderColor: '#15803d', color: '#fefefe' }} title="Relatórios prontos (por mês, tipo, máquina, cliente…) com os filtros da tela — fica registrado">
              <i className="fa-solid fa-file-export" /> Exportar relatórios
            </button>
          )}
        </div>
      </div>

      {erro && (
        <div style={{ color: '#dc2626', fontSize: 15.5 }}>{erro}</div>
      )}
      {carregando && !resp && <div style={{ color: apagado, fontSize: 15.5 }}>Carregando…</div>}

      {resp && (
        <>
          {/* Total dos filtros (todas as páginas) */}
          <div className="nf-total" style={cartao}>
            <div className="nf-total-main">
              <span>Total dos filtros{carregando ? ' · atualizando…' : ''}</span>
              <b>{soma ? fmtRS(soma.valor) : '—'}</b>
              <small>
                {resp.total.toLocaleString('pt-BR')} nota(s)
                {soma && soma.canceladas > 0 ? <> · {soma.canceladas} cancelada(s) fora do total ({fmtRS(soma.valorCanceladas)})</> : null}
                {resp.somaErro ? <span style={{ color: '#b45309' }}> · {resp.somaErro}</span> : null}
              </small>
            </div>
            {soma && soma.porCategoria.length > 0 && (
              <div className="nf-total-cats">
                {soma.porCategoria.map((c) => {
                  const cat = ehCategoria(c.id) ? c.id : null;
                  const on = !!cat && filtros.cat.length === 1 && filtros.cat[0] === cat;
                  return (
                    <button key={c.id} type="button" disabled={!cat || !!resp.categoriaFaltando} onClick={() => cat && setF({ cat: on ? [] : [cat] })}
                      title={cat ? `${DICA_CATEGORIA[cat]} — clique para ${on ? 'tirar o filtro' : 'filtrar só este tipo'}` : 'NF-e sem classificação'}
                      style={{ ['--c' as string]: cat ? COR_CATEGORIA[cat] : '#64748b' }} className={`nf-cat${on ? ' nf-cat-on' : ''}`}>
                      <span className="nf-cat-nome">{c.rotulo}</span>
                      <span className="nf-cat-val">{fmtRS(c.valor)}</span>
                      <span className="nf-cat-n">{c.notas.toLocaleString('pt-BR')} nota(s)</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {resp.categoriaFaltando && (
            <div style={{ fontSize: 15, color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 12, padding: '8px 14px' }}>
              Separação da NF-e em Peças / Máquinas ainda não instalada no banco (aplicar <code>sql/notas-fiscais-categoria.sql</code>). Por enquanto o tipo é só NF-e, NFS-e ou Entrada.
            </div>
          )}
          <div style={{ fontSize: 15.5, color: 'var(--portal-text-secondary, #475569)' }}>
            {resp.total.toLocaleString('pt-BR')} notas · página {resp.pagina} de {resp.totalPaginas}
            {q.trim() && campo !== 'auto' ? <> · buscando <strong>{q.trim()}</strong> em {campoInfo.label}</> : null}
            {q.trim() && campo === 'os' ? <span style={{ color: apagado }}> (NFS-e da OS + NF-e das peças ligadas a ela)</span> : null}
            {resp.numeroComoTexto && ordem.coluna === 'numero' ? <span style={{ color: '#b45309' }}> · nº ordenado como texto (aplicar sql/notas-fiscais-ordem.sql para ordem numérica)</span> : null}
          </div>
          <div style={{ ...cartao, overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 1240, borderCollapse: 'collapse' }}>
              <thead><tr>
                {CABECALHO.map((h, i) => {
                  if (!h.col) return <th key={i} style={th}>{h.label}</th>;
                  const ativa = ordem.coluna === h.col;
                  const titulo = ativa ? (ordem.dir === 'asc' ? 'Ordenado de A a Z — clique para inverter' : 'Ordenado de Z a A — clique para inverter') : 'Clique para ordenar por esta coluna';
                  return (
                    <th key={i} style={{ ...th, cursor: 'pointer', userSelect: 'none', color: ativa ? AZUL : th.color }} onClick={() => ordenar(h.col!)} title={titulo} aria-sort={ativa ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {h.label}
                        {ativa ? (ordem.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
                      </span>
                    </th>
                  );
                })}
              </tr>
              <tr>
                <th style={thFiltro}>
                  <button type="button" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMenuTipo(menuTipo ? null : { x: r.left, y: r.bottom + 4 }); }}
                    style={{ ...inpF, ...ativoF(filtros.cat.length > 0), display: 'inline-flex', alignItems: 'center', justifyContent: 'space-between', gap: 6, cursor: 'pointer', textAlign: 'left' }}
                    aria-haspopup="menu" aria-expanded={!!menuTipo} title="Filtrar por tipo de nota">
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{filtros.cat.length === 0 ? 'Todos' : filtros.cat.length === 1 ? ROTULO_CATEGORIA[filtros.cat[0]] : `${filtros.cat.length} tipos`}</span>
                    <i className="fa-solid fa-chevron-down" style={{ fontSize: 10, opacity: 0.6 }} />
                  </button>
                </th>
                <th style={thFiltro}><input value={filtros.numero} onChange={(e) => setF({ numero: e.target.value })} placeholder="nº ou chave" aria-label="Filtrar nº da nota" style={{ ...inpF, ...ativoF(!!filtros.numero) }} /></th>
                <th style={thFiltro}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPagina(1); }} aria-label="Emissão a partir de" title="Emissão a partir de" style={{ ...inpF, ...ativoF(!!de), padding: '0 4px' }} />
                    <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPagina(1); }} aria-label="Emissão até" title="Emissão até" style={{ ...inpF, ...ativoF(!!ate), padding: '0 4px' }} />
                  </div>
                </th>
                <th style={thFiltro}><input value={filtros.parte} onChange={(e) => setF({ parte: e.target.value })} placeholder="nome ou CPF/CNPJ" aria-label="Filtrar cliente ou fornecedor" style={{ ...inpF, ...ativoF(!!filtros.parte) }} /></th>
                <th style={thFiltro}><input value={filtros.pedido} onChange={(e) => setF({ pedido: e.target.value })} placeholder="nº PV ou OS" aria-label="Filtrar pedido ou OS" style={{ ...inpF, ...ativoF(!!filtros.pedido) }} /></th>
                <th style={thFiltro}><input value={filtros.maquina} onChange={(e) => setF({ maquina: e.target.value })} placeholder="chassi ou modelo" aria-label="Filtrar máquina" style={{ ...inpF, ...ativoF(!!filtros.maquina) }} /></th>
                <th style={thFiltro}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <input value={vminTxt} inputMode="decimal" onChange={(e) => { setVminTxt(e.target.value); setF({ vmin: numeroBR(e.target.value) }); }} placeholder="de R$" aria-label="Valor mínimo" style={{ ...inpF, ...ativoF(filtros.vmin != null) }} />
                    <input value={vmaxTxt} inputMode="decimal" onChange={(e) => { setVmaxTxt(e.target.value); setF({ vmax: numeroBR(e.target.value) }); }} placeholder="até R$" aria-label="Valor máximo" style={{ ...inpF, ...ativoF(filtros.vmax != null) }} />
                  </div>
                </th>
                <th style={thFiltro}>
                  <select value={filtros.situacao} onChange={(e) => setF({ situacao: e.target.value as SituacaoDoc })} aria-label="Filtrar documento" style={{ ...inpF, ...ativoF(!!filtros.situacao) }}>
                    <option value="">Todos</option>
                    <option value="completa">Guardadas (PDF + XML)</option>
                    <option value="incompleta">Falta PDF ou XML</option>
                    <option value="sem_documento">Sem documento na Omie</option>
                  </select>
                </th>
                <th style={thFiltro}>
                  {nFiltros > 0 && <button type="button" onClick={limparFiltros} style={{ ...linkBtn, fontSize: 14, whiteSpace: 'nowrap' }} title="Limpar os filtros do cabeçalho"><i className="fa-solid fa-xmark" /> Limpar</button>}
                </th>
              </tr></thead>
              <tbody>
                {resp.notas.map((n) => {
                  const s = selo(n);
                  const c = COR_SELO[s];
                  const bateu = mostrarBateu ? ondeBateu(n, q) : [];
                  const chassi = chassiPrincipal(n.maquina);
                  return (
                    <tr key={n.id} className="nf-tr" style={{ opacity: n.cancelada ? 0.55 : 1 }}>
                      <td style={td}>
                        {(() => { const cat = categoriaDe(n); return (
                          <span className="nf-tipo" style={{ ['--c' as string]: cat ? COR_CATEGORIA[cat] : '#b45309' }} title={cat ? DICA_CATEGORIA[cat] : 'NF-e (sem classificação)'}>{rotuloCategoria(n)}</span>
                        ); })()}
                        {conta === '' && <div style={{ fontSize: 14.5, color: apagado }}>{n.conta_omie}</div>}
                      </td>
                      <td style={td}>
                        {n.numero ? <button type="button" className="nf-num" aria-haspopup="menu" aria-expanded={menuNf?.n.id === n.id} title="Abrir PDF ou XML" onClick={(e) => abrirMenuNf(n, e.currentTarget)}><small style={{ fontSize: 13, color: AZUL }}>NF</small>{n.numero}</button> : '—'}{n.serie ? <span style={{ color: apagado, marginLeft: 6, fontSize: 14.5 }}>série {n.serie}</span> : null}
                        {n.cancelada && <div style={{ fontSize: 14.5, color: '#dc2626', marginTop: 3 }}>Cancelada</div>}
                        {n.chave_nfe && <div style={{ fontSize: 13.5, color: apagado, marginTop: 3, fontVariantNumeric: 'tabular-nums' }} title={n.chave_nfe}>{n.chave_nfe.slice(0, 12)}…{n.chave_nfe.slice(-6)}</div>}
                        {bateu.length > 0 && (
                          <div style={{ marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {bateu.map((b) => <span key={b} style={{ fontSize: 13.5, padding: '1px 7px', borderRadius: 999, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>bateu em: {ROTULO_BATEU[b]}</span>)}
                          </div>
                        )}
                      </td>
                      <td style={td}>{fmtData(n.data_emissao)}</td>
                      <td style={td}>
                        {n.parte_nome || <span style={{ color: apagado }}>—</span>}
                        {n.parte_doc && <div style={{ fontSize: 14.5, color: apagado, marginTop: 2 }}>{fmtDoc(n.parte_doc)}</div>}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {n.pedido_num && (
                          <div style={{ fontSize: 15.5 }}>
                            <span style={{ color: apagado }}>PV </span>
                            <Link href={linkPasta(n, { pv: n.pedido_num })} target="_blank" title="Abrir o pedido na Pasta Clientes" style={linkPastaSt}>{n.pedido_num}</Link>
                          </div>
                        )}
                        {n.os_num && (
                          <div style={{ fontSize: 15.5 }}>
                            <span style={{ color: apagado }}>OS </span>
                            <Link href={linkPasta(n, { os: n.os_num })} target="_blank" title="Abrir a OS na Pasta Clientes" style={linkPastaSt}>{n.os_num}</Link>
                          </div>
                        )}
                        {!n.pedido_num && !n.os_num && <span style={{ color: apagado }}>—</span>}
                      </td>
                      <td style={{ ...td, maxWidth: 230 }}>
                        {n.maquina ? (
                          <button onClick={() => buscar(chassi || n.maquina || '', 'maquina')} title={`Ver todas as notas desta máquina\n${n.maquina}`} style={{ ...linkBtn, color: 'var(--portal-text, #0f172a)', textAlign: 'left', whiteSpace: 'normal', fontSize: 15, lineHeight: 1.3 }}>
                            <Tractor size={12} color="#b45309" style={{ flex: '0 0 auto' }} /> <span>{n.maquina.length > 60 ? n.maquina.slice(0, 58) + '…' : n.maquina}</span>
                          </button>
                        ) : <span style={{ color: apagado }}>—</span>}
                      </td>
                      <td style={{ ...td, fontWeight: 500, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{n.valor != null ? fmtRS(n.valor) : '—'}</td>
                      <td style={td}>
                        <span title={n.ultimo_erro || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 14.5, padding: '3px 10px', borderRadius: 999, whiteSpace: 'nowrap', background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
                          {s === 'completa' ? <ShieldCheck size={12} /> : null}{ROTULO_SELO[s]}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <button onClick={() => verPdf(n)} style={linkBtn} title={n.pdf_path ? 'PDF guardado no portal' : 'Busca na Omie e guarda'}><FileText size={13} /> Ver PDF</button>
                          {podeXml && <button onClick={() => baixarXml(n)} disabled={ocupado === n.id} style={linkBtn} title={n.xml_path ? 'XML guardado no portal' : 'Busca na Omie e guarda'}><Download size={13} /> XML</button>}
                          {s !== 'completa' && <button onClick={() => guardarAgora(n)} disabled={ocupado === n.id} style={{ ...linkBtn, color: apagado }}><RefreshCw size={12} className={ocupado === n.id ? 'animate-spin' : ''} /> Guardar agora</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {resp.notas.length === 0 && <tr><td style={{ ...td, color: apagado, textAlign: 'center', padding: 24 }} colSpan={9}>Nenhuma nota com esses filtros.{q.trim() && (de || ate) ? ' O período está limitando — clique em "Tudo" no período para procurar em todas.' : ''}</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'center' }}>
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} style={{ ...btn, opacity: pagina <= 1 ? 0.45 : 1 }}>← Anterior</button>
            <span style={{ fontSize: 15.5, color: 'var(--portal-text-secondary, #475569)', fontVariantNumeric: 'tabular-nums' }}>{pagina} de {resp.totalPaginas}</span>
            <button onClick={() => setPagina((p) => p + 1)} disabled={pagina >= resp.totalPaginas} style={{ ...btn, opacity: pagina >= resp.totalPaginas ? 0.45 : 1 }}>Próxima →</button>
          </div>
        </>
      )}

      {menuNf && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setMenuNf(null)} />
          <div role="menu" className="nf-menu" style={{ left: menuNf.x, top: menuNf.y }}>
            <button type="button" role="menuitem" onClick={() => { verPdf(menuNf.n); setMenuNf(null); }}><FileText size={15} /> Ver PDF</button>
            {podeXml && <button type="button" role="menuitem" disabled={ocupado === menuNf.n.id} onClick={() => { baixarXml(menuNf.n); setMenuNf(null); }}><Download size={15} /> Baixar XML</button>}
          </div>
        </>
      )}

      {menuTipo && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 60 }} onClick={() => setMenuTipo(null)} />
          <div role="menu" className="nf-menu" style={{ left: menuTipo.x, top: menuTipo.y, minWidth: 240 }}>
            {catsAba.map((c) => (
              <label key={c} role="menuitemcheckbox" aria-checked={filtros.cat.includes(c)} title={DICA_CATEGORIA[c]}
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 11px', borderRadius: 8, cursor: 'pointer', fontSize: 15 }}>
                <input type="checkbox" checked={filtros.cat.includes(c)} onChange={() => alternarCat(c)} />
                <span style={{ width: 10, height: 10, borderRadius: 3, background: COR_CATEGORIA[c] }} />
                {ROTULO_CATEGORIA[c]}
              </label>
            ))}
            {resp?.categoriaFaltando && <div style={{ fontSize: 13, color: '#92400e', padding: '6px 11px' }}>Peças × Máquinas depende de sql/notas-fiscais-categoria.sql</div>}
            {filtros.cat.length > 0 && <button type="button" onClick={() => { setF({ cat: [] }); setMenuTipo(null); }}><i className="fa-solid fa-xmark" /> Todos os tipos</button>}
          </div>
        </>
      )}

      {relatorios && <RelatoriosNotas filtrosQs={filtrosQs} resumo={resumoFiltros} totalNotas={resp?.total ?? null} onClose={() => setRelatorios(false)} />}

      {doc && <VisualizadorDocumento key={doc.url} doc={doc} onClose={() => { setDoc(null); carregar(); }} />}
      {conta === '' && <div style={{ fontSize: 14.5, color: apagado }}>Mostrando as duas empresas: Nova e Castro</div>}
    </div>
  );
}
