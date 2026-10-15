-- =============================================================================
-- AGENDA DA SALA DE REUNIÃO — salas físicas da loja com reserva sem sobreposição.
--
-- Pedido de 15/10/2026: a loja tem UMA sala de reunião e duas equipes marcavam
-- no mesmo horário. Agora a sala tem agenda: reserva direta (visita, treinamento,
-- entrevista) ou pela reunião do portal (avulsa ou série).
--
-- A regra "não sobrepor" mora NO BANCO (exclusion constraint em tstzrange):
-- nem dois cliques ao mesmo tempo conseguem reservar o mesmo horário. Intervalo
-- '[)' = 14:00–15:00 encosta em 15:00–16:00 sem conflito.
--
-- Leitura: todo usuário logado (RLS SELECT). Escrita: só service role, pelas
-- rotas /api/salas/* e /api/reunioes/*. Idempotente.
-- =============================================================================

create extension if not exists btree_gist;

-- ---------------------------------------------------------------- salas
create table if not exists public.salas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  capacidade  integer,
  cor         text not null default '#0891b2',
  ativa       boolean not null default true,
  ordem       integer not null default 0,
  criado_em   timestamptz not null default now()
);
comment on table public.salas is 'Salas físicas da loja que podem ser reservadas (agenda em /salas).';

insert into public.salas (nome, cor, ordem)
select 'Sala de reunião', '#0891b2', 0
where not exists (select 1 from public.salas);

-- ------------------------------------------------------------ reservas
create table if not exists public.salas_reservas (
  id              uuid primary key default gen_random_uuid(),
  sala_id         uuid not null references public.salas(id) on delete restrict,
  inicio          timestamptz not null,
  fim             timestamptz not null,
  periodo         tstzrange generated always as (tstzrange(inicio, fim, '[)')) stored,
  titulo          text not null,
  descricao       text,
  responsavel_id  uuid not null,
  criado_por      uuid not null,
  reuniao_id      uuid references public.tickets(id) on delete cascade,
  status          text not null default 'ativa',
  cancelada_em    timestamptz,
  cancelada_por   uuid,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
comment on table public.salas_reservas is 'Reservas das salas. Reunião do portal com sala = reserva com reuniao_id.';

alter table public.salas_reservas drop constraint if exists salas_reservas_status_chk;
alter table public.salas_reservas add constraint salas_reservas_status_chk check (status in ('ativa', 'cancelada'));
alter table public.salas_reservas drop constraint if exists salas_reservas_intervalo_chk;
alter table public.salas_reservas add constraint salas_reservas_intervalo_chk
  check (fim > inicio and fim - inicio <= interval '12 hours');
alter table public.salas_reservas drop constraint if exists salas_reservas_titulo_chk;
alter table public.salas_reservas add constraint salas_reservas_titulo_chk check (length(btrim(titulo)) between 1 and 200);

-- O coração: duas reservas ATIVAS da mesma sala nunca se sobrepõem (erro 23P01).
alter table public.salas_reservas drop constraint if exists salas_reservas_sem_sobreposicao;
alter table public.salas_reservas add constraint salas_reservas_sem_sobreposicao
  exclude using gist (sala_id with =, periodo with &&) where (status = 'ativa');

-- Uma reunião ocupa no máximo uma reserva ativa.
create unique index if not exists salas_reservas_reuniao_uniq
  on public.salas_reservas (reuniao_id) where reuniao_id is not null and status = 'ativa';
create index if not exists salas_reservas_sala_inicio_idx on public.salas_reservas (sala_id, inicio);

-- ------------------------------------------------- série reserva sozinha
alter table public.reunioes_series add column if not exists sala_id uuid references public.salas(id) on delete set null;

-- ------------------------------------------------------------------ RLS
alter table public.salas enable row level security;
alter table public.salas_reservas enable row level security;

drop policy if exists salas_ler on public.salas;
create policy salas_ler on public.salas for select to authenticated using (true);
drop policy if exists salas_reservas_ler on public.salas_reservas;
create policy salas_reservas_ler on public.salas_reservas for select to authenticated using (true);

revoke all on public.salas, public.salas_reservas from anon;
revoke insert, update, delete on public.salas, public.salas_reservas from authenticated;
grant select on public.salas, public.salas_reservas to authenticated;

notify pgrst, 'reload schema';

-- ROLLBACK (manual):
-- alter table public.reunioes_series drop column if exists sala_id;
-- drop table if exists public.salas_reservas;
-- drop table if exists public.salas;
