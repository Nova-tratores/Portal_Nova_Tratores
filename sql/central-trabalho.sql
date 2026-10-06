-- =============================================================================
-- CENTRAL DE TRABALHO — Tarefas + Tickets + Cronograma andando juntos.
-- (depois de sql/tickets-quadros.sql)
--
--  * Projeto do cronograma ligado a um quadro; etapa ligada a um ticket.
--    Ticket resolvido conclui a etapa; atraso replaneja (motor com "hoje").
--  * Tarefa (portal_tarefas) dentro de um ticket: "passo" (checklist) ou
--    "origem" (a tarefa que virou o ticket).
--  * Confirmação de quem recebe o ticket (aceite) e posição do cartão.
--  * Preferência do atalho flutuante e confirmação do "Seu dia" (7:30).
--
-- Rodar no SQL Editor do Supabase. Idempotente. Nada muda para quem não usa:
-- os tickets existentes ficam com aceite = 'ok'.
-- =============================================================================

-- ── Cronograma ↔ Quadro/Ticket ───────────────────────────────────────────────
alter table cronograma.projetos add column if not exists quadro_id uuid
  references public.tickets_quadros(id) on delete set null;
create index if not exists idx_cron_projetos_quadro on cronograma.projetos(quadro_id) where quadro_id is not null;

alter table cronograma.tarefas add column if not exists ticket_id uuid
  references public.tickets(id) on delete set null;
create unique index if not exists ux_cron_tarefas_ticket on cronograma.tarefas(ticket_id) where ticket_id is not null;

-- ── Tarefa ↔ Ticket ──────────────────────────────────────────────────────────
alter table public.portal_tarefas add column if not exists ticket_id uuid
  references public.tickets(id) on delete set null;
alter table public.portal_tarefas add column if not exists papel_no_ticket text
  check (papel_no_ticket in ('passo', 'origem'));
create index if not exists idx_portal_tarefas_ticket on public.portal_tarefas(ticket_id) where ticket_id is not null;

-- ── Ticket: confirmação de quem recebe + posição no quadro ───────────────────
alter table public.tickets add column if not exists aceite text not null default 'ok'
  check (aceite in ('ok', 'pendente', 'recusado'));
alter table public.tickets add column if not exists aceite_motivo text;
alter table public.tickets add column if not exists aceite_em timestamptz;
alter table public.tickets add column if not exists quadro_posicao double precision;
create index if not exists idx_tickets_aceite_pendente on public.tickets(responsavel_id) where aceite = 'pendente';

-- ── Preferências e "Seu dia" ─────────────────────────────────────────────────
create table if not exists public.ct_preferencias (
  user_id          uuid primary key references auth.users(id) on delete cascade,
  atalho_flutuante boolean not null default true,
  updated_at       timestamptz not null default now()
);
create table if not exists public.ct_seu_dia (
  user_id       uuid not null references auth.users(id) on delete cascade,
  dia           date not null,
  confirmado_em timestamptz not null default now(),
  primary key (user_id, dia)
);
alter table public.ct_preferencias enable row level security;
alter table public.ct_seu_dia enable row level security;
revoke all on public.ct_preferencias from anon, authenticated;
revoke all on public.ct_seu_dia from anon, authenticated;

notify pgrst, 'reload schema';
