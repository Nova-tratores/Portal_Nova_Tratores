-- Metas de venda de máquinas por vendedor (11/11/2026) — projeto do PORTAL (citrhumdkfivdzbmayde).
-- O diretor define na tela /empresa → Comercial → Vendedores (lápis ao lado do nome).
-- Uma linha por vendedor e mês: a meta vale daquele mês em diante, até ser trocada.
-- Escrita e leitura só pelo portal (/api/empresa/comercial e /api/empresa/comercial/meta, service role).
create table if not exists public.empresa_metas_vendedor (
  vendedor text not null,                          -- nome curto, como aparece na tela ("Dougras Bomfim")
  mes text not null check (mes ~ '^\d{4}-\d{2}$'), -- "2026-11"
  valor numeric(14, 2) not null check (valor >= 0),-- R$ de máquinas no mês (0 = sem meta)
  alterado_por text,
  alterado_em timestamptz not null default now(),
  primary key (vendedor, mes)
);
alter table public.empresa_metas_vendedor enable row level security;
-- sem policies: só o service role (rotas do portal) lê e grava
