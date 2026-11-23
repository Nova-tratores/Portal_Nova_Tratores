-- =====================================================================
-- MARKETING — Fase 4 do plano (etiquetas e código do post), 23/11/2026
-- Só ACRESCENTA colunas em site_posts. Pode rodar mais de uma vez.
-- Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================
alter table site_posts add column if not exists etiqueta_tipo text;     -- entrega | oficina | dica | promocao | data | bastidor | depoimento | evento
alter table site_posts add column if not exists gente_real    boolean;  -- tem cliente/técnico/operador de verdade?
alter table site_posts add column if not exists maquina       text;     -- ex.: Mahindra 6075 (opcional)
alter table site_posts add column if not exists gancho        text;     -- pergunta | numero | antes_depois | pessoa | outro
alter table site_posts add column if not exists codigo        text;     -- código curto (ex.: 6075CAB) que vai no WhatsApp e na UTM
alter table site_posts add column if not exists acao_id       uuid references mkt_acoes(id) on delete set null;   -- campanha do post (opcional)
create unique index if not exists site_posts_codigo_uk on site_posts (codigo) where codigo is not null;
create index if not exists site_posts_acao_idx on site_posts (acao_id);
-- formato agora aceita também 'carrossel' (a coluna não tem CHECK; quem valida é a API)

notify pgrst, 'reload schema';

-- Desfazer (se precisar):
-- drop index if exists site_posts_codigo_uk; drop index if exists site_posts_acao_idx;
-- alter table site_posts drop column if exists acao_id, drop column if exists codigo, drop column if exists gancho,
--   drop column if exists maquina, drop column if exists gente_real, drop column if exists etiqueta_tipo;
