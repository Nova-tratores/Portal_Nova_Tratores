// Regras PURAS do agendador: quando um agendamento está na hora, qual a próxima
// execução, como descrever o horário e como validar uma alteração.
// Horários são de Brasília (UTC-03:00 fixo — sem horário de verão desde 2019).
// Plano: docs/omie-fila-agendador-plano.md (Etapa 2).

export type TipoAgendamento = 'intervalo' | 'diario' | 'semanal' | 'mensal' | 'uma_vez';
export type PrioridadeAgendamento = 'pessoa' | 'rapido' | 'pesado';

export interface Agendamento {
  chave: string;
  handler: string;
  nome: string;
  modulo: string;
  descricao: string;
  tipo: TipoAgendamento;
  hora: string | null;
  intervalo_min: number | null;
  dias_semana: number[] | null;
  janela_inicio: string | null;
  janela_fim: string | null;
  dia_mes: number | null;
  executar_em: string | null;
  parametros: Record<string, unknown>;
  prioridade: PrioridadeAgendamento;
  usa_omie: boolean;
  grupo: string | null;
  duracao_max_min: number;
  ativo: boolean;
  pausado_por: string | null;
  pausado_motivo: string | null;
  pausado_em: string | null;
  origem: 'portal' | 'github';
}

const OFFSET_MS = 3 * 60 * 60 * 1000; // Brasília = UTC-3
const DIA_MS = 24 * 60 * 60 * 1000;
const TOLERANCIA_MS = 20_000; // o laço roda a cada 30 s; não perder a vez por segundos

/** Partes da data no horário de Brasília. */
export function partesSP(d: Date): { ano: number; mes: number; dia: number; diaSemana: number; minutos: number } {
  const l = new Date(d.getTime() - OFFSET_MS);
  return {
    ano: l.getUTCFullYear(), mes: l.getUTCMonth() + 1, dia: l.getUTCDate(),
    diaSemana: l.getUTCDay(), minutos: l.getUTCHours() * 60 + l.getUTCMinutes(),
  };
}

export function hhmmParaMin(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/** Instante (UTC) do dia `d` (em Brasília) às `hhmm`. */
function noDiaAs(d: Date, hhmm: string): Date {
  const p = partesSP(d);
  return new Date(Date.UTC(p.ano, p.mes - 1, p.dia) + hhmmParaMin(hhmm) * 60_000 + OFFSET_MS);
}

function diaPermitido(ag: Agendamento, d: Date): boolean {
  const p = partesSP(d);
  if (ag.tipo === 'mensal') return ag.dia_mes == null || p.dia === ag.dia_mes;
  return !ag.dias_semana?.length || ag.dias_semana.includes(p.diaSemana);
}

function dentroDaJanela(ag: Agendamento, d: Date): boolean {
  if (!ag.janela_inicio || !ag.janela_fim) return true;
  const m = partesSP(d).minutos;
  return m >= hhmmParaMin(ag.janela_inicio) && m < hhmmParaMin(ag.janela_fim);
}

/**
 * Está na hora de rodar? `ultima` = início da última execução (qualquer origem:
 * agendador, botão ou GitHub). Agendamento pausado nunca está na hora.
 * Diário/semanal/mensal perdido (servidor fora no horário) roda assim que voltar,
 * desde que ainda seja o mesmo dia.
 */
export function estaNaHora(ag: Agendamento, ultima: Date | null, agora: Date): boolean {
  if (!ag.ativo) return false;
  switch (ag.tipo) {
    case 'uma_vez':
      return !!ag.executar_em && new Date(ag.executar_em).getTime() <= agora.getTime() && !ultima;
    case 'intervalo': {
      if (!ag.intervalo_min) return false;
      if (!diaPermitido(ag, agora) || !dentroDaJanela(ag, agora)) return false;
      return !ultima || agora.getTime() - ultima.getTime() >= ag.intervalo_min * 60_000 - TOLERANCIA_MS;
    }
    case 'diario':
    case 'semanal':
    case 'mensal': {
      if (!ag.hora || !diaPermitido(ag, agora)) return false;
      const inicio = noDiaAs(agora, ag.hora);
      if (agora.getTime() < inicio.getTime()) return false;
      return !ultima || ultima.getTime() < inicio.getTime();
    }
  }
}

/** Próxima execução prevista (para a tela). null = pausado, já rodou (uma vez) ou mal configurado. */
export function proximaExecucao(ag: Agendamento, ultima: Date | null, agora: Date): Date | null {
  if (!ag.ativo) return null;
  if (estaNaHora(ag, ultima, agora)) return agora;
  if (ag.tipo === 'uma_vez') return ultima || !ag.executar_em ? null : new Date(ag.executar_em);

  if (ag.tipo === 'intervalo') {
    if (!ag.intervalo_min) return null;
    let t = Math.max(agora.getTime(), ultima ? ultima.getTime() + ag.intervalo_min * 60_000 : agora.getTime());
    // anda de 5 em 5 min até cair num dia/janela permitidos (no máximo 8 dias)
    for (let i = 0; i < 8 * 288; i++) {
      const d = new Date(t);
      if (diaPermitido(ag, d) && dentroDaJanela(ag, d)) return d;
      t += 5 * 60_000;
    }
    return null;
  }

  if (!ag.hora) return null;
  for (let i = 0; i <= 62; i++) {
    const dia = new Date(agora.getTime() + i * DIA_MS);
    if (!diaPermitido(ag, dia)) continue;
    const c = noDiaAs(dia, ag.hora);
    if (c.getTime() > agora.getTime() && (!ultima || ultima.getTime() < c.getTime())) return c;
  }
  return null;
}

const NOMES_DIA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function descreverDias(dias: number[] | null): string {
  if (!dias?.length || dias.length === 7) return '';
  const ord = [...dias].sort((a, b) => a - b);
  const seguidos = ord.every((d, i) => i === 0 || d === ord[i - 1] + 1);
  if (seguidos && ord.length >= 3) return `${NOMES_DIA[ord[0]]}–${NOMES_DIA[ord[ord.length - 1]]}`;
  return ord.map((d) => NOMES_DIA[d]).join(', ');
}

/** "a cada 10 min · seg–sáb 07:00–20:00", "diário 20:00", "mensal dia 5 08:30", "uma vez 14/10 22:00". */
export function descreverQuando(ag: Pick<Agendamento, 'tipo' | 'hora' | 'intervalo_min' | 'dias_semana' | 'janela_inicio' | 'janela_fim' | 'dia_mes' | 'executar_em'>): string {
  const dias = descreverDias(ag.dias_semana);
  switch (ag.tipo) {
    case 'intervalo': {
      const n = ag.intervalo_min ?? 0;
      const base = n >= 60 && n % 60 === 0 ? `a cada ${n / 60} h` : `a cada ${n} min`;
      const janela = ag.janela_inicio && ag.janela_fim ? `${ag.janela_inicio}–${ag.janela_fim}` : '';
      const extra = [dias, janela].filter(Boolean).join(' ');
      return extra ? `${base} · ${extra}` : base;
    }
    case 'diario': return dias ? `${dias} ${ag.hora}` : `diário ${ag.hora}`;
    case 'semanal': return `${dias || 'toda semana'} ${ag.hora}`;
    case 'mensal': return `mensal dia ${ag.dia_mes} ${ag.hora}`;
    case 'uma_vez': {
      if (!ag.executar_em) return 'uma vez';
      const p = partesSP(new Date(ag.executar_em));
      const hh = String(Math.floor(p.minutos / 60)).padStart(2, '0');
      const mm = String(p.minutos % 60).padStart(2, '0');
      return `uma vez ${String(p.dia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')} ${hh}:${mm}`;
    }
  }
}

export type CamposHorario = Pick<Agendamento, 'tipo' | 'hora' | 'intervalo_min' | 'dias_semana' | 'janela_inicio' | 'janela_fim' | 'dia_mes' | 'executar_em'>;

const RE_HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Valida uma alteração de horário. Devolve a mensagem de erro (em português) ou null. */
export function validarHorario(c: CamposHorario): string | null {
  if (c.dias_semana && c.dias_semana.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return 'Dias da semana inválidos.';
  if (c.dias_semana && c.dias_semana.length === 0) return 'Escolha ao menos um dia da semana.';
  switch (c.tipo) {
    case 'intervalo':
      if (!c.intervalo_min || !Number.isInteger(c.intervalo_min) || c.intervalo_min < 1 || c.intervalo_min > 1440) return 'Intervalo deve ser de 1 a 1440 minutos.';
      if (!!c.janela_inicio !== !!c.janela_fim) return 'Janela precisa de início e fim.';
      if (c.janela_inicio && (!RE_HHMM.test(c.janela_inicio) || !RE_HHMM.test(c.janela_fim!))) return 'Janela no formato HH:MM.';
      if (c.janela_inicio && hhmmParaMin(c.janela_inicio) >= hhmmParaMin(c.janela_fim!)) return 'A janela precisa terminar depois de começar.';
      return null;
    case 'diario':
    case 'semanal':
      if (!c.hora || !RE_HHMM.test(c.hora)) return 'Horário no formato HH:MM.';
      if (c.tipo === 'semanal' && !c.dias_semana?.length) return 'Escolha os dias da semana.';
      return null;
    case 'mensal':
      if (!c.hora || !RE_HHMM.test(c.hora)) return 'Horário no formato HH:MM.';
      if (!c.dia_mes || c.dia_mes < 1 || c.dia_mes > 28) return 'Dia do mês de 1 a 28.';
      return null;
    case 'uma_vez':
      if (!c.executar_em || Number.isNaN(new Date(c.executar_em).getTime())) return 'Informe quando rodar.';
      return null;
    default:
      return 'Tipo de agendamento inválido.';
  }
}

/** Situação para a tela, a partir do último registro em cron_runs. */
export type Situacao = 'ok' | 'erro' | 'rodando' | 'interrompida' | 'bloqueio' | 'aguardando_omie' | 'pulado' | 'nunca';

export function situacaoDoStatus(status: string | null | undefined): Situacao {
  if (!status) return 'nunca';
  if (['ok', 'erro', 'rodando', 'interrompida', 'bloqueio', 'aguardando_omie', 'pulado'].includes(status)) return status as Situacao;
  return 'erro';
}

/** Falhou duas vezes seguidas? (lista do mais recente para o mais antigo, sem as "rodando"/"pulado"). */
export function falhouDuasSeguidas(statusRecentes: string[]): boolean {
  const fechados = statusRecentes.filter((s) => s !== 'rodando' && s !== 'pulado');
  return fechados.length >= 2 && fechados[0] === 'erro' && fechados[1] === 'erro';
}
