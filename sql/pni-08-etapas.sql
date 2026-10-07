-- ════════════════════════════════════════════════════════════════════
-- Peças S/Estoque (Opa) — 8: as três etapas de trabalho
--
--   1. CAPTAÇÃO     cadastro rápido de cada peça encontrada
--                   → status aguardando_identificacao ("Aguardando separação")
--   2. SEPARAÇÃO    decidir o que fazer: vender | guardar | usar | descartar | outro
--                   descartar/outro encerram aqui (com motivo);
--                   vender/guardar/usar → status identificado ("Aguardando verificação")
--   3. VERIFICAÇÃO  confirmar valor e aplicação com o setor responsável
--                   → status precificado ("Aguardando destino")
--   4. DESTINO      confirmar o que aconteceu de fato e FINALIZAR:
--                   vender → vendido · guardar → guardado · usar → usado
--                   (ou descartado / outro, se mudou o plano)
--
-- Sem valor novo de enum (roda numa execução só): os status existentes
-- ganham o sentido das etapas. `a_venda` fica só por compatibilidade.
-- Regras espelhadas em src/lib/opa-pecas/regras.ts.
-- ════════════════════════════════════════════════════════════════════

alter table public.pni_itens add column if not exists decisao           text;
alter table public.pni_itens add column if not exists decisao_obs       text;
alter table public.pni_itens add column if not exists decidido_em       timestamptz;
alter table public.pni_itens add column if not exists decidido_por      uuid;
alter table public.pni_itens add column if not exists verificado_em     timestamptz;
alter table public.pni_itens add column if not exists verificado_por    uuid;
alter table public.pni_itens add column if not exists verificado_setor  text;
alter table public.pni_itens add column if not exists verificado_com    text;
alter table public.pni_itens add column if not exists verificacao_obs   text;

alter table public.pni_itens drop constraint if exists pni_itens_decisao_ok;
alter table public.pni_itens add constraint pni_itens_decisao_ok check (
  decisao is null or decisao in ('vender', 'guardar', 'usar', 'descartar', 'outro'));

-- preço deixa de ser exigido em "precificado" (agora = aguardando destino; peça para usar pode não ter valor)
alter table public.pni_itens drop constraint if exists pni_itens_preco_ok;
alter table public.pni_itens add constraint pni_itens_preco_ok check (
  status not in ('a_venda', 'vendido') or preco_sugerido is not null);

-- descrição passa a ser exigida só para vender (à venda / vendido)
alter table public.pni_itens drop constraint if exists pni_itens_descricao_ok;
alter table public.pni_itens add constraint pni_itens_descricao_ok check (
  status not in ('a_venda', 'vendido') or nao_identificavel or length(btrim(coalesce(descricao, ''))) > 0);

-- ── Rótulos das etapas ──────────────────────────────────────────────
create or replace function public.pni_status_rotulo(p public.pni_status)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p
    when 'aguardando_identificacao' then 'Aguardando separação' when 'identificado' then 'Aguardando verificação'
    when 'precificado' then 'Aguardando destino' when 'a_venda' then 'À venda' when 'vendido' then 'Vendido'
    when 'descartado' then 'Descartado' when 'guardado' then 'Guardado' when 'usado' then 'Usado'
    when 'outro_destino' then 'Outro destino' end
$$;

-- aguardando destino / à venda podem voltar para a verificação; vendido sai de qualquer um dos dois
create or replace function public.pni_transicao_valida(p_de public.pni_status, p_para public.pni_status)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_de = p_para then false
    when public.pni_status_final(p_de) then false
    when p_de in ('a_venda', 'precificado') and p_para = 'identificado' then true
    when p_para in ('descartado', 'guardado', 'usado', 'outro_destino') then true
    when p_para = 'vendido' then p_de in ('a_venda', 'precificado')
    else abs(public.pni_status_ordem(p_para) - public.pni_status_ordem(p_de)) = 1
  end
$$;

-- o que cada status exige do item
create or replace function public.pni__conferir_requisitos(p_item public.pni_itens, p_status public.pni_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status = 'identificado' and coalesce(p_item.decisao, '') not in ('vender', 'guardar', 'usar') then
    raise exception '%: separe a peça antes (vender, guardar ou usar).', p_item.codigo;
  end if;
  if p_status in ('a_venda', 'vendido') and not p_item.nao_identificavel then
    if length(btrim(coalesce(p_item.descricao, ''))) = 0 then
      raise exception '%: preencha a descrição (ou marque "não identificável").', p_item.codigo;
    end if;
    if not public.pni__tem_aplicacao(p_item.id) then
      raise exception '%: informe pelo menos uma aplicação (ou marque "não identificável").', p_item.codigo;
    end if;
  end if;
  if p_status in ('a_venda', 'vendido') and p_item.preco_sugerido is null then
    raise exception '%: informe o preço sugerido.', p_item.codigo;
  end if;
end $$;
revoke all on function public.pni__conferir_requisitos(public.pni_itens, public.pni_status) from public, anon, authenticated;

-- mudança genérica (voltar etapa, vendido, encerrar): limpa o que a etapa desfeita gravou
create or replace function public.pni__mudar_status(p_id uuid, p_para public.pni_status, p_motivo text)
returns public.pni_itens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
  v_final boolean := public.pni_status_final(p_para);
  v_volta_separacao boolean := p_para = 'aguardando_identificacao';
  v_volta_verificacao boolean := p_para = 'identificado';
begin
  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not public.pni_transicao_valida(v.status, p_para) then
    raise exception '%: não é possível passar de "%" para "%".',
      v.codigo, public.pni_status_rotulo(v.status), public.pni_status_rotulo(p_para);
  end if;
  if p_para = 'descartado' and v_motivo is null then raise exception '%: informe o motivo do descarte.', v.codigo; end if;
  if p_para = 'outro_destino' and v_motivo is null then raise exception '%: descreva o que aconteceu com a peça.', v.codigo; end if;
  if length(coalesce(v_motivo, '')) > 500 then raise exception 'Texto com mais de 500 caracteres.'; end if;
  perform public.pni__conferir_requisitos(v, p_para);

  update pni_itens set
    status          = p_para,
    motivo_descarte = case when p_para = 'descartado' then v_motivo else motivo_descarte end,
    desfecho        = case when v_final then coalesce(v_motivo, desfecho) else desfecho end,
    encerrado_em    = case when v_final then now() else encerrado_em end,
    encerrado_por   = case when v_final then auth.uid() else encerrado_por end,
    decisao         = case when v_volta_separacao then null else decisao end,
    decisao_obs     = case when v_volta_separacao then null else decisao_obs end,
    decidido_em     = case when v_volta_separacao then null else decidido_em end,
    decidido_por    = case when v_volta_separacao then null else decidido_por end,
    verificado_em   = case when v_volta_separacao or v_volta_verificacao then null else verificado_em end,
    verificado_por  = case when v_volta_separacao or v_volta_verificacao then null else verificado_por end,
    atualizado_por  = auth.uid(),
    atualizado_em   = now()
  where id = p_id
  returning * into v;
  return v;
end $$;
revoke all on function public.pni__mudar_status(uuid, public.pni_status, text) from public, anon, authenticated;

-- histórico: a decisão e a verificação aparecem no motivo
create or replace function public.pni_tg_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(auth.uid(), new.atualizado_por, new.criado_por);
  v_motivo text;
begin
  if tg_op = 'INSERT' then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'criacao', null, new.status::text, new.criado_por);
    return new;
  end if;
  if new.status is distinct from old.status then
    v_motivo := case
      when public.pni_status_final(new.status) then new.desfecho
      when new.status = 'identificado' and old.status = 'aguardando_identificacao'
        then 'Separação: ' || coalesce(new.decisao, '?') || coalesce(' — ' || new.decisao_obs, '')
      when new.status = 'precificado' and old.status = 'identificado'
        then 'Verificado com ' || coalesce(new.verificado_setor, '?') || coalesce(' (' || new.verificado_com || ')', '')
    end;
    insert into pni_historico (item_id, campo, de, para, motivo, usuario)
    values (new.id, 'status', old.status::text, new.status::text, v_motivo, v_user);
  end if;
  if new.qualidade is distinct from old.qualidade then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'qualidade', old.qualidade::text, new.qualidade::text, v_user);
  end if;
  if new.preco_sugerido is distinct from old.preco_sugerido then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'preco', old.preco_sugerido::text, new.preco_sugerido::text, v_user);
  end if;
  if new.codigo is distinct from old.codigo then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'codigo', old.codigo, new.codigo, v_user);
  end if;
  if new.local_id is distinct from old.local_id or new.local_tecnico is distinct from old.local_tecnico then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'localizacao', pni_local_texto(old.local_id, old.local_tecnico),
            pni_local_texto(new.local_id, new.local_tecnico), v_user);
  end if;
  if new.deleted_at is not null and old.deleted_at is null then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'exclusao', old.status::text, null, coalesce(new.deleted_por, v_user));
  end if;
  return new;
end $$;

-- ── 2. SEPARAÇÃO ────────────────────────────────────────────────────
create or replace function public.pni_separar(p_id uuid, p_decisao text, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças faz a separação.' using errcode = '42501';
  end if;
  if coalesce(p_decisao, '') not in ('vender', 'guardar', 'usar', 'descartar', 'outro') then
    raise exception 'Escolha o que fazer com a peça.';
  end if;
  if length(coalesce(v_obs, '')) > 500 then raise exception 'Texto com mais de 500 caracteres.'; end if;

  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if v.status not in ('aguardando_identificacao', 'identificado') then
    raise exception '%: a peça está "%" — a separação já passou.', v.codigo, public.pni_status_rotulo(v.status);
  end if;

  update pni_itens set decisao = p_decisao, decisao_obs = v_obs, decidido_em = now(), decidido_por = auth.uid(),
         atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id;

  if p_decisao in ('descartar', 'outro') then
    -- encerra aqui mesmo (motivo obrigatório, validado na interna)
    v := public.pni__mudar_status(p_id, case p_decisao when 'descartar' then 'descartado' else 'outro_destino' end::pni_status, v_obs);
  elsif v.status = 'aguardando_identificacao' then
    v := public.pni__mudar_status(p_id, 'identificado', null);
  else
    select * into v from pni_itens where id = p_id;
  end if;
  return jsonb_build_object('id', v.id, 'codigo', v.codigo, 'status', v.status, 'decisao', p_decisao);
end $$;

-- ── 3. VERIFICAÇÃO ──────────────────────────────────────────────────
create or replace function public.pni_verificar(p_id uuid, p_setor text, p_com text default null, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  v_setor text := nullif(btrim(coalesce(p_setor, '')), '');
  v_com text := nullif(btrim(coalesce(p_com, '')), '');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças faz a verificação.' using errcode = '42501';
  end if;
  if v_setor is null then raise exception 'Informe com qual setor o valor e a aplicação foram verificados.'; end if;
  if length(v_setor) > 80 or length(coalesce(v_com, '')) > 120 or length(coalesce(v_obs, '')) > 500 then
    raise exception 'Texto longo demais.';
  end if;

  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if v.status not in ('identificado', 'precificado') then
    raise exception '%: a peça está "%" — não está aguardando verificação.', v.codigo, public.pni_status_rotulo(v.status);
  end if;
  if coalesce(v.decisao, '') not in ('vender', 'guardar', 'usar') then
    raise exception '%: separe a peça antes de verificar.', v.codigo;
  end if;

  -- valor e aplicação confirmados
  if not v.nao_identificavel then
    if length(btrim(coalesce(v.descricao, ''))) = 0 then raise exception '%: preencha a descrição.', v.codigo; end if;
    if not public.pni__tem_aplicacao(v.id) then raise exception '%: informe a aplicação.', v.codigo; end if;
  end if;
  if v.decisao in ('vender', 'guardar') and v.preco_sugerido is null then
    raise exception '%: informe o valor da peça.', v.codigo;
  end if;

  update pni_itens set
    verificado_em = now(), verificado_por = auth.uid(), verificado_setor = v_setor, verificado_com = v_com, verificacao_obs = v_obs,
    status = 'precificado',   -- = aguardando destino
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id
  returning * into v;

  return jsonb_build_object('id', v.id, 'codigo', v.codigo, 'status', v.status);
end $$;

-- ── 4. DESTINO: confirma o que aconteceu e finaliza ─────────────────
-- p_destino nulo = o que foi decidido na separação. Descartar/outro pedem texto.
create or replace function public.pni_finalizar(p_id uuid, p_destino text default null, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  v_destino text;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças finaliza o destino.' using errcode = '42501';
  end if;
  select * into v from pni_itens where id = p_id and deleted_at is null;
  if not found then raise exception 'Item não encontrado.'; end if;
  if v.status not in ('precificado', 'a_venda') then
    raise exception '%: a peça está "%" — não está aguardando destino.', v.codigo, public.pni_status_rotulo(v.status);
  end if;
  v_destino := coalesce(nullif(btrim(coalesce(p_destino, '')), ''), v.decisao);
  if coalesce(v_destino, '') not in ('vender', 'guardar', 'usar', 'descartar', 'outro') then
    raise exception 'Escolha o destino da peça.';
  end if;
  if v_destino <> coalesce(v.decisao, '') then
    update pni_itens set decisao = v_destino where id = p_id;   -- o plano mudou: registra
  end if;
  v := public.pni__mudar_status(p_id, (case v_destino when 'vender' then 'vendido' when 'guardar' then 'guardado'
         when 'usar' then 'usado' when 'descartar' then 'descartado' else 'outro_destino' end)::pni_status, v_obs);
  return jsonb_build_object('id', v.id, 'codigo', v.codigo, 'status', v.status);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.pni_separar(uuid, text, text)', 'public.pni_verificar(uuid, text, text, text)',
                           'public.pni_finalizar(uuid, text, text)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
