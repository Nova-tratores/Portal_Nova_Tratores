-- ============================================================
--  Papel "Dev" + Bloqueio de requisições de valor alto
--  + Histórico de autorizações
--  Correr no Supabase: SQL Editor -> colar -> Run
--  É seguro correr mais do que uma vez (idempotente).
-- ============================================================

-- 1) Marca "is_dev" nos utilizadores (em portal_permissoes)
alter table portal_permissoes
  add column if not exists is_dev boolean not null default false;

-- 2) Primeiro Dev: antonio.novatratores@gmail.com
update portal_permissoes
set is_dev = true
where user_id = (
  select id from financeiro_usu
  where lower(email) = 'antonio.novatratores@gmail.com'
  limit 1
);

-- 3) Tabela de pedidos de autorização (bloqueio de valor alto)
create table if not exists requisicao_autorizacoes (
  id                bigint generated always as identity primary key,
  requisicao_id     bigint not null,
  solicitante_id    uuid,
  solicitante_nome  text,
  motivo            text not null,           -- o que o utilizador quer alterar
  status            text not null default 'pendente', -- pendente | aprovado | recusado | consumido
  dev_id            uuid,
  dev_nome          text,
  criado_em         timestamptz not null default now(),
  resolvido_em      timestamptz,             -- quando o dev aprovou/recusou
  consumido_em      timestamptz              -- quando a alteração foi feita (volta a bloquear)
);

create index if not exists idx_req_autoriz_requisicao on requisicao_autorizacoes (requisicao_id);
create index if not exists idx_req_autoriz_status on requisicao_autorizacoes (status);

-- 4) Acesso (mesmo modelo do resto do portal: cliente acede com a chave anon)
alter table requisicao_autorizacoes enable row level security;
drop policy if exists req_autoriz_all on requisicao_autorizacoes;
create policy req_autoriz_all on requisicao_autorizacoes
  for all using (true) with check (true);
grant all on requisicao_autorizacoes to anon, authenticated;

-- Pronto. Confirme com:
--   select user_id, is_dev from portal_permissoes where is_dev = true;
