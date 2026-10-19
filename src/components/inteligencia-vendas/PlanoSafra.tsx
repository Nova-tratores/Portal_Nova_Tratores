'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// =============================================================================
// Plano Safra (página de teste, 19/10/2026): as linhas de crédito para máquina,
// lidas das páginas oficiais por um robô; a IA propõe, uma pessoa confere.
// "Quem confere" é escolhido num modal. Tudo animado.
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiEnviar, apiGet } from './ui';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)', BD = 'var(--portal-border, #e2e8f0)';
const CARD = 'var(--portal-bg-card, #fefefe)', SUAVE = 'var(--portal-bg-secondary, #f1f5f9)';

const PROG: Record<string, { nome: string; cor: string; icone: string; frase: string }> = {
  moderfrota: { nome: 'Moderfrota', cor: '#2563eb', icone: 'fa-tractor', frase: 'trator e implemento novo, para todo porte' },
  pronaf: { nome: 'Pronaf', cor: '#16a34a', icone: 'fa-seedling', frase: 'agricultura familiar: a taxa mais baixa' },
  pronamp: { nome: 'Pronamp', cor: '#ea580c', icone: 'fa-wheat-awn', frase: 'médio produtor' },
  inovagro: { nome: 'Inovagro', cor: '#7c3aed', icone: 'fa-microchip', frase: 'tecnologia, precisão e inovação' },
  outro: { nome: 'Outras linhas', cor: '#475569', icone: 'fa-building-columns', frase: 'cadastradas à mão' },
};
const prog = (p: string) => PROG[p] || PROG.outro;

interface Linha {
  id: number; programa: string; nome: string; safra: string | null; taxa_aa: number | null; taxa_aa_max: number | null; prazo_anos: number | null;
  carencia_meses: number | null; participacao_pct: number | null; limite: string | null; publico: string | null; financia: string | null;
  fonte_url: string | null; observacao: string | null; status: 'vigente' | 'proposta'; origem: string; conferido_em: string | null; conferido_por: string | null; criado_em: string;
}
interface Dados {
  linhas: Linha[]; fontes: { id: number; programa: string; nome: string; url: string; verificado_em: string | null; mudou_em: string | null; erro: string | null }[];
  conferentes: { id: string; nome: string }[]; safra: string; podeConferir: boolean; podeEscolher: boolean;
}

const pct = (n: number | null) => (n == null ? '—' : `${Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`);
const quando = (iso: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

function useConta(alvo: number, ms = 900) {
  const [v, setV] = useState(0);
  const de = useRef(0);
  useEffect(() => {
    const ini = performance.now(), o = de.current;
    let raf = 0;
    const p = (t: number) => { const k = Math.min(1, (t - ini) / ms); setV(o + (alvo - o) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(p); else de.current = alvo; };
    raf = requestAnimationFrame(p);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return v;
}
function Taxa({ v }: { v: number }) { return <>{useConta(v).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 })}</>; }

export default function PlanoSafra() {
  const [d, setD] = useState<Dados | null>(null);
  const [erro, setErro] = useState<any>(null);
  const [modal, setModal] = useState(false);
  const [lendo, setLendo] = useState(false);
  const [msg, setMsg] = useState('');
  const [edita, setEdita] = useState<Partial<Linha> | null>(null);

  const carregar = useCallback(async () => {
    try { setD(await apiGet('/api/inteligencia-vendas/plano-safra')); setErro(null); } catch (e) { setErro(e); }
  }, []);
  useEffect(() => { const t = setTimeout(() => carregar(), 0); return () => clearTimeout(t); }, [carregar]);

  const vigentes = useMemo(() => (d?.linhas || []).filter((l) => l.status === 'vigente'), [d]);
  const propostas = useMemo(() => (d?.linhas || []).filter((l) => l.status === 'proposta'), [d]);
  const programas = [...new Set([...vigentes, ...propostas].map((l) => l.programa))].sort((a, b) => Object.keys(PROG).indexOf(a) - Object.keys(PROG).indexOf(b));

  async function verificar() {
    setLendo(true); setMsg('');
    try {
      const r = await apiEnviar('/api/inteligencia-vendas/plano-safra', 'POST', { acao: 'verificar' });
      setMsg(r.mudaram.length ? `Mudança lida em: ${r.mudaram.join(', ')}. Confira abaixo.` : `Nenhuma mudança nas ${r.verificadas} páginas.${r.erros.length ? ` Erros: ${r.erros.join(' · ')}` : ''}`);
      carregar();
    } catch (e) { setMsg((e as Error).message); } finally { setLendo(false); }
  }
  async function decidir(acao: 'aprovar' | 'rejeitar', programa: string) {
    try { await apiEnviar('/api/inteligencia-vendas/plano-safra', 'POST', { acao, programa }); carregar(); } catch (e) { alert((e as Error).message); }
  }
  async function tirar(id: number) {
    try { await apiEnviar('/api/inteligencia-vendas/plano-safra', 'POST', { acao: 'apagar', id }); carregar(); } catch (e) { alert((e as Error).message); }
  }
  async function salvar() {
    try { await apiEnviar('/api/inteligencia-vendas/plano-safra', 'POST', { acao: 'salvar', linha: edita }); setEdita(null); carregar(); } catch (e) { alert((e as Error).message); }
  }

  if (erro?.corpo?.migracaoFaltando) {
    return <div style={{ padding: 28 }}><div style={{ padding: 18, borderRadius: 16, background: '#fef3c7', color: '#92400e', fontSize: 16 }}>Falta rodar o SQL <b>sql/inteligencia-vendas-plano-safra.sql</b> no Supabase.</div></div>;
  }
  return (
    <div style={{ padding: 'clamp(14px, 2vw, 28px)', width: '100%', boxSizing: 'border-box' }}>
      <style>{ESTILO}</style>
      {erro && <div style={{ padding: 14, color: '#b91c1c' }}>{erro.message}</div>}
      {!d && !erro && <div style={{ padding: 40, textAlign: 'center', color: MU }}>Carregando…</div>}
      {d && <>
        {/* topo: safra + quem confere + verificar */}
        <div className="ps-topo">
          <div>
            <div style={{ fontSize: 14, color: MU, fontWeight: 700, letterSpacing: .6, textTransform: 'uppercase' }}>Plano Safra</div>
            <div style={{ fontSize: 34, fontWeight: 800, color: TX, letterSpacing: '-.02em' }}>{d.safra}</div>
          </div>
          <button type="button" className="ps-conf" onClick={() => setModal(true)} disabled={!d.podeEscolher} title={d.podeEscolher ? 'Escolher quem confere' : 'Só o administrador escolhe'}>
            <span style={{ display: 'flex' }}>
              {d.conferentes.length ? d.conferentes.slice(0, 4).map((c, i) => <Iniciais key={c.id} nome={c.nome} i={i} />) : <span className="ps-vazio"><i className="fas fa-user-plus" /></span>}
            </span>
            <span style={{ textAlign: 'left' }}>
              <span style={{ display: 'block', fontSize: 12.5, color: MU, fontWeight: 700 }}>QUEM CONFERE</span>
              <span style={{ fontSize: 15.5, fontWeight: 700, color: TX }}>{d.conferentes.length ? d.conferentes.map((c) => c.nome.split(' ')[0]).join(', ') : 'Ninguém escolhido — clique para escolher'}</span>
            </span>
            {d.podeEscolher && <i className="fas fa-pen" style={{ color: MU, marginLeft: 6 }} />}
          </button>
          <span style={{ flex: 1 }} />
          {d.podeConferir && <button type="button" onClick={() => setEdita({ programa: 'outro' })} className="ps-btn"><i className="fas fa-plus" /> Linha à mão</button>}
          {d.podeConferir && (
            <button type="button" onClick={verificar} disabled={lendo} className="ps-btn ps-btn-on">
              <i className={`fas fa-rotate ${lendo ? 'ps-gira' : ''}`} /> {lendo ? 'Lendo as páginas…' : 'Verificar agora'}
            </button>
          )}
        </div>
        {msg && <div className="ps-msg">{msg}</div>}

        {/* propostas esperando conferência */}
        {[...new Set(propostas.map((p) => p.programa))].map((pg) => {
          const novas = propostas.filter((p) => p.programa === pg);
          const velhas = vigentes.filter((v) => v.programa === pg);
          return (
            <section key={pg} className="ps-proposta" style={{ ['--k' as string]: prog(pg).cor }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <span className="ps-sino"><i className="fas fa-bell" /></span>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <div style={{ fontSize: 18, fontWeight: 800, color: TX }}>{prog(pg).nome}: o robô leu {velhas.length ? 'uma mudança' : 'as condições'}</div>
                  <div style={{ fontSize: 14.5, color: MU }}>Confira com a página oficial antes de aprovar. Só vale na calculadora depois de aprovado.</div>
                </div>
                {novas[0]?.fonte_url && <a href={novas[0].fonte_url} target="_blank" rel="noreferrer" className="ps-btn"><i className="fas fa-up-right-from-square" /> Página oficial</a>}
                {d.podeConferir && <>
                  <button type="button" className="ps-btn" onClick={() => decidir('rejeitar', pg)}><i className="fas fa-xmark" /> Rejeitar</button>
                  <button type="button" className="ps-btn ps-ok" onClick={() => decidir('aprovar', pg)}><i className="fas fa-check" /> Aprovar</button>
                </>}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 10, marginTop: 14 }}>
                {novas.map((n, i) => {
                  const antiga = velhas.find((v) => v.nome === n.nome) || velhas[i];
                  const mudou = (a: any, b: any) => antiga && a !== b;
                  return (
                    <div key={n.id} className="ps-linha-prop" style={{ animationDelay: `${i * 70}ms` }}>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ fontWeight: 800, fontSize: 15.5, color: TX, flex: 1 }}>{n.nome}</div>
                        {d.podeConferir && <button type="button" className="ps-mini" title="Tirar esta linha (não interessa)" onClick={() => tirar(n.id)}><i className="fas fa-xmark" /></button>}
                      </div>
                      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 6, fontSize: 14.5 }}>
                        <span className={mudou(n.taxa_aa, antiga?.taxa_aa) ? 'ps-mudou' : ''}>Taxa <b>{pct(n.taxa_aa)}{n.taxa_aa_max ? ` a ${pct(n.taxa_aa_max)}` : ''}</b>{mudou(n.taxa_aa, antiga?.taxa_aa) && <s style={{ color: MU, marginLeft: 6 }}>{pct(antiga!.taxa_aa)}</s>}</span>
                        <span className={mudou(n.prazo_anos, antiga?.prazo_anos) ? 'ps-mudou' : ''}>Prazo <b>{n.prazo_anos ?? '—'} anos</b></span>
                        <span>Carência <b>{n.carencia_meses ?? '—'} m</b></span>
                      </div>
                      {n.publico && <div style={{ fontSize: 13.5, color: MU, marginTop: 4 }}>{n.publico}</div>}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}

        {/* linhas vigentes */}
        {programas.filter((pg) => vigentes.some((v) => v.programa === pg)).map((pg, gi) => (
          <section key={pg} className="ps-prog" style={{ animationDelay: `${gi * 90}ms`, ['--k' as string]: prog(pg).cor }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span className="ps-icone"><i className={`fas ${prog(pg).icone}`} /></span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: TX }}>{prog(pg).nome}</div>
                <div style={{ fontSize: 14.5, color: MU }}>{prog(pg).frase}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 12 }}>
              {vigentes.filter((v) => v.programa === pg).map((l, i) => (
                <article key={l.id} className="ps-cartao" style={{ animationDelay: `${gi * 90 + i * 60}ms` }}>
                  <div style={{ fontSize: 15.5, fontWeight: 800, color: TX, lineHeight: 1.3, minHeight: 40 }}>{l.nome}</div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, margin: '8px 0 4px' }}>
                    <span style={{ fontSize: 38, fontWeight: 800, color: prog(pg).cor, letterSpacing: '-.02em' }}>{l.taxa_aa != null ? <Taxa v={Number(l.taxa_aa)} /> : '—'}</span>
                    <span style={{ fontSize: 16, color: MU, fontWeight: 700 }}>% a.a.{l.taxa_aa_max ? ` até ${pct(l.taxa_aa_max)}` : ''}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {l.prazo_anos != null && <span className="ps-chip"><i className="fas fa-calendar" /> {l.prazo_anos} anos</span>}
                    {l.carencia_meses != null && <span className="ps-chip"><i className="fas fa-hourglass-start" /> carência {l.carencia_meses} m</span>}
                    {l.participacao_pct != null && <span className="ps-chip"><i className="fas fa-percent" /> financia {l.participacao_pct}%</span>}
                  </div>
                  {l.publico && <div style={{ fontSize: 13.5, color: MU, marginTop: 8 }}><b>Para quem:</b> {l.publico}</div>}
                  {l.financia && <div style={{ fontSize: 13.5, color: MU, marginTop: 2 }}><b>Financia:</b> {l.financia}</div>}
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 12, flexWrap: 'wrap' }}>
                    <a className="ps-usar" href={`/inteligencia-vendas/calculadora?taxa=${l.taxa_aa ?? ''}&prazo=${l.prazo_anos ?? ''}&linha=${encodeURIComponent(l.nome)}`}><i className="fas fa-calculator" /> Usar na calculadora</a>
                    {d.podeConferir && <button type="button" className="ps-mini" onClick={() => setEdita(l)} title="Corrigir"><i className="fas fa-pen" /></button>}
                    <span style={{ fontSize: 12, color: MU, marginLeft: 'auto' }}>{l.conferido_por ? `conferido por ${l.conferido_por.split(' ')[0]} · ${quando(l.conferido_em)}` : ''}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
        {vigentes.length === 0 && propostas.length === 0 && (
          <div style={{ padding: 30, textAlign: 'center', color: MU, fontSize: 16, background: CARD, border: `1px dashed ${BD}`, borderRadius: 20 }}>
            Nenhuma linha ainda. {d.podeConferir ? 'Clique em "Verificar agora" para o robô ler as páginas oficiais.' : 'Quem confere ainda não aprovou nenhuma.'}
          </div>
        )}

        {/* páginas vigiadas */}
        <section className="ps-prog" style={{ ['--k' as string]: '#475569' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: TX, marginBottom: 10 }}><i className="fas fa-satellite-dish" style={{ color: '#dc2626' }} /> Páginas oficiais vigiadas pelo robô</div>
          <div style={{ display: 'grid', gap: 6 }}>
            {(d.fontes.length ? d.fontes : []).map((f) => (
              <a key={f.id} href={f.url} target="_blank" rel="noreferrer" className="ps-fonte">
                <span className={`ps-luz ${f.erro ? 'erro' : ''}`} />
                <b style={{ flex: 1 }}>{f.nome}</b>
                <span>{f.erro ? `erro: ${f.erro}` : `lida ${quando(f.verificado_em)}`}{f.mudou_em ? ` · mudou ${quando(f.mudou_em)}` : ''}</span>
              </a>
            ))}
            {!d.fontes.length && <div style={{ color: MU, fontSize: 14.5 }}>Ainda não lidas.</div>}
          </div>
          <div style={{ fontSize: 13.5, color: MU, marginTop: 8 }}>O robô lê essas páginas duas vezes por dia. Se as condições mudarem, a IA propõe os números novos e quem confere recebe um aviso no sino.</div>
        </section>
      </>}

      {modal && d && <ModalConferentes atuais={d.conferentes} onFechar={() => setModal(false)} onSalvo={() => { setModal(false); carregar(); }} />}
      {edita && <ModalLinha linha={edita} onMudar={setEdita} onSalvar={salvar} onFechar={() => setEdita(null)} />}
    </div>
  );
}

function Iniciais({ nome, i }: { nome: string; i: number }) {
  const ini = nome.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
  return <span className="ps-ini" style={{ marginLeft: i ? -10 : 0, animationDelay: `${i * 80}ms` }}>{ini}</span>;
}

const COMO_FUNCIONA: { icone: string; cor: string; texto: React.ReactNode }[] = [
  { icone: 'fa-satellite-dish', cor: '#2563eb', texto: <>O <b>robô lê 4 páginas do BNDES</b> duas vezes por dia: Moderfrota, Pronaf Mais Alimentos, Pronamp Investimento e Inovagro. Também tem o botão <b>&quot;Verificar agora&quot;</b>.</> },
  { icone: 'fa-bell', cor: '#dc2626', texto: <>Se as condições mudaram, a <b>IA propõe os números</b> e quem confere recebe um <b>aviso no sino</b>. Aparece um quadro pulsando, com o número que mudou marcado em amarelo ao lado do antigo riscado.</> },
  { icone: 'fa-list-check', cor: '#ea580c', texto: <>Quem confere abre a <b>página oficial</b>, tira com o ✕ as linhas que não interessam (o Pronamp traz linhas de gado e aves, por exemplo) e clica em <b>Aprovar</b> ou <b>Rejeitar</b>. <b>Nada vale sem aprovação.</b></> },
  { icone: 'fa-calculator', cor: '#16a34a', texto: <>As linhas aprovadas viram cartões por programa, com taxa, prazo, carência e para quem vale, e o botão <b>&quot;Usar na calculadora&quot;</b>, que abre a Calculadora já com a taxa e o prazo daquela linha.</> },
  { icone: 'fa-pen', cor: '#7c3aed', texto: <>Dá para <b>criar ou corrigir uma linha à mão</b>.</> },
];

/** Modal: escolher quem confere (foto, busca, várias pessoas) + como funciona. */
function ModalConferentes({ atuais, onFechar, onSalvo }: { atuais: { id: string; nome: string }[]; onFechar: () => void; onSalvo: () => void }) {
  const [usuarios, setUsuarios] = useState<{ id: string; nome: string; avatar_url: string | null; funcao: string | null }[] | null>(null);
  const [sel, setSel] = useState<Set<string>>(new Set(atuais.map((a) => a.id)));
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => { apiGet('/api/inteligencia-vendas/plano-safra?usuarios=1').then((j) => setUsuarios(j.usuarios)).catch(() => setUsuarios([])); }, []);
  const lista = (usuarios || []).filter((u) => !busca || `${u.nome} ${u.funcao || ''}`.toLowerCase().includes(busca.toLowerCase()));
  const alternar = (id: string) => setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  async function salvar() {
    setSalvando(true);
    try {
      await apiEnviar('/api/inteligencia-vendas/plano-safra', 'POST', { acao: 'conferentes', usuarios: (usuarios || []).filter((u) => sel.has(u.id)).map((u) => ({ id: u.id, nome: u.nome })) });
      onSalvo();
    } catch (e) { alert((e as Error).message); setSalvando(false); }
  }
  return (
    <div className="ps-fundo" onClick={onFechar}>
      <div className="ps-modal" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <span className="ps-icone" style={{ ['--k' as string]: '#dc2626' }}><i className="fas fa-user-check" /></span>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 20, fontWeight: 800, color: TX }}>Quem confere o Plano Safra?</div>
            <div style={{ fontSize: 14.5, color: MU }}>Quando o robô ler uma mudança nas taxas, essas pessoas recebem um aviso no sino e aprovam ou corrigem.</div>
          </div>
          <button type="button" onClick={onFechar} className="ps-mini" aria-label="Fechar"><i className="fas fa-xmark" /></button>
        </div>
        <div className="ps-como">
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: .6, textTransform: 'uppercase', color: MU, marginBottom: 10 }}>Como funciona</div>
          {COMO_FUNCIONA.map((p, i) => (
            <div key={i} className="ps-passo" style={{ animationDelay: `${150 + i * 110}ms` }}>
              <span className="ps-passo-ic" style={{ ['--k' as string]: p.cor }}><i className={`fas ${p.icone}`} /><b>{i + 1}</b></span>
              <span style={{ fontSize: 14.5, color: TX, lineHeight: 1.45 }}>{p.texto}</span>
            </div>
          ))}
        </div>
        <div style={{ position: 'relative', margin: '14px 0' }}>
          <i className="fas fa-magnifying-glass" style={{ position: 'absolute', left: 16, top: 16, color: MU }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa ou setor" className="ps-busca" />
        </div>
        {!usuarios && <div style={{ padding: 30, textAlign: 'center', color: MU }}>Carregando pessoas…</div>}
        <div className="ps-pessoas">
          {lista.map((u, i) => {
            const on = sel.has(u.id);
            return (
              <button key={u.id} type="button" onClick={() => alternar(u.id)} className={`ps-pessoa ${on ? 'on' : ''}`} style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
                {u.avatar_url
                  // eslint-disable-next-line @next/next/no-img-element -- foto do perfil vinda do storage
                  ? <img src={u.avatar_url} alt="" style={{ width: 46, height: 46, borderRadius: '50%', objectFit: 'cover' }} />
                  : <span className="ps-ini" style={{ width: 46, height: 46, fontSize: 16, animation: 'none' }}>{u.nome.split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase()}</span>}
                <span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <b style={{ display: 'block', fontSize: 15, color: TX, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.nome}</b>
                  <span style={{ fontSize: 13, color: MU }}>{u.funcao || '—'}</span>
                </span>
                <span className="ps-check"><i className="fas fa-check" /></span>
              </button>
            );
          })}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
          <span style={{ fontSize: 15, color: MU }}><b style={{ color: TX }}>{sel.size}</b> {sel.size === 1 ? 'pessoa escolhida' : 'pessoas escolhidas'}</span>
          <span style={{ flex: 1 }} />
          <button type="button" onClick={onFechar} className="ps-btn">Cancelar</button>
          <button type="button" onClick={salvar} disabled={salvando} className="ps-btn ps-btn-on"><i className="fas fa-check" /> {salvando ? 'Salvando…' : 'Salvar'}</button>
        </div>
      </div>
    </div>
  );
}

/** Modal: criar ou corrigir uma linha à mão. */
function ModalLinha({ linha, onMudar, onSalvar, onFechar }: { linha: Partial<Linha>; onMudar: (l: Partial<Linha>) => void; onSalvar: () => void; onFechar: () => void }) {
  const campo = (rot: string, k: keyof Linha, tipo = 'text') => (
    <label style={{ display: 'grid', gap: 4, fontSize: 13.5, color: MU, fontWeight: 700 }}>{rot}
      <input type={tipo} value={(linha[k] as any) ?? ''} onChange={(e) => onMudar({ ...linha, [k]: e.target.value })} className="ps-busca" style={{ paddingLeft: 14 }} />
    </label>
  );
  return (
    <div className="ps-fundo" onClick={onFechar}>
      <div className="ps-modal" onClick={(e) => e.stopPropagation()} style={{ width: 'min(640px, 100%)' }}>
        <div style={{ fontSize: 20, fontWeight: 800, color: TX, marginBottom: 12 }}>{linha.id ? 'Corrigir linha' : 'Nova linha de crédito'}</div>
        <div style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13.5, color: MU, fontWeight: 700 }}>Programa
            <select value={linha.programa || 'outro'} onChange={(e) => onMudar({ ...linha, programa: e.target.value })} className="ps-busca" style={{ paddingLeft: 14 }}>
              {Object.entries(PROG).map(([k, v]) => <option key={k} value={k}>{v.nome}</option>)}
            </select>
          </label>
          {campo('Nome da linha', 'nome')}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>{campo('Taxa % a.a.', 'taxa_aa', 'number')}{campo('Prazo (anos)', 'prazo_anos', 'number')}{campo('Carência (meses)', 'carencia_meses', 'number')}</div>
          {campo('Para quem', 'publico')}
          {campo('O que financia', 'financia')}
          {campo('Página oficial (link)', 'fonte_url')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 16 }}>
          <button type="button" onClick={onFechar} className="ps-btn">Cancelar</button>
          <button type="button" onClick={onSalvar} className="ps-btn ps-btn-on"><i className="fas fa-check" /> Salvar</button>
        </div>
      </div>
    </div>
  );
}

const ESTILO = `
  @keyframes psSobe { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
  .ps-topo { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; margin-bottom: 16px; animation: psSobe .5s both }
  .ps-conf { display: flex; align-items: center; gap: 12px; border: 1px solid ${BD}; background: ${CARD}; border-radius: 18px; padding: 10px 16px; cursor: pointer; font-family: inherit; transition: transform .2s, box-shadow .2s, border-color .2s }
  .ps-conf:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 24px rgba(15,23,42,.1); border-color: #fca5a5 } .ps-conf:disabled { cursor: default }
  .ps-ini { width: 38px; height: 38px; border-radius: 50%; display: inline-grid; place-items: center; font-weight: 800; font-size: 14px; color: #fefefe; background: linear-gradient(135deg, #f87171, #b91c1c); border: 2px solid ${CARD}; animation: psPop .45s cubic-bezier(.2,1.5,.3,1) both }
  .ps-vazio { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; background: ${SUAVE}; color: ${MU}; animation: psPulso 1.8s infinite }
  @keyframes psPop { from { transform: scale(0) } }
  @keyframes psPulso { 0% { box-shadow: 0 0 0 0 rgba(220,38,38,.35) } 70% { box-shadow: 0 0 0 10px rgba(220,38,38,0) } 100% { box-shadow: 0 0 0 0 rgba(220,38,38,0) } }
  .ps-btn { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border-radius: 14px; border: 1px solid ${BD}; background: ${CARD}; color: ${TX}; font-size: 15px; font-weight: 700; cursor: pointer; font-family: inherit; text-decoration: none; transition: transform .2s, box-shadow .2s }
  .ps-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(15,23,42,.1) }
  .ps-btn-on { background: #dc2626; border-color: #dc2626; color: #fefefe } .ps-ok { background: #16a34a; border-color: #16a34a; color: #fefefe }
  .ps-gira { animation: psGira 1s linear infinite } @keyframes psGira { to { transform: rotate(360deg) } }
  .ps-msg { padding: 12px 16px; border-radius: 14px; background: #eff6ff; color: #1e3a8a; font-size: 15px; margin-bottom: 14px; animation: psSobe .4s both }
  .ps-proposta { border-radius: 20px; padding: 18px; margin-bottom: 16px; background: color-mix(in srgb, var(--k) 8%, ${CARD}); border: 2px solid var(--k); animation: psSobe .5s both, psBorda 2.4s ease-in-out infinite }
  @keyframes psBorda { 50% { box-shadow: 0 0 0 6px color-mix(in srgb, var(--k) 14%, transparent) } }
  .ps-sino { width: 46px; height: 46px; border-radius: 14px; display: grid; place-items: center; background: var(--k); color: #fefefe; font-size: 20px; animation: psSino 1.6s ease-in-out infinite }
  @keyframes psSino { 0%, 60%, 100% { transform: rotate(0) } 10%, 30% { transform: rotate(-14deg) } 20%, 40% { transform: rotate(14deg) } }
  .ps-linha-prop { background: ${CARD}; border-radius: 14px; padding: 12px 14px; border: 1px solid ${BD}; animation: psSobe .45s both }
  .ps-mudou { background: #fef08a; border-radius: 6px; padding: 0 5px; animation: psMarca 1.5s ease-in-out infinite alternate } @keyframes psMarca { to { background: #fde047 } }
  .ps-prog { background: ${CARD}; border: 1px solid ${BD}; border-radius: 22px; padding: 18px; margin-bottom: 16px; animation: psSobe .55s both }
  .ps-icone { width: 48px; height: 48px; border-radius: 15px; display: grid; place-items: center; background: var(--k); color: #fefefe; font-size: 21px; box-shadow: 0 8px 18px color-mix(in srgb, var(--k) 35%, transparent); flex-shrink: 0 }
  .ps-cartao { background: ${SUAVE}; border-radius: 18px; padding: 16px; border-top: 4px solid var(--k); animation: psSobe .5s both; transition: transform .2s, box-shadow .2s }
  .ps-cartao:hover { transform: translateY(-3px); box-shadow: 0 12px 26px rgba(15,23,42,.1) }
  .ps-chip { display: inline-flex; align-items: center; gap: 5px; font-size: 13px; font-weight: 700; color: ${TX}; background: ${CARD}; border-radius: 999px; padding: 4px 10px }
  .ps-usar { display: inline-flex; align-items: center; gap: 7px; font-size: 14px; font-weight: 700; color: var(--k); text-decoration: none; border-radius: 10px; padding: 7px 12px; background: color-mix(in srgb, var(--k) 12%, transparent); transition: transform .2s }
  .ps-usar:hover { transform: translateX(3px) }
  .ps-mini { width: 36px; height: 36px; border-radius: 11px; border: 1px solid ${BD}; background: ${CARD}; color: ${MU}; cursor: pointer; transition: transform .2s, color .2s } .ps-mini:hover { transform: rotate(-8deg); color: #dc2626 }
  .ps-fonte { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 12px; background: ${SUAVE}; color: ${TX}; text-decoration: none; font-size: 14.5px; transition: transform .2s }
  .ps-fonte:hover { transform: translateX(4px) } .ps-fonte span:last-child { color: ${MU}; font-size: 13.5px }
  .ps-luz { width: 10px; height: 10px; border-radius: 50%; background: #16a34a; animation: psPulsoV 2s infinite } .ps-luz.erro { background: #dc2626 }
  @keyframes psPulsoV { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.5) } 70% { box-shadow: 0 0 0 8px rgba(22,163,74,0) } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0) } }
  .ps-fundo { position: fixed; inset: 0; z-index: 9000; background: rgba(15,23,42,.5); backdrop-filter: blur(4px); display: grid; place-items: center; padding: 16px; animation: psFundo .25s both }
  @keyframes psFundo { from { opacity: 0 } }
  .ps-modal { width: min(760px, 100%); max-height: calc(100vh - 32px); overflow-y: auto; background: ${CARD}; border-radius: 24px; padding: 22px; box-shadow: 0 30px 80px rgba(15,23,42,.35); animation: psModal .45s cubic-bezier(.2,1.2,.3,1) both }
  @keyframes psModal { from { opacity: 0; transform: translateY(24px) scale(.96) } to { opacity: 1; transform: none } }
  .ps-busca { width: 100%; height: 50px; border-radius: 15px; border: 1px solid ${BD}; background: ${SUAVE}; padding: 0 14px 0 42px; font-size: 16px; color: ${TX}; outline: none; font-family: inherit; box-sizing: border-box; transition: box-shadow .3s, border-color .3s, background .3s }
  .ps-busca:focus { border-color: #dc2626; background: ${CARD}; box-shadow: 0 0 0 5px rgba(220,38,38,.12) }
  .ps-pessoas { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(230px, 100%), 1fr)); gap: 8px; max-height: 46vh; overflow-y: auto; padding: 2px }
  .ps-pessoa { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 16px; border: 2px solid transparent; background: ${SUAVE}; cursor: pointer; font-family: inherit; animation: psSobe .35s both; transition: transform .2s, border-color .2s, background .2s }
  .ps-pessoa:hover { transform: translateY(-2px) }
  .ps-pessoa.on { border-color: #dc2626; background: #fef2f2 }
  .ps-check { width: 26px; height: 26px; border-radius: 50%; display: grid; place-items: center; border: 2px solid ${BD}; color: transparent; font-size: 12px; transition: all .25s cubic-bezier(.2,1.5,.3,1) }
  .ps-pessoa.on .ps-check { background: #dc2626; border-color: #dc2626; color: #fefefe; transform: scale(1.12) }
  .ps-como { background: ${SUAVE}; border-radius: 18px; padding: 14px 16px; margin-top: 14px; display: grid; gap: 8px }
  .ps-passo { display: flex; gap: 12px; align-items: flex-start; animation: psPasso .5s cubic-bezier(.2,.8,.2,1) both }
  @keyframes psPasso { from { opacity: 0; transform: translateX(-14px) } to { opacity: 1; transform: none } }
  .ps-passo-ic { position: relative; width: 38px; height: 38px; border-radius: 12px; flex-shrink: 0; display: grid; place-items: center; background: var(--k); color: #fefefe; font-size: 15px; box-shadow: 0 6px 14px color-mix(in srgb, var(--k) 35%, transparent) }
  .ps-passo-ic b { position: absolute; right: -6px; top: -6px; width: 18px; height: 18px; border-radius: 50%; background: ${CARD}; color: var(--k); font-size: 11px; display: grid; place-items: center; border: 1.5px solid var(--k) }
  .ps-passo:hover .ps-passo-ic { animation: psPula .5s ease } @keyframes psPula { 50% { transform: translateY(-4px) rotate(-6deg) } }
  @media (prefers-reduced-motion: reduce) { .ps-passo, .ps-topo, .ps-ini, .ps-vazio, .ps-gira, .ps-msg, .ps-proposta, .ps-sino, .ps-linha-prop, .ps-mudou, .ps-prog, .ps-cartao, .ps-luz, .ps-fundo, .ps-modal, .ps-pessoa { animation: none !important } }
`;
