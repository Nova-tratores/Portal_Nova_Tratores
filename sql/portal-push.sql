-- ============================================================================
-- RODAR NO PROJETO citrhumdkfivdzbmayde (PORTAL) — não no RH.
-- Avisos do sino chegando no celular com o portal fechado (push) — 28/10/2026.
-- A push_subscriptions é do APP DO MECÂNICO (tecnico_nome) — não mexer nela.
-- Idempotente: pode rodar de novo.
-- ============================================================================

-- 1) Aparelhos inscritos (um por navegador/celular; dono = login do portal)
create table if not exists portal_push_inscricoes (
  endpoint        text primary key,
  user_id         uuid not null,
  inscricao       jsonb not null,           -- { endpoint, keys: { p256dh, auth } }
  aparelho        text,                     -- celular | computador
  navegador       text,                     -- Android | iPhone | Windows | Mac | Outro
  falhas          integer not null default 0,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  ultimo_envio_em timestamptz
);
create index if not exists portal_push_inscricoes_user_idx on portal_push_inscricoes (user_id);
comment on table portal_push_inscricoes is 'Aparelhos que recebem os avisos do sino com o portal fechado (web push). Só do portal; o app do mecânico usa push_subscriptions.';

-- 2) Cada aviso do sino sai por push uma vez só
create table if not exists portal_push_enviados (
  notificacao_id uuid primary key,
  enviado_em     timestamptz not null default now()
);

alter table portal_push_inscricoes enable row level security;
alter table portal_push_enviados   enable row level security;
revoke all on portal_push_inscricoes, portal_push_enviados from anon, authenticated;

-- 3) Gatilho: aviso novo no sino → chama o portal, que manda o push para os aparelhos do dono.
--    pg_net é assíncrono (não atrasa nem derruba o insert do aviso).
create extension if not exists pg_net;

create or replace function portal_notificacao_push()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := 'https://portal.novatratores.com/api/push/notificacao',
    body := jsonb_build_object('id', new.id),
    headers := '{"Content-Type": "application/json"}'::jsonb,
    timeout_milliseconds := 10000
  );
  return new;
exception when others then
  return new; -- push nunca impede o aviso de ser gravado
end;
$$;

drop trigger if exists portal_notificacao_push on portal_notificacoes;
create trigger portal_notificacao_push
  after insert on portal_notificacoes
  for each row execute function portal_notificacao_push();

-- Limpeza: guarda 30 dias de "já enviado"
delete from portal_push_enviados where enviado_em < now() - interval '30 days';

notify pgrst, 'reload schema';
