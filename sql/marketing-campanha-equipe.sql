-- =============================================================================
-- CAMPANHA COM RESPONSÁVEIS, PÚBLICA/PRIVADA E CONVERSA NAS REQUISIÇÕES (25/11/2026)
-- José: "sempre vamos criar responsáveis da campanha, como se fosse uma reunião";
--       "deixa se vai ser pública ou privada; privada e você sem acesso não aparece nem o título";
--       "dentro de cada req da campanha, comentar ou atribuir uma função a alguém e chega notificação".
--
-- Padrão do marketing (sql/marketing-acoes.sql): RLS ligado e ZERO policy.
-- O navegador não lê nem escreve nada daqui; tudo passa pelas rotas /api/marketing,
-- que conferem quem é responsável (ou dev) antes de devolver qualquer coisa.
-- Pode rodar mais de uma vez (IF NOT EXISTS).
-- =============================================================================

-- 1) Pública ou privada --------------------------------------------------------
alter table mkt_acoes add column if not exists visibilidade text not null default 'publica';
do $$ begin
  alter table mkt_acoes add constraint mkt_acoes_visibilidade_chk check (visibilidade in ('publica', 'privada'));
exception when duplicate_object then null; end $$;

-- 2) Responsáveis da campanha (vários, como participantes de reunião) ----------
--    O "responsavel_id" de mkt_acoes continua sendo o dono principal; esta tabela é o grupo todo.
create table if not exists mkt_acao_responsaveis (
  acao_id        uuid not null references mkt_acoes(id) on delete cascade,
  user_id        uuid not null,                 -- financeiro_usu.id (= auth.users.id)
  nome           text,                          -- snapshot: o nome fica mesmo se a pessoa sair
  adicionado_por uuid,
  criado_em      timestamptz not null default now(),
  primary key (acao_id, user_id)
);
create index if not exists ix_mkt_acao_resp_user on mkt_acao_responsaveis (user_id);
alter table mkt_acao_responsaveis enable row level security;

-- quem já é o responsável de cada campanha entra no grupo (não duplica)
insert into mkt_acao_responsaveis (acao_id, user_id, nome)
select id, responsavel_id, responsavel_nome from mkt_acoes
where responsavel_id is not null and deleted_at is null
on conflict do nothing;

-- 3) Comentários nas requisições, dentro da campanha ---------------------------
create table if not exists mkt_req_comentarios (
  id          uuid primary key default gen_random_uuid(),
  acao_id     uuid not null references mkt_acoes(id) on delete cascade,
  req_id      bigint not null,                  -- "Requisicao".id
  autor_id    uuid,
  autor_nome  text,
  texto       text not null check (length(trim(texto)) > 0),
  mencoes     uuid[] not null default '{}',     -- quem foi @marcado (recebe notificação)
  ticket_id   uuid,                             -- quando o comentário é uma ATRIBUIÇÃO: o pedido criado na fila
  criado_em   timestamptz not null default now()
);
create index if not exists ix_mkt_req_com_acao_req on mkt_req_comentarios (acao_id, req_id, criado_em);
alter table mkt_req_comentarios enable row level security;

-- Conferência (deve voltar 2 tabelas com rls = true e a coluna visibilidade):
-- select relname, relrowsecurity as rls from pg_class where relname in ('mkt_acao_responsaveis','mkt_req_comentarios');
-- select column_name, column_default from information_schema.columns where table_name = 'mkt_acoes' and column_name = 'visibilidade';
