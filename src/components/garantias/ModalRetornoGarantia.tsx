'use client';
// Devolução em garantia pela Omie (16/11/2026): remessa de retorno 5.949/6.949 da nota que a
// fábrica mandou (mesmos itens, preços e impostos; chave referenciada; não mexe no estoque),
// criada e faturada pelo portal. Abre pelo Recebimentos (nota de garantia) ou pela garantia
// (seção Devolução: escolhe a nota da fábrica; ao faturar, dá baixa na pendência).
import { Fragment, useEffect, useMemo, useState } from 'react';
import { fetchAuth } from '@/lib/auth/client';
import LigarGarantia from './LigarGarantia';
import { conferirFiscal, aplicarAjuste, type AjusteFiscal, type ItemEntrada, type ProblemaFiscal } from '@/lib/garantias/retorno-remessa';

interface ItemPrevia {
  seq: number; codigo: string | null; descricao: string | null; cfopForn: string | null; cfop: string | null;
  garantia: boolean; temProduto: boolean; qtdNF: number; precoUnit: number; jaDevolvido: number;
  devolvidoNaOmie: boolean; disponivel: number; valorDisponivel: number; icmsCst: string | null; temST: boolean;
  /** item da nota da fábrica como a Omie devolveu (para conferir os ajustes fiscais na tela) */
  base?: ItemEntrada; problemas?: ProblemaFiscal[];
}
interface Historico {
  id: string; cod_int_rem: string; status: string; nf_numero: string | null; valor_total: number | null; erro: string | null; user_nome: string | null; criado_em: string;
  vinculo?: 'ligada' | 'sem_garantia' | 'pendente' | 'nao_se_aplica'; garantias?: Array<{ id: string; numero: string }>; sem_garantia_motivo?: string | null;
}
interface SugestaoG { id: string; numero: string; numeroExterno: string | null; cliente: string | null; idOrdem: string | null; devolucaoStatus: string | null; motivo: string }
interface Tentativa { quando: string; quem: string | null; acao: 'emitir' | 'faturar'; ok: boolean; erro: string | null; nf: string | null; fichaId: string | null }
interface Previa {
  nota: { idReceb: number; numero: string; emissao: string | null; chave: string | null; fornecedor: string | null; recebido: boolean;
    volumes: { qtd: number; especie: string | null; marca: string | null; pesoBruto: number; pesoLiq: number } };
  itens: ItemPrevia[]; historico: Historico[]; tentativas?: Tentativa[];
  padroes: { categoria: string; frete: string; email: string | null; deRemessa: string | null };
  texto: string; avisos?: string[]; migracaoFaltando?: boolean; erro?: string;
  sugestoesGarantia?: SugestaoG[];
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
  const [ajustes, setAjustes] = useState<Record<number, AjusteFiscal>>({});
  const [fiscalAberto, setFiscalAberto] = useState<Record<number, boolean>>({});
  const [resultado, setResultado] = useState<{ ok: boolean; nf?: string | null; erro?: string; fichaId?: string; semGarantia?: boolean } | null>(null);
  // garantias desta devolução (quando não veio pela garantia): escolhidas antes de emitir
  const [gSel, setGSel] = useState<string[]>([]);
  const [ligarAberto, setLigarAberto] = useState<string | null>(null);

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
      // abre os campos fiscais de quem tem problema que trava
      const ab: Record<number, boolean> = {};
      for (const it of d.itens) if ((it.problemas || []).some((p) => p.nivel === 'erro') && it.garantia) ab[it.seq] = true;
      setFiscalAberto(ab);
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
  const problemas = useMemo(() => {
    const out: Record<number, ProblemaFiscal[]> = {};
    for (const it of previa?.itens || []) out[it.seq] = it.base ? conferirFiscal(it.base, ajustes[it.seq]) : (it.problemas || []);
    return out;
  }, [previa, ajustes]);
  const errosFiscais = escolha.filter((e) => (problemas[e.seq] || []).some((p) => p.nivel === 'erro')).length;
  const ajustesEnvio = useMemo(() => {
    const out: Record<string, AjusteFiscal> = {};
    for (const [k, v] of Object.entries(ajustes)) if (v && Object.values(v).some((x) => x !== undefined && x !== '' && x !== null && x !== false)) out[k] = v;
    return out;
  }, [ajustes]);
  const mudar = (seq: number, campo: keyof AjusteFiscal, valor: unknown) => setAjustes((s) => ({ ...s, [seq]: { ...(s[seq] || {}), [campo]: valor } }));
  const temFaltando = !!previa?.historico.some((h) => h.status === 'criando');
  const podeEmitir = !!previa && previa.nota.recebido && !previa.migracaoFaltando && escolha.length > 0 && !enviando && !temFaltando && errosFiscais === 0;

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
    const nums = (previa.sugestoesGarantia || []).filter((g) => gSel.includes(g.id)).map((g) => g.numero);
    const linhaG = garantiaId ? '' : nums.length ? `\nLigada a ${nums.join(', ')} (fecha a pendência de devolução).` : '\nSEM garantia ligada: a devolução fica no aviso da tela Garantias até alguém ligar.';
    if (!window.confirm(`Emitir a NF-e de devolução em garantia para ${previa.nota.fornecedor || 'o fornecedor'}?\n\n${escolha.length} item(ns) · ${brl(total)}${linhaG}\n\nA remessa é criada e FATURADA na Omie agora (não mexe no estoque).`)) return;
    post({
      acao: 'emitir', conta: alvo.conta, idReceb: alvo.idReceb, escolha, texto, garantiaId: garantiaId || null, garantiaIds: garantiaId ? null : gSel, ajustes: ajustesEnvio,
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
            {(previa.avisos || []).map((a, i) => <div key={i} style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', marginBottom: 8 }}>{a}</div>)}
            {!previa.nota.recebido && <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '8px 12px', fontSize: '.8rem', marginBottom: 8 }}>Dê entrada nesta nota antes de devolver.</div>}

            <div style={{ overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
                <thead><tr><th style={th}></th><th style={th}>Item</th><th style={th}>CFOP</th><th style={{ ...th, textAlign: 'right' }}>Na nota</th><th style={{ ...th, textAlign: 'right' }}>Já voltou</th><th style={{ ...th, textAlign: 'right' }}>Devolver</th><th style={{ ...th, textAlign: 'right' }}>Valor</th></tr></thead>
                <tbody>
                  {previa.itens.map((it) => {
                    const pode = it.garantia && it.temProduto && it.disponivel > 0;
                    const q = Number(String(qtd[it.seq] || '0').replace(',', '.')) || 0;
                    return (
                      <Fragment key={it.seq}>
                      <tr style={pode ? undefined : { opacity: 0.5 }}>
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
                      {it.garantia && it.base && <LinhaFiscal it={it} base={it.base} ajuste={ajustes[it.seq]} problemas={problemas[it.seq] || []} aberto={!!fiscalAberto[it.seq]}
                        onAbrir={() => setFiscalAberto((s) => ({ ...s, [it.seq]: !s[it.seq] }))} onMudar={(c, v) => mudar(it.seq, c, v)} inp={inp} />}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!garantiaId && (
              <div style={{ marginTop: 12, border: `1px solid ${gSel.length ? '#fcd34d' : '#fecaca'}`, background: gSel.length ? '#fffbeb' : '#fef2f2', borderRadius: 8, padding: '8px 10px' }}>
                <div style={{ fontSize: '.78rem', fontWeight: 700, color: '#92400e', marginBottom: 4 }}>De qual garantia são estas peças?</div>
                <div style={{ fontSize: '.72rem', color: '#475569', marginBottom: 6 }}>
                  Ligar fecha a pendência &quot;Devolução de peças&quot; da garantia quando a NF-e for autorizada. Sem garantia ligada, a devolução fica no aviso da tela Garantias até alguém resolver.
                </div>
                {(previa.sugestoesGarantia || []).length === 0 && <div style={{ fontSize: '.76rem', color: '#64748b' }}>Nenhuma garantia do portal tem estas peças. Dá para procurar e ligar depois de emitir.</div>}
                {(previa.sugestoesGarantia || []).map((g) => (
                  <label key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, fontSize: '.8rem', cursor: 'pointer' }}>
                    <input type="checkbox" checked={gSel.includes(g.id)} onChange={(e) => setGSel((l) => e.target.checked ? [...l, g.id] : l.filter((x) => x !== g.id))} style={{ width: 20, height: 20 }} />
                    <span><b>{g.numero}</b>{g.numeroExterno ? ` · SG ${g.numeroExterno}` : ''}{g.cliente ? ` · ${g.cliente}` : ''}<span style={{ display: 'block', fontSize: '.7rem', color: '#64748b' }}>{g.motivo}</span></span>
                  </label>
                ))}
              </div>
            )}

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
                    {h.vinculo === 'ligada' && <span style={{ fontSize: '.72rem', color: '#047857', fontWeight: 600 }}>garantia {(h.garantias || []).map((x) => x.numero).join(', ')}</span>}
                    {h.vinculo === 'sem_garantia' && <span style={{ fontSize: '.72rem', color: '#64748b' }} title={h.sem_garantia_motivo || ''}>sem garantia no portal</span>}
                    {h.vinculo === 'pendente' && <span style={{ fontSize: '.72rem', color: '#b91c1c', fontWeight: 700 }}>⚠ sem garantia ligada</span>}
                    {h.vinculo && h.vinculo !== 'nao_se_aplica' && (
                      <button type="button" onClick={() => setLigarAberto((x) => x === h.id ? null : h.id)} style={{ minHeight: 36, padding: '2px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '.72rem', color: '#334155' }}>
                        {ligarAberto === h.id ? 'Fechar' : h.vinculo === 'pendente' ? 'Ligar a uma garantia' : 'Mudar garantia'}
                      </button>
                    )}
                    {ligarAberto === h.id && (
                      <div style={{ width: '100%', border: '1px solid #fde68a', background: '#fffbeb', borderRadius: 8, padding: 10 }}>
                        <LigarGarantia fichaId={h.id} onMudou={(m) => { onFeito?.(m); carregar(); }} />
                      </div>
                    )}
                    {h.status === 'criada' && (() => {
                      const rejeitada = !!h.nf_numero && /rejeit/i.test(h.erro || '');
                      const rotulo = rejeitada ? 'Corrigir e reenviar' : h.nf_numero ? 'Conferir de novo' : 'Faturar de novo';
                      const dica = rejeitada ? 'Grava na remessa os campos fiscais da tabela acima e a Omie retransmite a NF-e' : h.nf_numero ? 'Lê na Omie se a NF-e foi autorizada' : 'Acerta os itens e fatura a remessa';
                      return <button type="button" disabled={enviando} onClick={() => post({ acao: 'faturar', fichaId: h.id, ajustes: ajustesEnvio })} title={dica} style={{ ...btn('#b45309', !enviando), minHeight: 40, padding: '4px 12px' }}>{enviando ? 'Aguardando a Omie…' : rotulo}</button>;
                    })()}
                    {(() => {
                      const ts = (previa.tentativas || []).filter((t) => t.fichaId === h.id);
                      if (!ts.length) return null;
                      return (
                        <details style={{ width: '100%', fontSize: '.72rem', color: '#475569' }}>
                          <summary style={{ cursor: 'pointer', minHeight: 28 }}>{ts.length} tentativa(s)</summary>
                          {ts.map((t, k) => (
                            <div key={k} style={{ display: 'flex', gap: 8, flexWrap: 'wrap', padding: '3px 0 3px 12px', borderTop: '1px dashed #e2e8f0' }}>
                              <span>{new Date(t.quando).toLocaleString('pt-BR')}</span>
                              <span>{t.acao === 'emitir' ? 'emitir' : 'faturar/conferir'}</span>
                              <span style={{ color: t.ok ? '#047857' : '#b91c1c' }}>{t.ok ? `ok${t.nf ? ` · NF ${t.nf}` : ''}` : (t.erro || 'falhou')}</span>
                              <span style={{ color: '#64748b' }}>{t.quem}</span>
                            </div>
                          ))}
                        </details>
                      );
                    })()}
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {resultado && (
          <div style={{ marginTop: 12, borderRadius: 8, padding: '10px 12px', fontSize: '.84rem', background: resultado.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${resultado.ok ? '#bbf7d0' : '#fecaca'}`, color: resultado.ok ? '#166534' : '#b91c1c' }}>
            {resultado.ok ? `NF-e de devolução emitida${resultado.nf ? `: nº ${resultado.nf}` : ' (o número aparece em instantes)'}.${resultado.semGarantia && !garantiaId ? ' Ela está sem garantia ligada: use "Ligar a uma garantia" na lista acima.' : ''}` : resultado.erro}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {previa && <span style={{ fontSize: '.82rem', color: '#334155', marginRight: 'auto' }}>{escolha.length} item(ns) · <b>{brl(total)}</b></span>}
          {alvo && garantiaId && !contaIni && <button type="button" disabled={enviando} onClick={() => { setAlvo(null); setPrevia(null); setResultado(null); }} style={{ ...btn('#64748b', !enviando) }}>Outra nota</button>}
          <button type="button" onClick={onClose} disabled={enviando} style={{ minHeight: 40, padding: '8px 18px', borderRadius: 8, border: 'none', background: '#f1f5f9', color: '#475569', fontWeight: 600, cursor: 'pointer' }}>Fechar</button>
            {previa && errosFiscais > 0 && <span style={{ fontSize: '.76rem', color: '#b91c1c', width: '100%', textAlign: 'right' }}>{errosFiscais} item(ns) com problema fiscal: corrija nos campos fiscais antes de emitir.</span>}
          {previa && <button type="button" onClick={emitir} disabled={!podeEmitir} style={btn('#b45309', podeEmitir)}>{enviando ? 'Emitindo na Omie…' : 'Emitir NF-e de devolução'}</button>}
        </div>
      </div>
    </div>
  );
}

const CST_ICMS = ['00', '10', '20', '30', '40', '41', '50', '51', '53', '60', '70', '90'];
const CST_IPI = ['00', '49', '50', '99', '01', '02', '03', '04', '05', '51', '52', '53', '54', '55'];

/** campos fiscais de um item (o que vai para a Omie) + conferência; vazio = o da nota da fábrica */
function LinhaFiscal({ it, base, ajuste, problemas, aberto, onAbrir, onMudar, inp }: {
  it: ItemPrevia; base: ItemEntrada; ajuste?: AjusteFiscal; problemas: ProblemaFiscal[]; aberto: boolean;
  onAbrir: () => void; onMudar: (c: keyof AjusteFiscal, v: unknown) => void; inp: React.CSSProperties;
}) {
  const f = aplicarAjuste(base, ajuste);
  const erros = problemas.filter((p) => p.nivel === 'erro');
  const avisos = problemas.filter((p) => p.nivel === 'aviso');
  const cor = erros.length ? '#b91c1c' : avisos.length ? '#b45309' : '#047857';
  const lab: React.CSSProperties = { fontSize: '.68rem', color: '#475569', display: 'flex', flexDirection: 'column', gap: 2 };
  const pc = (n: unknown) => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  return (
    <tr>
      <td />
      <td colSpan={6} style={{ padding: '0 8px 8px', borderBottom: '1px solid #e2e8f0' }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', fontSize: '.7rem', color: '#475569' }}>
          <span style={{ color: cor, fontWeight: 600 }}>{erros.length ? '✕ fiscal com problema' : avisos.length ? '! fiscal com aviso' : '✓ fiscal ok'}</span>
          <span>ICMS {f.icms?.cSitTrib || '—'} · origem {f.icms?.cOrigem || '0'}{f.cBenef ? ` · benefício ${f.cBenef}` : ''}</span>
          <span>IPI {f.ipi?.cSitTribIPI || '55'}{Number(f.ipi?.nAliqIPI) ? ` · ${pc(f.ipi?.nAliqIPI)}%` : ''}</span>
          <button type="button" onClick={onAbrir} style={{ minHeight: 32, padding: '2px 10px', borderRadius: 6, border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer', fontSize: '.7rem', color: '#334155' }}>
            {aberto ? 'Fechar campos fiscais' : 'Editar campos fiscais'}
          </button>
        </div>
        {problemas.map((p, i) => (
          <div key={i} style={{ fontSize: '.7rem', color: p.nivel === 'erro' ? '#b91c1c' : '#92400e', marginTop: 3 }}>{p.nivel === 'erro' ? '✕' : '!'} {p.msg}</div>
        ))}
        {aberto && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 8 }}>
            <label style={lab}>CST do ICMS
              <select value={f.icms?.cSitTrib || ''} onChange={(e) => onMudar('icmsCst', e.target.value)} style={{ ...inp, width: '100%' }}>
                {!CST_ICMS.includes(f.icms?.cSitTrib || '') && <option value={f.icms?.cSitTrib || ''}>{f.icms?.cSitTrib || '—'}</option>}
                {CST_ICMS.map((c) => <option key={c} value={c}>{c}{c === base.icms?.cSitTrib ? ' (da nota)' : ''}</option>)}
              </select>
            </label>
            <label style={lab}>Origem
              <select value={f.icms?.cOrigem || '0'} onChange={(e) => onMudar('icmsOrigem', e.target.value)} style={{ ...inp, width: '100%' }}>
                {['0', '1', '2', '3', '4', '5', '6', '7', '8'].map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label style={lab}>Cód. benefício (cBenef)
              <input value={ajuste?.cBenef ?? f.cBenef ?? ''} disabled={!!ajuste?.semBenef} placeholder="ex.: SP058811" onChange={(e) => onMudar('cBenef', e.target.value.toUpperCase())} style={{ ...inp, width: '100%' }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, minHeight: 28 }}>
                <input type="checkbox" checked={!!ajuste?.semBenef} onChange={(e) => onMudar('semBenef', e.target.checked)} style={{ width: 18, height: 18 }} /> não tem benefício
              </span>
            </label>
            <label style={lab}>CST do IPI
              <select value={f.ipi?.cSitTribIPI || '55'} onChange={(e) => onMudar('ipiCst', e.target.value)} style={{ ...inp, width: '100%' }}>
                {!CST_IPI.includes(f.ipi?.cSitTribIPI || '55') && <option value={f.ipi?.cSitTribIPI}>{f.ipi?.cSitTribIPI}</option>}
                {CST_IPI.map((c) => <option key={c} value={c}>{c}{c === (base.ipi?.cSitTribIPI || '55') ? ' (da nota)' : ''}</option>)}
              </select>
            </label>
            <label style={lab}>Cálculo do IPI
              <select value={f.ipi?.cTpCalcIPI || 'B'} onChange={(e) => onMudar('ipiTpCalc', e.target.value)} style={{ ...inp, width: '100%' }}>
                <option value="B">B · alíquota</option><option value="Q">Q · quantidade</option>
              </select>
            </label>
            <label style={lab}>Alíquota do IPI (%)
              <input type="number" step="any" min={0} value={ajuste?.ipiAliq ?? f.ipi?.nAliqIPI ?? 0} onChange={(e) => onMudar('ipiAliq', e.target.value === '' ? null : Number(e.target.value))} style={{ ...inp, width: '100%' }} />
            </label>
            <div style={{ gridColumn: '1 / -1', fontSize: '.66rem', color: '#64748b' }}>
              Veio da nota da fábrica: ICMS {base.icms?.cSitTrib || '—'}{base.cBenef ? ` · benefício ${base.cBenef}` : ' · sem benefício no XML'} · IPI {base.ipi?.cSitTribIPI || '—'}{Number(base.ipi?.nAliqIPI) ? ` ${pc(base.ipi?.nAliqIPI)}%` : ''}. Mude só se a nota da fábrica estiver errada{it.codigo ? ` para ${it.codigo}` : ''}.
            </div>
          </div>
        )}
      </td>
    </tr>
  );
}
