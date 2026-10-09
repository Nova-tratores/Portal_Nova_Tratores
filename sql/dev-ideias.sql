-- =============================================================================
-- IDEIAS DOS DEVS — bloco de notas em 3 estágios (Central de Trabalho → Ideias)
--
-- 1. Captar: dev abre /ideias, digita, salva (dev_ideias sem grupo).
-- 2. Agrupar: ideias afins viram um grupo (dev_ideias_grupos; grupo sem ticket).
-- 3. Planejar: o grupo vira um ticket da Central (grupo com ticket_id).
--
-- O estágio NÃO é coluna — é derivado: ideia sem grupo_id = captada; grupo sem
-- ticket_id = agrupado (a planejar); grupo com ticket_id = planejado.
--
-- Compartilhado entre todos os Devs (papel is_dev). Só o service role toca
-- (rotas /api/dev/ideias/*, que exigem auth.isDev): RLS ligada SEM policy +
-- REVOKE — a chave anônima/autenticada não lê nem escreve direto.
-- Rodar no SQL Editor do Supabase. Idempotente.
-- =============================================================================

create table if not exists public.dev_ideias_grupos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (char_length(nome) between 1 and 120),
  descricao   text check (char_length(descricao) <= 2000),
  cor         text check (cor ~ '^#[0-9a-f]{6}$'),
  -- Preenchido no 3º passo: o ticket que executa o grupo.
  ticket_id   uuid references public.tickets(id) on delete set null,
  criado_por  uuid not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dev_ideias_grupos_ticket_idx on public.dev_ideias_grupos (ticket_id);

create table if not exists public.dev_ideias (
  id          uuid primary key default gen_random_uuid(),
  texto       text not null check (char_length(texto) between 1 and 4000),
  autor_id    uuid not null,
  grupo_id    uuid references public.dev_ideias_grupos(id) on delete set null,
  posicao     int not null default 0,
  arquivada   boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists dev_ideias_grupo_idx on public.dev_ideias (grupo_id);
create index if not exists dev_ideias_created_idx on public.dev_ideias (created_at desc);

alter table public.dev_ideias_grupos enable row level security;
alter table public.dev_ideias enable row level security;
revoke all on public.dev_ideias_grupos from anon, authenticated;
revoke all on public.dev_ideias from anon, authenticated;

notify pgrst, 'reload schema';
