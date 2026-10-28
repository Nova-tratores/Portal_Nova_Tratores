-- =====================================================================
-- Monitor de USO — app de vendas (vendas-pwa): ATALHOS e FLUXOS (27/10/2026)
-- =====================================================================
-- As telas e transições do app vão para as tabelas que já existem
-- (portal_uso_paginas / portal_uso_transicoes), com rota '/vendas/...'.
-- Esta tabela guarda o que o portal não mede:
--
--   tipo 'atalho' → chave = atalho tocado (ex. 'inicio:nova-visita'),
--                   detalhe = 'tela de origem→tela de destino'
--   tipo 'fluxo'  → chave = fluxo (visita, completar_visita, checklist_veiculo,
--                   whatsapp, negocio_novo), detalhe = iniciado | concluido |
--                   cancelado | abandonado; soma_s = tempo somado (máx. 1 h cada)
--
-- Continua AGREGADO: uma linha por (usuário, tipo, chave, detalhe, dia).
-- O app junta no celular (offline) e manda em lote com o dia de cada contagem
-- (POST /api/uso/vendas). RLS: leitura para autenticado; escrita só service
-- role. Aplicar no SQL Editor. Idempotente.
-- =====================================================================

create table if not exists portal_uso_app_eventos (
  user_id   uuid not null,
  tipo      text not null check (tipo in ('atalho', 'fluxo')),
  chave     text not null,
  detalhe   text not null default '',
  dia       date not null,
  n         integer not null default 0,
  soma_s    bigint  not null default 0,
  ultimo_em timestamptz not null default now(),
  primary key (user_id, tipo, chave, detalhe, dia)
);
create index if not exists portal_uso_app_eventos_dia_idx on portal_uso_app_eventos (dia desc);
comment on table portal_uso_app_eventos is 'App de vendas: atalhos tocados e fluxos (iniciado/concluído/cancelado/abandonado) por usuário × dia.';

alter table portal_uso_app_eventos enable row level security;
drop policy if exists portal_uso_app_eventos_select on portal_uso_app_eventos;
create policy portal_uso_app_eventos_select on portal_uso_app_eventos for select to authenticated using (true);
revoke all on portal_uso_app_eventos from anon;

-- p_itens = [{user_id, tipo, chave, detalhe, dia, n, soma_s}]
create or replace function portal_uso_incrementar_app(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v int := 0;
begin
  with it as (
    select (e->>'user_id')::uuid               as user_id,
           e->>'tipo'                          as tipo,
           left(e->>'chave', 80)               as chave,
           left(coalesce(e->>'detalhe', ''), 200) as detalhe,
           (e->>'dia')::date                   as dia,
           greatest(coalesce((e->>'n')::int, 1), 1)            as n,
           greatest(coalesce((e->>'soma_s')::bigint, 0), 0)    as soma_s
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
    where e->>'user_id' is not null and e->>'tipo' in ('atalho', 'fluxo') and coalesce(e->>'chave', '') <> ''
  ), ins as (
    insert into portal_uso_app_eventos (user_id, tipo, chave, detalhe, dia, n, soma_s, ultimo_em)
    select user_id, tipo, chave, detalhe, dia, n, soma_s, now() from it
    on conflict (user_id, tipo, chave, detalhe, dia) do update
      set n         = portal_uso_app_eventos.n      + excluded.n,
          soma_s    = portal_uso_app_eventos.soma_s + excluded.soma_s,
          ultimo_em = now()
    returning 1
  ) select count(*) into v from ins;
  return jsonb_build_object('eventos', v);
end;
$$;

revoke all on function portal_uso_incrementar_app(jsonb) from public, anon, authenticated;
grant execute on function portal_uso_incrementar_app(jsonb) to service_role;
comment on function portal_uso_incrementar_app(jsonb) is 'Soma um lote de atalhos/fluxos do app de vendas. Só service role.';

notify pgrst, 'reload schema';

-- Conferir (deve listar a tabela e a função)
select 'tabela' as o_que, to_regclass('public.portal_uso_app_eventos')::text as nome
union all
select 'funcao', 'portal_uso_incrementar_app' where exists (select 1 from pg_proc where proname = 'portal_uso_incrementar_app');
