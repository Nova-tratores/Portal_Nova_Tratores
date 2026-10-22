-- Localização CONFIRMADA do cliente por CPF/CNPJ (José, 22/10/2026).
-- Projeto Supabase do PORTAL: citrhumdkfivdzbmayde.
-- Trava do faturamento da OS: sem localização confirmada para o documento do cliente, não fatura.
-- Confirmada uma vez, vale para as próximas OS do mesmo CPF/CNPJ.
-- Leitura e escrita só pelas rotas /api/pos/* (service role): RLS ligado sem policy.

create table if not exists clientes_localizacao (
  documento      text primary key,               -- só dígitos (CPF 11 / CNPJ 14)
  cliente_nome   text,
  lat            double precision not null,
  lng            double precision not null,
  origem         text not null default 'parada',  -- parada (GPS do carro) | cadastro | manual
  placa          text,                            -- carro da parada escolhida
  tecnico        text,
  parada_inicio  timestamptz,
  parada_min     integer,
  os_id          text,                            -- OS em que foi confirmada
  confirmado_por text not null,
  confirmado_em  timestamptz not null default now(),
  historico      jsonb not null default '[]'::jsonb  -- confirmações anteriores (quando alguém troca)
);

alter table clientes_localizacao enable row level security;
revoke all on clientes_localizacao from anon, authenticated;

notify pgrst, 'reload schema';
