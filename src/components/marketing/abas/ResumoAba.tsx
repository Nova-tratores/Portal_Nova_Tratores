'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
// Resumo da campanha + os painéis que saíram dele (revisão geral das telas, 23/11/2026):
//   ResumoAba ............ linha de INDICADORES do tipo (uma só, números grandes, conversão nas setas)
//   PainelDinheiro ....... orçamento x gasto x saldo, investimento por categoria e a trilha do apoio de fábrica
//                          (topo da aba Dinheiro — vale para todos os tipos)
//   RespostasQuestionario  objetivo e respostas do questionário (aba Fechamento; no Resumo fica só uma linha)
// A trilha do apoio existe porque a verba co-op trava em etapas (documento, faturamento, crédito) e ninguém
// lembra em qual parou.
import { useState } from 'react';
import { STATUS_APOIO, STATUS_CUSTO, CATEGORIAS_CUSTO, ORIGENS_CUSTO, rotulo, cor } from '@/lib/marketing/tipos';
import { rankingCategorias, parseValorMisto } from '@/lib/marketing/custos';
import { textoDaPergunta, PERGUNTAS, SECOES } from '@/lib/marketing/questionario';
import { Painel, Titulo, Kpi, brl, pct, multiplicador, Vazio, ROSA, dataBR, Selo } from '../ui';
import Modal from '../Modal';
import RequisicaoDoCusto from '../RequisicaoDoCusto';

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
  const orcamento: Etapa = { rotulo: 'Orçamento', valor: brl(orc), dica: orc ? (gasto > orc ? `Estourou ${brl(gasto - orc)}.` : `Sobra ${brl(orc - gasto)}.`) : 'Sem orçamento definido.' };
  // Saldo = o que sobrou pra casa: margem das vendas + apoio recebido − gasto (24/11/2026)
  const vSaldo = (Number(roi.margemAtribuida) || 0) + (Number(roi.apoioRecebido) || 0) - gasto;
  const saldo: Etapa = { rotulo: 'Saldo', valor: brl(vSaldo), cor: vSaldo < 0 ? '#dc2626' : '#16a34a', dica: `Margem ${brl(roi.margemAtribuida ?? 0)} + apoio recebido ${brl(roi.apoioRecebido)} − gasto ${brl(gasto)}.` };
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
  const custoPorLead: Etapa = { rotulo: 'Custo por lead', valor: brl(roi.leads ? gasto / roi.leads : 0), dica: roi.leads ? undefined : 'Nenhum lead ainda.' };

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
        { rotulo: 'Convidados', valor: convd ? String(convd) : '—' }, { rotulo: 'Custo por convidado', valor: brl(convd ? gasto / convd : 0) }];
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
        <>
          <DestaquesQuestionario ficha={ficha} />
          <div style={{ fontSize: 13.5, color: 'var(--portal-text-muted, #64748b)' }}>
            {onVerFechamento && <button onClick={onVerFechamento} style={{ border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', padding: 0, font: 'inherit' }}>Ver todas as respostas do questionário</button>}
          </div>
        </>
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
  // clicar na categoria abre os custos dela completos (24/11/2026); clicar na requisição abre a requisição
  const [catAberta, setCatAberta] = useState<string | null>(null);
  const [reqAberta, setReqAberta] = useState<string | null>(null);
  const custosCat = catAberta ? (ficha.custos ?? []).filter((c: any) => c.categoria === catAberta && c.status !== 'cancelado') : [];
  const valorLinha = (c: any) => parseValorMisto(c.valor) * (Number(c.rateio_percent ?? 100) / 100);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
        {/* 24/11/2026: nada de "—" em valor (vazio = R$ 0,00) e Saldo sempre calculado, mesmo sem orçamento */}
        <Kpi rotulo="Orçamento previsto" valor={brl(orc)} alerta={!!orc && gasto > orc}
          dica={orc ? (gasto > orc ? `Estourou ${brl(gasto - orc)}.` : `Sobra ${brl(orc - gasto)} do orçamento.`) : 'Defina em Editar → Orçamento previsto.'} />
        <Kpi rotulo="Gasto" valor={brl(gasto)} dica={roi.custoPrevisto ? `Mais ${brl(roi.custoPrevisto)} previstos.` : 'Custos confirmados.'} />
        {(() => {
          const margem = Number(roi.margemAtribuida) || 0;
          const apoio = Number(roi.apoioRecebido) || 0;
          const saldo = margem + apoio - gasto;
          return (
            <Kpi rotulo="Saldo" valor={brl(saldo)} cor={saldo < 0 ? '#dc2626' : '#16a34a'}
              dica={`Margem das vendas ${brl(margem)}${roi.margemEstimada ? ' (estimada)' : ''} + apoio recebido ${brl(apoio)} − gasto ${brl(gasto)}.`} />
          );
        })()}
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
              <button key={c.id} type="button" onClick={() => setCatAberta(c.id)} title="Ver os custos desta categoria"
                className="nt-linha-cat"
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '3px 4px', margin: '0 -4px', border: 'none', borderRadius: 6, background: 'transparent', cursor: 'pointer', textAlign: 'left', font: 'inherit' }}>
                <div style={{ flex: '0 1 150px', minWidth: 0, overflowWrap: 'anywhere', fontSize: 13, color: 'var(--portal-text)' }}>{c.label}</div>
                <div style={{ flex: 1, height: 16, background: 'var(--portal-bg)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${maior > 0 ? (c.valor / maior) * 100 : 0}%`, height: '100%', background: ROSA }} />
                </div>
                <div style={{ flex: '0 1 120px', minWidth: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--portal-text)' }}>{brl(c.valor)}</div>
                <div style={{ width: 50, flex: 'none', textAlign: 'right', fontSize: 12, color: 'var(--portal-text-muted, #64748b)' }}>{c.percent.toFixed(0)}%</div>
              </button>
            ))}
            <style>{'.nt-linha-cat:hover{background:var(--portal-bg-hover, rgba(0,0,0,.04)) !important}'}</style>
          </div>
        )}
      </Painel>

      <Modal titulo={`${rotulo(CATEGORIAS_CUSTO, catAberta || '')} — ${brl(custosCat.reduce((s: number, c: any) => s + (c.status === 'confirmado' ? valorLinha(c) : 0), 0))}`}
        aberto={!!catAberta} onFechar={() => setCatAberta(null)} largura={900}>
        {custosCat.length === 0 ? <Vazio>Nenhum custo nesta categoria.</Vazio> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {custosCat.map((c: any) => (
              <div key={c.id} style={{ padding: '10px 12px', border: '1px solid var(--portal-border)', borderRadius: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--portal-text)' }}>
                    {c.descricao}
                    {c.status !== 'confirmado' && <span style={{ marginLeft: 6 }}><Selo texto={rotulo(STATUS_CUSTO, c.status)} cor={cor(STATUS_CUSTO, c.status)} /></span>}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--portal-text)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{brl(valorLinha(c))}</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}>
                  <span>Fornecedor: <b style={{ color: 'var(--portal-text)', fontWeight: 500 }}>{c.fornecedor || 'não informado'}</b></span>
                  <span>Data: <b style={{ color: 'var(--portal-text)', fontWeight: 500 }}>{dataBR(c.data)}</b></span>
                  {c.req_solicitante && <span>Pedida por: <b style={{ color: 'var(--portal-text)', fontWeight: 500 }}>{c.req_solicitante}</b></span>}
                  {Number(c.rateio_percent) !== 100 && <span>Rateio {Number(c.rateio_percent)}% de {brl(parseValorMisto(c.valor))}</span>}
                  <span>Lançado por {c.criado_por_nome || 'alguém'}{c.criado_em ? ` em ${new Date(c.criado_em).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}` : ''}</span>
                </div>
                <div style={{ fontSize: 12.5 }}>
                  {c.vinculo_tipo === 'requisicao' ? (
                    <button type="button" onClick={() => setReqAberta(c.vinculo_ref)}
                      style={{ padding: 0, border: 'none', background: 'none', color: '#2563eb', cursor: 'pointer', font: 'inherit', fontWeight: 600 }}>
                      Requisição #{c.vinculo_ref} — ver notas, produtos e PDF
                    </button>
                  ) : (
                    <span style={{ color: 'var(--portal-text-muted, #64748b)' }}>{rotulo(ORIGENS_CUSTO, c.origem)}{c.vinculo_ref ? ` #${c.vinculo_ref}` : ''}</span>
                  )}
                </div>
                {c.observacoes && <div style={{ fontSize: 13, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>{c.observacoes}</div>}
              </div>
            ))}
          </div>
        )}
      </Modal>
      <RequisicaoDoCusto reqId={reqAberta} onFechar={() => setReqAberta(null)} />

      {ficha.apoios.length > 0 && (
        <Painel>
          <Titulo>Onde está o dinheiro da fábrica</Titulo>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {ficha.apoios.map((ap: any) => {
              // dinheiro já cobriu o aprovado = trilha completa, mesmo que a etapa não tenha sido trocada à mão
              const quitado = Number(ap.valor_aprovado) > 0 && Number(ap.valor_recebido) >= Number(ap.valor_aprovado);
              const atual = STATUS_APOIO.find((s) => s.id === (quitado ? 'recebido' : ap.status));
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
// ── Questionário: de texto corrido para algo que se lê (24/11/2026: "várias informações valiosas, mas escondidas") ──

/** observacoes da ação → { q01: 'resposta', ... } + as linhas que não são resposta (anotações livres). */
function lerRespostas(obs: string): { resp: Record<string, string>; anotacoes: string[] } {
  const resp: Record<string, string> = {};
  const anotacoes: string[] = [];
  for (const linha of obs.split('\n')) {
    if (!linha.trim()) continue;
    const m = linha.match(/^(q\d{2}):\s*(.*)$/);
    if (m) resp[m[1]] = m[2].trim(); else anotacoes.push(linha);
  }
  return { resp, anotacoes };
}

/** Resposta que só diz "não/nenhum/não foi feito" fica apagada — informa, mas não chama atenção. */
const ehNegativa = (t: string) => /^(n[ãa]o\b|nenhu|nada\b|sem\b|ningu[eé]m)/i.test(t.trim());

/** Rótulo curto de cada pergunta, no lugar da pergunta inteira. */
const CURTO: Record<string, string> = {
  q01: 'Evento', q02: 'Dias', q03: 'Público do evento', q04: 'Stand', q05: 'Máquinas expostas', q06: 'Equipe',
  q07: 'Ação no stand', q08: 'Mahindra presente', q09: 'Pessoas no stand', q10: 'Cadastro de visitantes',
  q11: 'Perfil e regiões', q12: 'Mais interesse', q13: 'Leads', q14: 'Venda no evento', q15: 'Propostas abertas',
  q16: 'Negociações', q17: 'Parceiros / instituições', q18: 'Concorrentes', q19: 'Percepção da Mahindra',
  q20: 'Imprensa', q21: 'O que foi contratado', q22: 'Despesa por fora', q23: 'Funcionou', q24: 'Fazer diferente',
  q25: 'Vale repetir?', q26: 'Fotos e vídeos',
};

const COR_SECAO: Record<string, string> = {
  'Sobre o evento': '#2563eb', 'Nossa participação': '#DB2777', 'Público e contatos': '#0891b2',
  'Oportunidades e vendas': '#16a34a', 'Marca e concorrência': '#7c3aed', 'Custos': '#d97706',
  'Avaliação': '#9D174D', 'Material': '#64748b',
};

/** Faixa de destaques: o que o diretor quer saber em 5 segundos. Usada no Resumo e no Fechamento. */
export function DestaquesQuestionario({ ficha }: { ficha: any }) {
  const { resp } = lerRespostas(String(ficha.acao.observacoes || ''));
  const ids = ['q25', 'q23', 'q24', 'q12', 'q11', 'q17'].filter((q) => resp[q] && !ehNegativa(resp[q]));
  if (!ids.length) return null;
  return (
    <Painel style={{ borderLeft: `3px solid ${ROSA}` }}>
      <Titulo>O que a equipe contou</Titulo>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(300px, 100%), 1fr))', gap: 10 }}>
        {ids.map((q) => (
          <div key={q} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--portal-bg)' }}>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.03em', textTransform: 'uppercase', color: COR_SECAO[PERGUNTAS.find((p) => p.id === q)?.secao || ''] || ROSA }}>{CURTO[q]}</div>
            <div style={{ fontSize: 14, color: 'var(--portal-text)', marginTop: 3, lineHeight: 1.45 }}>{resp[q]}</div>
          </div>
        ))}
      </div>
    </Painel>
  );
}

export function RespostasQuestionario({ ficha }: { ficha: any }) {
  const obs = String(ficha.acao.observacoes || '');
  if (!obs.trim()) return null;
  const { resp, anotacoes } = lerRespostas(obs);
  const secoes = SECOES.map((s) => ({ s, perguntas: PERGUNTAS.filter((p) => p.secao === s && resp[p.id]) })).filter((x) => x.perguntas.length);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <DestaquesQuestionario ficha={ficha} />
      {secoes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(420px, 100%), 1fr))', gap: 12, alignItems: 'start' }}>
          {secoes.map(({ s, perguntas }) => (
            <Painel key={s} style={{ borderTop: `3px solid ${COR_SECAO[s] || ROSA}` }}>
              <Titulo cor={COR_SECAO[s]}>{s}</Titulo>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {perguntas.map((p) => {
                  const neg = ehNegativa(resp[p.id]);
                  return (
                    <div key={p.id} title={textoDaPergunta(p.id)} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 34%) 1fr', gap: 10, alignItems: 'baseline' }}>
                      <div style={{ fontSize: 12.5, color: 'var(--portal-text-muted, #64748b)' }}>{CURTO[p.id] || textoDaPergunta(p.id)}</div>
                      <div style={{ fontSize: 13.5, color: neg ? 'var(--portal-text-muted, #94a3b8)' : 'var(--portal-text)', whiteSpace: 'pre-wrap', lineHeight: 1.45 }}>{resp[p.id]}</div>
                    </div>
                  );
                })}
              </div>
            </Painel>
          ))}
        </div>
      )}
      {anotacoes.length > 0 && (
        <Painel>
          <Titulo>Anotações</Titulo>
          <div style={{ fontSize: 13.5, color: 'var(--portal-text)', whiteSpace: 'pre-wrap' }}>{anotacoes.join('\n')}</div>
        </Painel>
      )}
    </div>
  );
}
