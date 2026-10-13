'use client';
// Tela /estoque/notas: lista unificada do cache de notas fiscais, faixa de
// cobertura, filtros, selo por nota, Ver PDF (visualizador), Baixar XML,
// Guardar agora. Quando a Omie está fora, o que está guardado continua abrindo.
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, Download, RefreshCw, ShieldCheck, CloudOff, Database, Search } from 'lucide-react';
import { authHeaders } from '@/lib/auth/client';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';
import VisualizadorDocumento, { type DocumentoVisualizavel } from '@/components/comum/VisualizadorDocumento';
import { ROTULO_SELO, ROTULO_TIPO, TIPOS, percent, selo, type LinhaDoc, type Selo, type Cobertura } from '@/lib/notas/cache-regras';

interface Resp {
  notas: LinhaDoc[]; total: number; pagina: number; porPagina: number; totalPaginas: number;
  cobertura: Cobertura; ultimaRodada: { iniciado_em: string; status: string | null; detalhe: unknown } | null;
  podeIndexar: boolean; erro?: string; migracaoFaltando?: boolean;
}

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

export default function NotasFiscais({ podeXml, isAdmin }: { podeXml: boolean; isAdmin: boolean }) {
  const { conta, contaParam } = useConta();
  const [tipo, setTipo] = useState('');
  const [de, setDe] = useState(menosDias(90));
  const [ate, setAte] = useState(hojeLocal());
  const [q, setQ] = useState('');
  const [situacao, setSituacao] = useState('');
  const [pagina, setPagina] = useState(1);
  const [resp, setResp] = useState<Resp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [omieFora, setOmieFora] = useState(false);
  const [doc, setDoc] = useState<DocumentoVisualizavel | null>(null);
  const [ocupado, setOcupado] = useState<number | null>(null);
  const [aviso, setAviso] = useState('');
  const [indexando, setIndexando] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams({ pagina: String(pagina) });
    if (tipo) p.set('tipo', tipo);
    if (de) p.set('de', de);
    if (ate) p.set('ate', ate);
    if (q.trim()) p.set('q', q.trim());
    if (situacao) p.set('situacao', situacao);
    return p.toString() + contaParam;
  }, [pagina, tipo, de, ate, q, situacao, contaParam]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const r = await fetch(`/api/estoque/notas?${qs}`, { headers: await authHeaders(), cache: 'no-store' });
      const d = (await r.json()) as Resp;
      if (!r.ok || d.erro) { setErro(d.erro || `Erro ${r.status}`); setResp(null); return; }
      setResp(d);
    } catch (e) { setErro((e as Error).message); } finally { setCarregando(false); }
  }, [qs]);
  useEffect(() => { const t = setTimeout(() => { carregar(); }, 300); return () => clearTimeout(t); }, [carregar]);

  const verPdf = (n: LinhaDoc) => {
    setDoc({ titulo: `${ROTULO_TIPO[n.tipo]} · NF ${n.numero || n.n_cod_nf} · ${n.parte_nome || ''}`, url: `/api/estoque/notas/${n.id}/arquivo?tipo=pdf`, nome: `NF-${n.numero || n.n_cod_nf}-${n.conta_omie}` });
  };

  const baixarXml = async (n: LinhaDoc) => {
    setOcupado(n.id); setAviso('');
    try {
      const r = await fetch(`/api/estoque/notas/${n.id}/arquivo?tipo=xml`, { headers: await authHeaders() });
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
      const r = await fetch(`/api/estoque/notas/${n.id}/guardar`, { method: 'POST', headers: await authHeaders() });
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
      const r = await fetch('/api/estoque/notas/indexar?limite=30', { method: 'POST', headers: await authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setAviso(j.erro || `Erro ${r.status}`);
      else {
        const l = j.lote || {};
        setAviso(`Indexadas: ${j.indexadas?.entrada ?? 0} entradas, ${j.indexadas?.saida ?? 0} saídas. Lote: ${l.processadas ?? 0} processadas, ${l.completas ?? 0} completas${l.paradoPor ? ` — parou: ${l.paradoPor}` : ''}.`);
        if (l.paradoPor === 'omieFora') setOmieFora(true);
      }
      carregar();
    } finally { setIndexando(false); }
  };

  const cob = resp?.cobertura;

  return (
    <div style={{ maxWidth: 1280, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Notas fiscais</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>Entradas e saídas guardadas no portal (PDF + XML) — continuam abrindo mesmo com a Omie fora</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque/notas-entrada" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Notas de Entrada (itens e contas a pagar)</Link>
      </div>

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
      {aviso && <div style={{ fontSize: '.8rem', color: '#444', background: '#f5f5f5', border: '1px solid #e5e5e5', borderRadius: 10, padding: '8px 12px', marginBottom: 12 }}>{aviso}</div>}

      {/* Filtros */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>Tipo</label>
          <select value={tipo} onChange={(e) => { setTipo(e.target.value); setPagina(1); }} style={inp}>
            <option value="">Todas</option>
            {TIPOS.map((t) => <option key={t} value={t}>{ROTULO_TIPO[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>Período (emissão)</label>
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
          <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>Situação</label>
          <select value={situacao} onChange={(e) => { setSituacao(e.target.value); setPagina(1); }} style={inp}>
            <option value="">Todas</option>
            <option value="completa">Guardadas (PDF + XML)</option>
            <option value="incompleta">Falta PDF ou XML</option>
            <option value="sem_documento">Sem documento na Omie</option>
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>Buscar</label>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#a3a3a3' }} />
            <input value={q} onChange={(e) => { setQ(e.target.value); setPagina(1); }} placeholder="nº da nota, chave, cliente/fornecedor ou CNPJ" style={{ ...inp, width: '100%', paddingLeft: 30 }} />
          </div>
        </div>
      </div>

      {erro && (
        <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>
          {erro}{resp?.migracaoFaltando ? '' : ''}
        </div>
      )}
      {carregando && !resp && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {resp && (
        <>
          <div style={{ fontSize: '.78rem', color: '#888', marginBottom: 8 }}>{resp.total.toLocaleString('pt-BR')} notas — página {resp.pagina}/{resp.totalPaginas}{carregando ? ' · atualizando…' : ''}</div>
          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>{['Tipo', 'Nº / Série', 'Emissão', 'Cliente / Fornecedor', 'Valor', 'Documento', ''].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>
                {resp.notas.map((n) => {
                  const s = selo(n);
                  const c = COR_SELO[s];
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
                      </td>
                      <td style={td}>{fmtData(n.data_emissao)}</td>
                      <td style={td}>
                        {n.parte_nome || <span style={{ color: '#c00' }}>—</span>}
                        {n.parte_doc && <div style={{ fontSize: '.68rem', color: '#a3a3a3' }}>{fmtDoc(n.parte_doc)}</div>}
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
                {resp.notas.length === 0 && <tr><td style={{ ...td, color: '#a3a3a3' }} colSpan={7}>Nenhuma nota com esses filtros.</td></tr>}
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
