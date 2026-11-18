'use client';
// Devolução em garantia pela Omie (16/11/2026): remessa de retorno 5.949/6.949 da nota que a
// fábrica mandou (mesmos itens, preços e impostos; chave referenciada; não mexe no estoque),
// criada e faturada pelo portal. Abre pelo Recebimentos (nota de garantia) ou pela garantia
// (seção Devolução: escolhe a nota da fábrica; ao faturar, dá baixa na pendência).
import { useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';

interface ItemPrevia {
  seq: number; codigo: string | null; descricao: string | null; cfopForn: string | null; cfop: string | null;
  garantia: boolean; temProduto: boolean; qtdNF: number; precoUnit: number; jaDevolvido: number;
  devolvidoNaOmie: boolean; disponivel: number; valorDisponivel: number; icmsCst: string | null; temST: boolean;
}
interface Historico { id: string; cod_int_rem: string; status: string; nf_numero: string | null; valor_total: number | null; erro: string | null; user_nome: string | null; criado_em: string }
interface Previa {
  nota: { idReceb: number; numero: string; emissao: string | null; chave: string | null; fornecedor: string | null; recebido: boolean;
    volumes: { qtd: number; especie: string | null; marca: string | null; pesoBruto: number; pesoLiq: number } };
  itens: ItemPrevia[]; historico: Historico[];
  padroes: { categoria: string; frete: string; email: string | null; deRemessa: string | null };
  texto: string; migracaoFaltando?: boolean; erro?: string;
}
interface NotaGarantia { conta: string; idReceb: number; numero: string; data: string; fornecedor: string; valor: number; sugerida: boolean }

const brl = (n: number) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const FRETES: Array<[string, string]> = [['9', 'Sem frete'], ['0', 'Por conta do remetente (CIF)'], ['1', 'Por conta do destinatário (FOB)'], ['3', 'Transporte próprio do remetente']];
const STATUS: Record<string, string> = { criando: 'criando', criada: 'criada (falta faturar)', faturada: 'faturada', falhou: 'falhou', cancelada: 'cancelada' };

export default function ModalRetornoGarantia({ conta: contaIni, idReceb: idIni, garantiaId, onClose, onFeito }: {
  conta?: string | null; idReceb?: number | string | null; garantiaId?: string | null;
  onClose: () => void; onFeito?: (msg: string) => void;
}) {
  const [alvo, setAlvo] = useState<{ conta: string; idReceb: number } | null>(contaIni && idIni ? { conta: String(contaIni).toUpperCase(), idReceb: Number(idIni) } : null);
  const [notasG, setNotasG] = useState<NotaGarantia[] | null>(null);
  const [previa, setPrevia] = useState<Previa | null>(null);
  const [erro, setErro] = useState('');
  const [qtd, setQtd] = useState<Record<number, string>>({});
  const [marcado, setMarcado] = useState<Record<number, boolean>>({});
  const [texto, setTexto] = useState('');
  const [frete, setFrete] = useState({ tipo: '9', qtdVol: '', especie: '', marca: '', pesoBruto: '', pesoLiq: '' });
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; nf?: string | null; erro?: string; fichaId?: string } | null>(null);

  // pela garantia: lista as notas da fábrica para escolher
  useEffect(() => {
    if (alvo || !garantiaId) return;
    fetchAuth(`/api/garantias/retorno-remessa?garantia=${encodeURIComponent(garantiaId)}`).then((r) => r.json())
      .then((d) => { if (d.erro) setErro(d.erro); setNotasG(d.notas || []); })
      .catch((e) => setErro((e as Error).message));
  }, [alvo, garantiaId]);

  const carregar = () => {
    if (!alvo) return;
    setPrevia(null); setErro('');
    fetchAuth(`/api/garantias/retorno-remessa?conta=${alvo.conta}&idReceb=${alvo.idReceb}`).then((r) => r.json()).then((d: Previa) => {
      if (d.erro) { setErro(d.erro); return; }
      setPrevia(d);
      setTexto(d.texto);
      const q: Record<number, string> = {}; const m: Record<number, boolean> = {};
      for (const it of d.itens) { q[it.seq] = String(it.disponivel || 0); m[it.seq] = it.garantia && it.temProduto && it.disponivel > 0; }
      setQtd(q); setMarcado(m);
      const v = d.nota.volumes;
      setFrete({ tipo: d.padroes.frete || '9', qtdVol: v.qtd ? String(v.qtd) : '', especie: v.especie || '', marca: v.marca || '', pesoBruto: v.pesoBruto ? String(v.pesoBruto) : '', pesoLiq: v.pesoLiq ? String(v.pesoLiq) : '' });
    }).catch((e) => setErro((e as Error).message));
  };
  useEffect(carregar, [alvo]);

  const escolha = useMemo(() => (previa?.itens || [])
    .filter((it) => marcado[it.seq])
    .map((it) => ({ seq: it.seq, qtd: Number(String(qtd[it.seq] || '0').replace(',', '.')) || 0 }))
    .filter((e) => e.qtd > 0), [previa, marcado, qtd]);
  const total = useMemo(() => escolha.reduce((s, e) => {
    const it = previa?.itens.find((i) => i.seq === e.seq);
    return it && it.disponivel > 0 ? s + it.valorDisponivel * (e.qtd / it.disponivel) : s;
  }, 0), [escolha, previa]);
  const temFaltando = !!previa?.historico.some((h) => h.status === 'criando');
  const podeEmitir = !!previa && previa.nota.recebido && !previa.migracaoFaltando && escolha.length > 0 && !enviando && !temFaltando;

  const post = async (body: Record<string, unknown>) => {
    setEnviando(true); setErro('');
    try {
      const r = await fetchAuth('/api/garantias/retorno-remessa', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json();
      setResultado(d);
      if (d.ok) onFeito?.(`Devolução em garantia emitida${d.nf ? ` — NF ${d.nf}` : ''}.`);
      carregar();
    } catch (e) { setErro((e as Error).message); }
    finally { setEnviando(false); }
  };
  const emitir = () => {
    if (!previa || !alvo) return;
    if (!window.confirm(`Emitir a NF-e de devolução em garantia para ${previa.nota.fornecedor || 'o fornecedor'}?\n\n${escolha.length} item(ns) · ${brl(total)}\n\nA remessa é criada e FATURADA na Omie agora (não mexe no estoque).`)) return;
    post({
      acao: 'emitir', conta: alvo.conta, idReceb: alvo.idReceb, escolha, texto, garantiaId: garantiaId || null,
      frete: { tipo: frete.tipo, qtdVol: Number(frete.qtdVol) || 0, especie: frete.especie || null, marca: frete.marca || null, pesoBruto: Number(String(frete.pesoBruto).replace(',', '.')) || 0, pesoLiq: Number(String(frete.pesoLiq).replace(',', '.')) || 0 },
    });
  };

  const th: React.CSSProperties = { textAlign: 'left', fontSize: '.66rem', color: '#64748b', textTransform: 'uppercase', padding: '6px 8px', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '6px 8px', fontSize: '.8rem', borderBottom: '1px solid #f1f5f9', verticalAlign: 'top' };
  const inp: React.CSSProperties = { minHeight: 36, border: '1px solid #cbd5e1', borderRadius: 6, padding: '4px 8px', fontSize: '.82rem', boxSizing: 'border-box' };
  const btn = (bg: string, on = true): React.CSSProperties => ({ minHeight: 40, padding: '8px 16px', borderRadius: 8, border: 'none', background: on ? bg : '#cbd5e1', color: '#fff', fontWeight: 600, cursor: on ? 'pointer' : 'not-allowed' });

  return (
    <div onClick={(e) => { if (e.target === e.currentTarget && !enviando) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 120, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
      <div className="est-modal" style={{ background: '#fff', borderRadius: 14, padding: 20, maxWidth: 900, width: '95%', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 8px 30px rgba(0,0,0,.15)' }}>
        <h3 style={{ color: '#b45309', fontSize: '1.05rem', fontWeight: 700, margin: '0 0 4px' }}>Devolução em garantia{previa ? ` · NF ${previa.nota.numero}` : ''}</h3>
        <div style={{ fontSize: '.76rem', color: '#64748b', marginBottom: 12 }}>
          Remessa de retorno pela Omie: mesmos itens, preços e impostos da nota da fábrica, CFOP 5.949/6.949, chave referenciada e <b>sem mexer no estoque</b>. O portal cria e emite a NF-e.
        </div>
        {erro && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', borderRadius: 8, padding: '10px 12px', fontSize: '.82rem', marginBottom: 10 }}>{erro}</div>}

        {!alvo && garantiaId && (
          <>
            <div style={{ fontSize: '.84rem', fontWeight: 600, color: '#334155', marginBottom: 8 }}>Qual nota da fábrica você está devolvendo?</div>
            {!notasG && !erro && <div style={{ color: '#64748b', fontSize: '.84rem' }}>Procurando as notas de garantia (x.949) da montadora…</div>}
            {notasG && notasG.length === 0 && <div style={{ color: '#64748b', fontSize: '.84rem' }}>Nenhuma nota de garantia da montadora encontrada no Recebimento. Dê entrada na nota da fábrica e tente de novo, ou registre a devolução à mão.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(notasG || []).map((n) => (
                <button key={`${n.conta}-${n.idReceb}`} type="button" onClick={() => setAlvo({ conta: n.conta, idReceb: n.idReceb })}
                  style={{ textAlign: 'left', minHeight: 44, padding: '8px 12px', borderRadius: 8, border: `1px solid ${n.sugerida ? '#fcd34d' : '#e2e8f0'}`, background: n.sugerida ? '#fffbeb' : '#fff', cursor: 'pointer', fontSize: '.82rem' }}>
                  <b>NF {n.numero}</b> · {n.data.split('-').reverse().join('/')} · {n.fornecedor} · {brl(n.valor)} · {n.conta}
                  {n.sugerida && <span style={{ marginLeft: 6, fontSize: '.68rem', color: '#92400e' }}>peças desta garantia</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {alvo && !previa && !erro && <div style={{ color: '#64748b', fontSize: '.85rem' }}>Lendo a nota na Omie…</div>}

        {previa && (
          <>
            <div style={{ fontSize: '.8rem', color: '#334155', marginBottom: 10, lineHeight: 1.5 }}>
              <b>{previa.nota.fornecedor}</b> · NF {previa.nota.numero}{previa.nota.emissao ? ` de ${previa.nota.emissao}` : ''}
              {previa.nota.chave && <div style={{ fontSize: '.7rem', color: '#64748b', wordBreak: 'break-all' }}>chave {previa.nota.chave}</div>}
            </div>
            {previa.migracaoFaltando && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', marginBottom: 8 }}>Falta aplicar <code>sql/garantia-retorno-remessa.sql</code> no banco.</div>}
            {!previa.nota.recebido && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', marginBottom: 8 }}>Dê entrada nesta nota antes de devolver.</div>}

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
                <thead><tr><th style={th}></th><th style={th}>Item</th><th style={th}>CFOP</th><th style={{ ...th, textAlign: 'right' }}>Na nota</th><th style={{ ...th, textAlign: 'right' }}>Já voltou</th><th style={{ ...th, textAlign: 'right' }}>Devolver</th><th style={{ ...th, textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {previa.itens.map((it) => {
                    const pode = it.garantia && it.temProduto && it.disponivel > 0;
                    const q = Number(String(qtd[it.seq] || '0').replace(',', '.')) || 0;
                    return (
                      <tr key={it.seq} style={pode ? undefined : { opacity: 0.5 }}>
                        <td style={td}><input type="checkbox" disabled={!pode} checked={!!marcado[it.seq]} style={{ width: 20, height: 20 }} onChange={(e) => setMarcado((s) => ({ ...s, [it.seq]: e.target.checked }))} /></td>
                        <td style={td}>
                          <b>{it.codigo || '?'}</b> {it.descricao ? `· ${it.descricao}` : ''}
                          <div style={{ fontSize: '.68rem', color: '#64748b' }}>
                            {brl(it.precoUnit)}/un · ICMS {it.icmsCst || '—'}{it.temST ? ' com ST' : ''}
                            {!it.garantia && ' · não veio em garantia'}{!it.temProduto && ' · sem produto na Omie'}{it.devolvidoNaOmie && ' · já devolvido pela Omie'}
                          </div>
                        </td>
                        <td style={{ ...td, whiteSpace: 'nowrap', fontSize: '.74rem' }}>{it.cfopForn || '—'}{it.cfop ? ` → ${it.cfop}` : ''}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{it.qtdNF}</td>
                        <td style={{ ...td, textAlign: 'right' }}>{it.jaDevolvido || '—'}</td>
                        <td style={{ ...td, textAlign: 'right' }}>
                          {pode ? <input type="number" min={0} max={it.disponivel} step="any" value={qtd[it.seq] ?? ''} onChange={(e) => setQtd((s) => ({ ...s, [it.seq]: e.target.value }))} style={{ ...inp, width: 80, textAlign: 'right' }} /> : '—'}
                        </td>
                        <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{pode && marcado[it.seq] && it.disponivel > 0 ? brl(it.valorDisponivel * (Math.min(q, it.disponivel) / it.disponivel)) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <label style={{ display: 'block', fontSize: '.72rem', fontWeight: 600, color: '#475569', margin: '12px 0 4px' }}>Dados adicionais da NF-e</label>
            <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} style={{ ...inp, width: '100%', resize: 'vertical' }} />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, marginTop: 10 }}>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Frete
                <select value={frete.tipo} onChange={(e) => setFrete((f) => ({ ...f, tipo: e.target.value }))} style={{ ...inp, width: '100%', display: 'block' }}>
                  {FRETES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Volumes<input value={frete.qtdVol} onChange={(e) => setFrete((f) => ({ ...f, qtdVol: e.target.value }))} style={{ ...inp, width: '100%', display: 'block' }} /></label>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Espécie<input value={frete.especie} onChange={(e) => setFrete((f) => ({ ...f, especie: e.target.value }))} style={{ ...inp, width: '100%', display: 'block' }} /></label>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Peso bruto (kg)<input value={frete.pesoBruto} onChange={(e) => setFrete((f) => ({ ...f, pesoBruto: e.target.value }))} style={{ ...inp, width: '100%', display: 'block' }} /></label>
              <label style={{ fontSize: '.72rem', color: '#475569' }}>Peso líquido (kg)<input value={frete.pesoLiq} onChange={(e) => setFrete((f) => ({ ...f, pesoLiq: e.target.value }))} style={{ ...inp, width: '100%', display: 'block' }} /></label>
            </div>
            <div style={{ fontSize: '.7rem', color: '#64748b', marginTop: 6 }}>
              Categoria {previa.padroes.categoria}{previa.padroes.email ? ` · e-mail ${previa.padroes.email}` : ''}{previa.padroes.deRemessa ? ` · copiados da remessa ${previa.padroes.deRemessa} para este fornecedor` : ''}.
            </div>

            {previa.historico.length > 0 && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: '.72rem', fontWeight: 600, color: '#475569', marginBottom: 4 }}>Devoluções desta nota pelo portal</div>
                {previa.historico.map((h) => (
                  <div key={h.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '.78rem', padding: '6px 0', borderTop: '1px solid #f1f5f9' }}>
                    <span>{new Date(h.criado_em).toLocaleString('pt-BR')}</span>
                    <span>{h.nf_numero ? <b>NF {h.nf_numero}</b> : h.cod_int_rem}</span>
                    <span style={{ color: h.status === 'faturada' ? '#047857' : h.status === 'falhou' ? '#b91c1c' : '#b45309' }}>{STATUS[h.status] || h.status}</span>
                    {h.valor_total != null && <span>{brl(h.valor_total)}</span>}
                    <span style={{ color: '#64748b' }}>{h.user_nome}</span>
                    {h.erro && <span style={{ color: '#b91c1c', fontSize: '.72rem' }}>{h.erro}</span>}
                    {h.status === 'criada' && <button type="button" disabled={enviando} onClick={() => post({ acao: 'faturar', fichaId: h.id })} style={{ ...btn('#b45309', !enviando), minHeight: 36, padding: '4px 12px' }}>Faturar de novo</button>}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {resultado && (
          <div style={{ marginTop: 12, borderRadius: 8, padding: '10px 12px', fontSize: '.84rem', background: resultado.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${resultado.ok ? '#bbf7d0' : '#fecaca'}`, color: resultado.ok ? '#166534' : '#b91c1c' }}>
            {resultado.ok ? `NF-e de devolução emitida${resultado.nf ? `: nº ${resultado.nf}` : ' (o número aparece em instantes)'}.` : resultado.erro}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {previa && <span style={{ fontSize: '.82rem', color: '#334155', marginRight: 'auto' }}>{escolha.length} item(ns) · <b>{brl(total)}</b></span>}
          {alvo && garantiaId && !contaIni && <button type="button" disabled={enviando} onClick={() => { setAlvo(null); setPrevia(null); setResultado(null); }} style={{ ...btn('#64748b', !enviando) }}>Outra nota</button>}
          <button type="button" onClick={onClose} disabled={enviando} style={{ minHeight: 40, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
          {previa && <button type="button" onClick={emitir} disabled={!podeEmitir} style={btn('#b45309', podeEmitir)}>{enviando ? 'Emitindo na Omie…' : 'Emitir NF-e de devolução'}</button>}
        </div>
      </div>
    </div>
  );
}
