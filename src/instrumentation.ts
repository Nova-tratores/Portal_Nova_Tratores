// Schedulers in-process do módulo Estoque.
//
// O Portal roda no Railway como processo Node longevo (`next start`), então
// `register()` (chamado 1x no boot do servidor) é o lugar certo pra agendar
// jobs — substitui os `vercel.json` crons, que NÃO disparam no Railway, e
// espelha os setInterval/setTimeout do monolito.
//
// Só roda no runtime nodejs (não no edge). Guard global evita agendar em
// duplicidade no HMR do `next dev`. As rotas /api/estoque/cron/* continuam
// existindo para disparo manual (protegidas por Bearer CRON_SECRET).
//
// CAVEAT: se o serviço escalar para >1 instância no Railway, cada instância
// roda seu próprio scheduler (jobs duplicados). Os jobs são best-effort/idempotentes
// (upserts), mesma característica do monolito. Manter 1 instância para os crons.

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;

  const g = globalThis as unknown as { __estoqueSchedulersStarted?: boolean; __safetyNetInstalled?: boolean };

  // Rede de segurança do processo: no Node moderno, uma Promise rejeitada sem
  // catch (ou exceção síncrona solta) DERRUBA o processo inteiro — e os syncs
  // de background em fire-and-forget tornam isso fácil de acontecer. Cada
  // queda = portal fora do ar ~1 min + crons levando 502 (fim de semana de
  // 18-19/07/2026: ~13 quedas, 20 crons falhados). Logar e seguir vivo é um
  // trade-off consciente: melhor que matar todas as requests em andamento.
  if (!g.__safetyNetInstalled) {
    g.__safetyNetInstalled = true;
    process.on('unhandledRejection', (reason) => {
      console.error('[safety-net] unhandledRejection (processo segue vivo):', reason);
    });
    process.on('uncaughtException', (err) => {
      console.error('[safety-net] uncaughtException (processo segue vivo):', err);
    });
  }

  if (g.__estoqueSchedulersStarted) return;
  g.__estoqueSchedulersStarted = true;

  const log = (msg: string) => console.log('[estoque scheduler] ' + msg);

  // sync-incremental e backfill-cmc FORAM MOVIDOS para GitHub Actions (crons
  // dedicados: estoque-sync-incremental / estoque-backfill-cmc). Rodá-los aqui
  // TAMBÉM causava execução em duplicidade e disputa na mesma chave Omie.
  // Aqui ficam só os jobs que NÃO têm cron no GitHub (abaixo).

  // PAPEL do processo (serviço separado no Railway para os robôs, 16/10/2026):
  //   tudo   (padrão) — web + robôs no mesmo processo, como sempre foi;
  //   web    — só atende requisições; NENHUM agendador/setInterval de robô sobe
  //            (nem o fecharOrfas do agendador, que marcaria as rodadas do worker
  //            como interrompidas a cada deploy do web);
  //   worker — serviço só de robôs: agendador + intervalos; atende HTTP só para
  //            as tarefas `rota-interna` (127.0.0.1) e o healthcheck.
  // Os flushes do monitor de uso e da sombra de permissões ficam nos dois: o
  // buffer vive no processo que recebeu a requisição.
  const PAPEL = (process.env.PAPEL || 'tudo').trim().toLowerCase();
  const rodaRobos = PAPEL !== 'web';
  log(`papel do processo: ${PAPEL}${rodaRobos ? '' : ' (robôs ficam com o worker)'}`);

  const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
  const CINCO_MIN = 5 * 60 * 1000;

  // AGENDADOR (src/lib/agendador, plano docs/omie-fila-agendador-plano.md): com a
  // tabela `agendamentos` no banco, ele assume os agendamentos internos abaixo
  // (mesmo ritmo, agora com histórico, "rodar agora" e pausa na tela /agendamentos).
  // Sem a tabela (migration sql/agendador.sql) ou com AGENDADOR=off, seguem os
  // setInterval antigos deste arquivo. Só produção.
  let agendadorLigado = false;
  if (rodaRobos && process.env.NODE_ENV === 'production') {
    try {
      const { iniciarAgendador } = await import('./lib/agendador/motor');
      agendadorLigado = await iniciarAgendador();
    } catch (e) { log('agendador falhou ao iniciar: ' + (e as Error).message); }
  }

  // Financeiro — CRIAÇÃO de cards (scanner OS + Peças) a cada 5 min.
  // DESLIGADO por padrão (a criação em tempo real é feita pelo WEBHOOK do Omie).
  // Só liga com SYNC_FINANCEIRO_AUTO=on, como backup caso o webhook falhe.
  if (agendadorLigado) {
    log('agendamentos internos com o AGENDADOR (tela /agendamentos)');
  } else if (rodaRobos && process.env.SYNC_FINANCEIRO_AUTO === 'on') {
    const rodarSyncFinanceiro = async () => {
      const { fetchInterno } = await import('./lib/auth/chamada-interna');
      for (const path of ['/api/financeiro/sync-os', '/api/financeiro/sync-pecas?dias=3']) {
        try { await fetchInterno(`${base}${path}`, { method: 'POST' }); } catch (e) { log('sync financeiro falhou: ' + (e as Error).message); }
      }
    };
    setInterval(() => { rodarSyncFinanceiro().catch(() => {}); }, CINCO_MIN);
    setTimeout(() => { rodarSyncFinanceiro().catch(() => {}); }, 60 * 1000); // 1ª rodada ~1min após o boot
    log('financeiro auto-sync (scanner) LIGADO (SYNC_FINANCEIRO_AUTO=on)');
  } else {
    log('financeiro auto-sync (scanner) DESLIGADO — criação via webhook. SYNC_FINANCEIRO_AUTO=on liga o backup.');
  }

  // (removido em 25/08/2026) Lembrete NFS-e de 5 em 5 min — EXCLUÍDO a pedido:
  // spammava o Pós-Vendas. O relatório semanal (clientes-relatorio-semanal.yml)
  // segue cobrindo os faturados sem NF com UMA notificação por semana.

  // Pasta Cliente: vigia OS/PV/NFs novas (alteradas na última 1h) a cada 5 min.
  // SÓ atualiza as tabelas da pasta (portal_nt_clientes_*) + baixa as NFs — NÃO cria
  // card no financeiro. É o que garante a NF aparecer sozinha na pasta do cliente.
  if (rodaRobos && !agendadorLigado) {
    const rodarSyncClientes = async () => {
      try {
        const { fetchInterno } = await import('./lib/auth/chamada-interna');
        await fetchInterno(`${base}/api/clientes/sync-recente`);
      } catch (e) { log('sync-recente clientes falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarSyncClientes().catch(() => {}); }, CINCO_MIN);
    setTimeout(() => { rodarSyncClientes().catch(() => {}); }, 90 * 1000); // 1ª rodada ~1min30 após o boot
  }

  // Tratorilson: processa automaticamente as OS que entram em "Relatório Concluído"
  // (preenche pelo relatório + devolve peças no PPV + move de fase). SÓ produção,
  // pra não rodar no localhost de dev (mesmo banco → evita processamento em dobro).
  //
  // O ENVIO AO OMIE **NÃO** é automático de propósito: cria ordem/pedido REAL no Omie,
  // então quem dispara é a pessoa, pelos botões da fase "Enviar Omie" no Kanban
  // (um por card, ou "Enviar todas" no cabeçalho da fase).
  if (rodaRobos && !agendadorLigado && (process.env.NODE_ENV === 'production')) {
    const { processarLoteRelatorios } = await import('./lib/pos/atualizar-relatorio');
    const rodarTratorilson = async () => {
      try {
        const r = await processarLoteRelatorios('Tratorilson (auto)');
        if (r.ok > 0 || r.erros > 0) log(`tratorilson auto: ${r.ok} OS (${r.paraEnviarOmie} Omie, ${r.paraPreenchido} Preenchido Garantia, ${r.erros} erro)`);
      } catch (e) { log('tratorilson auto falhou: ' + (e as Error).message); }
    };
    const DEZ_MIN = 10 * 60 * 1000;
    setInterval(() => { rodarTratorilson().catch(() => {}); }, DEZ_MIN);
    setTimeout(() => { rodarTratorilson().catch(() => {}); }, 3 * 60 * 1000); // 1ª rodada ~3min após o boot
    log('tratorilson auto-processamento LIGADO (a cada 10min) — envio ao Omie é manual');
  }

  // Vigia de CONVERSAS do NovaZap: cliente sem resposta há 10+ min (inclusive
  // depois da mensagem automática de fora do horário) vira card "Precisa de
  // atendimento" + alerta central pro pós-vendas. Só LÊ o Chatwoot. Só produção.
  // VIGIA_CONVERSAS=off desliga.
  if (rodaRobos && !agendadorLigado && (process.env.NODE_ENV === 'production' && process.env.VIGIA_CONVERSAS !== 'off')) {
    const { vigiarConversas } = await import('./lib/assistente/vigia-conversas');
    const rodarVigiaZap = async () => {
      try {
        const r = await vigiarConversas();
        if (r.pulado) log('vigia-conversas: ' + r.pulado);
        else if (r.avisos.length) log(`vigia-conversas: ${r.avisos.length} cliente(s) sem resposta`);
      } catch (e) { log('vigia-conversas falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarVigiaZap().catch(() => {}); }, CINCO_MIN);
    setTimeout(() => { rodarVigiaZap().catch(() => {}); }, 2 * 60 * 1000);
    log('vigia de conversas do NovaZap LIGADO (a cada 5 min)');
  }

  // Planta Viva (docs/planta-viva-plano.md): recalcula a tabela planta_kpi a cada 5 min.
  // Só lê espelhos do Supabase (nada de Omie). Com o agendador ligado, é a tarefa
  // `planta-snapshot` dele. PLANTA=off desliga. Só produção.
  if (rodaRobos && !agendadorLigado && process.env.NODE_ENV === 'production' && process.env.PLANTA !== 'off') {
    const { comCronRun } = await import('./lib/cron/observar');
    const rodarPlanta = async () => {
      try {
        const { rodarSnapshot } = await import('./lib/planta/server');
        await comCronRun('planta-snapshot', rodarSnapshot, { lockMinutos: 4 });
      } catch (e) { log('planta-snapshot falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarPlanta().catch(() => {}); }, CINCO_MIN);
    setTimeout(() => { rodarPlanta().catch(() => {}); }, 2 * 60 * 1000);
    log('planta viva LIGADA (a cada 5 min)');
  }

  // Vigia de saúde dos robôs: alerta os admins no sino se um cron crítico PARAR.
  // Lê o heartbeat no Supabase (não depende do GITHUB_TOKEN) e não toca chave
  // Omie — só lê + escreve notificação —, então roda seguro aqui in-process. SÓ
  // produção (não spammar no localhost de dev, que compartilha o mesmo banco).
  if (rodaRobos && !agendadorLigado && (process.env.NODE_ENV === 'production')) {
    const { checarSaudeCrons } = await import('./lib/agendamentos/heartbeat');
    const rodarVigia = async () => {
      try {
        const r = await checarSaudeCrons();
        if (r.alertados.length) log(`vigia-saude: alertou admins sobre ${r.alertados.join(', ')}`);
      } catch (e) { log('vigia-saude falhou: ' + (e as Error).message); }
    };
    const UMA_HORA = 60 * 60 * 1000;
    setInterval(() => { rodarVigia().catch(() => {}); }, UMA_HORA);
    setTimeout(() => { rodarVigia().catch(() => {}); }, 15 * 60 * 1000); // 1ª rodada ~15min após o boot
    log('vigia de saúde dos robôs LIGADO (a cada 1h) — alerta admins se um cron parar');
  }

  // Demanda de ALOCAÇÃO de peça recebida: relê as notas RECENTES da Omie e abre/fecha as
  // demandas a cada 10 min em horário comercial. Fica AQUI (e não no GitHub Actions)
  // porque o GitHub só dispara o cron de recebimentos 3–4 vezes por dia — a peça
  // recebida levava horas para virar demanda. Leve: ~5 páginas de ListarRecebimentos
  // por conta. Não tem cron equivalente no GitHub (sem duplicidade). SÓ produção.
  // Desliga com ALOCACAO_RAPIDO=off.
  if (rodaRobos && !agendadorLigado && (process.env.NODE_ENV === 'production' && process.env.ALOCACAO_RAPIDO !== 'off')) {
    const { rodarAlocacaoRapidoAgendado } = await import('./lib/pecas/alocacao-rapido');
    const rodarAlocacao = async () => {
      try {
        const r = await rodarAlocacaoRapidoAgendado();
        if (r) log(`alocacao-rapido: ${r}`);
      } catch (e) { log('alocacao-rapido falhou: ' + (e as Error).message); }
    };
    const DEZ_MIN_ALOC = 10 * 60 * 1000;
    setInterval(() => { rodarAlocacao().catch(() => {}); }, DEZ_MIN_ALOC);
    setTimeout(() => { rodarAlocacao().catch(() => {}); }, 2 * 60 * 1000); // 1ª rodada ~2min após o boot
    log('alocação de peças recebidas LIGADA (a cada 10 min, seg–sáb 07h–20h BRT)');
  }

  // Faturamento da OS pelo portal (NFS-e): confere no Omie as OS com faturamento
  // sem resposta clara ou NFS-e ainda aguardando a prefeitura, a cada 10 min.
  // Só olha as pendentes (índice parcial) — sem pendência, nenhuma chamada ao Omie.
  // SÓ produção. Desliga com POS_FATURAR_RECONCILIAR=off.
  if (rodaRobos && !agendadorLigado && (process.env.NODE_ENV === 'production' && process.env.POS_FATURAR_RECONCILIAR !== 'off')) {
    const { rodarReconciliacaoFaturamento } = await import('./lib/pos/faturamento');
    const rodarFatOS = async () => {
      try {
        const r = await rodarReconciliacaoFaturamento();
        if (r) log(`pos-faturamento: ${r}`);
      } catch (e) { log('pos-faturamento falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarFatOS().catch(() => {}); }, 10 * 60 * 1000);
    setTimeout(() => { rodarFatOS().catch(() => {}); }, 5 * 60 * 1000);
    log('reconciliação do faturamento de OS LIGADA (a cada 10 min)');
  }

  // Pendências da FROTA: o motor que abre/fecha as pendências automáticas
  // (cadastro, checklist, requisição, OS, Opa) só rodava quando alguém abria a
  // tela — requisição que chegava ao financeiro ficava "aberta" até a próxima
  // visita. Agora roda a cada 15 min. SÓ produção. Desliga com FROTA_PENDENCIAS_SYNC=off.
  if (rodaRobos && !agendadorLigado && (process.env.NODE_ENV === 'production' && process.env.FROTA_PENDENCIAS_SYNC !== 'off')) {
    const { rodarPendenciasAgendado } = await import('./lib/frota/pendencias-sync');
    const rodarPendFrota = async () => {
      try {
        const r = await rodarPendenciasAgendado();
        if (r) log(`frota-pendencias: ${r}`);
      } catch (e) { log('frota-pendencias falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarPendFrota().catch(() => {}); }, 15 * 60 * 1000);
    setTimeout(() => { rodarPendFrota().catch(() => {}); }, 4 * 60 * 1000); // 1ª rodada ~4min após o boot
    log('motor de pendências da frota LIGADO (a cada 15 min)');
  }

  // Central de Trabalho: replanejamento diário dos cronogramas ligados a quadros
  // de tickets (etapa atrasada empurra as seguintes). Uma vez por dia, a partir
  // das 06:00 BRT — antes da tela "Seu dia" das 7:30. SÓ produção.
  if (rodaRobos && !agendadorLigado && (process.env.NODE_ENV === 'production')) {
    const { recalcularProjetosLigados, hojeSP } = await import('./lib/trabalho/cronograma-server');
    let ultimoDia = '';
    const rodarReplanejamento = async () => {
      const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
      const dia = hojeSP();
      if (hora < 6 || dia === ultimoDia) return;
      ultimoDia = dia;
      try { log(`replanejamento: ${await recalcularProjetosLigados()} projeto(s) recalculado(s)`); }
      catch (e) { log('replanejamento falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarReplanejamento().catch(() => {}); }, 30 * 60 * 1000);
    setTimeout(() => { rodarReplanejamento().catch(() => {}); }, 3 * 60 * 1000);
    log('replanejamento diário dos cronogramas ligados a quadros LIGADO (06:00 BRT)');
  }

  // Monitor de uso (quem usa o quê): o buffer em memória (páginas por beacon do
  // PortalLayout + chamadas de API contadas em autenticar()) desce ao banco UMA
  // vez por minuto pela RPC portal_uso_incrementar. Só produção (USO_MONITOR=on
  // liga no local; =off desliga). Em SIGTERM (deploy) tenta um último flush.
  {
    const { descarregarUso, monitorLigado } = await import('./lib/uso/buffer-server');
    if (monitorLigado()) {
      const rodarFlush = async () => {
        const r = await descarregarUso();
        if (!r.ok) log('monitor de uso: flush falhou: ' + r.erro);
      };
      setInterval(() => { rodarFlush().catch(() => {}); }, 60 * 1000);
      const proc = process as unknown as { once?: (ev: string, fn: () => void) => void };
      proc.once?.('SIGTERM', () => { rodarFlush().catch(() => {}); });
      log('monitor de uso LIGADO (flush a cada 60 s)');
    } else {
      log('monitor de uso DESLIGADO (só produção; USO_MONITOR=on liga no local)');
    }
  }

  // Permissões v2 — modo sombra (Fase 3a): as checagens das rotas comparam a regra
  // antiga com a v2 e o buffer desce a cada 60 s (RPC perm_sombra_registrar).
  // PERM_V2 = sombra (padrão em produção) | on (v2 decide) | off.
  {
    const { descarregarSombra, modoAtual } = await import('./lib/permissoes/sombra-server');
    const modo = modoAtual();
    if (modo !== 'off') {
      const flush = async () => {
        const r = await descarregarSombra();
        if (!r.ok) log('permissões v2: flush da sombra falhou: ' + r.erro);
      };
      setInterval(() => { flush().catch(() => {}); }, 60 * 1000);
      const proc = process as unknown as { once?: (ev: string, fn: () => void) => void };
      proc.once?.('SIGTERM', () => { flush().catch(() => {}); });
    }
    log(`permissões v2: modo ${modo}`);

    // Espelho portal_permissoes → v2: catálogo + usuários 1 min depois do boot,
    // depois usuários a cada 10 min (o Admin antigo ainda é onde se edita).
    const { espelhoLigado, espelharPermissoes, sincronizarCatalogo } = await import('./lib/permissoes/espelho-server');
    if (espelhoLigado()) {
      const espelhar = async (comCatalogo: boolean) => {
        try {
          if (comCatalogo) await sincronizarCatalogo();
          const r = await espelharPermissoes();
          if (r.alterados || r.ignoradas.length) log(`permissões v2: espelho acertou ${r.alterados} de ${r.usuarios} usuário(s)${r.ignoradas.length ? `; chaves ignoradas: ${r.ignoradas.join(', ')}` : ''}`);
        } catch (e) {
          log('permissões v2: espelho falhou: ' + (e as Error).message);
        }
      };
      setTimeout(() => { void espelhar(true); }, 60 * 1000);
      setInterval(() => { void espelhar(false); }, 10 * 60 * 1000);
    }
  }

  // Cache de NOTAS FISCAIS (PDF + XML no bucket privado): indexa as fontes e
  // guarda um lote de 120 notas a cada 10 min (≈ 2 chamadas Omie por nota, longe
  // da cota). Para sozinho em bloqueio/Omie fora. Só produção; NOTAS_CACHE=on liga
  // no local, =off desliga. Registra em cron_runs como notas-cache-docs.
  if (rodaRobos && !agendadorLigado && ((process.env.NODE_ENV === 'production' && process.env.NOTAS_CACHE !== 'off') || process.env.NOTAS_CACHE === 'on')) {
    const { rodarAgendado } = await import('./lib/notas/cache-docs');
    const rodarNotas = async () => {
      try { log('notas-cache: ' + await rodarAgendado(120)); } catch (e) { log('notas-cache falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarNotas().catch(() => {}); }, 10 * 60 * 1000);
    setTimeout(() => { rodarNotas().catch(() => {}); }, 4 * 60 * 1000); // 1ª rodada ~4 min após o boot
    log('cache de notas fiscais LIGADO (indexa + 120 notas a cada 10 min)');
  }

  // CENTRO DO PÓS-VENDAS (Janela Mecânicos, 16/10/2026): deixa a base de 4 anos sempre gravada
  // (a tela abre e troca de data na hora) e a leitura do Tratorilson pronta (refaz quando passa
  // de 3 h, só 06h–20h). Só produção; POS_PAINEL_AQUECER=on liga no local, =off desliga.
  if (rodaRobos && ((process.env.NODE_ENV === 'production' && process.env.POS_PAINEL_AQUECER !== 'off') || process.env.POS_PAINEL_AQUECER === 'on')) {
    const rodarPainel = async () => {
      try {
        const { aquecerBase } = await import('./lib/mecanicos/base-cache');
        await aquecerBase();
        // ficha de cada mecânico (card → janela) e o pódio dos meses: já gravados no banco
        const { aquecerFichas } = await import('./lib/mecanicos/ficha-server');
        await aquecerFichas().catch((e) => log('pos-painel: fichas falharam: ' + (e as Error).message));
        const { podioMeses } = await import('./lib/mecanicos/podio-server');
        await podioMeses().catch(() => {});
        const hora = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', hour12: false }).format(new Date()));
        if (hora >= 6 && hora < 20) {
          const { ultimaAnalise, gerarUmaVez, estaGerando, VALIDADE_ANALISE_MS } = await import('./lib/mecanicos/analise-server');
          const u = await ultimaAnalise();
          if ((!u || Date.now() - Date.parse(u.geradaEm) > VALIDADE_ANALISE_MS) && !estaGerando()) {
            // leitura do sistema: vê tudo (a agenda só usa o login para mascarar itens privados)
            await gerarUmaVez({ userId: '', email: null, isAdmin: true, isDev: false, categoria: null, modulos: [] }, 'Tratorilson (automático)');
            log('pos-painel: leitura do Tratorilson atualizada');
          }
        }
      } catch (e) { log('pos-painel falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarPainel().catch(() => {}); }, 10 * 60 * 1000);
    setTimeout(() => { rodarPainel().catch(() => {}); }, 90 * 1000); // 1ª rodada ~1,5 min após o boot
    log('centro do pós-vendas: base + leitura do Tratorilson aquecidas a cada 10 min');
  }

  // INTELIGÊNCIA DE VENDAS — Plano Safra (19/10/2026): o robô lê as páginas oficiais do BNDES
  // 2x por dia; se as condições mudaram, a IA propõe os números e avisa quem confere.
  // Só produção; PLANO_SAFRA_MONITOR=on liga no local, =off desliga.
  if (rodaRobos && ((process.env.NODE_ENV === 'production' && process.env.PLANO_SAFRA_MONITOR !== 'off') || process.env.PLANO_SAFRA_MONITOR === 'on')) {
    const rodarPlanoSafra = async () => {
      try {
        const { verificarFontes } = await import('./lib/inteligencia-vendas/plano-safra-server');
        const r = await verificarFontes('Robô do Plano Safra');
        log(`plano-safra: ${r.verificadas} páginas, mudaram: ${r.mudaram.join(', ') || 'nenhuma'}${r.erros.length ? `, erros: ${r.erros.length}` : ''}`);
      } catch (e) { log('plano-safra falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarPlanoSafra().catch(() => {}); }, 12 * 60 * 60 * 1000);
    setTimeout(() => { rodarPlanoSafra().catch(() => {}); }, 6 * 60 * 1000); // 1ª rodada ~6 min após o boot
    log('plano safra: páginas oficiais vigiadas a cada 12 h');
  }

  // INTELIGÊNCIA DE VENDAS — base dos clientes pronta no banco (iv_snapshot), recalculada a
  // cada 20 min para a tela abrir na hora (José, 19/10/2026: "não pode demorar"). Só produção;
  // IV_SNAPSHOT=on liga no local, =off desliga.
  if (rodaRobos && ((process.env.NODE_ENV === 'production' && process.env.IV_SNAPSHOT !== 'off') || process.env.IV_SNAPSHOT === 'on')) {
    const recalcularBase = async () => {
      try {
        const { carregarBase } = await import('./lib/inteligencia-vendas/server');
        const t0 = Date.now();
        const { clientes } = await carregarBase(true);
        log(`inteligência de vendas: base recalculada (${clientes.length} clientes, ${Math.round((Date.now() - t0) / 1000)} s)`);
      } catch (e) { log('inteligência de vendas: base falhou: ' + (e as Error).message); }
    };
    setInterval(() => { recalcularBase().catch(() => {}); }, 20 * 60 * 1000);
    setTimeout(() => { recalcularBase().catch(() => {}); }, 2 * 60 * 1000);
    log('inteligência de vendas: base dos clientes recalculada a cada 20 min');
  }

  // INTELIGÊNCIA DE VENDAS — feed do vendedor no app de vendas (20/10/2026): a reserva de
  // contatos de cada vendedor (iv_feed_pool) é refeita a cada 6 h. Só produção;
  // IV_FEED=on liga no local, =off desliga.
  if (rodaRobos && ((process.env.NODE_ENV === 'production' && process.env.IV_FEED !== 'off') || process.env.IV_FEED === 'on')) {
    const rodarFeed = async () => {
      try {
        const { gerarFeeds } = await import('./lib/inteligencia-vendas/feed-server');
        const r = await gerarFeeds();
        log(`feed dos vendedores: ${r.vendedores} vendedores, ${r.contatos} contatos${r.semCidade.length ? ` (sem cidade: ${r.semCidade.join(', ')})` : ''}`);
      } catch (e) { log('feed dos vendedores falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarFeed().catch(() => {}); }, 6 * 60 * 60 * 1000);
    setTimeout(() => { rodarFeed().catch(() => {}); }, 5 * 60 * 1000);
    log('feed dos vendedores: refeito a cada 6 h');
  }

  // INTELIGÊNCIA DE VENDAS — Boletim do agro (19/10/2026): notícias, preços CONAB, Focus, dólar
  // e clima da região, editados pela IA. 1x por dia a partir das 06:30 BRT (e na subida do
  // processo se o boletim de hoje ainda não existe). Uma execução por vez (trava em memória
  // no noticias-server). Só produção; IV_NOTICIAS=on liga no local, =off desliga.
  if (rodaRobos && ((process.env.NODE_ENV === 'production' && process.env.IV_NOTICIAS !== 'off') || process.env.IV_NOTICIAS === 'on')) {
    const rodarBoletim = async (boot = false) => {
      try {
        const { rodarBoletimAgendado } = await import('./lib/inteligencia-vendas/noticias-server');
        const r = await rodarBoletimAgendado(boot);
        if (r) log(`boletim do agro: ${r}`);
      } catch (e) { log('boletim do agro falhou: ' + (e as Error).message); }
    };
    setInterval(() => { rodarBoletim().catch(() => {}); }, 10 * 60 * 1000);
    setTimeout(() => { rodarBoletim(true).catch(() => {}); }, 7 * 60 * 1000); // 1ª rodada ~7 min após o boot
    log('boletim do agro: gerado 1x por dia a partir das 06:30 BRT');
  }

  log('schedulers registrados (lembrete-nf 5min, pasta-cliente 5min; financeiro-scanner sob SYNC_FINANCEIRO_AUTO). sync-incremental e backfill-cmc agora no GitHub Actions.');
}
