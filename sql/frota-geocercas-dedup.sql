-- Frota: locais (geocercas) da Rota Exata duplicados todo dia — 05/11/2026.
--
-- Causa: a Rota Exata manda o id do destino como texto (_id = "691248fb5aee86a73ece68fd",
-- ObjectId do Mongo), mas frota_geocercas.re_id era BIGINT. O sync fazia Number(_id) = NaN
-- → re_id NULL → o upsert por re_id nunca casava e INSERIA os 26 destinos de novo a cada
-- rodada diária, desde 14/07/2026: 2.626 linhas para 26 locais.
--
-- Esta migration:
--   1. troca re_id para TEXT (todas as linhas estão com re_id NULL; nenhuma foi criada no portal);
--   2. fica com a cópia MAIS RECENTE de cada destino (coordenada/raio mais atuais);
--   3. aponta as paradas (frota_paradas.geocerca_id, a única FK) para a cópia mantida;
--   4. apaga as cópias e grava o re_id = _id na mantida.
-- O código novo do sync (lib/frota/sync.ts) grava re_id = _id e passa a ATUALIZAR em vez de inserir.
-- Pode rodar de novo: na 2ª vez não sobra nada para apagar.

begin;

alter table frota_geocercas alter column re_id type text using re_id::text;

create temp table _geo_manter on commit drop as
select distinct on (re_raw->>'_id') re_raw->>'_id' as rid, id as manter
from frota_geocercas
where origem = 'rotaexata' and re_raw ? '_id'
order by re_raw->>'_id', created_at desc;

update frota_paradas p
set geocerca_id = m.manter
from frota_geocercas g
join _geo_manter m on m.rid = g.re_raw->>'_id'
where p.geocerca_id = g.id and g.id <> m.manter;

delete from frota_geocercas g
using _geo_manter m
where g.re_raw->>'_id' = m.rid and g.id <> m.manter;

update frota_geocercas g
set re_id = m.rid
from _geo_manter m
where g.id = m.manter;

commit;

notify pgrst, 'reload schema';

-- Conferência (esperado: ~26 linhas, todas com re_id preenchido):
--   select count(*), count(re_id) from frota_geocercas where origem = 'rotaexata';
