-- ════════════════════════════════════════════════════════════════════
-- Cronograma — Fase 5: baselines (linha de base plano × real)
-- Snapshot das datas calculadas atuais para comparar desvio depois.
-- As tabelas baselines/baseline_tarefas já existem (Fase 0).
-- Aplicar DEPOIS de sql/create-cronograma.sql e ...-rpcs.sql.
-- ════════════════════════════════════════════════════════════════════

-- Salva uma baseline: copia inicio_calc/fim_calc atuais de todas as tarefas.
create or replace function cronograma.cron_salvar_baseline(
  p_projeto_id uuid,
  p_nome       text
)
returns uuid
language plpgsql
security definer
set search_path = cronograma, public
as $$
declare v_id uuid;
begin
  perform cronograma.checar_acesso();
  insert into cronograma.baselines (projeto_id, nome)
  values (p_projeto_id, coalesce(nullif(p_nome, ''), 'Baseline'))
  returning id into v_id;

  insert into cronograma.baseline_tarefas (baseline_id, tarefa_id, inicio, fim)
  select v_id, t.id, t.inicio_calc, t.fim_calc
  from cronograma.tarefas t
  where t.projeto_id = p_projeto_id;

  return v_id;
end;
$$;

create or replace function cronograma.cron_remover_baseline(p_id uuid)
returns void
language plpgsql
security definer
set search_path = cronograma, public
as $$
begin
  perform cronograma.checar_acesso();
  delete from cronograma.baselines where id = p_id;
end;
$$;

grant execute on all functions in schema cronograma
  to anon, authenticated, service_role;
