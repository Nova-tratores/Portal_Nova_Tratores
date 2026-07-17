-- Carrinhos de peças do catálogo (salvar, gerenciar, compartilhar).
-- Escrita só via /api/carrinhos/* (service role). Leitura liberada a autenticados.
-- share_token: usado no link público (/carrinho/<token>) — Fase 3.

create extension if not exists pgcrypto;   -- gen_random_uuid()

create table if not exists public.carrinhos (
  id uuid primary key default gen_random_uuid(),
  nome text not null default '',
  cliente text default '',
  modelo text default '',        -- trator/implemento (ex.: "86-110")
  modelo_slug text default '',   -- slug do modelo, pro link público filtrar o catálogo
  servico text default '',
  status text not null default 'aberto',   -- aberto | fechado
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '7 days'),
  share_token text unique
);

create table if not exists public.carrinho_itens (
  id uuid primary key default gen_random_uuid(),
  carrinho_id uuid not null references public.carrinhos(id) on delete cascade,
  codigo text not null,
  descricao text default '',
  qtd integer not null default 1,
  cadastrado boolean default false,   -- se o código existe no Omie/manual
  criado_em timestamptz not null default now()
);
create index if not exists carrinho_itens_carrinho_idx on public.carrinho_itens(carrinho_id);

create table if not exists public.carrinho_historico (
  id uuid primary key default gen_random_uuid(),
  carrinho_id uuid not null references public.carrinhos(id) on delete cascade,
  quem text default '',
  acao text not null,          -- criar | add_item | rem_item | editar | fechar | reabrir | gerar_ppv | gerar_orcamento
  detalhe text default '',
  quando timestamptz not null default now()
);
create index if not exists carrinho_historico_carrinho_idx on public.carrinho_historico(carrinho_id);

alter table public.carrinhos enable row level security;
alter table public.carrinho_itens enable row level security;
alter table public.carrinho_historico enable row level security;

drop policy if exists carrinhos_select on public.carrinhos;
create policy carrinhos_select on public.carrinhos for select using (auth.role() = 'authenticated');
drop policy if exists carrinho_itens_select on public.carrinho_itens;
create policy carrinho_itens_select on public.carrinho_itens for select using (auth.role() = 'authenticated');
drop policy if exists carrinho_historico_select on public.carrinho_historico;
create policy carrinho_historico_select on public.carrinho_historico for select using (auth.role() = 'authenticated');
