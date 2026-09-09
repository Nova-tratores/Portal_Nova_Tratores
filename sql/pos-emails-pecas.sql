-- E-mails de separação de peças do POS (aprovação do pedido + lembrete de
-- véspera pro Zezo/Danilo). Lido/escrito só pelo servidor (service role);
-- RLS ligado SEM política de cliente, como as demais tabelas do motor.
create table if not exists pos_emails (
  id bigserial primary key,
  id_ordem text not null,
  tipo text not null,                 -- 'aprovacao' | 'separacao'
  para text not null,
  assunto text,
  corpo text,
  message_id text,                    -- pra responder na MESMA conversa
  data_servico date,
  enviado_em timestamptz not null default now()
);
create index if not exists pos_emails_ordem_idx on pos_emails (id_ordem);
create index if not exists pos_emails_data_idx on pos_emails (data_servico, tipo);
alter table pos_emails enable row level security;
