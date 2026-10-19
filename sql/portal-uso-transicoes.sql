-- =====================================================================
-- Monitor de USO — JORNADAS: de qual tela para qual tela (17/10/2026)
-- =====================================================================
-- Para achar onde o usuário "monta quebra-cabeça" (passa por várias telas para
-- juntar as informações de UM caso). Continua AGREGADO, como portal-uso.sql:
-- uma linha por (usuário, tela de origem, tela de destino, dia) com contadores.
--
--   n             = quantas vezes foi de → para
--   n_mesmo_alvo  = dessas, quantas com o MESMO caso (cliente/OS/chassi…) nas
--                   duas telas — decidido no navegador por hash; o identificador
--                   NUNCA chega ao servidor
--   n_volta       = idas-e-voltas A→B→A em até 5 min
--   n_rapida      = ficou < 60 s na tela de origem
--   soma_gap_s    = soma do tempo na tela de origem (média = soma_gap_s / n)
--
-- portal_uso_oportunidades = o que o admin decidiu sobre cada padrão
-- (nova / em análise / feito / descartado) + data do "feito" para medir
-- antes × depois na aba Padrões de /atividades.
--
-- RLS: leitura para autenticado; escrita só service role. RPC SECURITY DEFINER
-- só para service role. Aplicar no SQL Editor. Idempotente.
-- =====================================================================

create table if not exists portal_uso_transicoes (
  user_id      uuid not null,
  de           text not null,
  para         text not null,
  dia          date not null,
  n            integer not null default 0,
  n_mesmo_alvo integer not null default 0,
  n_volta      integer not null default 0,
  n_rapida     integer not null default 0,
  soma_gap_s   bigint  not null default 0,
  ultimo_em    timestamptz not null default now(),
  primary key (user_id, de, para, dia)
);
create index if not exists portal_uso_transicoes_dia_idx on portal_uso_transicoes (dia desc);
create index if not exists portal_uso_transicoes_par_idx on portal_uso_transicoes (de, para, dia desc);
comment on table portal_uso_transicoes is 'Transições entre telas (de → para) por usuário × dia; mesmo caso decidido no navegador por hash.';

create table if not exists portal_uso_oportunidades (
  chave      text primary key,            -- 'de→para' (telas) ou 'ent:a→b' (ações do audit_log)
  status     text not null default 'nova' check (status in ('nova', 'em_analise', 'feito', 'descartado')),
  nota       text,
  feito_em   date,
  por        text,
  atualizado_em timestamptz not null default now()
);
comment on table portal_uso_oportunidades is 'Decisão do admin sobre cada padrão de uso (aba Padrões de /atividades).';

alter table portal_uso_transicoes    enable row level security;
alter table portal_uso_oportunidades enable row level security;

drop policy if exists portal_uso_transicoes_select    on portal_uso_transicoes;
drop policy if exists portal_uso_oportunidades_select on portal_uso_oportunidades;
create policy portal_uso_transicoes_select    on portal_uso_transicoes    for select to authenticated using (true);
create policy portal_uso_oportunidades_select on portal_uso_oportunidades for select to authenticated using (true);

revoke all on portal_uso_transicoes, portal_uso_oportunidades from anon;

-- p_itens = [{user_id, de, para, dia, n, n_mesmo_alvo, n_volta, n_rapida, soma_gap_s}]
create or replace function portal_uso_incrementar_transicoes(p_itens jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v int := 0;
begin
  with it as (
    select (e->>'user_id')::uuid as user_id,
           left(e->>'de', 200)   as de,
           left(e->>'para', 200) as para,
           (e->>'dia')::date     as dia,
           greatest(coalesce((e->>'n')::int, 1), 1)            as n,
           greatest(coalesce((e->>'n_mesmo_alvo')::int, 0), 0) as n_mesmo_alvo,
           greatest(coalesce((e->>'n_volta')::int, 0), 0)      as n_volta,
           greatest(coalesce((e->>'n_rapida')::int, 0), 0)     as n_rapida,
           greatest(coalesce((e->>'soma_gap_s')::bigint, 0), 0) as soma_gap_s
    from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) e
    where e->>'user_id' is not null and coalesce(e->>'de','') <> '' and coalesce(e->>'para','') <> ''
  ), ins as (
    insert into portal_uso_transicoes (user_id, de, para, dia, n, n_mesmo_alvo, n_volta, n_rapida, soma_gap_s, ultimo_em)
    select user_id, de, para, dia, n, n_mesmo_alvo, n_volta, n_rapida, soma_gap_s, now() from it
    on conflict (user_id, de, para, dia) do update
      set n            = portal_uso_transicoes.n            + excluded.n,
          n_mesmo_alvo = portal_uso_transicoes.n_mesmo_alvo + excluded.n_mesmo_alvo,
          n_volta      = portal_uso_transicoes.n_volta      + excluded.n_volta,
          n_rapida     = portal_uso_transicoes.n_rapida     + excluded.n_rapida,
          soma_gap_s   = portal_uso_transicoes.soma_gap_s   + excluded.soma_gap_s,
          ultimo_em    = now()
    returning 1
  ) select count(*) into v from ins;
  return jsonb_build_object('transicoes', v);
end;
$$;

revoke all on function portal_uso_incrementar_transicoes(jsonb) from public, anon, authenticated;
grant execute on function portal_uso_incrementar_transicoes(jsonb) to service_role;
comment on function portal_uso_incrementar_transicoes(jsonb) is 'Soma um lote de transições entre telas. Só service role.';

notify pgrst, 'reload schema';
