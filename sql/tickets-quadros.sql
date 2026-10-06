-- =============================================================================
-- TICKETS — QUADROS (estilo Trello)
--
-- Qualquer usuário com o módulo Tickets cria quadros. Cada quadro tem
-- integrantes, visibilidade (privado = só integrantes; público = todo mundo do
-- módulo VÊ, só integrantes trabalham) e colunas próprias, que o criador
-- inclui, renomeia, reordena e remove.
--
-- O STATUS do ticket continua sendo o ciclo de vida (aberto → resolvido →
-- fechado, com as regras de sempre). A coluna do quadro é só organização.
--
-- Escrita: só service role (rotas /api/tickets/quadros/*). Leitura pelo
-- navegador: RLS via tickets_quadro_pode_ver.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- =============================================================================

create table if not exists public.tickets_quadros (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 1 and 80),
  descricao   text not null default '' check (char_length(descricao) <= 500),
  cor         text not null default '#dc2626' check (cor ~ '^#[0-9A-Fa-f]{6}$'),
  visibilidade text not null default 'privado' check (visibilidade in ('privado', 'publico')),
  criado_por  uuid not null references auth.users(id),
  arquivado   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists public.tickets_quadro_membros (
  quadro_id      uuid not null references public.tickets_quadros(id) on delete cascade,
  user_id        uuid not null references auth.users(id) on delete cascade,
  adicionado_por uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  primary key (quadro_id, user_id)
);
create index if not exists idx_tq_membros_user on public.tickets_quadro_membros(user_id);

create table if not exists public.tickets_quadro_colunas (
  id         uuid primary key default gen_random_uuid(),
  quadro_id  uuid not null references public.tickets_quadros(id) on delete cascade,
  nome       text not null check (char_length(nome) between 1 and 60),
  posicao    int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_tq_colunas_quadro on public.tickets_quadro_colunas(quadro_id, posicao);

-- O ticket ganha o quadro e a coluna (NULL = fora de quadro, como sempre foi).
alter table public.tickets add column if not exists quadro_id uuid
  references public.tickets_quadros(id) on delete set null;
alter table public.tickets add column if not exists quadro_coluna_id uuid
  references public.tickets_quadro_colunas(id) on delete set null;
create index if not exists idx_tickets_quadro on public.tickets(quadro_id) where quadro_id is not null;

-- ---------------------------------------------------------------------------
-- Quem VÊ o quadro: público, integrante, criador ou admin/dev.
-- SECURITY DEFINER pelo mesmo motivo de tickets_pode_ver (sem recursão de RLS);
-- só responde sobre o próprio chamador (auth.uid()).
-- ---------------------------------------------------------------------------
create or replace function public.tickets_quadro_pode_ver(p_quadro uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from tickets_quadros q
    where q.id = p_quadro
      and (
        q.visibilidade = 'publico'
        or q.criado_por = auth.uid()
        or exists (select 1 from tickets_quadro_membros m where m.quadro_id = q.id and m.user_id = auth.uid())
        or exists (select 1 from portal_permissoes pp
                   where pp.user_id = auth.uid() and (pp.is_admin is true or pp.is_dev is true))
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- Visibilidade do TICKET passa a considerar o quadro:
--  - envolvidos (solicitante, responsável, participante) e admin: sempre;
--  - fora de quadro: regra antiga (público = todos);
--  - em quadro: quem vê o quadro (a visibilidade do quadro manda).
-- ---------------------------------------------------------------------------
create or replace function public.tickets_pode_ver(p_ticket uuid)
returns boolean
language sql stable security definer
set search_path = public
as $$
  select auth.uid() is not null and exists (
    select 1 from tickets t
    where t.id = p_ticket
      and (
        t.solicitante_id = auth.uid()
        or t.responsavel_id = auth.uid()
        or exists (
          select 1 from tickets_participantes p
          where p.ticket_id = t.id and p.user_id = auth.uid() and p.removido_em is null
        )
        or exists (
          select 1 from portal_permissoes pp
          where pp.user_id = auth.uid() and (pp.is_admin is true or pp.is_dev is true)
        )
        or (t.quadro_id is null and t.visibilidade = 'publico')
        or (t.quadro_id is not null and tickets_quadro_pode_ver(t.quadro_id))
      )
  );
$$;

alter table public.tickets_quadros enable row level security;
alter table public.tickets_quadro_membros enable row level security;
alter table public.tickets_quadro_colunas enable row level security;

drop policy if exists tickets_quadros_select on public.tickets_quadros;
create policy tickets_quadros_select on public.tickets_quadros
  for select to authenticated using (tickets_quadro_pode_ver(id));

drop policy if exists tickets_quadro_membros_select on public.tickets_quadro_membros;
create policy tickets_quadro_membros_select on public.tickets_quadro_membros
  for select to authenticated using (tickets_quadro_pode_ver(quadro_id));

drop policy if exists tickets_quadro_colunas_select on public.tickets_quadro_colunas;
create policy tickets_quadro_colunas_select on public.tickets_quadro_colunas
  for select to authenticated using (tickets_quadro_pode_ver(quadro_id));

revoke insert, update, delete on public.tickets_quadros from anon, authenticated;
revoke insert, update, delete on public.tickets_quadro_membros from anon, authenticated;
revoke insert, update, delete on public.tickets_quadro_colunas from anon, authenticated;

notify pgrst, 'reload schema';
