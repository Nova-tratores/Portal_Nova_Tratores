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
-- Sem tabela temporária (o SQL Editor não a mantém entre comandos): cada comando recalcula
-- a cópia a manter. Pode rodar de novo: na 2ª vez não sobra nada para apagar.

begin;

alter table frota_geocercas alter column re_id type text using re_id::text;

-- 3. paradas apontando para uma cópia → passam a apontar para a mantida
update frota_paradas p
set geocerca_id = m.manter
from frota_geocercas g
join (
  select distinct on (re_raw->>'_id') re_raw->>'_id' as rid, id as manter
  from frota_geocercas
  where origem = 'rotaexata' and re_raw ? '_id'
  order by re_raw->>'_id', created_at desc
) m on m.rid = g.re_raw->>'_id'
where p.geocerca_id = g.id and g.id <> m.manter;

-- 4a. apaga as cópias
delete from frota_geocercas g
using (
  select distinct on (re_raw->>'_id') re_raw->>'_id' as rid, id as manter
  from frota_geocercas
  where origem = 'rotaexata' and re_raw ? '_id'
  order by re_raw->>'_id', created_at desc
) m
where g.re_raw->>'_id' = m.rid and g.id <> m.manter;

-- 4b. a que ficou ganha o re_id
update frota_geocercas
set re_id = re_raw->>'_id'
where origem = 'rotaexata' and re_raw ? '_id' and re_id is null;

commit;

notify pgrst, 'reload schema';

-- Conferência (esperado: 26 | 26):
--   select count(*), count(re_id) from frota_geocercas where origem = 'rotaexata';
