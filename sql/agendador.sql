-- Agendador do portal (Etapa 2 do plano docs/omie-fila-agendador-plano.md).
--
-- Os agendamentos passam a morar NO BANCO e rodam dentro do portal (Railway), em vez
-- de no GitHub Actions (que atrasa horas). O laço do agendador (src/lib/agendador)
-- lê esta tabela a cada 30 s; a tela /agendamentos mostra, pausa, muda horário e
-- manda "rodar agora". Só a service role escreve (rotas /api/agendador/*).
--
-- APLICAR no Supabase do portal (SQL Editor). Idempotente. Sem ela o portal segue
-- como antes (o agendador cai nos agendadores antigos do instrumentation.ts).

-- ─── 1. Agendamentos ───────────────────────────────────────────────────────────
create table if not exists agendamentos (
  chave            text primary key,                 -- id estável (ex.: 'pecas-alocacao-rapido'); é o `job` do cron_runs
  handler          text not null,                    -- qual função roda (registro em src/lib/agendador/tarefas.ts)
  nome             text not null,
  modulo           text not null default '',
  descricao        text not null default '',
  tipo             text not null check (tipo in ('intervalo', 'diario', 'semanal', 'mensal', 'uma_vez')),
  hora             text check (hora is null or hora ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),  -- HH:MM (Brasília) p/ diario/semanal/mensal
  intervalo_min    integer check (intervalo_min is null or intervalo_min between 1 and 1440),
  dias_semana      smallint[],                       -- 0=dom … 6=sáb; null = todos
  janela_inicio    text check (janela_inicio is null or janela_inicio ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  janela_fim       text check (janela_fim is null or janela_fim ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  dia_mes          smallint check (dia_mes is null or dia_mes between 1 and 28),
  executar_em      timestamptz,                      -- uma_vez
  parametros       jsonb not null default '{}'::jsonb,
  prioridade       text not null default 'pesado' check (prioridade in ('pessoa', 'rapido', 'pesado')),
  usa_omie         boolean not null default false,
  grupo            text,                             -- no máximo 1 rodando por grupo (ex.: 'omie-pesado')
  duracao_max_min  integer not null default 60 check (duracao_max_min between 1 and 1440),
  ativo            boolean not null default true,
  pausado_por      text,
  pausado_motivo   text,
  pausado_em       timestamptz,
  origem           text not null default 'portal' check (origem in ('portal', 'github')),
  criado_por       text,
  criado_em        timestamptz not null default now(),
  atualizado_por   text,
  atualizado_em    timestamptz not null default now()
);

comment on table agendamentos is 'Agendamentos que rodam dentro do portal (agendador em src/lib/agendador). Tela /agendamentos.';

alter table agendamentos enable row level security;
revoke all on agendamentos from anon, authenticated;

-- ─── 2. Batida de vida do agendador ────────────────────────────────────────────
create table if not exists agendador_estado (
  id          smallint primary key default 1 check (id = 1),
  batida_em   timestamptz not null default now(),
  iniciado_em timestamptz not null default now(),   -- quando o processo atual subiu
  versao      text
);

alter table agendador_estado enable row level security;
revoke all on agendador_estado from anon, authenticated;

-- ─── 3. cron_runs: quem disparou e progresso ───────────────────────────────────
alter table cron_runs add column if not exists disparado_por text;   -- agendador | github | botao | marcado
alter table cron_runs add column if not exists quem          text;   -- nome de quem apertou / marcou
alter table cron_runs add column if not exists progresso     jsonb;  -- ex.: {"NOVA":"65/65","CASTRO":"25/56"}
-- status passa a aceitar também: interrompida (servidor reiniciou) | aguardando_omie

create index if not exists idx_cron_runs_recentes on cron_runs (iniciado_em desc);

-- ─── 4. Agendamentos que já rodavam no portal (instrumentation.ts) ─────────────
-- Mesmo ritmo de antes. Os interruptores por variável de ambiente continuam valendo
-- (ex.: ALOCACAO_RAPIDO=off), checados na própria tarefa.
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, intervalo_min, dias_semana, janela_inicio, janela_fim, hora, prioridade, usa_omie, duracao_max_min, ativo) values
  ('pecas-alocacao-rapido', 'pecas-alocacao-rapido', 'Alocação de peças recebidas', 'Estoque',
   'Relê as notas emitidas nos últimos 45 dias e abre/fecha as demandas de alocação (painel "A alocar").',
   'intervalo', 10, '{1,2,3,4,5,6}', '07:00', '20:00', null, 'rapido', true, 8, true),
  ('notas-cache-docs', 'notas-cache-docs', 'Cache de notas fiscais (PDF + XML)', 'Estoque',
   'Indexa as notas e guarda o PDF/XML de até 120 por rodada no bucket privado.',
   'intervalo', 10, null, null, null, null, 'rapido', true, 9, true),
  ('clientes-sync-recente', 'clientes-sync-recente', 'Pasta do cliente (OS/PV/NF recentes)', 'Clientes',
   'Puxa OS, pedidos e notas alterados na última hora para a Pasta Clientes.',
   'intervalo', 5, null, null, null, null, 'rapido', true, 5, true),
  ('tratorilson-relatorios', 'tratorilson-relatorios', 'Tratorilson — OS em "Relatório Concluído"', 'POS',
   'Preenche a OS pelo relatório do técnico, devolve peças no PPV e move de fase. O envio ao Omie é manual.',
   'intervalo', 10, null, null, null, null, 'rapido', true, 9, true),
  ('pos-faturamento-reconciliar', 'pos-faturamento-reconciliar', 'Faturamento de OS — conferência no Omie', 'POS',
   'Confere OS com faturamento sem resposta clara ou NFS-e aguardando a prefeitura.',
   'intervalo', 10, null, null, null, null, 'rapido', true, 9, true),
  ('frota-pendencias-sync', 'frota-pendencias-sync', 'Pendências da frota', 'Frota',
   'Abre e fecha as pendências automáticas dos veículos (cadastro, checklist, requisição, OS, Opa).',
   'intervalo', 15, null, null, null, null, 'rapido', false, 10, true),
  ('vigia-conversas', 'vigia-conversas', 'Vigia de conversas do NovaZap', 'Tratorilson',
   'Cliente sem resposta há 10+ min vira card "Precisa de atendimento".',
   'intervalo', 5, null, null, null, null, 'rapido', false, 4, true),
  ('vigia-saude', 'vigia-saude', 'Vigia de saúde dos robôs', 'Sistema',
   'Alerta os admins se um robô crítico parar de dar sinal de vida.',
   'intervalo', 60, null, null, null, null, 'rapido', false, 10, true),
  ('cronograma-replanejar', 'cronograma-replanejar', 'Replanejamento dos cronogramas', 'Central de Trabalho',
   'Etapa atrasada empurra as seguintes nos cronogramas ligados a blocos.',
   'diario', null, null, null, null, '06:00', 'rapido', false, 10, true),
  ('financeiro-scanner', 'financeiro-scanner', 'Scanner financeiro (OS + Peças)', 'Financeiro',
   'Backup do webhook do Omie: cria cards no financeiro. Só roda com SYNC_FINANCEIRO_AUTO=on.',
   'intervalo', 5, null, null, null, null, 'rapido', true, 5, true)
on conflict (chave) do nothing;

insert into agendador_estado (id) values (1) on conflict (id) do nothing;

notify pgrst, 'reload schema';
