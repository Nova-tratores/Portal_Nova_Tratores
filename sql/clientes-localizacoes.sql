-- Localizações do cliente por CPF/CNPJ — VÁRIAS por cliente, cada uma com o nome da fazenda (José, 22/10/2026).
-- Projeto Supabase do PORTAL: citrhumdkfivdzbmayde.
-- Trava do faturamento da OS: o cliente precisa ter ao menos uma localização confirmada.
-- Substitui a clientes_localizacao (uma por cliente), que estava vazia.
-- Leitura e escrita só pelas rotas /api/pos/* (service role): RLS ligado sem policy.

drop table if exists clientes_localizacao;

create table if not exists clientes_localizacoes (
  id             uuid primary key default gen_random_uuid(),
  documento      text not null,                   -- só dígitos (CPF 11 / CNPJ 14)
  nome           text not null,                   -- nome da fazenda / sítio / sede
  cliente_nome   text,
  lat            double precision not null,
  lng            double precision not null,
  origem         text not null default 'parada',  -- parada (GPS do carro) | cadastro | manual
  placa          text,
  tecnico        text,
  parada_inicio  timestamptz,
  parada_min     integer,
  os_id          text,                            -- OS em que foi confirmada
  confirmado_por text not null,
  confirmado_em  timestamptz not null default now(),
  atualizado_por text,
  atualizado_em  timestamptz
);
create index if not exists clientes_localizacoes_documento on clientes_localizacoes (documento);

alter table clientes_localizacoes enable row level security;
revoke all on clientes_localizacoes from anon, authenticated;

notify pgrst, 'reload schema';
