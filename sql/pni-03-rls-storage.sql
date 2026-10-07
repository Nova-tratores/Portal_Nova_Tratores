-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas (Opa) — 3/4: permissões, RLS e bucket de fotos
--
-- Permissões = o MESMO modelo do portal (portal_permissoes.modulos_permitidos),
-- sem papel novo:
--   • capturar/ler  → qualquer usuário ATIVO do portal (linha em financeiro_usu),
--                     igual ao Opa, que é aberto a todos;
--   • gerir (identificar, precificar, mudar status, excluir, cadastros)
--                   → módulo 'opa-pecas' no Admin (o "setor de peças"),
--                     ou admin/dev.
-- `portal_pode` repete no banco a regra do `usePermissoes.pode()` do front.
--
-- Tabelas: só SELECT pela RLS; INSERT/UPDATE/DELETE revogados — escrita
-- exclusivamente pelas RPCs SECURITY DEFINER de pni-04.
-- Fotos: bucket PRIVADO `pni-fotos`, leitura por signed URL. Cada um só
-- sobe na própria pasta (<uid>/...); ninguém apaga nem sobrescreve.
-- ════════════════════════════════════════════════════════════════════

-- ── Helpers de permissão ────────────────────────────────────────────
create or replace function public.portal_pode(p_modulo text, p_acao text default null)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from portal_permissoes pp
    where pp.user_id = auth.uid()
      and (pp.is_admin is true
           or pp.is_dev is true
           or p_modulo = any (coalesce(pp.modulos_permitidos, '{}'))
           or (p_acao is not null and (p_modulo || ':' || p_acao) = any (coalesce(pp.modulos_permitidos, '{}'))))
  )
$$;

create or replace function public.pni_pode_ver()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select auth.uid() is not null
     and exists (select 1 from financeiro_usu u where u.id = auth.uid() and coalesce(u.ativo, true))
$$;

create or replace function public.pni_pode_gerir()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.pni_pode_ver() and public.portal_pode('opa-pecas')
$$;

revoke all on function public.portal_pode(text, text) from public, anon;
revoke all on function public.pni_pode_ver()          from public, anon;
revoke all on function public.pni_pode_gerir()        from public, anon;
grant execute on function public.portal_pode(text, text) to authenticated, service_role;
grant execute on function public.pni_pode_ver()          to authenticated, service_role;
grant execute on function public.pni_pode_gerir()        to authenticated, service_role;

-- ── RLS das tabelas ─────────────────────────────────────────────────
alter table public.pni_itens      enable row level security;
alter table public.pni_fotos      enable row level security;
alter table public.pni_aplicacoes enable row level security;
alter table public.pni_historico  enable row level security;

drop policy if exists pni_itens_select      on public.pni_itens;
drop policy if exists pni_fotos_select      on public.pni_fotos;
drop policy if exists pni_aplicacoes_select on public.pni_aplicacoes;
drop policy if exists pni_historico_select  on public.pni_historico;

create policy pni_itens_select      on public.pni_itens      for select to authenticated using (deleted_at is null and public.pni_pode_ver());
create policy pni_fotos_select      on public.pni_fotos      for select to authenticated using (deleted_at is null and public.pni_pode_ver());
create policy pni_aplicacoes_select on public.pni_aplicacoes for select to authenticated using (deleted_at is null and public.pni_pode_ver());
create policy pni_historico_select  on public.pni_historico  for select to authenticated using (public.pni_pode_ver());

revoke all on public.pni_itens, public.pni_fotos, public.pni_aplicacoes, public.pni_historico from anon;
revoke insert, update, delete, truncate on public.pni_itens, public.pni_fotos, public.pni_aplicacoes, public.pni_historico from authenticated;
revoke all on sequence public.pni_codigo_seq from anon, authenticated;

-- ── Bucket privado das fotos ────────────────────────────────────────
-- ~1600px JPEG comprimido no celular fica bem abaixo de 5 MB
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pni-fotos', 'pni-fotos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists pni_fotos_upload on storage.objects;
drop policy if exists pni_fotos_ler    on storage.objects;

-- upload só na própria pasta: <auth.uid()>/<arquivo>
create policy pni_fotos_upload on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pni-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
    and public.pni_pode_ver()
  );

-- leitura (necessária para gerar a signed URL)
create policy pni_fotos_ler on storage.objects for select to authenticated
  using (bucket_id = 'pni-fotos' and public.pni_pode_ver());

-- sem policy de UPDATE/DELETE: foto enviada não é trocada nem apagada pelo navegador

notify pgrst, 'reload schema';
