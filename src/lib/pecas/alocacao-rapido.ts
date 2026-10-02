// Demanda de ALOCAÇÃO — caminho RÁPIDO: relê na Omie só as notas RECENTES (emitidas
// nos últimos 45 dias, ~25 s por conta, as duas em paralelo) e roda o motor.
//
// Por quê: o sync completo de recebimentos leva ~20 min e o GitHub só o dispara 3–4
// vezes por dia — a peça recebida levava HORAS para virar demanda (medido em
// 01/10/2026). Três gatilhos usam isto:
//   1. agendador interno (src/instrumentation.ts) a cada 10 min, seg–sáb 07h–20h BRT;
//   2. botão "Verificar agora" do painel (POST /api/pecas/alocacao);
//   3. conclusão da entrada pelo portal (rotas dar-entrada-recebimento e concluir).
// O sync completo continua existindo: cobre a nota antiga recebida tarde (~4%).
//
// Arquivo separado de alocacao-server.ts porque importa o sync de recebimentos
// (lib/estoque) — e alocacao-server é importado por ajustes/caracteristicas.ts.
import { getContasOmie, type Conta } from '@/lib/estoque/conta';
import { sincronizarRecebimentosRecentes, type RecebRecentesResultado } from '@/lib/estoque/recebimentos';
import { comCronRun } from '@/lib/cron/observar';
import { sincronizarAlocacao, type ResultadoAlocacao } from './alocacao-server';
import { dentroDoHorarioComercial } from './alocacao';

export const DIAS_RECENTES = 45;

export interface ResultadoRapido {
  sync: RecebRecentesResultado[];
  alocacao: ResultadoAlocacao;
}

/** Sync das notas recentes (contas em paralelo: chaves Omie diferentes) + motor. */
export async function verificarAlocacaoRapido(opts: { contas?: Conta[]; dias?: number } = {}): Promise<ResultadoRapido> {
  const contas = opts.contas?.length ? opts.contas : getContasOmie().map((c) => c.id);
  const sync = await Promise.all(contas.map((c) => sincronizarRecebimentosRecentes(c, opts.dias ?? DIAS_RECENTES)));
  // erro de leitura numa conta não impede o motor: ele trabalha com o que o espelho tem
  const alocacao = await sincronizarAlocacao();
  return { sync, alocacao };
}

/**
 * Depois de concluir uma entrada pelo portal: espera a Omie assentar o recebimento
 * (o produto criado na entrada só ganha id depois de concluir) e verifica aquela conta.
 * Em segundo plano — nunca lança nem segura a resposta da rota.
 */
export function verificarAlocacaoDepoisDaEntrada(conta: Conta | undefined | null, esperaMs = 8000): void {
  setTimeout(() => {
    verificarAlocacaoRapido(conta ? { contas: [conta] } : {})
      .then((r) => {
        const a = r.alocacao;
        if (a.abertas || a.fechadas) console.log(`[alocacao] pós-entrada ${conta ?? 'todas'}: abertas=${a.abertas} fechadas=${a.fechadas}`);
      })
      .catch((e) => console.error('[alocacao] pós-entrada falhou:', (e as Error).message));
  }, esperaMs);
}

/**
 * Rodada do agendador interno. Fora do horário comercial não faz nada (devolve null).
 * Registra em cron_runs (job `pecas-alocacao-rapido`); a trava evita sobreposição.
 */
export async function rodarAlocacaoRapidoAgendado(agora: Date = new Date()): Promise<string | null> {
  if (!dentroDoHorarioComercial(agora)) return null;
  const r = await comCronRun('pecas-alocacao-rapido', async () => {
    const res = await verificarAlocacaoRapido();
    const erros = res.sync.filter((s) => s.erro).map((s) => `${s.conta}: ${s.erro}`);
    // sync falhou nas DUAS contas → marca a rodada como erro (aparece em cron_runs)
    if (erros.length === res.sync.length && erros.length > 0) throw new Error(erros.join(' | '));
    return res;
  }, { lockMinutos: 8 });
  if (r.pulado) return 'pulado (rodada anterior ainda aberta)';
  if (r.erro) return 'erro: ' + r.erro;
  const a = r.resultado!.alocacao;
  if (a.pulado) return a.pulado;
  // só fala quando aconteceu algo — a cada 10 min, log vazio vira ruído
  return a.abertas || a.fechadas ? `abertas=${a.abertas} (${a.pecasNovas} peças) fechadas=${a.fechadas} notificados=${a.notificados}` : null;
}
