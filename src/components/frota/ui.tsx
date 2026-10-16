'use client';
// Kit visual COMUM das telas da Frota (10/10/2026, Raio-X da Frota).
// Antes cada tela tinha seu título (h1/h2 de 18 a 28px), seu Kpi local (4
// implementações diferentes), sua largura e seu "Carregando…" em texto solto.
// Agora todas usam as mesmas peças:
//   <CabecalhoFrota titulo resumo acoes />  título + uma linha do que a tela responde
//   <KpisFrota> + <KpiFrota />              número grande com contexto, clicável
//   <VazioFrota /> / <CarregandoFrota />    estados desenhados
//   <SeloClasses />                         Parado · Defeito · Cadastro do veículo
// Cores pelo tema do portal (var(--portal-*)) — funciona no modo escuro.
import Link from 'next/link';
import type { ReactNode } from 'react';
import { CLASSE_AJUDA, CLASSE_COR, type ResumoClasses } from '@/lib/frota/classes';

export const AZUL_FROTA = '#1e40af';

export function CabecalhoFrota({ titulo, resumo, acoes, icone }: {
  titulo: string;
  resumo?: ReactNode;
  acoes?: ReactNode;
  icone?: ReactNode;
}) {
  return (
    <header className="frota-cab" style={{ display: 'flex', alignItems: 'flex-end', gap: 12, marginBottom: 18, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0, flex: '1 1 320px' }}>
        <h1 className="frota-titulo" style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'var(--portal-text)', display: 'flex', alignItems: 'center', gap: 8, lineHeight: 1.2 }}>
          {icone}{titulo}
        </h1>
        {resumo && <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--portal-text-secondary)', maxWidth: '75ch' }}>{resumo}</p>}
      </div>
      {acoes && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{acoes}</div>}
    </header>
  );
}

export type TomKpi = 'neutro' | 'bom' | 'atencao' | 'ruim';
const TOM_COR: Record<TomKpi, string> = { neutro: AZUL_FROTA, bom: '#15803d', atencao: '#b45309', ruim: '#b91c1c' };

export function KpisFrota({ children }: { children: ReactNode }) {
  return (
    <div className="frota-kpis" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12, marginBottom: 22 }}>
      {children}
    </div>
  );
}

/** Número grande + rótulo + uma linha de CONTEXTO ("de 22 na frota", "▲ 12% vs 30 dias antes").
 *  Com href/onClick vira botão (o número leva para a lista que o forma). */
export function KpiFrota({ rotulo, valor, contexto, tom = 'neutro', icone, href, onClick, title }: {
  rotulo: string;
  valor: ReactNode;
  contexto?: ReactNode;
  tom?: TomKpi;
  icone?: ReactNode;
  href?: string;
  onClick?: () => void;
  title?: string;
}) {
  const cor = TOM_COR[tom];
  const corpo = (
    <>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, letterSpacing: 0.4, textTransform: 'uppercase', color: 'var(--portal-text-secondary)' }}>
        {icone}{rotulo}
      </span>
      <strong className="frota-kpi-valor" style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, color: tom === 'neutro' ? 'var(--portal-text)' : cor, fontVariantNumeric: 'tabular-nums' }}>
        {valor}
      </strong>
      {contexto && <span className="frota-kpi-ctx" style={{ fontSize: 12.5, color: 'var(--portal-text-secondary)' }}>{contexto}</span>}
    </>
  );
  const estilo: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 4, padding: '14px 16px', minWidth: 0,
    background: 'var(--portal-bg-card)', border: '1px solid var(--portal-border)',
    borderLeft: `4px solid ${cor}`, borderRadius: 0, textAlign: 'left', textDecoration: 'none',
    font: 'inherit', color: 'inherit', cursor: href || onClick ? 'pointer' : 'default',
  };
  if (href) return <Link href={href} title={title} className="frota-kpi" style={estilo}>{corpo}</Link>;
  if (onClick) return <button type="button" onClick={onClick} title={title} className="frota-kpi" style={estilo}>{corpo}</button>;
  return <div title={title} className="frota-kpi" style={estilo}>{corpo}</div>;
}

export function VazioFrota({ titulo, texto, acao }: { titulo: string; texto?: ReactNode; acao?: ReactNode }) {
  return (
    <div style={{ padding: '36px 20px', textAlign: 'center', background: 'var(--portal-bg-card)', border: '1px dashed var(--portal-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <strong style={{ fontSize: 15, color: 'var(--portal-text)' }}>{titulo}</strong>
      {texto && <span style={{ fontSize: 13, color: 'var(--portal-text-secondary)', maxWidth: '60ch' }}>{texto}</span>}
      {acao}
    </div>
  );
}

/** Esqueleto no lugar do "Carregando…" em texto: mostra a forma da tela enquanto chega. */
export function CarregandoFrota({ linhas = 4, kpis = 0 }: { linhas?: number; kpis?: number }) {
  const bloco = (h: number, key: number) => (
    <div key={key} className="frota-esqueleto" style={{ height: h, background: 'var(--portal-bg-secondary)', border: '1px solid var(--portal-border)' }} />
  );
  return (
    <div aria-busy="true" aria-label="Carregando" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <style>{`@keyframes frotaPulso{0%,100%{opacity:.55}50%{opacity:1}}.frota-esqueleto{animation:frotaPulso 1.4s ease-in-out infinite}@media (prefers-reduced-motion:reduce){.frota-esqueleto{animation:none}}`}</style>
      {kpis > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(190px, 100%), 1fr))', gap: 12, marginBottom: 12 }}>
          {Array.from({ length: kpis }, (_, i) => bloco(86, i))}
        </div>
      )}
      {Array.from({ length: linhas }, (_, i) => bloco(52, 100 + i))}
    </div>
  );
}

const chip = (bg: string, cor: string): React.CSSProperties => ({
  fontSize: 10.5, fontWeight: 800, color: cor, background: bg, borderRadius: 999,
  padding: '2px 8px', letterSpacing: 0.4, whiteSpace: 'nowrap',
});

/** Selos do veículo: PARADO / N DEFEITOS / N CADASTRO (só o que existe). */
export function SeloClasses({ classes }: { classes: ResumoClasses | null | undefined }) {
  if (!classes) return null;
  const out: ReactNode[] = [];
  if (classes.parado) {
    const motivo = [
      classes.motivoParado.includes('status') ? 'marcado como parado/em manutenção na Ficha' : '',
      classes.criticas ? `${classes.criticas} problema(s) crítico(s)` : '',
    ].filter(Boolean).join(' e ');
    out.push(<span key="p" title={`${CLASSE_AJUDA.parado}\n→ ${motivo}`} style={chip(CLASSE_COR.parado.bg, CLASSE_COR.parado.cor)}>PARADO</span>);
  }
  if (classes.defeitos) {
    out.push(<span key="d" title={CLASSE_AJUDA.defeito} style={chip(CLASSE_COR.defeito.bg, CLASSE_COR.defeito.cor)}>{classes.defeitos} DEFEITO{classes.defeitos > 1 ? 'S' : ''}</span>);
  }
  if (classes.cadastro) {
    out.push(<span key="c" title={CLASSE_AJUDA.cadastro} style={chip(CLASSE_COR.cadastro.bg, CLASSE_COR.cadastro.cor)}>{classes.cadastro} DE CADASTRO</span>);
  }
  return <>{out}</>;
}
