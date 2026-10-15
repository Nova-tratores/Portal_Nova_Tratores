-- =============================================================================
-- PERMISSÕES v2 — complemento: a view permissoes_efetivas para usuário logado.
--
-- Achado no teste de 15/10/2026: usuário comum consultando a view recebia
-- "permission denied for function perm_efetivas". No Postgres o EXECUTE de uma
-- função chamada dentro de uma view é conferido para QUEM CONSULTA (não para o
-- dono da view, como nas tabelas). Liberar perm_efetivas ao authenticated não
-- serve: qualquer um chamaria perm_efetivas('<outro usuário>') pela API.
--
-- Solução: perm_efetivas_visiveis() — SECURITY DEFINER, sem parâmetro de usuário;
-- devolve só o próprio resultado, ou todos para admin/dev e service role.
-- A view passa a ler dela. Idempotente.
-- =============================================================================

create or replace function public.perm_efetivas_visiveis()
returns table (user_id uuid, tela_id text, nivel text, origens text[])
language sql stable security definer set search_path = public as $$
  select p.user_id, e.tela_id, e.nivel, e.origens
    from public.portal_permissoes p
   cross join lateral public.perm_efetivas(p.user_id) e
   where auth.role() = 'service_role' or p.user_id = auth.uid() or public.perm_eh_admin()
$$;

revoke all on function public.perm_efetivas_visiveis() from public, anon;
grant execute on function public.perm_efetivas_visiveis() to authenticated, service_role;

create or replace view public.permissoes_efetivas as
select user_id, tela_id, nivel, origens from public.perm_efetivas_visiveis();

revoke all on public.permissoes_efetivas from anon;
grant select on public.permissoes_efetivas to authenticated;

notify pgrst, 'reload schema';
