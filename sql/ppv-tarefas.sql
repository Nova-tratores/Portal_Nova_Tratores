-- Tarefas do PPV: alguém atribui uma tarefa a um usuário do portal, no pedido.
-- Fluxo: criada → (usuário) visto → remarcado ("lembrar depois") → concluída.
-- Anexos reusam ppv_anexos (coluna id_tarefa). Rodar no Supabase (idempotente).

create table if not exists ppv_tarefas (
  id            bigserial primary key,
  id_pedido     text not null,
  atribuido_a   text not null,        -- nome do usuário do portal (financeiro_usu.nome)
  criado_por    text,
  descricao     text,
  status        text not null default 'pendente',  -- pendente | concluida
  lembrar_em    timestamptz,          -- "lembrar depois"
  visto_em      timestamptz,
  concluido_em  timestamptz,
  concluido_por text,
  criado_em     timestamptz default now()
);
create index if not exists idx_ppv_tarefas_pedido on ppv_tarefas(id_pedido);
create index if not exists idx_ppv_tarefas_atrib  on ppv_tarefas(atribuido_a);

create table if not exists ppv_tarefas_eventos (
  id         bigserial primary key,
  id_tarefa  bigint not null references ppv_tarefas(id) on delete cascade,
  tipo       text not null,           -- criada | visto | remarcado | concluida | comentario
  detalhe    text,
  autor      text,
  criado_em  timestamptz default now()
);
create index if not exists idx_ppv_tarefas_eventos on ppv_tarefas_eventos(id_tarefa);

alter table ppv_anexos add column if not exists id_tarefa bigint;
