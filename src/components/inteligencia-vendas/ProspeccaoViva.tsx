'use client';
// =============================================================================
// Prospecção VIVA — 3 opções para a página de teste (José, 19/10/2026: "pode remover tudo
// que está em testes e me dê algo mais dinâmico, interativo e animado"). Mesmos dados da
// rota /api/inteligencia-vendas/prospeccao (Carteira · Recuperar · Novos · Território),
// sempre com o Tratorilson explicando.
//   A · Radar        — varredura girando; cada oportunidade é um ponto que acende
//   B · Jornada      — o Tratorilson apresenta os 4 caminhos, passo a passo (ou sozinho)
//   C · Fila do dia  — cartas para arrastar: direita = vou ligar, esquerda = depois
// =============================================================================
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import type { Fala, GrupoId, ResumoProspeccao } from '@/lib/inteligencia-vendas/prospeccao';
import { cidadeBonita } from '@/lib/inteligencia-vendas/prospeccao';
import { apiGet } from './ui';
import { reaisCurto } from './colunasExecutivas';
import FichaExecutiva from './FichaExecutiva';

export type Dados = ResumoProspeccao & { falas: { abertura: string; grupos: Record<GrupoId, Fala> } };
const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)';
const GRUPOS: { id: GrupoId; nome: string; cor: string; icone: string }[] = [
  { id: 'carteira', nome: 'Carteira', cor: '#dc2626', icone: 'fa-address-book' },
  { id: 'recuperar', nome: 'Recuperar', cor: '#d97706', icone: 'fa-rotate-left' },
  { id: 'novos', nome: 'Novos clientes', cor: '#16a34a', icone: 'fa-user-plus' },
  { id: 'territorio', nome: 'Território', cor: '#2563eb', icone: 'fa-map-location-dot' },
];
const G = (id: GrupoId) => GRUPOS.find((g) => g.id === id)!;
const n = (v: number) => Math.round(v).toLocaleString('pt-BR');
const nomeCurto = (s: string) => {
  const ps = s.split(/\s+/).filter(Boolean).slice(0, 3);
  while (ps.length > 1 && /^(da|de|do|das|dos|e)$/i.test(ps[ps.length - 1])) ps.pop();
  return ps.map((p) => (p.length > 2 ? p[0] + p.slice(1).toLowerCase() : p.toLowerCase())).join(' ');
};
const reduzido = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ── dados ────────────────────────────────────────────────────────────────────
export function useProspeccao(inicial?: Dados) {
  const [d, setD] = useState<Dados | null>(inicial ?? null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    if (inicial) return;
    let vivo = true;
    apiGet<Dados>('/api/inteligencia-vendas/prospeccao').then((x) => { if (vivo) setD(x); }).catch((e) => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [inicial]);
  return { d, erro };
}

/** Uma oportunidade de qualquer caminho, no mesmo formato (ponto do radar, cartão, carta). */
export interface Item {
  id: string; grupo: GrupoId; titulo: string; sub: string; porque: string; acao: string; selo: string;
  peso: number;    // 0..1 — quanto maior, mais perto do centro do radar
  tamanho: number; // 0..1 — tamanho do ponto
  cliente?: ClienteIV; href?: string;
}

export function montarItens(d: Dados): Item[] {
  const out: Item[] = [];
  for (const c of d.carteira.top) {
    const o = c.oportunidades[0];
    out.push({ id: `c-${c.chave}`, grupo: 'carteira', titulo: nomeCurto(c.nome), sub: `${cidadeBonita(c.cidade)}${c.vendedor ? ` · ${nomeCurto(c.vendedor).split(' ')[0]}` : ''}`,
      porque: o ? `${o.titulo}. ${o.porque}` : 'Cliente da carteira.', acao: o ? `Ofereça ${o.oferecer.replace(/^./, (x) => x.toLowerCase())}.` : 'Faça uma ligação.', selo: `nota ${c.score}`,
      peso: c.score / 100, tamanho: Math.min(1, c.score / 70), cliente: c });
  }
  const maxV = Math.max(1, ...d.recuperar.topParados.map((p) => p.valor || 0));
  for (const p of d.recuperar.topParados) {
    out.push({ id: `p-${p.origem}-${p.id}`, grupo: 'recuperar', titulo: nomeCurto(p.cliente), sub: p.oque || p.fase,
      porque: `${p.detalhe || p.fase}${p.dias != null ? ` — parado há ${p.dias} dias` : ''}${p.vendedor ? ` com ${nomeCurto(p.vendedor)}` : ''}.`,
      acao: 'Ligue para fechar ou registrar o motivo da perda.', selo: p.valor ? reaisCurto(p.valor) : 'sem valor',
      peso: p.gravidade / 3.2, tamanho: (p.valor || 0) / maxV, href: '/inteligencia-vendas/retorno' });
  }
  for (const c of d.recuperar.topReabordar) {
    const o = c.oportunidades.find((x) => x.regra === 'reabordar') || c.oportunidades[0];
    out.push({ id: `r-${c.chave}`, grupo: 'recuperar', titulo: nomeCurto(c.nome), sub: cidadeBonita(c.cidade), porque: o ? `${o.titulo}. ${o.porque}` : 'Perdeu proposta.',
      acao: 'Pergunte se a máquina que ele comprou está atendendo.', selo: 'reabordar', peso: 0.45, tamanho: 0.4, cliente: c });
  }
  const maxA = Math.max(1, ...d.novos.propriedades.map((p) => p.areaHa));
  for (const p of d.novos.propriedades) {
    out.push({ id: `n-${p.cod}`, grupo: 'novos', titulo: `${n(p.areaHa)} ha${p.cultura ? ` de ${p.cultura.toLowerCase()}` : ''}`, sub: p.municipio,
      porque: `Propriedade grande no CAR sem nenhum cliente nosso ligado${p.investimento ? `, que pegou ${reaisCurto(p.investimento)} de crédito para investir em 3 anos` : ''}.`,
      acao: 'Descubra quem é o dono numa visita na região.', selo: p.investimento ? reaisCurto(p.investimento) : `${n(p.areaHa)} ha`,
      peso: 0.25 + 0.6 * (p.areaHa / maxA), tamanho: p.areaHa / maxA, href: '/dashboard-agro?tab=prospeccao' });
  }
  for (const m of d.territorio.municipios) {
    out.push({ id: `t-${m.nome}`, grupo: 'territorio', titulo: m.nome, sub: m.cultura || 'várias culturas',
      porque: `Nota de foco ${m.foco}: ${n(m.areaHa)} ha plantados, ${n(m.clientes)} clientes e ${n(m.tratores)} tratores nossos.`,
      acao: m.linhas[0] ? `Vender lá: ${m.linhas[0].toLowerCase()}.` : 'Vale um dia de visitas.', selo: `foco ${m.foco}`,
      peso: m.foco / 100, tamanho: m.foco / 100, href: '/inteligencia-vendas/municipios' });
  }
  return out;
}

function chave(d: Dados, g: GrupoId): { num: number; texto: string; sub: string } {
  if (g === 'carteira') return { num: d.carteira.comMotivo, texto: n(d.carteira.comMotivo), sub: 'clientes com motivo para ligar' };
  if (g === 'recuperar') return { num: d.recuperar.parados, texto: n(d.recuperar.parados), sub: `parados · ${reaisCurto(d.recuperar.valorParado)}` };
  if (g === 'novos') return { num: d.novos.propriedades.length, texto: n(d.novos.propriedades.length), sub: 'propriedades grandes sem cliente nosso' };
  const m = d.territorio.municipios[0];
  return { num: m?.foco || 0, texto: m?.nome || '—', sub: m ? `foco ${m.foco} · 1º lugar` : 'sem dados' };
}

// ── peças animadas ──────────────────────────────────────────────────────────
function useContador(alvo: number, ms = 1000) {
  const [v, setV] = useState(0);
  const de = useRef(0);
  useEffect(() => {
    if (reduzido()) { const t = setTimeout(() => setV(alvo), 0); de.current = alvo; return () => clearTimeout(t); }
    const ini = performance.now(), o = de.current;
    let raf = 0;
    const p = (t: number) => { const k = Math.min(1, (t - ini) / ms); setV(o + (alvo - o) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(p); else de.current = alvo; };
    raf = requestAnimationFrame(p);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return v;
}
function Conta({ v }: { v: number }) { return <>{n(useContador(v))}</>; }

function Escrevendo({ texto, aoTerminar }: { texto: string; aoTerminar?: () => void }) {
  const [i, setI] = useState(0);
  const fim = useRef(aoTerminar);
  useEffect(() => { fim.current = aoTerminar; });
  useEffect(() => {
    if (reduzido()) { const t = setTimeout(() => { setI(texto.length); fim.current?.(); }, 0); return () => clearTimeout(t); }
    let k = 0;
    const t = setInterval(() => { k += 3; setI(Math.min(texto.length, k)); if (k >= texto.length) { clearInterval(t); fim.current?.(); } }, 16);
    return () => clearInterval(t);
  }, [texto]);
  return <>{texto.slice(0, i)}{i < texto.length && <span className="pv-cursor">▍</span>}</>;
}

function Tratorilson({ children, cor = '#0369a1', grande }: { children: ReactNode; cor?: string; grande?: boolean }) {
  return (
    <div className={`pv-tl ${grande ? 'pv-tl-g' : ''}`} style={{ ['--k' as string]: cor }}>
      <span className="pv-rosto"><i className="fas fa-robot" /></span>
      <div className="pv-balao">{children}</div>
    </div>
  );
}

function BotaoItem({ it, onFicha, children, className }: { it: Item; onFicha: (c: ClienteIV) => void; children: ReactNode; className: string }) {
  if (it.cliente) return <button type="button" className={className} onClick={() => onFicha(it.cliente!)}>{children}</button>;
  return <a className={className} href={it.href || '#'}>{children}</a>;
}

function Carregando({ erro }: { erro: string }) {
  return (
    <div className="pv-tela"><style>{ESTILO}</style>
      {erro ? <div className="pv-erro">{erro}</div> : (
        <Tratorilson grande><b>Juntando a carteira, os negócios parados, as propriedades e os municípios…</b><div style={{ fontSize: 13, color: MU, marginTop: 4 }}>Na primeira vez leva uns 20 segundos; depois abre na hora.</div></Tratorilson>
      )}
    </div>
  );
}

// ── A · RADAR ────────────────────────────────────────────────────────────────
const VOLTA = 7; // segundos por volta da varredura
const INICIO: Record<GrupoId, number> = { carteira: 0, recuperar: 90, novos: 180, territorio: 270 }; // graus a partir do topo, sentido horário

export function ProspeccaoRadar({ inicial }: { inicial?: Dados }) {
  const { d, erro } = useProspeccao(inicial);
  const [grupo, setGrupo] = useState<GrupoId | null>(null);
  const [sel, setSel] = useState<Item | null>(null);
  const [hover, setHover] = useState<{ it: Item; x: number; y: number } | null>(null);
  const [ficha, setFicha] = useState<ClienteIV | null>(null);
  const itens = useMemo(() => (d ? montarItens(d) : []), [d]);
  const pontos = useMemo(() => {
    const porG = new Map<GrupoId, Item[]>();
    for (const it of itens) porG.set(it.grupo, [...(porG.get(it.grupo) || []), it]);
    const out: { it: Item; x: number; y: number; ang: number; r: number }[] = [];
    for (const [g, lista] of porG) {
      // distância pelo RANKING dentro do caminho (as notas se parecem e empilhavam num arco);
      // ângulo espalhado com a razão áurea para não formar fileira
      const ordem = [...lista].sort((a, b) => b.peso - a.peso);
      lista.forEach((it) => {
        const rank = ordem.indexOf(it), frac = lista.length > 1 ? rank / (lista.length - 1) : 0.5;
        const ang = INICIO[g] + 10 + ((rank * 0.618034) % 1) * 70;
        const raio = 55 + frac * 195;
        const rad = ((ang - 90) * Math.PI) / 180;
        out.push({ it, ang, r: 5 + it.tamanho * 8, x: 300 + raio * Math.cos(rad), y: 300 + raio * Math.sin(rad) });
      });
    }
    return out;
  }, [itens]);
  if (!d) return <Carregando erro={erro} />;
  const ativo = sel ? G(sel.grupo) : grupo ? G(grupo) : null;
  return (
    <div className="pv-tela">
      <style>{ESTILO}</style>
      <div className="pv-radar-grade">
        <div className="pv-radar-caixa">
          <svg viewBox="0 0 600 600" className="pv-radar" onMouseLeave={() => setHover(null)}>
            <defs>
              <radialGradient id="pvFundo"><stop offset="0" stopColor="#0ea5e9" stopOpacity=".10" /><stop offset="1" stopColor="#0ea5e9" stopOpacity="0" /></radialGradient>
              <linearGradient id="pvVarre" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#38bdf8" stopOpacity="0" /><stop offset="1" stopColor="#38bdf8" stopOpacity=".45" /></linearGradient>
            </defs>
            <circle cx="300" cy="300" r="270" fill="url(#pvFundo)" />
            {GRUPOS.map((g) => {
              const a0 = ((INICIO[g.id] - 90) * Math.PI) / 180, a1 = ((INICIO[g.id] + 90 - 90) * Math.PI) / 180;
              const on = !grupo || grupo === g.id;
              return (
                <path key={g.id} d={`M300,300 L${300 + 270 * Math.cos(a0)},${300 + 270 * Math.sin(a0)} A270,270 0 0 1 ${300 + 270 * Math.cos(a1)},${300 + 270 * Math.sin(a1)} Z`}
                  fill={g.cor} opacity={grupo === g.id ? 0.1 : 0.035} className="pv-quad" style={{ cursor: 'pointer', opacity: on ? undefined : 0.01 }}
                  onClick={() => { setSel(null); setGrupo(grupo === g.id ? null : g.id); }} />
              );
            })}
            {[70, 140, 205, 270].map((r) => <circle key={r} cx="300" cy="300" r={r} fill="none" stroke="rgba(100,116,139,.22)" strokeDasharray="3 5" />)}
            <line x1="30" y1="300" x2="570" y2="300" stroke="rgba(100,116,139,.18)" /><line x1="300" y1="30" x2="300" y2="570" stroke="rgba(100,116,139,.18)" />
            <g className="pv-varredura" style={{ animationDuration: `${VOLTA}s` }}>
              <path d="M300,300 L300,30 A270,270 0 0 1 435,66 Z" fill="url(#pvVarre)" />
              <line x1="300" y1="300" x2="300" y2="30" stroke="#38bdf8" strokeWidth="2" opacity=".8" />
            </g>
            {GRUPOS.map((g) => {
              const a = ((INICIO[g.id] + 45 - 90) * Math.PI) / 180;
              return <text key={g.id} x={300 + 292 * Math.cos(a)} y={300 + 292 * Math.sin(a)} textAnchor="middle" dominantBaseline="middle" className="pv-rotulo" fill={g.cor}>{g.nome}</text>;
            })}
            {pontos.map((p, i) => {
              const dim = (grupo && p.it.grupo !== grupo) || (sel && sel.id !== p.it.id);
              const cor = G(p.it.grupo).cor;
              return (
                <g key={p.it.id} className="pv-ponto" style={{ opacity: dim ? 0.18 : 1, animationDelay: `${i * 25}ms` }}
                  onMouseEnter={() => setHover({ it: p.it, x: p.x, y: p.y })} onClick={() => { setSel(p.it); setGrupo(p.it.grupo); }}>
                  <circle cx={p.x} cy={p.y} r={p.r + 6} fill={cor} className="pv-ping" style={{ animationDuration: `${VOLTA}s`, animationDelay: `${(p.ang / 360) * VOLTA}s` }} />
                  <circle cx={p.x} cy={p.y} r={sel?.id === p.it.id ? p.r + 3 : p.r} fill={cor} stroke="#fefefe" strokeWidth="2" style={{ cursor: 'pointer', transition: 'r .2s' }} />
                </g>
              );
            })}
            <circle cx="300" cy="300" r="26" fill="#0369a1" /><foreignObject x="280" y="280" width="40" height="40"><div style={{ width: 40, height: 40, display: 'grid', placeItems: 'center', color: '#fefefe', fontSize: 18 }}><i className="fas fa-robot" /></div></foreignObject>
          </svg>
          {hover && (
            <div className="pv-dica" style={{ left: `${(hover.x / 600) * 100}%`, top: `${(hover.y / 600) * 100}%`, ['--k' as string]: G(hover.it.grupo).cor }}>
              <small>{G(hover.it.grupo).nome}</small><b>{hover.it.titulo}</b><span>{hover.it.sub}</span><em>{hover.it.selo}</em>
            </div>
          )}
          <div className="pv-legenda">
            {GRUPOS.map((g) => {
              const k = chave(d, g.id);
              return (
                <button key={g.id} type="button" className={grupo === g.id ? 'on' : ''} style={{ ['--k' as string]: g.cor }} onClick={() => { setSel(null); setGrupo(grupo === g.id ? null : g.id); }}>
                  <i className={`fas ${g.icone}`} /><span><b>{g.id === 'territorio' ? k.texto : <Conta v={k.num} />}</b><small>{g.nome}</small></span>
                </button>
              );
            })}
          </div>
        </div>
        <aside className="pv-lado">
          <Tratorilson cor={ativo?.cor} grande>
            {sel ? (
              <div key={sel.id}>
                <div className="pv-tl-nome" style={{ color: G(sel.grupo).cor }}><i className={`fas ${G(sel.grupo).icone}`} /> {G(sel.grupo).nome} · {sel.selo}</div>
                <div className="pv-sel-tit">{sel.titulo}</div>
                <div style={{ fontSize: 13.5, color: MU, marginBottom: 6 }}>{sel.sub}</div>
                <div style={{ fontSize: 14.5, lineHeight: 1.55, color: TX }}><Escrevendo texto={sel.porque} /></div>
                <div className="pv-acao"><i className="fas fa-hand-point-right" /> {sel.acao}</div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  {sel.cliente ? <button type="button" className="pv-bt pv-bt-pri" onClick={() => setFicha(sel.cliente!)}><i className="fas fa-id-card" /> Abrir ficha</button>
                    : <a className="pv-bt pv-bt-pri" href={sel.href}><i className="fas fa-arrow-right" /> Ver na tela completa</a>}
                  <button type="button" className="pv-bt" onClick={() => setSel(null)}>Voltar</button>
                </div>
              </div>
            ) : grupo ? (
              <div key={grupo}>
                <div className="pv-tl-nome" style={{ color: G(grupo).cor }}><i className={`fas ${G(grupo).icone}`} /> {d.falas.grupos[grupo].titulo}</div>
                <div style={{ fontSize: 14.5, lineHeight: 1.55, color: TX }}><Escrevendo texto={d.falas.grupos[grupo].texto} /></div>
                <div className="pv-acao"><i className="fas fa-hand-point-right" /> {d.falas.grupos[grupo].dica}</div>
                <div style={{ fontSize: 12.5, color: MU, marginTop: 8 }}>Clique num ponto do radar para eu explicar aquele.</div>
              </div>
            ) : (
              <div>
                <div className="pv-tl-nome">Tratorilson · como ler o radar</div>
                <div style={{ fontSize: 14.5, lineHeight: 1.55, color: TX }}><Escrevendo texto={`${d.falas.abertura} Cada ponto é uma oportunidade: quanto mais perto do centro, mais quente; quanto maior, mais vale. Clique num quadrante ou num ponto.`} /></div>
              </div>
            )}
          </Tratorilson>
          {!sel && (
            <div className="pv-lista" key={grupo || 'todos'}>
              {itens.filter((it) => !grupo || it.grupo === grupo).sort((a, b) => b.peso - a.peso).slice(0, 7).map((it, i) => (
                <button key={it.id} type="button" className="pv-li" style={{ ['--k' as string]: G(it.grupo).cor, animationDelay: `${i * 50}ms` }} onClick={() => { setSel(it); setGrupo(it.grupo); }}>
                  <span className="pv-li-ponto" /><span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}><b>{it.titulo}</b><small>{it.sub}</small></span><em>{it.selo}</em>
                </button>
              ))}
            </div>
          )}
        </aside>
      </div>
      {ficha && <FichaExecutiva c={ficha} modo="abas" onFechar={() => setFicha(null)} />}
    </div>
  );
}

// ── B · JORNADA ──────────────────────────────────────────────────────────────
const TEMPO_PASSO = 15; // s no automático

export function ProspeccaoJornada({ inicial, aoMudar }: { inicial?: Dados; aoMudar?: (g: GrupoId) => void }) {
  const { d, erro } = useProspeccao(inicial);
  const [passo, setPasso] = useState(0);
  const [dir, setDir] = useState(1);
  const [auto, setAuto] = useState(false);
  const [falou, setFalou] = useState(false);
  const [ficha, setFicha] = useState<ClienteIV | null>(null);
  const itens = useMemo(() => (d ? montarItens(d) : []), [d]);
  const ir = useCallback((p: number) => { setDir(p >= passo ? 1 : -1); setFalou(false); setPasso(((p % 4) + 4) % 4); }, [passo]);
  useEffect(() => {
    const t = (e: KeyboardEvent) => { if (e.key === 'ArrowRight') ir(passo + 1); if (e.key === 'ArrowLeft') ir(passo - 1); };
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t);
  }, [ir, passo]);
  useEffect(() => { if (!auto) return; const t = setTimeout(() => ir(passo + 1), TEMPO_PASSO * 1000); return () => clearTimeout(t); }, [auto, passo, ir]);
  // avisa a página (os módulos de baixo acompanham o caminho escolhido)
  const avisar = useRef(aoMudar);
  useEffect(() => { avisar.current = aoMudar; });
  useEffect(() => { avisar.current?.(GRUPOS[passo].id); }, [passo]);
  if (!d) return <Carregando erro={erro} />;
  const g = GRUPOS[passo];
  const k = chave(d, g.id);
  const fala = d.falas.grupos[g.id];
  const cards = itens.filter((it) => it.grupo === g.id).sort((a, b) => b.peso - a.peso).slice(0, 6);
  return (
    <div className="pv-tela">
      <style>{ESTILO}</style>
      <div className="pv-jor-topo">
        <Tratorilson grande><div className="pv-tl-nome">Tratorilson apresenta · prospecção de hoje</div><div style={{ fontSize: 15.5, lineHeight: 1.55, color: TX }}>{d.falas.abertura}</div></Tratorilson>
        <button type="button" className={`pv-bt ${auto ? 'pv-bt-pri' : ''}`} onClick={() => setAuto((x) => !x)}><i className={`fas ${auto ? 'fa-pause' : 'fa-play'}`} /> {auto ? 'Pausar' : 'Apresentação automática'}</button>
      </div>
      {/* bolinhas: cada caminho é uma bolinha; a do caminho atual se abre e mostra o nome */}
      <div className="pv-bolinhas" role="tablist" aria-label="Caminhos da prospecção">
        <span className="pv-bol-trilho"><span style={{ width: `${(passo / (GRUPOS.length - 1)) * 100}%`, background: g.cor }} /></span>
        {GRUPOS.map((x, i) => {
          const kx = chave(d, x.id);
          return (
            <button key={x.id} type="button" role="tab" aria-selected={i === passo} title={`${x.nome} · ${kx.texto} ${kx.sub}`}
              className={`pv-bol ${i === passo ? 'on' : ''} ${i < passo ? 'feito' : ''}`} style={{ ['--k' as string]: x.cor }} onClick={() => ir(i)}>
              <span className="pv-bol-ic"><i className={`fas ${i < passo ? 'fa-check' : x.icone}`} /></span>
              <span className="pv-bol-nome">{x.nome}</span>
              {i === passo && auto && <span className="pv-bol-tempo" key={`${passo}-a`} style={{ animationDuration: `${TEMPO_PASSO}s` }} />}
            </button>
          );
        })}
      </div>
      <div key={passo} className="pv-slide" style={{ ['--k' as string]: g.cor, ['--d' as string]: `${dir * 60}px` }}>
        <div className="pv-hero">
          <i className={`fas ${g.icone} pv-hero-fundo`} />
          <div className="pv-hero-topo">
            <span className="pv-hero-ic"><i className={`fas ${g.icone}`} /></span>
            <span className="pv-hero-etapa">Caminho {passo + 1} de 4 · {g.nome}</span>
          </div>
          <h2 className="pv-hero-perg">{fala.titulo}</h2>
          <div className="pv-hero-num"><b>{g.id === 'territorio' ? k.texto : <Conta v={k.num} />}</b><span>{k.sub}</span></div>
          <div className="pv-hero-fala">
            <span className="pv-rosto pv-rosto-p"><i className="fas fa-robot" /></span>
            <p><small>Tratorilson explica</small><Escrevendo texto={fala.texto} aoTerminar={() => setFalou(true)} /></p>
          </div>
          {falou && <div className="pv-hero-dica pv-pop"><i className="fas fa-lightbulb" /><span><small>Por onde começar</small>{fala.dica}</span></div>}
        </div>
        {/* ranking: o 1º em destaque; a barra mostra quanto cada um vale perto do 1º */}
        <div className="pv-rank">
          <div className="pv-rank-cab"><i className="fas fa-ranking-star" /> {g.id === 'territorio' ? 'As cidades que mais valem a pena' : g.id === 'novos' ? 'As maiores oportunidades novas' : g.id === 'recuperar' ? 'O que dá para recuperar primeiro' : 'Quem ligar primeiro'}
            {aoMudar && <button type="button" className="pv-rank-ver" onClick={() => document.getElementById('pv-modulos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>ver a lista completa <i className="fas fa-arrow-down" /></button>}</div>
          {cards.map((it, i) => {
            const base = Math.max(0.0001, g.id === 'carteira' || g.id === 'territorio' ? cards[0].peso : cards[0].tamanho);
            const val = g.id === 'carteira' || g.id === 'territorio' ? it.peso : it.tamanho;
            const pct = Math.max(6, Math.min(100, (val / base) * 100));
            return (
              <BotaoItem key={it.id} it={it} onFicha={setFicha} className={`pv-rank-li ${i === 0 ? 'pv-rank-1' : ''}`}>
                <span className="pv-rank-in" style={{ animationDelay: `${200 + i * 90}ms` }}>
                  <span className="pv-rank-pos">{i + 1}º</span>
                  <span className="pv-rank-meio">
                    <span className="pv-rank-tit"><b>{it.titulo}</b><em>{it.selo}</em></span>
                    <small><i className="fas fa-location-dot" /> {it.sub}</small>
                    <span className="pv-rank-barra"><span style={{ width: `${pct}%`, animationDelay: `${350 + i * 90}ms` }} /></span>
                    <span className="pv-rank-acao"><i className="fas fa-hand-point-right" /> {it.acao}</span>
                  </span>
                  <i className={`fas ${it.cliente ? 'fa-id-card' : 'fa-arrow-right'} pv-rank-ir`} />
                </span>
              </BotaoItem>
            );
          })}
          {!cards.length && <div className="pv-vazio">Nada neste caminho agora.</div>}
        </div>
      </div>
      <div className="pv-nav">
        <button type="button" className="pv-bt" onClick={() => ir(passo - 1)}><i className="fas fa-arrow-left" /> Anterior</button>
        <small>use ← → do teclado</small>
        <button type="button" className="pv-bt pv-bt-pri" onClick={() => ir(passo + 1)}>{passo === 3 ? 'Voltar ao início' : `Próximo: ${GRUPOS[passo + 1].nome}`} <i className="fas fa-arrow-right" /></button>
      </div>
      {ficha && <FichaExecutiva c={ficha} modo="abas" onFechar={() => setFicha(null)} />}
    </div>
  );
}

// ── C · FILA DO DIA ──────────────────────────────────────────────────────────
type Decisao = 'ligar' | 'depois';
const hojeISO = () => new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);

function montarFila(itens: Item[]): Item[] {
  // intercala os caminhos (sem território: cidade não se liga), os mais quentes primeiro
  const por = (g: GrupoId) => itens.filter((it) => it.grupo === g).sort((a, b) => b.peso - a.peso);
  const listas = [por('carteira').slice(0, 10), por('recuperar').slice(0, 8), por('novos').slice(0, 4)];
  const out: Item[] = [];
  for (let i = 0; out.length < 22 && listas.some((l) => l[i]); i++) for (const l of listas) if (l[i]) out.push(l[i]);
  return out;
}

export function ProspeccaoFila({ inicial }: { inicial?: Dados }) {
  const { d, erro } = useProspeccao(inicial);
  const fila = useMemo(() => (d ? montarFila(montarItens(d)) : []), [d]);
  const CH = `iv-fila-${hojeISO()}`;
  const [dec, setDec] = useState<Record<string, Decisao>>({});
  const [saindo, setSaindo] = useState<Decisao | null>(null);
  const [arraste, setArraste] = useState(0);
  const [ficha, setFicha] = useState<ClienteIV | null>(null);
  const [copiado, setCopiado] = useState(false);
  const inicio = useRef<number | null>(null);
  useEffect(() => { const t = setTimeout(() => { try { setDec(JSON.parse(localStorage.getItem(CH) || '{}')); } catch { /* sem storage */ } }, 0); return () => clearTimeout(t); }, [CH]);
  const salvar = (x: Record<string, Decisao>) => { setDec(x); try { localStorage.setItem(CH, JSON.stringify(x)); } catch { /* ok */ } };
  const pendentes = fila.filter((it) => !dec[it.id]);
  const atual = pendentes[0];
  const decidir = (q: Decisao) => {
    if (!atual || saindo) return;
    setSaindo(q);
    setTimeout(() => { salvar({ ...dec, [atual.id]: q }); setSaindo(null); setArraste(0); }, reduzido() ? 0 : 320);
  };
  const ligar = fila.filter((it) => dec[it.id] === 'ligar');
  const nLigar = useContador(ligar.length, 500), nDepois = useContador(fila.filter((it) => dec[it.id] === 'depois').length, 500);
  if (!d) return <Carregando erro={erro} />;
  const feitos = fila.length - pendentes.length;
  const copiar = async () => {
    const txt = ligar.map((it, i) => `${i + 1}. ${it.titulo} (${it.sub}) — ${it.acao}`).join('\n');
    try { await navigator.clipboard.writeText(`Minha lista de hoje\n${txt}`); setCopiado(true); setTimeout(() => setCopiado(false), 1600); } catch { /* sem clipboard */ }
  };
  const sobre = (e: React.PointerEvent) => { if (inicio.current != null) setArraste(e.clientX - inicio.current); };
  const solta = () => { if (inicio.current == null) return; inicio.current = null; if (arraste > 120) decidir('ligar'); else if (arraste < -120) decidir('depois'); else setArraste(0); };
  return (
    <div className="pv-tela">
      <style>{ESTILO}</style>
      <Tratorilson grande>
        <div className="pv-tl-nome">Tratorilson · sua fila de hoje</div>
        <div style={{ fontSize: 15, lineHeight: 1.55, color: TX }}>Separei {fila.length} contatos misturando a carteira, os negócios parados e propriedades novas. Arraste a carta para a <b style={{ color: '#15803d' }}>direita se vai ligar</b> e para a <b style={{ color: '#b91c1c' }}>esquerda se fica para depois</b>. No fim eu monto a sua lista.</div>
      </Tratorilson>
      <div className="pv-fila-placar">
        <div className="pv-prog"><span style={{ width: `${(feitos / Math.max(1, fila.length)) * 100}%` }} /></div>
        <span><b>{feitos}</b> de {fila.length}</span>
        <span className="pv-pl-ligar"><i className="fas fa-phone" /> {Math.round(nLigar)} vou ligar</span>
        <span className="pv-pl-depois"><i className="fas fa-clock" /> {Math.round(nDepois)} depois</span>
        {feitos > 0 && <button type="button" className="pv-bt" onClick={() => salvar({})}><i className="fas fa-rotate-left" /> recomeçar</button>}
      </div>
      {atual ? (
        <div className="pv-mesa">
          <div className="pv-pilha">
            {pendentes.slice(1, 3).reverse().map((it, k, arr) => {
              const prof = arr.length - k;
              return <div key={it.id} className="pv-carta pv-carta-tras" style={{ transform: `translateY(${prof * 12}px) scale(${1 - prof * 0.05})`, ['--k' as string]: G(it.grupo).cor }} />;
            })}
            <div key={atual.id} className={`pv-carta ${saindo ? `pv-sai-${saindo}` : 'pv-entra'}`} style={{ ['--k' as string]: G(atual.grupo).cor, transform: saindo ? undefined : `translateX(${arraste}px) rotate(${arraste / 18}deg)` }}
              onPointerDown={(e) => { inicio.current = e.clientX; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); }} onPointerMove={sobre} onPointerUp={solta} onPointerCancel={solta}>
              {arraste > 40 && <span className="pv-carimbo pv-car-ligar" style={{ opacity: Math.min(1, arraste / 120) }}>VOU LIGAR</span>}
              {arraste < -40 && <span className="pv-carimbo pv-car-depois" style={{ opacity: Math.min(1, -arraste / 120) }}>DEPOIS</span>}
              <div className="pv-carta-topo"><span><i className={`fas ${G(atual.grupo).icone}`} /> {G(atual.grupo).nome}</span><em>{atual.selo}</em></div>
              <div className="pv-carta-tit">{atual.titulo}</div>
              <div className="pv-carta-sub"><i className="fas fa-location-dot" /> {atual.sub}</div>
              <div className="pv-carta-pq"><span className="pv-rosto pv-rosto-p"><i className="fas fa-robot" /></span><div><b>Por que este?</b><br /><Escrevendo key={atual.id} texto={atual.porque} /></div></div>
              <div className="pv-acao"><i className="fas fa-hand-point-right" /> {atual.acao}</div>
              {atual.cliente && <button type="button" className="pv-bt" style={{ marginTop: 10 }} onPointerDown={(e) => e.stopPropagation()} onClick={() => setFicha(atual.cliente!)}><i className="fas fa-id-card" /> Abrir ficha</button>}
            </div>
          </div>
          <div className="pv-botoes">
            <button type="button" className="pv-redondo pv-r-depois" onClick={() => decidir('depois')} title="Depois (seta esquerda)"><i className="fas fa-xmark" /></button>
            <button type="button" className="pv-redondo pv-r-ligar" onClick={() => decidir('ligar')} title="Vou ligar (seta direita)"><i className="fas fa-phone" /></button>
          </div>
        </div>
      ) : (
        <div className="pv-fim">
          <div className="pv-fim-ic"><i className="fas fa-flag-checkered" /></div>
          <h3>Fila de hoje pronta!</h3>
          <p>{ligar.length ? `Você separou ${ligar.length} contato(s) para ligar:` : 'Você deixou tudo para depois. Amanhã eu monto outra fila.'}</p>
          <div className="pv-lista-final">
            {ligar.map((it, i) => (
              <BotaoItem key={it.id} it={it} onFicha={setFicha} className="pv-li">
                <span className="pv-li-ponto" style={{ ['--k' as string]: G(it.grupo).cor }} /><span style={{ minWidth: 0, flex: 1, textAlign: 'left' }}><b>{i + 1}. {it.titulo}</b><small>{it.acao}</small></span><em>{it.selo}</em>
              </BotaoItem>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 12 }}>
            {ligar.length > 0 && <button type="button" className="pv-bt pv-bt-pri" onClick={copiar}><i className={`fas ${copiado ? 'fa-check' : 'fa-copy'}`} /> {copiado ? 'Lista copiada' : 'Copiar a lista'}</button>}
            <button type="button" className="pv-bt" onClick={() => salvar({})}><i className="fas fa-rotate-left" /> Montar de novo</button>
          </div>
        </div>
      )}
      <TeclasFila ativo={!!atual} onLigar={() => decidir('ligar')} onDepois={() => decidir('depois')} />
      {ficha && <FichaExecutiva c={ficha} modo="abas" onFechar={() => setFicha(null)} />}
    </div>
  );
}

function TeclasFila({ ativo, onLigar, onDepois }: { ativo: boolean; onLigar: () => void; onDepois: () => void }) {
  const ref = useRef({ onLigar, onDepois });
  useEffect(() => { ref.current = { onLigar, onDepois }; });
  useEffect(() => {
    if (!ativo) return;
    const t = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || document.querySelector('.fe-fundo')) return;
      if (e.key === 'ArrowRight') ref.current.onLigar();
      if (e.key === 'ArrowLeft') ref.current.onDepois();
    };
    window.addEventListener('keydown', t); return () => window.removeEventListener('keydown', t);
  }, [ativo]);
  return null;
}

const ESTILO = `
  .pv-tela { padding: 18px clamp(12px, 2vw, 28px) 40px; display: grid; gap: 18px }
  .pv-erro { background: #fee2e2; color: #991b1b; border-radius: 12px; padding: 12px 14px }
  .pv-tl { display: flex; gap: 12px; align-items: flex-start; animation: pvSobe .45s ease both }
  .pv-rosto { width: 40px; height: 40px; border-radius: 13px; flex-shrink: 0; display: grid; place-items: center; color: #fefefe; font-size: 18px; background: linear-gradient(140deg, #0ea5e9, #0369a1); box-shadow: 0 6px 16px rgba(3,105,161,.25) }
  .pv-rosto i { animation: pvPisca 5s infinite } @keyframes pvPisca { 0%, 92%, 100% { transform: scaleY(1) } 95% { transform: scaleY(.15) } }
  .pv-tl-g .pv-rosto { width: 54px; height: 54px; border-radius: 17px; font-size: 25px }
  .pv-rosto-p { width: 32px; height: 32px; border-radius: 10px; font-size: 14px }
  .pv-balao { flex: 1; min-width: 0; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-left: 4px solid var(--k, #0369a1); border-radius: 4px 16px 16px 16px; padding: 12px 16px }
  .pv-tl-nome { font-size: 13px; font-weight: 900; color: #0369a1; margin-bottom: 4px; display: flex; gap: 6px; align-items: center }
  .pv-cursor { color: #0369a1; animation: pvCur .8s steps(1) infinite } @keyframes pvCur { 50% { opacity: 0 } }
  .pv-acao { display: flex; gap: 8px; margin-top: 8px; padding: 8px 11px; border-radius: 10px; background: color-mix(in srgb, var(--k, #0369a1) 9%, transparent); font-size: 14px; font-weight: 700; color: ${TX}; line-height: 1.45 } .pv-acao i { color: var(--k, #0369a1); margin-top: 3px }
  .pv-pop { animation: pvPop .4s cubic-bezier(.2,1.4,.4,1) both } @keyframes pvPop { from { opacity: 0; transform: scale(.9) } }
  .pv-bt { display: inline-flex; gap: 7px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); color: ${TX}; border-radius: 10px; padding: 8px 13px; font: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; text-decoration: none; transition: transform .15s, background .15s }
  .pv-bt:hover { transform: translateY(-1px) } .pv-bt-pri { background: #0369a1; border-color: #0369a1; color: #fefefe }
  .pv-vazio { color: ${MU}; font-style: italic; padding: 20px }
  @keyframes pvSobe { from { opacity: 0; transform: translateY(10px) } }
  /* radar */
  .pv-radar-grade { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(320px, 1fr); gap: 22px; align-items: start }
  @media (max-width: 1000px) { .pv-radar-grade { grid-template-columns: 1fr } }
  .pv-radar-caixa { position: relative; background: radial-gradient(circle at 50% 45%, #0f172a, #020617); border-radius: 24px; padding: 14px; box-shadow: 0 20px 50px rgba(2,6,23,.35) }
  .pv-radar { width: 100%; height: auto; display: block }
  .pv-varredura { transform-origin: 300px 300px; animation: pvGira linear infinite } @keyframes pvGira { to { transform: rotate(360deg) } }
  .pv-quad { transition: opacity .3s } .pv-quad:hover { opacity: .14 !important }
  .pv-rotulo { font-size: 15px; font-weight: 900; letter-spacing: .03em; paint-order: stroke; stroke: #020617; stroke-width: 4px }
  .pv-ponto { transition: opacity .3s; animation: pvAparece .5s ease both } @keyframes pvAparece { from { opacity: 0 } }
  .pv-ping { opacity: 0; animation: pvPing linear infinite; pointer-events: none } @keyframes pvPing { 0% { opacity: .7; transform-box: fill-box; transform-origin: center; transform: scale(.6) } 12% { opacity: 0; transform-box: fill-box; transform-origin: center; transform: scale(2.2) } 100% { opacity: 0 } }
  .pv-dica { position: absolute; transform: translate(-50%, calc(-100% - 14px)); background: #111111; color: #fefefe; border-radius: 12px; padding: 8px 11px; display: grid; gap: 1px; min-width: 170px; pointer-events: none; border-top: 3px solid var(--k); animation: pvSobe .15s ease both; z-index: 2 }
  .pv-dica small { font-size: 11px; font-weight: 800; color: var(--k); text-transform: uppercase } .pv-dica b { font-size: 14px } .pv-dica span { font-size: 12px; opacity: .75 } .pv-dica em { font-style: normal; font-size: 12px; font-weight: 800 }
  .pv-legenda { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; margin-top: 10px }
  .pv-legenda button { display: flex; gap: 10px; align-items: center; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.04); color: #e2e8f0; border-radius: 12px; padding: 9px 10px; font: inherit; cursor: pointer; text-align: left; transition: background .2s, border-color .2s }
  .pv-legenda button i { color: var(--k); font-size: 16px } .pv-legenda button b { display: block; font-size: 18px; color: #fefefe } .pv-legenda button small { font-size: 11.5px; color: #94a3b8 }
  .pv-legenda button:hover, .pv-legenda button.on { background: color-mix(in srgb, var(--k) 22%, transparent); border-color: var(--k) }
  @media (max-width: 640px) { .pv-legenda { grid-template-columns: repeat(2, minmax(0, 1fr)) } }
  .pv-lado { display: grid; gap: 12px; position: sticky; top: 100px }
  .pv-sel-tit { font-size: 22px; font-weight: 900; color: ${TX}; line-height: 1.2; animation: pvSobe .3s ease both }
  .pv-lista { display: grid; gap: 6px }
  .pv-li { display: flex; gap: 10px; align-items: center; width: 100%; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 12px; padding: 9px 12px; font: inherit; color: ${TX}; cursor: pointer; text-decoration: none; animation: pvSobe .35s ease both; transition: transform .15s, border-color .15s }
  .pv-li:hover { transform: translateX(4px); border-color: var(--k) } .pv-li b { display: block; font-size: 14px } .pv-li small { display: block; font-size: 12.5px; color: ${MU} } .pv-li em { font-style: normal; font-size: 12.5px; font-weight: 800; color: var(--k) }
  .pv-li-ponto { width: 10px; height: 10px; border-radius: 50%; background: var(--k); flex-shrink: 0; box-shadow: 0 0 0 4px color-mix(in srgb, var(--k) 20%, transparent) }
  /* jornada */
  .pv-jor-topo { display: flex; gap: 14px; align-items: flex-start } .pv-jor-topo > .pv-tl { flex: 1 }
  @media (max-width: 760px) { .pv-jor-topo { flex-direction: column } }
  .pv-passos { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px }
  .pv-passos button { position: relative; overflow: hidden; display: flex; gap: 10px; align-items: center; border: 1px solid var(--portal-border, #e2e8f0); background: var(--portal-bg-card, #fefefe); border-radius: 14px; padding: 10px 12px; font: inherit; font-size: 14px; font-weight: 800; color: ${MU}; cursor: pointer; transition: all .25s }
  .pv-passos button.on { color: ${TX}; border-color: var(--k); box-shadow: 0 10px 24px color-mix(in srgb, var(--k) 22%, transparent); transform: translateY(-2px) }
  .pv-passo-n { width: 28px; height: 28px; border-radius: 50%; display: grid; place-items: center; font-size: 13px; background: var(--portal-bg-secondary, #f1f5f9); flex-shrink: 0; transition: all .25s }
  .pv-passos button.on .pv-passo-n, .pv-passos button.feito .pv-passo-n { background: var(--k); color: #fefefe }
  .pv-passo-tempo { position: absolute; left: 0; bottom: 0; height: 3px; background: var(--k); animation: pvTempo linear both } @keyframes pvTempo { from { width: 0 } to { width: 100% } }
  @media (max-width: 760px) { .pv-passos button > span:nth-child(2) { display: none } }
  .pv-slide { display: grid; grid-template-columns: minmax(300px, .9fr) minmax(0, 1.4fr); gap: 20px; align-items: start; animation: pvSlide .5s cubic-bezier(.2,.8,.2,1) both }
  @keyframes pvSlide { from { opacity: 0; transform: translateX(var(--d)) } }
  @media (max-width: 1000px) { .pv-slide { grid-template-columns: 1fr } }
  .pv-slide-esq { display: grid; gap: 8px; align-content: start }
  .pv-slide-ic { width: 64px; height: 64px; border-radius: 20px; display: grid; place-items: center; font-size: 28px; color: #fefefe; background: var(--k); box-shadow: 0 14px 30px color-mix(in srgb, var(--k) 35%, transparent); animation: pvIcone .6s cubic-bezier(.2,1.5,.4,1) both } @keyframes pvIcone { from { transform: scale(0) rotate(-30deg) } }
  .pv-slide-perg { font-size: 24px; font-weight: 900; color: ${TX}; line-height: 1.2 }
  .pv-slide-num { font-size: 52px; font-weight: 900; color: var(--k); letter-spacing: -.03em; line-height: 1; font-variant-numeric: tabular-nums }
  .pv-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr)); gap: 12px; perspective: 1000px }
  .pv-card { display: block; border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: none; text-align: left }
  .pv-card-in { display: grid; gap: 3px; height: 100%; box-sizing: border-box; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-top: 4px solid var(--k); border-radius: 14px; padding: 13px 15px; animation: pvVira .6s cubic-bezier(.2,.8,.2,1) both; transition: transform .2s, box-shadow .2s }
  @keyframes pvVira { from { opacity: 0; transform: rotateY(-75deg) translateX(-20px) } }
  .pv-card:hover .pv-card-in { transform: translateY(-4px); box-shadow: 0 14px 28px rgba(15,23,42,.12) }
  .pv-card-in em { font-style: normal; font-size: 12px; font-weight: 900; color: var(--k); text-transform: uppercase } .pv-card-in b { font-size: 16.5px; color: ${TX} } .pv-card-in small { font-size: 12.5px; color: ${MU} }
  .pv-card-pq { font-size: 13px; color: ${TX}; margin-top: 4px; line-height: 1.45 }
  .pv-nav { display: flex; gap: 10px; align-items: center; justify-content: space-between } .pv-nav small { color: ${MU}; font-size: 12px }
  /* ranking da jornada */
  .pv-rank { display: grid; gap: 8px; align-content: start }
  .pv-rank-cab { font-size: 13px; font-weight: 900; text-transform: uppercase; letter-spacing: .05em; color: ${MU}; display: flex; gap: 8px; align-items: center; margin-bottom: 2px } .pv-rank-cab i { color: var(--k) }
  .pv-rank-ver { margin-left: auto; border: none; background: none; font: inherit; font-size: 12.5px; font-weight: 800; color: var(--k); cursor: pointer; text-transform: none; letter-spacing: 0 } .pv-rank-ver:hover { text-decoration: underline }
  .pv-rank-li { display: block; border: none; background: none; padding: 0; font: inherit; color: inherit; cursor: pointer; text-decoration: none; text-align: left; width: 100% }
  .pv-rank-in { display: flex; gap: 14px; align-items: center; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-radius: 16px; padding: 12px 16px; animation: pvRankEntra .5s cubic-bezier(.2,.8,.2,1) both; transition: transform .2s, box-shadow .2s, border-color .2s }
  @keyframes pvRankEntra { from { opacity: 0; transform: translateX(28px) } }
  .pv-rank-li:hover .pv-rank-in { transform: translateX(-4px); border-color: var(--k); box-shadow: 0 12px 26px color-mix(in srgb, var(--k) 16%, transparent) }
  .pv-rank-pos { width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0; display: grid; place-items: center; font-size: 15px; font-weight: 900; color: var(--k); background: color-mix(in srgb, var(--k) 11%, transparent) }
  .pv-rank-meio { flex: 1; min-width: 0; display: grid; gap: 3px }
  .pv-rank-tit { display: flex; gap: 10px; align-items: baseline; justify-content: space-between } .pv-rank-tit b { font-size: 16px; color: ${TX}; overflow: hidden; text-overflow: ellipsis; white-space: nowrap }
  .pv-rank-tit em { font-style: normal; flex-shrink: 0; font-size: 12.5px; font-weight: 900; color: var(--k); background: color-mix(in srgb, var(--k) 10%, transparent); border-radius: 99px; padding: 2px 10px }
  .pv-rank-meio small { font-size: 12.5px; color: ${MU} } .pv-rank-meio small i { font-size: 10.5px; margin-right: 3px }
  .pv-rank-barra { height: 6px; border-radius: 6px; background: var(--portal-bg-secondary, #f1f5f9); overflow: hidden; margin: 3px 0 2px }
  .pv-rank-barra span { display: block; height: 100%; border-radius: 6px; background: linear-gradient(90deg, color-mix(in srgb, var(--k) 55%, #fefefe), var(--k)); transform-origin: left; animation: pvRankBarra .9s cubic-bezier(.2,.8,.2,1) both } @keyframes pvRankBarra { from { transform: scaleX(0) } }
  .pv-rank-acao { font-size: 13px; color: ${TX}; line-height: 1.4; overflow: hidden; text-overflow: ellipsis; white-space: nowrap } .pv-rank-acao i { color: var(--k); margin-right: 4px; font-size: 11.5px }
  .pv-rank-ir { color: ${MU}; font-size: 14px; opacity: .4; transition: opacity .2s, color .2s } .pv-rank-li:hover .pv-rank-ir { opacity: 1; color: var(--k) }
  .pv-rank-1 .pv-rank-in { padding: 16px 18px; border: 2px solid var(--k); background: linear-gradient(135deg, color-mix(in srgb, var(--k) 8%, var(--portal-bg-card, #fefefe)), var(--portal-bg-card, #fefefe)) }
  .pv-rank-1 .pv-rank-pos { width: 52px; height: 52px; font-size: 18px; background: var(--k); color: #fefefe; box-shadow: 0 8px 18px color-mix(in srgb, var(--k) 35%, transparent) }
  .pv-rank-1 .pv-rank-tit b { font-size: 19px } .pv-rank-1 .pv-rank-acao { white-space: normal; font-weight: 700 }
  @media (prefers-reduced-motion: reduce) { .pv-rank-in, .pv-rank-barra span { animation: none !important } }
  /* bolinhas */
  .pv-bolinhas { position: relative; display: flex; justify-content: space-between; align-items: center; max-width: 760px; width: 100%; margin: 4px auto 0 }
  .pv-bol-trilho { position: absolute; left: 22px; right: 22px; top: 50%; height: 4px; transform: translateY(-50%); border-radius: 4px; background: var(--portal-border, #e2e8f0); overflow: hidden }
  .pv-bol-trilho span { display: block; height: 100%; border-radius: 4px; transition: width .5s cubic-bezier(.2,.8,.2,1), background .4s }
  .pv-bol { position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 0; height: 44px; min-width: 44px; padding: 0; border-radius: 99px; border: 3px solid var(--portal-bg, #f8fafc); background: var(--portal-bg-card, #fefefe); box-shadow: 0 0 0 2px color-mix(in srgb, var(--k) 45%, transparent); color: var(--k); font: inherit; cursor: pointer; overflow: hidden; transition: all .35s cubic-bezier(.2,.9,.25,1) }
  .pv-bol:hover { transform: scale(1.08); box-shadow: 0 0 0 3px var(--k) }
  .pv-bol-ic { width: 38px; height: 38px; border-radius: 50%; display: grid; place-items: center; font-size: 15px; flex-shrink: 0 }
  .pv-bol-nome { max-width: 0; opacity: 0; white-space: nowrap; font-size: 14.5px; font-weight: 900; transition: max-width .35s, opacity .25s, padding .35s }
  .pv-bol.feito { background: var(--k); color: #fefefe }
  .pv-bol.on { background: var(--k); color: #fefefe; box-shadow: 0 10px 24px color-mix(in srgb, var(--k) 40%, transparent); transform: scale(1.06) }
  .pv-bol.on .pv-bol-nome { max-width: 200px; opacity: 1; padding-right: 16px }
  .pv-bol.on .pv-bol-ic { animation: pvBate 2.4s ease-in-out infinite } @keyframes pvBate { 0%, 100% { transform: scale(1) } 50% { transform: scale(1.15) } }
  .pv-bol-tempo { position: absolute; left: 0; bottom: 0; height: 3px; background: rgba(255,255,255,.85); animation: pvTempo linear both }
  /* cartão do caminho */
  .pv-hero { position: relative; overflow: hidden; display: grid; gap: 12px; align-content: start; border-radius: 24px; padding: 22px 24px 22px; color: #fefefe; background: linear-gradient(150deg, var(--k), color-mix(in srgb, var(--k) 55%, #0f172a)); box-shadow: 0 20px 44px color-mix(in srgb, var(--k) 30%, transparent) }
  .pv-hero::after { content: ''; position: absolute; inset: 0; background: linear-gradient(115deg, transparent 35%, rgba(255,255,255,.14) 50%, transparent 65%); background-size: 250% 100%; animation: pvBrilho 6s ease-in-out infinite; pointer-events: none }
  @keyframes pvBrilho { 0%, 65% { background-position: 160% 0 } 100% { background-position: -60% 0 } }
  .pv-hero-fundo { position: absolute; right: -24px; top: -18px; font-size: 190px; opacity: .1; transform: rotate(-12deg); animation: pvFlutua 7s ease-in-out infinite; pointer-events: none }
  @keyframes pvFlutua { 50% { transform: rotate(-6deg) translateY(10px) } }
  .pv-hero-topo { position: relative; display: flex; gap: 10px; align-items: center }
  .pv-hero-ic { width: 44px; height: 44px; border-radius: 14px; display: grid; place-items: center; font-size: 20px; background: rgba(255,255,255,.2); animation: pvIcone .6s cubic-bezier(.2,1.5,.4,1) both }
  .pv-hero-etapa { font-size: 12.5px; font-weight: 900; letter-spacing: .07em; text-transform: uppercase; opacity: .9 }
  .pv-hero-perg { position: relative; margin: 0; font-size: clamp(22px, 2vw, 28px); font-weight: 900; line-height: 1.15; letter-spacing: -.01em }
  .pv-hero-num { position: relative; display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap }
  .pv-hero-num b { font-size: clamp(46px, 4.4vw, 64px); font-weight: 900; line-height: 1; letter-spacing: -.03em; font-variant-numeric: tabular-nums; text-shadow: 0 4px 18px rgba(0,0,0,.18) }
  .pv-hero-num span { font-size: 15px; font-weight: 700; opacity: .9 }
  .pv-hero-fala { position: relative; display: flex; gap: 10px; align-items: flex-start; background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.22); border-radius: 16px; padding: 12px 14px; backdrop-filter: blur(2px) }
  .pv-hero-fala p { margin: 0; font-size: 14.5px; line-height: 1.55 } .pv-hero-fala small { display: block; font-size: 11.5px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; opacity: .8; margin-bottom: 2px }
  .pv-hero-fala .pv-rosto { background: #fefefe; color: var(--k); box-shadow: none }
  .pv-hero-dica { position: relative; display: flex; gap: 10px; align-items: flex-start; background: #fefefe; color: #111111; border-radius: 16px; padding: 12px 14px; font-size: 14.5px; font-weight: 700; line-height: 1.45; box-shadow: 0 10px 24px rgba(0,0,0,.15) }
  .pv-hero-dica i { color: var(--k); font-size: 18px; margin-top: 2px } .pv-hero-dica small { display: block; font-size: 11.5px; font-weight: 900; letter-spacing: .06em; text-transform: uppercase; color: var(--k); margin-bottom: 2px }
  @media (prefers-reduced-motion: reduce) { .pv-hero::after, .pv-hero-fundo, .pv-hero-ic, .pv-bol-ic { animation: none !important } }
  /* fila */
  .pv-fila-placar { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-size: 14px; color: ${TX} }
  .pv-prog { flex: 1; min-width: 160px; height: 10px; border-radius: 10px; background: var(--portal-bg-secondary, #e2e8f0); overflow: hidden } .pv-prog span { display: block; height: 100%; border-radius: 10px; background: linear-gradient(90deg, #0ea5e9, #16a34a); transition: width .4s cubic-bezier(.2,.8,.2,1) }
  .pv-pl-ligar { color: #15803d; font-weight: 800 } .pv-pl-depois { color: #b91c1c; font-weight: 800 }
  .pv-mesa { display: grid; justify-items: center; gap: 16px; padding: 10px 0 }
  .pv-pilha { position: relative; width: min(560px, 100%); min-height: 380px }
  .pv-carta { position: absolute; inset: 0 0 auto 0; min-height: 360px; box-sizing: border-box; background: var(--portal-bg-card, #fefefe); border: 1px solid var(--portal-border, #e2e8f0); border-top: 6px solid var(--k); border-radius: 22px; padding: 20px 22px; box-shadow: 0 20px 44px rgba(15,23,42,.14); cursor: grab; touch-action: pan-y; user-select: none; transition: transform .25s }
  .pv-carta:active { cursor: grabbing; transition: none } .pv-carta-tras { pointer-events: none; transition: transform .35s; box-shadow: 0 8px 18px rgba(15,23,42,.08) }
  .pv-entra { animation: pvEntraC .4s cubic-bezier(.2,1.2,.4,1) both } @keyframes pvEntraC { from { opacity: 0; transform: translateY(18px) scale(.95) } }
  .pv-sai-ligar { animation: pvSaiD .32s ease-in both } @keyframes pvSaiD { to { opacity: 0; transform: translateX(140%) rotate(22deg) } }
  .pv-sai-depois { animation: pvSaiE .32s ease-in both } @keyframes pvSaiE { to { opacity: 0; transform: translateX(-140%) rotate(-22deg) } }
  .pv-carimbo { position: absolute; top: 22px; font-size: 22px; font-weight: 900; letter-spacing: .08em; border: 4px solid; border-radius: 10px; padding: 3px 10px; transform: rotate(-12deg); pointer-events: none }
  .pv-car-ligar { right: 22px; color: #16a34a; border-color: #16a34a } .pv-car-depois { left: 22px; color: #dc2626; border-color: #dc2626; transform: rotate(12deg) }
  .pv-carta-topo { display: flex; justify-content: space-between; gap: 10px; font-size: 13px; font-weight: 900; text-transform: uppercase; color: var(--k) } .pv-carta-topo em { font-style: normal }
  .pv-carta-tit { font-size: 28px; font-weight: 900; color: ${TX}; line-height: 1.15; margin-top: 10px }
  .pv-carta-sub { font-size: 14px; color: ${MU}; margin: 4px 0 12px }
  .pv-carta-pq { display: flex; gap: 10px; font-size: 14.5px; line-height: 1.5; color: ${TX}; background: var(--portal-bg-secondary, #f1f5f9); border-radius: 12px; padding: 10px 12px }
  .pv-botoes { display: flex; gap: 22px }
  .pv-redondo { width: 64px; height: 64px; border-radius: 50%; border: none; font-size: 24px; cursor: pointer; color: #fefefe; box-shadow: 0 12px 24px rgba(15,23,42,.18); transition: transform .15s }
  .pv-redondo:hover { transform: scale(1.1) } .pv-redondo:active { transform: scale(.94) } .pv-r-ligar { background: #16a34a } .pv-r-depois { background: #dc2626 }
  .pv-fim { text-align: center; padding: 20px; animation: pvSobe .5s ease both } .pv-fim h3 { margin: 10px 0 4px; font-size: 24px; color: ${TX} } .pv-fim p { color: ${MU}; margin: 0 0 12px }
  .pv-fim-ic { width: 70px; height: 70px; margin: 0 auto; border-radius: 22px; display: grid; place-items: center; font-size: 30px; color: #fefefe; background: linear-gradient(140deg, #16a34a, #0f766e); animation: pvIcone .7s cubic-bezier(.2,1.5,.4,1) both }
  .pv-lista-final { display: grid; gap: 6px; max-width: 620px; margin: 0 auto }
  @media (prefers-reduced-motion: reduce) { .pv-varredura, .pv-ping, .pv-ponto, .pv-tl, .pv-slide, .pv-card-in, .pv-slide-ic, .pv-entra, .pv-li, .pv-fim, .pv-fim-ic, .pv-rosto i, .pv-cursor, .pv-pop { animation: none !important } }
`;
