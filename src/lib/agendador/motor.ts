// Motor do agendador: um laço a cada 30 s dentro do portal (Railway) que lê a tabela
// `agendamentos` e roda o que está na hora. Substitui os setInterval do
// instrumentation.ts e, na Etapa 3, os crons do GitHub (que atrasam horas).
// Plano: docs/omie-fila-agendador-plano.md (Etapa 2).
//
// - Última execução de cada agendamento: lida do cron_runs na subida (rodada
//   "interrompida" não conta — um diário que morreu num deploy roda de novo) e
//   mantida em memória depois (tudo que roda passa por `executar`).
// - Um por vez por agendamento; e no máximo um por `grupo` (ex.: syncs pesados).
// - A vez de cada horário é pega no banco (`agendador_vez`, sql/agendador-vez.sql):
//   com dois processos rodando o agendador (web sem PAPEL=web + worker, 22/10/2026),
//   só um roda cada horário. Sem a tabela, roda como antes.
// - SIGTERM (deploy): rodadas abertas viram "interrompida".
// - Avisos no sino só para Devs: falhou 2 vezes seguidas; Omie bloqueada > 30 min.
// - Limpeza diária do cron_runs (ok/pulado > 45 dias; o resto > 180 dias).

import { supabaseAdmin as sb } from '@/lib/server/supabase-admin';
import { comCronRun, fecharOrfas, marcarInterrompidas, type CronRunResultado } from '@/lib/cron/observar';
import { estadoPorta } from '@/lib/omie/porta';
import { filtrarDestinatarios, type PrefsDestinatario } from '@/lib/notif/prefs';
import { estaNaHora, falhouDuasSeguidas, type Agendamento } from './regras';
import { TAREFAS, type ResultadoTarefa } from './tarefas';

const LACO_MS = 30_000;
const BLOQUEIO_AVISO_MS = 30 * 60_000;

interface EstadoMotor {
  ligado: boolean;
  bootEm: Date;
  timer: ReturnType<typeof setInterval> | null;
  rodando: Map<string, { desde: number; disparadoPor: string; quem?: string }>;
  ultima: Map<string, Date>;
  ultimaCarregada: boolean;
  lista: Agendamento[];
  listaEm: number;
  ultimaLimpeza: string;
  avisados: Set<string>;          // `${tipo}|${chave}|${dia}` — no máximo 1 aviso por dia
  bloqueioVisto: Map<string, number>;
  ultimoTick: number;
  ultimoErroTick: string | null;
}

const G = globalThis as unknown as { __agendador?: EstadoMotor };
function estado(): EstadoMotor {
  return (G.__agendador ??= {
    ligado: false, bootEm: new Date(), timer: null, rodando: new Map(), ultima: new Map(),
    ultimaCarregada: false, lista: [], listaEm: 0, ultimaLimpeza: '', avisados: new Set(),
    bloqueioVisto: new Map(), ultimoTick: 0, ultimoErroTick: null,
  });
}

const log = (m: string) => console.log(`[agendador] ${m}`);
const hojeSP = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);
const tabelaFalta = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''));

// ── Leitura ────────────────────────────────────────────────────────────────────

/** Lê os agendamentos. null = tabela não existe (migration sql/agendador.sql não aplicada). */
export async function lerAgendamentos(): Promise<Agendamento[] | null> {
  const { data, error } = await sb.from('agendamentos').select('*').order('chave');
  if (tabelaFalta(error)) return null;
  if (error) throw new Error(error.message);
  const s = estado();
  s.lista = (data || []) as Agendamento[];
  s.listaEm = Date.now();
  return s.lista;
}

async function carregarUltimas(chaves: string[]): Promise<void> {
  const s = estado();
  await Promise.all(chaves.filter((c) => !s.ultima.has(c)).map(async (job) => {
    const { data } = await sb.from('cron_runs').select('iniciado_em,status').eq('job', job)
      .order('iniciado_em', { ascending: false }).limit(5);
    const r = (data || []).find((x) => x.status !== 'interrompida');
    if (r) s.ultima.set(job, new Date(r.iniciado_em));
  }));
  s.ultimaCarregada = true;
}

// ── Execução ───────────────────────────────────────────────────────────────────

export type ResultadoExecutar =
  | { ok: true; iniciou: true }
  | { ok: false; motivo: 'ja_rodando' | 'grupo_ocupado' | 'sem_tarefa' | 'desconhecido'; mensagem: string };

/** O que impede de rodar agora neste processo (null = pode). */
function impedimento(ag: Agendamento): Extract<ResultadoExecutar, { ok: false }> | null {
  const s = estado();
  if (s.rodando.has(ag.chave)) return { ok: false, motivo: 'ja_rodando', mensagem: 'Já está rodando.' };
  if (ag.grupo) {
    const outro = [...s.rodando.keys()].find((c) => s.lista.find((a) => a.chave === c)?.grupo === ag.grupo);
    if (outro) return { ok: false, motivo: 'grupo_ocupado', mensagem: `Aguardando "${outro}" terminar (mesmo grupo).` };
  }
  if (!TAREFAS[ag.handler]) return { ok: false, motivo: 'sem_tarefa', mensagem: `Tarefa "${ag.handler}" não existe no código.` };
  return null;
}

/** Começa a rodar um agendamento (não espera terminar). */
export function executar(ag: Agendamento, disparadoPor: 'agendador' | 'botao' | 'marcado', quem?: string): ResultadoExecutar {
  const s = estado();
  const imp = impedimento(ag);
  if (imp) return imp;
  const tarefa = TAREFAS[ag.handler];

  s.rodando.set(ag.chave, { desde: Date.now(), disparadoPor, quem });
  s.ultima.set(ag.chave, new Date());
  // botão: avisa o outro processo que este horário já rodou
  if (disparadoPor === 'botao') void pegarVez(ag.chave, null, true).then((v) => { if (v?.ok) s.ultima.set(ag.chave, v.ultima); });
  void (async () => {
    let r: CronRunResultado<ResultadoTarefa> | null = null;
    try {
      r = await comCronRun<ResultadoTarefa>(ag.chave, () => tarefa(ag.parametros || {}, { chave: ag.chave }), {
        lockMinutos: ag.duracao_max_min,
        prioridade: ag.prioridade,
        disparadoPor,
        quem,
        fechamento: (res) => (res?.pular
          ? { status: 'pulado', detalhe: res.pular }
          : { detalhe: res?.resumo, progresso: res?.progresso }),
      });
    } catch (e) {
      log(`${ag.chave} falhou fora do registro: ${(e as Error).message}`);
    } finally {
      s.rodando.delete(ag.chave);
    }
    if (r?.erro) {
      log(`${ag.chave}: ${r.erro}`);
      await avisarSeFalhouDuas(ag).catch(() => {});
    }
  })();
  return { ok: true, iniciou: true };
}

// ── A vez no banco (dois processos com agendador) ──────────────────────────────

const DONO = `${(process.env.PAPEL || 'tudo').trim().toLowerCase()}-${process.pid}`;
let vezIndisponivel = 0; // até quando não tentar (tabela faltando / banco fora)

/**
 * Pega a vez de rodar `chave` no banco. `visto` = última rodada que este processo
 * conhece. null = sem coordenação (sem a tabela ou banco fora): roda como antes.
 */
async function pegarVez(chave: string, visto: Date | null, forcar = false): Promise<{ ok: boolean; ultima: Date } | null> {
  if (Date.now() < vezIndisponivel) return null;
  const { data, error } = await sb.rpc('agendador_pegar_vez', {
    p_chave: chave, p_visto: visto ? visto.toISOString() : null, p_dono: DONO, p_forcar: forcar,
  });
  const linha = Array.isArray(data) ? data[0] : data;
  if (error || !linha?.ultima_em) {
    log(`vez no banco indisponível (${error?.message || 'sem resposta'}) — rodando sem coordenação por 10 min${tabelaFalta(error) || /agendador_pegar_vez/.test(error?.message || '') ? '; aplicar sql/agendador-vez.sql' : ''}`);
    vezIndisponivel = Date.now() + 10 * 60_000;
    return null;
  }
  return { ok: linha.ok === true, ultima: new Date(linha.ultima_em) };
}

/** A rodada que pegou a vez em `ultima` morreu num deploy? (então este horário roda de novo) */
async function foiInterrompida(chave: string, ultima: Date): Promise<boolean> {
  const { data } = await sb.from('cron_runs').select('status').eq('job', chave)
    .gte('iniciado_em', new Date(ultima.getTime() - 10_000).toISOString())
    .order('iniciado_em', { ascending: true }).limit(1);
  return data?.[0]?.status === 'interrompida';
}

/** Roda pelo laço só se este processo pegar a vez; senão aprende a hora da rodada do outro. */
async function rodarSeForMinhaVez(ag: Agendamento): Promise<void> {
  const s = estado();
  if (impedimento(ag)) return; // não gasta a vez se não pode rodar aqui
  let vez = await pegarVez(ag.chave, s.ultima.get(ag.chave) ?? null);
  if (vez && !vez.ok && await foiInterrompida(ag.chave, vez.ultima)) vez = await pegarVez(ag.chave, vez.ultima);
  if (vez && !vez.ok) {
    s.ultima.set(ag.chave, vez.ultima); // o outro processo já rodou este horário
    return;
  }
  const r = executar(ag, ag.tipo === 'uma_vez' ? 'marcado' : 'agendador');
  if (r.ok && vez) s.ultima.set(ag.chave, vez.ultima); // hora do banco: a próxima comparação bate exata
}

// ── Avisos (só Devs) ───────────────────────────────────────────────────────────

async function notificarDevs(titulo: string, descricao: string, chaveAviso: string): Promise<void> {
  const s = estado();
  const k = `${chaveAviso}|${hojeSP()}`;
  if (s.avisados.has(k)) return;
  s.avisados.add(k);
  const { data } = await sb.from('portal_permissoes').select('user_id, categoria, notif_silenciado').eq('is_dev', true);
  const ids = filtrarDestinatarios('agendamentos', (data || []) as PrefsDestinatario[]);
  if (!ids.length) return;
  await sb.from('portal_notificacoes').insert(ids.map((user_id) => ({
    user_id, tipo: 'agendamentos', titulo, descricao, link: '/agendamentos',
  })));
}

async function avisarSeFalhouDuas(ag: Agendamento): Promise<void> {
  const { data } = await sb.from('cron_runs').select('status').eq('job', ag.chave)
    .order('iniciado_em', { ascending: false }).limit(6);
  if (!falhouDuasSeguidas((data || []).map((x) => String(x.status)))) return;
  await notificarDevs(`Agendamento falhou 2 vezes: ${ag.nome}`, 'As duas últimas rodadas terminaram em erro. Veja o detalhe em /agendamentos.', `falha|${ag.chave}`);
}

async function avisarBloqueiosLongos(): Promise<void> {
  const s = estado();
  const agora = Date.now();
  const ativos = new Set<string>();
  for (const b of estadoPorta().bloqueios) {
    const k = `${b.conta}|${b.metodo}`;
    ativos.add(k);
    if (!s.bloqueioVisto.has(k)) s.bloqueioVisto.set(k, agora);
    if (agora - s.bloqueioVisto.get(k)! >= BLOQUEIO_AVISO_MS) {
      await notificarDevs(`Omie bloqueada há mais de 30 min: ${b.conta}`,
        `${b.metodo} — até ${new Date(b.ate).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' })}. ${b.motivo.slice(0, 160)}`,
        `bloqueio|${k}`);
    }
  }
  for (const k of [...s.bloqueioVisto.keys()]) if (!ativos.has(k)) s.bloqueioVisto.delete(k);
}

// ── Manutenção ─────────────────────────────────────────────────────────────────

async function baterBatida(): Promise<void> {
  const s = estado();
  await sb.from('agendador_estado').upsert({
    id: 1, batida_em: new Date().toISOString(), iniciado_em: s.bootEm.toISOString(),
    versao: (process.env.RAILWAY_GIT_COMMIT_SHA || '').slice(0, 8) || null,
  });
}

async function limparHistorico(): Promise<void> {
  const s = estado();
  const dia = hojeSP();
  const hora = new Date(Date.now() - 3 * 3600_000).getUTCHours();
  if (s.ultimaLimpeza === dia || hora < 3) return; // uma vez por dia, de madrugada (ou no 1º tick depois das 3h)
  s.ultimaLimpeza = dia;
  const d45 = new Date(Date.now() - 45 * 86_400_000).toISOString();
  const d180 = new Date(Date.now() - 180 * 86_400_000).toISOString();
  await sb.from('cron_runs').delete().in('status', ['ok', 'pulado']).lt('iniciado_em', d45);
  await sb.from('cron_runs').delete().lt('iniciado_em', d180);
}

// ── Laço ───────────────────────────────────────────────────────────────────────

async function tick(): Promise<void> {
  const s = estado();
  s.ultimoTick = Date.now();
  try {
    await baterBatida();
    const lista = await lerAgendamentos();
    if (!lista) { s.ultimoErroTick = 'tabela agendamentos não existe'; return; }
    if (!s.ultimaCarregada || lista.some((a) => !s.ultima.has(a.chave))) await carregarUltimas(lista.map((a) => a.chave));
    const agora = new Date();
    for (const ag of lista) {
      if (s.rodando.has(ag.chave)) continue;
      if (estaNaHora(ag, s.ultima.get(ag.chave) ?? null, agora)) await rodarSeForMinhaVez(ag);
    }
    await avisarBloqueiosLongos();
    await limparHistorico();
    s.ultimoErroTick = null;
  } catch (e) {
    s.ultimoErroTick = (e as Error).message;
    log('volta do laço falhou: ' + (e as Error).message);
  }
}

/**
 * Liga o agendador (só produção; chamado pelo instrumentation.ts). Devolve true se a
 * tabela `agendamentos` existe — aí o instrumentation NÃO liga os setInterval antigos.
 * AGENDADOR=off desliga (o instrumentation volta aos agendadores antigos).
 */
export async function iniciarAgendador(): Promise<boolean> {
  const s = estado();
  if (s.ligado) return true;
  if (process.env.AGENDADOR === 'off') { log('desligado (AGENDADOR=off)'); return false; }
  let lista: Agendamento[] | null;
  try { lista = await lerAgendamentos(); } catch (e) { log('não consegui ler agendamentos: ' + (e as Error).message); return false; }
  if (!lista) { log('tabela agendamentos não existe — aplicar sql/agendador.sql. Seguindo com os agendadores antigos.'); return false; }

  s.ligado = true;
  s.bootEm = new Date();
  const orfas = await fecharOrfas(s.bootEm);
  if (orfas) log(`${orfas} rodada(s) que ficaram abertas no processo anterior marcadas como interrompidas`);
  s.timer = setInterval(() => { tick().catch(() => {}); }, LACO_MS);
  setTimeout(() => { tick().catch(() => {}); }, 60_000); // 1ª volta ~1 min depois do boot
  const proc = process as unknown as { once?: (ev: string, fn: () => void) => void };
  proc.once?.('SIGTERM', () => { marcarInterrompidas().catch(() => {}); });
  log(`LIGADO — ${lista.length} agendamento(s), laço a cada ${LACO_MS / 1000}s`);
  return true;
}

/** Para a tela: o que está rodando agora e a saúde do laço. */
export function estadoMotor() {
  const s = estado();
  return {
    ligado: s.ligado,
    bootEm: s.bootEm.toISOString(),
    ultimoTick: s.ultimoTick ? new Date(s.ultimoTick).toISOString() : null,
    ultimoErroTick: s.ultimoErroTick,
    rodando: [...s.rodando.entries()].map(([chave, r]) => ({ chave, desde: new Date(r.desde).toISOString(), disparadoPor: r.disparadoPor, quem: r.quem ?? null })),
  };
}

/** A tela mudou um agendamento: relê na próxima volta. */
export function invalidarLista(): void {
  estado().listaEm = 0;
}
