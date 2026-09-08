// =============================================================================
// MARKETING & EVENTOS — resultado e ROI de uma ação. Lib PURA (sem I/O).
//
// Por que TypeScript e não uma view SQL:
//   * o SQL do projeto roda à mão e o código sai do main sozinho — uma view
//     fica defasada em produção enquanto o código já mudou;
//   * as origens são sujas ("Formulario".Valor_Total é texto BR/US misto) e o
//     parser já existe em TS; replicar em plpgsql daria duas implementações;
//   * as regras de atribuição vão mudar, e mudar aqui é um push, não uma ida
//     manual ao SQL Editor de produção sem revisão nem teste.
//
// REGRA DE OURO desta lib: denominador zero devolve `null`, nunca Infinity nem
// NaN. Um card de KPI mostrando "Infinity%" é o defeito mais provável aqui.
// =============================================================================
import { totaisCusto, parseValorMisto, type TotaisCusto } from './custos';
import {
  LEAD_QUALIFICADO,
  PROPOSTA_EM_ABERTO,
  PROPOSTA_VENDIDA,
  RELATORIO_EM_ABERTO,
  type Acao,
  type Apoio,
  type Custo,
  type Lead,
  type PropostaVinculada,
} from './tipos';

export interface EntradaROI {
  acao: Pick<Acao, 'id' | 'nome' | 'orcamento_previsto' | 'meta_leads' | 'meta_vendas' | 'meta_receita' | 'data_fim' | 'responsavel_id'>;
  custos: Custo[];
  apoios: Apoio[];
  leads: Lead[];
  propostas: PropostaVinculada[];
  /** Hoje, em ISO (YYYY-MM-DD). Injetável pra o teste não depender do relógio. */
  hoje?: string;
}

export type TipoAlerta =
  | 'contrapartida_vencida'
  | 'contrapartida_proxima'
  | 'apoio_aprovado_nao_recebido'
  | 'custo_acima_orcamento'
  | 'custo_divergente'
  | 'sem_custo_lancado';

export interface AlertaROI {
  tipo: TipoAlerta;
  gravidade: 'alta' | 'media' | 'baixa';
  texto: string;
  apoioId?: string;
}

export interface ResultadoROI {
  // Custo
  custoConfirmado: number;
  custoPrevisto: number;
  custoTotal: number;
  custoPorCategoria: Record<string, number>;
  custoPorOrigem: Record<string, number>;
  custosDivergentes: number;

  // Apoio de fábrica
  apoioAprovado: number;
  apoioRecebido: number;
  apoioAReceber: number;
  /** custo confirmado menos o apoio JÁ RECEBIDO (aprovado não abate). */
  custoLiquido: number;

  // Funil
  leads: number;
  leadsQualificados: number;
  propostasN: number;
  propostasValor: number;
  pipelineAbertoN: number;
  pipelineAbertoValor: number;
  vendasN: number;
  receitaAtribuida: number;

  // Indicadores (null quando o denominador é zero)
  roi: number | null;
  custoPorLead: number | null;
  cac: number | null;
  taxaConversaoLead: number | null;
  orcamentoVsRealizado: number | null;

  // Metas (null quando a meta não foi definida)
  metaLeadsPercent: number | null;
  metaVendasPercent: number | null;
  metaReceitaPercent: number | null;

  alertas: AlertaROI[];
}

/** Divisão que devolve null em vez de Infinity/NaN. */
function div(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
}

function diasEntre(deISO: string, ateISO: string): number {
  const de = Date.parse(deISO + 'T00:00:00Z');
  const ate = Date.parse(ateISO + 'T00:00:00Z');
  if (!Number.isFinite(de) || !Number.isFinite(ate)) return NaN;
  return Math.round((ate - de) / 86_400_000);
}

export function calcularROI(e: EntradaROI): ResultadoROI {
  const hoje = e.hoje ?? new Date().toISOString().slice(0, 10);
  const c: TotaisCusto = totaisCusto(e.custos ?? []);

  // ── Apoio de fábrica ───────────────────────────────────────────────────────
  let apoioAprovado = 0;
  let apoioRecebido = 0;
  const alertas: AlertaROI[] = [];

  for (const a of e.apoios ?? []) {
    if (a.status === 'recusado' || a.status === 'cancelado') continue;
    const aprovado = parseValorMisto(a.valor_aprovado);
    const recebido = parseValorMisto(a.valor_recebido);
    apoioAprovado += aprovado;
    apoioRecebido += recebido;

    const relatorioDevido = (RELATORIO_EM_ABERTO as readonly string[]).includes(a.relatorio_status);
    if (relatorioDevido && a.contrapartida_prazo) {
      const dias = diasEntre(hoje, a.contrapartida_prazo);
      if (Number.isFinite(dias)) {
        if (dias < 0) {
          alertas.push({
            tipo: 'contrapartida_vencida',
            gravidade: 'alta',
            texto: `Relatório de contrapartida de ${a.apoiador} venceu há ${Math.abs(dias)} dia(s).`,
            apoioId: a.id,
          });
        } else if (dias <= 30) {
          alertas.push({
            tipo: 'contrapartida_proxima',
            gravidade: 'media',
            texto: `Relatório de contrapartida de ${a.apoiador} vence em ${dias} dia(s).`,
            apoioId: a.id,
          });
        }
      }
    }

    if (aprovado > 0 && recebido <= 0 && a.status !== 'recebido') {
      alertas.push({
        tipo: 'apoio_aprovado_nao_recebido',
        gravidade: 'media',
        texto: `${a.apoiador}: aprovado, mas o crédito ainda não entrou.`,
        apoioId: a.id,
      });
    }
  }

  const apoioAReceber = Math.max(apoioAprovado - apoioRecebido, 0);
  // Aprovado NÃO abate: só o dinheiro que entrou de fato reduz o custo da casa.
  const custoLiquido = c.confirmado - apoioRecebido;

  // ── Leads ──────────────────────────────────────────────────────────────────
  const leads = (e.leads ?? []).filter((l) => l.qualificacao !== 'descartado');
  const leadsQualificados = leads.filter((l) =>
    (LEAD_QUALIFICADO as readonly string[]).includes(l.qualificacao),
  ).length;

  // ── Propostas ──────────────────────────────────────────────────────────────
  let propostasValor = 0;
  let pipelineAbertoN = 0;
  let pipelineAbertoValor = 0;
  let vendasN = 0;
  let receitaAtribuida = 0;

  for (const p of e.propostas ?? []) {
    const peso = Number.isFinite(p.peso) && p.peso > 0 ? Math.min(p.peso, 1) : 1;
    const valor = parseValorMisto(p.valor_total) * peso;
    propostasValor += valor;

    if (p.status === PROPOSTA_VENDIDA) {
      vendasN += 1;
      receitaAtribuida += valor;
    } else if ((PROPOSTA_EM_ABERTO as readonly string[]).includes(String(p.status))) {
      pipelineAbertoN += 1;
      pipelineAbertoValor += valor;
    }
  }

  // ── Alertas de custo ───────────────────────────────────────────────────────
  const orcamento = parseValorMisto(e.acao?.orcamento_previsto);
  if (orcamento > 0 && c.total > orcamento) {
    const excedente = c.total - orcamento;
    alertas.push({
      tipo: 'custo_acima_orcamento',
      gravidade: 'media',
      texto: `Custo passou do orçamento previsto em ${excedente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.`,
    });
  }
  if (c.divergentes > 0) {
    alertas.push({
      tipo: 'custo_divergente',
      gravidade: 'baixa',
      texto: `${c.divergentes} custo(s) com valor diferente do documento de origem.`,
    });
  }
  // Ação já terminou e ninguém lançou custo: o ROI seria fantasia.
  if (c.total === 0 && e.acao?.data_fim && diasEntre(e.acao.data_fim, hoje) > 0) {
    alertas.push({
      tipo: 'sem_custo_lancado',
      gravidade: 'media',
      texto: 'A ação já terminou e nenhum custo foi lançado.',
    });
  }

  return {
    custoConfirmado: c.confirmado,
    custoPrevisto: c.previsto,
    custoTotal: c.total,
    custoPorCategoria: c.porCategoria,
    custoPorOrigem: c.porOrigem,
    custosDivergentes: c.divergentes,

    apoioAprovado,
    apoioRecebido,
    apoioAReceber,
    custoLiquido,

    leads: leads.length,
    leadsQualificados,
    propostasN: (e.propostas ?? []).length,
    propostasValor,
    pipelineAbertoN,
    pipelineAbertoValor,
    vendasN,
    receitaAtribuida,

    // ROI sobre o custo LÍQUIDO: o que a casa pôs do bolso. Custo líquido <= 0
    // (a fábrica pagou tudo) não tem ROI definido — mostrar travessão.
    roi: custoLiquido > 0 ? div(receitaAtribuida, custoLiquido) : null,
    custoPorLead: div(c.confirmado, leads.length),
    cac: div(c.confirmado, vendasN),
    taxaConversaoLead: div(vendasN, leads.length),
    orcamentoVsRealizado: div(c.total, orcamento),

    metaLeadsPercent: div(leads.length, Number(e.acao?.meta_leads ?? 0)),
    metaVendasPercent: div(vendasN, Number(e.acao?.meta_vendas ?? 0)),
    metaReceitaPercent: div(receitaAtribuida, parseValorMisto(e.acao?.meta_receita)),

    alertas,
  };
}

/** Várias ações lado a lado — alimenta a tela Resultados. */
export function compararAcoes(entradas: EntradaROI[]): { acaoId: string; nome: string; roi: ResultadoROI }[] {
  return entradas.map((e) => ({
    acaoId: e.acao.id,
    nome: e.acao.nome,
    roi: calcularROI(e),
  }));
}
