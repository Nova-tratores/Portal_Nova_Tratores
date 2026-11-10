-- =============================================================================
-- MÓDULO SITE — CONTEÚDO EDITÁVEL E PUBLICAÇÕES (Comercial → Site → Conteúdo).
-- Pedido do José em 10/11/2026: "área gerencial do site no bloco Comercial do portal, onde conseguimos alterar
-- tudo por lá, não só por código". Decisão: botão Publicar (o site é gerado de novo com o que está aqui).
--
-- Projeto Supabase: PORTAL (citrhumdk…). Idempotente. Rodar DEPOIS de sql/site-modulo.sql.
-- Leitura/escrita só pelo servidor (service role):
--   GET  /api/publico/site/conteudo   (o site lê no build, sem login)
--   /api/site/conteudo, /api/site/publicar  (portal, módulo "site")
-- =============================================================================

-- Um registro por seção do site (contato, horario, home, banners, aviso). valor = só os campos mudados.
create table if not exists site_conteudo (
  grupo           text primary key check (grupo in ('contato','horario','home','banners','aviso')),
  valor           jsonb not null default '{}'::jsonb,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);

-- Histórico: quem mudou o quê (para desfazer se precisar).
create table if not exists site_conteudo_hist (
  id              bigint generated always as identity primary key,
  grupo           text not null,
  antes           jsonb,
  depois          jsonb,
  por             text,
  em              timestamptz not null default now()
);
create index if not exists site_conteudo_hist_em_idx on site_conteudo_hist (em desc);

-- Cada vez que alguém toca em "Publicar site".
create table if not exists site_publicacoes (
  id              bigint generated always as identity primary key,
  pedido_em       timestamptz not null default now(),
  por             text,
  ok              boolean not null default false,
  resposta        text
);
create index if not exists site_publicacoes_em_idx on site_publicacoes (pedido_em desc);

alter table site_conteudo      enable row level security;
alter table site_conteudo_hist enable row level security;
alter table site_publicacoes   enable row level security;
revoke all on site_conteudo, site_conteudo_hist, site_publicacoes from anon, authenticated;

notify pgrst, 'reload schema';
