// Servidor da tela /agendamentos: painel (agendamentos + execuções de hoje + Omie
// agora), histórico e as ações de Dev (rodar agora, pausar, retomar, alterar
// horário, marcar para depois). Plano: docs/omie-fila-agendador-plano.md.

import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { estadoPorta } from '@/lib/omie/porta';
import { descreverQuando, proximaExecucao, validarHorario, type Agendamento, type CamposHorario } from './regras';
import { estadoMotor, executar, invalidarLista, lerAgendamentos } from './motor';
import { TAREFAS } from './tarefas';

export const MSG_MIGRACAO = 'Falta aplicar a migration sql/agendador.sql no banco — enquanto isso os agendamentos internos seguem como antes (sem histórico nem botões).';

export interface Rodada {
  id: number;
  job: string;
  iniciado_em: string;
  finalizado_em: string | null;
  duracao_ms: number | null;
  status: string;
  detalhe: string | null;
  disparado_por?: string | null;
  quem?: string | null;
  progresso?: Record<string, string> | null;
}

const COLUNAS = 'id,job,iniciado_em,finalizado_em,duracao_ms,status,detalhe,disparado_por,quem,progresso';
const COLUNAS_SEM_MIGRACAO = 'id,job,iniciado_em,finalizado_em,duracao_ms,status,detalhe';

/** cron_runs com as colunas novas; sem a migration, cai para as antigas. */
async function selecionarRodadas(montar: (cols: string) => PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<Rodada[]> {
  let r = await montar(COLUNAS);
  if (r.error) r = await montar(COLUNAS_SEM_MIGRACAO);
  if (r.error) throw new Error(r.error.message);
  return (r.data || []) as Rodada[];
}

function inicioDoDiaSP(): string {
  const l = new Date(Date.now() - 3 * 3600_000);
  return new Date(Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate()) + 3 * 3600_000).toISOString();
}

export async function montarPainel() {
  const motor = estadoMotor();
  const porta = estadoPorta();
  const lista = await lerAgendamentos().catch(() => null);
  if (!lista) return { migracaoFaltando: true, mensagem: MSG_MIGRACAO, motor, porta, agendamentos: [], hoje: [], batida: null };

  const ultimas = await Promise.all(lista.map((a) =>
    selecionarRodadas((c) => sb.from('cron_runs').select(c).eq('job', a.chave).order('iniciado_em', { ascending: false }).limit(1))
      .then((r) => r[0] ?? null).catch(() => null)));

  const hoje = await selecionarRodadas((c) => sb.from('cron_runs').select(c)
    .gte('iniciado_em', inicioDoDiaSP()).order('iniciado_em', { ascending: true }).limit(5000)).catch(() => []);

  const { data: batida } = await sb.from('agendador_estado').select('batida_em,iniciado_em,versao').eq('id', 1).maybeSingle();

  const agora = new Date();
  const rodando = new Map(motor.rodando.map((r) => [r.chave, r]));
  return {
    migracaoFaltando: false,
    motor,
    porta,
    batida: batida ?? null,
    agendamentos: lista.map((a, i) => {
      const u = ultimas[i];
      // a próxima conta a partir da última que de fato rodou (interrompida não conta)
      const base = u && u.status !== 'interrompida' ? new Date(u.iniciado_em) : null;
      const prox = proximaExecucao(a, base, agora);
      return {
        ...a,
        quando: descreverQuando(a),
        tarefaExiste: !!TAREFAS[a.handler],
        ultima: u,
        proxima: prox ? prox.toISOString() : null,
        rodandoAgora: rodando.get(a.chave) ?? null,
      };
    }),
    hoje,
  };
}

export async function historico(f: { job?: string; status?: string; dias?: number; limite?: number }): Promise<Rodada[]> {
  const desde = new Date(Date.now() - Math.min(Math.max(f.dias ?? 7, 1), 180) * 86_400_000).toISOString();
  const limite = Math.min(Math.max(f.limite ?? 200, 1), 1000);
  return selecionarRodadas((c) => {
    let q = sb.from('cron_runs').select(c).gte('iniciado_em', desde);
    if (f.job) q = q.eq('job', f.job);
    if (f.status) q = q.eq('status', f.status);
    return q.order('iniciado_em', { ascending: false }).limit(limite);
  });
}

// ── Ações (só Dev — a rota confere) ────────────────────────────────────────────

export class ErroAcao extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

async function carregar(chave: string): Promise<Agendamento> {
  const { data, error } = await sb.from('agendamentos').select('*').eq('chave', chave).maybeSingle();
  if (error) throw new ErroAcao(error.message, 500);
  if (!data) throw new ErroAcao('Agendamento não encontrado.', 404);
  return data as Agendamento;
}

async function gravar(chave: string, patch: Record<string, unknown>, quem: string): Promise<void> {
  const { error } = await sb.from('agendamentos').update({ ...patch, atualizado_por: quem, atualizado_em: new Date().toISOString() }).eq('chave', chave);
  if (error) throw new ErroAcao(error.message, 500);
  invalidarLista();
}

export async function rodarAgora(chave: string, quem: string) {
  if (!estadoMotor().ligado) {
    // PAPEL=web (robôs num serviço separado): este processo não tem o motor.
    // Marca uma execução "uma vez" para daqui a 5 s — o worker a pega no próximo
    // laço (30 s) e a rodada entra em cron_runs como "marcado".
    if ((process.env.PAPEL || 'tudo').trim().toLowerCase() === 'web') {
      const m = await marcarUmaVez(chave, quem, new Date(Date.now() + 5_000).toISOString());
      return { iniciou: true, viaWorker: true, chave: m.chave };
    }
    throw new ErroAcao('O agendador não está ligado neste servidor (só roda em produção, com a migration aplicada).', 409);
  }
  const ag = await carregar(chave);
  const r = executar(ag, 'botao', quem);
  if (!r.ok) throw new ErroAcao(r.mensagem, 409);
  return { iniciou: true };
}

export async function pausar(chave: string, quem: string, motivo: string) {
  await carregar(chave);
  if (!motivo.trim()) throw new ErroAcao('Diga o motivo da pausa (aparece para todos na tela).');
  await gravar(chave, { ativo: false, pausado_por: quem, pausado_motivo: motivo.trim().slice(0, 300), pausado_em: new Date().toISOString() }, quem);
}

export async function retomar(chave: string, quem: string) {
  await carregar(chave);
  await gravar(chave, { ativo: true, pausado_por: null, pausado_motivo: null, pausado_em: null }, quem);
}

const CAMPOS_HORARIO = ['tipo', 'hora', 'intervalo_min', 'dias_semana', 'janela_inicio', 'janela_fim', 'dia_mes', 'executar_em'] as const;

export async function alterarHorario(chave: string, quem: string, novo: Partial<CamposHorario>) {
  const atual = await carregar(chave);
  const c: CamposHorario = {
    tipo: novo.tipo ?? atual.tipo,
    hora: novo.hora !== undefined ? novo.hora : atual.hora,
    intervalo_min: novo.intervalo_min !== undefined ? novo.intervalo_min : atual.intervalo_min,
    dias_semana: novo.dias_semana !== undefined ? novo.dias_semana : atual.dias_semana,
    janela_inicio: novo.janela_inicio !== undefined ? novo.janela_inicio : atual.janela_inicio,
    janela_fim: novo.janela_fim !== undefined ? novo.janela_fim : atual.janela_fim,
    dia_mes: novo.dia_mes !== undefined ? novo.dia_mes : atual.dia_mes,
    executar_em: novo.executar_em !== undefined ? novo.executar_em : atual.executar_em,
  };
  const erro = validarHorario(c);
  if (erro) throw new ErroAcao(erro);
  const patch: Record<string, unknown> = {};
  for (const k of CAMPOS_HORARIO) patch[k] = c[k];
  await gravar(chave, patch, quem);
  return { antes: Object.fromEntries(CAMPOS_HORARIO.map((k) => [k, atual[k]])), depois: patch, quando: descreverQuando(c) };
}

/** "Rodar uma vez em tal hora": cria uma linha `uma_vez` que usa a tarefa de um agendamento existente. */
export async function marcarUmaVez(chaveBase: string, quem: string, executarEm: string) {
  const base = await carregar(chaveBase);
  const quando = new Date(executarEm);
  if (Number.isNaN(quando.getTime())) throw new ErroAcao('Data/hora inválida.');
  if (quando.getTime() < Date.now() - 60_000) throw new ErroAcao('Escolha um horário no futuro.');
  const chave = `${base.handler}--uma-vez-${quando.getTime()}`;
  const { error } = await sb.from('agendamentos').insert({
    chave, handler: base.handler, nome: `${base.nome} (uma vez)`, modulo: base.modulo, descricao: base.descricao,
    tipo: 'uma_vez', executar_em: quando.toISOString(), parametros: base.parametros, prioridade: base.prioridade,
    usa_omie: base.usa_omie, grupo: base.grupo, duracao_max_min: base.duracao_max_min, ativo: true,
    criado_por: quem, atualizado_por: quem,
  });
  if (error) throw new ErroAcao(error.code === '23505' ? 'Já existe uma execução marcada nesse horário.' : error.message, error.code === '23505' ? 409 : 500);
  invalidarLista();
  return { chave, quando: descreverQuando({ tipo: 'uma_vez', executar_em: quando.toISOString(), hora: null, intervalo_min: null, dias_semana: null, janela_inicio: null, janela_fim: null, dia_mes: null }) };
}

/** Cancela uma execução "uma vez" que ainda não rodou. */
export async function cancelarUmaVez(chave: string) {
  const ag = await carregar(chave);
  if (ag.tipo !== 'uma_vez') throw new ErroAcao('Só dá para cancelar execuções "uma vez". Para os recorrentes, use Pausar.');
  const { data: rodou } = await sb.from('cron_runs').select('id').eq('job', chave).limit(1);
  if (rodou?.length) throw new ErroAcao('Essa execução já rodou — fica no histórico.', 409);
  const { error } = await sb.from('agendamentos').delete().eq('chave', chave);
  if (error) throw new ErroAcao(error.message, 500);
  invalidarLista();
}
