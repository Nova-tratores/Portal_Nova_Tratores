-- =============================================================================
-- PERMISSÕES v2 — Fase 3a: MODO SOMBRA.
--
-- Cada checagem de permissão feita nas rotas /api (exigirPermissao,
-- exigirAcessoModulo, protegerRota) calcula também o resultado da v2
-- (perm_efetivas) e registra aqui, AGREGADO por dia × usuário × tela × rota ×
-- (resultado antigo, resultado v2). Quem decide continua sendo a regra antiga
-- enquanto PERM_V2 = 'sombra' (padrão); com PERM_V2 = 'on' a v2 decide e a
-- antiga vira a sombra.
--
-- Só service role escreve/lê (RLS ligada sem policy). Idempotente.
-- =============================================================================

create table if not exists public.perm_sombra (
  dia        date not null,
  user_id    uuid not null,
  tela_id    text not null,
  rota       text not null,
  antigo     boolean not null,
  v2         boolean not null,
  catalogada boolean not null default true,  -- a tela existe em perm_telas?
  decidiu    text not null default 'antigo' check (decidiu in ('antigo','v2')),
  vezes      integer not null default 0,
  primeiro   timestamptz not null default now(),
  ultimo     timestamptz not null default now(),
  primary key (dia, user_id, tela_id, rota, antigo, v2, decidiu)
);
create index if not exists perm_sombra_divergentes on public.perm_sombra (dia) where antigo <> v2;

alter table public.perm_sombra enable row level security;
revoke all on public.perm_sombra from anon, authenticated;

-- Lote vindo do buffer do servidor (flush a cada 60 s). ON CONFLICT soma.
create or replace function public.perm_sombra_registrar(p_itens jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  insert into perm_sombra as s (dia, user_id, tela_id, rota, antigo, v2, catalogada, decidiu, vezes, primeiro, ultimo)
  select (i->>'dia')::date, (i->>'user_id')::uuid, i->>'tela_id', i->>'rota',
         (i->>'antigo')::boolean, (i->>'v2')::boolean, coalesce((i->>'catalogada')::boolean, true),
         coalesce(i->>'decidiu', 'antigo'), (i->>'vezes')::int, now(), now()
    from jsonb_array_elements(p_itens) i
  on conflict (dia, user_id, tela_id, rota, antigo, v2, decidiu)
  do update set vezes = s.vezes + excluded.vezes, ultimo = now(), catalogada = excluded.catalogada;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.perm_sombra_registrar(jsonb) from public, anon, authenticated;

notify pgrst, 'reload schema';
