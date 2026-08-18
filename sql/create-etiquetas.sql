-- Etiquetas de identificação de peças (Feature B — núcleo).
-- Fila de impressão COMPARTILHADA + histórico de folhas impressas (snapshot p/
-- reimprimir idêntico). Leitura via RLS (authenticated), escrita SÓ via service
-- role (rotas /api/ppv/etiquetas/*). Rodar no SQL Editor do Supabase.
-- QR / unidades rastreadas / Retiradas = fase 2 (não incluído aqui).

-- ---------------------------------------------------------------------------
-- Fila de impressão: uma entrada por marcação (não deduplica). `quantidade` =
-- nº de etiquetas daquela peça. `codigo`/`descricao` = snapshot no momento de
-- adicionar (a locação é lida ao vivo na hora de imprimir).
create table if not exists public.etiquetas_fila (
  id           bigint generated always as identity primary key,
  empresa      text not null,             -- 'NOVA' | 'CASTRO' (conta_omie)
  codigo_produto text not null,           -- ID interno Omie (a CHAVE)
  codigo       text,                       -- SKU legível (snapshot)
  descricao    text,                       -- snapshot
  quantidade   integer not null default 1 check (quantidade >= 1),
  criado_por   uuid,
  criado_nome  text,
  criado_em    timestamptz not null default now()
);
create index if not exists etiquetas_fila_criado_em_idx on public.etiquetas_fila (criado_em);

alter table public.etiquetas_fila enable row level security;
drop policy if exists etiquetas_fila_sel on public.etiquetas_fila;
create policy etiquetas_fila_sel on public.etiquetas_fila for select to authenticated using (true);
-- sem policy de insert/update/delete → escrita só pelo service role

-- ---------------------------------------------------------------------------
-- Histórico de folhas impressas. `itens` = snapshot em ordem de impressão
-- [{empresa, codigo, descricao, locacao}]; `inicio_posicao` (1..30) = 1ª célula
-- usada na folha (pula as anteriores). Reimprimir = regenera do snapshot.
create table if not exists public.etiquetas_folhas (
  id             bigint generated always as identity primary key,
  papel          text not null default '3x10',   -- '3x10' (adesiva) | 'comum'
  inicio_posicao integer not null default 1 check (inicio_posicao between 1 and 30),
  total_etiquetas integer not null default 0,
  itens          jsonb not null default '[]'::jsonb,
  criado_por     uuid,
  criado_nome    text,
  criado_em      timestamptz not null default now()
);
create index if not exists etiquetas_folhas_criado_em_idx on public.etiquetas_folhas (criado_em desc);

alter table public.etiquetas_folhas enable row level security;
drop policy if exists etiquetas_folhas_sel on public.etiquetas_folhas;
create policy etiquetas_folhas_sel on public.etiquetas_folhas for select to authenticated using (true);
-- escrita só pelo service role
