-- ════════════════════════════════════════════════════════════════════
-- Cronograma — Fase 2: RPCs de mutação + aplicação do recálculo
-- Todas SECURITY DEFINER, search_path travado, e checagem de acesso na
-- primeira linha. O cliente nunca grava *_calc/folga_dias/e_critica —
-- só o recálculo autoritativo (cron_aplicar_recalculo) faz isso.
--
-- Acesso GLOBAL: liberado para 'authenticated' (chamadas do front) e
-- 'service_role' (chamadas do servidor, ex.: API Route de recálculo).
--
-- Aplicar DEPOIS de sql/create-cronograma.sql.
-- ════════════════════════════════════════════════════════════════════

-- guard reutilizado por todas as RPCs ─────────────────────────────────
create or replace function cronograma.checar_acesso()
returns void
language plpgsql
stable
security definer
set search_path = cronograma, public
as $$
begin
  if coalesce(auth.role(), '') not in ('authenticated', 'service_role') then
    raise exception 'Acesso negado ao Cronograma' using errcode = '42501';
  end if;
end;
$$;

-- ── PROJETOS ─────────────────────────────────────────────────────────
create or replace function cronograma.cron_criar_projeto(
  p_nome          text,
  p_tipo          cronograma.tipo_projeto,
  p_data_inicio   date default current_date,
  p_calendario_id uuid default null,
  p_os_ref        uuid default null,
  p_conta_omie    text default null
)
returns uuid
language plpgsql
security definer
set search_path = cronograma, public
as $$
declare v_id uuid;
begin
  perform cronograma.checar_acesso();
  insert into cronograma.projetos (nome, tipo, data_inicio, calendario_id, os_ref, conta_omie)
  values (p_nome, p_tipo, coalesce(p_data_inicio, current_date), p_calendario_id, p_os_ref, p_conta_omie)
  returning id into v_id;
  return v_id;
end;
$$;

-- ── TAREFAS ──────────────────────────────────────────────────────────
create or replace function cronograma.cron_criar_tarefa(
  p_projeto_id     uuid,
  p_nome           text,
  p_duracao        numeric default 1,
  p_recurso_id     uuid default null,
  p_parent_id      uuid default null,
  p_restricao      cronograma.tipo_restricao default 'asap',
  p_restricao_data date default null,
  p_descricao      text default null,
  p_prioridade     smallint default 0,
  p_tipo           cronograma.tipo_tarefa default 'tarefa'
)
returns uuid
language plpgsql
security definer
set search_path = cronograma, public
as $$
declare v_id uuid;
begin
  perform cronograma.checar_acesso();
  insert into cronograma.tarefas
    (projeto_id, nome, descricao, tipo, duracao_dias, recurso_id, parent_id,
     restricao, restricao_data, prioridade)
  values
    (p_projeto_id, p_nome, p_descricao, p_tipo, coalesce(p_duracao, 1), p_recurso_id,
     p_parent_id, coalesce(p_restricao, 'asap'), p_restricao_data, coalesce(p_prioridade, 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- Atualiza só os campos editáveis. NUNCA aceita *_calc/folga/e_critica.
-- null = "não alterar" (não dá para limpar recurso por aqui — ok no MVP).
create or replace function cronograma.cron_atualizar_tarefa(
  p_tarefa_id      uuid,
  p_nome           text default null,
  p_duracao        numeric default null,
  p_recurso_id     uuid default null,
  p_restricao      cronograma.tipo_restricao default null,
  p_restricao_data date default null,
  p_ordem          integer default null,
  p_parent_id      uuid default null,
  p_descricao      text default null,
  p_prioridade     smallint default null
)
returns void
language plpgsql
security definer
set search_path = cronograma, public
as $$
begin
  perform cronograma.checar_acesso();
  update cronograma.tarefas set
    nome           = coalesce(p_nome, nome),
    duracao_dias   = coalesce(p_duracao, duracao_dias),
    recurso_id     = coalesce(p_recurso_id, recurso_id),
    restricao      = coalesce(p_restricao, restricao),
    restricao_data = coalesce(p_restricao_data, restricao_data),
    ordem          = coalesce(p_ordem, ordem),
    parent_id      = coalesce(p_parent_id, parent_id),
    descricao      = coalesce(p_descricao, descricao),
    prioridade     = coalesce(p_prioridade, prioridade),
    atualizado_em  = now()
  where id = p_tarefa_id;
end;
$$;

-- ── DEPENDÊNCIAS ─────────────────────────────────────────────────────
-- Rejeita a aresta se ela fecharia um ciclo (CTE recursivo a partir da
-- sucessora; se alcançar a predecessora, criaria ciclo).
create or replace function cronograma.cron_criar_dependencia(
  p_projeto_id   uuid,
  p_predecessora uuid,
  p_sucessora    uuid,
  p_tipo         cronograma.tipo_dependencia default 'FS',
  p_lag          numeric default 0
)
returns uuid
language plpgsql
security definer
set search_path = cronograma, public
as $$
declare v_id uuid;
begin
  perform cronograma.checar_acesso();

  if p_predecessora = p_sucessora then
    raise exception 'Uma tarefa não pode depender de si mesma';
  end if;

  if exists (
    with recursive alcanca as (
      select sucessora_id as nodo
        from cronograma.dependencias
       where predecessora_id = p_sucessora and projeto_id = p_projeto_id
      union
      select d.sucessora_id
        from cronograma.dependencias d
        join alcanca a on d.predecessora_id = a.nodo
       where d.projeto_id = p_projeto_id
    )
    select 1 from alcanca where nodo = p_predecessora
  ) then
    raise exception 'Dependência criaria um ciclo';
  end if;

  insert into cronograma.dependencias (projeto_id, predecessora_id, sucessora_id, tipo, lag_dias)
  values (p_projeto_id, p_predecessora, p_sucessora, coalesce(p_tipo, 'FS'), coalesce(p_lag, 0))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function cronograma.cron_remover_dependencia(p_id uuid)
returns void
language plpgsql
security definer
set search_path = cronograma, public
as $$
begin
  perform cronograma.checar_acesso();
  delete from cronograma.dependencias where id = p_id;
end;
$$;

-- ── PROGRESSO + BLOQUEIO (estilo Plane) ──────────────────────────────
-- Uma tarefa só vai para em_andamento/concluida se TODAS as predecessoras
-- FS estiverem concluídas; senão vira 'bloqueada' e retorna um aviso.
-- Ao concluir, tenta desbloquear as sucessoras cujas preds FS já fecharam.
create or replace function cronograma.cron_registrar_progresso(
  p_tarefa_id   uuid,
  p_progresso   numeric,
  p_inicio_real date default null,
  p_fim_real    date default null
)
returns table (status cronograma.status_tarefa, aviso text)
language plpgsql
security definer
set search_path = cronograma, public
as $$
declare
  v_status cronograma.status_tarefa;
  v_aviso  text := null;
  v_fs_pendentes int;
begin
  perform cronograma.checar_acesso();

  -- status pretendido a partir do progresso/datas informados
  if coalesce(p_progresso, 0) >= 100 or p_fim_real is not null then
    v_status := 'concluida';
  elsif coalesce(p_progresso, 0) > 0 or p_inicio_real is not null then
    v_status := 'em_andamento';
  else
    v_status := 'pendente';
  end if;

  -- predecessoras FS ainda não concluídas?
  select count(*) into v_fs_pendentes
  from cronograma.dependencias d
  join cronograma.tarefas p on p.id = d.predecessora_id
  where d.sucessora_id = p_tarefa_id
    and d.tipo = 'FS'
    and p.status <> 'concluida';

  if v_status in ('em_andamento', 'concluida') and v_fs_pendentes > 0 then
    v_status := 'bloqueada';
    v_aviso  := 'Tarefa bloqueada: há predecessoras FS não concluídas.';
  end if;

  update cronograma.tarefas set
    progresso     = coalesce(p_progresso, progresso),
    inicio_real   = coalesce(p_inicio_real, inicio_real),
    fim_real      = coalesce(p_fim_real, fim_real),
    status        = v_status,
    atualizado_em = now()
  where id = p_tarefa_id;

  -- se concluiu, desbloqueia sucessoras cujas preds FS já fecharam
  if v_status = 'concluida' then
    update cronograma.tarefas s set status = 'pendente', atualizado_em = now()
    where s.status = 'bloqueada'
      and s.id in (select d.sucessora_id from cronograma.dependencias d
                   where d.predecessora_id = p_tarefa_id and d.tipo = 'FS')
      and not exists (
        select 1 from cronograma.dependencias d2
        join cronograma.tarefas p2 on p2.id = d2.predecessora_id
        where d2.sucessora_id = s.id and d2.tipo = 'FS' and p2.status <> 'concluida'
      );
  end if;

  return query select v_status, v_aviso;
end;
$$;

-- ── APLICAÇÃO DO RECÁLCULO (autoritativo; chamado pela API Route) ─────
-- Recebe a saída do motor já em snake_case e grava numa transação.
-- p_tarefas: jsonb array de
--   { id, inicio_calc, fim_calc, folga_dias, e_critica }
create or replace function cronograma.cron_aplicar_recalculo(
  p_projeto_id  uuid,
  p_tarefas     jsonb,
  p_fim_projeto date default null
)
returns void
language plpgsql
security definer
set search_path = cronograma, public
as $$
begin
  perform cronograma.checar_acesso();

  update cronograma.tarefas t set
    inicio_calc   = x.inicio_calc,
    fim_calc      = x.fim_calc,
    folga_dias    = x.folga_dias,
    e_critica     = x.e_critica,
    atualizado_em = now()
  from jsonb_to_recordset(p_tarefas)
       as x(id uuid, inicio_calc date, fim_calc date, folga_dias numeric, e_critica boolean)
  where t.id = x.id and t.projeto_id = p_projeto_id;

  update cronograma.projetos
     set data_fim_calc = p_fim_projeto, atualizado_em = now()
   where id = p_projeto_id;
end;
$$;

-- grants explícitos (além do alter default privileges da Fase 0) ──────
grant execute on all functions in schema cronograma
  to anon, authenticated, service_role;
