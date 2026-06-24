-- ════════════════════════════════════════════════════════════════════
-- Cronograma — Fase 6: recorrência de manutenção (intervalo/horímetro)
-- Materializa OCORRÊNCIAS como tarefas concretas (o motor segue um DAG de
-- tarefas únicas). Voltado a os_maquina; horímetro reusa a média de
-- horas/dia das Revisões (src/lib/revisoes/utils.ts), passada como param.
-- Aplicar DEPOIS de sql/create-cronograma.sql e ...-rpcs.sql.
-- ════════════════════════════════════════════════════════════════════

create table if not exists cronograma.recorrencias (
  id               uuid primary key default gen_random_uuid(),
  projeto_id       uuid not null references cronograma.projetos(id) on delete cascade,
  nome             text not null,
  base             text not null check (base in ('intervalo_dias', 'horimetro')),
  intervalo        numeric(10,2) not null check (intervalo > 0), -- dias OU horas conforme base
  duracao_dias     numeric(6,2) not null default 1 check (duracao_dias >= 0),
  recurso_id       uuid references cronograma.recursos(id),
  trator_ref       uuid,            -- máquina (p/ base horímetro), opcional
  ancora_data      date not null default current_date,   -- data da última manutenção / base
  ancora_horimetro numeric(10,2),   -- horímetro da última manutenção (base horímetro)
  horizonte_meses  int not null default 12,
  ativo            boolean not null default true,
  criado_em        timestamptz not null default now()
);
create index if not exists idx_cron_recorrencias_projeto on cronograma.recorrencias(projeto_id);

-- ligação ocorrência → recorrência (idempotência / regenerar)
alter table cronograma.tarefas
  add column if not exists recorrencia_id uuid references cronograma.recorrencias(id) on delete set null,
  add column if not exists ocorrencia_seq int;

-- RLS + grants (mesmo padrão global)
alter table cronograma.recorrencias enable row level security;
drop policy if exists recorrencias_auth_all on cronograma.recorrencias;
create policy recorrencias_auth_all on cronograma.recorrencias for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
grant select, insert, update, delete on cronograma.recorrencias
  to anon, authenticated, service_role;

-- Gerador idempotente: cria as próximas ocorrências até p_ate (ou o
-- horizonte da recorrência), continuando do maior ocorrencia_seq existente.
create or replace function cronograma.cron_gerar_ocorrencias(
  p_recorrencia_id  uuid,
  p_ate             date default null,
  p_media_horas_dia numeric default null
)
returns int
language plpgsql
security definer
set search_path = cronograma, public
as $$
declare
  r           cronograma.recorrencias;
  v_passo     numeric;     -- dias entre ocorrências
  v_seq       int;
  v_data      date;
  v_ate       date;
  v_count     int := 0;
begin
  perform cronograma.checar_acesso();
  select * into r from cronograma.recorrencias where id = p_recorrencia_id;
  if not found then raise exception 'Recorrência não encontrada'; end if;

  if r.base = 'intervalo_dias' then
    v_passo := r.intervalo;
  else
    if coalesce(p_media_horas_dia, 0) <= 0 then
      raise exception 'Base horímetro exige média de horas/dia (> 0)';
    end if;
    v_passo := r.intervalo / p_media_horas_dia;  -- horas → dias
  end if;
  if v_passo < 1 then v_passo := 1; end if;

  v_ate := least(
    coalesce(p_ate, (r.ancora_data + (r.horizonte_meses || ' months')::interval)::date),
    (r.ancora_data + (r.horizonte_meses || ' months')::interval)::date
  );

  select coalesce(max(ocorrencia_seq), 0) into v_seq
  from cronograma.tarefas where recorrencia_id = r.id;

  v_data := (r.ancora_data + (round(v_passo * v_seq))::int)::date;

  loop
    v_data := (v_data + (round(v_passo))::int)::date;
    exit when v_data > v_ate;
    v_seq := v_seq + 1;
    insert into cronograma.tarefas
      (projeto_id, nome, duracao_dias, recurso_id, restricao, restricao_data, recorrencia_id, ocorrencia_seq)
    values
      (r.projeto_id, r.nome || ' #' || v_seq, r.duracao_dias, r.recurso_id,
       'iniciar_nao_antes', v_data, r.id, v_seq);
    v_count := v_count + 1;
    exit when v_count > 500;  -- backstop
  end loop;

  return v_count;
end;
$$;

grant execute on all functions in schema cronograma
  to anon, authenticated, service_role;
