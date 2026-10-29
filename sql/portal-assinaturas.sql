-- Assinatura salva de cada pessoa (José, 29/10/2026: "cadastrar em Administração a assinatura do Diretor e de todos os
-- Gerentes … para não ficar assinando toda hora"). Projeto: PORTAL (citrhumdk…).
-- A pessoa assina na Administração ou por um link único mandado no WhatsApp (/assinatura/<token>).
create table if not exists public.portal_assinaturas (
  user_id uuid primary key,
  imagem text not null,              -- PNG em data URL
  origem text not null default 'admin', -- admin | link
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);
create table if not exists public.portal_assinatura_links (
  token text primary key,
  user_id uuid not null,
  criado_por text,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz
);
alter table public.portal_assinaturas enable row level security;
alter table public.portal_assinatura_links enable row level security;
revoke all on public.portal_assinaturas from anon, authenticated;
revoke all on public.portal_assinatura_links from anon, authenticated;
notify pgrst, 'reload schema';
