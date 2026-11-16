-- Site e redes (José, 12/11/2026): o módulo Site controla todas as redes da Nova Tratores
-- (site, Instagram, Facebook, TikTok, YouTube Shorts). Projeto do PORTAL: citrhumdkfivdzbmayde.
-- Pode rodar mais de uma vez.

-- 1) Promoção pronta para cada rede: o designer manda cada tamanho.
alter table site_promocoes add column if not exists arte_feed text;       -- 1080×1350 (feed Insta/Face)
alter table site_promocoes add column if not exists arte_vertical text;   -- 1080×1920 (stories, reels)
alter table site_promocoes add column if not exists video text;           -- vídeo em pé (TikTok, Shorts, Reels)
alter table site_promocoes add column if not exists legenda text;         -- texto do post nas redes
alter table site_promocoes add column if not exists redes text[] not null default '{site}';

-- 2) Calendário de conteúdo: cada linha é um post, numa data, em uma ou várias redes.
create table if not exists site_posts (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  legenda text,
  redes text[] not null default '{}',              -- site, instagram, facebook, tiktok, youtube
  formato text not null default 'feed',            -- feed | reels | story | video
  midia jsonb not null default '{}'::jsonb,        -- { feed, vertical, video, site } (URLs públicas)
  quando timestamptz,                              -- dia e hora de sair (null = ideia sem data)
  status text not null default 'ideia' check (status in ('ideia','pronto','agendado','publicado','parcial','erro')),
  promocao_id uuid references site_promocoes(id) on delete set null,
  resultado jsonb not null default '{}'::jsonb,    -- por rede: { ok, id, link, erro, em }
  notas text,
  criado_por text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create index if not exists site_posts_quando_idx on site_posts (quando);
alter table site_posts enable row level security;
revoke all on site_posts from anon, authenticated;

-- 3) Contas ligadas (token de acesso de cada rede). Só o servidor lê.
create table if not exists site_redes_contas (
  rede text primary key check (rede in ('instagram','facebook','tiktok','youtube')),
  nome text,                 -- @novatratores, nome da página…
  conta_id text,             -- id da conta/página/canal na rede
  token text,                -- token de acesso (nunca vai para o navegador)
  expira_em timestamptz,
  ligado_por text,
  atualizado_em timestamptz not null default now()
);
alter table site_redes_contas enable row level security;
revoke all on site_redes_contas from anon, authenticated;

-- 4) Números de cada rede por dia (gravados pelo robô; a aba Acessos só lê).
create table if not exists site_redes_metricas (
  rede text not null,
  dia date not null,
  seguidores int,
  alcance int,
  visualizacoes int,
  interacoes int,
  cliques int,
  posts jsonb not null default '[]'::jsonb,   -- top posts do dia: [{ id, link, titulo, views, curtidas }]
  atualizado_em timestamptz not null default now(),
  primary key (rede, dia)
);
alter table site_redes_metricas enable row level security;
revoke all on site_redes_metricas from anon, authenticated;

-- 5) A pasta de fotos aceita vídeo (TikTok/Shorts/Reels) até 300 MB.
update storage.buckets
   set file_size_limit = 314572800,
       allowed_mime_types = array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime']
 where id = 'site-produtos';
