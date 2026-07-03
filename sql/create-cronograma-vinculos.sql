-- ════════════════════════════════════════════════════════════════════
-- Cronograma — vínculos: Ordem de Serviço (1) + Grupo de Requisições (1)
-- Um projeto passa a apontar para UMA OS (Ordem_Servico.Id_Ordem, TEXT) e
-- UM grupo de requisições (requisicao_grupos.id, bigint). Vínculo SOLTO
-- (sem FK), como os demais links de OS do repo.
-- Aplicar DEPOIS de create-cronograma.sql e ...-rpcs.sql.
-- Depois de aplicar: notify pgrst, 'reload schema';
-- ════════════════════════════════════════════════════════════════════

-- os_ref era uuid (mismatch com Id_Ordem TEXT). Coluna está vazia → troca segura.
alter table cronograma.projetos
  alter column os_ref type text using os_ref::text;

-- grupo de requisições (ex.: REFORMA-PATIO-26)
alter table cronograma.projetos
  add column if not exists req_grupo_id bigint;

-- Recriar cron_criar_projeto: p_os_ref vira TEXT e ganha p_req_grupo_id.
-- (troca de assinatura → drop + create)
drop function if exists cronograma.cron_criar_projeto(
  text, cronograma.tipo_projeto, date, uuid, uuid, text);

create or replace function cronograma.cron_criar_projeto(
  p_nome          text,
  p_tipo          cronograma.tipo_projeto,
  p_data_inicio   date default current_date,
  p_calendario_id uuid default null,
  p_os_ref        text default null,
  p_req_grupo_id  bigint default null,
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
  insert into cronograma.projetos
    (nome, tipo, data_inicio, calendario_id, os_ref, req_grupo_id, conta_omie)
  values
    (p_nome, p_tipo, coalesce(p_data_inicio, current_date), p_calendario_id,
     p_os_ref, p_req_grupo_id, p_conta_omie)
  returning id into v_id;
  return v_id;
end;
$$;

grant execute on all functions in schema cronograma
  to anon, authenticated, service_role;
