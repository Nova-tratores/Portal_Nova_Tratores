-- Solicitações confirmadas pelos clientes no Tratorilson (NovaZap).
-- Aparecem no painel do ícone do zap no header do portal.
-- Rodar no Supabase do projeto "Projeto-Nova Tratores".

create table if not exists tratorilson_solicitacoes (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  contato_nome text,
  contato_telefone text,
  cliente_nome text,
  cliente_cod text,
  cliente_cnpj text,
  tipo text,                 -- revisao | quadriciclo | assistencia | pecas | outro
  resumo text,               -- o que o cliente quer (ex.: "Revisão de 600h do 6075")
  extras text,               -- peças/serviços que ele ADICIONOU a mais
  total numeric,             -- total do orçamento confirmado (se houver)
  detalhes jsonb,            -- orçamento completo (peças, mão de obra, deslocamento)
  status text not null default 'nova',  -- nova | atendida
  atendida_por text,
  atendida_em timestamptz
);

alter table tratorilson_solicitacoes enable row level security;
-- leitura/escrita só pelas rotas do portal (service role); sem policies de anon.
