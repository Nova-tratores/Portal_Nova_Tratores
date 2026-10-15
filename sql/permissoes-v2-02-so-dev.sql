-- =============================================================================
-- PERMISSÕES v2 — complemento: telas "só Dev" (fiscais).
--
-- O main ganhou (13/10/2026) ACOES_SO_DEV em src/lib/permissoes/explicitas.ts:
-- pos:faturar, pos:cancelar_faturamento, pos:substituir_omie. Dev tem sempre;
-- admin comum NÃO ganha pelo flag — só com a tela concedida. Esta migration
-- leva a regra para a função única. Idempotente; depois dela rode
-- `npx tsx scripts/permissoes-v2-sync.ts --gravar` (marca as telas) e o diff.
-- =============================================================================

alter table public.perm_telas add column if not exists so_dev boolean not null default false;

create or replace function public.perm_efetivas(p_user uuid, p_tela text default null)
returns table (tela_id text, nivel text, origens text[])
language sql stable security definer set search_path = public as $$
  with
  papel as (
    select coalesce((select is_dev from portal_permissoes where user_id = p_user), false) as d,
           coalesce((select is_admin or is_dev from portal_permissoes where user_id = p_user), false) as a
  ),
  alvo as (
    select t.id, t.so_dev from perm_telas t where t.ativo and (p_tela is null or t.id = p_tela)
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
    select a.id, perm_nivel_num(c.nivel) as n, c.origem
      from alvo a join conc c on c.tela_id = a.id
    union all
    select a.id, 3, c.origem || ' · gerir ' || c.tela_id
      from alvo a join conc c on c.nivel = 'gerir' and perm_eh_ancestral(c.tela_id, a.id)
     where not exists (
       select 1 from perm_telas e
        where e.explicita
          and perm_eh_ancestral(c.tela_id, e.id)
          and (e.id = a.id or perm_eh_ancestral(e.id, a.id)))
    union all
    select a.id, 1, c.origem || ' · por ' || c.tela_id
      from alvo a join conc c on perm_eh_ancestral(a.id, c.tela_id)
  ),
  agg as (
    select id, max(n) as n, array_agg(distinct origem order by origem) as origens from cand group by id
  ),
  teto as (
    select a.id, min(perm_nivel_num(b.nivel)) - 1 as maxn, array_agg(distinct 'bloqueio ' || b.nivel || ' ' || b.tela_id) as motivo
      from alvo a join bloq b on b.tela_id = a.id or perm_eh_ancestral(b.tela_id, a.id)
     group by a.id
  )
  -- Dev: tudo
  select a.id, 'gerir', array['dev'] from alvo a, papel where papel.d
  union all
  -- Admin comum: tudo menos as "só Dev"
  select a.id, 'gerir', array['admin'] from alvo a, papel where papel.a and not papel.d and not a.so_dev
  union all
  -- Demais (e as "só Dev" do admin comum): concessões − bloqueios
  select g.id, perm_nivel_txt(least(g.n, coalesce(t.maxn, 3))), g.origens || coalesce(t.motivo, '{}')
    from agg g
    join alvo a on a.id = g.id
    left join teto t on t.id = g.id, papel
   where not papel.d
     and (not papel.a or a.so_dev)
     and least(g.n, coalesce(t.maxn, 3)) >= 1
$$;

revoke all on function public.perm_efetivas(uuid, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
