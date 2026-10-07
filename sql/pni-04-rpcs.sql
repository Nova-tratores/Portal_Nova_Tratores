-- ════════════════════════════════════════════════════════════════════
-- Peças Não Identificadas (Opa) — 4/4: RPCs (única porta de escrita)
--
-- Todas SECURITY DEFINER com search_path fixo, permissão e validação de
-- entrada DENTRO da função. O navegador chama direto (supabase.rpc) com a
-- sessão do usuário — auth.uid() é quem fez, e a trigger de histórico grava.
--
-- Regras de status (espelhadas em src/lib/opa-pecas/regras.ts — mudou aqui,
-- muda lá e nos testes):
--   • anda UMA etapa para frente ou UMA para trás:
--       aguardando_identificacao ⇄ identificado ⇄ precificado ⇄ a_venda → vendido
--   • descartado: de qualquer status não final, com MOTIVO
--   • vendido só a partir de a_venda; vendido e descartado são finais
--   • identificado (e adiante) exige descrição + ≥1 aplicação,
--     ou nao_identificavel = true
--   • precificado / a_venda / vendido exigem preco_sugerido
-- Mensagens de erro em português, prontas para mostrar na tela.
-- ════════════════════════════════════════════════════════════════════

-- ── Puras ───────────────────────────────────────────────────────────
create or replace function public.pni_status_ordem(p public.pni_status)
returns int language sql immutable set search_path = public, pg_temp as $$
  select case p
    when 'aguardando_identificacao' then 0 when 'identificado' then 1
    when 'precificado' then 2 when 'a_venda' then 3
    when 'vendido' then 4 when 'descartado' then 5 end
$$;

create or replace function public.pni_status_rotulo(p public.pni_status)
returns text language sql immutable set search_path = public, pg_temp as $$
  select case p
    when 'aguardando_identificacao' then 'Aguardando identificação' when 'identificado' then 'Identificado'
    when 'precificado' then 'Precificado' when 'a_venda' then 'À venda'
    when 'vendido' then 'Vendido' when 'descartado' then 'Descartado' end
$$;

create or replace function public.pni_transicao_valida(p_de public.pni_status, p_para public.pni_status)
returns boolean language sql immutable set search_path = public, pg_temp as $$
  select case
    when p_de = p_para then false
    when p_de in ('vendido', 'descartado') then false
    when p_para = 'descartado' then true
    when p_para = 'vendido' then p_de = 'a_venda'
    else abs(public.pni_status_ordem(p_para) - public.pni_status_ordem(p_de)) = 1
  end
$$;

-- ── Internas (sem permissão própria; não expostas) ──────────────────
create or replace function public.pni__codigo_livre(p_codigo text, p_ignorar uuid default null)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v text := btrim(coalesce(p_codigo, ''));
begin
  if v = '' then raise exception 'Informe o código.'; end if;
  if length(v) > 40 then raise exception 'Código com mais de 40 caracteres.'; end if;
  if v !~ '^[A-Za-z0-9][A-Za-z0-9 ._/-]*$' then
    raise exception 'Código "%" inválido: use letras, números, espaço, ponto, traço, barra ou sublinhado.', v;
  end if;
  -- PNI-<número> é da numeração automática: um código próprio nesse formato
  -- colidiria com um item futuro
  if v ~* '^PNI-[0-9]+$' and not exists (select 1 from pni_itens where id = p_ignorar and upper(codigo) = upper(v)) then
    raise exception 'Códigos no formato PNI-número são reservados para a numeração automática.';
  end if;
  if exists (select 1 from pni_itens where upper(codigo) = upper(v) and id is distinct from p_ignorar) then
    raise exception 'O código "%" já existe em outro item.', v using errcode = '23505';
  end if;
  return v;
end $$;

-- valida o caminho das fotos enviadas ao bucket e devolve sem repetição, na ordem
create or replace function public.pni__validar_fotos(p_fotos text[])
returns text[]
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_lista text[];
  v_path  text;
begin
  select coalesce(array_agg(f order by o), '{}') into v_lista
  from (select btrim(f) f, min(o) o from unnest(coalesce(p_fotos, '{}')) with ordinality t(f, o)
        where length(btrim(f)) > 0 group by btrim(f)) x;

  foreach v_path in array v_lista loop
    if v_path !~ ('^' || auth.uid()::text || '/[A-Za-z0-9_.-]+$') then
      raise exception 'Foto com caminho inválido (%).', v_path;
    end if;
    if not exists (select 1 from storage.objects where bucket_id = 'pni-fotos' and name = v_path) then
      raise exception 'Uma das fotos não chegou ao servidor. Envie de novo.';
    end if;
    if exists (select 1 from pni_fotos where storage_path = v_path) then
      raise exception 'Foto já usada em outro item.';
    end if;
  end loop;
  return v_lista;
end $$;

create or replace function public.pni__tem_aplicacao(p_item uuid)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from pni_aplicacoes where item_id = p_item and deleted_at is null)
$$;

-- confere se o item, como está, pode ficar no status p_status
create or replace function public.pni__conferir_requisitos(p_item public.pni_itens, p_status public.pni_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_status in ('identificado', 'precificado', 'a_venda', 'vendido') and not p_item.nao_identificavel then
    if length(btrim(coalesce(p_item.descricao, ''))) = 0 then
      raise exception '%: preencha a descrição (ou marque "não identificável").', p_item.codigo;
    end if;
    if not public.pni__tem_aplicacao(p_item.id) then
      raise exception '%: informe pelo menos uma aplicação (ou marque "não identificável").', p_item.codigo;
    end if;
  end if;
  if p_status in ('precificado', 'a_venda', 'vendido') and p_item.preco_sugerido is null then
    raise exception '%: informe o preço sugerido.', p_item.codigo;
  end if;
end $$;

create or replace function public.pni__mudar_status(p_id uuid, p_para public.pni_status, p_motivo text)
returns public.pni_itens
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
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
  if length(coalesce(v_motivo, '')) > 500 then raise exception 'Motivo com mais de 500 caracteres.'; end if;
  perform public.pni__conferir_requisitos(v, p_para);

  update pni_itens set
    status          = p_para,
    motivo_descarte = case when p_para = 'descartado' then v_motivo else motivo_descarte end,
    atualizado_por  = auth.uid(),
    atualizado_em   = now()
  where id = p_id
  returning * into v;
  return v;
end $$;

revoke all on function public.pni__codigo_livre(text, uuid)                       from public, anon, authenticated;
revoke all on function public.pni__validar_fotos(text[])                           from public, anon, authenticated;
revoke all on function public.pni__tem_aplicacao(uuid)                             from public, anon, authenticated;
revoke all on function public.pni__conferir_requisitos(public.pni_itens, public.pni_status) from public, anon, authenticated;
revoke all on function public.pni__mudar_status(uuid, public.pni_status, text)     from public, anon, authenticated;

-- ── 1. Criar item (captura no celular) ──────────────────────────────
create or replace function public.pni_criar_item(
  p_fotos       text[],
  p_quantidade  int default 1,
  p_qualidade   public.pni_qualidade default 'nao_avaliada',
  p_descricao   text default null,
  p_codigo      text default null
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

  if nullif(btrim(coalesce(p_codigo, '')), '') is null then
    insert into pni_itens (descricao, quantidade, qualidade, criado_por, atualizado_por)
    values (v_desc, p_quantidade, coalesce(p_qualidade, 'nao_avaliada'), auth.uid(), auth.uid())
    returning * into v_item;
  else
    insert into pni_itens (codigo, descricao, quantidade, qualidade, criado_por, atualizado_por)
    values (public.pni__codigo_livre(p_codigo), v_desc, p_quantidade, coalesce(p_qualidade, 'nao_avaliada'), auth.uid(), auth.uid())
    returning * into v_item;
  end if;

  for i in 1 .. array_length(v_fotos, 1) loop
    insert into pni_fotos (item_id, storage_path, ordem, criado_por)
    values (v_item.id, v_fotos[i], i, auth.uid());
  end loop;

  return jsonb_build_object('id', v_item.id, 'codigo', v_item.codigo);
end $$;

-- ── 2. Atualizar campos (setor de peças) ────────────────────────────
-- p_dados: só as chaves presentes mudam. Aceita descricao, codigo,
-- codigo_fabricante, quantidade, qualidade, preco_sugerido,
-- nao_identificavel, observacoes.
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
                 'preco_sugerido', 'nao_identificavel', 'observacoes') then
      raise exception 'Campo "%" não pode ser alterado.', k;
    end if;
  end loop;

  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  n := v;

  if v.status in ('vendido', 'descartado') and exists (select 1 from jsonb_object_keys(p_dados) j where j <> 'observacoes') then
    raise exception '%: item % — só as observações podem mudar.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;

  begin
    if p_dados ? 'descricao'         then n.descricao := nullif(btrim(coalesce(p_dados->>'descricao', '')), ''); end if;
    if p_dados ? 'codigo_fabricante' then n.codigo_fabricante := nullif(btrim(coalesce(p_dados->>'codigo_fabricante', '')), ''); end if;
    if p_dados ? 'observacoes'       then n.observacoes := nullif(btrim(coalesce(p_dados->>'observacoes', '')), ''); end if;
    if p_dados ? 'quantidade'        then n.quantidade := (p_dados->>'quantidade')::int; end if;
    if p_dados ? 'qualidade'         then n.qualidade := (p_dados->>'qualidade')::pni_qualidade; end if;
    if p_dados ? 'preco_sugerido'    then n.preco_sugerido := round((nullif(p_dados->>'preco_sugerido', ''))::numeric, 2); end if;
    if p_dados ? 'nao_identificavel' then n.nao_identificavel := coalesce((p_dados->>'nao_identificavel')::boolean, false); end if;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'Valor inválido em um dos campos.';
  end;

  if p_dados ? 'codigo' and btrim(coalesce(p_dados->>'codigo', '')) is distinct from v.codigo then
    n.codigo := public.pni__codigo_livre(p_dados->>'codigo', v.id);
  end if;
  if n.qualidade is null then raise exception 'Informe a qualidade.'; end if;
  if n.quantidade is null or n.quantidade < 1 or n.quantidade > 100000 then raise exception 'Quantidade inválida.'; end if;
  if n.preco_sugerido is not null and (n.preco_sugerido < 0 or n.preco_sugerido > 9999999999.99) then
    raise exception 'Preço inválido.';
  end if;
  if length(coalesce(n.descricao, '')) > 500 then raise exception 'Descrição com mais de 500 caracteres.'; end if;
  if length(coalesce(n.codigo_fabricante, '')) > 80 then raise exception 'Código do fabricante com mais de 80 caracteres.'; end if;
  if length(coalesce(n.observacoes, '')) > 2000 then raise exception 'Observações com mais de 2000 caracteres.'; end if;

  -- o item continua cumprindo o que o status atual exige
  perform public.pni__conferir_requisitos(n, n.status);

  update pni_itens set
    codigo = n.codigo, descricao = n.descricao, codigo_fabricante = n.codigo_fabricante,
    observacoes = n.observacoes, quantidade = n.quantidade, qualidade = n.qualidade,
    preco_sugerido = n.preco_sugerido, nao_identificavel = n.nao_identificavel,
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id
  returning * into n;

  return to_jsonb(n);
end $$;

-- ── 3. Aplicações (substitui o conjunto) ────────────────────────────
-- p_aplicacoes: [{ "tipo_maquina_id": uuid, "marca_id": uuid|null }, ...]
create or replace function public.pni_definir_aplicacoes(p_id uuid, p_aplicacoes jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v       pni_itens;
  a       jsonb;
  v_tipo  uuid;
  v_marca uuid;
  v_novos int := 0;
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças altera itens.' using errcode = '42501';
  end if;
  if p_aplicacoes is null or jsonb_typeof(p_aplicacoes) <> 'array' then raise exception 'Aplicações inválidas.'; end if;
  if jsonb_array_length(p_aplicacoes) > 50 then raise exception 'No máximo 50 aplicações por item.'; end if;

  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if v.status in ('vendido', 'descartado') then
    raise exception '%: item % não muda mais.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;

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

  if not v.nao_identificavel and v.status <> 'aguardando_identificacao'
     and not exists (select 1 from pni_tmp_apl) then
    raise exception '%: item % precisa de pelo menos uma aplicação.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;

  -- soft delete do que saiu
  update pni_aplicacoes p set deleted_at = now(), deleted_por = auth.uid()
  where p.item_id = p_id and p.deleted_at is null
    and not exists (select 1 from pni_tmp_apl t where t.tipo = p.tipo_maquina_id and t.marca is not distinct from p.marca_id);

  -- insere o que entrou
  insert into pni_aplicacoes (item_id, tipo_maquina_id, marca_id, criado_por)
  select p_id, t.tipo, t.marca, auth.uid() from pni_tmp_apl t
  where not exists (select 1 from pni_aplicacoes p where p.item_id = p_id and p.deleted_at is null
                      and p.tipo_maquina_id = t.tipo and p.marca_id is not distinct from t.marca);
  get diagnostics v_novos = row_count;

  update pni_itens set atualizado_por = auth.uid(), atualizado_em = now() where id = p_id;
  return (select count(*) from pni_tmp_apl);
end $$;

-- ── 4. Mudar status (um) ────────────────────────────────────────────
create or replace function public.pni_mudar_status(p_id uuid, p_para public.pni_status, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v pni_itens;
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças muda o status.' using errcode = '42501';
  end if;
  if p_para is null then raise exception 'Informe o novo status.'; end if;
  v := public.pni__mudar_status(p_id, p_para, p_motivo);
  return jsonb_build_object('id', v.id, 'codigo', v.codigo, 'status', v.status);
end $$;

-- ── 5. Mudar status em lote (cada item vale por si) ─────────────────
create or replace function public.pni_mudar_status_lote(p_ids uuid[], p_para public.pni_status, p_motivo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id   uuid;
  v      pni_itens;
  v_ok   jsonb := '[]'::jsonb;
  v_err  jsonb := '[]'::jsonb;
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças muda o status.' using errcode = '42501';
  end if;
  if p_para is null then raise exception 'Informe o novo status.'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then raise exception 'Nenhum item selecionado.'; end if;
  if array_length(p_ids, 1) > 500 then raise exception 'No máximo 500 itens por vez.'; end if;

  foreach v_id in array (select array_agg(distinct x) from unnest(p_ids) x) loop
    begin
      v := public.pni__mudar_status(v_id, p_para, p_motivo);
      v_ok := v_ok || jsonb_build_object('id', v.id, 'codigo', v.codigo);
    exception when others then
      v_err := v_err || jsonb_build_object(
        'id', v_id,
        'codigo', (select codigo from pni_itens where id = v_id),
        'erro', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('alterados', v_ok, 'erros', v_err);
end $$;

-- ── 6. Excluir (soft delete) ────────────────────────────────────────
create or replace function public.pni_excluir_item(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças exclui itens.' using errcode = '42501';
  end if;
  update pni_itens set deleted_at = now(), deleted_por = auth.uid(), atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id and deleted_at is null;
  if not found then raise exception 'Item não encontrado.'; end if;
end $$;

-- ── 7. Mais fotos num item existente ────────────────────────────────
create or replace function public.pni_adicionar_fotos(p_id uuid, p_fotos text[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v       pni_itens;
  v_fotos text[];
  v_ordem int;
  v_total int;
  i int;
begin
  select * into v from pni_itens where id = p_id and deleted_at is null for update;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not (public.pni_pode_gerir() or (public.pni_pode_ver() and v.criado_por = auth.uid())) then
    raise exception 'Só quem cadastrou ou o setor de peças adiciona fotos.' using errcode = '42501';
  end if;
  v_fotos := public.pni__validar_fotos(p_fotos);
  if coalesce(array_length(v_fotos, 1), 0) = 0 then raise exception 'Nenhuma foto enviada.'; end if;
  select coalesce(max(ordem), 0), count(*) into v_ordem, v_total from pni_fotos where item_id = p_id and deleted_at is null;
  if v_total + array_length(v_fotos, 1) > 12 then raise exception 'No máximo 12 fotos por item.'; end if;
  for i in 1 .. array_length(v_fotos, 1) loop
    insert into pni_fotos (item_id, storage_path, ordem, criado_por) values (p_id, v_fotos[i], v_ordem + i, auth.uid());
  end loop;
  update pni_itens set atualizado_por = auth.uid(), atualizado_em = now() where id = p_id;
  return v_total + array_length(v_fotos, 1);
end $$;

-- ── 8. Etiqueta impressa (quem captura também imprime) ──────────────
create or replace function public.pni_marcar_etiqueta(p_ids uuid[])
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare n int;
begin
  if not public.pni_pode_ver() then raise exception 'Sem permissão.' using errcode = '42501'; end if;
  if coalesce(array_length(p_ids, 1), 0) > 500 then raise exception 'No máximo 500 itens por vez.'; end if;
  update pni_itens set etiqueta_impressa_em = now() where id = any (p_ids) and deleted_at is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── 9. Cadastros de tipo e marca de máquina ─────────────────────────
create or replace function public.maquina_tipo_salvar(p_id uuid, p_nome text, p_ativo boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_nome text := btrim(coalesce(p_nome, ''));
begin
  if not public.pni_pode_gerir() then raise exception 'Só o setor de peças edita os tipos de máquina.' using errcode = '42501'; end if;
  if length(v_nome) not between 1 and 80 then raise exception 'Nome do tipo inválido.'; end if;
  begin
    if p_id is null then
      insert into maquina_tipos (nome, ativo, criado_por) values (v_nome, coalesce(p_ativo, true), auth.uid()) returning id into v_id;
    else
      update maquina_tipos set nome = v_nome, ativo = coalesce(p_ativo, true) where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Tipo não encontrado.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe o tipo "%".', v_nome using errcode = '23505';
  end;
  return v_id;
end $$;

create or replace function public.maquina_marca_salvar(p_id uuid, p_nome text, p_ativo boolean default true)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_id uuid; v_nome text := btrim(coalesce(p_nome, ''));
begin
  if not public.pni_pode_gerir() then raise exception 'Só o setor de peças edita as marcas.' using errcode = '42501'; end if;
  if length(v_nome) not between 1 and 80 then raise exception 'Nome da marca inválido.'; end if;
  begin
    if p_id is null then
      insert into maquina_marcas (nome, ativo, criado_por) values (v_nome, coalesce(p_ativo, true), auth.uid()) returning id into v_id;
    else
      update maquina_marcas set nome = v_nome, ativo = coalesce(p_ativo, true) where id = p_id returning id into v_id;
      if v_id is null then raise exception 'Marca não encontrada.'; end if;
    end if;
  exception when unique_violation then
    raise exception 'Já existe a marca "%".', v_nome using errcode = '23505';
  end;
  return v_id;
end $$;

-- ── Grants: só usuário logado chama ─────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'public.pni_criar_item(text[], int, public.pni_qualidade, text, text)',
    'public.pni_atualizar_item(uuid, jsonb)',
    'public.pni_definir_aplicacoes(uuid, jsonb)',
    'public.pni_mudar_status(uuid, public.pni_status, text)',
    'public.pni_mudar_status_lote(uuid[], public.pni_status, text)',
    'public.pni_excluir_item(uuid)',
    'public.pni_adicionar_fotos(uuid, text[])',
    'public.pni_marcar_etiqueta(uuid[])',
    'public.maquina_tipo_salvar(uuid, text, boolean)',
    'public.maquina_marca_salvar(uuid, text, boolean)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated, service_role', f);
  end loop;
end $$;

notify pgrst, 'reload schema';
