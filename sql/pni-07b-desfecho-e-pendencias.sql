-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas — 7b: desfecho da peça + cadastro incompleto
-- (rodar DEPOIS do pni-07a)
--
-- 1. Desfecho: toda peça termina num destino conhecido — vendida,
--    descartada, guardada, usada ou outro. Grava o que aconteceu (desfecho),
--    quando e quem encerrou. Descartada e "outro" exigem descrição.
-- 2. Localização deixa de ser obrigatória na captura: o item pode ser salvo
--    incompleto e a tela mostra o aviso do que falta. Box Técnico continua
--    exigindo o técnico.
-- 3. Corrige a trava de descrição: só vale para o fluxo de venda
--    (identificado → vendido). Antes ela impedia descartar/encerrar uma peça
--    sem descrição direto de "aguardando".
-- ════════════════════════════════════════════════════════════════════

alter table public.pni_itens add column if not exists desfecho      text;
alter table public.pni_itens add column if not exists encerrado_em  timestamptz;
alter table public.pni_itens add column if not exists encerrado_por uuid;

alter table public.pni_itens drop constraint if exists pni_itens_descricao_ok;
alter table public.pni_itens add constraint pni_itens_descricao_ok check (
  status not in ('identificado', 'precificado', 'a_venda', 'vendido')
  or nao_identificavel or length(btrim(coalesce(descricao, ''))) > 0);

alter table public.pni_itens drop constraint if exists pni_itens_desfecho_ok;
alter table public.pni_itens add constraint pni_itens_desfecho_ok check (
  status <> 'outro_destino' or length(btrim(coalesce(desfecho, ''))) > 0);

-- ── Regras puras (espelho de src/lib/opa-pecas/regras.ts) ───────────
create or replace function public.pni_status_final(p public.pni_status)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select p in ('vendido', 'descartado', 'guardado', 'usado', 'outro_destino')
$$;

create or replace function public.pni_status_ordem(p public.pni_status)
returns int language sql immutable set search_path = public, pg_temp as $$
  select case p
    when 'aguardando_identificacao' then 0 when 'identificado' then 1
    when 'precificado' then 2 when 'a_venda' then 3 when 'vendido' then 4
    when 'descartado' then 5 when 'guardado' then 6 when 'usado' then 7 when 'outro_destino' then 8 end
$$;

create or replace function public.pni_status_rotulo(p public.pni_status)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p
    when 'aguardando_identificacao' then 'Aguardando identificação' when 'identificado' then 'Identificado'
    when 'precificado' then 'Precificado' when 'a_venda' then 'À venda' when 'vendido' then 'Vendido'
    when 'descartado' then 'Descartado' when 'guardado' then 'Guardado' when 'usado' then 'Usado'
    when 'outro_destino' then 'Outro destino' end
$$;

-- anda uma etapa (frente/trás) no fluxo de venda; vendido só de à venda;
-- descartado/guardado/usado/outro de qualquer status em aberto; final não sai
create or replace function public.pni_transicao_valida(p_de public.pni_status, p_para public.pni_status)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_de = p_para then false
    when public.pni_status_final(p_de) then false
    when p_para in ('descartado', 'guardado', 'usado', 'outro_destino') then true
    when p_para = 'vendido' then p_de = 'a_venda'
    else abs(public.pni_status_ordem(p_para) - public.pni_status_ordem(p_de)) = 1
  end
$$;

-- ── Histórico: o motivo de qualquer encerramento vai junto ──────────
create or replace function public.pni_tg_historico()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := coalesce(auth.uid(), new.atualizado_por, new.criado_por);
begin
  if tg_op = 'INSERT' then
    insert into pni_historico (item_id, campo, de, para, usuario)
    values (new.id, 'criacao', null, new.status::text, new.criado_por);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into pni_historico (item_id, campo, de, para, motivo, usuario)
    values (new.id, 'status', old.status::text, new.status::text,
            case when public.pni_status_final(new.status) then new.desfecho end, v_user);
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

-- ── Localização opcional (Box Técnico ainda exige técnico) ──────────
create or replace function public.pni__validar_local(p_local text, p_tecnico text)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_exige boolean;
  v_tec text := nullif(btrim(coalesce(p_tecnico, '')), '');
begin
  if nullif(btrim(coalesce(p_local, '')), '') is null then return null; end if;
  select exige_tecnico into v_exige from pni_locais where id = p_local and ativo;
  if not found then raise exception 'Localização inválida.'; end if;
  if v_exige and v_tec is null then raise exception 'Box Técnico: escolha o técnico.'; end if;
  if length(coalesce(v_tec, '')) > 120 then raise exception 'Nome do técnico longo demais.'; end if;
  return case when v_exige then v_tec else null end;
end $$;

-- ── Mudança de status com desfecho ──────────────────────────────────
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
begin
  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;

  if not public.pni_transicao_valida(v.status, p_para) then
    raise exception '%: não é possível passar de "%" para "%".',
      v.codigo, public.pni_status_rotulo(v.status), public.pni_status_rotulo(p_para);
  end if;
  if p_para = 'descartado' and v_motivo is null then
    raise exception '%: informe o motivo do descarte.', v.codigo;
  end if;
  if p_para = 'outro_destino' and v_motivo is null then
    raise exception '%: descreva o que aconteceu com a peça.', v.codigo;
  end if;
  if length(coalesce(v_motivo, '')) > 500 then raise exception 'Texto com mais de 500 caracteres.'; end if;
  perform public.pni__conferir_requisitos(v, p_para);

  update pni_itens set
    status          = p_para,
    motivo_descarte = case when p_para = 'descartado' then v_motivo else motivo_descarte end,
    desfecho        = case when v_final then v_motivo else desfecho end,
    encerrado_em    = case when v_final then now() else encerrado_em end,
    encerrado_por   = case when v_final then auth.uid() else encerrado_por end,
    atualizado_por  = auth.uid(),
    atualizado_em   = now()
  where id = p_id
  returning * into v;
  return v;
end $$;
revoke all on function public.pni__mudar_status(uuid, public.pni_status, text) from public, anon, authenticated;

-- ── Aplicações: item encerrado não muda ─────────────────────────────
create or replace function public.pni_definir_aplicacoes(p_id uuid, p_aplicacoes jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  n int;
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças altera itens.' using errcode = '42501';
  end if;
  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if public.pni_status_final(v.status) then
    raise exception '%: item % não muda mais.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;
  n := public.pni__gravar_aplicacoes(p_id, p_aplicacoes);
  if n = 0 and not v.nao_identificavel and v.status <> 'aguardando_identificacao' then
    raise exception '%: item % precisa de pelo menos uma aplicação.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;
  update pni_itens set atualizado_por = auth.uid(), atualizado_em = now() where id = p_id;
  return n;
end $$;

-- ── Atualizar: item encerrado só muda observações e localização ─────
create or replace function public.pni_atualizar_item(p_id uuid, p_dados jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v     pni_itens;
  n     pni_itens;
  k     text;
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças altera itens.' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Dados inválidos.'; end if;
  for k in select jsonb_object_keys(p_dados) loop
    if k not in ('descricao', 'codigo', 'codigo_fabricante', 'quantidade', 'qualidade',
                 'preco_sugerido', 'nao_identificavel', 'observacoes', 'local_id', 'local_tecnico') then
      raise exception 'Campo "%" não pode ser alterado.', k;
    end if;
  end loop;

  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  n := v;

  if public.pni_status_final(v.status) and exists (
       select 1 from jsonb_object_keys(p_dados) j where j not in ('observacoes', 'local_id', 'local_tecnico')) then
    raise exception '%: item % — só observações e localização podem mudar.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;

  begin
    if p_dados ? 'descricao'         then n.descricao := nullif(btrim(coalesce(p_dados->>'descricao', '')), ''); end if;
    if p_dados ? 'codigo_fabricante' then n.codigo_fabricante := nullif(btrim(coalesce(p_dados->>'codigo_fabricante', '')), ''); end if;
    if p_dados ? 'observacoes'       then n.observacoes := nullif(btrim(coalesce(p_dados->>'observacoes', '')), ''); end if;
    if p_dados ? 'quantidade'        then n.quantidade := (p_dados->>'quantidade')::int; end if;
    if p_dados ? 'qualidade'         then n.qualidade := (p_dados->>'qualidade')::pni_qualidade; end if;
    if p_dados ? 'preco_sugerido'    then n.preco_sugerido := round((nullif(p_dados->>'preco_sugerido', ''))::numeric, 2); end if;
    if p_dados ? 'nao_identificavel' then n.nao_identificavel := coalesce((p_dados->>'nao_identificavel')::boolean, false); end if;
    if p_dados ? 'local_id'          then n.local_id := nullif(btrim(coalesce(p_dados->>'local_id', '')), ''); end if;
    if p_dados ? 'local_tecnico'     then n.local_tecnico := p_dados->>'local_tecnico'; end if;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'Valor inválido em um dos campos.';
  end;

  if p_dados ? 'local_id' or p_dados ? 'local_tecnico' then
    n.local_tecnico := public.pni__validar_local(n.local_id, n.local_tecnico);
  end if;
  if p_dados ? 'codigo' and btrim(coalesce(p_dados->>'codigo', '')) is distinct from v.codigo then
    n.codigo := public.pni__codigo_livre(p_dados->>'codigo', v.id);
  end if;
  if n.qualidade is null then raise exception 'Informe a qualidade.'; end if;
  if n.quantidade is null or n.quantidade < 1 or n.quantidade > 100000 then raise exception 'Quantidade inválida.'; end if;
  if n.preco_sugerido is not null and (n.preco_sugerido < 0 or n.preco_sugerido > 9999999999.99) then
    raise exception 'Preço inválido.';
  end if;
  if length(coalesce(n.descricao, '')) > 500 then raise exception 'Descrição com mais de 500 caracteres.'; end if;
  if length(coalesce(n.codigo_fabricante, '')) > 80 then raise exception 'Código existente com mais de 80 caracteres.'; end if;
  if length(coalesce(n.observacoes, '')) > 2000 then raise exception 'Observações com mais de 2000 caracteres.'; end if;

  perform public.pni__conferir_requisitos(n, n.status);

  update pni_itens set
    codigo = n.codigo, descricao = n.descricao, codigo_fabricante = n.codigo_fabricante,
    observacoes = n.observacoes, quantidade = n.quantidade, qualidade = n.qualidade,
    preco_sugerido = n.preco_sugerido, nao_identificavel = n.nao_identificavel,
    local_id = n.local_id, local_tecnico = n.local_tecnico,
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id
  returning * into n;

  return to_jsonb(n);
end $$;

grant execute on function public.pni_atualizar_item(uuid, jsonb) to authenticated, service_role;
grant execute on function public.pni_definir_aplicacoes(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
