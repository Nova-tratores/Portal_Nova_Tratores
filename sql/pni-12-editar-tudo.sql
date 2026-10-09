-- ════════════════════════════════════════════════════════════════════
-- Peças S/Estoque (Opa) — 12: quem tem o módulo altera QUALQUER informação
-- (pedido do José, 09/10/2026). Rodar DEPOIS do pni-11. Idempotente.
--
-- Quem tem o módulo 'opa-pecas' (pni_pode_gerir) edita tudo da peça pela
-- ficha, em qualquer fase — inclusive vendida/descartada. As telas de etapa
-- continuam perguntando por fase; isto só tira as travas da EDIÇÃO.
-- Continua valendo: à venda/vendida precisa de descrição, aplicação e preço
-- (senão a peça fica à venda sem dados).
-- ════════════════════════════════════════════════════════════════════

-- ── dados da peça: sem a trava de "só observações e localização" ─────
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

-- ── aplicações: sem a trava de status; exige ao menos uma só à venda/vendida ──
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
  n := public.pni__gravar_aplicacoes(p_id, p_aplicacoes);
  if n = 0 and not v.nao_identificavel and v.status in ('a_venda', 'vendido') then
    raise exception '%: item % precisa de pelo menos uma aplicação.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;
  update pni_itens set atualizado_por = auth.uid(), atualizado_em = now() where id = p_id;
  return n;
end $$;

-- ── trocar foto: o setor de peças troca em qualquer fase ─────────────
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
  -- sem o módulo (só quem cadastrou): peça vendida/descartada não muda mais
  if not public.pni_pode_gerir() and v.status in ('vendido', 'descartado') then
    raise exception '%: item % não muda mais.', v.codigo, lower(public.pni_status_rotulo(v.status));
  end if;
  v_novo := public.pni__validar_fotos(array[p_path]);
  if coalesce(array_length(v_novo, 1), 0) <> 1 then raise exception 'Foto inválida.'; end if;

  update pni_fotos set storage_path = v_novo[1] where id = p_foto_id;
  update pni_itens set atualizado_por = auth.uid(), atualizado_em = now() where id = v.id;
  return jsonb_build_object('id', p_foto_id, 'storage_path', v_novo[1], 'anterior', v_foto.storage_path);
end $$;

grant execute on function public.pni_atualizar_item(uuid, jsonb) to authenticated, service_role;
grant execute on function public.pni_definir_aplicacoes(uuid, jsonb) to authenticated, service_role;
grant execute on function public.pni_substituir_foto(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
