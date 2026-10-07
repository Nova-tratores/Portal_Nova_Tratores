// Registro central (fonte da verdade documental) de TODOS os agendamentos de
// sincronização do Portal. Os crons vivem em 3 lugares distintos:
//
//  1. GitHub Actions (.github/workflows/*.yml) — disparam os endpoints /api/.../cron/*
//     no Railway via `Bearer CRON_SECRET`. SÃO OS CRONS DE PRODUÇÃO QUE REALMENTE RODAM.
//  2. Código / Railway (src/instrumentation.ts) — schedulers in-process
//     (setInterval/setTimeout) dentro do `next start`.
//  3. (histórico) vercel.json foi removido em 07/10/2026: nunca rodou no Railway; o único cron útil dele virou pos-sync-omie.yml.
//
// Esta lista alimenta a tela /agendamentos (somente leitura). Ao criar/alterar
// um cron, ATUALIZE este arquivo para mantê-lo fiel.

export type FonteCron = 'github' | 'in-process' | 'vercel-inativo';

export interface Agendamento {
  nome: string;
  modulo: string;
  fonte: FonteCron;
  cron?: string; // expressão cron (UTC) quando houver
  frequencia: string; // legível em PT-BR
  horarioBRT?: string; // ex: "03:00 (diário)" — quando faz sentido
  alvo: string; // endpoint ou função disparada
  arquivo: string; // caminho da definição
  condicional?: string; // ex: "Só com SYNC_FINANCEIRO_AUTO=on"
  obs?: string; // ex: "Inativo no Railway" / "Duplicado no instrumentation.ts"
}

export const FONTE_LABEL: Record<FonteCron, string> = {
  github: 'GitHub Actions (ativo)',
  'in-process': 'Código / Railway (in-process)',
  'vercel-inativo': 'vercel.json (inativo no Railway)',
};

export const FONTE_COR: Record<FonteCron, { bg: string; fg: string; border: string }> = {
  github: { bg: '#ecfdf5', fg: '#047857', border: '#a7f3d0' },
  'in-process': { bg: '#fef2f2', fg: '#b91c1c', border: '#fecaca' },
  'vercel-inativo': { bg: '#f4f4f5', fg: '#71717a', border: '#e4e4e7' },
};

export const AGENDAMENTOS: Agendamento[] = [
  // ───────────────────────── GitHub Actions (ativos) ─────────────────────────
  {
    nome: 'Sync incremental (mês atual)',
    modulo: 'Estoque',
    fonte: 'github',
    cron: '*/30 * * * *',
    frequencia: 'A cada 30 min',
    alvo: 'GET /api/estoque/cron/sync-incremental',
    arquivo: '.github/workflows/estoque-sync-incremental.yml',
    obs: 'Também roda no instrumentation.ts (lá a cada 3 h)',
  },
  {
    nome: 'Sync recebimentos NF-e',
    modulo: 'Estoque',
    fonte: 'github',
    cron: '*/15 9-22 * * *',
    frequencia: 'A cada 15 min',
    horarioBRT: '06:00–19:00 BRT',
    alvo: 'GET /api/estoque/cron/sync-recebimentos',
    arquivo: '.github/workflows/estoque-sync-recebimentos.yml',
    obs: 'Em seguida roda o motor de alocação: abre demanda para peça recebida sem Prateleira/Andar/Caixa e fecha as já alocadas (painel "A alocar" em /ajustes/caracteristicas). Na prática o GitHub dispara 3–4 vezes por dia (~20 min cada)',
  },
  {
    nome: 'Alocação de peças recebidas (rápido)',
    modulo: 'Estoque',
    fonte: 'in-process',
    frequencia: 'A cada 10 min',
    horarioBRT: 'seg–sáb 07:00–20:00 BRT',
    alvo: 'rodarAlocacaoRapidoAgendado() — sync das notas emitidas nos últimos 45 dias + motor de alocação',
    arquivo: 'src/instrumentation.ts',
    condicional: 'Só em produção; desliga com ALOCACAO_RAPIDO=off',
    obs: 'Registra em cron_runs como pecas-alocacao-rapido. Também dispara no botão "Verificar agora" e ao concluir a entrada pelo portal',
  },
  {
    nome: 'Sync rápido de saldo',
    modulo: 'Estoque',
    fonte: 'github',
    cron: '0 */3 * * *',
    frequencia: 'A cada 3 h',
    alvo: 'GET /api/estoque/cron/sync-estoque',
    arquivo: '.github/workflows/estoque-sync-estoque.yml',
  },
  {
    nome: 'Sync completo de produtos',
    modulo: 'Estoque',
    fonte: 'github',
    cron: '0 6 * * *',
    frequencia: 'Diário',
    horarioBRT: '03:00 (diário)',
    alvo: 'GET /api/estoque/cron/sync-produtos',
    arquivo: '.github/workflows/estoque-sync-produtos.yml',
  },
  {
    nome: 'Sync de características de peças',
    modulo: 'Ajustes',
    fonte: 'github',
    cron: '0 6 * * *',
    frequencia: 'Diário',
    horarioBRT: '03:00 (diário)',
    alvo: 'GET /api/ajustes/caracteristicas/cron',
    arquivo: '.github/workflows/ajustes-sync-caracteristicas.yml',
    obs: 'Espelho produtos_caracteristicas (/ajustes/caracteristicas e Etiquetas do PPV); também pelo botão "Sincronizar agora"',
  },
  {
    nome: 'Backfill CMC',
    modulo: 'Estoque',
    fonte: 'github',
    cron: '0 6 * * *',
    frequencia: 'Diário',
    horarioBRT: '03:00 (diário)',
    alvo: 'GET /api/estoque/cron/backfill-cmc',
    arquivo: '.github/workflows/estoque-backfill-cmc.yml',
    obs: 'Também roda no instrumentation.ts (diário 03:00 BRT)',
  },
  {
    nome: 'Sync remessas/movimentação',
    modulo: 'Estoque',
    fonte: 'github',
    cron: '0 7,16 * * *',
    frequencia: '2x ao dia',
    horarioBRT: '04:00 e 13:00 BRT',
    alvo: 'GET /api/estoque/cron/sync-remessas',
    arquivo: '.github/workflows/estoque-sync-remessas.yml',
  },
  {
    nome: 'Sync notas de saída (NF-e/NFS-e)',
    modulo: 'Ajustes',
    fonte: 'github',
    cron: '17 */3 * * *',
    frequencia: 'A cada 3 h (min 17)',
    alvo: 'GET /api/ajustes/cron/sync-notas',
    arquivo: '.github/workflows/ajustes-sync-notas.yml',
  },
  {
    nome: 'Classificar produtos recebidos (robô)',
    modulo: 'Ajustes',
    fonte: 'github',
    cron: '0 8,13 * * *',
    frequencia: '2x ao dia',
    horarioBRT: '05:00 e 10:00 BRT',
    alvo: 'GET /api/ajustes/cron/classificar-recebidos',
    arquivo: '.github/workflows/ajustes-classificar-recebidos.yml',
    obs: 'Recém-recebidos sem família <R$10k → Peças + tarefas de confirmação. Backup 13:00 pq o GitHub às vezes pula o horário.',
  },
  {
    nome: 'Sync contas pagar/receber',
    modulo: 'DRE',
    fonte: 'github',
    cron: '13 */3 * * *',
    frequencia: 'A cada 3 h (min 13)',
    alvo: 'GET /api/dre-financeiro/cron/sync',
    arquivo: '.github/workflows/dre-financeiro-sync.yml',
  },
  {
    nome: 'Sync NFs (pastas clientes)',
    modulo: 'Clientes',
    fonte: 'github',
    cron: '0 8,15,20 * * *',
    frequencia: '3x ao dia',
    horarioBRT: '05:00, 12:00 e 17:00',
    alvo: 'GET /api/clientes/sync-recente + loop POST sync-nfs',
    arquivo: '.github/workflows/sync-nfs.yml',
  },
  {
    nome: 'Sync completo Omie (clientes, projetos, OS, PV, NFs)',
    modulo: 'Clientes',
    fonte: 'github',
    cron: '30 8 * * *',
    frequencia: 'Diário',
    horarioBRT: '05:30 (diário)',
    alvo: 'POST /api/clientes/sync',
    arquivo: '.github/workflows/clientes-sync-omie.yml',
    obs: 'Mesmo sync do botão "Sincronizar" da Pasta Clientes; é o único que atualiza projetos (máquinas) com o último cliente',
  },
  {
    nome: 'Sync cadastros Omie do POS (clientes PRINCIPAL, projetos, produtos)',
    modulo: 'POS',
    fonte: 'github',
    cron: '10 8 * * *',
    frequencia: 'Diário',
    horarioBRT: '05:10 (diário)',
    alvo: 'GET /api/pos/cron/sync-omie',
    arquivo: '.github/workflows/pos-sync-omie.yml',
    obs: 'Veio do vercel.json (que nunca rodou no Railway). Lembretes de revisão, GPS dos técnicos e expirar orçamentos foram descartados: tabelas vazias / 1 orçamento ativo',
  },
  {
    nome: 'Recalcular oportunidades (regras R1–R8)',
    modulo: 'Feedbacks',
    fonte: 'github',
    cron: '0 9 * * *',
    frequencia: 'Diário',
    horarioBRT: '06:00 (diário)',
    alvo: 'POST /api/feedbacks/oportunidades/recomputar',
    arquivo: '.github/workflows/feedbacks-oportunidades-recomputar.yml',
    obs: 'Alimenta a fila /feedbacks/atendimento e o "Por que ligar" do cockpit; o botão "Recomputar agora" continua valendo',
  },
  {
    nome: 'Transições de fase de OS',
    modulo: 'POS',
    fonte: 'github',
    cron: '10 8 * * *',
    frequencia: 'Diário',
    horarioBRT: '05:10 (diário)',
    alvo: 'POST /api/pos/ordens/auto-fase',
    arquivo: '.github/workflows/pos-auto-fase.yml',
  },
  {
    nome: 'Salvar rotas (dia anterior)',
    modulo: 'Comercial',
    fonte: 'github',
    cron: '30 4 * * *',
    frequencia: 'Diário',
    horarioBRT: '01:30 (diário)',
    alvo: 'POST /api/supervisor-vendas/salvar-rotas',
    arquivo: '.github/workflows/supervisor-salvar-rotas.yml',
  },
  {
    nome: 'Gravar rotas comercial',
    modulo: 'Comercial',
    fonte: 'github',
    cron: '0 7 * * *',
    frequencia: 'Diário',
    horarioBRT: '04:00 (diário)',
    alvo: 'GET /api/supervisor-vendas/cron/gravar-rotas',
    arquivo: '.github/workflows/sync-rotas-comercial.yml',
  },

  // ───────────────── Código / Railway (src/instrumentation.ts) ────────────────
  {
    nome: 'Sync incremental',
    modulo: 'Estoque',
    fonte: 'in-process',
    frequencia: 'A cada 3 h',
    alvo: 'cronSyncIncremental()',
    arquivo: 'src/instrumentation.ts',
    obs: 'Duplica o cron do GitHub (lá é a cada 30 min)',
  },
  {
    nome: 'Backfill CMC',
    modulo: 'Estoque',
    fonte: 'in-process',
    frequencia: 'Diário',
    horarioBRT: '03:00 BRT (06:00 UTC)',
    alvo: 'cronBackfillCmc()',
    arquivo: 'src/instrumentation.ts',
    obs: 'Duplica o cron do GitHub',
  },
  {
    nome: 'Pasta cliente (sync-recente)',
    modulo: 'Clientes',
    fonte: 'in-process',
    frequencia: 'A cada 5 min',
    alvo: 'GET /api/clientes/sync-recente',
    arquivo: 'src/instrumentation.ts',
    obs: 'Sempre ligado',
  },
  {
    nome: 'Scanner financeiro (OS + Peças)',
    modulo: 'Financeiro',
    fonte: 'in-process',
    frequencia: 'A cada 5 min',
    alvo: 'POST /api/financeiro/sync-os + /api/financeiro/sync-pecas',
    arquivo: 'src/instrumentation.ts',
    condicional: 'Só com SYNC_FINANCEIRO_AUTO=on',
    obs: 'Backup do webhook do Omie',
  },
];
