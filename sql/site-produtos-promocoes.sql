-- =============================================================================
-- MÓDULO SITE — MÁQUINAS EDITÁVEIS E PROMOÇÕES (Comercial → Site → Catálogo e Promoções).
-- Pedido do José em 12/11/2026: "um bloco onde vemos o conteúdo do site, quais máquinas estão ali, para incluir,
-- excluir ou alterar uma informação" e "sempre vai ter um bloco de promoção: coloca a foto da promoção ou seleciona
-- uma máquina do site".
--
-- Projeto Supabase: PORTAL (citrhumdkfivdzbmayde). Idempotente. Rodar DEPOIS de sql/site-modulo.sql.
-- Leitura/escrita só pelo servidor (service role). O site lê no build (botão Publicar):
--   GET /api/publico/site/produtos   (alterações, máquinas novas e as tiradas do site)
--   GET /api/publico/site/promocoes  (promoções ativas)
-- =============================================================================

-- 1) Catálogo: além de preço/selo/ocultar, agora guarda qualquer campo mudado e as máquinas criadas no portal.
alter table site_catalogo add column if not exists dados jsonb not null default '{}'::jsonb; -- campos mudados (título, textos, fotos, ficha…)
alter table site_catalogo add column if not exists novo boolean not null default false;      -- criada no portal (não existe nos arquivos do site)
alter table site_catalogo add column if not exists criado_em timestamptz not null default now();

-- 2) Promoções da página inicial (carrossel).
create table if not exists site_promocoes (
  id              uuid primary key default gen_random_uuid(),
  titulo          text not null check (char_length(titulo) between 2 and 80),
  texto           text check (texto is null or char_length(texto) <= 240),
  imagem          text,            -- arte da promoção (URL pública do Storage site-produtos)
  produto_slug    text,            -- ou uma máquina do site (usa a foto e a página dela)
  link            text,            -- opcional: para onde o botão leva (vazio = página da máquina ou WhatsApp)
  botao           text check (botao is null or char_length(botao) <= 30),
  inicio          date,
  fim             date,
  ativo           boolean not null default true,
  ordem           integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text,
  check (imagem is not null or produto_slug is not null)
);
create index if not exists site_promocoes_ordem_idx on site_promocoes (ordem, criado_em);

alter table site_promocoes enable row level security;
revoke all on site_promocoes from anon, authenticated;

-- 2b) Arte quadrada do celular (12/11): com ela, a promoção vira faixa larga só com a arte (1920×640 + 1080×1080).
alter table site_promocoes add column if not exists imagem_celular text;

-- 3) Pasta pública das fotos de máquina e das artes de promoção (até 8 MB; jpg, png, webp).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('site-produtos', 'site-produtos', true, 8388608, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

notify pgrst, 'reload schema';

-- 4) Marcas (12/11, José: "colocar uma nova marca, ou incluir modelos dentro de uma; pede a imagem do banner e tudo
--    mais"). Valem por cima do que está no código do site; marca nova aparece quando tiver modelo ou itens sob consulta.
create table if not exists site_marcas (
  nome            text primary key check (char_length(nome) between 2 and 40),
  logo            text,            -- URL pública (Storage site-produtos/marcas), PNG transparente ou fundo branco
  banner          text,            -- foto de campo deitada, topo da página da marca
  sobre           text check (sobre is null or char_length(sobre) <= 600),
  sob_consulta    text[] not null default '{}',
  ordem           integer,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);
alter table site_marcas enable row level security;
revoke all on site_marcas from anon, authenticated;

notify pgrst, 'reload schema';
