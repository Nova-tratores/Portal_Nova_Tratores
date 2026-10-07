-- =====================================================================
-- Monitor de USO do portal: quem usa o quê (07/10/2026)
-- =====================================================================
-- Contagem AGREGADA por (usuário, rota, dia) — não é log de eventos. O
-- navegador manda um beacon por troca de página e o servidor conta as chamadas
-- de API dentro de autenticar(); tudo fica num buffer em memória e desce ao
-- banco UMA vez por minuto pela RPC portal_uso_incrementar (ON CONFLICT soma).
-- Volume: 28 usuários × ~40 rotas × 365 dias = no máximo ~400 mil linhas/ano.
--
-- Rota = só o pathname, com ids/uuids/tokens trocados por [id]/[token]. Nunca
-- query string (carrega CNPJ/cliente).
--
-- RLS: leitura para autenticado; escrita só service role (sem policy de
-- INSERT/UPDATE). A RPC é SECURITY DEFINER com REVOKE de anon/authenticated —
-- só o servidor (service role) chama.
--
-- Aplicar no Supabase (SQL Editor). Idempotente.
-- =====================================================================

create table if not exists portal_uso_paginas (
  user_id     uuid not null,
  rota        text not null,
  dia         date not null,
  acessos     integer not null default 0,
  primeiro_em timestamptz not null default now(),
  ultimo_em   timestamptz not null default now(),
  primary key (user_id, rota, dia)
);
create index if not exists portal_uso_paginas_dia_idx  on portal_uso_paginas (dia desc);
create index if not exists portal_uso_paginas_rota_idx on portal_uso_paginas (rota, dia desc);
comment on table portal_uso_paginas is 'Acessos a páginas do portal, agregados por usuário × rota × dia (beacon do PortalLayout).';

create table if not exists portal_uso_api (
  user_id   uuid not null,
  rota      text not null,
  dia       date not null,
  chamadas  integer not null default 0,
  ultimo_em timestamptz not null default now(),
  primary key (user_id, rota, dia)
);
create index if not exists portal_uso_api_dia_idx  on portal_uso_api (dia desc);
create index if not exists portal_uso_api_rota_idx on portal_uso_api (rota, dia desc);
comment on table portal_uso_api is 'Chamadas às rotas /api/* por usuário × rota × dia (contadas em autenticar()).';

create table if not exists portal_uso_presenca (
  user_id   uuid primary key,
  rota      text,
  ultimo_em timestamptz not null default now()
);
comment on table portal_uso_presenca is 'Última página vista por usuário ("online agora" = ultimo_em < 5 min).';

-- ---------------------------------------------------------------------
-- RLS: autenticado lê; ninguém escreve pelo cliente.
-- ---------------------------------------------------------------------
alter table portal_uso_paginas  enable row level security;
alter table portal_uso_api      enable row level security;
alter table portal_uso_presenca enable row level security;

drop policy if exists portal_uso_paginas_select  on portal_uso_paginas;
drop policy if exists portal_uso_api_select      on portal_uso_api;
drop policy if exists portal_uso_presenca_select on portal_uso_presenca;

create policy portal_uso_paginas_select  on portal_uso_paginas  for select to authenticated using (true);
create policy portal_uso_api_select      on portal_uso_api      for select to authenticated using (true);
create policy portal_uso_presenca_select on portal_uso_presenca for select to authenticated using (true);

revoke all on portal_uso_paginas, portal_uso_api, portal_uso_presenca from anon;

-- ---------------------------------------------------------------------
-- RPC: recebe um lote e SOMA. p_itens = [{tipo:'pagina'|'api', user_id, rota, dia, n}]
-- + p_presenca = [{user_id, rota, em}]
-- ---------------------------------------------------------------------
create or replace function portal_uso_incrementar(p_itens jsonb, p_presenca jsonb default '[]'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_paginas int := 0;
  v_api     int := 0;
  v_pres    int := 0;
begin
  with it as (
    select (e->>'user_id')::uuid as user_id,
           left(e->>'rota', 200)  as rota,
           (e->>'dia')::date      as dia,
           greatest(coalesce((e->>'n')::int, 1), 1) as n
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
    where e->>'tipo' = 'pagina' and e->>'user_id' is not null and coalesce(e->>'rota','') <> ''
  ), ins as (
    insert into portal_uso_paginas (user_id, rota, dia, acessos, primeiro_em, ultimo_em)
    select user_id, rota, dia, n, now(), now() from it
    on conflict (user_id, rota, dia) do update
      set acessos = portal_uso_paginas.acessos + excluded.acessos,
          ultimo_em = now()
    returning 1
  ) select count(*) into v_paginas from ins;

  with it as (
    select (e->>'user_id')::uuid as user_id,
           left(e->>'rota', 200)  as rota,
           (e->>'dia')::date      as dia,
           greatest(coalesce((e->>'n')::int, 1), 1) as n
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
    where e->>'tipo' = 'api' and e->>'user_id' is not null and coalesce(e->>'rota','') <> ''
  ), ins as (
    insert into portal_uso_api (user_id, rota, dia, chamadas, ultimo_em)
    select user_id, rota, dia, n, now() from it
    on conflict (user_id, rota, dia) do update
      set chamadas = portal_uso_api.chamadas + excluded.chamadas,
          ultimo_em = now()
    returning 1
  ) select count(*) into v_api from ins;

  with it as (
    select (e->>'user_id')::uuid as user_id,
           left(e->>'rota', 200)  as rota,
           coalesce((e->>'em')::timestamptz, now()) as em
    from jsonb_array_elements(coalesce(p_presenca, '[]'::jsonb)) e
    where e->>'user_id' is not null
  ), ins as (
    insert into portal_uso_presenca (user_id, rota, ultimo_em)
    select user_id, rota, em from it
    on conflict (user_id) do update
      set rota = excluded.rota,
          ultimo_em = greatest(portal_uso_presenca.ultimo_em, excluded.ultimo_em)
    returning 1
  ) select count(*) into v_pres from ins;

  return jsonb_build_object('paginas', v_paginas, 'api', v_api, 'presenca', v_pres);
end;
$$;

revoke all on function portal_uso_incrementar(jsonb, jsonb) from public, anon, authenticated;
grant execute on function portal_uso_incrementar(jsonb, jsonb) to service_role;

comment on function portal_uso_incrementar(jsonb, jsonb) is 'Soma um lote de contagens de uso (páginas/API) e atualiza a presença. Só service role.';

notify pgrst, 'reload schema';
