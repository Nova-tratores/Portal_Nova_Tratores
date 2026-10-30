'use client';
// Tela /financeiro/notas: lista unificada do cache de notas fiscais, faixa de
// cobertura, filtros, selo por nota, Ver PDF (visualizador), Baixar XML,
// Guardar agora. Quando a Omie está fora, o que está guardado continua abrindo.
// Busca por campo (Tudo · Nº da nota · Pedido · OS · Cliente · Máquina) com
// deep-link ?campo=&q= ; colunas Pedido/OS (link pra Pasta Clientes) e Máquina.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { FileText, Download, RefreshCw, ShieldCheck, CloudOff, Database, Search, Tractor, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento';
import {
  CAMPOS_BUSCA, ROTULO_BATEU, ROTULO_SELO, ROTULO_TIPO, TIPOS, chassiPrincipal, ehCampoBusca, ehTipoFiltro, linkPasta, ondeBateu, percent, selo,
  alternarOrdem, ehOrdemPadrao, ordemParaParam, parseOrdem,
  type CampoBusca, type ColunaOrdem, type LinhaDoc, type Ordem, type Selo, type Cobertura,
} from '@/lib/notas/cache-regras';

interface Resp {
  notas: LinhaDoc[]; total: number; pagina: number; porPagina: number; totalPaginas: number;
  cobertura: Cobertura; ultimaRodada: { iniciado_em: string; status: string | null; detalhe: unknown } | null;
  podeIndexar: boolean; podeEntrada?: boolean; vinculosFaltando?: boolean; numeroComoTexto?: boolean; erro?: string; migracaoFaltando?: boolean;
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
function fmtQuando(iso: string | null | undefined) {
  if (!iso) return 'nunca';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora'; if (min < 60) return `${min} min atrás`; if (min < 1440) return `${Math.floor(min / 60)} h atrás`;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function fmtDoc(d: string | null) {
  if (!d) return '';
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
  return d;
}

const th: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem', verticalAlign: 'middle' };
const inp: React.CSSProperties = { padding: '9px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: '.82rem', outline: 'none', background: '#fff', color: '#333' };
const btn: React.CSSProperties = { padding: '7px 12px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.76rem', fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#dc2626', fontSize: '.76rem', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline', display: 'inline-flex', alignItems: 'center', gap: 4 };
const linkPastaSt: React.CSSProperties = { color: '#1d4ed8', textDecoration: 'none', fontWeight: 600 };
const rotulo: React.CSSProperties = { display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 };

export default function NotasFiscais({ podeXml, isAdmin, podeEntrada = true }: { podeXml: boolean; isAdmin: boolean; podeEntrada?: boolean }) {
  const { conta, contaParam } = useConta();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const campoUrl = sp.get('campo');
  const [tipo, setTipo] = useState(() => (ehTipoFiltro(sp.get('tipo')) ? String(sp.get('tipo')) : '')); // ?tipo=entrada|saida|… (redirect das telas aposentadas)
  const [de, setDe] = useState(() => (sp.get('q') ? '' : menosDias(90)));
  const [ate, setAte] = useState(() => (sp.get('q') ? '' : hojeLocal()));
  const [q, setQ] = useState(() => sp.get('q') || '');
  const [campo, setCampo] = useState<CampoBusca>(() => (ehCampoBusca(campoUrl) ? campoUrl : 'auto'));
  const [situacao, setSituacao] = useState('');
  const [soMaquinas, setSoMaquinas] = useState(false); // notas de máquinas (venda e compra, pelo chassi)
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

  // q/campo vivem também na URL (deep-link de outras telas; F5 mantém a busca)
  useEffect(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set('q', q.trim());
    if (campo !== 'auto') p.set('campo', campo);
    if (!ehOrdemPadrao(ordem)) p.set('ordem', ordemParaParam(ordem));
    const alvo = p.toString() ? `${pathname}?${p}` : pathname;
    if (`${window.location.pathname}${window.location.search}` !== alvo) router.replace(alvo, { scroll: false });
  }, [q, campo, ordem, pathname, router]);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    if (tipo) p.set('tipo', tipo);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    if (q.trim()) { p.set('q', q.trim()); if (campo !== 'auto') p.set('campo', campo); }
    if (situacao) p.set('situacao', situacao);
    if (soMaquinas) p.set('maquinas', '1');
    if (!ehOrdemPadrao(ordem)) p.set('ordem', ordemParaParam(ordem));
    return p.toString() + contaParam;
  }, [pagina, tipo, de, ate, q, campo, situacao, soMaquinas, ordem, contaParam]);

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

  const cob = resp?.cobertura;
  // quem não tem Recebimentos não vê nota de entrada (o servidor decide; a prop só esconde antes da 1ª resposta)
  const mostraEntrada = podeEntrada && resp?.podeEntrada !== false;
  const tiposVisiveis = mostraEntrada ? TIPOS : TIPOS.filter((t) => t !== 'entrada');
  const campoInfo = CAMPOS_BUSCA.find((c) => c.id === campo) || CAMPOS_BUSCA[0];
  const mostrarBateu = campo === 'auto' && !!q.trim();

  return (
    <div style={{ maxWidth: 1380, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Notas fiscais</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>{mostraEntrada ? 'Entradas e saídas' : 'Notas de saída (NF-e e NFS-e)'} guardadas no portal (PDF + XML) — continuam abrindo mesmo com a Omie fora</p>
        </div>
        <ContaSelector />
      </div>

      {mostraEntrada && (
        <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <Link href="/estoque/notas-entrada" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Notas de Entrada (itens e contas a pagar)</Link>
        </div>
      )}

      {/* Cobertura */}
      {cob && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '12px 16px', marginBottom: 14 }}>
          <Database size={16} color="#dc2626" />
          <span style={{ fontSize: '.82rem', color: '#444' }}><strong>{cob.total.toLocaleString('pt-BR')}</strong> notas{conta ? ` (${conta})` : ''}</span>
          <span style={{ fontSize: '.82rem', color: '#444' }}>PDF <strong>{percent(cob.comPdf, cob.total)}</strong></span>
          <span style={{ fontSize: '.82rem', color: '#444' }}>XML <strong>{percent(cob.comXml, cob.total)}</strong></span>
          <span style={{ fontSize: '.82rem', color: '#444' }}>completas <strong>{cob.completas.toLocaleString('pt-BR')}</strong></span>
          <span style={{ fontSize: '.82rem', color: '#737373' }}>na fila {cob.naFila.toLocaleString('pt-BR')}</span>
          <span style={{ fontSize: '.82rem', color: '#991b1b' }}>sem documento {cob.semDocumento.toLocaleString('pt-BR')}</span>
          <span style={{ fontSize: '.76rem', color: '#a3a3a3' }} title={resp?.ultimaRodada ? JSON.stringify(resp.ultimaRodada.detalhe) : ''}>última rodada: {fmtQuando(resp?.ultimaRodada?.iniciado_em)}{resp?.ultimaRodada?.status ? ` (${resp.ultimaRodada.status})` : ''}</span>
          {isAdmin && (
            <button onClick={indexar} disabled={indexando} style={{ ...btn, marginLeft: 'auto', cursor: indexando ? 'wait' : 'pointer' }}>
              <RefreshCw size={13} className={indexando ? 'animate-spin' : ''} /> {indexando ? 'Rodando…' : 'Indexar e guardar agora'}
            </button>
          )}
        </div>
      )}

      {omieFora && (
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '10px 14px', marginBottom: 12, fontSize: '.8rem', color: '#92400e' }}>
          <CloudOff size={16} /> <strong>Omie indisponível</strong> — mostrando só o que já está guardado. Notas sem documento guardado ficam na fila e são buscadas quando a Omie voltar.
        </div>
      )}
      {resp?.vinculosFaltando && (
        <div style={{ fontSize: '.78rem', color: '#92400e', background: '#fffbeb', border: '1px solid #fcd34d', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>
          Busca por pedido, OS e máquina ainda não instalada no banco (aplicar <code>sql/notas-fiscais-vinculos.sql</code>). Por enquanto a busca é só por nº, chave, cliente e CNPJ.
        </div>
      )}
      {aviso && <div style={{ fontSize: '.8rem', color: '#444', background: '#f5f5f5', border: '1px solid #e5e5e5', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>{aviso}</div>}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={rotulo}>Tipo</label>
          <select value={mostraEntrada || (tipo !== 'entrada' && tipo !== 'saida') ? tipo : ''} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} style={inp}>
            <option value="">{mostraEntrada ? 'Todas' : 'Todas (saída)'}</option>
            {mostraEntrada && <option value="saida">Saída (peças, máquinas e serviço)</option>}
            {tiposVisiveis.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={rotulo}>Período (emissão)</label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            {PRESETS.map((p) => {
              const ativo = p.dias == null ? !de && !ate : de === menosDias(p.dias) && ate === hojeLocal();
              return <button key={p.label} onClick={() => { setDe(p.dias == null ? '' : menosDias(p.dias)); setAte(p.dias == null ? '' : hojeLocal()); setPagina(1); }} style={{ ...btn, padding: '7px 10px', background: ativo ? '#fef2f2' : '#fff', color: ativo ? '#dc2626' : '#666', border: ativo ? '1px solid #fecaca' : '1px solid #e0e0e0' }}>{p.label}</button>;
            })}
            <input type="date" value={de} onChange={(e) => { setDe(e.target.value); setPagina(1); }} style={inp} />
            <span style={{ fontSize: '.76rem', color: '#a3a3a3' }}>até</span>
            <input type="date" value={ate} onChange={(e) => { setAte(e.target.value); setPagina(1); }} style={inp} />
          </div>
        </div>
        <div>
          <label style={rotulo}>Situação</label>
          <select value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(1); }} style={inp}>
            <option value="">Todas</option>
            <option value="completa">Guardadas (PDF + XML)</option>
            <option value="incompleta">Falta PDF ou XML</option>
            <option value="sem_documento">Sem documento na Omie</option>
          </select>
        </div>
        <div>
          <label style={rotulo}>Máquinas</label>
          <button type="button" onClick={() => { setSoMaquinas((v) => !v); setPagina(1); }}
            title="Só notas que citam máquina (chassi / nº de série) — vendas e compras de máquinas"
            style={{ ...inp, display: 'inline-flex', alignItems: 'center', gap: 7, cursor: 'pointer', fontWeight: 700, background: soMaquinas ? '#ecfeff' : (inp as React.CSSProperties).background, borderColor: soMaquinas ? '#0891B2' : undefined, color: soMaquinas ? '#0e7490' : undefined }}>
            <i className="fas fa-tractor" /> {soMaquinas ? 'Só máquinas' : 'Todas'}
          </button>
        </div>
        <div style={{ flex: 1, minWidth: 320 }}>
          <label style={rotulo}>Buscar</label>
          <div style={{ display: 'flex', gap: 6 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
              <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder={campoInfo.placeholder} style={{ ...inp, width: '100%', paddingLeft: 30 }} aria-label="Buscar" />
            </div>
            <select value={campo} onChange={(e) => { setCampo(ehCampoBusca(e.target.value) ? e.target.value : 'auto'); setPagina(1); }} style={inp} title="Em que campo buscar" aria-label="Buscar em">
              {CAMPOS_BUSCA.map((c) => <option key={c.id} value={c.id}>{c.id === 'auto' ? 'em: Tudo' : `em: ${c.label}`}</option>)}
            </select>
          </div>
        </div>
      </div>

      {erro && (
        <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>
      )}
      {carregando && !resp && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {resp && (
        <>
          <div style={{ fontSize: '.78rem', color: '#888', marginBottom: 8 }}>
            {resp.total.toLocaleString('pt-BR')} notas — página {resp.pagina}/{resp.totalPaginas}{carregando ? ' · atualizando…' : ''}
            {q.trim() && campo !== 'auto' ? <> · buscando <strong>{q.trim()}</strong> em {campoInfo.label}</> : null}
            {q.trim() && campo === 'os' ? <span style={{ color: '#a3a3a3' }}> (NFS-e da OS + NF-e das peças ligadas a ela)</span> : null}
            {resp.numeroComoTexto && ordem.coluna === 'numero' ? <span style={{ color: '#b45309' }}> · nº ordenado como texto (aplicar sql/notas-fiscais-ordem.sql para ordem numérica)</span> : null}
          </div>
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                {CABECALHO.map((h, i) => {
                  if (!h.col) return <th key={i} style={th}>{h.label}</th>;
                  const ativa = ordem.coluna === h.col;
                  const titulo = ativa ? (ordem.dir === 'asc' ? 'Ordenado de A a Z — clique para inverter' : 'Ordenado de Z a A — clique para inverter') : 'Clique para ordenar por esta coluna';
                  return (
                    <th key={i} style={{ ...th, cursor: 'pointer', userSelect: 'none', color: ativa ? '#dc2626' : th.color }} onClick={() => ordenar(h.col!)} title={titulo} aria-sort={ativa ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {h.label}
                        {ativa ? (ordem.dir === 'asc' ? <ArrowUp size={11} /> : <ArrowDown size={11} />) : <ArrowUpDown size={11} style={{ opacity: 0.35 }} />}
                      </span>
                    </th>
                  );
                })}
              </tr></thead>
              <tbody>
                {resp.notas.map((n) => {
                  const s = selo(n);
                  const c = COR_SELO[s];
                  const bateu = mostrarBateu ? ondeBateu(n, q) : [];
                  const chassi = chassiPrincipal(n.maquina);
                  return (
                    <tr key={n.id} style={{ opacity: n.cancelada ? 0.55 : 1 }}>
                      <td style={td}>
                        <span style={{ fontSize: '.72rem', fontWeight: 700, color: n.tipo === 'entrada' ? '#047857' : '#b45309' }}>{ROTULO_TIPO[n.tipo]}</span>
                        {conta === '' && <div style={{ fontSize: '.68rem', color: '#a3a3a3' }}>{n.conta_omie}</div>}
                      </td>
                      <td style={td}>
                        <strong>{n.numero || '—'}</strong>{n.serie ? <span style={{ color: '#a3a3a3' }}> / {n.serie}</span> : null}
                        {n.cancelada && <div style={{ fontSize: '.68rem', color: '#dc2626', fontWeight: 700 }}>CANCELADA</div>}
                        {n.chave_nfe && <div style={{ fontSize: '.64rem', color: '#bbb', fontFamily: 'monospace' }} title={n.chave_nfe}>{n.chave_nfe.slice(0, 12)}…{n.chave_nfe.slice(-6)}</div>}
                        {bateu.length > 0 && (
                          <div style={{ marginTop: 3, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                            {bateu.map((b) => <span key={b} style={{ fontSize: '.6rem', fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>bateu em: {ROTULO_BATEU[b]}</span>)}
                          </div>
                        )}
                      </td>
                      <td style={td}>{fmtData(n.data_emissao)}</td>
                      <td style={td}>
                        {n.parte_nome || <span style={{ color: '#c00' }}>—</span>}
                        {n.parte_doc && <div style={{ fontSize: '.68rem', color: '#a3a3a3' }}>{fmtDoc(n.parte_doc)}</div>}
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        {n.pedido_num && (
                          <div style={{ fontSize: '.76rem' }}>
                            <span style={{ color: '#a3a3a3' }}>PV </span>
                            <Link href={linkPasta(n, { pv: n.pedido_num })} target="_blank" title="Abrir o pedido na Pasta Clientes" style={linkPastaSt}>{n.pedido_num}</Link>
                          </div>
                        )}
                        {n.os_num && (
                          <div style={{ fontSize: '.76rem' }}>
                            <span style={{ color: '#a3a3a3' }}>OS </span>
                            <Link href={linkPasta(n, { os: n.os_num })} target="_blank" title="Abrir a OS na Pasta Clientes" style={linkPastaSt}>{n.os_num}</Link>
                          </div>
                        )}
                        {!n.pedido_num && !n.os_num && <span style={{ color: '#ddd' }}>—</span>}
                      </td>
                      <td style={{ ...td, maxWidth: 230 }}>
                        {n.maquina ? (
                          <button onClick={() => buscar(chassi || n.maquina || '', 'maquina')} title={`Ver todas as notas desta máquina\n${n.maquina}`} style={{ ...linkBtn, color: '#374151', textDecoration: 'none', textAlign: 'left', whiteSpace: 'normal', fontWeight: 500, fontSize: '.74rem', lineHeight: 1.25 }}>
                            <Tractor size={12} color="#b45309" style={{ flex: '0 0 auto' }} /> <span>{n.maquina.length > 60 ? n.maquina.slice(0, 58) + '…' : n.maquina}</span>
                          </button>
                        ) : <span style={{ color: '#ddd' }}>—</span>}
                      </td>
                      <td style={td}>{n.valor != null ? fmtRS(n.valor) : '—'}</td>
                      <td style={td}>
                        <span title={n.ultimo_erro || ''} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: '.7rem', fontWeight: 600, padding: '3px 9px', borderRadius: 999, background: c.bg, color: c.fg, border: `1px solid ${c.bd}` }}>
                          {s === 'completa' ? <ShieldCheck size={12} /> : null}{ROTULO_SELO[s]}
                        </span>
                      </td>
                      <td style={{ ...td, whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <button onClick={() => verPdf(n)} style={linkBtn} title={n.pdf_path ? 'PDF guardado no portal' : 'Busca na Omie e guarda'}><FileText size={13} /> Ver PDF</button>
                          {podeXml && <button onClick={() => baixarXml(n)} disabled={ocupado === n.id} style={linkBtn} title={n.xml_path ? 'XML guardado no portal' : 'Busca na Omie e guarda'}><Download size={13} /> XML</button>}
                          {s !== 'completa' && <button onClick={() => guardarAgora(n)} disabled={ocupado === n.id} style={{ ...linkBtn, color: '#737373' }}><RefreshCw size={12} className={ocupado === n.id ? 'animate-spin' : ''} /> Guardar agora</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {resp.notas.length === 0 && <tr><td style={{ ...td, color: '#a3a3a3' }} colSpan={9}>Nenhuma nota com esses filtros.{q.trim() && (de || ate) ? ' O período está limitando — clique em "Tudo" no período para procurar em todas.' : ''}</td></tr>}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} style={{ ...btn, color: pagina <= 1 ? '#ccc' : '#666' }}>← Anterior</button>
            <span style={{ fontSize: '.8rem', color: '#888' }}>{pagina}/{resp.totalPaginas}</span>
            <button onClick={() => setPagina((p) => p + 1)} disabled={pagina >= resp.totalPaginas} style={{ ...btn, color: pagina >= resp.totalPaginas ? '#ccc' : '#666' }}>Próxima →</button>
          </div>
        </>
      )}

      {doc && <VisualizadorDocumento key={doc.url} doc={doc} onClose={() => { setDoc(null); carregar(); }} />}
      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Modo Todas (NOVA + CASTRO)</div>}
    </div>
  );
}
