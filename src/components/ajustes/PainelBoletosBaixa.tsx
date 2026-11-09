'use client';
// Painel "Boletos de fornecedor" da tela Baixar contas: parcelas em aberto dos
// boletos agrupados registrados (Correção de contas → Registrar boleto). Pagar
// uma parcela = baixar cada duplicata alocada nela (LancarPagamento por
// duplicata, na conta corrente e data informadas). Visual = kit omie-fin.
import { useCallback, useEffect, useState } from 'react';
import { authHeaders, fetchAuth } from '@/lib/auth/client';
import { fmtBR } from '@/lib/ajustes/boletos-fornecedor';
import { BotaoFin, CampoFin, JanelaFin, RodapeGrade } from '@/components/ajustes/omie-fin';

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
    <div className="ofin-cartao">
      <div className="ofin-grade-cab">
        <h2><i className="fas fa-barcode" /> Boletos de fornecedor</h2>
        <span className="ofin-sub">parcelas em aberto · pagar uma parcela baixa as duplicatas da NF que caem nela</span>
        {erro && <span className="ofin-msg erro">{erro}</span>}
      </div>
      <div className="ofin-grade-caixa">
        <table className="ofin-grade">
          <thead><tr><th>Vencimento</th><th>Fornecedor</th><th>Boleto</th><th>Parcela</th><th>Duplicatas</th><th className="num">Valor</th><th /></tr></thead>
          <tbody>{linhas.map(({ b, p }) => {
            const tits = b.titulos.filter((t) => t.parcela_id === p.id);
            const atrasada = p.data_vencimento < hoje;
            const pendente = b.status === 'pendente' || b.status === 'erro_omie';
            return (
              <tr key={p.id}>
                <td className="nowrap" style={{ color: atrasada ? '#b91c1c' : undefined, fontWeight: atrasada ? 600 : 400 }}>{fmtBR(p.data_vencimento)}</td>
                <td>{b.nome_fornecedor}</td>
                <td style={{ fontFamily: 'monospace' }}>{b.numero}</td>
                <td className="nowrap">{p.numero}/{p.total}</td>
                <td className="apagado" title={tits.map((t) => `${t.numero_documento || t.codigo_lancamento}: ${fmtBRL(t.valor_alocado)}`).join('\n')}>{tits.map((t) => t.numero_documento || t.codigo_lancamento).join(', ')}</td>
                <td className="num" style={{ fontWeight: 600 }}>{fmtBRL(p.valor)}</td>
                <td className="num">
                  {pendente ? <span className="ofin-msg" style={{ color: '#b45309' }} title={b.erro || ''}>duplicatas não aplicadas na Omie — reaplique em Boletos de fornecedor</span>
                    : <BotaoFin mini variante="prim" icone="fa-check" onClick={() => setPagando({ boleto: b, parcela: p })}>Pagar parcela</BotaoFin>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
      <RodapeGrade mostrando={linhas.length} />
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
      const enviar = async (conferido: boolean) => (await fetch(`/api/ajustes/boletos-fornecedor/${boleto.id}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: JSON.stringify({ acao: 'pagar', parcelaId: parcela.id, codigoContaCorrente: ccSel, data, observacao: obs, conciliar, conferido }),
      })).json();
      let d = await enviar(false);
      // a tentativa anterior ficou sem resposta clara da Omie: só repete com a conferência de quem está pagando
      if (!d.ok && d.incerto && !d.detalhes && confirm(`${d.erro}

Você conferiu na Omie e a baixa NÃO entrou? OK = baixar de novo. Cancelar = não fazer nada.`)) d = await enviar(true);
      setDetalhes(d.detalhes || null);
      if (!d.ok) { setStatus(d.erro || 'falha'); setAplicando(false); return; }
      setStatus(`parcela paga ✓ · ${d.baixados} duplicata(s) baixada(s)${d.jaPagos?.length ? ` · ${d.jaPagos.length} já estava(m) baixada(s)` : ''}`);
      setTimeout(onPago, 1200);
    } catch (ex) { setStatus('rede: ' + (ex as Error).message); setAplicando(false); }
  }, [ccSel, data, obs, conciliar, boleto, parcela, tits.length, onPago]);

  return (
    <JanelaFin titulo={`Pagar parcela ${parcela.numero}/${parcela.total}`} largura={600} onFechar={onClose} travado={aplicando}
      sub={<>Boleto <b>{boleto.numero}</b> · {boleto.nome_fornecedor} · {conta} · vence {fmtBR(parcela.data_vencimento)} · <b>{fmtBRL(parcela.valor)}</b></>}
      pe={<>
        <span className={`ofin-msg${status.includes('✓') ? ' ok' : status ? ' erro' : ''}`}>{status}</span>
        <BotaoFin variante="neutro" onClick={onClose} disabled={aplicando}>Cancelar</BotaoFin>
        <BotaoFin variante="prim" icone="fa-check" onClick={pagar} disabled={aplicando}>Baixar duplicatas na Omie</BotaoFin>
      </>}>
      <div className="ofin-cartao" style={{ marginBottom: 0 }}>
        <div className="ofin-grade-caixa" style={{ maxHeight: 180 }}>
          <table className="ofin-grade compacta">
            <thead><tr><th>Duplicata</th><th className="num">Valor nesta parcela</th><th>Resultado</th></tr></thead>
            <tbody>{tits.map((t) => {
              const r = detalhes?.find((d) => d.codigoLancamento === t.codigo_lancamento);
              return (
                <tr key={t.codigo_lancamento}>
                  <td>{t.numero_documento || t.codigo_lancamento}</td>
                  <td className="num">{fmtBRL(t.valor_alocado)}</td>
                  <td style={{ fontSize: 12, color: r ? (r.ok ? '#047857' : '#dc2626') : '#94a3b8' }}>{r ? (r.ok ? `baixada${r.juros ? ` +juros ${fmtBRL(r.juros)}` : ''}${r.desconto ? ` −desc ${fmtBRL(r.desconto)}` : ''}` : r.erro) : t.status === 'baixado' ? 'já baixada' : '—'}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </div>
      <CampoFin titulo="Conta corrente (de onde o boleto foi pago)">
        <select className="ofin-inp" value={ccSel} onChange={(e) => setCcSel(e.target.value)}>
          <option value="">(escolha)</option>
          {ccs.map((c) => <option key={String(c.codigo)} value={String(c.codigo)}>{c.descricao}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
        </select>
      </CampoFin>
      <div className="ofin-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <CampoFin titulo="Pago em"><input className="ofin-inp" type="date" value={data} onChange={(e) => setData(e.target.value)} /></CampoFin>
        <CampoFin titulo="Observação (opcional)"><input className="ofin-inp" value={obs} onChange={(e) => setObs(e.target.value)} maxLength={120} /></CampoFin>
      </div>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}><input type="checkbox" checked={conciliar} onChange={(e) => setConciliar(e.target.checked)} /> Marcar como conciliado na Omie</label>
      <div className="ofin-msg">Na conciliação bancária da Omie, a linha do extrato do boleto casa com estas {tits.length} baixas juntas.</div>
    </JanelaFin>
  );
}
