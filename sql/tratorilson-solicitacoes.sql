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

-- v2 (03/09): kanban de fases
alter table tratorilson_solicitacoes add column if not exists fase text not null default 'nova';
alter table tratorilson_solicitacoes add column if not exists data_servico date;

-- v3 (07/10/2026): vigia de conversas sem resposta + memória do Tratorilson
--  * conversa_id: conversa do NovaZap (o painel abre direto nela)
--  * origem: 'robo' (o Tratorilson pediu ajuda) | 'vigia' (cliente ficou sem resposta)
--  * memoria: depois de atender, alguém ATUALIZA a memória (vira regra) ou
--    DISPENSA com motivo (aparece na aba "Dispensadas sem atualizar").
alter table tratorilson_solicitacoes add column if not exists conversa_id bigint;
alter table tratorilson_solicitacoes add column if not exists origem text;
alter table tratorilson_solicitacoes add column if not exists ultima_msg_em timestamptz;
alter table tratorilson_solicitacoes add column if not exists memoria text
  check (memoria in ('pendente', 'atualizada', 'dispensada'));
alter table tratorilson_solicitacoes add column if not exists memoria_resposta text;
alter table tratorilson_solicitacoes add column if not exists memoria_regra_id bigint;
alter table tratorilson_solicitacoes add column if not exists memoria_por text;
alter table tratorilson_solicitacoes add column if not exists memoria_em timestamptz;
alter table tratorilson_solicitacoes add column if not exists dispensa_motivo text;
create index if not exists idx_trat_sol_conversa on tratorilson_solicitacoes(conversa_id) where conversa_id is not null;
revoke all on tratorilson_solicitacoes from anon, authenticated;

notify pgrst, 'reload schema';
