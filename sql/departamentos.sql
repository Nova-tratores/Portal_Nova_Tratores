-- Departamentos do Omie (aba "Departamentos" do Pedido de Venda no PPV).
-- Lista importada do Omie (ListarDepartamentos) por script. A distribuição por
-- departamento do pedido é montada no portal e enviada ao Omie no faturamento.
-- Rodar no Supabase (idempotente).

create table if not exists departamento (
  codigo    text primary key,
  estrutura text,
  descricao text,
  inativo   boolean default false
);
