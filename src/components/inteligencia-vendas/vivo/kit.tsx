'use client';
// =============================================================================
// INTELIGÊNCIA DE VENDAS — peças visuais animadas (mesma linguagem da Janela
// Mecânicos): número que conta até o valor, cartão que entra suave, quadro
// "Como ler esta tela" e os quadrantes do radar. Tema pelas variáveis do portal.
// =============================================================================
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { ClienteIV, RegraId } from '@/lib/inteligencia-vendas/tipos';

export const TXT = 'var(--portal-text, #0f172a)';
export const MUDO = 'var(--portal-text-muted, #64748b)';
export const BORDA = 'var(--portal-border, #e5e7eb)';
export const CARD = 'var(--portal-bg-card, #fefefe)';
export const FUNDO2 = 'var(--portal-bg-secondary, #f1f5f9)';

/** Os 4 lados do radar: cada regra cai num tipo de conversa com o cliente. */
export type Quadrante = 'renovar' | 'vender' | 'conquistar' | 'recuperar';
export const QUADRANTES: { id: Quadrante; nome: string; cor: string; frase: string; regras: RegraId[] }[] = [
  { id: 'renovar', nome: 'Renovar', cor: '#ef4444', frase: 'Trator nosso velho ou muito rodado: hora de trocar.', regras: ['renovacao'] },
  { id: 'vender', nome: 'Vender mais', cor: '#f59e0b', frase: 'Já é cliente: falta implemento ou o perfil pede outra máquina.', regras: ['cruzada', 'perfil', 'prestador'] },
  { id: 'conquistar', nome: 'Conquistar', cor: '#8b5cf6', frase: 'Usa trator de outra marca ou só compra peça com a gente.', regras: ['outra_marca'] },
  { id: 'recuperar', nome: 'Recuperar', cor: '#06b6d4', frase: 'Sumiu, perdeu proposta, proposta parada ou ninguém visita.', regras: ['sumiu', 'reabordar', 'proposta_parada', 'sem_visita'] },
];
export const quadranteDe = (c: ClienteIV): Quadrante | null => {
  const r = c.oportunidades[0]?.regra;
  return r ? QUADRANTES.find((q) => q.regras.includes(r))!.id : null;
};
export const corQ = (q: Quadrante) => QUADRANTES.find((x) => x.id === q)!.cor;

export const compacto = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString('pt-BR')} mil`;
  return Math.round(n).toLocaleString('pt-BR');
};
export const iniciais = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 1000) / 1000; };

/** Número que sobe até o valor (easeOutCubic). */
export function useContador(alvo: number, ms = 1000): number {
  const [v, setV] = useState(0);
  const de = useRef(0);
  useEffect(() => {
    const ini = performance.now(), origem = de.current;
    let raf = 0;
    const passo = (t: number) => {
      const p = Math.min(1, (t - ini) / ms);
      setV(origem + (alvo - origem) * (1 - Math.pow(1 - p, 3)));
      if (p < 1) raf = requestAnimationFrame(passo); else de.current = alvo;
    };
    raf = requestAnimationFrame(passo);
    return () => cancelAnimationFrame(raf);
  }, [alvo, ms]);
  return v;
}
export function Conta({ valor, formato = (v: number) => Math.round(v).toLocaleString('pt-BR') }: { valor: number; formato?: (v: number) => string }) {
  return <>{formato(useContador(valor))}</>;
}

export function KpiVivo({ titulo, valor, formato, cor, sub, icone, atraso = 0, destaque, onClick, ativo }: {
  titulo: string; valor: number; formato?: (v: number) => string; cor: string; sub?: ReactNode; icone?: string; atraso?: number;
  destaque?: boolean; onClick?: () => void; ativo?: boolean;
}) {
  return (
    <div className="iv-entra iv-kpi" onClick={onClick} role={onClick ? 'button' : undefined}
      style={{
        animationDelay: `${atraso}ms`, cursor: onClick ? 'pointer' : 'default', minWidth: 0, position: 'relative', overflow: 'hidden',
        background: destaque ? `linear-gradient(135deg, ${cor}, ${cor}bb)` : CARD, color: destaque ? '#fefefe' : TXT,
        border: destaque ? 'none' : ativo ? `2px solid ${cor}` : `1px solid ${BORDA}`, borderRadius: 16, padding: '14px 16px',
        boxShadow: destaque ? `0 10px 24px ${cor}45` : ativo ? `0 0 0 4px ${cor}22` : '0 1px 3px rgba(15,23,42,.05)',
      }}>
      {icone && <i className={`fas ${icone}`} style={{ position: 'absolute', right: 14, top: 14, fontSize: 22, opacity: destaque ? .35 : .2, color: destaque ? '#fefefe' : cor }} />}
      <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: .5, opacity: destaque ? .92 : .65 }}>{titulo}</div>
      <div style={{ fontSize: 32, fontWeight: 900, marginTop: 2, fontVariantNumeric: 'tabular-nums', color: destaque ? '#fefefe' : cor, whiteSpace: 'nowrap' }}>
        <Conta valor={valor} formato={formato} />
      </div>
      {sub && <div style={{ fontSize: 13.5, marginTop: 2, opacity: destaque ? .92 : .72 }}>{sub}</div>}
    </div>
  );
}

export function Cartao({ titulo, sub, extra, children, atraso = 0, style }: { titulo?: ReactNode; sub?: ReactNode; extra?: ReactNode; children: ReactNode; atraso?: number; style?: React.CSSProperties }) {
  return (
    <section className="iv-entra" style={{ animationDelay: `${atraso}ms`, background: CARD, border: `1px solid ${BORDA}`, borderRadius: 18, padding: '16px 18px', boxShadow: '0 1px 3px rgba(15,23,42,.05)', minWidth: 0, ...style }}>
      {(titulo || extra) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: TXT, flex: 1 }}>{titulo}</div>
          {extra}
        </div>
      )}
      {sub && <div style={{ fontSize: 15, color: MUDO, margin: '-6px 0 12px', lineHeight: 1.45 }}>{sub}</div>}
      {children}
    </section>
  );
}

/** "Como ler esta tela": explicação em linguagem simples, aberta na 1ª visita e depois recolhida. */
export function ComoLer({ chave, titulo, itens }: { chave: string; titulo: string; itens: ReactNode[] }) {
  const [aberto, setAberto] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lembra se a pessoa já fechou a explicação
    try { if (localStorage.getItem(`iv-comoler-${chave}`) === '0') setAberto(false); } catch { /* sem storage */ }
  }, [chave]);
  const mudar = (v: boolean) => { setAberto(v); try { localStorage.setItem(`iv-comoler-${chave}`, v ? '1' : '0'); } catch { /* ok */ } };
  return (
    <div className="iv-entra" style={{ marginBottom: 14, borderRadius: 16, border: `1px solid ${BORDA}`, background: 'linear-gradient(135deg, rgba(239,68,68,.07), rgba(139,92,246,.07))', overflow: 'hidden' }}>
      <button type="button" onClick={() => mudar(!aberto)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', background: 'none', border: 0, cursor: 'pointer', color: TXT, fontFamily: 'inherit', textAlign: 'left' }}>
        <span className="iv-lamp" style={{ width: 30, height: 30, borderRadius: 10, background: '#fefefe', display: 'grid', placeItems: 'center', color: '#ef4444', boxShadow: '0 2px 8px rgba(239,68,68,.25)' }}><i className="fas fa-lightbulb" /></span>
        <b style={{ fontSize: 16, flex: 1 }}>{titulo}</b>
        <span style={{ fontSize: 14, color: MUDO }}>{aberto ? 'esconder' : 'como ler esta tela'}</span>
        <i className={`fas fa-chevron-${aberto ? 'up' : 'down'}`} style={{ color: MUDO, fontSize: 13.5 }} />
      </button>
      {aberto && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))', gap: 10, padding: '0 16px 14px' }}>
          {itens.map((t, i) => (
            <div key={i} className="iv-entra" style={{ animationDelay: `${i * 70}ms`, fontSize: 14.5, color: TXT, lineHeight: 1.45, background: CARD, borderRadius: 12, padding: '9px 12px', border: `1px solid ${BORDA}` }}>{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export function EstilosIV() {
  return (
    <style>{`
      @keyframes ivEntra { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
      .iv-entra { animation: ivEntra .55s cubic-bezier(.2,.8,.2,1) both }
      .iv-kpi { transition: transform .2s, box-shadow .2s } .iv-kpi:hover { transform: translateY(-2px) }
      @keyframes ivGira { to { transform: rotate(360deg) } }
      .iv-varre { animation: ivGira 7s linear infinite }
      @keyframes ivBlip { 0% { opacity: 1; transform: scale(1.9) } 15% { opacity: 1; transform: scale(1) } 100% { opacity: .5; transform: scale(1) } }
      .iv-blip { animation-name: ivBlip; animation-iteration-count: infinite; animation-timing-function: ease-out }
      @keyframes ivOnda { 0% { r: 4; opacity: .7 } 100% { r: 26; opacity: 0 } }
      .iv-onda { animation: ivOnda 2.4s ease-out infinite }
      @keyframes ivPulso { 0% { box-shadow: 0 0 0 0 var(--c) } 70% { box-shadow: 0 0 0 10px transparent } 100% { box-shadow: 0 0 0 0 transparent } }
      .iv-pulso { animation: ivPulso 1.8s infinite }
      @keyframes ivBarra { from { transform: scaleX(0) } } .iv-barra { transform-origin: left; animation: ivBarra .9s cubic-bezier(.2,.8,.2,1) both }
      @keyframes ivBarraV { from { transform: scaleY(0) } } .iv-barrav { transform-origin: bottom; animation: ivBarraV .8s cubic-bezier(.2,.8,.2,1) both }
      @keyframes ivAnel { from { stroke-dashoffset: var(--total) } } .iv-anel { animation: ivAnel 1.2s cubic-bezier(.2,.8,.2,1) both }
      @keyframes ivTroca { from { opacity: 0; transform: translateY(14px) scale(.98); filter: blur(3px) } to { opacity: 1; transform: none; filter: none } }
      .iv-troca { animation: ivTroca .5s cubic-bezier(.2,.8,.2,1) both }
      @keyframes ivLamp { 50% { transform: rotate(-12deg) scale(1.08) } } .iv-lamp { animation: ivLamp 2.6s ease-in-out infinite }
      .iv-linha { transition: background .15s, transform .15s } .iv-linha:hover { background: ${FUNDO2}; transform: translateX(3px) }
      @keyframes ivRota { to { stroke-dashoffset: -22 } } .iv-rota { animation: ivRota 1.1s linear infinite }
      @keyframes ivCresce { from { transform: scale(0); opacity: 0 } to { transform: none; opacity: 1 } } .iv-cresce { animation: ivCresce .7s cubic-bezier(.2,1.3,.3,1) both }
      @keyframes ivOndaG { from { transform: scale(1); opacity: .8 } to { transform: scale(1.9); opacity: 0 } } .iv-onda-g { transform-box: fill-box; transform-origin: center; animation: ivOndaG 2.2s ease-out infinite }
      @keyframes ivFrase { from { opacity: 0; transform: translateY(10px); filter: blur(4px) } to { opacity: 1; transform: none; filter: none } } .iv-frase { animation: ivFrase .7s cubic-bezier(.2,.8,.2,1) both }
      @media (prefers-reduced-motion: reduce) { .iv-frase, .iv-cresce, .iv-onda-g { animation: none !important } }
      @media (prefers-reduced-motion: reduce) { .iv-entra, .iv-varre, .iv-blip, .iv-onda, .iv-pulso, .iv-barra, .iv-barrav, .iv-anel, .iv-troca, .iv-lamp { animation: none !important } }
    `}</style>
  );
}
