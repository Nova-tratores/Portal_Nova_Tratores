'use client';
// Baixa de contas (Fase 3). Portado de baixa-contas.ejs + public/baixa-contas.js.
// Lista titulos EM ABERTO (a pagar/receber) de UMA empresa por vez e baixa
// (marca como pago/recebido) um titulo de cada vez no Omie.
import { useState, useCallback, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

// ---------- tipos ----------
type Tipo = 'pagar' | 'receber';
interface Titulo {
  conta: string; codigoLancamento: number | string; valorDocumento: number; valorPago: number;
  valorAberto: number; dataEmissao?: string; vencimento?: string; numeroDoc?: string;
  parcela?: string; status?: string; contraparte?: string; categoria?: string;
}
interface AbertosPayload { titulos?: Titulo[]; total?: number; erro?: string }
interface ContaCorrente { codigo: string | number; descricao: string; tipo?: string; banco?: string }
interface ConsultaPayload {
  ok?: boolean; statusTitulo?: string; valorDocumento?: number; baixaBloqueada?: boolean;
  idContaCorrente?: string | number | null; contaCorrenteDescricao?: string | null; erro?: string;
}

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
function hojeISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const thStyle: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '8px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', userSelect: 'none' };
const tdStyle: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.82rem' };

interface ColDef { key: string; label: string; type: 'num' | 'date' | 'text'; align?: 'right'; val: (l: Titulo) => number | string; txt: (l: Titulo) => string }
const COLS: ColDef[] = [
  { key: 'vencimento', label: 'Vencimento', type: 'date', val: (l) => l.vencimento || '', txt: (l) => fmtData(l.vencimento) },
  { key: 'status', label: 'Status', type: 'text', val: (l) => l.status || '', txt: (l) => l.status || '' },
  { key: 'contraparte', label: 'Fornecedor/Cliente', type: 'text', val: (l) => decode(l.contraparte), txt: (l) => decode(l.contraparte) },
  { key: 'numeroDoc', label: 'Documento', type: 'text', val: (l) => l.numeroDoc || '', txt: (l) => l.numeroDoc || '' },
  { key: 'parcela', label: 'Parcela', type: 'text', val: (l) => l.parcela || '', txt: (l) => l.parcela || '' },
  { key: 'categoria', label: 'Categoria', type: 'text', val: (l) => decode(l.categoria), txt: (l) => decode(l.categoria) },
  { key: 'valorAberto', label: 'Valor em aberto', type: 'num', align: 'right', val: (l) => Number(l.valorAberto) || 0, txt: (l) => fmtBRL(l.valorAberto) },
];

function StatusBadge({ s }: { s?: string }) {
  const map: Record<string, [string, string]> = {
    'ATRASADO': ['#fee2e2', '#b91c1c'], 'VENCE HOJE': ['#fef3c7', '#b45309'], 'A VENCER': ['#e0f2fe', '#0369a1'],
  };
  const [bg, fg] = map[s || ''] || ['#f1f5f9', '#475569'];
  return <span style={{ padding: '1px 6px', borderRadius: 4, fontSize: '.68rem', background: bg, color: fg }}>{s || '-'}</span>;
}

export default function BaixaContasPage() {
  const { userProfile } = useAuth();
  const { temAcesso, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta, contaParam } = useConta();

  const [tipo, setTipo] = useState<Tipo>('pagar');
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [status, setStatus] = useState('');
  const [resumo, setResumo] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: number }>({ key: 'vencimento', dir: 1 });
  const [filtros, setFiltros] = useState<Record<string, string>>({});
  const [modalTitulo, setModalTitulo] = useState<Titulo | null>(null);

  const buscar = useCallback(async () => {
    if (!conta) { setTitulos([]); return; }
    setCarregando(true);
    setStatus('carregando...');
    setTitulos([]);
    try {
      const r = await fetch(`/api/ajustes/contas/abertos?tipo=${tipo}${contaParam}`);
      const d = (await r.json()) as AbertosPayload;
      if (d.erro) { setStatus('Erro: ' + d.erro); return; }
      const ts = (d.titulos || []).map((l) => ({ ...l, contraparte: decode(l.contraparte), categoria: decode(l.categoria) }));
      setTitulos(ts);
      setFiltros({});
      const soma = ts.reduce((s, l) => s + (Number(l.valorAberto) || 0), 0);
      setResumo(`${d.total || ts.length} titulo(s) em aberto · total ${fmtBRL(soma)}`);
      setStatus('');
    } catch (ex) {
      setStatus('Erro de rede: ' + (ex as Error).message);
    } finally {
      setCarregando(false);
    }
  }, [conta, contaParam, tipo]);

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conta, tipo]);

  const linhasVisiveis = useMemo(() => {
    let rows = titulos.filter((l) => COLS.every((c) => {
      const f = filtros[c.key]; if (!f) return true;
      return norm(c.txt(l)).indexOf(norm(f)) >= 0;
    }));
    const c = COLS.find((x) => x.key === sort.key);
    if (c) rows = rows.slice().sort((a, b) => {
      const va = c.val(a), vb = c.val(b);
      const r = c.type === 'num' ? (Number(va) - Number(vb)) : String(va).localeCompare(String(vb), 'pt-BR', { numeric: true, sensitivity: 'base' });
      return r * sort.dir;
    });
    return rows;
  }, [titulos, filtros, sort]);

  const ordenarPor = useCallback((key: string) => {
    setSort((s) => s.key === key ? { key, dir: -s.dir } : { key, dir: 1 });
  }, []);

  if (!permLoading && userProfile && !temAcesso('ajustes')) return <SemPermissao />;

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Baixar contas</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 820 }}>
            Marca titulos <b>a pagar</b> e <b>a receber</b> como pagos/recebidos direto no Omie. Lista os titulos <b>em aberto</b> da empresa selecionada — <b>uma empresa por vez</b>. Clique em <b>Baixar</b> para liquidar um titulo.
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}><ContaSelector /></div>
      </div>

      <div style={{ margin: '6px 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Ajustes</Link>
      </div>

      {conta === '' ? (
        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: 16, fontSize: '.85rem' }}>
          A baixa de contas precisa de uma empresa especifica. Selecione <b>NOVA</b> ou <b>CASTRO</b> no menu acima.
        </div>
      ) : (
        <>
          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <label style={{ display: 'block', fontSize: '.65rem', color: '#64748b', marginBottom: 2 }}>Tipo</label>
                <div style={{ display: 'inline-flex', borderRadius: 6, border: '1px solid #cbd5e1', overflow: 'hidden', fontSize: '.82rem' }}>
                  {(['pagar', 'receber'] as Tipo[]).map((t, i) => (
                    <button key={t} onClick={() => setTipo(t)} style={{ padding: '6px 12px', border: 'none', borderLeft: i ? '1px solid #cbd5e1' : 'none', background: tipo === t ? '#2563eb' : '#fff', color: tipo === t ? '#fff' : '#475569', cursor: 'pointer' }}>{t === 'pagar' ? 'A pagar' : 'A receber'}</button>
                  ))}
                </div>
              </div>
              <button onClick={buscar} disabled={carregando} style={{ padding: '7px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.82rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.5 : 1 }}>Atualizar</button>
              <div style={{ fontSize: '.72rem', color: '#94a3b8' }}>Empresa: <b style={{ color: '#475569' }}>{conta.toUpperCase()}</b> — troque no seletor &quot;Conta&quot; do topo.</div>
            </div>
            <div style={{ marginTop: 8, fontSize: '.75rem' }}>
              <span style={{ color: status.startsWith('Erro') ? '#dc2626' : '#64748b' }}>{status}</span>
              <span style={{ marginLeft: 8, color: '#94a3b8' }}>{resumo}</span>
            </div>
          </div>

          <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ overflow: 'auto', maxHeight: '70vh' }}>
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
                    <tr><td colSpan={COLS.length + 1} style={{ ...tdStyle, textAlign: 'center', color: '#94a3b8', padding: 40 }}>{carregando ? 'Carregando…' : 'Nenhum titulo em aberto para esta empresa/tipo.'}</td></tr>
                  ) : linhasVisiveis.map((l) => {
                    const parcial = (Number(l.valorPago) || 0) > 0;
                    return (
                      <tr key={String(l.codigoLancamento)} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ ...tdStyle, whiteSpace: 'nowrap', color: '#64748b' }}>{fmtData(l.vencimento) || '-'}</td>
                        <td style={tdStyle}><StatusBadge s={l.status} /></td>
                        <td style={tdStyle}>{l.contraparte || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>{l.numeroDoc || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b', whiteSpace: 'nowrap' }}>{l.parcela || '-'}</td>
                        <td style={{ ...tdStyle, fontSize: '.72rem', color: '#64748b' }}>{l.categoria || '-'}</td>
                        <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                          {fmtBRL(l.valorAberto)}
                          {parcial && <div style={{ fontSize: '.62rem', color: '#94a3b8', fontWeight: 400 }}>doc {fmtBRL(l.valorDocumento)}</div>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: 'right' }}>
                          <button onClick={() => setModalTitulo(l)} style={{ padding: '3px 10px', background: '#059669', color: '#fff', border: 'none', borderRadius: 4, fontSize: '.72rem', cursor: 'pointer' }}>Baixar</button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {modalTitulo && (
        <ModalBaixa titulo={modalTitulo} tipo={tipo} conta={conta}
          onClose={() => setModalTitulo(null)} onBaixado={() => { setModalTitulo(null); buscar(); }} />
      )}
    </div>
  );
}

// ---------- modal de baixa ----------
function ModalBaixa({ titulo, tipo, conta, onClose, onBaixado }: {
  titulo: Titulo; tipo: Tipo; conta: string; onClose: () => void; onBaixado: () => void;
}) {
  const [consulta, setConsulta] = useState<ConsultaPayload | null>(null);
  const [erroConsulta, setErroConsulta] = useState('');
  const [carregando, setCarregando] = useState(true);
  const [ccs, setCcs] = useState<ContaCorrente[]>([]);
  const [mostrarDropdownCC, setMostrarDropdownCC] = useState(false);
  const [ccSel, setCcSel] = useState<string>('');
  const [valor, setValor] = useState('');
  const [data, setData] = useState(hojeISO());
  const [juros, setJuros] = useState('0');
  const [multa, setMulta] = useState('0');
  const [desconto, setDesconto] = useState('0');
  const [obs, setObs] = useState('');
  const [conciliar, setConciliar] = useState(false);
  const [modalStatus, setModalStatus] = useState('');
  const [aplicando, setAplicando] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // consulta o titulo no Omie ao abrir (pre-preenche valor + conta corrente)
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/ajustes/contas/consultar?tipo=${tipo}&conta=${encodeURIComponent(conta)}&codigoLancamento=${encodeURIComponent(titulo.codigoLancamento)}`);
        const d = (await r.json()) as ConsultaPayload;
        if (!vivo) return;
        if (d.erro) { setErroConsulta('Erro ao consultar: ' + d.erro); setCarregando(false); return; }
        setConsulta(d);
        setValor((Number(titulo.valorAberto) || Number(d.valorDocumento) || 0).toFixed(2));
        const cc = d.idContaCorrente != null ? String(d.idContaCorrente) : '';
        setCcSel(cc);
        if (!cc) setMostrarDropdownCC(true);
        setCarregando(false);
      } catch (ex) {
        if (vivo) { setErroConsulta('Rede: ' + (ex as Error).message); setCarregando(false); }
      }
    })();
    return () => { vivo = false; };
  }, [tipo, conta, titulo]);

  // carrega contas correntes quando o dropdown e' aberto
  useEffect(() => {
    if (!mostrarDropdownCC || ccs.length) return;
    let vivo = true;
    fetch('/api/ajustes/contas-correntes?conta=' + encodeURIComponent(conta))
      .then((r) => r.json())
      .then((d) => { if (vivo) setCcs(d.contasCorrentes || []); })
      .catch(() => { if (vivo) setCcs([]); });
    return () => { vivo = false; };
  }, [mostrarDropdownCC, conta, ccs.length]);

  const ccAtualDesc = consulta?.contaCorrenteDescricao || '(nao definida no titulo)';
  const ccAtualFalta = ccSel && !ccs.some((c) => String(c.codigo) === String(ccSel));
  const bloqueada = !!consulta?.baixaBloqueada;
  const verbo = tipo === 'receber' ? 'Recebido em' : 'Pago em';

  const aplicar = useCallback(async () => {
    if (!ccSel) { setModalStatus('escolha a conta corrente'); return; }
    const v = Number(valor);
    if (!(v > 0)) { setModalStatus('informe um valor maior que zero'); return; }
    if (!data) { setModalStatus('informe a data'); return; }
    if (!confirm(`Baixar no Omie o titulo ${titulo.codigoLancamento} (${titulo.contraparte || ''}) de ${fmtBRL(v)}?`)) return;
    setAplicando(true);
    setModalStatus('baixando no Omie...');
    try {
      const r = await fetch('/api/ajustes/contas/baixar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conta, tipo, codigoLancamento: titulo.codigoLancamento, codigoContaCorrente: ccSel,
          valor: v, data, juros: Number(juros) || 0, multa: Number(multa) || 0, desconto: Number(desconto) || 0,
          observacao: obs, conciliar,
        }),
      });
      const d = await r.json();
      if (!d.ok) { setModalStatus(d.erro || 'falha'); setAplicando(false); return; }
      setModalStatus('baixado ✓');
      setTimeout(onBaixado, 600);
    } catch (ex) {
      setModalStatus('rede: ' + (ex as Error).message); setAplicando(false);
    }
  }, [ccSel, valor, data, juros, multa, desconto, obs, conciliar, conta, tipo, titulo, onBaixado]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 520, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Marcar como pago / recebido</h2>
          <button onClick={onClose} style={closeBtn}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.85rem' }}>
          {carregando ? <div style={{ color: '#94a3b8' }}>consultando titulo no Omie...</div>
            : erroConsulta ? <div style={{ color: '#dc2626' }}>{erroConsulta}</div>
            : bloqueada ? (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 6, padding: 12, fontSize: '.8rem' }}>
                Este titulo esta com a <b>baixa bloqueada</b> no Omie. Desbloqueie no Omie antes de marcar como pago.
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 12, fontSize: '.72rem', color: '#64748b' }}>{titulo.conta} · {titulo.contraparte || ''} · doc {titulo.numeroDoc || '-'} · venc {fmtData(titulo.vencimento) || '-'} · lanc <span style={{ fontFamily: 'monospace' }}>{titulo.codigoLancamento}</span></div>

                <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: '.68rem', color: '#64748b' }}>Conta corrente</div>
                      <div style={{ fontWeight: 500, color: '#334155' }}>{ccAtualDesc}</div>
                    </div>
                    {!mostrarDropdownCC && <button onClick={() => setMostrarDropdownCC(true)} style={{ fontSize: '.72rem', padding: '4px 8px', background: '#f1f5f9', border: 'none', borderRadius: 4, cursor: 'pointer' }}>Alterar</button>}
                  </div>
                  {mostrarDropdownCC && (
                    <select value={ccSel} onChange={(e) => setCcSel(e.target.value)} style={{ ...selStyle, marginTop: 8 }}>
                      <option value="">(escolha a conta corrente)</option>
                      {ccAtualFalta && <option value={ccSel}>{consulta?.contaCorrenteDescricao || ccSel} [atual]</option>}
                      {ccs.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.descricao}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
                    </select>
                  )}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div><label style={lblStyle}>{verbo}</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} style={selStyle} /></div>
                  <div><label style={lblStyle}>Valor</label><input type="number" step="0.01" min="0" value={valor} onChange={(e) => setValor(e.target.value)} style={{ ...selStyle, textAlign: 'right' }} /></div>
                </div>

                <details style={{ marginTop: 12 }}>
                  <summary style={{ fontSize: '.72rem', color: '#64748b', cursor: 'pointer', userSelect: 'none' }}>Juros / multa / desconto (opcional)</summary>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 8 }}>
                    <div><label style={lblStyle}>Juros</label><input type="number" step="0.01" min="0" value={juros} onChange={(e) => setJuros(e.target.value)} style={{ ...selStyle, textAlign: 'right' }} /></div>
                    <div><label style={lblStyle}>Multa</label><input type="number" step="0.01" min="0" value={multa} onChange={(e) => setMulta(e.target.value)} style={{ ...selStyle, textAlign: 'right' }} /></div>
                    <div><label style={lblStyle}>Desconto</label><input type="number" step="0.01" min="0" value={desconto} onChange={(e) => setDesconto(e.target.value)} style={{ ...selStyle, textAlign: 'right' }} /></div>
                  </div>
                </details>

                <div style={{ marginTop: 12 }}><label style={lblStyle}>Observacao (opcional)</label><input type="text" value={obs} onChange={(e) => setObs(e.target.value)} style={selStyle} placeholder="ex.: baixa via portal" /></div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.72rem', color: '#64748b', marginTop: 12 }}><input type="checkbox" checked={conciliar} onChange={(e) => setConciliar(e.target.checked)} /> Conciliar o documento automaticamente</label>
              </>
            )}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: modalStatus.includes('✓') ? '#047857' : '#dc2626', marginRight: 'auto' }}>{modalStatus}</span>
          <button onClick={onClose} style={btnSec}>Cancelar</button>
          <button onClick={aplicar} disabled={aplicando || carregando || bloqueada || !!erroConsulta} style={{ ...btnPrim, background: '#059669', opacity: aplicando || carregando || bloqueada || erroConsulta ? 0.5 : 1 }}>Baixar no Omie</button>
        </div>
      </div>
    </div>
  );
}

const lblStyle: React.CSSProperties = { display: 'block', fontSize: '.68rem', color: '#64748b', marginBottom: 2 };
const selStyle: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.82rem', background: '#fff' };
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' };
const btnSec: React.CSSProperties = { padding: '6px 12px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnPrim: React.CSSProperties = { padding: '6px 12px', fontSize: '.82rem', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
