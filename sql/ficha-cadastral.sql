-- Ficha de atualização cadastral do colaborador (aba "Ficha cadastral" no /admin) — 09/11/2026
-- Projeto: PORTAL (citrhumdk…). Rodar uma vez.
-- Dado pessoal (LGPD): RLS ligado e SEM política — o navegador não lê nem grava;
-- só a rota /api/admin/ficha-cadastral (service role, só admin).

create table if not exists public.usuario_ficha_cadastral (
  user_id             uuid primary key,
  dados               jsonb not null default '{}'::jsonb,
  atualizado_em       timestamptz not null default now(),
  atualizado_por      uuid,
  atualizado_por_nome text
);

alter table public.usuario_ficha_cadastral enable row level security;

revoke all on public.usuario_ficha_cadastral from anon, authenticated;
