// Registro das tarefas do agendador: `agendamentos.handler` → função que roda.
// Cada tarefa devolve um resumo curto (vai para cron_runs.detalhe) ou lança erro.
// Devolver `{ pular: 'motivo' }` = não havia o que fazer/desligada; não conta como erro.
//
// Regra: a tarefa NÃO se registra no cron_runs sozinha — quem registra é o motor
// (src/lib/agendador/motor.ts). Os interruptores por variável de ambiente que
// existiam no instrumentation.ts continuam valendo aqui.
// Imports dinâmicos: só carrega o módulo da tarefa quando ela roda.

export type ResultadoTarefa = { resumo?: string; pular?: string; progresso?: Record<string, string> };
export type ContextoTarefa = { chave: string };
export type Tarefa = (parametros: Record<string, unknown>, ctx: ContextoTarefa) => Promise<ResultadoTarefa>;

const desligada = (env: string) => process.env[env] === 'off';
const baseInterna = () => `http://127.0.0.1:${process.env.PORT || 3000}`;

/**
 * Chama uma rota do próprio portal (dentro do servidor) com a senha dos agendamentos,
 * esperando a resposta. Usa node:http e não fetch: o fetch do Node desiste em 300 s
 * e há rota que leva 15 min (oportunidades, fechar o dia da frota).
 */
async function chamarRotaInterna(metodo: string, caminho: string, timeoutMin: number): Promise<{ status: number; corpo: string }> {
  const http = await import('node:http');
  const segredo = process.env.CRON_SECRET || '';
  if (!segredo) throw new Error('CRON_SECRET não configurado — a rota recusaria a chamada.');
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1', port: Number(process.env.PORT || 3000), path: caminho, method: metodo,
      headers: { authorization: `Bearer ${segredo}`, 'x-cron-secret': segredo, 'x-agendador': '1', 'content-length': 0 },
    }, (res) => {
      let corpo = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => { if (corpo.length < 20_000) corpo += c; });
      res.on('end', () => resolve({ status: res.statusCode || 0, corpo }));
    });
    req.setTimeout(timeoutMin * 60_000, () => req.destroy(new Error(`a rota não respondeu em ${timeoutMin} min`)));
    req.on('error', reject);
    req.end();
  });
}

/** Resumo curto da resposta JSON da rota (sem listas grandes). */
function resumirResposta(corpo: string): string {
  try {
    const j = JSON.parse(corpo);
    const enxuto = JSON.stringify(j, (_k, v) => (Array.isArray(v) ? `[${v.length} itens]` : v));
    return enxuto.length > 400 ? enxuto.slice(0, 400) + '…' : enxuto;
  } catch {
    return corpo.slice(0, 200) || 'ok';
  }
}

export const TAREFAS: Record<string, Tarefa> = {
  // Agendamentos trazidos do GitHub que não usam a Omie (etapa 3): cada um chama a
  // própria rota de cron, como o GitHub fazia — parametros { metodo, caminho, timeout_min }.
  'rota-interna': async (p) => {
    const metodo = String(p.metodo || 'POST').toUpperCase();
    const caminho = String(p.caminho || '');
    if (!caminho.startsWith('/api/')) throw new Error('parametros.caminho precisa começar com /api/');
    const { status, corpo } = await chamarRotaInterna(metodo, caminho, Number(p.timeout_min) || 20);
    if (status >= 400) throw new Error(`a rota respondeu HTTP ${status}: ${corpo.slice(0, 300)}`);
    try {
      const j = JSON.parse(corpo);
      if (j && (j.pulado === true || typeof j.pulado === 'string')) return { pular: typeof j.pulado === 'string' ? j.pulado : 'nada a fazer' };
      if (j && j.sucesso === false) throw new Error(String(j.erro || j.error || 'a rota devolveu sucesso: false'));
    } catch (e) {
      if (e instanceof SyntaxError) { /* resposta não-JSON: segue com o texto */ } else throw e;
    }
    return { resumo: resumirResposta(corpo) };
  },

  // Novidades do dia (José, 22/10/2026): às 07:00, o que mudou ontem em cada módulo
  // vira aviso publicado + sino para quem tem acesso ao módulo. NOVIDADES_DIARIAS=off desliga.
  'novidades-diarias': async () => {
    if (desligada('NOVIDADES_DIARIAS')) return { pular: 'NOVIDADES_DIARIAS=off' };
    const { publicarNovidadesDoDia } = await import('@/lib/conhecimento/novidades-diarias-server');
    const r = await publicarNovidadesDoDia();
    if (!r.versoes) return { pular: 'nenhuma versão nova desde o último aviso' };
    return { resumo: `${r.versoes} versão(ões) · ${r.novidades.length} módulo(s): ${r.novidades.map((n) => n.modulo).join(', ') || '—'} · ${r.avisados} pessoa(s) avisada(s)` };
  },

  // CRM automático (José, 23/10/2026): toda OS faturada há 3–15 dias vira uma ligação
  // de satisfação no /feedbacks/crm, já preenchida. FEEDBACKS_CRM_AUTO=off desliga.
  'feedbacks-crm-automatico': async () => {
    if (desligada('FEEDBACKS_CRM_AUTO')) return { pular: 'FEEDBACKS_CRM_AUTO=off' };
    const { gerarCrmDasOS } = await import('@/lib/feedbacks/crm-automatico-server');
    const r = await gerarCrmDasOS({ gravar: true });
    if ('pulado' in r) return { pular: r.pulado };
    const pul = Object.entries(r.puladas).map(([m, n]) => `${m} ${n}`).join(', ');
    if (!r.criadas) return { pular: `nenhuma OS nova para o CRM (${r.candidatas} na janela${pul ? ` · ${pul}` : ''})` };
    return { resumo: `${r.criadas} ligação(ões) criada(s) de ${r.candidatas} OS na janela${pul ? ` · puladas: ${pul}` : ''}` };
  },

  // Características das peças (espelho produtos_caracteristicas: locação, "Tipo:"…),
  // as duas contas. Veio do GitHub (ajustes-sync-caracteristicas.yml), que disparava
  // as 03:00 da madrugada só no papel (rodava 9h–12h e morria em deploy).
  // Retomada por conta: interrompida no meio da CASTRO, a próxima rodada do dia pula a NOVA.
  'ajustes-sync-caracteristicas': async (_p, ctx) => {
    const { iniciarSyncCaracteristicas } = await import('@/lib/ajustes/caracteristicas');
    const { getContasOmie } = await import('@/lib/ajustes/conta');
    const { lerRetomada, marcarFeito, limparRetomada } = await import('./retomada');
    const feitas = await lerRetomada(ctx.chave);
    const faltam = getContasOmie().map((c) => c.label as string).filter((l) => !feitas.includes(l));
    if (!faltam.length) { await limparRetomada(ctx.chave); return { pular: `já feito hoje (${feitas.join(', ')})` }; }
    // Completa aos domingos (limpa produto excluído da Omie) ou sem rodada certa recente;
    // nos outros dias lê da Omie só o que foi alterado desde a última certa (1 página por
    // conta em vez de ~60). Conferido 22/10: editar característica muda a data de alteração.
    const { decidirModo } = await import('@/lib/ajustes/caracteristicas-diff');
    const { supabaseAdmin } = await import('@/lib/server/supabase-admin');
    const { data: ok } = await supabaseAdmin.from('cron_runs').select('iniciado_em')
      .eq('job', ctx.chave).eq('status', 'ok').order('iniciado_em', { ascending: false }).limit(1);
    const decisao = decidirModo(ok?.[0]?.iniciado_em ? new Date(ok[0].iniciado_em) : null, new Date());
    const r = await iniciarSyncCaracteristicas('agendador', {
      aguardar: true,
      contas: faltam,
      aoConcluirConta: (label: string) => marcarFeito(ctx.chave, label),
      incrementalDesde: decisao.modo === 'incremental' ? decisao.desde : undefined,
    });
    if (r.jaRodando) return { pular: 'sync já em andamento (botão da tela)' };
    if (!r.ok) throw new Error(r.erro || 'sync falhou');
    // Terminou inteira: a próxima rodada (ex.: a das 20:00 depois de um "Rodar agora") é completa.
    await limparRetomada(ctx.chave);
    type Det = { lidos: number; novas: number; alteradas: number; removidas: number; iguais: number };
    const detalhe = (r.resumo?.detalhe || {}) as Record<string, Det>;
    const progresso: Record<string, string> = Object.fromEntries(Object.entries(detalhe).map(([k, d]) =>
      [k, `${d.lidos} lidas · ${d.novas} novas · ${d.alteradas} alteradas · ${d.removidas} removidas`]));
    for (const l of feitas) progresso[l] = 'já feito antes (retomada)';
    const soma = (c: keyof Det) => Object.values(detalhe).reduce((a, d) => a + d[c], 0);
    const modoTxt = decisao.modo === 'incremental' ? `incremental desde ${decisao.desde}` : `completa (${decisao.motivo})`;
    return { resumo: `Leitura ${modoTxt}: ${soma('lidos')} lidas · gravadas ${soma('novas') + soma('alteradas')} (${soma('novas')} novas, ${soma('alteradas')} alteradas) · ${soma('removidas')} removidas${feitas.length ? ` · retomada: ${feitas.join(', ')} já feitas` : ''}`, progresso };
  },

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

  'ppv-precos-sync': async () => {
    if (desligada('PPV_PRECOS_SYNC')) return { pular: 'desligado (PPV_PRECOS_SYNC=off)' };
    const { sincronizarPrecosAlterados } = await import('@/lib/ppv/precos-sync');
    const res = await sincronizarPrecosAlterados();
    const erros = res.filter((c) => c.erro).map((c) => `${c.conta}: ${c.erro}`);
    if (erros.length === res.length && erros.length > 0) throw new Error(erros.join(' | '));
    return { resumo: res.map((c) => `${c.conta} ${c.erro ? 'erro: ' + c.erro : `${c.alterados} preços · ${c.cadastro ?? 0} no cadastro`}`).join(' · ') };
  },

  // Saldo e custo (CMC) da tabela `produtos` — só as peças com saldo, grava só o que mudou
  // (~6 s por conta; antes 13 min a cada 3 h pelo GitHub). Ver lib/estoque/saldos-diff.ts.
  'estoque-saldos-rapido': async () => {
    if (desligada('ESTOQUE_SALDOS_RAPIDO')) return { pular: 'desligado (ESTOQUE_SALDOS_RAPIDO=off)' };
    const { sincronizarSaldosRapido } = await import('@/lib/estoque/produtos-sync');
    const { getContasOmie } = await import('@/lib/estoque/conta');
    const { capturarSnapshotMensal, capturarSnapshotTipoMensal } = await import('@/lib/estoque/cruzamento-familia');
    const partes: string[] = [];
    const erros: string[] = [];
    const progresso: Record<string, string> = {};
    for (const { id } of getContasOmie()) {
      try {
        const r = await sincronizarSaldosRapido(id);
        // o retrato do mês (por família e por Tipo) só lê o banco: refaz quando algo mudou
        if (r.atualizados > 0) {
          await capturarSnapshotMensal(id).catch(() => null);
          await capturarSnapshotTipoMensal(id).catch(() => null);
        }
        progresso[id] = `${r.lidos} com saldo · ${r.atualizados} gravadas`;
        partes.push(`${id} ${r.atualizados} mudaram${r.zerados ? ` (${r.zerados} zeradas)` : ''}${r.semLinha ? ` · ${r.semLinha} sem cadastro` : ''}`);
      } catch (e) {
        erros.push(`${id}: ${(e as Error).message}`);
      }
    }
    if (erros.length && !partes.length) throw new Error(erros.join(' | '));
    return { resumo: [...partes, ...erros.map((x) => 'erro ' + x)].join(' · '), progresso };
  },

  // Sync COMPLETO da tabela `produtos` (famílias + todos os produtos + estoque) e o retrato
  // do mês. Veio do GitHub (estoque-sync-produtos.yml: 03:00 no papel, 06h20–07h50 de fato).
  // À noite vira só conferência: no dia o incremental (ppv-precos-sync) e o saldo rápido cuidam.
  'estoque-sync-produtos': async () => {
    if (desligada('ESTOQUE_SYNC_PRODUTOS')) return { pular: 'desligado (ESTOQUE_SYNC_PRODUTOS=off)' };
    const { cronSyncProdutos } = await import('@/lib/estoque/cron');
    const r = await cronSyncProdutos() as Record<string, { ok?: boolean; totalProdutos?: number; errosEstoque?: number; mensagem?: string; erro?: string }>;
    const contas = Object.entries(r);
    const falhas = contas.filter(([, v]) => v.ok === false);
    if (falhas.length === contas.length && falhas.length > 0) throw new Error(falhas.map(([k, v]) => `${k}: ${v.mensagem || v.erro}`).join(' | '));
    return { resumo: contas.map(([k, v]) => (v.ok === false ? `${k} erro: ${v.mensagem || v.erro}` : `${k} ${v.totalProdutos} produtos${v.errosEstoque ? ` (${v.errosEstoque} sem estoque)` : ''}`)).join(' · ') };
  },

  // Livro-razão de estoque (estoque_movimentos): janela recente das peças que se moveram
  // no mês, as duas contas (~11 min). Veio do GitHub (estoque-sync-movimentos.yml: 02:20
  // no papel, 07h–08h de fato, e morria no deploy do site). Retomada por conta.
  // parametros: { dias (60), max_min (13) }.
  'estoque-sync-movimentos': async (p, ctx) => {
    if (desligada('ESTOQUE_SYNC_MOVIMENTOS')) return { pular: 'desligado (ESTOQUE_SYNC_MOVIMENTOS=off)' };
    const { sincronizarIncremental } = await import('@/lib/estoque/movimentos-sync');
    const { getContasOmie } = await import('@/lib/estoque/conta');
    const { lerRetomada, marcarFeito, limparRetomada } = await import('./retomada');
    const feitas = await lerRetomada(ctx.chave);
    const faltam = getContasOmie().map((c) => c.id).filter((c) => !feitas.includes(c));
    if (!faltam.length) { await limparRetomada(ctx.chave); return { pular: `já feito hoje (${feitas.join(', ')})` }; }
    const janelaDias = Math.min(180, Math.max(15, Number(p.dias) || 60));
    const maxMs = Math.min(20, Math.max(1, Number(p.max_min) || 13)) * 60_000;
    const partes: string[] = [];
    const erros: string[] = [];
    const progresso: Record<string, string> = {};
    for (const c of faltam) {
      try {
        const r = await sincronizarIncremental(c, { grupo: 'peca', janelaDias, maxMs });
        progresso[c] = `${r.feitos}/${r.candidatos} peças · ${r.movimentos} movimentos · ${r.segundos} s`;
        partes.push(`${c} ${r.feitos}/${r.candidatos} peças, ${r.movimentos} movimentos${r.restantes ? ` (${r.restantes} ficaram pra amanhã)` : ''}`);
        await marcarFeito(ctx.chave, c);
      } catch (e) {
        erros.push(`${c}: ${(e as Error).message}`);
      }
    }
    for (const c of feitas) progresso[c] = 'já feito antes (retomada)';
    if (erros.length && !partes.length) throw new Error(erros.join(' | '));
    if (!erros.length) await limparRetomada(ctx.chave);
    return { resumo: [...partes, ...erros.map((x) => 'erro ' + x)].join(' · '), progresso };
  },

  // Custo (CMC) das vendas_itens que ainda não têm, em lotes até esgotar (~45 min).
  // Veio do GitHub (estoque-backfill-cmc.yml: 02:45 no papel, 07h–08h de fato, e morria
  // no deploy do site). Retomada por conta; o que já foi enriquecido não volta pra fila.
  'estoque-backfill-cmc': async (_p, ctx) => {
    if (desligada('ESTOQUE_BACKFILL_CMC')) return { pular: 'desligado (ESTOQUE_BACKFILL_CMC=off)' };
    const { cronBackfillCmc } = await import('@/lib/estoque/cron');
    const { getContasOmie } = await import('@/lib/estoque/conta');
    const { lerRetomada, marcarFeito, limparRetomada } = await import('./retomada');
    const feitas = await lerRetomada(ctx.chave);
    const faltam = getContasOmie().map((c) => c.id).filter((c) => !feitas.includes(c));
    if (!faltam.length) { await limparRetomada(ctx.chave); return { pular: `já feito hoje (${feitas.join(', ')})` }; }
    const r = await cronBackfillCmc({ contas: faltam, aoConcluirConta: (c) => marcarFeito(ctx.chave, c) });
    const bloqueio = Object.values(r).find((v) => v.paradoPor?.startsWith('bloqueio'));
    if (!bloqueio) await limparRetomada(ctx.chave);
    const progresso: Record<string, string> = Object.fromEntries(Object.entries(r).map(([k, v]) => [k,
      `${v.tentados}/${v.pares} tentados · ${v.enriquecidos} com custo · ${v.semCusto} sem custo (tenta de novo) · ${v.desistidos} desistidos`
      + ` · ${v.adiados} esperando · ${v.erros} erros · ${v.chamadasOmie} chamadas`
      + (v.restantes ? ` · ${v.restantes} ficaram pra amanhã` : '')]));
    for (const c of feitas) progresso[c] = 'já feito antes (retomada)';
    const resumo = Object.entries(r).map(([k, v]) => `${k} ${v.enriquecidos} com custo de ${v.tentados} tentados (${v.chamadasOmie} chamadas)`).join(' · ')
      + (feitas.length ? ` · retomada: ${feitas.join(', ')} já feitas` : '')
      + (Object.values(r).some((v) => v.semTabelaTentativas) ? ' · sem controle de tentativas: aplicar sql/vendas-cmc-tentativas.sql' : '');
    if (bloqueio) throw new Error(`${resumo} — parou: ${bloqueio.paradoPor}`);
    return { resumo, progresso };
  },

  'notas-cache-docs': async () => {
    if (desligada('NOTAS_CACHE')) return { pular: 'desligado (NOTAS_CACHE=off)' };
    const { indexarNotas, guardarLote, diasAtras, VINCULAR_JANELA_DIAS } = await import('@/lib/notas/cache-docs');
    // vínculos pedido/OS/máquina só das notas dos últimos 120 dias (a passagem completa fica pros crons de sync)
    const idx = await indexarNotas({ vincularDesde: diasAtras(VINCULAR_JANELA_DIAS) });
    const lote = await guardarLote({ limite: 120 });
    const resumo = `indexadas e:${idx.entrada} s:${idx.saida}${idx.erro ? ` (erro ao indexar: ${idx.erro})` : ''}${idx.vinculos ? ` · vínculos nfe:${idx.vinculos.nfe} nfse:${idx.vinculos.nfse}` : idx.vinculosErro ? ' (vínculos: aplicar sql/notas-fiscais-vinculos.sql)' : ''} · lote ${lote.processadas}: ${lote.completas} completas, ${lote.parciais} parciais, ${lote.pendentes} pendentes, ${lote.falhas} falhas`;
    if (lote.paradoPor) return { resumo: `${resumo} — parou: ${lote.paradoPor} ${lote.erro || ''}`.trim() };
    return { resumo };
  },

  // Chama a função da rota DENTRO do processo (não por HTTP): a rodada pode passar de
  // 5 min, e o fetch do Node desiste em 300 s ("fetch failed") enquanto a rota segue
  // rodando — a próxima começava por cima. Assim o agendador sabe quando terminou e a
  // prioridade na fila da Omie vem junto.
  'clientes-sync-recente': async () => {
    const { GET } = await import('@/app/api/clientes/sync-recente/route');
    // A rota exige login OU a senha de sistema (protegerRotaOuInterna).
    const r = await GET(new Request(`${baseInterna()}/api/clientes/sync-recente`, {
      headers: { 'x-cron-secret': process.env.CRON_SECRET || '' },
    }));
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
    const r = await rodarReconciliacaoFaturamento();
    // vigia dos pedidos de peças marcados como faturados sem NF-e (ele mesmo roda no máximo a cada 30 min)
    const { vigiarPedidosFaturados } = await import('@/lib/ppv/vigia-faturados');
    const v = await vigiarPedidosFaturados().catch((e) => `vigia PPV falhou: ${e instanceof Error ? e.message : e}`);
    return { resumo: [r, v].filter(Boolean).join(' · ') || 'nada pendente' };
  },

  // Requisição sem valor cobrado do cliente vira lembrete no POS + sino do Pós-Vendas (José, 26/10/2026)
  'pos-requisicoes-cobranca': async () => {
    if (desligada('POS_COBRANCA_REQ')) return { pular: 'desligado (POS_COBRANCA_REQ=off)' };
    const { vigiarCobrancas } = await import('@/lib/pos/cobranca-requisicoes');
    return vigiarCobrancas();
  },

  'pops-gatilhos-os': async () => {
    if (desligada('POPS_GATILHOS_OS')) return { pular: 'desligado (POPS_GATILHOS_OS=off)' };
    const { verificarGatilhosOS, resumoGatilhos } = await import('@/lib/pops/gatilhos-os');
    const r = await verificarGatilhosOS();
    if (r.pulado) return { pular: r.pulado };
    if (r.erros.length && !r.criadas) throw new Error(r.erros.slice(0, 5).join(' | '));
    return { resumo: resumoGatilhos(r) };
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

  // Planta Viva: recalcula os números da tela /planta (tabela planta_kpi). Só lê espelhos.
  'planta-snapshot': async () => {
    if (desligada('PLANTA')) return { pular: 'desligado (PLANTA=off)' };
    const { rodarSnapshot } = await import('@/lib/planta/server');
    return rodarSnapshot();
  },

  // Planta Viva: PV e remessas abertos na Omie, com quem criou (Balcão de peças). Mesma
  // leitura de /ajustes/pedidos e /ajustes/remessas; a rodada leva ~7 min (as remessas paginam as OS).
  'planta-omie-abertos': async () => {
    if (desligada('PLANTA')) return { pular: 'desligado (PLANTA=off)' };
    const { rodarOmieAbertos } = await import('@/lib/planta/server');
    return rodarOmieAbertos();
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

  // Certificados de garantia do portal de concessionárias da Mahindra (entrega técnica do Radar
  // Tratores). Só leitura no site da Mahindra; sem MAHINDRA_DEALER_* no serviço, pula.
  'mahindra-certificados': async () => {
    if (!process.env.MAHINDRA_DEALER_USUARIO || !process.env.MAHINDRA_DEALER_SENHA) return { pular: 'sem MAHINDRA_DEALER_USUARIO/SENHA' };
    const { sincronizarCertificados } = await import('@/lib/mahindra/portal-dealer-server');
    const r = await sincronizarCertificados();
    if (r.gravados) (await import('@/lib/revisoes/vendidos-server')).limparCacheVendidos();
    if (!r.ok && !r.gravados && r.erros.length) throw new Error(r.erros.slice(0, 5).join(' | '));
    return { resumo: `${r.naLista} na lista · ${r.abertos} aberto(s) · ${r.gravados} gravado(s)${r.erros.length ? ` · ${r.erros.length} erro(s)` : ''}` };
  },

  // Vias fora do mapa (camada do /frota/mapa): trechos do GPS longe das vias do
  // OpenStreetMap, dos últimos 14 dias. Depois do fechar-dia. Desliga com FROTA_VIAS=off.
  'frota-vias-fora-mapa': async (p) => {
    if (desligada('FROTA_VIAS')) return { pular: 'desligado (FROTA_VIAS=off)' };
    const { supabaseAdmin } = await import('@/lib/server/supabase-admin');
    const { processarViasForaMapa } = await import('@/lib/frota/vias-fora-mapa-server');
    const r = await processarViasForaMapa(supabaseAdmin, {
      limite: Number(p.limite) || 400,
      maxDownloads: Number(p.max_downloads) || 40,
      desde: typeof p.desde === 'string' ? p.desde : undefined,
    });
    if (r.erros.length && !r.processados) throw new Error(r.erros.slice(0, 5).join(' | '));
    if (!r.candidatos) return { pular: 'nenhum dia novo' };
    return {
      resumo: `${r.ok} dia(s) ok · ${r.trechos} trecho(s), ${r.kmFora} km fora do mapa · ${r.pendentes} pendente(s)`
        + `${r.baixados ? ` · ${r.baixados} malha(s) baixada(s)` : ''}${r.restantes ? ` · ${r.restantes} para a próxima` : ''}`
        + `${r.erros.length ? ` · ${r.erros.length} erro(s): ${r.erros[0]}` : ''}`,
    };
  },

  // Quests do vendedor (app de vendas): sugere tarefas por regra para o supervisor aprovar.
  'vendas-quests-sugerir': async (p) => {
    if (desligada('VENDAS_QUESTS')) return { pular: 'desligado (VENDAS_QUESTS=off)' };
    const { sugerirQuests } = await import('@/lib/vendas-app/quests-server');
    const r = await sugerirQuests({ limite: Number(p.limite) || 10 });
    if (r.pulado) return { pular: r.pulado };
    const c = r.candidatas;
    return { resumo: `${r.criadas} sugestão(ões) nova(s) · candidatas: revisão ${c.revisao_chegando}, aniversário ${c.aniversario_entrega}, sumido ${c.cliente_sumido}, sem notícia ${c.trator_sem_noticia}` };
  },

  'financeiro-scanner': async () => {
    if (process.env.SYNC_FINANCEIRO_AUTO !== 'on') return { pular: 'desligado (só com SYNC_FINANCEIRO_AUTO=on; a criação é pelo webhook)' };
    const { fetchInterno } = await import('@/lib/auth/chamada-interna');
    for (const caminho of ['/api/financeiro/sync-os', '/api/financeiro/sync-pecas?dias=3']) {
      const r = await fetchInterno(`${baseInterna()}${caminho}`, { method: 'POST' });
      if (!r.ok) throw new Error(`${caminho} respondeu HTTP ${r.status}`);
    }
    return { resumo: 'ok' };
  },
};
