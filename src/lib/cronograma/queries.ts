// ════════════════════════════════════════════════════════════════════
// Acesso a dados do Cronograma (client-side). Usa o supabase do portal
// (anon + sessão → auth.role()='authenticated', passa na RLS) com
// .schema('cronograma'). Mutações vão por RPC; recálculo via API Route.
// ════════════════════════════════════════════════════════════════════
import { supabase } from '@/lib/supabase';
import { FASES_OS } from './os-template';

const cron = () => supabase.schema('cronograma');

// ── tipos das linhas (espelham o schema) ─────────────────────────────
export interface ProjetoRow {
  id: string;
  nome: string;
  tipo: 'obra_interna' | 'os_maquina';
  status: 'ativo' | 'pausado' | 'concluido' | 'cancelado';
  data_inicio: string;
  data_fim_calc: string | null;
  calendario_id: string | null;
  os_ref: string | null;
  req_grupo_id: number | null;
  conta_omie: string | null;
}
export interface TarefaRow {
  id: string;
  projeto_id: string;
  parent_id: string | null;
  nome: string;
  descricao: string | null;
  tipo: 'tarefa' | 'marco' | 'resumo';
  ordem: number;
  duracao_dias: number;
  restricao: 'asap' | 'iniciar_nao_antes' | 'iniciar_nao_depois' | 'data_fixa';
  restricao_data: string | null;
  status: 'pendente' | 'bloqueada' | 'em_andamento' | 'concluida' | 'cancelada';
  progresso: number;
  prioridade: number;
  recurso_id: string | null;
  inicio_planejado: string | null;
  inicio_real: string | null;
  fim_real: string | null;
  inicio_calc: string | null;
  fim_calc: string | null;
  folga_dias: number | null;
  e_critica: boolean;
}
export interface DependenciaRow {
  id: string;
  projeto_id: string;
  predecessora_id: string;
  sucessora_id: string;
  tipo: 'FS' | 'SS' | 'FF' | 'SF';
  lag_dias: number;
}
export interface RecursoRow {
  id: string; nome: string; tipo: 'pessoa' | 'equipe' | 'maquina';
  calendario_id: string | null; ativo: boolean; ref_externa: string | null;
}
export interface CalendarioRow {
  id: string; nome: string; dias_semana: number[]; horas_por_dia: number;
}
export interface ExcecaoRow {
  id: string; calendario_id: string; data: string; tipo: 'folga' | 'extra';
}

export interface AlocacaoRow { id: string; tarefa_id: string; recurso_id: string; percentual: number; }

export interface ProjetoCompleto {
  projeto: ProjetoRow;
  tarefas: TarefaRow[];
  dependencias: DependenciaRow[];
  recursos: RecursoRow[];
  calendarios: CalendarioRow[];
  excecoes: ExcecaoRow[];
  alocacoes: AlocacaoRow[];
}

// ── projetos ─────────────────────────────────────────────────────────
export async function listarProjetos(): Promise<ProjetoRow[]> {
  const { data, error } = await cron().from('projetos').select('*').order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as ProjetoRow[];
}

export async function criarProjeto(p: {
  nome: string; tipo: 'obra_interna' | 'os_maquina';
  dataInicio?: string; calendarioId?: string | null;
  osRef?: string | null; reqGrupoId?: number | null;
}): Promise<string> {
  const { data, error } = await cron().rpc('cron_criar_projeto', {
    p_nome: p.nome, p_tipo: p.tipo,
    p_data_inicio: p.dataInicio ?? null,
    p_calendario_id: p.calendarioId ?? null,
    p_os_ref: p.osRef ?? null,
    p_req_grupo_id: p.reqGrupoId ?? null,
  });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── vínculos: OS + grupo de requisições ──────────────────────────────
export async function vincularProjeto(projetoId: string, v: { osRef?: string | null; reqGrupoId?: number | null }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (v.osRef !== undefined) patch.os_ref = v.osRef;
  if (v.reqGrupoId !== undefined) patch.req_grupo_id = v.reqGrupoId;
  patch.atualizado_em = new Date().toISOString();
  const { error } = await cron().from('projetos').update(patch).eq('id', projetoId);
  if (error) throw new Error(error.message);
}

export interface OSBuscaRow { id: string; cliente: string; status: string; servSolicitado: string }
export async function buscarOS(termo: string): Promise<OSBuscaRow[]> {
  const qs = termo.trim() ? `termo=${encodeURIComponent(termo.trim())}` : 'abertas=1';
  const r = await fetch(`/api/ppv/ordens-servico?${qs}`);
  return r.ok ? r.json() : [];
}
export interface OSvinculada {
  id: string; cliente: string; status: string;
  previsaoExecucao: string | null; previsaoFaturamento: string | null;
}
export async function carregarOSvinculada(osRef: string): Promise<OSvinculada | null> {
  const { data } = await supabase.from('Ordem_Servico')
    .select('Id_Ordem, Os_Cliente, Status, Previsao_Execucao, Previsao_Faturamento')
    .eq('Id_Ordem', osRef).maybeSingle();
  if (!data) return null;
  const row = data as { Id_Ordem: string; Os_Cliente: string | null; Status: string | null; Previsao_Execucao: string | null; Previsao_Faturamento: string | null };
  return {
    id: row.Id_Ordem, cliente: row.Os_Cliente ?? 'Sem cliente', status: row.Status ?? '—',
    previsaoExecucao: row.Previsao_Execucao, previsaoFaturamento: row.Previsao_Faturamento,
  };
}

// Gera as fases padrão (FASES_OS) encadeadas FS num projeto. A 1ª ancora em
// `inicio` (Previsao_Execucao da OS) se informado. Reusa os RPCs existentes.
export async function gerarTarefasDaOS(projetoId: string, opts: { inicio?: string | null }): Promise<number> {
  let anterior: string | null = null;
  for (let i = 0; i < FASES_OS.length; i++) {
    const f = FASES_OS[i];
    const id = await criarTarefa({
      projetoId, nome: f.nome, duracao: f.duracao,
      restricao: i === 0 && opts.inicio ? 'iniciar_nao_antes' : 'asap',
      restricaoData: i === 0 ? (opts.inicio ?? null) : null,
    });
    if (anterior) await criarDependencia({ projetoId, predecessora: anterior, sucessora: id, tipo: 'FS' });
    anterior = id;
  }
  return FASES_OS.length;
}

export interface GrupoReq { id: number; nome: string; status: string; membros: (number | string)[] }
export async function listarGruposReq(): Promise<GrupoReq[]> {
  const r = await fetch('/api/pos/requisicoes/grupos');
  return r.ok ? r.json() : [];
}
export async function criarGrupoReq(nome: string, criadoPor: string): Promise<GrupoReq> {
  const r = await fetch('/api/pos/requisicoes/grupos', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome, criado_por: criadoPor }),
  });
  if (!r.ok) throw new Error((await r.json().catch(() => ({})))?.error || 'Erro ao criar grupo');
  return r.json();
}

export async function carregarProjeto(projetoId: string): Promise<ProjetoCompleto> {
  const c = cron();
  const [proj, tar, dep, rec, cal, exc] = await Promise.all([
    c.from('projetos').select('*').eq('id', projetoId).single(),
    c.from('tarefas').select('*').eq('projeto_id', projetoId).order('ordem'),
    c.from('dependencias').select('*').eq('projeto_id', projetoId),
    c.from('recursos').select('*').eq('ativo', true).order('nome'),
    c.from('calendarios').select('*').order('nome'),
    c.from('calendario_excecoes').select('*'),
  ]);
  const err = proj.error || tar.error || dep.error || rec.error || cal.error || exc.error;
  if (err) throw new Error(err.message);

  const tarefas = (tar.data ?? []) as TarefaRow[];
  const ids = tarefas.map((t) => t.id);
  let alocacoes: AlocacaoRow[] = [];
  if (ids.length) {
    const { data, error } = await c.from('alocacoes').select('*').in('tarefa_id', ids);
    if (error) throw new Error(error.message);
    alocacoes = (data ?? []) as AlocacaoRow[];
  }

  return {
    projeto: proj.data as ProjetoRow,
    tarefas,
    dependencias: (dep.data ?? []) as DependenciaRow[],
    recursos: (rec.data ?? []) as RecursoRow[],
    calendarios: (cal.data ?? []) as CalendarioRow[],
    excecoes: (exc.data ?? []) as ExcecaoRow[],
    alocacoes,
  };
}

// ── tarefas ──────────────────────────────────────────────────────────
export async function criarTarefa(p: {
  projetoId: string; nome: string; duracao?: number; recursoId?: string | null;
  parentId?: string | null; restricao?: TarefaRow['restricao']; restricaoData?: string | null;
  descricao?: string | null; prioridade?: number; tipo?: TarefaRow['tipo'];
}): Promise<string> {
  const { data, error } = await cron().rpc('cron_criar_tarefa', {
    p_projeto_id: p.projetoId, p_nome: p.nome, p_duracao: p.duracao ?? 1,
    p_recurso_id: p.recursoId ?? null, p_parent_id: p.parentId ?? null,
    p_restricao: p.restricao ?? 'asap', p_restricao_data: p.restricaoData ?? null,
    p_descricao: p.descricao ?? null, p_prioridade: p.prioridade ?? 0, p_tipo: p.tipo ?? 'tarefa',
  });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function atualizarTarefa(tarefaId: string, campos: {
  nome?: string; duracao?: number; recursoId?: string | null;
  restricao?: TarefaRow['restricao']; restricaoData?: string | null;
  ordem?: number; parentId?: string | null; descricao?: string | null; prioridade?: number;
}): Promise<void> {
  const { error } = await cron().rpc('cron_atualizar_tarefa', {
    p_tarefa_id: tarefaId,
    p_nome: campos.nome ?? null,
    p_duracao: campos.duracao ?? null,
    p_recurso_id: campos.recursoId ?? null,
    p_restricao: campos.restricao ?? null,
    p_restricao_data: campos.restricaoData ?? null,
    p_ordem: campos.ordem ?? null,
    p_parent_id: campos.parentId ?? null,
    p_descricao: campos.descricao ?? null,
    p_prioridade: campos.prioridade ?? null,
  });
  if (error) throw new Error(error.message);
}

export async function registrarProgresso(p: {
  tarefaId: string; progresso: number; inicioReal?: string | null; fimReal?: string | null;
}): Promise<{ status: string; aviso: string | null }> {
  const { data, error } = await cron().rpc('cron_registrar_progresso', {
    p_tarefa_id: p.tarefaId, p_progresso: p.progresso,
    p_inicio_real: p.inicioReal ?? null, p_fim_real: p.fimReal ?? null,
  });
  if (error) throw new Error(error.message);
  const row = Array.isArray(data) ? data[0] : data;
  return { status: row?.status, aviso: row?.aviso ?? null };
}

// ── dependências ─────────────────────────────────────────────────────
export async function criarDependencia(p: {
  projetoId: string; predecessora: string; sucessora: string;
  tipo?: DependenciaRow['tipo']; lag?: number;
}): Promise<string> {
  const { data, error } = await cron().rpc('cron_criar_dependencia', {
    p_projeto_id: p.projetoId, p_predecessora: p.predecessora, p_sucessora: p.sucessora,
    p_tipo: p.tipo ?? 'FS', p_lag: p.lag ?? 0,
  });
  if (error) throw new Error(error.message); // ex.: "Dependência criaria um ciclo"
  return data as string;
}

export async function removerDependencia(id: string): Promise<void> {
  const { error } = await cron().rpc('cron_remover_dependencia', { p_id: id });
  if (error) throw new Error(error.message);
}

// ── recálculo autoritativo (API Route) ───────────────────────────────
export async function recalcular(projetoId: string): Promise<{ ok: boolean; saida?: unknown; error?: string }> {
  const r = await fetch('/api/cronograma/recalcular', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ projetoId }),
  });
  return r.json();
}

// ════════════════════════════════════════════════════════════════════
// Fase 4 — calendários, recursos, exceções e alocações.
// CRUD por escrita direta (RLS global = authenticated). Sem regra de
// negócio especial → não precisa de RPC. (AlocacaoRow definido acima.)
// ════════════════════════════════════════════════════════════════════

// ── calendários ──────────────────────────────────────────────────────
export async function listarCalendarios(): Promise<CalendarioRow[]> {
  const { data, error } = await cron().from('calendarios').select('*').order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as CalendarioRow[];
}
export async function criarCalendario(c: { nome: string; diasSemana: number[]; horasPorDia?: number }): Promise<string> {
  const { data, error } = await cron().from('calendarios')
    .insert({ nome: c.nome, dias_semana: c.diasSemana, horas_por_dia: c.horasPorDia ?? 8 })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
export async function atualizarCalendario(id: string, c: { nome?: string; diasSemana?: number[]; horasPorDia?: number }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (c.nome !== undefined) patch.nome = c.nome;
  if (c.diasSemana !== undefined) patch.dias_semana = c.diasSemana;
  if (c.horasPorDia !== undefined) patch.horas_por_dia = c.horasPorDia;
  const { error } = await cron().from('calendarios').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}
export async function removerCalendario(id: string): Promise<void> {
  const { error } = await cron().from('calendarios').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── exceções de calendário ───────────────────────────────────────────
export async function listarExcecoes(calendarioId: string): Promise<ExcecaoRow[]> {
  const { data, error } = await cron().from('calendario_excecoes')
    .select('*').eq('calendario_id', calendarioId).order('data');
  if (error) throw new Error(error.message);
  return (data ?? []) as ExcecaoRow[];
}
export async function addExcecao(e: { calendarioId: string; data: string; tipo: 'folga' | 'extra'; descricao?: string }): Promise<void> {
  const { error } = await cron().from('calendario_excecoes')
    .insert({ calendario_id: e.calendarioId, data: e.data, tipo: e.tipo, descricao: e.descricao ?? null });
  if (error) throw new Error(error.message);
}
export async function removerExcecao(id: string): Promise<void> {
  const { error } = await cron().from('calendario_excecoes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── recursos ─────────────────────────────────────────────────────────
export async function listarRecursos(): Promise<RecursoRow[]> {
  const { data, error } = await cron().from('recursos').select('*').order('nome');
  if (error) throw new Error(error.message);
  return (data ?? []) as RecursoRow[];
}
export async function criarRecurso(r: { nome: string; tipo: RecursoRow['tipo']; calendarioId?: string | null; refExterna?: string | null }): Promise<string> {
  const { data, error } = await cron().from('recursos')
    .insert({ nome: r.nome, tipo: r.tipo, calendario_id: r.calendarioId ?? null, ref_externa: r.refExterna ?? null })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
export async function atualizarRecurso(id: string, r: { nome?: string; tipo?: RecursoRow['tipo']; calendarioId?: string | null; ativo?: boolean }): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (r.nome !== undefined) patch.nome = r.nome;
  if (r.tipo !== undefined) patch.tipo = r.tipo;
  if (r.calendarioId !== undefined) patch.calendario_id = r.calendarioId;
  if (r.ativo !== undefined) patch.ativo = r.ativo;
  const { error } = await cron().from('recursos').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

// ── alocações (tarefa ↔ recurso) ─────────────────────────────────────
export async function listarAlocacoesDoProjeto(projetoId: string): Promise<AlocacaoRow[]> {
  // alocacoes não tem projeto_id; join via tarefas do projeto
  const { data: tars, error: e1 } = await cron().from('tarefas').select('id').eq('projeto_id', projetoId);
  if (e1) throw new Error(e1.message);
  const ids = (tars ?? []).map((t) => (t as { id: string }).id);
  if (ids.length === 0) return [];
  const { data, error } = await cron().from('alocacoes').select('*').in('tarefa_id', ids);
  if (error) throw new Error(error.message);
  return (data ?? []) as AlocacaoRow[];
}
export async function alocar(a: { tarefaId: string; recursoId: string; percentual: number }): Promise<void> {
  const { error } = await cron().from('alocacoes')
    .upsert({ tarefa_id: a.tarefaId, recurso_id: a.recursoId, percentual: a.percentual }, { onConflict: 'tarefa_id,recurso_id' });
  if (error) throw new Error(error.message);
}
export async function desalocar(id: string): Promise<void> {
  const { error } = await cron().from('alocacoes').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ── excluir tarefa (cascade remove deps/alocações) ───────────────────
export async function removerTarefa(id: string): Promise<void> {
  const { error } = await cron().from('tarefas').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

// ════════════════════════════════════════════════════════════════════
// Fase 5 — baselines (linha de base)
// ════════════════════════════════════════════════════════════════════
export interface BaselineRow { id: string; projeto_id: string; nome: string; criado_em: string; }
export interface BaselineTarefaRow { baseline_id: string; tarefa_id: string; inicio: string | null; fim: string | null; }

export async function listarBaselines(projetoId: string): Promise<BaselineRow[]> {
  const { data, error } = await cron().from('baselines').select('*').eq('projeto_id', projetoId).order('criado_em', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as BaselineRow[];
}
export async function salvarBaseline(projetoId: string, nome: string): Promise<string> {
  const { data, error } = await cron().rpc('cron_salvar_baseline', { p_projeto_id: projetoId, p_nome: nome });
  if (error) throw new Error(error.message);
  return data as string;
}
export async function removerBaseline(id: string): Promise<void> {
  const { error } = await cron().rpc('cron_remover_baseline', { p_id: id });
  if (error) throw new Error(error.message);
}
export async function listarBaselineTarefas(baselineId: string): Promise<BaselineTarefaRow[]> {
  const { data, error } = await cron().from('baseline_tarefas').select('*').eq('baseline_id', baselineId);
  if (error) throw new Error(error.message);
  return (data ?? []) as BaselineTarefaRow[];
}

// ════════════════════════════════════════════════════════════════════
// Fase 6 — recorrências de manutenção
// ════════════════════════════════════════════════════════════════════
export interface RecorrenciaRow {
  id: string; projeto_id: string; nome: string;
  base: 'intervalo_dias' | 'horimetro'; intervalo: number; duracao_dias: number;
  recurso_id: string | null; trator_ref: string | null;
  ancora_data: string; ancora_horimetro: number | null; horizonte_meses: number; ativo: boolean;
}

export async function listarRecorrencias(projetoId: string): Promise<RecorrenciaRow[]> {
  const { data, error } = await cron().from('recorrencias').select('*').eq('projeto_id', projetoId).order('criado_em');
  if (error) throw new Error(error.message);
  return (data ?? []) as RecorrenciaRow[];
}
export async function criarRecorrencia(r: {
  projetoId: string; nome: string; base: RecorrenciaRow['base']; intervalo: number;
  duracaoDias?: number; recursoId?: string | null; ancoraData?: string; horizonteMeses?: number;
}): Promise<string> {
  const { data, error } = await cron().from('recorrencias')
    .insert({
      projeto_id: r.projetoId, nome: r.nome, base: r.base, intervalo: r.intervalo,
      duracao_dias: r.duracaoDias ?? 1, recurso_id: r.recursoId ?? null,
      ancora_data: r.ancoraData ?? new Date().toISOString().slice(0, 10),
      horizonte_meses: r.horizonteMeses ?? 12,
    })
    .select('id').single();
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}
export async function removerRecorrencia(id: string): Promise<void> {
  const { error } = await cron().from('recorrencias').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
export async function gerarOcorrencias(p: { recorrenciaId: string; ate?: string | null; mediaHorasDia?: number | null }): Promise<number> {
  const { data, error } = await cron().rpc('cron_gerar_ocorrencias', {
    p_recorrencia_id: p.recorrenciaId, p_ate: p.ate ?? null, p_media_horas_dia: p.mediaHorasDia ?? null,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ── recálculo dos projetos afetados por um calendário ────────────────
// Disparado ao salvar um calendário usado por projetos ativos (a
// disponibilidade mudou). Considera o calendário padrão do projeto e os
// recursos que usam o calendário.
export async function recalcularProjetosDoCalendario(calendarioId: string): Promise<void> {
  const c = cron();
  const [porProjeto, recursos] = await Promise.all([
    c.from('projetos').select('id').eq('status', 'ativo').eq('calendario_id', calendarioId),
    c.from('recursos').select('id').eq('calendario_id', calendarioId),
  ]);
  const ids = new Set<string>(((porProjeto.data ?? []) as { id: string }[]).map((p) => p.id));
  const recIds = ((recursos.data ?? []) as { id: string }[]).map((r) => r.id);
  if (recIds.length) {
    const { data: tars } = await c.from('tarefas').select('projeto_id').in('recurso_id', recIds);
    for (const t of (tars ?? []) as { projeto_id: string }[]) ids.add(t.projeto_id);
  }
  await Promise.all([...ids].map((id) => recalcular(id)));
}
