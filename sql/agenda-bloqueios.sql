-- =============================================================================
-- AGENDA PESSOAL — bloqueios de horário ("indisponível") que IMPEDEM marcar reunião.
--
-- Pedido de 19/10/2026: cada usuário marca os horários em que não pode participar
-- (visita externa, férias, médico…). Marcar reunião com alguém bloqueado é RECUSADO.
-- O motivo é PESSOAL: só o dono lê a própria linha (RLS); para os outros, a API
-- devolve só "indisponível", sem motivo.
--
-- Escrita só pela service role, nas rotas /api/agenda/*. Idempotente.
-- =============================================================================

create table if not exists public.agenda_bloqueios (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null,
  inicio     timestamptz not null,
  fim        timestamptz not null,
  motivo     text,
  criado_em  timestamptz not null default now()
);
comment on table public.agenda_bloqueios is 'Horários em que a pessoa está indisponível; impedem marcar reunião com ela. Motivo só o dono vê.';

alter table public.agenda_bloqueios drop constraint if exists agenda_bloqueios_intervalo_chk;
alter table public.agenda_bloqueios add constraint agenda_bloqueios_intervalo_chk
  check (fim > inicio and fim - inicio <= interval '62 days');
alter table public.agenda_bloqueios drop constraint if exists agenda_bloqueios_motivo_chk;
alter table public.agenda_bloqueios add constraint agenda_bloqueios_motivo_chk check (motivo is null or length(motivo) <= 200);

create index if not exists agenda_bloqueios_user_inicio_idx on public.agenda_bloqueios (user_id, inicio);
create index if not exists agenda_bloqueios_fim_idx on public.agenda_bloqueios (fim);

alter table public.agenda_bloqueios enable row level security;
drop policy if exists agenda_bloqueios_dono_le on public.agenda_bloqueios;
create policy agenda_bloqueios_dono_le on public.agenda_bloqueios for select to authenticated using (user_id = auth.uid());

revoke all on public.agenda_bloqueios from anon;
revoke insert, update, delete on public.agenda_bloqueios from authenticated;
grant select on public.agenda_bloqueios to authenticated;

notify pgrst, 'reload schema';

-- ROLLBACK (manual): drop table if exists public.agenda_bloqueios;
