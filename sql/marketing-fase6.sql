-- =====================================================================
-- MARKETING — Fase 6.1: ideias de post automáticas (24/11/2026)
-- origem_ref = de onde a ideia nasceu ('venda:128', 'revisao:OS-0880', 'aniversario:77', 'busca:colhedora:2026-11-23').
-- Único: o robô diário não cria a mesma ideia duas vezes. Só acrescenta. Pode rodar mais de uma vez.
-- Rodar no Supabase: SQL Editor → colar → Run.
-- =====================================================================
alter table site_posts add column if not exists origem_ref text;
create unique index if not exists site_posts_origem_ref_uk on site_posts (origem_ref) where origem_ref is not null;
notify pgrst, 'reload schema';
