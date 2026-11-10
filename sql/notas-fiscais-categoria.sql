-- Tipo da nota para a tela /financeiro/notas (José, 10/11/2026):
--   nfs           = NFS-e (serviço)
--   nfe_pecas     = NF-e só com peças
--   nfe_maquinas  = NF-e só com máquinas/implementos
--   nfe_mista     = NF-e com peças E máquinas
--   nfe_outras    = NF-e sem itens de venda no portal (remessa, devolução, pedido fora da pasta…)
--   entrada       = nota de entrada
-- A NF-e é classificada pelos itens do pedido de venda (vendas_itens.familia, pelo nº do
-- pedido que notas_fiscais_vincular gravou em pedido_num): família "Peças" (ou vazia/
-- ".Inativo") = peça; qualquer outra (Trator Novo, Implemento, Carreta…) = máquina.
-- Medido em 10/11/2026 sobre 9.990 NF-e de saída: 7.147 peças · 1.015 máquinas · 9 mistas ·
-- 1.819 outras (1.474 sem pedido na pasta + 345 com pedido sem itens de venda).
-- Depende de sql/notas-fiscais-vinculos.sql (pedido_num). Idempotente.
-- Sem esta migration a tela continua: o tipo vira só NF-e / NFS-e / Entrada.

alter table notas_fiscais_docs add column if not exists categoria text;
create index if not exists notas_fiscais_docs_categoria_idx on notas_fiscais_docs (categoria);
create index if not exists vendas_itens_pedido_idx on vendas_itens (conta_omie, numero_pedido);

create or replace function notas_fiscais_categorizar(p_desde date default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v int := 0;
begin
  with fam as (
    select upper(vi.conta_omie) as conta,
           nullif(ltrim(regexp_replace(coalesce(vi.numero_pedido, ''), '\D', '', 'g'), '0'), '') as num,
           bool_or(coalesce(vi.familia, '') in ('Peças', '', '.Inativo'))     as tem_peca,
           bool_or(coalesce(vi.familia, '') not in ('Peças', '', '.Inativo')) as tem_maquina
    from vendas_itens vi
    group by 1, 2
  ), calc as (
    select d.id,
      case
        when d.tipo = 'saida_servico' then 'nfs'
        when d.tipo = 'entrada' then 'entrada'
        when f.tem_peca and f.tem_maquina then 'nfe_mista'
        when f.tem_maquina then 'nfe_maquinas'
        when f.tem_peca then 'nfe_pecas'
        else 'nfe_outras'
      end as categoria
    from notas_fiscais_docs d
    left join fam f
      on d.tipo = 'saida_produto' and f.conta = upper(d.conta_omie) and f.num = d.pedido_num
    where p_desde is null or d.data_emissao is null or d.data_emissao >= p_desde
  )
  update notas_fiscais_docs d
     set categoria = c.categoria
    from calc c
   where c.id = d.id
     and d.categoria is distinct from c.categoria;
  get diagnostics v = row_count;
  return jsonb_build_object('categorizadas', v);
end;
$$;

revoke all on function notas_fiscais_categorizar(date) from public, anon, authenticated;
grant execute on function notas_fiscais_categorizar(date) to service_role;
comment on function notas_fiscais_categorizar(date) is 'Tipo da nota (NFS-e, NF-e peças/máquinas/mista/outras, entrada) em notas_fiscais_docs.categoria. Só service role.';

-- 1ª carga (todas)
select notas_fiscais_categorizar(null);

notify pgrst, 'reload schema';

-- Conferência:
-- select categoria, count(*), sum(valor) from notas_fiscais_docs group by 1 order by 1;
