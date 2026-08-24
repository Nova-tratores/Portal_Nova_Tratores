'use client';
// Notas de Entrada. Portado de GET /notas-entrada (server.js:11043) consumindo
// /api/estoque/notas-entrada{,/backfill-enriquecimento{,/status}}, /contas-pagar-nf, /danfe.
import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';
import { fmtRS } from '@/components/estoque/ui';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

interface ItemNF { descricao?: string; codigo_produto?: string; quantidade?: number; valor_unitario?: number; valor_total?: number }
interface Nota {
  id: number; ncod_nf?: number; numero_nf?: string; serie?: string; data_emissao?: string;
  nome_emitente?: string; categoria?: string; valor_nf?: number; valor_produtos?: number;
  emitente?: { cnpj_cpf?: string };
  itens?: ItemNF[];
}
interface NotasResp { notas: Nota[]; total: number; pagina: number; porPagina: number; totalPaginas: number; erro?: string }
interface Titulo { numero_documento: string; data_vencimento: string; valor_documento: number; status_titulo: string; data_pagamento?: string; valor_pago?: number }
interface BackfillStatus { rodando: boolean; etapa?: string; processadas?: number; total?: number; emitentes_preenchidos?: number; categorias_preenchidas?: number; finalizadoEm?: string | null; erro?: string | null }

const thStyle: React.CSSProperties = { background: '#fafafa', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #eee', fontWeight: 600, whiteSpace: 'nowrap' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f5f5f5', color: '#444', fontSize: '.82rem' };
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', color: '#dc2626', fontSize: '.74rem', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' };

export default function NotasEntradaPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [ano, setAno] = useState(now.getFullYear());
  const [nf, setNf] = useState('');
  const [pagina, setPagina] = useState(1);
  const [resp, setResp] = useState<NotasResp | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [expandida, setExpandida] = useState<number | null>(null);
  const [titulos, setTitulos] = useState<Record<number, Titulo[] | 'loading'>>({});
  const [backfill, setBackfill] = useState<BackfillStatus | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Seleção (marcar/somar) — abrange todas as páginas do período filtrado.
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set());
  const [valorPorId, setValorPorId] = useState<Record<number, number>>({});
  const [carregandoTodas, setCarregandoTodas] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const nfParam = nf.trim() ? `&nf=${encodeURIComponent(nf.trim())}` : `&mes=${mes}&ano=${ano}`;
      const r = await fetch(`/api/estoque/notas-entrada?pagina=${pagina}${nfParam}${contaParam}`);
      const d = (await r.json()) as NotasResp;
      if (d.erro) { setErro(d.erro); return; }
      setResp(d);
    } catch (ex) {
      setErro('Erro: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [mes, ano, nf, pagina, contaParam]);

  useEffect(() => { carregar(); }, [carregar]);

  // Acumula os valores das notas que vão sendo exibidas (para somar a seleção).
  useEffect(() => {
    if (!resp?.notas) return;
    setValorPorId((prev) => {
      const next = { ...prev };
      resp.notas.forEach((n) => { next[n.id] = n.valor_nf ?? 0; });
      return next;
    });
  }, [resp]);

  // Trocar de período / conta / busca limpa a seleção.
  useEffect(() => { setSelecionados(new Set()); setValorPorId({}); }, [mes, ano, nf, contaParam]);

  const toggleSelecao = useCallback((id: number) => {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const selecionarTodasPeriodo = useCallback(async () => {
    setCarregandoTodas(true);
    try {
      const nfParam = nf.trim() ? `&nf=${encodeURIComponent(nf.trim())}` : `&mes=${mes}&ano=${ano}`;
      const r = await fetch(`/api/estoque/notas-entrada?todas=1${nfParam}${contaParam}`);
      const d = await r.json();
      if (d.erro) { alert(d.erro); return; }
      const notas = (d.notas || []) as Array<{ id: number; valor_nf: number }>;
      setValorPorId((prev) => {
        const next = { ...prev };
        notas.forEach((n) => { next[n.id] = n.valor_nf ?? 0; });
        return next;
      });
      setSelecionados(new Set(notas.map((n) => n.id)));
    } catch (ex) {
      alert('Erro ao selecionar todas: ' + (ex as Error).message);
    } finally {
      setCarregandoTodas(false);
    }
  }, [mes, ano, nf, contaParam]);

  const limparSelecao = useCallback(() => setSelecionados(new Set()), []);

  const totalSelecionado = useMemo(() => {
    let s = 0;
    selecionados.forEach((id) => { s += valorPorId[id] || 0; });
    return s;
  }, [selecionados, valorPorId]);

  const todasDoPeriodoSelecionadas = !!resp && resp.total > 0 && selecionados.size >= resp.total;

  const verContasPagar = useCallback(async (n: Nota) => {
    setTitulos((t) => ({ ...t, [n.id]: 'loading' }));
    const cnpj = n.emitente?.cnpj_cpf || '';
    const r = await fetch(`/api/estoque/contas-pagar-nf?numero_nf=${encodeURIComponent(n.numero_nf || '')}&cnpj=${encodeURIComponent(cnpj)}&data_emissao=${encodeURIComponent(n.data_emissao || '')}${contaParam}`);
    const d = await r.json();
    setTitulos((t) => ({ ...t, [n.id]: d.titulos || [] }));
  }, [contaParam]);

  const verDanfe = useCallback(async (n: Nota) => {
    // Abre a aba SINCRONAMENTE no clique — se abrir depois do await, o browser
    // bloqueia o popup (era o motivo de "a DANFE nunca abrir").
    const w = window.open('', '_blank');
    const r = await fetch(`/api/estoque/danfe?ncod_nf=${n.ncod_nf || ''}&numero_nf=${encodeURIComponent(n.numero_nf || '')}&serie=${encodeURIComponent(n.serie || '')}${contaParam}`);
    const d = await r.json();
    if (d.url) { if (w) w.location.href = d.url; else window.open(d.url, '_blank'); }
    else { if (w) w.close(); alert('DANFE indisponível: ' + (d.erro || '')); }
  }, [contaParam]);

  const pollStatus = useCallback(() => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(async () => {
      const r = await fetch(`/api/estoque/notas-entrada/backfill-enriquecimento/status?${contaParam.replace(/^&/, '')}`);
      const d = (await r.json()) as BackfillStatus;
      setBackfill(d);
      if (!d.rodando && pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; carregar(); }
    }, 2000);
  }, [contaParam, carregar]);

  const iniciarBackfill = useCallback(async () => {
    const r = await fetch(`/api/estoque/notas-entrada/backfill-enriquecimento?mes=${mes}&ano=${ano}${contaParam}`, { method: 'POST' });
    const d = await r.json();
    if (d.erro && !d.status) { alert(d.erro); return; }
    setBackfill({ rodando: true, etapa: 'iniciando' });
    pollStatus();
  }, [mes, ano, contaParam, pollStatus]);

  useEffect(() => () => { if (pollRef.current) clearInterval(pollRef.current); }, []);

  if (!permLoading && userProfile && !pode('estoque', 'notas-entrada')) return <SemPermissao />;

  const anos: number[] = [];
  for (let y = now.getFullYear(); y >= 2022; y--) anos.push(y);

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ color: '#333', marginBottom: 4, fontSize: '1.4rem', fontWeight: 700 }}>Notas de Entrada</h1>
          <p style={{ color: '#888', fontSize: '.82rem', marginBottom: 0 }}>NF-e de fornecedores, contas a pagar e DANFE</p>
        </div>
        <ContaSelector />
      </div>

      <div style={{ margin: '14px 0', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <Link href="/estoque" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>← Busca</Link>
        {pode('estoque', 'dashboard') && (<Link href="/estoque/dashboard" style={{ color: '#dc2626', textDecoration: 'none', fontSize: '.82rem', fontWeight: 600 }}>→ Dashboard</Link>)}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 18, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Sel label="Mês" value={mes} onChange={(v) => { setMes(parseInt(v)); setPagina(1); }} options={MESES.map((m, i) => ({ value: i + 1, label: m }))} />
        <Sel label="Ano" value={ano} onChange={(v) => { setAno(parseInt(v)); setPagina(1); }} options={anos.map((y) => ({ value: y, label: String(y) }))} />
        <div>
          <label style={{ display: 'block', color: '#888', fontSize: '.62rem', textTransform: 'uppercase', letterSpacing: '.5px', marginBottom: 3, fontWeight: 600 }}>Buscar NF</label>
          <input value={nf} onChange={(e) => { setNf(e.target.value); setPagina(1); }} placeholder="nº da NF" style={{ padding: '9px 12px', border: '1px solid #e0e0e0', borderRadius: 8, fontSize: '.82rem', outline: 'none', width: 140 }} />
        </div>
        <button onClick={iniciarBackfill} disabled={backfill?.rodando} style={{ padding: '9px 16px', border: '1px solid #e0e0e0', background: '#fff', color: '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: backfill?.rodando ? 'not-allowed' : 'pointer', marginLeft: 'auto' }}>
          {backfill?.rodando ? 'Enriquecendo…' : 'Enriquecer emitente/categoria'}
        </button>
      </div>

      {backfill && (
        <div style={{ fontSize: '.75rem', color: backfill.erro ? '#dc2626' : '#999', marginBottom: 12 }}>
          Backfill: {backfill.etapa} {backfill.total ? `(${backfill.processadas || 0}/${backfill.total})` : ''}
          {backfill.finalizadoEm && !backfill.rodando ? ` — concluído: ${backfill.emitentes_preenchidos || 0} emitentes, ${backfill.categorias_preenchidas || 0} categorias` : ''}
          {backfill.erro ? ` — erro: ${backfill.erro}` : ''}
        </div>
      )}

      {erro && <div style={{ color: '#dc2626', marginBottom: 12, fontSize: '.85rem' }}>{erro}</div>}
      {carregando && <div style={{ color: '#888', fontSize: '.85rem' }}>Carregando…</div>}

      {resp && !carregando && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>
            <div style={{ fontSize: '.78rem', color: '#888' }}>{resp.total} notas — página {resp.pagina}/{resp.totalPaginas || 1}</div>
            <button onClick={todasDoPeriodoSelecionadas ? limparSelecao : selecionarTodasPeriodo} disabled={carregandoTodas} style={{ ...linkBtn, cursor: carregandoTodas ? 'wait' : 'pointer' }}>
              {carregandoTodas ? 'Selecionando…' : todasDoPeriodoSelecionadas ? 'Limpar seleção' : `Selecionar todas do período (${resp.total})`}
            </button>
          </div>

          {selecionados.size > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 14px', marginBottom: 10 }}>
              <span style={{ fontSize: '.82rem', color: '#991b1b', fontWeight: 600 }}>{selecionados.size} {selecionados.size === 1 ? 'nota selecionada' : 'notas selecionadas'}</span>
              <span style={{ fontSize: '.95rem', color: '#dc2626', fontWeight: 700 }}>Total: {fmtRS(totalSelecionado)}</span>
              <button onClick={limparSelecao} style={{ ...linkBtn, marginLeft: 'auto' }}>Limpar</button>
            </div>
          )}

          <div style={{ overflowX: 'auto', background: '#fff', border: '1px solid #eee', borderRadius: 12 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...thStyle, width: 36, textAlign: 'center' }}>
                  <input type="checkbox" checked={todasDoPeriodoSelecionadas} onChange={todasDoPeriodoSelecionadas ? limparSelecao : selecionarTodasPeriodo} title="Selecionar todas do período" style={{ cursor: 'pointer' }} />
                </th>
                {['NF', 'Série', 'Emissão', 'Emitente', 'Categoria', 'Valor', ''].map((h, i) => <th key={i} style={thStyle}>{h}</th>)}
              </tr></thead>
              <tbody>
                {resp.notas.map((n) => (
                  <NotaRow key={n.id}
                    n={n}
                    expandida={expandida === n.id}
                    onToggle={() => setExpandida(expandida === n.id ? null : n.id)}
                    selecionado={selecionados.has(n.id)}
                    onToggleSelecao={() => toggleSelecao(n.id)}
                    titulos={titulos[n.id]}
                    onVerContasPagar={() => verContasPagar(n)}
                    onVerDanfe={() => verDanfe(n)}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 10, marginTop: 14, alignItems: 'center' }}>
            <button onClick={() => setPagina((p) => Math.max(1, p - 1))} disabled={pagina <= 1} style={pgBtn(pagina <= 1)}>← Anterior</button>
            <span style={{ fontSize: '.8rem', color: '#888' }}>{pagina}/{resp.totalPaginas || 1}</span>
            <button onClick={() => setPagina((p) => p + 1)} disabled={pagina >= (resp.totalPaginas || 1)} style={pgBtn(pagina >= (resp.totalPaginas || 1))}>Próxima →</button>
          </div>
        </>
      )}
      {conta === '' && <div style={{ fontSize: '.7rem', color: '#bbb', marginTop: 10 }}>Modo Todas (NOVA + CASTRO)</div>}
    </div>
  );
}

function NotaRow({ n, expandida, onToggle, selecionado, onToggleSelecao, titulos, onVerContasPagar, onVerDanfe }: {
  n: Nota; expandida: boolean; onToggle: () => void; selecionado: boolean; onToggleSelecao: () => void;
  titulos: Titulo[] | 'loading' | undefined; onVerContasPagar: () => void; onVerDanfe: () => void;
}) {
  return (
    <>
      <tr style={{ cursor: 'pointer', background: selecionado ? '#fff7f7' : undefined }} onClick={onToggle}>
        <td style={{ ...tdStyle, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
          <input type="checkbox" checked={selecionado} onChange={onToggleSelecao} style={{ cursor: 'pointer' }} />
        </td>
        <td style={tdStyle}>{n.numero_nf}</td>
        <td style={tdStyle}>{n.serie}</td>
        <td style={tdStyle}>{n.data_emissao}</td>
        <td style={tdStyle}>{n.nome_emitente || <span style={{ color: '#c00' }}>—</span>}</td>
        <td style={tdStyle}>{n.categoria || <span style={{ color: '#c00' }}>—</span>}</td>
        <td style={tdStyle}>{fmtRS(n.valor_nf)}</td>
        <td style={tdStyle}><span style={{ color: '#dc2626', fontSize: '.7rem' }}>{expandida ? '▲' : '▼'}</span></td>
      </tr>
      {expandida && (
        <tr>
          <td colSpan={8} style={{ ...tdStyle, background: '#fafafa' }}>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
              <button onClick={onVerDanfe} style={linkBtn}>Ver DANFE</button>
              <button onClick={onVerContasPagar} style={linkBtn}>Ver contas a pagar</button>
            </div>
            {n.itens && n.itens.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 10 }}>
                <thead><tr>{['Código', 'Descrição', 'Qtd', 'V. Unit', 'V. Total'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                <tbody>
                  {n.itens.map((it, i) => (
                    <tr key={i}>
                      <td style={tdStyle}>{it.codigo_produto}</td>
                      <td style={tdStyle}>{it.descricao}</td>
                      <td style={tdStyle}>{it.quantidade}</td>
                      <td style={tdStyle}>{fmtRS(it.valor_unitario)}</td>
                      <td style={tdStyle}>{fmtRS(it.valor_total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {titulos === 'loading' && <div style={{ fontSize: '.78rem', color: '#888' }}>Buscando contas a pagar…</div>}
            {Array.isArray(titulos) && (
              titulos.length === 0 ? <div style={{ fontSize: '.78rem', color: '#888' }}>Nenhum título encontrado.</div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Documento', 'Vencimento', 'Valor', 'Status', 'Pago em', 'Valor pago'].map((h) => <th key={h} style={thStyle}>{h}</th>)}</tr></thead>
                  <tbody>
                    {titulos.map((t, i) => (
                      <tr key={i}>
                        <td style={tdStyle}>{t.numero_documento}</td>
                        <td style={tdStyle}>{t.data_vencimento}</td>
                        <td style={tdStyle}>{fmtRS(t.valor_documento)}</td>
                        <td style={tdStyle}>{t.status_titulo}</td>
                        <td style={tdStyle}>{t.data_pagamento || '—'}</td>
                        <td style={tdStyle}>{t.valor_pago ? fmtRS(t.valor_pago) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )
            )}
          </td>
        </tr>
      )}
    </>
  );
}

function pgBtn(disabled: boolean): React.CSSProperties {
  return { padding: '8px 14px', border: '1px solid #e0e0e0', background: '#fff', color: disabled ? '#ccc' : '#666', borderRadius: 8, fontSize: '.78rem', fontWeight: 600, cursor: disabled ? 'not-allowed' : 'pointer' };
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
