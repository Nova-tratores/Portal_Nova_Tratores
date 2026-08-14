-- Listas do Omie para a aba "Informações Adicionais" do Pedido de Venda (PPV):
-- Categoria, Conta Corrente e Etapa. Importadas do Omie por script.
-- Rodar no Supabase (idempotente).

create table if not exists categoria (
  codigo text primary key,
  descricao text,
  totalizadora boolean default false,
  inativa boolean default false
);
create table if not exists conta_corrente (
  codigo text primary key,
  descricao text,
  tipo text,
  inativo boolean default false
);
create table if not exists etapa_pedido (
  codigo text primary key,
  descricao text,
  inativo boolean default false
);
