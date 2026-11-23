'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Resumo da campanha + os painéis que saíram dele (revisão geral das telas, 23/11/2026):
//   ResumoAba ............ linha de INDICADORES do tipo (uma só, números grandes, conversão nas setas)
//   PainelDinheiro ....... orçamento x gasto x saldo, investimento por categoria e a trilha do apoio de fábrica
//                          (topo da aba Dinheiro — vale para todos os tipos)
//   RespostasQuestionario  objetivo e respostas do questionário (aba Fechamento; no Resumo fica só uma linha)
// A trilha do apoio existe porque a verba co-op trava em etapas (documento, faturamento, crédito) e ninguém
// lembra em qual parou.
import { STATUS_APOIO, rotulo, cor } from '@/lib/marketing/tipos';
import { rankingCategorias } from '@/lib/marketing/custos';
import { textoDaPergunta } from '@/lib/marketing/questionario';
import { Painel, Titulo, Kpi, brl, pct, multiplicador, Vazio, ROSA } from '../ui';

const ETAPAS = STATUS_APOIO.filter((s) => s.etapa > 0);

type Etapa = { rotulo: string; valor: string; dica?: string; cor?: string; conv?: string };

/** A linha de indicadores: números grandes, a conversão pequena embaixo de cada seta. */
function Linha({ etapas }: { etapas: Etapa[] }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'stretch', gap: 4, padding: 12, borderRadius: 14, border: '1px solid var(--portal-border)', background: 'var(--portal-bg-card)' }}>
      {etapas.map((e, i) => (
        <div key={e.rotulo} style={{ display: 'flex', alignItems: 'center', gap: 4, flex: '1 1 120px' }}>
          {i > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', color: 'var(--portal-text-muted, #94a3b8)', fontSize: 11, minWidth: 20 }}>
              <span style={{ fontSize: 16 }}>→</span>
              {e.conv && <span style={{ whiteSpace: 'nowrap' }}>{e.conv}</span>}
            </div>
          )}
          <div title={e.dica} style={{ flex: 1, minWidth: 0, padding: '4px 6px' }}>
            <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{e.rotulo}</div>
            <div style={{ fontSize: 22, fontWeight: 500, color: e.cor || 'var(--portal-text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{e.valor}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

const conv = (a: number, b: number | null | undefined) => (b && b > 0 ? `${Math.round((a / b) * 100)}%` : '—');

/** Indicadores conforme o tipo da campanha (tabela da seção 4 da revisão geral). */
function indicadores(ficha: any, roi: any): Etapa[] {
  const a = ficha.acao;
  const orc = Number(a.orcamento_previsto) || 0;
  const gasto = Number(roi.custoConfirmado) || 0;
  const custoLiq: Etapa = { rotulo: 'Custo líquido', valor: brl(roi.custoLiquido), dica: `Investido ${brl(gasto)} menos apoio recebido ${brl(roi.apoioRecebido)}.` };
  const orcamento: Etapa = { rotulo: 'Orçamento', valor: orc ? brl(orc) : '—' };
  const saldo: Etapa = { rotulo: 'Saldo', valor: orc ? brl(orc - gasto) : '—', cor: orc && gasto > orc ? '#dc2626' : '#16a34a', dica: orc && gasto > orc ? 'Passou do orçamento.' : undefined };
  const leads: Etapa = { rotulo: 'Leads', valor: String(roi.leads), dica: roi.metaLeadsPercent !== null ? `${pct(roi.metaLeadsPercent)} da meta` : roi.leadsInformados ? 'Número informado (anotado no papel).' : undefined };
  const propostas: Etapa = { rotulo: 'Propostas', valor: String(roi.propostasN), conv: `${conv(roi.propostasN, roi.leads)} → proposta`, dica: `${roi.pipelineAbertoN} ainda em aberto · ${brl(roi.pipelineAbertoValor)}` };
  const vendas: Etapa = {
    rotulo: 'Vendas', valor: String(roi.vendasN), cor: '#16a34a', conv: `${conv(roi.vendasN, roi.propostasN)} → venda`,
    dica: [roi.vendasNaAcao ? `${roi.vendasNaAcao} na ação` : '', roi.vendasDepois ? `${roi.vendasDepois} depois (até ${roi.janelaDias} dias)` : '',
      roi.vendasForaJanela ? `${roi.vendasForaJanela} fora do prazo, não conta` : ''].filter(Boolean).join(' · ') || undefined,
  };
  const margem: Etapa = { rotulo: roi.margemEstimada ? 'Margem (estimada)' : 'Margem', valor: brl(roi.margemAtribuida ?? 0), cor: '#16a34a',
    dica: `Receita ${brl(roi.receitaAtribuida)}.${roi.margemEstimada ? ' Venda sem custo cadastrado usa o % padrão do tipo.' : ''}` };
  const retorno: Etapa = { rotulo: 'Retorno', valor: multiplicador(roi.roi), cor: '#7c3aed', dica: 'Margem dividida pelo custo líquido.' };
  const custoPorLead: Etapa = { rotulo: 'Custo por lead', valor: roi.leads ? brl(gasto / roi.leads) : '—' };

  switch (a.tipo) {
    case 'campanha': case 'acao_loja': {
      const part = ficha.roleta ? Number(ficha.roleta.participantes ?? 0) : null;
      return [custoLiq, ...(part !== null ? [{ rotulo: 'Giraram a roleta', valor: String(part) }] : []),
        { ...leads, conv: part !== null ? `${conv(roi.leads, part)} → lead` : undefined }, propostas, vendas, margem, retorno];
    }
    case 'feira': case 'dia_de_campo': {
      const vis = (Number(a.publico_estimado) || 0) * (Number(a.dias_participacao) || 1);
      return [custoLiq, { rotulo: a.tipo === 'feira' ? 'Visitantes no stand' : 'Convidados', valor: vis ? String(vis) : '—', dica: 'Estimativa informada na campanha.' },
        { ...leads, conv: vis ? `${conv(roi.leads, vis)} → lead` : undefined }, propostas, vendas, margem, retorno];
    }
    case 'midia':
      return [{ ...custoLiq, rotulo: 'Custo' }, leads, custoPorLead, { ...vendas, conv: `${conv(roi.vendasN, roi.leads)} → venda` }, margem, retorno];
    case 'patrocinio':
      return [{ ...custoLiq, rotulo: 'Custo' }, leads, custoPorLead, retorno];
    case 'brinde':
      return [{ rotulo: 'Custo', valor: brl(gasto) }, orcamento, saldo];
    case 'evento_interno': {
      const convd = Number(a.publico_total_evento) || 0;   // convidados (ver AcaoForm)
      return [orcamento, { rotulo: 'Gasto', valor: brl(gasto), dica: 'Custos confirmados (aba Dinheiro).' }, saldo,
        { rotulo: 'Convidados', valor: convd ? String(convd) : '—' }, { rotulo: 'Custo por convidado', valor: convd && gasto ? brl(gasto / convd) : '—' }];
    }
    default:
      return [custoLiq, orcamento, saldo];
  }
}

/** Uma linha só sobre o questionário (as respostas ficam no Fechamento). */
function temRespostas(ficha: any) {
  return /^q\d{2}:/m.test(String(ficha.acao.observacoes || ''));
}

export default function ResumoAba({ ficha, roi, onVerFechamento }: { ficha: any; roi: any; onVerFechamento?: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Linha etapas={indicadores(ficha, roi)} />
      {ficha.acao.objetivo && (
        <div style={{ fontSize: 13.5, color: 'var(--portal-text)' }}><b style={{ fontWeight: 500 }}>Objetivo:</b> {ficha.acao.objetivo}</div>
      )}
      {temRespostas(ficha) && (
        <div style={{ fontSize: 13.5, color: 'var(--portal-text-muted, #64748b)' }}>
          Questionário respondido.{' '}
          {onVerFechamento && <button onClick={onVerFechamento} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, font: 'inherit' }}>Ver respostas</button>}
        </div>
      )}
    </div>
  );
}

/** Topo da aba Dinheiro: orçamento x gasto x saldo, por categoria e onde está o apoio da fábrica. */
export function PainelDinheiro({ ficha, roi }: { ficha: any; roi: any }) {
  const categorias = rankingCategorias(roi.custoPorCategoria ?? {});
  const maior = categorias[0]?.valor ?? 0;
  const orc = Number(ficha.acao.orcamento_previsto) || 0;
  const gasto = Number(roi.custoConfirmado) || 0;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        <Kpi rotulo="Orçamento previsto" valor={orc ? brl(orc) : '—'} dica={orc ? undefined : 'Defina em Editar → Orçamento previsto.'} />
        <Kpi rotulo="Gasto" valor={brl(gasto)} dica={roi.custoPrevisto ? `Mais ${brl(roi.custoPrevisto)} previstos.` : 'Custos confirmados.'} />
        <Kpi rotulo="Saldo" valor={orc ? brl(orc - gasto) : '—'} alerta={!!orc && gasto > orc} cor={orc && gasto > orc ? '#dc2626' : '#16a34a'} />
        {(ficha.apoios.length > 0) && <Kpi rotulo="Apoio recebido" valor={brl(roi.apoioRecebido)} cor="#16a34a" dica={roi.apoioAReceber ? `Falta receber ${brl(roi.apoioAReceber)}.` : undefined} />}
        {(ficha.apoios.length > 0) && <Kpi rotulo="Custo líquido" valor={brl(roi.custoLiquido)} dica="Gasto menos o apoio recebido." />}
      </div>

      <Painel>
        <Titulo>Investimento por categoria</Titulo>
        {categorias.length === 0 ? (
          <Vazio>Nenhum custo lançado ainda. Sem custo, o retorno não significa nada.</Vazio>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {categorias.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: '0 1 150px', minWidth: 0, overflowWrap: 'anywhere', fontSize: 13, color: 'var(--portal-text)' }}>{c.label}</div>
                <div style={{ flex: 1, height: 16, background: 'var(--portal-bg)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${maior > 0 ? (c.valor / maior) * 100 : 0}%`, height: '100%', background: ROSA }} />
                </div>
                <div style={{ flex: '0 1 120px', minWidth: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{brl(c.valor)}</div>
                <div style={{ width: 50, flex: 'none', textAlign: 'right', fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{c.percent.toFixed(0)}%</div>
              </div>
            ))}
          </div>
        )}
      </Painel>

      {ficha.apoios.length > 0 && (
        <Painel>
          <Titulo>Onde está o dinheiro da fábrica</Titulo>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ficha.apoios.map((ap: any) => {
              const atual = STATUS_APOIO.find((s) => s.id === ap.status);
              const parado = ap.status === 'recusado' || ap.status === 'cancelado';
              return (
                <div key={ap.id}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--portal-text)', marginBottom: 7 }}>
                    {ap.apoiador} · aprovado {brl(ap.valor_aprovado)} · recebido {brl(ap.valor_recebido)}
                  </div>
                  {parado ? (
                    <div style={{ fontSize: 13, color: cor(STATUS_APOIO, ap.status), fontWeight: 700 }}>{rotulo(STATUS_APOIO, ap.status)}</div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0 }}>
                      {ETAPAS.map((e, i) => {
                        const passou = (atual?.etapa ?? 0) >= e.etapa;
                        return (
                          <div key={e.id} style={{ display: 'flex', alignItems: 'center' }}>
                            <div title={e.label} style={{
                              padding: '5px 11px', fontSize: 11, fontWeight: 700, borderRadius: 3,
                              background: passou ? e.cor : 'var(--portal-bg)', color: passou ? '#111111' : 'var(--portal-text-muted, #94a3b8)',
                              border: `1px solid ${passou ? e.cor : 'var(--portal-border)'}`,
                            }}>{e.label}</div>
                            {i < ETAPAS.length - 1 && <div style={{ width: 14, height: 2, background: passou ? e.cor : 'var(--portal-border)' }} />}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Painel>
      )}
    </div>
  );
}

/** Aba Fechamento: objetivo + observações; "q05: resposta" (importação do questionário) vira a pergunta de verdade. */
export function RespostasQuestionario({ ficha }: { ficha: any }) {
  const obs = String(ficha.acao.observacoes || '');
  if (!obs.trim()) return null;
  return (
    <Painel>
      <Titulo>{temRespostas(ficha) ? 'Respostas do questionário e anotações' : 'Anotações'}</Titulo>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {obs.split('\n').filter((l) => l.trim()).map((linha, i) => {
          const m = linha.match(/^(q\d{2}):\s*(.*)$/);
          if (!m) return <div key={i} style={{ fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>{linha}</div>;
          return (
            <div key={i}>
              <div style={{ fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{textoDaPergunta(m[1])}</div>
              <div style={{ fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap', marginTop: 1 }}>{m[2]}</div>
            </div>
          );
        })}
      </div>
    </Painel>
  );
}
