'use client';
// Janela do "Reabrir" (reverter o recebimento na Omie). Antes de confirmar, lê na Omie
// as contas a pagar da nota e os pagamentos já lançados. Com pagamento: o portal cancela
// os pagamentos, reverte e guarda tudo para relançar depois (motivo obrigatório e só
// quem tem "Baixar contas"). Sem pagamento: reverte direto, como antes.
import { useEffect, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';

interface Pag { data: string; valor: number; juros: number; multa: number; desconto: number; contaCorrente: number | null; conciliadoEm: string | null; numeroParcela: string | null }
interface Tit { codigo: number; numeroParcela: string | null; valorDocumento: number; status: string | null; vencimento: string | null }
interface Plano { nota: { numero: string | null; fornecedor: string | null; valor: number }; titulos: Tit[]; pagamentos: Pag[]; fichaPendente: { id: string } | null; erro?: string }

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const RED = '#dc2626';

export function useContasCorrentes(conta: string) {
  const [mapa, setMapa] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!conta) return;
    fetchAuth(`/api/ajustes/contas-correntes?conta=${encodeURIComponent(conta)}`).then((r) => r.json()).then((d) => {
      const m: Record<string, string> = {};
      for (const c of d.contasCorrentes || []) m[String(c.codigo)] = c.descricao;
      setMapa(m);
    }).catch(() => setMapa({}));
  }, [conta]);
  return mapa;
}

export default function ModalReabrir({ conta, idReceb, numero, podeBaixa, onClose, onFeito }: {
  conta: string; idReceb: number | string; numero: string; podeBaixa: boolean;
  onClose: () => void; onFeito: (msg: string, tipo: 'ok' | 'err') => void;
}) {
  const [plano, setPlano] = useState<Plano | null>(null);
  const [erro, setErro] = useState('');
  const [motivo, setMotivo] = useState('');
  const [enviando, setEnviando] = useState(false);
  const cc = useContasCorrentes(conta);

  useEffect(() => {
    fetchAuth(`/api/estoque/recebimentos/${idReceb}/reabrir?conta=${encodeURIComponent(conta)}`)
      .then((r) => r.json()).then((d: Plano) => { if (d.erro) setErro(d.erro); else setPlano(d); })
      .catch((e) => setErro((e as Error).message));
  }, [conta, idReceb]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !enviando) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, enviando]);

  const pags = plano?.pagamentos || [];
  const comPag = pags.length > 0;
  const total = pags.reduce((s, p) => s + p.valor, 0);
  const conciliados = pags.filter((p) => p.conciliadoEm).length;
  const bloqueado = !!plano?.fichaPendente || (comPag && !podeBaixa);
  const podeEnviar = !!plano && !bloqueado && (!comPag || motivo.trim().length >= 5) && !enviando;

  const confirmar = async () => {
    setEnviando(true);
    try {
      const r = await fetchAuth(`/api/estoque/recebimentos/${idReceb}/reabrir?conta=${encodeURIComponent(conta)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ motivo }),
      });
      const d = await r.json();
      if (d.erro || !d.ok) { setErro(d.erro || 'A Omie não reverteu a nota.'); setEnviando(false); return; }
      onFeito(comPag
        ? `NF ${numero} reaberta. ${d.pagamentosCancelados} pagamento(s) cancelado(s) e guardado(s) — depois de dar entrada de novo, relance pela faixa "Pagamentos a relançar".`
        : `NF ${numero} reaberta na Omie.`, 'ok');
    } catch (e) {
      setErro('Erro: ' + (e as Error).message);
      setEnviando(false);
    }
  };

  const th: React.CSSProperties = { textAlign: 'left', fontSize: '.66rem', color: '#64748b', textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: '.8rem', borderBottom: '1px solid #f1f5f9', whiteSpace: 'nowrap' };

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !enviando) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 110, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="est-modal" style={{ background: '#fff', borderRadius: 14, padding: 22, maxWidth: 680, width: '95%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.15)' }}>
        <h3 style={{ color: RED, fontSize: '1.05rem', fontWeight: 700, margin: '0 0 10px' }}>Reabrir a NF {numero}</h3>
        {!plano && !erro && <div style={{ color: '#64748b', fontSize: '.85rem' }}>Consultando na Omie as contas a pagar e os pagamentos desta nota…</div>}
        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', marginBottom: 10 }}>{erro}</div>}

        {plano && (
          <>
            <p style={{ fontSize: '.84rem', color: '#334155', margin: '0 0 10px', lineHeight: 1.5 }}>
              A Omie desfaz a entrada e <b>apaga a conta a pagar</b> da nota; a nota volta para &quot;pendente&quot;. Ao dar entrada de novo, a data de recebimento passa a ser a do dia e a conta a pagar volta com outro número. Uma correção de CMC feita na entrada não é desfeita.
            </p>

            {plano.fichaPendente && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', marginBottom: 10 }}>
                Esta nota já foi reaberta antes e ainda tem pagamentos a relançar. Relance esses pagamentos antes de reabrir de novo.
              </div>
            )}

            {comPag ? (
              <>
                <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', color: '#7f1d1d', marginBottom: 10, lineHeight: 1.5 }}>
                  <b>Esta nota tem {pags.length} pagamento(s) lançado(s) — {brl(total)}.</b> A Omie só reverte depois de cancelar os pagamentos. O portal vai <b>cancelar</b> esses pagamentos, reverter a nota e <b>guardar</b> cada pagamento (data, valor, juros, multa, desconto, conta corrente) para você relançar depois de dar entrada de novo. Se algo der errado no meio, o portal lança de novo o que cancelou e a nota continua recebida.
                  {conciliados > 0 && <div style={{ marginTop: 6 }}>⚠️ {conciliados} pagamento(s) estão <b>conciliados</b> com o extrato. Cancelar desfaz a conciliação; ao relançar, o portal já lança conciliado.</div>}
                </div>
                <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, marginBottom: 12 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><th style={th}>Parcela</th><th style={th}>Pago em</th><th style={{ ...th, textAlign: 'right' }}>Valor</th><th style={{ ...th, textAlign: 'right' }}>Juros/Multa</th><th style={{ ...th, textAlign: 'right' }}>Desconto</th><th style={th}>Conta corrente</th><th style={th}>Conciliado</th></tr></thead>
                    <tbody>
                      {pags.map((p, i) => (
                        <tr key={i}>
                          <td style={td}>{p.numeroParcela || '—'}</td>
                          <td style={td}>{p.data}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{brl(p.valor)}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{p.juros + p.multa ? brl(p.juros + p.multa) : '—'}</td>
                          <td style={{ ...td, textAlign: 'right' }}>{p.desconto ? brl(p.desconto) : '—'}</td>
                          <td style={td}>{p.contaCorrente ? (cc[String(p.contaCorrente)] || p.contaCorrente) : '—'}</td>
                          <td style={td}>{p.conciliadoEm || 'não'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {!podeBaixa ? (
                  <div style={{ background: '#f1f5f9', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', color: '#334155' }}>
                    Reverter nota com pagamento exige a permissão <b>Baixar contas</b> do Financeiro. Peça para alguém do financeiro reabrir.
                  </div>
                ) : (
                  <>
                    <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>Motivo da reversão (obrigatório)</label>
                    <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={2} maxLength={300}
                      placeholder="Ex.: quantidade da peça X entrou errada no estoque"
                      style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 8, padding: '8px 10px', fontSize: '.85rem' }} />
                  </>
                )}
              </>
            ) : (
              <div style={{ fontSize: '.82rem', color: '#166534', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '8px 12px', marginBottom: 6 }}>
                Nenhum pagamento lançado nas contas a pagar desta nota{plano.titulos.length ? ` (${plano.titulos.length} conta(s) a pagar, ${brl(plano.titulos.reduce((s, t) => s + t.valorDocumento, 0))})` : ''}.
              </div>
            )}
          </>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap' }}>
          <button onClick={onClose} disabled={enviando} style={{ minHeight: 40, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={confirmar} disabled={!podeEnviar}
            style={{ minHeight: 40, padding: '8px 18px', borderRadius: 8, border: 'none', background: podeEnviar ? RED : '#fca5a5', color: '#fff', fontWeight: 600, cursor: podeEnviar ? 'pointer' : 'not-allowed' }}>
            {enviando ? 'Revertendo na Omie…' : comPag ? `Cancelar ${pags.length} pagamento(s) e reabrir` : 'Reabrir na Omie'}
          </button>
        </div>
      </div>
    </div>
  );
}
