-- Separar máquinas recebidas em lote (1 produto por série/chassi) — registro de cada separação.
-- Sem esta tabela a separação funciona e fica só no audit_log (a tela avisa).
create table if not exists public.maquinas_separacoes (
  id bigserial primary key,
  conta text not null,
  id_receb bigint,
  numero_nfe text,
  seq int,
  produto_origem bigint not null,
  codigo_origem_antes text,
  series text[] not null,
  produtos_criados jsonb not null default '[]',
  ajustes jsonb not null default '[]',
  projetos jsonb not null default '[]',
  cmc numeric,
  local_estoque bigint,
  usuario text,
  usuario_id uuid,
  criado_em timestamptz not null default now()
);
create index if not exists maquinas_separacoes_origem_idx on public.maquinas_separacoes (conta, produto_origem);
alter table public.maquinas_separacoes enable row level security;
revoke all on public.maquinas_separacoes from anon, authenticated;
notify pgrst, 'reload schema';
