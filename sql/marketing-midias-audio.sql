-- MARKETING — mídia da campanha aceita ÁUDIO (23/11/2026). Pode rodar mais de uma vez.
-- Rodar no Supabase: SQL Editor → colar → Run.
alter table mkt_midias drop constraint if exists mkt_midias_tipo_check;
alter table mkt_midias add constraint mkt_midias_tipo_check
  check (tipo in ('foto','video','audio','post','clipping','banner','documento','outro'));
notify pgrst, 'reload schema';
