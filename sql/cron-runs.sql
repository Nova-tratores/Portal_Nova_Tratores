-- Observabilidade + trava de execução dos crons (recomendação #3 da análise de ritmo).
-- Registra cada disparo de cron: quando começou/terminou, duração REAL no servidor
-- (hoje cega, porque as rotas são fire-and-forget), status e se tomou bloqueio 425.
-- Também serve de trava: se já existe um run ABERTO recente do mesmo job, o novo pula.
--
-- APLICAR no Supabase do portal (SQL editor). Idempotente. Sem RLS (só service role escreve).

create table if not exists cron_runs (
  id            bigint generated always as identity primary key,
  job           text        not null,
  iniciado_em   timestamptz not null default now(),
  finalizado_em timestamptz,
  duracao_ms    integer,
  status        text        not null default 'rodando',  -- rodando | ok | erro | pulado | bloqueio
  requisicoes   integer,                                  -- reservado p/ contagem futura
  erros         integer,                                  -- reservado p/ contagem futura
  bloqueio      boolean     not null default false,       -- tomou 425/"consumo indevido"
  detalhe       text
);

create index if not exists idx_cron_runs_job_recent on cron_runs (job, iniciado_em desc);
create index if not exists idx_cron_runs_abertos on cron_runs (job) where finalizado_em is null;

comment on table cron_runs is 'Log de execução dos crons (duração real, status, bloqueio) + trava anti-sobreposição.';
