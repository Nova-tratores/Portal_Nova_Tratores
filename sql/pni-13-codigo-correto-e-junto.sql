-- ════════════════════════════════════════════════════════════════════
-- Peças S/Estoque (Opa) — 13: embalagem errada + guardar junto (13/10/2026)
-- Pedido do José. Rodar DEPOIS do pni-12. Idempotente.
--
-- 1. VERIFICAÇÃO: a peça pode estar numa embalagem com o código ERRADO.
--    `codigo_correto` guarda o código certo (o produto que ela é de verdade);
--    a relação com o cadastro e o PDF passam a usar ele no lugar do código
--    da embalagem (`codigo_fabricante`).
-- 2. SEPARAÇÃO: se o produto já é cadastrado, "Guardar no estoque" pode ser
--    "junto com os outros" — `guardado_junto_codigo` registra com qual código
--    a peça foi guardada (sem escolher local do Opa: fica na locação do produto).
-- ════════════════════════════════════════════════════════════════════

alter table public.pni_itens add column if not exists codigo_correto text;
alter table public.pni_itens add column if not exists guardado_junto_codigo text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'pni_itens_codigo_correto_tam') then
    alter table public.pni_itens add constraint pni_itens_codigo_correto_tam check (length(codigo_correto) <= 80);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pni_itens_guardado_junto_tam') then
    alter table public.pni_itens add constraint pni_itens_guardado_junto_tam check (length(guardado_junto_codigo) <= 80);
  end if;
end $$;

-- ── editar: aceita o código correto ──────────────────────────────────
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
    if k not in ('descricao', 'codigo', 'codigo_fabricante', 'codigo_correto', 'quantidade', 'qualidade',
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
    if p_dados ? 'codigo_correto'    then n.codigo_correto := nullif(btrim(coalesce(p_dados->>'codigo_correto', '')), ''); end if;
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
  if length(coalesce(n.codigo_correto, '')) > 80 then raise exception 'Código correto com mais de 80 caracteres.'; end if;
  if length(coalesce(n.observacoes, '')) > 2000 then raise exception 'Observações com mais de 2000 caracteres.'; end if;

  perform public.pni__conferir_requisitos(n, n.status);

  update pni_itens set
    codigo = n.codigo, descricao = n.descricao, codigo_fabricante = n.codigo_fabricante, codigo_correto = n.codigo_correto,
    observacoes = n.observacoes, quantidade = n.quantidade, qualidade = n.qualidade,
    preco_sugerido = n.preco_sugerido, nao_identificavel = n.nao_identificavel,
    local_id = n.local_id, local_tecnico = n.local_tecnico,
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id
  returning * into n;

  return to_jsonb(n);
end $$;

-- ── separação: "guardar junto com os outros" (5º parâmetro) ──────────
drop function if exists public.pni_separar(uuid, text, text, uuid);

create or replace function public.pni_separar(p_id uuid, p_decisao text, p_obs text default null,
                                              p_destino_id uuid default null, p_junto_codigo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v pni_itens;
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
  v_junto text := nullif(btrim(coalesce(p_junto_codigo, '')), '');
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
  if v_junto is not null and p_decisao <> 'guardar' then raise exception '"Guardar junto" só vale para guardar no estoque.'; end if;
  if length(coalesce(v_junto, '')) > 80 then raise exception 'Código com mais de 80 caracteres.'; end if;

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

  v_texto := case
    when p_decisao = 'outro' then concat_ws(' — ', v_destino, v_obs)
    when v_junto is not null then concat_ws(' — ', 'Guardada junto com o produto ' || v_junto, v_obs)
    else v_obs end;
  v_para := (case p_decisao when 'vender' then 'a_venda' when 'guardar' then 'guardado' when 'usar' then 'usado'
                            when 'descartar' then 'descartado' else 'outro_destino' end)::pni_status;

  update pni_itens set decisao = p_decisao, decisao_obs = v_obs, decidido_em = now(), decidido_por = auth.uid(),
         destino_id = case when p_decisao = 'outro' then p_destino_id else null end,
         guardado_junto_codigo = v_junto,
         atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id;

  v := public.pni__mudar_status(p_id, v_para, v_texto);
  return jsonb_build_object('id', v.id, 'codigo', v.codigo, 'status', v.status, 'decisao', p_decisao);
end $$;

revoke all on function public.pni_separar(uuid, text, text, uuid, text) from public, anon;
grant execute on function public.pni_separar(uuid, text, text, uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';
