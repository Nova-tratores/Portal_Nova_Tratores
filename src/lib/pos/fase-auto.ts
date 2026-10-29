// Mudança AUTOMÁTICA de fase da OS por data — regra única e PURA (testada em
// __tests__/fase-auto.test.ts). Antes eram dois robôs com regras e fusos diferentes
// (o da lista do POS usava o "hoje" do servidor, em UTC: depois das 21h já era o dia
// seguinte) que brigavam entre si e com quem desfazia a mudança — reclamação de
// 23/10/2026 "as ordens mudam de fase sozinhas" (27 vezes em 2 meses a pessoa
// desfez e o robô mudou de novo; 35 Aguardando→Execução × 72 Execução→Aguardando).
//
// Regras:
//  A) (REMOVIDA em 29/10/2026, José: "tira esse") chegar a Previsão de Execução levava para "Execução";
//     agora quem põe em Execução é a pessoa.
//  B) passou o último dia de serviço (Dias_Execucao; sem dias, a Previsão de Execução)
//     → "Aguardando ordem Técnico" (das fases de execução)
//  C) "Executada aguardando comercial" e chegou a Previsão de Faturamento → "Relatório Concluído"
// E o principal: se uma PESSOA tirou a OS da fase para onde o robô levaria (ex.: o robô pôs
// em Execução e ela voltou para Orçamento) no dia do gatilho ou depois, o robô não mexe —
// ela decidiu.

export const FASES_ANTES_EXECUCAO = [
  'Orçamento',
  'Orçamento enviado para o cliente e aguardando',
  'Orçamento Aprovado', // agendada pelo checkbox de reserva → vira Execução no dia marcado
  'Aguardando ordem Técnico',
];
export const FASES_EXECUCAO = [
  'Execução',
  'Execução (Realizando Diagnóstico)',
  'Execução aguardando peças (em transporte)',
];

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Último dia de serviço agendado: o maior de Dias_Execucao ("AAAA-MM-DD,…"), senão a Previsão de Execução. */
export function ultimoDiaServico(previsaoExecucao: unknown, diasExecucao: unknown): string {
  const dias = String(diasExecucao || '')
    .split(',').map((d) => d.trim().slice(0, 10))
    .filter((d) => ISO.test(d));
  if (dias.length) return dias.sort().pop() as string;
  const prev = String(previsaoExecucao || '').trim().slice(0, 10);
  return ISO.test(prev) ? prev : '';
}

export function maisUmDia(data: string): string {
  const d = new Date(data + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Hoje no fuso de Brasília (AAAA-MM-DD) — nunca o dia do servidor. */
export function hojeBrasilia(agora: Date = new Date()): string {
  return agora.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

export interface OSParaFaseAuto {
  Status: string | null;
  Previsao_Execucao?: string | null;
  Dias_Execucao?: string | null;
  Previsao_Faturamento?: string | null;
  faturado_omie_em?: string | null;
}

export interface DecisaoFaseAuto {
  destino: string;
  motivo: string;
  /** dia a partir do qual a regra vale (comparado com a última mudança feita por pessoa) */
  gatilho: string;
}

/** Última troca de fase feita por uma pessoa: o dia (AAAA-MM-DD, Brasília) e de qual fase ela tirou a OS. */
export interface MudancaManual { dia: string; de: string }

/** Para onde o robô deve mover a OS hoje — ou null. */
export function decidirFaseAuto(os: OSParaFaseAuto, hoje: string, ultimaMudancaManual: MudancaManual | null): DecisaoFaseAuto | null {
  const status = String(os.Status || '').trim();
  if (!status || os.faturado_omie_em || status === 'Concluída' || status === 'Cancelada') return null;

  const ultimo = ultimoDiaServico(os.Previsao_Execucao, os.Dias_Execucao);
  const passouServico = !!ultimo && maisUmDia(ultimo) <= hoje;
  const prevFat = String(os.Previsao_Faturamento || '').slice(0, 10);

  let d: DecisaoFaseAuto | null = null;
  if (passouServico && FASES_EXECUCAO.includes(status)) {
    d = { destino: 'Aguardando ordem Técnico', motivo: 'período de execução encerrado sem conclusão', gatilho: maisUmDia(ultimo) };
  } else if (status === 'Executada aguardando comercial' && ISO.test(prevFat) && prevFat <= hoje) {
    d = { destino: 'Relatório Concluído', motivo: 'previsão de faturamento atingida', gatilho: prevFat };
  }
  if (!d || d.destino === status) return null;
  // a pessoa tirou a OS do destino do robô no dia do gatilho ou depois: ela decidiu, o robô respeita
  if (ultimaMudancaManual && ultimaMudancaManual.dia >= d.gatilho && ultimaMudancaManual.de === d.destino) return null;
  return d;
}

/** Quem muda fase sozinho (não é pessoa). */
export function ehRobo(usuario: unknown): boolean {
  return /^(sistema|automático|automatico|tratorilson)/i.test(String(usuario || '').trim());
}
