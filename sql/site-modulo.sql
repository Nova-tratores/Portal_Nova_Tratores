-- =============================================================================
-- MÓDULO SITE (Comercial) — pedidos de proposta do site, catálogo do site e acessos.
-- Pedido do José em 10/11/2026: "conectar o catálogo… ver o que está sendo oferecido no site,
-- mudar preço e tudo mais; ver quem entra no site, quantos acessos, e se saiu, o que aconteceu".
--
-- Projeto Supabase: PORTAL (citrhumdk…). Idempotente: pode rodar de novo.
-- Escrita e leitura só pelo servidor (service role), pelas rotas:
--   POST /api/publico/site/proposta   (site, sem login: grava o pedido e avisa no sino)
--   POST /api/publico/site/evento     (site, sem login: contador anônimo de acessos)
--   GET  /api/publico/site/catalogo   (site, sem login: o que mudou por produto)
--   /api/site/*                        (portal, módulo "site")
-- RLS ligado e nenhuma policy: anon e logados não leem direto pelo banco.
-- =============================================================================

-- 1) Pedidos de proposta vindos do site ------------------------------------
create table if not exists site_pedidos (
  id              uuid primary key default gen_random_uuid(),
  criado_em       timestamptz not null default now(),
  nome            text not null,
  telefone        text not null,
  telefone_norm   text generated always as (regexp_replace(telefone, '\D', '', 'g')) stored,
  cidade          text,
  interesse       text,            -- máquina escolhida no site ("Trator Mahindra 6075") ou "ainda não sei"
  linha           text,            -- pronaf1 | pronaf5 | pronamp | moderfrota | finame | consorcio | nao-sei
  valor           numeric(14,2),   -- quanto quer financiar
  usado           boolean not null default false,
  obs             text,
  simulacao       jsonb,           -- última simulação feita na página (programa, parcela, parcelas, período)
  origem          text,            -- página de onde veio (/credito/)
  visitante       text,            -- código anônimo do aparelho (liga o pedido às visitas em site_eventos)
  status          text not null default 'novo'
                  check (status in ('novo','em_contato','proposta','ganho','perdido','descartado')),
  responsavel_id  uuid,            -- auth.users do portal
  responsavel_nome text,
  atendido_em     timestamptz,
  notas           text,            -- anotações internas do vendedor
  atualizado_em   timestamptz not null default now()
);
create index if not exists site_pedidos_criado_idx on site_pedidos (criado_em desc);
create index if not exists site_pedidos_status_idx on site_pedidos (status);
create index if not exists site_pedidos_tel_idx on site_pedidos (telefone_norm);

-- 2) Catálogo do site: só o que muda por cima dos arquivos do site ----------
-- A lista de produtos vem do próprio site (https://novatratores.com.br/catalogo.json, gerada no build).
-- Aqui fica só o que o comercial muda: preço, mostrar preço, pronta entrega, selo, ocultar.
create table if not exists site_catalogo (
  slug            text primary key,
  preco           numeric(14,2),
  exibir_preco    boolean not null default false,
  pronta_entrega  boolean not null default false,
  oculto          boolean not null default false,
  selo            text check (selo is null or char_length(selo) <= 30),
  notas           text,
  atualizado_em   timestamptz not null default now(),
  atualizado_por  text
);

-- Histórico de cada mudança (quem mudou o preço, de quanto para quanto).
create table if not exists site_catalogo_hist (
  id              bigint generated always as identity primary key,
  slug            text not null,
  campo           text not null,
  de              text,
  para            text,
  por             text,
  em              timestamptz not null default now()
);
create index if not exists site_catalogo_hist_slug_idx on site_catalogo_hist (slug, em desc);

-- 3) Acessos do site (anônimo) -----------------------------------------------
-- Um registro por evento: pagina (abriu) · clique (WhatsApp, telefone, simulador…) · saida (tempo e rolagem).
create table if not exists site_eventos (
  id              bigint generated always as identity primary key,
  em              timestamptz not null default now(),
  tipo            text not null check (tipo in ('pagina','clique','saida')),
  visitante       text not null,
  sessao          text not null,
  caminho         text not null,
  titulo          text,
  origem          text,            -- host de onde veio (google.com, instagram.com…), vazio = direto
  utm             text,
  campanha        text,
  aparelho        text,            -- celular | tablet | computador
  evento          text,            -- clique_whatsapp, clique_telefone, simulador_formulario…
  rotulo          text,
  tempo_s         integer,
  rolou           smallint
);
create index if not exists site_eventos_em_idx on site_eventos (em desc);
create index if not exists site_eventos_sessao_idx on site_eventos (sessao, em);
create index if not exists site_eventos_tipo_em_idx on site_eventos (tipo, em desc);

-- Limpeza: acessos com mais de 13 meses saem (pedidos ficam). Rodar à mão ou num cron:
--   delete from site_eventos where em < now() - interval '13 months';

-- 4) Segurança ---------------------------------------------------------------
alter table site_pedidos       enable row level security;
alter table site_catalogo      enable row level security;
alter table site_catalogo_hist enable row level security;
alter table site_eventos       enable row level security;
revoke all on site_pedidos, site_catalogo, site_catalogo_hist, site_eventos from anon, authenticated;

notify pgrst, 'reload schema';
