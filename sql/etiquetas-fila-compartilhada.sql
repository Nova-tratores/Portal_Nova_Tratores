-- Fila de etiquetas COMPARTILHADA + histórico de folhas (v2).
-- Casa com o modelo do EtiquetasPanel: etiqueta = { linhas[], copias } (linha =
-- {conta,empresa,codigo,descricao,locacao}, 1-2 por etiqueta). Substitui a v1
-- (sql/create-etiquetas.sql, single-peça) — tabelas órfãs, drop seguro.
-- Leitura via RLS (authenticated); escrita só via service role (/api/ppv/etiquetas/*).
drop table if exists public.etiquetas_folhas;
drop table if exists public.etiquetas_fila;

-- Fila compartilhada: cada linha = uma etiqueta na fila (todos veem/alimentam).
create table public.etiquetas_fila (
  id          bigint generated always as identity primary key,
  linhas      jsonb   not null,                         -- [{conta,empresa,codigo,descricao,locacao}] (1-2)
  copias      integer not null default 1 check (copias between 1 and 50),
  criado_por  uuid,
  criado_nome text,
  criado_em   timestamptz not null default now()
);
create index etiquetas_fila_criado_em_idx on public.etiquetas_fila (criado_em);
alter table public.etiquetas_fila enable row level security;
drop policy if exists etiquetas_fila_sel on public.etiquetas_fila;
create policy etiquetas_fila_sel on public.etiquetas_fila for select to authenticated using (true);

-- Histórico de folhas impressas (snapshot p/ reimprimir a folha inteira).
-- itens = [{linhas, numero?, unidade_id?}] em ordem de impressão (já expandido
-- por cópias); usadas = posições (0-29) puladas na 1ª folha; rastreado = tinha QR.
create table public.etiquetas_folhas (
  id          bigint generated always as identity primary key,
  formato     text    not null default 'folha',         -- 'folha' | 'recorte'
  rastreado   boolean not null default false,
  usadas      jsonb   not null default '[]'::jsonb,
  total       integer not null default 0,
  itens       jsonb   not null default '[]'::jsonb,
  criado_por  uuid,
  criado_nome text,
  criado_em   timestamptz not null default now()
);
create index etiquetas_folhas_criado_em_idx on public.etiquetas_folhas (criado_em desc);
alter table public.etiquetas_folhas enable row level security;
drop policy if exists etiquetas_folhas_sel on public.etiquetas_folhas;
create policy etiquetas_folhas_sel on public.etiquetas_folhas for select to authenticated using (true);
