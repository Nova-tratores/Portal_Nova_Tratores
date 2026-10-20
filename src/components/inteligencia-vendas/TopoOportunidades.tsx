'use client';
// =============================================================================
// Parte de cima da tela Oportunidades em 3 versões (página de teste, 19/10/2026).
// José gosta da TABELA; o que muda é o topo: motivos, perguntas prontas e filtros,
// animados, modernos e fáceis de entender. A tabela continua igual embaixo.
//   A · Barra + cartões com ícone   B · Por grupos   C · Mosaico
// =============================================================================
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ClienteIV, RegraId } from '@/lib/inteligencia-vendas/tipos';
import { PERGUNTAS, REGRAS } from '@/lib/inteligencia-vendas/regras';

export type VarianteTopo = 'A' | 'B' | 'C' | 'D';
export interface FiltrosTopo { regra: RegraId | ''; pergunta: string; q: string; cidade: string; vendedor: string; loja: string; soComOportunidade: boolean }

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)', BD = 'var(--portal-border, #e2e8f0)';
const CARD = 'var(--portal-bg-card, #fefefe)', SUAVE = 'var(--portal-bg-secondary, #f1f5f9)';

const ICONE: Record<RegraId, string> = {
  renovacao: 'fa-rotate', cruzada: 'fa-puzzle-piece', outra_marca: 'fa-flag', reabordar: 'fa-reply',
  proposta_parada: 'fa-hourglass-half', sumiu: 'fa-user-slash', sem_visita: 'fa-route', perfil: 'fa-seedling', prestador: 'fa-briefcase',
};
/** Frase curta, em linguagem de vendedor. */
const FRASE: Record<RegraId, string> = {
  renovacao: 'trator nosso com 5+ anos ou muito rodado',
  cruzada: 'tem trator nosso e nenhum implemento',
  outra_marca: 'usa outra marca ou só compra peça aqui',
  reabordar: 'perdeu proposta há 3 meses a 2 anos',
  proposta_parada: 'tem proposta aberta esperando',
  sumiu: 'comprava peças e parou este ano',
  sem_visita: 'tem trator nosso e ninguém visitou em 6 meses',
  perfil: 'área e cultura pedem outra máquina',
  prestador: 'presta serviço agrícola (CNAE)',
};
const GRUPOS: { nome: string; icone: string; cor: string; frase: string; regras: RegraId[] }[] = [
  { nome: 'Já é cliente', icone: 'fa-handshake', cor: '#ea580c', frase: 'vender de novo ou vender mais', regras: ['renovacao', 'cruzada', 'perfil', 'prestador'] },
  { nome: 'Conquistar', icone: 'fa-flag', cor: '#7c3aed', frase: 'trazer quem usa outra marca', regras: ['outra_marca'] },
  { nome: 'Recuperar', icone: 'fa-life-ring', cor: '#0891b2', frase: 'não deixar esfriar', regras: ['proposta_parada', 'sumiu', 'sem_visita', 'reabordar'] },
];

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
  return Math.round(v);
}
function Num({ v }: { v: number }) { return <>{useConta(v).toLocaleString('pt-BR')}</>; }

export default function TopoOportunidades(p: {
  variante: VarianteTopo; clientes: ClienteIV[]; f: FiltrosTopo; muda: (x: Partial<FiltrosTopo>) => void; limpar: () => void;
  porRegra: Map<RegraId, number>; cidades: [string, number][]; vendedores: [string, number][]; hoje: string; total: number;
  /** botões (Atualizar, CSV) que ficavam no título da página */
  acoes?: React.ReactNode;
}) {
  const regras = (Object.keys(REGRAS) as RegraId[]).filter((r) => (p.porRegra.get(r) || 0) > 0).sort((a, b) => (p.porRegra.get(b) || 0) - (p.porRegra.get(a) || 0));
  const zerados = (Object.keys(REGRAS) as RegraId[]).filter((r) => !(p.porRegra.get(r) || 0));
  const soma = regras.reduce((s, r) => s + (p.porRegra.get(r) || 0), 0) || 1;
  const escolher = (r: RegraId) => { const novo = p.f.regra === r ? '' : r; p.muda({ regra: novo, pergunta: '' }); if (novo) irParaTabela(); };
  const comOp = p.clientes.filter((c) => c.oportunidades.length > 0).length;

  return (
    <div style={{ marginBottom: 16 }}>
      <style>{`
        @keyframes toEntra { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } } .to-entra { animation: toEntra .5s cubic-bezier(.2,.8,.2,1) both }
        @keyframes toBarra { from { transform: scaleX(0) } } .to-barra { transform-origin: left; animation: toBarra 1s cubic-bezier(.2,.8,.2,1) both }
        @keyframes toCresce { from { opacity: 0; transform: scale(.85) } to { opacity: 1; transform: none } } .to-cresce { animation: toCresce .6s cubic-bezier(.2,1.2,.3,1) both }
        .to-cartao { transition: transform .2s, box-shadow .2s, background .2s } .to-cartao:hover { transform: translateY(-3px); box-shadow: 0 10px 24px rgba(15,23,42,.10) }
        .to-scroll { scroll-snap-type: x mandatory; scrollbar-width: thin } .to-scroll > * { scroll-snap-align: start }
        @media (prefers-reduced-motion: reduce) { .to-entra, .to-barra, .to-cresce { animation: none !important } }
      `}</style>

      {/* frase de abertura */}
      <div className="to-entra" style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 40, fontWeight: 800, color: TX, letterSpacing: '-.03em', fontVariantNumeric: 'tabular-nums' }}><Num v={comOp} /></span>
        <span style={{ fontSize: 18, color: MU, fontWeight: 500 }}>clientes para ligar</span>
        {p.acoes && <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 8 }}>{p.acoes}</span>}
      </div>

      {p.variante === 'A' && <>
        {/* barra viva */}
        <div style={{ display: 'flex', height: 16, borderRadius: 999, overflow: 'hidden', background: SUAVE, marginBottom: 16 }}>
          {regras.map((r, i) => {
            const on = !p.f.regra || p.f.regra === r;
            return (
              <button key={r} type="button" onClick={() => escolher(r)} title={`${REGRAS[r].rotulo}: ${p.porRegra.get(r)}`} className="to-barra"
                style={{ animationDelay: `${i * 90}ms`, width: `${((p.porRegra.get(r) || 0) / soma) * 100}%`, border: 0, padding: 0, cursor: 'pointer', background: REGRAS[r].cor, opacity: on ? 1 : .25, transition: 'opacity .3s', borderRight: '2px solid #fefefe' }} />
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(210px, 100%), 1fr))', gap: 12 }}>
          {regras.map((r, i) => {
            const n = p.porRegra.get(r) || 0, on = p.f.regra === r, cor = REGRAS[r].cor;
            return (
              <button key={r} type="button" onClick={() => escolher(r)} className="to-entra to-cartao"
                style={{ animationDelay: `${i * 60}ms`, textAlign: 'left', cursor: 'pointer', fontFamily: 'inherit', borderRadius: 18, padding: 16, color: TX, minWidth: 0,
                  border: on ? `2px solid ${cor}` : `1px solid ${BD}`, background: on ? `${cor}10` : CARD, opacity: p.f.regra && !on ? .55 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ width: 44, height: 44, borderRadius: 14, background: `${cor}18`, color: cor, display: 'grid', placeItems: 'center', fontSize: 19, flexShrink: 0 }}><i className={`fas ${ICONE[r]}`} /></span>
                  <span style={{ fontSize: 32, fontWeight: 800, color: cor, lineHeight: 1 }}><Num v={n} /></span>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, marginTop: 12 }}>{REGRAS[r].rotulo}</div>
                <div style={{ fontSize: 14, color: MU, marginTop: 2, lineHeight: 1.35 }}>{FRASE[r]}</div>
                <div style={{ height: 5, borderRadius: 5, background: SUAVE, marginTop: 12, overflow: 'hidden' }}>
                  <div className="to-barra" style={{ animationDelay: `${300 + i * 60}ms`, height: '100%', width: `${(n / soma) * 100}%`, background: cor }} />
                </div>
              </button>
            );
          })}
        </div>
      </>}

      {p.variante === 'B' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(320px, 100%), 1fr))', gap: 14 }}>
          {GRUPOS.map((g, gi) => {
            const rs = g.regras.filter((r) => (p.porRegra.get(r) || 0) > 0);
            const tot = rs.reduce((s, r) => s + (p.porRegra.get(r) || 0), 0);
            const max = Math.max(1, ...rs.map((r) => p.porRegra.get(r) || 0));
            return (
              <section key={g.nome} className="to-entra" style={{ animationDelay: `${gi * 100}ms`, background: CARD, border: `1px solid ${BD}`, borderRadius: 20, padding: 18 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 14, background: g.cor, color: '#fefefe', display: 'grid', placeItems: 'center', fontSize: 20, boxShadow: `0 8px 18px ${g.cor}44` }}><i className={`fas ${g.icone}`} /></span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: TX }}>{g.nome}</div>
                    <div style={{ fontSize: 14, color: MU }}>{g.frase}</div>
                  </div>
                  <span style={{ fontSize: 30, fontWeight: 800, color: g.cor }}><Num v={tot} /></span>
                </div>
                <div style={{ display: 'grid', gap: 6 }}>
                  {rs.map((r, i) => {
                    const n = p.porRegra.get(r) || 0, on = p.f.regra === r, cor = REGRAS[r].cor;
                    return (
                      <button key={r} type="button" onClick={() => escolher(r)} className="to-cartao" title={REGRAS[r].explicacao}
                        style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', gap: 10, alignItems: 'center', border: on ? `2px solid ${cor}` : '2px solid transparent', background: on ? `${cor}10` : SUAVE, borderRadius: 14, padding: '10px 12px', cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit', color: TX }}>
                        <i className={`fas ${ICONE[r]}`} style={{ color: cor, fontSize: 16, textAlign: 'center' }} />
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 15, fontWeight: 700 }}>{REGRAS[r].rotulo}</span>
                          <span style={{ display: 'block', height: 6, borderRadius: 6, background: 'rgba(148,163,184,.25)', marginTop: 6, overflow: 'hidden' }}>
                            <span className="to-barra" style={{ display: 'block', height: '100%', width: `${(n / max) * 100}%`, background: cor, borderRadius: 6, animationDelay: `${gi * 100 + i * 80}ms` }} />
                          </span>
                        </span>
                        <b style={{ fontSize: 20, color: cor }}><Num v={n} /></b>
                      </button>
                    );
                  })}
                  {rs.length === 0 && <div style={{ fontSize: 14, color: MU }}>Nenhum cliente agora.</div>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {p.variante === 'C' && <Mosaico regras={regras} porRegra={p.porRegra} ativo={p.f.regra} onEscolher={escolher} />}
      {p.variante === 'D' && <BarraMotivos regras={regras} porRegra={p.porRegra} ativo={p.f.regra} onEscolher={escolher} />}

      {zerados.length > 0 && (
        <div style={{ fontSize: 13.5, color: MU, marginTop: 10 }}>
          <i className="fas fa-circle-info" /> Ainda sem clientes: {zerados.map((r) => REGRAS[r].rotulo).join(', ')}
          {zerados.includes('prestador') ? ' (Prestador aparece quando o CNAE dos clientes for consultado em Empresas)' : ''}.
        </div>
      )}

      {/* perguntas prontas */}
      {p.variante === 'B'
        ? <PerguntasCartoes clientes={p.clientes} hoje={p.hoje} ativa={p.f.pergunta} onEscolher={(id) => { const novo = p.f.pergunta === id ? '' : id; p.muda({ pergunta: novo, regra: '' }); if (novo) irParaTabela(); }} />
        : <PerguntaCampo clientes={p.clientes} hoje={p.hoje} ativa={p.f.pergunta} onEscolher={(id) => p.muda({ pergunta: id, regra: '' })} />}

      <BarraFiltros {...p} />
    </div>
  );
}

/**
 * Barra de motivos (variante D, José 20/10/2026: "mostra de outra forma isso aqui" — dentro da
 * Prospecção o mosaico grande pesava). Uma barra só, dividida pelos motivos na proporção de
 * cada um; o pedaço escolhido filtra a lista e abre a explicação embaixo.
 */
function BarraMotivos({ regras, porRegra, ativo, onEscolher }: { regras: RegraId[]; porRegra: Map<RegraId, number>; ativo: string; onEscolher: (r: RegraId) => void }) {
  const soma = regras.reduce((s, r) => s + (porRegra.get(r) || 0), 0) || 1;
  const sel = (ativo || '') as RegraId | '';
  return (
    <div className="to-d">
      <div className="to-d-barra">
        {regras.map((r, i) => {
          const n = porRegra.get(r) || 0, pct = (n / soma) * 100, on = !sel || sel === r;
          return (
            <button key={r} type="button" onClick={() => onEscolher(r)} title={`${REGRAS[r].rotulo}: ${n} — ${REGRAS[r].explicacao}`}
              className={`to-d-seg ${sel === r ? 'on' : ''}`} style={{ flexGrow: Math.max(pct, 3.5), ['--k' as string]: REGRAS[r].cor, animationDelay: `${i * 90}ms`, opacity: on ? 1 : 0.35 }}>
              {pct >= 7 ? <><b><Num v={n} /></b><span>{REGRAS[r].rotulo}</span></> : <b className="to-d-mini">{n}</b>}
            </button>
          );
        })}
      </div>
      <div className="to-d-legenda">
        {regras.map((r, i) => {
          const n = porRegra.get(r) || 0;
          return (
            <button key={r} type="button" onClick={() => onEscolher(r)} className={sel === r ? 'on' : ''} style={{ ['--k' as string]: REGRAS[r].cor, animationDelay: `${300 + i * 50}ms` }}>
              <i className={`fas ${ICONE[r]}`} /> {REGRAS[r].rotulo} <b>{n.toLocaleString('pt-BR')}</b> <small>{Math.round((n / soma) * 100)}%</small>
            </button>
          );
        })}
      </div>
      {sel && (
        <div key={sel} className="to-d-explica" style={{ ['--k' as string]: REGRAS[sel].cor }}>
          <span className="to-d-ic"><i className={`fas ${ICONE[sel]}`} /></span>
          <div><b>{REGRAS[sel].rotulo}: {(porRegra.get(sel) || 0).toLocaleString('pt-BR')} clientes</b><span>{FRASE[sel]}. {REGRAS[sel].explicacao}</span></div>
          <button type="button" onClick={() => onEscolher(sel)}><i className="fas fa-xmark" /> tirar filtro</button>
        </div>
      )}
      <style>{ESTILO_BARRA}</style>
    </div>
  );
}

const ESTILO_BARRA = `
  .to-d { display: grid; gap: 12px }
  .to-d-barra { display: flex; gap: 4px; height: 74px; border-radius: 18px; overflow: hidden }
  .to-d-seg { position: relative; flex-basis: 0; min-width: 34px; border: 0; padding: 0 14px; cursor: pointer; font: inherit; color: #fefefe; text-align: left; display: flex; flex-direction: column; justify-content: center; overflow: hidden; background: linear-gradient(140deg, var(--k), color-mix(in srgb, var(--k) 68%, #0f172a)); transform-origin: left; animation: toDCresce .8s cubic-bezier(.2,.8,.2,1) both; transition: opacity .3s, filter .25s }
  .to-d-seg::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.22) 50%, transparent 65%); background-size: 250% 100%; animation: toDBrilho 6s ease-in-out infinite; pointer-events: none }
  @keyframes toDCresce { from { transform: scaleX(0); opacity: 0 } }
  @keyframes toDBrilho { 0%, 70% { background-position: 160% 0 } 100% { background-position: -60% 0 } }
  .to-d-seg:hover { filter: brightness(1.1) } .to-d-seg.on { box-shadow: inset 0 -5px 0 rgba(255,255,255,.75) }
  .to-d-seg b { font-size: 26px; font-weight: 900; line-height: 1; letter-spacing: -.02em } .to-d-seg span { font-size: 13px; font-weight: 800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; opacity: .95 }
  .to-d-seg .to-d-mini { font-size: 15px; text-align: center }
  .to-d-legenda { display: flex; gap: 6px; flex-wrap: wrap }
  .to-d-legenda button { display: inline-flex; gap: 6px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 6px 12px; font: inherit; font-size: 13.5px; font-weight: 700; color: var(--portal-text, #0f172a); cursor: pointer; animation: toEntra .4s ease both; transition: background .2s, border-color .2s, color .2s }
  .to-d-legenda button i, .to-d-legenda button b { color: var(--k) } .to-d-legenda button small { color: var(--portal-text-muted, #64748b); font-weight: 600 }
  .to-d-legenda button:hover { border-color: var(--k) } .to-d-legenda button.on { background: var(--k); border-color: var(--k); color: #fefefe } .to-d-legenda button.on i, .to-d-legenda button.on b, .to-d-legenda button.on small { color: #fefefe }
  .to-d-explica { display: flex; gap: 12px; align-items: center; border-radius: 16px; padding: 12px 14px; background: color-mix(in srgb, var(--k) 8%, var(--portal-bg-card, #fefefe)); border: 1px solid color-mix(in srgb, var(--k) 30%, transparent); animation: toEntra .35s ease both }
  .to-d-explica b { display: block; font-size: 15px; color: var(--portal-text, #0f172a) } .to-d-explica span { font-size: 13.5px; color: var(--portal-text-muted, #475569) }
  .to-d-explica button { margin-left: auto; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 99px; padding: 5px 11px; font: inherit; font-size: 12.5px; font-weight: 700; color: var(--portal-text-muted, #64748b); cursor: pointer; white-space: nowrap }
  .to-d-ic { width: 42px; height: 42px; border-radius: 13px; flex-shrink: 0; display: grid; place-items: center; background: var(--k); color: #fefefe; font-size: 17px }
  @media (max-width: 760px) { .to-d-seg span { display: none } .to-d-barra { height: 54px } }
  @media (prefers-reduced-motion: reduce) { .to-d-seg, .to-d-seg::after, .to-d-legenda button, .to-d-explica { animation: none !important } }
`;

/**
 * Mosaico: um bloco por motivo, área proporcional à quantidade (com piso, para o
 * bloco pequeno não sumir). Fontes calculadas pelo tamanho REAL de cada bloco, para
 * número, nome e frase caberem sempre inteiros. Animado: entra crescendo, brilho que
 * passa, ícone flutuando, cresce no mouse, o escolhido pulsa.
 */
function Mosaico({ regras, porRegra, ativo, onEscolher }: { regras: RegraId[]; porRegra: Map<RegraId, number>; ativo: string; onEscolher: (r: RegraId) => void }) {
  type Ret = { r: RegraId; x: number; y: number; w: number; h: number };
  const caixa = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 1400, h: 420 });
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setTam({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const rets = useMemo(() => {
    const maxR = Math.sqrt(Math.max(1, ...regras.map((r) => porRegra.get(r) || 0)));
    // raiz quadrada suaviza a diferença; piso de 38% do maior garante espaço para o texto
    const peso = (r: RegraId) => Math.max(Math.sqrt(porRegra.get(r) || 0), maxR * 0.38);
    // "squarify": monta faixas escolhendo a que deixa os blocos mais perto de quadrado
    // (assim o texto cabe em qualquer largura de tela). Contas em pixels, saída em %.
    const W = tam.w, H = tam.h;
    const tot = regras.reduce((a, r) => a + peso(r), 0) || 1;
    const itens = regras.map((r) => ({ r, a: (peso(r) / tot) * W * H }));
    const out: Ret[] = [];
    let x = 0, y = 0, w = W, h = H;
    const pior = (fila: { a: number }[], lado: number) => {
      const soma = fila.reduce((a, i) => a + i.a, 0);
      return Math.max(...fila.map((i) => Math.max((lado * lado * i.a) / (soma * soma), (soma * soma) / (lado * lado * i.a))));
    };
    const resto = [...itens];
    while (resto.length) {
      const lado = Math.min(w, h);
      const fila = [resto.shift()!];
      while (resto.length && pior([...fila, resto[0]], lado) <= pior(fila, lado)) fila.push(resto.shift()!);
      const soma = fila.reduce((a, i) => a + i.a, 0);
      if (w >= h) { // faixa vertical à esquerda
        const lw = soma / h; let yy = y;
        for (const i of fila) { const ih = i.a / lw; out.push({ r: i.r, x: (x / W) * 100, y: (yy / H) * 100, w: (lw / W) * 100, h: (ih / H) * 100 }); yy += ih; }
        x += lw; w -= lw;
      } else { // faixa horizontal em cima
        const lh = soma / w; let xx = x;
        for (const i of fila) { const iw = i.a / lh; out.push({ r: i.r, x: (xx / W) * 100, y: (y / H) * 100, w: (iw / W) * 100, h: (lh / H) * 100 }); xx += iw; }
        y += lh; h -= lh;
      }
    }
    return out;
  }, [regras, porRegra, tam.w, tam.h]);

  return (
    <div ref={caixa} style={{ position: 'relative', height: 'clamp(340px, 30vw, 460px)' }}>
      <style>{`
        .mz-bloco { position: absolute; border: 0; cursor: pointer; text-align: left; overflow: hidden; color: #fefefe;
          font-family: inherit; border-radius: 22px; transition: transform .35s cubic-bezier(.2,1.3,.3,1), box-shadow .3s, opacity .3s, filter .3s }
        .mz-bloco:hover { transform: scale(1.025); z-index: 3; box-shadow: 0 18px 40px rgba(15,23,42,.28) }
        .mz-bloco::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.28) 50%, transparent 65%);
          background-size: 250% 100%; background-position: 160% 0; animation: mzBrilho 7s ease-in-out infinite; animation-delay: var(--d); pointer-events: none }
        @keyframes mzBrilho { 0%, 70% { background-position: 160% 0 } 100% { background-position: -60% 0 } }
        .mz-icone { position: absolute; animation: mzFlutua 5s ease-in-out infinite; animation-delay: var(--d); pointer-events: none }
        @keyframes mzFlutua { 0%, 100% { transform: translateY(0) rotate(0) } 50% { transform: translateY(-8px) rotate(-6deg) } }
        .mz-on { animation: mzPulso 1.8s ease-in-out infinite }
        @keyframes mzPulso { 0%, 100% { box-shadow: inset 0 0 0 3px rgba(255,255,255,.9), 0 0 0 0 rgba(15,23,42,.25) } 50% { box-shadow: inset 0 0 0 3px rgba(255,255,255,.9), 0 0 0 8px rgba(15,23,42,0) } }
        .mz-num { font-variant-numeric: tabular-nums; letter-spacing: -.02em; font-weight: 800; line-height: .95 }
        @media (prefers-reduced-motion: reduce) { .mz-bloco::after, .mz-icone, .mz-on { animation: none !important } }
      `}</style>
      {rets.map((t, i) => {
        const cor = REGRAS[t.r].cor;
        const on = ativo === t.r, apaga = !!ativo && !on;
        const wpx = (t.w / 100) * tam.w - 8, hpx = (t.h / 100) * tam.h - 8;
        const base = Math.min(wpx * 0.9, hpx);
        const num = Math.max(26, Math.min(76, base * 0.34));
        const nome = Math.max(15, Math.min(24, num * 0.4));
        const frase = Math.max(13.5, Math.min(17, num * 0.3));
        const pad = Math.max(12, Math.min(26, base * 0.09));
        const deitado = hpx < num * 2.6; // bloco baixo: tudo numa linha
        return (
          <button key={t.r} type="button" onClick={() => onEscolher(t.r)} title={`${REGRAS[t.r].rotulo}: ${REGRAS[t.r].explicacao}`}
            className={`mz-bloco to-cresce ${on ? 'mz-on' : ''}`}
            style={{ ['--d' as string]: `${i * 0.9}s`, animationDelay: `${i * 90}ms`, left: `calc(${t.x}% + 4px)`, top: `calc(${t.y}% + 4px)`, width: `calc(${t.w}% - 8px)`, height: `calc(${t.h}% - 8px)`,
              padding: pad, background: `linear-gradient(135deg, ${cor}, ${cor}d9 60%, ${cor}b3)`, filter: apaga ? 'grayscale(.75) opacity(.4)' : undefined }}>
            <i className={`fas ${ICONE[t.r]} mz-icone`} style={{ ['--d' as string]: `${i * 0.6}s`, right: pad, bottom: pad * 0.7, fontSize: Math.min(hpx * 0.42, 96), opacity: .2 }} />
            {deitado ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, height: '100%', position: 'relative' }}>
                <span className="mz-num" style={{ fontSize: num }}><Num v={porRegra.get(t.r) || 0} /></span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: nome, fontWeight: 800, lineHeight: 1.15 }}>{REGRAS[t.r].rotulo}</span>
                  <span style={{ display: 'block', fontSize: frase, opacity: .93, lineHeight: 1.3 }}>{FRASE[t.r]}</span>
                </span>
              </div>
            ) : (
              <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%', paddingRight: Math.min(hpx * 0.3, 60) }}>
                <span className="mz-num" style={{ fontSize: num }}><Num v={porRegra.get(t.r) || 0} /></span>
                <span style={{ fontSize: nome, fontWeight: 800, marginTop: num * 0.14, lineHeight: 1.15 }}>{REGRAS[t.r].rotulo}</span>
                <span style={{ fontSize: frase, opacity: .93, marginTop: 4, lineHeight: 1.35 }}>{FRASE[t.r]}</span>
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Desce suave até a tabela (já filtrada). */
export function irParaTabela() {
  setTimeout(() => document.getElementById('iv-tabela')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 120);
}

/** Perguntas prontas como um campo "Pergunte" com sugestões (A e C). Animado: ícone que brilha, lista em cascata. */
function PerguntaCampo({ clientes, hoje, ativa, onEscolher }: { clientes: ClienteIV[]; hoje: string; ativa: string; onEscolher: (id: string) => void }) {
  const [aberto, setAberto] = useState(false);
  const atual = PERGUNTAS.find((q) => q.id === ativa);
  const contagem = useMemo(() => new Map(PERGUNTAS.map((q) => [q.id, clientes.filter((c) => q.filtro(c, hoje)).length])), [clientes, hoje]);
  const max = Math.max(1, ...contagem.values());
  return (
    <div style={{ position: 'relative', marginTop: 16 }}>
      <button type="button" onClick={() => setAberto(!aberto)} className={`pg-campo ${aberto ? 'pg-aberto' : ''} ${atual ? 'pg-ativo' : ''}`}>
        <span className="pg-icone"><i className="fas fa-wand-magic-sparkles" /></span>
        <span style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
          {atual ? <><b>{atual.texto}</b> <span className="pg-qtd">{contagem.get(atual.id)} clientes</span></> : 'Pergunte: quem comprou trator há mais de 5 anos? quem parou de comprar peças?…'}
        </span>
        {atual && <span role="button" className="pg-x" onClick={(e) => { e.stopPropagation(); onEscolher(''); }}><i className="fas fa-xmark" /></span>}
        <i className="fas fa-chevron-down pg-seta" />
      </button>
      {aberto && (
        <div className="pg-lista">
          {PERGUNTAS.map((q, i) => {
            const n = contagem.get(q.id) || 0;
            return (
              <button key={q.id} type="button" onClick={() => { onEscolher(q.id); setAberto(false); irParaTabela(); }}
                className={`pg-item ${ativa === q.id ? 'on' : ''}`} style={{ animationDelay: `${i * 35}ms` }}>
                <i className="fas fa-magnifying-glass" style={{ color: MU, fontSize: 13 }} />
                <span style={{ flex: 1 }}>
                  {q.texto}
                  <span className="pg-mini"><span style={{ width: `${(n / max) * 100}%`, animationDelay: `${200 + i * 35}ms` }} /></span>
                </span>
                <b style={{ color: n ? '#dc2626' : MU, fontSize: 16 }}><Num v={n} /></b>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** Perguntas prontas como cartões que deslizam (B). */
function PerguntasCartoes({ clientes, hoje, ativa, onEscolher }: { clientes: ClienteIV[]; hoje: string; ativa: string; onEscolher: (id: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const contagem = useMemo(() => new Map(PERGUNTAS.map((q) => [q.id, clientes.filter((c) => q.filtro(c, hoje)).length])), [clientes, hoje]);
  const rolar = (d: number) => ref.current?.scrollBy({ left: d * 320, behavior: 'smooth' });
  const seta: React.CSSProperties = { width: 40, height: 40, borderRadius: '50%', border: `1px solid ${BD}`, background: CARD, cursor: 'pointer', color: TX, flexShrink: 0 };
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <b style={{ fontSize: 16, color: TX }}><i className="fas fa-wand-magic-sparkles" style={{ color: '#dc2626' }} /> Perguntas prontas</b>
        <span style={{ flex: 1 }} />
        <button type="button" style={seta} onClick={() => rolar(-1)} aria-label="Voltar"><i className="fas fa-chevron-left" /></button>
        <button type="button" style={seta} onClick={() => rolar(1)} aria-label="Avançar"><i className="fas fa-chevron-right" /></button>
      </div>
      <div ref={ref} className="to-scroll" style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 6 }}>
        {PERGUNTAS.map((q, i) => {
          const on = ativa === q.id;
          return (
            <button key={q.id} type="button" onClick={() => onEscolher(q.id)} className="to-entra to-cartao"
              style={{ animationDelay: `${i * 50}ms`, flex: '0 0 230px', textAlign: 'left', border: on ? '2px solid #dc2626' : `1px solid ${BD}`, background: on ? '#fef2f2' : CARD, borderRadius: 18, padding: 16, cursor: 'pointer', fontFamily: 'inherit', color: TX }}>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#dc2626', lineHeight: 1 }}><Num v={contagem.get(q.id) || 0} /></div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 8, lineHeight: 1.35 }}>{q.texto}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const EXEMPLOS = ['Piraju', '6075', 'Massey Ferguson', 'Fartura', 'DOUGRAS', 'Jivo 2025', 'Taquarituba', '9500S'];

/** Campo de busca animado: escreve exemplos sozinho, acende no foco, contador que sobe. */
function Busca({ valor, onMudar, total }: { valor: string; onMudar: (v: string) => void; total: number }) {
  const [foco, setFoco] = useState(false);
  const [dica, setDica] = useState('');
  useEffect(() => {
    if (foco || valor) return;
    let ex = 0, ch = 0, apagando = false;
    const t = setInterval(() => {
      const alvo = EXEMPLOS[ex % EXEMPLOS.length];
      if (!apagando) { ch++; if (ch > alvo.length + 8) apagando = true; }
      else { ch--; if (ch <= 0) { apagando = false; ex++; } }
      setDica(alvo.slice(0, Math.max(0, Math.min(ch, alvo.length))));
    }, 90);
    return () => clearInterval(t);
  }, [foco, valor]);
  return (
    <div className={`bs-caixa ${foco ? 'bs-foco' : ''}`}>
      <i className="fas fa-magnifying-glass bs-lupa" />
      <input value={valor} onChange={(e) => onMudar(e.target.value)} onFocus={() => setFoco(true)} onBlur={() => setFoco(false)}
        aria-label="Buscar cliente" className="bs-input" />
      {!valor && !foco && <span className="bs-dica">Buscar <b>{dica}</b><span className="bs-cursor">|</span></span>}
      {!valor && foco && <span className="bs-dica">Nome, CPF/CNPJ, cidade, modelo, marca, vendedor</span>}
      {valor && <span className="bs-achou"><Num v={total} /> achados</span>}
      {valor && <button type="button" className="bs-x" onClick={() => onMudar('')} aria-label="Limpar busca"><i className="fas fa-xmark" /></button>}
    </div>
  );
}

/** Seletor NOVA/CASTRO com o fundo que desliza. */
function Loja({ valor, onMudar }: { valor: string; onMudar: (v: string) => void }) {
  const ops: [string, string][] = [['', 'Todas'], ['NOVA', 'NOVA'], ['CASTRO', 'CASTRO']];
  const i = Math.max(0, ops.findIndex(([v]) => v === valor));
  return (
    <div className="lj-caixa">
      <span className="lj-luz" style={{ transform: `translateX(${i * 100}%)` }} />
      {ops.map(([v, t]) => <button key={t} type="button" onClick={() => onMudar(v)} className={valor === v ? 'on' : ''}>{t}</button>)}
    </div>
  );
}

/** Filtros com visual novo e animado (as 3 versões). */
function BarraFiltros(p: { f: FiltrosTopo; muda: (x: Partial<FiltrosTopo>) => void; limpar: () => void; cidades: [string, number][]; vendedores: [string, number][]; total: number }) {
  const tem = p.f.regra || p.f.pergunta || p.f.q || p.f.cidade || p.f.vendedor || p.f.loja;
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginTop: 14 }}>
      <style>{ESTILO_FILTROS}</style>
      <Busca valor={p.f.q} onMudar={(q) => p.muda({ q })} total={p.total} />
      <label className={`sl-caixa ${p.f.cidade ? 'on' : ''}`}>
        <i className="fas fa-location-dot" />
        <select value={p.f.cidade} onChange={(e) => { p.muda({ cidade: e.target.value }); if (e.target.value) irParaTabela(); }}>
          <option value="">Todas as cidades</option>
          {p.cidades.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
      </label>
      <label className={`sl-caixa ${p.f.vendedor ? 'on' : ''}`}>
        <i className="fas fa-user-tie" />
        <select value={p.f.vendedor} onChange={(e) => { p.muda({ vendedor: e.target.value }); if (e.target.value) irParaTabela(); }}>
          <option value="">Todos os vendedores</option>
          {p.vendedores.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
        </select>
      </label>
      <Loja valor={p.f.loja} onMudar={(loja) => p.muda({ loja })} />
      {tem && <button type="button" onClick={p.limpar} className="bt-limpar"><i className="fas fa-rotate-left" /> Limpar</button>}
    </div>
  );
}

/** Faixa logo acima da tabela: o que está sendo mostrado, com cor do motivo e ✕ para voltar. */
export function FaixaResultado({ f, total, limpar }: { f: FiltrosTopo; total: number; limpar: () => void }) {
  const partes: string[] = [];
  if (f.regra) partes.push(REGRAS[f.regra].rotulo);
  const perg = PERGUNTAS.find((q) => q.id === f.pergunta);
  if (perg) partes.push(perg.texto);
  if (f.cidade) partes.push(f.cidade);
  if (f.vendedor) partes.push(f.vendedor);
  if (f.loja) partes.push(`só ${f.loja}`);
  if (f.q) partes.push(`"${f.q}"`);
  const cor = f.regra ? REGRAS[f.regra].cor : '#dc2626';
  const claro = partes.length === 0; // sem filtro: faixa clara com a linha colorida dos motivos
  return (
    <div key={partes.join('|')} className={`fx-faixa ${claro ? 'fx-clara' : ''}`} style={{ ['--c' as string]: cor }}>
      <span className="fx-num"><Num v={total} /></span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <b style={{ fontSize: 16 }}>{partes.length ? partes.join(' · ') : 'Todos os clientes com motivo para ligar'}</b>
        {f.regra && <span style={{ display: 'block', fontSize: 14, opacity: .85 }}>{REGRAS[f.regra].explicacao}</span>}
      </span>
      {partes.length > 0 && <button type="button" onClick={limpar} className="fx-x"><i className="fas fa-xmark" /> ver todos</button>}
    </div>
  );
}

const ESTILO_FILTROS = `
  .bs-caixa { position: relative; flex: 1 1 340px; height: 54px; border-radius: 18px; background: ${SUAVE}; border: 1px solid ${BD};
    display: flex; align-items: center; transition: box-shadow .35s, border-color .35s, background .35s, transform .35s }
  .bs-caixa:hover { border-color: #fca5a5 }
  .bs-foco { background: ${CARD}; border-color: #dc2626; box-shadow: 0 0 0 5px rgba(220,38,38,.12), 0 12px 28px rgba(15,23,42,.10); transform: translateY(-1px) }
  .bs-lupa { position: absolute; left: 18px; color: ${MU}; font-size: 17px; transition: color .3s, transform .4s cubic-bezier(.2,1.4,.3,1) }
  .bs-foco .bs-lupa { color: #dc2626; transform: scale(1.18) rotate(-12deg) }
  .bs-input { position: absolute; inset: 0; width: 100%; border: 0; background: transparent; outline: none; padding: 0 150px 0 50px; font-size: 16.5px; color: ${TX}; font-family: inherit }
  .bs-dica { position: absolute; left: 50px; color: ${MU}; font-size: 16.5px; pointer-events: none; white-space: nowrap; overflow: hidden; max-width: calc(100% - 70px) }
  .bs-dica b { color: ${TX}; font-weight: 600 }
  .bs-cursor { color: #dc2626; animation: bsPisca 1s steps(1) infinite; margin-left: 1px } @keyframes bsPisca { 50% { opacity: 0 } }
  .bs-achou { position: absolute; right: 54px; font-size: 14px; font-weight: 700; color: #dc2626; background: #fee2e2; border-radius: 999px; padding: 4px 10px; animation: bsPop .35s cubic-bezier(.2,1.5,.3,1) both }
  .bs-x { position: absolute; right: 12px; width: 32px; height: 32px; border-radius: 50%; border: 0; background: ${CARD}; color: ${MU}; cursor: pointer; animation: bsPop .3s cubic-bezier(.2,1.5,.3,1) both; transition: transform .2s, color .2s }
  .bs-x:hover { transform: rotate(90deg); color: #dc2626 }
  @keyframes bsPop { from { transform: scale(0); opacity: 0 } to { transform: none; opacity: 1 } }
  .sl-caixa { position: relative; display: inline-flex; align-items: center; gap: 8px; height: 54px; border-radius: 18px; background: ${SUAVE}; border: 1px solid ${BD}; padding: 0 6px 0 16px; transition: all .3s; cursor: pointer }
  .sl-caixa:hover { border-color: #fca5a5; transform: translateY(-1px) } .sl-caixa i { color: ${MU}; transition: color .3s, transform .3s }
  .sl-caixa.on { background: #fef2f2; border-color: #dc2626 } .sl-caixa.on i { color: #dc2626; transform: scale(1.15) }
  .sl-caixa select { border: 0; background: transparent; height: 100%; font-size: 15.5px; color: ${TX}; outline: none; cursor: pointer; font-family: inherit; max-width: 230px }
  .lj-caixa { position: relative; display: grid; grid-template-columns: repeat(3, 1fr); height: 54px; padding: 5px; border-radius: 18px; background: ${SUAVE}; border: 1px solid ${BD} }
  .lj-luz { position: absolute; top: 5px; bottom: 5px; left: 5px; width: calc((100% - 10px) / 3); border-radius: 14px; background: ${CARD}; box-shadow: 0 2px 8px rgba(15,23,42,.14); transition: transform .45s cubic-bezier(.3,1.4,.4,1) }
  .lj-caixa button { position: relative; z-index: 1; border: 0; background: transparent; padding: 0 16px; font-size: 15px; font-weight: 700; color: ${MU}; cursor: pointer; font-family: inherit; transition: color .3s }
  .lj-caixa button.on { color: ${TX} }
  .bt-limpar { height: 54px; border-radius: 18px; border: 0; background: #0f172a; color: #fefefe; padding: 0 18px; font-size: 15.5px; font-weight: 700; cursor: pointer; font-family: inherit; animation: bsPop .35s cubic-bezier(.2,1.5,.3,1) both; transition: transform .2s }
  .bt-limpar:hover { transform: translateY(-2px) } .bt-limpar:hover i { animation: btGira .5s ease }
  @keyframes btGira { to { transform: rotate(-360deg) } }
  .pg-campo { width: 100%; display: flex; align-items: center; gap: 12px; height: 58px; border-radius: 18px; border: 1px solid ${BD}; background: ${CARD}; padding: 0 18px;
    cursor: pointer; font-family: inherit; font-size: 16.5px; color: ${MU}; box-shadow: 0 2px 10px rgba(15,23,42,.05); transition: box-shadow .3s, border-color .3s, transform .3s }
  .pg-campo:hover { border-color: #fca5a5; transform: translateY(-1px); box-shadow: 0 10px 24px rgba(15,23,42,.08) }
  .pg-ativo { border-color: #dc2626; color: ${TX} }
  .pg-icone { width: 36px; height: 36px; border-radius: 12px; display: grid; place-items: center; color: #fefefe; background: linear-gradient(135deg, #f87171, #b91c1c); animation: pgBrilha 2.8s ease-in-out infinite; flex-shrink: 0 }
  @keyframes pgBrilha { 0%, 100% { transform: rotate(0) scale(1); box-shadow: 0 0 0 0 rgba(220,38,38,.4) } 50% { transform: rotate(-10deg) scale(1.08); box-shadow: 0 0 0 8px rgba(220,38,38,0) } }
  .pg-seta { color: ${MU}; transition: transform .35s } .pg-aberto .pg-seta { transform: rotate(180deg) }
  .pg-qtd { color: #dc2626; font-weight: 700; margin-left: 6px }
  .pg-x { color: ${MU}; padding: 6px; border-radius: 50%; transition: transform .2s, color .2s } .pg-x:hover { transform: rotate(90deg); color: #dc2626 }
  .pg-lista { position: absolute; z-index: 30; left: 0; right: 0; top: 64px; background: ${CARD}; border: 1px solid ${BD}; border-radius: 18px; box-shadow: 0 24px 50px rgba(15,23,42,.18);
    padding: 8px; display: grid; grid-template-columns: repeat(auto-fill, minmax(min(360px, 100%), 1fr)); gap: 4px; animation: pgAbre .3s cubic-bezier(.2,1.2,.3,1) both; transform-origin: top }
  @keyframes pgAbre { from { opacity: 0; transform: translateY(-8px) scaleY(.96) } to { opacity: 1; transform: none } }
  .pg-item { display: flex; align-items: center; gap: 12px; border: 0; background: transparent; border-radius: 14px; padding: 12px 14px; cursor: pointer; font-family: inherit; font-size: 15.5px; color: ${TX}; text-align: left;
    animation: toEntra .35s cubic-bezier(.2,.8,.2,1) both; transition: background .2s, transform .2s }
  .pg-item:hover { background: ${SUAVE}; transform: translateX(4px) } .pg-item.on { background: #fee2e2 }
  .pg-mini { display: block; height: 4px; border-radius: 4px; background: rgba(148,163,184,.25); margin-top: 6px; overflow: hidden }
  .pg-mini span { display: block; height: 100%; background: #f87171; border-radius: 4px; transform-origin: left; animation: toBarra .8s cubic-bezier(.2,.8,.2,1) both }
  .fx-faixa { display: flex; align-items: center; gap: 16px; padding: 14px 18px; margin-bottom: 10px; border-radius: 18px; color: #fefefe; scroll-margin-top: 90px;
    background: linear-gradient(120deg, var(--c), color-mix(in srgb, var(--c) 70%, #000)); box-shadow: 0 10px 24px color-mix(in srgb, var(--c) 35%, transparent);
    animation: fxEntra .55s cubic-bezier(.2,1.2,.3,1) both }
  @keyframes fxEntra { from { opacity: 0; transform: translateY(-10px) scale(.98) } to { opacity: 1; transform: none } }
  .fx-clara { background: ${CARD}; color: ${TX}; border: 1px solid ${BD}; box-shadow: 0 4px 14px rgba(15,23,42,.06); position: relative; overflow: hidden; padding-top: 18px }
  .fx-clara::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 5px; background: linear-gradient(90deg, #7c3aed, #475569, #ea580c, #be185d, #dc2626, #ca8a04, #16a34a, #7c3aed); background-size: 200% 100%; animation: fxCores 6s linear infinite }
  @keyframes fxCores { to { background-position: -200% 0 } }
  .fx-clara .fx-num { color: #dc2626 }
  .fx-num { font-size: 34px; font-weight: 800; letter-spacing: -.02em; font-variant-numeric: tabular-nums }
  .fx-x { border: 0; border-radius: 12px; background: rgba(255,255,255,.2); color: #fefefe; padding: 9px 14px; font-size: 14.5px; font-weight: 700; cursor: pointer; font-family: inherit; transition: background .2s, transform .2s }
  .fx-x:hover { background: rgba(255,255,255,.32); transform: translateY(-1px) }
  .iv-lin-tab { animation: toEntra .4s cubic-bezier(.2,.8,.2,1) both; transition: background .15s }
  @media (prefers-reduced-motion: reduce) { .bs-caixa, .pg-icone, .pg-lista, .pg-item, .fx-faixa, .iv-lin-tab, .bs-cursor { animation: none !important; transition: none !important } }
`;
