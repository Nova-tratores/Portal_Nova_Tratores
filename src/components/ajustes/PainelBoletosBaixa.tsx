'use client';
// Painel "Boletos de fornecedor" da tela Baixar contas: parcelas em aberto dos
// boletos agrupados registrados (Correção de contas → Registrar boleto). Pagar
// uma parcela = baixar cada duplicata alocada nela (LancarPagamento por
// duplicata, na conta corrente e data informadas).
import { useCallback, useEffect, useState } from 'react';
import { authHeaders, fetchAuth } from '@/lib/auth/client';
import { fmtBR } from '@/lib/ajustes/boletos-fornecedor';

interface Parcela { id: string; numero: number; total: number; data_vencimento: string; valor: number; status: string; pago_em: string | null }
interface TituloB { parcela_id: string; codigo_lancamento: number; numero_documento: string | null; valor_alocado: number; status: string; erro: string | null }
export interface Boleto { id: string; conta_omie: string; nome_fornecedor: string; numero: string; status: string; erro: string | null; valor_total: number; parcelas: Parcela[]; titulos: TituloB[] }
interface ContaCorrente { codigo: string | number; descricao: string; tipo?: string }

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtBRL = (n: number) => brl.format(Number(n) || 0);
const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

export default function PainelBoletosBaixa({ conta, versao, onPago }: { conta: string; versao: number; onPago: () => void }) {
  const [boletos, setBoletos] = useState<Boleto[]>([]);
  const [erro, setErro] = useState('');
  const [semTabela, setSemTabela] = useState(false);
  const [pagando, setPagando] = useState<{ boleto: Boleto; parcela: Parcela } | null>(null);

  const carregar = useCallback(async () => {
    if (!conta) return;
    try {
      const r = await fetch(`/api/ajustes/boletos-fornecedor?conta=${encodeURIComponent(conta)}&status=ativos`, { headers: await authHeaders() });
      const d = await r.json();
      if (d.migracaoFaltando) { setSemTabela(true); return; }
      if (d.erro) { setErro(d.erro); return; }
      setBoletos(d.boletos || []);
      setErro('');
    } catch (ex) { setErro((ex as Error).message); }
  }, [conta]);
  // (setTimeout: o lint react-hooks/set-state-in-effect recusa chamada direta que faz setState)
  useEffect(() => { const t = setTimeout(carregar, 0); return () => clearTimeout(t); }, [carregar, versao]);

  if (semTabela) return null;
  const hoje = hojeISO();
  const linhas = boletos.flatMap((b) => b.parcelas.filter((p) => p.status === 'aberta').map((p) => ({ b, p })))
    .sort((x, y) => x.p.data_vencimento.localeCompare(y.p.data_vencimento));
  if (!linhas.length && !erro) return null;

  return (
    <div style={{ background: '#fff', border: '1px solid #ddd6fe', borderRadius: 8, marginBottom: 14, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', background: '#f5f3ff', borderBottom: '1px solid #ddd6fe', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <b style={{ fontSize: '.82rem', color: '#5b21b6' }}>Boletos de fornecedor</b>
        <span style={{ fontSize: '.7rem', color: '#6d28d9' }}>parcelas em aberto · pagar uma parcela baixa as duplicatas da NF que caem nela</span>
        {erro && <span style={{ fontSize: '.7rem', color: '#dc2626' }}>{erro}</span>}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.78rem' }}>
        <thead><tr>{['Vencimento', 'Fornecedor', 'Boleto', 'Parcela', 'Duplicatas', 'Valor', ''].map((h, i) => <th key={i} style={th}>{h}</th>)}</tr></thead>
        <tbody>{linhas.map(({ b, p }) => {
          const tits = b.titulos.filter((t) => t.parcela_id === p.id);
          const atrasada = p.data_vencimento < hoje;
          const pendente = b.status === 'pendente' || b.status === 'erro_omie';
          return (
            <tr key={p.id}>
              <td style={{ ...td, color: atrasada ? '#b91c1c' : '#334155', fontWeight: atrasada ? 600 : 400 }}>{fmtBR(p.data_vencimento)}</td>
              <td style={td}>{b.nome_fornecedor}</td>
              <td style={{ ...td, fontFamily: 'monospace' }}>{b.numero}</td>
              <td style={td}>{p.numero}/{p.total}</td>
              <td style={{ ...td, fontSize: '.7rem', color: '#64748b' }} title={tits.map((t) => `${t.numero_documento || t.codigo_lancamento}: ${fmtBRL(t.valor_alocado)}`).join('\n')}>{tits.map((t) => t.numero_documento || t.codigo_lancamento).join(', ')}</td>
              <td style={{ ...td, textAlign: 'right', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(p.valor)}</td>
              <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                {pendente ? <span style={{ fontSize: '.68rem', color: '#b45309' }} title={b.erro || ''}>duplicatas não aplicadas na Omie — reaplique em Boletos de fornecedor</span>
                  : <button onClick={() => setPagando({ boleto: b, parcela: p })} style={{ padding: '3px 10px', background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 4, fontSize: '.72rem', cursor: 'pointer' }}>Pagar parcela</button>}
              </td>
            </tr>
          );
        })}</tbody>
      </table>
      {pagando && <ModalPagarParcela conta={conta} boleto={pagando.boleto} parcela={pagando.parcela} onClose={() => setPagando(null)} onPago={() => { setPagando(null); carregar(); onPago(); }} />}
    </div>
  );
}

function ModalPagarParcela({ conta, boleto, parcela, onClose, onPago }: { conta: string; boleto: Boleto; parcela: Parcela; onClose: () => void; onPago: () => void }) {
  const [ccs, setCcs] = useState<ContaCorrente[]>([]);
  const [ccSel, setCcSel] = useState('');
  const [data, setData] = useState(hojeISO());
  const [obs, setObs] = useState('');
  const [conciliar, setConciliar] = useState(false);
  const [status, setStatus] = useState('');
  const [aplicando, setAplicando] = useState(false);
  const [detalhes, setDetalhes] = useState<Array<{ codigoLancamento: number; valor: number; juros: number; desconto: number; ok: boolean; erro: string | null }> | null>(null);
  const tits = boleto.titulos.filter((t) => t.parcela_id === parcela.id);

  useEffect(() => {
    let vivo = true;
    fetchAuth('/api/ajustes/contas-correntes?conta=' + encodeURIComponent(conta)).then((r) => r.json())
      .then((d) => { if (vivo) setCcs(d.contasCorrentes || []); }).catch(() => { if (vivo) setCcs([]); });
    return () => { vivo = false; };
  }, [conta]);

  const pagar = useCallback(async () => {
    if (!ccSel) { setStatus('escolha a conta corrente'); return; }
    if (!data) { setStatus('informe a data'); return; }
    if (!confirm(`Baixar na Omie as ${tits.length} duplicata(s) da parcela ${parcela.numero}/${parcela.total} do boleto ${boleto.numero} (${fmtBRL(parcela.valor)}) em ${fmtBR(data)}?`)) return;
    setAplicando(true);
    setStatus('baixando as duplicatas na Omie…');
    try {
      const r = await fetch(`/api/ajustes/boletos-fornecedor/${boleto.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao: 'pagar', parcelaId: parcela.id, codigoContaCorrente: ccSel, data, observacao: obs, conciliar }),
      });
      const d = await r.json();
      setDetalhes(d.detalhes || null);
      if (!d.ok) { setStatus(d.erro || 'falha'); setAplicando(false); return; }
      setStatus(`parcela paga ✓ · ${d.baixados} duplicata(s) baixada(s)${d.jaPagos?.length ? ` · ${d.jaPagos.length} já estava(m) baixada(s)` : ''}`);
      setTimeout(onPago, 1200);
    } catch (ex) { setStatus('rede: ' + (ex as Error).message); setAplicando(false); }
  }, [ccSel, data, obs, conciliar, boleto, parcela, tits.length, onPago]);

  return (
    <div className="est-overlay" onClick={() => { if (!aplicando) onClose(); }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 10, width: '100%', maxWidth: 540, maxHeight: '88vh', display: 'flex', flexDirection: 'column', boxShadow: '0 10px 40px rgba(0,0,0,.25)' }}>
        <div style={{ borderBottom: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontWeight: 600, color: '#1e293b', fontSize: '.95rem', margin: 0 }}>Pagar parcela {parcela.numero}/{parcela.total} · boleto {boleto.numero}</h2>
          <button onClick={onClose} disabled={aplicando} style={{ background: 'none', border: 'none', fontSize: '1.5rem', lineHeight: 1, color: '#64748b', cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ padding: 18, overflowY: 'auto', fontSize: '.85rem' }}>
          <div style={{ fontSize: '.72rem', color: '#64748b', marginBottom: 10 }}>{boleto.nome_fornecedor} · {conta} · vence {fmtBR(parcela.data_vencimento)} · <b style={{ color: '#1e293b' }}>{fmtBRL(parcela.valor)}</b></div>
          <div style={{ border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 12, maxHeight: 140, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.74rem' }}>
              <thead><tr><th style={th}>Duplicata</th><th style={th}>Valor nesta parcela</th><th style={th}>Resultado</th></tr></thead>
              <tbody>{tits.map((t) => {
                const r = detalhes?.find((d) => d.codigoLancamento === t.codigo_lancamento);
                return (
                  <tr key={t.codigo_lancamento}>
                    <td style={td}>{t.numero_documento || t.codigo_lancamento}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{fmtBRL(t.valor_alocado)}</td>
                    <td style={{ ...td, fontSize: '.68rem', color: r ? (r.ok ? '#047857' : '#dc2626') : '#94a3b8' }}>{r ? (r.ok ? `baixada${r.juros ? ` +juros ${fmtBRL(r.juros)}` : ''}${r.desconto ? ` −desc ${fmtBRL(r.desconto)}` : ''}` : r.erro) : t.status === 'baixado' ? 'já baixada' : '—'}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ gridColumn: '1 / -1' }}><label style={lbl}>Conta corrente (de onde o boleto foi pago)</label>
              <select value={ccSel} onChange={(e) => setCcSel(e.target.value)} style={inp}>
                <option value="">(escolha)</option>
                {ccs.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.descricao}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
              </select>
            </div>
            <div><label style={lbl}>Pago em</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} style={inp} /></div>
            <div><label style={lbl}>Observação (opcional)</label><input value={obs} onChange={(e) => setObs(e.target.value)} maxLength={120} style={inp} /></div>
            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: '.76rem', color: '#334155' }}><input type="checkbox" checked={conciliar} onChange={(e) => setConciliar(e.target.checked)} /> Marcar como conciliado na Omie</label>
          </div>
          <div style={{ marginTop: 10, fontSize: '.7rem', color: '#94a3b8' }}>Na conciliação bancária da Omie, a linha do extrato do boleto casa com estas {tits.length} baixas juntas.</div>
        </div>
        <div style={{ borderTop: '1px solid #e2e8f0', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: '.72rem', color: status.includes('✓') ? '#047857' : '#dc2626', marginRight: 'auto' }}>{status}</span>
          <button onClick={onClose} disabled={aplicando} style={{ padding: '6px 12px', fontSize: '.82rem', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={pagar} disabled={aplicando} style={{ padding: '6px 12px', fontSize: '.82rem', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', background: '#059669', opacity: aplicando ? 0.5 : 1 }}>Baixar duplicatas na Omie</button>
        </div>
      </div>
    </div>
  );
}

const th: React.CSSProperties = { background: '#f8fafc', color: '#475569', fontSize: '.64rem', textTransform: 'uppercase', letterSpacing: '.4px', padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #e2e8f0', fontWeight: 600, whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '6px 10px', borderBottom: '1px solid #f1f5f9', color: '#334155' };
const lbl: React.CSSProperties = { display: 'block', fontSize: '.68rem', color: '#64748b', marginBottom: 2 };
const inp: React.CSSProperties = { width: '100%', border: '1px solid #cbd5e1', borderRadius: 6, padding: '5px 8px', fontSize: '.8rem', background: '#fff' };
