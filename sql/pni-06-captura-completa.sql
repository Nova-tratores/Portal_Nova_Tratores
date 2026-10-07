-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas — 6: LOCALIZAÇÃO + captura completa
--
-- Pedido do usuário (07/10/2026): na captura também perguntar o código já
-- existente da peça (part number), a aplicação, o preço sugerido e a
-- LOCALIZAÇÃO. Box Técnico exige escolher o técnico.
--
-- • pni_locais: lista de locais (tabela, para dar para incluir local novo
--   sem mexer em código). `exige_tecnico` = precisa dizer de qual técnico.
-- • pni_itens.local_id + local_tecnico (nome do técnico, snapshot).
-- • pni_criar_item ganha os campos novos (localização OBRIGATÓRIA).
-- • pni_atualizar_item aceita local_id/local_tecnico.
-- • histórico registra mudança de localização.
-- Não altera os arquivos pni-01..04 já aplicados.
-- ════════════════════════════════════════════════════════════════════

create table if not exists public.pni_locais (
  id             text primary key,
  nome           text not null,
  exige_tecnico  boolean not null default false,
  ordem          int not null default 0,
  ativo          boolean not null default true
);
alter table public.pni_locais enable row level security;
drop policy if exists pni_locais_select on public.pni_locais;
create policy pni_locais_select on public.pni_locais for select to authenticated using (true);
revoke all on public.pni_locais from anon;
revoke insert, update, delete, truncate on public.pni_locais from authenticated;

insert into public.pni_locais (id, nome, exige_tecnico, ordem) values
  ('pos_vendas',        'Pós-Vendas',                  false, 10),
  ('pos_vendas_2andar', 'Pós-Vendas - Segundo Andar',  false, 20),
  ('fundo_oficina',     'Fundo Oficina',               false, 30),
  ('lavador_torno',     'Lavador/Torno',               false, 40),
  ('box_tecnico',       'Box Técnico',                 true,  50),
  ('pecas',             'Peças',                       false, 60),
  ('pecas_2andar',      'Peças - Segundo Andar',       false, 70),
  ('barracao_2',        'Barracão 2',                  false, 80)
on conflict (id) do update set nome = excluded.nome, exige_tecnico = excluded.exige_tecnico, ordem = excluded.ordem;

alter table public.pni_itens add column if not exists local_id text references public.pni_locais(id);
alter table public.pni_itens add column if not exists local_tecnico text;
create index if not exists pni_itens_local_idx on public.pni_itens (local_id) where deleted_at is null;

-- histórico: novo campo 'localizacao'
alter table public.pni_historico drop constraint if exists pni_historico_campo_check;
alter table public.pni_historico add constraint pni_historico_campo_check
  check (campo in ('criacao', 'status', 'qualidade', 'preco', 'codigo', 'exclusao', 'localizacao'));

-- texto legível do local ("Box Técnico (Fulano)")
create or replace function public.pni_local_texto(p_local text, p_tecnico text)
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select case when p_local is null then null
    else coalesce((select nome from pni_locais where id = p_local), p_local)
         || case when nullif(btrim(coalesce(p_tecnico, '')), '') is not null then ' (' || btrim(p_tecnico) || ')' else '' end
  end
$$;

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
            case when new.status = 'descartado' then new.motivo_descarte end, v_user);
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

-- ── internas novas ──────────────────────────────────────────────────
-- valida local + técnico; devolve o técnico normalizado (null se o local não pede)
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
  if nullif(btrim(coalesce(p_local, '')), '') is null then raise exception 'Escolha a localização da peça.'; end if;
  select exige_tecnico into v_exige from pni_locais where id = p_local and ativo;
  if not found then raise exception 'Localização inválida.'; end if;
  if v_exige and v_tec is null then raise exception 'Box Técnico: escolha o técnico.'; end if;
  if length(coalesce(v_tec, '')) > 120 then raise exception 'Nome do técnico longo demais.'; end if;
  return case when v_exige then v_tec else null end;
end $$;

-- grava o conjunto de aplicações do item (soft delete do que saiu); sem checar permissão/status
create or replace function public.pni__gravar_aplicacoes(p_id uuid, p_aplicacoes jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  a       jsonb;
  v_tipo  uuid;
  v_marca uuid;
begin
  if p_aplicacoes is null or jsonb_typeof(p_aplicacoes) <> 'array' then raise exception 'Aplicações inválidas.'; end if;
  if jsonb_array_length(p_aplicacoes) > 50 then raise exception 'No máximo 50 aplicações por item.'; end if;

  create temp table if not exists pni_tmp_apl (tipo uuid, marca uuid) on commit drop;
  truncate pni_tmp_apl;

  for a in select * from jsonb_array_elements(p_aplicacoes) loop
    begin
      v_tipo  := (a->>'tipo_maquina_id')::uuid;
      v_marca := nullif(a->>'marca_id', '')::uuid;
    exception when invalid_text_representation then
      raise exception 'Aplicação com identificador inválido.';
    end;
    if v_tipo is null or not exists (select 1 from maquina_tipos where id = v_tipo) then
      raise exception 'Tipo de máquina não encontrado.';
    end if;
    if v_marca is not null and not exists (select 1 from maquina_marcas where id = v_marca) then
      raise exception 'Marca não encontrada.';
    end if;
    insert into pni_tmp_apl
    select v_tipo, v_marca
    where not exists (select 1 from pni_tmp_apl t where t.tipo = v_tipo and t.marca is not distinct from v_marca);
  end loop;

  update pni_aplicacoes p set deleted_at = now(), deleted_por = auth.uid()
  where p.item_id = p_id and p.deleted_at is null
    and not exists (select 1 from pni_tmp_apl t where t.tipo = p.tipo_maquina_id and t.marca is not distinct from p.marca_id);

  insert into pni_aplicacoes (item_id, tipo_maquina_id, marca_id, criado_por)
  select p_id, t.tipo, t.marca, auth.uid() from pni_tmp_apl t
  where not exists (select 1 from pni_aplicacoes p where p.item_id = p_id and p.deleted_at is null
                      and p.tipo_maquina_id = t.tipo and p.marca_id is not distinct from t.marca);

  return (select count(*) from pni_tmp_apl);
end $$;

revoke all on function public.pni__validar_local(text, text)       from public, anon, authenticated;
revoke all on function public.pni__gravar_aplicacoes(uuid, jsonb)  from public, anon, authenticated;

-- ── aplicações: mesma regra de antes, agora usando a interna ────────
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
  if v.status in ('vendido', 'descartado') then
    raise exception '%: item % não muda mais.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;
  n := public.pni__gravar_aplicacoes(p_id, p_aplicacoes);
  if n = 0 and not v.nao_identificavel and v.status <> 'aguardando_identificacao' then
    raise exception '%: item % precisa de pelo menos uma aplicação.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;
  update pni_itens set atualizado_por = auth.uid(), atualizado_em = now() where id = p_id;
  return n;
end $$;

-- ── criar item: assinatura nova (a antiga sai) ──────────────────────
drop function if exists public.pni_criar_item(text[], int, public.pni_qualidade, text, text);

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
  if length(coalesce(v_desc, '')) > 500 then raise exception 'Descrição com mais de 500 caracteres.'; end if;
  if length(coalesce(v_fab, '')) > 80 then raise exception 'Código existente com mais de 80 caracteres.'; end if;
  if p_preco is not null and (p_preco < 0 or p_preco > 9999999999.99) then raise exception 'Preço inválido.'; end if;
  v_tec := public.pni__validar_local(p_local, p_local_tecnico);

  insert into pni_itens (codigo, descricao, codigo_fabricante, quantidade, qualidade, preco_sugerido,
                         local_id, local_tecnico, criado_por, atualizado_por)
  values (
    case when nullif(btrim(coalesce(p_codigo, '')), '') is null
         then 'PNI-' || lpad(nextval('public.pni_codigo_seq')::text, 6, '0')
         else public.pni__codigo_livre(p_codigo) end,
    v_desc, v_fab, p_quantidade, coalesce(p_qualidade, 'nao_avaliada'), round(p_preco, 2),
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

-- ── atualizar: aceita local_id / local_tecnico ──────────────────────
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

  -- item encerrado: só observações e localização (a peça ainda pode mudar de lugar até sair)
  if v.status in ('vendido', 'descartado') and exists (
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

do $$
declare f text;
begin
  foreach f in array array[
    'public.pni_criar_item(text[], int, public.pni_qualidade, text, text, text, text, text, numeric, jsonb)',
    'public.pni_atualizar_item(uuid, jsonb)',
    'public.pni_definir_aplicacoes(uuid, jsonb)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
