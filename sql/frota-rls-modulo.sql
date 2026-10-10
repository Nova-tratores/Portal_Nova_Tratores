-- =============================================================================
-- FROTA · leitura só para quem tem o módulo (10/10/2026)
--
-- ⚠️ RODAR SÓ DEPOIS do deploy que leva o TCO e o combustível da Visão geral
--    para o servidor (/api/frota/custos e /api/frota/resumo). Antes disso a
--    tela de Custos lê vw_frota_custos pelo navegador e ficaria vazia.
--
-- Até aqui as tabelas da frota tinham `USING (true)` para qualquer usuário
-- logado: quem não tinha o módulo Frota lia custos, multas, trajetos e
-- documentos pela chave pública. E `abastecimentos`/`abastecimento_lotes`
-- estavam com `for all using (true)` + GRANT ALL para anon — qualquer pessoa
-- na internet podia LER E APAGAR os abastecimentos.
--
-- Depois desta migration:
--  - frota_veiculos e frota_veiculos_alias continuam legíveis por qualquer
--    logado (o formulário de Requisição e o Opa escolhem o veículo por elas);
--  - as demais tabelas da frota: SELECT só com o módulo (frota ou frota:*),
--    admin ou dev — mesma regra do servidor (temModuloFrota);
--  - abastecimentos/abastecimento_lotes: anon sem acesso nenhum, authenticated
--    só lê (com o módulo); toda escrita já é feita pelas rotas com service role;
--  - vw_frota_custos: só o servidor lê (a view roda como dono e passaria por
--    cima do RLS); vw_frota_manutencoes passa a respeitar o RLS de quem lê.
--
-- Escrita continua SÓ pelas rotas /api (service role ignora RLS).
-- Idempotente. Correr no Supabase: SQL Editor -> colar -> Run.
-- =============================================================================

begin;

-- ── quem tem o módulo Frota (mesma regra de src/lib/frota/server.ts) ─────────
create or replace function public.portal_pode_frota()
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
           or exists (
             select 1 from unnest(coalesce(pp.modulos_permitidos, '{}')) m
             where m = 'frota' or m like 'frota:%'
           ))
  )
$$;
revoke all on function public.portal_pode_frota() from public, anon;
grant execute on function public.portal_pode_frota() to authenticated, service_role;

-- ── tabelas da frota: SELECT só com o módulo ────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'frota_motoristas','frota_responsaveis','frota_geocercas','frota_multas',
    'frota_manutencoes','frota_custos','frota_odometro','frota_documentos',
    'frota_dias','frota_paradas','frota_avarias','frota_equipamentos'
  ]
  loop
    if to_regclass('public.' || t) is null then
      raise notice 'tabela % não existe — pulada', t;
      continue;
    end if;
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_select', t);
    execute format('create policy %I on %I for select to authenticated using (public.portal_pode_frota());', t || '_select', t);
    execute format('revoke all on %I from anon;', t);
    execute format('revoke insert, update, delete on %I from authenticated;', t);
    execute format('grant select on %I to authenticated;', t);
  end loop;
end $$;

-- ── abastecimentos: fecha a porta aberta para anon ──────────────────────────
do $$
declare t text;
begin
  foreach t in array array['abastecimentos','abastecimento_lotes']
  loop
    if to_regclass('public.' || t) is null then continue; end if;
    execute format('alter table %I enable row level security;', t);
    execute format('drop policy if exists %I on %I;', t || '_all', t);
    execute format('drop policy if exists %I on %I;', t || '_select', t);
    execute format('create policy %I on %I for select to authenticated using (public.portal_pode_frota());', t || '_select', t);
    execute format('revoke all on %I from anon;', t);
    execute format('revoke insert, update, delete on %I from authenticated;', t);
    execute format('grant select on %I to authenticated;', t);
  end loop;
end $$;

-- ── views ───────────────────────────────────────────────────────────────────
-- TCO: o navegador não lê mais (GET /api/frota/custos, service role)
revoke select on vw_frota_custos from authenticated;
revoke all on vw_frota_custos from anon;

-- Manutenções (lida pelo navegador na aba Manutenções): passa a valer o RLS de
-- quem consulta (frota_manutencoes/frota_custos exigem o módulo)
alter view vw_frota_manutencoes set (security_invoker = true);

commit;

notify pgrst, 'reload schema';

-- Conferência (rode depois, logado no SQL Editor isso não vale — teste pela API):
--  - chave anon: GET /rest/v1/abastecimentos?limit=1  → 401/permission denied
--  - usuário sem Frota: GET /rest/v1/frota_multas?limit=1 → []
--  - usuário sem Frota: GET /rest/v1/frota_veiculos?limit=1 → continua lendo
