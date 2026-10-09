-- ════════════════════════════════════════════════════════════════════
-- Peças S/Estoque (Opa) — 11: FLUXO NOVO (decisão do José, 09/10/2026)
--
--   1. CAPTAÇÃO      cria a peça: onde achou, quantidade, descrição, código
--                    existente (opcional) e qualidade
--                    → aguardando_identificacao  ("Aguardando verificação")
--   2. VERIFICAÇÃO   valor e aplicação, conferidos com um setor
--                    → identificado              ("Aguardando separação")
--   3. SEPARAÇÃO     ÚLTIMA decisão: pra onde a peça vai — CONCLUI aqui:
--                    vender → a_venda (depois "vendido" pela ficha)
--                    guardar → guardado · usar → usado · descartar → descartado
--                    outro / destino criado pelo usuário → outro_destino
--   CONCLUÍDA        mostra tudo; o código definitivo (PNI-…) e o QR nascem aqui
--
-- Antes (pni-08): separação vinha ANTES da verificação e "descartar/outro"
-- encerravam a peça na 2ª fase — o que não deveria acontecer.
-- Destinos novos: tabela pni_destinos (criados na separação, só setor de peças).
--
-- Sem valor novo de enum: os status existentes mudam de sentido (rótulos abaixo).
-- `precificado` deixa de ser usado (peças nele viram "aguardando separação").
-- Regras espelhadas em src/lib/opa-pecas/regras.ts. Rodar UMA vez, inteiro.
-- ════════════════════════════════════════════════════════════════════

-- ── Destinos criados pelo usuário ───────────────────────────────────
create table if not exists public.pni_destinos (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(btrim(nome)) between 1 and 60),
  ativo       boolean not null default true,
  ordem       int not null default 0,
  criado_por  uuid,
  criado_em   timestamptz not null default now()
);
create unique index if not exists pni_destinos_nome_unico on public.pni_destinos (lower(btrim(nome)));

alter table public.pni_destinos enable row level security;
drop policy if exists pni_destinos_ler on public.pni_destinos;
create policy pni_destinos_ler on public.pni_destinos for select to authenticated using (public.pni_pode_ver());
revoke insert, update, delete on public.pni_destinos from anon, authenticated;

alter table public.pni_itens add column if not exists destino_id uuid references public.pni_destinos(id);

-- ── Rótulos ─────────────────────────────────────────────────────────
create or replace function public.pni_status_rotulo(p public.pni_status)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p
    when 'aguardando_identificacao' then 'Aguardando verificação' when 'identificado' then 'Aguardando separação'
    when 'precificado' then 'Aguardando separação' when 'a_venda' then 'À venda' when 'vendido' then 'Vendido'
    when 'descartado' then 'Descartado' when 'guardado' then 'Guardado' when 'usado' then 'Usado'
    when 'outro_destino' then 'Outro destino' end
$$;

-- ── Transições ──────────────────────────────────────────────────────
--  verificação ↔ separação; separação → concluída; à venda → vendido ou outro
--  desfecho, ou volta para a separação. Concluída (final) não volta.
create or replace function public.pni_transicao_valida(p_de public.pni_status, p_para public.pni_status)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_de = p_para then false
    when public.pni_status_final(p_de) then false
    when p_de = 'aguardando_identificacao' then p_para = 'identificado'
    when p_de in ('identificado', 'precificado') then p_para in ('aguardando_identificacao', 'a_venda', 'guardado', 'usado', 'descartado', 'outro_destino')
    when p_de = 'a_venda' then p_para in ('identificado', 'vendido', 'guardado', 'usado', 'descartado', 'outro_destino')
    else false
  end
$$;

-- o que cada status exige (à venda/vendido: descrição, aplicação e preço)
create or replace function public.pni__conferir_requisitos(p_item public.pni_itens, p_status public.pni_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
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

-- mudança genérica: ao VOLTAR uma etapa, limpa o que ela tinha gravado
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
  v_volta_verificacao boolean := p_para = 'aguardando_identificacao';
  v_volta_separacao boolean;
begin
  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not public.pni_transicao_valida(v.status, p_para) then
    raise exception '%: não é possível passar de "%" para "%".',
      v.codigo, public.pni_status_rotulo(v.status), public.pni_status_rotulo(p_para);
  end if;
  v_volta_separacao := p_para = 'identificado' and v.status = 'a_venda';
  if p_para = 'descartado' and v_motivo is null then raise exception '%: informe o motivo do descarte.', v.codigo; end if;
  if p_para = 'outro_destino' and v_motivo is null then raise exception '%: diga para onde a peça foi.', v.codigo; end if;
  if length(coalesce(v_motivo, '')) > 500 then raise exception 'Texto com mais de 500 caracteres.'; end if;
  perform public.pni__conferir_requisitos(v, p_para);

  update pni_itens set
    status          = p_para,
    motivo_descarte = case when p_para = 'descartado' then v_motivo else motivo_descarte end,
    desfecho        = case when v_final then coalesce(v_motivo, desfecho) when v_volta_separacao or v_volta_verificacao then null else desfecho end,
    encerrado_em    = case when v_final then now() else encerrado_em end,
    encerrado_por   = case when v_final then auth.uid() else encerrado_por end,
    decisao         = case when v_volta_separacao or v_volta_verificacao then null else decisao end,
    decisao_obs     = case when v_volta_separacao or v_volta_verificacao then null else decisao_obs end,
    decidido_em     = case when v_volta_separacao or v_volta_verificacao then null else decidido_em end,
    decidido_por    = case when v_volta_separacao or v_volta_verificacao then null else decidido_por end,
    destino_id      = case when v_volta_separacao or v_volta_verificacao then null else destino_id end,
    verificado_em   = case when v_volta_verificacao then null else verificado_em end,
    verificado_por  = case when v_volta_verificacao then null else verificado_por end,
    atualizado_por  = auth.uid(),
    atualizado_em   = now()
  where id = p_id
  returning * into v;
  return v;
end $$;
revoke all on function public.pni__mudar_status(uuid, public.pni_status, text) from public, anon, authenticated;

-- histórico: verificação e separação aparecem no motivo
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
      when new.status = 'identificado' and old.status = 'aguardando_identificacao'
        then 'Verificado com ' || coalesce(new.verificado_setor, '?') || coalesce(' (' || new.verificado_com || ')', '')
      when old.status in ('identificado', 'precificado') and (public.pni_status_final(new.status) or new.status = 'a_venda')
        then 'Separação: ' || coalesce(new.decisao, '?') || coalesce(' — ' || coalesce(new.desfecho, new.decisao_obs), '')
      when public.pni_status_final(new.status) then new.desfecho
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

-- ── código definitivo (PNI-…) e QR nascem na CONCLUSÃO ───────────────
create or replace function public.pni_tg_codigo_definitivo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.codigo ~* '^CAP-' and new.status in ('a_venda', 'vendido', 'guardado', 'usado', 'descartado', 'outro_destino') then
    new.codigo := 'PNI-' || lpad(nextval('public.pni_codigo_seq')::text, 6, '0');
  end if;
  return new;
end $$;
revoke all on function public.pni_tg_codigo_definitivo() from public, anon, authenticated;

-- ── 1. CAPTAÇÃO: onde achou, quantidade, descrição e qualidade obrigatórios ──
create or replace function public.pni_criar_item(
  p_fotos              text[],
  p_quantidade         int default 1,
  p_qualidade          public.pni_qualidade default 'nao_avaliada',
  p_descricao          text default null,
  p_codigo             text default null,
  p_local              text default null,
  p_local_tecnico      text default null,
  p_codigo_fabricante  text default null,
  p_preco              numeric default null,
  p_aplicacoes         jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_fotos text[];
  v_item  pni_itens;
  v_desc  text := nullif(btrim(coalesce(p_descricao, '')), '');
  v_fab   text := nullif(btrim(coalesce(p_codigo_fabricante, '')), '');
  v_tec   text;
  i int;
begin
  if not public.pni_pode_ver() then
    raise exception 'Sem permissão para cadastrar peças.' using errcode = '42501';
  end if;
  v_fotos := public.pni__validar_fotos(p_fotos);
  if coalesce(array_length(v_fotos, 1), 0) < 2 then
    raise exception 'Tire pelo menos 2 fotos da peça (ângulos diferentes).';
  end if;
  if array_length(v_fotos, 1) > 12 then raise exception 'No máximo 12 fotos por item.'; end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 100000 then
    raise exception 'Quantidade inválida.';
  end if;
  if v_desc is null then raise exception 'Escreva a descrição da peça.'; end if;
  if length(v_desc) > 500 then raise exception 'Descrição com mais de 500 caracteres.'; end if;
  if coalesce(p_qualidade, 'nao_avaliada') = 'nao_avaliada' then raise exception 'Escolha a qualidade da peça.'; end if;
  if nullif(btrim(coalesce(p_local, '')), '') is null then raise exception 'Informe onde a peça foi achada.'; end if;
  if length(coalesce(v_fab, '')) > 80 then raise exception 'Código existente com mais de 80 caracteres.'; end if;
  if p_preco is not null and (p_preco < 0 or p_preco > 9999999999.99) then raise exception 'Preço inválido.'; end if;
  v_tec := public.pni__validar_local(p_local, p_local_tecnico);

  insert into pni_itens (codigo, descricao, codigo_fabricante, quantidade, qualidade, preco_sugerido,
                         local_id, local_tecnico, criado_por, atualizado_por)
  values (
    case when nullif(btrim(coalesce(p_codigo, '')), '') is null
         then 'CAP-' || lpad(nextval('public.pni_captura_seq')::text, 6, '0')
         else public.pni__codigo_livre(p_codigo) end,
    v_desc, v_fab, p_quantidade, p_qualidade, round(p_preco, 2),
    p_local, v_tec, auth.uid(), auth.uid())
  returning * into v_item;

  for i in 1 .. array_length(v_fotos, 1) loop
    insert into pni_fotos (item_id, storage_path, ordem, criado_por)
    values (v_item.id, v_fotos[i], i, auth.uid());
  end loop;

  if p_aplicacoes is not null and jsonb_typeof(p_aplicacoes) = 'array' and jsonb_array_length(p_aplicacoes) > 0 then
    perform public.pni__gravar_aplicacoes(v_item.id, p_aplicacoes);
  end if;

  return jsonb_build_object('id', v_item.id, 'codigo', v_item.codigo);
end $$;

-- ── 2. VERIFICAÇÃO: valor e aplicação ───────────────────────────────
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
  if v.status <> 'aguardando_identificacao' then
    raise exception '%: a peça está "%" — não está aguardando verificação.', v.codigo, public.pni_status_rotulo(v.status);
  end if;
  if not v.nao_identificavel then
    if length(btrim(coalesce(v.descricao, ''))) = 0 then raise exception '%: preencha a descrição.', v.codigo; end if;
    if not public.pni__tem_aplicacao(v.id) then raise exception '%: informe a aplicação.', v.codigo; end if;
    if v.preco_sugerido is null then raise exception '%: informe o valor da peça.', v.codigo; end if;
  end if;

  update pni_itens set
    verificado_em = now(), verificado_por = auth.uid(), verificado_setor = v_setor, verificado_com = v_com, verificacao_obs = v_obs,
    status = 'identificado',   -- = aguardando separação
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id
  returning * into v;

  return jsonb_build_object('id', v.id, 'codigo', v.codigo, 'status', v.status);
end $$;

-- ── 3. SEPARAÇÃO: última decisão — conclui a peça ───────────────────
drop function if exists public.pni_separar(uuid, text, text);
create or replace function public.pni_separar(p_id uuid, p_decisao text, p_obs text default null, p_destino_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_destino text;
  v_texto text;
  v_para pni_status;
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças faz a separação.' using errcode = '42501';
  end if;
  if coalesce(p_decisao, '') not in ('vender', 'guardar', 'usar', 'descartar', 'outro') then
    raise exception 'Escolha pra onde a peça vai.';
  end if;
  if length(coalesce(v_obs, '')) > 500 then raise exception 'Texto com mais de 500 caracteres.'; end if;

  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if v.status not in ('identificado', 'precificado') then
    raise exception '%: a peça está "%" — não está aguardando separação.', v.codigo, public.pni_status_rotulo(v.status);
  end if;

  if p_decisao = 'outro' then
    if p_destino_id is not null then
      select nome into v_destino from pni_destinos where id = p_destino_id and ativo;
      if v_destino is null then raise exception 'Destino não encontrado.'; end if;
    elsif v_obs is null then
      raise exception '%: escolha o destino (ou descreva para onde a peça foi).', v.codigo;
    end if;
  end if;
  if p_decisao = 'descartar' and v_obs is null then raise exception '%: informe o motivo do descarte.', v.codigo; end if;

  v_texto := case p_decisao
    when 'outro' then concat_ws(' — ', v_destino, v_obs)
    else v_obs end;
  v_para := (case p_decisao when 'vender' then 'a_venda' when 'guardar' then 'guardado' when 'usar' then 'usado'
                            when 'descartar' then 'descartado' else 'outro_destino' end)::pni_status;

  update pni_itens set decisao = p_decisao, decisao_obs = v_obs, decidido_em = now(), decidido_por = auth.uid(),
         destino_id = case when p_decisao = 'outro' then p_destino_id else null end,
         atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id;

  v := public.pni__mudar_status(p_id, v_para, v_texto);
  return jsonb_build_object('id', v.id, 'codigo', v.codigo, 'status', v.status, 'decisao', p_decisao);
end $$;

-- ── criar destino novo (na separação) ───────────────────────────────
create or replace function public.pni_criar_destino(p_nome text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nome text := nullif(btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g')), '');
  v pni_destinos;
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças cria destinos.' using errcode = '42501';
  end if;
  if v_nome is null then raise exception 'Escreva o nome do destino.'; end if;
  if length(v_nome) > 60 then raise exception 'Nome com mais de 60 caracteres.'; end if;
  select * into v from pni_destinos where lower(btrim(nome)) = lower(v_nome);
  if found then
    if not v.ativo then update pni_destinos set ativo = true where id = v.id returning * into v; end if;
  else
    insert into pni_destinos (nome, ordem, criado_por)
    values (v_nome, coalesce((select max(ordem) + 1 from pni_destinos), 1), auth.uid())
    returning * into v;
  end if;
  return jsonb_build_object('id', v.id, 'nome', v.nome);
end $$;

-- ── trocar uma foto (fica na mesma posição; quem cadastrou ou o setor de peças) ──
create or replace function public.pni_substituir_foto(p_foto_id uuid, p_path text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_foto pni_fotos;
  v      pni_itens;
  v_novo text[];
begin
  select * into v_foto from pni_fotos where id = p_foto_id and deleted_at is null for update;
  if not found then raise exception 'Foto não encontrada.'; end if;
  select * into v from pni_itens where id = v_foto.item_id and deleted_at is null;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not (public.pni_pode_gerir() or (public.pni_pode_ver() and v.criado_por = auth.uid())) then
    raise exception 'Só quem cadastrou ou o setor de peças troca fotos.' using errcode = '42501';
  end if;
  if v.status in ('vendido', 'descartado') then
    raise exception '%: item % não muda mais.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;
  v_novo := public.pni__validar_fotos(array[p_path]);
  if coalesce(array_length(v_novo, 1), 0) <> 1 then raise exception 'Foto inválida.'; end if;

  update pni_fotos set storage_path = v_novo[1] where id = p_foto_id;
  update pni_itens set atualizado_por = auth.uid(), atualizado_em = now() where id = v.id;
  return jsonb_build_object('id', p_foto_id, 'storage_path', v_novo[1], 'anterior', v_foto.storage_path);
end $$;

do $$
declare f text;
begin
  foreach f in array array['public.pni_separar(uuid, text, text, uuid)', 'public.pni_verificar(uuid, text, text, text)',
                           'public.pni_criar_destino(text)', 'public.pni_substituir_foto(uuid, text)',
                           'public.pni_criar_item(text[], int, public.pni_qualidade, text, text, text, text, text, numeric, jsonb)'] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

-- ── dados existentes no fluxo novo ──────────────────────────────────
-- separadas mas ainda não verificadas (o sentido antigo de "identificado") → verificação
update public.pni_itens
   set status = 'aguardando_identificacao', decisao = null, decisao_obs = null, decidido_em = null, decidido_por = null,
       atualizado_em = now()
 where status = 'identificado' and verificado_em is null and deleted_at is null;
-- verificadas aguardando o antigo "destino" → aguardando separação
update public.pni_itens
   set status = 'identificado', atualizado_em = now()
 where status = 'precificado' and deleted_at is null;
-- CAP-000002: encerrada pela regra antiga ("Outro" na 2ª fase) → volta para a verificação (pedido do José)
update public.pni_itens
   set status = 'aguardando_identificacao', decisao = null, decisao_obs = null, decidido_em = null, decidido_por = null,
       desfecho = null, encerrado_em = null, encerrado_por = null, atualizado_em = now()
 where codigo = 'CAP-000002' and status = 'outro_destino' and verificado_em is null;

notify pgrst, 'reload schema';
