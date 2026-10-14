-- ════════════════════════════════════════════════════════════════════
-- Peças S/Estoque (Opa) — 15: LOCAÇÃO no estoque + ETIQUETAS (marcadores)
-- por peça (14/10/2026). Rodar DEPOIS do pni-14. Idempotente.
--
-- ⚠️ 14/10/2026: uma 1ª versão deste arquivo (pni-13-locacao-etiquetas) foi
-- aplicada e recriou pni_atualizar_item SEM o campo codigo_correto do
-- pni-13-codigo-correto-e-junto — esta versão junta os dois. Rodar de novo.
--
-- • Locação = Prateleira / Andar / Caixa para onde a peça foi destinada
--   (o mesmo endereço das características #PRATELEIRA/#ANDAR/#CAIXA do
--   estoque). Quando o "código existente" (SKU) da peça já tem locação no
--   catálogo, a tela oferece usar a mesma. NADA é gravado na Omie.
-- • Etiquetas = marcadores livres e opcionais (ex.: "urgente", "lote feira").
--   Não confundir com a etiqueta IMPRESSA (etiqueta_impressa_em).
--
-- Sem esta migration a tela funciona igual; só não grava locação/etiquetas
-- (a RPC recusa os campos novos e a tela avisa).
-- ════════════════════════════════════════════════════════════════════

alter table public.pni_itens add column if not exists locacao_prateleira text;
alter table public.pni_itens add column if not exists locacao_andar text;
alter table public.pni_itens add column if not exists locacao_caixa text;
alter table public.pni_itens add column if not exists etiquetas text[] not null default '{}';

create index if not exists pni_itens_etiquetas_idx on public.pni_itens using gin (etiquetas);

-- ── pni_atualizar_item: igual ao pni-13 (codigo_correto) + locação e etiquetas ──
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
  v_tag text;
  v_tags text[] := '{}';
begin
  if not public.pni_pode_gerir() then
    raise exception 'Só o setor de peças altera itens.' using errcode = '42501';
  end if;
  if p_dados is null or jsonb_typeof(p_dados) <> 'object' then raise exception 'Dados inválidos.'; end if;
  for k in select jsonb_object_keys(p_dados) loop
    if k not in ('descricao', 'codigo', 'codigo_fabricante', 'codigo_correto', 'quantidade', 'qualidade',
                 'preco_sugerido', 'nao_identificavel', 'observacoes', 'local_id', 'local_tecnico',
                 'locacao_prateleira', 'locacao_andar', 'locacao_caixa', 'etiquetas') then
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
    if p_dados ? 'locacao_prateleira' then n.locacao_prateleira := nullif(upper(btrim(coalesce(p_dados->>'locacao_prateleira', ''))), ''); end if;
    if p_dados ? 'locacao_andar'      then n.locacao_andar      := nullif(upper(btrim(coalesce(p_dados->>'locacao_andar', ''))), ''); end if;
    if p_dados ? 'locacao_caixa'      then n.locacao_caixa      := nullif(upper(btrim(coalesce(p_dados->>'locacao_caixa', ''))), ''); end if;
  exception when invalid_text_representation or numeric_value_out_of_range or invalid_parameter_value then
    raise exception 'Valor inválido em um dos campos.';
  end;

  if p_dados ? 'etiquetas' then
    if jsonb_typeof(p_dados->'etiquetas') not in ('array', 'null') then raise exception 'Etiquetas inválidas.'; end if;
    for v_tag in select btrim(x) from jsonb_array_elements_text(coalesce(p_dados->'etiquetas', '[]'::jsonb)) x loop
      if v_tag = '' then continue; end if;
      if length(v_tag) > 30 then raise exception 'Etiqueta "%" com mais de 30 caracteres.', v_tag; end if;
      -- sem repetir (maiúscula/minúscula não conta)
      if not exists (select 1 from unnest(v_tags) t where lower(t) = lower(v_tag)) then
        v_tags := v_tags || v_tag;
      end if;
    end loop;
    if coalesce(array_length(v_tags, 1), 0) > 15 then raise exception 'No máximo 15 etiquetas por peça.'; end if;
    n.etiquetas := v_tags;
  end if;

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
  if length(coalesce(n.locacao_prateleira, '')) > 20 or length(coalesce(n.locacao_andar, '')) > 20
     or length(coalesce(n.locacao_caixa, '')) > 20 then
    raise exception 'Locação com mais de 20 caracteres em um dos campos.';
  end if;

  perform public.pni__conferir_requisitos(n, n.status);

  update pni_itens set
    codigo = n.codigo, descricao = n.descricao, codigo_fabricante = n.codigo_fabricante, codigo_correto = n.codigo_correto,
    observacoes = n.observacoes, quantidade = n.quantidade, qualidade = n.qualidade,
    preco_sugerido = n.preco_sugerido, nao_identificavel = n.nao_identificavel,
    local_id = n.local_id, local_tecnico = n.local_tecnico,
    locacao_prateleira = n.locacao_prateleira, locacao_andar = n.locacao_andar, locacao_caixa = n.locacao_caixa,
    etiquetas = n.etiquetas,
    atualizado_por = auth.uid(), atualizado_em = now()
  where id = p_id
  returning * into n;

  return to_jsonb(n);
end $$;

grant execute on function public.pni_atualizar_item(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
