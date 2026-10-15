-- =============================================================================
-- PERMISSÕES v2 — telas, conjuntos (departamento | pacote) e overrides.
-- Redesenho das permissões, Fase 2 (docs/permissoes-redesenho.md).
--
-- SÓ ACRESCENTA: nada do portal lê estas tabelas ainda (a troca das checagens é
-- a Fase 3). portal_permissoes continua sendo a fonte em uso. Idempotente.
--
-- Modelo:
--   * tela = chave que o código já usa ('pos', 'pos:faturar', 'estoque:notas').
--     A hierarquia vem do ':' (pai de 'frota:veiculos:editar' é 'frota:veiculos').
--   * nível: ver < editar < gerir.
--   * Permissão efetiva = concessões dos conjuntos do usuário + extras − bloqueios.
--     Bloqueio sempre vence. O que não foi concedido é negado.
--   * Herança (a mesma regra do permite()/temAcesso/podeTelaFrota de hoje):
--       - 'gerir' numa tela vale para todas as de dentro, MENOS as explícitas
--         (ex.: 'pos' não dá 'pos:faturar') e o que está abaixo delas;
--       - ter qualquer coisa dentro de uma tela dá 'ver' nela (abrir a tela do
--         botão que se pode apertar; é o temAcesso de hoje).
--   * Admin/Dev (portal_permissoes.is_admin / is_dev) continua sendo flag: tudo.
--   * Overrides vencidos (expira_em <= now()) são ignorados.
--
-- Leitura: tem_permissao(tela, nivel) para o usuário logado; a view
-- permissoes_efetivas mostra a linha de cada um (o próprio; admin vê todos;
-- service role vê todos). Escrita: só admin (policies) — o portal escreve
-- pelas rotas /api com service role.
-- =============================================================================

-- ── Tabelas ──────────────────────────────────────────────────────────────────
create table if not exists public.perm_telas (
  id             text primary key,
  nome           text not null,
  categoria_menu text not null default 'Outros',
  explicita      boolean not null default false,  -- 'gerir' do pai NÃO concede
  responsavel    uuid references auth.users(id) on delete set null,  -- quem decide o acesso (sem efeito)
  ativo          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint perm_telas_id_ok check (id ~ '^[a-z0-9_-]+(:[a-z0-9_-]+)*$')
);
comment on table public.perm_telas is 'Permissões v2: cada tela/ação que pode ser liberada. id = chave usada no código.';

-- Rota do portal → tela. acesso: tela (exige a tela OU uma das alternativas),
-- livre (qualquer logado), admin, dev. Casa pelo prefixo mais longo.
create table if not exists public.perm_tela_rotas (
  padrao       text primary key,                  -- '/estoque/notas'
  acesso       text not null default 'tela' check (acesso in ('tela','livre','admin','dev')),
  tela_id      text references public.perm_telas(id) on update cascade on delete cascade,
  alternativas text[] not null default '{}',      -- a página também abre com estas telas
  nota         text,
  constraint perm_tela_rotas_tela_ok check ((acesso = 'tela') = (tela_id is not null))
);

create table if not exists public.perm_conjuntos (
  id        uuid primary key default gen_random_uuid(),
  nome      text not null unique,
  tipo      text not null check (tipo in ('departamento','pacote')),
  descricao text,
  ativo     boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.perm_conjunto_telas (
  conjunto_id uuid not null references public.perm_conjuntos(id) on delete cascade,
  tela_id     text not null references public.perm_telas(id) on update cascade on delete cascade,
  nivel       text not null check (nivel in ('ver','editar','gerir')),
  primary key (conjunto_id, tela_id)
);

create table if not exists public.perm_usuario_conjuntos (
  user_id     uuid not null references auth.users(id) on delete cascade,
  conjunto_id uuid not null references public.perm_conjuntos(id) on delete cascade,
  criado_por  uuid references auth.users(id) on delete set null,
  criado_em   timestamptz not null default now(),
  primary key (user_id, conjunto_id)
);

create table if not exists public.perm_usuario_overrides (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  tela_id    text not null references public.perm_telas(id) on update cascade on delete cascade,
  nivel      text not null check (nivel in ('ver','editar','gerir')),
  tipo       text not null check (tipo in ('extra','bloqueio')),
  expira_em  timestamptz,
  motivo     text not null check (length(btrim(motivo)) > 0),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em  timestamptz not null default now(),
  unique (user_id, tela_id, tipo)
);
create index if not exists perm_usuario_overrides_user on public.perm_usuario_overrides(user_id);
create index if not exists perm_usuario_conjuntos_user on public.perm_usuario_conjuntos(user_id);

-- ── Funções ──────────────────────────────────────────────────────────────────
create or replace function public.perm_nivel_num(p text) returns int
language sql immutable as $$
  select case p when 'ver' then 1 when 'editar' then 2 when 'gerir' then 3 else 0 end
$$;

create or replace function public.perm_nivel_txt(n int) returns text
language sql immutable as $$
  select case n when 1 then 'ver' when 2 then 'editar' when 3 then 'gerir' end
$$;

-- a é ancestral próprio de t? ('pos' de 'pos:criar'). Sem LIKE: '_' é curinga.
create or replace function public.perm_eh_ancestral(a text, t text) returns boolean
language sql immutable as $$
  select left(t, length(a) + 1) = a || ':'
$$;

create or replace function public.perm_eh_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin or is_dev from public.portal_permissoes where user_id = auth.uid()), false)
$$;

-- Permissão efetiva de UM usuário (todas as telas ativas, ou só p_tela).
-- ÚNICA implementação da regra: tem_permissao* e a view usam esta função.
create or replace function public.perm_efetivas(p_user uuid, p_tela text default null)
returns table (tela_id text, nivel text, origens text[])
language sql stable security definer set search_path = public as $$
  with
  adm as (
    select coalesce((select is_admin or is_dev from portal_permissoes where user_id = p_user), false) as a
  ),
  alvo as (
    select t.id from perm_telas t where t.ativo and (p_tela is null or t.id = p_tela)
  ),
  conc as (
    select ct.tela_id, ct.nivel, 'conjunto:' || c.nome as origem
      from perm_usuario_conjuntos uc
      join perm_conjuntos c on c.id = uc.conjunto_id and c.ativo
      join perm_conjunto_telas ct on ct.conjunto_id = c.id
     where uc.user_id = p_user
    union all
    select o.tela_id, o.nivel,
           'extra' || coalesce(' até ' || to_char(o.expira_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY'), '')
      from perm_usuario_overrides o
     where o.user_id = p_user and o.tipo = 'extra' and (o.expira_em is null or o.expira_em > now())
  ),
  bloq as (
    select o.tela_id, o.nivel from perm_usuario_overrides o
     where o.user_id = p_user and o.tipo = 'bloqueio' and (o.expira_em is null or o.expira_em > now())
  ),
  cand as (
    -- 1) direto na tela
    select a.id, perm_nivel_num(c.nivel) as n, c.origem
      from alvo a join conc c on c.tela_id = a.id
    union all
    -- 2) 'gerir' num ancestral, sem tela explícita entre ele e a tela (inclusive ela)
    select a.id, 3, c.origem || ' · gerir ' || c.tela_id
      from alvo a join conc c on c.nivel = 'gerir' and perm_eh_ancestral(c.tela_id, a.id)
     where not exists (
       select 1 from perm_telas e
        where e.explicita
          and perm_eh_ancestral(c.tela_id, e.id)
          and (e.id = a.id or perm_eh_ancestral(e.id, a.id)))
    union all
    -- 3) 'ver' por ter algo dentro
    select a.id, 1, c.origem || ' · por ' || c.tela_id
      from alvo a join conc c on perm_eh_ancestral(a.id, c.tela_id)
  ),
  agg as (
    select id, max(n) as n, array_agg(distinct origem order by origem) as origens from cand group by id
  ),
  teto as (
    -- bloqueio no nível b (na tela ou num ancestral) => no máximo b-1
    select a.id, min(perm_nivel_num(b.nivel)) - 1 as maxn, array_agg(distinct 'bloqueio ' || b.nivel || ' ' || b.tela_id) as motivo
      from alvo a join bloq b on b.tela_id = a.id or perm_eh_ancestral(b.tela_id, a.id)
     group by a.id
  )
  select a.id, 'gerir', array['admin']
    from alvo a, adm where adm.a
  union all
  select g.id, perm_nivel_txt(least(g.n, coalesce(t.maxn, 3))),
         g.origens || coalesce(t.motivo, '{}')
    from agg g left join teto t on t.id = g.id, adm
   where not adm.a and least(g.n, coalesce(t.maxn, 3)) >= 1
$$;

create or replace function public.tem_permissao_de(p_user uuid, p_tela text, p_nivel text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.perm_efetivas(p_user, p_tela) e
     where perm_nivel_num(e.nivel) >= perm_nivel_num(p_nivel))
$$;

-- Para RLS/rotas: o usuário logado tem a tela no nível pedido?
create or replace function public.tem_permissao(p_tela text, p_nivel text default 'ver')
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and public.tem_permissao_de(auth.uid(), p_tela, p_nivel)
$$;

revoke all on function public.perm_efetivas(uuid, text) from public, anon, authenticated;
revoke all on function public.tem_permissao_de(uuid, text, text) from public, anon, authenticated;
revoke all on function public.tem_permissao(text, text) from public, anon;
grant execute on function public.tem_permissao(text, text) to authenticated;
revoke all on function public.perm_eh_admin() from public, anon;
grant execute on function public.perm_eh_admin() to authenticated;

-- ── View ─────────────────────────────────────────────────────────────────────
-- Roda como o dono (precisa chamar perm_efetivas); o WHERE é o filtro de acesso:
-- cada um vê o próprio resultado, admin vê todos, service role vê todos.
create or replace view public.permissoes_efetivas as
select p.user_id, e.tela_id, e.nivel, e.origens
  from public.portal_permissoes p
 cross join lateral public.perm_efetivas(p.user_id) e
 where auth.role() = 'service_role' or p.user_id = auth.uid() or public.perm_eh_admin();

revoke all on public.permissoes_efetivas from anon;
grant select on public.permissoes_efetivas to authenticated;

-- ── RLS ──────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['perm_telas','perm_tela_rotas','perm_conjuntos','perm_conjunto_telas',
                           'perm_usuario_conjuntos','perm_usuario_overrides'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists %I on public.%I', t || '_admin_escreve', t);
    execute format('create policy %I on public.%I for all to authenticated using (public.perm_eh_admin()) with check (public.perm_eh_admin())',
                   t || '_admin_escreve', t);
  end loop;
end $$;

-- Catálogo (telas, rotas, conjuntos e o que cada conjunto libera): qualquer logado lê.
drop policy if exists perm_telas_ler on public.perm_telas;
create policy perm_telas_ler on public.perm_telas for select to authenticated using (true);
drop policy if exists perm_tela_rotas_ler on public.perm_tela_rotas;
create policy perm_tela_rotas_ler on public.perm_tela_rotas for select to authenticated using (true);
drop policy if exists perm_conjuntos_ler on public.perm_conjuntos;
create policy perm_conjuntos_ler on public.perm_conjuntos for select to authenticated using (true);
drop policy if exists perm_conjunto_telas_ler on public.perm_conjunto_telas;
create policy perm_conjunto_telas_ler on public.perm_conjunto_telas for select to authenticated using (true);

-- Vínculos e overrides: só os próprios (admin lê todos pela policy de escrita).
drop policy if exists perm_usuario_conjuntos_ler on public.perm_usuario_conjuntos;
create policy perm_usuario_conjuntos_ler on public.perm_usuario_conjuntos for select to authenticated using (user_id = auth.uid());
drop policy if exists perm_usuario_overrides_ler on public.perm_usuario_overrides;
create policy perm_usuario_overrides_ler on public.perm_usuario_overrides for select to authenticated using (user_id = auth.uid());

notify pgrst, 'reload schema';
