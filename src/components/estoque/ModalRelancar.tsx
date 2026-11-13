'use client';
// Relançar os pagamentos guardados na reversão, depois da nova entrada da nota.
// Prévia: cada pagamento antigo → a conta a pagar nova (pela parcela); a pessoa confere,
// pode trocar a parcela e confirma. Lança com a mesma data, conta corrente, juros, multa
// e desconto, conciliado quando o original era.
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import { useContasCorrentes } from './ModalReabrir';

interface Pag { data: string; valor: number; juros: number; multa: number; desconto: number; contaCorrente: number | null; conciliadoEm: string | null; numeroParcela: string | null; codigoBaixaNova?: number | null; erro?: string | null }
interface Tit { codigo: number; numeroParcela: string | null; valorDocumento: number; valorPago: number; status: string | null; vencimento: string | null }
interface Item { indice: number; pagamento: Pag; tituloNovo: number | null; bloqueio: string | null }
interface Previa {
  ficha: { id: string; numeroNfe: string | null; motivo: string | null; criadoEm: string; quem: string | null; pagamentos: Pag[] } | null;
  nota?: { recebido: boolean }; titulos?: Tit[]; itens?: Item[]; avisos?: string[]; erro?: string; migracaoFaltando?: boolean;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export default function ModalRelancar({ conta, idReceb, podeBaixa, onClose, onFeito }: {
  conta: string; idReceb: number | string; podeBaixa: boolean;
  onClose: () => void; onFeito: (msg: string, tipo: 'ok' | 'err') => void;
}) {
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState('');
  const [escolha, setEscolha] = useState<Record<number, { marcado: boolean; titulo: number | null }>>({});
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<Array<{ indice: number; ok: boolean; erro?: string }> | null>(null);
  const cc = useContasCorrentes(conta);

  const carregar = () => {
    fetchAuth(`/api/estoque/recebimentos/${idReceb}/relancar?conta=${encodeURIComponent(conta)}`)
      .then((r) => r.json()).then((d: Previa) => {
        if (d.erro) { setErro(d.erro); return; }
        setPrevia(d);
        const e: Record<number, { marcado: boolean; titulo: number | null }> = {};
        for (const it of d.itens || []) e[it.indice] = { marcado: !it.bloqueio, titulo: it.tituloNovo };
        setEscolha(e);
      }).catch((e) => setErro((e as Error).message));
  };
  useEffect(carregar, [conta, idReceb]);

  const itens = previa?.itens || [];
  const titulos = previa?.titulos || [];
  const marcados = itens.filter((it) => escolha[it.indice]?.marcado && escolha[it.indice]?.titulo);
  const podeEnviar = podeBaixa && !!previa?.nota?.recebido && marcados.length > 0 && !enviando;

  const confirmar = async () => {
    setEnviando(true);
    setErro('');
    try {
      const r = await fetchAuth(`/api/estoque/recebimentos/${idReceb}/relancar?conta=${encodeURIComponent(conta)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itens: marcados.map((it) => ({ indice: it.indice, tituloNovo: escolha[it.indice].titulo })) }),
      });
      const d = await r.json();
      if (d.erro && !d.resultados) { setErro(d.erro); return; }
      setResultado(d.resultados || []);
      const ok = (d.resultados || []).filter((x: { ok: boolean }) => x.ok).length;
      if (d.status === 'relancada') onFeito(`Pagamentos relançados na Omie (${ok}). Reversão encerrada.`, 'ok');
      else carregar();
    } catch (e) {
      setErro('Erro: ' + (e as Error).message);
    } finally {
      setEnviando(false);
    }
  };

  const th: React.CSSProperties = { textAlign: 'left', fontSize: '.66rem', color: '#64748b', textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: '.8rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !enviando) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 110, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="est-modal" style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 820, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.15)' }}>
        <h3 style={{ color: '#047857', fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px' }}>Relançar pagamentos{previa?.ficha?.numeroNfe ? ` · NF ${String(previa.ficha.numeroNfe).replace(/^0+(?=\d)/, '')}` : ''}</h3>
        {previa?.ficha && <div style={{ fontSize: '.76rem', color: '#64748b', marginBottom: 10 }}>Revertida por {previa.ficha.quem || '?'} em {new Date(previa.ficha.criadoEm).toLocaleString('pt-BR')}{previa.ficha.motivo ? ` · motivo: ${previa.ficha.motivo}` : ''}</div>}
        {!previa && !erro && <div style={{ color: '#64748b', fontSize: '.85rem' }}>Consultando as contas a pagar novas na Omie…</div>}
        {previa && !previa.ficha && <div style={{ fontSize: '.85rem', color: '#166534' }}>{previa.migracaoFaltando ? 'Falta aplicar sql/recebimento-reversoes.sql.' : 'Não há pagamentos a relançar para esta nota.'}</div>}
        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', marginBottom: 10 }}>{erro}</div>}
        {(previa?.avisos || []).map((a, i) => <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', marginBottom: 8 }}>{a}</div>)}

        {previa?.ficha && itens.length > 0 && (
          <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead><tr><th style={th}></th><th style={th}>Pagamento guardado</th><th style={th}>Conta corrente</th><th style={th}>Vai para a parcela nova</th><th style={th}>Situação</th></tr></thead>
              <tbody>
                {itens.map((it) => {
                  const p = it.pagamento;
                  const e = escolha[it.indice] || { marcado: false, titulo: null };
                  const res = resultado?.find((x) => x.indice === it.indice);
                  return (
                    <tr key={it.indice}>
                      <td style={td}><input type="checkbox" checked={e.marcado} disabled={!e.titulo} style={{ width: 20, height: 20 }}
                        onChange={(ev) => setEscolha((s) => ({ ...s, [it.indice]: { ...e, marcado: ev.target.checked } }))} /></td>
                      <td style={td}>
                        <b>{brl(p.valor)}</b> em {p.data}
                        <div style={{ fontSize: '.7rem', color: '#64748b' }}>
                          parcela antiga {p.numeroParcela || '—'}{p.juros + p.multa ? ` · juros/multa ${brl(p.juros + p.multa)}` : ''}{p.desconto ? ` · desconto ${brl(p.desconto)}` : ''}{p.conciliadoEm ? ' · conciliado' : ''}
                        </div>
                      </td>
                      <td style={td}>{p.contaCorrente ? (cc[String(p.contaCorrente)] || p.contaCorrente) : '—'}</td>
                      <td style={td}>
                        <select value={e.titulo ?? ''} onChange={(ev) => setEscolha((s) => ({ ...s, [it.indice]: { marcado: !!ev.target.value, titulo: ev.target.value ? Number(ev.target.value) : null } }))}
                          style={{ minHeight: 36, border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 6px', fontSize: '.78rem', maxWidth: 260 }}>
                          <option value="">(não relançar)</option>
                          {titulos.map((t) => <option key={t.codigo} value={t.codigo}>Parcela {t.numeroParcela || '—'} · {brl(t.valorDocumento)} · vence {t.vencimento || '—'}</option>)}
                        </select>
                      </td>
                      <td style={{ ...td, fontSize: '.74rem' }}>
                        {res ? (res.ok ? <span style={{ color: '#047857' }}>✓ relançado</span> : <span style={{ color: '#b91c1c' }}>{res.erro}</span>)
                          : it.bloqueio ? <span style={{ color: '#b45309' }}>{it.bloqueio}</span> : <span style={{ color: '#64748b' }}>pronto</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {previa?.ficha && !podeBaixa && <div style={{ marginTop: 10, background: '#f1f5f9', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem' }}>Relançar exige a permissão <b>Baixar contas</b> do Financeiro.</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={onClose} disabled={enviando} style={{ minHeight: 40, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
          {previa?.ficha && (
            <button onClick={confirmar} disabled={!podeEnviar}
              style={{ minHeight: 40, padding: '8px 18px', borderRadius: 8, border: 'none', background: podeEnviar ? '#059669' : '#a7f3d0', color: '#fff', fontWeight: 600, cursor: podeEnviar ? 'pointer' : 'not-allowed' }}>
              {enviando ? 'Lançando na Omie…' : `Relançar ${marcados.length} pagamento(s) na Omie`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
