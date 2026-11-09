'use client';
// Registrar boleto agrupado de fornecedor a partir das duplicatas selecionadas
// na Correção de contas (vista Lista). Prévia = regras puras de
// lib/ajustes/boletos-fornecedor.ts; a gravação (banco + AlterarContaPagar
// por duplicata) é a rota POST /api/ajustes/boletos-fornecedor.
import { useCallback, useMemo, useState } from 'react';
import { authHeaders } from '@/lib/auth/client';
import { BotaoFin, CampoFin, JanelaFin } from '@/components/ajustes/omie-fin';
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
    <JanelaFin titulo="Registrar boleto agrupado" largura={920} onFechar={onClose} travado={aplicando}
      sub={<>{fornecedor} · {conta} · {sel.length} duplicata(s) · NFs {nfs.join(', ') || '—'}</>}
      pe={<>
        <span className={`ofin-msg${resultado ? ' ok' : status ? ' erro' : ''}`}>{status}</span>
        <BotaoFin variante="neutro" onClick={onClose} disabled={aplicando}>{resultado ? 'Fechar' : 'Cancelar'}</BotaoFin>
        {!resultado && <BotaoFin variante="prim" icone="fa-barcode" onClick={registrar} disabled={aplicando || !!erroVal}>Registrar e reprogramar na Omie</BotaoFin>}
      </>}>
      <div className="ofin-aviso info">
        <div>O boleto <b>não cria título nem baixa nada</b>: cada duplicata da NF recebe a previsão {alinhar ? 'e o vencimento ' : ''}da parcela onde cai e uma observação com o nº do boleto. A baixa acontece no dia do pagamento, em <b>Baixar contas → Boletos de fornecedor</b>.</div>
      </div>

      <div>
        <h3 className="ofin-secao">Duplicatas selecionadas <small>soma <b>{fmtBRL(somaTitulos)}</b></small></h3>
        <div className="ofin-cartao" style={{ marginBottom: 0 }}>
          <div className="ofin-grade-caixa" style={{ maxHeight: 170 }}>
            <table className="ofin-grade compacta">
              <thead><tr><th>Documento</th><th>Parcela</th><th>Vencimento</th><th>Previsão</th><th className="num">Em aberto</th></tr></thead>
              <tbody>{sel.map((t) => {
                const orig = titulos.find((x) => Number(x.codigoLancamento) === t.codigoLancamento);
                return (
                  <tr key={t.codigoLancamento}>
                    <td>{t.numeroDoc || t.codigoLancamento}</td>
                    <td>{orig?.parcela || '-'}</td>
                    <td>{fmtBR(t.vencimento)}</td>
                    <td>{fmtBR(t.previsao) || '-'}</td>
                    <td className="num">{fmtBRL(t.valor)}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="ofin-grid" style={{ gridTemplateColumns: '1.2fr 2fr 1fr' }}>
        <CampoFin titulo="Nº do boleto *"><input className="ofin-inp" value={numero} onChange={(e) => setNumero(e.target.value)} maxLength={60} placeholder="nº do boleto / nosso número" /></CampoFin>
        <CampoFin titulo="Linha digitável / código de barras"><input className="ofin-inp" value={codigoBarras} onChange={(e) => setCodigoBarras(e.target.value)} maxLength={70} placeholder="opcional" /></CampoFin>
        <CampoFin titulo="Data do boleto"><input className="ofin-inp" type="date" value={dataEmissao} onChange={(e) => setDataEmissao(e.target.value)} /></CampoFin>
      </div>

      <div className="ofin-caixa">
        <h3 className="ofin-secao">Parcelas do boleto <small>divida igual e depois ajuste data/valor de cada parcela como está no boleto</small></h3>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <CampoFin titulo="Parcelas" style={{ width: 90 }}><input className="ofin-inp num" type="number" min={1} max={24} value={qtd} onChange={(e) => setQtd(e.target.value)} /></CampoFin>
          <CampoFin titulo="1ª vence em" style={{ width: 170 }}><input className="ofin-inp" type="date" value={primeira} onChange={(e) => setPrimeira(e.target.value)} /></CampoFin>
          <CampoFin titulo="a cada (dias)" style={{ width: 110 }}><input className="ofin-inp num" type="number" min={1} max={120} value={intervalo} onChange={(e) => setIntervalo(e.target.value)} /></CampoFin>
          <BotaoFin icone="fa-divide" onClick={dividir} style={{ height: 38 }}>Dividir igual</BotaoFin>
        </div>
        <div className="ofin-cartao" style={{ marginBottom: 0 }}>
          <table className="ofin-grade compacta">
            <thead><tr><th>Parcela</th><th>Vencimento</th><th className="num">Valor</th><th /></tr></thead>
            <tbody>{parcelas.map((p, i) => (
              <tr key={i}>
                <td>{String(i + 1).padStart(3, '0')}/{String(parcelas.length).padStart(3, '0')}</td>
                <td style={{ padding: '4px 10px' }}><input className="ofin-inp" style={{ width: 170, minHeight: 32 }} type="date" value={p.dataVencimento} onChange={(e) => setParcelas((s) => s.map((x, j) => j === i ? { ...x, dataVencimento: e.target.value } : x))} /></td>
                <td className="num" style={{ padding: '4px 10px' }}><input className="ofin-inp num" style={{ width: 140, minHeight: 32, marginLeft: 'auto' }} value={p.valor} onChange={(e) => setParcelas((s) => s.map((x, j) => j === i ? { ...x, valor: e.target.value } : x))} inputMode="decimal" /></td>
                <td className="num">{parcelas.length > 1 && <button type="button" className="ofin-x" title="Tirar esta parcela" onClick={() => setParcelas((s) => s.filter((_, j) => j !== i))}>×</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          <div className="ofin-rodape" style={{ alignItems: 'center' }}>
            <button type="button" className="ofin-link" onClick={() => setParcelas((s) => [...s, { numero: s.length + 1, dataVencimento: somarDiasLocal(s[s.length - 1]?.dataVencimento || hojeISO(), Math.max(1, parseInt(intervalo, 10) || 30)), valor: '0.00' }])}><i className="fas fa-plus" /> Incluir parcela</button>
            <span>Soma das parcelas: <b style={{ color: 'var(--portal-text, #1f2d3d)' }}>{fmtBRL(somaParcelas)}</b> · <span style={{ color: Math.abs(dif) > 1 ? '#dc2626' : dif !== 0 ? '#b45309' : '#047857', fontWeight: 600 }}>{dif === 0 ? 'bate com as duplicatas' : `${dif > 0 ? '+' : ''}${fmtBRL(dif)} vs duplicatas${Math.abs(dif) > 1 ? ' (fora da tolerância)' : ' (vai como juros/desconto na baixa)'}`}</span></span>
          </div>
        </div>
      </div>

      <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 13, cursor: 'pointer' }}>
        <input type="checkbox" checked={alinhar} onChange={(e) => setAlinhar(e.target.checked)} style={{ marginTop: 2 }} /> <span>Alinhar também o <b>vencimento</b> da duplicata à parcela (senão só a previsão muda e a duplicata fica &quot;atrasada&quot; na Omie até a parcela)</span>
      </label>

      {erroVal ? <div className="ofin-aviso"><div>{erroVal}</div></div> : (
        <div>
          <h3 className="ofin-secao">Prévia do que vai para a Omie <small>por duplicata</small></h3>
          <div className="ofin-cartao" style={{ marginBottom: 0 }}>
            <div className="ofin-grade-caixa" style={{ maxHeight: 200 }}>
              <table className="ofin-grade compacta">
                <thead><tr><th>Documento</th><th>Cai na parcela</th><th>Previsão</th>{alinhar && <th>Vencimento</th>}<th>Observação</th></tr></thead>
                <tbody>{previa.map((p) => (
                  <tr key={p.codigoLancamento}>
                    <td>{p.titulo.numeroDoc || p.codigoLancamento}</td>
                    <td>{p.partes.map((a) => `${a.parcelaNumero} (${fmtBRL(a.valor)})`).join(' + ')}</td>
                    <td className="nowrap">{fmtBR(p.titulo.previsao) || fmtBR(p.titulo.vencimento)} → <b>{fmtBR(p.campos.dataPrevisao)}</b></td>
                    {alinhar && <td className="nowrap">{fmtBR(p.titulo.vencimento)} → <b>{fmtBR(p.campos.dataVencimento)}</b></td>}
                    <td className="apagado" style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.campos.observacao}>{p.campos.observacao}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </JanelaFin>
  );
}
