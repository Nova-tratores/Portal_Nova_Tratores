-- Observações por produto (preenchidas na tela /estoque e no popup do PPV).
-- Uma linha por código de produto (Omie). Escrita só via /api/produtos/observacao
-- (service role). Leitura liberada para autenticados.
create table if not exists public.produto_observacoes (
  codigo text primary key,
  observacao text not null default '',
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

alter table public.produto_observacoes enable row level security;

-- Leitura para qualquer usuário autenticado.
drop policy if exists produto_observacoes_select on public.produto_observacoes;
create policy produto_observacoes_select on public.produto_observacoes
  for select using (auth.role() = 'authenticated');
