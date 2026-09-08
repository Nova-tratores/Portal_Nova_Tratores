'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Resumo da ação: o retorno, a linha do tempo do apoio e os alertas.
//
// A linha do tempo existe porque o processo de verba co-op trava em etapas
// diferentes (documento, faturamento, crédito) e ninguém lembra em qual parou.
import { AlertTriangle } from 'lucide-react';
import { STATUS_APOIO, rotulo, cor } from '@/lib/marketing/tipos';
import { rankingCategorias } from '@/lib/marketing/custos';
import { Painel, Titulo, Kpi, brl, pct, multiplicador, Vazio, ROSA } from '../ui';

const ETAPAS = STATUS_APOIO.filter((s) => s.etapa > 0);

export default function ResumoAba({ ficha, roi }: { ficha: any; roi: any }) {
  const categorias = rankingCategorias(roi.custoPorCategoria ?? {});
  const maior = categorias[0]?.valor ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <Kpi rotulo="Investido" valor={brl(roi.custoConfirmado)} dica="Custos confirmados. Previstos não entram." />
        <Kpi rotulo="Apoio recebido" valor={brl(roi.apoioRecebido)} cor="#16a34a" dica="Só o que já entrou. Aprovado e não recebido fica em 'a receber'." />
        <Kpi rotulo="Custo líquido" valor={brl(roi.custoLiquido)} dica="O que a revenda pôs do próprio bolso: investido menos apoio recebido." />
        <Kpi rotulo="Leads" valor={String(roi.leads)} dica={roi.metaLeadsPercent !== null ? `${pct(roi.metaLeadsPercent)} da meta` : undefined} />
        <Kpi rotulo="Propostas" valor={String(roi.propostasN)} dica={`${roi.pipelineAbertoN} ainda em aberto · ${brl(roi.pipelineAbertoValor)}`} />
        <Kpi rotulo="Vendas" valor={String(roi.vendasN)} cor="#16a34a" />
        <Kpi rotulo="Receita atribuída" valor={brl(roi.receitaAtribuida)} cor="#16a34a" />
        <Kpi rotulo="Retorno" valor={multiplicador(roi.roi)} dica="Receita atribuída dividida pelo custo líquido. Travessão quando não há custo líquido." cor="#7c3aed" />
      </div>

      {roi.alertas?.length > 0 && (
        <Painel style={{ borderLeft: '3px solid #dc2626' }}>
          <Titulo>O que precisa de atenção</Titulo>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {roi.alertas.map((a: any, i: number) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 7, fontSize: 13, color: a.gravidade === 'alta' ? '#dc2626' : 'var(--portal-text)' }}>
                <AlertTriangle size={15} color={a.gravidade === 'alta' ? '#dc2626' : a.gravidade === 'media' ? '#d97706' : '#64748b'} />
                <span style={{ fontWeight: a.gravidade === 'alta' ? 700 : 400 }}>{a.texto}</span>
              </div>
            ))}
          </div>
        </Painel>
      )}

      {/* Linha do tempo do processo de cada apoio */}
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
                    <div style={{ fontSize: 13, color: cor(STATUS_APOIO, ap.status), fontWeight: 700 }}>
                      {rotulo(STATUS_APOIO, ap.status)}
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 0 }}>
                      {ETAPAS.map((e, i) => {
                        const passou = (atual?.etapa ?? 0) >= e.etapa;
                        return (
                          <div key={e.id} style={{ display: 'flex', alignItems: 'center' }}>
                            <div
                              title={e.label}
                              style={{
                                padding: '5px 11px', fontSize: 11, fontWeight: 700, borderRadius: 3,
                                background: passou ? e.cor : 'var(--portal-bg)',
                                color: passou ? '#111111' : 'var(--portal-text-muted, #94a3b8)',
                                border: `1px solid ${passou ? e.cor : 'var(--portal-border)'}`,
                              }}
                            >
                              {e.label}
                            </div>
                            {i < ETAPAS.length - 1 && (
                              <div style={{ width: 14, height: 2, background: passou ? e.cor : 'var(--portal-border)' }} />
                            )}
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

      <Painel>
        <Titulo>Investimento por categoria</Titulo>
        {categorias.length === 0 ? (
          <Vazio>Nenhum custo lançado ainda. Sem custo, o retorno não significa nada.</Vazio>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
            {categorias.map((c) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 150, fontSize: 13, color: 'var(--portal-text)' }}>{c.label}</div>
                <div style={{ flex: 1, height: 16, background: 'var(--portal-bg)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${maior > 0 ? (c.valor / maior) * 100 : 0}%`, height: '100%', background: ROSA }} />
                </div>
                <div style={{ width: 120, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>
                  {brl(c.valor)}
                </div>
                <div style={{ width: 50, textAlign: 'right', fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>
                  {c.percent.toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        )}
      </Painel>

      {(ficha.acao.objetivo || ficha.acao.observacoes) && (
        <Painel>
          <Titulo>Anotações</Titulo>
          {ficha.acao.objetivo && (
            <div style={{ fontSize: 13, color: 'var(--portal-text)', marginBottom: 8 }}>
              <b>Objetivo:</b> {ficha.acao.objetivo}
            </div>
          )}
          {ficha.acao.observacoes && (
            <div style={{ fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>
              {ficha.acao.observacoes}
            </div>
          )}
        </Painel>
      )}
    </div>
  );
}
