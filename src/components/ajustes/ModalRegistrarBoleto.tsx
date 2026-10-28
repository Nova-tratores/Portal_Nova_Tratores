'use client';
// Registrar boleto agrupado de fornecedor a partir das duplicatas selecionadas
// na Correção de contas (vista Lista). Prévia = regras puras de
// lib/ajustes/boletos-fornecedor.ts; a gravação (banco + AlterarContaPagar
// por duplicata) é a rota POST /api/ajustes/boletos-fornecedor.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';
import {
  alocar, camposPorTitulo, dividirIgual, listaNFs, somar, validarRegistro, fmtBR, arred,
  type ParcelaIn, type TituloSel,
} from '@/lib/ajustes/boletos-fornecedor';

export interface TituloParaBoleto {
  conta: string; codigoLancamento: number | string; valor: number; valorPago?: number | null;
  vencimento?: string | null; dataPrevisao?: string | null; numeroDoc?: string | null; numeroDocFiscal?: string | null;
  parcela?: string | null; idOrigem?: string | null; codigoFornecedor?: number | null; contraparte?: string | null; observacao?: string | null;
}

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (n: number) => brl.format(Number(n) || 0);
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
function somarDiasLocal(iso: string, n: number): string { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }

interface ParcelaForm { numero: number; dataVencimento: string; valor: string }

export default function ModalRegistrarBoleto({ titulos, onClose, onRegistrado }: {
  titulos: TituloParaBoleto[]; onClose: () => void; onRegistrado: () => void;
}) {
  const conta = String(titulos[0]?.conta || '').toUpperCase() as 'NOVA' | 'CASTRO';
  const sel: TituloSel[] = useMemo(() => titulos.map((t) => ({
    conta, codigoLancamento: Number(t.codigoLancamento), numeroDoc: t.numeroDoc || null, numeroDocFiscal: t.numeroDocFiscal || null,
    valor: arred(Math.max(0, (Number(t.valor) || 0) - (Number(t.valorPago) || 0))), vencimento: t.vencimento || null, previsao: t.dataPrevisao || null,
    observacao: t.observacao || null, idOrigem: t.idOrigem || null, codigoFornecedor: t.codigoFornecedor ?? null, contraparte: t.contraparte || null,
  })), [titulos, conta]);
  const fornecedor = String(titulos[0]?.contraparte || '');
  const somaTitulos = useMemo(() => somar(sel.map((t) => t.valor)), [sel]);
  const nfs = useMemo(() => listaNFs(sel), [sel]);

  const [numero, setNumero] = useState('');
  const [codigoBarras, setCodigoBarras] = useState('');
  const [dataEmissao, setDataEmissao] = useState(hojeISO());
  const [qtd, setQtd] = useState('1');
  const [primeira, setPrimeira] = useState(somarDiasLocal(hojeISO(), 30));
  const [intervalo, setIntervalo] = useState('30');
  const [parcelas, setParcelas] = useState<ParcelaForm[]>(() => dividirIgual(somaTitulos, 1, somarDiasLocal(hojeISO(), 30)).map((p) => ({ numero: p.numero, dataVencimento: p.dataVencimento, valor: p.valor.toFixed(2) })));
  const [alinhar, setAlinhar] = useState(true);
  const [status, setStatus] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [resultado, setResultado] = useState<{ aplicados?: number; falhas?: number; bloqueado?: boolean } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !aplicando) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, aplicando]);

  const dividir = useCallback(() => {
    const n = Math.max(1, Math.min(24, parseInt(qtd, 10) || 1));
    const p = dividirIgual(somaTitulos, n, primeira || hojeISO(), Math.max(1, parseInt(intervalo, 10) || 30));
    setParcelas(p.map((x) => ({ numero: x.numero, dataVencimento: x.dataVencimento, valor: x.valor.toFixed(2) })));
  }, [qtd, primeira, intervalo, somaTitulos]);

  const parcelasNum: ParcelaIn[] = useMemo(() => parcelas.map((p, i) => ({ numero: i + 1, dataVencimento: p.dataVencimento, valor: arred(Number(String(p.valor).replace(',', '.')) || 0) })), [parcelas]);
  const somaParcelas = useMemo(() => somar(parcelasNum.map((p) => p.valor)), [parcelasNum]);
  const erroVal = useMemo(() => validarRegistro({ titulos: sel, parcelas: parcelasNum, numero, dataEmissao }), [sel, parcelasNum, numero, dataEmissao]);
  const previa = useMemo(() => {
    if (erroVal) return [];
    const { alocacoes } = alocar(sel, parcelasNum);
    return camposPorTitulo(sel, alocacoes, parcelasNum, { fornecedor, numero: numero || '?', alinharVencimento: alinhar })
      .map((c) => ({ ...c, titulo: sel.find((t) => t.codigoLancamento === c.codigoLancamento)!, partes: alocacoes.filter((a) => a.codigoLancamento === c.codigoLancamento) }));
  }, [erroVal, sel, parcelasNum, fornecedor, numero, alinhar]);

  const registrar = useCallback(async () => {
    if (erroVal) { setStatus(erroVal); return; }
    if (!confirm(`Registrar o boleto ${numero} de ${fornecedor} (${parcelasNum.length} parcela(s), ${fmtBRL(somaParcelas)}) e reprogramar ${sel.length} duplicata(s) na Omie?`)) return;
    setAplicando(true);
    setStatus('gravando e reprogramando as duplicatas na Omie…');
    try {
      const r = await fetch('/api/ajustes/boletos-fornecedor', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ conta, codigos: sel.map((t) => t.codigoLancamento), numero, codigoBarras, dataEmissao, parcelas: parcelasNum, alinharVencimento: alinhar }),
      });
      const d = await r.json();
      if (!d.ok) { setStatus(d.erro || 'falha'); setAplicando(false); return; }
      setResultado(d);
      setStatus(`boleto registrado · ${d.aplicados} duplicata(s) reprogramada(s)${d.falhas ? ` · ${d.falhas} falha(s) — use "Reaplicar" em Boletos de fornecedor` : ''}${d.bloqueado ? ' · Omie bloqueou, tente o resto em alguns minutos' : ''}`);
      setTimeout(onRegistrado, d.falhas ? 3500 : 1400);
    } catch (ex) {
      setStatus('rede: ' + (ex as Error).message); setAplicando(false);
    }
  }, [erroVal, numero, fornecedor, parcelasNum, somaParcelas, sel, conta, codigoBarras, dataEmissao, alinhar, onRegistrado]);

  const dif = arred(somaParcelas - somaTitulos);

  return (
    <div className="est-overlay" onClick={() => { if (!aplicando) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Registrar boleto agrupado — {fornecedor} · {conta}</h2>
          <button onClick={onClose} disabled={aplicando} style={closeBtn}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.85rem' }}>
          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, padding: '8px 12px', fontSize: '.75rem', color: '#475569', marginBottom: 12 }}>
            O boleto <b>não cria título nem baixa nada</b>: cada duplicata da NF recebe a previsão {alinhar ? 'e o vencimento ' : ''}da parcela onde cai e uma observação com o nº do boleto. A baixa acontece no dia do pagamento, em <b>Baixar contas → Boletos de fornecedor</b>.
          </div>

          <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 4 }}>Duplicatas selecionadas ({sel.length}) · NFs {nfs.join(', ') || '—'} · soma <b style={{ color: '#1e293b' }}>{fmtBRL(somaTitulos)}</b></div>
          <div style={{ maxHeight: 150, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 14 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.74rem' }}>
              <thead><tr>{['Documento', 'Parcela', 'Vencimento', 'Previsão', 'Em aberto'].map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
              <tbody>{sel.map((t) => {
                const orig = titulos.find((x) => Number(x.codigoLancamento) === t.codigoLancamento);
                return (
                  <tr key={t.codigoLancamento}>
                    <td style={td}>{t.numeroDoc || t.codigoLancamento}</td>
                    <td style={td}>{orig?.parcela || '-'}</td>
                    <td style={td}>{fmtBR(t.vencimento)}</td>
                    <td style={td}>{fmtBR(t.previsao) || '-'}</td>
                    <td style={{ ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(t.valor)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr', gap: 10, marginBottom: 12 }}>
            <div><label style={lbl}>Nº do boleto *</label><input value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} placeholder="nº do boleto / nosso número" style={inp} /></div>
            <div><label style={lbl}>Linha digitável / código de barras</label><input value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} maxLength={70} placeholder="opcional" style={inp} /></div>
            <div><label style={lbl}>Data do boleto</label><input type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} style={inp} /></div>
          </div>

          <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div><label style={lbl}>Parcelas</label><input type="number" min={1} max={24} value={qtd} onChange={(e) => setQtd(e.target.value)} style={{ ...inp, width: 70 }} /></div>
              <div><label style={lbl}>1ª vence em</label><input type="date" value={primeira} onChange={(e) => setPrimeira(e.target.value)} style={inp} /></div>
              <div><label style={lbl}>a cada (dias)</label><input type="number" min={1} max={120} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} style={{ ...inp, width: 80 }} /></div>
              <button onClick={dividir} style={btnSec}>Dividir igual</button>
              <span style={{ fontSize: '.7rem', color: '#94a3b8' }}>depois ajuste data/valor de cada parcela como está no boleto</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
              <thead><tr><th style={th}>#</th><th style={th}>Vencimento</th><th style={th}>Valor</th><th style={th} /></tr></thead>
              <tbody>{parcelas.map((p, i) => (
                <tr key={i}>
                  <td style={td}>{i + 1}/{parcelas.length}</td>
                  <td style={td}><input type="date" value={p.dataVencimento} onChange={(e) => setParcelas((s) => s.map((x, j) => j === i ? { ...x, dataVencimento: e.target.value } : x))} style={inp} /></td>
                  <td style={td}><input value={p.valor} onChange={(e) => setParcelas((s) => s.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} inputMode="decimal" style={{ ...inp, textAlign: 'right', width: 130 }} /></td>
                  <td style={{ ...td, textAlign: 'right' }}>{parcelas.length > 1 && <button onClick={() => setParcelas((s) => s.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '1rem' }}>×</button>}</td>
                </tr>
              ))}</tbody>
            </table>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 6, fontSize: '.74rem' }}>
              <button onClick={() => setParcelas((s) => [...s, { numero: s.length + 1, dataVencimento: somarDiasLocal(s[s.length - 1]?.dataVencimento || hojeISO(), Math.max(1, parseInt(intervalo, 10) || 30)), valor: '0.00' }])} style={{ ...btnSec, padding: '3px 8px' }}>+ parcela</button>
              <span>Soma das parcelas: <b>{fmtBRL(somaParcelas)}</b></span>
              <span style={{ color: Math.abs(dif) > 1 ? '#dc2626' : dif !== 0 ? '#b45309' : '#047857' }}>{dif === 0 ? 'bate com as duplicatas' : `${dif > 0 ? '+' : ''}${fmtBRL(dif)} vs duplicatas${Math.abs(dif) > 1 ? ' (fora da tolerância)' : ' (vai como juros/desconto na baixa)'}`}</span>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.78rem', color: '#334155', marginBottom: 10 }}>
            <input type="checkbox" checked={alinhar} onChange={(e) => setAlinhar(e.target.checked)} /> Alinhar também o <b>vencimento</b> da duplicata à parcela (senão só a previsão muda e a duplicata fica &quot;atrasada&quot; na Omie até a parcela)
          </label>

          {erroVal ? <div style={{ color: '#b45309', fontSize: '.76rem', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 6, padding: '6px 10px' }}>{erroVal}</div> : (
            <div>
              <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 4 }}>Prévia do que vai para a Omie (por duplicata)</div>
              <div style={{ maxHeight: 180, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.72rem' }}>
                  <thead><tr>{['Documento', 'Cai na parcela', 'Previsão', alinhar ? 'Vencimento' : '', 'Observação'].filter(Boolean).map((h) => <th key={h} style={th}>{h}</th>)}</tr></thead>
                  <tbody>{previa.map((p) => (
                    <tr key={p.codigoLancamento}>
                      <td style={td}>{p.titulo.numeroDoc || p.codigoLancamento}</td>
                      <td style={td}>{p.partes.map((a) => `${a.parcelaNumero} (${fmtBRL(a.valor)})`).join(' + ')}</td>
                      <td style={td}>{fmtBR(p.titulo.previsao) || fmtBR(p.titulo.vencimento)} → <b>{fmtBR(p.campos.dataPrevisao)}</b></td>
                      {alinhar && <td style={td}>{fmtBR(p.titulo.vencimento)} → <b>{fmtBR(p.campos.dataVencimento)}</b></td>}
                      <td style={{ ...td, color: '#64748b', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.campos.observacao}>{p.campos.observacao}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: resultado ? '#047857' : status ? '#dc2626' : '#64748b', marginRight: 'auto' }}>{status}</span>
          <button onClick={onClose} disabled={aplicando} style={btnSec}>{resultado ? 'Fechar' : 'Cancelar'}</button>
          {!resultado && <button onClick={registrar} disabled={aplicando || !!erroVal} style={{ ...btnPrim, background: '#7c3aed', opacity: aplicando || erroVal ? 0.5 : 1 }}>Registrar e reprogramar na Omie</button>}
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '5px 8px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #f1f5f9', color: '#334155' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '.68rem', color: '#64748b', marginBottom: 2 };
const inp: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.8rem', background: '#fff' };
const closeBtn: React.CSSProperties = { background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' };
const btnSec: React.CSSProperties = { padding: '6px 12px', fontSize: '.8rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' };
const btnPrim: React.CSSProperties = { padding: '6px 12px', fontSize: '.82rem', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' };
