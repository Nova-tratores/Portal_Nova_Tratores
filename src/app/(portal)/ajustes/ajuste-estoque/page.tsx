'use client';
// Ajuste de estoque: quantidade e/ou custo de vários produtos de uma vez (NOVA e
// CASTRO no mesmo lote), inclusive produto zerado. Conferir (prévia ao vivo do
// Omie) → Confirmar (grava tudo ou nada). Servidor: lib/ajustes/ajuste-estoque.ts.
import { useState, useCallback, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { usePermissoes } from '@/hooks/usePermissoes';
import SemPermissao from '@/components/SemPermissao';
import { fetchAuth } from '@/lib/auth/client';
import { numeroBR } from '@/lib/ajustes/ajuste-estoque-regras';

type Conta = 'NOVA' | 'CASTRO';
interface Produto { conta: Conta; codigoProduto: number; codigo: string | null; descricao: string | null; estoque: number; cmc: number; inativo: boolean }
interface Local { id: number; nome: string; padrao: boolean; fisico: number; cmc: number }
interface Linha {
  uid: number;
  conta: Conta;
  produto: Produto | null;
  locais: Local[] | null;
  codLocal: number | null;
  carregandoLocais: boolean;
  erroLocais: string | null;
  novaQtd: string;
  novoCusto: string;
}
interface ItemPrevia { conta: Conta; codigoProduto: number; codLocal: number; localNome: string; qtdAtual: number; cmcAtual: number; qtdFinal: number; cmcFinal: number; tipo: string; resumo: string }
interface Resposta { ok: boolean; gravado?: boolean; previa?: ItemPrevia[]; problemas?: { indice: number; erro: string }[]; erro?: string; ajustes?: { obs: string; codigoAjuste: number }[] }

let seq = 1;
const novaLinha = (conta: Conta): Linha => ({ uid: seq++, conta, produto: null, locais: null, codLocal: null, carregandoLocais: false, erroLocais: null, novaQtd: '', novoCusto: '' });

const fmtQ = (n: number) => Number(n || 0).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const fmtR = (n: number) => 'R$ ' + Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
const COR_CONTA: Record<Conta, string> = { NOVA: '#1d4ed8', CASTRO: '#b45309' };

const inp: React.CSSProperties = { border: '1px solid #cbd5e1', borderRadius: 6, padding: '7px 9px', fontSize: '.85rem', width: '100%', background: 'var(--surface, #fff)', color: 'inherit' };
const rot: React.CSSProperties = { display: 'block', fontSize: '.7rem', fontWeight: 600, color: '#475569', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '.3px' };
const btn = (cor: string, cheio = true): React.CSSProperties => ({ padding: '8px 14px', borderRadius: 6, fontSize: '.84rem', fontWeight: 600, cursor: 'pointer', border: `1px solid ${cor}`, background: cheio ? cor : 'transparent', color: cheio ? '#fff' : cor });

function BuscaProduto({ conta, onEscolher }: { conta: Conta; onEscolher: (p: Produto) => void }) {
  const [q, setQ] = useState('');
  const [res, setRes] = useState<Produto[]>([]);
  const [aberto, setAberto] = useState(false);
  const [buscando, setBuscando] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) { setRes([]); return; }
    timer.current = setTimeout(async () => {
      setBuscando(true);
      try {
        const r = await fetchAuth(`/api/ajustes/ajuste-estoque/produtos?conta=${conta}&q=${encodeURIComponent(q.trim())}`);
        const d = await r.json();
        setRes(d.produtos || []);
        setAberto(true);
      } catch { setRes([]); } finally { setBuscando(false); }
    }, 300);
  }, [q, conta]);

  return (
    <div style={{ position: 'relative' }}>
      <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} onFocus={() => res.length && setAberto(true)}
        placeholder="Código ou descrição (ex.: RP-1234, filtro de óleo)" style={inp} />
      {buscando && <span style={{ position: 'absolute', right: 10, top: 9, fontSize: '.72rem', color: '#94a3b8' }}>buscando…</span>}
      {aberto && q.trim().length >= 2 && (
        <div style={{ position: 'absolute', zIndex: 20, left: 0, right: 0, top: '100%', marginTop: 4, background: 'var(--surface, #fff)', border: '1px solid #cbd5e1', borderRadius: 8, maxHeight: 300, overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,.12)' }}>
          {res.length === 0 && !buscando && <div style={{ padding: 12, fontSize: '.8rem', color: '#94a3b8' }}>Nenhum produto encontrado em {conta}.</div>}
          {res.map((p) => (
            <button key={p.codigoProduto} type="button" onClick={() => { onEscolher(p); setAberto(false); }}
              style={{ display: 'flex', width: '100%', gap: 10, alignItems: 'baseline', padding: '8px 12px', border: 'none', borderBottom: '1px solid #f1f5f9', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'inherit' }}>
              <b style={{ fontSize: '.82rem', whiteSpace: 'nowrap' }}>{p.codigo || '#' + p.codigoProduto}</b>
              <span style={{ fontSize: '.8rem', flex: 1 }}>{p.descricao}{p.inativo && <em style={{ color: '#dc2626' }}> (inativo)</em>}</span>
              <span style={{ fontSize: '.74rem', color: p.estoque === 0 ? '#d97706' : '#64748b', whiteSpace: 'nowrap' }}>est. {fmtQ(p.estoque)} · {fmtR(p.cmc)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AjusteEstoquePage() {
  const { userProfile } = useAuth();
  const { pode, loading: permLoading } = usePermissoes(userProfile?.id);

  const [linhas, setLinhas] = useState<Linha[]>(() => [novaLinha('NOVA'), novaLinha('CASTRO')]);
  const [motivo, setMotivo] = useState('');
  const [transf, setTransf] = useState('');
  const [previa, setPrevia] = useState<Resposta | null>(null);
  const [enviando, setEnviando] = useState<'previa' | 'gravar' | null>(null);
  const [resultado, setResultado] = useState<Resposta | null>(null);

  const alterar = useCallback((uid: number, patch: Partial<Linha>) => {
    setLinhas((ls) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l)));
    setPrevia(null);
    setResultado(null);
  }, []);

  const carregarLocais = useCallback(async (uid: number, p: Produto) => {
    alterar(uid, { produto: p, locais: null, codLocal: null, carregandoLocais: true, erroLocais: null, novaQtd: '', novoCusto: '' });
    try {
      const r = await fetchAuth(`/api/ajustes/ajuste-estoque/posicao?conta=${p.conta}&id=${p.codigoProduto}`);
      const d = await r.json();
      if (!r.ok || !d.ok) throw new Error(d.erro || 'falha ao ler o estoque no Omie');
      alterar(uid, { locais: d.locais, codLocal: d.sugerido, carregandoLocais: false });
    } catch (e) {
      alterar(uid, { carregandoLocais: false, erroLocais: (e as Error).message });
    }
  }, [alterar]);

  const localDe = (l: Linha) => l.locais?.find((x) => x.id === l.codLocal) || null;
  const prontas = linhas.filter((l) => l.produto && localDe(l) && (l.novaQtd.trim() || l.novoCusto.trim()));

  // "Passar N unidades de cima para baixo": tira da 1ª, põe na 2ª (com o custo da 1ª
  // quando a 2ª não tem custo) — corrige quantidade lançada na empresa errada.
  const aplicarTransferencia = () => {
    const n = numeroBR(transf);
    const [a, b] = linhas;
    const la = a && localDe(a), lb = b && localDe(b);
    if (!n || n <= 0 || !la || !lb) return;
    setLinhas((ls) => ls.map((l, i) => {
      if (i === 0) return { ...l, novaQtd: String(Math.max(0, la.fisico - n)) };
      if (i === 1) return { ...l, novaQtd: String(lb.fisico + n), novoCusto: lb.cmc > 0 ? l.novoCusto : (la.cmc > 0 ? String(la.cmc).replace('.', ',') : l.novoCusto) };
      return l;
    }));
    setPrevia(null);
  };

  const enviar = async (gravar: boolean) => {
    setEnviando(gravar ? 'gravar' : 'previa');
    try {
      const r = await fetchAuth('/api/ajustes/ajuste-estoque', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gravar, motivo,
          itens: prontas.map((l) => ({
            conta: l.conta, codigoProduto: l.produto!.codigoProduto, codLocal: l.codLocal,
            codigo: l.produto!.codigo, descricao: l.produto!.descricao,
            novaQtd: l.novaQtd.trim() || null, novoCusto: l.novoCusto.trim() || null,
          })),
        }),
      });
      const d: Resposta = await r.json();
      if (gravar) {
        setResultado(d);
        if (d.ok && d.gravado) {
          setPrevia(null);
          // relê o estoque das linhas gravadas para mostrar o novo saldo
          for (const l of prontas) if (l.produto) carregarLocais(l.uid, l.produto);
        }
      } else setPrevia(d);
    } catch (e) {
      const d = { ok: false, erro: 'rede: ' + (e as Error).message };
      if (gravar) setResultado(d); else setPrevia(d);
    } finally {
      setEnviando(null);
    }
  };

  if (!permLoading && userProfile && !pode('ajustes', 'ajuste-estoque')) return <SemPermissao />;

  const indiceProntas = new Map(prontas.map((l, i) => [l.uid, i]));
  const problemaDe = (uid: number) => {
    const i = indiceProntas.get(uid);
    return i == null ? null : previa?.problemas?.find((p) => p.indice === i)?.erro || null;
  };
  const podeConfirmar = !!previa?.ok && motivo.trim().length >= 5 && !enviando;

  return (
    <div className="est-page" style={{ maxWidth: 1100, margin: '0 auto', padding: '20px 24px' }}>
      <h1 style={{ fontSize: '1.4rem', fontWeight: 700, marginBottom: 4 }}>Ajuste de estoque (quantidade e custo)</h1>
      <p style={{ color: '#64748b', fontSize: '.84rem', marginBottom: 10 }}>
        Escolha os produtos (pode misturar NOVA e CASTRO), digite a nova quantidade e/ou o novo custo — o que ficar em branco não muda.
        Funciona com produto de estoque zerado. Tudo é gravado junto no Omie: se um item falhar, nada fica gravado.
      </p>
      <div style={{ margin: '0 0 16px', display: 'flex', gap: 16, fontSize: '.8rem' }}>
        <Link href="/ajustes/ajuste-custos" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Ajuste de custos (lista)</Link>
        <Link href="/atividades" style={{ color: '#dc2626', textDecoration: 'none', fontWeight: 600 }}>→ Atividades (quem ajustou)</Link>
      </div>

      {linhas.map((l, i) => {
        const loc = localDe(l);
        const prob = problemaDe(l.uid);
        return (
          <div key={l.uid}>
            <div style={{ background: 'var(--surface, #fff)', border: `1px solid ${prob ? '#fca5a5' : '#e2e8f0'}`, borderLeft: `4px solid ${COR_CONTA[l.conta]}`, borderRadius: 8, padding: 14, marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10, flexWrap: 'wrap' }}>
                <b style={{ fontSize: '.9rem' }}>Produto {i + 1}</b>
                <div style={{ display: 'inline-flex', border: '1px solid #cbd5e1', borderRadius: 6, overflow: 'hidden' }}>
                  {(['NOVA', 'CASTRO'] as Conta[]).map((c) => (
                    <button key={c} type="button" onClick={() => c !== l.conta && alterar(l.uid, { conta: c, produto: null, locais: null, codLocal: null, novaQtd: '', novoCusto: '' })}
                      style={{ padding: '4px 12px', fontSize: '.78rem', fontWeight: 700, border: 'none', cursor: 'pointer', background: l.conta === c ? COR_CONTA[c] : 'transparent', color: l.conta === c ? '#fff' : '#64748b' }}>{c}</button>
                  ))}
                </div>
                {l.produto && (
                  <span style={{ fontSize: '.85rem' }}>
                    <b>{l.produto.codigo || '#' + l.produto.codigoProduto}</b> — {l.produto.descricao}
                    <button type="button" onClick={() => alterar(l.uid, { produto: null, locais: null, codLocal: null, novaQtd: '', novoCusto: '' })}
                      style={{ marginLeft: 8, border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '.78rem' }}>trocar</button>
                  </span>
                )}
                {linhas.length > 1 && (
                  <button type="button" onClick={() => { setLinhas((ls) => ls.filter((x) => x.uid !== l.uid)); setPrevia(null); }}
                    style={{ marginLeft: 'auto', border: 'none', background: 'none', color: '#94a3b8', cursor: 'pointer', fontSize: '.8rem' }}>remover</button>
                )}
              </div>

              {!l.produto ? (
                <BuscaProduto conta={l.conta} onEscolher={(p) => carregarLocais(l.uid, p)} />
              ) : l.carregandoLocais ? (
                <div style={{ fontSize: '.82rem', color: '#64748b' }}>Lendo o estoque no Omie…</div>
              ) : l.erroLocais ? (
                <div style={{ fontSize: '.82rem', color: '#dc2626' }}>{l.erroLocais} <button type="button" onClick={() => carregarLocais(l.uid, l.produto!)} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer' }}>tentar de novo</button></div>
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, alignItems: 'end' }}>
                  <label>
                    <span style={rot}>Local de estoque</span>
                    <select value={l.codLocal ?? ''} onChange={(e) => alterar(l.uid, { codLocal: Number(e.target.value) })} style={inp}>
                      {(l.locais || []).map((x) => <option key={x.id} value={x.id}>{x.nome} ({fmtQ(x.fisico)})</option>)}
                    </select>
                  </label>
                  <div>
                    <span style={rot}>Hoje no Omie</span>
                    <div style={{ fontSize: '.92rem', padding: '7px 0' }}>
                      <b style={{ color: (loc?.fisico || 0) < 0 ? '#dc2626' : (loc?.fisico || 0) === 0 ? '#d97706' : undefined }}>{fmtQ(loc?.fisico || 0)} un.</b>
                      <span style={{ color: '#64748b' }}> · {loc && loc.cmc > 0 ? fmtR(loc.cmc) : 'sem custo'}</span>
                    </div>
                  </div>
                  <label>
                    <span style={rot}>Nova quantidade</span>
                    <input inputMode="decimal" value={l.novaQtd} placeholder="não muda" onChange={(e) => alterar(l.uid, { novaQtd: e.target.value })} style={inp} />
                  </label>
                  <label>
                    <span style={rot}>Novo custo unitário (R$)</span>
                    <input inputMode="decimal" value={l.novoCusto} placeholder={loc && loc.cmc > 0 ? 'não muda' : 'obrigatório se entrar qtd'} onChange={(e) => alterar(l.uid, { novoCusto: e.target.value })} style={inp} />
                  </label>
                </div>
              )}
              {prob && <div style={{ marginTop: 8, fontSize: '.8rem', color: '#dc2626', fontWeight: 600 }}>⚠ {prob}</div>}
            </div>

            {i === 0 && linhas.length >= 2 && localDe(linhas[0]) && localDe(linhas[1]) && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '-2px 0 12px 14px', fontSize: '.8rem', color: '#64748b' }}>
                <span>⇅ Passar</span>
                <input inputMode="decimal" value={transf} onChange={(e) => setTransf(e.target.value)} placeholder="qtd" style={{ ...inp, width: 80, padding: '4px 8px' }} />
                <span>un. do produto 1 para o produto 2</span>
                <button type="button" onClick={aplicarTransferencia} style={{ ...btn('#475569', false), padding: '4px 10px', fontSize: '.78rem' }}>preencher</button>
                <span style={{ fontSize: '.72rem' }}>(o custo do 1 vai para o 2 se ele não tiver custo)</span>
              </div>
            )}
          </div>
        );
      })}

      {linhas.length < 10 && (
        <button type="button" onClick={() => setLinhas((ls) => [...ls, novaLinha(ls[ls.length - 1]?.conta || 'NOVA')])} style={{ ...btn('#2563eb', false), marginBottom: 16 }}>+ Mais um produto</button>
      )}

      <div style={{ background: 'var(--surface, #fff)', border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, marginBottom: 14 }}>
        <label>
          <span style={rot}>Motivo do ajuste (obrigatório)</span>
          <textarea value={motivo} onChange={(e) => { setMotivo(e.target.value); setResultado(null); }} rows={2}
            placeholder="ex.: contagem do dia 26/10 achou 5 peças na Castro que estavam lançadas na Nova"
            style={{ ...inp, resize: 'vertical' }} />
        </label>
        <div style={{ fontSize: '.72rem', color: '#64748b', marginTop: 6 }}>
          Vai no comentário do ajuste no Omie: data, hora, <b>{userProfile?.nome || 'seu usuário'}</b>, o que mudou e este motivo.
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <button type="button" disabled={!prontas.length || !!enviando} onClick={() => enviar(false)} style={{ ...btn('#2563eb'), opacity: !prontas.length || enviando ? 0.5 : 1 }}>
          {enviando === 'previa' ? 'Conferindo no Omie…' : `Conferir ${prontas.length || ''} ajuste(s)`}
        </button>
        {!prontas.length && <span style={{ fontSize: '.78rem', color: '#94a3b8' }}>Escolha um produto e preencha a quantidade ou o custo.</span>}
      </div>

      {previa && (
        <div style={{ marginTop: 16, background: 'var(--surface, #fff)', border: `1px solid ${previa.ok ? '#86efac' : '#fca5a5'}`, borderRadius: 8, padding: 14 }}>
          {previa.erro && <div style={{ color: '#dc2626', fontWeight: 600, fontSize: '.85rem' }}>{previa.erro}</div>}
          {!!previa.previa?.length && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '.84rem' }}>
                <thead>
                  <tr style={{ textAlign: 'left', color: '#64748b', fontSize: '.7rem', textTransform: 'uppercase' }}>
                    <th style={{ padding: 6 }}>Empresa</th><th style={{ padding: 6 }}>Produto</th><th style={{ padding: 6 }}>Local</th>
                    <th style={{ padding: 6, textAlign: 'right' }}>Qtd</th><th style={{ padding: 6, textAlign: 'right' }}>Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {previa.previa.map((p) => {
                    const ln = prontas.find((l) => l.conta === p.conta && l.produto?.codigoProduto === p.codigoProduto);
                    return (
                      <tr key={`${p.conta}-${p.codigoProduto}-${p.codLocal}`} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 6, fontWeight: 700, color: COR_CONTA[p.conta] }}>{p.conta}</td>
                        <td style={{ padding: 6 }}>{ln?.produto?.codigo || '#' + p.codigoProduto} <span style={{ color: '#64748b' }}>{ln?.produto?.descricao}</span></td>
                        <td style={{ padding: 6 }}>{p.localNome}</td>
                        <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtQ(p.qtdAtual)} → <b>{fmtQ(p.qtdFinal)}</b></td>
                        <td style={{ padding: 6, textAlign: 'right', whiteSpace: 'nowrap' }}>{fmtR(p.cmcAtual)} → <b>{fmtR(p.cmcFinal)}</b></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          {previa.ok ? (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
              <button type="button" disabled={!podeConfirmar} onClick={() => enviar(true)} style={{ ...btn('#15803d'), opacity: podeConfirmar ? 1 : 0.5 }}>
                {enviando === 'gravar' ? 'Gravando no Omie…' : 'Confirmar e gravar no Omie'}
              </button>
              {motivo.trim().length < 5 && <span style={{ fontSize: '.78rem', color: '#d97706' }}>Escreva o motivo para confirmar.</span>}
            </div>
          ) : !previa.erro && (
            <div style={{ marginTop: 8, fontSize: '.82rem', color: '#dc2626' }}>Corrija os itens marcados acima — nada foi gravado.</div>
          )}
        </div>
      )}

      {resultado && (
        <div style={{ marginTop: 16, borderRadius: 8, padding: 14, fontSize: '.85rem', background: resultado.ok ? '#f0fdf4' : '#fef2f2', border: `1px solid ${resultado.ok ? '#86efac' : '#fca5a5'}`, color: resultado.ok ? '#166534' : '#991b1b' }}>
          {resultado.ok ? (
            <>
              <b>✓ {resultado.ajustes?.length} ajuste(s) gravado(s) no Omie.</b>
              <ul style={{ margin: '8px 0 0 18px', fontSize: '.78rem' }}>
                {resultado.ajustes?.map((a) => <li key={a.codigoAjuste}>{a.obs}</li>)}
              </ul>
            </>
          ) : <b>{resultado.erro || 'Falhou.'}</b>}
        </div>
      )}
    </div>
  );
}
