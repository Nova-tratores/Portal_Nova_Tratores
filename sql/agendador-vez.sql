-- Agendador: cada horário de robô roda em UM processo só — 22/10/2026.
-- Projeto Supabase do PORTAL (citrhumdk…). Idempotente.
--
-- Caso real (22/10, 16:28): o serviço web subiu sem PAPEL=web e, junto com o worker,
-- os dois agendadores rodaram quase todo robô duas vezes por horário (3–6 s de
-- diferença). A trava do cron_runs só impede rodada SOBREPOSTA; a segunda começava
-- depois de a primeira terminar.
--
-- Agora, antes de rodar, o agendador "pega a vez" aqui: só consegue se ninguém rodou
-- aquele agendamento depois da última rodada que ELE conhece. Quem perde aprende a
-- hora da rodada do outro e não roda. Sem esta migration, o agendador roda como antes.

create table if not exists agendador_vez (
  chave         text primary key,          -- agendamentos.chave
  ultima_em     timestamptz not null,      -- quando a última rodada pegou a vez
  dono          text,                      -- processo que pegou (papel-pid)
  atualizado_em timestamptz not null default now()
);

alter table agendador_vez enable row level security;
revoke all on agendador_vez from anon, authenticated;

-- p_visto  = a última rodada que o chamador conhece (null = não conhece nenhuma)
-- p_forcar = botão "Rodar agora": pega a vez sempre (só para os outros saberem)
-- Devolve ok=true e a hora gravada, ou ok=false e a hora da rodada do outro.
create or replace function agendador_pegar_vez(
  p_chave text, p_visto timestamptz, p_dono text, p_forcar boolean default false
) returns table (ok boolean, ultima_em timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agora timestamptz := date_trunc('milliseconds', clock_timestamp());
  v_ok boolean;
begin
  insert into agendador_vez as v (chave, ultima_em, dono, atualizado_em)
  values (p_chave, v_agora, p_dono, now())
  on conflict (chave) do update
    set ultima_em = excluded.ultima_em, dono = excluded.dono, atualizado_em = now()
    where p_forcar or (p_visto is not null and v.ultima_em <= p_visto)
  returning true into v_ok;

  if coalesce(v_ok, false) then
    return query select true, v_agora;
  else
    return query select false, a.ultima_em from agendador_vez a where a.chave = p_chave;
  end if;
end;
$$;

revoke all on function agendador_pegar_vez(text, timestamptz, text, boolean) from public, anon, authenticated;
grant execute on function agendador_pegar_vez(text, timestamptz, text, boolean) to service_role;

notify pgrst, 'reload schema';
