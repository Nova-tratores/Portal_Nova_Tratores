'use client';
// Devolução de compra em OPERAÇÃO TRIANGULAR — tela de PREPARAR/CONFERIR.
// O fornecedor FATURA (ex.: JTZ) e um terceiro ENTREGA por conta e ordem (ex.: A-4).
// Para devolver são DUAS notas com fiscal oposto (ver src/lib/ajustes/devolucao.ts).
// Esta tela NÃO emite nada: monta os valores para você digitar no Omie.
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { useConta } from '@/components/estoque/ContaProvider';
import ContaSelector from '@/components/estoque/ContaSelector';

interface Item { seq: number; codigo: string | null; descricao: string | null; chassi: string | null; cfop: string | null; qtde: number; valUnit: number; valTotal: number }
interface Nota {
  numero: string | null; serie: string | null; chaveNFe: string | null; dataEmissao: string | null;
  emitenteCnpj: string | null; emitenteNome: string | null; emitenteIE: string | null;
  emitenteEndereco: string | null; emitenteUF: string | null; interestadual: boolean;
  vProd: number; vNF: number; vBC: number; vICMS: number; vBCST: number; vST: number;
  vIPI: number; vPIS: number; vCOFINS: number; itens: Item[];
}
interface Ficha { faturamento: Nota | null; remessa: Nota | null; avisos: string[]; erro?: string }

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2 });
const fmt = (n: number | null | undefined) => (n == null || isNaN(Number(n)) ? '-' : brl.format(Number(n)));
const fmtCnpj = (c?: string | null) => (c ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : '-');

const card: React.CSSProperties = { background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, padding: 16, marginBottom: 14 };
const inp: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 8px', fontSize: '.85rem' };
const th: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.65rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155', fontSize: '.8rem' };
const lbl: React.CSSProperties = { fontSize: '.68rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: '.3px' };

function Copiar({ texto }: { texto: string }) {
  const [ok, setOk] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(texto).then(() => { setOk(true); setTimeout(() => setOk(false), 1500); }); }}
      style={{ marginLeft: 8, padding: '2px 8px', fontSize: '.68rem', background: ok ? '#d1fae5' : '#f1f5f9', color: ok ? '#065f46' : '#475569', border: 'none', borderRadius: 4, cursor: 'pointer' }}
    >{ok ? 'copiado ✓' : 'copiar'}</button>
  );
}

function Linha({ rotulo, valor, destaque }: { rotulo: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '4px 0', borderBottom: '1px dashed #f1f5f9' }}>
      <span style={{ fontSize: '.78rem', color: '#64748b' }}>{rotulo}</span>
      <span style={{ fontSize: '.82rem', fontWeight: destaque ? 700 : 500, color: destaque ? '#0f766e' : '#1e293b', fontFamily: 'monospace' }}>{valor}</span>
    </div>
  );
}

export default function DevolucaoPage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);
  const { conta } = useConta();

  const [fatNum, setFatNum] = useState('');
  const [fatSerie, setFatSerie] = useState('');
  const [remNum, setRemNum] = useState('');
  const [remSerie, setRemSerie] = useState('');
  const [carregando, setCarregando] = useState(false);
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [erro, setErro] = useState('');
  const [sel, setSel] = useState<Record<number, boolean>>({});
  const [destacar, setDestacar] = useState(true);

  const montar = useCallback(async () => {
    if (!fatNum.trim()) { setErro('Informe o número da NF de faturamento.'); return; }
    setCarregando(true); setErro(''); setFicha(null);
    try {
      const r = await fetch('/api/ajustes/devolucao/preparar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conta, faturamentoNumero: fatNum.trim(), faturamentoSerie: fatSerie.trim() || null, remessaNumero: remNum.trim() || null, remessaSerie: remSerie.trim() || null }),
      });
      const d = (await r.json()) as Ficha;
      if (d.erro) { setErro(d.erro); return; }
      setFicha(d);
      const inicial: Record<number, boolean> = {};
      (d.faturamento?.itens || []).forEach((i) => { inicial[i.seq] = true; });
      setSel(inicial);
    } catch (ex) {
      setErro('Erro de rede: ' + (ex as Error).message);
    } finally { setCarregando(false); }
  }, [conta, fatNum, fatSerie, remNum, remSerie]);

  if (!permLoading && userProfile && !pode('ajustes', 'devolucao')) return <SemPermissao />;

  const f = ficha?.faturamento || null;
  const rem = ficha?.remessa || null;
  const itensSel = (f?.itens || []).filter((i) => sel[i.seq]);
  const parcial = !!f && itensSel.length > 0 && itensSel.length < f.itens.length;
  const totalSel = itensSel.reduce((a, i) => a + i.valTotal, 0);
  const proporcao = f && f.vProd > 0 ? totalSel / f.vProd : 1;
  const rateio = (v: number) => (parcial ? v * proporcao : v);
  const inter = f?.interestadual ?? true;
  const cfopDev = inter ? '6411' : '5411';
  const cfopRem = inter ? '6923' : '5923';
  const chassis = itensSel.map((i) => i.chassi).filter(Boolean).join(', ');

  const msg1 = rem
    ? `Local de entrega: ${rem.emitenteNome || 'terceiro'} — ${rem.emitenteEndereco || ''}, CNPJ ${fmtCnpj(rem.emitenteCnpj)}, IE ${rem.emitenteIE || '-'} — referente à NF de compra nº ${f?.numero || ''}`
    : `Local de entrega: (informe o terceiro) — referente à NF de compra nº ${f?.numero || ''}`;
  const msg2 = f
    ? `P/ conta e ordem de ${f.emitenteNome || 'faturador'} — ${f.emitenteEndereco || ''}, CNPJ ${fmtCnpj(f.emitenteCnpj)}, IE ${f.emitenteIE || '-'} — ref. NF de devolução nº ___`
    : '';

  return (
    <div style={{ maxWidth: 1250, margin: '0 auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexWrap: 'wrap', marginBottom: 14 }}>
        <div>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#1e293b', marginBottom: 4 }}>Devolução de compra (operação triangular)</h1>
          <p style={{ color: '#64748b', fontSize: '.82rem', maxWidth: 780 }}>
            Monta a ficha das <b>duas notas</b> de devolução a partir da NF de faturamento e da NF de remessa por conta e ordem.
            Esta tela <b>não emite nada</b> — os valores são para você digitar no Omie.
          </p>
        </div>
        <div style={{ marginLeft: 'auto' }}><ContaSelector /></div>
      </div>

      <div style={{ margin: '0 0 14px', display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: '.8rem' }}>
        <Link href="/ajustes" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>← Dashboard</Link>
        <Link href="/ajustes/recebimentos" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Recebimentos pendentes</Link>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label>
            <span style={{ display: 'block', ...lbl, marginBottom: 3 }}>NF de faturamento (fornecedor)</span>
            <input value={fatNum} onChange={(e) => setFatNum(e.target.value)} placeholder="ex.: 35148" style={{ ...inp, width: 140 }} onKeyDown={(e) => e.key === 'Enter' && montar()} />
          </label>
          <label>
            <span style={{ display: 'block', ...lbl, marginBottom: 3 }}>Série</span>
            <input value={fatSerie} onChange={(e) => setFatSerie(e.target.value)} placeholder="auto" style={{ ...inp, width: 70 }} />
          </label>
          <label>
            <span style={{ display: 'block', ...lbl, marginBottom: 3 }}>NF de remessa (terceiro)</span>
            <input value={remNum} onChange={(e) => setRemNum(e.target.value)} placeholder="ex.: 45057" style={{ ...inp, width: 140 }} onKeyDown={(e) => e.key === 'Enter' && montar()} />
          </label>
          <label>
            <span style={{ display: 'block', ...lbl, marginBottom: 3 }}>Série</span>
            <input value={remSerie} onChange={(e) => setRemSerie(e.target.value)} placeholder="auto" style={{ ...inp, width: 70 }} />
          </label>
          <button onClick={montar} disabled={carregando} style={{ padding: '8px 16px', background: '#2563eb', color: '#fff', border: 'none', borderRadius: 6, fontSize: '.85rem', cursor: carregando ? 'wait' : 'pointer', opacity: carregando ? 0.6 : 1 }}>
            {carregando ? 'buscando no Omie…' : 'Montar ficha'}
          </button>
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.8rem', color: '#475569', paddingBottom: 6 }}>
            <input type="checkbox" checked={destacar} onChange={(e) => setDestacar(e.target.checked)} /> destacar impostos
          </label>
        </div>
        <div style={{ marginTop: 8, fontSize: '.7rem', color: '#94a3b8' }}>Deixe a série em branco para tentar automaticamente (1 a 4).</div>
      </div>

      {erro && <div style={{ ...card, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: '.85rem' }}>{erro}</div>}

      {ficha?.avisos && ficha.avisos.length > 0 && (
        <div style={{ ...card, background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', fontSize: '.8rem' }}>
          {ficha.avisos.map((a, i) => <div key={i} style={{ marginBottom: 4 }}>⚠ {a}</div>)}
        </div>
      )}

      {f && (
        <>
          {/* notas de origem */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))', gap: 14, marginBottom: 14 }}>
            {[{ t: 'NF de faturamento (quem cobrou)', n: f }, { t: 'NF de remessa por conta e ordem (quem entregou)', n: rem }].map(({ t, n }, i) => (
              <div key={i} style={card}>
                <div style={{ ...lbl, marginBottom: 6 }}>{t}</div>
                {n ? (
                  <>
                    <div style={{ fontWeight: 600, color: '#1e293b', fontSize: '.9rem' }}>{n.emitenteNome || '(fornecedor não cadastrado no Omie)'}</div>
                    <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 8 }}>
                      NF {n.numero}/{n.serie} · {n.dataEmissao || '-'} · CNPJ {fmtCnpj(n.emitenteCnpj)} · IE {n.emitenteIE || '-'}
                      {n.emitenteEndereco ? <div>{n.emitenteEndereco}</div> : null}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '.62rem', color: '#94a3b8', wordBreak: 'break-all', marginBottom: 8 }}>
                      chave {n.chaveNFe || '-'}{n.chaveNFe ? <Copiar texto={n.chaveNFe} /> : null}
                    </div>
                    <Linha rotulo="Produtos" valor={fmt(n.vProd)} />
                    <Linha rotulo="Total da NF" valor={fmt(n.vNF)} />
                    <Linha rotulo="ICMS (base / valor)" valor={`${fmt(n.vBC)} / ${fmt(n.vICMS)}`} />
                    <Linha rotulo="ICMS-ST (base / valor)" valor={`${fmt(n.vBCST)} / ${fmt(n.vST)}`} />
                    <Linha rotulo="IPI / PIS / COFINS" valor={`${fmt(n.vIPI)} / ${fmt(n.vPIS)} / ${fmt(n.vCOFINS)}`} />
                  </>
                ) : <div style={{ fontSize: '.82rem', color: '#94a3b8' }}>não informada</div>}
              </div>
            ))}
          </div>

          {/* itens - devolucao parcial */}
          <div style={card}>
            <div style={{ ...lbl, marginBottom: 8 }}>Itens a devolver — desmarque o que já foi vendido (devolução parcial)</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                  <th style={{ ...th, width: 30 }}></th><th style={th}>Produto</th><th style={th}>Chassi</th>
                  <th style={th}>CFOP orig.</th><th style={{ ...th, textAlign: 'right' }}>Qtd</th>
                  <th style={{ ...th, textAlign: 'right' }}>Unitário</th><th style={{ ...th, textAlign: 'right' }}>Total</th>
                </tr></thead>
                <tbody>
                  {f.itens.map((i) => (
                    <tr key={i.seq} style={{ opacity: sel[i.seq] ? 1 : 0.45 }}>
                      <td style={td}><input type="checkbox" checked={!!sel[i.seq]} onChange={(e) => setSel((s) => ({ ...s, [i.seq]: e.target.checked }))} /></td>
                      <td style={td}>{i.descricao || i.codigo || '?'}</td>
                      <td style={{ ...td, fontFamily: 'monospace', fontSize: '.72rem', color: i.chassi ? '#0f766e' : '#dc2626' }}>{i.chassi || '(não identificado)'}</td>
                      <td style={{ ...td, fontFamily: 'monospace' }}>{i.cfop || '-'}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{i.qtde}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmt(i.valUnit)}</td>
                      <td style={{ ...td, textAlign: 'right' }}>{fmt(i.valTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {parcial && (
              <div style={{ marginTop: 8, fontSize: '.75rem', color: '#b45309' }}>
                ⚠ Devolução parcial: {itensSel.length} de {f.itens.length} itens ({(proporcao * 100).toFixed(1)}% do valor). Os impostos abaixo estão <b>rateados proporcionalmente</b> — confirme o rateio com a contabilidade.
              </div>
            )}
          </div>

          {/* as duas fichas */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: 14 }}>
            <div style={{ ...card, borderTop: '3px solid #0f766e' }}>
              <div style={{ fontWeight: 700, color: '#0f766e', marginBottom: 2 }}>Nota 1 — Devolução de compra</div>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 10 }}>
                Destinatário: <b>{f.emitenteNome || '?'}</b> · CNPJ {fmtCnpj(f.emitenteCnpj)} · IE {f.emitenteIE || '-'}
              </div>
              <Linha rotulo="CFOP" valor={cfopDev} destaque />
              <Linha rotulo="Valor dos produtos" valor={fmt(rateio(f.vProd))} destaque />
              {destacar ? (
                <>
                  <Linha rotulo="ICMS-ST" valor={fmt(rateio(f.vST))} destaque />
                  <Linha rotulo="PIS" valor={fmt(rateio(f.vPIS))} />
                  <Linha rotulo="COFINS" valor={fmt(rateio(f.vCOFINS))} />
                  <Linha rotulo="IPI" valor={fmt(rateio(f.vIPI))} />
                  <div style={{ marginTop: 8, padding: 8, background: '#f0fdfa', borderRadius: 6 }}>
                    <div style={{ ...lbl, marginBottom: 4 }}>ICMS — vem da NF de remessa do terceiro</div>
                    {rem
                      ? (<><Linha rotulo="ICMS base de cálculo" valor={fmt(rateio(rem.vBC))} destaque /><Linha rotulo="ICMS valor" valor={fmt(rateio(rem.vICMS))} destaque /></>)
                      : <div style={{ fontSize: '.75rem', color: '#b45309' }}>informe a NF de remessa para obter estes valores</div>}
                  </div>
                </>
              ) : (
                <div style={{ marginTop: 8, fontSize: '.78rem', color: '#b45309' }}>Impostos ocultos (destaque desligado) — o procedimento do fornecedor pede <b>com</b> destaque nesta nota.</div>
              )}
              {chassis && <div style={{ marginTop: 8, fontSize: '.75rem' }}><b>Chassi:</b> <span style={{ fontFamily: 'monospace' }}>{chassis}</span></div>}
              <div style={{ marginTop: 10, padding: 8, background: '#f8fafc', borderRadius: 6, fontSize: '.75rem', color: '#334155' }}>
                <div style={{ ...lbl, marginBottom: 4 }}>Mensagem da NF <Copiar texto={msg1} /></div>{msg1}
              </div>
              {rem?.chaveNFe && <div style={{ marginTop: 8, fontSize: '.72rem', color: '#64748b' }}>Referenciar a chave da NF de origem em <b>Informações Adicionais</b>.</div>}
            </div>

            <div style={{ ...card, borderTop: '3px solid #7c3aed' }}>
              <div style={{ fontWeight: 700, color: '#7c3aed', marginBottom: 2 }}>Nota 2 — Remessa por conta e ordem</div>
              <div style={{ fontSize: '.75rem', color: '#64748b', marginBottom: 10 }}>
                Destinatário: <b>{rem?.emitenteNome || '(terceiro — informe a NF de remessa)'}</b>
                {rem ? <> · CNPJ {fmtCnpj(rem.emitenteCnpj)} · IE {rem.emitenteIE || '-'}</> : null}
              </div>
              <Linha rotulo="CFOP" valor={cfopRem} destaque />
              <Linha rotulo="Valor dos produtos" valor={fmt(rateio(f.vProd))} destaque />
              <Linha rotulo="Total da NF" valor={fmt(rateio(f.vProd))} destaque />
              <div style={{ marginTop: 8, padding: 8, background: '#faf5ff', borderRadius: 6, fontSize: '.78rem', color: '#6b21a8' }}>
                <b>SEM destaque de ICMS</b> — só o valor dos produtos e o total, para acompanhar o transporte.
              </div>
              {chassis && <div style={{ marginTop: 8, fontSize: '.75rem' }}><b>Chassi:</b> <span style={{ fontFamily: 'monospace' }}>{chassis}</span></div>}
              <div style={{ marginTop: 10, padding: 8, background: '#f8fafc', borderRadius: 6, fontSize: '.75rem', color: '#334155' }}>
                <div style={{ ...lbl, marginBottom: 4 }}>Mensagem da NF <Copiar texto={msg2} /></div>{msg2}
              </div>
            </div>
          </div>

          <div style={{ ...card, marginTop: 14, background: '#f8fafc', fontSize: '.78rem', color: '#475569' }}>
            <b>Antes de emitir:</b> confira o tratamento fiscal com a contabilidade. O CFOP {cfopDev}/{cfopRem} foi deduzido do CFOP de entrada
            ({f.itens[0]?.cfop || '?'} → {inter ? 'interestadual' : 'dentro do estado'}). Emita as notas no Omie — esta tela é só de conferência.
          </div>
        </>
      )}
    </div>
  );
}
