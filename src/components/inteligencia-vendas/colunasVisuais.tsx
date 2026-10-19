'use client';
// Colunas da tabela de Oportunidades no visual novo (página de teste, 19/10/2026):
// sem CPF/CNPJ, cliente com avatar, score em anel, valores com barrinha.
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { REGRAS } from '@/lib/inteligencia-vendas/regras';
import type { Coluna } from './ui';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)', SUAVE = 'var(--portal-bg-secondary, #f1f5f9)';
const reais = (n: number) => (!n ? '—' : n >= 1e6 ? `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : n >= 1e3 ? `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')} mil` : `R$ ${Math.round(n)}`);
const dataBR = (iso: string) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

function Anel({ v, cor }: { v: number; cor: string }) {
  const r = 17, c = 2 * Math.PI * r;
  return (
    <span style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', width: 44, height: 44 }}>
      <svg width="44" height="44" style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
        <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(148,163,184,.25)" strokeWidth="5" />
        <circle cx="22" cy="22" r={r} fill="none" stroke={cor} strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - Math.min(100, v) / 100)} className="cv-anel" style={{ ['--t' as string]: c }} />
      </svg>
      <b style={{ fontSize: 14.5, color: cor }}>{v}</b>
    </span>
  );
}

export function colunasVisuais(maxPecas: number): Coluna<ClienteIV>[] {
  const corDe = (c: ClienteIV) => REGRAS[c.oportunidades[0]?.regra ?? 'sem_visita'].cor;
  return [
    { id: 'score', rotulo: 'Score', direita: true, largura: 64, valor: (c) => c.score, render: (c) => <Anel v={c.score} cor={corDe(c)} /> },
    {
      id: 'cliente', rotulo: 'Cliente', valor: (c) => c.nome,
      render: (c) => {
        const cor = corDe(c);
        const ini = c.nome.split(/\s+/).filter((p) => p.length > 2).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
        return (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 230 }}>
            <span style={{ width: 42, height: 42, borderRadius: 13, flexShrink: 0, display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 15, color: cor, background: `${cor}18` }}>{ini}</span>
            <span style={{ minWidth: 0 }}>
              <b style={{ display: 'block', fontSize: 15.5, color: TX, lineHeight: 1.25 }}>{c.nome}</b>
              <span style={{ fontSize: 13.5, color: MU }}><i className="fas fa-location-dot" style={{ fontSize: 11 }} /> {c.cidade.replace(/\s*\(..\)$/, '')}{c.vendedor ? ` · ${c.vendedor.split(' ')[0]}` : ''}</span>
            </span>
          </div>
        );
      },
    },
    {
      id: 'trator', rotulo: 'Último trator', valor: (c) => c.ultimoTrator?.data || '',
      render: (c) => (c.ultimoTrator ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 15, color: TX }}>{c.ultimoTrator.modelo}</b>
          <span style={{ fontSize: 12.5, fontWeight: 800, borderRadius: 999, padding: '2px 8px', background: (c.anosUltimoTrator ?? 0) >= 5 ? '#fee2e2' : SUAVE, color: (c.anosUltimoTrator ?? 0) >= 5 ? '#dc2626' : MU }}>
            {c.anosUltimoTrator ? `${c.anosUltimoTrator} a` : 'novo'}
          </span>
          {c.qtdTratores > 1 && <span style={{ fontSize: 12.5, color: MU }}>+{c.qtdTratores - 1}</span>}
        </span>
      ) : <span style={{ color: MU }}>—</span>),
    },
    {
      id: 'pecas', rotulo: 'Peças 12 m', direita: true, valor: (c) => c.pecas12m,
      render: (c) => (
        <span style={{ display: 'inline-grid', gap: 4, minWidth: 90, justifyItems: 'end' }}>
          <b style={{ fontSize: 15, color: c.pecas12m ? TX : MU }}>{reais(c.pecas12m)}</b>
          <span style={{ width: 90, height: 5, borderRadius: 5, background: SUAVE, overflow: 'hidden' }}>
            <span className="cv-barra" style={{ display: 'block', height: '100%', width: `${Math.min(100, (c.pecas12m / Math.max(1, maxPecas)) * 100)}%`, background: '#ea580c' }} />
          </span>
        </span>
      ),
    },
    {
      id: 'prop', rotulo: 'Propostas', valor: (c) => c.valorPropostasAbertas,
      render: (c) => (c.propostasAbertas + c.propostasGanhas + c.propostasPerdidas === 0 ? <span style={{ color: MU }}>—</span> : (
        <span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
          {c.propostasAbertas > 0 && <span className="cv-chip" style={{ background: '#fef9c3', color: '#a16207' }}>{c.propostasAbertas} aberta{c.propostasAbertas > 1 ? 's' : ''} · {reais(c.valorPropostasAbertas)}</span>}
          {c.propostasGanhas > 0 && <span className="cv-chip" style={{ background: '#dcfce7', color: '#15803d' }}>{c.propostasGanhas} ganha{c.propostasGanhas > 1 ? 's' : ''}</span>}
          {c.propostasPerdidas > 0 && <span className="cv-chip" style={{ background: SUAVE, color: MU }}>{c.propostasPerdidas} perdida{c.propostasPerdidas > 1 ? 's' : ''}</span>}
        </span>
      )),
    },
    { id: 'os', rotulo: 'Oficina', direita: true, valor: (c) => c.os12m, render: (c) => (c.os12m ? <span><b style={{ fontSize: 15, color: TX }}>{c.os12m}</b> <span style={{ fontSize: 12.5, color: MU }}>OS</span></span> : <span style={{ color: MU }}>—</span>) },
    { id: 'visita', rotulo: 'Últ. visita', valor: (c) => c.ultimaVisita, render: (c) => <span style={{ color: c.ultimaVisita ? TX : MU }}>{dataBR(c.ultimaVisita)}</span> },
    {
      id: 'oferecer', rotulo: 'O que oferecer', valor: (c) => c.oportunidades[0]?.oferecer || '',
      render: (c) => (
        <div style={{ minWidth: 260 }}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 4 }}>
            {c.oportunidades.map((o) => <span key={o.regra} className="cv-chip" style={{ background: `${REGRAS[o.regra].cor}16`, color: REGRAS[o.regra].cor }}>{REGRAS[o.regra].rotulo}</span>)}
          </div>
          <div style={{ fontSize: 14.5, color: TX, fontWeight: 600 }}>{c.oportunidades[0]?.oferecer || ''}</div>
        </div>
      ),
    },
    { id: 'abrir', rotulo: '', valor: () => '', csv: false, render: () => <span className="cv-abrir"><i className="fas fa-chevron-right" /></span> },
  ];
}

export const ESTILO_TABELA_VISUAL = `
  .cv-anel { animation: cvAnel 1s cubic-bezier(.2,.8,.2,1) both } @keyframes cvAnel { from { stroke-dashoffset: var(--t) } }
  .cv-barra { transform-origin: left; animation: cvBarra .8s cubic-bezier(.2,.8,.2,1) both } @keyframes cvBarra { from { transform: scaleX(0) } }
  .cv-chip { display: inline-block; font-size: 12.5px; font-weight: 700; border-radius: 999px; padding: 2px 9px; white-space: nowrap }
  .cv-abrir { display: inline-grid; place-items: center; width: 32px; height: 32px; border-radius: 10px; color: var(--portal-text-muted, #64748b); transition: transform .2s, background .2s, color .2s }
  tr:hover .cv-abrir { transform: translateX(4px); background: #fee2e2; color: #dc2626 }
`;
