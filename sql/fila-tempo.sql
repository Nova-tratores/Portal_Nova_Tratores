-- =============================================================================
-- TEMPO REAL DE TRABALHO — Modo Agora da Minha fila (24/11/2026).
--
-- Cada vez que a pessoa clica "Começar" num item nasce uma linha (inicio); "Pausar" ou
-- "Concluir" fecha a linha (fim). A soma por ticket = horas reais, que a sugestão de
-- tempo usa para aprender quanto cada pessoa leva (lib/trabalho/estimativa.ts).
-- Só uma linha aberta por pessoa (começar outro item fecha o anterior).
--
-- Escrita e leitura só pelo servidor (/api/trabalho/agora), como as outras da Central.
-- Rodar no Supabase › SQL Editor. Pode rodar de novo sem problema.
-- =============================================================================

-- ------------------------------------------------------------------- SOBE
create table if not exists public.tickets_tempo (
  id         uuid primary key default gen_random_uuid(),
  ticket_id  uuid not null references public.tickets(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  inicio     timestamptz not null default now(),
  fim        timestamptz,
  check (fim is null or fim >= inicio)
);
comment on table public.tickets_tempo is 'Tempo real de trabalho por ticket (Modo Agora da Minha fila).';

create index if not exists tickets_tempo_ticket_idx on public.tickets_tempo (ticket_id);
create index if not exists tickets_tempo_user_idx on public.tickets_tempo (user_id, inicio desc);
-- no máximo UMA linha aberta (fim nulo) por pessoa
create unique index if not exists tickets_tempo_um_aberto on public.tickets_tempo (user_id) where fim is null;

alter table public.tickets_tempo enable row level security;
revoke all on public.tickets_tempo from anon, authenticated;

-- Conferir: deve mostrar a tabela vazia.
select count(*) as linhas from public.tickets_tempo;

-- ------------------------------------------------------------------- DESCE
-- Para desfazer (o Modo Agora volta a funcionar sem cronômetro):
--   drop table if exists public.tickets_tempo;
