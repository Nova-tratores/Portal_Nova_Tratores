'use client';
// Lista de Oportunidades "executiva" (página de teste, 19/10/2026 — pedido do José):
// sem avatar, legenda (ⓘ) em cada coluna, score explicado no balão e, quando falta
// a informação, um texto dizendo o que falta ("Nunca visitado") em vez de traço.
import type { ReactNode } from 'react';
import type { ClienteIV } from '@/lib/inteligencia-vendas/tipos';
import { REGRAS } from '@/lib/inteligencia-vendas/regras';
import { diasEntre } from '@/lib/inteligencia-vendas/normalizar';
import { Dica, type Coluna } from './ui';

const TX = 'var(--portal-text, #0f172a)', MU = 'var(--portal-text-muted, #64748b)', SUAVE = 'var(--portal-bg-secondary, #f1f5f9)';

export const reaisCurto = (n: number) => (n >= 1e6 ? `R$ ${(n / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : n >= 1e3 ? `R$ ${Math.round(n / 1e3).toLocaleString('pt-BR')} mil` : `R$ ${Math.round(n)}`);
export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;

/** Faixa do score: cor + palavra. */
export function faixaScore(v: number) {
  if (v >= 60) return { cor: '#dc2626', fundo: '#fee2e2', nome: 'Prioridade alta' };
  if (v >= 35) return { cor: '#c2410c', fundo: '#ffedd5', nome: 'Prioridade média' };
  return { cor: '#475569', fundo: '#e2e8f0', nome: 'Prioridade baixa' };
}

/** Quando a informação não existe: diz o que falta, apagado, sem traço. */
export function Vazio({ children }: { children: ReactNode }) {
  return <span className="ce-vazio"><i className="fas fa-minus" />{children}</span>;
}

export const LEGENDA_SCORE = (
  <>
    <b style={{ fontSize: 14.5 }}>Score: o quanto vale ligar agora (0 a 100)</b>
    <div style={{ marginTop: 6 }}>É a <b>soma dos pesos dos motivos</b> que o cliente tem, com teto de 100. Os motivos saem do cruzamento do cadastro Omie (NOVA + CASTRO), vendas de máquinas e peças, controle de revisões, oficina (OS), propostas e o CRM dos vendedores.</div>
    <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: '2px 14px', opacity: .92 }}>
      <span>Renovar trator (5+ anos)</span><b>30 a 45</b>
      <span>Renovar trator (horímetro alto)</span><b>20</b>
      <span>Implemento · Outra marca</span><b>25</b>
      <span>Reabordar perdida · Prestador</span><b>20</b>
      <span>Proposta parada · Sumiu · Perfil</span><b>15</b>
      <span>Sem visita</span><b>10</b>
    </div>
    <div style={{ marginTop: 8, opacity: .8 }}>60 ou mais = prioridade alta · 35 a 59 = média · abaixo de 35 = baixa. Passe o mouse no número de cada cliente para ver a conta dele.</div>
  </>
);

/** A conta do score de um cliente, motivo a motivo. */
export function ContaScore({ c }: { c: ClienteIV }) {
  const soma = c.oportunidades.reduce((s, o) => s + o.peso, 0);
  const fx = faixaScore(c.score);
  return (
    <>
      <b style={{ fontSize: 14.5 }}>Score {c.score} · {fx.nome}</b>
      <div style={{ marginTop: 4, opacity: .8 }}>Soma dos pesos dos motivos para ligar (teto 100):</div>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 14px' }}>
        {c.oportunidades.map((o) => (
          <span key={o.regra} style={{ display: 'contents' }}>
            <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: REGRAS[o.regra].cor, marginRight: 7 }} />{o.titulo}</span>
            <b>+{o.peso}</b>
          </span>
        ))}
        {c.oportunidades.length === 0 && <span>Nenhum motivo agora</span>}
      </div>
      <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,.2)', display: 'flex', justifyContent: 'space-between' }}>
        <span>Total{soma > 100 ? ` (${soma}, limitado a 100)` : ''}</span><b>{c.score}</b>
      </div>
      <div style={{ marginTop: 8, opacity: .75, fontSize: 12.5 }}>Fontes: cadastro Omie, vendas, revisões, oficina, propostas e CRM. Atualiza a cada 30 min.</div>
    </>
  );
}

export function colunasExecutivas(hoje: string): Coluna<ClienteIV>[] {
  return [
    {
      id: 'score', rotulo: 'Score', largura: 78, valor: (c) => c.score, legenda: LEGENDA_SCORE,
      render: (c) => {
        const fx = faixaScore(c.score);
        return (
          <Dica conteudo={<ContaScore c={c} />}>
            <span className="ce-score" style={{ ['--k' as string]: fx.cor, ['--f' as string]: fx.fundo }}>
              <b>{c.score}</b>
              <span className="ce-score-barra"><span style={{ width: `${c.score}%` }} /></span>
            </span>
          </Dica>
        );
      },
    },
    {
      id: 'cliente', rotulo: 'Cliente', valor: (c) => c.nome,
      legenda: 'Nome do cadastro Omie (NOVA e CASTRO juntas pelo CPF/CNPJ), cidade do cadastro e vendedor responsável no CRM.',
      render: (c) => (
        <div style={{ minWidth: 220 }}>
          <div style={{ fontSize: 15, fontWeight: 700, color: TX, lineHeight: 1.3 }}>{c.nome}</div>
          <div style={{ fontSize: 13, color: MU, marginTop: 2 }}>
            {c.cidade.replace(/\s*\(..\)$/, '') || 'Cidade não informada'}
            <span style={{ margin: '0 6px', opacity: .5 }}>•</span>
            {c.vendedor ? c.vendedor.split(' ').slice(0, 2).join(' ') : <i style={{ opacity: .75 }}>sem vendedor</i>}
          </div>
        </div>
      ),
    },
    {
      id: 'trator', rotulo: 'Último trator', valor: (c) => c.ultimoTrator?.data || '',
      legenda: 'Trator mais recente que o cliente comprou conosco (Omie desde 11/2022 e controle de revisões desde 2019) e há quantos anos. Em vermelho: 5 anos ou mais, hora de renovar.',
      render: (c) => (c.ultimoTrator ? (
        <div>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: TX }}>{c.ultimoTrator.modelo}{c.qtdTratores > 1 && <span style={{ fontWeight: 500, color: MU }}> +{c.qtdTratores - 1}</span>}</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: (c.anosUltimoTrator ?? 0) >= 5 ? '#dc2626' : MU }}>
            {c.anosUltimoTrator ? `há ${c.anosUltimoTrator} ano${c.anosUltimoTrator > 1 ? 's' : ''}` : 'menos de 1 ano'}
          </div>
        </div>
      ) : <Vazio>Nenhum conosco</Vazio>),
    },
    {
      id: 'pecas', rotulo: 'Peças 12 m', direita: true, valor: (c) => c.pecas12m,
      legenda: 'Total comprado em peças nos últimos 12 meses (NOVA + CASTRO) e a variação contra os 12 meses anteriores.',
      render: (c) => {
        if (!c.pecas12m) return c.pecas12a24m ? <Vazio>Nada no ano</Vazio> : <Vazio>Não comprou</Vazio>;
        const v = c.pecas12a24m > 0 ? Math.round(((c.pecas12m - c.pecas12a24m) / c.pecas12a24m) * 100) : null;
        return (
          <div>
            <div className="ce-num">{reaisCurto(c.pecas12m)}</div>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: v == null ? MU : v >= 0 ? '#15803d' : '#dc2626' }}>
              {v == null ? 'cliente novo em peças' : `${v >= 0 ? '▲' : '▼'} ${Math.abs(v)}% no ano`}
            </div>
          </div>
        );
      },
    },
    {
      id: 'prop', rotulo: 'Propostas', valor: (c) => c.valorPropostasAbertas,
      legenda: 'Propostas comerciais do cliente: abertas (com o valor somado), ganhas e perdidas.',
      render: (c) => (c.propostasAbertas + c.propostasGanhas + c.propostasPerdidas === 0 ? <Vazio>Nenhuma</Vazio> : (
        <div style={{ display: 'grid', gap: 3 }}>
          {c.propostasAbertas > 0 && <span className="ce-num" style={{ fontSize: 14.5 }}>{reaisCurto(c.valorPropostasAbertas)} <span style={{ fontSize: 12.5, fontWeight: 600, color: '#a16207' }}>· {c.propostasAbertas} aberta{c.propostasAbertas > 1 ? 's' : ''}</span></span>}
          {(c.propostasGanhas > 0 || c.propostasPerdidas > 0) && (
            <span style={{ fontSize: 12.5, color: MU }}>
              {c.propostasGanhas > 0 && <span style={{ color: '#15803d', fontWeight: 700 }}>{c.propostasGanhas} ganha{c.propostasGanhas > 1 ? 's' : ''}</span>}
              {c.propostasGanhas > 0 && c.propostasPerdidas > 0 && ' · '}
              {c.propostasPerdidas > 0 && <>{c.propostasPerdidas} perdida{c.propostasPerdidas > 1 ? 's' : ''}</>}
            </span>
          )}
        </div>
      )),
    },
    {
      id: 'os', rotulo: 'Oficina', valor: (c) => c.os12m,
      legenda: 'Ordens de serviço do cliente nos últimos 12 meses e a data da última.',
      render: (c) => (c.os12m ? (
        <div>
          <div className="ce-num" style={{ fontSize: 14.5 }}>{c.os12m} OS</div>
          {c.ultimaOS && <div style={{ fontSize: 12.5, color: MU }}>última {dataCurta(c.ultimaOS)}</div>}
        </div>
      ) : <Vazio>Sem OS no ano</Vazio>),
    },
    {
      id: 'visita', rotulo: 'Última visita', valor: (c) => c.ultimaVisita,
      legenda: 'Última visita de vendedor registrada no CRM (crm.novatratores.com.br).',
      render: (c) => {
        if (!c.ultimaVisita) return <Vazio>Nunca visitado</Vazio>;
        const d = diasEntre(c.ultimaVisita, hoje) ?? 0;
        return (
          <div>
            <div style={{ fontSize: 14.5, fontWeight: 600, color: TX }}>{dataCurta(c.ultimaVisita)}</div>
            <div style={{ fontSize: 12.5, color: d > 180 ? '#dc2626' : MU, fontWeight: d > 180 ? 700 : 500 }}>há {d} dia{d === 1 ? '' : 's'}</div>
          </div>
        );
      },
    },
    {
      id: 'oferecer', rotulo: 'O que oferecer', valor: (c) => c.oportunidades[0]?.oferecer || '',
      legenda: 'O motivo mais forte para ligar e a sugestão do que oferecer. "+N" = outros motivos; todos aparecem na ficha do cliente.',
      render: (c) => {
        const o = c.oportunidades[0];
        if (!o) return <Vazio>Sem motivo agora</Vazio>;
        const r = REGRAS[o.regra];
        return (
          <div style={{ minWidth: 250 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
              <span className="ce-motivo" style={{ ['--k' as string]: r.cor }}>{r.rotulo}</span>
              {c.oportunidades.length > 1 && (
                <Dica largura={300} conteudo={<>{c.oportunidades.slice(1).map((x) => <div key={x.regra}>• {REGRAS[x.regra].rotulo}: {x.titulo}</div>)}</>}>
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: MU, background: SUAVE, borderRadius: 6, padding: '1px 7px' }}>+{c.oportunidades.length - 1}</span>
                </Dica>
              )}
            </div>
            <div style={{ fontSize: 14, color: TX, lineHeight: 1.4 }}>{o.oferecer}</div>
          </div>
        );
      },
    },
    { id: 'abrir', rotulo: '', valor: () => '', csv: false, render: () => <span className="ce-abrir">Abrir <i className="fas fa-arrow-right" /></span> },
  ];
}

export const ESTILO_EXECUTIVA = `
  .ce-vazio { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; font-size: 13px; color: var(--portal-text-muted, #94a3b8); font-style: italic; opacity: .8 }
  .ce-vazio i { font-size: 8px; opacity: .6 }
  .ce-num { font-size: 15px; font-weight: 700; color: var(--portal-text, #0f172a); font-variant-numeric: tabular-nums }
  .ce-score { display: inline-grid; gap: 5px; justify-items: center; min-width: 50px; padding: 6px 8px; border-radius: 10px; background: var(--f) }
  .ce-score b { font-size: 17px; line-height: 1; color: var(--k); font-variant-numeric: tabular-nums }
  .ce-score-barra { width: 36px; height: 4px; border-radius: 4px; background: rgba(148,163,184,.35); overflow: hidden }
  .ce-score-barra span { display: block; height: 100%; background: var(--k); transform-origin: left; animation: ceBarra .8s cubic-bezier(.2,.8,.2,1) both }
  @keyframes ceBarra { from { transform: scaleX(0) } }
  .ce-motivo { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: var(--k); white-space: nowrap }
  .ce-motivo::before { content: ''; width: 8px; height: 8px; border-radius: 3px; background: var(--k) }
  .ce-abrir { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--portal-text-muted, #64748b); white-space: nowrap; opacity: 0; transform: translateX(-6px); transition: opacity .2s, transform .2s }
  tr:hover .ce-abrir { opacity: 1; transform: none; color: #dc2626 }
  tr:has(.ce-abrir) td { padding-top: 12px !important; padding-bottom: 12px !important; vertical-align: middle !important }
  @media (prefers-reduced-motion: reduce) { .ce-score-barra span { animation: none } }
`;
