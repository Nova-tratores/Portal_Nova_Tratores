-- Rodar no projeto citrhumdkfivdzbmayde (PORTAL).
-- Tratorilson organiza a semana de tickets de cada pessoa (José, 29/10/2026). Regras em
-- src/lib/tickets/tratorilson-organizar.ts; robô em src/lib/tickets/tratorilson-server.ts (07:00, agendador).
--  - chave geral (admin) + cada pessoa pode desligar a sua;
--  - só dá dia a ticket SEM prazo; prazo posto por pessoa nunca é mexido (o robô só remarca o que ele marcou:
--    prazo do ticket = prazo_marcado aqui);
--  - na dúvida de prioridade pergunta à pessoa num popup.
-- Escrita só pelas rotas /api/tickets/tratorilson* (service role). Sem estas tabelas o robô só pula.

create table if not exists public.tickets_tratorilson_config (
  id              smallint primary key default 1 check (id = 1),
  ligado          boolean not null default false,
  por_dia         smallint not null default 4 check (por_dia between 1 and 20),
  atualizado_por  text,
  atualizado_em   timestamptz not null default now()
);
insert into public.tickets_tratorilson_config (id) values (1) on conflict (id) do nothing;

-- quem desligou para si
create table if not exists public.tickets_tratorilson_optout (
  user_id   uuid primary key,
  criado_em timestamptz not null default now()
);

-- por ticket: prioridade (1 alta · 2 média · 3 baixa) e o dia que o ROBÔ marcou
create table if not exists public.tickets_tratorilson (
  ticket_id      uuid primary key references public.tickets(id) on delete cascade,
  prioridade     smallint check (prioridade between 1 and 3),
  origem         text not null default 'ia' check (origem in ('ia', 'pessoa', 'padrao')),
  prazo_marcado  date,
  motivo         text,
  atualizado_em  timestamptz not null default now()
);

-- dúvida de prioridade → popup para a pessoa
create table if not exists public.tickets_tratorilson_perguntas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null,
  pergunta           text not null,
  ticket_ids         uuid[] not null,
  status             text not null default 'pendente' check (status in ('pendente', 'respondida', 'ignorada')),
  resposta_ticket_id uuid,
  criado_em          timestamptz not null default now(),
  respondido_em      timestamptz
);
create index if not exists tickets_tratorilson_perguntas_pend on public.tickets_tratorilson_perguntas (user_id) where status = 'pendente';

alter table public.tickets_tratorilson_config enable row level security;
alter table public.tickets_tratorilson_optout enable row level security;
alter table public.tickets_tratorilson enable row level security;
alter table public.tickets_tratorilson_perguntas enable row level security;
revoke all on public.tickets_tratorilson_config, public.tickets_tratorilson_optout,
              public.tickets_tratorilson, public.tickets_tratorilson_perguntas from anon, authenticated;

-- robô das 07:00 no agendador interno
insert into agendamentos (chave, handler, nome, modulo, descricao, tipo, hora, prioridade, usa_omie, duracao_max_min, ativo)
values ('tratorilson-tickets', 'tratorilson-tickets', 'Tratorilson organiza os tickets', 'Central de Trabalho',
        'Às 07:00: dá um dia da semana aos tickets sem prazo de cada pessoa (prioridade pela IA; na dúvida pergunta num popup). Liga/desliga na Central de Trabalho.',
        'diario', '07:00', 'rapido', false, 15, true)
on conflict (chave) do update set hora = excluded.hora, descricao = excluded.descricao, ativo = true;

notify pgrst, 'reload schema';
