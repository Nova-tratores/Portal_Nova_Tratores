// Registro das tarefas do agendador: `agendamentos.handler` → função que roda.
// Cada tarefa devolve um resumo curto (vai para cron_runs.detalhe) ou lança erro.
// Devolver `{ pular: 'motivo' }` = não havia o que fazer/desligada; não conta como erro.
//
// Regra: a tarefa NÃO se registra no cron_runs sozinha — quem registra é o motor
// (src/lib/agendador/motor.ts). Os interruptores por variável de ambiente que
// existiam no instrumentation.ts continuam valendo aqui.
// Imports dinâmicos: só carrega o módulo da tarefa quando ela roda.

export type ResultadoTarefa = { resumo?: string; pular?: string; progresso?: Record<string, string> };
export type Tarefa = (parametros: Record<string, unknown>) => Promise<ResultadoTarefa>;

const desligada = (env: string) => process.env[env] === 'off';
const baseInterna = () => `http://127.0.0.1:${process.env.PORT || 3000}`;

export const TAREFAS: Record<string, Tarefa> = {
  'pecas-alocacao-rapido': async () => {
    if (desligada('ALOCACAO_RAPIDO')) return { pular: 'desligado (ALOCACAO_RAPIDO=off)' };
    const { verificarAlocacaoRapido } = await import('@/lib/pecas/alocacao-rapido');
    const res = await verificarAlocacaoRapido();
    const erros = res.sync.filter((s) => s.erro).map((s) => `${s.conta}: ${s.erro}`);
    if (erros.length === res.sync.length && erros.length > 0) throw new Error(erros.join(' | '));
    const a = res.alocacao;
    if (a.pulado) return { resumo: a.pulado };
    return { resumo: `abertas ${a.abertas} (${a.pecasNovas} peças) · fechadas ${a.fechadas}${erros.length ? ` · ${erros.join(' | ')}` : ''}` };
  },

  'notas-cache-docs': async () => {
    if (desligada('NOTAS_CACHE')) return { pular: 'desligado (NOTAS_CACHE=off)' };
    const { indexarNotas, guardarLote } = await import('@/lib/notas/cache-docs');
    const idx = await indexarNotas();
    const lote = await guardarLote({ limite: 120 });
    const resumo = `indexadas e:${idx.entrada} s:${idx.saida}${idx.erro ? ` (erro ao indexar: ${idx.erro})` : ''} · lote ${lote.processadas}: ${lote.completas} completas, ${lote.parciais} parciais, ${lote.pendentes} pendentes, ${lote.falhas} falhas`;
    if (lote.paradoPor) return { resumo: `${resumo} — parou: ${lote.paradoPor} ${lote.erro || ''}`.trim() };
    return { resumo };
  },

  // Chama a função da rota DENTRO do processo (não por HTTP): a rodada pode passar de
  // 5 min, e o fetch do Node desiste em 300 s ("fetch failed") enquanto a rota segue
  // rodando — a próxima começava por cima. Assim o agendador sabe quando terminou e a
  // prioridade na fila da Omie vem junto.
  'clientes-sync-recente': async () => {
    const { GET } = await import('@/app/api/clientes/sync-recente/route');
    const r = await GET(new Request(`${baseInterna()}/api/clientes/sync-recente`));
    const d = (await r.json().catch(() => ({}))) as {
      error?: string;
      resultado?: Record<string, { os_novas: number; pv_novos: number; nfs: number }>;
      cards_financeiro_disparados?: number;
      tempos_ms?: Record<string, number>;
    };
    if (!r.ok) throw new Error(d.error || `sync-recente respondeu HTTP ${r.status}`);
    const partes = Object.entries(d.resultado || {}).map(([emp, x]) => `${emp.replace(/_/g, ' ')}: ${x.os_novas} OS, ${x.pv_novos} PV, ${x.nfs} NF`);
    if (d.cards_financeiro_disparados) partes.push(`${d.cards_financeiro_disparados} card(s) no financeiro`);
    // Tempo de cada parte da rodada (aparece no Histórico ao abrir a linha).
    const progresso = Object.fromEntries(Object.entries(d.tempos_ms || {}).map(([k, ms]) => [k, `${(ms / 1000).toFixed(1)} s`]));
    return { resumo: partes.join(' · ') || 'ok', progresso };
  },

  'tratorilson-relatorios': async () => {
    const { processarLoteRelatorios } = await import('@/lib/pos/atualizar-relatorio');
    const r = await processarLoteRelatorios('Tratorilson (auto)');
    if (!r.ok && !r.erros) return { resumo: 'nenhuma OS em Relatório Concluído' };
    const falhas = r.resultados.filter((x) => !x.ok).map((x) => `${x.os}: ${x.erro || 'erro'}`);
    return { resumo: `${r.ok} OS (${r.paraEnviarOmie} p/ Omie, ${r.paraPreenchido} Preenchido Garantia, ${r.erros} erro)${falhas.length ? ` — ${falhas.join(' · ')}` : ''}` };
  },

  'pos-faturamento-reconciliar': async () => {
    if (desligada('POS_FATURAR_RECONCILIAR')) return { pular: 'desligado (POS_FATURAR_RECONCILIAR=off)' };
    const { rodarReconciliacaoFaturamento } = await import('@/lib/pos/faturamento');
    return { resumo: (await rodarReconciliacaoFaturamento()) || 'nada pendente' };
  },

  'frota-pendencias-sync': async () => {
    if (desligada('FROTA_PENDENCIAS_SYNC')) return { pular: 'desligado (FROTA_PENDENCIAS_SYNC=off)' };
    const { sincronizarPendencias } = await import('@/lib/frota/pendencias-sync');
    const res = await sincronizarPendencias();
    if (res.erros.length && !res.inseridas && !res.resolvidas) throw new Error(res.erros.join(' | '));
    return { resumo: `abertas ${res.inseridas} · fechadas ${res.resolvidas}${res.erros.length ? ` · ${res.erros.length} erros` : ''}` };
  },

  'vigia-conversas': async () => {
    if (desligada('VIGIA_CONVERSAS')) return { pular: 'desligado (VIGIA_CONVERSAS=off)' };
    const { vigiarConversas } = await import('@/lib/assistente/vigia-conversas');
    const r = await vigiarConversas();
    if (r.pulado) return { pular: r.pulado };
    return { resumo: r.avisos.length ? `${r.avisos.length} cliente(s) sem resposta` : 'ninguém esperando' };
  },

  'vigia-saude': async () => {
    const { checarSaudeCrons } = await import('@/lib/agendamentos/heartbeat');
    const r = await checarSaudeCrons();
    return { resumo: r.alertados.length ? `alertou sobre ${r.alertados.join(', ')}` : `${r.checados} robô(s) em dia` };
  },

  'cronograma-replanejar': async () => {
    const { recalcularProjetosLigados } = await import('@/lib/trabalho/cronograma-server');
    return { resumo: `${await recalcularProjetosLigados()} projeto(s) recalculado(s)` };
  },

  'financeiro-scanner': async () => {
    if (process.env.SYNC_FINANCEIRO_AUTO !== 'on') return { pular: 'desligado (só com SYNC_FINANCEIRO_AUTO=on; a criação é pelo webhook)' };
    for (const caminho of ['/api/financeiro/sync-os', '/api/financeiro/sync-pecas?dias=3']) {
      const r = await fetch(`${baseInterna()}${caminho}`, { method: 'POST' });
      if (!r.ok) throw new Error(`${caminho} respondeu HTTP ${r.status}`);
    }
    return { resumo: 'ok' };
  },
};
