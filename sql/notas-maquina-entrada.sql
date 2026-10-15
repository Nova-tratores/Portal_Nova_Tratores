-- Máquina nas NOTAS DE ENTRADA (José, 15/10/2026): toda nota vai para a Pasta Clientes
-- e a nota de máquina sem dono fica presa à máquina (pelo chassi). As notas de saída já
-- ganham `maquina` em notas_fiscais_vincular (sql/notas-fiscais-vinculos.sql); aqui a
-- mesma regra de chassis (notas_fiscais_chassis) roda nos itens da nota de entrada
-- (descrição + informações adicionais de cada item, em notas_entrada.itens).
-- Depende de sql/notas-fiscais-vinculos.sql (função notas_fiscais_chassis). Idempotente.

create or replace function notas_fiscais_vincular_entrada(p_desde date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v int := 0;
begin
  with fonte as (
    select d.id,
           notas_fiscais_chassis(null, (
             select string_agg(concat_ws(' ', it->'prod'->>'xProd', it->>'infAdProd', it->'prod'->>'infAdProd'), ' ')
             from jsonb_array_elements(case when jsonb_typeof(ne.itens) = 'array' then ne.itens else '[]'::jsonb end) it
           )) as maquina
    from notas_fiscais_docs d
    join notas_entrada ne on ne.id::text = d.origem_id
    where d.tipo = 'entrada' and d.origem_tabela = 'notas_entrada'
      and (p_desde is null or d.data_emissao >= p_desde)
  )
  update notas_fiscais_docs d
     set maquina = f.maquina
    from fonte f
   where d.id = f.id
     and d.maquina is distinct from f.maquina;
  get diagnostics v = row_count;
  return jsonb_build_object('entrada', v);
end;
$$;

revoke all on function notas_fiscais_vincular_entrada(date) from public, anon, authenticated;
grant execute on function notas_fiscais_vincular_entrada(date) to service_role;

-- 1ª carga (todas as notas de entrada)
select notas_fiscais_vincular_entrada(null);

notify pgrst, 'reload schema';
