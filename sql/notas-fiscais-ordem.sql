-- =====================================================================
-- Cache de notas fiscais — ORDENAÇÃO pelo cabeçalho da tela /estoque/notas
-- (15/10/2026). Complementa sql/notas-fiscais-cache.sql.
--
-- `numero` é texto (a NFS-e vem sem zeros, a NF-e também depois do ltrim):
-- ordenar por ele põe "9365" depois de "10000". A coluna gerada `numero_n`
-- (só dígitos → bigint) deixa a ordenação numérica no servidor (PostgREST
-- não faz cast no order). Sem ela a rota ordena por `numero` como texto.
--
-- Rode no SQL Editor do Supabase. Idempotente.
-- =====================================================================
alter table notas_fiscais_docs
  add column if not exists numero_n bigint
    generated always as (nullif(regexp_replace(coalesce(numero, ''), '\D', '', 'g'), '')::bigint) stored;

create index if not exists notas_fiscais_docs_numero_n_idx on notas_fiscais_docs (conta_omie, numero_n);

notify pgrst, 'reload schema';
