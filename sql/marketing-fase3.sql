-- =====================================================================
-- MARKETING — Fase 3.2 (texto por rede) e 3.5 (aprovação de post de preço), 23/11/2026
-- Só ACRESCENTA colunas em site_posts. Pode rodar mais de uma vez. Sem ele, o post grava sem estes campos.
-- Rodar no Supabase: SQL Editor → colar tudo → Run.
-- =====================================================================
alter table site_posts add column if not exists textos              jsonb not null default '{}'::jsonb;  -- { instagram: "texto só do insta", ... }
alter table site_posts add column if not exists primeiro_comentario text;
alter table site_posts add column if not exists hashtags            text;
alter table site_posts add column if not exists titulo_youtube      text;
alter table site_posts add column if not exists aprovado_por        text;          -- post de preço/condição: quem aprovou
alter table site_posts add column if not exists aprovado_em         timestamptz;
notify pgrst, 'reload schema';
-- Quem aprova: dar a permissão "Conteúdo das redes — aprovar post de preço/condição" na tela de permissões (ou ser admin).
