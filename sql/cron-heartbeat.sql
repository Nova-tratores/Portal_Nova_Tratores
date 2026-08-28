-- Heartbeat de crons/robôs: cada job carimba aqui a cada execução (mesmo quando
-- roda vazio). O vigia in-process (src/instrumentation.ts → checarSaudeCrons)
-- lê esta tabela e, se o último carimbo de um job crítico ficar mais velho que o
-- limite, notifica os admins no sino (portal_notificacoes). NÃO depende do
-- GITHUB_TOKEN — a fonte da verdade é o próprio job, não a GitHub Actions API.
--
-- Idempotente: pode rodar de novo sem problema.

create table if not exists cron_heartbeat (
  job          text primary key,
  last_run_at  timestamptz not null default now(),
  last_status  text,                 -- 'ok' | 'erro' | livre
  meta         jsonb default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

comment on table cron_heartbeat is 'Último "sinal de vida" de cada cron/robô. Alimenta o vigia de saúde (alerta admins se um job parar).';
