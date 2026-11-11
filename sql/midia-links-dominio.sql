-- Links dos arquivos com o domínio da Nova (midia.novatratores.com) — 11/11/2026.
--
-- O Supabase serve os mesmos arquivos em https://midia.novatratores.com (add-on Custom
-- Domain + CNAME na Namecheap). Desde o deploy de 11/11 o portal e o app dos técnicos
-- gravam os links novos já com esse domínio; este script troca os links ANTIGOS que já
-- estão gravados no banco.
--
-- Troca SÓ o começo dos links públicos:
--   https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/
--   → https://midia.novatratores.com/storage/v1/object/public/
-- O resto do link (bucket e arquivo) fica igual; link assinado (/object/sign/) não muda.
-- Vale para toda coluna de texto, json/jsonb e lista de texto das tabelas do schema public.
--
-- Os gatilhos (triggers) ficam DESLIGADOS durante a troca (session_replication_role =
-- replica): é só o endereço que muda, então "atualizado em", históricos e avisos não
-- devem disparar. Se o Supabase não deixar desligar, o script segue com eles ligados e
-- a coluna que um gatilho recusar aparece na lista com o erro (não para o resto).
--
-- COMO RODAR (SQL Editor), em ordem:
--   1. Rode o arquivo inteiro: cria as duas funções.
--   2. Conferência (só lê):   select * from midia_links_contar();
--   3. Troca:                 select * from midia_links_trocar();
--   4. Conferência de novo:   select * from midia_links_contar();   -- esperado: nenhuma linha
--   Desfazer (volta tudo):    select * from midia_links_trocar(
--                               'https://midia.novatratores.com/storage/v1/object/public/',
--                               'https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/');
--   Pode rodar de novo quantas vezes quiser: o que já foi trocado não casa mais.
--   No fim, se quiser limpar: drop function midia_links_contar(text); drop function midia_links_trocar(text, text);

create or replace function midia_links_contar(
  p_de text default 'https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/'
) returns table (tabela text, coluna text, linhas bigint)
language plpgsql
set statement_timeout = 0
as $$
declare
  c record;
  n bigint;
begin
  for c in
    select col.table_name::text as t, col.column_name::text as cn
    from information_schema.columns col
    join information_schema.tables tb
      on tb.table_schema = col.table_schema and tb.table_name = col.table_name
    where col.table_schema = 'public'
      and tb.table_type = 'BASE TABLE'
      and (col.data_type in ('text', 'character varying', 'json', 'jsonb')
           or (col.data_type = 'ARRAY' and col.udt_name in ('_text', '_varchar')))
      and col.is_generated = 'NEVER'
    order by 1, 2
  loop
    execute format('select count(*) from public.%I where %I::text like %L', c.t, c.cn, '%' || p_de || '%') into n;
    if n > 0 then
      tabela := c.t; coluna := c.cn; linhas := n;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function midia_links_trocar(
  p_de text default 'https://citrhumdkfivdzbmayde.supabase.co/storage/v1/object/public/',
  p_para text default 'https://midia.novatratores.com/storage/v1/object/public/'
) returns table (tabela text, coluna text, linhas bigint, erro text)
language plpgsql
set statement_timeout = 0
as $$
declare
  c record;
  n bigint;
  expr text;
begin
  begin
    set local session_replication_role = replica;
  exception when others then
    raise notice 'Sem permissão para desligar os gatilhos (%); seguindo com eles ligados.', sqlerrm;
  end;

  for c in
    select col.table_name::text as t, col.column_name::text as cn, col.data_type as dt, col.udt_name as udt
    from information_schema.columns col
    join information_schema.tables tb
      on tb.table_schema = col.table_schema and tb.table_name = col.table_name
    where col.table_schema = 'public'
      and tb.table_type = 'BASE TABLE'
      and (col.data_type in ('text', 'character varying', 'json', 'jsonb')
           or (col.data_type = 'ARRAY' and col.udt_name in ('_text', '_varchar')))
      and col.is_generated = 'NEVER'
    order by 1, 2
  loop
    expr := case
      when c.dt in ('text', 'character varying') then format('replace(%I, %L, %L)', c.cn, p_de, p_para)
      when c.dt = 'jsonb' then format('replace(%I::text, %L, %L)::jsonb', c.cn, p_de, p_para)
      when c.dt = 'json'  then format('replace(%I::text, %L, %L)::json', c.cn, p_de, p_para)
      else format('replace(%I::text, %L, %L)::%s', c.cn, p_de, p_para, case c.udt when '_varchar' then 'varchar[]' else 'text[]' end)
    end;
    begin
      execute format('update public.%I set %I = %s where %I::text like %L',
                     c.t, c.cn, expr, c.cn, '%' || p_de || '%');
      get diagnostics n = row_count;
      if n > 0 then
        tabela := c.t; coluna := c.cn; linhas := n; erro := null;
        return next;
      end if;
    exception when others then
      tabela := c.t; coluna := c.cn; linhas := 0; erro := sqlerrm;
      return next;
    end;
  end loop;
end;
$$;

-- Só quem roda o SQL Editor usa; ninguém de fora chama.
revoke all on function midia_links_contar(text) from public, anon, authenticated;
revoke all on function midia_links_trocar(text, text) from public, anon, authenticated;
