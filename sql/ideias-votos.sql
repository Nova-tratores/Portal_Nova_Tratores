-- =============================================================================
-- IDEIAS — votos 👍 e "levar para reunião" (melhorias-central-de-trabalho.md, 5.2 e 4.1)
--
-- 1. dev_ideias_votos: um voto por pessoa por ideia (PK composta). O documento chama de
--    "ideias_votos"; aqui segue o prefixo da tabela que já existe (dev_ideias).
-- 2. dev_ideias.levar_reuniao: marca a ideia para aparecer em "Sugestões para a pauta".
--
-- Mesma regra do sql/dev-ideias.sql: só o service role toca (rotas /api/dev/ideias/*);
-- RLS ligada SEM policy + REVOKE. Rodar no SQL Editor do Supabase. Idempotente.
-- Desfazer: sql/rollback-ideias-votos.sql
-- =============================================================================

create table if not exists public.dev_ideias_votos (
  ideia_id    uuid not null references public.dev_ideias(id) on delete cascade,
  usuario_id  uuid not null,
  created_at  timestamptz not null default now(),
  primary key (ideia_id, usuario_id)
);
create index if not exists dev_ideias_votos_usuario_idx on public.dev_ideias_votos (usuario_id);

alter table public.dev_ideias add column if not exists levar_reuniao boolean not null default false;

alter table public.dev_ideias_votos enable row level security;
revoke all on public.dev_ideias_votos from anon, authenticated;

notify pgrst, 'reload schema';
