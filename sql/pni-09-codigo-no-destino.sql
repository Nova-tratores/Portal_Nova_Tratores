-- pni-09 — Código definitivo (PNI-000123) só na entrada do Destino.
--
-- Na captação a peça recebe só um número provisório (CAP-000045), que a tela
-- não mostra como código. Quando a peça entra no Destino (ou é guardada
-- direto), um trigger troca o provisório pelo próximo PNI — assim os códigos
-- saem em sequência, junto com as etiquetas, e peça descartada na separação
-- não gasta número. Depois de gerado, o código não volta a ser provisório.
-- Rodar UMA vez, inteiro, depois do pni-08.

create sequence if not exists public.pni_captura_seq;

alter table public.pni_itens
  alter column codigo set default ('CAP-' || lpad(nextval('public.pni_captura_seq')::text, 6, '0'));

-- ── troca do provisório pelo definitivo ─────────────────────────────
create or replace function public.pni_tg_codigo_definitivo()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.codigo ~* '^CAP-' and new.status in ('precificado', 'a_venda', 'guardado') then
    new.codigo := 'PNI-' || lpad(nextval('public.pni_codigo_seq')::text, 6, '0');
  end if;
  return new;
end $$;

drop trigger if exists pni_itens_codigo_definitivo on public.pni_itens;
create trigger pni_itens_codigo_definitivo
  before update of status on public.pni_itens
  for each row execute function public.pni_tg_codigo_definitivo();

revoke all on function public.pni_tg_codigo_definitivo() from public, anon, authenticated;

-- ── captação: nasce com número provisório ───────────────────────────
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
         then 'CAP-' || lpad(nextval('public.pni_captura_seq')::text, 6, '0')
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

-- ── peças que ainda não chegaram ao Destino voltam a ser provisórias ─
-- (só as sem etiqueta: código que já foi para o papel não muda)
update public.pni_itens
   set codigo = 'CAP-' || lpad(nextval('public.pni_captura_seq')::text, 6, '0')
 where codigo ~* '^PNI-'
   and etiqueta_impressa_em is null
   and status in ('aguardando_identificacao', 'identificado');

-- a numeração PNI continua do maior código que sobrou (começa em 1 se nenhum)
select setval('public.pni_codigo_seq',
              coalesce((select max(substring(codigo from 5)::int) from public.pni_itens where codigo ~ '^PNI-[0-9]+$'), 0) + 1,
              false);

notify pgrst, 'reload schema';
