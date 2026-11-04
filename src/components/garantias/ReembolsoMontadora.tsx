'use client';
import { useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { Loader2, Receipt, Send, FileCheck2, Info } from 'lucide-react';
import { fmtMoeda, fmtData } from '@/lib/garantias/format';
import { montarPreviaReembolso, COMPONENTE_LABEL } from '@/lib/garantias/notas';
import type { NotaReembolso, PendenteReembolso } from '@/lib/garantias/notas-server';

// OS de reembolso da montadora: junta as garantias aprovadas que ainda não têm
// NFS-e e mostra a OS que o portal vai criar e faturar na Omie.
// PÁGINA DE TESTE: só prévia — nada é enviado à Omie.

const COR = '#dc2626';

interface Montadora { id: string; nome: string; cor: string | null; ativo: boolean }

export default function ReembolsoMontadora() {
  const [montadoras, setMontadoras] = useState<Montadora[]>([]);
  const [montadoraId, setMontadoraId] = useState('');
  const [dados, setDados] = useState<{ montadora: string | null; pendentes: PendenteReembolso[]; faturadas: NotaReembolso[] } | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [drvg, setDrvg] = useState('');
  const [pedido, setPedido] = useState('');

  const escolherMontadora = (id: string) => {
    setMontadoraId(id);
    setCarregando(true);
    setDados(null);
    fetchAuth(`/api/garantias/reembolso?montadora=${id}`)
      .then((r) => r.json())
      .then((j) => { setDados(j); setMarcadas(new Set((j.pendentes || []).map((p: PendenteReembolso) => p.id))); })
      .catch(() => {})
      .finally(() => setCarregando(false));
  };

  useEffect(() => {
    fetchAuth('/api/garantias/montadoras').then((r) => r.json()).then((j) => {
      const ms: Montadora[] = (j.montadoras || []).filter((m: Montadora) => m.ativo);
      setMontadoras(ms);
      const mah = ms.find((m) => /mahindra/i.test(m.nome)) || ms[0];
      if (mah) escolherMontadora(mah.id);
    }).catch(() => {});
  }, []);

  const escolhidas = useMemo(() => (dados?.pendentes || []).filter((p) => marcadas.has(p.id)), [dados, marcadas]);
  const previa = useMemo(() => montarPreviaReembolso(escolhidas, { drvg, pedidoCompra: pedido }), [escolhidas, drvg, pedido]);

  const alternar = (id: string) => setMarcadas((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    <div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Montadora</span>
        <select value={montadoraId} onChange={(e) => escolherMontadora(e.target.value)} style={inp}>
          {montadoras.map((m) => <option key={m.id} value={m.id}>{m.nome}</option>)}
        </select>
        <span style={{ fontSize: 12, color: 'var(--portal-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
          <Info size={13} /> Prévia: nada é enviado à Omie nesta página de teste.
        </span>
      </div>

      {carregando && <div style={{ padding: 30, color: 'var(--portal-text-muted)' }}><Loader2 size={18} className="spin" /> Carregando…</div>}

      {dados && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 18 }}>
          <section>
            <h3 style={h3}>1 · Garantias aprovadas sem NFS-e de reembolso ({dados.pendentes.length})</h3>
            <p style={ajuda}>Marque as que entram nesta OS (normalmente as do mesmo demonstrativo/DRVG que a fábrica mandou).</p>
            {dados.pendentes.length === 0 && <div style={vazio}>Todas as aprovadas da {dados.montadora} já têm NFS-e de reembolso.</div>}
            <div style={{ border: '1px solid var(--portal-border)', borderRadius: 10, overflow: 'hidden' }}>
              {dados.pendentes.map((p) => (
                <label key={p.id} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '8px 10px', borderTop: '1px solid var(--portal-border)', cursor: 'pointer', fontSize: 13 }}>
                  <input type="checkbox" checked={marcadas.has(p.id)} onChange={() => alternar(p.id)} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{p.numero}</b> · SG {p.numero_externo || '—'} <span style={muted}>· {p.cliente || '—'} · finalizada {fmtData(p.finalizada_em)}</span>
                    <div style={muted}>M.O. {fmtMoeda(p.valor_pago_horas)} · Desloc. {fmtMoeda(p.valor_pago_km)} · Peças {fmtMoeda(p.valor_pago_pecas)}</div>
                  </div>
                  <b style={{ whiteSpace: 'nowrap' }}>{fmtMoeda(p.valor_pago_total)}</b>
                </label>
              ))}
            </div>
          </section>

          <section>
            <h3 style={h3}>2 · OS de reembolso que o portal vai criar</h3>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <input value={drvg} onChange={(e) => setDrvg(e.target.value.replace(/\D/g, ''))} placeholder="Nº DRVG / demonstrativo" style={{ ...inp, flex: '1 1 160px' }} />
              <input value={pedido} onChange={(e) => setPedido(e.target.value.replace(/\D/g, ''))} placeholder="Pedido de compra da montadora" style={{ ...inp, flex: '1 1 160px' }} />
            </div>
            <div style={{ border: `2px solid ${COR}`, borderRadius: 12, padding: 14 }}>
              <div style={muted}>Cliente na Omie</div>
              <div style={{ fontWeight: 800, marginBottom: 10 }}>{dados.montadora}</div>
              <div style={muted}>Texto da nota</div>
              <div style={{ fontFamily: 'monospace', fontSize: 12, background: 'var(--portal-bg-input)', padding: 8, borderRadius: 8, marginBottom: 10, wordBreak: 'break-word' }}>
                {escolhidas.length ? previa.texto : '— marque as garantias —'}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <tbody>
                  {previa.itens.map((i) => (
                    <tr key={i.descricao}>
                      <td style={td}>{i.descricao} <span style={muted}>({COMPONENTE_LABEL[i.componente]})</span></td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtMoeda(i.valor)}</td>
                    </tr>
                  ))}
                  <tr><td style={{ ...td, fontWeight: 800 }}>Total da NFS-e</td><td style={{ ...td, textAlign: 'right', fontWeight: 800, fontSize: 16 }}>{fmtMoeda(previa.total)}</td></tr>
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                <button disabled style={btnPrim} title="Prévia — a criação na Omie entra depois da aprovação do desenho"><Send size={14} /> 1. Gerar OS na Omie</button>
                <button disabled style={{ ...btnPrim, background: '#16a34a' }} title="Prévia"><Receipt size={14} /> 2. Faturar NFS-e</button>
              </div>
              <div style={{ ...muted, marginTop: 8 }}>
                Na versão final: a OS sai na conta Nova com a categoria/conta de cada item, a NFS-e volta para cá e fica vinculada a cada garantia marcada — com mão de obra, deslocamento e peças separados.
              </div>
            </div>
          </section>

          <section style={{ gridColumn: '1 / -1' }}>
            <h3 style={h3}><FileCheck2 size={15} /> NFS-e de reembolso já emitidas para a {dados.montadora}</h3>
            <div style={{ overflowX: 'auto', border: '1px solid var(--portal-border)', borderRadius: 10 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr>{['NFS-e', 'Data', 'DRVG', 'Garantias cobertas', 'Mão de obra', 'Desloc.', 'Peças', 'Total'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {dados.faturadas.map((n) => (
                    <tr key={n.docId}>
                      <td style={td}><b>{n.numero || '—'}</b></td>
                      <td style={td}>{fmtData(n.data)}</td>
                      <td style={td}>{n.drvg || '—'}</td>
                      <td style={td}>{n.garantiasCobertas.map((c) => c.numero || `SG ${c.sg}`).join(', ') || '—'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtMoeda(n.componentes.mao_obra)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtMoeda(n.componentes.deslocamento)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmtMoeda(n.componentes.pecas)}</td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 700 }}>{fmtMoeda(n.valor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = { padding: '8px 10px', borderRadius: 8, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-input)', color: 'var(--portal-text)', fontSize: 13 };
const h3: React.CSSProperties = { fontSize: 14, fontWeight: 800, margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--portal-text)' };
const ajuda: React.CSSProperties = { fontSize: 12, color: 'var(--portal-text-muted)', margin: '0 0 8px' };
const muted: React.CSSProperties = { fontSize: 12, color: 'var(--portal-text-muted)' };
const vazio: React.CSSProperties = { padding: 14, border: '1px dashed var(--portal-border)', borderRadius: 10, fontSize: 13, color: 'var(--portal-text-muted)', marginBottom: 8 };
const td: React.CSSProperties = { padding: '6px 8px', borderTop: '1px solid var(--portal-border)', color: 'var(--portal-text)' };
const th: React.CSSProperties = { ...td, borderTop: 'none', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: 'var(--portal-text-muted)', background: 'var(--portal-bg-input)' };
const btnPrim: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 14px', borderRadius: 9, border: 'none', background: COR, color: '#fff', fontSize: 13, fontWeight: 700, opacity: 0.6, cursor: 'not-allowed' };
