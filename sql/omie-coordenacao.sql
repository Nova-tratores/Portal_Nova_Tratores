-- Fila da Omie coordenada entre os processos (web × worker) — 22/10/2026.
-- Projeto Supabase do PORTAL (citrhumdk…). Idempotente.
--
-- Com PAPEL=web e PAPEL=worker cada processo tem a sua fila da porta
-- (src/lib/omie/porta.ts). Duas coisas precisam valer entre os dois:
--   1. UMA gravação por vez por chave da Omie (orientação do suporte, 21/10/2026):
--      a vaga é um "aluguel" com prazo — quem pega grava, os outros esperam; se o
--      processo cair no meio, o aluguel vence sozinho.
--   2. O disjuntor: quando a Omie bloqueia (chave, método) num processo, o outro
--      também para de chamar — senão cada erro dele prorroga o bloqueio.
-- Sem esta migration a porta segue só com a coordenação local (como antes).

create table if not exists omie_vaga_gravacao (
  chave     text primary key,          -- hash curto da app_key (não é a chave)
  dono      text not null,             -- id da chamada que está gravando
  metodo    text,
  processo  text,                      -- web | worker | tudo
  ate       timestamptz not null,      -- o aluguel vence aqui
  pego_em   timestamptz not null default now()
);

create table if not exists omie_bloqueios (
  chave     text not null,
  metodo    text not null,             -- '*' = a chave inteira (chave recusada)
  ate       timestamptz not null,
  motivo    text,
  processo  text,
  criado_em timestamptz not null default now(),
  primary key (chave, metodo)
);
create index if not exists omie_bloqueios_ate on omie_bloqueios (ate);

alter table omie_vaga_gravacao enable row level security;
alter table omie_bloqueios enable row level security;
revoke all on omie_vaga_gravacao from anon, authenticated;
revoke all on omie_bloqueios from anon, authenticated;

-- Pega a vaga de gravação da chave se ela estiver livre (ou vencida, ou já for
-- deste dono). Atômico: duas chamadas ao mesmo tempo, só uma recebe true.
create or replace function omie_pegar_vaga_gravacao(
  p_chave text, p_dono text, p_ms integer, p_metodo text, p_processo text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_dono text;
begin
  insert into omie_vaga_gravacao as v (chave, dono, metodo, processo, ate, pego_em)
  values (p_chave, p_dono, p_metodo, p_processo, now() + make_interval(secs => p_ms / 1000.0), now())
  on conflict (chave) do update
    set dono = excluded.dono, metodo = excluded.metodo, processo = excluded.processo,
        ate = excluded.ate, pego_em = excluded.pego_em
    where v.ate < now() or v.dono = excluded.dono
  returning v.dono into v_dono;
  return coalesce(v_dono = p_dono, false);
end;
$$;

revoke all on function omie_pegar_vaga_gravacao(text, text, integer, text, text) from public, anon, authenticated;
grant execute on function omie_pegar_vaga_gravacao(text, text, integer, text, text) to service_role;

notify pgrst, 'reload schema';
